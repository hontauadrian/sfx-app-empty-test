/**
 * contract-flows/lib/adapters/cookie-jar-adapter.ts
 *
 * Sibling adapter (transport: 'cookie-jar') that owns the cookie / token
 * primitive step kinds. Splitting these out of the HTTP adapter lets
 * future bundles (gRPC, GraphQL, WS) reuse the same cookie primitives
 * unchanged — the steps speak about the jar, not about HTTP itself.
 *
 * The jar lives on `ExecCtx.cookieJar` (the foundation interface). The
 * HTTP adapter populates it (Set-Cookie ingest on responses; Cookie
 * header emit on requests); this adapter manipulates it (capture, omit,
 * tamper, assert).
 *
 * Step kinds owned:
 *   - capture-cookie / replay-cookie-as-header / omit-cookie
 *   - assert-cookie-rotated / assert-cookie-cleared / assert-cookie-attrs
 *   - tamper-cookie
 *
 * Failure modes use FLOW_STEP_FAILED (assertion miss) or
 * FLOW_BINDING_UNRESOLVED (capture-into-binding miss).
 */

import type { z } from 'zod';

import type {
  AssertCookieAttrsStep,
  AssertCookieClearedStep,
  AssertCookieRotatedStep,
  CaptureCookieStep,
  OmitCookieStep,
  ReplayCookieAsHeaderStep,
  Step,
  TamperCookieStep,
} from '../../step-types';
import { StepSchema } from '../../step-types';
import type {
  AdapterId,
  ExecCtx,
  ProtocolAdapter,
  StepResult,
} from '../../adapter-interface';
import {
  ContractFlowError,
  type FlowStepFailedError,
} from '../../errors';
import type { CookieJar } from './cookie-jar';
import { createCookieJar } from './cookie-jar';

const COOKIE_KINDS = new Set<string>([
  'capture-cookie',
  'replay-cookie-as-header',
  'omit-cookie',
  'assert-cookie-rotated',
  'assert-cookie-cleared',
  'assert-cookie-attrs',
  'tamper-cookie',
]);

function getJar(ctx: ExecCtx): CookieJar {
  let jar = ctx.cookieJar as CookieJar | undefined;
  if (!jar) {
    jar = createCookieJar();
    (ctx as { cookieJar?: unknown }).cookieJar = jar;
  }
  return jar;
}

function fail(stepKind: string, expected: string, actual: string): StepResult {
  const err: FlowStepFailedError = {
    code: 'FLOW_STEP_FAILED',
    flowId: '',
    stepIndex: -1,
    stepKind,
    expected,
    actual,
    message: `${stepKind}: expected ${expected}, got ${actual}`,
  };
  return { passed: false, blockReason: err.message };
}

export class CookieJarAdapter implements ProtocolAdapter {
  readonly id: AdapterId = { transport: 'cookie-jar', version: '1' };

  // Claim the seven cookie/token kinds. We do NOT require the schema
  // to set step.transport === 'cookie-jar' (the lead writes the YAML
  // without a transport tag for cookie kinds); the registry's
  // supports() probe routes by kind.
  supports(step: Step): boolean {
    const t = (step as { transport?: string }).transport;
    if (t !== undefined) return t === 'cookie-jar';
    return COOKIE_KINDS.has((step as { kind: string }).kind);
  }

  parseSchema(): z.ZodSchema<unknown> {
    return StepSchema as unknown as z.ZodSchema<unknown>;
  }

  async execute(step: Step, ctx: ExecCtx): Promise<StepResult> {
    try {
      switch (step.kind) {
        case 'capture-cookie':
          return this.handleCaptureCookie(step as CaptureCookieStep, ctx);
        case 'replay-cookie-as-header':
          return this.handleReplayCookieAsHeader(step as ReplayCookieAsHeaderStep, ctx);
        case 'omit-cookie':
          return this.handleOmitCookie(step as OmitCookieStep, ctx);
        case 'assert-cookie-rotated':
          return this.handleAssertCookieRotated(step as AssertCookieRotatedStep, ctx);
        case 'assert-cookie-cleared':
          return this.handleAssertCookieCleared(step as AssertCookieClearedStep, ctx);
        case 'assert-cookie-attrs':
          return this.handleAssertCookieAttrs(step as AssertCookieAttrsStep, ctx);
        case 'tamper-cookie':
          return this.handleTamperCookie(step as TamperCookieStep, ctx);
        default:
          return { passed: false, blockReason: `CookieJarAdapter: unsupported step kind '${(step as { kind: string }).kind}'` };
      }
    } catch (e: unknown) {
      if (e instanceof ContractFlowError) {
        return { passed: false, blockReason: e.message };
      }
      return { passed: false, blockReason: (e as Error).message };
    }
  }

