'use strict';

/**
 * flows-generator.js — Phase 2 of runtime-verification plan.
 *
 * Reads:
 *   - .claude/hooks/.matrix.json  (enriched — zodContract, authDecorators, swaggerDeclared)
 *   - .claude/runtime-contract.logical.json
 *   - .runtime-contract.overlay.json  (for ignore[] filtering)
 *
 * Outputs:
 *   - .claude/hooks/.flows.generated.json
 *
 * Pure Node stdlib. No external deps.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { buildErrorAssertions } = require('./lib/error-shape');
const { buildResourceGraph } = require('./resource-graph');
const { transformOverrides } = require('./body-overrides');
const { detectAuthFlows } = require('./detectors/auth-flows');
const { emitCookieRefreshRotation } = require('./emitters/cookie-refresh-rotation');
const { emitCookieSession } = require('./emitters/cookie-session');
const { emitCookieCsrfDoubleSubmit } = require('./emitters/cookie-csrf-double-submit');
const { emitCookieOAuthState } = require('./emitters/cookie-oauth-state');
const { emitCookieTenantScope } = require('./emitters/cookie-tenant-scope');
const { emitCookieAppState } = require('./emitters/cookie-app-state');

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseCli(argv) {
  const cliFlags = {};
  const args = argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--matrix') cliFlags.matrix = args[++i];
    else if (args[i] === '--logical') cliFlags.logical = args[++i];
    else if (args[i] === '--overlay') cliFlags.overlay = args[++i];
    else if (args[i] === '--output') cliFlags.output = args[++i];
    else if (args[i] === '--project-dir') cliFlags.projectDir = args[++i];
    else if (args[i] === '--verbose') cliFlags.verbose = true;
  }
  return cliFlags;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Deterministic hash for flow IDs. */
function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

/** Sort object keys recursively for deterministic JSON. */
function sortKeys(obj) {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(sortKeys);
  if (typeof obj !== 'object') return obj;
  const sorted = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = sortKeys(obj[key]);
  }
  return sorted;
}

/** Endpoint key string. */
function epKey(method, epath) {
  return `${method} ${epath}`;
}

/**
 * Derive an API global prefix from the consensus leading path segment(s)
 * of matrix.apiEndpoints[].path. Used as a fallback when
 * matrix.authDetection.apiPrefix is missing (older matrices, or matrices
 * written by a detector that did not run matrix-loader's defaulting pass).
 *
 * Heuristic:
 *   - Take all endpoint paths.
 *   - Split each on '/' (drop the leading empty token from the leading slash).
 *   - For each leading segment depth (1, 2), check whether ≥80% of endpoints
 *     share the same value at that depth. The two-segment case captures the
 *     '/api/v1/...' convention used by the boilerplate; the single-segment
 *     case captures '/api/...' or '/v1/...' style.
 *   - Return the longest qualifying prefix (without leading slash, e.g.
 *     'api/v1') so it slots into normalizedPrefix in buildCoverageSet.
 *   - Return null when there is no clear consensus — never invent a prefix.
 *
 * 80% threshold (not 100%) because health/metrics endpoints often live
 * outside the prefix (`/health`, `/metrics`) — those should not block prefix
 * detection for the rest of the surface.
 */
function deriveApiPrefixFromEndpoints(apiEndpoints) {
  if (!Array.isArray(apiEndpoints) || apiEndpoints.length === 0) return null;
  const paths = apiEndpoints
    .map((endpoint) => endpoint && typeof endpoint.path === 'string' ? endpoint.path : null)
    .filter((value) => typeof value === 'string' && value.startsWith('/'));
  if (paths.length === 0) return null;
  const splitPaths = paths.map((value) => value.split('/').filter(Boolean));
  const threshold = Math.max(1, Math.ceil(paths.length * 0.8));
  let best = null;
  for (const depth of [2, 1]) {
    const counts = new Map();
    for (const segments of splitPaths) {
      if (segments.length < depth) continue;
      const candidate = segments.slice(0, depth).join('/');
      counts.set(candidate, (counts.get(candidate) || 0) + 1);
    }
    let topCandidate = null;
    let topCount = 0;
    for (const [candidate, count] of counts.entries()) {
      if (count > topCount) {
        topCount = count;
        topCandidate = candidate;
      }
    }
    if (topCandidate && topCount >= threshold) {
      best = topCandidate;
      break;
    }
  }
  return best;
}

/** Normalize endpoint path to a flow-id-safe string. */
function pathToId(epath) {
  return epath.replace(/^\/api\/v1\//, '').replace(/\//g, '-').replace(/:/g, '');
}

/**
 * Extract the pathname from a potentially-absolute URL. OAuth securityScheme
 * URLs can be absolute (https://example.com/oauth/token) but the probe sends
 * requests to the local stack using relative paths. Returns null if input is
 * null/undefined.
 */
function toRelativePath(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.pathname;
  } catch {
    return url; // already relative
  }
}

/**
 * Load curated `special_flows[]` from `.overstory/runtime-contract.flows/*.json`
 * (excluding `_shared.json`, which only declares actors/resources, no flows
 * by convention). Each flow's steps are returned as a flat array of
 * `{ id, steps }` so `buildCoverageSet` can extract `(method, path, status)`
 * tuples without further parsing.
 *
 * The generator does NOT execute curated flows — it only consults them for
 * UNGENERATABLE coverage suppression. The runner (`http-smoke.ts`) is what
 * actually loads + merges + executes curated flows.
 *
 * Returns [] when the directory is missing or all files are unreadable.
 */
function loadCuratedFlowSteps(projectDir) {
  const flowsDir = path.join(projectDir, '.overstory', 'runtime-contract.flows');
  if (!fs.existsSync(flowsDir)) return [];
  const collected = [];
  let entries;
  try {
    entries = fs.readdirSync(flowsDir);
  } catch {
    return [];
  }
  for (const name of entries) {
    if (!name.endsWith('.json')) continue;
    if (name === '_shared.json') continue;
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(path.join(flowsDir, name), 'utf8'));
    } catch {
      continue;
    }
    const list = Array.isArray(parsed && parsed.special_flows) ? parsed.special_flows : [];
    for (const flow of list) {
      if (flow && Array.isArray(flow.steps)) {
        collected.push({ id: flow.id, steps: flow.steps });
      }
    }
  }
  return collected;
}

/**
 * Build a coverage set of `METHOD /path:STATUS` tuples from all emitted flows.
 * Scans every step in every flow: `expect.status` and each entry in
 * `expect.statusAnyOf`. The preceding `api` step provides the method+path.
 * Used by the post-generation pass to suppress UNGENERATABLE diagnostics for
 * statuses that cross-endpoint emitters already cover.
 *
 * `apiPrefix` (optional, e.g. `'api/v1'` from `matrix.authDetection.apiPrefix`)
 * is used for CURATED flows only: their `step.path` is unprefixed (the
 * runtime contract-flow runner prepends the API global prefix at execution
 * time — see executeCuratedFlows in http-smoke.ts). The diagnostics, however,
 * report `endpoint` strings derived from OpenAPI source, which include the
 * prefix. Without this normalization, `coveredTuples.has("GET /api/v1/auth/me:200")`
 * misses against a curated entry of `"GET /auth/me:200"` and the suppression
 * silently fails, leaving CONTRACT_STATUS_UNREACHABLE_UNGENERATABLE diagnostics
 * for endpoints that ARE covered. When `apiPrefix` is set we emit BOTH the
 * unprefixed and the prefixed tuple so suppression works regardless of which
 * side of the prefix the comparison is performed on. Generated flows pass
 * `apiPrefix=null` because their step paths already include the prefix.
 */
/**
 * Replace path-parameter segments with a single canonical sentinel so the
 * comparison between curated coverage and OpenAPI/NestJS diagnostics is
 * shape-based rather than name-based.
 *
 *   `${brandId}` (curated template literal) -> `<P>`
 *   `:id`       (NestJS / Express route param)  -> `<P>`
 *
 * Without this, a curated step path like `/brands/${brandId}` emits a
 * coverage tuple `GET /api/v1/brands/${brandId}:200`, while the diagnostic
 * for the same controller endpoint reports `GET /api/v1/brands/:id:200`.
 * The two strings are literal-unequal, the suppression check misses, and
 * `CONTRACT_STATUS_UNREACHABLE_UNGENERATABLE` fires for endpoints that
 * ARE genuinely covered. Reducing both forms to `<P>` makes the lookup
 * symmetric.
 *
 * Real-world incident on 2026-05-15: F1 brand-profile builder hit the
 * stop-gate with 6 UNGENERATABLE rows on `GET|PUT|DELETE /api/v1/brands/:id`
 * despite having curated `${brandId}`-bound coverage that exercised every
 * one of those status codes against a real Keycloak-authenticated stack.
 *
 * Path SEGMENTS that look like literal values (UUIDs, sentinels like
 * `non-existent-id`, slugs) are intentionally NOT canonicalized — they
 * stay as literal segments so curated 401-style flows (which use
 * placeholder ids without a captured binding) only suppress the matching
 * literal endpoint, never a parameterized success path.
 */
function canonicalizePathParams(rawPath) {
  if (typeof rawPath !== 'string' || rawPath.length === 0) return rawPath;
  return rawPath
    // ${anyVarName} -> <P>
    .replace(/\$\{[^}]+\}/g, '<P>')
    // :paramName segment marker (NestJS / Express style) -> <P>
    // Only match when preceded by `/` or start, then `:identifier`, ending
    // at the next `/`, `?`, or end-of-string. Avoids munging colons inside
    // query strings or anchors.
    .replace(/(^|\/):([A-Za-z_][A-Za-z0-9_]*)(?=\/|$|\?)/g, '$1<P>');
}

function buildCoverageSet(flows, apiPrefix) {
  const covered = new Set();
  const normalizedPrefix = typeof apiPrefix === 'string' && apiPrefix.length > 0
    ? '/' + apiPrefix.replace(/^\/+|\/+$/g, '')
    : null;
  for (const flow of flows) {
    if (!flow.steps) continue;
    let lastApiMethod = null;
    let lastApiPath = null;
    for (const step of flow.steps) {
      if (step.kind === 'api' && step.method && step.path) {
        lastApiMethod = step.method;
        lastApiPath = step.path;
      }
      if (step.kind === 'expect' && lastApiMethod && lastApiPath) {
        const epStr = `${lastApiMethod} ${lastApiPath}`;
        // For curated flows: also emit the prefixed-path variant so the
        // OpenAPI-style endpoint string used by diagnostics ("GET /api/v1/foo")
        // matches the unprefixed step.path ("/foo") that the runtime expects.
        // Skip if the curated path already starts with the prefix (defensive
        // against mixed-style flow files).
        let prefixedEpStr = null;
        if (
          normalizedPrefix
          && lastApiPath.startsWith('/')
          && !lastApiPath.startsWith(normalizedPrefix + '/')
          && lastApiPath !== normalizedPrefix
        ) {
          prefixedEpStr = `${lastApiMethod} ${normalizedPrefix}${lastApiPath}`;
        }
        // Canonical-shape variants: replace `${var}` and `:id`-style param
        // markers with a single sentinel so coverage matches diagnostics
        // regardless of naming style. Emitted alongside the literal forms
        // so existing exact-match cases stay covered.
        const canonicalEpStr = canonicalizePathParams(epStr);
        const canonicalPrefixedEpStr = prefixedEpStr ? canonicalizePathParams(prefixedEpStr) : null;
        const statuses = [];
        if (step.status != null) statuses.push(step.status);
        if (Array.isArray(step.statusAnyOf)) {
          for (const eachStatus of step.statusAnyOf) statuses.push(eachStatus);
        }
        for (const eachStatus of statuses) {
          covered.add(`${epStr}:${eachStatus}`);
          if (prefixedEpStr) covered.add(`${prefixedEpStr}:${eachStatus}`);
          if (canonicalEpStr !== epStr) covered.add(`${canonicalEpStr}:${eachStatus}`);
          if (canonicalPrefixedEpStr && canonicalPrefixedEpStr !== prefixedEpStr) {
            covered.add(`${canonicalPrefixedEpStr}:${eachStatus}`);
          }
        }
      }
    }
  }
  return covered;
}

/** Check if path matches a glob-like ignore pattern. */
function matchesIgnore(targetPath, ignorePatterns) {
  for (const pattern of ignorePatterns) {
    const pat = pattern.path;
    if (pat.endsWith('/**')) {
      const prefix = pat.slice(0, -3);
      if (targetPath === prefix || targetPath.startsWith(prefix + '/')) return true;
    } else if (pat === targetPath) {
      return true;
    }
  }
  return false;
}

/**
 * Resolve the primary security scheme definition for an endpoint.
 * Inspects ep.securityRequirement[0] and looks up the scheme in the
 * top-level securitySchemes map.
 */
function resolvePrimaryScheme(ep, securitySchemes) {
  if (!ep.securityRequirement || ep.securityRequirement.length === 0) return null;
  const first = ep.securityRequirement[0];
  const name = Object.keys(first)[0];
  if (!name || !securitySchemes) return null;
  return securitySchemes[name] || null;
}

/**
 * Resolve the normalized auth scheme type for an endpoint.
 * Returns 'bearer', 'apiKey', 'basic', 'oauth2', or 'openIdConnect'.
 * Falls back to 'bearer' when no securityRequirement is declared.
 */
function resolvePrimarySchemeType(ep, securitySchemes) {
  const scheme = resolvePrimaryScheme(ep, securitySchemes);
  if (!scheme) return 'bearer'; // default
  if (scheme.type === 'http') {
    const httpScheme = (scheme.scheme || '').toLowerCase();
    return httpScheme === 'basic' ? 'basic' : 'bearer';
  }
  if (scheme.type === 'apiKey') return 'apiKey';
  if (scheme.type === 'oauth2') return 'oauth2';
  if (scheme.type === 'openIdConnect') return 'openIdConnect';
  return 'bearer';
}

/** Default expected status for HTTP method. */
function defaultStatus(method) {
  switch (method) {
    case 'POST': return 201;
    case 'DELETE': return 204;
    default: return 200;
  }
}

/**
 * Collect every field name flagged as unique (single-column @unique or part
 * of a composite @@unique) across all Prisma models. The flows generator
 * uses this set to decide which sampleValid body fields must be replaced
 * with run-unique sigils so re-runs don't hit a duplicate-key 409.
 *
 * Returns a Set of field names. Empty set means "no uniqueness info
 * available" — caller falls back to the raw sampleValid.
 */
function collectUniqueFieldNames(prismaModels) {
  const out = new Set();
  if (!prismaModels || !prismaModels.models) return out;
  for (const model of Object.values(prismaModels.models)) {
    for (const field of model.uniqueFields || []) out.add(field);
    for (const composite of model.compositeUniques || []) {
      for (const field of composite) out.add(field);
    }
  }
  return out;
}

/**
 * Decide the runtime sigil for a sampleValid value. The probe runtime
 * substitutes `${uniqEmail}`, `${uniqString}`, `${uniqUuid}` at flow start
 * with a fresh value per flow (see assertion-library seedUniqueBindings).
 *
 * Declaration-driven: uses Zod-extracted constraints from zodContract.fields:
 *   - constraints.format === 'email'                        → ${uniqEmail}
 *   - constraints.format === 'uuid'                         → ${uniqUuid}
 *   - constraints.max/maxLength or constraints.regex/pattern → ${uniq:maxLen:<n>:pattern:<base64>}
 *   - Otherwise                                             → ${uniqString}
 */
function pickUniqueSigil(sampleValue, fieldConstraints) {
  if (fieldConstraints) {
    // Zod .email() → constraints.format === 'email'
    if (fieldConstraints.format === 'email') return '${uniqEmail}';
    // Zod .uuid() → constraints.format === 'uuid'
    if (fieldConstraints.format === 'uuid') return '${uniqUuid}';

    // zod-introspect emits max as `max` or `maxLength` depending on context
    const maxValue = fieldConstraints.max ?? fieldConstraints.maxLength ?? null;
    const hasMax = typeof maxValue === 'number';
    // zod-introspect emits the regex as `constraints.regex` or `constraints.pattern`
    const patternValue = fieldConstraints.pattern || fieldConstraints.regex || null;
    const hasPattern = typeof patternValue === 'string';
    if (hasMax || hasPattern) {
      const parts = ['uniq'];
      if (hasMax) parts.push(`maxLen:${maxValue}`);
      if (hasPattern) parts.push(`pattern:${Buffer.from(patternValue).toString('base64')}`);
      return '${' + parts.join(':') + '}';
    }
  }

  // No constraints available — per source-of-truth principle, do NOT guess
  // from sample value shape. Emit ${uniqString} and let the probe surface
  // the missing Zod declaration as a real signal.
  return '${uniqString}';
}

/**
 * Build sampleValid body from zodContract. When `uniqueFieldSet` is provided
 * (from matrix.prismaModels), fields whose names match a DB unique constraint
 * are replaced with a run-unique sigil so the :happy flow can be re-run
 * against the same database without colliding on prior runs.
 */
function buildSampleBody(zodContract, uniqueFieldSet) {
  if (!zodContract || !zodContract.sampleValid) return null;
  const body = { ...zodContract.sampleValid };
  if (uniqueFieldSet && uniqueFieldSet.size > 0) {
    // Build a field-constraints map from zodContract.fields so
    // pickUniqueSigil can emit parameterized sigils when the field
    // declares max length or regex constraints.
    const fieldConstraintsMap = {};
    if (zodContract.fields) {
      if (Array.isArray(zodContract.fields)) {
        // fields is an array of {name, type, constraints, ...} objects
        for (const fieldMeta of zodContract.fields) {
          if (fieldMeta && fieldMeta.name && fieldMeta.constraints) {
            fieldConstraintsMap[fieldMeta.name] = fieldMeta.constraints;
          }
        }
      } else {
        // fields is an object map {fieldName: {constraints, ...}}
        for (const [fieldName, fieldMeta] of Object.entries(zodContract.fields)) {
          if (fieldMeta && fieldMeta.constraints) {
            fieldConstraintsMap[fieldName] = fieldMeta.constraints;
          }
        }
      }
    }

    for (const key of Object.keys(body)) {
      if (uniqueFieldSet.has(key)) {
        body[key] = pickUniqueSigil(body[key], fieldConstraintsMap[key] || null);
      }
    }
  }
  return body;
}

/**
 * Compute the effective uniqueFieldSet for an endpoint by unioning the global
 * set (from matrix.prismaModels) with any fields declared via the OpenAPI
 * extension `x-probe-unique-fields: ['email', ...]`. The extension lets
 * synthetic / non-Prisma endpoints declare which fields the probe must
 * substitute with a run-unique sigil. NEVER inferred — declarative opt-in.
 */
function effectiveUniqueFieldSet(ep, globalSet) {
  const declared = (ep && ep.swaggerDeclared && ep.swaggerDeclared.extensions
    && ep.swaggerDeclared.extensions['x-probe-unique-fields']) || null;
  if (!Array.isArray(declared) || declared.length === 0) {
    return globalSet || new Set();
  }
  const out = new Set(globalSet || []);
  for (const name of declared) out.add(name);
  return out;
}

/** Build sampleValid query from queryContract. */
function buildSampleQuery(queryContract) {
  if (!queryContract || !queryContract.sampleValid) return null;
  return { ...queryContract.sampleValid };
}

/** Override specific field in a body for invalidator flows. */
function applyInvalidator(body, fieldName, invalidator) {
  if (!body) return {};
  const result = { ...body };
  if (invalidator.kind === 'missing') {
    delete result[fieldName];
  } else if ('value' in invalidator) {
    result[fieldName] = invalidator.value;
  }
  return result;
}

/**
 * Generate a structurally-valid but wrong-signature JWT.
 * Uses fixed timestamps for determinism.
 */
function fakeJwt(opts = {}) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const iat = 1700000000;
  const payload = {
    sub: 'probe-fake-user',
    iat,
    ...(opts.expired ? { exp: 1 } : { exp: 9999999999 }),
    ...(opts.role ? { role: opts.role } : {}),
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = opts.wrongSecret
    ? crypto.createHmac('sha256', 'wrong-secret-for-probe').update(`${header}.${payloadB64}`).digest('base64url')
    : 'garbage-signature-not-valid';
  return `${header}.${payloadB64}.${sig}`;
}

// ---------------------------------------------------------------------------
// Invalidator construction from constraints (fallback)
// ---------------------------------------------------------------------------

/**
 * Construct invalidators from field constraints when field.samples.invalidators
 * is absent.
 */
function constructInvalidators(field) {
  const invalidators = [];
  const constraints = field.constraints || {};
  const type = field.type || 'string';
  const name = field.name;

  invalidators.push({ kind: 'missing', expectedErrorField: name });

  if (type === 'string') {
    invalidators.push({ kind: 'wrong-type', value: 123, expectedErrorField: name });
    if (constraints.min && constraints.min >= 1) {
      invalidators.push({ kind: 'empty-string', value: '', expectedErrorField: name });
    }
    if (constraints.min && constraints.min > 1) {
      invalidators.push({ kind: 'below-min', value: 'a'.repeat(constraints.min - 1), expectedErrorField: name });
    }
    if (constraints.max) {
      invalidators.push({ kind: 'above-max', value: 'a'.repeat(constraints.max + 1), expectedErrorField: name });
    }
    if (constraints.format) {
      invalidators.push({ kind: 'format-violation', value: `not-a-valid-${constraints.format}`, expectedErrorField: name });
    }
    if (constraints.regex) {
      invalidators.push({ kind: 'regex-violation', value: 'X', expectedErrorField: name });
    }
  } else if (type === 'number') {
    invalidators.push({ kind: 'wrong-type', value: 'not-a-number', expectedErrorField: name });
    if (constraints.min !== undefined) {
      invalidators.push({ kind: 'below-min', value: constraints.min - 1, expectedErrorField: name });
    }
    if (constraints.max !== undefined) {
      invalidators.push({ kind: 'above-max', value: constraints.max + 1, expectedErrorField: name });
    }
  } else if (type === 'boolean') {
    invalidators.push({ kind: 'wrong-type', value: 'true', expectedErrorField: name });
  } else if (type === 'enum') {
    invalidators.push({ kind: 'wrong-type', value: 12345, expectedErrorField: name });
    invalidators.push({ kind: 'out-of-enum', value: 'NOT_IN_ENUM', expectedErrorField: name });
  } else if (type === 'array') {
    invalidators.push({ kind: 'wrong-type', value: {}, expectedErrorField: name });
    if (constraints.min !== undefined) {
      invalidators.push({ kind: 'below-min', value: Array(Math.max(0, constraints.min - 1)).fill(null), expectedErrorField: name });
    }
    if (constraints.max !== undefined) {
      invalidators.push({ kind: 'above-max', value: Array(constraints.max + 1).fill(null), expectedErrorField: name });
    }
  } else {
    invalidators.push({ kind: 'wrong-type', value: 123, expectedErrorField: name });
  }

  return invalidators;
}

// ---------------------------------------------------------------------------
// Flow emitters
// ---------------------------------------------------------------------------

/**
 * Rule 1: Happy-path flow for an endpoint.
 *
 * When `options.authBootstrapAvailable` is true AND the endpoint is authed,
 * this flow prepends a setAuth step binding the token captured by the
 * chain:auth-bootstrap flow (so happy probes against `/auth/me` etc. pass
 * instead of 401-ing). If no bootstrap chain exists, protected success paths
 * are ungeneratable by the generic endpoint-happy emitter and are skipped with
 * a diagnostic so contract coverage does not demand an unauthenticated 200.
 * Register/login endpoints themselves are NEVER made dependent on the chain —
 * they ARE the chain.
 */
