'use strict';

/**
 * response-envelope.js — static detector for the response envelope shape.
 *
 * Detects how the backend wraps successful responses (and optionally errors)
 * via global middleware/interceptors. Supports:
 *
 *   - NestJS: `useGlobalInterceptors(new X())` → `.pipe(map(...))`
 *   - Express: global middleware that overrides `res.json`
 *   - Fastify: `addHook('preSerialization', ...)`
 *   - Koa: middleware that wraps `ctx.body`
 *   - OpenAPI consensus: if ≥80% of 2xx response schemas share a common
 *     wrapper key, infer it statically from the spec.
 *
 * Returns:
 *   { successWrapper: string[]|null, errorWrapper: string[]|null, source: string|null }
 *
 *   - successWrapper: path to unwrap success payloads, e.g. ['data'] or
 *     ['payload','data'] for N-deep. null means no envelope.
 *   - errorWrapper: path to unwrap error payloads (from error-envelope
 *     detector, merged by caller). null means no error envelope.
 *   - source: file that declared the envelope, for diagnostics.
 */

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_ENTRYPOINTS = [
  'apps/api/src/main.ts',
  'apps/api/src/main.js',
  'src/main.ts',
  'src/main.js',
];

const EXPRESS_ENTRYPOINTS = [
  'apps/api/src/app.ts',
  'apps/api/src/app.js',
  'src/app.ts',
  'src/app.js',
  'apps/api/src/index.ts',
  'apps/api/src/index.js',
  'src/index.ts',
  'src/index.js',
];

const FASTIFY_ENTRYPOINTS = [
  'apps/api/src/app.ts',
  'apps/api/src/app.js',
  'src/app.ts',
  'src/app.js',
  'apps/api/src/server.ts',
  'apps/api/src/server.js',
  'src/server.ts',
  'src/server.js',
];

const KOA_ENTRYPOINTS = [
  'apps/api/src/app.ts',
  'apps/api/src/app.js',
  'src/app.ts',
  'src/app.js',
  'apps/api/src/index.ts',
  'apps/api/src/index.js',
  'src/index.ts',
  'src/index.js',
];

function readFileSafe(absPath) {
  try {
    return fs.readFileSync(absPath, 'utf8');
  } catch {
    return null;
  }
}

function findEntrypoint(projectDir, candidates) {
  for (const rel of candidates) {
    const abs = path.join(projectDir, rel);
    if (fs.existsSync(abs)) return abs;
  }
  return null;
}

function findBootstrapEntrypoint(projectDir) {
  return findEntrypoint(projectDir, DEFAULT_ENTRYPOINTS);
}

/**
 * Find `useGlobalInterceptors(new ClassA(), new ClassB())` and return the list
 * of class names. Whitespace-tolerant.
 */
