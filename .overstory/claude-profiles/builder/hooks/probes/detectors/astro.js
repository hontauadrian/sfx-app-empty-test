'use strict';

const path = require('path');
const fs = require('fs');

const { walkFiles, readFileSafe } = require('../lib/fsutil');
const {
  paramizeNextBrackets,
  normalizeLeadingSlash,
  extractRouteParams,
} = require('../lib/routeNormalize');

// Astro: src/pages/** + endpoint files (.ts/.js with GET/POST exports).
// Spec: plan 02 §4.6.
function detectAstro(root, diag) {
  const pages = [];
  const endpoints = [];
  const pagesDir = path.join(root, 'src', 'pages');
  if (!fs.existsSync(pagesDir)) {
    diag.info('astro: no src/pages');
    return { pages, endpoints };
  }
  const files = walkFiles(pagesDir, { extensions: ['.astro', '.md', '.mdx', '.ts', '.js'] });
  for (const file of files) {
    const rel = path.relative(pagesDir, file).replace(/\\/g, '/');
    const ext = path.extname(rel);
    const noExt = rel.slice(0, -ext.length);
    const withoutIndex = paramizeNextBrackets(noExt).replace(/(^|\/)index$/, '');
    const routePath = normalizeLeadingSlash('/' + withoutIndex);

    if (ext === '.astro' || ext === '.md' || ext === '.mdx') {
      pages.push({
        file: path.relative(root, file),
        route: routePath === '' ? '/' : routePath,
        routeParams: extractRouteParams(routePath),
        framework: 'astro',
        guard: 'public',
        unauthRedirect: null,
        postLoginRedirect: null,
        tokens: [],
        mustNotContain: [],
        changed: false,
      });
    } else if (ext === '.ts' || ext === '.js') {
      const source = readFileSafe(file) || '';
      for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
        const exportRegex = new RegExp(`export\\s+(?:async\\s+)?(?:function|const)\\s+${method}\\b`);
        if (exportRegex.test(source)) {
          endpoints.push({
            file: path.relative(root, file),
            method,
            path: routePath,
            framework: 'astro-api',
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
  diag.info(`astro: ${pages.length} pages, ${endpoints.length} endpoints`);
  return { pages, endpoints };
}

module.exports = { detectAstro };
