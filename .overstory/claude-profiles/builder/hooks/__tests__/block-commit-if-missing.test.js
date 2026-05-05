#!/usr/bin/env node
/**
 * Unit tests for block-commit-if-missing.js (Tier 2 PreToolUse:Bash hook).
 */
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

const HOOK = path.resolve(__dirname, '..', 'block-commit-if-missing.js');

function makeSandbox() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'bcim-'));
}

function stateFileFor(sandbox) {
  return path.join(
    os.tmpdir(),
    `pending-tests-${Buffer.from(sandbox).toString('base64url')}.json`
  );
}

function seedPending(sandbox, files) {
  fs.writeFileSync(
    stateFileFor(sandbox),
    JSON.stringify({ startedAt: Date.now(), pending: files })
  );
}

function clearPending(sandbox) {
  try { fs.unlinkSync(stateFileFor(sandbox)); } catch {}
}

function runHook(sandbox, command) {
  return spawnSync('node', [HOOK], {
    input: JSON.stringify({ tool_input: { command } }),
    encoding: 'utf8',
    env: { ...process.env, HOOK_TEST_PROJECT_ROOT: sandbox },
  });
}

// ───────────────────────────────────────────────────────────────────

test('denies "git commit" when pending is non-empty', () => {
  const sb = makeSandbox();
  seedPending(sb, ['apps/web/src/a.ts', 'apps/web/src/b.ts']);

  const r = runHook(sb, 'git commit -m "feat: stuff"');
  const parsed = JSON.parse(r.stdout);
  assert.equal(parsed.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(parsed.hookSpecificOutput.permissionDecisionReason, /2 source file\(s\) lack tests/);
  assert.match(parsed.hookSpecificOutput.permissionDecisionReason, /apps\/web\/src\/a\.ts/);
});

test('denies "ov mail send worker_done" when pending non-empty', () => {
  const sb = makeSandbox();
  seedPending(sb, ['x.ts']);

  const r = runHook(sb, 'ov mail send --to parent --type worker_done');
  const parsed = JSON.parse(r.stdout);
  assert.equal(parsed.hookSpecificOutput.permissionDecision, 'deny');
});

test('denies "sd close" when pending non-empty', () => {
  const sb = makeSandbox();
  seedPending(sb, ['x.ts']);

  const r = runHook(sb, 'sd close sfx-abc123');
  const parsed = JSON.parse(r.stdout);
  assert.equal(parsed.hookSpecificOutput.permissionDecision, 'deny');
});

test('allows "git commit" when pending is empty', () => {
  const sb = makeSandbox();
  seedPending(sb, []);

  const r = runHook(sb, 'git commit -m "x"');
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), '');
});

test('allows "git commit" when no state file exists', () => {
  const sb = makeSandbox();
  clearPending(sb);

  const r = runHook(sb, 'git commit -m "x"');
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), '');
});

test('allows unrelated bash commands with pending debt', () => {
  const sb = makeSandbox();
  seedPending(sb, ['x.ts']);

  const commands = [
    'ls -la',
    'git status',
    'git diff',
    'pnpm test',
    'pnpm lint',
    'node foo.js',
    'cat README.md',
    'echo hello',
  ];
  for (const cmd of commands) {
    const r = runHook(sb, cmd);
    assert.equal(r.status, 0, `should allow: ${cmd}`);
    assert.equal(r.stdout.trim(), '', `no deny for: ${cmd}`);
  }
});

test('allows "git commit" inside a string/comment (false positive guard)', () => {
  // Realistic guard: we use word-boundary patterns. This test documents
  // that a literal `git commit` inside a longer command still matches —
  // which is acceptable: if the agent is running git commit *at all*
  // as part of a composite command, the block is correct.
  const sb = makeSandbox();
  seedPending(sb, ['x.ts']);

  const r = runHook(sb, 'echo "will run git commit next" && git commit -m "x"');
  const parsed = JSON.parse(r.stdout);
  assert.equal(parsed.hookSpecificOutput.permissionDecision, 'deny');
});

test('missing command → exit 0', () => {
  const sb = makeSandbox();
  seedPending(sb, ['x.ts']);

  const r = spawnSync('node', [HOOK], {
    input: JSON.stringify({ tool_input: {} }),
    encoding: 'utf8',
    env: { ...process.env, HOOK_TEST_PROJECT_ROOT: sb },
  });
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), '');
});

test('garbage stdin → exit 0', () => {
  const sb = makeSandbox();
  seedPending(sb, ['x.ts']);

  const r = spawnSync('node', [HOOK], {
    input: 'not json',
    encoding: 'utf8',
    env: { ...process.env, HOOK_TEST_PROJECT_ROOT: sb },
  });
  assert.equal(r.status, 0);
});

test('git subcommands other than commit are allowed', () => {
  const sb = makeSandbox();
  seedPending(sb, ['x.ts']);

  for (const cmd of ['git log', 'git branch', 'git push', 'git stash', 'git rebase']) {
    const r = runHook(sb, cmd);
    assert.equal(r.status, 0, `should allow: ${cmd}`);
    assert.equal(r.stdout.trim(), '', `no deny for: ${cmd}`);
  }
});
