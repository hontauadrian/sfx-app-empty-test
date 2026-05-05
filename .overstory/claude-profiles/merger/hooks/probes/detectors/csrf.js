'use strict';

/**
 * detectors/csrf.js — declaration-driven CSRF detection.
 *
 * Two layers, two policies — mirroring detectors/auth-flows.js:
 *
 * --- Layer 1: ROLE selection (which endpoint issues the CSRF token) -------
 *
 *   Strict canonical declaration only. The probe REFUSES to guess intent.
 *   Path regex is NEVER consulted — `/csrf-token` in the URL is a hint to
 *   humans, not a contract the probe can rely on.
 *
 *   Accepted signals (any of):
 *
 *     1. NestJS `@SetMetadata('csrf:issuer', true)` — surfaces in the
 *        endpoint matrix as `ep['csrf:issuer'] === true`. (Requires the
 *        matrix derivation to copy the metadata flag onto the endpoint;
 *        in practice, pair with `@ApiExtension('x-csrf-issues-token', true)`
 *        so the OpenAPI spec carries it.)
 *     2. OpenAPI extension `x-csrf-issues-token: true` on the operation —
 *        surfaces as `ep['x-csrf-issues-token'] === true`.
 *     3. operationId equals the canonical name `'csrfToken'`.
 *
 *   If 0 endpoints match → DIAG `CSRF_ISSUER_UNDETECTED`, return null.
 *   If >1 endpoints match → DIAG `CSRF_ISSUER_AMBIGUOUS`, return null.
 *
 * --- Layer 2: FIELD/HEADER NAME extraction (pure introspection) -----------
 *
 *   The probe reads whatever the project declares — never enforces canonical
 *   field or header names.
 *
 *     - tokenField: read from the issuing endpoint's responseContract.fields.
 *       Exactly one string-typed field → use it verbatim.
 *       Zero fields → DIAG `CSRF_TOKEN_FIELD_UNDETECTED`, tokenField=null.
 *       Multiple fields → DIAG `CSRF_TOKEN_FIELD_AMBIGUOUS`, tokenField=null.
 *
 *     - tokenHeaderName: read from the OpenAPI `parameters[in:header]` of the
 *       endpoint that declares the CSRF header (this is typically a different
 *       endpoint — the one the token is *consumed* by). The probe uses
 *       whatever name the project declares verbatim — NOT a hardcoded
 *       `x-csrf-token` default. If multiple distinct names are declared
 *       → DIAG `CSRF_HEADER_AMBIGUOUS`, tokenHeaderName=null. Falls back to
 *       OpenAPI `securitySchemes` apiKey-in-header name when no per-endpoint
 *       parameter is declared.
 *
 * --- Library / middleware detection (unchanged, role-orthogonal) ----------
 *
 *   Package deps (csurf / csrf-csrf / @nestjs/csrf / lusca) and middleware
 *   registration in main.ts. These set the `library` and `detected` flags
 *   independent of which endpoint plays the issuer role.
 *
 * --- Exports --------------------------------------------------------------
 *
 *   detectCsrf(projectDir, matrix, diag?) →
 *     { detected, library, tokenHeaderName, tokenEndpoint, source }
 *
 *     where tokenEndpoint, when non-null, is
 *       { method, path, source: 'set-metadata' | 'extension' | 'operationId',
 *         tokenField: string | null }
 *
 *   scanPackageDeps(projectDir) → { library, source } | null
 *   scanMiddleware(projectDir)  → { library, source } | null
 *   scanOpenApiSchemes(matrix)  → { tokenHeaderName, schemeName, source } | null
 *   scanEndpointHeaders(matrix) → { tokenHeaderName, tokenEndpoint, source } | null
 *   findTokenEndpoint(matrix, diag?) →
 *     { method, path, source, tokenField } | null
 */

const fs = require('fs');
const path = require('path');

// Known CSRF libraries — orthogonal to role detection.
const CSRF_PACKAGES = [
  { pkg: 'csurf', library: 'csurf' },
  { pkg: 'csrf-csrf', library: 'csrf-csrf' },
  { pkg: '@nestjs/csrf', library: '@nestjs/csrf' },
  { pkg: 'lusca', library: 'lusca' },
];

