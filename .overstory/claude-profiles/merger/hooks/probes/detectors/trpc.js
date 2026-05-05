'use strict';

const path = require('path');

const { walkFiles, readFileSafe } = require('../lib/fsutil');
const { normalizeLeadingSlash } = require('../lib/routeNormalize');

// tRPC detector. Spec: plan 02 §4.10, heuristic audit 2026-04-27.
// Scans for `router({...})` expressions nested under `appRouter`.
function detectTrpc(root, diag) {
  const endpoints = [];
  const files = walkFiles(root, { extensions: ['.ts', '.js'] });
  for (const file of files) {
    if (file.includes(path.sep + 'node_modules' + path.sep)) continue;
    const source = readFileSafe(file);
    if (!source) continue;
    if (!/from\s+['"]@trpc\/server['"]/.test(source) && !/router\s*\(/.test(source)) continue;

    const procedures = extractProcedures(source);
    for (const procedure of procedures) {
      const name = procedure.pathSegments.join('.');
      if (!name) continue;
      const method = procedure.kind === 'query' ? 'GET' : 'POST';
      endpoints.push({
        file: path.relative(root, file),
        method,
        path: normalizeLeadingSlash('/trpc/' + name),
        framework: 'trpc',
        guard: procedure.isProtected === true ? 'authenticated' : procedure.isProtected === false ? 'public' : 'unknown',
        inputSchemaRef: procedure.inputLiteral || null,
        sampleValid: null,
        sampleInvalid: [],
        successStatus: 200,
        errorStatuses: [400, 401, 500],
        changed: false,
      });
    }
  }

  // Emit DIAG for procedures without explicit protection declaration.
  const unknownGuardEndpoints = endpoints.filter((ep) => ep.guard === 'unknown');
  if (unknownGuardEndpoints.length > 0) {
    diag.info(
      `TRPC_PROTECTION_UNDECLARED: ${unknownGuardEndpoints.length} tRPC procedure(s) have ` +
      'guard=\'unknown\'. Matching `protectedProcedure` by string name is unreliable ' +
      '(aliasing defeats it). Declare protection explicitly via `// @protected` comment ' +
      'above the procedure, `.meta({ protected: true })` chain, or `x-protected: true` ' +
      'annotation on the OpenAPI export.'
    );
  }

  diag.info(`trpc: ${endpoints.length} endpoints`);
  return { pages: [], endpoints };
}

function extractProcedures(source) {
  // Very lightweight: find `name: <...>.(query|mutation)(...)` patterns,
  // with optional ancestor router names inferred from nesting.
  const results = [];
  // Match procedure chains, allowing optional .meta(...) and .input(...) before .query/.mutation
  const procRegex = /(\w+)\s*:\s*((?:protectedProcedure|publicProcedure|[\w.]+))\s*(?:\.meta\s*\([^)]*\)\s*)?(?:\.input\s*\(\s*([\s\S]*?)\s*\)\s*)?\.(query|mutation)\s*\(/g;
  let match = procRegex.exec(source);
  while (match) {
    const name = match[1];
    const procExpr = match[2];
    const inputLiteral = match[3] ? match[3].slice(0, 160).replace(/\s+/g, ' ').trim() : null;
    const kind = match[4];
    const ancestors = findEnclosingRouterNames(source, match.index);

    // Protection detection: explicit declaration required.
    //
    // Accepted signals:
    //   1. `// @protected` comment on the line immediately preceding the procedure
    //   2. `.meta({ protected: true })` in the procedure chain
    //
    // String-matching `protectedProcedure` by name was a heuristic — silently
    // false on aliased procedures. Removed.
    const lineStart = source.lastIndexOf('\n', match.index) + 1;
    const precedingLine = source.slice(Math.max(0, source.lastIndexOf('\n', lineStart - 2) + 1), lineStart);
    const hasProtectedComment = /\/\/\s*@protected\b/.test(precedingLine);
    const hasMetaProtected = /\.meta\s*\(\s*\{[^}]*protected\s*:\s*true/.test(match[0]);

    let isProtected = 'unknown';
    if (hasProtectedComment || hasMetaProtected) {
      isProtected = true;
    }

    results.push({
      pathSegments: [...ancestors, name],
      kind,
      inputLiteral,
      isProtected,
    });
    match = procRegex.exec(source);
  }
  return results;
}

function findEnclosingRouterNames(source, offset) {
  // Walk backward looking for patterns like `<name>: router({` to reconstruct nesting.
  const names = [];
  const prefix = source.slice(0, offset);
  const stack = [];
  const tokenRegex = /(\w+)\s*:\s*router\s*\(\s*\{|(\{)|(\})/g;
  let token = tokenRegex.exec(prefix);
  while (token) {
    if (token[1]) {
      stack.push(token[1]);
    } else if (token[2]) {
      stack.push(null);
    } else if (token[3]) {
      stack.pop();
    }
    token = tokenRegex.exec(prefix);
  }
  for (const frame of stack) {
    if (frame) names.push(frame);
  }
  return names;
}

module.exports = { detectTrpc };
