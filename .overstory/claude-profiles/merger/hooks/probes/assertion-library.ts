/**
 * Per-entry assertion helpers for the HTTP-smoke probe.
 *
 * Each function returns a ProbeCaseResult — a tagged record of what was
 * checked, the outcome, and (on failure) a canonical block reason.
 *
 * runFlowStep dispatches EXCLUSIVELY on the canonical step kinds emitted by
 * flows-generator.js: api, expect, capture, setAuth, logout, navigate, wait,
 * capture-cookie, assert-cookie-rotated, assert-cookie-cleared,
 * assert-cookie-attrs, replay-cookie-as-header, omit-cookie, tamper-cookie.
 */

import { HttpClient, AuthSchemeConfig } from './http-client';
import {
  MergedMatrix,
  MatrixPage,
  MatrixEndpoint,
  SecurityScheme,
  resolveSuccessStatus,
  getRouteOverlay,
} from './matrix-loader';
import { generateFixture } from './schema-fixture';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const wsClient = require('./lib/ws-client');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { parseSSEText } = require('./lib/sse');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { CookieJar: RfcCookieJar, parseSetCookie } = require('./lib/cookie-jar');

// ---------------------------------------------------------------------------
// ProbeCaseResult
// ---------------------------------------------------------------------------

export interface FailureContext {
  contractSource: string;
  implies: string;
  checkPaths: string[];
}

export interface ProbeCaseResult {
  label: string;
  passed: boolean;
  status?: number;
  finalUrl?: string;
  location?: string;
  tokenMatch?: boolean;
  elapsedMs?: number;
  blockReason?: string;
  hint?: string;
  rawBodyPreview?: string;
  failureContext?: FailureContext;
}

export type BlockCode =
  | 'STACK_BOOT_FAILED'
  | 'STACK_UNHEALTHY'
  | 'STACK_PORT_CONFLICT'
  | 'PAGE_ERROR_OVERLAY'
  | 'PAGE_MISSING_TOKEN'
  | 'PAGE_UNEXPECTED_REDIRECT'
  | 'PAGE_UNEXPECTED_STATUS'
  | 'AUTH_CONTRACT_VIOLATION'
  | 'AUTH_PERSISTENCE'
  | 'AUTH_BOOTSTRAP_INCONSISTENT'
  | 'AUTH_UNBOOTSTRAPPABLE'
  | 'API_500_RESPONSE'
  | 'API_BAD_INPUT_NOT_4XX'
  | 'API_AUTH_BOUNDARY_LEAK'
  | 'API_UNEXPECTED_STATUS'
  | 'API_DUPLICATE_CONFLICT_NOT_4XX'
  | 'FLOW_STEP_FAILED'
  | 'UNKNOWN_STEP_KIND'
  | 'UNKNOWN_ROUTE'
  | 'SLOW_ENDPOINT'
  | 'UNRESOLVABLE_PARAM'
  | 'PROBE_INTERNAL_ERROR'
  | 'API_REQUEST_FAILED';

// ---------------------------------------------------------------------------
// Runtime diagnostics — emitted during flow execution (not at regen time)
// ---------------------------------------------------------------------------

export interface RuntimeDiagnostic {
  code: string;
  level: 'warning' | 'error';
  details: Record<string, unknown>;
}

const SLOW_THRESHOLD_MS = 10_000;

let cachedAntiTokens: string[] | null = null;

function loadAntiTokens(): string[] {
  if (cachedAntiTokens) return cachedAntiTokens;
  try {
    const raw = readFileSync(join(__dirname, 'fixtures', 'default-anti-tokens.json'), 'utf8');
    const parsed = JSON.parse(raw) as { antiTokens?: string[] };
    cachedAntiTokens = Array.isArray(parsed.antiTokens) ? parsed.antiTokens : [];
  } catch {
    cachedAntiTokens = [
      'Application error',
      'Unhandled Runtime Error',
      '__next_error__',
      'TypeError',
      'Cannot read propert',
    ];
  }
  return cachedAntiTokens;
}

export function formatBlockReason(code: BlockCode, subject: string, detail: string): string {
  const trimmed = detail.length > 400 ? `${detail.slice(0, 400)}…` : detail;
  return `${code}:${subject}:${trimmed}`;
}

function substituteParams(path: string, seeded: Record<string, string>): { path: string; unresolved: string[] } {
  const unresolved: string[] = [];
  const replaced = path
    .replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, name) => {
      if (seeded[name]) return seeded[name];
      if (name === 'id' || name.endsWith('Id') || name.endsWith('_id')) return seeded.defaultId ?? '00000000-0000-0000-0000-000000000001';
      if (name === 'slug') return 'smoke-test';
      unresolved.push(name);
      return `:${name}`;
    })
    .replace(/\[\.\.\.([^\]]+)\]/g, () => 'smoke')
    .replace(/\[([^\]]+)\]/g, (_, name) => {
      if (seeded[name]) return seeded[name];
      if (name === 'id' || name.endsWith('Id')) return seeded.defaultId ?? '00000000-0000-0000-0000-000000000001';
      if (name === 'slug') return 'smoke-test';
      unresolved.push(name);
      return `[${name}]`;
    });
  return { path: replaced, unresolved };
}

// ---------------------------------------------------------------------------
// probePage (unchanged)
// ---------------------------------------------------------------------------

export interface ProbePageOptions {
  authed?: boolean;
  bearer?: string | null;
  seeded?: Record<string, string>;
  strict?: boolean;
  loginSurface?: string | null;
}

export async function probePage(client: HttpClient, page: MatrixPage, matrix: MergedMatrix, options: ProbePageOptions = {}): Promise<ProbeCaseResult> {
  const { path: routePath, unresolved } = substituteParams(page.route, options.seeded ?? {});
  if (unresolved.length > 0) {
    return {
      label: `${options.authed ? 'authed' : 'public'} GET ${page.route}`,
      passed: false,
      blockReason: formatBlockReason('UNRESOLVABLE_PARAM', `GET ${page.route}`, `missing seeds for: ${unresolved.join(',')}`),
    };
  }

  const overlay = getRouteOverlay(matrix.overlay, page.route);
  const unauthBehavior = overlay?.unauthBehavior;
  const guard = page.guard;
  const response = await client.request(routePath, {
    method: 'GET',
    bearer: options.authed ? options.bearer ?? null : null,
    redirect: 'manual',
    timeoutMs: SLOW_THRESHOLD_MS,
  });

  const label = `${options.authed ? 'authed' : 'public'} GET ${page.route}`;
  const baseResult: ProbeCaseResult = {
    label,
    passed: false,
    status: response.status,
    finalUrl: response.finalUrl,
    location: response.headers.location,
    elapsedMs: response.elapsedMs,
    rawBodyPreview: response.bodyText.slice(0, 500),
  };

  if (response.elapsedMs > SLOW_THRESHOLD_MS) {
    return { ...baseResult, blockReason: formatBlockReason('SLOW_ENDPOINT', `GET ${page.route}`, `elapsed=${response.elapsedMs}ms > ${SLOW_THRESHOLD_MS}ms`) };
  }

  if (response.status >= 500) {
    return { ...baseResult, blockReason: formatBlockReason('PAGE_ERROR_OVERLAY', `GET ${page.route}`, `status=${response.status}`) };
  }

  if (guard === 'authenticated' && !options.authed) {
    const effective = unauthBehavior ?? 'redirect';
    if (effective === '401') {
      if (response.status === 401) return { ...baseResult, passed: true };
      return { ...baseResult, blockReason: formatBlockReason('AUTH_CONTRACT_VIOLATION', `GET ${page.route}`, `expected 401 got ${response.status}`) };
    }
    if (effective === '200') {
      if (response.status === 200) return { ...baseResult, passed: true };
      return { ...baseResult, blockReason: formatBlockReason('PAGE_UNEXPECTED_STATUS', `GET ${page.route}`, `overlay says unauthBehavior=200 got ${response.status}`) };
    }
    const isRedirect = [301, 302, 303, 307, 308].includes(response.status);
    if (!isRedirect && response.status !== 401) {
      return { ...baseResult, blockReason: formatBlockReason('AUTH_CONTRACT_VIOLATION', `GET ${page.route}`, `expected 3xx|401 got ${response.status}`) };
    }
    if (response.status === 401) return { ...baseResult, passed: true };
    const loginSurface = options.loginSurface ?? matrix.authDetection.loginSurface ?? null;
    const location = response.headers.location ?? null;
    if (location) {
      // Extract pathname from Location (handles both absolute and relative URLs).
      let locationPath = location;
      try {
        locationPath = new URL(location, 'http://placeholder').pathname;
      } catch {
        /* keep raw value */
      }
      // Accept redirect to either the declared loginSurface (API token-issuer
      // path, e.g. /api/v1/auth/login) OR any non-root user-facing public page
      // route (e.g. /login). Exact path match avoids '/' matching everything.
      const publicPageMatch = matrix.pages.some(
        (candidate) =>
          candidate.guard === 'public' &&
          candidate.route !== '/' &&
          (locationPath === candidate.route || locationPath.startsWith(`${candidate.route}/`)),
      );
      const surfaceMatch = loginSurface ? location.includes(loginSurface) : false;
      if (!publicPageMatch && !surfaceMatch && loginSurface) {
        return { ...baseResult, blockReason: formatBlockReason('PAGE_UNEXPECTED_REDIRECT', `GET ${page.route}`, `Location=${location} expected to contain ${loginSurface} or a public page route`) };
      }
    }
    return { ...baseResult, passed: true };
  }

  if (response.status >= 400) {
    return { ...baseResult, blockReason: formatBlockReason('PAGE_UNEXPECTED_STATUS', `GET ${page.route}`, `status=${response.status}`) };
  }
  if (response.status >= 300) {
    if (guard === 'public') {
      return { ...baseResult, blockReason: formatBlockReason('PAGE_UNEXPECTED_REDIRECT', `GET ${page.route}`, `status=${response.status} Location=${response.headers.location ?? '?'}`) };
    }
    return { ...baseResult, passed: true };
  }

  const antiTokens = [...loadAntiTokens(), ...(page.mustNotContain ?? [])];
  for (const marker of antiTokens) {
    if (marker && response.bodyText.includes(marker)) {
      return { ...baseResult, blockReason: formatBlockReason('PAGE_ERROR_OVERLAY', `GET ${page.route}`, `body contains "${marker}"`) };
    }
  }

  const expectedTokens = overlay?.tokens && overlay.tokens.length > 0 ? overlay.tokens : page.tokens ?? [];
  if (expectedTokens.length > 0) {
    const matched = expectedTokens.some((token) => response.bodyText.toLowerCase().includes(token.toLowerCase()));
    if (!matched) {
      return { ...baseResult, tokenMatch: false, blockReason: formatBlockReason('PAGE_MISSING_TOKEN', `GET ${page.route}`, `none of [${expectedTokens.join(', ')}] rendered`) };
    }
    return { ...baseResult, tokenMatch: true, passed: true };
  }

  if (response.bodyText.length < 100 && options.strict) {
    return { ...baseResult, blockReason: formatBlockReason('PAGE_MISSING_TOKEN', `GET ${page.route}`, `body length ${response.bodyText.length} < 100`) };
  }
  return { ...baseResult, passed: true };
}

// ---------------------------------------------------------------------------
// probeEndpoint (unchanged)
// ---------------------------------------------------------------------------

export interface ProbeEndpointOptions {
  bearer?: string | null;
  readOnly?: boolean;
  seeded?: Record<string, string>;
  zodSchema?: unknown | null;
}

