#!/usr/bin/env node
// Validates the emitted OpenAPI dump for two structural defects that
// would otherwise be swallowed by NestJS Swagger and surface as
// confusing probe failures hours later:
//
//   1. OPENAPI_OPERATION_EMPTY — a `paths.<path>.<verb>` entry is the
//      empty object `{}`. NestJS Swagger emits this when an operation's
//      decorator chain references a `$ref` that cannot be resolved at
//      document-build time. The endpoint exists but advertises no body,
//      no params, no responses; the contract probe synthesises an empty
//      request body and the server returns a 400 that cascades through
//      every chain step that depends on the resource.
//
//   2. OPENAPI_REF_DANGLING — any `$ref: '#/components/schemas/<X>'`
//      where `<X>` is not registered in `components.schemas`. Caused by
//      hand-written `$ref` strings in `@ApiBody`/`@ApiResponse` paired
//      with a forgotten `zodToOpenApi(schema, { ref })` registration
//      (or the `zodApiBody()` helper which pairs them automatically).
//
// Exits non-zero with a diagnostic per failure. Wired before
// `probe:smoke` so the contract probe never runs against a structurally
// broken contract.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { argv, exit } from 'node:process';

const HTTP_VERBS = new Set([
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'head',
  'options',
  'trace',
]);

const dumpPath = resolve(argv[2] ?? 'apps/api/.openapi.json');

let doc;
try {
  doc = JSON.parse(readFileSync(dumpPath, 'utf8'));
} catch (err) {
  console.error(`[openapi-check] cannot read ${dumpPath}: ${err.message}`);
  exit(2);
}

const errors = [];
const schemas = (doc && doc.components && doc.components.schemas) || {};
const schemaNames = new Set(Object.keys(schemas));

// 1. empty operations
const paths = (doc && doc.paths) || {};
for (const [pathKey, methods] of Object.entries(paths)) {
  if (!methods || typeof methods !== 'object') continue;
  for (const [verb, op] of Object.entries(methods)) {
    if (!HTTP_VERBS.has(verb)) continue;
    if (!op || (typeof op === 'object' && Object.keys(op).length === 0)) {
      errors.push(
        `OPENAPI_OPERATION_EMPTY: ${verb.toUpperCase()} ${pathKey} — operation body is empty {}; usually a dangling $ref in the decorator chain caused NestJS Swagger to skip it`,
      );
    }
  }
}

// 2. dangling refs (walk the whole document)
function walk(node, where) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach((entry, index) => walk(entry, `${where}[${index}]`));
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === '$ref' && typeof value === 'string') {
      const match = value.match(/^#\/components\/schemas\/(.+)$/);
      if (!match) {
        errors.push(
          `OPENAPI_REF_UNSUPPORTED: ${value} at ${where} — only #/components/schemas/<Name> refs are validated`,
        );
      } else if (!schemaNames.has(match[1])) {
        errors.push(
          `OPENAPI_REF_DANGLING: ${value} at ${where} — schema "${match[1]}" not registered in components.schemas (forgot zodToOpenApi(schema, { ref: '${match[1]}' }) or use the zodApiBody helper)`,
        );
      }
      // do not descend into the $ref entry's siblings — a $ref node may
      // legitimately have title/description per OpenAPI 3.1.
    } else {
      walk(value, where ? `${where}.${key}` : key);
    }
  }
}

walk(doc, '');

if (errors.length > 0) {
  console.error(`[openapi-check] FAILED — ${errors.length} structural defect(s) in ${dumpPath}`);
  for (const error of errors) console.error(`  - ${error}`);
  exit(1);
}

console.log(`[openapi-check] ok — ${dumpPath} (${schemaNames.size} schemas, ${Object.keys(paths).length} paths)`);
