'use strict';

/**
 * error-envelope.js — static detector for the error response envelope.
 *
 * NestJS apps commonly install a global exception filter that wraps every
 * error response in an envelope (e.g. `{ success: false, error: { statusCode, message } }`).
 * The HTTP probe needs to know the wrapper shape so error-shape assertions
 * can unwrap transparently.
 *
 * Instead of sniffing responses at runtime, we extract the shape from the
 * filter's source code at matrix-generation time. This mirrors the approach
 * used by `response-envelope.js` for the success-path interceptor.
 *
 * Algorithm:
 *   1. Read apps/api/src/main.ts (or the bootstrap entrypoint).
 *   2. Find `useGlobalFilters(new <ClassName>())` calls.
 *   3. Resolve each <ClassName> to its source file via the matching
 *      `import { <ClassName> } from '<path>'` line.
 *   4. Read the filter source.
 *   5. Find `response.status(...).json({...})` calls in the catch handler.
 *   6. Parse the object literal to identify:
 *      - wrapper path (e.g. 'error' key wrapping the inner object)
 *      - statusField (the key mapped to the HTTP status number)
 *      - messageField (the key mapped to the error message)
 *      - errorsArrayField (optional key for validation errors array)
 *
 * Returns:
 *   ErrorEnvelope | null
 *   - wrapper: string[] — path to unwrap, e.g. ['error'] or [] if flat
 *   - statusField: string — numeric status field name within unwrapped object
 *   - messageField: string — message field name
 *   - errorsArrayField: string | null — optional errors array field
 *   - source: string — path to the filter file, for diagnostics
 */

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_ENTRYPOINTS = [
  'apps/api/src/main.ts',
  'apps/api/src/main.js',
  'src/main.ts',
  'src/main.js',
];

function readFileSafe(absPath) {
  try {
    return fs.readFileSync(absPath, 'utf8');
  } catch {
    return null;
  }
}

function findBootstrapEntrypoint(projectDir) {
  for (const rel of DEFAULT_ENTRYPOINTS) {
    const abs = path.join(projectDir, rel);
    if (fs.existsSync(abs)) return abs;
  }
  return null;
}

/**
 * Find `useGlobalFilters(new ClassA(), new ClassB())` and return the list
 * of class names. Whitespace-tolerant.
 */
function extractGlobalFilterClassNames(mainSource) {
  const names = [];
  const marker = 'useGlobalFilters';
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

/**
 * Split top-level properties of an object literal string (between outer braces).
 * Tracks brace/bracket/paren depth so nested objects don't split incorrectly.
 */
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

/**
 * Extract the brace-balanced content of the first `response.status(...).json({...})`
 * or `response.json({...})` or `response.status(...).send({...})` call found in
 * filterSource. Returns the object-literal string including outer braces, or null.
 */
function extractJsonCallBody(filterSource) {
  // Match `.json(` or `.send(` preceded by `response.status(...)` or just `response`
  const callRe = /\.(?:json|send)\s*\(/g;
  let match;
  while ((match = callRe.exec(filterSource)) !== null) {
    let i = match.index + match[0].length;
    // Skip whitespace to find opening brace
    while (i < filterSource.length && /\s/.test(filterSource[i])) i++;
    if (filterSource[i] !== '{') continue;

    // Extract brace-balanced object literal
    let depth = 0;
    const objStart = i;
    while (i < filterSource.length) {
      const ch = filterSource[i];
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          return filterSource.slice(objStart, i + 1);
        }
      }
      i++;
    }
  }
  return null;
}

/**
 * Analyze an object literal for error envelope shape.
 *
 * Given: `{ success: false, error: { statusCode: status, message, ...(errors ? { errors } : {}) } }`
 * Returns: { wrapper: ['error'], statusField: 'statusCode', messageField: 'message', errorsArrayField: 'errors' }
 *
 * Given: `{ statusCode: status, message }` (flat, no wrapper)
 * Returns: { wrapper: [], statusField: 'statusCode', messageField: 'message', errorsArrayField: null }
 */