export async function probeEndpoint(client: HttpClient, endpoint: MatrixEndpoint, matrix: MergedMatrix, options: ProbeEndpointOptions = {}): Promise<ProbeCaseResult[]> {
  const { path: concretePath, unresolved } = substituteParams(endpoint.path, options.seeded ?? {});
  if (unresolved.length > 0) {
    return [{
      label: `${endpoint.method} ${endpoint.path}`,
      passed: false,
      blockReason: formatBlockReason('UNRESOLVABLE_PARAM', `${endpoint.method} ${endpoint.path}`, `missing seeds for: ${unresolved.join(',')}`),
    }];
  }

  const method = endpoint.method.toUpperCase() as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  const compiledEntry = matrix.compiled?.endpoints?.find(
    (e) => e.method.toUpperCase() === method && e.path === endpoint.path,
  ) ?? null;
  const expectedStatus = resolveSuccessStatus(endpoint, matrix.compiled);

  const fixture = generateFixture({
    manifestEndpoint: compiledEntry,
    zodSchema: options.zodSchema ?? null,
  });

  const results: ProbeCaseResult[] = [];
  const guard = endpoint.guard ?? 'public';
  const isMutating = method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
  const needsBody = method !== 'GET' && method !== 'DELETE';

  // When fixture source is undeclared and body is needed, skip — no heuristic fallback.
  if (fixture.source === 'undeclared' && needsBody && isMutating) {
    return [{ label: `${method} ${endpoint.path}`, passed: true, hint: 'skipped: no manifest or Zod schema declares a body (FIXTURE_UNDECLARED)' }];
  }

  if (!(options.readOnly && isMutating)) {
    const happy = await client.request(concretePath, {
      method,
      body: needsBody ? fixture.valid ?? undefined : undefined,
      bearer: guard === 'authenticated' ? options.bearer ?? null : null,
      redirect: 'manual',
    });
    const label = `${method} ${endpoint.path} (happy)`;
    if (happy.elapsedMs > SLOW_THRESHOLD_MS) {
      results.push({ label, passed: false, status: happy.status, elapsedMs: happy.elapsedMs, blockReason: formatBlockReason('SLOW_ENDPOINT', `${method} ${endpoint.path}`, `elapsed=${happy.elapsedMs}ms`) });
    } else if (happy.status === 500) {
      results.push({ label, passed: false, status: 500, blockReason: formatBlockReason('API_500_RESPONSE', `${method} ${endpoint.path}`, extractErrorMessage(happy.bodyJson, happy.bodyText)), rawBodyPreview: happy.bodyText.slice(0, 500) });
    } else if (happy.status === 404) {
      results.push({ label, passed: false, status: 404, blockReason: formatBlockReason('UNKNOWN_ROUTE', `${method} ${endpoint.path}`, 'not registered'), rawBodyPreview: happy.bodyText.slice(0, 500) });
    } else if (happy.status !== expectedStatus && !isAcceptableSuccess(happy.status, expectedStatus)) {
      results.push({ label, passed: false, status: happy.status, blockReason: formatBlockReason('API_UNEXPECTED_STATUS', `${method} ${endpoint.path}`, `expected=${expectedStatus} got=${happy.status}`), rawBodyPreview: happy.bodyText.slice(0, 500) });
    } else {
      results.push({ label, passed: true, status: happy.status, elapsedMs: happy.elapsedMs });
    }
  }

  if (isMutating && fixture.invalid.length > 0) {
    const bad = fixture.invalid[0];
    const badResponse = await client.request(concretePath, {
      method,
      body: bad.body,
      bearer: guard === 'authenticated' ? options.bearer ?? null : null,
      redirect: 'manual',
    });
    const label = `${method} ${endpoint.path} (bad-input:${bad.reason})`;
    if (badResponse.status === 500) {
      results.push({ label, passed: false, status: 500, blockReason: formatBlockReason('API_500_RESPONSE', `${method} ${endpoint.path} bad-input`, extractErrorMessage(badResponse.bodyJson, badResponse.bodyText)) });
    } else if (!(badResponse.status === 400 || badResponse.status === 422)) {
      results.push({ label, passed: false, status: badResponse.status, blockReason: formatBlockReason('API_BAD_INPUT_NOT_4XX', `${method} ${endpoint.path}`, `expected 400|422 got ${badResponse.status}`) });
    } else {
      results.push({ label, passed: true, status: badResponse.status });
    }
  }

  if (guard === 'authenticated') {
    const unauthResponse = await client.request(concretePath, {
      method,
      body: method === 'GET' || method === 'DELETE' ? undefined : fixture.valid,
      bearer: null,
      redirect: 'manual',
    });
    const label = `${method} ${endpoint.path} (unauth)`;
    if (unauthResponse.status === 500) {
      results.push({ label, passed: false, status: 500, blockReason: formatBlockReason('API_500_RESPONSE', `${method} ${endpoint.path} unauth`, extractErrorMessage(unauthResponse.bodyJson, unauthResponse.bodyText)) });
    } else if (unauthResponse.status >= 200 && unauthResponse.status < 300) {
      results.push({ label, passed: false, status: unauthResponse.status, blockReason: formatBlockReason('API_AUTH_BOUNDARY_LEAK', `${method} ${endpoint.path}`, `returned ${unauthResponse.status} without auth`) });
    } else {
      results.push({ label, passed: true, status: unauthResponse.status });
    }
  }

  // Declaration-driven: endpoint.operationId marks the register endpoint.
  // Never guess from path segments — that's a heuristic.
  const isBootstrap = endpoint.operationId === 'authRegister';
  if (isBootstrap && method === 'POST' && !options.readOnly) {
    const dupBody = { ...fixture.valid, email: `smoke+dup${Date.now()}@example.com` };
    await client.request(concretePath, { method: 'POST', body: dupBody });
    const second = await client.request(concretePath, { method: 'POST', body: dupBody });
    const label = `${method} ${endpoint.path} (duplicate-conflict)`;
    if (second.status === 500) {
      results.push({ label, passed: false, status: 500, blockReason: formatBlockReason('API_500_RESPONSE', `${method} ${endpoint.path} duplicate`, extractErrorMessage(second.bodyJson, second.bodyText)) });
    } else if (![409, 400, 422].includes(second.status)) {
      results.push({ label, passed: false, status: second.status, blockReason: formatBlockReason('API_DUPLICATE_CONFLICT_NOT_4XX', `${method} ${endpoint.path}`, `expected 409|400|422 got ${second.status}`) });
    } else {
      results.push({ label, passed: true, status: second.status });
    }
  }

  return results;
}

function isAcceptableSuccess(actual: number, expected: number): boolean {
  if (actual === expected) return true;
  if (actual >= 200 && actual < 300 && expected >= 200 && expected < 300) return true;
  return false;
}

function extractErrorMessage(bodyJson: unknown, bodyText: string): string {
  if (bodyJson && typeof bodyJson === 'object') {
    const record = bodyJson as Record<string, unknown>;
    if (typeof record.message === 'string') return record.message;
    if (record.error && typeof record.error === 'object') {
      const err = record.error as { message?: unknown };
      if (typeof err.message === 'string') return err.message;
    }
  }
  return bodyText.slice(0, 200);
}

// ---------------------------------------------------------------------------
// Generated-flow types (canonical step kinds from flows-generator.js)
// ---------------------------------------------------------------------------

export interface GeneratedFlowStepApi {
  kind: 'api';
  method: string;
  path: string;
  body?: unknown;
  query?: Record<string, unknown>;
  headers?: Record<string, string>;
  /**
   * When true, the runner does NOT inject the chain-bootstrap bearer token.
   * Set by auth-boundary emitters that intentionally probe the unauthenticated
   * request path (no-bearer / no-key / no-basic).
   */
  skipAuth?: boolean;
}

export interface GeneratedFlowStepExpect {
  kind: 'expect';
  status?: number;
  statusAnyOf?: number[];
  bodyHas?: string[];
  bodyIsArray?: string[];
  bodyArrayEmpty?: string[];
  bodyIsRootArray?: boolean;
  bodyRootArrayEmpty?: boolean;
  bodyContainsAny?: string[];
  errorFieldMentions?: string;
  forbidden?: number[];
  expectBinary?: boolean;
  expectedContentType?: string;
  expectContentDisposition?: string;
  expectSSE?: boolean;
  minEvents?: number;
  expectEventNames?: string[];
  expectRetry?: number;
  expectId?: boolean;
  expectHeartbeat?: boolean;
}

export interface GeneratedFlowStepCapture {
  kind: 'capture';
  bindings: Record<string, string>;
}

export interface GeneratedFlowStepSetAuth {
  kind: 'setAuth';
  binding: string;
}

export interface GeneratedFlowStepLogout {
  kind: 'logout';
}

export interface GeneratedFlowStepNavigate {
  kind: 'navigate';
  path: string;
}

export interface GeneratedFlowStepWait {
  kind: 'wait';
  ms: number;
}

export interface GeneratedFlowStepExpectErrorShape {
  kind: 'expect-error-shape';
  family: 'nest-default' | 'nest-wrapped' | 'problem-json' | 'errors-array' | 'raw';
  fieldName?: string;
  messageContains?: string;
  statusCodeField?: string;
  envelope?: string[];
}

export interface GeneratedFlowStepUpload {
  kind: 'api-upload';
  method: string;
  path: string;
  uploadType: 'multipart' | 'binary';
  mimeType: string;
  fieldName: string;
  sizeBytes: number;
  fileCount?: number;
  additionalFileFields?: Array<{ name: string; array: boolean; mimeType: string; sizeBytes: number }>;
  extraFields?: Record<string, string>;
}

export interface GeneratedFlowStepDownload {
  kind: 'api-download';
  method: string;
  path: string;
  expectedContentType: string;
}

export interface GeneratedFlowStepStream {
  kind: 'api-stream';
  method: string;
  path: string;
  maxEvents: number;
  timeoutMs: number;
}

export interface GeneratedFlowStepGraphQL {
  kind: 'api-graphql';
  endpoint: string;
  query: string;
  variables?: Record<string, unknown>;
  operationName?: string;
}

export interface GeneratedFlowStepWSConnect {
  kind: 'ws-connect';
  path: string;
  transport?: 'ws' | 'socket.io' | 'graphql-ws' | string;
  namespace?: string;
  expectReject?: boolean;
  skipAuth?: boolean;
}

export interface GeneratedFlowStepWSSend {
  kind: 'ws-send';
  event: string;
  data?: unknown;
}

export interface GeneratedFlowStepWSExpectEvent {
  kind: 'ws-expect-event';
  eventName?: string;
  timeoutMs?: number;
}

export interface GeneratedFlowStepWSClose {
  kind: 'ws-close';
}

// ---------------------------------------------------------------------------
// Cookie step kinds (C15)
// ---------------------------------------------------------------------------

export interface GeneratedFlowStepCaptureCookie {
  kind: 'capture-cookie';
  name: string;
  savePath?: string;
}

export interface GeneratedFlowStepAssertCookieRotated {
  kind: 'assert-cookie-rotated';
  name: string;
  previousFromBag: string;
}

export interface GeneratedFlowStepAssertCookieCleared {
  kind: 'assert-cookie-cleared';
  name: string;
}

export interface GeneratedFlowStepAssertCookieAttrs {
  kind: 'assert-cookie-attrs';
  name: string;
  expected: Partial<{
    httpOnly: boolean;
    secure: boolean;
    sameSite: string | null;
    path: string | null;
    domain: string | null;
    maxAge: number | null;
  }>;
}

export interface GeneratedFlowStepReplayCookieAsHeader {
  kind: 'replay-cookie-as-header';
  cookieName: string;
  headerName: string;
}

export interface GeneratedFlowStepOmitCookie {
  kind: 'omit-cookie';
  name: string;
}

export interface GeneratedFlowStepTamperCookie {
  kind: 'tamper-cookie';
  name: string;
  withValue: string;
}

export type GeneratedFlowStep =
  | GeneratedFlowStepApi
  | GeneratedFlowStepExpect
  | GeneratedFlowStepCapture
  | GeneratedFlowStepSetAuth
  | GeneratedFlowStepLogout
  | GeneratedFlowStepNavigate
  | GeneratedFlowStepWait
  | GeneratedFlowStepExpectErrorShape
  | GeneratedFlowStepUpload
  | GeneratedFlowStepDownload
  | GeneratedFlowStepStream
  | GeneratedFlowStepGraphQL
  | GeneratedFlowStepWSConnect
  | GeneratedFlowStepWSSend
  | GeneratedFlowStepWSExpectEvent
  | GeneratedFlowStepWSClose
  | GeneratedFlowStepCaptureCookie
  | GeneratedFlowStepAssertCookieRotated
  | GeneratedFlowStepAssertCookieCleared
  | GeneratedFlowStepAssertCookieAttrs
  | GeneratedFlowStepReplayCookieAsHeader
  | GeneratedFlowStepOmitCookie
  | GeneratedFlowStepTamperCookie;