function extractGlobalInterceptorClassNames(mainSource) {
  const names = [];
  const marker = 'useGlobalInterceptors';
  let searchFrom = 0;
  while (true) {
    const markerIdx = mainSource.indexOf(marker, searchFrom);
    if (markerIdx === -1) break;
    let i = markerIdx + marker.length;
    while (i < mainSource.length && /\s/.test(mainSource[i])) i++;
    if (mainSource[i] !== '(') {
      searchFrom = markerIdx + marker.length;
      continue;
    }
    let depth = 1;
    const argStart = i + 1;
    i++;
    while (i < mainSource.length && depth > 0) {
      const ch = mainSource[i];
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      if (depth > 0) i++;
    }
    const argList = mainSource.slice(argStart, i);
    const ctorRe = /new\s+([A-Z][A-Za-z0-9_]*)\s*\(/g;
    let ctor;
    while ((ctor = ctorRe.exec(argList)) !== null) {
      names.push(ctor[1]);
    }
    searchFrom = i + 1;
  }
  return names;
}

/**
 * Resolve a class name to its source file by scanning `import { Class } from '...'`
 * lines in the bootstrap entrypoint.
 */
function resolveClassImportPath(mainSource, mainFile, className) {
  const re = new RegExp(
    `import\\s*\\{[^}]*\\b${className}\\b[^}]*\\}\\s*from\\s*['"]([^'"]+)['"]`,
  );
  const m = mainSource.match(re);
  if (!m) return null;
  const spec = m[1];
  if (!spec.startsWith('.')) return null;
  const base = path.resolve(path.dirname(mainFile), spec);
  const candidates = [base, `${base}.ts`, `${base}.js`, path.join(base, 'index.ts'), path.join(base, 'index.js')];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

// ── NestJS: .pipe(map(...)) ──

/**
 * Parse `.map((<param>) => ({ ... }))` from the interceptor source and return
 * the N-deep path to the payload parameter as a string array.
 *
 * Handles:
 *   map((data) => ({ success: true, data }))           → ['data']
 *   map((payload) => ({ success: true, data: payload })) → ['data']
 *   map((x) => ({ result: { data: x } }))              → ['result', 'data']
 *   map((x) => ({ outer: { inner: { payload: x } } })) → ['outer', 'inner', 'payload']
 */
function extractWrapperKey(interceptorSource) {
  const mapRe = /\.\s*pipe\s*\([\s\S]*?map\s*\(\s*\(\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*(?::\s*[^)]+)?\s*\)\s*=>\s*\(?\s*(\{[\s\S]*?\})\s*\)?/;
  const m = interceptorSource.match(mapRe);
  if (!m) return null;

  const paramName = m[1];
  const objectLiteral = m[2];

  return extractWrapperPath(objectLiteral, paramName);
}

/**
 * Recursively find the N-deep path to the param in an object literal.
 * Returns string[] or null.
 */
function extractWrapperPath(objectLiteral, paramName) {
  const stripped = objectLiteral
    .replace(/'[^']*'/g, "''")
    .replace(/"[^"]*"/g, '""')
    .replace(/`[^`]*`/g, '``');

  const topLevelProps = splitTopLevelProperties(stripped);
  for (const prop of topLevelProps) {
    const trimmed = prop.trim();
    // shorthand: just the parameter name → wrapper path is [paramName].
    if (trimmed === paramName) return [paramName];
    // `<key>: <value>`
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;
    const key = trimmed.slice(0, colonIdx).trim().replace(/^['"]|['"]$/g, '');
    const value = trimmed.slice(colonIdx + 1).trim();
    if (value === paramName) return [key];
    // Nested: `key: { ... }` — recurse to find paramName deeper.
    if (value.startsWith('{') && value.includes(paramName)) {
      const inner = extractWrapperPath(value, paramName);
      if (inner) return [key, ...inner];
    }
  }
  return null;
}

function splitTopLevelProperties(objLiteral) {
  const inner = objLiteral.replace(/^\s*\{/, '').replace(/\}\s*$/, '');
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === '{' || ch === '[' || ch === '(') depth++;
    else if (ch === '}' || ch === ']' || ch === ')') depth--;
    else if (ch === ',' && depth === 0) {
      parts.push(inner.slice(start, i));
      start = i + 1;
    }
  }
  if (start < inner.length) parts.push(inner.slice(start));
  return parts;
}

// ── Brace-balanced extraction helper ──

/**
 * Extract the first brace-balanced `{...}` object literal starting at or after
 * `startIdx` in `source`. Returns the object literal string (including outer
 * braces) or null.
 */
function extractBalancedObject(source, startIdx) {
  let i = startIdx;
  while (i < source.length && source[i] !== '{') i++;
  if (i >= source.length) return null;

  let depth = 0;
  const objStart = i;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return source.slice(objStart, i + 1);
    }
    i++;
  }
  return null;
}

// ── Express: res.json override in global middleware ──

/**
 * Detect Express middleware that overrides res.json to wrap responses.
 *
 * Pattern: `const originalJson = res.json; res.json = function(body) { ... originalJson.call(this, { data: body }) }`
 * or: `res.json = (body) => originalJson.call(res, { wrapper: body })`
 */
function extractExpressWrapper(source) {
  // Look for res.json override pattern
  const overrideRe = /res\.json\s*=\s*(?:function\s*\(([^)]*)\)|(?:\(([^)]*)\)\s*=>))/;
  const m = source.match(overrideRe);
  if (!m) return null;

  const paramName = (m[1] || m[2] || '').trim();
  if (!paramName) return null;

  // Find the call site: originalJson.call(this|res, { ... }) using brace-balanced extraction
  // Match any identifier.call(..., { ... }) — covers orig, originalJson, _json, etc.
  const callRe = /[A-Za-z_$][A-Za-z0-9_$]*\.call\s*\([^,]+,\s*/g;
  const callMatch = callRe.exec(source);
  if (callMatch) {
    const objLiteral = extractBalancedObject(source, callMatch.index + callMatch[0].length);
    if (objLiteral) {
      return extractWrapperPath(objLiteral, paramName);
    }
  }

  // Alternative: .json({ wrapper: body }) inside the override — brace-balanced
  const directRe = /\.json\s*\(\s*/g;
  let directMatch;
  while ((directMatch = directRe.exec(source)) !== null) {
    const objLiteral = extractBalancedObject(source, directMatch.index + directMatch[0].length);
    if (objLiteral && objLiteral.includes(paramName)) {
      return extractWrapperPath(objLiteral, paramName);
    }
  }

  return null;
}

// ── Fastify: addHook('preSerialization', ...) ──

/**
 * Detect Fastify preSerialization hook that wraps responses.
 *
 * Pattern: `addHook('preSerialization', async (req, reply, payload) => { return { data: payload } })`
 */
function extractFastifyWrapper(source) {
  const hookRe = /addHook\s*\(\s*['"]preSerialization['"]\s*,\s*(?:async\s+)?(?:function\s*)?\(\s*(?:\w+\s*,\s*){2}(\w+)/;
  const m = source.match(hookRe);
  if (!m) return null;

  const paramName = m[1];
  // Find the return object literal using brace-balanced extraction
  const returnRe = /return\s+/g;
  let returnMatch;
  while ((returnMatch = returnRe.exec(source)) !== null) {
    const objLiteral = extractBalancedObject(source, returnMatch.index + returnMatch[0].length);
    if (objLiteral && objLiteral.includes(paramName)) {
      return extractWrapperPath(objLiteral, paramName);
    }
  }
  return null;
}

// ── Koa: ctx.body wrapper middleware ──

/**
 * Detect Koa middleware that wraps ctx.body.
 *
 * Pattern: `await next(); ctx.body = { data: ctx.body }` or
 * `const body = ctx.body; ctx.body = { data: body }`
 */
function extractKoaWrapper(source) {
  // Pattern 1: ctx.body = { ... ctx.body ... }
  const directRe = /ctx\.body\s*=\s*(\{[^}]*ctx\.body[^}]*\})/;
  const directMatch = source.match(directRe);
  if (directMatch) {
    return extractWrapperPath(directMatch[1], 'ctx.body');
  }

  // Pattern 2: const body = ctx.body; ... ctx.body = { ... body ... }
  const captureRe = /(?:const|let|var)\s+(\w+)\s*=\s*ctx\.body/;
  const captureMatch = source.match(captureRe);
  if (!captureMatch) return null;

  const varName = captureMatch[1];
  const assignRe = new RegExp(
    `ctx\\.body\\s*=\\s*(\\{[^}]*${varName}[^}]*\\})`,
  );
  const assignMatch = source.match(assignRe);
  if (!assignMatch) return null;

  return extractWrapperPath(assignMatch[1], varName);
}

// ── OpenAPI consensus fallback ──

/**
 * If ≥80% of 2xx response schemas share a common top-level key that wraps
 * an inner object/ref, infer it as the envelope.
 *
 * @param {string} projectDir
 * @returns {string[]|null} wrapper path or null
 */
function inferOpenApiConsensus(projectDir, diag) {
  const specPaths = [
    'apps/api/.openapi.json',
    '.openapi.json',
    'openapi.json',
    'swagger.json',
  ];
  let specFile = null;
  let specContent = null;
  for (const rel of specPaths) {
    const abs = path.join(projectDir, rel);
    const content = readFileSafe(abs);
    if (content) {
      specFile = rel;
      specContent = content;
      break;
    }
  }
  if (!specContent) return null;

  let spec;
  try { spec = JSON.parse(specContent); } catch { return null; }
  if (!spec.paths || typeof spec.paths !== 'object') return null;

  const wrapperCounts = {};
  let totalOps = 0;

  for (const pathObj of Object.values(spec.paths)) {
    if (!pathObj || typeof pathObj !== 'object') continue;
    for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
      const op = pathObj[method];
      if (!op || !op.responses) continue;

      for (const [status, resp] of Object.entries(op.responses)) {
        const code = parseInt(status, 10);
        if (code < 200 || code >= 300) continue;

        const jsonContent = resp?.content?.['application/json'];
        if (!jsonContent?.schema) continue;

        let schema = jsonContent.schema;
        // Resolve top-level $ref
        if (schema.$ref && spec.components?.schemas) {
          const refName = schema.$ref.split('/').pop();
          schema = spec.components.schemas[refName] || schema;
        }

        if (schema.type !== 'object' || !schema.properties) continue;
        totalOps++;

        const keys = Object.keys(schema.properties);
        // Look for a key whose value is object or $ref — that's a candidate wrapper
        for (const key of keys) {
          const prop = schema.properties[key];
          const isWrapperCandidate =
            prop.type === 'object' ||
            prop.$ref ||
            (prop.type === 'array' && (prop.items?.$ref || prop.items?.type === 'object'));
          if (isWrapperCandidate) {
            wrapperCounts[key] = (wrapperCounts[key] || 0) + 1;
          }
        }
      }
    }
  }

  if (totalOps === 0) return null;

  // Find the most common wrapper key, require ≥80% consensus
  let bestKey = null;
  let bestCount = 0;
  for (const [key, count] of Object.entries(wrapperCounts)) {
    if (count > bestCount) {
      bestKey = key;
      bestCount = count;
    }
  }

  if (bestKey && bestCount / totalOps >= 0.8) {
    if (diag && typeof diag.info === 'function') {
      diag.info(`response-envelope: OpenAPI consensus wrapper "${bestKey}" (${bestCount}/${totalOps} ops)`);
    }
    return { wrapper: [bestKey], source: specFile };
  }

  return null;
}

// ── Framework dispatch ──

/**
 * Try Express envelope detection across entrypoints + imported middleware.
 */
function detectExpressEnvelope(projectDir, diag) {
  const entrypoint = findEntrypoint(projectDir, EXPRESS_ENTRYPOINTS);
  if (!entrypoint) return null;

  const source = readFileSafe(entrypoint);
  if (!source) return null;

  // Check entrypoint directly
  const wrapper = extractExpressWrapper(source);
  if (wrapper) {
    const relPath = path.relative(projectDir, entrypoint);
    if (diag && typeof diag.info === 'function') {
      diag.info(`response-envelope: Express res.json override wraps via ${JSON.stringify(wrapper)} (${relPath})`);
    }
    return { wrapper, source: relPath };
  }

  // Check imported middleware files
  const importRe = /(?:require|from)\s*\(\s*['"](\.[^'"]+)['"]\s*\)|from\s+['"](\.[^'"]+)['"]/g;
  let im;
  while ((im = importRe.exec(source)) !== null) {
    const spec = im[1] || im[2];
    if (!spec) continue;
    const base = path.resolve(path.dirname(entrypoint), spec);
    const candidates = [base, `${base}.ts`, `${base}.js`];
    for (const candidate of candidates) {
      const midSource = readFileSafe(candidate);
      if (!midSource) continue;
      const midWrapper = extractExpressWrapper(midSource);
      if (midWrapper) {
        const relPath = path.relative(projectDir, candidate);
        if (diag && typeof diag.info === 'function') {
          diag.info(`response-envelope: Express middleware wraps via ${JSON.stringify(midWrapper)} (${relPath})`);
        }
        return { wrapper: midWrapper, source: relPath };
      }
    }
  }

  return null;
}

/**
 * Try Fastify envelope detection.
 */
function detectFastifyEnvelope(projectDir, diag) {
  const entrypoint = findEntrypoint(projectDir, FASTIFY_ENTRYPOINTS);
  if (!entrypoint) return null;

  const source = readFileSafe(entrypoint);
  if (!source) return null;

  const wrapper = extractFastifyWrapper(source);
  if (wrapper) {
    const relPath = path.relative(projectDir, entrypoint);
    if (diag && typeof diag.info === 'function') {
      diag.info(`response-envelope: Fastify preSerialization hook wraps via ${JSON.stringify(wrapper)} (${relPath})`);
    }
    return { wrapper, source: relPath };
  }

  return null;
}

/**
 * Try Koa envelope detection.
 */
function detectKoaEnvelope(projectDir, diag) {
  const entrypoint = findEntrypoint(projectDir, KOA_ENTRYPOINTS);
  if (!entrypoint) return null;

  const source = readFileSafe(entrypoint);
  if (!source) return null;

  const wrapper = extractKoaWrapper(source);
  if (wrapper) {
    const relPath = path.relative(projectDir, entrypoint);
    if (diag && typeof diag.info === 'function') {
      diag.info(`response-envelope: Koa ctx.body middleware wraps via ${JSON.stringify(wrapper)} (${relPath})`);
    }
    return { wrapper, source: relPath };
  }

  return null;
}

// ── Public API ──

/**
 * Public entrypoint. Returns { successWrapper, errorWrapper, source }.
 *
 * Detection priority:
 *   1. NestJS useGlobalInterceptors + .pipe(map(...))
 *   2. Express res.json override middleware
 *   3. Fastify preSerialization hook
 *   4. Koa ctx.body middleware
 *   5. OpenAPI consensus (≥80% of 2xx schemas share a wrapper key)
 *
 * errorWrapper is NOT detected here — it comes from the error-envelope
 * detector and is merged by the matrix-loader coercion. This function
 * always returns errorWrapper: null.
 *
 * Back-compat: also exposes `wrapper` as a string (first element of
 * successWrapper) for callers that haven't migrated yet.
 */
function detectResponseEnvelope(projectDir, diag) {
  // 1. NestJS
  const nestResult = detectNestEnvelope(projectDir, diag);
  if (nestResult) return nestResult;

  // 2. Express
  const expressResult = detectExpressEnvelope(projectDir, diag);
  if (expressResult) {
    return makeResult(expressResult.wrapper, expressResult.source);
  }

  // 3. Fastify
  const fastifyResult = detectFastifyEnvelope(projectDir, diag);
  if (fastifyResult) {
    return makeResult(fastifyResult.wrapper, fastifyResult.source);
  }

  // 4. Koa
  const koaResult = detectKoaEnvelope(projectDir, diag);
  if (koaResult) {
    return makeResult(koaResult.wrapper, koaResult.source);
  }

  // 5. OpenAPI consensus
  const consensus = inferOpenApiConsensus(projectDir, diag);
  if (consensus) {
    return makeResult(consensus.wrapper, consensus.source);
  }

  if (diag && typeof diag.info === 'function') {
    diag.info('response-envelope: no envelope detected across any framework');
  }
  return { successWrapper: null, errorWrapper: null, wrapper: null, source: null };
}

/**
 * NestJS-specific detection (original algorithm).
 */
function detectNestEnvelope(projectDir, diag) {
  const entrypoint = findBootstrapEntrypoint(projectDir);
  if (!entrypoint) return null;

  const mainSource = readFileSafe(entrypoint);
  if (!mainSource) return null;

  const classNames = extractGlobalInterceptorClassNames(mainSource);
  if (classNames.length === 0) return null;

  for (const className of classNames) {
    const interceptorFile = resolveClassImportPath(mainSource, entrypoint, className);
    if (!interceptorFile) continue;
    const interceptorSource = readFileSafe(interceptorFile);
    if (!interceptorSource) continue;
    const wrapperPath = extractWrapperKey(interceptorSource);
    if (wrapperPath) {
      const relPath = path.relative(projectDir, interceptorFile);
      if (diag && typeof diag.info === 'function') {
        diag.info(`response-envelope: ${className} wraps via ${JSON.stringify(wrapperPath)} (${relPath})`);
      }
      return makeResult(wrapperPath, relPath);
    }
  }

  return null;
}

function makeResult(wrapperPath, source) {
  return {
    successWrapper: wrapperPath,
    errorWrapper: null,
    // Back-compat: single string for old callers
    wrapper: Array.isArray(wrapperPath) ? wrapperPath.join('.') : wrapperPath,
    source: source || null,
  };
}

module.exports = {
  detectResponseEnvelope,
  // Exported for unit tests.
  extractGlobalInterceptorClassNames,
  resolveClassImportPath,
  extractWrapperKey,
  extractWrapperPath,
  splitTopLevelProperties,
  extractBalancedObject,
  extractExpressWrapper,
  extractFastifyWrapper,
  extractKoaWrapper,
  inferOpenApiConsensus,
  detectNestEnvelope,
  detectExpressEnvelope,
  detectFastifyEnvelope,
  detectKoaEnvelope,
  makeResult,
};
