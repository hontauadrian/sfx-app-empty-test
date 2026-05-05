#!/usr/bin/env node
/**
 * Unit tests for no-stop-builder-with-red-probes PreToolUse hook.
 *
 * - Stubs execSync for `git worktree list --porcelain`.
 * - Synthesizes `.http-smoke.json` artifacts in tmpdir-backed fake
 *   worktrees.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const hook = require('../no-stop-builder-with-red-probes.js');

function mkSandbox(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `nsbwrp-${name}-`));
}

function makeExecStub(worktrees) {
  return function execStub(cmd) {
    if (typeof cmd === 'string' && cmd.includes('git worktree list')) {
      const blocks = [];
      for (const [wt, ref] of Object.entries(worktrees)) {
        blocks.push([
          `worktree ${wt}`,
          'HEAD 0000000000000000000000000000000000000000',
          `branch ${ref}`,
        ].join('\n'));
      }
      return blocks.join('\n\n') + '\n';
    }
    throw new Error(`unexpected exec: ${cmd}`);
  };
}

function makeBuilderWorktree(sandbox, target, probe) {
  const wt = path.join(sandbox, '.overstory', 'worktrees', target);
  fs.mkdirSync(path.join(wt, '.claude', 'hooks'), { recursive: true });
  if (probe !== undefined) {
    const out = typeof probe === 'string' ? probe : JSON.stringify(probe);
    fs.writeFileSync(path.join(wt, '.claude', 'hooks', '.http-smoke.json'), out);
  }
  return wt;
}

function bashInput(command) {
  return JSON.stringify({ tool_name: 'Bash', tool_input: { command } });
}

function greenProbe() {
  return {
    version: '1',
    exitCode: 0,
    blockCodes: [],
    summary: { total: 5, passed: 5, failed: 0, skipped: 0 },
    cases: [
      { label: 'GET /', status: 200, passed: true },
      { label: 'GET /login', status: 200, passed: true },
      { label: 'GET /dashboard', status: 200, passed: true },
      { label: 'POST /api/login', status: 200, passed: true },
      { label: 'GET /api/health', status: 200, passed: true },
    ],
  };
}

function bootFailedProbe() {
  return {
    exitCode: 2,
    blockCodes: ['STACK_BOOT_FAILED'],
    blockReason: "STACK_BOOT_FAILED:api.state='down' for 61s",
    summary: { total: 0, passed: 0, failed: 0, skipped: 0 },
    cases: [],
  };
}

// ─────────────────────────────────────────────────────────────────────
// SECTION 1 — Pass-through cases
// ─────────────────────────────────────────────────────────────────────

test('non-Bash tool → allow', () => {
  const result = hook.runGuard({
    stdinRaw: JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: '/x' } }),
    cwd: mkSandbox('non-bash'),
    execSync: makeExecStub({}),
  });
  assert.equal(result.allow, true);
});

test('non-`ov stop` bash (ls -la) → allow', () => {
  const result = hook.runGuard({
    stdinRaw: bashInput('ls -la'),
    cwd: mkSandbox('ls'),
    execSync: makeExecStub({}),
  });
  assert.equal(result.allow, true);
});

test('ov stop scout-foo → allow (scout — not gated)', () => {
  const sandbox = mkSandbox('scout');
  // Even with a red probe staged, scouts aren't builder-like names.
  makeBuilderWorktree(sandbox, 'scout-foo', bootFailedProbe());
  const wt = path.join(sandbox, '.overstory', 'worktrees', 'scout-foo');
  const result = hook.runGuard({
    stdinRaw: bashInput('ov stop scout-foo'),
    cwd: sandbox,
    execSync: makeExecStub({ [wt]: 'refs/heads/overstory/scout-foo/x' }),
  });
  assert.equal(result.allow, true);
});

test('ov stop reviewer-foo → allow (reviewer — not gated)', () => {
  const sandbox = mkSandbox('reviewer');
  makeBuilderWorktree(sandbox, 'reviewer-foo', bootFailedProbe());
  const wt = path.join(sandbox, '.overstory', 'worktrees', 'reviewer-foo');
  const result = hook.runGuard({
    stdinRaw: bashInput('ov stop reviewer-foo'),
    cwd: sandbox,
    execSync: makeExecStub({ [wt]: 'refs/heads/overstory/reviewer-foo/x' }),
  });
  assert.equal(result.allow, true);
});

test('ov stop probe-runner-c3 → allow (helper — not gated)', () => {
  const sandbox = mkSandbox('probe-runner');
  makeBuilderWorktree(sandbox, 'probe-runner-c3', bootFailedProbe());
  const wt = path.join(sandbox, '.overstory', 'worktrees', 'probe-runner-c3');
  const result = hook.runGuard({
    stdinRaw: bashInput('ov stop probe-runner-c3'),
    cwd: sandbox,
    execSync: makeExecStub({ [wt]: 'refs/heads/overstory/probe-runner-c3/x' }),
  });
  assert.equal(result.allow, true);
});

test('ov stop --help → allow (flag, no real target)', () => {
  const result = hook.runGuard({
    stdinRaw: bashInput('ov stop --help'),
    cwd: mkSandbox('help'),
    execSync: makeExecStub({}),
  });
  assert.equal(result.allow, true);
});

test('ov stop --all → allow (sentinel, let ov handle)', () => {
  const result = hook.runGuard({
    stdinRaw: bashInput('ov stop --all'),
    cwd: mkSandbox('all'),
    execSync: makeExecStub({}),
  });
  assert.equal(result.allow, true);
});

test('ov stop builder-foo where worktree missing → allow (already cleaned)', () => {
  const sandbox = mkSandbox('no-wt');
  const result = hook.runGuard({
    stdinRaw: bashInput('ov stop builder-foo'),
    cwd: sandbox,
    execSync: makeExecStub({}),
  });
  assert.equal(result.allow, true);
});

// ─────────────────────────────────────────────────────────────────────
// SECTION 2 — Builder gating cases
// ─────────────────────────────────────────────────────────────────────

test('ov stop builder-foo with no probe artifact → DENY PROBE_NEVER_GREEN', () => {
  const sandbox = mkSandbox('never-green');
  const wt = path.join(sandbox, '.overstory', 'worktrees', 'builder-foo');
  fs.mkdirSync(wt, { recursive: true });
  const result = hook.runGuard({
    stdinRaw: bashInput('ov stop builder-foo'),
    cwd: sandbox,
    execSync: makeExecStub({ [wt]: 'refs/heads/overstory/builder-foo/x' }),
  });
  assert.equal(result.allow, false);
  assert.equal(result.code, 'PROBE_NEVER_GREEN');
});

test('ov stop builder-foo with corrupt JSON → DENY PROBE_ARTIFACT_CORRUPT', () => {
  const sandbox = mkSandbox('corrupt');
  const wt = makeBuilderWorktree(sandbox, 'builder-foo', '{not json');
  const result = hook.runGuard({
    stdinRaw: bashInput('ov stop builder-foo'),
    cwd: sandbox,
    execSync: makeExecStub({ [wt]: 'refs/heads/overstory/builder-foo/x' }),
  });
  assert.equal(result.allow, false);
  assert.equal(result.code, 'PROBE_ARTIFACT_CORRUPT');
});

test('ov stop builder-foo STACK_BOOT_FAILED (chunk3 repro) → DENY PROBE_BLOCKED', () => {
  const sandbox = mkSandbox('boot-failed');
  const wt = makeBuilderWorktree(sandbox, 'builder-foo', bootFailedProbe());
  const result = hook.runGuard({
    stdinRaw: bashInput('ov stop builder-foo'),
    cwd: sandbox,
    execSync: makeExecStub({ [wt]: 'refs/heads/overstory/builder-foo/x' }),
  });
  assert.equal(result.allow, false);
  assert.equal(result.code, 'PROBE_BLOCKED');
  assert.match(result.message, /STACK_BOOT_FAILED/);
});

test('ov stop builder-foo with failing cases → DENY PROBE_CASES_FAILED', () => {
  const sandbox = mkSandbox('failed');
  const wt = makeBuilderWorktree(sandbox, 'builder-foo', {
    exitCode: 0, blockCodes: [],
    summary: { total: 10, passed: 8, failed: 2, skipped: 0 },
    cases: [
      { label: 'GET /', status: 200, passed: true },
      { label: 'GET /b', status: 500, passed: false, blockReason: 'http_5xx' },
      { label: 'POST /c', status: 401, passed: false, blockReason: 'auth_required' },
      { label: 'GET /d', status: 200, passed: true },
      { label: 'GET /e', status: 200, passed: true },
      { label: 'GET /f', status: 200, passed: true },
      { label: 'GET /g', status: 200, passed: true },
      { label: 'GET /h', status: 200, passed: true },
      { label: 'GET /i', status: 200, passed: true },
      { label: 'GET /j', status: 200, passed: true },
    ],
  });
  const result = hook.runGuard({
    stdinRaw: bashInput('ov stop builder-foo'),
    cwd: sandbox,
    execSync: makeExecStub({ [wt]: 'refs/heads/overstory/builder-foo/x' }),
  });
  assert.equal(result.allow, false);
  assert.equal(result.code, 'PROBE_CASES_FAILED');
  assert.match(result.message, /GET \/b/);
  assert.match(result.message, /http_5xx/);
});

test('ov stop builder-foo with green probe → ALLOW', () => {
  const sandbox = mkSandbox('green');
  const wt = makeBuilderWorktree(sandbox, 'builder-foo', greenProbe());
  const result = hook.runGuard({
    stdinRaw: bashInput('ov stop builder-foo'),
    cwd: sandbox,
    execSync: makeExecStub({ [wt]: 'refs/heads/overstory/builder-foo/x' }),
  });
  assert.equal(result.allow, true);
});

test('ov stop builder-foo --clean-worktree → still extracts builder-foo, gate fires', () => {
  const sandbox = mkSandbox('clean-worktree');
  const wt = makeBuilderWorktree(sandbox, 'builder-foo', bootFailedProbe());
  const result = hook.runGuard({
    stdinRaw: bashInput('ov stop builder-foo --clean-worktree'),
    cwd: sandbox,
    execSync: makeExecStub({ [wt]: 'refs/heads/overstory/builder-foo/x' }),
  });
  assert.equal(result.allow, false);
  assert.equal(result.code, 'PROBE_BLOCKED');
});

test('ov stop b1-backend (chunk-style numeric prefix) → gated as builder', () => {
  const sandbox = mkSandbox('b1');
  const wt = makeBuilderWorktree(sandbox, 'b1-backend', bootFailedProbe());
  const result = hook.runGuard({
    stdinRaw: bashInput('ov stop b1-backend'),
    cwd: sandbox,
    execSync: makeExecStub({ [wt]: 'refs/heads/overstory/b1-backend/x' }),
  });
  assert.equal(result.allow, false);
  assert.equal(result.code, 'PROBE_BLOCKED');
});

test('ov stop merger-task-backend → gated (mergers also have probe expectations)', () => {
  const sandbox = mkSandbox('merger');
  const wt = makeBuilderWorktree(sandbox, 'merger-task-backend', bootFailedProbe());
  const result = hook.runGuard({
    stdinRaw: bashInput('ov stop merger-task-backend'),
    cwd: sandbox,
    execSync: makeExecStub({ [wt]: 'refs/heads/overstory/merger-task-backend/x' }),
  });
  assert.equal(result.allow, false);
  assert.equal(result.code, 'PROBE_BLOCKED');
});

// ─────────────────────────────────────────────────────────────────────
// SECTION 3 — Failsafe behaviour
// ─────────────────────────────────────────────────────────────────────

test('malformed stdin JSON → allow (fail-open)', () => {
  const result = hook.runGuard({
    stdinRaw: 'this is not json',
    cwd: mkSandbox('badjson'),
    execSync: makeExecStub({}),
  });
  assert.equal(result.allow, true);
});

test('execSync throwing on worktree list → allow (fail-open)', () => {
  const result = hook.runGuard({
    stdinRaw: bashInput('ov stop builder-foo'),
    cwd: mkSandbox('exec-throws'),
    execSync: () => { throw new Error('git not found'); },
  });
  assert.equal(result.allow, true);
});

// ─────────────────────────────────────────────────────────────────────
// SECTION 4 — Pure-helper coverage
// ─────────────────────────────────────────────────────────────────────

test('extractStopTarget: positive cases', () => {
  assert.equal(hook.extractStopTarget('ov stop builder-foo'), 'builder-foo');
  assert.equal(hook.extractStopTarget('ov stop builder-foo --clean-worktree'), 'builder-foo');
  assert.equal(hook.extractStopTarget('cd /x && ov stop builder-foo'), 'builder-foo');
});

test('extractStopTarget: negative cases', () => {
  assert.equal(hook.extractStopTarget(''), null);
  assert.equal(hook.extractStopTarget('ls'), null);
  assert.equal(hook.extractStopTarget('ov status'), null);
  assert.equal(hook.extractStopTarget('ov stop --help'), null);
  assert.equal(hook.extractStopTarget('ov stop --all'), null);
});

test('isBuilderLikeName: matches builders/mergers, rejects others', () => {
  assert.equal(hook.isBuilderLikeName('builder-foo'), true);
  assert.equal(hook.isBuilderLikeName('builder_foo'), true);
  assert.equal(hook.isBuilderLikeName('b1-backend'), true);
  assert.equal(hook.isBuilderLikeName('b12-x'), true);
  assert.equal(hook.isBuilderLikeName('merger-foo'), true);
  assert.equal(hook.isBuilderLikeName('scout-foo'), false);
  assert.equal(hook.isBuilderLikeName('reviewer-foo'), false);
  assert.equal(hook.isBuilderLikeName('probe-runner-c3'), false);
  assert.equal(hook.isBuilderLikeName('finisher-foo'), false);
  assert.equal(hook.isBuilderLikeName('fixer-foo'), false);
});
