/**
 * Reads `.matrix.json` (plan 02), `.runtime-contract.overlay.json`, and
 * `runtime-contract.compiled.json` (plan 05), merges them into a single
 * in-memory MergedMatrix with Priority 0 applied (manifest overrides inferred
 * fields).
 *
 * Probe code consumes `MergedMatrix` only — never the raw matrix JSON — so the
 * overlay/compiled merging is centralized here.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROJECT_ROOT } from './shared';
import type { CookieFlow } from './contract-types';

export interface BootPlan {
  driver: 'worktree-stack' | 'docker-compose' | 'package-json' | 'turbo' | 'none' | string;
  driverPath?: string;
  startCmd?: string;
  stopCmd?: string;
  portsCmd?: string;
  stackFile?: string;
  alreadyRunning?: boolean;
  envFiles?: string[];
  ports?: { pg_port?: number; api_port?: number; web_port?: number; [key: string]: number | undefined };
  scripts?: Array<{ name: string; cmd: string; args?: string[]; env?: Record<string, string>; waitFor?: { type: 'tcp' | 'http' | 'log'; value: string | number; timeoutSec?: number } }>;
}

export interface AuthDetection {
  registerSurface?: string | null;
  loginSurface?: string | null;
  logoutSurface?: string | null;
  apiPrefix?: string;
  tokenStorage?: 'cookie' | 'localStorage' | 'memory' | string;
  tokenField?: string;
}

export interface MatrixPage {
  file: string;
  route: string;
  routeParams?: string[];
  framework?: string;
  /**
   * Auth guard sourced from sibling `page.identity.{ts,tsx,js,jsx}` file.
   * 'unknown' means no identity file found — probe skips auth-boundary
   * assertions for this page (not assumed public).
   */
  guard: 'public' | 'authenticated' | 'optional' | 'unknown' | string;
  /**
   * Page role from sibling identity file: 'login-page', 'register-page',
   * 'post-login-destination', 'logout-destination', 'public', or null when
   * undeclared.
   */
  role?: string | null;
  unauthRedirect?: string | null;
  postLoginRedirect?: string | null;
  tokens?: string[];
  mustNotContain?: string[];
  changed?: boolean;
}

export interface ResponseContract {
  status: number;
  schemaRef: string;
  fields: string[];
  requiredPaths: string[];
}

export type ErrorFamily = 'nest-default' | 'nest-wrapped' | 'problem-json' | 'errors-array' | 'raw';

export interface ErrorShape {
  family: ErrorFamily;
  schemaRef: string | null;
  contentType: string;
  fieldPath: string | null;
  messagePath: string | null;
  statusPath: string | null;
}

export type SecuritySchemeType = 'http' | 'apiKey' | 'oauth2' | 'openIdConnect';
export type SecuritySchemeIn = 'header' | 'query' | 'cookie';

export interface SecurityScheme {
  type: SecuritySchemeType;
  scheme?: string;
  bearerFormat?: string;
  in?: SecuritySchemeIn;
  name?: string;
  flows?: Record<string, unknown>;
  openIdConnectUrl?: string;
}

export type SecurityRequirement = Record<string, string[]>;

export type PaginationStyle = 'offset' | 'cursor' | 'link-header';

export interface PaginationProfile {
  style: PaginationStyle;
  paramNames: Record<string, string>;
  responseKeys: Record<string, string>;
  isBareArray: boolean;
  maxLimit: number | null;
  defaultLimit: number | null;
  constraints: Record<string, number | string>;
  queryContract: {
    schemaRef: string;
    fields: Array<{
      name: string;
      type: string;
      required: boolean;
      constraints: Record<string, unknown>;
      samples: { valid: unknown; invalidators: Array<{ kind: string; value?: unknown }> };
    }>;
    sampleValid: Record<string, unknown>;
    diagnostics: unknown[];
  };
}

export interface ConditionalProfile {
  supportsETag: boolean;
  supportsLastModified: boolean;
  patterns: string[];
  conditionalStatuses: number[];
  responseHeaders: string[];
  requestHeaders: string[];
}

export interface IdempotencyProfile {
  headerName: string;
  required: boolean;
  source: string;
}