function analyzeErrorShape(objLiteral, extensions) {
  const topProps = splitTopLevelProperties(objLiteral);

  // First pass: identify if there's a wrapper object (a key whose value is `{...}`)
  let wrapperKey = null;
  let innerLiteral = null;

  for (const prop of topProps) {
    const trimmed = prop.trim();
    // Skip spread expressions like `...(x ? y : z)`
    if (trimmed.startsWith('...')) continue;
    // Skip boolean/constant assignments like `success: false`
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim().replace(/^['"]|['"]$/g, '');
    const value = trimmed.slice(colonIdx + 1).trim();

    // If value starts with '{', this is a nested object — potential wrapper
    if (value.startsWith('{')) {
      wrapperKey = key;
      innerLiteral = value;
      break;
    }
  }

  // If we found a wrapper, analyze the inner object
  if (wrapperKey && innerLiteral) {
    const fields = parseFieldAssignments(innerLiteral, extensions);
    return {
      wrapper: [wrapperKey],
      statusField: fields.statusField,
      messageField: fields.messageField,
      errorsArrayField: fields.errorsArrayField,
      declaredFields: fields.declaredFields,
      spreadFields: fields.spreadFields,
    };
  }

  // No wrapper — flat shape. Analyze top-level directly.
  const fields = parseFieldAssignments(objLiteral, extensions);
  return {
    wrapper: [],
    statusField: fields.statusField,
    messageField: fields.messageField,
    errorsArrayField: fields.errorsArrayField,
    declaredFields: fields.declaredFields,
    spreadFields: fields.spreadFields,
  };
}

/**
 * Parse field assignments from an object literal. Returns ALL declared field
 * names with their value expressions — no hardcoded field-name matching.
 *
 * Semantic role classification (statusField, messageField, errorsArrayField)
 * is populated from an explicit x-error-status-field / x-error-message-field /
 * x-error-errors-field OpenAPI extension if provided, otherwise left null.
 * The consumer receives the full declaredFields array and can carry the
 * actual shape verbatim.
 *
 * Heuristic audit 2026-04-27: removed `key === 'statusCode' || key === 'status'`
 * etc. name matching. All field names are now returned verbatim.
 */
function parseFieldAssignments(objLiteral, extensions) {
  const props = splitTopLevelProperties(objLiteral);
  const declaredFields = [];
  const spreadFields = [];

  const spreadSet = new Set();

  for (const prop of props) {
    const trimmed = prop.trim();
    if (!trimmed) continue;

    // Handle spread: `...(errors ? { errors } : {})`
    if (trimmed.startsWith('...')) {
      // Extract identifiers from the spread expression for reference.
      const identRe = /\b([a-zA-Z_]\w*)\b/g;
      let identMatch;
      while ((identMatch = identRe.exec(trimmed)) !== null) {
        // Skip JS keywords/literals
        if (!['true', 'false', 'null', 'undefined', 'if', 'else'].includes(identMatch[1])) {
          spreadSet.add(identMatch[1]);
        }
      }
      continue;
    }

    const colonIdx = trimmed.indexOf(':');
    let key;
    let value;
    if (colonIdx === -1) {
      // Shorthand property: `message` means `message: message`
      key = trimmed;
      value = trimmed;
    } else {
      key = trimmed.slice(0, colonIdx).trim().replace(/^['"]|['"]$/g, '');
      value = trimmed.slice(colonIdx + 1).trim();
    }

    // Filter out empty keys (from trailing commas in object literals)
    if (!key) continue;

    declaredFields.push({ key, value });
  }

  spreadFields.push(...spreadSet);

  // Semantic role classification: from explicit extensions only.
  const ext = extensions || {};
  const statusField = ext['x-error-status-field'] || null;
  const messageField = ext['x-error-message-field'] || null;
  const errorsArrayField = ext['x-error-errors-field'] || null;

  return { statusField, messageField, errorsArrayField, declaredFields, spreadFields };
}

/**
 * Find the line number (1-based) of the `.json(` or `.send(` call within the filter source.
 */
function findJsonCallLine(filterSource) {
  const callRe = /\.(?:json|send)\s*\(/g;
  const match = callRe.exec(filterSource);
  if (!match) return null;
  const before = filterSource.slice(0, match.index);
  return before.split('\n').length;
}

/**
 * Public entrypoint. Returns ErrorEnvelope | null.
 */
function detectErrorEnvelope(projectDir, diag) {
  const entrypoint = findBootstrapEntrypoint(projectDir);
  if (!entrypoint) {
    if (diag && typeof diag.info === 'function') {
      diag.info('error-envelope: no bootstrap entrypoint found; envelope=null');
    }
    return null;
  }

  const mainSource = readFileSafe(entrypoint);
  if (!mainSource) return null;

  const classNames = extractGlobalFilterClassNames(mainSource);
  if (classNames.length === 0) {
    if (diag && typeof diag.info === 'function') {
      diag.info('error-envelope: no useGlobalFilters call; envelope=null');
    }
    return null;
  }

  for (const className of classNames) {
    const filterFile = resolveClassImportPath(mainSource, entrypoint, className);
    if (!filterFile) continue;
    const filterSource = readFileSafe(filterFile);
    if (!filterSource) continue;

    const jsonBody = extractJsonCallBody(filterSource);
    if (!jsonBody) continue;

    const shape = analyzeErrorShape(jsonBody);
    if ((!shape.declaredFields || shape.declaredFields.length === 0) && (!shape.spreadFields || shape.spreadFields.length === 0)) {
      // Could not extract any fields from the object literal — skip
      continue;
    }

    const line = findJsonCallLine(filterSource);
    const relPath = path.relative(projectDir, filterFile);
    const source = line ? `${relPath}:${line}` : relPath;

    const fieldNames = (shape.declaredFields || []).map((f) => f.key);

    if (diag && typeof diag.info === 'function') {
      diag.info(
        `error-envelope: ${className} wraps errors via ${JSON.stringify(shape.wrapper)} ` +
        `declaredFields=[${fieldNames.join(', ')}] (${source})`
      );
    }

    // Emit DIAG when semantic role classification is missing (no x-error-* extensions).
    if (!shape.statusField || !shape.messageField) {
      if (diag && typeof diag.info === 'function') {
        diag.info(
          `ERROR_STATUS_FIELD_UNDECLARED: error envelope detected in ${source} with fields ` +
          `[${fieldNames.join(', ')}] but semantic roles (statusField, messageField) are not ` +
          'declared. Add x-error-status-field, x-error-message-field, and optionally ' +
          'x-error-errors-field OpenAPI extensions on the error response schema to enable ' +
          'semantic error assertions. Without these, the probe carries the raw field names only.'
        );
      }
    }

    return {
      wrapper: shape.wrapper,
      statusField: shape.statusField,
      messageField: shape.messageField,
      errorsArrayField: shape.errorsArrayField,
      declaredFields: shape.declaredFields,
      spreadFields: shape.spreadFields,
      source,
    };
  }

  if (diag && typeof diag.info === 'function') {
    diag.info('error-envelope: filter(s) present but no .json()/.send() pattern matched');
  }
  return null;
}

module.exports = {
  detectErrorEnvelope,
  // Exported for unit tests.
  extractGlobalFilterClassNames,
  resolveClassImportPath,
  extractJsonCallBody,
  analyzeErrorShape,
  parseFieldAssignments,
  splitTopLevelProperties,
};