// Canonical CSRF role declaration.
const CSRF_ISSUER = {
  setMetadataKey: 'csrf:issuer',
  extension: 'x-csrf-issues-token',
  operationId: 'csrfToken',
};

// ---------------------------------------------------------------------------
// Library / middleware scanners (unchanged, role-orthogonal)
// ---------------------------------------------------------------------------

/**
 * Scan package.json deps for known CSRF libraries.
 */
function scanPackageDeps(projectDir) {
  const pkgPaths = [
    path.join(projectDir, 'apps/api/package.json'),
    path.join(projectDir, 'package.json'),
  ];

  for (const pkgPath of pkgPaths) {
    if (!fs.existsSync(pkgPath)) continue;
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const allDeps = {
        ...(pkg.dependencies || {}),
        ...(pkg.devDependencies || {}),
      };
      for (const { pkg: name, library } of CSRF_PACKAGES) {
        if (allDeps[name]) {
          return { library, version: allDeps[name], source: `package.json:${name}` };
        }
      }
    } catch { /* ignore parse errors */ }
  }
  return null;
}

/**
 * Scan main.ts / app setup for CSRF middleware registration.
 */
function scanMiddleware(projectDir) {
  const candidates = [
    path.join(projectDir, 'apps/api/src/main.ts'),
    path.join(projectDir, 'src/main.ts'),
    path.join(projectDir, 'apps/api/src/app.module.ts'),
  ];

  const CSRF_MIDDLEWARE_RE = /(?:csurf|csrf|lusca\.csrf)\s*\(/;

  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue;
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const match = content.match(CSRF_MIDDLEWARE_RE);
      if (match) {
        return {
          library: match[0].includes('lusca') ? 'lusca' : 'csurf',
          source: `middleware:${path.relative(projectDir, filePath)}`,
        };
      }
    } catch { /* ignore */ }
  }
  return null;
}

/**
 * Scan OpenAPI securitySchemes for an apiKey-in-header CSRF scheme.
 *
 * The header name is read from the scheme's `name` field VERBATIM. We do
 * NOT match the name against a regex — whatever name the project declares
 * is the name we use. The scheme is identified by the schemeName string
 * containing 'csrf' (case-insensitive) OR by mapName matching to the
 * declared csrf:* role; that part is signal-of-presence, not name choice.
 */
function scanOpenApiSchemes(matrix) {
  const schemes = matrix && matrix.securitySchemes;
  if (!schemes) return null;

  for (const [name, scheme] of Object.entries(schemes)) {
    if (!scheme || scheme.type !== 'apiKey') continue;
    if (scheme.in !== 'header') continue;
    // The schemeName is the developer's choice and is the only signal we
    // need: schemes containing 'csrf' (case-insensitive) anywhere in name
    // declare a CSRF role. The actual header name comes verbatim from
    // scheme.name.
    if (!/csrf|xsrf/i.test(name) && !/csrf|xsrf/i.test(scheme.name || '')) continue;
    return {
      tokenHeaderName: scheme.name,
      schemeName: name,
      source: `securityScheme:${name}`,
    };
  }
  return null;
}

/**
 * Scan endpoints for declared header parameters that match a CSRF role.
 *
 * The header parameter name is read VERBATIM. We use only the schemeName
 * indicator from the security requirement to identify CSRF-protected
 * endpoints — and the parameter's literal name as the header. No name
 * regex matching against a canonical pattern.
 *
 * Returns the FIRST endpoint with a header parameter declared in addition
 * to a CSRF security requirement. Empty result → null.
 */