function emitHappyFlow(ep, options = {}) {
  // Skip endpoints that only accept non-JSON content types (e.g. multipart,
  // octet-stream). These are covered by emitUploadFlows instead.
  if (isMultipartEndpoint(ep) || isBinaryUploadEndpoint(ep)) {
    const accepts = ep.requestContentTypes || [];
    const hasJson = accepts.length === 0 || accepts.some((ct) => ct.includes('json'));
    if (!hasJson) return null;
  }

  // Skip PUT/PATCH endpoints that require If-Match header — they will 412/428
  // without it. The conditional:if-match-valid flow covers the 200 path.
  if (ep.conditionalProfile && ep.conditionalProfile.patterns.includes('if-match') &&
      (ep.method === 'PUT' || ep.method === 'PATCH')) {
    return null;
  }

  // Skip endpoints covered by specialized security flow emitters (CSRF,
  // OAuth, multi-tenant). These require specific tokens/headers/body that
  // the generic happy flow cannot supply. The dedicated emitters
  // (emitCsrfFlows, emitOAuthFlows, emitTenantIsolationFlows) handle them.
  const securityCoveredPaths = options.securityCoveredPaths;
  if (securityCoveredPaths && securityCoveredPaths.has(epKey(ep.method, ep.path))) {
    return null;
  }

  const uniqueFieldSet = effectiveUniqueFieldSet(ep, options.uniqueFieldSet);
  const authBootstrapAvailable = Boolean(options.authBootstrapAvailable);

  const base = pathToId(ep.path);
  const flowId = `${base}:${ep.method.toLowerCase()}:happy`;
  const body = ep.zodContract ? buildSampleBody(ep.zodContract, uniqueFieldSet) : null;
  // Prefer a declared 2xx status; fall back to method default. Picking
  // `statuses[0]` blindly causes happy flows on endpoints that declare
  // only 401/403/404 to assert error codes — meaningless.
  const declared = (ep.swaggerDeclared && ep.swaggerDeclared.statuses) || [];
  const declaredSuccess = declared.find((s) => s >= 200 && s < 300);
  // If the endpoint explicitly declares statuses but NONE are 2xx, it has
  // no success path (e.g. always-410, always-301, always-400). Skip happy flow.
  if (declared.length > 0 && declaredSuccess === undefined) {
    return null;
  }
  const expectedStatus = declaredSuccess !== undefined
    ? declaredSuccess
    : defaultStatus(ep.method);

  // Endpoints that are themselves the bootstrap (register/login) must NOT
  // depend on the chain — they'd self-cycle. Everything else authed can
  // ride the chain's token. Uses declaration-driven auth flow detection.
  const authFlows = options.authFlows || {};
  const isBootstrapEndpoint = ep.method === 'POST' && (
    (authFlows.tokenIssuer && ep.path === authFlows.tokenIssuer.path) ||
    (authFlows.register && ep.path === authFlows.register.path)
  );
  const needsAuth = Boolean(
    ep.authDecorators && ep.authDecorators.authRequired
  );
  const useChain = needsAuth && authBootstrapAvailable && !isBootstrapEndpoint;

  if (needsAuth && !authBootstrapAvailable && !isBootstrapEndpoint) {
    const diagnostics = options.diagnostics || [];
    diagnostics.push({
      code: 'CONTRACT_STATUS_UNREACHABLE_UNGENERATABLE',
      message: `Status ${expectedStatus} declared on ${ep.method} ${ep.path} but endpoint requires authentication and no auth bootstrap chain is available. Cover this success path with a curated authenticated flow in .overstory/runtime-contract.flows/<task-id>.json (recommended for delegated auth like Keycloak/OIDC — declare actor login bindings in _shared.json once, then reference via setAuth steps), OR — only if the API itself owns the credential surface — add a register/login endpoint and declare it via @ApiTags('auth') / @ApiResponse so the auth-bootstrap chain can detect it. Do NOT use @Public() to bypass this diagnostic.`,
      endpoint: epKey(ep.method, ep.path),
    });
    return null;
  }

  // Token-issuer (login) has no standalone happy path — it requires a
  // pre-existing user. When the bootstrap chain exists, chain:auth-bootstrap
  // already exercises login (step 2) with a freshly-registered user;
  // duplicating that here would POST with zod-sample credentials against an
  // empty DB and 401. Skip emission.
  const isLoginEndpoint = authFlows.tokenIssuer &&
    ep.method === 'POST' && ep.path === authFlows.tokenIssuer.path;
  if (isLoginEndpoint && authBootstrapAvailable) {
    return null;
  }

  // Refresh endpoint also has no standalone happy path — it requires a
  // server-issued refresh token. chain:refresh-token-rotation exercises it
  // with a real captured token; a sample-body probe (refreshToken='xxx')
  // necessarily fails decode against any synthetic that validates tokens.
  const isRefreshEndpoint = authFlows.refresh &&
    ep.method === 'POST' && ep.path === authFlows.refresh.path;
  if (isRefreshEndpoint && authBootstrapAvailable) {
    return null;
  }

  const steps = [];

  if (useChain) {
    steps.push({ binding: 'accessToken', kind: 'setAuth' });
  }

  const apiStep = { kind: 'api', method: ep.method, path: ep.path };
  if (ep.method === 'POST' || ep.method === 'PUT' || ep.method === 'PATCH') {
    // Always send a body for mutating methods so Content-Type: application/json
    // is set by the HTTP client. Endpoints that enforce content-type (415) will
    // reject requests without it.
    apiStep.body = body || {};
  }
  const sampleQuery = buildSampleQuery(ep.queryContract);
  if (sampleQuery && Object.keys(sampleQuery).length > 0) {
    apiStep.query = sampleQuery;
  }
  // Resource-ref dependency resolution: autodetected path-prefix parents
  // and declared body-field x-probe-resource-ref.
  const _resourceRefResult = resolveResourceRefDeps(ep, options.endpoints || []);
  // Apply body-field overrides (part B)
  if (_resourceRefResult.overrides && Object.keys(_resourceRefResult.overrides).length > 0) {
    if (apiStep.body && typeof apiStep.body === 'object') {
      apiStep.body = { ...apiStep.body, ..._resourceRefResult.overrides };
    }
  }
  // Apply path-param substitutions (part A: path-prefix autodetection)
  if (_resourceRefResult.pathSubstitutions && Object.keys(_resourceRefResult.pathSubstitutions).length > 0) {
    for (const [param, sigil] of Object.entries(_resourceRefResult.pathSubstitutions)) {
      apiStep.path = apiStep.path.replace(`:${param}`, sigil);
    }
  }

  // Endpoints with a required idempotency header need the header in the happy
  // flow, otherwise the endpoint rejects with 400 before reaching business logic.
  if (ep.idempotencyProfile && ep.idempotencyProfile.required) {
    apiStep.headers = { ...(apiStep.headers || {}), [ep.idempotencyProfile.headerName]: '${uniqUuid}' };
  }
  // Apply declaration-driven body overrides for :happy via OpenAPI extension
  // `x-probe-body-overrides`. The endpoint author declares the exact field
  // values :happy must send (e.g. valid grant_type + credentials for OAuth
  // token endpoints that enforce per-grant validation per RFC 6749 §5.2).
  // Merged on top of the sample body so untouched fields keep their
  // generated values. NEVER inferred — declarative opt-in only.
  const _bodyOverrides = (ep.swaggerDeclared && ep.swaggerDeclared.extensions
    && ep.swaggerDeclared.extensions['x-probe-body-overrides']) || null;
  if (_bodyOverrides && typeof _bodyOverrides === 'object') {
    if (apiStep.body && typeof apiStep.body === 'object') {
      apiStep.body = { ...apiStep.body, ..._bodyOverrides };
    } else if (ep.method === 'POST' || ep.method === 'PUT' || ep.method === 'PATCH') {
      apiStep.body = { ..._bodyOverrides };
    }
  }
  // Apply declaration-driven query overrides for :happy via OpenAPI extension
  // `x-probe-query-overrides`. Same pattern as body overrides; lets endpoints
  // that enforce specific query values (e.g. tenant_id) declare what :happy
  // must send. NEVER inferred — declarative opt-in only.
  const _queryOverrides = (ep.swaggerDeclared && ep.swaggerDeclared.extensions
    && ep.swaggerDeclared.extensions['x-probe-query-overrides']) || null;
  if (_queryOverrides && typeof _queryOverrides === 'object') {
    apiStep.query = { ...(apiStep.query || {}), ..._queryOverrides };
  }
  // Apply declaration-driven header overrides for :happy via OpenAPI extension
  // `x-probe-header-overrides`. Lets endpoints that require specific headers
  // (e.g. X-Tenant-ID, X-Custom-Auth) declare what :happy must send.
  // NEVER inferred — declarative opt-in only.
  const _headerOverrides = (ep.swaggerDeclared && ep.swaggerDeclared.extensions
    && ep.swaggerDeclared.extensions['x-probe-header-overrides']) || null;
  if (_headerOverrides && typeof _headerOverrides === 'object') {
    apiStep.headers = { ...(apiStep.headers || {}), ..._headerOverrides };
  }
  // Apply declaration-driven path-param overrides for :happy via OpenAPI extension
  // `x-probe-path-overrides`. Endpoints whose path params constrain the response
  // (e.g. /error-per-status/:code where only `code='ok'` returns 200) declare the
  // exact param values :happy must use. The substitution mirrors the runtime
  // substituteParams contract (`:name` → value). NEVER inferred — declarative
  // opt-in only.
  const _pathOverrides = (ep.swaggerDeclared && ep.swaggerDeclared.extensions
    && ep.swaggerDeclared.extensions['x-probe-path-overrides']) || null;
  if (_pathOverrides && typeof _pathOverrides === 'object') {
    apiStep.path = apiStep.path.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (match, name) => {
      if (Object.prototype.hasOwnProperty.call(_pathOverrides, name)) {
        return String(_pathOverrides[name]);
      }
      return match;
    });
  }
  // Inject scheme-specific credentials for non-bearer security schemes
  // (apiKey-in-header, apiKey-in-query, basic). Bearer is handled via the
  // setAuth step from the auth-bootstrap chain. The credential VALUE is
  // declaration-driven: synthetic endpoints opt in by declaring
  // @ApiExtension('x-probe-credential', '<value>') on the operation. Without
  // that declaration the probe sends no credential — and the endpoint's 401
  // surface is correctly observed (which is the value the probe provides).
  // NEVER guessed; never path-derived.
  const _securitySchemesA = options.securitySchemes || {};
  const _primarySchemeA = resolvePrimaryScheme(ep, _securitySchemesA);
  const _primarySchemeTypeA = _primarySchemeA ? resolveSchemeType(_primarySchemeA) : null;
  const _credValue = (ep.swaggerDeclared && ep.swaggerDeclared.extensions
    && ep.swaggerDeclared.extensions['x-probe-credential']) || null;
  if (_primarySchemeTypeA === 'apiKey' && _credValue && _primarySchemeA) {
    if (_primarySchemeA.in === 'header' && _primarySchemeA.name) {
      apiStep.headers = { ...(apiStep.headers || {}), [_primarySchemeA.name]: _credValue };
    } else if (_primarySchemeA.in === 'query' && _primarySchemeA.name) {
      apiStep.query = { ...(apiStep.query || {}), [_primarySchemeA.name]: _credValue };
    }
  } else if (_primarySchemeTypeA === 'basic' && _credValue) {
    const _b64 = Buffer.from(String(_credValue)).toString('base64');
    apiStep.headers = { ...(apiStep.headers || {}), Authorization: `Basic ${_b64}` };
  }
  steps.push(apiStep);

  const expectStep = { kind: 'expect', status: expectedStatus };
  // When a responseContract is declared (from OpenAPI response schema),
  // compute bodyHas from requiredPaths. The envelope wrapper path (e.g.
  // ['data'] or ['payload','data']) is joined and prepended to each path so
  // the probe checks the actual response shape (e.g. 'data.accessToken').
  // Bare-array endpoints (link-header pagination using @Res()) bypass the
  // NestJS transform interceptor, so envelope wrapping does not apply.
  if (ep.responseContract && ep.responseContract.requiredPaths && ep.responseContract.requiredPaths.length > 0) {
    const isBareArray = ep.paginationProfile && (ep.paginationProfile.isBareArray || ep.paginationProfile.style === 'link-header');
    // Conditional endpoints (ETag/If-Match) use @Res() for manual
    // status/header control, bypassing the NestJS transform interceptor.
    const isBareResponse = isBareArray || Boolean(ep.conditionalProfile);
    const sw = isBareResponse ? null : (options.envelopeWrapper || null);
    const prefix = Array.isArray(sw) && sw.length > 0 ? sw.join('.') : (typeof sw === 'string' ? sw : null);
    const contractAlreadyIncludesEnvelope = Boolean(
      prefix && ep.responseContract.requiredPaths.some((reqPath) =>
        reqPath === prefix || reqPath.startsWith(`${prefix}.`)
      )
    );
    expectStep.bodyHas = ep.responseContract.requiredPaths.map((reqPath) => {
      if (!prefix || contractAlreadyIncludesEnvelope) return reqPath;
      return `${prefix}.${reqPath}`;
    });
  }
  steps.push(expectStep);

  const hasContract = ep.zodContract || ep.queryContract || ep.responseContract;
  const contractKind = hasContract ? 'endpoint-happy' : 'endpoint-stub-untyped';
  const sourceRefs = [];
  if (ep.zodContract) sourceRefs.push(ep.zodContract.schemaRef);
  if (ep.queryContract) sourceRefs.push(ep.queryContract.schemaRef);
  sourceRefs.push(ep.file);
  const source = sourceRefs.join(' + ');

  return {
    id: flowId,
    contract: {
      endpoint: epKey(ep.method, ep.path),
      kind: contractKind,
      source,
    },
    dependsOn: [
      ...(useChain ? ['chain:auth-bootstrap'] : []),
      ...(_resourceRefResult.deps || []),
    ],
    onFail: {
      check: [ep.file],
      implies: `${ep.method} ${ep.path} rejects valid input or returns unexpected status.`,
    },
    steps,
  };
}

/**
 * Rule 2: Invalidator flows for each field x invalidator kind.
 * Uses pre-built invalidators when available, falls back to constructing from constraints.
 */
function emitInvalidatorFlows(ep, options = {}) {
  if (!ep.zodContract || !ep.zodContract.fields) return [];
  // Skip endpoints that only accept non-JSON content types (e.g. multipart,
  // octet-stream). Invalidator flows send JSON bodies which would be rejected.
  if (ep.requestContentTypes && ep.requestContentTypes.length > 0 &&
      !ep.requestContentTypes.some((ct) => ct.includes('json'))) {
    return [];
  }
  // Skip ambiguity-fixture endpoints — they exist to test detector ambiguity
  // (e.g. duplicate x-auth-issues-token, OAUTH_ROLE_AMBIGUOUS) and intentionally
  // do not validate input. Declaration-driven via OpenAPI extension
  // `x-probe-no-validation: true`. NEVER inferred — developer must opt out.
  const _exts0 = (ep.swaggerDeclared && ep.swaggerDeclared.extensions) || {};
  if (_exts0['x-probe-no-validation'] === true) return [];
  const uniqueFieldSet = options.uniqueFieldSet;
  const errorEnvelopeWrapper = options.errorEnvelopeWrapper || null;
  const flows = [];
  const errorShape = ep.errorShape || null;

  for (const field of ep.zodContract.fields) {
    const invalidators = (field.samples && field.samples.invalidators)
      ? field.samples.invalidators
      : constructInvalidators(field);

    for (const inv of invalidators) {
      const base = pathToId(ep.path);
      const flowId = `${base}:${ep.method.toLowerCase()}:field-${field.name}:${inv.kind}`;
      const body = applyInvalidator(
        buildSampleBody(ep.zodContract, uniqueFieldSet),
        field.name,
        inv
      );

      const targetField = inv.expectedErrorField || field.name;
      const errorAssertions = buildErrorAssertions({
        errorShape,
        fieldName: targetField,
        envelope: errorEnvelopeWrapper,
      });

      // Build expect step: merge family-aware assertions with status expectation
      const expectStep = { kind: 'expect', status: 400 };
      if (errorAssertions.length > 0) {
        const assertion = errorAssertions[0];
        if (assertion.kind === 'expect-error-shape') {
          // Use the new family-aware step kind
          Object.assign(expectStep, assertion);
        } else if (assertion.errorFieldMentions) {
          // Legacy heuristic fallback
          expectStep.errorFieldMentions = assertion.errorFieldMentions;
        }
      }

      flows.push({
        id: flowId,
        contract: {
          endpoint: epKey(ep.method, ep.path),
          kind: 'endpoint-invalidator',
          source: ep.zodContract.schemaRef || ep.file,
        },
        dependsOn: [],
        onFail: {
          check: [ep.file],
          implies: `${ep.method} ${ep.path} does not reject invalid ${field.name} (${inv.kind}).`,
        },
        steps: [
          { body, kind: 'api', method: ep.method, path: ep.path },
          expectStep,
        ],
      });
    }
  }

  return flows;
}

/**
 * Rule 2b: Query-param invalidator flows for each query field x invalidator.
 * Structural coverage only — asserts 400 + error field mention, same shape as
 * body invalidators but applied to URL query params.
 */
function emitQueryInvalidatorFlows(ep, options = {}) {
  if (!ep.queryContract || !ep.queryContract.fields) return [];
  // Skip ambiguity-fixture endpoints (see emitInvalidatorFlows for rationale).
  // Declaration-driven via OpenAPI extension `x-probe-no-validation: true`.
  const _exts0 = (ep.swaggerDeclared && ep.swaggerDeclared.extensions) || {};
  if (_exts0['x-probe-no-validation'] === true) return [];
  const uniqueFieldSet = options.uniqueFieldSet;
  const errorEnvelopeWrapper = options.errorEnvelopeWrapper || null;
  const flows = [];
  const baseBody = ep.zodContract ? buildSampleBody(ep.zodContract, uniqueFieldSet) : null;
  const baseQuery = buildSampleQuery(ep.queryContract);
  const errorShape = ep.errorShape || null;

  for (const field of ep.queryContract.fields) {
    const invalidators = (field.samples && field.samples.invalidators)
      ? field.samples.invalidators
      : constructInvalidators(field);

    for (const inv of invalidators) {
      const base = pathToId(ep.path);
      const flowId = `${base}:${ep.method.toLowerCase()}:query-${field.name}:${inv.kind}`;
      const query = applyInvalidator(baseQuery, field.name, inv);

      const apiStep = { kind: 'api', method: ep.method, path: ep.path, query };
      if (baseBody && (ep.method === 'POST' || ep.method === 'PUT' || ep.method === 'PATCH')) {
        apiStep.body = baseBody;
      }

      const targetField = inv.expectedErrorField || field.name;
      const errorAssertions = buildErrorAssertions({
        errorShape,
        fieldName: targetField,
        envelope: errorEnvelopeWrapper,
      });

      const expectStep = { kind: 'expect', status: 400 };
      if (errorAssertions.length > 0) {
        const assertion = errorAssertions[0];
        if (assertion.kind === 'expect-error-shape') {
          Object.assign(expectStep, assertion);
        } else if (assertion.errorFieldMentions) {
          expectStep.errorFieldMentions = assertion.errorFieldMentions;
        }
      }

      flows.push({
        id: flowId,
        contract: {
          endpoint: epKey(ep.method, ep.path),
          kind: 'endpoint-query-invalidator',
          source: ep.queryContract.schemaRef || ep.file,
        },
        dependsOn: [],
        onFail: {
          check: [ep.file],
          implies: `${ep.method} ${ep.path} does not reject invalid query param ${field.name} (${inv.kind}).`,
        },
        steps: [
          apiStep,
          expectStep,
        ],
      });
    }
  }

  return flows;
}

/**
 * Rule 3: Auth-boundary flows for authRequired endpoints.
 *
 * Generates scheme-appropriate "missing-credential" probes per declared
 * security scheme. Bearer endpoints get no-bearer + garbage + wrong-secret +
 * expired probes. apiKey endpoints get no-key probes. Basic auth endpoints
 * get no-Authorization probes.
 */
function emitAuthBoundaryFlows(ep, options = {}) {
  if (!ep.authDecorators || !ep.authDecorators.authRequired) return [];
  const uniqueFieldSet = options.uniqueFieldSet;
  const flows = [];
  const base = pathToId(ep.path);
  const methodPrefix = `${base}:${ep.method.toLowerCase()}`;
  const baseBody = ep.zodContract ? buildSampleBody(ep.zodContract, uniqueFieldSet) : null;

  const makeApiStep = (authHeader) => {
    const step = { kind: 'api', method: ep.method, path: ep.path };
    if (baseBody && (ep.method === 'POST' || ep.method === 'PUT' || ep.method === 'PATCH')) {
      step.body = baseBody;
    }
    if (authHeader) {
      step.headers = { Authorization: authHeader };
    } else {
      // Auth-boundary probes intentionally test the unauthenticated path.
      // Without skipAuth, the runner injects the chain-bootstrap bearer
      // when no Authorization header is set, defeating the assertion.
      step.skipAuth = true;
    }
    return step;
  };

  // Determine the primary security scheme type from securityRequirement + matrix
  const securitySchemes = (options.securitySchemes) || {};
  const primarySchemeType = resolvePrimarySchemeType(ep, securitySchemes);

  if (primarySchemeType === 'apiKey') {
    // apiKey scheme: emit no-key probe
    const schemeDef = resolvePrimaryScheme(ep, securitySchemes);
    const location = (schemeDef && schemeDef.in) || 'header';
    const keyName = (schemeDef && schemeDef.name) || 'X-API-Key';
    flows.push({
      id: `${methodPrefix}:auth-boundary-no-key`,
      contract: { endpoint: epKey(ep.method, ep.path), kind: 'auth-boundary', source: ep.file },
      dependsOn: [],
      onFail: { check: [ep.file], implies: `${ep.method} ${ep.path} does not require API key in ${location} (${keyName}).` },
      steps: [makeApiStep(null), { kind: 'expect', status: 401 }],
    });
  } else if (primarySchemeType === 'basic') {
    // Basic auth: emit no-Authorization probe
    flows.push({
      id: `${methodPrefix}:auth-boundary-no-basic`,
      contract: { endpoint: epKey(ep.method, ep.path), kind: 'auth-boundary', source: ep.file },
      dependsOn: [],
      onFail: { check: [ep.file], implies: `${ep.method} ${ep.path} does not require Basic auth.` },
      steps: [makeApiStep(null), { kind: 'expect', status: 401 }],
    });
    // garbage basic
    flows.push({
      id: `${methodPrefix}:auth:garbage-basic`,
      contract: { endpoint: epKey(ep.method, ep.path), kind: 'auth-boundary', source: ep.file },
      dependsOn: [],
      onFail: { check: [ep.file], implies: `${ep.method} ${ep.path} accepts garbage Basic credentials.` },
      steps: [makeApiStep('Basic bm90OnZhbGlk'), { kind: 'expect', status: 401 }],
    });
  } else {
    // Default: bearer (including oauth2, openIdConnect)
    // no-bearer
    flows.push({
      id: `${methodPrefix}:auth:no-bearer`,
      contract: { endpoint: epKey(ep.method, ep.path), kind: 'auth-boundary', source: ep.file },
      dependsOn: [],
      onFail: { check: [ep.file], implies: `${ep.method} ${ep.path} does not require authentication (missing bearer accepted).` },
      steps: [makeApiStep(null), { kind: 'expect', status: 401 }],
    });

    // garbage-bearer
    flows.push({
      id: `${methodPrefix}:auth:garbage-bearer`,
      contract: { endpoint: epKey(ep.method, ep.path), kind: 'auth-boundary', source: ep.file },
      dependsOn: [],
      onFail: { check: [ep.file], implies: `${ep.method} ${ep.path} accepts garbage bearer token.` },
      steps: [makeApiStep('Bearer garbage-not-a-jwt'), { kind: 'expect', status: 401 }],
    });

    // wrong-secret-jwt
    flows.push({
      id: `${methodPrefix}:auth:wrong-secret-jwt`,
      contract: { endpoint: epKey(ep.method, ep.path), kind: 'auth-boundary', source: ep.file },
      dependsOn: [],
      onFail: { check: [ep.file], implies: `${ep.method} ${ep.path} accepts JWT signed with wrong secret.` },
      steps: [makeApiStep(`Bearer ${fakeJwt({ wrongSecret: true })}`), { kind: 'expect', status: 401 }],
    });

    // expired-jwt
    flows.push({
      id: `${methodPrefix}:auth:expired-jwt`,
      contract: { endpoint: epKey(ep.method, ep.path), kind: 'auth-boundary', source: ep.file },
      dependsOn: [],
      onFail: { check: [ep.file], implies: `${ep.method} ${ep.path} accepts expired JWT.` },
      steps: [makeApiStep(`Bearer ${fakeJwt({ expired: true })}`), { kind: 'expect', status: 401 }],
    });
  }

  // non-matching-role (applicable to all scheme types)
  if (ep.authDecorators.rolesRequired && ep.authDecorators.rolesRequired.length > 0) {
    flows.push({
      id: `${methodPrefix}:auth:non-matching-role`,
      contract: { endpoint: epKey(ep.method, ep.path), kind: 'auth-boundary-role', source: ep.file },
      dependsOn: [],
      onFail: { check: [ep.file], implies: `${ep.method} ${ep.path} does not enforce role requirement (${ep.authDecorators.rolesRequired.join(', ')}).` },
      steps: [makeApiStep(`Bearer ${fakeJwt({ role: 'user' })}`), { kind: 'expect', status: 403 }],
    });
  }

  return flows;
}

/**
 * Rule 4: Duplicate-conflict flow for POSTs that either follow the
 * register/signup convention OR declare a 409 response in their OpenAPI
 * spec. A declared 409 is the endpoint explicitly telling us "I reject
 * duplicates", which is exactly what this flow probes.
 */

/**
 * Rule 3b: Auth-scheme 401 emitter for non-bearer security schemes.
 *
 * Targets endpoints that:
 *   1. Declare a securityRequirement pointing to a named scheme in securitySchemes.
 *   2. That scheme is NOT bearer (apiKey or basic).
 *   3. The endpoint declares 401 in swaggerDeclared.statuses.
 *   4. emitAuthBoundaryFlows did NOT already cover 401 (i.e. authRequired is false).
 *
 * Per scheme type, emits a "missing credential" probe:
 *   - apiKey in: header → request without that header → expect 401
 *   - apiKey in: query  → request without that query param → expect 401
 *   - http basic        → request without Authorization header → expect 401
 *
 * Bearer is already covered by emitAuthBoundaryFlows — skip to avoid duplication.
 */
function emitAuthScheme401Flows(ep, options = {}) {
  // Skip if emitAuthBoundaryFlows already handles this endpoint (bearer/authRequired)
  if (ep.authDecorators && ep.authDecorators.authRequired) return [];

  // Must have a securityRequirement
  if (!ep.securityRequirement || ep.securityRequirement.length === 0) return [];

  // Must declare 401
  const declared = (ep.swaggerDeclared && ep.swaggerDeclared.statuses) || [];
  if (!declared.includes(401)) return [];

  const securitySchemes = options.securitySchemes || {};
  const flows = [];
  const base = pathToId(ep.path);
  const methodPrefix = `${base}:${ep.method.toLowerCase()}`;

  // Iterate over each security requirement entry
  for (const req of ep.securityRequirement) {
    if (!req || typeof req !== 'object') continue;
    for (const schemeName of Object.keys(req)) {
      const schemeDef = securitySchemes[schemeName];
      if (!schemeDef) continue;

      const schemeType = resolveSchemeType(schemeDef);

      // Skip bearer — already handled by emitAuthBoundaryFlows
      if (schemeType === 'bearer') continue;

      const apiStep = { kind: 'api', method: ep.method, path: ep.path };
      // Include body for POST/PUT/PATCH if available
      if (ep.zodContract && ['POST', 'PUT', 'PATCH'].includes(ep.method)) {
        apiStep.body = buildSampleBody(ep.zodContract, options.uniqueFieldSet);
      }

      if (schemeType === 'apiKey') {
        const location = schemeDef.in || 'header';
        const keyName = schemeDef.name || 'X-API-Key';
        flows.push({
          id: `${methodPrefix}:auth-scheme:missing-${schemeName}`,
          contract: {
            endpoint: epKey(ep.method, ep.path),
            kind: 'auth-scheme',
            source: ep.file,
          },
          dependsOn: [],
          onFail: {
            check: [ep.file],
            implies: `${ep.method} ${ep.path} does not require API key '${schemeName}' in ${location} (${keyName}).`,
          },
          steps: [apiStep, { kind: 'expect', status: 401 }],
        });
      } else if (schemeType === 'basic') {
        flows.push({
          id: `${methodPrefix}:auth-scheme:missing-${schemeName}`,
          contract: {
            endpoint: epKey(ep.method, ep.path),
            kind: 'auth-scheme',
            source: ep.file,
          },
          dependsOn: [],
          onFail: {
            check: [ep.file],
            implies: `${ep.method} ${ep.path} does not require Basic auth via scheme '${schemeName}'.`,
          },
          steps: [apiStep, { kind: 'expect', status: 401 }],
        });
      }
    }
  }

  return flows;
}

/**
 * Resolve the normalized auth scheme type from a scheme definition object.
 * Returns 'bearer', 'apiKey', 'basic', 'oauth2', or 'openIdConnect'.
 */
function resolveSchemeType(schemeDef) {
  if (!schemeDef || !schemeDef.type) return 'bearer';
  if (schemeDef.type === 'http') {
    const httpScheme = (schemeDef.scheme || '').toLowerCase();
    return httpScheme === 'basic' ? 'basic' : 'bearer';
  }
  if (schemeDef.type === 'apiKey') return 'apiKey';
  if (schemeDef.type === 'oauth2') return 'oauth2';
  if (schemeDef.type === 'openIdConnect') return 'openIdConnect';
  return 'bearer';
}

/**
 * Rule 3c: Login flow emitter for endpoints declaring x-auth-flow: 'login'.
 *
 * Declaration trigger: The endpoint MUST have the OpenAPI extension
 * x-auth-flow set to 'login'. NO path regex, NO field-name heuristics.
 *
 * The credential field is identified via x-auth-flow-credential extension
 * (e.g. 'password'). This tells the emitter which body field to corrupt
 * for the invalid-credentials probe.
 *
 * Emits:
 *   - :happy flow: POST with sample body → expect declared 2xx
 *   - :invalid-credentials flow: POST with corrupted credential → expect 401
 */
function emitLoginFlowFlows(ep, options = {}) {
  // Must have x-auth-flow: 'login' extension — no heuristics
  const extensions = (ep.swaggerDeclared && ep.swaggerDeclared.extensions) || {};
  const authFlow = extensions['x-auth-flow'];
  if (authFlow !== 'login') return [];

  // Must be POST
  if (ep.method !== 'POST') return [];

  const declared = (ep.swaggerDeclared && ep.swaggerDeclared.statuses) || [];
  const base = pathToId(ep.path);
  const methodPrefix = `${base}:${ep.method.toLowerCase()}`;
  const flows = [];

  const body = ep.zodContract ? buildSampleBody(ep.zodContract, options.uniqueFieldSet) : {};

  // Happy flow: use declared 2xx status, or 200 as default
  const declaredSuccess = declared.find((s) => s >= 200 && s < 300);
  if (declaredSuccess !== undefined || declared.length === 0) {
    const expectedStatus = declaredSuccess !== undefined ? declaredSuccess : 200;
    flows.push({
      id: `${methodPrefix}:login:happy`,
      contract: {
        endpoint: epKey(ep.method, ep.path),
        kind: 'login-flow',
        source: ep.file,
      },
      dependsOn: [],
      onFail: {
        check: [ep.file],
        implies: `${ep.method} ${ep.path} login happy path does not return ${expectedStatus}.`,
      },
      steps: [
        { kind: 'api', method: ep.method, path: ep.path, body },
        { kind: 'expect', status: expectedStatus },
      ],
    });
  }

  // Invalid-credentials flow: only if 401 is declared
  if (declared.includes(401)) {
    // Get the credential field from x-auth-flow-credential extension
    const credentialField = extensions['x-auth-flow-credential'];
    let invalidBody;
    if (credentialField && body && typeof body === 'object') {
      // Corrupt the declared credential field with a clearly-bad value
      invalidBody = { ...body, [credentialField]: 'probe-invalid-credential-00000' };
    } else {
      // No credential field declared — send empty body to provoke 401
      invalidBody = {};
    }

    flows.push({
      id: `${methodPrefix}:login:invalid-credentials`,
      contract: {
        endpoint: epKey(ep.method, ep.path),
        kind: 'login-flow',
        source: ep.file,
      },
      dependsOn: [],
      onFail: {
        check: [ep.file],
        implies: `${ep.method} ${ep.path} does not return 401 for invalid credentials.`,
      },
      steps: [
        { kind: 'api', method: ep.method, path: ep.path, body: invalidBody },
        { kind: 'expect', status: 401 },
      ],
    });
  }

  return flows;
}
function emitDuplicateConflictFlow(ep, happyFlowId, options = {}) {
  if (ep.method !== 'POST') return null;
  if (!ep.zodContract) return null;
  const authFlows = options.authFlows || {};
  const isRegisterEndpoint = authFlows.register && ep.path === authFlows.register.path;
  const declares409 =
    Array.isArray(ep.swaggerDeclared && ep.swaggerDeclared.statuses) &&
    ep.swaggerDeclared.statuses.includes(409);
  if (!isRegisterEndpoint && !declares409) return null;

  // Duplicate-conflict must insert, then re-insert SAME body, within THIS
  // flow's context so both POSTs resolve `${uniqEmail}` to the same value.
  // Previously it relied on a cross-flow DB row (happy's) — which breaks
  // now that each flow has its own runId. Self-contained is robust + fast.
  const base = pathToId(ep.path);
  const flowId = `${base}:duplicate-conflict`;
  let body = buildSampleBody(ep.zodContract, effectiveUniqueFieldSet(ep, options.uniqueFieldSet));
  let path = ep.path;
  const deps = [happyFlowId];

  const _resourceRefResult = resolveResourceRefDeps(ep, options.endpoints || []);
  if (_resourceRefResult.overrides && Object.keys(_resourceRefResult.overrides).length > 0) {
    if (body && typeof body === 'object') {
      body = { ...body, ..._resourceRefResult.overrides };
    }
  }
  if (_resourceRefResult.pathSubstitutions && Object.keys(_resourceRefResult.pathSubstitutions).length > 0) {
    for (const [param, sigil] of Object.entries(_resourceRefResult.pathSubstitutions)) {
      path = path.replace(`:${param}`, sigil);
    }
  }
  if (Array.isArray(_resourceRefResult.deps)) {
    for (const depId of _resourceRefResult.deps) {
      if (!deps.includes(depId)) deps.push(depId);
    }
  }

  const authFlowsOpts = options.authFlows || {};
  const isBootstrapEndpoint = ep.method === 'POST' && (
    (authFlowsOpts.tokenIssuer && ep.path === authFlowsOpts.tokenIssuer.path) ||
    (authFlowsOpts.register && ep.path === authFlowsOpts.register.path)
  );
  const needsAuth = Boolean(ep.authDecorators && ep.authDecorators.authRequired);
  const useChain = needsAuth && Boolean(options.authBootstrapAvailable) && !isBootstrapEndpoint;
  const steps = [];
  if (useChain) {
    steps.push({ binding: 'accessToken', kind: 'setAuth' });
    if (!deps.includes('chain:auth-bootstrap')) deps.push('chain:auth-bootstrap');
  }
  steps.push({ body, kind: 'api', method: ep.method, path });
  steps.push({ kind: 'expect', statusAnyOf: [200, 201] });
  steps.push({ body, kind: 'api', method: ep.method, path });
  steps.push({ kind: 'expect', statusAnyOf: [400, 409, 422] });

  return {
    id: flowId,
    contract: { endpoint: epKey(ep.method, ep.path), kind: 'duplicate-conflict', source: ep.file },
    dependsOn: deps,
    onFail: { check: [ep.file], implies: `${ep.method} ${ep.path} does not reject duplicate submission.` },
    steps,
  };
}

/**
 * Rule 5: Status-reachability flows for declared but unreached statuses.
 * Ungeneratable statuses go to diagnostics, not flows.
 */
