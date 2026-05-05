#!/usr/bin/env node
/**
 * Unit tests for track-pending-tests.js (Tier 1 PreToolUse hook).
 * Run: node .overstory/claude-profiles/builder/hooks/__tests__/track-pending-tests.test.js
 */
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

const HOOK = path.resolve(__dirname, '..', 'track-pending-tests.js');

function makeSandbox() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tpt-'));
}

function runHook(sandbox, toolInput) {
  const r = spawnSync('node', [HOOK], {
    input: JSON.stringify(toolInput),
    encoding: 'utf8',
    env: { ...process.env, HOOK_TEST_PROJECT_ROOT: sandbox },
  });
  return r;
}

function stateFileFor(sandbox) {
  return path.join(
    os.tmpdir(),
    `pending-tests-${Buffer.from(sandbox).toString('base64url')}.json`
  );
}

function readState(sandbox) {
  try {
    return JSON.parse(fs.readFileSync(stateFileFor(sandbox), 'utf8'));
  } catch {
    return null;
  }
}

function resetState(sandbox) {
  try { fs.unlinkSync(stateFileFor(sandbox)); } catch {}
}

// ───────────────────────────────────────────────────────────────────

test('adds unpaired source file to pending set', () => {
  const sb = makeSandbox();
  resetState(sb);
  fs.mkdirSync(path.join(sb, 'apps/web/src'), { recursive: true });
  const file = path.join(sb, 'apps/web/src/orphan.ts');
  fs.writeFileSync(file, '');

  const r = runHook(sb, { tool_input: { file_path: file } });
  assert.equal(r.status, 0);
  const state = readState(sb);
  assert.ok(state.pending.includes('apps/web/src/orphan.ts'));
});

test('does NOT add source file that already has a test pair', () => {
  const sb = makeSandbox();
  resetState(sb);
  const dir = path.join(sb, 'apps/web/src');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'paired.ts'), '');
  fs.writeFileSync(path.join(dir, 'paired.test.ts'), '');

  runHook(sb, { tool_input: { file_path: path.join(dir, 'paired.ts') } });
  const state = readState(sb);
  assert.ok(!state || !(state.pending || []).includes('apps/web/src/paired.ts'));
});

test('ignores barrel exports and config files', () => {
  const sb = makeSandbox();
  resetState(sb);
  const dir = path.join(sb, 'apps/web/src');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.ts'), '');
  fs.writeFileSync(path.join(sb, 'next.config.js'), '');

  runHook(sb, { tool_input: { file_path: path.join(dir, 'index.ts') } });
  runHook(sb, { tool_input: { file_path: path.join(sb, 'next.config.js') } });
  const state = readState(sb);
  assert.ok(!state || (state.pending || []).length === 0);
});

test('writing a test clears matching source from pending', () => {
  const sb = makeSandbox();
  resetState(sb);
  const dir = path.join(sb, 'apps/web/src');
  fs.mkdirSync(dir, { recursive: true });
  const src = path.join(dir, 'thing.ts');
  fs.writeFileSync(src, '');

  // Source first — enters pending
  runHook(sb, { tool_input: { file_path: src } });
  assert.ok(readState(sb).pending.includes('apps/web/src/thing.ts'));

  // Then test — clears it
  const testFile = path.join(dir, 'thing.test.ts');
  fs.writeFileSync(testFile, '');
  runHook(sb, { tool_input: { file_path: testFile } });
  assert.ok(!readState(sb).pending.includes('apps/web/src/thing.ts'));
});

test('__tests__/foo.test.ts clears parent-dir foo.ts', () => {
  const sb = makeSandbox();
  resetState(sb);
  const dir = path.join(sb, 'apps/web/src');
  fs.mkdirSync(path.join(dir, '__tests__'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'child.tsx'), '');

  runHook(sb, { tool_input: { file_path: path.join(dir, 'child.tsx') } });
  assert.ok(readState(sb).pending.includes('apps/web/src/child.tsx'));

  const testFile = path.join(dir, '__tests__', 'child.test.tsx');
  fs.writeFileSync(testFile, '');
  runHook(sb, { tool_input: { file_path: testFile } });
  assert.ok(!readState(sb).pending.includes('apps/web/src/child.tsx'));
});