function scanEndpointHeaders(matrix) {
  const endpoints = (matrix && matrix.apiEndpoints) || [];
  for (const ep of endpoints) {
    const params = (ep.parameters) || (ep.swaggerDeclared && ep.swaggerDeclared.parameters) || [];
    if (!Array.isArray(params)) continue;

    // Identify a header param tied to a CSRF role declaration. We accept
    // any header parameter whose name is referenced by a securityScheme
    // recognized as CSRF, OR whose name is mentioned inside a declared
    // CSRF security requirement on this endpoint. Failing both, we accept
    // a header param whose name matches the OpenAPI scheme already returned
    // by scanOpenApiSchemes (handled at caller level).
    for (const param of params) {
      if (param.in !== 'header') continue;
      // Match only when the endpoint also declares a securityRequirement
      // referencing a CSRF scheme — this is the declaration that makes
      // this header semantically a CSRF header.
      const reqs = Array.isArray(ep.securityRequirement) ? ep.securityRequirement : [];
      const hasCsrfReq = reqs.some(
        (req) => req && Object.keys(req).some((sn) => /csrf|xsrf/i.test(sn)),
      );
      if (!hasCsrfReq) continue;
      return {
        tokenHeaderName: param.name,
        tokenEndpoint: `${ep.method} ${ep.path}`,
        source: `endpoint-header:${ep.method} ${ep.path}`,
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Extension lookup helper — checks both top-level and swaggerDeclared.extensions
// ---------------------------------------------------------------------------

/**
 * Read an OpenAPI extension value from an endpoint matrix entry.
 * The derive-test-matrix stores extensions under ep.swaggerDeclared.extensions,
 * but some detectors historically checked ep[key] at the top level. This
 * helper checks both locations so the detectors work regardless of where
 * the matrix regen places the value.
 */
function getExtension(ep, key) {
  if (ep[key] !== undefined) return ep[key];
  if (ep.swaggerDeclared && ep.swaggerDeclared.extensions && ep.swaggerDeclared.extensions[key] !== undefined) {
    return ep.swaggerDeclared.extensions[key];
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Layer 1 — ROLE detection (declaration-only, no path regex, no body sniff)
// ---------------------------------------------------------------------------

/**
 * Find the CSRF token-issuing endpoint using STRICT declaration signals.
 *
 * Three accepted signals (any of):
 *   1. ep['csrf:issuer']        === true   (NestJS @SetMetadata)
 *   2. ep['x-csrf-issues-token'] === true  (OpenAPI extension)
 *   3. ep.operationId           === 'csrfToken'
 *
 * NEVER consults path regex, body shape, or response shape for role
 * selection.
 *
 * Behavior:
 *   - 0 matches → returns null. DIAG only when matrix has any other CSRF
 *     signal (library detected etc.) — handled by detectCsrf, not here.
 *   - 1 match  → returns { method, path, source, tokenField? }.
 *   - >1 matches → DIAG `CSRF_ISSUER_AMBIGUOUS`, returns null.
 */
function findTokenEndpoint(matrix, diag) {
  const diagnostics = diag || [];
  const endpoints = (matrix && matrix.apiEndpoints) || [];

  // Collect all matches across all three declaration signals. A single
  // endpoint may carry multiple signals — that's fine, count it once.
  const matches = [];
  const seen = new Set();
  const seenKey = (ep) => `${ep.method} ${ep.path}`;

  for (const ep of endpoints) {
    let source = null;
    if (ep[CSRF_ISSUER.setMetadataKey] === true) source = 'set-metadata';
    else if (getExtension(ep, CSRF_ISSUER.extension) === true) source = 'extension';
    else if (ep.operationId === CSRF_ISSUER.operationId) source = 'operationId';
    if (!source) continue;
    const key = seenKey(ep);
    if (seen.has(key)) continue;
    seen.add(key);
    matches.push({ ep, source });
  }

  if (matches.length === 0) {
    return null;
  }

  if (matches.length > 1) {
    diagnostics.push({
      level: 'warn',
      code: 'CSRF_ISSUER_AMBIGUOUS',
      reason:
        `Multiple endpoints declare a CSRF-issuer role: ` +
        matches.map((m) => `${m.ep.method} ${m.ep.path} (via ${m.source})`).join(', ') +
        '. At most one endpoint may carry the CSRF-issuer declaration; ' +
        'remove the others or consolidate to a single declaration.',
      candidates: matches.map((m) => ({ method: m.ep.method, path: m.ep.path, source: m.source })),
    });
    return null;
  }

  const { ep, source } = matches[0];
  const tokenField = pickTokenField(ep, diagnostics);

  return {
    method: ep.method,
    path: ep.path,
    source,
    tokenField,
  };
}

/**
 * Layer 2 — extract the CSRF-token field name VERBATIM from the issuer's
 * declared response schema. Pure introspection.
 *
 *   0 string fields → DIAG CSRF_TOKEN_FIELD_UNDETECTED, return null.
 *   1 string field  → return that field's name verbatim.
 *   >1 string fields → DIAG CSRF_TOKEN_FIELD_AMBIGUOUS, return null.
 */
function pickTokenField(ep, diag) {
  const diagnostics = diag || [];
  const respFields = getStringFieldNames(ep.responseContract);

  if (respFields.length === 0) {
    // No response schema declared (or no string fields) — the probe will
    // run the no-op path. Emit DIAG so the developer knows declaration
    // completes the contract.
    if (ep.responseContract) {
      diagnostics.push({
        level: 'warn',
        code: 'CSRF_TOKEN_FIELD_UNDETECTED',
        endpoint: `${ep.method} ${ep.path}`,
        reason:
          `CSRF issuer ${ep.method} ${ep.path} declares a response schema but no ` +
          'string field that could carry the CSRF token. Declare the response ' +
          'with a single string field (any name — the probe reads it verbatim).',
      });
    }
    return null;
  }

  if (respFields.length === 1) {
    return respFields[0];
  }

  diagnostics.push({
    level: 'warn',
    code: 'CSRF_TOKEN_FIELD_AMBIGUOUS',
    endpoint: `${ep.method} ${ep.path}`,
    reason:
      `CSRF issuer ${ep.method} ${ep.path} response has multiple string fields ` +
      `(${JSON.stringify(respFields)}). The probe cannot tell which is the CSRF ` +
      'token. Reduce the response to a single string field, or annotate the ' +
      'token field uniquely.',
  });
  return null;
}

/**
 * Extract string-typed field names from a responseContract.
 * Handles both array-of-strings and array-of-objects shapes.
 */
function getStringFieldNames(contract) {
  if (!contract) return [];
  const fields = contract.fields || [];
  const names = [];
  for (const f of fields) {
    if (typeof f === 'string') {
      names.push(f);
      continue;
    }
    if (!f || !f.name) continue;
    // If type is unknown/missing, accept as a candidate (fields parsed from
    // OpenAPI may have type 'string'; fields from a plain string-array fixture
    // have no type at all — both are valid candidates).
    if (f.type && f.type !== 'string') continue;
    names.push(f.name);
  }
  return names;
}

// ---------------------------------------------------------------------------
// Header-name introspection — verbatim from declared parameters/scheme
// ---------------------------------------------------------------------------

/**
 * Pick the CSRF header name VERBATIM from the matrix.
 *
 * Priority:
 *   1. First endpoint with a header parameter referenced by a CSRF
 *      securityRequirement on the same endpoint (scanEndpointHeaders).
 *   2. OpenAPI securitySchemes apiKey-in-header CSRF scheme name
 *      (scanOpenApiSchemes).
 *   3. null — the probe reports null and the consumer must surface it.
 *
 * If multiple endpoints declare DIFFERENT header names → DIAG
 * `CSRF_HEADER_AMBIGUOUS`, return null.
 */
function pickHeaderName(matrix, diag) {
  const diagnostics = diag || [];
  const endpoints = (matrix && matrix.apiEndpoints) || [];

  const declaredNames = new Set();
  for (const ep of endpoints) {
    const reqs = Array.isArray(ep.securityRequirement) ? ep.securityRequirement : [];
    const hasCsrfReq = reqs.some(
      (req) => req && Object.keys(req).some((sn) => /csrf|xsrf/i.test(sn)),
    );
    if (!hasCsrfReq) continue;
    const directParams = Array.isArray(ep.parameters) ? ep.parameters : [];
    const swaggerParams =
      ep.swaggerDeclared && Array.isArray(ep.swaggerDeclared.parameters)
        ? ep.swaggerDeclared.parameters
        : [];
    const params = [...directParams, ...swaggerParams];
    for (const param of params) {
      if (param && param.in === 'header' && param.name) {
        declaredNames.add(param.name);
      }
    }
  }

  if (declaredNames.size === 1) {
    return [...declaredNames][0];
  }
  if (declaredNames.size > 1) {
    diagnostics.push({
      level: 'warn',
      code: 'CSRF_HEADER_AMBIGUOUS',
      reason:
        `Multiple distinct CSRF header names declared across endpoints: ` +
        `${JSON.stringify([...declaredNames])}. Use the same header name everywhere.`,
    });
    return null;
  }

  // Fall back to OpenAPI securitySchemes apiKey-in-header.
  const schemeResult = scanOpenApiSchemes(matrix);
  return (schemeResult && schemeResult.tokenHeaderName) || null;
}

// ---------------------------------------------------------------------------
// Main entrypoint
// ---------------------------------------------------------------------------

/**
 * @param {string} projectDir - Project root directory.
 * @param {object} [matrix]   - Existing matrix (apiEndpoints + securitySchemes).
 * @param {Array}  [diagnostics] - Optional diagnostics array for DIAG entries.
 * @returns {{ detected, library, tokenHeaderName, tokenEndpoint, source }}
 */
function detectCsrf(projectDir, matrix, diagnostics) {
  const diag = diagnostics || [];

  // Library / middleware presence — independent of role detection.
  const pkgResult = scanPackageDeps(projectDir);
  const mwResult = scanMiddleware(projectDir);
  const schemeResult = matrix ? scanOpenApiSchemes(matrix) : null;
  const headerResult = matrix ? scanEndpointHeaders(matrix) : null;

  // Layer 1 + Layer 2 — declaration-driven role + introspected fields.
  const tokenEndpoint = matrix ? findTokenEndpoint(matrix, diag) : null;

  // Layer 2 — header name verbatim from declared parameters/scheme.
  const tokenHeaderName = matrix ? pickHeaderName(matrix, diag) : null;

  const detected = Boolean(pkgResult || mwResult || schemeResult || headerResult || tokenEndpoint);

  // If CSRF protection is signaled (library/middleware/scheme) but no
  // role declaration is present → emit CSRF_ISSUER_UNDETECTED.
  if (detected && !tokenEndpoint && matrix && (matrix.apiEndpoints || []).length > 0) {
    diag.push({
      level: 'warn',
      code: 'CSRF_ISSUER_UNDETECTED',
      reason:
        'CSRF protection is enabled (package / middleware / scheme detected) but ' +
        'no endpoint declares the issuer role. Declare it on a single endpoint via ' +
        `@SetMetadata('${CSRF_ISSUER.setMetadataKey}', true), ` +
        `@ApiExtension('${CSRF_ISSUER.extension}', true), or ` +
        `@ApiOperation({ operationId: '${CSRF_ISSUER.operationId}' }). ` +
        'The probe will skip CSRF flows until one of these declarations is present.',
    });
  }

  if (!detected) {
    return { detected: false, library: null, tokenHeaderName: null, tokenEndpoint: null, source: null };
  }

  const library = (pkgResult && pkgResult.library) || (mwResult && mwResult.library) || null;
  const source =
    (pkgResult && pkgResult.source) ||
    (mwResult && mwResult.source) ||
    (schemeResult && schemeResult.source) ||
    (headerResult && headerResult.source) ||
    'unknown';

  return {
    detected: true,
    library,
    tokenHeaderName,
    tokenEndpoint,
    source,
  };
}

module.exports = {
  detectCsrf,
  scanPackageDeps,
  scanMiddleware,
  scanOpenApiSchemes,
  scanEndpointHeaders,
  findTokenEndpoint,
  pickTokenField,
  pickHeaderName,
  getExtension,
  CSRF_ISSUER,
};