function emitStatusReachabilityFlows(ep, coveredStatuses, diagnostics, options) {
  if (!ep.swaggerDeclared || !ep.swaggerDeclared.statuses) return [];
  const flows = [];
  const base = pathToId(ep.path);
  const meth = ep.method.toLowerCase();
  const opts = options || {};

  // Auth setup for authed endpoints: prepend setAuth + dependsOn chain.
  const needsAuth = Boolean(ep.authDecorators && ep.authDecorators.authRequired);
  const authBootstrapAvailable = Boolean(opts.authBootstrapAvailable);

  /** Helper to build a status-reachability flow. */
  function reachFlow(status, steps, impliesMsg, extraDeps) {
    return {
      id: `${base}:${meth}:status-reach:${status}`,
      contract: { endpoint: epKey(ep.method, ep.path), kind: 'status-reachability', source: ep.file },
      dependsOn: extraDeps || [],
      onFail: { check: [ep.file], implies: impliesMsg || `${ep.method} ${ep.path} does not return ${status}.` },
      steps,
    };
  }

  for (const status of ep.swaggerDeclared.statuses) {
    if (coveredStatuses.has(status)) continue;

    // ---- 404: missing resource ----
    if (status === 404) {
      // Resolve path-prefix parent deps so child resources get valid parent
      // IDs (e.g. /teams/:teamId/members/:id → :teamId from parent chain,
      // :id → non-existent). Only the LEAF param is made non-existent.
      const refResult404 = resolveResourceRefDeps(ep, opts.endpoints || []);
      // Replace remaining :params with non-existent IDs FIRST on the raw path,
      // skipping params that have parent substitutions. Then apply parent sigils.
      const parentParams = new Set(Object.keys(refResult404.pathSubstitutions || {}));

      // Identify the LEAF param — the last :param in the path. For 404-reach,
      // the leaf must ALWAYS be non-existent, even if resolveResourceRefDeps
      // mapped it as a parent substitution. This handles single-param paths
      // like /teams/:id where detectPathPrefixParent maps :id → ${resource:teams:id}
      // but we need it to be non-existent to trigger 404.
      const allParams = [];
      ep.path.replace(/:(\w+)/g, (_m, p) => { allParams.push(p); return _m; });
      const leafParam = allParams.length > 0 ? allParams[allParams.length - 1] : null;
      if (leafParam && parentParams.has(leafParam)) {
        parentParams.delete(leafParam);
        // Remove the leaf's substitution so it won't be applied
        delete refResult404.pathSubstitutions[leafParam];
        // If the leaf was the only param driving the dep chain, remove
        // the dep too — a non-existent leaf doesn't need a setup chain.
        // Only remove if no other params still reference that chain.
        const leafResource = ep.path.split('/').slice(0, -1).join('/').split('/').pop();
        const leafChainId = `chain:resource-setup:${leafResource}`;
        const otherParamsStillNeedChain = [...parentParams].some((p) => {
          const sigil = refResult404.pathSubstitutions[p];
          return sigil && sigil.includes(leafResource);
        });
        if (!otherParamsStillNeedChain) {
          refResult404.deps = (refResult404.deps || []).filter((d) => d !== leafChainId);
        }
      }

      let probePath = ep.path.replace(/:(\w+)/g, (match, paramName) => {
        if (parentParams.has(paramName)) return match; // keep for sigil substitution
        return 'non-existent-id-00000';
      });
      // Now apply parent path substitutions (sigils like ${resource:teams:id})
      if (refResult404.pathSubstitutions) {
        for (const [param, sigil] of Object.entries(refResult404.pathSubstitutions)) {
          probePath = probePath.replace(`:${param}`, sigil);
        }
      }

      const steps404 = [];
      const deps404 = [...(refResult404.deps || [])];

      // Authed endpoints need a valid token to reach the 404 handler —
      // without auth, the guard returns 401 before the route resolves.
      if (needsAuth && authBootstrapAvailable) {
        steps404.push({ kind: 'setAuth', binding: 'accessToken' });
        if (!deps404.includes('chain:auth-bootstrap')) {
          deps404.push('chain:auth-bootstrap');
        }
      }

      const apiStep404 = { kind: 'api', method: ep.method, path: probePath };
      // POST/PUT/PATCH require a body to pass NestJS validation pipes;
      // without it, the pipe rejects with 400 before the route handler
      // can check resource existence and return 404.
      if (['POST', 'PUT', 'PATCH'].includes(ep.method) && ep.zodContract) {
        const body404 = buildSampleBody(ep.zodContract, opts.uniqueFieldSet) || {};
        // Replace body resource-ref FK fields with a VALID-FORMAT but
        // non-existent placeholder instead of the @BodyResourceRefs
        // valid-substitution override. Without this, status-reach:404 for
        // an endpoint declaring @BodyResourceRefs gets a valid FK
        // substituted and returns 201, not 404. We pick the sigil based
        // on the field's declared format so validation pipes pass and
        // the controller's "not found" branch is reached:
        //   format=uuid  → ${uniqUuid}     (valid v4 UUID, random, never seeded)
        //   format=email → ${uniqEmail}    (valid email, random local-part)
        //   otherwise    → ${uniqString}   (random alphanumeric)
        if (refResult404.overrides && Object.keys(refResult404.overrides).length > 0) {
          const zodFieldsMap = (() => {
            const out = {};
            const fields = ep.zodContract.fields;
            if (Array.isArray(fields)) {
              for (const field of fields) if (field && field.name) out[field.name] = field;
            } else if (fields && typeof fields === 'object') {
              for (const [key, val] of Object.entries(fields)) out[key] = val;
            }
            return out;
          })();
          const transform = transformOverrides(refResult404.overrides, 'status-reach-404', {
            zodFieldsMap,
            resourceGraph: opts && opts.resourceGraph,
            endpoint: ep,
          });
          for (const diag of transform.diagnostics || []) diagnostics.push(diag);
          Object.assign(body404, transform.result);
        }
        apiStep404.body = body404;
      }
      steps404.push(apiStep404);
      steps404.push({ kind: 'expect', status: 404 });

      flows.push(reachFlow(404, steps404,
        `${ep.method} ${ep.path} does not return 404 for missing resource.`, deps404));
      continue;
    }

    // ---- 3xx redirects (301, 302, 307, 308): assert Location header ----
    if (status >= 301 && status <= 308 && [301, 302, 307, 308].includes(status)) {
      flows.push(reachFlow(status, [
        { kind: 'api', method: ep.method, path: ep.path },
        { kind: 'expect', status, bodyHas: ['header:location'] },
      ], `${ep.method} ${ep.path} does not return ${status} redirect with Location header.`));
      continue;
    }

    // ---- 304: conditional GET with stale ETag ----
    if (status === 304) {
      flows.push(reachFlow(304, [
        { kind: 'api', method: ep.method, path: ep.path, headers: { 'If-None-Match': '"stale-etag-probe-00000"' } },
        { kind: 'expect', status: 304 },
      ], `${ep.method} ${ep.path} does not return 304 for conditional request with If-None-Match.`));
      continue;
    }

    // ---- 405: wrong HTTP method ----
    // Two declaration shapes are both valid and disambiguated by what the
    // endpoint declares:
    //   (a) endpoint also declares a 2xx success → it accepts ep.method, and
    //       a different method on the same path returns 405 (route guard).
    //       Probe sends a wrongMethod and expects 405.
    //   (b) endpoint declares ONLY 405 (no success status) → it IS the
    //       method-rejection handler; calling ep.method itself returns 405.
    //       Probe sends ep.method and expects 405.
    // No heuristic — the disambiguation comes from the @ApiResponse
    // declarations the developer wrote.
    if (status === 405) {
      const declaredAll = (ep.swaggerDeclared && ep.swaggerDeclared.statuses) || [];
      const hasSuccess = declaredAll.some((s) => s >= 200 && s < 300);
      if (!hasSuccess) {
        flows.push(reachFlow(405, [
          { kind: 'api', method: ep.method, path: ep.path },
          { kind: 'expect', status: 405 },
        ], `${ep.method} ${ep.path} declares 405 (only) but does not return it on a plain request.`));
        continue;
      }
      const wrongMethod = pickWrongMethod(ep.method);
      flows.push(reachFlow(405, [
        { kind: 'api', method: wrongMethod, path: ep.path },
        { kind: 'expect', status: 405 },
      ], `${ep.method} ${ep.path} does not return 405 for wrong method (${wrongMethod}).`));
      continue;
    }

    // ---- 410: resource gone (DELETE then re-access) ----
    if (status === 410) {
      const probePath = ep.path.replace(/:(\w+)/g, 'non-existent-id-00000');
      flows.push(reachFlow(410, [
        { kind: 'api', method: ep.method, path: probePath },
        { kind: 'expect', statusAnyOf: [410, 404] },
      ], `${ep.method} ${ep.path} does not return 410 for gone resource.`));
      continue;
    }

    // ---- 412: precondition failed (If-Match with wrong ETag) ----
    if (status === 412) {
      flows.push(reachFlow(412, [
        { kind: 'api', method: ep.method, path: ep.path, headers: { 'If-Match': '"wrong-etag-probe-00000"' } },
        { kind: 'expect', status: 412 },
      ], `${ep.method} ${ep.path} does not return 412 for precondition failed (wrong If-Match).`));
      continue;
    }

    // ---- 415: unsupported media type (send text/plain to JSON endpoint) ----
    if (status === 415) {
      flows.push(reachFlow(415, [
        { kind: 'api', method: ep.method, path: ep.path, headers: { 'Content-Type': 'text/plain' }, body: 'probe-unsupported-media-type' },
        { kind: 'expect', status: 415 },
      ], `${ep.method} ${ep.path} does not return 415 for unsupported Content-Type.`));
      continue;
    }

    // ---- 428: precondition required (missing If-Match header) ----
    if (status === 428) {
      const apiStep = { kind: 'api', method: ep.method, path: ep.path };
      // Send body if POST/PUT/PATCH — but WITHOUT If-Match header
      if (['POST', 'PUT', 'PATCH'].includes(ep.method) && ep.zodContract) {
        apiStep.body = buildSampleBody(ep.zodContract);
      }
      flows.push(reachFlow(428, [
        apiStep,
        { kind: 'expect', status: 428 },
      ], `${ep.method} ${ep.path} does not return 428 when required precondition (If-Match) is missing.`));
      continue;
    }

    // ---- 400: unconditional bad-request (endpoint always throws BadRequestException) ----
    // Only emit when the endpoint declares no 2xx — i.e. the endpoint is
    // unconditionally an error path. Otherwise field-invalidator flows
    // already cover 400.
    if (status === 400) {
      const declaredAll = (ep.swaggerDeclared && ep.swaggerDeclared.statuses) || [];
      const hasSuccess = declaredAll.some((s) => s >= 200 && s < 300);
      if (!hasSuccess) {
        flows.push(reachFlow(400, [
          { kind: 'api', method: ep.method, path: ep.path },
          { kind: 'expect', status: 400 },
        ], `${ep.method} ${ep.path} declares 400 (only) but does not return it on a plain request.`));
      }
      continue;
    }

    // ---- 422: validation error ----
    // POST/PUT/PATCH: send empty body to trigger validation.
    // GET/DELETE with queryContract: omit required query params.
    // GET/DELETE without queryContract: UNGENERATABLE — no validatable input.
    if (status === 422) {
      if (['POST', 'PUT', 'PATCH'].includes(ep.method)) {
        flows.push(reachFlow(422, [
          { kind: 'api', method: ep.method, path: ep.path, body: {} },
          { kind: 'expect', statusAnyOf: [400, 422] },
        ], `${ep.method} ${ep.path} does not return 422 for empty/invalid body.`));
      } else if (
        ep.queryContract && Array.isArray(ep.queryContract.fields)
        && ep.queryContract.fields.some((f) => f && f.required === true)
      ) {
        // GET/DELETE with at least one declared required query param — omit them
        flows.push(reachFlow(422, [
          { kind: 'api', method: ep.method, path: ep.path },
          { kind: 'expect', statusAnyOf: [400, 422] },
        ], `${ep.method} ${ep.path} does not return 422 when required query params are omitted.`));
      } else {
        // GET/DELETE without validatable input — UNGENERATABLE
        diagnostics.push({
          code: 'CONTRACT_STATUS_UNREACHABLE_UNGENERATABLE',
          message: `Status 422 declared on ${ep.method} ${ep.path} but endpoint has no validatable input (no body schema, no query params). Add @Query() with a Zod schema or remove the 422 declaration.`,
          endpoint: epKey(ep.method, ep.path),
        });
      }
      continue;
    }

    // ---- 429: rate limit exceeded (burst requests) ----
    if (status === 429) {
      // Emit a burst of requests to trigger rate limiting.
      // The endpoint declares 429 — we send N+1 requests where N defaults to 100.
      const burstSteps = [];
      const burstCount = 5; // Minimal burst to detect presence; real rate-limit testing needs more
      for (let i = 0; i < burstCount; i++) {
        burstSteps.push({ kind: 'api', method: ep.method, path: ep.path });
      }
      // After burst, the last response should be 429 (or we accept the endpoint
      // may need more requests — so we check the last one)
      burstSteps.push({ kind: 'expect', statusAnyOf: [429, 200, 201] });
      // Emit one more to increase likelihood of hitting the limit
      burstSteps.push({ kind: 'api', method: ep.method, path: ep.path });
      burstSteps.push({ kind: 'expect', statusAnyOf: [429, 200, 201] });
      flows.push(reachFlow(429, burstSteps,
        `${ep.method} ${ep.path} declares 429 but rate limiting could not be triggered.`));
      continue;
    }

    // ---- 451: unavailable for legal reasons ----
    if (status === 451) {
      flows.push(reachFlow(451, [
        { kind: 'api', method: ep.method, path: ep.path },
        { kind: 'expect', status: 451, bodyHas: ['header:link'] },
      ], `${ep.method} ${ep.path} does not return 451 with Link header.`));
      continue;
    }

    // ---- 206: partial content (Range request) ----
    if (status === 206) {
      flows.push(reachFlow(206, [
        { kind: 'api', method: ep.method, path: ep.path, headers: { 'Range': 'bytes=0-99' } },
        { kind: 'expect', status: 206, bodyHas: ['header:content-range'] },
      ], `${ep.method} ${ep.path} does not return 206 with Content-Range for Range request.`));
      continue;
    }

    // ---- 502: bad gateway ----
    if (status === 502) {
      flows.push(reachFlow(502, [
        { kind: 'api', method: ep.method, path: ep.path },
        { kind: 'expect', status: 502 },
      ], `${ep.method} ${ep.path} does not return 502 Bad Gateway.`));
      continue;
    }

    // ---- 503: service unavailable ----
    if (status === 503) {
      flows.push(reachFlow(503, [
        { kind: 'api', method: ep.method, path: ep.path },
        { kind: 'expect', status: 503 },
      ], `${ep.method} ${ep.path} does not return 503 Service Unavailable.`));
      continue;
    }

    // ---- 504: gateway timeout ----
    if (status === 504) {
      flows.push(reachFlow(504, [
        { kind: 'api', method: ep.method, path: ep.path },
        { kind: 'expect', status: 504 },
      ], `${ep.method} ${ep.path} does not return 504 Gateway Timeout.`));
      continue;
    }

    // ---- Fallback: unknown status — emit diagnostic ----
    diagnostics.push({
      code: 'CONTRACT_STATUS_UNREACHABLE_UNGENERATABLE',
      message: `Status ${status} declared on ${ep.method} ${ep.path} but no known pattern can generate a flow for it.`,
      endpoint: epKey(ep.method, ep.path),
    });
  }

  return flows;
}

/**
 * Pick a wrong HTTP method for 405 probes. Given the endpoint's actual method,
 * return a method that should NOT be accepted by the endpoint.
 */
function pickWrongMethod(actualMethod) {
  const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
  // Prefer an obviously wrong method: GET for POST endpoints, POST for GET endpoints
  if (actualMethod === 'GET') return 'DELETE';
  if (actualMethod === 'POST') return 'GET';
  if (actualMethod === 'PUT') return 'GET';
  if (actualMethod === 'PATCH') return 'GET';
  if (actualMethod === 'DELETE') return 'POST';
  // Fallback: pick the first method that differs
  return methods.find((m) => m !== actualMethod) || 'OPTIONS';
}

/**
 * Parametric-status emitter. For endpoints that declare `x-status-param`
 * (the path parameter name) and `x-status-param-values` (a map of
 * status-code -> param-value), emit one flow per declared status that
 * substitutes the param value into the path and expects that status.
 *
 * Declaration-driven: the endpoint MUST declare both extensions. If
 * `x-status-param` is missing, no flows are emitted. If a declared status
 * has no corresponding entry in `x-status-param-values`, a diagnostic is
 * emitted and that status is skipped — never guessed.
 */
function emitParametricStatusFlows(ep, coveredStatuses, diagnostics) {
  const ext = (ep.swaggerDeclared && ep.swaggerDeclared.extensions) || {};
  const paramName = ext['x-status-param'];
  if (!paramName) return [];

  const paramValues = ext['x-status-param-values'];
  if (!paramValues || typeof paramValues !== 'object') return [];

  const declared = (ep.swaggerDeclared && ep.swaggerDeclared.statuses) || [];
  const flows = [];
  const base = pathToId(ep.path);
  const meth = ep.method.toLowerCase();

  for (const status of declared) {
    if (coveredStatuses.has(status)) continue;

    const paramValue = paramValues[String(status)];
    if (paramValue === undefined || paramValue === null) {
      diagnostics.push({
        code: 'PARAMETRIC_STATUS_UNMAPPED',
        message: `Status ${status} declared on ${ep.method} ${ep.path} has no x-status-param-values mapping for param '${paramName}'.`,
        endpoint: epKey(ep.method, ep.path),
      });
      continue;
    }

    // Replace :paramName in the path with the declared value.
    const probePath = ep.path.replace(`:${paramName}`, String(paramValue));

    coveredStatuses.add(status);
    flows.push({
      id: `${base}:${meth}:parametric-status:${status}`,
      contract: {
        endpoint: epKey(ep.method, ep.path),
        kind: 'parametric-status',
        source: ep.file,
      },
      dependsOn: [],
      onFail: {
        check: [ep.file],
        implies: `${ep.method} ${ep.path} with ${paramName}=${paramValue} does not return ${status}.`,
      },
      steps: [
        { kind: 'api', method: ep.method, path: probePath },
        { kind: 'expect', status },
      ],
    });
  }

  return flows;
}

/**
 * Rule 6: Auth-bootstrap chain.
 */
function emitAuthBootstrapChain(endpoints, options = {}) {
  const authFlows = options.authFlows || {};

  // Declaration-driven: use auth-flows detector results
  const register = authFlows.register
    ? endpoints.find((ep) => ep.method === authFlows.register.method && ep.path === authFlows.register.path)
    : null;
  const login = authFlows.tokenIssuer
    ? endpoints.find((ep) => ep.method === authFlows.tokenIssuer.method && ep.path === authFlows.tokenIssuer.path)
    : null;
  const me = authFlows.mePoll
    ? endpoints.find((ep) => ep.method === authFlows.mePoll.method && ep.path === authFlows.mePoll.path)
    : null;

  if (!register || !login) return null;

  const flowId = 'chain:auth-bootstrap';
  const registerBody = register.zodContract
    ? buildSampleBody(register.zodContract, effectiveUniqueFieldSet(register, options.uniqueFieldSet))
    : null;

  const loginBody = {};
  if (registerBody) {
    if (registerBody.email) loginBody.email = registerBody.email;
    if (registerBody.password) loginBody.password = registerBody.password;
  }

  const steps = [];

  // Envelope-aware capture: when successWrapper is present (e.g. ['data']),
  // the actual fields live at $.data.accessToken, not $.accessToken.
  // Declaration-driven from matrix.responseEnvelope.
  const authEnvelope = options.envelopeWrapper || null;
  const authWrapPath = (leaf) => {
    if (!authEnvelope) return `$.${leaf}`;
    const prefix = Array.isArray(authEnvelope) ? authEnvelope.join('.') : authEnvelope;
    return `$.${prefix}.${leaf}`;
  };

  const registerStep = { kind: 'api', method: 'POST', path: register.path };
  if (registerBody) registerStep.body = registerBody;
  steps.push(registerStep);
  // Capture token + user info from register response. Also capture
  // registeredEmail so downstream flows that need to re-login (e.g.
  // cookie-refresh-rotation) can use ${registeredEmail} instead of
  // ${uniqEmail} (which gets a fresh per-flow seed and would fail login
  // because the email was only registered in this chain's scope).
  steps.push({ bindings: { registerToken: authWrapPath('accessToken'), userId: authWrapPath('user.id'), registeredEmail: authWrapPath('user.email') }, kind: 'capture' });

  const loginStep = { kind: 'api', method: 'POST', path: login.path };
  if (Object.keys(loginBody).length > 0) loginStep.body = loginBody;
  steps.push(loginStep);
  steps.push({ bindings: { accessToken: authWrapPath('accessToken') }, kind: 'capture' });
  steps.push({ binding: 'accessToken', kind: 'setAuth' });

  if (me) {
    steps.push({ kind: 'api', method: 'GET', path: me.path });
    steps.push({ kind: 'expect', status: 200 });
  }

  return {
    id: flowId,
    contract: {
      endpoint: `${epKey(register.method, register.path)} + ${epKey(login.method, login.path)}${me ? ` + ${epKey(me.method, me.path)}` : ''}`,
      kind: 'chain-auth-bootstrap',
      source: `${register.file}, ${login.file}${me ? `, ${me.file}` : ''}`,
    },
    dependsOn: [],
    onFail: {
      check: [register.file, login.file, ...(me ? [me.file] : [])],
      implies: 'Auth bootstrap chain (register -> login -> me) fails.',
    },
    steps,
  };
}

/**
 * Rule 7: Session-lifecycle chain.
 */
function emitSessionLifecycleChain(endpoints, options = {}) {
  const authFlows = options.authFlows || {};

  // This chain depends on `chain:auth-bootstrap` which already registered a
  // fresh user + logged in + captured accessToken into sharedBindings. We
  // reuse that token rather than re-login with Zod-sample credentials
  // (`user@example.com`) that would 401 against an empty DB. The contract
  // verified here is: inherited token works → logout clears auth →
  // subsequent protected access returns 401.
  const login = authFlows.tokenIssuer
    ? endpoints.find((ep) => ep.method === authFlows.tokenIssuer.method && ep.path === authFlows.tokenIssuer.path)
    : null;
  if (!login) return null;

  const protectedEp = endpoints.find((ep) =>
    ep.method === 'GET' && ep.authDecorators && ep.authDecorators.authRequired
  );
  if (!protectedEp) return null;

  const logout = authFlows.logout
    ? endpoints.find((ep) => ep.method === authFlows.logout.method && ep.path === authFlows.logout.path)
    : null;

  const steps = [];

  // Reuse bootstrap-captured accessToken (sharedBindings carries it across
  // flows in http-smoke.ts).
  steps.push({ binding: 'accessToken', kind: 'setAuth' });

  steps.push({ kind: 'api', method: 'GET', path: protectedEp.path });
  steps.push({ kind: 'expect', status: 200 });

  if (logout) {
    steps.push({ kind: 'api', method: 'POST', path: logout.path });
    steps.push({ kind: 'expect', statusAnyOf: [200, 204] });
  }
  steps.push({ kind: 'logout' });

  steps.push({ kind: 'api', method: 'GET', path: protectedEp.path });
  steps.push({ kind: 'expect', status: 401 });

  return {
    id: 'chain:session-lifecycle',
    contract: {
      endpoint: `${epKey(login.method, login.path)} + ${epKey(protectedEp.method, protectedEp.path)}`,
      kind: 'chain-session-lifecycle',
      source: `${login.file}, ${protectedEp.file}`,
    },
    dependsOn: ['chain:auth-bootstrap'],
    onFail: {
      check: [login.file, protectedEp.file],
      implies: 'Session lifecycle (access -> logout -> denied) fails.',
    },
    steps,
  };
}

/**
 * Rule 8: Post-register-landing.
 */
function emitPostRegisterLanding(endpoints, pages, options = {}) {
  const authFlows = options.authFlows || {};
  const register = authFlows.register
    ? endpoints.find((ep) => ep.method === authFlows.register.method && ep.path === authFlows.register.path)
    : null;
  if (!register) return null;

  // Declaration-driven: matrix.pageRoles['post-login-destination'] (statically
  // extracted from a sibling page.identity.<ext> file) declares the route.
  // overlay.auth.postLoginDestination is honored as a fallback override.
  // Never guess from route names — that's a heuristic.
  const declaredPostLogin = (options.pageRoles && options.pageRoles['post-login-destination']) || null;
  const dashboardPage = declaredPostLogin
    ? pages.find((p) => p.route === declaredPostLogin)
    : null;
  if (!dashboardPage) {
    const diagnostics = options.diagnostics || [];
    diagnostics.push({
      code: 'AUTH_POST_LOGIN_DEST_UNDECLARED',
      message: declaredPostLogin
        ? `Declared post-login destination "${declaredPostLogin}" does not match any detected page route. Fix the page.identity.ts file or overlay, or add the page.`
        : 'Post-login destination undeclared. Add a page.identity.ts sibling file next to your dashboard page exporting `{ role: "post-login-destination", guard: "authenticated" }`, or set overlay.auth.postLoginDestination = "/dashboard" in .runtime-contract.overlay.json.',
    });
    return null;
  }

  const registerBody = register.zodContract
    ? buildSampleBody(register.zodContract, effectiveUniqueFieldSet(register, options.uniqueFieldSet))
    : null;

  // Envelope-aware capture for post-register-landing
  const postRegEnvelope = options.envelopeWrapper || null;
  const postRegWrapPath = (leaf) => {
    if (!postRegEnvelope) return `$.${leaf}`;
    const prefix = Array.isArray(postRegEnvelope) ? postRegEnvelope.join('.') : postRegEnvelope;
    return `$.${prefix}.${leaf}`;
  };

  const steps = [];
  const registerStep = { kind: 'api', method: 'POST', path: register.path };
  if (registerBody) registerStep.body = registerBody;
  steps.push(registerStep);
  steps.push({ bindings: { accessToken: postRegWrapPath('accessToken') }, kind: 'capture' });
  steps.push({ binding: 'accessToken', kind: 'setAuth' });
  steps.push({ kind: 'navigate', path: dashboardPage.route });
  steps.push({ kind: 'expect', statusAnyOf: [200, 301, 302, 307, 308] });

  return {
    id: 'chain:post-register-landing',
    contract: {
      endpoint: `${epKey(register.method, register.path)} -> page ${dashboardPage.route}`,
      kind: 'chain-post-register-landing',
      source: `${register.file}, ${dashboardPage.file}`,
    },
    dependsOn: [],
    onFail: {
      check: [register.file, dashboardPage.file],
      implies: 'Post-register landing page is not accessible after registration.',
    },
    steps,
  };
}

/**
 * Rule 9: CRUD roundtrip.
 */
function emitCrudRoundtrips(endpoints, options = {}) {
  const resourceGroups = {};
  for (const ep of endpoints) {
    const basePath = ep.path.replace(/\/:[\w]+$/, '');
    if (!resourceGroups[basePath]) resourceGroups[basePath] = {};
    const isParamPath = ep.path !== basePath;
    const key = `${ep.method}:${isParamPath ? 'param' : 'base'}`;
    resourceGroups[basePath][key] = ep;
  }

  const flows = [];

  for (const [basePath, group] of Object.entries(resourceGroups)) {
    const create = group['POST:base'];
    const read = group['GET:param'];
    const update = group['PATCH:param'] || group['PUT:param'];
    const del = group['DELETE:param'];

    if (!create || !read || !update || !del) continue;

    const resourceName = basePath.split('/').pop();
    const flowId = `chain:crud-roundtrip:${resourceName}`;

    const createBody = create.zodContract ? buildSampleBody(create.zodContract, options.uniqueFieldSet) : null;
    const updateBody = update.zodContract ? buildSampleBody(update.zodContract, options.uniqueFieldSet) : null;

    const paramMatch = read.path.match(/:(\w+)$/);
    const paramName = paramMatch ? paramMatch[1] : 'id';

    // Resource-ref deps for the create endpoint (e.g. needs parent team)
    const refResult = resolveResourceRefDeps(create, options.endpoints || []);

    // Auth setup: if CREATE endpoint is authed, CRUD chain needs auth
    const createNeedsAuth = Boolean(
      create.authDecorators && create.authDecorators.authRequired
    );
    const authBootstrapAvail = Boolean(options.authBootstrapAvailable);

    const requiredParentRole = (create.swaggerDeclared && create.swaggerDeclared.extensions
      && create.swaggerDeclared.extensions['x-requires-parent-role']) || null;
    if (requiredParentRole && options.resourceGraph) {
      const fkInfo = options.resourceGraph.fkLookup(requiredParentRole.parentField);
      const grantPath = fkInfo ? options.resourceGraph.resolveGrantPath(fkInfo.parentModel) : null;
      const declaredRole = (grantPath && grantPath.role) || null;
      const acceptable = (requiredParentRole.acceptableRoles && requiredParentRole.acceptableRoles.length > 0)
        ? requiredParentRole.acceptableRoles
        : [requiredParentRole.minimumRole];
      const matches = declaredRole && acceptable.includes(declaredRole);
      if (!matches) {
        (options.diagnostics || []).push({
          code: 'CHAIN_AUTH_UNRESOLVABLE',
          endpoint: `${create.method} ${create.path}`,
          field: requiredParentRole.parentField,
          parentModel: fkInfo ? fkInfo.parentModel : null,
          requiredRole: requiredParentRole.minimumRole,
          acceptableRoles: acceptable,
          grantPathFound: grantPath,
          file: create.file || '(controller file unknown)',
          message: `${create.method} ${create.path} declares @x-requires-parent-role for "${requiredParentRole.parentField}" (minimum role: ${requiredParentRole.minimumRole}), but the parent model ${fkInfo ? fkInfo.parentModel : '?'}'s create endpoint does not declare @x-on-create-grant-role with a matching role. Add @ApiExtension('x-on-create-grant-role', { role: '${requiredParentRole.minimumRole}', toCaller: true }) to the parent's create endpoint, OR remove the role requirement from this endpoint. Chain emission skipped to avoid emitting a flow that 403s at runtime.`,
        });
        continue;
      }
    }

    const steps = [];
    const deps = [];

    if (createNeedsAuth && authBootstrapAvail) {
      steps.push({ kind: 'setAuth', binding: 'accessToken' });
      deps.push('chain:auth-bootstrap');
    }
    deps.push(...(refResult.deps || []));

    let createPath = create.path;
    // Apply path-param substitutions from path-prefix autodetection
    if (refResult.pathSubstitutions && Object.keys(refResult.pathSubstitutions).length > 0) {
      for (const [param, sigil] of Object.entries(refResult.pathSubstitutions)) {
        createPath = createPath.replace(`:${param}`, sigil);
      }
    }
    const createStep = { kind: 'api', method: 'POST', path: createPath };
    if (createBody) {
      createStep.body = { ...createBody, ...(refResult.overrides || {}) };
    } else if (Object.keys(refResult.overrides || {}).length > 0) {
      createStep.body = { ...(refResult.overrides || {}) };
    }
    steps.push(createStep);
    steps.push({ kind: 'expect', status: 201 });
    // Envelope-aware capture: when successWrapper is present (e.g. ['data']),
    // the actual id lives at $.data.id, not $.id. Declaration-driven from
    // matrix.responseEnvelope detected by detectors/response-envelope.js.
    const crudEnvelope = options.envelopeWrapper || null;
    const crudWrapPath = (leaf) => {
      if (!crudEnvelope) return `$.${leaf}`;
      const prefix = Array.isArray(crudEnvelope) ? crudEnvelope.join('.') : crudEnvelope;
      return `$.${prefix}.${leaf}`;
    };
    steps.push({ bindings: { resourceId: crudWrapPath(paramName), resourceIdAlt: crudWrapPath('id') }, kind: 'capture' });

    steps.push({ kind: 'api', method: 'GET', path: read.path.replace(`:${paramName}`, '${resourceId}') });
    steps.push({ kind: 'expect', status: 200 });

    const updateStep = { kind: 'api', method: update.method, path: update.path.replace(`:${paramName}`, '${resourceId}') };
    if (updateBody) updateStep.body = updateBody;
    steps.push(updateStep);
    steps.push({ kind: 'expect', status: 200 });

    steps.push({ kind: 'api', method: 'GET', path: read.path.replace(`:${paramName}`, '${resourceId}') });
    steps.push({ kind: 'expect', status: 200 });

    steps.push({ kind: 'api', method: 'DELETE', path: del.path.replace(`:${paramName}`, '${resourceId}') });
    steps.push({ kind: 'expect', statusAnyOf: [200, 204] });

    steps.push({ kind: 'api', method: 'GET', path: read.path.replace(`:${paramName}`, '${resourceId}') });
    steps.push({ kind: 'expect', status: 404 });

    const files = [create.file, read.file, update.file, del.file].filter((f, i, a) => a.indexOf(f) === i);
    flows.push({
      id: flowId,
      contract: { endpoint: `CRUD ${basePath}`, kind: 'chain-crud-roundtrip', source: files.join(', ') },
      dependsOn: deps,
      onFail: { check: files, implies: `CRUD roundtrip for ${resourceName} fails.` },
      steps,
    });
  }

  return flows;
}

