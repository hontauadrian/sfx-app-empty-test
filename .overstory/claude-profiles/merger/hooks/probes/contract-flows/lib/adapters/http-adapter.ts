/**
 * contract-flows/lib/adapters/http-adapter.ts
 *
 * HttpAdapter — executes HTTP-shaped flow steps against a booted API.
 * Phase 1 deliverable per `phase-1-http-bundle.md` §A.1.
 *
 * Step kinds handled:
 *   - api / expect / capture / setAuth / logout
 *   - poll (Decision 15.1)
 *   - assertIdempotent (Decision 16.2)
 *   - wait (wall-clock OR test-clock-advance endpoint)
 *   - navigate (no-op for HTTP — page-level adapter owns it)
 *
 * Cookie / token primitives (capture-cookie, replay-cookie-as-header,
 * omit-cookie, assert-cookie-rotated, assert-cookie-cleared,
 * assert-cookie-attrs, tamper-cookie) live in the SIBLING adapter
 * `cookie-jar-adapter.ts`. Both share the jar via `ExecCtx.cookieJar`
 * — HttpAdapter populates it on Set-Cookie ingest and reads it for
 * outgoing-Cookie emit; CookieJarAdapter manipulates it directly.
 * Splitting lets future transports (gRPC / GraphQL / WS) reuse the
 * cookie primitives unchanged.
 *
 * Step kinds explicitly DEFERRED (P2 per Decision 17.3):
 *   - parallel  (P2-1) — branches with isolatedAuth jar fork
 *   - matrix    (P2-3) — axis expansion
 *   - assertBulk (P2-4) — multi-status sugar
 *   - assertSideEffect — DB / queue / webhook adapters own these
 *   These hit `FLOW_UNKNOWN_STEP_KIND` with reason='deferred-to-later-phase'.
 *
 * Auth model (Phase 1 §A.2):
 *   - The adapter never logs in itself. AuthBootstrap produces an
 *     ActorTokens map; setAuth steps copy the active actor's
 *     credential into ctx.bearer / ctx.cookieJar / ctx.apiKey.
 *
 * NEVER:
 *   - Falls back to heuristic body generation (chains carry bodies).
 *   - Reads the filesystem during step execution (fixtures resolve
 *     via the constructor-injected fixtureResolver).
 *   - Mutates the merged contract.
 *   - Logs credentials / tokens / cookie values.
 */

import type { z } from 'zod';

import type {
  ApiStep,
  AssertIdempotentStep,
  CaptureStep,
  ExpectStep,
  LogoutStep,
  Matcher,
  PollStep,
  SetAuthStep,
  Step,
  WaitStep,
} from '../../step-types';
import { StepSchema } from '../../step-types';
import type { MergedContract } from '../../contract-flows-merger';
import type {
  AdapterId,
  ExecCtx,
  ProtocolAdapter,
  StepResult,
} from '../../adapter-interface';
import {
  ContractFlowError,
  type FlowBindingUnresolvedError,
  type FlowCaptureNotFoundError,
  type FlowHeaderCaptureNotFoundError,
  type FlowIdempotencyReplayMismatchError,
  type FlowPollTerminalMismatchError,
  type FlowPollTimeoutError,
  type FlowStepFailedError,
  type FlowStepTimeoutError,
  type FlowUnknownStepKindError,
  type FlowUnknownTestEndpointError,
  type TypedError,
} from '../../errors';
import type { ActorCredential, ActorTokens } from '../auth-bootstrap';
import type { CookieJar } from './cookie-jar';
import { createCookieJar } from './cookie-jar';
import { buildMultipartBody } from '../multipart';
import type { FixtureResolver } from '../fixtures';

// ────────────────────────────────────────────────────────────────────────────
// Public surface.
// ────────────────────────────────────────────────────────────────────────────

export interface HttpAdapterOptions {
  /** Optional override hook for test injection. Defaults to globalThis.fetch. */
  fetch?: typeof globalThis.fetch;
  /** Resolves multipart `fixtureRef` strings to bytes + mimeType + filename. */
  fixtureResolver?: FixtureResolver;
  /** Per-step wall-clock cap (ms). Default 10_000. */
  timeoutMs?: number;
  /** Default poll-step timeout (ms) when the step does not specify. Default 30_000. */
  pollTimeoutMs?: number;
  /** Default poll-step interval (ms) when the step does not specify. Default 250. */
  pollIntervalMs?: number;
  /** Default clock-advance endpoint role. Looked up in
   *  `_shared.test_endpoints.clockAdvance` first; falls back to this path
   *  when no role is registered. Default '/test/advance-clock'. */
  clockAdvanceEndpoint?: string;
  /** Test-endpoint registry (Phase 1 §_shared.test_endpoints). Wait /
   *  side-effect adapters look paths up by role name. */
  testEndpoints?: Record<string, string>;
}

/**
 * Per-flow execution state owned by the adapter (lives on
 * `ExecCtx.flowScratch` so it survives step-to-step inside one flow).
 *
 * The foundation `ExecCtx.bindings` is `Record<string, string>`, so the
 * adapter coerces non-string capture values to strings (JSON.stringify
 * for objects, String() for numbers/booleans). The original value is
 * preserved on `flowScratch.lastResponse.body` for matchers.
 */
interface HttpFlowScratch {
  /** Echo of the most recent api step's request. Captured even when
   *  the api step itself succeeded so a downstream `expect` failure
   *  can attach the "you sent X" diagnostic without re-deriving it. */
  lastRequest?: {
    method: string;
    url: string;
    body?: unknown;
    bodyKind?: string;
  };
  lastResponse?: {
    status: number;
    headers: Record<string, string>;
    body: unknown;
    rawText: string;
  };
  active?: ActorCredential;
  activeActor?: string;
  cookieJar: CookieJar;
}

const FLOW_SCRATCH_KEY = '__http_adapter_scratch__';

function getScratch(ctx: ExecCtx): HttpFlowScratch {
  if (!ctx.flowScratch) {
    // The registry creates ExecCtx; we never see one without the map
    // in practice, but stay defensive for direct callers.
    (ctx as { flowScratch: Map<string, unknown> }).flowScratch = new Map();
  }
  let s = ctx.flowScratch!.get(FLOW_SCRATCH_KEY) as HttpFlowScratch | undefined;
  if (!s) {
    s = { cookieJar: (ctx.cookieJar as CookieJar | undefined) ?? createCookieJar() };
    // Mirror the jar onto ExecCtx.cookieJar so cross-adapter reads see it.
    (ctx as { cookieJar?: unknown }).cookieJar = s.cookieJar;
    ctx.flowScratch!.set(FLOW_SCRATCH_KEY, s);
  }
  return s;
}