export interface GeneratedFlowContract {
  endpoint: string;
  kind: string;
  source: string;
}

export interface GeneratedFlowOnFail {
  check: string[];
  implies: string;
}

export interface GeneratedFlow {
  id: string;
  contract: GeneratedFlowContract;
  dependsOn: string[];
  onFail: GeneratedFlowOnFail;
  steps: GeneratedFlowStep[];
}

// ---------------------------------------------------------------------------
// FlowContext — tracks state across steps within a flow
// ---------------------------------------------------------------------------

export interface FlowLastResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
  bodyText: string;
  bodyBytes?: Uint8Array;
  bodyLength?: number;
  redirectChain?: string[];
  sseEvents?: Array<{ data: string; event?: string; id?: string }>;
}

export interface FlowContext {
  httpClient: HttpClient;
  /**
   * Web client (Next.js port). When set, runNavigateStep routes to this
   * regardless of httpClient. Allows a flow whose primary client is the
   * api port (because step0 is `kind: api`) to still navigate against
   * the web port — the step taxonomy is the source of routing truth, not
   * the flow's primary client.
   */
  webClient: HttpClient | null;
  /**
   * API client (Nest port). Reserved for future per-step routing of api
   * steps when the flow's primary is webClient. Currently httpClient
   * already points at the api port for api-bearing flows; this field
   * exists so the runner can pass both clients explicitly and have the
   * routing logic live in one place (the step kind).
   */
  apiClient: HttpClient | null;
  bindings: Record<string, unknown>;
  authHeader: string | null;
  authSchemeConfig: AuthSchemeConfig | null;
  lastResponse: FlowLastResponse | null;
  flowId: string;
  /**
   * Response-envelope unwrap path, seeded from matrix.responseEnvelope.successWrapper
   * (statically extracted from the global interceptor/middleware source at
   * matrix:regen time). When the app wraps successful payloads in
   * `{success: true, data: ...}`, this is `['data']`. For N-deep wrappers
   * like `{payload: {data: ...}}` this is `['payload', 'data']`. Null means
   * no envelope.
   */
  envelopeKey: string[] | null;
  /** Active WebSocket connection, set by ws-connect, cleared by ws-close */
  wsConnection: unknown | null;

  // --- Cookie flow state (C15) ---

  /**
   * RFC 6265bis-compliant cookie jar, scoped per flow. Instantiated in
   * probeFlowWithBindings, reset at flow start. Concurrent flows each
   * get their own jar — no cross-talk.
   */
  cookieJar: InstanceType<typeof RfcCookieJar>;

  /** Flow-scoped saved cookie values for rotation assertions, keyed by savePath */
  savedCookieValues: Record<string, string>;

  /** Pending header injection set by replay-cookie-as-header (one-shot) */
  pendingHeaderInjection: Record<string, string> | null;

  /** Cookie names to suppress from outgoing Cookie header (one-shot) */
  suppressedCookies: string[];

  /** Cookie name→value overrides for outgoing Cookie header (one-shot) */
  cookieOverrides: Record<string, string> | null;

  // --- Runtime diagnostics (COOKIE_UNDECLARED etc.) ---

  /** Set of declared cookie names from matrix.cookieFlows[].name */
  declaredCookieNames: Set<string>;

  /** Runtime diagnostics accumulated during flow execution */
  runtimeDiagnostics: RuntimeDiagnostic[];
}

// ---------------------------------------------------------------------------
// probeFlow — rewritten for generated flows
// ---------------------------------------------------------------------------

export interface ProbeFlowResult {
  cases: ProbeCaseResult[];
  bindings: Record<string, unknown>;
  authHeader: string | null;
  envelopeKey: string[] | null;
  runtimeDiagnostics: RuntimeDiagnostic[];
}

export async function probeFlow(
  client: HttpClient,
  flow: GeneratedFlow,
  _matrix: MergedMatrix,
  _options: { readOnly?: boolean; bearer?: string | null; bindings?: Record<string, unknown> } = {},
): Promise<ProbeCaseResult[]> {
  const result = await probeFlowWithBindings(client, flow, _matrix, _options);
  return result.cases;
}

export async function probeFlowWithBindings(
  client: HttpClient,
  flow: GeneratedFlow,
  _matrix: MergedMatrix,
  _options: {
    readOnly?: boolean;
    bearer?: string | null;
    bindings?: Record<string, unknown>;
    envelopeKey?: string[] | null;
    /**
     * Optional shared RFC 6265bis cookie jar threaded across dependent flows.
     * When provided, replaces the per-flow fresh jar so flows declared via
     * `dependsOn` see cookies set by their dependencies (real user-agent
     * semantics). When omitted, behavior is unchanged: a fresh jar per call.
     * Honors the declared dependsOn relationship, no heuristics.
     */
    sharedCookieJar?: InstanceType<typeof RfcCookieJar>;
    /**
     * Optional secondary clients passed in by the runner so individual
     * step kinds can route deterministically: `navigate` always goes to
     * webClient, `api`/`ws-*`/`graphql` always go to apiClient — regardless
     * of which is the flow's primary client. Step taxonomy is declarative
     * (set by flows-generator from Zod schemas + decorators), not guessed
     * at runtime.
     */
    webClient?: HttpClient;
    apiClient?: HttpClient;
  } = {},
): Promise<ProbeFlowResult> {
  // Seed per-flow unique values. flows-generator emits `${uniqEmail}`,
  // `${uniqString}`, `${uniqUuid}` into bodies wherever a Prisma-declared
  // @unique field appears. http-smoke.ts pipes `sharedBindings` across
  // flows (intentional for accessToken/userId), so stale uniqEmail from
  // a prior flow would leak and collide. Fresh seed MUST override inherited
  // shared bindings for the unique keys — hence uniqueSeed spreads LAST.
  const uniqueSeed: Record<string, string> = seedUniqueBindings();

  // Cookie jar: prefer the runner-provided shared jar (carries cookies from
  // dependsOn flows). When none is provided, fall back to a fresh jar per
  // call — preserves prior behavior for direct probeFlow callers.
  const cookieJar = _options.sharedCookieJar ?? (() => {
    const jar = new RfcCookieJar();
    jar.reset();
    return jar;
  })();

  // Build the set of declared cookie names from the matrix for COOKIE_UNDECLARED checks
  const declaredCookieNames = new Set<string>(
    (_matrix.cookieFlows ?? []).map((cf: { name: string }) => cf.name),
  );

  const ctx: FlowContext = {
    httpClient: client,
    webClient: _options.webClient ?? null,
    apiClient: _options.apiClient ?? null,
    bindings: { ...(_options.bindings ?? {}), ...uniqueSeed },
    authHeader: _options.bearer ?? null,
    authSchemeConfig: null,
    lastResponse: null,
    flowId: flow.id,
    envelopeKey: _options.envelopeKey ?? null,
    wsConnection: null,
    cookieJar,
    savedCookieValues: {},
    pendingHeaderInjection: null,
    suppressedCookies: [],
    cookieOverrides: null,
    declaredCookieNames,
    runtimeDiagnostics: [],
  };

  const results: ProbeCaseResult[] = [];
  for (let idx = 0; idx < flow.steps.length; idx++) {
    const step = flow.steps[idx];
    try {
      const stepResult = await runFlowStep(step, ctx, idx, flow);
      results.push(stepResult);
      if (!stepResult.passed) break;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push(buildFlowFailure(
        `flow:${flow.id}:step${idx}`,
        `step${idx} threw: ${message}`,
        `status=error`,
        flow,
      ));
      break;
    }
  }
  return {
    cases: results,
    bindings: ctx.bindings,
    authHeader: ctx.authHeader,
    envelopeKey: ctx.envelopeKey,
    runtimeDiagnostics: ctx.runtimeDiagnostics,
  };
}

// ---------------------------------------------------------------------------
// runFlowStep — dispatches on step.kind
// ---------------------------------------------------------------------------