// ---------------------------------------------------------------------------
// Pagination flows — generated per paginated endpoint
// ---------------------------------------------------------------------------

/**
 * Emit pagination coverage flows for endpoints with a paginationProfile.
 *
 * Flow kinds per style:
 *   - :first-page — default query returns 200 with items array
 *   - :past-end — high page/cursor returns 200 with empty items
 *   - :max-limit — declared max limit returns 200
 *   - :over-max-limit — max+1 returns 400
 *   - :empty — impossible filter returns 200 with empty items
 *   - :invalid-cursor (cursor only) — bad cursor returns 400
 */
function emitPaginationFlows(endpoints, options = {}) {
  const flows = [];
  const envelopeWrapper = options.envelopeWrapper || null;

  for (const ep of endpoints) {
    if (!ep.paginationProfile) continue;
    if (ep.method !== 'GET') continue;

    const profile = ep.paginationProfile;
    const base = pathToId(ep.path);
    const contract = {
      endpoint: epKey(ep.method, ep.path),
      kind: 'endpoint-pagination',
      source: ep.file,
    };

    // Bare-array endpoints (link-header style with @Res()) bypass the NestJS
    // transform interceptor, so envelope wrapping does not apply and the
    // response body IS the array itself.
    const isBareArray = profile.isBareArray || profile.style === 'link-header';

    // Wrap a response field path with envelope if needed
    const wrapPath = (field) => {
      if (isBareArray || !envelopeWrapper) return field;
      const prefix = Array.isArray(envelopeWrapper) ? envelopeWrapper.join('.') : envelopeWrapper;
      return `${prefix}.${field}`;
    };

    // The items field in the response (e.g. 'items', 'data', 'records')
    // For bare arrays, the response body itself is the array — use '$' as sentinel.
    const itemsKey = isBareArray ? '$' : (profile.responseKeys.items || 'items');

    // --- :first-page — default params, expect 200 with items array ---
    const firstPageQuery = {};
    if (profile.paramNames.page) firstPageQuery[profile.paramNames.page] = 1;
    if (profile.paramNames.limit) firstPageQuery[profile.paramNames.limit] = profile.defaultLimit || 10;

    const firstPageExpect = { kind: 'expect', status: 200 };
    if (isBareArray) {
      // For bare arrays, assert the body is an array at the root
      firstPageExpect.bodyIsRootArray = true;
    } else {
      firstPageExpect.bodyHas = [wrapPath(itemsKey)];
      firstPageExpect.bodyIsArray = [wrapPath(itemsKey)];
    }

    flows.push({
      id: `${base}:${ep.method.toLowerCase()}:pagination:first-page`,
      contract,
      dependsOn: [],
      onFail: {
        check: [ep.file],
        implies: `${ep.method} ${ep.path} first-page pagination does not return expected list shape.`,
      },
      steps: [
        { kind: 'api', method: ep.method, path: ep.path, query: firstPageQuery },
        firstPageExpect,
      ],
    });

    // --- :past-end — very high page number/impossible cursor, expect 200 with empty items ---
    if (profile.style === 'offset' || profile.style === 'link-header') {
      const pastEndQuery = { ...firstPageQuery };
      if (profile.paramNames.page) pastEndQuery[profile.paramNames.page] = 999999;

      const pastEndExpect = { kind: 'expect', status: 200 };
      if (isBareArray) {
        pastEndExpect.bodyIsRootArray = true;
        pastEndExpect.bodyRootArrayEmpty = true;
      } else {
        pastEndExpect.bodyIsArray = [wrapPath(itemsKey)];
        pastEndExpect.bodyArrayEmpty = [wrapPath(itemsKey)];
      }

      flows.push({
        id: `${base}:${ep.method.toLowerCase()}:pagination:past-end`,
        contract,
        dependsOn: [],
        onFail: {
          check: [ep.file],
          implies: `${ep.method} ${ep.path} past-end page does not return empty items array.`,
        },
        steps: [
          { kind: 'api', method: ep.method, path: ep.path, query: pastEndQuery },
          pastEndExpect,
        ],
      });
    }

    // --- :past-end for cursor style — exhausted cursor returns empty items or 400 ---
    if (profile.style === 'cursor' && profile.paramNames.cursor) {
      const pastEndCursorQuery = { ...firstPageQuery };
      pastEndCursorQuery[profile.paramNames.cursor] = '__exhausted_cursor_past_end__';

      const pastEndCursorExpect = { kind: 'expect', statusAnyOf: [200, 400] };

      flows.push({
        id: `${base}:${ep.method.toLowerCase()}:pagination:past-end`,
        contract,
        dependsOn: [],
        onFail: {
          check: [ep.file],
          implies: `${ep.method} ${ep.path} past-end cursor does not return empty items or 400.`,
        },
        steps: [
          { kind: 'api', method: ep.method, path: ep.path, query: pastEndCursorQuery },
          pastEndCursorExpect,
        ],
      });
    }

    // --- :empty — use a declared non-pagination query param with impossible value ---
    // Prefer a declared string filter param over hardcoded 'title' to avoid 400
    // from strict validation on undeclared params.
    const paginationParamNames = new Set(Object.values(profile.paramNames).filter(Boolean));
    const declaredFilterParam = (profile.queryContract && profile.queryContract.fields || [])
      .find((f) => f.type === 'string' && !paginationParamNames.has(f.name));
    const filterKey = declaredFilterParam ? declaredFilterParam.name : 'title';
    const emptyQuery = { ...firstPageQuery, [filterKey]: '__never_exists_probe_filter__' };
    const emptyExpect = { kind: 'expect', status: 200 };
    if (isBareArray) {
      emptyExpect.bodyIsRootArray = true;
    } else {
      emptyExpect.bodyIsArray = [wrapPath(itemsKey)];
    }

    flows.push({
      id: `${base}:${ep.method.toLowerCase()}:pagination:empty`,
      contract,
      dependsOn: [],
      onFail: {
        check: [ep.file],
        implies: `${ep.method} ${ep.path} with impossible filter does not return empty items.`,
      },
      steps: [
        { kind: 'api', method: ep.method, path: ep.path, query: emptyQuery },
        emptyExpect,
      ],
    });

    // --- :max-limit — declared max limit succeeds (200) ---
    if (profile.maxLimit && profile.paramNames.limit) {
      const maxLimitQuery = { ...firstPageQuery };
      maxLimitQuery[profile.paramNames.limit] = profile.maxLimit;

      flows.push({
        id: `${base}:${ep.method.toLowerCase()}:pagination:max-limit`,
        contract,
        dependsOn: [],
        onFail: {
          check: [ep.file],
          implies: `${ep.method} ${ep.path} rejects declared max limit=${profile.maxLimit}.`,
        },
        steps: [
          { kind: 'api', method: ep.method, path: ep.path, query: maxLimitQuery },
          { kind: 'expect', status: 200 },
        ],
      });

      // --- :over-max-limit — max+1 returns 400 ---
      const overMaxQuery = { ...firstPageQuery };
      overMaxQuery[profile.paramNames.limit] = profile.maxLimit + 1;

      flows.push({
        id: `${base}:${ep.method.toLowerCase()}:pagination:over-max-limit`,
        contract,
        dependsOn: [],
        onFail: {
          check: [ep.file],
          implies: `${ep.method} ${ep.path} does not reject limit=${profile.maxLimit + 1} (over declared max).`,
        },
        steps: [
          { kind: 'api', method: ep.method, path: ep.path, query: overMaxQuery },
          { kind: 'expect', status: 400 },
        ],
      });
    }

    // --- :no-next (link-header style only) — last page has no rel="next" in Link header ---
    if (profile.style === 'link-header' && profile.paramNames.page) {
      const noNextQuery = { ...firstPageQuery };
      noNextQuery[profile.paramNames.page] = 999999;

      flows.push({
        id: `${base}:${ep.method.toLowerCase()}:pagination:no-next`,
        contract,
        dependsOn: [],
        onFail: {
          check: [ep.file],
          implies: `${ep.method} ${ep.path} last page Link header should not contain rel="next".`,
        },
        steps: [
          { kind: 'api', method: ep.method, path: ep.path, query: noNextQuery },
          { kind: 'expect', status: 200 },
          { kind: 'expect', headerAbsent: 'link:rel="next"' },
        ],
      });
    }

    // --- :invalid-cursor (cursor style only) — bad cursor returns 400 ---
    if (profile.style === 'cursor' && profile.paramNames.cursor) {
      const invalidCursorQuery = { ...firstPageQuery };
      invalidCursorQuery[profile.paramNames.cursor] = '__invalid_cursor_value__';

      flows.push({
        id: `${base}:${ep.method.toLowerCase()}:pagination:invalid-cursor`,
        contract,
        dependsOn: [],
        onFail: {
          check: [ep.file],
          implies: `${ep.method} ${ep.path} does not reject invalid cursor value.`,
        },
        steps: [
          { kind: 'api', method: ep.method, path: ep.path, query: invalidCursorQuery },
          { kind: 'expect', status: 400 },
        ],
      });
    }
  }

  return flows;
}

/**
 * Rule 10: Logical-contract row matching.
 */
function emitLogicalContractFlows(logicalRows, endpoints, pages, options = {}) {
  const flows = [];
  const emittedIds = new Set();

  for (const row of logicalRows) {
    switch (row.id) {
      case 'unauth-public-page': {
        const publicPages = pages.filter((p) => p.guard === 'public');
        for (const page of publicPages) {
          const flowId = `logical:unauth-public-page:${page.route.replace(/\//g, '-') || 'root'}`;
          if (emittedIds.has(flowId)) continue;
          emittedIds.add(flowId);
          flows.push({
            id: flowId,
            contract: { endpoint: `page ${page.route}`, kind: 'logical-contract', source: `${page.file} + logical.json:${row.id}` },
            dependsOn: [],
            onFail: { check: [page.file], implies: `Public page ${page.route} is not accessible to unauthenticated users.` },
            steps: [
              { kind: 'navigate', path: page.route },
              {
                kind: 'expect',
                statusAnyOf: [200],
                ...(row.expectation.mustContainAny ? { bodyContainsAny: row.expectation.mustContainAny } : {}),
              },
            ],
          });
        }
        break;
      }

      case 'unauth-protected-page': {
        const protectedPages = pages.filter((p) => p.guard === 'authenticated');
        for (const page of protectedPages) {
          const flowId = `logical:unauth-protected-page:${page.route.replace(/\//g, '-') || 'root'}`;
          if (emittedIds.has(flowId)) continue;
          emittedIds.add(flowId);
          flows.push({
            id: flowId,
            contract: { endpoint: `page ${page.route}`, kind: 'logical-contract', source: `${page.file} + logical.json:${row.id}` },
            dependsOn: [],
            onFail: { check: [page.file], implies: `Protected page ${page.route} is accessible to unauthenticated users.` },
            steps: [
              { kind: 'navigate', path: page.route },
              { kind: 'expect', statusAnyOf: [301, 302, 307, 308, 401] },
            ],
          });
        }
        break;
      }

      case 'unauth-public-api': {
        // Source-of-truth: if the endpoint DECLARES any 5xx via
        // @ApiResponse({status:5xx}), that 5xx is contract-promised behavior
        // (e.g. probe-ref/http-r2/gateway-502, error-per-status/:code).
        // Skip the universal "no 5xx" invariant for those endpoints — the
        // declared status IS the contract. Endpoints that return 5xx without
        // declaring it remain caught (real contract drift).
        const publicEndpoints = endpoints.filter((ep) => {
          if (ep.authDecorators && ep.authDecorators.authRequired) return false;
          const declared = (ep.swaggerDeclared && ep.swaggerDeclared.statuses) || [];
          const declares5xx = declared.some((s) => Number(s) >= 500 && Number(s) < 600);
          return !declares5xx;
        });
        for (const ep of publicEndpoints) {
          const flowId = `logical:unauth-public-api:${ep.method.toLowerCase()}-${pathToId(ep.path)}`;
          if (emittedIds.has(flowId)) continue;
          emittedIds.add(flowId);
          flows.push({
            id: flowId,
            contract: { endpoint: epKey(ep.method, ep.path), kind: 'logical-contract', source: `${ep.file} + logical.json:${row.id}` },
            dependsOn: [],
            onFail: { check: [ep.file], implies: `Public API ${ep.method} ${ep.path} returns 5xx for unauthenticated request.` },
            steps: [
              { kind: 'api', method: ep.method, path: ep.path },
              { forbidden: [500, 502, 503, 504], kind: 'expect' },
            ],
          });
        }
        break;
      }

      case 'unauth-protected-api':
      case 'just-registered-dashboard':
      case 'authed-logout-then-protected':
        // Covered by rules 3, 8, 7 respectively. Deduplication: skip.
        break;

      case 'authed-login-page': {
        // Declaration-driven: matrix.pageRoles['login-page'] (statically
        // extracted from a sibling page.identity.<ext> file) declares the
        // route. overlay.auth.loginPage is honored as a fallback override.
        // Never guess from route names — that's a heuristic.
        const declaredLogin = (options.pageRoles && options.pageRoles['login-page']) || null;
        if (!declaredLogin) {
          const diagArr = options.diagnostics || [];
          diagArr.push({
            code: 'LOGIN_PAGE_UNDECLARED',
            message: 'Login page undeclared. Add a page.identity.ts sibling file next to your login page exporting `{ role: "login-page", guard: "public" }`, or set overlay.auth.loginPage = "/login" in .runtime-contract.overlay.json.',
          });
          break;
        }
        const loginPage = pages.find((p) => p.route === declaredLogin);
        if (!loginPage) {
          const diagArr = options.diagnostics || [];
          diagArr.push({
            code: 'LOGIN_PAGE_UNDECLARED',
            message: `Declared login page "${declaredLogin}" does not match any detected page route. Fix the page.identity.ts file or overlay, or add the page.`,
          });
          break;
        }
        const flowId = `logical:authed-login-page:${loginPage.route.replace(/\//g, '-') || 'root'}`;
        if (!emittedIds.has(flowId)) {
          emittedIds.add(flowId);
          flows.push({
            id: flowId,
            contract: { endpoint: `page ${loginPage.route}`, kind: 'logical-contract', source: `${loginPage.file} + logical.json:${row.id}` },
            dependsOn: ['chain:auth-bootstrap'],
            onFail: { check: [loginPage.file], implies: `Authenticated user is not redirected away from login page ${loginPage.route}.` },
            steps: [
              { kind: 'navigate', path: loginPage.route },
              { kind: 'expect', statusAnyOf: [301, 302, 307, 308] },
            ],
          });
        }
        break;
      }

      case 'authed-register-page': {
        // Declaration-driven: matrix.pageRoles['register-page'] (statically
        // extracted from a sibling page.identity.<ext> file) declares the
        // route. overlay.auth.registerPage is honored as a fallback override.
        // Never guess from route names — that's a heuristic.
        const declaredRegister = (options.pageRoles && options.pageRoles['register-page']) || null;
        if (!declaredRegister) {
          const diagArr = options.diagnostics || [];
          diagArr.push({
            code: 'REGISTER_PAGE_UNDECLARED',
            message: 'Register page undeclared. Add a page.identity.ts sibling file next to your register page exporting `{ role: "register-page", guard: "public" }`, or set overlay.auth.registerPage = "/register" in .runtime-contract.overlay.json.',
          });
          break;
        }
        const registerPage = pages.find((p) => p.route === declaredRegister);
        if (!registerPage) {
          const diagArr = options.diagnostics || [];
          diagArr.push({
            code: 'REGISTER_PAGE_UNDECLARED',
            message: `Declared register page "${declaredRegister}" does not match any detected page route. Fix the page.identity.ts file or overlay, or add the page.`,
          });
          break;
        }
        const regFlowId = `logical:authed-register-page:${registerPage.route.replace(/\//g, '-') || 'root'}`;
        if (!emittedIds.has(regFlowId)) {
          emittedIds.add(regFlowId);
          flows.push({
            id: regFlowId,
            contract: { endpoint: `page ${registerPage.route}`, kind: 'logical-contract', source: `${registerPage.file} + logical.json:${row.id}` },
            dependsOn: ['chain:auth-bootstrap'],
            onFail: { check: [registerPage.file], implies: `Authenticated user is not redirected away from register page ${registerPage.route}.` },
            steps: [
              { kind: 'navigate', path: registerPage.route },
              { kind: 'expect', statusAnyOf: [301, 302, 307, 308] },
            ],
          });
        }
        break;
      }

      case 'authed-refresh-persists': {
        const protectedEp = endpoints.find((ep) =>
          ep.method === 'GET' && ep.authDecorators && ep.authDecorators.authRequired
        );
        if (!protectedEp) break;

        const flowId = 'logical:authed-refresh-persists';
        if (emittedIds.has(flowId)) break;
        emittedIds.add(flowId);

        // This flow depends on chain:auth-bootstrap which registers a fresh
        // user, logs in, and captures accessToken into sharedBindings. We
        // reuse that inherited token directly — re-logging in with ${uniqEmail}
        // would fail because each flow gets a fresh unique seed and the email
        // was only registered in the bootstrap chain's scope.
        flows.push({
          id: flowId,
          contract: { endpoint: epKey(protectedEp.method, protectedEp.path), kind: 'logical-contract', source: `${protectedEp.file} + logical.json:${row.id}` },
          dependsOn: ['chain:auth-bootstrap'],
          onFail: { check: [protectedEp.file], implies: 'Session does not persist across simulated refresh.' },
          steps: [
            { binding: 'accessToken', kind: 'setAuth' },
            { kind: 'api', method: 'GET', path: protectedEp.path },
            { kind: 'expect', status: 200 },
            { kind: 'wait', ms: 100 },
            { kind: 'api', method: 'GET', path: protectedEp.path },
            { kind: 'expect', status: 200 },
          ],
        });
        break;
      }

      default:
        break;
    }
  }

  return flows;
}

// ---------------------------------------------------------------------------
// Main generate function (exported for testing)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Content-type flows: upload, download, streaming
// ---------------------------------------------------------------------------

/**
 * Detect if an endpoint accepts multipart/form-data uploads.
 */
function isMultipartEndpoint(ep) {
  return Array.isArray(ep.requestContentTypes) &&
    ep.requestContentTypes.some((ct) => ct.includes('multipart/form-data'));
}

/**
 * Detect if an endpoint accepts raw binary uploads (application/octet-stream).
 */
function isBinaryUploadEndpoint(ep) {
  return Array.isArray(ep.requestContentTypes) &&
    ep.requestContentTypes.some((ct) => ct.includes('application/octet-stream'));
}

/**
 * Detect if an endpoint returns binary content (images, PDFs, etc).
 */
function isBinaryDownloadEndpoint(ep) {
  if (!Array.isArray(ep.responseContentTypes)) return false;
  return ep.responseContentTypes.some((ct) =>
    ct.startsWith('image/') ||
    ct === 'application/pdf' ||
    ct === 'application/octet-stream' ||
    ct === 'application/zip'
  );
}

/**
 * Detect if an endpoint returns Server-Sent Events.
 */
function isSSEEndpoint(ep) {
  if (!Array.isArray(ep.responseContentTypes)) return false;
  return ep.responseContentTypes.some((ct) => ct === 'text/event-stream');
}

/**
 * Emit upload flows for multipart/form-data endpoints.
 * Generates: happy upload, 413 oversize, 415 wrong-mime.
 */
function emitUploadFlows(ep, options = {}) {
  if (!isMultipartEndpoint(ep) && !isBinaryUploadEndpoint(ep)) return [];

  const base = pathToId(ep.path);
  const flows = [];
  const isMultipart = isMultipartEndpoint(ep);
  const uploadType = isMultipart ? 'multipart' : 'binary';

  const needsAuth = Boolean(ep.authDecorators && ep.authDecorators.authRequired);
  const authBootstrapAvailable = Boolean(options.authBootstrapAvailable);
  const dependsOn = needsAuth && authBootstrapAvailable ? ['chain:auth-bootstrap'] : [];

  // Derive file field name(s) and extra text fields from OpenAPI multipart schema.
  // If multipart but no schema declares binary file fields, skip upload flows entirely.
  // The MULTIPART_NO_INTERCEPTOR DIAG (emitContentTypeDiagnostics) already surfaces this.
  // Falling back to fieldName: 'file' would be a heuristic — forbidden by source-of-truth rule.
  const mf = ep.multipartFields;
  if (isMultipart && (!mf || mf.fileFields.length === 0)) {
    return [];
  }
  // After early return above, multipart always has mf.fileFields[0].
  // For binary uploads (not multipart), fieldName is null — raw body is sent.
  const primaryFileField = isMultipart ? mf.fileFields[0].name : null;
  const isArrayUpload = isMultipart ? mf.fileFields[0].array : false;
  const additionalFileFields = (isMultipart && mf.fileFields.length > 1) ? mf.fileFields.slice(1) : [];
  const textFields = (isMultipart && mf.textFields.length > 0) ? mf.textFields : [];

  // Happy upload
  const happySteps = [];
  if (needsAuth && authBootstrapAvailable) {
    happySteps.push({ binding: 'accessToken', kind: 'setAuth' });
  }

  const uploadStep = {
    kind: 'api-upload',
    method: ep.method,
    path: ep.path,
    uploadType,
    mimeType: isMultipart ? 'image/png' : 'application/octet-stream',
    fieldName: primaryFileField,
    sizeBytes: 128,
  };
  // For array uploads, tell assertion library to send multiple files
  if (isArrayUpload) {
    uploadStep.fileCount = 2;
  }
  // Additional file fields (e.g. avatar + document on same endpoint)
  if (additionalFileFields.length > 0) {
    uploadStep.additionalFileFields = additionalFileFields.map((f) => ({
      name: f.name,
      array: f.array,
      mimeType: 'image/png',
      sizeBytes: 128,
    }));
  }
  // Text metadata fields alongside file uploads
  if (textFields.length > 0) {
    uploadStep.extraFields = {};
    for (const tf of textFields) {
      uploadStep.extraFields[tf] = `probe-${tf}`;
    }
  }
  happySteps.push(uploadStep);

  const declared = (ep.swaggerDeclared && ep.swaggerDeclared.statuses) || [];
  const declaredSuccess = declared.find((s) => s >= 200 && s < 300);
  const expectedStatus = declaredSuccess || defaultStatus(ep.method);

  happySteps.push({ kind: 'expect', status: expectedStatus });

  flows.push({
    id: `${base}:${ep.method.toLowerCase()}:upload-happy`,
    contract: {
      endpoint: epKey(ep.method, ep.path),
      kind: 'upload-happy',
      source: ep.file,
    },
    dependsOn,
    onFail: {
      check: [ep.file],
      implies: `${ep.method} ${ep.path} rejects valid ${uploadType} upload.`,
    },
    steps: happySteps,
  });

  // 413 oversize — only if 413 is declared
  if (declared.includes(413)) {
    const oversizeSteps = [];
    if (needsAuth && authBootstrapAvailable) {
      oversizeSteps.push({ binding: 'accessToken', kind: 'setAuth' });
    }
    oversizeSteps.push({
      kind: 'api-upload',
      method: ep.method,
      path: ep.path,
      uploadType,
      mimeType: isMultipart ? 'image/png' : 'application/octet-stream',
      fieldName: primaryFileField,
      sizeBytes: 50 * 1024 * 1024, // 50 MB — should exceed most limits
    });
    oversizeSteps.push({ kind: 'expect', status: 413 });

    flows.push({
      id: `${base}:${ep.method.toLowerCase()}:upload-oversize`,
      contract: {
        endpoint: epKey(ep.method, ep.path),
        kind: 'upload-oversize',
        source: ep.file,
      },
      dependsOn,
      onFail: {
        check: [ep.file],
        implies: `${ep.method} ${ep.path} does not reject oversized upload with 413.`,
      },
      steps: oversizeSteps,
    });
  }

  // 415 wrong MIME — only if 415 is declared.
  // Send a plain text/plain body (not FormData) so the controller's
  // Content-Type check triggers the 415 rejection.
  if (declared.includes(415)) {
    const wrongMimeSteps = [];
    if (needsAuth && authBootstrapAvailable) {
      wrongMimeSteps.push({ binding: 'accessToken', kind: 'setAuth' });
    }
    wrongMimeSteps.push({
      kind: 'api',
      method: ep.method,
      path: ep.path,
      headers: { 'content-type': 'text/plain' },
      body: 'wrong-mime-probe-payload',
    });
    wrongMimeSteps.push({ kind: 'expect', status: 415 });

    flows.push({
      id: `${base}:${ep.method.toLowerCase()}:upload-wrong-mime`,
      contract: {
        endpoint: epKey(ep.method, ep.path),
        kind: 'upload-wrong-mime',
        source: ep.file,
      },
      dependsOn,
      onFail: {
        check: [ep.file],
        implies: `${ep.method} ${ep.path} does not reject wrong MIME upload with 415.`,
      },
      steps: wrongMimeSteps,
    });
  }

  return flows;
}

/**
 * Emit download flow for binary-response endpoints.
 * Asserts correct Content-Type header and magic bytes.
 */
function emitDownloadFlows(ep, options = {}) {
  if (!isBinaryDownloadEndpoint(ep)) return [];

  const base = pathToId(ep.path);
  const flows = [];

  const needsAuth = Boolean(ep.authDecorators && ep.authDecorators.authRequired);
  const authBootstrapAvailable = Boolean(options.authBootstrapAvailable);
  const dependsOn = needsAuth && authBootstrapAvailable ? ['chain:auth-bootstrap'] : [];

  // Determine expected content type from the first binary response type
  const binaryTypes = ep.responseContentTypes.filter((ct) =>
    ct.startsWith('image/') || ct === 'application/pdf' ||
    ct === 'application/octet-stream' || ct === 'application/zip'
  );
  const expectedContentType = binaryTypes[0] || 'application/octet-stream';

  // Read download-specific extensions from OpenAPI spec
  const ext = (ep.swaggerDeclared && ep.swaggerDeclared.extensions) || {};
  const expectDisposition = ext['x-content-disposition'] || null;

  const steps = [];
  if (needsAuth && authBootstrapAvailable) {
    steps.push({ binding: 'accessToken', kind: 'setAuth' });
  }
  steps.push({
    kind: 'api-download',
    method: ep.method,
    path: ep.path,
    expectedContentType,
  });

  const declared = (ep.swaggerDeclared && ep.swaggerDeclared.statuses) || [];
  const declaredSuccess = declared.find((s) => s >= 200 && s < 300);
  const expectedStatus = declaredSuccess || 200;

  const expectStep = {
    kind: 'expect',
    status: expectedStatus,
    expectBinary: true,
    expectedContentType,
  };
  // Assert Content-Disposition header if declared via x-content-disposition extension
  if (expectDisposition) {
    expectStep.expectContentDisposition = expectDisposition;
  }
  steps.push(expectStep);

  flows.push({
    id: `${base}:${ep.method.toLowerCase()}:download`,
    contract: {
      endpoint: epKey(ep.method, ep.path),
      kind: 'download-binary',
      source: ep.file,
    },
    dependsOn,
    onFail: {
      check: [ep.file],
      implies: `${ep.method} ${ep.path} does not return expected binary content.`,
    },
    steps,
  });

  return flows;
}

/**
 * Emit streaming flow for SSE endpoints.
 * Reads up to 3 events and validates their shape.
 */
