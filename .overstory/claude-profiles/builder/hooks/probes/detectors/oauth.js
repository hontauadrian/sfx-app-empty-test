'use strict';

/**
 * detectors/oauth.js — Declaration-driven OAuth2 detection.
 *
 * --- Role detection (authorize / token / callback) --------------------------
 *
 * Strict canonical declaration only. Path regex is NEVER consulted —
 * `/oauth/token` in the URL is a hint to humans, not a contract the probe
 * can rely on.
 *
 * Accepted signals per role (any of):
 *
 *   1. OpenAPI `components.securitySchemes` with `type: 'oauth2'` + matching
 *      flow URLs (`authorizationUrl`, `tokenUrl`). Role resolved from scheme.
 *   2. operationId match (e.g. 'oauthAuthorize', 'oauthToken', 'oauthCallback').
 *   3. `x-oauth-role` extension on the endpoint operation.
 *
 * If 0 endpoints match a role → DIAG `OAUTH_ROLE_UNDETECTED`, role = null.
 * If >1 distinct endpoints match a role → DIAG `OAUTH_ROLE_AMBIGUOUS`,
 * role = null.
 *
 * --- Field / shape extraction -----------------------------------------------
 *
 * Token shape, scopes, and client_id field name are pure introspection —
 * the probe reads what is declared, does not enforce canonical names.
 *
 * --- Other detection sources (orthogonal to role detection) -----------------
 *
 *   - Package deps: `passport-oauth2`, `@nestjs/passport`, `openid-client`, etc.
 *   - NestJS guards/strategies: OAuth2Strategy, GoogleStrategy, etc.
 *
 * Exported for testing:
 *   detectOAuth(projectDir, matrix, diagnostics?) → { detected, roles, flows, provider, ... }
 *   scanSecuritySchemes(matrix) → OAuthFlowResult | null
 *   scanPackageDeps(projectDir) → { provider, source } | null
 *   scanEndpointPaths(matrix, diagnostics?) → { authorizeEndpoint, tokenEndpoint, callbackEndpoint, source } | null
 *   scanStrategies(projectDir) → { provider, strategyFile, source } | null
 *   resolveOAuthRoles(matrix, diagnostics?) → { authorize, token, callback }
 */

const fs = require('fs');
const path = require('path');

// Known OAuth libraries / passport strategies
const OAUTH_PACKAGES = [
  { pkg: 'passport-oauth2', provider: 'generic-oauth2' },
  { pkg: 'passport-google-oauth20', provider: 'google' },
  { pkg: 'passport-github2', provider: 'github' },
  { pkg: '@nestjs/passport', provider: 'passport' },
  { pkg: 'openid-client', provider: 'openid-connect' },
  { pkg: 'passport-facebook', provider: 'facebook' },
  { pkg: 'passport-microsoft', provider: 'microsoft' },
  { pkg: 'grant', provider: 'grant' },
];

// OAuth role configuration: operationId, extension, method constraint.
// Path regexes are intentionally absent — see header for rationale.
const OAUTH_ROLES = {
  authorize: {
    operationId: 'oauthAuthorize',
    extension: 'x-oauth-role',
    extensionValue: 'authorize',
    method: 'GET',
  },
  token: {
    operationId: 'oauthToken',
    extension: 'x-oauth-role',
    extensionValue: 'token',
    method: 'POST',
  },
  callback: {
    operationId: 'oauthCallback',
    extension: 'x-oauth-role',
    extensionValue: 'callback',
    methods: ['GET', 'POST'],
  },
  refresh: {
    operationId: 'oauthRefresh',
    extension: 'x-oauth-role',
    extensionValue: 'refresh',
    method: 'POST',
  },
};

// Strategy class name patterns
const STRATEGY_RE = /(?:OAuth2Strategy|GoogleStrategy|GithubStrategy|FacebookStrategy|MicrosoftStrategy|OidcStrategy)/;

// ---------------------------------------------------------------------------
// Priority 1: SecuritySchemes-driven role resolution
// ---------------------------------------------------------------------------

/**
 * Scan OpenAPI securitySchemes for OAuth2 type.
 */
function scanSecuritySchemes(matrix) {
  const schemes = matrix && matrix.securitySchemes;
  if (!schemes) return null;

  for (const [name, scheme] of Object.entries(schemes)) {
    if (scheme.type !== 'oauth2') continue;
    const flows = scheme.flows || {};
    const flowTypes = Object.keys(flows);
    if (flowTypes.length === 0) continue;

    // Extract URLs from first defined flow
    const firstFlow = flows[flowTypes[0]] || {};
    return {
      schemeName: name,
      flowTypes,
      authorizeUrl: firstFlow.authorizationUrl || null,
      tokenUrl: firstFlow.tokenUrl || null,
      refreshUrl: firstFlow.refreshUrl || null,
      scopes: firstFlow.scopes ? Object.keys(firstFlow.scopes) : [],
      source: `securityScheme:${name}`,
    };
  }
  return null;
}