export async function runFlowStep(
  step: GeneratedFlowStep,
  ctx: FlowContext,
  idx: number,
  flow: GeneratedFlow,
): Promise<ProbeCaseResult> {
  switch (step.kind) {
    case 'api':
      return runApiStep(step, ctx, idx, flow);
    case 'expect':
      return runExpectStep(step, ctx, idx, flow);
    case 'capture':
      return runCaptureStep(step, ctx, idx, flow);
    case 'setAuth':
      return runSetAuthStep(step, ctx, idx, flow);
    case 'logout':
      return runLogoutStep(ctx, idx);
    case 'navigate':
      return runNavigateStep(step, ctx, idx, flow);
    case 'wait':
      return runWaitStep(step, idx);
    case 'expect-error-shape':
      return runExpectErrorShapeStep(step, ctx, idx, flow);
    case 'api-upload':
      return runUploadStep(step as GeneratedFlowStepUpload, ctx, idx, flow);
    case 'api-download':
      return runDownloadStep(step as GeneratedFlowStepDownload, ctx, idx, flow);
    case 'api-stream':
      return runStreamStep(step as GeneratedFlowStepStream, ctx, idx, flow);
    case 'api-graphql':
      return runGraphQLStep(step as GeneratedFlowStepGraphQL, ctx, idx, flow);
    case 'ws-connect':
      return runWSConnectStep(step as GeneratedFlowStepWSConnect, ctx, idx, flow);
    case 'ws-send':
      return runWSSendStep(step as GeneratedFlowStepWSSend, ctx, idx, flow);
    case 'ws-expect-event':
      return runWSExpectEventStep(step as GeneratedFlowStepWSExpectEvent, ctx, idx, flow);
    case 'ws-close':
      return runWSCloseStep(ctx, idx);
    case 'capture-cookie':
      return runCaptureCookieStep(step as GeneratedFlowStepCaptureCookie, ctx, idx, flow);
    case 'assert-cookie-rotated':
      return runAssertCookieRotatedStep(step as GeneratedFlowStepAssertCookieRotated, ctx, idx, flow);
    case 'assert-cookie-cleared':
      return runAssertCookieClearedStep(step as GeneratedFlowStepAssertCookieCleared, ctx, idx, flow);
    case 'assert-cookie-attrs':
      return runAssertCookieAttrsStep(step as GeneratedFlowStepAssertCookieAttrs, ctx, idx, flow);
    case 'replay-cookie-as-header':
      return runReplayCookieAsHeaderStep(step as GeneratedFlowStepReplayCookieAsHeader, ctx, idx, flow);
    case 'omit-cookie':
      return runOmitCookieStep(step as GeneratedFlowStepOmitCookie, ctx, idx, flow);
    case 'tamper-cookie':
      return runTamperCookieStep(step as GeneratedFlowStepTamperCookie, ctx, idx, flow);
    default: {
      const unknown = step as { kind?: string };
      return {
        label: `flow:${ctx.flowId}:step${idx}`,
        passed: false,
        blockReason: formatBlockReason(
          'UNKNOWN_STEP_KIND',
          `flow:${ctx.flowId}:step${idx}`,
          `unknown step kind "${unknown.kind ?? 'undefined'}" in flow ${ctx.flowId}`,
        ),
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Step implementations
// ---------------------------------------------------------------------------

async function runApiStep(
  step: GeneratedFlowStepApi,
  ctx: FlowContext,
  idx: number,
  flow: GeneratedFlow,
): Promise<ProbeCaseResult> {
  const label = `flow:${ctx.flowId}:step${idx}:api ${step.method} ${step.path}`;
  const basePath = resolveBindingsInPath(step.path, ctx.bindings);
  const resolvedPath = appendQueryString(basePath, step.query, ctx.bindings);
  const method = step.method.toUpperCase() as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

  const rawHeaders: Record<string, string> = { ...(step.headers ?? {}) };
  const headers: Record<string, string> = {};
  for (const [hk, hv] of Object.entries(rawHeaders)) {
    headers[hk] = typeof hv === 'string' ? resolveBindingsInPath(hv, ctx.bindings) : hv;
  }
  if (!step.skipAuth && ctx.authHeader && !headers.authorization && !headers.Authorization) {
    headers.authorization = ctx.authHeader.startsWith('Bearer ')
      ? ctx.authHeader
      : `Bearer ${ctx.authHeader}`;
  }

  const resolvedBody = resolveBindingsInValue(step.body, ctx.bindings);

  // --- Cookie jar: build outgoing Cookie header (C15) ---
  // When an RFC cookie jar is present (always via probeFlowWithBindings),
  // clear the HttpClient's built-in jar to prevent interference and use
  // the RFC jar as the single source of truth. When ctx.cookieJar is absent
  // (direct runFlowStep calls from legacy tests), skip cookie wiring entirely
  // and let the HttpClient's own jar handle cookies as before.
  const requestUrl = ctx.httpClient.buildUrl(resolvedPath);

  if (ctx.cookieJar) {
    ctx.httpClient.jar.clear();

    let cookieHeaderValue = ctx.cookieJar.cookieHeaderFor(requestUrl);

    // Apply suppressedCookies (one-shot): filter out suppressed names
    if (ctx.suppressedCookies && ctx.suppressedCookies.length > 0 && cookieHeaderValue) {
      const pairs = cookieHeaderValue.split('; ').filter((pair: string) => {
        const eqIdx = pair.indexOf('=');
        const name = eqIdx >= 0 ? pair.slice(0, eqIdx) : pair;
        return !ctx.suppressedCookies.includes(name);
      });
      cookieHeaderValue = pairs.length > 0 ? pairs.join('; ') : null;
    }

    // Apply cookieOverrides (one-shot): replace matching name=value pairs
    if (ctx.cookieOverrides && cookieHeaderValue) {
      const pairs = cookieHeaderValue.split('; ').map((pair: string) => {
        const eqIdx = pair.indexOf('=');
        const name = eqIdx >= 0 ? pair.slice(0, eqIdx) : pair;
        if (ctx.cookieOverrides && name in ctx.cookieOverrides) {
          return `${name}=${ctx.cookieOverrides[name]}`;
        }
        return pair;
      });
      cookieHeaderValue = pairs.join('; ');
    }

    // Set the Cookie header from the RFC jar. Only set if there's a value.
    if (cookieHeaderValue && !headers.cookie && !headers.Cookie) {
      headers.cookie = cookieHeaderValue;
    }
  }

  // Apply pendingHeaderInjection (one-shot from replay-cookie-as-header)
  if (ctx.pendingHeaderInjection) {
    for (const [hName, hVal] of Object.entries(ctx.pendingHeaderInjection)) {
      headers[hName] = hVal;
    }
  }

  const response = await ctx.httpClient.request(resolvedPath, {
    method,
    body: resolvedBody,
    headers,
    redirect: 'manual',
    authScheme: ctx.authSchemeConfig ?? undefined,
  });

  // --- Cookie jar: capture Set-Cookie from response (C15) ---
  if (ctx.cookieJar) {
    const setCookieHeaders = response.setCookies ?? [];
    if (setCookieHeaders.length > 0) {
      ctx.cookieJar.capture(setCookieHeaders, requestUrl);
      checkUndeclaredCookies(setCookieHeaders, ctx, step.method, resolvedPath);
    }
  }

  // Clear one-shot modifiers (safe even if fields are absent)
  if (ctx.suppressedCookies) ctx.suppressedCookies = [];
  if (ctx.cookieOverrides !== undefined) ctx.cookieOverrides = null;
  if (ctx.pendingHeaderInjection !== undefined) ctx.pendingHeaderInjection = null;

  ctx.lastResponse = {
    status: response.status,
    headers: response.headers,
    body: response.bodyJson,
    bodyText: response.bodyText,
    redirectChain: response.redirectChain,
  };

  // api step itself always passes — validation is done by subsequent expect steps.
  return { label, passed: true, status: response.status };
}

async function runExpectStep(
  step: GeneratedFlowStepExpect,
  ctx: FlowContext,
  idx: number,
  flow: GeneratedFlow,
): Promise<ProbeCaseResult> {
  const label = `flow:${ctx.flowId}:step${idx}:expect`;

  if (!ctx.lastResponse) {
    return buildFlowFailure(label, 'no preceding api/navigate step', 'no lastResponse', flow);
  }

  const resp = ctx.lastResponse;
  const actualStatus = resp.status;
  const bodyPreview = resp.bodyText.slice(0, 300);

  // status check (exact)
  if (step.status !== undefined) {
    if (actualStatus !== step.status) {
      return buildFlowFailure(
        label,
        `status === ${step.status}`,
        `status=${actualStatus} body=${bodyPreview}`,
        flow,
      );
    }
  }

  // statusAnyOf check
  if (step.statusAnyOf !== undefined) {
    if (!step.statusAnyOf.includes(actualStatus)) {
      return buildFlowFailure(
        label,
        `status in [${step.statusAnyOf.join(',')}]`,
        `status=${actualStatus} body=${bodyPreview}`,
        flow,
      );
    }
  }

  // forbidden status check
  if (step.forbidden !== undefined) {
    if (step.forbidden.includes(actualStatus)) {
      return buildFlowFailure(
        label,
        `status NOT in [${step.forbidden.join(',')}]`,
        `status=${actualStatus} body=${bodyPreview}`,
        flow,
      );
    }
  }

  // bodyHas check — dotted JSON paths that must exist and be non-null
  if (step.bodyHas !== undefined) {
    for (const dotPath of step.bodyHas) {
      if (dotPath.startsWith('header:')) {
        const headerName = dotPath.slice('header:'.length).toLowerCase();
        if (!resp.headers[headerName]) {
          return buildFlowFailure(
            label,
            `header "${headerName}" exists`,
            `status=${actualStatus} headers=${JSON.stringify(Object.keys(resp.headers))}`,
            flow,
          );
        }
      } else {
        const value = extractJsonPath(resp.body, dotPath);
        if (value === undefined || value === null) {
          return buildFlowFailure(
            label,
            `body.${dotPath} is non-null`,
            `status=${actualStatus} body=${bodyPreview}`,
            flow,
          );
        }
      }
    }
  }

  // bodyIsArray check — dotted JSON paths that must resolve to an array
  if (step.bodyIsArray !== undefined) {
    for (const dotPath of step.bodyIsArray) {
      const value = extractJsonPath(resp.body, dotPath);
      if (!Array.isArray(value)) {
        return buildFlowFailure(
          label,
          `body.${dotPath} is an array`,
          `status=${actualStatus} body=${bodyPreview}`,
          flow,
        );
      }
    }
  }

  // bodyArrayEmpty check — dotted JSON paths that must resolve to an empty array
  if (step.bodyArrayEmpty !== undefined) {
    for (const dotPath of step.bodyArrayEmpty) {
      const value = extractJsonPath(resp.body, dotPath);
      if (!Array.isArray(value)) {
        return buildFlowFailure(
          label,
          `body.${dotPath} is an array (for empty check)`,
          `status=${actualStatus} body=${bodyPreview}`,
          flow,
        );
      }
      if (value.length !== 0) {
        return buildFlowFailure(
          label,
          `body.${dotPath} is empty array (length=0)`,
          `status=${actualStatus} body.${dotPath}.length=${value.length}`,
          flow,
        );
      }
    }
  }

  // bodyIsRootArray — the response body itself must be an array
  if (step.bodyIsRootArray) {
    if (!Array.isArray(resp.body)) {
      return buildFlowFailure(
        label,
        'body is a root-level array',
        `status=${actualStatus} body=${bodyPreview}`,
        flow,
      );
    }
  }

  // bodyRootArrayEmpty — the response body must be an empty array
  if (step.bodyRootArrayEmpty) {
    if (!Array.isArray(resp.body)) {
      return buildFlowFailure(
        label,
        'body is a root-level array (for empty check)',
        `status=${actualStatus} body=${bodyPreview}`,
        flow,
      );
    }
    if (resp.body.length !== 0) {
      return buildFlowFailure(
        label,
        'body is empty root array (length=0)',
        `status=${actualStatus} body.length=${resp.body.length}`,
        flow,
      );
    }
  }

  // bodyContainsAny check — at least one substring must appear
  if (step.bodyContainsAny !== undefined) {
    const found = step.bodyContainsAny.some((sub) => resp.bodyText.includes(sub));
    if (!found) {
      return buildFlowFailure(
        label,
        `body contains any of [${step.bodyContainsAny.join(', ')}]`,
        `status=${actualStatus} body=${bodyPreview}`,
        flow,
      );
    }
  }

  // errorFieldMentions check
  if (step.errorFieldMentions !== undefined) {
    const fieldName = step.errorFieldMentions;
    let mentioned = false;

    // Try JSON body.errors[*].field
    if (resp.body && typeof resp.body === 'object') {
      const record = resp.body as Record<string, unknown>;
      if (Array.isArray(record.errors)) {
        mentioned = record.errors.some(
          (err: unknown) =>
            err && typeof err === 'object' && (err as Record<string, unknown>).field === fieldName,
        );
      }
      // Try JSON body.message containing field name
      if (!mentioned && typeof record.message === 'string') {
        mentioned = record.message.includes(fieldName);
      }
    }

    // Fallback: plain substring on bodyText
    if (!mentioned) {
      mentioned = resp.bodyText.includes(fieldName);
    }

    if (!mentioned) {
      return buildFlowFailure(
        label,
        `error mentions field "${fieldName}"`,
        `status=${actualStatus} body=${bodyPreview}`,
        flow,
      );
    }
  }

  // Binary download assertions
  if (step.expectBinary) {
    if (!resp.bodyBytes || resp.bodyBytes.length === 0) {
      return buildFlowFailure(label, 'non-empty binary body', 'empty or missing bodyBytes', flow);
    }
    if (step.expectedContentType) {
      const actualCt = (resp.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      const expectedCt = step.expectedContentType.toLowerCase();
      if (actualCt !== expectedCt) {
        return buildFlowFailure(label, `Content-Type: ${expectedCt}`, `Content-Type: ${actualCt}`, flow);
      }
    }
    if (step.expectContentDisposition) {
      const actualDisp = resp.headers['content-disposition'] || '';
      if (!actualDisp) {
        return buildFlowFailure(label, `Content-Disposition: ${step.expectContentDisposition}`, 'Content-Disposition header missing', flow);
      }
      // Check that declared disposition type (attachment/inline) matches
      const expectedType = step.expectContentDisposition.split(';')[0].trim().toLowerCase();
      const actualType = actualDisp.split(';')[0].trim().toLowerCase();
      if (actualType !== expectedType) {
        return buildFlowFailure(label, `Content-Disposition: ${expectedType}`, `Content-Disposition: ${actualType}`, flow);
      }
    }
  }

  // SSE stream assertions
  if (step.expectSSE) {
    const events = resp.sseEvents || [];
    const minEvents = step.minEvents ?? 1;
    if (events.length < minEvents) {
      return buildFlowFailure(
        label,
        `>= ${minEvents} SSE events`,
        `received ${events.length} events`,
        flow,
      );
    }
    // Validate that each event has a data field
    for (let ei = 0; ei < events.length; ei++) {
      if (events[ei].data === undefined || events[ei].data === null) {
        return buildFlowFailure(
          label,
          `SSE event[${ei}] has data field`,
          `event[${ei}] missing data`,
          flow,
        );
      }
    }
    // Assert declared event names are present in the received events.
    // The SSE wire-protocol parser (lib/sse.js) sets `event` (per the spec field
    // name), never `type`. The legacy `e.type` fallback was dead code that
    // masked drift between the parser and the assertion contract. Removed.
    if (step.expectEventNames && step.expectEventNames.length > 0) {
      const receivedTypes = new Set(events.map((e: Record<string, unknown>) => e.event || 'message'));
      for (const expected of step.expectEventNames) {
        if (!receivedTypes.has(expected)) {
          return buildFlowFailure(
            label,
            `SSE event type "${expected}" present`,
            `received types: [${[...receivedTypes].join(', ')}]`,
            flow,
          );
        }
      }
    }
    // Assert retry field is present if declared
    if (step.expectRetry != null) {
      const hasRetry = events.some((e: Record<string, unknown>) => e.retry !== undefined);
      if (!hasRetry) {
        return buildFlowFailure(
          label,
          `SSE retry field present (expected ${step.expectRetry}ms)`,
          'no retry field in any event',
          flow,
        );
      }
    }
    // Assert id field is present on events if declared
    if (step.expectId) {
      const hasId = events.some((e: Record<string, unknown>) => e.id !== undefined && e.id !== null);
      if (!hasId) {
        return buildFlowFailure(
          label,
          'SSE id field present on events',
          'no id field in any event',
          flow,
        );
      }
    }
    // Assert heartbeat (comment-only events) if declared.
    // SSE comments (`: foo\n`) are spec-compliant heartbeat frames, but the
    // wire-protocol parser (lib/sse.js) ignores them per spec. Frameworks
    // like NestJS @Sse cannot emit comment frames, so the conventional
    // representation is a named event `heartbeat`. Field is `e.event` per
    // parser output; `e.type` was a dead-code fallback that masked drift.
    if (step.expectHeartbeat) {
      const hasComment = events.some((e: Record<string, unknown>) => e.comment !== undefined || e.event === 'heartbeat');
      if (!hasComment) {
        return buildFlowFailure(
          label,
          'SSE heartbeat (comment/heartbeat event) present',
          'no heartbeat detected in events',
          flow,
        );
      }
    }
  }

  return { label, passed: true, status: actualStatus };
}

function runCaptureStep(
  step: GeneratedFlowStepCapture,
  ctx: FlowContext,
  idx: number,
  flow: GeneratedFlow,
): Promise<ProbeCaseResult> {
  const label = `flow:${ctx.flowId}:step${idx}:capture`;

  if (!ctx.lastResponse) {
    return Promise.resolve(buildFlowFailure(label, 'capture requires preceding response', 'no lastResponse', flow));
  }

  for (const [varName, bindingExpr] of Object.entries(step.bindings)) {
    if (bindingExpr.startsWith('header:')) {
      const headerName = bindingExpr.slice('header:'.length).toLowerCase();
      const headerVal = ctx.lastResponse.headers[headerName];
      if (headerVal !== undefined) {
        ctx.bindings[varName] = headerVal;
      }
    } else {
      // JSON path expression like $.accessToken or $.user.id.
      //
      // Envelope-aware: NestJS apps commonly wrap successful responses via a
      // global interceptor (`{success: true, data: <payload>}`). The unwrap
      // path is statically extracted at matrix:regen time (see
      // detectors/response-envelope.js) and delivered via
      // matrix.responseEnvelope.successWrapper; runHttpSmokeMain seeds it into
      // ctx.envelopeKey. Every capture path here transparently unwraps
      // through that path so flow generators can emit `$.accessToken`
      // without caring about the wrapper.
      const envelopePrefix = ctx.envelopeKey && ctx.envelopeKey.length > 0 ? ctx.envelopeKey.join('.') : null;
      const unwrapped = envelopePrefix
        ? extractJsonPath(ctx.lastResponse.body, bindingExpr.replace(/^\$\./, `$.${envelopePrefix}.`))
        : undefined;
      let value = unwrapped !== undefined ? unwrapped : extractJsonPath(ctx.lastResponse.body, bindingExpr);

      // Legacy fallback for $.accessToken: some auth endpoints return `token`.
      if ((value === undefined || value === null) && bindingExpr === '$.accessToken') {
        const tokenPath = envelopePrefix ? `$.${envelopePrefix}.token` : '$.token';
        value = extractJsonPath(ctx.lastResponse.body, tokenPath);
      }

      // Surface contract drift loudly. Silently writing `undefined` here would
      // overwrite a previously-captured binding (e.g. an accessToken captured
      // earlier in the chain) and the failure would surface several steps later
      // as a misleading "binding value is undefined" on a downstream setAuth /
      // request step. Failing here points the operator directly at the step
      // whose response shape did not contain the expected field.
      if (value === undefined || value === null) {
        return Promise.resolve(
          buildFlowFailure(
            label,
            `binding "${varName}" extracts a defined value from ${bindingExpr}`,
            `${bindingExpr} resolved to ${value === null ? 'null' : 'undefined'} in response body — ` +
              'response shape may have drifted, or the prior step returned an unexpected body',
            flow,
          ),
        );
      }

      ctx.bindings[varName] = value;
    }
  }

  return Promise.resolve({ label, passed: true });
}

function runSetAuthStep(
  step: GeneratedFlowStepSetAuth,
  ctx: FlowContext,
  idx: number,
  flow: GeneratedFlow,
): Promise<ProbeCaseResult> {
  const label = `flow:${ctx.flowId}:step${idx}:setAuth`;
  const binding = ctx.bindings[step.binding];

  if (typeof binding !== 'string') {
    return Promise.resolve(buildFlowFailure(
      label,
      `binding "${step.binding}" is a string`,
      `binding value is ${typeof binding}: ${String(binding)}`,
      flow,
    ));
  }

  ctx.authHeader = binding;
  return Promise.resolve({ label, passed: true });
}

function runLogoutStep(
  ctx: FlowContext,
  idx: number,
): Promise<ProbeCaseResult> {
  ctx.authHeader = null;
  ctx.httpClient.jar.clear();
  if (ctx.cookieJar) ctx.cookieJar.reset();
  if (ctx.savedCookieValues !== undefined) ctx.savedCookieValues = {};
  return Promise.resolve({ label: `flow:${ctx.flowId}:step${idx}:logout`, passed: true });
}

async function runNavigateStep(
  step: GeneratedFlowStepNavigate,
  ctx: FlowContext,
  idx: number,
  flow: GeneratedFlow,
): Promise<ProbeCaseResult> {
  const label = `flow:${ctx.flowId}:step${idx}:navigate ${step.path}`;
  const resolvedPath = resolveBindingsInPath(step.path, ctx.bindings);

  // Step-kind routing: navigate steps are declaratively browser-targeted.
  // Use the runner-provided webClient when present (handles flows whose
  // primary client is the api port because they also have api steps).
  // Fall back to httpClient for backward compat with direct probeFlow
  // callers that don't pass webClient. No path-based guessing.
  const navClient: HttpClient = ctx.webClient ?? ctx.httpClient;

  const headers: Record<string, string> = { accept: 'text/html' };
  if (ctx.authHeader) {
    headers.authorization = ctx.authHeader.startsWith('Bearer ')
      ? ctx.authHeader
      : `Bearer ${ctx.authHeader}`;
  }

  // Cookie jar: build outgoing Cookie header for navigate requests (C15).
  // Build URL against the navigate client (web port), not httpClient (api).
  const navUrl = navClient.buildUrl(resolvedPath);
  if (ctx.cookieJar) {
    const navCookie = ctx.cookieJar.cookieHeaderFor(navUrl);
    if (navCookie && !headers.cookie) {
      headers.cookie = navCookie;
    }
  }

  // redirect: 'manual' — surfaces the immediate response (including 3xx
  // redirect status + Location) to the next expect step. Following would
  // chase the redirect target and report its 2xx, which makes assertions
  // like `statusAnyOf: [301, 302, 307, 308]` (declared by logical contracts
  // for "authenticated user navigates to /login → expect redirect away")
  // unreachable. probePage and api steps already use manual for the same
  // reason. The flow author declares the expected status explicitly.
  const response = await navClient.request(resolvedPath, {
    method: 'GET',
    headers,
    redirect: 'manual',
  });

  // Cookie jar: capture Set-Cookie from navigate response (C15)
  if (ctx.cookieJar) {
    const navSetCookies = response.setCookies ?? [];
    if (navSetCookies.length > 0) {
      ctx.cookieJar.capture(navSetCookies, navUrl);
      checkUndeclaredCookies(navSetCookies, ctx, 'GET', resolvedPath);
    }
  }

  ctx.lastResponse = {
    status: response.status,
    headers: response.headers,
    body: response.bodyJson,
    bodyText: response.bodyText,
    redirectChain: response.redirectChain,
  };

  return { label, passed: true, status: response.status };
}

async function runWaitStep(
  step: GeneratedFlowStepWait,
  idx: number,
): Promise<ProbeCaseResult> {
  await new Promise((resolve) => setTimeout(resolve, step.ms));
  return { label: `wait ${step.ms}ms`, passed: true };
}

async function runExpectErrorShapeStep(
  step: GeneratedFlowStepExpectErrorShape,
  ctx: FlowContext,
  idx: number,
  flow: GeneratedFlow,
): Promise<ProbeCaseResult> {
  const label = `flow:${ctx.flowId}:step${idx}:expect-error-shape(${step.family})`;

  if (!ctx.lastResponse) {
    return buildFlowFailure(label, 'no preceding api/navigate step', 'no lastResponse', flow);
  }

  const resp = ctx.lastResponse;
  const bodyPreview = resp.bodyText.slice(0, 300);
  const body = resp.body as Record<string, unknown> | null;

  if (!body || typeof body !== 'object') {
    return buildFlowFailure(label, `error body is JSON object`, `body is not JSON: ${bodyPreview}`, flow);
  }

  // statusCodeField check: verify the dotted path resolves to a number.
  // statusCodeField already has the envelope path prepended (e.g. 'error.statusCode')
  // so it works against the raw body.
  if (step.statusCodeField) {
    const statusVal = extractJsonPath(body, step.statusCodeField);
    if (statusVal === undefined || statusVal === null) {
      return buildFlowFailure(
        label,
        `body.${step.statusCodeField} exists`,
        `status=${resp.status} body=${bodyPreview}`,
        flow,
      );
    }
  }

  // Envelope-aware unwrapping: if the error-envelope detector found a wrapper
  // path (e.g. ['error'] for NestJS GlobalExceptionFilter), walk into the
  // nested object so family-specific checks see the inner error shape.
  // This is statically determined at flow-generation time — no runtime sniffing.
  let unwrapped: Record<string, unknown> = body;
  if (step.envelope && step.envelope.length > 0) {
    let current: unknown = body;
    for (const key of step.envelope) {
      if (current && typeof current === 'object' && !Array.isArray(current)) {
        current = (current as Record<string, unknown>)[key];
      } else {
        return buildFlowFailure(
          label,
          `body.${step.envelope.join('.')} is an object`,
          `body=${bodyPreview}`,
          flow,
        );
      }
    }
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return buildFlowFailure(
        label,
        `body.${step.envelope.join('.')} is an object`,
        `body=${bodyPreview}`,
        flow,
      );
    }
    unwrapped = current as Record<string, unknown>;
  }

  // Family-specific field mention checks (operate on the unwrapped body)
  const fieldName = step.fieldName;
  if (!fieldName) {
    return { label, passed: true, status: resp.status };
  }

  switch (step.family) {
    case 'nest-default':
    case 'nest-wrapped': {
      // After envelope unwrapping, both families have the same inner shape:
      // { statusCode, message, errors?: [{ field, message }] }
      // nest-wrapped's "error" key IS the envelope — already traversed above.
      // Check message string/array first, then errors[] for field mention.
      let mentioned = false;
      const msg = unwrapped.message;
      if (typeof msg === 'string') {
        mentioned = msg.includes(fieldName);
      } else if (Array.isArray(msg)) {
        mentioned = msg.some((m: unknown) => typeof m === 'string' && m.includes(fieldName));
      }
      if (!mentioned && Array.isArray(unwrapped.errors)) {
        mentioned = (unwrapped.errors as unknown[]).some(
          (e: unknown) => e && typeof e === 'object' && (
            (e as Record<string, unknown>).field === fieldName ||
            (typeof (e as Record<string, unknown>).message === 'string' &&
              ((e as Record<string, unknown>).message as string).includes(fieldName))
          ),
        );
      }
      if (!mentioned) {
        return buildFlowFailure(label, `error mentions "${fieldName}"`, `body=${bodyPreview}`, flow);
      }
      break;
    }

    case 'problem-json': {
      // Check errors[] array for field match, or detail string
      let mentioned = false;
      if (Array.isArray(unwrapped.errors)) {
        mentioned = unwrapped.errors.some(
          (e: unknown) => e && typeof e === 'object' && (e as Record<string, unknown>).field === fieldName,
        );
      }
      if (!mentioned && typeof unwrapped.detail === 'string') {
        mentioned = (unwrapped.detail as string).includes(fieldName);
      }
      if (!mentioned && typeof unwrapped.title === 'string') {
        mentioned = (unwrapped.title as string).includes(fieldName);
      }
      if (!mentioned) {
        return buildFlowFailure(label, `problem+json mentions "${fieldName}"`, `body=${bodyPreview}`, flow);
      }
      break;
    }

    case 'errors-array': {
      if (!Array.isArray(unwrapped.errors)) {
        return buildFlowFailure(label, `body.errors is an array`, `body=${bodyPreview}`, flow);
      }
      const mentioned = unwrapped.errors.some(
        (e: unknown) => e && typeof e === 'object' && (e as Record<string, unknown>).field === fieldName,
      );
      if (!mentioned) {
        return buildFlowFailure(label, `errors[].field === "${fieldName}"`, `body=${bodyPreview}`, flow);
      }
      break;
    }

    case 'raw':
    default: {
      // Heuristic fallback: check if field name appears anywhere in body
      if (!resp.bodyText.includes(fieldName)) {
        return buildFlowFailure(label, `body mentions "${fieldName}"`, `body=${bodyPreview}`, flow);
      }
      break;
    }
  }

  return { label, passed: true, status: resp.status };
}

// ---------------------------------------------------------------------------
// Content-type step implementations: upload, download, stream
// ---------------------------------------------------------------------------

const MAGIC_BYTES_MAP: Record<string, number[]> = {
  'image/png': [0x89, 0x50, 0x4e, 0x47],
  'application/pdf': [0x25, 0x50, 0x44, 0x46], // %PDF
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/gif': [0x47, 0x49, 0x46], // GIF
  'application/zip': [0x50, 0x4b, 0x03, 0x04],
};

async function runUploadStep(
  step: GeneratedFlowStepUpload,
  ctx: FlowContext,
  idx: number,
  flow: GeneratedFlow,
): Promise<ProbeCaseResult> {
  const label = `flow:${ctx.flowId}:step${idx}:upload ${step.method} ${step.path}`;
  const resolvedPath = resolveBindingsInPath(step.path, ctx.bindings);

  let body: BodyInit;
  const headers: Record<string, string> = {};

  if (step.uploadType === 'multipart') {
    const magic = MAGIC_BYTES_MAP[step.mimeType] || [0x00];
    const padLen = Math.max(0, step.sizeBytes - magic.length);
    const buffer = Buffer.concat([Buffer.from(magic), Buffer.alloc(padLen)]);
    const blob = new Blob([buffer], { type: step.mimeType });
    const form = new FormData();

    // Primary file field — fileCount > 1 sends multiple files on same field (array upload)
    const count = step.fileCount ?? 1;
    for (let i = 0; i < count; i++) {
      const suffix = count > 1 ? `-${i + 1}` : '';
      form.append(step.fieldName, blob, `probe-sample${suffix}.bin`);
    }

    // Additional file fields (e.g. avatar + document on same endpoint)
    if (step.additionalFileFields) {
      for (const af of step.additionalFileFields) {
        const afMagic = MAGIC_BYTES_MAP[af.mimeType] || [0x00];
        const afPadLen = Math.max(0, af.sizeBytes - afMagic.length);
        const afBuf = Buffer.concat([Buffer.from(afMagic), Buffer.alloc(afPadLen)]);
        const afBlob = new Blob([afBuf], { type: af.mimeType });
        form.append(af.name, afBlob, `probe-${af.name}.bin`);
      }
    }

    // Text metadata fields alongside file uploads
    if (step.extraFields) {
      for (const [key, value] of Object.entries(step.extraFields)) {
        form.append(key, value);
      }
    }

    body = form;
    // Do NOT set content-type — let fetch set it with boundary
  } else {
    const buffer = Buffer.alloc(step.sizeBytes);
    body = buffer;
    headers['content-type'] = step.mimeType || 'application/octet-stream';
  }

  try {
    const resp = await ctx.httpClient.request(resolvedPath, {
      method: step.method as 'POST' | 'PUT' | 'PATCH',
      body,
      headers,
      bearer: ctx.authHeader,
      authScheme: ctx.authSchemeConfig,
    });

    ctx.lastResponse = {
      status: resp.status,
      headers: resp.headers,
      body: resp.bodyJson,
      bodyText: resp.bodyText,
    };

    return { label, passed: true, status: resp.status, elapsedMs: resp.elapsedMs };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      label,
      passed: false,
      blockReason: formatBlockReason('API_REQUEST_FAILED', label, message),
    };
  }
}

async function runDownloadStep(
  step: GeneratedFlowStepDownload,
  ctx: FlowContext,
  idx: number,
  flow: GeneratedFlow,
): Promise<ProbeCaseResult> {
  const label = `flow:${ctx.flowId}:step${idx}:download ${step.method} ${step.path}`;
  const resolvedPath = resolveBindingsInPath(step.path, ctx.bindings);

  try {
    const resp = await ctx.httpClient.request(resolvedPath, {
      method: step.method as 'GET',
      bearer: ctx.authHeader,
      authScheme: ctx.authSchemeConfig,
      binaryResponse: true,
      headers: { accept: step.expectedContentType },
    });

    ctx.lastResponse = {
      status: resp.status,
      headers: resp.headers,
      body: null,
      bodyText: '',
      bodyBytes: resp.bodyBytes,
      bodyLength: resp.bodyLength,
    };

    // Verify Content-Type header matches expected (strict — no type-family fallback)
    const actualCt = (resp.contentType || '').split(';')[0].trim().toLowerCase();
    const expectedCt = step.expectedContentType.toLowerCase();
    if (actualCt && actualCt !== expectedCt) {
      return buildFlowFailure(
        label,
        `Content-Type: ${expectedCt}`,
        `Content-Type: ${actualCt}`,
        flow,
      );
    }

    // Verify magic bytes if we know them
    const magicExpected = MAGIC_BYTES_MAP[expectedCt];
    if (magicExpected && resp.bodyBytes && resp.bodyBytes.length >= magicExpected.length) {
      const actualMagic = Array.from(resp.bodyBytes.slice(0, magicExpected.length));
      const matches = magicExpected.every((b, i) => actualMagic[i] === b);
      if (!matches) {
        return buildFlowFailure(
          label,
          `magic bytes [${magicExpected.map((b) => b.toString(16)).join(',')}]`,
          `actual bytes [${actualMagic.map((b) => b.toString(16)).join(',')}]`,
          flow,
        );
      }
    }

    return { label, passed: true, status: resp.status, elapsedMs: resp.elapsedMs };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      label,
      passed: false,
      blockReason: formatBlockReason('API_REQUEST_FAILED', label, message),
    };
  }
}

async function runStreamStep(
  step: GeneratedFlowStepStream,
  ctx: FlowContext,
  idx: number,
  flow: GeneratedFlow,
): Promise<ProbeCaseResult> {
  const label = `flow:${ctx.flowId}:step${idx}:stream ${step.method} ${step.path}`;
  const resolvedPath = resolveBindingsInPath(step.path, ctx.bindings);

  try {
    const resp = await ctx.httpClient.request(resolvedPath, {
      method: step.method as 'GET',
      bearer: ctx.authHeader,
      authScheme: ctx.authSchemeConfig,
      streamResponse: true,
      headers: { accept: 'text/event-stream' },
    });

    // Verify Content-Type is text/event-stream
    const actualCt = (resp.contentType || '').split(';')[0].trim().toLowerCase();
    if (actualCt !== 'text/event-stream') {
      ctx.lastResponse = {
        status: resp.status,
        headers: resp.headers,
        body: null,
        bodyText: '',
        sseEvents: [],
      };
      return buildFlowFailure(
        label,
        'Content-Type: text/event-stream',
        `Content-Type: ${actualCt}`,
        flow,
      );
    }

    // Collect SSE events from the stream using spec-correct lib/sse.js parser
    const events: Array<{ data: string; event?: string; id?: string }> = [];
    if (resp.rawResponse && resp.rawResponse.body) {
      const reader = resp.rawResponse.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const deadline = Date.now() + step.timeoutMs;

      while (events.length < step.maxEvents && Date.now() < deadline) {
        const remaining = deadline - Date.now();
        const readPromise = reader.read();
        const timeoutPromise = new Promise<{ done: true; value: undefined }>((resolve) =>
          setTimeout(() => resolve({ done: true, value: undefined }), remaining),
        );
        const result = await Promise.race([readPromise, timeoutPromise]);
        if (result.done) break;
        if (result.value) {
          buffer += decoder.decode(result.value, { stream: true });
        }
        // Parse complete events (separated by double newline)
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';
        for (const part of parts) {
          if (!part.trim()) continue;
          const parsed = parseSSEText(part + '\n\n');
          for (const evt of parsed) {
            events.push(evt);
            if (events.length >= step.maxEvents) break;
          }
          if (events.length >= step.maxEvents) break;
        }
      }
      reader.cancel().catch(() => {});
    }

    ctx.lastResponse = {
      status: resp.status,
      headers: resp.headers,
      body: null,
      bodyText: '',
      sseEvents: events,
    };

    return { label, passed: true, status: resp.status, elapsedMs: resp.elapsedMs };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      label,
      passed: false,
      blockReason: formatBlockReason('API_REQUEST_FAILED', label, message),
    };
  }
}

// ---------------------------------------------------------------------------
// WebSocket step implementations
// ---------------------------------------------------------------------------

async function runWSConnectStep(
  step: GeneratedFlowStepWSConnect,
  ctx: FlowContext,
  idx: number,
  _flow: GeneratedFlow,
): Promise<ProbeCaseResult> {
  const label = `flow:${ctx.flowId}:step${idx}:ws-connect ${step.path}`;

  if (!wsClient.isAvailable()) {
    return {
      label,
      passed: true,
      hint: 'ws library not installed — WebSocket probes skipped',
    };
  }

  // Resolve WebSocket URL from httpClient base
  const httpBase = (ctx.httpClient as unknown as { baseUrl?: string }).baseUrl ?? 'http://127.0.0.1:3001';
  const transport = step.transport ?? 'ws';
  const namespace = step.namespace ? `/${step.namespace}` : '/';
  // For Socket.IO namespace gateways the Engine.IO transport endpoint is
  // always at the default path `/socket.io/`. The namespace itself is
  // routed via the Socket.IO CONNECT packet (`40<namespace>,`) sent
  // after the Engine.IO handshake. Appending `step.path` (which equals
  // the namespace name) to the URL produces `/probe-events/socket.io/`
  // which the server doesn't serve and yields a "socket hang up".
  // For path-based gateways (no namespace) the gateway IS mounted at
  // step.path so we include it.
  const wsUrl = transport === 'socket.io' && step.namespace
    ? httpBase.replace(/^http/, 'ws')
    : httpBase.replace(/^http/, 'ws') + step.path;

  try {
    const { ws, error } = await wsClient.connect(wsUrl, { timeoutMs: 5000, transport, namespace });

    // If expectReject is set, the connection SHOULD fail (auth-on-handshake guard)
    if (step.expectReject) {
      if (error) {
        // Connection was rejected as expected — pass
        return { label, passed: true, hint: `ws-connect rejected as expected: ${error}` };
      }
      // Connection succeeded when it should have been rejected
      if (ws) {
        await wsClient.close(ws);
      }
      return {
        label,
        passed: false,
        blockReason: formatBlockReason('FLOW_STEP_FAILED', label,
          `ws-connect succeeded but expected rejection (gateway has @UseGuards — unauthenticated connection should be refused)`),
      };
    }

    if (error) {
      return {
        label,
        passed: false,
        blockReason: formatBlockReason('FLOW_STEP_FAILED', label, `ws-connect failed: ${error}`),
      };
    }
    ctx.wsConnection = ws;
    return { label, passed: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // If expectReject, a thrown error also counts as rejection
    if (step.expectReject) {
      return { label, passed: true, hint: `ws-connect rejected (exception): ${message}` };
    }

    return {
      label,
      passed: false,
      blockReason: formatBlockReason('API_REQUEST_FAILED', label, message),
    };
  }
}

async function runWSSendStep(
  step: GeneratedFlowStepWSSend,
  ctx: FlowContext,
  idx: number,
  _flow: GeneratedFlow,
): Promise<ProbeCaseResult> {
  const label = `flow:${ctx.flowId}:step${idx}:ws-send ${step.event}`;

  if (!wsClient.isAvailable()) {
    return { label, passed: true, hint: 'ws library not installed — skipped' };
  }

  if (!ctx.wsConnection) {
    return {
      label,
      passed: false,
      blockReason: formatBlockReason('FLOW_STEP_FAILED', label, 'No active WebSocket connection'),
    };
  }

  try {
    const { error } = await wsClient.send(ctx.wsConnection, step.data ?? {}, { event: step.event });
    if (error) {
      return {
        label,
        passed: false,
        blockReason: formatBlockReason('FLOW_STEP_FAILED', label, `ws-send failed: ${error}`),
      };
    }
    return { label, passed: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      label,
      passed: false,
      blockReason: formatBlockReason('API_REQUEST_FAILED', label, message),
    };
  }
}

async function runWSExpectEventStep(
  step: GeneratedFlowStepWSExpectEvent,
  ctx: FlowContext,
  idx: number,
  _flow: GeneratedFlow,
): Promise<ProbeCaseResult> {
  const label = `flow:${ctx.flowId}:step${idx}:ws-expect-event ${step.eventName ?? 'any'}`;

  if (!wsClient.isAvailable()) {
    return { label, passed: true, hint: 'ws library not installed — skipped' };
  }

  if (!ctx.wsConnection) {
    return {
      label,
      passed: false,
      blockReason: formatBlockReason('FLOW_STEP_FAILED', label, 'No active WebSocket connection'),
    };
  }

  try {
    const { matched, error } = await wsClient.expectEvent(ctx.wsConnection, {
      eventName: step.eventName ?? undefined,
      timeoutMs: step.timeoutMs ?? 3000,
    });

    if (error && !matched) {
      return {
        label,
        passed: false,
        blockReason: formatBlockReason('FLOW_STEP_FAILED', label, `ws-expect-event: ${error}`),
      };
    }

    return { label, passed: matched };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      label,
      passed: false,
      blockReason: formatBlockReason('API_REQUEST_FAILED', label, message),
    };
  }
}

async function runWSCloseStep(
  ctx: FlowContext,
  idx: number,
): Promise<ProbeCaseResult> {
  const label = `flow:${ctx.flowId}:step${idx}:ws-close`;

  if (!wsClient.isAvailable()) {
    return { label, passed: true, hint: 'ws library not installed — skipped' };
  }

  if (!ctx.wsConnection) {
    // Already closed or never opened — that is OK
    return { label, passed: true };
  }

  try {
    await wsClient.close(ctx.wsConnection);
    ctx.wsConnection = null;
    return { label, passed: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.wsConnection = null;
    return {
      label,
      passed: false,
      blockReason: formatBlockReason('API_REQUEST_FAILED', label, message),
    };
  }
}

async function runGraphQLStep(
  step: GeneratedFlowStepGraphQL,
  ctx: FlowContext,
  idx: number,
  flow: GeneratedFlow,
): Promise<ProbeCaseResult> {
  const label = `flow:${ctx.flowId}:step${idx}:graphql ${step.operationName || 'anonymous'}`;
  const resolvedEndpoint = resolveBindingsInPath(step.endpoint, ctx.bindings);
  const resolvedVars = resolveBindingsInValue(step.variables, ctx.bindings) as Record<string, unknown> | undefined;

  const body = {
    query: step.query,
    ...(resolvedVars ? { variables: resolvedVars } : {}),
    ...(step.operationName ? { operationName: step.operationName } : {}),
  };

  try {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (ctx.authHeader) {
      headers.authorization = ctx.authHeader.startsWith('Bearer ')
        ? ctx.authHeader
        : `Bearer ${ctx.authHeader}`;
    }

    const resp = await ctx.httpClient.request(resolvedEndpoint, {
      method: 'POST',
      body,
      headers,
      authScheme: ctx.authSchemeConfig ?? undefined,
    });

    ctx.lastResponse = {
      status: resp.status,
      headers: resp.headers,
      body: resp.bodyJson,
      bodyText: resp.bodyText,
    };

    return { label, passed: true, status: resp.status, elapsedMs: resp.elapsedMs };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      label,
      passed: false,
      blockReason: formatBlockReason('API_REQUEST_FAILED', label, message),
    };
  }
}

// ---------------------------------------------------------------------------
// COOKIE_UNDECLARED runtime check
// ---------------------------------------------------------------------------

/**
 * After capturing Set-Cookie headers from a response, check each cookie name
 * against the declared set in matrix.cookieFlows[].name. If the name is not
 * declared, emit a COOKIE_UNDECLARED runtime diagnostic. This is an exact
 * match — no substring/regex/keyword guessing.
 */
function checkUndeclaredCookies(
  setCookieHeaders: string[],
  ctx: FlowContext,
  method: string,
  path: string,
): void {
  if (!ctx.declaredCookieNames || ctx.declaredCookieNames.size === 0) return;
  if (!ctx.runtimeDiagnostics) return;

  for (const header of setCookieHeaders) {
    const parsed = parseSetCookie(header);
    if (!parsed) continue;

    if (!ctx.declaredCookieNames.has(parsed.name)) {
      ctx.runtimeDiagnostics.push({
        code: 'COOKIE_UNDECLARED',
        level: 'warning',
        details: {
          cookieName: parsed.name,
          flowId: ctx.flowId,
          method,
          path,
        },
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Cookie step implementations (C15)
// ---------------------------------------------------------------------------

/**
 * capture-cookie: After the preceding request, read the named cookie from the
 * jar. If present, store its value in savedCookieValues[savePath]. If absent,
 * FAIL with cookie-not-issued.
 */
function runCaptureCookieStep(
  step: GeneratedFlowStepCaptureCookie,
  ctx: FlowContext,
  idx: number,
  flow: GeneratedFlow,
): Promise<ProbeCaseResult> {
  const label = `flow:${ctx.flowId}:step${idx}:capture-cookie:${step.name}`;
  const entry = ctx.cookieJar.get(step.name);

  if (!entry) {
    return Promise.resolve(buildFlowFailure(
      label,
      `cookie "${step.name}" present in jar`,
      `cookie-not-issued: ${step.name}`,
      flow,
    ));
  }

  const savePath = step.savePath ?? `cookie:${step.name}`;
  ctx.savedCookieValues[savePath] = entry.value;
  ctx.bindings[savePath] = entry.value;

  return Promise.resolve({ label, passed: true });
}

/**
 * assert-cookie-rotated: Compare the jar's current cookie value against a
 * previously captured value. PASS if different + non-empty. FAIL if same
 * value (rotation didn't happen) or if the cookie is absent.
 */
function runAssertCookieRotatedStep(
  step: GeneratedFlowStepAssertCookieRotated,
  ctx: FlowContext,
  idx: number,
  flow: GeneratedFlow,
): Promise<ProbeCaseResult> {
  const label = `flow:${ctx.flowId}:step${idx}:assert-cookie-rotated:${step.name}`;
  const entry = ctx.cookieJar.get(step.name);

  if (!entry) {
    return Promise.resolve(buildFlowFailure(
      label,
      `cookie "${step.name}" present in jar after rotation`,
      `cookie absent from jar`,
      flow,
    ));
  }

  const previousValue = ctx.savedCookieValues[step.previousFromBag];
  if (previousValue === undefined) {
    return Promise.resolve(buildFlowFailure(
      label,
      `previous value at bag key "${step.previousFromBag}" exists`,
      `bag key "${step.previousFromBag}" not found in savedCookieValues`,
      flow,
    ));
  }

  if (entry.value === previousValue) {
    return Promise.resolve(buildFlowFailure(
      label,
      `cookie "${step.name}" value changed (rotated)`,
      `value unchanged: "${entry.value}" === previous "${previousValue}"`,
      flow,
    ));
  }

  if (entry.value.length === 0) {
    return Promise.resolve(buildFlowFailure(
      label,
      `cookie "${step.name}" has non-empty rotated value`,
      `rotated value is empty string`,
      flow,
    ));
  }

  return Promise.resolve({ label, passed: true });
}

/**
 * assert-cookie-cleared: After the preceding request, check that the named
 * cookie has been cleared (Max-Age=0 or Expires-in-past) AND is no longer
 * present in the jar.
 */
function runAssertCookieClearedStep(
  step: GeneratedFlowStepAssertCookieCleared,
  ctx: FlowContext,
  idx: number,
  flow: GeneratedFlow,
): Promise<ProbeCaseResult> {
  const label = `flow:${ctx.flowId}:step${idx}:assert-cookie-cleared:${step.name}`;

  const isCleared = ctx.cookieJar.isCleared(step.name);
  const isPresent = ctx.cookieJar.has(step.name);

  if (!isCleared) {
    return Promise.resolve(buildFlowFailure(
      label,
      `cookie "${step.name}" cleared (Max-Age=0 or Expires-in-past)`,
      isPresent
        ? `cookie is still present and NOT cleared`
        : `cookie was never issued (not in cleared set)`,
      flow,
    ));
  }

  if (isPresent) {
    return Promise.resolve(buildFlowFailure(
      label,
      `cookie "${step.name}" absent from jar after clear`,
      `cookie is in cleared set but still has a live entry`,
      flow,
    ));
  }

  return Promise.resolve({ label, passed: true });
}

/**
 * assert-cookie-attrs: Compare the jar's cookie attributes against expected
 * values. PASS if all declared attrs match. FAIL with diff on mismatch.
 */
function runAssertCookieAttrsStep(
  step: GeneratedFlowStepAssertCookieAttrs,
  ctx: FlowContext,
  idx: number,
  flow: GeneratedFlow,
): Promise<ProbeCaseResult> {
  const label = `flow:${ctx.flowId}:step${idx}:assert-cookie-attrs:${step.name}`;
  const attrs = ctx.cookieJar.attrsOf(step.name);

  if (!attrs) {
    return Promise.resolve(buildFlowFailure(
      label,
      `cookie "${step.name}" present for attribute check`,
      `cookie absent from jar`,
      flow,
    ));
  }

  const diffs: string[] = [];
  for (const [key, expectedValue] of Object.entries(step.expected)) {
    if (expectedValue === undefined) continue;
    const actualValue = (attrs as Record<string, unknown>)[key];
    if (actualValue !== expectedValue) {
      diffs.push(`${key}: expected=${JSON.stringify(expectedValue)} actual=${JSON.stringify(actualValue)}`);
    }
  }

  if (diffs.length > 0) {
    return Promise.resolve(buildFlowFailure(
      label,
      `all declared attrs match for "${step.name}"`,
      `attr drift: ${diffs.join('; ')}`,
      flow,
    ));
  }

  return Promise.resolve({ label, passed: true });
}

/**
 * replay-cookie-as-header: Request-modifier (one-shot). Reads the named
 * cookie from the jar, schedules it as an additional header on the NEXT
 * request. Does NOT fire its own request.
 */
function runReplayCookieAsHeaderStep(
  step: GeneratedFlowStepReplayCookieAsHeader,
  ctx: FlowContext,
  idx: number,
  flow: GeneratedFlow,
): Promise<ProbeCaseResult> {
  const label = `flow:${ctx.flowId}:step${idx}:replay-cookie-as-header:${step.cookieName}->${step.headerName}`;
  const entry = ctx.cookieJar.get(step.cookieName);

  if (!entry) {
    return Promise.resolve(buildFlowFailure(
      label,
      `cookie "${step.cookieName}" present in jar for header replay`,
      `cookie absent from jar`,
      flow,
    ));
  }

  const nextStep = flow.steps[idx + 1];
  if (nextStep && isModifierStep(nextStep)) {
    return Promise.resolve(buildFlowFailure(
      label,
      `next step is a request step`,
      `modifier-without-request: next step is "${nextStep.kind}"`,
      flow,
    ));
  }

  ctx.pendingHeaderInjection = {
    ...(ctx.pendingHeaderInjection ?? {}),
    [step.headerName]: entry.value,
  };

  return Promise.resolve({ label, passed: true });
}

/**
 * omit-cookie: Request-modifier (one-shot). Suppresses the named cookie
 * from the auto-Cookie header on the NEXT request.
 */
function runOmitCookieStep(
  step: GeneratedFlowStepOmitCookie,
  ctx: FlowContext,
  idx: number,
  flow: GeneratedFlow,
): Promise<ProbeCaseResult> {
  const label = `flow:${ctx.flowId}:step${idx}:omit-cookie:${step.name}`;

  const nextStep = flow.steps[idx + 1];
  if (nextStep && isModifierStep(nextStep)) {
    return Promise.resolve(buildFlowFailure(
      label,
      `next step is a request step`,
      `modifier-without-request: next step is "${nextStep.kind}"`,
      flow,
    ));
  }

  ctx.suppressedCookies = [...ctx.suppressedCookies, step.name];

  return Promise.resolve({ label, passed: true });
}

/**
 * tamper-cookie: Request-modifier (one-shot). Replaces the named cookie's
 * value in the outgoing Cookie header with `withValue` for ONE request.
 * Does NOT mutate the jar.
 */
function runTamperCookieStep(
  step: GeneratedFlowStepTamperCookie,
  ctx: FlowContext,
  idx: number,
  flow: GeneratedFlow,
): Promise<ProbeCaseResult> {
  const label = `flow:${ctx.flowId}:step${idx}:tamper-cookie:${step.name}`;

  const nextStep = flow.steps[idx + 1];
  if (nextStep && isModifierStep(nextStep)) {
    return Promise.resolve(buildFlowFailure(
      label,
      `next step is a request step`,
      `modifier-without-request: next step is "${nextStep.kind}"`,
      flow,
    ));
  }

  ctx.cookieOverrides = {
    ...(ctx.cookieOverrides ?? {}),
    [step.name]: step.withValue,
  };

  return Promise.resolve({ label, passed: true });
}

/**
 * Check if a step is a request-modifier (replay/omit/tamper).
 * Request modifiers MUST be followed by a request step, not another modifier.
 */
function isModifierStep(step: GeneratedFlowStep): boolean {
  return step.kind === 'replay-cookie-as-header'
    || step.kind === 'omit-cookie'
    || step.kind === 'tamper-cookie';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildFlowFailure(
  label: string,
  expected: string,
  actual: string,
  flow: GeneratedFlow,
): ProbeCaseResult {
  const lines = [
    `\u2717 ${label}`,
    `  contract: ${flow.contract.source}`,
    `  expected: ${expected}`,
    `  actual:   ${actual}`,
    `  implies:  ${flow.onFail.implies}`,
  ];
  if (flow.onFail.check.length > 0) {
    lines.push('  check:');
    for (const checkPath of flow.onFail.check) {
      lines.push(`    - ${checkPath}`);
    }
  }

  return {
    label,
    passed: false,
    blockReason: formatBlockReason('FLOW_STEP_FAILED', label, `expected: ${expected} | actual: ${actual}`),
    failureContext: {
      contractSource: flow.contract.source,
      implies: flow.onFail.implies,
      checkPaths: flow.onFail.check,
    },
  };
}

export function extractJsonPath(json: unknown, path: string): unknown {
  if (!json || typeof json !== 'object') return undefined;
  const clean = path.replace(/^\$\.?/, '');
  const parts = clean.split('.').filter(Boolean);
  let current: unknown = json;
  for (const part of parts) {
    if (current === undefined || current === null) return undefined;
    // [*] wildcard: check that every element of the array has the remaining path non-null
    if (part === '[*]' || part.endsWith('[*]')) {
      const arrayKey = part.replace(/\[\*\]$/, '');
      const arr = arrayKey
        ? (current as Record<string, unknown>)[arrayKey]
        : current;
      if (!Array.isArray(arr)) return undefined;
      if (arr.length === 0) return arr;
      // Remaining path after [*]
      const remainingIdx = parts.indexOf(part);
      const remaining = parts.slice(remainingIdx + 1).join('.');
      if (!remaining) return arr;
      // Check every element — return undefined if any element fails
      const results = arr.map((el) => extractJsonPath(el, remaining));
      if (results.some((r) => r === undefined || r === null)) return undefined;
      return results;
    }
    if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[part];
    } else return undefined;
  }
  return current;
}

/**
 * Resolve a parameterized constrained sigil key like
 *   `uniq:maxLen:8:pattern:<base64>`
 * into a random string that satisfies the declared constraints.
 * Returns null if the key does not start with 'uniq:' or cannot be resolved.
 *
 * Declaration-driven: the constraints come from Zod schema introspection
 * (max length from .max(), pattern from .regex()). Never guesses — if the
 * pattern cannot be satisfied within a retry budget, returns null.
 */
export function resolveConstrainedSigil(sigilKey: string): string | null {
  if (!sigilKey.startsWith('uniq:')) return null;

  const parts = sigilKey.split(':');
  let maxLen = 32; // default
  let pattern: RegExp | null = null;

  for (let i = 1; i < parts.length; i++) {
    if (parts[i] === 'maxLen' && i + 1 < parts.length) {
      maxLen = parseInt(parts[i + 1], 10);
      if (isNaN(maxLen) || maxLen < 1) maxLen = 32;
      i++;
    } else if (parts[i] === 'pattern' && i + 1 < parts.length) {
      try {
        const decoded = Buffer.from(parts[i + 1], 'base64').toString('utf8');
        pattern = new RegExp(decoded);
      } catch {
        // Invalid regex — skip pattern constraint
      }
      i++;
    }
  }

  // Generate random uppercase alphanumeric strings within retry budget
  const RETRY_BUDGET = 50;
  for (let attempt = 0; attempt < RETRY_BUDGET; attempt++) {
    const len = Math.min(maxLen, Math.max(6, maxLen));
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let candidate = 'P'; // prefix to avoid leading digit issues
    for (let j = 1; j < len; j++) {
      candidate += chars[Math.floor(Math.random() * chars.length)];
    }
    if (pattern && !pattern.test(candidate)) continue;
    return candidate;
  }

  // Exhausted budget — return a truncated fallback (no pattern match guaranteed)
  return ('PROBE' + randomBytes(4).toString('hex')).slice(0, maxLen);
}

function resolveBindingsInPath(path: string, bindings: Record<string, unknown>): string {
  return path.replace(/\$\{([\w:+/=]+)\}/g, (match, varName) => {
    const value = bindings[varName];
    if (value !== undefined && value !== null) return String(value);

    // Try parameterized constrained sigil resolution
    if (varName.startsWith('uniq:')) {
      const resolved = resolveConstrainedSigil(varName);
      if (resolved !== null) {
        bindings[varName] = resolved; // cache for subsequent references
        return resolved;
      }
    }

    return match;
  });
}

/**
 * Seed per-flow unique values that flows-generator targets via sigils:
 *   ${uniqEmail}  — safe-for-unique email (probe-<hex>@probe.example.com)
 *   ${uniqString} — unique free-form token
 *   ${uniqUuid}   — RFC 4122 UUID v4
 *   ${uniqUuid2}  — second independent UUID (used by idempotency different-key flow)
 * Fresh per flow run; never collides with prior runs or other flows in the
 * same batch. Used for Prisma @unique fields (see flows-generator.js
 * pickUniqueSigil).
 */
function seedUniqueBindings(): Record<string, string> {
  const runId = randomBytes(6).toString('hex');
  return {
    uniqEmail: `probe-${runId}@probe.example.com`,
    uniqString: `probe-${runId}`,
    uniqUuid: randomUUID(),
    uniqUuid2: randomUUID(),
  };
}

/**
 * Build an AuthSchemeConfig from a SecurityScheme definition and a credential value.
 * Used by flows-generator's auth-boundary probes to inject scheme-appropriate credentials.
 */
export function buildAuthSchemeConfig(
  scheme: SecurityScheme,
  credentialValue: string,
): AuthSchemeConfig {
  const schemeType = scheme.type;

  if (schemeType === 'http') {
    const httpScheme = (scheme.scheme ?? '').toLowerCase();
    if (httpScheme === 'basic') {
      return { type: 'basic', value: credentialValue };
    }
    // bearer and all other http schemes
    return { type: 'bearer', value: credentialValue };
  }

  if (schemeType === 'apiKey') {
    return {
      type: 'apiKey',
      in: scheme.in ?? 'header',
      name: scheme.name ?? 'x-api-key',
      value: credentialValue,
    };
  }

  if (schemeType === 'oauth2' || schemeType === 'openIdConnect') {
    // OAuth2 and OpenID Connect present access tokens same as bearer
    return { type: schemeType as 'oauth2' | 'openIdConnect', value: credentialValue };
  }

  // Fallback: treat as bearer
  return { type: 'bearer', value: credentialValue };
}

/**
 * Recursively walk a request body substituting ${varName} sigils from
 * bindings. Strings that are exactly "${varName}" return the raw binding
 * value (preserves type — numbers stay numbers, objects stay objects).
 * Strings that EMBED sigils use string interpolation.
 * Arrays + plain objects are walked recursively; primitives pass through.
 */
function resolveBindingsInValue(
  value: unknown,
  bindings: Record<string, unknown>,
): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    const exact = value.match(/^\$\{([\w:+/=]+)\}$/);
    if (exact) {
      const bound = bindings[exact[1]];
      if (bound !== undefined) return bound;

      // Try parameterized constrained sigil resolution
      if (exact[1].startsWith('uniq:')) {
        const resolved = resolveConstrainedSigil(exact[1]);
        if (resolved !== null) {
          bindings[exact[1]] = resolved; // cache
          return resolved;
        }
      }

      return value;
    }
    return resolveBindingsInPath(value, bindings);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => resolveBindingsInValue(entry, bindings));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = resolveBindingsInValue(v, bindings);
    }
    return out;
  }
  return value;
}

/**
 * Serialize a structured query object to a URL querystring and append it to
 * the path. Values go through binding substitution (supports ${var}). Array
 * values emit repeated key=value pairs; nested objects are JSON-encoded.
 * Returns the original path unchanged when query is absent or empty.
 */
function appendQueryString(
  basePath: string,
  query: Record<string, unknown> | undefined,
  bindings: Record<string, unknown>,
): string {
  if (!query) return basePath;
  const keys = Object.keys(query);
  if (keys.length === 0) return basePath;

  const params = new URLSearchParams();
  for (const key of keys) {
    const raw = query[key];
    if (raw === undefined) continue;
    if (Array.isArray(raw)) {
      for (const entry of raw) {
        params.append(key, stringifyQueryValue(entry, bindings));
      }
    } else if (raw === null) {
      params.append(key, '');
    } else {
      params.append(key, stringifyQueryValue(raw, bindings));
    }
  }

  const qs = params.toString();
  if (!qs) return basePath;
  const sep = basePath.includes('?') ? '&' : '?';
  return `${basePath}${sep}${qs}`;
}

function stringifyQueryValue(
  value: unknown,
  bindings: Record<string, unknown>,
): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return resolveBindingsInPath(value, bindings);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

// ---------------------------------------------------------------------------
// probeForm (unchanged diagnostic helper)
// ---------------------------------------------------------------------------

export interface ProbeFormOptions { bearer?: string | null; }

export async function probeForm(_client: HttpClient, form: { file: string; route: string; submitsTo: string }, _matrix: MergedMatrix, _options: ProbeFormOptions = {}): Promise<ProbeCaseResult> {
  return { label: `form ${form.route} → ${form.submitsTo}`, passed: true, hint: 'covered by flows; direct form probe is diagnostic-only' };
}

