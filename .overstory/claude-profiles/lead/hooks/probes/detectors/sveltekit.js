'use strict';

const path = require('path');
const fs = require('fs');

const { walkFiles, readFileSafe } = require('../lib/fsutil');
const {
  paramizeNextBrackets,
  normalizeLeadingSlash,
  extractRouteParams,
} = require('../lib/routeNormalize');

// SvelteKit: src/routes/** + +server.ts endpoints.
// Spec: plan 02 §4.4.
function detectSvelteKit(root, diag) {
  const pages = [];
  const endpoints = [];
  const routesDir = path.join(root, 'src', 'routes');
  if (!fs.existsSync(routesDir)) {
    diag.info('sveltekit: no src/routes dir');
    return { pages, endpoints };
  }

  for (const file of walkFiles(routesDir, { extensions: ['.svelte', '.ts', '.js'] })) {
    const rel = path.relative(routesDir, file).replace(/\\/g, '/');
    const baseName = path.basename(file);

    if (/^\+page\.(svelte|server\.ts|server\.js|ts|js)$/.test(baseName)) {
      const dirRel = path.dirname(rel);
      const route = normalizeLeadingSlash('/' + paramizeNextBrackets(dirRel === '.' ? '' : dirRel));
      pages.push({
        file: path.relative(root, file),
        route,
        routeParams: extractRouteParams(route),
        framework: 'sveltekit',
        guard: 'public',
        unauthRedirect: null,
        postLoginRedirect: null,
        tokens: [],
        mustNotContain: [],
        changed: false,
      });
      continue;
    }

    if (/^\+server\.(ts|js)$/.test(baseName)) {
      const source = readFileSafe(file) || '';
      const dirRel = path.dirname(rel);
      const routePath = normalizeLeadingSlash('/' + paramizeNextBrackets(dirRel === '.' ? '' : dirRel));
      for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']) {
        const exportRegex = new RegExp(`export\\s+(?:async\\s+)?function\\s+${method}\\b|export\\s+const\\s+${method}\\b`);
        if (exportRegex.test(source)) {
          endpoints.push({
            file: path.relative(root, file),
            method,
            path: routePath,
            framework: 'sveltekit-api',
            guard: 'unknown',
            inputSchemaRef: null,
            sampleValid: null,
            sampleInvalid: [],
            successStatus: method === 'POST' ? 201 : 200,
            errorStatuses: [400, 500],
            changed: false,
          });
        }
      }
    }
  }

  diag.info(`sveltekit: ${pages.length} pages, ${endpoints.length} endpoints`);
  return { pages, endpoints };
}

module.exports = { detectSvelteKit };