// ────────────────────────────────────────────────────────────────────────────
// Adapter implementation.
// ────────────────────────────────────────────────────────────────────────────

export class HttpAdapter implements ProtocolAdapter {
  readonly id: AdapterId = { transport: 'http', version: '1' };

  /** Optional contract reference for envelope-aware capture. */
  private readonly contract?: MergedContract;
  private readonly baseUrl: string;
  private readonly options: Required<Omit<HttpAdapterOptions, 'fixtureResolver' | 'fetch' | 'testEndpoints'>>
    & Pick<HttpAdapterOptions, 'fixtureResolver' | 'fetch' | 'testEndpoints'>;
  /** ActorTokens injected by AuthBootstrap. May be empty in tests. */
  private actorTokens: ActorTokens = {};

  constructor(
    baseUrl: string,
    options: HttpAdapterOptions = {},
    contract?: MergedContract,
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.contract = contract;
    this.options = {
      timeoutMs: options.timeoutMs ?? 10_000,
      pollTimeoutMs: options.pollTimeoutMs ?? 30_000,
      pollIntervalMs: options.pollIntervalMs ?? 250,
      clockAdvanceEndpoint: options.clockAdvanceEndpoint ?? '/test/advance-clock',
      fetch: options.fetch,
      fixtureResolver: options.fixtureResolver,
      testEndpoints: options.testEndpoints,
    };
  }

  /** Inject the actor token map AuthBootstrap produced. */
  setActorTokens(tokens: ActorTokens): void {
    this.actorTokens = { ...tokens };
  }

  // The registry routes by step.transport; HttpAdapter claims any step
  // tagged 'http'. Steps WITHOUT an explicit transport are claimed when
  // the kind is one this adapter owns (api / expect / capture / setAuth
  // / logout / navigate / wait / poll / assertIdempotent are HTTP-bound).
  // Cookie primitives are owned by the sibling CookieJarAdapter — we
  // do NOT claim them. Steps tagged with a non-http transport are
  // NEVER claimed.
  supports(step: Step): boolean {
    const t = (step as { transport?: string }).transport;
    if (t !== undefined) return t === 'http';
    const kind = (step as { kind: string }).kind;
    return [
      'api', 'expect', 'capture', 'setAuth', 'logout', 'navigate', 'wait',
      'poll', 'assertIdempotent',
    ].includes(kind);
  }

  parseSchema(): z.ZodSchema<unknown> {
    return StepSchema as unknown as z.ZodSchema<unknown>;
  }

  async execute(step: Step, ctx: ExecCtx): Promise<StepResult> {
    try {
      switch (step.kind) {
        case 'api':         return await this.handleApi(step as ApiStep, ctx);
        case 'expect':      return this.handleExpect(step as ExpectStep, ctx);
        case 'capture':     return this.handleCapture(step as CaptureStep, ctx);
        case 'setAuth':     return this.handleSetAuth(step as SetAuthStep, ctx);
        case 'logout':      return this.handleLogout(step as LogoutStep, ctx);
        case 'navigate':    return { passed: true };
        case 'wait':        return await this.handleWait(step as WaitStep, ctx);
        case 'poll':        return await this.handlePoll(step as PollStep, ctx);
        case 'assertIdempotent':
                            return await this.handleAssertIdempotent(step as AssertIdempotentStep, ctx);
        default: {
          const cookieKinds = new Set([
            'capture-cookie', 'replay-cookie-as-header', 'omit-cookie',
            'assert-cookie-rotated', 'assert-cookie-cleared',
            'assert-cookie-attrs', 'tamper-cookie',
          ]);
          const stepKind = (step as { kind: string }).kind;
          const reason: 'deferred-to-later-phase' | 'belongs-to-other-adapter' =
            cookieKinds.has(stepKind) || ['parallel', 'matrix', 'assertBulk', 'assertSideEffect'].includes(stepKind)
              ? (cookieKinds.has(stepKind) ? 'belongs-to-other-adapter' : 'deferred-to-later-phase')
              : 'belongs-to-other-adapter';
          const err: FlowUnknownStepKindError = {
            code: 'FLOW_UNKNOWN_STEP_KIND',
            flowId: ctx.flowId,
            stepIndex: -1,
            stepKind: (step as { kind: string }).kind,
            reason,
            message: `HttpAdapter does not handle step kind '${(step as { kind: string }).kind}' (reason: ${reason}).`,
          };
          return { passed: false, blockReason: err.message };
        }
      }
    } catch (e: unknown) {
      if (e instanceof ContractFlowError) {
        return { passed: false, blockReason: e.message };
      }
      return { passed: false, blockReason: (e as Error).message };
    }
  }

