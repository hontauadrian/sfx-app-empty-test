/**
 * Plan 05 — Runtime Contract type definitions.
 *
 * Three layers:
 *   1. CompiledContract  — extracted from source code
 *   2. OverlayFile       — hand-maintained annotations
 *   3. MergedContract    — merge output consumed by http-smoke.ts
 */

export type AuthMode = 'public' | 'guarded' | 'unknown';
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
export type Framework =
  | 'next'
  | 'nuxt'
  | 'sveltekit'
  | 'remix'
  | 'astro'
  | 'nest'
  | 'express'
  | 'fastify'
  | 'trpc'
  | 'other';

export interface CompiledRoute {
  path: string;
  app: string;
  sourceFiles: string[];
  auth: AuthMode;
  metadataKeys: string[];
  framework: Framework;
}

export interface CompiledEndpoint {
  method: HttpMethod;
  path: string;
  app: string;
  sourceFile: string;
  auth: AuthMode;
  guard?: string;
  framework: Framework;
}

export interface CompiledContract {
  version: '1';
  generatedAt: string;
  routes: CompiledRoute[];
  endpoints: CompiledEndpoint[];
  diagnostics: Diagnostic[];
}

export type DecorationTokens =
  | { mustContain: string[]; mustNotContain?: string[] }
  | { mustContain?: string[]; mustNotContain: string[] };

export interface OverlayRouteDecoration {
  tokens?: DecorationTokens;
  successStatus?: number;
  notes?: string;
}

export interface OverlayEndpointDecoration {
  sampleValid?: unknown;
  sampleInvalid?: unknown[];
  successStatus?: number;
  notes?: string;
}

export interface OverlayIgnore {
  path: string;
  reason: string;
}

export interface OverlayFile {
  version: '1';
  coverage: 'partial' | 'complete';
  global?: {
    mustNotContain?: string[];
  };
  routes?: Record<string, OverlayRouteDecoration>;
  endpoints?: Record<string, OverlayEndpointDecoration>;
  ignore?: OverlayIgnore[];
}

export interface MergedRoute extends CompiledRoute {
  tokens?: DecorationTokens;
  successStatus?: number;
  notes?: string;
}

export interface MergedEndpoint extends CompiledEndpoint {
  sampleValid?: unknown;
  sampleInvalid?: unknown[];
  successStatus?: number;
  notes?: string;
}

export interface MergedContract {
  version: '1';
  generatedAt: string;
  coverage: 'partial' | 'complete';
  routes: MergedRoute[];
  endpoints: MergedEndpoint[];
  ignore: OverlayIgnore[];
  globalMustNotContain: string[];
  diagnostics: Diagnostic[];
  mergeErrors: Diagnostic[];
  source: {
    hasOverlay: boolean;
    compiledRoutes: number;
    compiledEndpoints: number;
    overlayRouteKeys: number;
    overlayEndpointKeys: number;
  };
}

export type DiagnosticLevel = 'info' | 'warn' | 'error';
export type MergeErrorCode =
  | 'UNKNOWN_ROUTE_KEY'
  | 'UNKNOWN_ENDPOINT_KEY'
  | 'IGNORE_REASON_MISSING'
  | 'UNCOVERED_ROUTE'
  | 'UNCOVERED_ENDPOINT'
  | 'OVERLAY_PARSE_ERROR'
  | 'OVERLAY_SCHEMA_INVALID'
  | 'OVERLAY_ONLY_COVERAGE_INCOMPLETE'
  | 'OVERLAY_FLOWS_RETIRED'
  | 'OVERLAY_IGNORE_COVERS_MATRIX_PATH';

export interface Diagnostic {
  level: DiagnosticLevel;
  code: string;
  message: string;
  path?: string;
}

export type CookieRole =
  | 'refresh-token'
  | 'session'
  | 'csrf-double-submit'
  | 'oauth-state'
  | 'tenant-scope'
  | 'locale'
  | 'theme'
  | 'feature-flag'
  | 'custom';

export interface CookieFlowOperationRef {
  operationId: string;
  path: string;
  method: string;
  /**
   * Static example body extracted from OpenAPI
   * requestBody.content['application/json'].schema.example,
   * requestBody.content['application/json'].example, or
   * requestBody.content['application/json'].examples[*].value.
   * null when declared requestBody exists but no example is provided.
   * undefined when no requestBody is applicable (GET issuers, etc.).
   * Never synthesized.
   */
  requestBodyExample?: unknown | null;
}

export interface CookieValueSubstitution {
  cookieName: string;
  target: {
    in: 'header' | 'query' | 'body';
    name: string;
  };
}

export interface CookieFlowConsumerRef extends CookieFlowOperationRef {
  headerEcho?: string;
  valueSubstitutions?: CookieValueSubstitution[];
}

export interface CookieFlowAttrs {
  httpOnly?: boolean | string;
  secure?: boolean | string;
  sameSite?: 'Strict' | 'Lax' | 'None' | string;
  path?: string;
  maxAge?: number;
  domain?: string;
}

export interface CookieFlowDiagnostic {
  code: string;
  level: DiagnosticLevel;
  details: Record<string, unknown>;
}

export interface CookieFlow {
  name: string;
  role: CookieRole | null;
  issuers: CookieFlowOperationRef[];
  consumers: CookieFlowConsumerRef[];
  clearers: CookieFlowOperationRef[];
  rotators: CookieFlowOperationRef[];
  attrs: CookieFlowAttrs;
  securitySchemeRef?: string | null;
  diagnostics: CookieFlowDiagnostic[];
}