/**
 * Match endpoints to securitySchemes flow URLs for role assignment.
 * Returns { authorize?: [], token?: [] } — arrays of all matching endpoints
 * per role. Disambiguation is the caller's responsibility.
 */
function resolveRolesFromSchemes(matrix) {
  const schemeResult = scanSecuritySchemes(matrix);
  if (!schemeResult) return {};

  const endpoints = (matrix && matrix.apiEndpoints) || [];
  const roles = {};

  if (schemeResult.authorizeUrl) {
    const matches = endpoints.filter(
      (ep) => ep.method === 'GET' && urlMatchesEndpoint(schemeResult.authorizeUrl, ep.path),
    );
    if (matches.length > 0) {
      roles.authorize = matches.map((ep) => ({
        method: ep.method,
        path: ep.path,
        source: `securityScheme-flow:${schemeResult.schemeName}`,
      }));
    }
  }

  if (schemeResult.tokenUrl) {
    const matches = endpoints.filter(
      (ep) => ep.method === 'POST' && urlMatchesEndpoint(schemeResult.tokenUrl, ep.path),
    );
    if (matches.length > 0) {
      roles.token = matches.map((ep) => ({
        method: ep.method,
        path: ep.path,
        source: `securityScheme-flow:${schemeResult.schemeName}`,
      }));
    }
  }

  if (schemeResult.refreshUrl) {
    const matches = endpoints.filter(
      (ep) => ep.method === 'POST' && urlMatchesEndpoint(schemeResult.refreshUrl, ep.path),
    );
    if (matches.length > 0) {
      roles.refresh = matches.map((ep) => ({
        method: ep.method,
        path: ep.path,
        source: `securityScheme-flow:${schemeResult.schemeName}`,
      }));
    }
  }

  return roles;
}

/**
 * Check if a securityScheme URL (possibly absolute) matches an endpoint path.
 * Handles both absolute URLs (https://example.com/oauth/token) and relative paths.
 */
function urlMatchesEndpoint(schemeUrl, endpointPath) {
  if (!schemeUrl || !endpointPath) return false;
  try {
    const parsed = new URL(schemeUrl);
    return parsed.pathname === endpointPath;
  } catch {
    return schemeUrl === endpointPath;
  }
}

// ---------------------------------------------------------------------------
// Priority 2: operationId-driven role resolution
// ---------------------------------------------------------------------------

function resolveRolesFromOperationId(matrix) {
  const endpoints = (matrix && matrix.apiEndpoints) || [];
  const roles = {};

  for (const [role, cfg] of Object.entries(OAUTH_ROLES)) {
    const matches = endpoints.filter((ep) => ep.operationId === cfg.operationId);
    if (matches.length > 0) {
      roles[role] = matches.map((ep) => ({
        method: ep.method,
        path: ep.path,
        source: 'operationId',
      }));
    }
  }

  return roles;
}

// ---------------------------------------------------------------------------
// Extension lookup helper — checks both top-level and swaggerDeclared.extensions
// ---------------------------------------------------------------------------