  // ── api ────────────────────────────────────────────────────────────────
  private async handleApi(step: ApiStep, ctx: ExecCtx): Promise<StepResult> {
    const scratch = getScratch(ctx);
    const interpolated = this.interpolatePath(step.path, ctx);
    const url = joinUrl(this.baseUrl, interpolated);
    const method = step.method.toUpperCase();
    const headers: Record<string, string> = {};

    // Bearer / API-key auth surfaces.
    const cred = scratch.active;
    if (cred?.bearer) headers['Authorization'] = `Bearer ${cred.bearer}`;
    if (cred?.apiKey) headers[cred.apiKey.headerName] = cred.apiKey.value;

    // Step-level headers, with binding interpolation.
    if (step.headers) {
      for (const [k, v] of Object.entries(step.headers)) {
        headers[k] = this.interpolateString(v, ctx, 'header');
      }
    }

    // Cookie jar — emit Cookie header for matching cookies.
    const cookieHeader = scratch.cookieJar.cookieHeaderFor(url, undefined, {
      allowSecureOnHttp: this.contract?.config?.cookieJar?.allowSecureOnHttp === true,
    });
    if (cookieHeader) headers['Cookie'] = cookieHeader;

    // Body marshalling.
    let body: BodyInit | undefined;
    // Echo of the post-interpolation body for the failure renderer.
    // We carry this even on success because a downstream `expect` step
    // needs it to render "you sent X" when it fails — the api step
    // itself usually passes (server returned *some* response), and the
    // expect step is what flags the mismatch.
    let interpolatedBodyForEcho: unknown = undefined;
    const bodyKind = step.bodyKind ?? 'json';
    if (step.body !== undefined && bodyKind === 'json') {
      const interpBody = this.interpolateValue(step.body, ctx, 'body');
      interpolatedBodyForEcho = interpBody;
      body = JSON.stringify(interpBody);
      if (!('Content-Type' in headers) && !('content-type' in headers)) {
        headers['Content-Type'] = 'application/json';
      }
    } else if (bodyKind === 'multipart' && step.multipart) {
      if (!this.options.fixtureResolver) {
        throw new Error(`multipart step requires HttpAdapter.options.fixtureResolver`);
      }
      // Interpolate value-fields (file fixtureRefs are not interpolated —
      // they are static names).
      const parts = step.multipart.map((p) => p.value !== undefined
        ? { ...p, value: this.interpolateString(p.value, ctx, 'body') }
        : p);
      body = await buildMultipartBody(parts, this.options.fixtureResolver);
      // Do NOT set Content-Type — fetch sets the boundary header.
    } else if (bodyKind === 'form-urlencoded' && step.body && typeof step.body === 'object') {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(step.body as Record<string, unknown>)) {
        params.set(k, this.interpolateString(String(v), ctx, 'body'));
      }
      body = params.toString();
      if (!('Content-Type' in headers) && !('content-type' in headers)) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
      }
    } else if (bodyKind === 'text' && typeof step.body === 'string') {
      body = this.interpolateString(step.body, ctx, 'body');
      if (!('Content-Type' in headers) && !('content-type' in headers)) {
        headers['Content-Type'] = 'text/plain';
      }
    } else if (bodyKind === 'binary' && typeof step.body === 'string') {
      body = Buffer.from(step.body, 'base64');
    }

    // Append query string.
    let finalUrl = url;
    if (step.query) {
      const usp = new URL(url);
      for (const [k, v] of Object.entries(step.query)) {
        usp.searchParams.append(k, this.interpolateString(v, ctx, 'query'));
      }
      finalUrl = usp.toString();
    }

    const fetchImpl = this.options.fetch ?? globalThis.fetch;
    const res = await this.fetchWithTimeout(
      fetchImpl,
      finalUrl,
      { method, headers, body },
      this.options.timeoutMs,
      ctx,
      step.kind,
    );

    // Drain Set-Cookie into the jar (per RFC 6265, all Set-Cookie headers).
    const anyHeaders = res.headers as unknown as { getSetCookie?: () => string[] };
    let setCookies: string[] = [];
    if (typeof anyHeaders.getSetCookie === 'function') {
      setCookies = anyHeaders.getSetCookie();
    } else {
      const single = res.headers.get('set-cookie');
      if (single) setCookies = [single];
    }
    for (const sc of setCookies) scratch.cookieJar.setCookie(sc, finalUrl);

    const rawText = await res.text();
    let parsedBody: unknown = rawText;
    const ct = (res.headers.get('content-type') ?? '').toLowerCase();
    if (ct.includes('application/json') && rawText.length > 0) {
      try { parsedBody = JSON.parse(rawText); } catch { /* keep rawText */ }
    }
    const respHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => { respHeaders[k.toLowerCase()] = v; });

    scratch.lastResponse = {
      status: res.status,
      headers: respHeaders,
      body: parsedBody,
      rawText,
    };

    // Stash the request echo so the next-step `expect` failure can
    // attach "what you sent" to its diagnostic without re-deriving it.
    scratch.lastRequest = {
      method,
      url: finalUrl,
      body: interpolatedBodyForEcho,
      bodyKind,
    };

    return {
      passed: true,
      raw: scratch.lastResponse,
    };
  }

  // ── expect ─────────────────────────────────────────────────────────────
  private handleExpect(step: ExpectStep, ctx: ExecCtx): StepResult {
    const scratch = getScratch(ctx);
    const last = scratch.lastResponse;
    if (!last) {
      return { passed: false, blockReason: 'expect: no prior response on ctx (api step must precede expect)' };
    }

    if (step.status !== undefined && last.status !== step.status) {
      return this.failStep(ctx, 'expect',
        `status === ${step.status}`, `status === ${last.status}`, last);
    }
    if (step.statusAnyOf && !step.statusAnyOf.includes(last.status)) {
      return this.failStep(ctx, 'expect',
        `status in ${JSON.stringify(step.statusAnyOf)}`, `status === ${last.status}`, last);
    }

    if (step.bodyHas) {
      for (const [path, matcher] of Object.entries(step.bodyHas)) {
        const actual = readJsonPath(last.body, path, this.contract);
        if (!matchValue(actual, matcher, ctx)) {
          const shapeHint = actual === undefined
            ? describeBodyAt(last.body, path, this.contract)
            : null;
          return this.failStep(ctx, 'expect',
            `bodyHas.${path}=${describeMatcher(matcher)}`,
            `actual=${truncate(JSON.stringify(actual))}${shapeHint ? '. ' + shapeHint : ''}`, last);
        }
      }
    }

    if (step.headerHas) {
      for (const [name, matcher] of Object.entries(step.headerHas)) {
        const actual = last.headers[name.toLowerCase()];
        if (!matchValue(actual, matcher, ctx)) {
          return this.failStep(ctx, 'expect',
            `headerHas.${name}=${describeMatcher(matcher)}`,
            `actual=${truncate(JSON.stringify(actual))}`, last);
        }
      }
    }

    if (step.bodyShape) {
      const shape = step.bodyShape;
      const arr = last.body;
      if (shape.arrayLength !== undefined) {
        if (!Array.isArray(arr) || arr.length !== shape.arrayLength) {
          return this.failStep(ctx, 'expect',
            `arrayLength=${shape.arrayLength}`,
            `actual=${Array.isArray(arr) ? arr.length : typeof arr}`, last);
        }
      }
      if (shape.arrayLengthAtLeast !== undefined) {
        if (!Array.isArray(arr) || arr.length < shape.arrayLengthAtLeast) {
          return this.failStep(ctx, 'expect',
            `arrayLengthAtLeast=${shape.arrayLengthAtLeast}`,
            `actual=${Array.isArray(arr) ? arr.length : typeof arr}`, last);
        }
      }
      if (shape.arrayLengthAtMost !== undefined) {
        if (!Array.isArray(arr) || arr.length > shape.arrayLengthAtMost) {
          return this.failStep(ctx, 'expect',
            `arrayLengthAtMost=${shape.arrayLengthAtMost}`,
            `actual=${Array.isArray(arr) ? arr.length : typeof arr}`, last);
        }
      }
      if (shape.contains) {
        if (!Array.isArray(arr)) {
          return this.failStep(ctx, 'expect',
            `body to be array (for contains[])`, `body is ${typeof arr}`, last);
        }
        for (const needle of shape.contains) {
          const found = arr.some((entry) => objectMatches(entry, needle, ctx));
          if (!found) {
            return this.failStep(ctx, 'expect',
              `contains entry matching ${truncate(JSON.stringify(needle))}`,
              `not found`, last);
          }
        }
      }
      if (shape.excludes) {
        if (!Array.isArray(arr)) {
          return this.failStep(ctx, 'expect',
            `body to be array (for excludes[])`, `body is ${typeof arr}`, last);
        }
        for (const needle of shape.excludes) {
          const found = arr.some((entry) => objectMatches(entry, needle, ctx));
          if (found) {
            return this.failStep(ctx, 'expect',
              `excludes entry matching ${truncate(JSON.stringify(needle))}`,
              `match was found`, last);
          }
        }
      }
    }

    if (step.errorEnvelope) {
      const env = step.errorEnvelope;
      if (env.code !== undefined) {
        const got = readJsonPath(last.body, '$.code', this.contract);
        if (got !== env.code) {
          return this.failStep(ctx, 'expect',
            `errorEnvelope.code === ${env.code}`, `got ${truncate(String(got))}`, last);
        }
      }
      if (env.field !== undefined) {
        const got = readJsonPath(last.body, '$.field', this.contract);
        if (got !== env.field) {
          return this.failStep(ctx, 'expect',
            `errorEnvelope.field === ${env.field}`, `got ${truncate(String(got))}`, last);
        }
      }
      if (env.messageMatches !== undefined) {
        const got = readJsonPath(last.body, '$.message', this.contract);
        const re = new RegExp(env.messageMatches);
        if (typeof got !== 'string' || !re.test(got)) {
          return this.failStep(ctx, 'expect',
            `errorEnvelope.message =~ /${env.messageMatches}/`, `got ${truncate(String(got))}`, last);
        }
      }
    }

    return { passed: true };
  }

  // ── capture ────────────────────────────────────────────────────────────
  private handleCapture(step: CaptureStep, ctx: ExecCtx): StepResult {
    const scratch = getScratch(ctx);
    const last = scratch.lastResponse;
    if (!last) {
      return { passed: false, blockReason: 'capture: no prior response on ctx' };
    }
    const captured: Record<string, string> = {};
    if (step.bindings) {
      for (const [name, path] of Object.entries(step.bindings)) {
        const v = readJsonPath(last.body, path, this.contract);
        if (v === undefined) {
          const shapeHint = describeBodyAt(last.body, path, this.contract);
          const err: FlowCaptureNotFoundError = {
            code: 'FLOW_CAPTURE_NOT_FOUND',
            flowId: ctx.flowId,
            stepIndex: -1,
            binding: name,
            jsonPath: path,
            message: `capture: jsonPath '${path}' resolved to undefined for binding '${name}'${shapeHint ? '. ' + shapeHint : ''}`,
          };
          throw new ContractFlowError(err);
        }
        captured[name] = typeof v === 'string' ? v : JSON.stringify(v);
        ctx.bindings[name] = captured[name];
      }
    }
    if (step.headerBindings) {
      for (const [name, headerName] of Object.entries(step.headerBindings)) {
        // `cookie:<cookieName>` syntax (Phase 1 P1-5): pull from jar.
        if (headerName.startsWith('cookie:')) {
          const cookieName = headerName.slice('cookie:'.length);
          const found = scratch.cookieJar.list().find((c) => c.name === cookieName);
          if (!found) {
            const err: FlowHeaderCaptureNotFoundError = {
              code: 'FLOW_HEADER_CAPTURE_NOT_FOUND',
              flowId: ctx.flowId,
              stepIndex: -1,
              binding: name,
              headerName,
              message: `capture: cookie '${cookieName}' is not in the jar (binding='${name}')`,
            };
            throw new ContractFlowError(err);
          }
          captured[name] = found.value;
          ctx.bindings[name] = found.value;
          continue;
        }
        const v = last.headers[headerName.toLowerCase()];
        if (v === undefined) {
          const err: FlowHeaderCaptureNotFoundError = {
            code: 'FLOW_HEADER_CAPTURE_NOT_FOUND',
            flowId: ctx.flowId,
            stepIndex: -1,
            binding: name,
            headerName,
            message: `capture: response is missing header '${headerName}' (binding='${name}')`,
          };
          throw new ContractFlowError(err);
        }
        captured[name] = v;
        ctx.bindings[name] = v;
      }
    }
    return { passed: true, capturedBindings: captured };
  }

  // ── setAuth ────────────────────────────────────────────────────────────
  private handleSetAuth(step: SetAuthStep, ctx: ExecCtx): StepResult {
    const scratch = getScratch(ctx);
    const id = step.binding;

    // 1) Actor-name lookup wins.
    if (this.actorTokens[id]) {
      const cred = this.actorTokens[id];
      scratch.active = cred;
      scratch.activeActor = id;
      // If the actor carries a cookieJar, replace the in-flow jar so
      // subsequent api steps emit that actor's cookies. We FORK the
      // bootstrap jar so per-flow mutations (Set-Cookie on later
      // responses) don't leak back to the global bootstrap state.
      if (cred.cookieJar) {
        scratch.cookieJar = cred.cookieJar.fork();
        (ctx as { cookieJar?: unknown }).cookieJar = scratch.cookieJar;
      }
      return { passed: true };
    }

    // 2) Scoped bearer: setAuth's binding may carry an actor:scope syntax.
    if (id.includes(':')) {
      const [actor, scope] = id.split(':', 2);
      const cred = this.actorTokens[actor];
      if (cred?.scopedBearers && cred.scopedBearers[scope]) {
        scratch.active = { bearer: cred.scopedBearers[scope] };
        scratch.activeActor = actor;
        return { passed: true };
      }
    }

    // 3) Binding lookup — existing capture-driven auth chains carry a
    //    captured `accessToken` binding that becomes the bearer.
    const v = ctx.bindings[id];
    if (v !== undefined) {
      scratch.active = { ...(scratch.active ?? {}), bearer: v };
      return { passed: true };
    }

    const err: FlowBindingUnresolvedError = {
      code: 'FLOW_BINDING_UNRESOLVED',
      flowId: ctx.flowId,
      stepIndex: -1,
      binding: id,
      in: 'header',
      message: `setAuth: binding '${id}' is neither a declared actor nor a captured binding`,
    };
    throw new ContractFlowError(err);
  }

  // ── logout ─────────────────────────────────────────────────────────────
  private handleLogout(_step: LogoutStep, ctx: ExecCtx): StepResult {
    const scratch = getScratch(ctx);
    scratch.active = undefined;
    scratch.activeActor = undefined;
    scratch.cookieJar.clear();
    return { passed: true };
  }

  // ── wait ───────────────────────────────────────────────────────────────
  private async handleWait(step: WaitStep, ctx: ExecCtx): Promise<StepResult> {
    if (step.advanceMs !== undefined) {
      const path = this.resolveTestEndpoint('clockAdvance', step.advanceEndpoint, ctx);
      const fetchImpl = this.options.fetch ?? globalThis.fetch;
      try {
        await this.fetchWithTimeout(
          fetchImpl,
          joinUrl(this.baseUrl, path),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ms: step.advanceMs }),
          },
          this.options.timeoutMs,
          ctx,
          step.kind,
        );
        return { passed: true };
      } catch (e: unknown) {
        // Falling back to wall-clock would mask a broken contract; surface
        // the failure so the lead either declares the endpoint or removes
        // advanceMs from the flow.
        return { passed: false, blockReason: `wait.advanceMs: ${(e as Error).message}` };
      }
    }
    if (step.freezeAt) {
      // Freeze-state convention (Decision 15.2). Round-trip via
      // test-endpoint role 'freezeAt' if registered.
      const path = this.resolveTestEndpoint('freezeAt', undefined, ctx);
      const fetchImpl = this.options.fetch ?? globalThis.fetch;
      try {
        await this.fetchWithTimeout(
          fetchImpl,
          joinUrl(this.baseUrl, path),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ at: step.freezeAt }),
          },
          this.options.timeoutMs,
          ctx,
          step.kind,
        );
        return { passed: true };
      } catch (e: unknown) {
        return { passed: false, blockReason: `wait.freezeAt: ${(e as Error).message}` };
      }
    }
    if (step.ms !== undefined && step.ms > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, step.ms));
    }
    return { passed: true };
  }

  // ── poll ───────────────────────────────────────────────────────────────
  private async handlePoll(step: PollStep, ctx: ExecCtx): Promise<StepResult> {
    const scratch = getScratch(ctx);
    const intervalMs = step.intervalMs ?? this.options.pollIntervalMs;
    const timeoutMs  = step.timeoutMs ?? this.options.pollTimeoutMs;
    const deadline = Date.now() + timeoutMs;
    let attempts = 0;
    let lastStatus: number | undefined;
    let lastBody: unknown;
    let lastRawText = '';

    const fetchImpl = this.options.fetch ?? globalThis.fetch;

    while (Date.now() < deadline) {
      if (ctx.abortSignal?.aborted) {
        return { passed: false, blockReason: 'poll: aborted by ctx.abortSignal' };
      }
      attempts += 1;
      const url = joinUrl(this.baseUrl, this.interpolatePath(step.request.path, ctx));
      const headers: Record<string, string> = {};
      if (scratch.active?.bearer) headers['Authorization'] = `Bearer ${scratch.active.bearer}`;
      if (scratch.active?.apiKey) headers[scratch.active.apiKey.headerName] = scratch.active.apiKey.value;
      if (step.request.headers) for (const [k, v] of Object.entries(step.request.headers)) headers[k] = v;
      const cookieHeader = scratch.cookieJar.cookieHeaderFor(url, undefined, {
      allowSecureOnHttp: this.contract?.config?.cookieJar?.allowSecureOnHttp === true,
    });
      if (cookieHeader) headers['Cookie'] = cookieHeader;

      let res: Response;
      try {
        res = await this.fetchWithTimeout(
          fetchImpl,
          url,
          { method: step.request.method.toUpperCase(), headers },
          Math.min(this.options.timeoutMs, Math.max(50, deadline - Date.now())),
          ctx,
          step.kind,
        );
      } catch (e: unknown) {
        // Treat per-attempt fetch failures as transient — keep polling.
        // If we run out of time, we'll surface FLOW_POLL_TIMEOUT below.
        await sleep(intervalMs);
        continue;
      }

      lastStatus = res.status;
      lastRawText = await res.text();
      lastBody = lastRawText;
      const ct = (res.headers.get('content-type') ?? '').toLowerCase();
      if (ct.includes('application/json') && lastRawText.length > 0) {
        try { lastBody = JSON.parse(lastRawText); } catch { /* keep rawText */ }
      }

      // Decide whether to keep looping. Defaults to "stop on first response"
      // when no while/until predicate is set.
      const shouldContinue =
        (step.whileStatus  && step.whileStatus.includes(res.status)) ||
        (step.whileBody    && matchesAllPaths(lastBody, step.whileBody, ctx, this.contract)) ||
        (step.untilStatus  && !step.untilStatus.includes(res.status)) ||
        (step.untilBody    && !matchesAllPaths(lastBody, step.untilBody,  ctx, this.contract));

      if (!shouldContinue) {
        // Break out of poll loop — we have the terminal response.
        const respHeaders: Record<string, string> = {};
        res.headers.forEach((v, k) => { respHeaders[k.toLowerCase()] = v; });
        scratch.lastResponse = {
          status: res.status,
          headers: respHeaders,
          body: lastBody,
          rawText: lastRawText,
        };

        if (step.finalExpect) {
          const exp = this.handleExpect({ kind: 'expect', ...step.finalExpect } as ExpectStep, ctx);
          if (!exp.passed) {
            const err: FlowPollTerminalMismatchError = {
              code: 'FLOW_POLL_TERMINAL_MISMATCH',
              flowId: ctx.flowId,
              stepIndex: -1,
              attempts,
              expected: 'finalExpect to pass',
              actual: exp.blockReason ?? 'finalExpect failed',
              message: `poll: finalExpect rejected the terminal response after ${attempts} attempts`,
            };
            return { passed: false, blockReason: err.message };
          }
        }
        if (step.finalCapture) {
          const cap = this.handleCapture({ kind: 'capture', ...step.finalCapture } as CaptureStep, ctx);
          if (!cap.passed) return cap;
          return { passed: true, capturedBindings: cap.capturedBindings };
        }
        return { passed: true };
      }

      await sleep(intervalMs);
    }

    const err: FlowPollTimeoutError = {
      code: 'FLOW_POLL_TIMEOUT',
      flowId: ctx.flowId,
      stepIndex: -1,
      attempts,
      timeoutMs,
      lastStatus,
      lastBodyExcerpt: truncate(typeof lastBody === 'string' ? lastBody : JSON.stringify(lastBody)),
      message: `poll: predicate kept matching for ${timeoutMs}ms (${attempts} attempts, last status ${lastStatus ?? 'n/a'})`,
    };
    return { passed: false, blockReason: err.message };
  }

  // ── assertIdempotent ───────────────────────────────────────────────────
  private async handleAssertIdempotent(step: AssertIdempotentStep, ctx: ExecCtx): Promise<StepResult> {
    const scratch = getScratch(ctx);
    const fetchImpl = this.options.fetch ?? globalThis.fetch;
    const key = randomKey();
    // Stash for diagnostics.
    ctx.bindings['__idempotency_key__'] = key;

    const url = joinUrl(this.baseUrl, this.interpolatePath(step.request.path, ctx));
    const headersFirst: Record<string, string> = {};
    headersFirst[step.keyHeader] = key;
    if (scratch.active?.bearer) headersFirst['Authorization'] = `Bearer ${scratch.active.bearer}`;
    if (step.request.headers) for (const [k, v] of Object.entries(step.request.headers)) headersFirst[k] = v;
    const firstBody = step.request.body !== undefined
      ? JSON.stringify(this.interpolateValue(step.request.body, ctx, 'body')) : undefined;
    if (firstBody !== undefined && !('Content-Type' in headersFirst)) {
      headersFirst['Content-Type'] = 'application/json';
    }

    const res1 = await this.fetchWithTimeout(
      fetchImpl, url,
      { method: step.request.method.toUpperCase(), headers: headersFirst, body: firstBody },
      this.options.timeoutMs, ctx, step.kind,
    );
    const status1 = res1.status;
    const text1 = await res1.text();
    let body1: unknown = text1;
    try { if (text1) body1 = JSON.parse(text1); } catch { /* keep text */ }

    if (status1 < 200 || status1 >= 300) {
      const err: FlowIdempotencyReplayMismatchError = {
        code: 'FLOW_IDEMPOTENCY_REPLAY_MISMATCH',
        flowId: ctx.flowId,
        stepIndex: -1,
        reason: 'first-not-2xx',
        firstStatus: status1,
        secondStatus: 0,
        diffExcerpt: truncate(text1),
        message: `assertIdempotent: first response status ${status1} (expected 2xx)`,
      };
      return { passed: false, blockReason: err.message };
    }

    // Second request: same key, body depends on variant.
    const headersSecond: Record<string, string> = { ...headersFirst };
    if (step.variant === 'different-key') {
      headersSecond[step.keyHeader] = randomKey();
    }
    let secondPayload = firstBody;
    if (step.variant === 'replay-different-body') {
      // Mutate body to be deterministically-different.
      const obj = step.request.body && typeof step.request.body === 'object'
        ? { ...(step.request.body as Record<string, unknown>) } : {};
      obj.__idem_diverge__ = key;
      secondPayload = JSON.stringify(this.interpolateValue(obj, ctx, 'body'));
    }
    const res2 = await this.fetchWithTimeout(
      fetchImpl, url,
      { method: step.request.method.toUpperCase(), headers: headersSecond, body: secondPayload },
      this.options.timeoutMs, ctx, step.kind,
    );
    const status2 = res2.status;
    const text2 = await res2.text();
    let body2: unknown = text2;
    try { if (text2) body2 = JSON.parse(text2); } catch { /* keep text */ }

    // Determine expected status per variant.
    let expectedStatus: number;
    if (step.expectReplayStatus !== undefined) {
      expectedStatus = step.expectReplayStatus;
    } else if (step.variant === 'replay-different-body') {
      expectedStatus = step.conflictStatus ?? 409;
    } else {
      expectedStatus = status1;
    }
    if (status2 !== expectedStatus) {
      const err: FlowIdempotencyReplayMismatchError = {
        code: 'FLOW_IDEMPOTENCY_REPLAY_MISMATCH',
        flowId: ctx.flowId,
        stepIndex: -1,
        reason: 'status',
        firstStatus: status1,
        secondStatus: status2,
        diffExcerpt: truncate(text2),
        message: `assertIdempotent: replay status ${status2}, expected ${expectedStatus} (variant=${step.variant})`,
      };
      return { passed: false, blockReason: err.message };
    }

    // For replay-same: bodies must be deep-equal.
    if (step.variant === 'replay-same' && !deepEqualIgnoringFields(body1, body2)) {
      const err: FlowIdempotencyReplayMismatchError = {
        code: 'FLOW_IDEMPOTENCY_REPLAY_MISMATCH',
        flowId: ctx.flowId,
        stepIndex: -1,
        reason: 'body',
        firstStatus: status1,
        secondStatus: status2,
        diffExcerpt: truncate(`first=${JSON.stringify(body1)} second=${JSON.stringify(body2)}`),
        message: `assertIdempotent: replay body diverged from first body`,
      };
      return { passed: false, blockReason: err.message };
    }

    scratch.lastResponse = {
      status: status2,
      headers: {},
      body: body2,
      rawText: text2,
    };
    return { passed: true };
  }

  // ── helpers ────────────────────────────────────────────────────────────
  private resolveTestEndpoint(role: string, override: string | undefined, ctx: ExecCtx): string {
    if (override) return override;
    const reg = this.options.testEndpoints ?? {};
    if (reg[role]) return reg[role];
    if (role === 'clockAdvance') return this.options.clockAdvanceEndpoint;
    const err: FlowUnknownTestEndpointError = {
      code: 'FLOW_UNKNOWN_TEST_ENDPOINT',
      flowId: ctx.flowId,
      stepIndex: -1,
      role,
      message: `wait/poll requested test-endpoint role '${role}' but it is not declared in _shared.test_endpoints`,
    };
    throw new ContractFlowError(err);
  }

  private async fetchWithTimeout(
    fetchImpl: typeof globalThis.fetch,
    url: string,
    init: RequestInit,
    timeoutMs: number,
    ctx: ExecCtx,
    stepKind: string,
  ): Promise<Response> {
    const controller = new AbortController();
    const externalAbort = ctx.abortSignal;
    const onExternalAbort = () => controller.abort();
    if (externalAbort) externalAbort.addEventListener('abort', onExternalAbort);
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetchImpl(url, { ...init, signal: controller.signal });
    } catch (e: unknown) {
      if (controller.signal.aborted && !(externalAbort?.aborted)) {
        const err: FlowStepTimeoutError = {
          code: 'FLOW_STEP_TIMEOUT',
          flowId: ctx.flowId,
          stepIndex: -1,
          stepKind,
          timeoutMs,
          message: `${stepKind}: fetch '${url}' did not complete within ${timeoutMs}ms`,
        };
        throw new ContractFlowError(err);
      }
      throw e;
    } finally {
      clearTimeout(timer);
      if (externalAbort) externalAbort.removeEventListener('abort', onExternalAbort);
    }
  }

  private interpolatePath(template: string, ctx: ExecCtx): string {
    return this.interpolateString(template, ctx, 'path');
  }

  private interpolateString(template: string, ctx: ExecCtx, kind: FlowBindingUnresolvedError['in']): string {
    return template.replace(/\$\{([^}]+)\}/g, (_, name) => {
      const value = ctx.bindings[name];
      if (value === undefined) {
        const err: FlowBindingUnresolvedError = {
          code: 'FLOW_BINDING_UNRESOLVED',
          flowId: ctx.flowId,
          stepIndex: -1,
          binding: name,
          in: kind,
          message: `interpolation: binding '\${${name}}' is not set`,
        };
        throw new ContractFlowError(err);
      }
      return value;
    });
  }

  private interpolateValue(value: unknown, ctx: ExecCtx, kind: FlowBindingUnresolvedError['in']): unknown {
    if (value === null) return null;
    if (typeof value === 'string') return this.interpolateString(value, ctx, kind);
    if (Array.isArray(value)) return value.map((v) => this.interpolateValue(v, ctx, kind));
    if (typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        out[k] = this.interpolateValue(v, ctx, kind);
      }
      return out;
    }
    return value;
  }

  private failStep(
    ctx: ExecCtx,
    stepKind: string,
    expected: string,
    actual: string,
    response: HttpFlowScratch['lastResponse'],
  ): StepResult {
    const scratch = getScratch(ctx);
    const err: FlowStepFailedError = {
      code: 'FLOW_STEP_FAILED',
      flowId: ctx.flowId,
      stepIndex: -1,
      stepKind,
      expected,
      actual,
      responseExcerpt: response ? truncate(response.rawText) : undefined,
      message: `${stepKind}: expected ${expected}, got ${actual}`,
    };
    // Attach echoes from scratch so the report renderer can show
    // "you sent X / server returned Y" without grepping logs. Only
    // populate when the data is present — auth-bootstrap step kinds
    // and steps that fail before any HTTP call have neither.
    return {
      passed: false,
      blockReason: err.message,
      requestEcho: scratch.lastRequest
        ? { ...scratch.lastRequest }
        : undefined,
      responseEcho: response
        ? { status: response.status, body: response.body }
        : undefined,
    };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Module-private helpers.
// ────────────────────────────────────────────────────────────────────────────

function joinUrl(base: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  if (base.endsWith('/') && path.startsWith('/')) return base + path.slice(1);
  if (!base.endsWith('/') && !path.startsWith('/')) return base + '/' + path;
  return base + path;
}

function truncate(s: string | undefined, max = 2048): string | undefined {
  if (s === undefined) return undefined;
  return s.length > max ? s.slice(0, max) + `… (truncated, total ${s.length} chars)` : s;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function randomKey(): string {
  // Crypto is preferred when available; fall back to Math.random for
  // determinism in tests that mock fetch.
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  const a = Math.random().toString(36).slice(2);
  const b = Math.random().toString(36).slice(2);
  return `${a}-${b}`;
}

// Envelope-aware JSON path read. Honors
// `MergedContract.config.envelope?.successWrapper` if present (Phase 1
// reserves the field; foundation does not yet expose it on the type, so
// we only check shape).
function readJsonPath(body: unknown, path: string, contract?: MergedContract | undefined): unknown {
  if (!path || path === '$') return body;
  let cleaned = path;
  if (cleaned.startsWith('$.')) cleaned = cleaned.slice(2);
  else if (cleaned.startsWith('$[')) cleaned = cleaned.slice(1);

  // Look for envelope hint on contract.config (open extension).
  const envelopeWrapper = (contract?.config as { envelope?: { successWrapper?: string[] } } | undefined)?.envelope?.successWrapper;

  const tokens = cleaned
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter((t) => t.length > 0);

  function walkFrom(start: unknown): unknown {
    let cur: unknown = start;
    for (const tok of tokens) {
      if (cur === null || cur === undefined) return undefined;
      if (typeof cur !== 'object') return undefined;
      cur = (cur as Record<string, unknown>)[tok];
    }
    return cur;
  }

  // Envelope-aware: try the unwrapped payload first, fall back to the raw
  // body. Mirrors capture-step behavior (assertion-library.ts) so lead's
  // path semantics are uniform across capture/bodyHas. Without fallback,
  // a path like `$.data` on a `{success, data: [...]}` envelope unwraps to
  // body.data.data (undefined), forcing lead into runner-specific syntax.
  // With fallback, `$.data` resolves to the array directly when unwrap
  // misses — same intent, no DSL escape required.
  let cur: unknown = body;
  if (envelopeWrapper && body !== null && typeof body === 'object') {
    let envBody: unknown = body;
    let envOk = true;
    for (const seg of envelopeWrapper) {
      if (envBody === null || typeof envBody !== 'object') { envOk = false; break; }
      envBody = (envBody as Record<string, unknown>)[seg];
    }
    if (envOk) cur = envBody;
  }

  const fromUnwrapped = walkFrom(cur);
  if (fromUnwrapped !== undefined) return fromUnwrapped;
  // Fallback: walk from raw body. Only used when unwrap miss produced
  // undefined — preserves the unwrap-first behavior for normal cases.
  return walkFrom(body);
}

/**
 * Diagnostic helper: walk the same path readJsonPath walks, but stop at the
 * first miss and return a compact description of what IS at that point. Used
 * to enrich capture/expect error messages so agents see the body shape
 * deterministically (no heuristics, no fuzzy match) instead of a bare
 * "resolved to undefined". Returns null when the walk succeeds — caller
 * decides whether to append.
 *
 * Format: `Body shape at <path>[ (envelope wrapper)]: {key1, key2, ...} (no '<missingKey>')`
 * Truncates key lists at 8 to keep output one-line.
 */
function describeBodyAt(body: unknown, path: string, contract?: MergedContract | undefined): string | null {
  if (!path || path === '$') return null;
  let cleaned = path;
  if (cleaned.startsWith('$.')) cleaned = cleaned.slice(2);
  else if (cleaned.startsWith('$[')) cleaned = cleaned.slice(1);

  const envelopeWrapper = (contract?.config as { envelope?: { successWrapper?: string[] } } | undefined)?.envelope?.successWrapper;
  let cur: unknown = body;
  let walked = '$';
  let inWrapper = false;
  if (envelopeWrapper && envelopeWrapper.length > 0 && body !== null && typeof body === 'object') {
    let envBody: unknown = body;
    let envOk = true;
    for (const seg of envelopeWrapper) {
      if (envBody === null || typeof envBody !== 'object') { envOk = false; break; }
      envBody = (envBody as Record<string, unknown>)[seg];
    }
    if (envOk) {
      cur = envBody;
      walked = '$.' + envelopeWrapper.join('.');
      inWrapper = true;
    }
  }

  const tokens = cleaned
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter((t) => t.length > 0);

  for (const tok of tokens) {
    const note = inWrapper ? ' (envelope wrapper)' : '';
    if (cur === null || cur === undefined) {
      return `Body at ${walked}${note} is ${cur === null ? 'null' : 'undefined'}`;
    }
    if (Array.isArray(cur)) {
      return `Body at ${walked}${note} is array (length=${cur.length})`;
    }
    if (typeof cur !== 'object') {
      return `Body at ${walked}${note} is ${typeof cur}`;
    }
    if (!(tok in cur)) {
      const keys = Object.keys(cur);
      const shown = keys.slice(0, 8).join(', ');
      const more = keys.length > 8 ? `, ...${keys.length - 8} more` : '';
      const shape = keys.length === 0 ? 'empty object' : `{${shown}${more}}`;
      const missing = keys.length === 0 ? '' : ` (no '${tok}')`;
      return `Body shape at ${walked}${note}: ${shape}${missing}`;
    }
    cur = (cur as Record<string, unknown>)[tok];
    walked += `.${tok}`;
    inWrapper = false;
  }
  return null;
}

function matchValue(actual: unknown, expected: Matcher, ctx: ExecCtx): boolean {
  if (typeof expected === 'string' || typeof expected === 'number'
      || typeof expected === 'boolean' || expected === null) {
    // Substitute ${var} placeholders on the EXPECTED side using ctx.bindings.
    // Path-side substitution already happens upstream; without value-side
    // substitution the assertion `bodyHas.$.teamId="${addMemberTeamId}"`
    // compares the real cuid to the literal string `${addMemberTeamId}` and
    // always fails. Symmetric substitution removes the gap; lead authors
    // assertions with the same syntax as paths.
    if (typeof expected === 'string' && expected.includes('${')) {
      const substituted = expected.replace(/\$\{([\w:+/=.]+)\}/g, (match, varName) => {
        const v = ctx.bindings[varName];
        return v !== undefined && v !== null ? String(v) : match;
      });
      return actual === substituted || String(actual) === substituted;
    }
    return actual === expected;
  }
  if ('matches' in expected) {
    if (typeof actual !== 'string') return false;
    try { return new RegExp(expected.matches).test(actual); } catch { return false; }
  }
  if ('absent' in expected) return actual === undefined;
  if ('present' in expected) return actual !== undefined;
  if ('oneOf' in expected) return expected.oneOf.includes(actual as never);
  if ('type' in expected) {
    switch (expected.type) {
      case 'string':  return typeof actual === 'string';
      case 'number':  return typeof actual === 'number';
      case 'boolean': return typeof actual === 'boolean';
      case 'array':   return Array.isArray(actual);
      case 'object':  return actual !== null && typeof actual === 'object' && !Array.isArray(actual);
      case 'null':    return actual === null;
    }
  }
  if ('equalsCapture' in expected) {
    return ctx.bindings[expected.equalsCapture] !== undefined
        && String(actual) === ctx.bindings[expected.equalsCapture];
  }
  if ('lengthGte' in expected) {
    if (typeof actual === 'string') return actual.length >= expected.lengthGte;
    if (Array.isArray(actual)) return actual.length >= expected.lengthGte;
    return false;
  }
  if ('lengthLte' in expected) {
    if (typeof actual === 'string') return actual.length <= expected.lengthLte;
    if (Array.isArray(actual)) return actual.length <= expected.lengthLte;
    return false;
  }
  if ('length' in expected) {
    if (typeof actual === 'string') return actual.length === expected.length;
    if (Array.isArray(actual)) return actual.length === expected.length;
    return false;
  }
  if ('containsId' in expected) {
    if (!Array.isArray(actual)) return false;
    return actual.some((e) => e && typeof e === 'object' && (e as Record<string, unknown>).id === expected.containsId);
  }
  if ('notContainsId' in expected) {
    if (!Array.isArray(actual)) return true;
    return !actual.some((e) => e && typeof e === 'object' && (e as Record<string, unknown>).id === expected.notContainsId);
  }
  if ('sortedAscBy' in expected || 'sortedDescBy' in expected) {
    if (!Array.isArray(actual)) return false;
    const key = ('sortedAscBy' in expected ? expected.sortedAscBy : (expected as { sortedDescBy: string }).sortedDescBy);
    const asc = 'sortedAscBy' in expected;
    for (let i = 1; i < actual.length; i++) {
      const a = (actual[i - 1] as Record<string, unknown> | undefined)?.[key];
      const b = (actual[i] as Record<string, unknown> | undefined)?.[key];
      if (asc ? Number(a) > Number(b) : Number(a) < Number(b)) return false;
    }
    return true;
  }
  if ('disjointFrom' in expected) {
    if (!Array.isArray(actual)) return false;
    const other = ctx.bindings[expected.disjointFrom];
    if (!other) return false;
    let parsed: unknown;
    try { parsed = JSON.parse(other); } catch { return false; }
    if (!Array.isArray(parsed)) return false;
    return !actual.some((e) => parsed.includes(e));
  }
  return false;
}

function describeMatcher(m: Matcher): string {
  if (m === null) return 'null';
  if (typeof m === 'string') return JSON.stringify(m);
  if (typeof m === 'number' || typeof m === 'boolean') return String(m);
  return JSON.stringify(m);
}

function objectMatches(entry: unknown, needle: Record<string, Matcher>, ctx: ExecCtx): boolean {
  if (!entry || typeof entry !== 'object') return false;
  for (const [k, m] of Object.entries(needle)) {
    if (!matchValue((entry as Record<string, unknown>)[k], m, ctx)) return false;
  }
  return true;
}

function matchesAllPaths(
  body: unknown,
  matchers: Record<string, Matcher>,
  ctx: ExecCtx,
  contract?: MergedContract,
): boolean {
  for (const [path, m] of Object.entries(matchers)) {
    const v = readJsonPath(body, path, contract);
    if (!matchValue(v, m, ctx)) return false;
  }
  return true;
}

function deepEqualIgnoringFields(a: unknown, b: unknown, ignore: Set<string> = new Set(['createdAt', 'updatedAt', 'requestId', 'timestamp'])): boolean {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const ar = a as unknown[]; const br = b as unknown[];
    if (ar.length !== br.length) return false;
    for (let i = 0; i < ar.length; i++) {
      if (!deepEqualIgnoringFields(ar[i], br[i], ignore)) return false;
    }
    return true;
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const ak = Object.keys(ao).filter((k) => !ignore.has(k));
  const bk = Object.keys(bo).filter((k) => !ignore.has(k));
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (!Object.prototype.hasOwnProperty.call(bo, k)) return false;
    if (!deepEqualIgnoringFields(ao[k], bo[k], ignore)) return false;
  }
  return true;
}

// Re-export read helper for tests (not part of the public API).
export const __testHelpers = { readJsonPath, matchValue, deepEqualIgnoringFields };
