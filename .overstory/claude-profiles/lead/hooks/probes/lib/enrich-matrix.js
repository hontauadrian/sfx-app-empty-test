'use strict';

/**
 * enrich-matrix.js — attaches Zod schema contracts, NestJS decorator data,
 * and Swagger-declared statuses onto every endpoint in the matrix.
 *
 * Also normalizes page `guard` fields.
 *
 * Spec: plan 07 Phase 1d — Matrix enrichment.
 *
 * Import strategy:
 *   - nest-decorators.js: direct require() (already .js / CommonJS)
 *   - zod-introspect.ts: child process via tsx (approach 2 from spec)
 *     Matches how probes/index.ts is invoked. Slower but simpler and
 *     avoids needing a compile step.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// NestJS endpoint enrichment is delivered by the OpenAPI detector
// (detectors/nest-openapi.js) which embeds zodContract, authDecorators, and
// swaggerDeclared directly on each endpoint. The legacy regex decorator
// extractor has been retired.
const { readFileSafe } = require('./fsutil');

// ---------------------------------------------------------------------------
// Zod introspection via tsx subprocess
// ---------------------------------------------------------------------------

/**
 * Invoke the Zod introspector as a tsx child process.
 * Returns SchemaContract or null on failure.
 */
function invokeZodIntrospect(projectDir, schemaPath, symbolName, diag) {
  const cliPath = path.resolve(__dirname, 'zod-introspect-cli.ts');
  const tsxBin = findTsx(projectDir);
  if (!tsxBin) {
    diag.push('zod-introspect: tsx binary not found');
    return null;
  }

  const absSchemaPath = path.isAbsolute(schemaPath)
    ? schemaPath
    : path.resolve(projectDir, schemaPath);

  if (!fs.existsSync(absSchemaPath)) {
    diag.push(`zod-introspect: schema file not found: ${schemaPath}`);
    return null;
  }

  const input = JSON.stringify({ schemaPath: absSchemaPath, symbolName });

  try {
    const stdout = execFileSync(tsxBin, [cliPath], {
      input,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 10000,
      cwd: projectDir,
    });
    const result = JSON.parse(stdout.toString('utf8'));
    if (result.error) {
      diag.push(`zod-introspect(${symbolName}): ${result.error}`);
      return null;
    }
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    diag.push(`zod-introspect(${symbolName}): subprocess failed: ${msg}`);
    return null;
  }
}

