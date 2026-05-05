'use strict';

const path = require('path');
const fs = require('fs');

const { walkFiles } = require('../lib/fsutil');
const {
  paramizeDollar,
  normalizeLeadingSlash,
  extractRouteParams,
} = require('../lib/routeNormalize');

// Remix flat v2 + nested routes.
// Spec: plan 02 §4.5.
function detectRemix(root, diag) {
  const pages = [];
  const routesDir = path.join(root, 'app', 'routes');
  if (!fs.existsSync(routesDir)) {
    diag.info('remix: no app/routes');
    return { pages, endpoints: [] };
  }
  const files = walkFiles(routesDir, { extensions: ['.tsx', '.jsx', '.ts', '.js'] });
  for (const file of files) {
    const rel = path.relative(routesDir, file).replace(/\\/g, '/').replace(/\.(tsx|jsx|ts|js)$/, '');
    // Flat v2: dots become slashes. `_index` → index
    const flat = rel.includes('/') ? rel : rel.replace(/\./g, '/');
    const route = normalizeLeadingSlash('/' + paramizeDollar(flat).replace(/\/?_index$/, '') || '/');
    pages.push({
      file: path.relative(root, file),
      route: route === '' ? '/' : route,
      routeParams: extractRouteParams(route),
      framework: 'remix',
      guard: 'public',
      unauthRedirect: null,
      postLoginRedirect: null,
      tokens: [],
      mustNotContain: [],
      changed: false,
    });
  }
  diag.info(`remix: ${pages.length} pages`);
  return { pages, endpoints: [] };
}

module.exports = { detectRemix };
