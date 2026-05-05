'use strict';

const path = require('path');
const fs = require('fs');

const { walkFiles, readFileSafe } = require('../lib/fsutil');

// Next/Nuxt/SvelteKit middleware detection.
// Spec: plan 02 §4.12.
function deriveMiddleware(root, frameworks, diag) {
  const entries = [];

  // Next middleware
  const nextCandidates = [
    path.join(root, 'middleware.ts'),
    path.join(root, 'middleware.js'),
    path.join(root, 'src', 'middleware.ts'),
    path.join(root, 'src', 'middleware.js'),
  ];
  const appsRoot = path.join(root, 'apps');
  if (fs.existsSync(appsRoot)) {
    for (const entry of fs.readdirSync(appsRoot)) {
      for (const ext of ['ts', 'js']) {
        nextCandidates.push(path.join(appsRoot, entry, `middleware.${ext}`));
        nextCandidates.push(path.join(appsRoot, entry, 'src', `middleware.${ext}`));
      }
    }
  }
  for (const candidate of nextCandidates) {
    if (!fs.existsSync(candidate)) continue;
    const source = readFileSafe(candidate) || '';
    const matcherMatch = source.match(/matcher\s*:\s*(\[[\s\S]*?\]|['"`][^'"`]+['"`])/);
    let matcher = [];
    if (matcherMatch) {
      const value = matcherMatch[1];
      if (value.startsWith('[')) {
        const inside = value.slice(1, -1);
        matcher = inside.match(/['"`]([^'"`]+)['"`]/g)?.map((piece) => piece.slice(1, -1)) || [];
      } else {
        matcher = [value.slice(1, -1)];
      }
    }
    entries.push({
      file: path.relative(root, candidate),
      framework: 'next',
      matcher,
      changed: false,
    });
  }

  const nuxtMiddleware = path.join(root, 'middleware');
  if (fs.existsSync(nuxtMiddleware) && fs.statSync(nuxtMiddleware).isDirectory()) {
    for (const file of walkFiles(nuxtMiddleware, { extensions: ['.ts', '.js'] })) {
      entries.push({
        file: path.relative(root, file),
        framework: 'nuxt',
        matcher: [],
        changed: false,
      });
    }
  }

  const svelteHooks = path.join(root, 'src', 'hooks.server.ts');
  const svelteHooksJs = path.join(root, 'src', 'hooks.server.js');
  for (const candidate of [svelteHooks, svelteHooksJs]) {
    if (fs.existsSync(candidate)) {
      entries.push({
        file: path.relative(root, candidate),
        framework: 'sveltekit',
        matcher: [],
        changed: false,
      });
    }
  }

  diag.info(`middleware: ${entries.length} entries`);
  return entries;
}

module.exports = { deriveMiddleware };
