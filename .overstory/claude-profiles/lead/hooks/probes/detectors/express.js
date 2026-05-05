'use strict';

const path = require('path');

const { walkFiles, readFileSafe } = require('../lib/fsutil');
const { normalizeLeadingSlash, extractRouteParams } = require('../lib/routeNormalize');

// Express route detection.
// Spec: plan 02 §4.8, heuristic audit 2026-04-27.
const ROUTE_REGEX = /(app|router|server|\w+Router)\s*\.\s*(get|post|put|patch|delete|all|options|head)\s*\(\s*(['"`])([^'"`]+)\3([^)]*)\)/g;

function detectExpress(root, diag) {
  const endpoints = [];
  const files = walkFiles(root, { extensions: ['.js', '.ts', '.mjs', '.cjs'] });
  for (const file of files) {
    if (file.includes(path.sep + 'node_modules' + path.sep)) continue;
    const source = readFileSafe(file);
    if (!source) continue;
    let match = ROUTE_REGEX.exec(source);
    while (match) {
      const httpMethod = match[2].toUpperCase();
      const routePath = normalizeLeadingSlash(match[4]);
      // Express has no compile-time auth metadata. Guard is always 'unknown'.
      // Middleware function-name matching (requireAuth, authGuard, etc.) was a
      // heuristic — removed. Projects must declare auth via OpenAPI
      // x-auth-required extension or overlay entry.
      const guard = 'unknown';
      endpoints.push({
        file: path.relative(root, file),
        method: httpMethod,
        path: routePath,
        framework: 'express',
        guard,
        inputSchemaRef: null,
        sampleValid: null,
        sampleInvalid: [],
        successStatus: httpMethod === 'POST' ? 201 : 200,
        errorStatuses: [400, 500],
        changed: false,
        routeParams: extractRouteParams(routePath),
      });
      match = ROUTE_REGEX.exec(source);
    }
  }

  // Emit DIAG for all endpoints with unknown guard.
  if (endpoints.length > 0) {
    diag.info(
      `EXPRESS_AUTH_UNDECLARED: ${endpoints.length} Express endpoint(s) have guard='unknown'. ` +
      'Express lacks compile-time auth metadata. Declare via OpenAPI ' +
      'x-auth-required extension or runtime-contract overlay to enable ' +
      'auth-boundary assertions.'
    );
  }

  diag.info(`express: ${endpoints.length} endpoints`);
  return { pages: [], endpoints };
}

module.exports = { detectExpress };
