#!/usr/bin/env tsx
/**
 * Fixture-driven test runner for zod-introspect.
 *
 * Each fixture directory contains:
 *   - input.ts         — Zod schema source (NOT a real import — just source text)
 *   - expected.json    — Expected SchemaContract output
 *   - meta.json        — { "symbolName": "Foo" } (which export to introspect)
 *
 * Usage:
 *   npx tsx .overstory/claude-profiles/builder/hooks/__tests__/zod-introspect/run-zod-introspect-tests.ts
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { zodIntrospectSource, SchemaContract } from '../../probes/lib/zod-introspect';

const FIXTURES_DIR = join(__dirname, 'fixtures');

interface Meta {
  symbolName: string;
  schemaPath?: string;
}

let passed = 0;
let failed = 0;
const failures: string[] = [];

function deepEqual(a: unknown, b: unknown, path = ''): string[] {
  const diffs: string[] = [];

  if (a === b) return diffs;
  if (a === undefined && b === undefined) return diffs;
  if (a === null && b === null) return diffs;

  if (typeof a !== typeof b) {
    diffs.push(`${path}: type mismatch — got ${typeof a}, expected ${typeof b}`);
    return diffs;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      diffs.push(`${path}: array length mismatch — got ${a.length}, expected ${b.length}`);
    }
    const maxLen = Math.max(a.length, b.length);
    for (let i = 0; i < maxLen; i++) {
      diffs.push(...deepEqual(a[i], b[i], `${path}[${i}]`));
    }
    return diffs;
  }

  if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const allKeys = new Set([...Object.keys(aObj), ...Object.keys(bObj)]);
    for (const key of allKeys) {
      if (!(key in aObj)) {
        diffs.push(`${path}.${key}: missing in actual`);
      } else if (!(key in bObj)) {
        diffs.push(`${path}.${key}: unexpected in actual`);
      } else {
        diffs.push(...deepEqual(aObj[key], bObj[key], `${path}.${key}`));
      }
    }
    return diffs;
  }

  if (a !== b) {
    diffs.push(`${path}: value mismatch — got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`);
  }

  return diffs;
}

function runFixture(fixtureName: string): void {
  const fixtureDir = join(FIXTURES_DIR, fixtureName);

  const metaPath = join(fixtureDir, 'meta.json');
  const inputPath = join(fixtureDir, 'input.ts');
  const expectedPath = join(fixtureDir, 'expected.json');

  if (!existsSync(metaPath) || !existsSync(inputPath) || !existsSync(expectedPath)) {
    console.log(`  SKIP ${fixtureName} (missing files)`);
    return;
  }

  const meta: Meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
  const inputSource = readFileSync(inputPath, 'utf-8');
  const expected: SchemaContract = JSON.parse(readFileSync(expectedPath, 'utf-8'));

  const schemaPath = meta.schemaPath ?? `fixtures/${fixtureName}/input.ts`;
  const actual = zodIntrospectSource(inputSource, schemaPath, meta.symbolName);

  const diffs = deepEqual(actual, expected);

  if (diffs.length === 0) {
    console.log(`  PASS ${fixtureName}`);
    passed++;
  } else {
    console.log(`  FAIL ${fixtureName}`);
    for (const diff of diffs.slice(0, 10)) {
      console.log(`    ${diff}`);
    }
    if (diffs.length > 10) {
      console.log(`    ... and ${diffs.length - 10} more diffs`);
    }
    failed++;
    failures.push(fixtureName);
  }
}

// Also test against real repo schemas
function runRealSchemaTest(schemaPath: string, symbolName: string): void {
  const label = `real:${basename(schemaPath)}:${symbolName}`;
  try {
    const source = readFileSync(schemaPath, 'utf-8');
    const result = zodIntrospectSource(source, schemaPath, symbolName);

    // Verify determinism — run twice and compare
    const result2 = zodIntrospectSource(source, schemaPath, symbolName);
    const json1 = JSON.stringify(result);
    const json2 = JSON.stringify(result2);

    if (json1 !== json2) {
      console.log(`  FAIL ${label} — non-deterministic output`);
      failed++;
      failures.push(label);
      return;
    }

    // Basic sanity checks
    if (!result.schemaRef) {
      console.log(`  FAIL ${label} — missing schemaRef`);
      failed++;
      failures.push(label);
      return;
    }
    if (result.fields.length === 0 && !result.diagnostics?.length) {
      console.log(`  FAIL ${label} — no fields and no diagnostics`);
      failed++;
      failures.push(label);
      return;
    }

    // Every required field should have at least a 'missing' invalidator
    for (const field of result.fields) {
      if (field.required && field.type !== 'object') {
        const hasMissing = field.samples.invalidators.some((inv) => inv.kind === 'missing');
        if (!hasMissing) {
          console.log(`  FAIL ${label} — field '${field.name}' is required but has no 'missing' invalidator`);
          failed++;
          failures.push(label);
          return;
        }
      }
    }

    console.log(`  PASS ${label} (${result.fields.length} fields)`);
    passed++;
  } catch (err) {
    console.log(`  FAIL ${label} — ${(err as Error).message}`);
    failed++;
    failures.push(label);
  }
}

// Main
console.log('zod-introspect fixture tests\n');

// Run fixture tests
const fixtureDirs = readdirSync(FIXTURES_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

console.log(`Fixtures (${fixtureDirs.length}):`);
for (const dir of fixtureDirs) {
  runFixture(dir);
}

// Run real schema tests
console.log('\nReal schema determinism + sanity checks:');
const repoRoot = join(__dirname, '..', '..', '..', '..', '..', '..');
const realSchemas: Array<{ path: string; symbols: string[] }> = [
  {
    path: join(repoRoot, 'packages/validation/src/schemas/user.schema.ts'),
    symbols: ['createUserSchema', 'loginSchema'],
  },
  {
    path: join(repoRoot, 'packages/validation/src/schemas/common.schema.ts'),
    symbols: ['paginationSchema', 'idParamSchema'],
  },
];

for (const schema of realSchemas) {
  if (!existsSync(schema.path)) {
    console.log(`  SKIP ${schema.path} (not found)`);
    continue;
  }
  for (const sym of schema.symbols) {
    runRealSchemaTest(schema.path, sym);
  }
}

// Summary
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log(`\nFailed:`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