export interface MatrixEndpoint {
  file: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | string;
  path: string;
  guard?: 'public' | 'authenticated' | 'optional' | string;
  inputSchemaRef?: string | null;
  outputSchemaRef?: string | null;
  responseContract?: ResponseContract | null;
  errorShape?: ErrorShape | null;
  securityRequirement?: SecurityRequirement[];
  paginationProfile?: PaginationProfile | null;
  conditionalProfile?: ConditionalProfile | null;
  idempotencyProfile?: IdempotencyProfile | null;
  successStatus?: number;
  requestContentTypes?: string[];
  responseContentTypes?: string[];
  changed?: boolean;
}

export interface MatrixForm {
  file: string;
  route: string;
  submitsTo: string;
  method?: string;
  fields?: Array<{ name: string; type?: string; required?: boolean }>;
  changed?: boolean;
}

export interface MatrixMiddleware {
  file: string;
  matcher?: string[];
  protectedPaths?: string[];
  redirectsTo?: string;
  changed?: boolean;
}

export interface RawMatrix {
  version?: string;
  generatedAt?: string;
  projectDir?: string;
  scope?: 'session' | 'full' | string;
  detectedFrameworks?: Record<string, unknown>;
  bootPlan?: BootPlan;
  authDetection?: AuthDetection;
  responseEnvelope?: ResponseEnvelope | { wrapper?: string; source?: string };
  errorEnvelope?: ErrorEnvelope | null;
  prismaModels?: PrismaModels;
  graphql?: GraphQLSchema | null;
  websocketGateways?: WebSocketProfile | null;
  csrf?: CsrfDetection | null;
  oauth?: OAuthDetection | null;
  multiTenant?: MultiTenantDetection | null;
  cookieFlows?: CookieFlow[] | null;
  securitySchemes?: Record<string, SecurityScheme>;
  pages?: MatrixPage[];
  pageRoles?: Record<string, string>;
  apiEndpoints?: MatrixEndpoint[];
  forms?: MatrixForm[];
  middleware?: MatrixMiddleware[];
}

/**
 * Static description of the global response envelope. When the backend installs
 * an interceptor/middleware that wraps payloads, `successWrapper` is the path
 * (array of keys) under which the real payload lives. For example,
 * `{ data: <payload> }` → `['data']`, `{ payload: { data: <payload> } }` →
 * `['payload', 'data']`. `null` means responses are unwrapped.
 *
 * `errorWrapper` describes the error-response envelope path when a global
 * exception filter wraps errors (e.g. `{ error: { statusCode, message } }`
 * → `['error']`). `null` means errors are not wrapped beyond their natural
 * shape.
 *
 * Back-compat: old matrices with `wrapper: string` are coerced to
 * `successWrapper: [wrapper]` in `loadMatrix()`.
 */
export interface ResponseEnvelope {
  successWrapper: string[] | null;
  errorWrapper: string[] | null;
  source: string | null;
}

/**
 * Static description of the global error response wrapper. When the backend
 * installs a global exception filter that wraps every error payload (NestJS
 * `{success: false, error: {statusCode, message}}` convention), this
 * describes the envelope shape so error-shape assertions can unwrap
 * transparently. Null means no error envelope detected.
 */
export interface ErrorEnvelope {
  wrapper: string[];
  statusField: string;
  messageField: string;
  errorsArrayField: string | null;
  source: string;
}

/**
 * Prisma-declared uniqueness per model, extracted statically from
 * `packages/database/prisma/schema.prisma`. flows-generator uses this to
 * decide which fields in a POST/PATCH body must be substituted with a
 * run-unique value at probe time (e.g. `@unique email` gets rewritten to
 * `probe-<runId>@example.com` so the :happy flow can re-run without hitting
 * a duplicate-key 409).
 */
export interface PrismaModelInfo {
  idField: string | null;
  uniqueFields: string[];
  compositeUniques: string[][];
  fieldTypes: Record<string, string>;
  relations?: Array<{
    relationField: string;
    parentModel: string;
    fkFields: string[];
    referencedFields: string[];
  }>;
}

export interface PrismaModels {
  models: Record<string, PrismaModelInfo>;
  source: string | null;
}

export interface WebSocketEventParamSchema {
  paramName: string;
  typeName: string;
}

export interface WebSocketEvent {
  name: string;
  paramSchema: WebSocketEventParamSchema | null;
}

export interface WebSocketGateway {
  file: string;
  path: string;
  namespace: string | null;
  port: number | null;
  transport: 'ws' | 'socket.io' | 'graphql-ws' | string;
  events: WebSocketEvent[];
}

export interface WebSocketProfile {
  gateways: WebSocketGateway[];
  gatewayFiles: string[];
}

export interface GraphQLArg {
  name: string;
  type: string;
  required: boolean;
}