  private handleCaptureCookie(step: CaptureCookieStep, ctx: ExecCtx): StepResult {
    const jar = getJar(ctx);
    const found = jar.list().find((c) => c.name === step.name);
    if (!found) return fail('capture-cookie', `cookie '${step.name}' present in jar`, 'absent');
    ctx.bindings[step.binding] = found.value;
    return { passed: true, capturedBindings: { [step.binding]: found.value } };
  }

  private handleReplayCookieAsHeader(step: ReplayCookieAsHeaderStep, ctx: ExecCtx): StepResult {
    const jar = getJar(ctx);
    const found = jar.list().find((c) => c.name === step.name);
    if (!found) return fail('replay-cookie-as-header', `cookie '${step.name}' to replay`, 'cookie not in jar');
    ctx.bindings[step.header] = found.value;
    return { passed: true, capturedBindings: { [step.header]: found.value } };
  }

  private handleOmitCookie(step: OmitCookieStep, ctx: ExecCtx): StepResult {
    const jar = getJar(ctx);
    jar.delete(step.name);
    return { passed: true };
  }

  private handleAssertCookieRotated(step: AssertCookieRotatedStep, ctx: ExecCtx): StepResult {
    const jar = getJar(ctx);
    const sentinelKey = `__cookie_pre_rotate_${step.name}__`;
    const current = jar.list().find((c) => c.name === step.name);
    if (!current) return fail('assert-cookie-rotated', `cookie '${step.name}' present`, 'absent');
    const prior = ctx.bindings[sentinelKey];
    if (prior === undefined) {
      ctx.bindings[sentinelKey] = current.value;
      return { passed: true };
    }
    if (prior === current.value) {
      return fail('assert-cookie-rotated', `cookie '${step.name}' to differ from prior observation`, 'value unchanged');
    }
    ctx.bindings[sentinelKey] = current.value;
    return { passed: true };
  }

  private handleAssertCookieCleared(step: AssertCookieClearedStep, ctx: ExecCtx): StepResult {
    const jar = getJar(ctx);
    const found = jar.list().find((c) => c.name === step.name);
    if (found) return fail('assert-cookie-cleared', `cookie '${step.name}' to be absent`, 'present in jar');
    return { passed: true };
  }

  private handleAssertCookieAttrs(step: AssertCookieAttrsStep, ctx: ExecCtx): StepResult {
    const jar = getJar(ctx);
    const found = jar.list().find((c) => c.name === step.name);
    if (!found) return fail('assert-cookie-attrs', `cookie '${step.name}' present`, 'absent');
    const a = step.attrs;
    if (a.httpOnly !== undefined && found.httpOnly !== a.httpOnly) {
      return fail('assert-cookie-attrs', `httpOnly=${a.httpOnly}`, `actual=${found.httpOnly}`);
    }
    if (a.secure !== undefined && found.secure !== a.secure) {
      return fail('assert-cookie-attrs', `secure=${a.secure}`, `actual=${found.secure}`);
    }
    if (a.sameSite !== undefined && (found.sameSite ?? '').toLowerCase() !== a.sameSite.toLowerCase()) {
      return fail('assert-cookie-attrs', `sameSite=${a.sameSite}`, `actual=${found.sameSite ?? 'unset'}`);
    }
    if (a.path !== undefined && found.path !== a.path) {
      return fail('assert-cookie-attrs', `path=${a.path}`, `actual=${found.path}`);
    }
    if (a.domain !== undefined && found.domain !== a.domain) {
      return fail('assert-cookie-attrs', `domain=${a.domain}`, `actual=${found.domain}`);
    }
    if (a.maxAgeAtMost !== undefined) {
      const remaining = (found.expiresAt - Date.now()) / 1000;
      if (remaining > a.maxAgeAtMost) {
        return fail('assert-cookie-attrs', `maxAgeAtMost=${a.maxAgeAtMost}`, `remainingSeconds=${Math.round(remaining)}`);
      }
    }
    return { passed: true };
  }

  private handleTamperCookie(step: TamperCookieStep, ctx: ExecCtx): StepResult {
    const jar = getJar(ctx);
    const found = jar.list().find((c) => c.name === step.name);
    if (!found) return fail('tamper-cookie', `cookie '${step.name}' to tamper with`, 'absent from jar');
    let tamperedValue: string;
    switch (step.with) {
      case 'invalid-value':  tamperedValue = 'INVALID-' + found.value; break;
      case 'expired':        tamperedValue = found.value; break;
      case 'wrong-issuer':   tamperedValue = 'wrong-issuer.' + found.value; break;
      case 'wrong-audience': tamperedValue = 'wrong-aud.' + found.value; break;
      default:               tamperedValue = 'tampered.' + found.value; break;
    }
    jar.delete(step.name);
    const setCookie = step.with === 'expired'
      ? `${step.name}=${found.value}; Max-Age=-1; Path=${found.path}`
      : `${step.name}=${tamperedValue}; Path=${found.path}`;
    const protocol = found.secure ? 'https' : 'http';
    jar.setCookie(setCookie, `${protocol}://${found.domain}${found.path}`);
    return { passed: true };
  }
}
