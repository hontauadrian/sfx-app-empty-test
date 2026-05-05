#!/usr/bin/env node
/**
 * Unit tests for lib/test-pairing.js
 *
 * Run: node .overstory/claude-profiles/builder/hooks/__tests__/test-pairing.test.js
 */
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  needsTest,
  findTestFile,
  deriveSourceFromTest,
} = require('../lib/test-pairing');

// ─── needsTest ──────────────────────────────────────────────────────
test('needsTest: true for apps/* source .ts', () => {
  assert.equal(needsTest('apps/web/src/features/auth/use-login.ts'), true);
  assert.equal(needsTest('apps/web/src/components/button.tsx'), true);
  assert.equal(needsTest('apps/api/src/modules/user/user.service.ts'), true);
});

test('needsTest: true for packages/* source', () => {
  assert.equal(needsTest('packages/domain/src/entities/user.ts'), true);
});

test('needsTest: false for test files themselves', () => {
  assert.equal(needsTest('apps/web/src/foo.test.ts'), false);
  assert.equal(needsTest('apps/web/src/foo.spec.ts'), false);
  assert.equal(needsTest('apps/web/src/__tests__/foo.ts'), false);
  assert.equal(needsTest('apps/web/src/__integration__/foo.ts'), false);
  assert.equal(needsTest('apps/api/src/foo.integration-test.ts'), false);
});

test('needsTest: false for barrel exports', () => {
  assert.equal(needsTest('apps/web/src/features/auth/index.ts'), false);
  assert.equal(needsTest('packages/domain/src/index.ts'), false);
  assert.equal(needsTest('apps/web/src/components/index.tsx'), false);
});

test('needsTest: false for type/constants files', () => {
  assert.equal(needsTest('apps/web/src/features/auth/types.ts'), false);
  assert.equal(needsTest('apps/web/src/constants.ts'), false);
});

test('needsTest: false for config files', () => {
  assert.equal(needsTest('apps/web/jest.config.ts'), false);
  assert.equal(needsTest('apps/web/next.config.js'), false);
  assert.equal(needsTest('tailwind.config.ts'), false);
  assert.equal(needsTest('eslint.config.mjs'), false);
});

test('needsTest: false for .d.ts declarations', () => {
  assert.equal(needsTest('apps/web/src/types/global.d.ts'), false);
});

test('needsTest: false for middleware.ts (Next.js)', () => {
  assert.equal(needsTest('apps/web/src/middleware.ts'), false);
});

test('needsTest: false for files outside apps|packages|src', () => {
  assert.equal(needsTest('docs/guide.ts'), false);
  assert.equal(needsTest('scripts/build.ts'), false);
  assert.equal(needsTest('.claude/hooks/foo.js'), false);
  assert.equal(needsTest('.overstory/anything.ts'), false);
});

test('needsTest: false for non-source extensions', () => {
  assert.equal(needsTest('apps/web/src/foo.md'), false);
  assert.equal(needsTest('apps/web/src/foo.json'), false);
  assert.equal(needsTest('apps/web/src/foo.css'), false);
});

test('needsTest: false for empty/garbage input', () => {
  assert.equal(needsTest(''), false);
  assert.equal(needsTest(null), false);
  assert.equal(needsTest(undefined), false);
  assert.equal(needsTest(42), false);
});

test('needsTest: false for node_modules', () => {
  assert.equal(needsTest('apps/web/node_modules/foo/index.ts'), false);
});

// ─── findTestFile ───────────────────────────────────────────────────
function makeProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-pairing-'));
  return dir;
}

test('findTestFile: finds same-dir .test.ts', () => {
  const root = makeProject();
  const dir = path.join(root, 'apps/web/src');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'foo.ts'), '');
  fs.writeFileSync(path.join(dir, 'foo.test.ts'), '');

  const result = findTestFile('apps/web/src/foo.ts', root);
  assert.equal(result.found, true);
  assert.ok(result.matchedPath.endsWith('foo.test.ts'));
});

test('findTestFile: finds __tests__/ sibling dir', () => {
  const root = makeProject();
  const dir = path.join(root, 'apps/web/src');
  fs.mkdirSync(path.join(dir, '__tests__'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'bar.tsx'), '');
  fs.writeFileSync(path.join(dir, '__tests__', 'bar.test.tsx'), '');

  const result = findTestFile('apps/web/src/bar.tsx', root);
  assert.equal(result.found, true);
  assert.ok(result.matchedPath.includes('__tests__'));
});

test('findTestFile: finds parent __tests__/ dir', () => {
  const root = makeProject();
  const parent = path.join(root, 'packages/domain/src/models');
  fs.mkdirSync(parent, { recursive: true });
  fs.mkdirSync(path.join(parent, '..', '__tests__'), { recursive: true });
  fs.writeFileSync(path.join(parent, 'user.ts'), '');
  fs.writeFileSync(path.join(parent, '..', '__tests__', 'user.test.ts'), '');

  const result = findTestFile('packages/domain/src/models/user.ts', root);
  assert.equal(result.found, true);
});

test('findTestFile: returns found=false when no test exists', () => {
  const root = makeProject();
  const dir = path.join(root, 'apps/web/src');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'orphan.ts'), '');

  const result = findTestFile('apps/web/src/orphan.ts', root);
  assert.equal(result.found, false);
  assert.equal(result.matchedPath, null);
});

test('findTestFile: accepts absolute path', () => {
  const root = makeProject();
  const dir = path.join(root, 'apps/web/src');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'x.ts'), '');
  fs.writeFileSync(path.join(dir, 'x.test.ts'), '');

  const result = findTestFile(path.join(dir, 'x.ts'), root);
  assert.equal(result.found, true);
});

// ─── deriveSourceFromTest ───────────────────────────────────────────
test('deriveSourceFromTest: same-dir test', () => {
  const candidates = deriveSourceFromTest('apps/web/src/foo.test.ts');
  assert.ok(candidates.some(c => c === path.normalize('apps/web/src/foo.ts')));
  assert.ok(candidates.some(c => c === path.normalize('apps/web/src/foo.tsx')));
});

test('deriveSourceFromTest: __tests__/ subdir → parent dir', () => {
  const candidates = deriveSourceFromTest('apps/web/src/__tests__/bar.test.tsx');
  assert.ok(candidates.some(c => c === path.normalize('apps/web/src/bar.tsx')));
  assert.ok(candidates.some(c => c === path.normalize('apps/web/src/bar.ts')));
});

test('deriveSourceFromTest: __integration__/ subdir', () => {
  const candidates = deriveSourceFromTest('apps/api/src/__integration__/auth.test.ts');
  assert.ok(candidates.some(c => c === path.normalize('apps/api/src/auth.ts')));
});

test('deriveSourceFromTest: .spec. suffix', () => {
  const candidates = deriveSourceFromTest('apps/web/src/component.spec.tsx');
  assert.ok(candidates.some(c => c === path.normalize('apps/web/src/component.tsx')));
});

test('deriveSourceFromTest: .integration-test. suffix', () => {
  const candidates = deriveSourceFromTest('apps/api/src/user.integration-test.ts');
  assert.ok(candidates.some(c => c === path.normalize('apps/api/src/user.ts')));
});

test('deriveSourceFromTest: empty/garbage returns []', () => {
  assert.deepEqual(deriveSourceFromTest(''), []);
  assert.deepEqual(deriveSourceFromTest(null), []);
  assert.deepEqual(deriveSourceFromTest(undefined), []);
});
