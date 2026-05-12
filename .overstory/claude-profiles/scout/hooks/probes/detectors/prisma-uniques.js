'use strict';

/**
 * prisma-uniques.js — static detector for Prisma-declared unique constraints.
 *
 * The flows-generator needs to know which fields are `@unique` (or part of a
 * composite `@@unique`) so that :happy flows posting to endpoints that persist
 * those fields can substitute run-unique values instead of the Zod/Swagger
 * example verbatim. Example problem: POST /auth/register with a fixed
 * `user@example.com` from `@ApiBody` example succeeds on first run, returns
 * 409 on every subsequent run, collapsing probe coverage.
 *
 * Source of truth is `packages/database/prisma/schema.prisma` (or any other
 * .prisma file found under the project). Prisma's constraint graph is the
 * ONLY authoritative source for what the database will reject — Zod
 * `.describe("unique")` hints or name-regex heuristics (field matches /email/)
 * are wrong just often enough to cause silent miscoverage.
 *
 * Output shape:
 *   {
 *     models: {
 *       User: {
 *         idField: 'id',
 *         uniqueFields: ['email'],
 *         compositeUniques: [],   // array of arrays, e.g. [['orgId', 'slug']]
 *         fieldTypes: { email: 'String', id: 'String', ... },
 *         relations: [{ relationField, parentModel, fkFields, referencedFields }]
 *       },
 *       ...
 *     },
 *     source: 'packages/database/prisma/schema.prisma' | null,
 *   }
 *
 * Unknown file → { models: {}, source: null } (flows-generator falls back to
 * no unique substitution — same behaviour as today).
 */

const fs = require('node:fs');
const path = require('node:path');

const CANDIDATE_SCHEMA_PATHS = [
  'packages/database/prisma/schema.prisma',
  'prisma/schema.prisma',
  'apps/api/prisma/schema.prisma',
];

function readFileSafe(absPath) {
  try {
    return fs.readFileSync(absPath, 'utf8');
  } catch {
    return null;
  }
}

function findSchemaFile(projectDir) {
  for (const rel of CANDIDATE_SCHEMA_PATHS) {
    const abs = path.join(projectDir, rel);
    if (fs.existsSync(abs)) return abs;
  }
  return null;
}

/**
 * Strip line comments (// ...) and block comments (/* ... *​/) so we don't
 * mis-parse `// @unique` or similar inside commented-out code.
 * Preserves line structure for diagnostics.
 */
function stripComments(source) {
  // Block comments first.
  let out = source.replace(/\/\*[\s\S]*?\*\//g, '');
  // Line comments: remove from `//` to end of line.
  out = out.replace(/\/\/[^\n]*/g, '');
  return out;
}

/**
 * Parse every `model <Name> { ... }` block. Returns a map of model name to
 * its raw body contents.
 */
function extractModelBlocks(source) {
  const models = {};
  const re = /model\s+([A-Z][A-Za-z0-9_]*)\s*\{/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    const name = m[1];
    const bodyStart = m.index + m[0].length;
    // Walk forward tracking brace depth until matching '}'.
    let depth = 1;
    let i = bodyStart;
    while (i < source.length && depth > 0) {
      const ch = source[i];
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      if (depth > 0) i++;
    }
    models[name] = source.slice(bodyStart, i);
  }
  return models;
}

/**
 * Parse a model body and pull out: id field name, unique fields, composite
 * uniques, field→type map. Prisma field syntax:
 *
 *   <name>  <Type>[?|[]]  <attributes...>
 *
 * Common attributes: @id, @unique, @default(...), @map("..."), @updatedAt.
 * Model-level attributes: @@unique([a, b]), @@index([...]), @@map("...").
 */
function parseModelBody(body) {
  const idFields = [];
  const uniqueFields = [];
  const compositeUniques = [];
  const fieldTypes = {};
  const relations = [];

  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    const compositeMatch = line.match(/^@@unique\s*\(\s*\[([^\]]+)\]/);
    if (compositeMatch) {
      const fields = compositeMatch[1]
        .split(',')
        .map((s) => s.trim().replace(/^"|"$/g, ''))
        .filter(Boolean);
      if (fields.length > 0) compositeUniques.push(fields);
      continue;
    }

    if (line.startsWith('@@')) continue;

    const fieldMatch = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s+([A-Za-z_][A-Za-z0-9_]*)(\??|\[\])?(.*)$/);
    if (!fieldMatch) continue;
    const [, fieldName, fieldType, , attrs] = fieldMatch;
    fieldTypes[fieldName] = fieldType;

    if (/\B@id\b/.test(attrs)) idFields.push(fieldName);
    if (/\B@unique\b/.test(attrs)) uniqueFields.push(fieldName);

    const relMatch = attrs.match(/@relation\s*\(([^)]*)\)/);
    if (relMatch) {
      const inner = relMatch[1];
      const fkMatch = inner.match(/fields\s*:\s*\[([^\]]+)\]/);
      const refMatch = inner.match(/references\s*:\s*\[([^\]]+)\]/);
      if (fkMatch && refMatch) {
        const fkCols = fkMatch[1].split(',').map((s) => s.trim()).filter(Boolean);
        const refCols = refMatch[1].split(',').map((s) => s.trim()).filter(Boolean);
        relations.push({
          relationField: fieldName,
          parentModel: fieldType,
          fkFields: fkCols,
          referencedFields: refCols,
        });
      }
    }
  }

  return {
    idField: idFields[0] || null,
    uniqueFields,
    compositeUniques,
    fieldTypes,
    relations,
  };
}

/**
 * Public entrypoint.
 */
function detectPrismaUniques(projectDir, diag) {
  const schemaFile = findSchemaFile(projectDir);
  if (!schemaFile) {
    if (diag && typeof diag.info === 'function') {
      diag.info('prisma-uniques: no schema.prisma found; models={}');
    }
    return { models: {}, source: null };
  }

  const raw = readFileSafe(schemaFile);
  if (!raw) return { models: {}, source: null };

  const clean = stripComments(raw);
  const blocks = extractModelBlocks(clean);
  const models = {};
  for (const [name, body] of Object.entries(blocks)) {
    models[name] = parseModelBody(body);
  }

  if (diag && typeof diag.info === 'function') {
    const summary = Object.entries(models)
      .map(([name, info]) => `${name}{id:${info.idField || '-'},uniq:[${info.uniqueFields.join(',')}]${info.compositeUniques.length ? ',comp:' + info.compositeUniques.length : ''}}`)
      .join(' ');
    diag.info(`prisma-uniques: ${Object.keys(models).length} models — ${summary || '(none)'}`);
  }

  return {
    models,
    source: path.relative(projectDir, schemaFile),
  };
}

module.exports = {
  detectPrismaUniques,
  // Exported for unit tests.
  stripComments,
  extractModelBlocks,
  parseModelBody,
};