export interface GraphQLOperation {
  name: string;
  args: GraphQLArg[];
  returnType: string;
}

export interface GraphQLType {
  name: string;
  kind: string;
  fields: Array<{ name: string; type: string }>;
}

export interface GraphQLSchema {
  endpoint: string;
  source: string;
  types: GraphQLType[];
  queries: GraphQLOperation[];
  mutations: GraphQLOperation[];
  subscriptions: GraphQLOperation[];
  resolverFiles?: string[];
}

export interface CsrfDetection {
  detected: boolean;
  library: string | null;
  tokenHeaderName: string | null;
  tokenEndpoint: { method: string; path: string } | null;
  source: string | null;
}

export interface OAuthDetection {
  detected: boolean;
  flows: string[] | null;
  provider: string | null;
  authorizeUrl: string | null;
  tokenUrl: string | null;
  callbackUrl: string | null;
  source: string | null;
}

export interface MultiTenantDetection {
  detected: boolean;
  strategy: string | null;
  headerName: string | null;
  pathParam: string | null;
  tenantModels: string[] | null;
  source: string | null;
}

export interface OverlayRoute {
  tokens?: string[];
  mustNotContain?: string[];
  unauthBehavior?: 'redirect' | '401' | '200' | string;
}

export interface OverlayFlowStep {
  visit?: string;
  fillForm?: Record<string, unknown>;
  submit?: boolean;
  api?: { method: string; path: string; body?: unknown; bearer?: string };
  expectUrl?: string;
  expectStatus?: number;
  expectToken?: string;
  capture?: Record<string, string>;
  setAuth?: string;
  wait?: number;
  logout?: boolean;
}

export interface OverlayFlow {
  name: string;
  mutating?: boolean;
  steps: OverlayFlowStep[];
}

export interface ManifestOverlay {
  routes?: Record<string, OverlayRoute>;
  flows?: OverlayFlow[];
  ignore?: Array<{ path: string; reason: string }>;
  /**
   * Page-identity declarations: which frontend route IS the login page,
   * register page, post-login destination. Consumed by assertion-library
   * (browser redirect assertion) and flows-generator (authed-login-page,
   * post-register-landing flows). overlay-schema.json validates this block.
   */
  auth?: {
    loginPage?: string;
    registerPage?: string;
    postLoginDestination?: string;
  };
}

export interface CompiledEndpoint {
  method: string;
  path: string;
  sampleValid?: Record<string, unknown>;
  sampleInvalid?: Array<{ body: unknown; reason?: string }>;
  responses?: Record<string, unknown>;
  successStatus?: number;
}

export interface CompiledContract {
  version?: string;
  endpoints?: CompiledEndpoint[];
}

export interface MergedMatrix {
  raw: RawMatrix;
  overlay: ManifestOverlay | null;
  compiled: CompiledContract | null;
  pages: MatrixPage[];
  endpoints: MatrixEndpoint[];
  forms: MatrixForm[];
  middleware: MatrixMiddleware[];
  authDetection: AuthDetection;
  responseEnvelope: ResponseEnvelope;
  errorEnvelope: ErrorEnvelope | null;
  prismaModels: PrismaModels;
  cookieFlows: CookieFlow[];
  securitySchemes: Record<string, SecurityScheme>;
  bootPlan: BootPlan;
  scope: 'session' | 'full' | string;
  ignoredRoutes: Set<string>;
  /**
   * Map of page-role → frontend route, sourced from sibling
   * `page.identity.{ext}` files via detectors/page-identity.js.
   * Overlay `auth.loginPage` / `auth.registerPage` / `auth.postLoginDestination`
   * override these values (declared > derived).
   *
   * Example: { 'login-page': '/login', 'register-page': '/register',
   *            'post-login-destination': '/dashboard' }
   */
  pageRoles: Record<string, string>;
}

export interface LoadOptions {
  matrixPath?: string;
  overlayPath?: string;
  compiledPath?: string;
  scopeOverride?: 'session' | 'full' | string;
}

/**
 * Coerce old `{ wrapper: string }` and new `{ successWrapper: string[] }` shapes
 * into a canonical `ResponseEnvelope`. Also folds `errorEnvelope.wrapper` into
 * `errorWrapper` so consumers only look at one place.
 */
