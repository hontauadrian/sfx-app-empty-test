/**
 * Plan 05 — Overlay loader, validator, and merger.
 *
 * Block reasons (per plan §§3–5):
 *   UNKNOWN_ROUTE_KEY               — overlay.routes[key] references a route not in compiled
 *   UNKNOWN_ENDPOINT_KEY            — overlay.endpoints[key] references an endpoint not in compiled
 *   IGNORE_REASON_MISSING           — overlay.ignore[] entry missing path or reason
 *   UNCOVERED_ROUTE                 — compiled route has no decoration, no ignore, coverage=complete
 *   OVERLAY_PARSE_ERROR             — overlay file exists but is not valid JSON
 *   OVERLAY_SCHEMA_INVALID          — overlay does not conform to schema
 *   OVERLAY_ONLY_COVERAGE_INCOMPLETE — no compiled data AND coverage=partial (Phase A degraded mode)
 *   OVERLAY_FLOWS_RETIRED           — overlay contains a `flows` key (now generated from code)
 *   OVERLAY_IGNORE_COVERS_MATRIX_PATH — ignore entry matches a matrix path (framework internals only)
 */

const fs = require('node:fs');
const path = require('node:path');

const SCHEMA = require('./overlay-schema.json');

const CANDIDATE_PATHS = [
  '.runtime-contract.overlay.json',
  'docs/runtime-contract.overlay.json',
];

function loadOverlay(projectRoot) {
  for (const rel of CANDIDATE_PATHS) {
    const abs = path.join(projectRoot, rel);
    if (!fs.existsSync(abs)) continue;
    try {
      const raw = fs.readFileSync(abs, 'utf8');
      const overlay = JSON.parse(raw);
      return { overlay, path: abs, parseError: null };
    } catch (error) {
      return { overlay: null, path: abs, parseError: error };
    }
  }
  return { overlay: null, path: null, parseError: null };
}

/**
 * Minimal JSON-Schema-like validator tailored for our overlay schema.
 * Returns array of Diagnostic objects; empty means valid.
 */
function validateOverlay(overlay, schema = SCHEMA) {
  const diagnostics = [];
  if (overlay === null || typeof overlay !== 'object' || Array.isArray(overlay)) {
    diagnostics.push({ level: 'error', code: 'OVERLAY_SCHEMA_INVALID', message: 'overlay must be an object' });
    return diagnostics;
  }
  for (const required of schema.required || []) {
    if (!(required in overlay)) {
      diagnostics.push({
        level: 'error',
        code: 'OVERLAY_SCHEMA_INVALID',
        message: `overlay missing required field: ${required}`,
      });
    }
  }
  if (overlay.version !== undefined && overlay.version !== '1') {
    diagnostics.push({
      level: 'error',
      code: 'OVERLAY_SCHEMA_INVALID',
      message: `overlay.version must be "1", got ${JSON.stringify(overlay.version)}`,
    });
  }
  if (overlay.coverage !== undefined && !['partial', 'complete'].includes(overlay.coverage)) {
    diagnostics.push({
      level: 'error',
      code: 'OVERLAY_SCHEMA_INVALID',
      message: `overlay.coverage must be "partial" or "complete", got ${JSON.stringify(overlay.coverage)}`,
    });
  }
  if (overlay.routes && typeof overlay.routes !== 'object') {
    diagnostics.push({
      level: 'error',
      code: 'OVERLAY_SCHEMA_INVALID',
      message: 'overlay.routes must be an object',
    });
  }
  if (overlay.endpoints && typeof overlay.endpoints !== 'object') {
    diagnostics.push({
      level: 'error',
      code: 'OVERLAY_SCHEMA_INVALID',
      message: 'overlay.endpoints must be an object',
    });
  }
  if (overlay.ignore && !Array.isArray(overlay.ignore)) {
    diagnostics.push({
      level: 'error',
      code: 'OVERLAY_SCHEMA_INVALID',
      message: 'overlay.ignore must be an array',
    });
  }
  // Reject retired `flows` key
  if ('flows' in overlay) {
    diagnostics.push({
      level: 'error',
      code: 'OVERLAY_FLOWS_RETIRED',
      message: 'the flows key is retired; flows are now generated from .claude/hooks/.flows.generated.json. Remove this key and change code annotations (Zod, @UseGuards, @ApiResponse) to influence what is tested.',
    });
  }
  return diagnostics;
}

