'use strict';

const path = require('path');
const fs = require('fs');

const { walkFiles } = require('../lib/fsutil');
const {
  paramizeUnderscore,
  normalizeLeadingSlash,
  extractRouteParams,
} = require('../lib/routeNormalize');

// Detects Nuxt pages and server routes.
// Spec: plan 02 §4.3.

function detectNuxt(root, diag) {
  const pages = [];
  const endpoints = [];

  const pagesDir = path.join(root, 'pages');
  if (fs.existsSync(pagesDir)) {
    for (const file of walkFiles(pagesDir, { extensions: ['.vue'] })) {
      const rel = path.relative(pagesDir, file).replace(/\\/g, '/').replace(/\.vue$/, '');
      const route = normalizeLeadingSlash('/' + paramizeUnderscore(rel).replace(/\/index$/, '') || '/');
      pages.push({
        file: path.relative(root, file),
        route: route === '' ? '/' : route,
        routeParams: extractRouteParams(route),
        framework: 'nuxt',
        guard: 'public',
        unauthRedirect: null,
        postLoginRedirect: null,
        tokens: [],
        mustNotContain: [],
        changed: false,
      });
    }
  }

  const serverApiDir = path.join(root, 'server', 'api');
  if (fs.existsSync(serverApiDir)) {
    for (const file of walkFiles(serverApiDir, { extensions: ['.ts', '.js'] })) {
      const rel = path.relative(serverApiDir, file).replace(/\\/g, '/').replace(/\.(ts|js)$/, '');
      const routePath = normalizeLeadingSlash('/api/' + rel);
      const methodMatch = rel.match(/\.(get|post|put|patch|delete)$/i);
      const method = methodMatch ? methodMatch[1].toUpperCase() : 'POST';
      endpoints.push({
        file: path.relative(root, file),
        method,
        path: routePath.replace(/\.(get|post|put|patch|delete)$/i, ''),
        framework: 'nuxt-api',
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

  diag.info(`nuxt: ${pages.length} pages, ${endpoints.length} endpoints`);
  return { pages, endpoints };
}

module.exports = { detectNuxt };