function findTsx(projectDir) {
  // Check project's node_modules first, then walk up from project dir.
  let dir = projectDir;
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(dir, 'node_modules', '.bin', 'tsx');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Also check relative to THIS module's location (the hooks/probes tree),
  // which may be different from projectDir when scanning test fixtures.
  dir = __dirname;
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(dir, 'node_modules', '.bin', 'tsx');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback: hope it's on PATH.
  try {
    execFileSync('which', ['tsx'], { stdio: 'pipe' });
    return 'tsx';
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// NestJS decorator enrichment
// ---------------------------------------------------------------------------

/**
 * Build a map of controller file paths → { decorators, source, absFile }.
 * The key is the relative file path used in the matrix endpoint entries.
 * We keep the source around so we can extract Zod symbol names later.
 */
function buildDecoratorMap(projectDir, endpoints, diag) {
  const controllerFiles = new Set();
  for (const ep of endpoints) {
    if (ep.framework === 'nest' && ep.file) {
      controllerFiles.add(ep.file);
    }
  }

  const decoratorMap = new Map();
  for (const relFile of controllerFiles) {
    const absFile = path.resolve(projectDir, relFile);
    const source = readFileSafe(absFile);
    if (!source) {
      diag.push(`nest-decorators: cannot read ${relFile}`);
      continue;
    }
    try {
      const decorators = extractNestDecorators(source, {
        diagnostics: diag,
        controllerAbsFile: absFile,
      });
      decoratorMap.set(relFile, { decorators, source, absFile });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      diag.push(`nest-decorators(${relFile}): extraction failed: ${msg}`);
    }
  }
  return decoratorMap;
}

/**
 * Match an existing matrix endpoint to a decorator entry by HTTP method + path.
 *
 * Only exact normalized-path match is used (declarative). Former suffix-match
 * and handler-name-match passes were heuristics that silently picked one of
 * multiple ambiguous candidates. If pass 1 misses, the root cause is bad path
 * normalization upstream — emit DIAG and let the developer fix the source.
 */
function findDecoratorMatch(endpoint, decorators, diag) {
  if (!decorators || decorators.length === 0) return null;
  const epMethod = endpoint.method.toUpperCase();
  const epPath = normalizePath(endpoint.path);

  // Pass 1: exact normalized match (declarative — the only acceptable pass).
  const exactMatches = [];
  for (const dec of decorators) {
    if (dec.httpMethod.toUpperCase() === epMethod && normalizePath(dec.fullPath) === epPath) {
      exactMatches.push(dec);
    }
  }
  if (exactMatches.length === 1) return exactMatches[0];
  if (exactMatches.length > 1) {
    if (diag) {
      diag.push(`decorator-match: ${epMethod} ${epPath} matched ${exactMatches.length} decorators — ambiguous, skipping.`);
    }
    return null;
  }

  // No exact match — emit diagnostic. Do NOT fall back to suffix or
  // handler-name matching (those are heuristics).
  if (diag) {
    diag.push(`decorator-match: no exact match for ${epMethod} ${epPath}. Check that the controller path includes the global prefix.`);
  }
  return null;
}

function normalizePath(pathStr) {
  return ('/' + (pathStr || '').replace(/^\/+|\/+$/g, '')).toLowerCase();
}

// ---------------------------------------------------------------------------
// Schema ref resolution
// ---------------------------------------------------------------------------

/**
 * Locate the handler method's parameter list within the controller source.
 * Returns the raw string between the outer parentheses, or null if not found.
 */
function extractHandlerParamList(source, handlerName) {
  const idx = source.indexOf(handlerName + '(');
  if (idx === -1) return null;
  const openParen = idx + handlerName.length;
  let depth = 0;
  for (let i = openParen; i < source.length; i++) {
    if (source[i] === '(') depth++;
    else if (source[i] === ')') {
      depth--;
      if (depth === 0) return source.slice(openParen + 1, i);
    }
  }
  return null;
}

/**
 * Extract the Zod schema symbol name from a specific param decorator
 * (@Body or @Query) inside a handler's paramList.
 */
function extractZodSymbolForKind(paramList, kind) {
  if (!paramList) return null;
  const re = new RegExp(`@${kind}\\s*\\(\\s*new\\s+ZodValidationPipe\\s*\\(\\s*(\\w+)\\s*\\)`);
  const m = paramList.match(re);
  return m ? m[1] : null;
}

/**
 * Extract the actual Zod schema symbol name from the controller source.
 *
 * The decorator extractor gives us bodySchemaRef as an import path
 * (e.g. '../../packages/validation/src/auth.schema') or a pipe name.
 * We need the actual symbol name (e.g. 'RegisterSchema') that was passed
 * to ZodValidationPipe() in the handler's @Body() decorator.
 *
 * We scan the source for ZodValidationPipe(SymbolName) near the handler.
 */
function extractZodSymbolForHandler(source, handlerName) {
  // Pattern: handler method with @Body(new ZodValidationPipe(SymbolName))
  // We look for ZodValidationPipe(<identifier>) globally and try to
  // associate it with the handler.
  const pipeRegex = /ZodValidationPipe\s*\(\s*(\w+)\s*\)/g;
  let match;
  const candidates = [];
  while ((match = pipeRegex.exec(source)) !== null) {
    candidates.push({ symbolName: match[1], index: match.index });
  }
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0].symbolName;

  // Multiple ZodValidationPipe uses — pick the one nearest to the handler.
  const handlerIdx = source.indexOf(handlerName + '(');
  if (handlerIdx === -1) return candidates[0].symbolName;
  let best = candidates[0];
  let bestDist = Math.abs(best.index - handlerIdx);
  for (const candidate of candidates) {
    const dist = Math.abs(candidate.index - handlerIdx);
    if (dist < bestDist) {
      best = candidate;
      bestDist = dist;
    }
  }
  return best.symbolName;
}

/**
 * Resolve a schema reference to an absolute file path + symbol name
 * for zod-introspect.
 *
 * Strategies:
 * 1. If bodySchemaRef is a relative import path, resolve it relative
 *    to the controller file, then extract the symbol name from the source.
 * 2. If the ref looks like a bare identifier (symbol name), search for
 *    it in known validation package paths.
 * 3. Search @sfx/validation package.
 */
function resolveSchemaFile(projectDir, schemaRef, controllerAbsFile, controllerSource, handlerName, preResolvedSymbol) {
  if (!schemaRef) return null;

  // Strategy 1: schemaRef is an import path (starts with . or /)
  if (schemaRef.startsWith('.') || schemaRef.startsWith('/')) {
    const controllerDir = path.dirname(controllerAbsFile);
    const resolved = path.resolve(controllerDir, schemaRef);
    // Try the path as-is, then with TypeScript extensions.
    const tsExts = ['.ts', '.tsx', '.js', '.jsx'];
    const ext = path.extname(resolved);
    const candidates = tsExts.includes(ext)
      ? [resolved]
      : [resolved, ...tsExts.map((e) => resolved + e)];
    const found = candidates.find((c) => fs.existsSync(c));
    if (found) {
      // Prefer the pre-resolved symbol (e.g. @Query-specific) if provided.
      const symbolName = preResolvedSymbol || extractZodSymbolForHandler(controllerSource, handlerName);
      if (symbolName) {
        return { filePath: found, symbolName };
      }
      // Fallback: try to find any exported z.object in the file.
      const schemaSource = readFileSafe(found);
      if (schemaSource) {
        const exportMatch = schemaSource.match(/export\s+const\s+(\w+Schema\w*)\s*=/);
        if (exportMatch) {
          return { filePath: found, symbolName: exportMatch[1] };
        }
      }
    }
  }

  // Strategy 2: schemaRef is a bare symbol name — search validation package.
  // Prefer the schemas/ directory over index.ts, because index.ts typically
  // only re-exports (e.g. `export { registerSchema } from './auth.schema'`),
  // and zod-introspect cannot resolve re-exports — it needs the actual
  // `const registerSchema = z.object(...)` definition.
  const validationPaths = [
    path.join(projectDir, 'packages', 'validation', 'src', 'schemas'),
    path.join(projectDir, 'packages', 'validation', 'src', 'index.ts'),
  ];

  for (const searchPath of validationPaths) {
    if (!fs.existsSync(searchPath)) continue;
    const stat = fs.statSync(searchPath);
    if (stat.isFile()) {
      const content = readFileSafe(searchPath);
      if (content && content.includes(schemaRef)) {
        return { filePath: searchPath, symbolName: schemaRef };
      }
    } else if (stat.isDirectory()) {
      const files = fs.readdirSync(searchPath).filter((f) => f.endsWith('.ts'));
      for (const file of files) {
        const fullPath = path.join(searchPath, file);
        const content = readFileSafe(fullPath);
        if (content && content.includes(schemaRef)) {
          return { filePath: fullPath, symbolName: schemaRef };
        }
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Enrich a matrix object in-place with decorator and Zod contract data.
 *
 * @param {object} matrix — the full matrix object (mutated in place)
 * @param {string} projectDir — absolute path to the project root
 * @param {object} diagLogger — { push(msg) } or array
 * @returns {{ enrichedCount: number, diagnostics: string[] }}
 */
function enrichMatrix(matrix, projectDir, diagLogger) {
  const diag = diagLogger || [];
  const endpoints = matrix.apiEndpoints || [];
  let enrichedCount = 0;

  // Enrich each endpoint. NestJS endpoints arrive pre-populated from
  // detectors/nest-openapi.js — we just count them. Other frameworks retain
  // their existing behaviour (no-op enrichment here, defaults wired below).
  for (const endpoint of endpoints) {
    const prepopulated =
      endpoint.framework === 'nest' &&
      endpoint.authDecorators &&
      endpoint.authDecorators.authProvenance === 'openapi';

    if (prepopulated) {
      enrichedCount += 1;
      continue;
    }

    // Non-nest (or misconfigured nest) endpoints: initialize new fields with
    // safe defaults so downstream consumers never see `undefined`.
    endpoint.zodContract = endpoint.zodContract || null;
    endpoint.queryContract = endpoint.queryContract || null;
    endpoint.responseContract = endpoint.responseContract || null;
    endpoint.errorShape = endpoint.errorShape || null;
    endpoint.paginationProfile = endpoint.paginationProfile || null;
    endpoint.conditionalProfile = endpoint.conditionalProfile || null;
    endpoint.idempotencyProfile = endpoint.idempotencyProfile || null;
    endpoint.securityRequirement = endpoint.securityRequirement || [];
    endpoint.authDecorators = endpoint.authDecorators || null;
    endpoint.swaggerDeclared = endpoint.swaggerDeclared || null;
  }

  // Normalize page guard fields.
  for (const page of matrix.pages || []) {
    if (!page.guard) {
      page.guard = 'unknown';
    }
  }

  return { enrichedCount, diagnostics: diag };
}

module.exports = { enrichMatrix, invokeZodIntrospect };