/**
 * Validate that ignore entries do not cover matrix paths.
 * Matrix paths (apiEndpoints, pages) must not be ignored — only framework internals.
 * Returns array of Diagnostic objects; empty means valid.
 */
function validateIgnoreAgainstMatrix(overlay, matrix) {
  const diagnostics = [];
  const ignoreList = Array.isArray(overlay?.ignore) ? overlay.ignore : [];
  if (ignoreList.length === 0 || !matrix) return diagnostics;

  const matrixPaths = [];
  const apiEndpoints = Array.isArray(matrix.apiEndpoints) ? matrix.apiEndpoints : [];
  for (const endpoint of apiEndpoints) {
    if (endpoint && endpoint.path) matrixPaths.push(endpoint.path);
  }
  const pages = Array.isArray(matrix.pages) ? matrix.pages : [];
  for (const page of pages) {
    if (page && page.route) matrixPaths.push(page.route);
  }

  for (const entry of ignoreList) {
    if (!entry || !entry.path) continue;
    for (const matrixPath of matrixPaths) {
      if (matchIgnorePath(matrixPath, entry.path)) {
        diagnostics.push({
          level: 'error',
          code: 'OVERLAY_IGNORE_COVERS_MATRIX_PATH',
          message: `"${entry.path}" \u2014 matrix paths cannot be ignored. Framework internals only (e.g. /_next/**). To change what is tested, change a code annotation.`,
          path: entry.path,
        });
        break; // one diagnostic per ignore entry is enough
      }
    }
  }

  return diagnostics;
}

function matchIgnorePath(routePath, pattern) {
  if (!pattern) return false;
  if (pattern === routePath) return true;
  if (pattern.endsWith('/**')) {
    const prefix = pattern.slice(0, -3);
    return routePath === prefix || routePath.startsWith(prefix + '/');
  }
  if (pattern.endsWith('/*')) {
    const prefix = pattern.slice(0, -2);
    if (routePath === prefix) return false;
    if (!routePath.startsWith(prefix + '/')) return false;
    return !routePath.slice(prefix.length + 1).includes('/');
  }
  return false;
}

function isIgnored(pathValue, ignoreList) {
  for (const entry of ignoreList || []) {
    if (matchIgnorePath(pathValue, entry.path)) return true;
  }
  return false;
}

/**
 * Merge a compiled contract + overlay into a MergedContract.
 * Returns { merged, mergeErrors } where mergeErrors is an array of Diagnostic.
 */