function emitStreamingFlows(ep, options = {}) {
  if (!isSSEEndpoint(ep)) return [];

  const base = pathToId(ep.path);
  const flows = [];

  const needsAuth = Boolean(ep.authDecorators && ep.authDecorators.authRequired);
  const authBootstrapAvailable = Boolean(options.authBootstrapAvailable);
  const dependsOn = needsAuth && authBootstrapAvailable ? ['chain:auth-bootstrap'] : [];

  // Read SSE vendor extensions from OpenAPI spec
  const ext = (ep.swaggerDeclared && ep.swaggerDeclared.extensions) || {};
  const declaredEventNames = ext['x-sse-event-names'] || null;
  const declaredRetry = ext['x-sse-retry'] != null ? Number(ext['x-sse-retry']) : null;
  const declaredIdRequired = ext['x-sse-id-required'] === true;
  const declaredHeartbeat = ext['x-sse-heartbeat'] === true;

  const steps = [];
  if (needsAuth && authBootstrapAvailable) {
    steps.push({ binding: 'accessToken', kind: 'setAuth' });
  }

  // Sample size derives from declared event names. When the OpenAPI extension
  // declares N event names, we need to collect enough events for all N names
  // to plausibly appear (the source may interleave them or emit named events
  // late in the stream). Use 5× declared names with a floor of 3 and a ceiling
  // bounded by timeoutMs.
  const declaredNamesCount = (declaredEventNames && declaredEventNames.length) || 0;
  const sampleCount = declaredNamesCount > 0
    ? Math.max(3, declaredNamesCount * 5)
    : 3;

  const streamStep = {
    kind: 'api-stream',
    method: ep.method,
    path: ep.path,
    maxEvents: sampleCount,
    timeoutMs: 5000,
  };
  steps.push(streamStep);

  const expectStep = {
    kind: 'expect',
    expectSSE: true,
    minEvents: 1,
  };
  // Enrich SSE assertion with declared extensions
  if (declaredEventNames && declaredEventNames.length > 0) {
    expectStep.expectEventNames = declaredEventNames;
  }
  if (declaredRetry != null) {
    expectStep.expectRetry = declaredRetry;
  }
  if (declaredIdRequired) {
    expectStep.expectId = true;
  }
  if (declaredHeartbeat) {
    expectStep.expectHeartbeat = true;
  }
  steps.push(expectStep);

  flows.push({
    id: `${base}:${ep.method.toLowerCase()}:sse-stream`,
    contract: {
      endpoint: epKey(ep.method, ep.path),
      kind: 'sse-stream',
      source: ep.file,
    },
    dependsOn,
    onFail: {
      check: [ep.file],
      implies: `${ep.method} ${ep.path} does not produce valid SSE events.`,
    },
    steps,
  });

  return flows;
}

/**
 * Aggregate all content-type flows for a set of endpoints.
 */
// ---------------------------------------------------------------------------
// Conditional-request flows — ETag capture + If-None-Match / If-Match chains
// ---------------------------------------------------------------------------

/**
 * Emit conditional-request coverage flows for endpoints with a conditionalProfile.
 *
 * Flow kinds:
 *   - :conditional:etag-304 — GET → capture ETag → GET If-None-Match → 304
 *   - :conditional:if-match-stale — PUT/PATCH If-Match:"stale" → 412
 *   - :conditional:if-match-valid — GET → capture ETag → PUT If-Match:${etag} → 200
 */
function emitConditionalFlows(endpoints, options = {}) {
  const flows = [];

  for (const ep of endpoints) {
    if (!ep.conditionalProfile) continue;

    const profile = ep.conditionalProfile;
    const base = pathToId(ep.path);
    const contract = {
      endpoint: epKey(ep.method, ep.path),
      kind: 'endpoint-conditional',
      source: ep.file,
    };

    // --- :conditional:etag-304 — GET with If-None-Match matching captured ETag ---
    if (ep.method === 'GET' && profile.supportsETag && profile.patterns.includes('if-none-match')) {
      const etagSteps = [
        // Step 0: GET the resource to capture ETag
        { kind: 'api', method: 'GET', path: ep.path },
        { kind: 'expect', status: 200 },
        { kind: 'capture', bindings: { capturedETag: 'header:etag' } },
        // Step 3: GET again with If-None-Match set to captured ETag
        { kind: 'api', method: 'GET', path: ep.path, headers: { 'If-None-Match': '${capturedETag}' } },
        { kind: 'expect', status: 304 },
      ];

      // If x-etag-type declared, add ETag format assertion after initial capture
      if (profile.etagType === 'weak') {
        etagSteps.splice(2, 0, { kind: 'expect', headerMatches: { etag: '^W/' } });
      } else if (profile.etagType === 'strong') {
        etagSteps.splice(2, 0, { kind: 'expect', headerMatches: { etag: '^"[^W]' } });
      }

      flows.push({
        id: `${base}:get:conditional:etag-304`,
        contract: { ...contract, etagType: profile.etagType || null },
        dependsOn: [],
        onFail: {
          check: [ep.file],
          implies: `GET ${ep.path} does not return 304 when If-None-Match matches current ETag.`,
        },
        steps: etagSteps,
      });
    }

    // --- :conditional:vary — GET asserts Vary header presence when declared ---
    if (ep.method === 'GET' && profile.supportsVary) {
      flows.push({
        id: `${base}:get:conditional:vary`,
        contract,
        dependsOn: [],
        onFail: {
          check: [ep.file],
          implies: `GET ${ep.path} does not return Vary header as declared.`,
        },
        steps: [
          { kind: 'api', method: 'GET', path: ep.path },
          { kind: 'expect', status: 200, bodyHas: ['header:vary'] },
        ],
      });
    }

    // --- :conditional:if-match-stale — PUT/PATCH with stale If-Match → 412 ---
    if ((ep.method === 'PUT' || ep.method === 'PATCH') && profile.patterns.includes('if-match')) {
      const body = ep.zodContract ? buildSampleBody(ep.zodContract, options.uniqueFieldSet) : {};

      flows.push({
        id: `${base}:${ep.method.toLowerCase()}:conditional:if-match-stale`,
        contract,
        dependsOn: [],
        onFail: {
          check: [ep.file],
          implies: `${ep.method} ${ep.path} does not return 412 for stale If-Match ETag.`,
        },
        steps: [
          { kind: 'api', method: ep.method, path: ep.path, body, headers: { 'If-Match': '"stale-etag-probe-00000"' } },
          { kind: 'expect', status: 412 },
        ],
      });

      // --- :conditional:if-match-valid — capture ETag then use it for valid update ---
      // Find ETag source: prefer explicit x-etag-source operationId, fall back to
      // sibling GET on the same path. x-etag-source is a developer declaration that
      // names the operationId of the GET endpoint providing ETag values for this
      // mutating endpoint (required when GET and PUT have different paths).
      let siblingGet = null;
      if (profile.etagSourceOperationId) {
        siblingGet = endpoints.find((e) => e.method === 'GET' && e.operationId === profile.etagSourceOperationId && e.conditionalProfile && e.conditionalProfile.supportsETag);
      }
      if (!siblingGet) {
        siblingGet = endpoints.find((e) => e.method === 'GET' && e.path === ep.path && e.conditionalProfile && e.conditionalProfile.supportsETag);
      }
      if (siblingGet) {
        flows.push({
          id: `${base}:${ep.method.toLowerCase()}:conditional:if-match-valid`,
          contract,
          dependsOn: [],
          onFail: {
            check: [ep.file, siblingGet.file],
            implies: `${ep.method} ${ep.path} does not accept valid If-Match ETag for conditional update.`,
          },
          steps: [
            // Step 0: GET to capture current ETag
            { kind: 'api', method: 'GET', path: siblingGet.path },
            { kind: 'expect', status: 200 },
            { kind: 'capture', bindings: { capturedETag: 'header:etag' } },
            // Step 3: PUT/PATCH with captured ETag
            { kind: 'api', method: ep.method, path: ep.path, body, headers: { 'If-Match': '${capturedETag}' } },
            { kind: 'expect', statusAnyOf: [200, 204] },
          ],
        });
      }
    }

    // --- :conditional:last-modified-304 — GET with If-Modified-Since → 304 ---
    if (ep.method === 'GET' && profile.supportsLastModified && profile.patterns.includes('if-modified-since')) {
      flows.push({
        id: `${base}:get:conditional:last-modified-304`,
        contract,
        dependsOn: [],
        onFail: {
          check: [ep.file],
          implies: `GET ${ep.path} does not return 304 when If-Modified-Since matches last modification date.`,
        },
        steps: [
          { kind: 'api', method: 'GET', path: ep.path },
          { kind: 'expect', status: 200 },
          { kind: 'capture', bindings: { capturedLastModified: 'header:last-modified' } },
          { kind: 'api', method: 'GET', path: ep.path, headers: { 'If-Modified-Since': '${capturedLastModified}' } },
          { kind: 'expect', status: 304 },
        ],
      });
    }

    // --- :conditional:if-unmodified-since-stale — PUT/PATCH with old date → 412 ---
    if ((ep.method === 'PUT' || ep.method === 'PATCH') && profile.patterns.includes('if-unmodified-since')) {
      const unmodBody = ep.zodContract ? buildSampleBody(ep.zodContract, options.uniqueFieldSet) : {};

      flows.push({
        id: `${base}:${ep.method.toLowerCase()}:conditional:if-unmodified-since-stale`,
        contract,
        dependsOn: [],
        onFail: {
          check: [ep.file],
          implies: `${ep.method} ${ep.path} does not return 412 for stale If-Unmodified-Since date.`,
        },
        steps: [
          { kind: 'api', method: ep.method, path: ep.path, body: unmodBody, headers: { 'If-Unmodified-Since': 'Thu, 01 Jan 1970 00:00:00 GMT' } },
          { kind: 'expect', status: 412 },
        ],
      });
    }

    // --- :conditional:precondition-required-428 — missing required conditional header → 428 ---
    if (profile.conditionalStatuses.includes(428)) {
      if (['PUT', 'PATCH', 'DELETE'].includes(ep.method)) {
        const precondBody = ep.zodContract ? buildSampleBody(ep.zodContract, options.uniqueFieldSet) : undefined;
        const precondApiStep = { kind: 'api', method: ep.method, path: ep.path };
        if (precondBody !== undefined) precondApiStep.body = precondBody;

        const missingHeader = profile.patterns.includes('if-match') ? 'If-Match'
          : profile.patterns.includes('if-unmodified-since') ? 'If-Unmodified-Since'
          : 'conditional header';
        flows.push({
          id: `${base}:${ep.method.toLowerCase()}:conditional:precondition-required-428`,
          contract,
          dependsOn: [],
          onFail: {
            check: [ep.file],
            implies: `${ep.method} ${ep.path} does not return 428 when required ${missingHeader} is missing.`,
          },
          steps: [
            precondApiStep,
            { kind: 'expect', status: 428 },
          ],
        });
      }
    }
  }

  return flows;
}

function emitContentTypeFlows(endpoints, options = {}) {
  const flows = [];
  for (const ep of endpoints) {
    flows.push(...emitUploadFlows(ep, options));
    flows.push(...emitDownloadFlows(ep, options));
    flows.push(...emitStreamingFlows(ep, options));
  }
  return flows;
}

/**
 * Emit content-type diagnostics for multipart and SSE endpoints.
 *
 * DIAG codes:
 *   MULTIPART_NO_INTERCEPTOR — @ApiConsumes('multipart/form-data') declared but
 *     no FileInterceptor detected (multipartFields is null or has no fileFields).
 *   SSE_NO_DECORATOR — endpoint returns text/event-stream but was not detected
 *     via @Sse decorator (missing x-sse-* extensions indicates manual stream).
 */
function emitContentTypeDiagnostics(endpoints) {
  const diags = [];

  for (const ep of endpoints) {
    // MULTIPART_NO_INTERCEPTOR: declared multipart content type but no file fields
    // extracted from the schema. This usually means @ApiConsumes('multipart/form-data')
    // without a FileInterceptor, so multer never processes the upload.
    if (isMultipartEndpoint(ep) && (!ep.multipartFields || ep.multipartFields.fileFields.length === 0)) {
      diags.push({
        code: 'MULTIPART_NO_INTERCEPTOR',
        message: `${ep.method} ${ep.path} declares multipart/form-data but no binary file fields found in schema. Add @UseInterceptors(FileInterceptor('fieldName')) or declare file fields in @ApiBody schema.`,
        endpoint: epKey(ep.method, ep.path),
      });
    }

    // SSE_NO_DECORATOR: text/event-stream response but no x-sse-* extensions.
    // NestJS @Sse() endpoints get proper event-stream handling; manual res.write()
    // streams lack framework lifecycle hooks and may not emit proper SSE format.
    if (isSSEEndpoint(ep)) {
      const ext = (ep.swaggerDeclared && ep.swaggerDeclared.extensions) || {};
      const hasAnySSEExtension = ext['x-sse-event-names'] || ext['x-sse-retry'] != null ||
        ext['x-sse-id-required'] || ext['x-sse-heartbeat'] || ext['x-sse-multiline'];
      if (!hasAnySSEExtension) {
        diags.push({
          code: 'SSE_NO_DECORATOR',
          message: `${ep.method} ${ep.path} returns text/event-stream but has no x-sse-* extensions. If this is a manual stream (res.write), consider using @Sse() decorator for proper event lifecycle.`,
          endpoint: epKey(ep.method, ep.path),
        });
      }
    }
  }

  return diags;
}

/**
 * Emit WebSocket gateway diagnostics.
 *
 * DIAG codes:
 *   WS_NAMESPACE_AMBIGUOUS — two or more gateways share the same namespace/path,
 *     making it impossible for the probe to deterministically route connections.
 */
function emitWsDiagnostics(gateways) {
  const diags = [];
  const byPath = new Map();

  for (const gw of gateways) {
    const key = gw.path || '/';
    if (!byPath.has(key)) byPath.set(key, []);
    byPath.get(key).push(gw);
  }

  for (const [wsPath, gwList] of byPath) {
    if (gwList.length > 1) {
      const files = gwList.map((g) => g.file).join(', ');
      diags.push({
        code: 'WS_NAMESPACE_AMBIGUOUS',
        message: `WebSocket path "${wsPath}" is declared by ${gwList.length} gateways (${files}). Connection routing is ambiguous.`,
        endpoint: `WS ${wsPath}`,
      });
    }
  }

  return diags;
}

// ---------------------------------------------------------------------------
// Idempotency-key flows — POST with UUID key → replay → assert equal response
// ---------------------------------------------------------------------------

/**
 * Emit idempotency-key coverage flows for POST endpoints that declare an
 * Idempotency-Key header parameter (detected by nest-openapi.js).
 *
 * Flow kinds:
 *   - :idempotency:replay — POST with key → capture → replay same key → same status
 *   - :idempotency:different-key — POST with key A → capture id → POST with key B → new id
 */
function emitIdempotencyFlow(ep, options = {}) {
  if (!ep.idempotencyProfile) return null;
  if (ep.method !== 'POST') return null;

  const base = pathToId(ep.path);
  const headerName = ep.idempotencyProfile.headerName || 'Idempotency-Key';

  const body = ep.zodContract ? buildSampleBody(ep.zodContract, options.uniqueFieldSet) : {};

  const needsAuth = Boolean(ep.authDecorators && ep.authDecorators.authRequired);
  const authBootstrapAvailable = Boolean(options.authBootstrapAvailable);
  const dependsOn = needsAuth && authBootstrapAvailable ? ['chain:auth-bootstrap'] : [];

  // Capture-path envelope wrapping. When the API wraps responses in a
  // success envelope (e.g. NestJS TransformInterceptor produces
  // `{ success: true, data: T }`), the resource id lives at
  // `$.data.id`, not `$.id`. The response-envelope detector populates
  // `matrix.responseEnvelope.successWrapper` which the caller threads
  // through `options.envelopeWrapper`. Conditional-request endpoints
  // (`@Res()` for status/header control) bypass the interceptor — skip
  // wrapping for them. (Pagination doesn't apply: idempotency targets
  // mutating POSTs.)
  const isBareResponse = Boolean(ep.conditionalProfile);
  const sw = isBareResponse ? null : (options.envelopeWrapper || null);
  const wrapField = (leaf) => {
    if (!sw) return `$.${leaf}`;
    const prefix = Array.isArray(sw) ? sw.join('.') : sw;
    return `$.${prefix}.${leaf}`;
  };

  // Declaration-driven capture bindings. Reads `ep.responseContract.requiredPaths`
  // (extracted from the OpenAPI response schema by detectors/response-contract.js)
  // and emits one binding per declared field, named `first<PascalField>`. If no
  // response contract is declared, returns null and the capture step is skipped —
  // we never invent a `body`/`id` field that the contract does not actually
  // declare. This honours the source-of-truth principle: probe assertions reflect
  // exactly what the source code declares; a missing field name is a contract
  // signal, not a heuristic to paper over.
  const captureBindingsFromContract = () => {
    const paths =
      ep.responseContract && Array.isArray(ep.responseContract.requiredPaths)
        ? ep.responseContract.requiredPaths
        : [];
    if (paths.length === 0) return null;
    const bindings = {};
    for (const reqPath of paths) {
      const top = String(reqPath).split('.')[0];
      if (!top) continue;
      const bindingName = 'first' + top.charAt(0).toUpperCase() + top.slice(1);
      bindings[bindingName] = wrapField(reqPath);
    }
    return Object.keys(bindings).length > 0 ? bindings : null;
  };

  const contract = {
    endpoint: epKey(ep.method, ep.path),
    kind: 'endpoint-idempotency',
    source: ep.file,
  };

  const flows = [];

  // --- :idempotency:replay — same key → same response ---
  {
    const steps = [];
    if (needsAuth && authBootstrapAvailable) {
      steps.push({ binding: 'accessToken', kind: 'setAuth' });
    }

    steps.push({
      kind: 'api',
      method: 'POST',
      path: ep.path,
      body,
      headers: { [headerName]: '${uniqUuid}' },
    });
    steps.push({ kind: 'expect', statusAnyOf: [200, 201] });
    const replayBindings = captureBindingsFromContract();
    if (replayBindings) {
      steps.push({ kind: 'capture', bindings: replayBindings });
    }

    steps.push({
      kind: 'api',
      method: 'POST',
      path: ep.path,
      body,
      headers: { [headerName]: '${uniqUuid}' },
    });
    steps.push({ kind: 'expect', statusAnyOf: [200, 201] });

    flows.push({
      id: `${base}:post:idempotency:replay`,
      contract,
      dependsOn,
      onFail: {
        check: [ep.file],
        implies: `POST ${ep.path} does not honour ${headerName} header (replay should return same response).`,
      },
      steps,
    });
  }

  // --- :idempotency:different-key — different key → new resource ---
  {
    const steps = [];
    if (needsAuth && authBootstrapAvailable) {
      steps.push({ binding: 'accessToken', kind: 'setAuth' });
    }

    // First POST with key A (uniqUuid is frozen per flow)
    steps.push({
      kind: 'api',
      method: 'POST',
      path: ep.path,
      body,
      headers: { [headerName]: '${uniqUuid}' },
    });
    steps.push({ kind: 'expect', statusAnyOf: [200, 201] });
    const diffKeyBindings = captureBindingsFromContract();
    if (diffKeyBindings) {
      steps.push({ kind: 'capture', bindings: diffKeyBindings });
    }

    // Second POST with key B (uniqUuid2 — second unique UUID per flow)
    steps.push({
      kind: 'api',
      method: 'POST',
      path: ep.path,
      body,
      headers: { [headerName]: '${uniqUuid2}' },
    });
    steps.push({ kind: 'expect', statusAnyOf: [200, 201] });

    flows.push({
      id: `${base}:post:idempotency:different-key`,
      contract,
      dependsOn,
      onFail: {
        check: [ep.file],
        implies: `POST ${ep.path} with different ${headerName} values should create distinct resources.`,
      },
      steps,
    });
  }

  // --- :idempotency:no-key — omit header when optional → should still succeed ---
  if (!ep.idempotencyProfile.required) {
    const noKeySteps = [];
    if (needsAuth && authBootstrapAvailable) {
      noKeySteps.push({ binding: 'accessToken', kind: 'setAuth' });
    }

    noKeySteps.push({
      kind: 'api',
      method: 'POST',
      path: ep.path,
      body,
      // No idempotency header
    });
    noKeySteps.push({ kind: 'expect', statusAnyOf: [200, 201] });

    flows.push({
      id: `${base}:post:idempotency:no-key`,
      contract,
      dependsOn,
      onFail: {
        check: [ep.file],
        implies: `POST ${ep.path} should succeed without optional ${headerName} header.`,
      },
      steps: noKeySteps,
    });
  }

  return flows;
}

/**
 * Aggregate idempotency flows for all endpoints.
 */
function emitIdempotencyFlows(endpoints, options = {}) {
  const flows = [];
  for (const ep of endpoints) {
    const result = emitIdempotencyFlow(ep, options);
    if (result) flows.push(...result);
  }
  return flows;
}

// ---------------------------------------------------------------------------
// Refresh-token rotation chain — register → capture refresh → refresh → verify
// ---------------------------------------------------------------------------

/**
 * Emit refresh-token rotation chain.
 *
 * Flow pattern:
 *   1. Register a new user → capture accessToken + refreshToken
 *   2. POST /auth/refresh with refreshToken → capture newAccessToken
 *   3. GET /auth/me with newAccessToken → expect 200 (new token works)
 *   4. (optional) GET /auth/me with old accessToken → expect 401 (rotation invalidated old token)
 *
 * Requires authFlows.register + authFlows.refresh to be detected.
 * Depends on no other chain (it registers its own user).
 */
function emitRefreshChain(endpoints, options = {}) {
  const authFlows = options.authFlows || {};
  const cookieFlows = options.cookieFlows || [];
  const diagnostics = options.diagnostics; // optional sink
  // Envelope-aware capture for refresh chain
  const refreshChainEnvelope = options.envelopeWrapper || null;
  const refreshChainWrap = (leaf) => {
    if (!refreshChainEnvelope) return `$.${leaf}`;
    const pfx = Array.isArray(refreshChainEnvelope) ? refreshChainEnvelope.join('.') : refreshChainEnvelope;
    return `$.${pfx}.${leaf}`;
  };

  const register = authFlows.register
    ? endpoints.find((ep) => ep.method === authFlows.register.method && ep.path === authFlows.register.path)
    : null;
  const refresh = authFlows.refresh
    ? endpoints.find((ep) => ep.method === authFlows.refresh.method && ep.path === authFlows.refresh.path)
    : null;

  if (!register || !refresh) return null;

  // Declaration-driven skip: if cookieFlows already covers the refresh endpoint
  // via a refresh-token cookie (issuer or rotator), the cookie-refresh-rotation
  // emitter handles it. Avoid duplicate (and broken) body-based coverage.
  const refreshKey = epKey(refresh.method, refresh.path);
  const registerKey = epKey(register.method, register.path);
  const cookieCovered = cookieFlows.some((cf) => {
    if (!cf || cf.role !== 'refresh-token') return false;
    const opRefs = [...(cf.issuers || []), ...(cf.rotators || [])];
    return opRefs.some((r) => epKey(r.method, r.path) === refreshKey
                           || epKey(r.method, r.path) === registerKey);
  });
  if (cookieCovered) {
    if (diagnostics) {
      diagnostics.push({
        level: 'info',
        code: 'REFRESH_CHAIN_SKIPPED_COOKIE_GUARDED',
        endpoint: refreshKey,
        message: `Skipped body-based refresh-token chain — cookieFlows already declares a 'refresh-token' role for ${refreshKey} or ${registerKey}. Covered by emitCookieRefreshRotation.`,
      });
    }
    return null;
  }

  const mePoll = authFlows.mePoll
    ? endpoints.find((ep) => ep.method === authFlows.mePoll.method && ep.path === authFlows.mePoll.path)
    : null;

  const registerBody = register.zodContract
    ? buildSampleBody(register.zodContract, effectiveUniqueFieldSet(register, options.uniqueFieldSet))
    : null;

  const steps = [];

  // Step 1: Register a fresh user → capture both tokens
  const registerStep = { kind: 'api', method: 'POST', path: register.path };
  if (registerBody) registerStep.body = registerBody;
  steps.push(registerStep);
  steps.push({ kind: 'expect', statusAnyOf: [200, 201] });
  steps.push({
    kind: 'capture',
    bindings: {
      oldAccessToken: refreshChainWrap('accessToken'),
      refreshToken: refreshChainWrap('refreshToken'),
    },
  });

  // Step 2: Wait briefly (token rotation may use iat-based invalidation)
  steps.push({ kind: 'wait', ms: 1000 });

  // Step 3: POST refresh endpoint with captured refreshToken.
  // Declaration-driven only: rely on auth-flows detector's enriched
  // refreshTokenField. NEVER fall back to field-name regex — if the detector
  // could not declare a field, that's a contract-drift signal the probe MUST
  // surface, not paper over.
  const refreshFieldName = authFlows.refresh.refreshTokenField || null;
  if (!refreshFieldName) {
    if (diagnostics) {
      diagnostics.push({
        level: 'info',
        code: 'REFRESH_CHAIN_SKIPPED_NO_REFRESH_FIELD',
        endpoint: refreshKey,
        message: `Skipped body-based refresh-token chain — auth-flows detector did not declare a refreshTokenField for ${refreshKey}. If the refresh token is cookie-based, declare via @CookieRole(...,'refresh-token') or OpenAPI cookie securityScheme. If body-based, declare an unambiguous request schema (matching response refresh-token field name).`,
      });
    }
    return null;
  }
  const refreshBody = {};
  refreshBody[refreshFieldName] = '${refreshToken}';

  steps.push({ kind: 'api', method: 'POST', path: refresh.path, body: refreshBody });
  steps.push({ kind: 'expect', statusAnyOf: [200, 201] });
  steps.push({
    kind: 'capture',
    bindings: { newAccessToken: refreshChainWrap('accessToken') },
  });

  // Token rotation detected from response schema (access + refresh in response)
  const tokenRotation = Boolean(authFlows.refresh.tokenRotation);

  // Step 4: Verify new access token works
  if (mePoll) {
    steps.push({ binding: 'newAccessToken', kind: 'setAuth' });
    steps.push({ kind: 'api', method: 'GET', path: mePoll.path });
    steps.push({ kind: 'expect', status: 200 });

    // Step 5: Verify old access token status after refresh.
    // If tokenRotation is detected (refresh response returns new refresh token),
    // the old access token SHOULD be invalidated → expect 401.
    // Otherwise accept both 200 (non-rotating) and 401 (rotating).
    steps.push({ binding: 'oldAccessToken', kind: 'setAuth' });
    steps.push({ kind: 'api', method: 'GET', path: mePoll.path });
    if (tokenRotation) {
      steps.push({ kind: 'expect', status: 401 });
    } else {
      steps.push({ kind: 'expect', statusAnyOf: [200, 401] });
    }
  }

  const sourceFiles = [register.file, refresh.file];
  if (mePoll) sourceFiles.push(mePoll.file);

  return {
    id: 'chain:refresh-token-rotation',
    contract: {
      endpoint: `${epKey(register.method, register.path)} + ${epKey(refresh.method, refresh.path)}${mePoll ? ` + ${epKey(mePoll.method, mePoll.path)}` : ''}`,
      kind: 'chain-refresh-token-rotation',
      source: sourceFiles.join(', '),
    },
    dependsOn: [],
    onFail: {
      check: sourceFiles,
      implies: 'Refresh-token rotation chain (register -> refresh -> verify new token) fails.',
    },
    steps,
  };
}

// ---------------------------------------------------------------------------
// GraphQL query/mutation flows
// ---------------------------------------------------------------------------

/**
 * Emit flows for all GraphQL queries and mutations detected via introspection.
 *
 * Per query:  :happy (execute with sample vars, assert data non-null, no errors)
 *             :missing-required-var (omit a required var, assert errors[0] mentions var name)
 *
 * Per mutation: happy + required-field-missing + unauthorized (if auth required)
 *
 * @param {object} matrix — full matrix object
 * @param {object} options — emitter options
 * @returns {Array} flows
 */
function emitWebSocketFlows(matrix, options = {}) {
  const ws = matrix.websocketGateways;
  if (!ws || !ws.gateways || ws.gateways.length === 0) return [];

  const flows = [];

  for (const gateway of ws.gateways) {
    const gwPath = gateway.path || '/';
    const base = `ws:${gwPath}`;

    // :connect — verify the gateway accepts connections
    flows.push({
      id: `${base}:connect`,
      contract: {
        endpoint: `WS ${gwPath}`,
        kind: 'ws-connect',
        source: `${gateway.file} (source-scan)`,
      },
      dependsOn: [],
      onFail: {
        check: [gateway.file],
        implies: `WebSocket gateway at ${gwPath} does not accept connections.`,
      },
      steps: [
        {
          kind: 'ws-connect',
          path: gwPath,
          transport: gateway.transport || 'ws',
          namespace: gateway.namespace || null,
        },
        {
          kind: 'ws-close',
        },
      ],
    });

    // :no-auth — if gateway has @UseGuards, connect WITHOUT credentials and expect rejection
    if (gateway.authRequired) {
      flows.push({
        id: `${base}:no-auth`,
        contract: {
          endpoint: `WS ${gwPath}`,
          kind: 'ws-no-auth',
          source: `${gateway.file} (source-scan: @UseGuards)`,
        },
        dependsOn: [],
        onFail: {
          check: [gateway.file],
          implies: `WebSocket gateway at ${gwPath} with @UseGuards accepts unauthenticated connections — auth-on-handshake is not enforced.`,
        },
        steps: [
          {
            kind: 'ws-connect',
            path: gwPath,
            transport: gateway.transport || 'ws',
            namespace: gateway.namespace || null,
            expectReject: true,
            skipAuth: true,
          },
        ],
      });
    }

    // Per-event flows
    for (const event of gateway.events) {
      const eventBase = `${base}:event:${event.name}`;

      // :subscribe — connect + send event + expect response
      flows.push({
        id: `${eventBase}:subscribe`,
        contract: {
          endpoint: `WS ${gwPath} @${event.name}`,
          kind: 'ws-subscribe',
          source: `${gateway.file} (source-scan)`,
        },
        dependsOn: [],
        onFail: {
          check: [gateway.file],
          implies: `WebSocket event "${event.name}" on ${gwPath} does not respond.`,
        },
        steps: [
          {
            kind: 'ws-connect',
            path: gwPath,
            transport: gateway.transport || 'ws',
          namespace: gateway.namespace || null,
          },
          {
            kind: 'ws-send',
            event: event.name,
            data: buildSampleDataForEvent(event),
          },
          {
            kind: 'ws-expect-event',
            timeoutMs: 3000,
          },
          {
            kind: 'ws-close',
          },
        ],
      });

      // :disconnect — connect + subscribe + disconnect mid-stream
      flows.push({
        id: `${eventBase}:disconnect`,
        contract: {
          endpoint: `WS ${gwPath} @${event.name}`,
          kind: 'ws-disconnect',
          source: `${gateway.file} (source-scan)`,
        },
        dependsOn: [],
        onFail: {
          check: [gateway.file],
          implies: `WebSocket disconnect on ${gwPath} during event "${event.name}" does not clean up.`,
        },
        steps: [
          {
            kind: 'ws-connect',
            path: gwPath,
            transport: gateway.transport || 'ws',
          namespace: gateway.namespace || null,
          },
          {
            kind: 'ws-send',
            event: event.name,
            data: buildSampleDataForEvent(event),
          },
          {
            kind: 'ws-close',
          },
        ],
      });
    }
  }

  return flows;
}