function getExtension(ep, key) {
  if (ep[key] !== undefined) return ep[key];
  if (ep.swaggerDeclared && ep.swaggerDeclared.extensions && ep.swaggerDeclared.extensions[key] !== undefined) {
    return ep.swaggerDeclared.extensions[key];
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Priority 3: x-oauth-role extension
// ---------------------------------------------------------------------------

function resolveRolesFromExtension(matrix) {
  const endpoints = (matrix && matrix.apiEndpoints) || [];
  const roles = {};

  for (const [role, cfg] of Object.entries(OAUTH_ROLES)) {
    const matches = endpoints.filter((ep) => getExtension(ep, cfg.extension) === cfg.extensionValue);
    if (matches.length > 0) {
      roles[role] = matches.map((ep) => ({
        method: ep.method,
        path: ep.path,
        source: 'extension',
      }));
    }
  }

  return roles;
}

// ---------------------------------------------------------------------------
// Combined role resolution (declared signals only — no path regex fallback)
// ---------------------------------------------------------------------------

/**
 * Resolve OAuth endpoint roles using ONLY declared signals:
 *   1. securitySchemes flow URLs
 *   2. operationId
 *   3. x-oauth-role extension
 *
 * Path regex is NEVER consulted.
 *
 * Behavior per role:
 *   - 0 matches across all signals → role = null. (UNDETECTED DIAG is emitted
 *     by detectOAuth when other OAuth presence is detected — kept out of this
 *     function to avoid spamming projects with no OAuth at all.)
 *   - 1 distinct endpoint matched → returns { method, path, source }.
 *   - >1 distinct endpoints matched → DIAG OAUTH_ROLE_AMBIGUOUS, role = null.
 *
 * Multiple signals pointing at the SAME endpoint count as one match (the
 * source label is the highest-priority signal that matched first).
 *
 * @param {object} matrix - Project matrix with apiEndpoints, securitySchemes
 * @param {Array} [diagnostics] - Diagnostics array to push warnings into
 * @returns {{ authorize, token, callback }} each is RoleResult|null
 */
function resolveOAuthRoles(matrix, diagnostics) {
  const diag = diagnostics || [];
  if (!matrix) return { authorize: null, token: null, callback: null, refresh: null };

  const fromSchemes = resolveRolesFromSchemes(matrix);
  const fromOpId = resolveRolesFromOperationId(matrix);
  const fromExt = resolveRolesFromExtension(matrix);

  const result = {};
  for (const role of Object.keys(OAUTH_ROLES)) {
    const candidates = new Map(); // key = `${method} ${path}`
    const layers = [
      { name: 'securityScheme-flow', list: fromSchemes[role] || [] },
      { name: 'operationId', list: fromOpId[role] || [] },
      { name: 'extension', list: fromExt[role] || [] },
    ];
    for (const { name: layerName, list } of layers) {
      for (const m of list) {
        const key = `${m.method} ${m.path}`;
        if (!candidates.has(key)) {
          candidates.set(key, {
            method: m.method,
            path: m.path,
            source: m.source || layerName,
          });
        }
      }
    }

    const matches = [...candidates.values()];
    if (matches.length === 0) {
      result[role] = null;
      continue;
    }
    if (matches.length === 1) {
      result[role] = matches[0];
      continue;
    }

    diag.push({
      level: 'warn',
      code: 'OAUTH_ROLE_AMBIGUOUS',
      role,
      reason:
        `Multiple endpoints declare OAuth role '${role}': ` +
        matches.map((m) => `${m.method} ${m.path} (via ${m.source})`).join(', ') +
        '. At most one endpoint may carry the role; consolidate to a single declaration.',
      candidates: matches,
    });
    result[role] = null;
  }

  return result;
}

// ---------------------------------------------------------------------------
// scanEndpointPaths — thin wrapper over resolveOAuthRoles for back-compat
// with existing call sites and tests. Returns null when no role resolved.
// ---------------------------------------------------------------------------

function scanEndpointPaths(matrix, diagnostics) {
  const diag = diagnostics || [];
  const roles = resolveOAuthRoles(matrix, diag);

  const authorizeEndpoint = roles.authorize || null;
  const tokenEndpoint = roles.token || null;
  const callbackEndpoint = roles.callback || null;
  const refreshEndpoint = roles.refresh || null;

  if (!authorizeEndpoint && !tokenEndpoint && !callbackEndpoint && !refreshEndpoint) return null;

  return {
    authorizeEndpoint,
    tokenEndpoint,
    callbackEndpoint,
    refreshEndpoint,
    source: (authorizeEndpoint && authorizeEndpoint.source) ||
            (tokenEndpoint && tokenEndpoint.source) ||
            (callbackEndpoint && callbackEndpoint.source) ||
            (refreshEndpoint && refreshEndpoint.source) ||
            'endpoint-paths',
  };
}

// ---------------------------------------------------------------------------
// Package deps scanner
// ---------------------------------------------------------------------------

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
      for (const { pkg: name, provider } of OAUTH_PACKAGES) {
        if (allDeps[name]) {
          return { provider, version: allDeps[name], source: `package.json:${name}` };
        }
      }
    } catch { /* ignore parse errors */ }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Strategy scanner
// ---------------------------------------------------------------------------

function scanStrategies(projectDir) {
  const searchDirs = [
    path.join(projectDir, 'apps/api/src'),
    path.join(projectDir, 'src'),
  ];

  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;
    const files = findTsFiles(dir);
    for (const file of files) {
      try {
        const content = fs.readFileSync(file, 'utf8');
        const match = content.match(STRATEGY_RE);
        if (match) {
          const provider = inferProvider(match[0]);
          return {
            provider,
            strategyFile: path.relative(projectDir, file),
            source: `strategy:${path.relative(projectDir, file)}`,
          };
        }
      } catch { /* ignore */ }
    }
  }
  return null;
}