test('does NOT emit nudge below threshold', () => {
  const sb = makeSandbox();
  resetState(sb);
  const dir = path.join(sb, 'apps/web/src');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'a.ts'), '');
  fs.writeFileSync(path.join(dir, 'b.ts'), '');

  runHook(sb, { tool_input: { file_path: path.join(dir, 'a.ts') } });
  const r = runHook(sb, { tool_input: { file_path: path.join(dir, 'b.ts') } });
  assert.equal(r.stdout.trim(), ''); // 2 pending — below threshold of 3
});

test('emits nudge at threshold (≥3 pending)', () => {
  const sb = makeSandbox();
  resetState(sb);
  const dir = path.join(sb, 'apps/web/src');
  fs.mkdirSync(dir, { recursive: true });
  ['a.ts', 'b.ts', 'c.ts'].forEach((f) => fs.writeFileSync(path.join(dir, f), ''));

  runHook(sb, { tool_input: { file_path: path.join(dir, 'a.ts') } });
  runHook(sb, { tool_input: { file_path: path.join(dir, 'b.ts') } });
  const r = runHook(sb, { tool_input: { file_path: path.join(dir, 'c.ts') } });

  const parsed = JSON.parse(r.stdout);
  assert.equal(parsed.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.match(parsed.hookSpecificOutput.additionalContext, /3 source files lack tests/);
  assert.match(parsed.hookSpecificOutput.additionalContext, /apps\/web\/src\/a\.ts/);
});

test('always exits 0 (never blocks a Write)', () => {
  const sb = makeSandbox();
  resetState(sb);
  const dir = path.join(sb, 'apps/web/src');
  fs.mkdirSync(dir, { recursive: true });
  ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts'].forEach((f) =>
    fs.writeFileSync(path.join(dir, f), '')
  );

  for (const f of ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts']) {
    const r = runHook(sb, { tool_input: { file_path: path.join(dir, f) } });
    assert.equal(r.status, 0, `exit 0 for ${f}`);
  }
});

test('missing file_path → exit 0, no state change', () => {
  const sb = makeSandbox();
  resetState(sb);
  const r = runHook(sb, { tool_input: {} });
  assert.equal(r.status, 0);
  assert.equal(readState(sb), null);
});

test('garbage stdin → exit 0', () => {
  const sb = makeSandbox();
  resetState(sb);
  const r = spawnSync('node', [HOOK], {
    input: 'not json',
    encoding: 'utf8',
    env: { ...process.env, HOOK_TEST_PROJECT_ROOT: sb },
  });
  assert.equal(r.status, 0);
});

test('--dump flag prints current state', () => {
  const sb = makeSandbox();
  resetState(sb);
  fs.mkdirSync(path.join(sb, 'apps/web/src'), { recursive: true });
  fs.writeFileSync(path.join(sb, 'apps/web/src/x.ts'), '');
  runHook(sb, { tool_input: { file_path: path.join(sb, 'apps/web/src/x.ts') } });

  const r = spawnSync('node', [HOOK, '--dump'], {
    encoding: 'utf8',
    env: { ...process.env, HOOK_TEST_PROJECT_ROOT: sb },
  });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /apps\/web\/src\/x\.ts/);
  assert.match(r.stdout, /State file:/);
});

test('state file session expiry — resets after MAX_AGE_MS', () => {
  const sb = makeSandbox();
  // Manually seed old state
  fs.writeFileSync(
    stateFileFor(sb),
    JSON.stringify({ startedAt: Date.now() - 3 * 60 * 60 * 1000, pending: ['old.ts'] })
  );
  fs.mkdirSync(path.join(sb, 'apps/web/src'), { recursive: true });
  fs.writeFileSync(path.join(sb, 'apps/web/src/fresh.ts'), '');
  runHook(sb, { tool_input: { file_path: path.join(sb, 'apps/web/src/fresh.ts') } });

  const state = readState(sb);
  assert.ok(!state.pending.includes('old.ts'));
  assert.ok(state.pending.includes('apps/web/src/fresh.ts'));
});