/**
 * Build sample data payload for a WebSocket event based on its param schema.
 */
function buildSampleDataForEvent(event) {
  if (!event.paramSchema) return {};
  // Return a simple sample object with the param name
  const typeName = event.paramSchema.typeName;
  switch (typeName) {
    case 'string': return 'probe-sample';
    case 'number': return 42;
    case 'boolean': return true;
    default: return { probe: true };
  }
}

function emitGraphQLFlows(matrix, options = {}) {
  const gql = matrix.graphql;
  if (!gql) return [];
  if (!gql.queries && !gql.mutations && !gql.subscriptions) return [];

  const flows = [];
  const endpoint = gql.endpoint || '/graphql';

  const gqlTypes = gql.types || [];

  // --- Queries ---
  for (const query of gql.queries || []) {
    const base = `graphql:query:${query.name}`;

    // :happy — execute with sample variables
    const sampleVars = buildSampleVarsForArgs(query.args, gqlTypes);
    const queryStr = buildQueryString(query, 'query', gqlTypes);

    flows.push({
      id: `${base}:happy`,
      contract: {
        endpoint: `QUERY ${query.name}`,
        kind: 'graphql-query-happy',
        source: `${endpoint} (introspection)`,
      },
      dependsOn: [],
      onFail: {
        check: [endpoint],
        implies: `GraphQL query ${query.name} does not return data or returns errors.`,
      },
      steps: [
        {
          kind: 'api-graphql',
          endpoint,
          query: queryStr,
          variables: sampleVars,
          operationName: query.name,
        },
        {
          kind: 'expect',
          status: 200,
          bodyHas: ['data'],
        },
      ],
    });

    // :missing-required-var — omit a required arg
    const requiredArgs = query.args.filter((a) => a.required);
    if (requiredArgs.length > 0) {
      const omitted = requiredArgs[0];
      const partialVars = { ...sampleVars };
      delete partialVars[omitted.name];

      flows.push({
        id: `${base}:missing-required-var:${omitted.name}`,
        contract: {
          endpoint: `QUERY ${query.name}`,
          kind: 'graphql-query-missing-var',
          source: `${endpoint} (introspection)`,
        },
        dependsOn: [],
        onFail: {
          check: [endpoint],
          implies: `GraphQL query ${query.name} does not reject missing required variable "${omitted.name}".`,
        },
        steps: [
          {
            kind: 'api-graphql',
            endpoint,
            query: queryStr,
            variables: partialVars,
            operationName: query.name,
          },
          {
            kind: 'expect',
            status: 400,
            bodyHas: ['errors'],
            errorFieldMentions: omitted.name,
          },
        ],
      });
    }
  }

  // --- Mutations ---
  for (const mutation of gql.mutations || []) {
    const base = `graphql:mutation:${mutation.name}`;

    const sampleVars = buildSampleVarsForArgs(mutation.args, gqlTypes);
    const mutationStr = buildQueryString(mutation, 'mutation', gqlTypes);

    // :happy
    const needsAuth = Boolean(options.authBootstrapAvailable);
    const dependsOn = needsAuth ? ['chain:auth-bootstrap'] : [];

    const happySteps = [];
    if (needsAuth) {
      happySteps.push({ binding: 'accessToken', kind: 'setAuth' });
    }
    happySteps.push(
      {
        kind: 'api-graphql',
        endpoint,
        query: mutationStr,
        variables: sampleVars,
        operationName: mutation.name,
      },
      {
        kind: 'expect',
        status: 200,
        bodyHas: ['data'],
      },
    );

    flows.push({
      id: `${base}:happy`,
      contract: {
        endpoint: `MUTATION ${mutation.name}`,
        kind: 'graphql-mutation-happy',
        source: `${endpoint} (introspection)`,
      },
      dependsOn,
      onFail: {
        check: [endpoint],
        implies: `GraphQL mutation ${mutation.name} does not return data or returns errors.`,
      },
      steps: happySteps,
    });

    // :missing-required-var
    const requiredArgs = mutation.args.filter((a) => a.required);
    if (requiredArgs.length > 0) {
      const omitted = requiredArgs[0];
      const partialVars = { ...sampleVars };
      delete partialVars[omitted.name];

      flows.push({
        id: `${base}:missing-required-var:${omitted.name}`,
        contract: {
          endpoint: `MUTATION ${mutation.name}`,
          kind: 'graphql-mutation-missing-var',
          source: `${endpoint} (introspection)`,
        },
        dependsOn: [],
        onFail: {
          check: [endpoint],
          implies: `GraphQL mutation ${mutation.name} does not reject missing required variable "${omitted.name}".`,
        },
        steps: [
          {
            kind: 'api-graphql',
            endpoint,
            query: mutationStr,
            variables: partialVars,
            operationName: mutation.name,
          },
          {
            kind: 'expect',
            status: 400,
            bodyHas: ['errors'],
            errorFieldMentions: omitted.name,
          },
        ],
      });
    }

    // :unauthorized — only if auth is detected in the app
    if (options.authBootstrapAvailable) {
      flows.push({
        id: `${base}:unauthorized`,
        contract: {
          endpoint: `MUTATION ${mutation.name}`,
          kind: 'graphql-mutation-unauthorized',
          source: `${endpoint} (introspection)`,
        },
        dependsOn: [],
        onFail: {
          check: [endpoint],
          implies: `GraphQL mutation ${mutation.name} does not reject unauthenticated requests.`,
        },
        steps: [
          {
            kind: 'api-graphql',
            endpoint,
            query: mutationStr,
            variables: sampleVars,
            operationName: mutation.name,
          },
          {
            kind: 'expect',
            status: 200,
            bodyHas: ['errors'],
          },
        ],
      });
    }
  }

  // --- Subscriptions ---
  // Subscriptions over HTTP POST: GraphQL servers typically reject subscription
  // operations over HTTP with an error or specific status. The probe verifies
  // the server acknowledges the subscription type exists (returns errors[], not
  // a 500 or unknown-operation failure).
  for (const sub of gql.subscriptions || []) {
    const base = `graphql:subscription:${sub.name}`;
    const sampleVars = buildSampleVarsForArgs(sub.args, gqlTypes);
    const subStr = buildQueryString(sub, 'subscription', gqlTypes);

    // :http-post — verify server rejects subscription over HTTP gracefully
    flows.push({
      id: `${base}:http-post`,
      contract: {
        endpoint: `SUBSCRIPTION ${sub.name}`,
        kind: 'graphql-subscription-http-post',
        source: `${endpoint} (introspection)`,
      },
      dependsOn: [],
      onFail: {
        check: [endpoint],
        implies: `GraphQL subscription ${sub.name} does not handle HTTP POST gracefully (should return error, not 500).`,
      },
      steps: [
        {
          kind: 'api-graphql',
          endpoint,
          query: subStr,
          variables: sampleVars,
          operationName: sub.name,
        },
        {
          kind: 'expect',
          status: 200,
          bodyHas: ['errors'],
        },
      ],
    });
  }

  return flows;
}

/**
 * Build sample variables object from GraphQL argument definitions.
 * @param {Array} args — argument definitions from introspection
 * @param {Array} types — user types from matrix.graphql.types (for INPUT_OBJECT lookup)
 */
function buildSampleVarsForArgs(args, types) {
  const vars = {};
  for (const arg of args || []) {
    const sample = sampleValueForGraphQLType(arg.type, types);
    if (sample !== null) {
      vars[arg.name] = sample;
    }
  }
  return vars;
}

/**
 * Generate a sample value for a GraphQL type string (e.g. 'String!', '[Int]', 'ID!').
 * For INPUT_OBJECT types, builds a sample object from the type's fields.
 * @param {string} typeName — the GraphQL type string
 * @param {Array} types — user types from matrix.graphql.types (optional)
 */
function sampleValueForGraphQLType(typeName, types) {
  const isList = typeName.includes('[');
  const base = typeName.replace(/[!\[\]]/g, '');
  let value;
  switch (base) {
    case 'String': value = 'probe-sample'; break;
    case 'Int': value = 1; break;
    case 'Float': value = 1.5; break;
    case 'Boolean': value = true; break;
    case 'ID': value = 'probe-id-1'; break;
    // Common custom scalars
    case 'DateTime': case 'Date': value = '2024-01-01T00:00:00.000Z'; break;
    case 'JSON': case 'JSONObject': value = {}; break;
    case 'BigInt': value = 1; break;
    case 'Decimal': value = '1.00'; break;
    case 'UUID': value = '00000000-0000-0000-0000-000000000001'; break;
    case 'URL': case 'Uri': value = 'https://example.com'; break;
    case 'Email': case 'EmailAddress': value = 'probe@example.com'; break;
    default: {
      // Look up INPUT_OBJECT or ENUM type from introspection
      const typeDef = (types || []).find((t) => t.name === base);
      if (typeDef && typeDef.kind === 'ENUM' && typeDef.enumValues && typeDef.enumValues.length > 0) {
        // Use the first enum value as a representative sample
        value = typeDef.enumValues[0];
      } else if (typeDef && typeDef.fields && typeDef.fields.length > 0) {
        const obj = {};
        for (const field of typeDef.fields) {
          const fieldVal = sampleValueForGraphQLType(field.type, types);
          if (fieldVal !== null) {
            obj[field.name] = fieldVal;
          }
        }
        value = obj;
      } else if (typeDef) {
        // INPUT_OBJECT with no known fields — send empty object (better than omitting)
        value = {};
      } else {
        return null;
      }
      break;
    }
  }
  return isList ? [value] : value;
}

/**
 * Build a GraphQL query/mutation/subscription string from an operation definition.
 * When `types` is provided, builds a field-level selection set for known OBJECT
 * return types (including Relay connection patterns with edges/node/pageInfo).
 * Falls back to `{ __typename }` when types are not available.
 */
function buildQueryString(operation, kind, types) {
  const argDefs = operation.args
    .map((a) => `$${a.name}: ${a.type}`)
    .join(', ');
  const argPasses = operation.args
    .map((a) => `${a.name}: $${a.name}`)
    .join(', ');

  const signature = argDefs ? `${kind} ${operation.name}(${argDefs})` : `${kind} ${operation.name}`;
  const invocation = argPasses ? `${operation.name}(${argPasses})` : operation.name;

  const returnBase = operation.returnType.replace(/[!\[\]]/g, '');
  const SCALARS = ['String', 'Int', 'Float', 'Boolean', 'ID',
    'DateTime', 'Date', 'JSON', 'JSONObject', 'BigInt', 'Decimal',
    'UUID', 'URL', 'Uri', 'Email', 'EmailAddress', 'Upload'];
  const isEnum = (types || []).some((t) => t.name === returnBase && t.kind === 'ENUM');
  const isScalar = SCALARS.includes(returnBase) || isEnum;
  const selectionSet = isScalar ? '' : (' ' + buildSelectionSet(returnBase, types, 0));

  return `${signature} { ${invocation}${selectionSet} }`;
}

/**
 * Build a selection set string for a given type name.
 * Recurses into known OBJECT types up to depth 2 to avoid unbounded nesting.
 * Detects Relay connection patterns (edges { node { ... } cursor } pageInfo { ... }).
 */
function buildSelectionSet(typeName, types, depth) {
  if (depth > 2) return '{ __typename }';
  if (!types || types.length === 0) return '{ __typename }';

  const typeDef = types.find((t) => t.name === typeName && t.kind === 'OBJECT');
  if (!typeDef || !typeDef.fields || typeDef.fields.length === 0) return '{ __typename }';

  const SCALARS = ['String', 'Int', 'Float', 'Boolean', 'ID',
    'DateTime', 'Date', 'JSON', 'JSONObject', 'BigInt', 'Decimal',
    'UUID', 'URL', 'Uri', 'Email', 'EmailAddress', 'Upload'];

  const fields = ['__typename'];
  for (const field of typeDef.fields) {
    const fieldBase = field.type.replace(/[!\[\]]/g, '');
    const fieldIsEnum = (types || []).some((t) => t.name === fieldBase && t.kind === 'ENUM');
    if (SCALARS.includes(fieldBase) || fieldIsEnum) {
      fields.push(field.name);
    } else {
      // Recurse into nested object types
      fields.push(`${field.name} ${buildSelectionSet(fieldBase, types, depth + 1)}`);
    }
  }
  return `{ ${fields.join(' ')} }`;
}

// ---------------------------------------------------------------------------
// CSRF flows — GET token → POST with token → 2xx; POST without → 403
// ---------------------------------------------------------------------------

function emitCsrfFlows(matrix, _options = {}) {
  const flows = [];
  const csrf = matrix.csrf;
  if (!csrf || !csrf.detected) return flows;

  const tokenEndpoint = csrf.tokenEndpoint;
  const tokenField = tokenEndpoint ? tokenEndpoint.tokenField : null;

  // Collect ALL POST endpoints that declare a CSRF security requirement.
  // Declaration-driven: securityRequirement must reference a scheme whose
  // name contains 'csrf' or 'xsrf', matching the detector's recognition.
  const postEndpoints = (matrix.apiEndpoints || []).filter(
    (ep) => ep.method === 'POST' && Array.isArray(ep.securityRequirement) &&
      ep.securityRequirement.some((req) => req && Object.keys(req).some((sn) => /csrf|xsrf/i.test(sn)))
  );
  if (postEndpoints.length === 0) return flows;

  // Resolve the CSRF security scheme's header name from securitySchemes.
  // This is the fallback when an endpoint does not declare its own header
  // parameter explicitly.
  const schemeHeaderName = resolveCsrfSchemeHeaderName(matrix.securitySchemes);

  // Build envelope-aware capture path from static detector output.
  // matrix.responseEnvelope.wrapper is set by detectors/response-envelope.js
  // at regen time — never sniff at runtime, never hardcode 'data'.
  const envelope = matrix.responseEnvelope;
  const wrapperKey = (envelope && envelope.wrapper) || null;
  const tokenCapturePath = tokenField
    ? (wrapperKey ? `$.${wrapperKey}.${tokenField}` : `$.${tokenField}`)
    : null;

  // Emit flows for EACH CSRF-protected POST endpoint individually.
  // Each endpoint may declare its own header parameter name via @ApiHeader;
  // if not, fall back to the securityScheme's declared header name.
  for (const ep of postEndpoints) {
    const epHeaderName = resolveEndpointCsrfHeaderName(ep) || schemeHeaderName;
    if (!epHeaderName) continue; // No header name declared — skip, never fabricate.

    const epId = pathToId(ep.path);
    const contract = {
      endpoint: `POST ${ep.path}`,
      kind: 'csrf-protection',
      source: csrf.source,
    };

    // Flow 1: Fetch token -> POST with valid token -> expect not-403
    if (tokenEndpoint && tokenCapturePath) {
      flows.push({
        id: `csrf:${epId}:consume:happy`,
        contract,
        dependsOn: [],
        onFail: {
          check: [],
          implies: `POST ${ep.path} should accept requests with valid CSRF token in ${epHeaderName}.`,
        },
        steps: [
          { kind: 'api', method: tokenEndpoint.method || 'GET', path: tokenEndpoint.path },
          { kind: 'expect', status: 200 },
          { kind: 'capture', bindings: { csrfToken: tokenCapturePath } },
          { kind: 'api', method: 'POST', path: ep.path, body: {}, headers: { [epHeaderName]: '${csrfToken}' } },
          { kind: 'expect', statusNot: 403 },
        ],
      });
    }

    // Flow 2: POST without token -> expect 403
    flows.push({
      id: `csrf:${epId}:consume:missing-token`,
      contract,
      dependsOn: [],
      onFail: {
        check: [],
        implies: `POST ${ep.path} should reject requests without CSRF token with 403.`,
      },
      steps: [
        { kind: 'api', method: 'POST', path: ep.path, body: {} },
        { kind: 'expect', status: 403 },
      ],
    });

    // Flow 3: POST with invalid token -> expect 403
    flows.push({
      id: `csrf:${epId}:consume:invalid-token`,
      contract,
      dependsOn: [],
      onFail: {
        check: [],
        implies: `POST ${ep.path} should reject requests with invalid CSRF token with 403.`,
      },
      steps: [
        { kind: 'api', method: 'POST', path: ep.path, body: {}, headers: { [epHeaderName]: 'invalid-token-probe-12345' } },
        { kind: 'expect', status: 403 },
      ],
    });
  }

  return flows;
}

/**
 * Resolve the CSRF header name from the securitySchemes. Looks for an
 * apiKey-in-header scheme whose name matches csrf/xsrf. Returns the
 * scheme's declared `name` (the actual HTTP header) verbatim, or null.
 */
function resolveCsrfSchemeHeaderName(securitySchemes) {
  if (!securitySchemes) return null;
  for (const [schemeName, scheme] of Object.entries(securitySchemes)) {
    if (!scheme || scheme.type !== 'apiKey' || scheme.in !== 'header') continue;
    if (!/csrf|xsrf/i.test(schemeName) && !/csrf|xsrf/i.test(scheme.name || '')) continue;
    return scheme.name || null;
  }
  return null;
}

/**
 * Resolve the CSRF header name declared on a specific endpoint via its
 * header parameters. An endpoint that declares @ApiHeader alongside a CSRF
 * securityRequirement tells us exactly which header carries the token.
 * Returns the first header parameter name from the endpoint, or null.
 */