function coerceResponseEnvelope(
  raw: Record<string, unknown> | undefined | null,
  errorEnv: ErrorEnvelope | undefined | null,
): ResponseEnvelope {
  if (!raw) {
    return {
      successWrapper: null,
      errorWrapper: errorEnv?.wrapper?.length ? errorEnv.wrapper : null,
      source: null,
    };
  }

  let successWrapper: string[] | null = null;

  // New shape: successWrapper is already an array.
  if (Array.isArray(raw.successWrapper)) {
    successWrapper = raw.successWrapper.length > 0 ? (raw.successWrapper as string[]) : null;
  }
  // Old shape: wrapper is a single string key.
  else if (typeof raw.wrapper === 'string' && raw.wrapper) {
    successWrapper = [raw.wrapper];
  }

  let errorWrapper: string[] | null = null;

  // New shape on ResponseEnvelope itself.
  if (Array.isArray(raw.errorWrapper)) {
    errorWrapper = raw.errorWrapper.length > 0 ? (raw.errorWrapper as string[]) : null;
  }
  // Fall back to ErrorEnvelope.wrapper (commit 2b shape).
  else if (errorEnv?.wrapper?.length) {
    errorWrapper = errorEnv.wrapper;
  }

  return {
    successWrapper,
    errorWrapper,
    source: typeof raw.source === 'string' ? raw.source : null,
  };
}

export class MatrixLoadError extends Error {
  readonly code: 'MATRIX_MISSING' | 'MATRIX_INVALID' | 'MATRIX_EMPTY' | 'OVERLAY_INVALID' | 'COMPILED_INVALID';
  constructor(code: MatrixLoadError['code'], message: string) {
    super(message);
    this.code = code;
    this.name = 'MatrixLoadError';
  }
}