function mergeContract({ compiled, overlay }) {
  const mergeErrors = [];
  const compiledRoutes = compiled?.routes || [];
  const compiledEndpoints = compiled?.endpoints || [];
  const overlayOnlyMode = compiledRoutes.length === 0 && compiledEndpoints.length === 0;

  // 1. Validate overlay.ignore entries have both path+reason
  const ignore = Array.isArray(overlay?.ignore) ? overlay.ignore : [];
  ignore.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object' || !entry.path || !entry.reason) {
      mergeErrors.push({
        level: 'error',
        code: 'IGNORE_REASON_MISSING',
        message: `overlay.ignore[${index}] must include non-empty path and reason`,
      });
    }
  });

  // 2. Build merged routes. Seed with compiled routes; fold overlay routes onto matching path.
  const mergedRoutes = compiledRoutes.map((route) => ({ ...route, sourceFiles: [...(route.sourceFiles || [])] }));
  const overlayRoutes = overlay?.routes || {};
  for (const [routePath, decoration] of Object.entries(overlayRoutes)) {
    let hit = mergedRoutes.find((r) => r.path === routePath);
    if (!hit && overlayOnlyMode) {
      hit = {
        path: routePath,
        app: 'unknown',
        sourceFiles: [],
        auth: 'unknown',
        metadataKeys: [],
        framework: 'other',
      };
      mergedRoutes.push(hit);
    }
    if (!hit) {
      mergeErrors.push({
        level: 'error',
        code: 'UNKNOWN_ROUTE_KEY',
        message: `overlay.routes["${routePath}"] does not match any compiled route`,
        path: routePath,
      });
      continue;
    }
    if (decoration?.tokens) hit.tokens = decoration.tokens;
    if (decoration?.successStatus !== undefined) hit.successStatus = decoration.successStatus;
    if (decoration?.notes) hit.notes = decoration.notes;
  }

  // 3. Build merged endpoints the same way.
  const mergedEndpoints = compiledEndpoints.map((e) => ({ ...e }));
  const overlayEndpoints = overlay?.endpoints || {};
  for (const [endpointKey, decoration] of Object.entries(overlayEndpoints)) {
    const match = /^([A-Z]+)\s+(.+)$/.exec(endpointKey.trim());
    if (!match) {
      mergeErrors.push({
        level: 'error',
        code: 'UNKNOWN_ENDPOINT_KEY',
        message: `overlay.endpoints["${endpointKey}"] is not of form "METHOD /path"`,
      });
      continue;
    }
    const [, method, endpointPath] = match;
    let hit = mergedEndpoints.find((e) => e.method === method && e.path === endpointPath);
    if (!hit && overlayOnlyMode) {
      hit = {
        method,
        path: endpointPath,
        app: 'unknown',
        sourceFile: '',
        auth: 'unknown',
        framework: 'other',
      };
      mergedEndpoints.push(hit);
    }
    if (!hit) {
      mergeErrors.push({
        level: 'error',
        code: 'UNKNOWN_ENDPOINT_KEY',
        message: `overlay.endpoints["${endpointKey}"] does not match any compiled endpoint`,
      });
      continue;
    }
    if (decoration?.sampleValid !== undefined) hit.sampleValid = decoration.sampleValid;
    if (decoration?.sampleInvalid) hit.sampleInvalid = decoration.sampleInvalid;
    if (decoration?.successStatus !== undefined) hit.successStatus = decoration.successStatus;
    if (decoration?.notes) hit.notes = decoration.notes;
  }

  // 4. Coverage enforcement.
  if (overlay && overlay.coverage === 'complete') {
    for (const route of mergedRoutes) {
      const hasDecoration = route.tokens !== undefined;
      const ignored = isIgnored(route.path, ignore);
      if (!hasDecoration && !ignored) {
        mergeErrors.push({
          level: 'error',
          code: 'UNCOVERED_ROUTE',
          message: `route ${route.path} has no overlay decoration and no ignore entry`,
          path: route.path,
        });
      }
    }
  }

  // 5. Phase A degraded mode: empty compiled + partial coverage = can't enforce.
  if (overlayOnlyMode && overlay && overlay.coverage === 'partial') {
    if (ignore.length === 0 && Object.keys(overlayRoutes).length === 0) {
      mergeErrors.push({
        level: 'error',
        code: 'OVERLAY_ONLY_COVERAGE_INCOMPLETE',
        message:
          'compiled contract is empty and overlay has no routes/ignore entries; coverage cannot be proven',
      });
    }
  }

  const merged = {
    version: '1',
    generatedAt: new Date().toISOString(),
    coverage: overlay?.coverage || 'partial',
    routes: mergedRoutes,
    endpoints: mergedEndpoints,
    ignore,
    globalMustNotContain: overlay?.global?.mustNotContain || [],
    diagnostics: compiled?.diagnostics || [],
    mergeErrors,
    source: {
      hasOverlay: Boolean(overlay),
      compiledRoutes: compiledRoutes.length,
      compiledEndpoints: compiledEndpoints.length,
      overlayRouteKeys: Object.keys(overlayRoutes).length,
      overlayEndpointKeys: Object.keys(overlayEndpoints).length,
    },
  };

  return { merged, mergeErrors };
}

module.exports = {
  loadOverlay,
  validateOverlay,
  validateIgnoreAgainstMatrix,
  mergeContract,
  matchIgnorePath,
  isIgnored,
};