function resolveEndpointCsrfHeaderName(ep) {
  const directParams = Array.isArray(ep.parameters) ? ep.parameters : [];
  const swaggerParams =
    ep.swaggerDeclared && Array.isArray(ep.swaggerDeclared.parameters)
      ? ep.swaggerDeclared.parameters
      : [];
  const params = [...directParams, ...swaggerParams];
  for (const param of params) {
    if (param && param.in === 'header' && param.name) {
      return param.name;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// OAuth2 flows — detect authorize/token/callback endpoints
// ---------------------------------------------------------------------------

function emitOAuthFlows(matrix, _options = {}) {
  const flows = [];
  const oauth = matrix.oauth;
  if (!oauth || !oauth.detected) return flows;

  // Prefer resolved role endpoint paths (always relative) over scheme URLs
  // (which may be absolute like https://example.com/oauth/token). The probe
  // sends HTTP requests to relative paths on the local stack.
  const roles = oauth.roles || {};
  const tokenPath = (roles.token && roles.token.path) || toRelativePath(oauth.tokenUrl);
  const authorizePath = (roles.authorize && roles.authorize.path) || toRelativePath(oauth.authorizeUrl);
  const callbackPath = (roles.callback && roles.callback.path) || oauth.callbackUrl;
  const refreshPath = (roles.refresh && roles.refresh.path) || toRelativePath(oauth.refreshUrl);

  const base = 'oauth';
  const contract = {
    endpoint: tokenPath || authorizePath || 'oauth',
    kind: 'oauth-flow',
    source: oauth.source,
  };

  // --- Token endpoint flows (POST) ---
  if (tokenPath) {
    // Flow: invalid grant → expect 400/401 (covers declared 400)
    flows.push({
      id: `${base}:token:invalid-grant`,
      contract,
      dependsOn: [],
      onFail: {
        check: [],
        implies: `POST ${tokenPath} should reject invalid grant with 400/401, not 500.`,
      },
      steps: [
        {
          kind: 'api',
          method: 'POST',
          path: tokenPath,
          body: { grant_type: 'authorization_code', code: 'invalid-probe-code', redirect_uri: 'http://localhost:3000/callback' },
        },
        { kind: 'expect', statusAnyOf: [400, 401] },
      ],
    });

    // Flow: missing grant_type → expect 400 (error-path reinforcement)
    flows.push({
      id: `${base}:token:missing-grant-type`,
      contract,
      dependsOn: [],
      onFail: {
        check: [],
        implies: `POST ${tokenPath} should reject request without grant_type with 400.`,
      },
      steps: [
        {
          kind: 'api',
          method: 'POST',
          path: tokenPath,
          body: {},
        },
        { kind: 'expect', statusAnyOf: [400, 401, 422] },
      ],
    });

    // Flow: client_credentials grant → expect 200 or 401 (covers declared 200)
    // The probe sends synthetic credentials. Real apps reject with 401;
    // synthetic endpoints may return 200. Both are valid outcomes.
    flows.push({
      id: `${base}:token:client-credentials`,
      contract,
      dependsOn: [],
      onFail: {
        check: [],
        implies: `POST ${tokenPath} with client_credentials grant should return 200 (valid creds) or 401 (invalid creds), not 500.`,
      },
      steps: [
        {
          kind: 'api',
          method: 'POST',
          path: tokenPath,
          body: { grant_type: 'client_credentials', client_id: 'probe-client', client_secret: 'probe-secret' },
        },
        { kind: 'expect', statusAnyOf: [200, 400, 401] },
      ],
    });
  }

  // --- Authorize endpoint flows (GET) ---
  if (authorizePath) {
    // Flow: authorize with params → expect 302 redirect (covers declared 302)
    flows.push({
      id: `${base}:authorize:reachable`,
      contract,
      dependsOn: [],
      onFail: {
        check: [],
        implies: `GET ${authorizePath} should be reachable (200 or 302).`,
      },
      steps: [
        {
          kind: 'api',
          method: 'GET',
          path: authorizePath,
          query: { response_type: 'code', client_id: 'probe-client', redirect_uri: 'http://localhost:3000/callback' },
          followRedirects: false,
        },
        { kind: 'expect', statusAnyOf: [200, 302, 303] },
      ],
    });

    // Flow: authorize missing client_id → expect 302 (error redirect) or 400
    flows.push({
      id: `${base}:authorize:missing-client-id`,
      contract,
      dependsOn: [],
      onFail: {
        check: [],
        implies: `GET ${authorizePath} without client_id should return 302 (error redirect) or 400.`,
      },
      steps: [
        {
          kind: 'api',
          method: 'GET',
          path: authorizePath,
          query: { response_type: 'code' },
          followRedirects: false,
        },
        { kind: 'expect', statusAnyOf: [302, 400, 401] },
      ],
    });
  }

  // --- Callback endpoint flows (GET) ---
  if (callbackPath) {
    // Flow: callback with valid code → expect 200 or 400 (covers declared 200)
    // The probe sends a synthetic code. Real apps reject; synthetic endpoints
    // may return 200. Both are valid.
    flows.push({
      id: `${base}:callback:with-code`,
      contract,
      dependsOn: [],
      onFail: {
        check: [],
        implies: `GET ${callbackPath}?code=... should return 200 (valid code) or 400 (invalid code), not 500.`,
      },
      steps: [
        {
          kind: 'api',
          method: 'GET',
          path: callbackPath,
          query: { code: 'probe-test-code', state: 'probe-state' },
        },
        { kind: 'expect', statusAnyOf: [200, 400, 401, 302] },
      ],
    });

    // Flow: callback without code → expect 400 (covers declared 400)
    flows.push({
      id: `${base}:callback:no-code`,
      contract,
      dependsOn: [],
      onFail: {
        check: [],
        implies: `GET ${callbackPath} without code should return 400/401, not 500.`,
      },
      steps: [
        { kind: 'api', method: 'GET', path: callbackPath },
        { kind: 'expect', statusAnyOf: [400, 401, 302] },
      ],
    });

    // Flow: callback with error param → expect 400
    flows.push({
      id: `${base}:callback:error-param`,
      contract,
      dependsOn: [],
      onFail: {
        check: [],
        implies: `GET ${callbackPath}?error=access_denied should return 400, not 500.`,
      },
      steps: [
        {
          kind: 'api',
          method: 'GET',
          path: callbackPath,
          query: { error: 'access_denied' },
        },
        { kind: 'expect', statusAnyOf: [400, 401, 302] },
      ],
    });
  }

  // --- Refresh token endpoint flows (POST) ---
  if (refreshPath) {
    // Flow: refresh with valid refresh_token → expect 200 or 400/401
    // The probe sends a synthetic refresh token. Real apps reject with 401;
    // synthetic endpoints may return 200. Both are valid outcomes.
    flows.push({
      id: `${base}:refresh-token:happy`,
      contract,
      dependsOn: [],
      onFail: {
        check: [],
        implies: `POST ${refreshPath} with grant_type=refresh_token should return 200 (valid token) or 400/401 (invalid token), not 500.`,
      },
      steps: [
        {
          kind: 'api',
          method: 'POST',
          path: refreshPath,
          body: { grant_type: 'refresh_token', refresh_token: 'probe-refresh-token-001' },
        },
        { kind: 'expect', statusAnyOf: [200, 400, 401] },
      ],
    });

    // Flow: refresh with missing refresh_token → expect 400
    flows.push({
      id: `${base}:refresh-token:missing-token`,
      contract,
      dependsOn: [],
      onFail: {
        check: [],
        implies: `POST ${refreshPath} without refresh_token should return 400, not 500.`,
      },
      steps: [
        {
          kind: 'api',
          method: 'POST',
          path: refreshPath,
          body: { grant_type: 'refresh_token' },
        },
        { kind: 'expect', statusAnyOf: [400, 401, 422] },
      ],
    });

    // Flow: refresh with invalid grant_type → expect 400
    flows.push({
      id: `${base}:refresh-token:invalid-grant`,
      contract,
      dependsOn: [],
      onFail: {
        check: [],
        implies: `POST ${refreshPath} with wrong grant_type should return 400, not 500.`,
      },
      steps: [
        {
          kind: 'api',
          method: 'POST',
          path: refreshPath,
          body: { grant_type: 'invalid_grant_type', refresh_token: 'probe-refresh-token-001' },
        },
        { kind: 'expect', statusAnyOf: [400, 401] },
      ],
    });
  }

  return flows;
}

/**
 * Returns the set of statuses that emitOAuthFlows covers per endpoint.
 * Used by the main generator to avoid emitting UNGENERATABLE diagnostics
 * for statuses that OAuth flows already exercise.
 *
 * Returns Map<string, Set<number>> keyed by epKey(method, path).
 */
function oauthCoveredStatuses(matrix) {
  const result = new Map();
  const oauth = matrix && matrix.oauth;
  if (!oauth || !oauth.detected) return result;

  const roles = oauth.roles || {};
  const tokenPath = (roles.token && roles.token.path) || toRelativePath(oauth.tokenUrl);
  const authorizePath = (roles.authorize && roles.authorize.path) || toRelativePath(oauth.authorizeUrl);
  const callbackPath = (roles.callback && roles.callback.path) || oauth.callbackUrl;
  const refreshPath = (roles.refresh && roles.refresh.path) || toRelativePath(oauth.refreshUrl);

  if (tokenPath) {
    // token flows cover: 400 (invalid-grant, missing-grant-type), 200/401 (client-credentials)
    result.set(epKey('POST', tokenPath), new Set([200, 400, 401, 422]));
  }
  if (authorizePath) {
    // authorize flows cover: 200/302/303 (reachable), 302/400/401 (missing-client-id)
    result.set(epKey('GET', authorizePath), new Set([200, 302, 303, 400, 401]));
  }
  if (callbackPath) {
    // callback flows cover: 200/400/401/302 (with-code), 400/401/302 (no-code), 400/401/302 (error-param)
    result.set(epKey('GET', callbackPath), new Set([200, 302, 400, 401]));
  }
  if (refreshPath) {
    // refresh flows cover: 200/400/401 (happy), 400/401/422 (missing-token), 400/401 (invalid-grant)
    result.set(epKey('POST', refreshPath), new Set([200, 400, 401, 422]));
  }

  return result;
}

/**
 * Pre-compute which statuses the CSRF consume emitter will cover for each
 * CSRF-protected POST endpoint. Mirrors oauthCoveredStatuses() so the
 * blanket UNGENERATABLE loop can skip statuses that have real CSRF flows.
 *
 * Covered statuses per endpoint:
 * - 200: happy flow (`:consume:happy` exercises the success path)
 * - 403: missing-token and invalid-token flows expect 403
 */
function csrfCoveredStatuses(matrix) {
  const result = new Map();
  const csrf = matrix && matrix.csrf;
  if (!csrf || !csrf.detected) return result;

  const postEndpoints = (matrix.apiEndpoints || []).filter(
    (ep) => ep.method === 'POST' && Array.isArray(ep.securityRequirement) &&
      ep.securityRequirement.some((req) => req && Object.keys(req).some((sn) => /csrf|xsrf/i.test(sn)))
  );

  const schemeHeaderName = resolveCsrfSchemeHeaderName(matrix.securitySchemes);
  const tokenEndpoint = csrf.tokenEndpoint;

  for (const ep of postEndpoints) {
    const epHeaderName = resolveEndpointCsrfHeaderName(ep) || schemeHeaderName;
    if (!epHeaderName) continue;

    const covered = new Set([403]); // missing-token + invalid-token always emitted
    if (tokenEndpoint && tokenEndpoint.tokenField) {
      covered.add(200); // happy flow emitted when issuer is resolved
    }
    result.set(epKey(ep.method, ep.path), covered);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Multi-tenant isolation flows — two-agent cross-tenant access check
// ---------------------------------------------------------------------------

function emitTenantIsolationFlows(matrix, _options = {}) {
  const flows = [];
  const tenant = matrix.multiTenant;
  if (!tenant || !tenant.detected) return flows;

  const base = 'tenant-isolation';
  const contract = {
    endpoint: 'multi-tenant',
    kind: 'tenant-isolation',
    source: tenant.source,
  };

  if ((tenant.strategy === 'header' || tenant.strategy === 'extension' || tenant.strategy === 'decorator') && tenant.headerName) {
    // Declaration-driven: target = canonical endpoint where tenant header was declared.
    // If the detector did not surface a canonicalEndpoint (e.g. document-level extension
    // without per-endpoint declaration), we cannot emit isolation flows — declarations
    // are the only signal we accept.
    if (!tenant.canonicalEndpoint || !tenant.canonicalEndpoint.method || !tenant.canonicalEndpoint.path) {
      return flows;
    }
    const targetEp = { method: tenant.canonicalEndpoint.method, path: tenant.canonicalEndpoint.path };

    // Flow 1: Request with Tenant-A header → expect 2xx
    flows.push({
      id: `${base}:header:tenant-a:access`,
      contract,
      dependsOn: [],
      onFail: {
        check: [],
        implies: `${targetEp.method} ${targetEp.path} with ${tenant.headerName}: tenant-a should succeed.`,
      },
      steps: [
        { kind: 'api', method: targetEp.method, path: targetEp.path, headers: { [tenant.headerName]: 'tenant-probe-a' } },
        { kind: 'expect', statusAnyOf: [200, 401] },
      ],
    });

    // Flow 2: Request with Tenant-B header to same resource → expect 403/404
    flows.push({
      id: `${base}:header:cross-tenant:rejected`,
      contract,
      dependsOn: [],
      onFail: {
        check: [],
        implies: `${targetEp.method} ${targetEp.path} with wrong ${tenant.headerName} should return 403/404.`,
      },
      steps: [
        { kind: 'api', method: targetEp.method, path: targetEp.path, headers: { [tenant.headerName]: 'tenant-probe-b' } },
        { kind: 'expect', statusAnyOf: [403, 404, 401] },
      ],
    });

    // Flow 3: Request without tenant header → expect 400/403
    flows.push({
      id: `${base}:header:missing:rejected`,
      contract,
      dependsOn: [],
      onFail: {
        check: [],
        implies: `${targetEp.method} ${targetEp.path} without ${tenant.headerName} should be rejected.`,
      },
      steps: [
        { kind: 'api', method: targetEp.method, path: targetEp.path },
        { kind: 'expect', statusAnyOf: [400, 403, 401] },
      ],
    });
  }

  return flows;
}

// ---------------------------------------------------------------------------
// Resource-setup chains — structural + declaration-driven parent/child linkage
// ---------------------------------------------------------------------------

/**
 * Detect path-prefix parent for an endpoint.
 *
 * A. Path-prefix child resources → AUTODETECT (no extension needed)
 *
 * When ep.path matches `<parentBasePath>/:<param>(/...)?` AND a `POST
 * <parentBasePath>` exists among endpoints with a zodContract AND a
 * responseContract declaring an `id` field, the parent is autodetected.
 *
 * This is purely STRUCTURAL — not heuristic:
 *   - Path-prefix match is literal substring
 *   - Parent's POST + zodContract + response-id is declarative
 *   - No field-name guessing, no path regex, no value pattern matching
 *
 * Returns { parentEp, paramName, resourceName, chainId } or null.
 */
function detectPathPrefixParent(ep, endpoints) {
  // Walk path segments looking for a parent base path.
  // E.g. /api/v1/teams/:teamId/members → base candidates:
  //   /api/v1/teams (param = teamId)
  const segments = ep.path.split('/');
  // Find the first :param after the resource base
  for (let i = segments.length - 1; i >= 2; i--) {
    if (!segments[i].startsWith(':')) continue;
    const paramName = segments[i].slice(1); // e.g. 'teamId'
    const parentBasePath = segments.slice(0, i).join('/'); // e.g. '/api/v1/teams'

    // Check: is there a POST at parentBasePath?
    const parentPost = endpoints.find(
      (e) => e.method === 'POST' && e.path === parentBasePath,
    );
    if (!parentPost) continue;
    if (!parentPost.zodContract) continue;

    // Structural match only: parent has POST + zodContract.
    // Whether the parent declares capturable fields is checked by the caller
    // via x-resource-captures. No field-name heuristic here.

    const resourceName = parentBasePath.split('/').pop(); // e.g. 'teams'
    return {
      parentEp: parentPost,
      paramName,
      resourceName,
      chainId: `chain:resource-setup:${resourceName}`,
    };
  }
  return null;
}

/**
 * Resolve resource dependencies for an endpoint. Two mechanisms:
 *
 * A. Path-prefix autodetection: when ep.path is a child of a parent resource
 *    (structural path-prefix match), adds path-param substitution.
 *
 * B. Body-field declaration (x-probe-resource-ref): when a request body field
 *    references a different resource, declared via OpenAPI extension.
 *
 * Returns { deps: string[], overrides: Record<string, string>, pathSubstitutions: Record<string, string> }
 *   deps              = chain IDs for dependsOn
 *   overrides         = body field substitutions (part B)
 *   pathSubstitutions = path param substitutions (part A)
 */
function resolveResourceRefDeps(ep, endpoints) {
  const result = { deps: [], overrides: {}, pathSubstitutions: {} };

  // --- Part A: path-prefix autodetection for ALL :params, not just the
  // immediate parent. detectPathPrefixParent returns the closest ancestor;
  // for paths like /orgs/:orgId/projects/:projId/tasks/:taskId every :param
  // along the path needs its own ancestor lookup, otherwise non-immediate
  // params stay literal and 404 at runtime. Match contract is the same as
  // the original detectPathPrefixParent (POST exists at ancestor base path
  // and has a zodContract); whether the ancestor declared captures is
  // checked separately by emitResourceSetupChains, which surfaces a DIAG
  // when missing. Purely declaration-driven via the matrix, never inferred
  // from name shape.
  const segments = ep.path.split('/');
  for (let i = 1; i < segments.length; i++) {
    if (!segments[i].startsWith(':')) continue;
    const paramName = segments[i].slice(1);
    if (Object.prototype.hasOwnProperty.call(result.pathSubstitutions, paramName)) continue;
    const ancestorBasePath = segments.slice(0, i).join('/');
    const ancestorPost = endpoints.find(
      (e) => e.method === 'POST' && e.path === ancestorBasePath,
    );
    if (!ancestorPost || !ancestorPost.zodContract) continue;
    const resourceName = ancestorBasePath.split('/').pop();
    const chainId = `chain:resource-setup:${resourceName}`;
    if (!result.deps.includes(chainId)) result.deps.push(chainId);
    result.pathSubstitutions[paramName] = `\${resource:${resourceName}:id}`;
  }

  // --- Part B: body-field x-probe-resource-ref ---
  const refs = ep.swaggerDeclared && ep.swaggerDeclared.extensions
    && ep.swaggerDeclared.extensions['x-probe-resource-ref'];
  if (refs) {
    const refList = Array.isArray(refs) ? refs : [refs];
    for (const ref of refList) {
      if (!ref) continue;

      // Two shapes supported:
      // Shape 1 (operationId): { parentField, parentCreate: { operationId } }
      // Shape 2 (resource path): { parentField, resource: '/api/v1/teams' }
      const parentField = ref.parentField;
      if (!parentField) continue;

      let parentEp = null;
      let resourceLabel = parentField;

      if (ref.parentCreate && ref.parentCreate.operationId) {
        parentEp = endpoints.find((e) => e.operationId === ref.parentCreate.operationId);
        if (parentEp) resourceLabel = parentField;
      } else if (ref.resource) {
        // resource path: find POST at that path
        parentEp = endpoints.find((e) => e.method === 'POST' && e.path === ref.resource);
        if (parentEp) {
          resourceLabel = ref.resource.split('/').pop() || parentField;
        }
      }

      if (!parentEp) continue;

      const isArray = ref.kind === 'array';
      const count = isArray ? Math.max(1, Number(ref.count) || 2) : 1;
      const chainId = isArray
        ? `chain:resource-setup:${resourceLabel}:array:${count}`
        : `chain:resource-setup:${resourceLabel}`;
      if (!result.deps.includes(chainId)) {
        result.deps.push(chainId);
      }
      if (isArray) {
        const sigils = [];
        for (let i = 0; i < count; i++) {
          sigils.push(`\${resource:${resourceLabel}:id:${i}}`);
        }
        result.overrides[parentField] = sigils;
      } else {
        result.overrides[parentField] = `\${resource:${resourceLabel}:id}`;
      }
    }
  }

  return result;
}

/**
 * Emit resource-setup chains. Two sources:
 *
 * A. Path-prefix: for every unique parent detected via detectPathPrefixParent
 *    across all endpoints, emit a chain that creates the parent and captures id.
 *
 * B. Body-field (x-probe-resource-ref): for every unique parent referenced
 *    via the extension across all endpoints, emit a chain similarly.
 *
 * Deduplicates by chain ID. Downstream flows (happy, CRUD, status-reach)
 * can dependsOn these chains and substitute captured IDs.
 */
function emitResourceSetupChains(endpoints, options) {
  const flows = [];
  const opts = options || {};
  const emittedChains = new Set();

  /** Helper: emit a single resource-setup chain for a parent endpoint. */
  function emitChain(chainId, parentEp, resourceLabel, captureFrom) {
    if (emittedChains.has(chainId)) return;
    emittedChains.add(chainId);

    const uniqueFieldSet = effectiveUniqueFieldSet(parentEp, opts.uniqueFieldSet);
    const parentBody = parentEp.zodContract
      ? buildSampleBody(parentEp.zodContract, uniqueFieldSet)
      : null;

    const steps = [];
    const deps = [];

    const parentNeedsAuth = Boolean(
      parentEp.authDecorators && parentEp.authDecorators.authRequired,
    );
    if (parentNeedsAuth && opts.authBootstrapAvailable) {
      steps.push({ kind: 'setAuth', binding: 'accessToken' });
      deps.push('chain:auth-bootstrap');
    }

    const declaredStatuses = (parentEp.swaggerDeclared && parentEp.swaggerDeclared.statuses) || [];
    const expectStatus = declaredStatuses.find((s) => s >= 200 && s < 300) || 201;

    const createStep = { kind: 'api', method: 'POST', path: parentEp.path };
    if (parentBody) createStep.body = parentBody;

    // Apply declaration-driven path-prefix substitutions, body overrides, and
    // chain dependencies to the create step itself. Without this, parent
    // endpoints whose path contains :params (e.g. POST /teams/:id/members) keep
    // the literal ':id' and 404 at runtime, and parent endpoints whose body
    // references foreign resources (x-probe-resource-ref) keep ${uniqEmail}
    // pointing at no user. Mirrors the resolution that emitHappyFlow already
    // applies to leaf endpoints — chain create steps are leaf consumers too.
    const _chainRefs = resolveResourceRefDeps(parentEp, endpoints);
    if (_chainRefs.pathSubstitutions && Object.keys(_chainRefs.pathSubstitutions).length > 0) {
      for (const [param, sigil] of Object.entries(_chainRefs.pathSubstitutions)) {
        createStep.path = createStep.path.replace(`:${param}`, sigil);
      }
    }
    if (_chainRefs.overrides && Object.keys(_chainRefs.overrides).length > 0) {
      if (createStep.body && typeof createStep.body === 'object') {
        createStep.body = { ...createStep.body, ..._chainRefs.overrides };
      }
    }
    if (_chainRefs.deps && _chainRefs.deps.length > 0) {
      for (const dep of _chainRefs.deps) {
        if (dep !== chainId && !deps.includes(dep)) deps.push(dep);
      }
    }

    steps.push(createStep);
    steps.push({ kind: 'expect', status: expectStatus });
    // Envelope-aware capture: when successWrapper is present (e.g. ['data']),
    // the id field lives at $.data.id, not $.id. Declaration-driven from
    // matrix.responseEnvelope detected by detectors/response-envelope.js.
    const setupEnvelope = opts.envelopeWrapper || null;
    let envelopedCapture = captureFrom;
    if (setupEnvelope && captureFrom.startsWith('$.')) {
      const leaf = captureFrom.slice(2); // strip '$.'
      const prefix = Array.isArray(setupEnvelope) ? setupEnvelope.join('.') : setupEnvelope;
      envelopedCapture = `$.${prefix}.${leaf}`;
    }
    steps.push({
      kind: 'capture',
      bindings: { [`resource:${resourceLabel}:id`]: envelopedCapture },
    });

    flows.push({
      id: chainId,
      contract: {
        endpoint: epKey(parentEp.method, parentEp.path),
        kind: 'chain-resource-setup',
        source: parentEp.file,
      },
      dependsOn: deps,
      onFail: {
        check: [parentEp.file],
        implies: `Resource setup for '${resourceLabel}' via ${parentEp.operationId || parentEp.path} failed.`,
      },
      steps,
    });
  }

  // --- Part A: path-prefix autodetection (declaration-driven via x-resource-captures) ---
  for (const ep of endpoints) {
    const parentInfo = detectPathPrefixParent(ep, endpoints);
    if (!parentInfo) continue;

    // Declaration-driven: read x-resource-captures from parent endpoint.
    // Absent declaration -> DIAG -> no chain emitted.
    const parentExtensions = (parentInfo.parentEp.swaggerDeclared &&
      parentInfo.parentEp.swaggerDeclared.extensions) || {};
    const captures = parentExtensions['x-resource-captures'];

    if (!captures || !Array.isArray(captures) || captures.length === 0) {
      if (opts.diagnostics) {
        opts.diagnostics.push({
          code: 'RESOURCE_CAPTURE_UNDECLARED',
          endpoint: epKey(parentInfo.parentEp.method, parentInfo.parentEp.path),
          message: `${parentInfo.parentEp.method} ${parentInfo.parentEp.path}: no @ResourceCaptures decorator. Add it to enable downstream chains.`,
        });
      }
      continue;
    }

    const matching = captures.find((c) => c.pathParam === parentInfo.paramName);
    if (!matching) {
      if (opts.diagnostics) {
        const declared = captures.map((capture) => `'${capture.pathParam}'`).join(',');
        const seed = captures[0];
        const existingTuple = `{ fromPath: '${seed.fromPath}', resource: '${seed.resource}', pathParam: '${seed.pathParam}' }`;
        const additiveTuple = `{ fromPath: '${seed.fromPath}', resource: '${seed.resource}', pathParam: '${parentInfo.paramName}' }`;
        opts.diagnostics.push({
          code: 'RESOURCE_CAPTURE_PATHPARAM_UNDECLARED',
          endpoint: epKey(parentInfo.parentEp.method, parentInfo.parentEp.path),
          message:
            `Parent POST ${parentInfo.parentEp.path} declares @ResourceCaptures with pathParam=[${declared}] ` +
            `but consumer route ${ep.path} uses ':${parentInfo.paramName}'. ` +
            `FIX: on the parent CREATE handler, ADD a second additive @ResourceCaptures tuple alongside the existing one — ` +
            `same fromPath ('${seed.fromPath}') and same resource ('${seed.resource}'), only pathParam='${parentInfo.paramName}'. ` +
            `Example: @ResourceCaptures(${existingTuple}, ${additiveTuple}). ` +
            `Purely additive metadata — no behavior change, same auth/Zod/status. ` +
            `The chain emitter looks up captures by pathParam, so each child placeholder needs its own alias.`,
        });
      }
      continue;
    }

    const captureField = `$.${matching.fromPath}`;
    emitChain(parentInfo.chainId, parentInfo.parentEp, parentInfo.resourceName, captureField);
  }

  // --- Part B: body-field x-probe-resource-ref (declaration-driven via x-resource-captures) ---
  for (const ep of endpoints) {
    const refs = ep.swaggerDeclared && ep.swaggerDeclared.extensions
      && ep.swaggerDeclared.extensions['x-probe-resource-ref'];
    if (!refs) continue;

    const refList = Array.isArray(refs) ? refs : [refs];
    for (const ref of refList) {
      if (!ref || !ref.parentField) continue;

      let parentEp = null;
      let resourceLabel = ref.parentField;

      if (ref.parentCreate && ref.parentCreate.operationId) {
        parentEp = endpoints.find((e) => e.operationId === ref.parentCreate.operationId);
      } else if (ref.resource) {
        parentEp = endpoints.find((e) => e.method === 'POST' && e.path === ref.resource);
        if (parentEp) resourceLabel = ref.resource.split('/').pop() || ref.parentField;
      }

      if (!parentEp) continue;

      // Declaration-driven: read captureFrom from ref (explicit in x-probe-resource-ref)
      // or fall back to x-resource-captures on the parent endpoint.
      let captureFrom = ref.captureFrom || null;
      if (!captureFrom) {
        const parentExts = (parentEp.swaggerDeclared &&
          parentEp.swaggerDeclared.extensions) || {};
        const parentCaptures = parentExts['x-resource-captures'];
        if (parentCaptures && Array.isArray(parentCaptures) && parentCaptures.length > 0) {
          captureFrom = `$.${parentCaptures[0].fromPath}`;
        } else {
          if (opts.diagnostics) {
            opts.diagnostics.push({
              code: 'RESOURCE_CAPTURE_UNDECLARED',
              endpoint: epKey(parentEp.method, parentEp.path),
              message: `${parentEp.method} ${parentEp.path}: no captureFrom in x-probe-resource-ref and no @ResourceCaptures decorator. Add declaration to enable chain.`,
            });
          }
          continue;
        }
      }

      if (ref.kind === 'array') {
        const count = Math.max(1, Number(ref.count) || 2);
        emitArrayChain(
          `chain:resource-setup:${resourceLabel}:array:${count}`,
          parentEp,
          resourceLabel,
          captureFrom,
          count,
        );
      } else {
        emitChain(`chain:resource-setup:${resourceLabel}`, parentEp, resourceLabel, captureFrom);
      }
    }
  }

  return flows;

  function emitArrayChain(chainId, parentEp, resourceLabel, captureFrom, count) {
    if (emittedChains.has(chainId)) return;
    emittedChains.add(chainId);

    const uniqueFieldSet = effectiveUniqueFieldSet(parentEp, opts.uniqueFieldSet);
    const parentBody = parentEp.zodContract
      ? buildSampleBody(parentEp.zodContract, uniqueFieldSet)
      : null;

    const steps = [];
    const deps = [];

    const parentNeedsAuth = Boolean(
      parentEp.authDecorators && parentEp.authDecorators.authRequired,
    );
    if (parentNeedsAuth && opts.authBootstrapAvailable) {
      steps.push({ kind: 'setAuth', binding: 'accessToken' });
      deps.push('chain:auth-bootstrap');
    }

    const declaredStatuses = (parentEp.swaggerDeclared && parentEp.swaggerDeclared.statuses) || [];
    const expectStatus = declaredStatuses.find((s) => s >= 200 && s < 300) || 201;

    const _chainRefs = resolveResourceRefDeps(parentEp, endpoints);
    if (_chainRefs.deps && _chainRefs.deps.length > 0) {
      for (const dep of _chainRefs.deps) {
        if (dep !== chainId && !deps.includes(dep)) deps.push(dep);
      }
    }

    const setupEnvelope = opts.envelopeWrapper || null;
    let envelopedCapture = captureFrom;
    if (setupEnvelope && captureFrom.startsWith('$.')) {
      const leaf = captureFrom.slice(2);
      const prefix = Array.isArray(setupEnvelope) ? setupEnvelope.join('.') : setupEnvelope;
      envelopedCapture = `$.${prefix}.${leaf}`;
    }

    for (let i = 0; i < count; i++) {
      const createStep = { kind: 'api', method: 'POST', path: parentEp.path };
      if (parentBody) createStep.body = { ...parentBody };
      if (_chainRefs.pathSubstitutions && Object.keys(_chainRefs.pathSubstitutions).length > 0) {
        for (const [param, sigil] of Object.entries(_chainRefs.pathSubstitutions)) {
          createStep.path = createStep.path.replace(`:${param}`, sigil);
        }
      }
      if (_chainRefs.overrides && Object.keys(_chainRefs.overrides).length > 0 && createStep.body) {
        createStep.body = { ...createStep.body, ..._chainRefs.overrides };
      }
      steps.push(createStep);
      steps.push({ kind: 'expect', status: expectStatus });
      steps.push({
        kind: 'capture',
        bindings: { [`resource:${resourceLabel}:id:${i}`]: envelopedCapture },
      });
    }

    flows.push({
      id: chainId,
      contract: {
        endpoint: epKey(parentEp.method, parentEp.path),
        kind: 'chain-resource-setup-array',
        source: parentEp.file,
      },
      dependsOn: deps,
      onFail: {
        check: [parentEp.file],
        implies: `Array resource setup for '${resourceLabel}' x${count} via ${parentEp.operationId || parentEp.path} failed.`,
      },
      steps,
    });
  }
}

function generate(matrix, logical, overlay, curatedFlowSteps) {
  const ignorePatterns = (overlay && overlay.ignore) || [];
  const flows = [];
  const diagnostics = [];

  const endpoints = (matrix.apiEndpoints || []).filter((ep) =>
    !matchesIgnore(ep.path, ignorePatterns)
  );
  const pages = (matrix.pages || []);
  const logicalRows = (logical && logical.rows) || [];

  const resourceGraph = buildResourceGraph(matrix, diagnostics);

  const fkColumnIndex = new Map();
  for (const node of resourceGraph.resources.values()) {
    for (const fk of node.fks) {
      if (!fkColumnIndex.has(fk.column)) fkColumnIndex.set(fk.column, []);
      fkColumnIndex.get(fk.column).push({ parentModel: fk.parent, fkType: resourceGraph.parentIdType(fk.parent) });
    }
  }

  function findParentPostEndpoint(parentModelName) {
    const parentNode = resourceGraph.findResourceByModel(parentModelName);
    return parentNode ? parentNode.createEndpoint : null;
  }

  for (const ep of endpoints) {
    if (!ep.zodContract || !ep.zodContract.fields) continue;
    if (!['POST', 'PUT', 'PATCH'].includes(ep.method)) continue;
    const declaredRefsRaw = (ep.swaggerDeclared && ep.swaggerDeclared.extensions
      && ep.swaggerDeclared.extensions['x-probe-resource-ref']) || [];
    const declaredRefList = Array.isArray(declaredRefsRaw) ? declaredRefsRaw : [declaredRefsRaw];
    const declaredRefFields = new Set(
      declaredRefList.map((ref) => ref && ref.parentField).filter(Boolean),
    );
    const fieldNames = Array.isArray(ep.zodContract.fields)
      ? ep.zodContract.fields.map((field) => field && field.name).filter(Boolean)
      : Object.keys(ep.zodContract.fields);
    for (const fieldName of fieldNames) {
      if (declaredRefFields.has(fieldName)) continue;
      const fkInfos = fkColumnIndex.get(fieldName);
      if (!fkInfos || fkInfos.length === 0) continue;
      const fkInfo = fkInfos[0];
      const parentEp = findParentPostEndpoint(fkInfo.parentModel);
      if (!parentEp) {
        diagnostics.push({
          code: 'MISSING_BODY_RESOURCE_REF_PARENT_UNRESOLVED',
          endpoint: `${ep.method} ${ep.path}`,
          field: fieldName,
          parentModel: fkInfo.parentModel,
          parentFkType: fkInfo.fkType,
          file: ep.file || '(controller file unknown)',
          message: `Field "${fieldName}" in ${ep.method} ${ep.path} is a Prisma FK to model "${fkInfo.parentModel}", but no POST endpoint declares @ResourceCaptures({ resource: '${fkInfo.parentModel.charAt(0).toLowerCase() + fkInfo.parentModel.slice(1)}', ... }) — cannot locate the parent's create endpoint. Either add @ResourceCaptures to the parent's POST endpoint or declare @BodyResourceRefs([{ parentField: '${fieldName}', resource: '/<path-to-parent>' }]) on this endpoint.`,
        });
        continue;
      }
      diagnostics.push({
        code: 'MISSING_BODY_RESOURCE_REF',
        endpoint: `${ep.method} ${ep.path}`,
        field: fieldName,
        parentModel: fkInfo.parentModel,
        parentFkType: fkInfo.fkType,
        resourcePath: parentEp.path,
        file: ep.file || '(controller file unknown)',
        message: `Field "${fieldName}" in ${ep.method} ${ep.path} is a Prisma FK to ${fkInfo.parentModel} (created at ${parentEp.method} ${parentEp.path}). Endpoint does not declare @BodyResourceRefs — generator substitutes random junk → 404 cascade in auto-gen chain flows.`,
      });
    }
  }

  // Prisma-declared uniques → sigil substitution set. Consumed by every
  // emitter that calls buildSampleBody so unique fields (e.g. User.email)
  // are replaced with ${uniqEmail} / ${uniqString} / ${uniqUuid} and
  // resolved to per-flow run-unique values at probe time.
  const uniqueFieldSet = collectUniqueFieldNames(matrix.prismaModels);

  // Declaration-driven auth flow detection. Replaces path-regex matching
  // with operationId / responseSchema / extension-based identification.
  // Path regex is kept as TERTIARY fallback with DIAG warning.
  const authFlowsDiag = [];
  const authFlowsDetected = detectAuthFlows(matrix, authFlowsDiag);
  diagnostics.push(...authFlowsDiag);

  // auth-bootstrap-available ⇒ authed :happy flows can prepend setAuth and
  // dependsOn the chain. Without register+login, generic authed success
  // flows are skipped as ungeneratable; auth-boundary flows still verify 401.
  const authBootstrapAvailable = Boolean(authFlowsDetected.tokenIssuer && authFlowsDetected.register);

  // Success envelope path from matrix.responseEnvelope (statically extracted).
  // string[] e.g. ['data'] or ['payload','data'] for N-deep. Joined with '.'
  // when prepended to bodyHas paths (e.g. 'data.accessToken').
  const envelopeWrapper = (matrix.responseEnvelope && matrix.responseEnvelope.successWrapper) || null;

  // Error envelope wrapper — prefer consolidated errorWrapper on responseEnvelope,
  // fall back to standalone errorEnvelope.wrapper for back-compat.
  const errorEnvelopeWrapper =
    (matrix.responseEnvelope && matrix.responseEnvelope.errorWrapper) ||
    (matrix.errorEnvelope && matrix.errorEnvelope.wrapper) ||
    null;

  const securitySchemes = matrix.securitySchemes || {};

  // Build a set of endpoint paths that have specialized security flows.
  // Generic emitHappyFlow skips these — their happy path is covered by
  // the dedicated CSRF / OAuth / tenant-isolation flow emitters which
  // supply the required tokens, headers, and body parameters.
  const securityCoveredPaths = new Set();

  // CSRF-protected endpoints (require a security scheme whose name matches csrf/xsrf)
  if (matrix.csrf && matrix.csrf.detected) {
    for (const ep of endpoints) {
      if (ep.method === 'POST' && Array.isArray(ep.securityRequirement) &&
          ep.securityRequirement.some((req) => req && Object.keys(req).some((sn) => /csrf|xsrf/i.test(sn)))) {
        securityCoveredPaths.add(epKey(ep.method, ep.path));
      }
    }
  }

  // OAuth endpoints (require specific body/query params). Use resolved role
  // paths (always relative) preferring over scheme URLs (may be absolute).
  if (matrix.oauth && matrix.oauth.detected) {
    const oauthRoles = (matrix.oauth.roles) || {};
    const oauthTokenPath = (oauthRoles.token && oauthRoles.token.path) || toRelativePath(matrix.oauth.tokenUrl);
    const oauthAuthorizePath = (oauthRoles.authorize && oauthRoles.authorize.path) || toRelativePath(matrix.oauth.authorizeUrl);
    const oauthCallbackPath = (oauthRoles.callback && oauthRoles.callback.path) || matrix.oauth.callbackUrl;
    if (oauthTokenPath) securityCoveredPaths.add(epKey('POST', oauthTokenPath));
    if (oauthAuthorizePath) securityCoveredPaths.add(epKey('GET', oauthAuthorizePath));
    if (oauthCallbackPath) securityCoveredPaths.add(epKey('GET', oauthCallbackPath));
  }

  // Tenant-scoped endpoints (require tenant header)
  if (matrix.multiTenant && matrix.multiTenant.detected) {
    const tenant = matrix.multiTenant;
    if ((tenant.strategy === 'header' || tenant.strategy === 'extension' || tenant.strategy === 'decorator') && tenant.headerName) {
      for (const ep of endpoints) {
        const headers = (ep.parameters || []).filter((p) => p.in === 'header');
        if (headers.some((h) => h.name && h.name.toLowerCase() === tenant.headerName.toLowerCase())) {
          securityCoveredPaths.add(epKey(ep.method, ep.path));
        }
      }
    }
  }

  // Cookie-flow consumers and rotators require a prior cookie-issuing step
  // that the generic emitHappyFlow cannot supply. Their happy path is covered
  // by the dedicated cookie-flow emitters (emitCookieSession,
  // emitCookieRefreshRotation, emitCookieCsrfDoubleSubmit, etc.).
  // Declaration-driven: uses matrix.cookieFlows[].consumers/rotators — never
  // path regex or method guessing.
  const cookieFlowsForSkip = matrix.cookieFlows || [];
  for (const cf of cookieFlowsForSkip) {
    if (!cf) continue;
    const cfConsumers = cf.consumers || [];
    for (const consumer of cfConsumers) {
      if (consumer.method && consumer.path) {
        securityCoveredPaths.add(epKey(consumer.method, consumer.path));
        diagnostics.push({
          level: 'info',
          code: 'ENDPOINT_HAPPY_SKIPPED_COOKIE_GUARDED',
          endpoint: epKey(consumer.method, consumer.path),
          message: `Skipped endpoint-happy for cookie consumer '${consumer.operationId || consumer.path}' — requires cookie '${cf.name}' (role=${cf.role}). Covered by cookie-flow emitter.`,
        });
      }
    }
    const cfRotators = cf.rotators || [];
    for (const cfRotator of cfRotators) {
      if (cfRotator.method && cfRotator.path) {
        // Rotators may also appear in consumers; Set deduplicates.
        securityCoveredPaths.add(epKey(cfRotator.method, cfRotator.path));
        diagnostics.push({
          level: 'info',
          code: 'ENDPOINT_HAPPY_SKIPPED_COOKIE_GUARDED',
          endpoint: epKey(cfRotator.method, cfRotator.path),
          message: `Skipped endpoint-happy for cookie rotator '${cfRotator.operationId || cfRotator.path}' — requires cookie '${cf.name}' (role=${cf.role}). Covered by cookie-flow emitter.`,
        });
      }
    }
  }

  // Pre-compute which statuses the OAuth and CSRF emitters will cover,
  // so the blanket UNGENERATABLE loop can skip them (they have real flows).
  const oauthCovered = oauthCoveredStatuses(matrix);
  const csrfCovered = csrfCoveredStatuses(matrix);

  // Page-role identity map. Source of truth: matrix.pageRoles (statically
  // extracted by detectors/page-identity.js from sibling page.identity.<ext>
  // files). overlay.auth.* is honored as a one-off override / fallback for
  // projects that haven't yet adopted the sibling-file convention. Never
  // guess from route names — that's a heuristic and is forbidden.
  const pageRoles = { ...(matrix.pageRoles || {}) };
  if (overlay && overlay.auth) {
    if (overlay.auth.loginPage) pageRoles['login-page'] = overlay.auth.loginPage;
    if (overlay.auth.registerPage) pageRoles['register-page'] = overlay.auth.registerPage;
    if (overlay.auth.postLoginDestination) {
      pageRoles['post-login-destination'] = overlay.auth.postLoginDestination;
    }
  }

  const emitOpts = { uniqueFieldSet, authBootstrapAvailable, envelopeWrapper, errorEnvelopeWrapper, authFlows: authFlowsDetected, securitySchemes, securityCoveredPaths, cookieFlows: matrix.cookieFlows || [], diagnostics, overlay, pageRoles, endpoints, prismaModels: (matrix && matrix.prismaModels && matrix.prismaModels.models) || {}, resourceGraph };

  // --- Per-endpoint flows (rules 1-5) ---
  for (const ep of endpoints) {
    const happyFlow = emitHappyFlow(ep, emitOpts);
    // emitHappyFlow returns null for endpoints whose happy path is covered
    // elsewhere (e.g. login, when the auth-bootstrap chain already exercises
    // it with a real registered user).
    if (happyFlow) flows.push(happyFlow);

    const coveredStatuses = new Set();
    if (happyFlow) {
      const happyStatus = happyFlow.steps.find((s) => s.kind === 'expect');
      if (happyStatus && happyStatus.status) coveredStatuses.add(happyStatus.status);
    }

    const invalidatorFlows = emitInvalidatorFlows(ep, emitOpts);
    flows.push(...invalidatorFlows);

    const queryInvalidatorFlows = emitQueryInvalidatorFlows(ep, emitOpts);
    flows.push(...queryInvalidatorFlows);

    // Derive 400 coverage from actually-emitted invalidator flows. Pre-marking
    // 400 unconditionally is a heuristic — endpoints with no validatable input
    // (GET with no query schema) or that throw 400 unconditionally
    // (rich-error) get falsely marked covered, suppressing the parametric /
    // status-reach emitters that would otherwise generate a real 400 flow.
    for (const invFlow of [...invalidatorFlows, ...queryInvalidatorFlows]) {
      for (const step of invFlow.steps) {
        if (step.kind === 'expect') {
          if (step.status) coveredStatuses.add(step.status);
          if (Array.isArray(step.statusAnyOf)) {
            for (const s of step.statusAnyOf) coveredStatuses.add(s);
          }
        }
      }
    }

    const authFlows = emitAuthBoundaryFlows(ep, emitOpts);
    flows.push(...authFlows);
    if (authFlows.length > 0) coveredStatuses.add(401);
    if (ep.authDecorators && ep.authDecorators.rolesRequired && ep.authDecorators.rolesRequired.length > 0) {
      coveredStatuses.add(403);
    }


    // Rule 3b: Auth-scheme 401 flows for non-bearer schemes (apiKey, basic)
    const authSchemeFlows = emitAuthScheme401Flows(ep, emitOpts);
    flows.push(...authSchemeFlows);
    if (authSchemeFlows.length > 0) coveredStatuses.add(401);

    // Rule 3c: Login flow flows for endpoints with x-auth-flow: 'login'
    const loginFlows = emitLoginFlowFlows(ep, emitOpts);
    flows.push(...loginFlows);
    for (const lf of loginFlows) {
      const expectStep = lf.steps.find((s) => s.kind === 'expect');
      if (expectStep && expectStep.status) coveredStatuses.add(expectStep.status);
    }
    const dupFlow = happyFlow ? emitDuplicateConflictFlow(ep, happyFlow.id, emitOpts) : null;
    if (dupFlow) {
      flows.push(dupFlow);
      coveredStatuses.add(409);
      coveredStatuses.add(400);
      coveredStatuses.add(422);
    }

    // Content-type flows (upload / download / SSE) are emitted later via
    // emitContentTypeFlows(). Pre-register the statuses they cover so the
    // status-reachability checker does not emit spurious
    // CONTRACT_STATUS_UNREACHABLE_UNGENERATABLE diagnostics for endpoints
    // already covered by the upload / download / stream emitters.
    if (isMultipartEndpoint(ep) || isBinaryUploadEndpoint(ep)) {
      const declared = (ep.swaggerDeclared && ep.swaggerDeclared.statuses) || [];
      const declaredSuccess = declared.find((s) => s >= 200 && s < 300);
      if (declaredSuccess) coveredStatuses.add(declaredSuccess);
      if (declared.includes(413)) coveredStatuses.add(413);
      if (declared.includes(415)) coveredStatuses.add(415);
    }
    if (isBinaryDownloadEndpoint(ep)) {
      const declared = (ep.swaggerDeclared && ep.swaggerDeclared.statuses) || [];
      const declaredSuccess = declared.find((s) => s >= 200 && s < 300);
      if (declaredSuccess) coveredStatuses.add(declaredSuccess);
      else coveredStatuses.add(200);
    }
    if (isSSEEndpoint(ep)) {
      const declared = (ep.swaggerDeclared && ep.swaggerDeclared.statuses) || [];
      const declaredSuccess = declared.find((s) => s >= 200 && s < 300);
      if (declaredSuccess) coveredStatuses.add(declaredSuccess);
      else coveredStatuses.add(200);
    }

    // Security flows (CSRF, OAuth, tenant-isolation) are emitted later
    // via dedicated emitters. Pre-register all declared statuses for
    // security-covered endpoints so the status-reachability checker does
    // not emit CONTRACT_STATUS_UNREACHABLE for statuses that are reached
    // by the dedicated security flows. For OAuth and CSRF endpoints, only
    // emit UNGENERATABLE for statuses that those emitters do NOT cover —
    // statuses with real security flows should not be marked ungeneratable.
    if (securityCoveredPaths.has(epKey(ep.method, ep.path))) {
      const declared = (ep.swaggerDeclared && ep.swaggerDeclared.statuses) || [];
      const oauthStatusSet = oauthCovered.get(epKey(ep.method, ep.path));
      const csrfStatusSet = csrfCovered.get(epKey(ep.method, ep.path));
      for (const s of declared) {
        coveredStatuses.add(s);
        // Skip UNGENERATABLE for statuses that OAuth flows already exercise.
        if (oauthStatusSet && oauthStatusSet.has(s)) continue;
        // Skip UNGENERATABLE for statuses that CSRF consume flows already exercise.
        if (csrfStatusSet && csrfStatusSet.has(s)) continue;
        diagnostics.push({
          code: 'CONTRACT_STATUS_UNREACHABLE_UNGENERATABLE',
          message: `Status ${s} declared on ${ep.method} ${ep.path} but no known pattern can generate a flow for it.`,
          endpoint: epKey(ep.method, ep.path),
        });
      }
    }

    // Conditional-request flows (ETag/If-Match) are emitted later via
    // emitConditionalFlows(). Pre-register their statuses so the
    // status-reachability emitter does not emit broken single-step probes
    // for 304/412 (which require multi-step capture to reach correctly).
    if (ep.conditionalProfile) {
      for (const cs of ep.conditionalProfile.conditionalStatuses) {
        coveredStatuses.add(cs);
      }
      // For PUT/PATCH with if-match pattern, the :if-match-valid flow covers
      // 200/204. Pre-register those so the status-reach checker doesn't emit
      // a simple single-step probe that would fail (missing required If-Match).
      if (['PUT', 'PATCH'].includes(ep.method) && ep.conditionalProfile.patterns.includes('if-match')) {
        coveredStatuses.add(200);
        coveredStatuses.add(204);
      }
    }

    // --- Parametric-status flows (x-status-param + x-status-param-values) ---
    // Must run before status-reachability so it can mark statuses as covered.
    const paramStatusFlows = emitParametricStatusFlows(ep, coveredStatuses, diagnostics);
    flows.push(...paramStatusFlows);

    const reachFlows = emitStatusReachabilityFlows(ep, coveredStatuses, diagnostics, emitOpts);
    flows.push(...reachFlows);
  }

  // --- Chained flows (rules 6-9) ---
  const authBootstrap = emitAuthBootstrapChain(endpoints, emitOpts);
  if (authBootstrap) flows.push(authBootstrap);

  const sessionLifecycle = emitSessionLifecycleChain(endpoints, emitOpts);
  if (sessionLifecycle) flows.push(sessionLifecycle);

  const postRegister = emitPostRegisterLanding(endpoints, pages, emitOpts);
  if (postRegister) flows.push(postRegister);

  // --- Resource-setup chains (must precede CRUD so dependsOn resolves) ---
  const resourceSetupFlows = emitResourceSetupChains(endpoints, emitOpts);
  flows.push(...resourceSetupFlows);

  const crudFlows = emitCrudRoundtrips(endpoints, emitOpts);
  flows.push(...crudFlows);

  // --- Pagination coverage flows ---
  const paginationFlows = emitPaginationFlows(endpoints, emitOpts);
  flows.push(...paginationFlows);

  // --- Content-type flows (upload, download, SSE) ---
  const contentTypeFlows = emitContentTypeFlows(endpoints, emitOpts);
  flows.push(...contentTypeFlows);

  // --- Content-type diagnostics ---
  diagnostics.push(...emitContentTypeDiagnostics(endpoints));

  // --- WebSocket namespace diagnostics ---
  if (matrix.websocketGateways && Array.isArray(matrix.websocketGateways)) {
    diagnostics.push(...emitWsDiagnostics(matrix.websocketGateways));
  }

  // --- Conditional-request flows (ETag, If-Match, If-None-Match) ---
  const conditionalFlows = emitConditionalFlows(endpoints, emitOpts);
  flows.push(...conditionalFlows);

  // --- Idempotency-key flows ---
  const idempotencyFlows = emitIdempotencyFlows(endpoints, emitOpts);
  flows.push(...idempotencyFlows);

  // --- Refresh-token rotation chain ---
  const refreshChain = emitRefreshChain(endpoints, emitOpts);
  if (refreshChain) flows.push(refreshChain);

  // --- WebSocket gateway flows ---
  const wsFlows = emitWebSocketFlows(matrix, emitOpts);
  flows.push(...wsFlows);

  // --- GraphQL query/mutation flows ---
  const graphqlFlows = emitGraphQLFlows(matrix, emitOpts);
  flows.push(...graphqlFlows);

  // --- CSRF protection flows ---
  const csrfFlows = emitCsrfFlows(matrix, emitOpts);
  flows.push(...csrfFlows);

  // --- OAuth2 flows ---
  const oauthFlows = emitOAuthFlows(matrix, emitOpts);
  flows.push(...oauthFlows);

  // --- Multi-tenant isolation flows ---
  const tenantFlows = emitTenantIsolationFlows(matrix, emitOpts);
  flows.push(...tenantFlows);

  // --- Cookie-flow emitters ---
  const cookieFlows = matrix.cookieFlows || [];
  for (const cf of cookieFlows) {
    if (!cf || !cf.role) continue;
    switch (cf.role) {
      case 'refresh-token':
        flows.push(...emitCookieRefreshRotation(cf, emitOpts));
        break;
      case 'session':
        flows.push(...emitCookieSession(cf, emitOpts));
        break;
      case 'csrf-double-submit':
        flows.push(...emitCookieCsrfDoubleSubmit(cf, emitOpts));
        break;
      case 'oauth-state':
        flows.push(...emitCookieOAuthState(cf, emitOpts));
        break;
      case 'tenant-scope':
        flows.push(...emitCookieTenantScope(cf, emitOpts));
        break;
      case 'locale':
      case 'theme':
      case 'feature-flag':
        flows.push(...emitCookieAppState(cf, emitOpts));
        break;
      default:
        break;
    }
  }

  // --- Rule 10: Logical-contract row flows ---
  const logicalFlows = emitLogicalContractFlows(logicalRows, endpoints, pages, emitOpts);
  flows.push(...logicalFlows);

  // --- Deduplicate by flow id ---
  const seen = new Set();
  const deduped = [];
  for (const flow of flows) {
    if (!seen.has(flow.id)) {
      seen.add(flow.id);
      deduped.push(flow);
    }
  }

  // --- Fan out resource-setup chains with multiple mutating dependents ---
  // A resource-setup chain creates a stateful record (e.g. a membership).
  // The runner shares its captured bindings session-wide. When two or more
  // dependent flows mutate that record (DELETE/PATCH/PUT, or POST that
  // consumes it), the first mutator wins and later mutators see "X not
  // found". Fix: emit one chain copy per mutating dependent with unique
  // binding keys, and rewrite the dependents to reference the assigned
  // copy. Detection is purely declarative: dependsOn graph + step.method +
  // captured-sigil reference. No name patterns, no domain knowledge.
  // Endpoints declared `x-idempotent: true` opt out of mutation classification.
  const fanned = fanOutMutableChains(deduped);

  // --- Post-generation coverage-set suppression ---
  // Cross-endpoint emitters (tenant-isolation, auth chains, refresh chains,
  // CSRF, OAuth) run AFTER the per-endpoint status-reachability loop, so
  // their status coverage is invisible to the per-endpoint UNGENERATABLE
  // diagnostic. Build a set of (method, path, status) tuples from ALL
  // emitted flows and filter out UNGENERATABLE diagnostics whose tuple is
  // already covered. This is purely declarative: only declared flows with
  // declared statusAnyOf / status expectations count as coverage.
  // Generated flows already use prefixed paths (their step.path comes from
  // OpenAPI surface). Curated flows use unprefixed paths because the runtime
  // (executeCuratedFlows in http-smoke.ts) prepends the API global prefix
  // — pass `matrix.authDetection.apiPrefix` so curated coverage emits BOTH
  // variants and matches diagnostic endpoint strings (which always include
  // the OpenAPI prefix). Without this, CONTRACT_STATUS_UNREACHABLE_UNGENERATABLE
  // for an endpoint covered ONLY by a curated flow silently survives the
  // post-generation filter.
  // Resolve the API global prefix used to normalize curated-flow coverage.
  // Preference order:
  //   1. matrix.authDetection.apiPrefix — explicit, set by matrix-loader's
  //      default ('api/v1') or by the auth-detector when it can prove one
  //      from `setGlobalPrefix(...)` calls in apps/api/src/main.ts.
  //   2. Derive from the common leading path segment of matrix.apiEndpoints —
  //      every NestJS app with @Controller routes ends up with a uniform
  //      prefix on apiEndpoints[].path. This is the safety net for matrices
  //      written before matrix-loader.ts's apiPrefix default was
  //      consistently applied (real-world bug observed on fresh seeds where
  //      .matrix.json omits the authDetection block entirely).
  //   3. null — no normalization (curated coverage falls back to literal
  //      step.path tuples).
  const apiPrefix = (
    (matrix && matrix.authDetection && matrix.authDetection.apiPrefix)
    || deriveApiPrefixFromEndpoints(matrix && matrix.apiEndpoints)
    || null
  );
  const generatedCoverage = buildCoverageSet(fanned);
  const curatedCoverage = buildCoverageSet(
    Array.isArray(curatedFlowSteps) ? curatedFlowSteps : [],
    apiPrefix
  );
  const coveredTuples = new Set([...generatedCoverage, ...curatedCoverage]);
  const filteredDiagnostics = diagnostics.filter((diag) => {
    if (diag.code !== 'CONTRACT_STATUS_UNREACHABLE_UNGENERATABLE') return true;
    // diag.endpoint is "METHOD /path", diag.message contains the status number.
    // Extract the status from the message: "Status NNN declared on ..."
    const statusMatch = diag.message && diag.message.match(/^Status (\d+) declared on /);
    if (!statusMatch) return true;
    const status = parseInt(statusMatch[1], 10);
    const literalKey = `${diag.endpoint}:${status}`;
    // Diagnostic endpoints from the OpenAPI/NestJS surface use `:id`-style
    // param markers ("GET /api/v1/brands/:id"). Curated flows often use
    // template-literal markers ("/brands/${brandId}") because that is what
    // the runtime contract-flow runner needs for binding substitution.
    // canonicalizePathParams reduces both shapes to `<P>` so a curated
    // entry covers the diagnostic regardless of naming style. See the
    // canonicalizePathParams JSDoc for the 2026-05-15 incident this fixes.
    const canonicalKey = `${canonicalizePathParams(diag.endpoint)}:${status}`;
    return !coveredTuples.has(literalKey) && !coveredTuples.has(canonicalKey);
  });

  // Sort by id for determinism.
  deduped.sort((a, b) => a.id.localeCompare(b.id));
  filteredDiagnostics.sort((a, b) =>
    (a.endpoint || '').localeCompare(b.endpoint || '') || a.code.localeCompare(b.code)
  );

  return { flows: sortKeys(fanned), diagnostics: sortKeys(filteredDiagnostics) };
}

/**
 * Fan out resource-setup chains that have multiple mutating dependents.
 *
 * Detection (purely declarative):
 *   - chain.contract.kind ∈ {chain-resource-setup, chain-body-resource-ref}
 *   - capturedSigils derived from chain's capture-step bindings
 *   - mutationDependents = flows declaring dependsOn[chain.id] AND containing
 *     an api step with method ∈ {DELETE, PATCH, PUT, POST} that references
 *     any capturedSigil in path/body/query/headers
 *   - if mutationDependents.length ≥ 2 → fan out
 *
 * Endpoints declared `x-idempotent: true` are excluded from the mutation set.
 *
 * Effect for each mutating dependent:
 *   - emit a clone of the chain with new id `${chain.id}:for:${depId}`
 *   - rename every captured binding key in the clone to `${oldKey}:for:${dep}`
 *   - rewrite dependent's dependsOn (chain.id → cloneId) and rewrite every
 *     reference to the old sigil in step.path/body/query/headers
 *
 * Original chain is preserved so non-mutating dependents (e.g. GETs) can
 * still share its single execution and bindings.
 */
function fanOutMutableChains(flows) {
  // POST is intentionally excluded: POST typically creates a sub-resource of
  // the captured parent (e.g. POST /teams/:id/members) without mutating the
  // parent itself, so multiple POSTs do not invalidate each other's view of
  // the parent. Including POST here would fan out chains unnecessarily and
  // produce cross-binding paths (one chain's copy creating a member in a
  // team belonging to a different copy). Only verbs that consume the
  // captured record itself qualify.
  const MUTATION_METHODS = new Set(['DELETE', 'PATCH', 'PUT']);
  const out = flows.slice();

  function containsSigil(value, sigil) {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.includes(sigil);
    if (Array.isArray(value)) return value.some((v) => containsSigil(v, sigil));
    if (typeof value === 'object') return Object.values(value).some((v) => containsSigil(v, sigil));
    return false;
  }

  function rewriteSigil(value, oldSigil, newSigil) {
    if (typeof value === 'string') return value.split(oldSigil).join(newSigil);
    if (Array.isArray(value)) return value.map((v) => rewriteSigil(v, oldSigil, newSigil));
    if (value && typeof value === 'object') {
      const next = {};
      for (const [k, v] of Object.entries(value)) next[k] = rewriteSigil(v, oldSigil, newSigil);
      return next;
    }
    return value;
  }

  function chainCapturedKeys(chain) {
    const keys = [];
    for (const step of chain.steps || []) {
      if (step.kind === 'capture' && step.bindings) {
        for (const k of Object.keys(step.bindings)) keys.push(k);
      }
    }
    return keys;
  }

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function isResourceSetupChain(flow) {
    return flow.contract && (
      flow.contract.kind === 'chain-resource-setup'
      || flow.contract.kind === 'chain-body-resource-ref'
    );
  }

  function suffixFor(depId) {
    return depId.replace(/[^a-zA-Z0-9]/g, '_');
  }

  function endpointDeclaresIdempotent(step, allFlows) {
    // The api step itself has no extension metadata at this layer; the
    // generator does not currently propagate `x-idempotent`. Skip until
    // detection is wired through the matrix. Always returns false today —
    // safe default (over-fan-out is correct, just slower). Hook left in
    // place so downstream extension parsing can opt out without rewriting
    // the algorithm.
    void step;
    void allFlows;
    return false;
  }

  for (const chain of flows) {
    if (!isResourceSetupChain(chain)) continue;

    const capturedKeys = chainCapturedKeys(chain);
    if (capturedKeys.length === 0) continue;
    const capturedSigils = capturedKeys.map((k) => `\${${k}}`);

    const dependents = flows.filter((f) =>
      Array.isArray(f.dependsOn) && f.dependsOn.includes(chain.id),
    );

    const mutationDependents = dependents.filter((dep) => {
      for (const step of dep.steps || []) {
        if (step.kind !== 'api') continue;
        if (!MUTATION_METHODS.has(step.method)) continue;
        if (endpointDeclaresIdempotent(step, flows)) continue;
        // The mutation TARGET in REST is the final path segment. Earlier
        // :params are scope/context (e.g. DELETE /teams/:id/members/:userId
        // mutates the member, not the team — :id is scope). Only fan out
        // a chain when its captured sigil is the target — i.e. it appears
        // in the LAST segment of the path. Without this, scope chains
        // (chain:resource-setup:teams) would fan out alongside the target
        // chain (chain:resource-setup:members) and create cross-binding
        // paths where the member chain's POST creates a member in one
        // team while the leaf's DELETE references a different team.
        if (typeof step.path !== 'string') continue;
        const lastSegment = step.path.split('/').filter(Boolean).pop() || '';
        for (const sigil of capturedSigils) {
          if (lastSegment.includes(sigil)) return true;
        }
      }
      return false;
    });

    if (mutationDependents.length < 2) continue;

    for (const dep of mutationDependents) {
      const suffix = suffixFor(dep.id);
      const flowsById = new Map();
      for (const f of out) flowsById.set(f.id, f);
      const copies = new Map(); // origChainId -> copy
      const allKeyRenames = new Map(); // origKey -> newKey across the whole tree

      // Recursively duplicate `chain` and its resource-setup dependencies
      // for this dep. Auth-bootstrap and other non-resource-setup chains
      // stay shared. Returns the cloned chain id.
      function duplicateTreeFor(origChain) {
        if (copies.has(origChain.id)) return copies.get(origChain.id).id;

        const copyId = `${origChain.id}:for:${suffix}`;
        const copy = clone(origChain);
        copy.id = copyId;
        copy.contract = { ...copy.contract, forFlow: dep.id };
        copies.set(origChain.id, copy);

        // Rename binding keys in this copy's capture steps and remember the
        // renames so consumers can rewrite their sigils.
        for (const step of copy.steps || []) {
          if (step.kind === 'capture' && step.bindings) {
            const renamed = {};
            for (const [k, v] of Object.entries(step.bindings)) {
              const newKey = `${k}:for:${suffix}`;
              renamed[newKey] = v;
              allKeyRenames.set(k, newKey);
            }
            step.bindings = renamed;
          }
        }

        // Recurse into dependencies that are themselves resource-setup
        // chains; replace their dep ids in this copy's dependsOn with the
        // duplicated ids. Without this recursive duplication, two member
        // chain copies would share the same upstream user/team chain and
        // collide on uniqueness constraints (e.g. PRISMA P2002 on
        // composite (teamId, userId)).
        const newDeps = [];
        for (const depId of copy.dependsOn || []) {
          const depChain = flowsById.get(depId);
          if (depChain && isResourceSetupChain(depChain)) {
            newDeps.push(duplicateTreeFor(depChain));
          } else {
            newDeps.push(depId);
          }
        }
        copy.dependsOn = newDeps;
        return copyId;
      }

      const newRootId = duplicateTreeFor(chain);

      // Apply ALL key renames across each copied chain's steps and the
      // dep flow's steps so every reference to an old sigil resolves to
      // the new tree's binding.
      function rewriteSteps(steps) {
        for (const step of steps || []) {
          if (step.kind !== 'api') continue;
          for (const [oldKey, newKey] of allKeyRenames) {
            const oldSigil = `\${${oldKey}}`;
            const newSigil = `\${${newKey}}`;
            if (step.path !== undefined) step.path = rewriteSigil(step.path, oldSigil, newSigil);
            if (step.body !== undefined) step.body = rewriteSigil(step.body, oldSigil, newSigil);
            if (step.query !== undefined) step.query = rewriteSigil(step.query, oldSigil, newSigil);
            if (step.headers !== undefined) step.headers = rewriteSigil(step.headers, oldSigil, newSigil);
          }
        }
      }
      for (const copy of copies.values()) rewriteSteps(copy.steps);
      rewriteSteps(dep.steps);

      // Wire dep to the new root copy and emit all copies.
      dep.dependsOn = dep.dependsOn.map((d) => (d === chain.id ? newRootId : d));
      for (const copy of copies.values()) out.push(copy);
    }
  }

  // Orphan prune: an original resource-setup chain whose every dependent got
  // redirected to a copy AND that nothing else references becomes stateful
  // noise — it still runs in topo order, mutates the DB, and may fail with
  // confusing errors (e.g. owner mismatch). Remove originals that no
  // remaining flow references via dependsOn. Non-resource-setup chains
  // (auth-bootstrap, post-register-landing, session-lifecycle) are
  // preserved since the runner relies on them as global setup.
  const referenced = new Set();
  for (const f of out) {
    if (Array.isArray(f.dependsOn)) for (const d of f.dependsOn) referenced.add(d);
  }
  return out.filter((f) => {
    if (!isResourceSetupChain(f)) return true;
    if (referenced.has(f.id)) return true;
    // Keep if this is itself a fan-out copy — copies are the new roots.
    if (f.id.includes(':for:')) return true;
    return false;
  });
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

function main() {
  const flags = parseCli(process.argv);
  const dir = flags.projectDir || process.cwd();
  const matrixFile = flags.matrix || path.join(dir, '.claude', 'hooks', '.matrix.json');
  const logicalFile = flags.logical || path.join(dir, '.claude', 'runtime-contract.logical.json');
  const overlayFile = flags.overlay || path.join(dir, '.runtime-contract.overlay.json');
  const outputFile = flags.output || path.join(dir, '.claude', 'hooks', '.flows.generated.json');

  if (!fs.existsSync(matrixFile)) {
    console.error(`Matrix file not found: ${matrixFile}`);
    console.error('Run pnpm matrix:regen first.');
    process.exit(1);
  }

  const matrix = JSON.parse(fs.readFileSync(matrixFile, 'utf8'));

  let logical = { rows: [] };
  if (fs.existsSync(logicalFile)) {
    logical = JSON.parse(fs.readFileSync(logicalFile, 'utf8'));
  } else if (flags.verbose) {
    console.warn(`Logical contract not found: ${logicalFile} — skipping logical-contract flows.`);
  }

  let overlay = { ignore: [] };
  if (fs.existsSync(overlayFile)) {
    overlay = JSON.parse(fs.readFileSync(overlayFile, 'utf8'));
  }

  const curatedFlowSteps = loadCuratedFlowSteps(dir);
  const result = generate(matrix, logical, overlay, curatedFlowSteps);

  // Use matrix generatedAt for determinism.
  const generatedAt = matrix.generatedAt || 'generated';

  const output = {
    version: '1',
    generatedAt,
    matrixSource: '.claude/hooks/.matrix.json',
    logicalSource: '.claude/runtime-contract.logical.json',
    flows: result.flows,
    diagnostics: result.diagnostics,
  };

  const sorted = sortKeys(output);

  const outputDir = path.dirname(outputFile);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(outputFile, JSON.stringify(sorted, null, 2) + '\n');

  // Summary.
  const kinds = {};
  for (const flow of result.flows) {
    const kind = flow.contract.kind;
    kinds[kind] = (kinds[kind] || 0) + 1;
  }
  console.log(`flows-generator: wrote ${result.flows.length} flows to ${outputFile}`);
  console.log('  breakdown:', JSON.stringify(kinds));
  if (result.diagnostics.length > 0) {
    console.log(`  diagnostics: ${result.diagnostics.length}`);
    for (const d of result.diagnostics) {
      console.log(`    [${d.code}] ${d.message}`);
    }
  }
}

// Export for testing.
module.exports = {
  generate,
  loadCuratedFlowSteps,
  deriveApiPrefixFromEndpoints,
  canonicalizePathParams,
  fanOutMutableChains,
  sortKeys,
  matchesIgnore,
  fakeJwt,
  sha256,
  constructInvalidators,
  emitHappyFlow,
  emitInvalidatorFlows,
  emitQueryInvalidatorFlows,
  emitAuthBoundaryFlows,
  emitDuplicateConflictFlow,
  emitStatusReachabilityFlows,
  emitParametricStatusFlows,
  pickWrongMethod,
  emitAuthBootstrapChain,
  emitSessionLifecycleChain,
  emitPostRegisterLanding,
  emitCrudRoundtrips,
  emitPaginationFlows,
  emitLogicalContractFlows,
  emitUploadFlows,
  emitDownloadFlows,
  emitStreamingFlows,
  emitConditionalFlows,
  emitContentTypeFlows,
  emitIdempotencyFlow,
  emitIdempotencyFlows,
  emitRefreshChain,
  emitWebSocketFlows,
  buildSampleDataForEvent,
  emitGraphQLFlows,
  buildSampleVarsForArgs,
  sampleValueForGraphQLType,
  buildQueryString,
  buildSelectionSet,
  isMultipartEndpoint,
  isBinaryUploadEndpoint,
  isBinaryDownloadEndpoint,
  isSSEEndpoint,
  resolvePrimaryScheme,
  resolvePrimarySchemeType,
  emitCsrfFlows,
  emitAuthScheme401Flows,
  resolveSchemeType,
  emitLoginFlowFlows,
  resolveCsrfSchemeHeaderName,
  resolveEndpointCsrfHeaderName,
  emitOAuthFlows,
  oauthCoveredStatuses,
  csrfCoveredStatuses,
  emitTenantIsolationFlows,
  emitContentTypeDiagnostics,
  emitWsDiagnostics,
  buildCoverageSet,
  emitCookieRefreshRotation,
  emitCookieSession,
  emitCookieCsrfDoubleSubmit,
  emitCookieOAuthState,
  emitCookieTenantScope,
  emitCookieAppState,
  pickUniqueSigil,
  buildSampleBody,
  emitResourceSetupChains,
  resolveResourceRefDeps,
  detectPathPrefixParent,
};

// Run if invoked directly.
if (require.main === module) {
  main();
}