export function loadMatrix(options: LoadOptions = {}): MergedMatrix {
  const matrixPath = options.matrixPath ?? join(PROJECT_ROOT, '.claude', 'hooks', '.matrix.json');
  if (!existsSync(matrixPath)) {
    throw new MatrixLoadError(
      'MATRIX_MISSING',
      [
        `matrix not found at ${matrixPath}.`,
        '',
        'Regenerate it yourself — you do NOT need to end the session:',
        '',
        '    pnpm matrix:regen',
        '',
        'This runs derive-test-matrix.js (the same script the Stop hook runs)',
        'and writes .claude/hooks/.matrix.json. Then rerun the probe / close',
        'command.',
        '',
        'If `pnpm matrix:regen` itself fails with a TypeError, the merge-library',
        'bug described in plan 02 has regressed — escalate to the parent agent;',
        'do NOT patch .claude/hooks/* from inside a worktree (overwritten on',
        'every spawn).',
      ].join('\n'),
    );
  }
  let raw: RawMatrix;
  try {
    raw = JSON.parse(readFileSync(matrixPath, 'utf8')) as RawMatrix;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new MatrixLoadError('MATRIX_INVALID', `matrix at ${matrixPath} is not valid JSON: ${message}`);
  }

  if (!raw.bootPlan || typeof raw.bootPlan.driver !== 'string') {
    throw new MatrixLoadError('MATRIX_INVALID', 'matrix.bootPlan.driver is required');
  }

  const pages = Array.isArray(raw.pages) ? raw.pages : [];
  const endpoints = Array.isArray(raw.apiEndpoints) ? raw.apiEndpoints : [];
  const forms = Array.isArray(raw.forms) ? raw.forms : [];
  const middleware = Array.isArray(raw.middleware) ? raw.middleware : [];

  const overlayPath = options.overlayPath ?? join(PROJECT_ROOT, '.runtime-contract.overlay.json');
  let overlay: ManifestOverlay | null = null;
  if (existsSync(overlayPath)) {
    try {
      overlay = JSON.parse(readFileSync(overlayPath, 'utf8')) as ManifestOverlay;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new MatrixLoadError('OVERLAY_INVALID', `overlay at ${overlayPath} invalid: ${message}`);
    }
  }

  const compiledPath = options.compiledPath ?? join(PROJECT_ROOT, 'runtime-contract.compiled.json');
  let compiled: CompiledContract | null = null;
  if (existsSync(compiledPath)) {
    try {
      compiled = JSON.parse(readFileSync(compiledPath, 'utf8')) as CompiledContract;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new MatrixLoadError('COMPILED_INVALID', `compiled contract at ${compiledPath} invalid: ${message}`);
    }
  }

  const ignoredRoutes = new Set<string>();
  if (overlay?.ignore) {
    for (const entry of overlay.ignore) {
      if (entry && typeof entry.path === 'string') ignoredRoutes.add(entry.path);
    }
  }

  // Priority 0: overlay tokens / mustNotContain override or extend per-page fields.
  const mergedPages = pages.map((page) => {
    const overlayRoute = overlay?.routes?.[page.route];
    if (!overlayRoute) return page;
    return {
      ...page,
      tokens: overlayRoute.tokens && overlayRoute.tokens.length > 0 ? overlayRoute.tokens : page.tokens ?? [],
      mustNotContain: [...(page.mustNotContain ?? []), ...(overlayRoute.mustNotContain ?? [])],
      // If overlay pins unauthBehavior, we expose it via a synthetic guard override.
      // Consumers inspect overlay.routes[path].unauthBehavior directly when needed.
    };
  }).filter((page) => !ignoredRoutes.has(page.route));

  const mergedEndpoints = endpoints.map((endpoint) => {
    const compiledEntry = compiled?.endpoints?.find(
      (e) => e.method.toUpperCase() === endpoint.method.toUpperCase() && e.path === endpoint.path,
    );
    if (!compiledEntry) return endpoint;
    return {
      ...endpoint,
      successStatus: compiledEntry.successStatus ?? endpoint.successStatus,
    };
  }).filter((endpoint) => !ignoredRoutes.has(endpoint.path));

  const authDetection: AuthDetection = {
    apiPrefix: 'api/v1',
    ...raw.authDetection,
  };

  // Back-compat coercion: old matrices have { wrapper: string }, new ones have
  // { successWrapper: string[], errorWrapper: string[] }. Coerce both.
  const responseEnvelope: ResponseEnvelope = coerceResponseEnvelope(
    raw.responseEnvelope as Record<string, unknown> | undefined,
    raw.errorEnvelope,
  );

  const errorEnvelope: ErrorEnvelope | null = raw.errorEnvelope ?? null;

  const prismaModels: PrismaModels = raw.prismaModels
    ? {
        models: raw.prismaModels.models ?? {},
        source: raw.prismaModels.source ?? null,
      }
    : { models: {}, source: null };

  const securitySchemes: Record<string, SecurityScheme> = raw.securitySchemes ?? {};

  const cookieFlows: CookieFlow[] = Array.isArray(raw.cookieFlows) ? raw.cookieFlows : [];

  // Page-role map. Detected values come from sibling `page.identity.<ext>`
  // files; the overlay may override (declared > derived). Overlay keys map
  // 1:1 onto roles: loginPage→'login-page', registerPage→'register-page',
  // postLoginDestination→'post-login-destination'.
  const detectedPageRoles =
    raw.pageRoles && typeof raw.pageRoles === 'object' ? { ...(raw.pageRoles as Record<string, string>) } : {};
  if (overlay?.auth) {
    if (overlay.auth.loginPage) detectedPageRoles['login-page'] = overlay.auth.loginPage;
    if (overlay.auth.registerPage) detectedPageRoles['register-page'] = overlay.auth.registerPage;
    if (overlay.auth.postLoginDestination) {
      detectedPageRoles['post-login-destination'] = overlay.auth.postLoginDestination;
    }
  }
  const pageRoles: Record<string, string> = detectedPageRoles;

  const scope = options.scopeOverride ?? raw.scope ?? 'session';

  return {
    raw,
    overlay,
    compiled,
    pages: mergedPages,
    endpoints: mergedEndpoints,
    forms,
    middleware,
    authDetection,
    responseEnvelope,
    errorEnvelope,
    prismaModels,
    cookieFlows,
    securitySchemes,
    bootPlan: raw.bootPlan,
    scope,
    ignoredRoutes,
    pageRoles,
  };
}

/** Priority-0 helper: resolve expected success status for an endpoint. */
export function resolveSuccessStatus(endpoint: MatrixEndpoint, compiled: CompiledContract | null): number {
  if (typeof endpoint.successStatus === 'number') return endpoint.successStatus;
  const compiledEntry = compiled?.endpoints?.find(
    (e) => e.method.toUpperCase() === endpoint.method.toUpperCase() && e.path === endpoint.path,
  );
  if (compiledEntry?.successStatus) return compiledEntry.successStatus;
  const method = endpoint.method.toUpperCase();
  if (method === 'POST') return 201;
  if (method === 'DELETE') return 204;
  return 200;
}

/** Priority-0 helper: pull overlay anti-token list for a route. */
export function getRouteOverlay(overlay: ManifestOverlay | null, route: string): OverlayRoute | null {
  return overlay?.routes?.[route] ?? null;
}