function inferProvider(strategyName) {
  if (/google/i.test(strategyName)) return 'google';
  if (/github/i.test(strategyName)) return 'github';
  if (/facebook/i.test(strategyName)) return 'facebook';
  if (/microsoft/i.test(strategyName)) return 'microsoft';
  if (/oidc/i.test(strategyName)) return 'openid-connect';
  return 'generic-oauth2';
}

function findTsFiles(dir, depth = 0, result = []) {
  if (depth > 5 || result.length > 200) return result;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        findTsFiles(fullPath, depth + 1, result);
      } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.spec.ts')) {
        result.push(fullPath);
      }
    }
  } catch { /* ignore permission errors */ }
  return result;
}

// ---------------------------------------------------------------------------
// Main detection entry point
// ---------------------------------------------------------------------------

/**
 * @param {string} projectDir - Project root directory
 * @param {object} [matrix] - Existing matrix for OpenAPI-based detection
 * @param {Array} [diagnostics] - Optional diagnostics array
 * @returns {{ detected, roles, flows, provider, authorizeUrl, tokenUrl, callbackUrl, source }}
 */
function detectOAuth(projectDir, matrix, diagnostics) {
  const diag = diagnostics || [];

  const schemeResult = matrix ? scanSecuritySchemes(matrix) : null;
  const pkgResult = scanPackageDeps(projectDir);
  const diagBefore = diag.length;
  const roles = matrix
    ? resolveOAuthRoles(matrix, diag)
    : { authorize: null, token: null, callback: null };
  const strategyResult = scanStrategies(projectDir);

  const hasRoles = Boolean(roles.authorize || roles.token || roles.callback || roles.refresh);
  // AMBIGUOUS DIAGs emitted by resolveOAuthRoles count as presence signals —
  // there were matches, just too many of them.
  const ambiguousDuringResolve = diag
    .slice(diagBefore)
    .some((d) => d.code === 'OAUTH_ROLE_AMBIGUOUS');
  const presenceSignaled = Boolean(
    schemeResult || pkgResult || strategyResult || hasRoles || ambiguousDuringResolve,
  );
  if (!presenceSignaled) {
    return {
      detected: false,
      roles: { authorize: null, token: null, callback: null, refresh: null },
      flows: null,
      provider: null,
      authorizeUrl: null,
      tokenUrl: null,
      callbackUrl: null,
      refreshUrl: null,
      source: null,
    };
  }

  // OAuth presence is signaled but a specific role is missing → emit
  // OAUTH_ROLE_UNDETECTED so the developer knows declarations are needed.
  if (matrix && (matrix.apiEndpoints || []).length > 0) {
    for (const role of Object.keys(OAUTH_ROLES)) {
      if (!roles[role]) {
        const cfg = OAUTH_ROLES[role];
        diag.push({
          level: 'warn',
          code: 'OAUTH_ROLE_UNDETECTED',
          role,
          reason:
            `OAuth presence detected but no endpoint declares role '${role}'. ` +
            `Declare it via OpenAPI securityScheme flow URL, ` +
            `operationId '${cfg.operationId}', or extension '${cfg.extension}: "${cfg.extensionValue}"'. ` +
            'The probe will skip OAuth flows for this role until one of these declarations is present.',
        });
      }
    }
  }

  const provider =
    (pkgResult && pkgResult.provider) ||
    (strategyResult && strategyResult.provider) ||
    (schemeResult ? 'oauth2' : null);
  const flows = schemeResult ? schemeResult.flowTypes : null;
  const authorizeUrl =
    (schemeResult && schemeResult.authorizeUrl) ||
    (roles.authorize && roles.authorize.path) ||
    null;
  const tokenUrl =
    (schemeResult && schemeResult.tokenUrl) ||
    (roles.token && roles.token.path) ||
    null;
  const callbackUrl = (roles.callback && roles.callback.path) || null;
  const refreshUrl =
    (schemeResult && schemeResult.refreshUrl) ||
    (roles.refresh && roles.refresh.path) ||
    null;
  const source =
    (schemeResult && schemeResult.source) ||
    (pkgResult && pkgResult.source) ||
    (roles.authorize && roles.authorize.source) ||
    (roles.token && roles.token.source) ||
    (roles.callback && roles.callback.source) ||
    (roles.refresh && roles.refresh.source) ||
    (strategyResult && strategyResult.source) ||
    'unknown';

  return {
    detected: true,
    roles,
    flows,
    provider,
    authorizeUrl,
    tokenUrl,
    callbackUrl,
    refreshUrl,
    source,
  };
}

module.exports = {
  detectOAuth,
  scanSecuritySchemes,
  scanPackageDeps,
  scanEndpointPaths,
  scanStrategies,
  resolveOAuthRoles,
  inferProvider,
  OAUTH_ROLES,
};
