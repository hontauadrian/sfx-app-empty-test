#!/usr/bin/env node
/**
 * Unit + end-to-end tests for no-merge-without-source-probes PreToolUse hook.
 *
 * - Unit: stubbed execSync, synthesized .http-smoke.json files in tmpdir.
 * - End-to-end: real git repos with multiple worktrees, real commits, real
 *   `git worktree list --porcelain` output. The hook is invoked exactly the
 *   way the agent host invokes it (subprocess, stdin JSON, parse stdout).
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const HOOK_PATH = path.resolve(__dirname, '..', 'no-merge-without-source-probes.js');
const hook = require('../no-merge-without-source-probes.js');

function mkSandbox(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `nmwsp-${name}-`));
}

function makeExecStub(worktrees, extras) {
  const e = extras || {};
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
    if (typeof cmd === 'string' && cmd.startsWith('git rev-parse --abbrev-ref HEAD')) {
      return (e.headBranch || 'main') + '\n';
    }
    if (typeof cmd === 'string' && cmd.startsWith('git log -1 --format=%ct')) {
      // Return a long-ago timestamp so staleness check passes by default.
      return e.commitEpoch || '1';
    }
    throw new Error(`unexpected exec: ${cmd}`);
  };
}

function makeWorktreeWithProbe(sandbox, name, probe, opts) {
  const wt = path.join(sandbox, name);
  fs.mkdirSync(path.join(wt, '.claude', 'hooks'), { recursive: true });
  if (probe !== undefined) {
    const out = typeof probe === 'string' ? probe : JSON.stringify(probe);
    const artifact = path.join(wt, '.claude', 'hooks', '.http-smoke.json');
    fs.writeFileSync(artifact, out);
    if (opts && opts.mtimeMs) {
      fs.utimesSync(artifact, opts.mtimeMs / 1000, opts.mtimeMs / 1000);
    }
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

function staleArtifact() {
  return {
    exitCode: 2,
    blockCodes: ['STACK_BOOT_FAILED'],
    blockReason: 'STACK_BOOT_FAILED:stack:boot stalled',
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

test('non-merge bash command → allow', () => {
  const result = hook.runGuard({
    stdinRaw: bashInput('ls -la'),
    cwd: mkSandbox('ls'),
    execSync: makeExecStub({}),
  });
  assert.equal(result.allow, true);
});

test('ov merge --dry-run → allow', () => {
  const result = hook.runGuard({
    stdinRaw: bashInput('ov merge --dry-run --branch overstory/builder-a/foo'),
    cwd: mkSandbox('dryrun'),
    execSync: makeExecStub({}),
  });
  assert.equal(result.allow, true);
});

test('git merge --abort → allow', () => {
  const result = hook.runGuard({
    stdinRaw: bashInput('git merge --abort'),
    cwd: mkSandbox('abort'),
    execSync: makeExecStub({}),
  });
  assert.equal(result.allow, true);
});

test('git merge main (canonical) → allow', () => {
  const result = hook.runGuard({
    stdinRaw: bashInput('git merge main'),
    cwd: mkSandbox('main'),
    execSync: makeExecStub({}),
  });
  assert.equal(result.allow, true);
});

test('git merge origin/main → allow', () => {
  const result = hook.runGuard({
    stdinRaw: bashInput('git merge origin/main'),
    cwd: mkSandbox('origin-main'),
    execSync: makeExecStub({}),
  });
  assert.equal(result.allow, true);
});

test('git pull (no args) → allow', () => {
  const result = hook.runGuard({
    stdinRaw: bashInput('git pull'),
    cwd: mkSandbox('pull-noargs'),
    execSync: makeExecStub({}),
  });
  assert.equal(result.allow, true);
});

test('git pull origin (remote only) → allow', () => {
  const result = hook.runGuard({
    stdinRaw: bashInput('git pull origin'),
    cwd: mkSandbox('pull-remote'),
    execSync: makeExecStub({}),
  });
  assert.equal(result.allow, true);
});

test('git pull origin main → allow', () => {
  const result = hook.runGuard({
    stdinRaw: bashInput('git pull origin main'),
    cwd: mkSandbox('pull-main'),
    execSync: makeExecStub({}),
  });
  assert.equal(result.allow, true);
});

test('git push origin main:main → allow (canonical to canonical)', () => {
  const result = hook.runGuard({
    stdinRaw: bashInput('git push origin main:main'),
    cwd: mkSandbox('push-canonical'),
    execSync: makeExecStub({}),
  });
  assert.equal(result.allow, true);
});

// ─────────────────────────────────────────────────────────────────────
// SECTION 2 — ov merge / git merge gates
// ─────────────────────────────────────────────────────────────────────

test('ov merge --branch X with no live worktree → DENY SOURCE_WORKTREE_NOT_FOUND', () => {
  const sandbox = mkSandbox('no-wt');
  const result = hook.runGuard({
    stdinRaw: bashInput('ov merge --branch overstory/builder-a/foo'),
    cwd: sandbox,
    execSync: makeExecStub({}),
  });
  assert.equal(result.allow, false);
  assert.equal(result.code, 'SOURCE_WORKTREE_NOT_FOUND');
  assert.match(result.message, /SOURCE_WORKTREE_NOT_FOUND/);
});

test('ov merge --branch X with worktree but no probe artifact → DENY PROBE_ARTIFACT_MISSING', () => {
  const sandbox = mkSandbox('no-probe');
  const wt = path.join(sandbox, 'wt-a');
  fs.mkdirSync(wt, { recursive: true });
  const result = hook.runGuard({
    stdinRaw: bashInput('ov merge --branch overstory/builder-a/foo'),
    cwd: sandbox,
    execSync: makeExecStub({ [wt]: 'refs/heads/overstory/builder-a/foo' }),
  });
  assert.equal(result.allow, false);
  assert.equal(result.code, 'PROBE_ARTIFACT_MISSING');
});

test('ov merge --branch X with corrupt JSON → DENY PROBE_ARTIFACT_CORRUPT', () => {
  const sandbox = mkSandbox('corrupt');
  const wt = makeWorktreeWithProbe(sandbox, 'wt-a', '{not json');
  const result = hook.runGuard({
    stdinRaw: bashInput('ov merge --branch overstory/builder-a/foo'),
    cwd: sandbox,
    execSync: makeExecStub({ [wt]: 'refs/heads/overstory/builder-a/foo' }),
  });
  assert.equal(result.allow, false);
  assert.equal(result.code, 'PROBE_ARTIFACT_CORRUPT');
});

test('STACK_BOOT_FAILED-style stale artifact → DENY PROBE_BLOCKED', () => {
  const sandbox = mkSandbox('stack-boot');
  const wt = makeWorktreeWithProbe(sandbox, 'wt-a', staleArtifact());
  const result = hook.runGuard({
    stdinRaw: bashInput('ov merge --branch overstory/builder-a/foo'),
    cwd: sandbox,
    execSync: makeExecStub({ [wt]: 'refs/heads/overstory/builder-a/foo' }),
  });
  assert.equal(result.allow, false);
  assert.equal(result.code, 'PROBE_BLOCKED');
  assert.match(result.message, /STACK_BOOT_FAILED/);
});

test('summary with failed cases → DENY PROBE_CASES_FAILED', () => {
  const sandbox = mkSandbox('failed');
  const wt = makeWorktreeWithProbe(sandbox, 'wt-a', {
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
    stdinRaw: bashInput('ov merge --branch overstory/builder-a/foo'),
    cwd: sandbox,
    execSync: makeExecStub({ [wt]: 'refs/heads/overstory/builder-a/foo' }),
  });
  assert.equal(result.allow, false);
  assert.equal(result.code, 'PROBE_CASES_FAILED');
  assert.match(result.message, /GET \/b/);
  assert.match(result.message, /http_5xx/);
});

test('summary.total = 0 → DENY PROBE_NO_CASES', () => {
  const sandbox = mkSandbox('zero');
  const wt = makeWorktreeWithProbe(sandbox, 'wt-a', {
    exitCode: 0, blockCodes: [],
    summary: { total: 0, passed: 0, failed: 0, skipped: 0 },
    cases: [],
  });
  const result = hook.runGuard({
    stdinRaw: bashInput('ov merge --branch overstory/builder-a/foo'),
    cwd: sandbox,
    execSync: makeExecStub({ [wt]: 'refs/heads/overstory/builder-a/foo' }),
  });
  assert.equal(result.allow, false);
  assert.equal(result.code, 'PROBE_NO_CASES');
});

test('all-skipped probe → DENY PROBE_ALL_SKIPPED', () => {
  const sandbox = mkSandbox('skipped');
  const wt = makeWorktreeWithProbe(sandbox, 'wt-a', {
    exitCode: 0, blockCodes: [],
    summary: { total: 5, passed: 0, failed: 0, skipped: 5 },
    cases: [
      { label: 'GET /', skipped: true },
      { label: 'GET /a', skipped: true },
      { label: 'GET /b', skipped: true },
      { label: 'GET /c', skipped: true },
      { label: 'GET /d', skipped: true },
    ],
  });
  const result = hook.runGuard({
    stdinRaw: bashInput('ov merge --branch overstory/builder-a/foo'),
    cwd: sandbox,
    execSync: makeExecStub({ [wt]: 'refs/heads/overstory/builder-a/foo' }),
  });
  assert.equal(result.allow, false);
  assert.equal(result.code, 'PROBE_ALL_SKIPPED');
});

test('green probe → allow', () => {
  const sandbox = mkSandbox('green');
  const wt = makeWorktreeWithProbe(sandbox, 'wt-a', greenProbe());
  const result = hook.runGuard({
    stdinRaw: bashInput('ov merge --branch overstory/builder-a/foo'),
    cwd: sandbox,
    execSync: makeExecStub({ [wt]: 'refs/heads/overstory/builder-a/foo' }),
  });
  assert.equal(result.allow, true);
});

// ─────────────────────────────────────────────────────────────────────
// SECTION 3 — Branch parsing variations
// ─────────────────────────────────────────────────────────────────────

test('ov merge --branch=X (equals form) → branch parsed', () => {
  const sandbox = mkSandbox('equals');
  const wt = makeWorktreeWithProbe(sandbox, 'wt-a', greenProbe());
  const result = hook.runGuard({
    stdinRaw: bashInput('ov merge --branch=overstory/builder-a/foo'),
    cwd: sandbox,
    execSync: makeExecStub({ [wt]: 'refs/heads/overstory/builder-a/foo' }),
  });
  assert.equal(result.allow, true);
});

test('ov merge X (positional) → branch parsed', () => {
  const sandbox = mkSandbox('positional');
  const wt = makeWorktreeWithProbe(sandbox, 'wt-a', greenProbe());
  const result = hook.runGuard({
    stdinRaw: bashInput('ov merge overstory/builder-a/foo'),
    cwd: sandbox,
    execSync: makeExecStub({ [wt]: 'refs/heads/overstory/builder-a/foo' }),
  });
  assert.equal(result.allow, true);
});

test('git merge --no-ff <builder-branch> → gated (red)', () => {
  const sandbox = mkSandbox('no-ff');
  const wt = makeWorktreeWithProbe(sandbox, 'wt-a', staleArtifact());
  const result = hook.runGuard({
    stdinRaw: bashInput('git merge --no-ff overstory/builder-a/foo'),
    cwd: sandbox,
    execSync: makeExecStub({ [wt]: 'refs/heads/overstory/builder-a/foo' }),
  });
  assert.equal(result.allow, false);
  assert.equal(result.code, 'PROBE_BLOCKED');
});

// ─────────────────────────────────────────────────────────────────────
// SECTION 4 — Bypass via git pull / git push / git cherry-pick / etc.
// ─────────────────────────────────────────────────────────────────────

test('git pull origin <builder-branch> → gated', () => {
  const sandbox = mkSandbox('pull-builder');
  const wt = makeWorktreeWithProbe(sandbox, 'wt-a', staleArtifact());
  const result = hook.runGuard({
    stdinRaw: bashInput('git pull origin overstory/builder-a/foo'),
    cwd: sandbox,
    execSync: makeExecStub({ [wt]: 'refs/heads/overstory/builder-a/foo' }),
  });
  assert.equal(result.allow, false);
  assert.equal(result.code, 'PROBE_BLOCKED');
});

test('git pull <builder-branch> (no remote) → gated', () => {
  const sandbox = mkSandbox('pull-bare');
  const wt = makeWorktreeWithProbe(sandbox, 'wt-a', staleArtifact());
  const result = hook.runGuard({
    stdinRaw: bashInput('git pull overstory/builder-a/foo'),
    cwd: sandbox,
    execSync: makeExecStub({ [wt]: 'refs/heads/overstory/builder-a/foo' }),
  });
  assert.equal(result.allow, false);
  assert.equal(result.code, 'PROBE_BLOCKED');
});

test('git push origin <builder-branch>:main → gated', () => {
  const sandbox = mkSandbox('push-to-main');
  const wt = makeWorktreeWithProbe(sandbox, 'wt-a', staleArtifact());
  const result = hook.runGuard({
    stdinRaw: bashInput('git push origin overstory/builder-a/foo:main'),
    cwd: sandbox,
    execSync: makeExecStub({ [wt]: 'refs/heads/overstory/builder-a/foo' }),
  });
  assert.equal(result.allow, false);
  assert.equal(result.code, 'PROBE_BLOCKED');
});

test('git push origin +<builder-branch>:main (force) → gated', () => {
  const sandbox = mkSandbox('push-force');
  const wt = makeWorktreeWithProbe(sandbox, 'wt-a', staleArtifact());
  const result = hook.runGuard({
    stdinRaw: bashInput('git push origin +overstory/builder-a/foo:main'),
    cwd: sandbox,
    execSync: makeExecStub({ [wt]: 'refs/heads/overstory/builder-a/foo' }),
  });
  assert.equal(result.allow, false);
  assert.equal(result.code, 'PROBE_BLOCKED');
});

test('git push origin <X>:refs/heads/main → gated', () => {
  const sandbox = mkSandbox('push-refs');
  const wt = makeWorktreeWithProbe(sandbox, 'wt-a', staleArtifact());
  const result = hook.runGuard({
    stdinRaw: bashInput('git push origin overstory/builder-a/foo:refs/heads/main'),
    cwd: sandbox,
    execSync: makeExecStub({ [wt]: 'refs/heads/overstory/builder-a/foo' }),
  });
  assert.equal(result.allow, false);
  assert.equal(result.code, 'PROBE_BLOCKED');
});

test('git cherry-pick on canonical → DENY UNGATED_CODE_LANDING', () => {
  const result = hook.runGuard({
    stdinRaw: bashInput('git cherry-pick abc123'),
    cwd: mkSandbox('cp'),
    execSync: makeExecStub({}, { headBranch: 'main' }),
  });
  assert.equal(result.allow, false);
  assert.equal(result.code, 'UNGATED_CODE_LANDING');
  assert.match(result.message, /git cherry-pick/);
});

test('git cherry-pick on a feature branch → allow', () => {
  const result = hook.runGuard({
    stdinRaw: bashInput('git cherry-pick abc123'),
    cwd: mkSandbox('cp-fb'),
    execSync: makeExecStub({}, { headBranch: 'overstory/chunk2-lead/foo' }),
  });
  assert.equal(result.allow, true);
});

test('git rebase on canonical → DENY UNGATED_CODE_LANDING', () => {
  const result = hook.runGuard({
    stdinRaw: bashInput('git rebase overstory/builder-a/foo'),
    cwd: mkSandbox('rb'),
    execSync: makeExecStub({}, { headBranch: 'main' }),
  });
  assert.equal(result.allow, false);
  assert.equal(result.code, 'UNGATED_CODE_LANDING');
});

test('git am on canonical → DENY UNGATED_CODE_LANDING', () => {
  const result = hook.runGuard({
    stdinRaw: bashInput('git am < some.patch'),
    cwd: mkSandbox('am'),
    execSync: makeExecStub({}, { headBranch: 'main' }),
  });
  assert.equal(result.allow, false);
  assert.equal(result.code, 'UNGATED_CODE_LANDING');
});

test('git apply on canonical → DENY UNGATED_CODE_LANDING', () => {
  const result = hook.runGuard({
    stdinRaw: bashInput('git apply patch.diff'),
    cwd: mkSandbox('apply'),
    execSync: makeExecStub({}, { headBranch: 'main' }),
  });
  assert.equal(result.allow, false);
  assert.equal(result.code, 'UNGATED_CODE_LANDING');
});

// ─────────────────────────────────────────────────────────────────────
// SECTION 5 — Compound/wrapped command shapes
// ─────────────────────────────────────────────────────────────────────

test('cd /elsewhere && git merge X → gated (segment-aware)', () => {
  const sandbox = mkSandbox('cd-and');
  const wt = makeWorktreeWithProbe(sandbox, 'wt-a', staleArtifact());
  const result = hook.runGuard({
    stdinRaw: bashInput('cd /elsewhere && git merge overstory/builder-a/foo'),
    cwd: sandbox,
    execSync: makeExecStub({ [wt]: 'refs/heads/overstory/builder-a/foo' }),
  });
  assert.equal(result.allow, false);
  assert.equal(result.code, 'PROBE_BLOCKED');
});

test('FOO=bar git merge X (env prefix) → gated', () => {
  const sandbox = mkSandbox('env-prefix');
  const wt = makeWorktreeWithProbe(sandbox, 'wt-a', staleArtifact());
  const result = hook.runGuard({
    stdinRaw: bashInput('GIT_EDITOR=true git merge overstory/builder-a/foo'),
    cwd: sandbox,
    execSync: makeExecStub({ [wt]: 'refs/heads/overstory/builder-a/foo' }),
  });
  assert.equal(result.allow, false);
  assert.equal(result.code, 'PROBE_BLOCKED');
});

test('git -C /some/path merge X → gated', () => {
  const sandbox = mkSandbox('git-C');
  const wt = makeWorktreeWithProbe(sandbox, 'wt-a', staleArtifact());
  const result = hook.runGuard({
    stdinRaw: bashInput('git -C /some/path merge overstory/builder-a/foo'),
    cwd: sandbox,
    execSync: makeExecStub({ [wt]: 'refs/heads/overstory/builder-a/foo' }),
  });
  assert.equal(result.allow, false);
  assert.equal(result.code, 'PROBE_BLOCKED');
});

test('quoted merge: git merge "overstory/builder-a/foo" → gated', () => {
  const sandbox = mkSandbox('quoted');
  const wt = makeWorktreeWithProbe(sandbox, 'wt-a', staleArtifact());
  const result = hook.runGuard({
    stdinRaw: bashInput('git merge "overstory/builder-a/foo"'),
    cwd: sandbox,
    execSync: makeExecStub({ [wt]: 'refs/heads/overstory/builder-a/foo' }),
  });
  assert.equal(result.allow, false);
});

// ─────────────────────────────────────────────────────────────────────
// SECTION 6 — Artifact forgery
// ─────────────────────────────────────────────────────────────────────

test('echo > .http-smoke.json → DENY PROBE_ARTIFACT_FORGERY', () => {
  const result = hook.runGuard({
    stdinRaw: bashInput('echo \'{"exitCode":0}\' > /tmp/wt/.claude/hooks/.http-smoke.json'),
    cwd: mkSandbox('forgery-echo'),
    execSync: makeExecStub({}),
  });
  assert.equal(result.allow, false);
  assert.equal(result.code, 'PROBE_ARTIFACT_FORGERY');
});

test('printf > .http-smoke.json → DENY PROBE_ARTIFACT_FORGERY', () => {
  const result = hook.runGuard({
    stdinRaw: bashInput('printf \'%s\' \'{}\' >> /any/.http-smoke.json'),
    cwd: mkSandbox('forgery-printf'),
    execSync: makeExecStub({}),
  });
  assert.equal(result.allow, false);
  assert.equal(result.code, 'PROBE_ARTIFACT_FORGERY');
});

test('cat > .http-smoke.json → DENY PROBE_ARTIFACT_FORGERY', () => {
  const result = hook.runGuard({
    stdinRaw: bashInput('cat patch.json > /any/.claude/hooks/.http-smoke.json'),
    cwd: mkSandbox('forgery-cat'),
    execSync: makeExecStub({}),
  });
  assert.equal(result.allow, false);
  assert.equal(result.code, 'PROBE_ARTIFACT_FORGERY');
});

test('cp src.json /any/.http-smoke.json → DENY PROBE_ARTIFACT_FORGERY', () => {
  const result = hook.runGuard({
    stdinRaw: bashInput('cp /tmp/green.json /wt/.claude/hooks/.http-smoke.json'),
    cwd: mkSandbox('forgery-cp'),
    execSync: makeExecStub({}),
  });
  assert.equal(result.allow, false);
  assert.equal(result.code, 'PROBE_ARTIFACT_FORGERY');
});

test('mv green.json .http-smoke.json → DENY PROBE_ARTIFACT_FORGERY', () => {
  const result = hook.runGuard({
    stdinRaw: bashInput('mv /tmp/green.json /wt/.claude/hooks/.http-smoke.json'),
    cwd: mkSandbox('forgery-mv'),
    execSync: makeExecStub({}),
  });
  assert.equal(result.allow, false);
  assert.equal(result.code, 'PROBE_ARTIFACT_FORGERY');
});

test('node -e write to .http-smoke.json → DENY PROBE_ARTIFACT_FORGERY', () => {
  const result = hook.runGuard({
    stdinRaw: bashInput('node -e "require(\'fs\').writeFileSync(\'/wt/.claude/hooks/.http-smoke.json\', \'{}\')"'),
    cwd: mkSandbox('forgery-node'),
    execSync: makeExecStub({}),
  });
  assert.equal(result.allow, false);
  assert.equal(result.code, 'PROBE_ARTIFACT_FORGERY');
});

test('python -c write to .http-smoke.json → DENY PROBE_ARTIFACT_FORGERY', () => {
  const result = hook.runGuard({
    stdinRaw: bashInput('python3 -c "open(\'/wt/.claude/hooks/.http-smoke.json\',\'w\').write(\'{}\')"'),
    cwd: mkSandbox('forgery-py'),
    execSync: makeExecStub({}),
  });
  assert.equal(result.allow, false);
  assert.equal(result.code, 'PROBE_ARTIFACT_FORGERY');
});

test('tee redirect → DENY PROBE_ARTIFACT_FORGERY', () => {
  const result = hook.runGuard({
    stdinRaw: bashInput('echo \'{}\' | tee /wt/.claude/hooks/.http-smoke.json'),
    cwd: mkSandbox('forgery-tee'),
    execSync: makeExecStub({}),
  });
  assert.equal(result.allow, false);
  assert.equal(result.code, 'PROBE_ARTIFACT_FORGERY');
});

test('reading the artifact (cat .http-smoke.json) → allow', () => {
  const result = hook.runGuard({
    stdinRaw: bashInput('cat /wt/.claude/hooks/.http-smoke.json'),
    cwd: mkSandbox('read-only'),
    execSync: makeExecStub({}),
  });
  // `cat FILE` (read) does not redirect; we should NOT block.
  assert.equal(result.allow, true);
});

// ─────────────────────────────────────────────────────────────────────
// SECTION 7 — Staleness
// ─────────────────────────────────────────────────────────────────────

test('PROBE_STALE: commit newer than artifact mtime → DENY', () => {
  const sandbox = mkSandbox('stale');
  const oldMs = Date.now() - 10 * 60 * 1000; // 10 min ago
  const wt = makeWorktreeWithProbe(sandbox, 'wt-a', greenProbe(), { mtimeMs: oldMs });
  const newCommitEpoch = String(Math.floor(Date.now() / 1000)); // now
  const result = hook.runGuard({
    stdinRaw: bashInput('ov merge --branch overstory/builder-a/foo'),
    cwd: sandbox,
    execSync: makeExecStub(
      { [wt]: 'refs/heads/overstory/builder-a/foo' },
      { commitEpoch: newCommitEpoch }
    ),
  });
  assert.equal(result.allow, false);
  assert.equal(result.code, 'PROBE_STALE');
});

// ─────────────────────────────────────────────────────────────────────
// SECTION 8 — Failsafe behaviour
// ─────────────────────────────────────────────────────────────────────

test('malformed stdin JSON → allow (fail-open)', () => {
  const result = hook.runGuard({
    stdinRaw: 'this is not json',
    cwd: mkSandbox('badjson'),
    execSync: makeExecStub({}),
  });
  assert.equal(result.allow, true);
});

test('execSync throwing on worktree list → DENY SOURCE_WORKTREE_NOT_FOUND', () => {
  const result = hook.runGuard({
    stdinRaw: bashInput('ov merge --branch overstory/builder-a/foo'),
    cwd: mkSandbox('exec-throws'),
    execSync: () => { throw new Error('git not found'); },
  });
  assert.equal(result.allow, false);
  assert.equal(result.code, 'SOURCE_WORKTREE_NOT_FOUND');
});

// ─────────────────────────────────────────────────────────────────────
// SECTION 9 — Pure-helper coverage
// ─────────────────────────────────────────────────────────────────────

test('parseOvMergeBranch: --branch <X>', () => {
  const tail = hook.tokenize('--branch overstory/builder-a/foo');
  assert.equal(hook.parseOvMergeBranch(tail), 'overstory/builder-a/foo');
});

test('parseOvMergeBranch: --branch=X', () => {
  const tail = hook.tokenize('--branch=overstory/builder-a/foo');
  assert.equal(hook.parseOvMergeBranch(tail), 'overstory/builder-a/foo');
});

test('parseOvMergeBranch: positional', () => {
  const tail = hook.tokenize('overstory/builder-a/foo');
  assert.equal(hook.parseOvMergeBranch(tail), 'overstory/builder-a/foo');
});

test('detectMergeIntent: empty command → allow', () => {
  assert.equal(hook.detectMergeIntent('').kind, 'allow');
});

test('detectMergeIntent: bare `ov merge` (no branch) → allow', () => {
  assert.equal(hook.detectMergeIntent('ov merge').kind, 'allow');
});

test('isCanonicalSource: refs/remotes/origin/main → true', () => {
  assert.equal(hook.isCanonicalSource('refs/remotes/origin/main'), true);
});

test('writesProbeArtifact: positive cases', () => {
  const cases = [
    'echo \'{}\' > /a/.http-smoke.json',
    'cat src > /b/.http-smoke.json',
    'cp x /c/.http-smoke.json',
    'mv x /d/.http-smoke.json',
    'echo {} | tee /e/.http-smoke.json',
    'node -e "fs.writeFileSync(\'/f/.http-smoke.json\',\'\')"',
  ];
  for (const c of cases) {
    const intent = hook.detectMergeIntent(c);
    assert.equal(intent.kind, 'forgery', `expected forgery for: ${c}`);
  }
});

test('writesProbeArtifact: read-only cat is allowed', () => {
  const intent = hook.detectMergeIntent('cat /a/.http-smoke.json');
  assert.equal(intent.kind, 'allow');
});

// ─────────────────────────────────────────────────────────────────────
// SECTION 10 — REAL END-TO-END with actual git worktrees
// ─────────────────────────────────────────────────────────────────────
//
// These tests:
//   - create a real git repository
//   - add real worktrees on real builder branches
//   - place real `.http-smoke.json` files
//   - invoke the hook EXACTLY like the agent host (subprocess + stdin)
//   - assert on the real stdout/exit-code
//
// They are the strongest evidence that this hook works in production.
// ─────────────────────────────────────────────────────────────────────

function runGit(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 't@t' } });
}

function setupRealRepo() {
  const root = mkSandbox('e2e');
  const repo = path.join(root, 'repo');
  fs.mkdirSync(repo, { recursive: true });
  runGit(repo, ['init', '-q', '-b', 'main']);
  fs.writeFileSync(path.join(repo, 'README.md'), '# repo\n');
  runGit(repo, ['add', '.']);
  runGit(repo, ['commit', '-q', '-m', 'initial']);
  return { root, repo };
}

function addBuilderWorktree(repo, root, branchName, probe) {
  const wt = path.join(root, `wt-${branchName.replace(/[^a-zA-Z0-9]/g, '-')}`);
  runGit(repo, ['worktree', 'add', '-q', '-b', branchName, wt]);
  fs.mkdirSync(path.join(wt, '.claude', 'hooks'), { recursive: true });
  fs.writeFileSync(
    path.join(wt, '.claude', 'hooks', '.http-smoke.json'),
    typeof probe === 'string' ? probe : JSON.stringify(probe)
  );
  return wt;
}

function invokeHookSubprocess(cwd, command) {
  const result = spawnSync('node', [HOOK_PATH], {
    cwd,
    input: bashInput(command),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: cwd },
  });
  return {
    code: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    parsedDeny: (() => {
      try { return JSON.parse(result.stdout || '{}'); }
      catch { return null; }
    })(),
  };
}

test('E2E: red builder + ov merge → real subprocess denies', () => {
  const { root, repo } = setupRealRepo();
  addBuilderWorktree(repo, root, 'overstory/builder-a/red', staleArtifact());

  const r = invokeHookSubprocess(repo, 'ov merge --branch overstory/builder-a/red');
  assert.equal(r.code, 0); // exit 0 with stdout deny envelope (not exit 1)
  assert.ok(r.parsedDeny);
  assert.equal(r.parsedDeny.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(r.parsedDeny.hookSpecificOutput.permissionDecisionReason, /STACK_BOOT_FAILED/);
});

test('E2E: green builder + ov merge → real subprocess allows', () => {
  const { root, repo } = setupRealRepo();
  addBuilderWorktree(repo, root, 'overstory/builder-a/green', greenProbe());

  const r = invokeHookSubprocess(repo, 'ov merge --branch overstory/builder-a/green');
  assert.equal(r.code, 0);
  assert.equal(r.stdout, ''); // no deny envelope
});

test('E2E: red builder + git merge → real subprocess denies', () => {
  const { root, repo } = setupRealRepo();
  addBuilderWorktree(repo, root, 'overstory/builder-a/red2', staleArtifact());

  const r = invokeHookSubprocess(repo, 'git merge --no-ff overstory/builder-a/red2');
  assert.equal(r.code, 0);
  assert.ok(r.parsedDeny);
  assert.equal(r.parsedDeny.hookSpecificOutput.permissionDecision, 'deny');
});

test('E2E: red builder + git pull origin <branch> → real subprocess denies', () => {
  const { root, repo } = setupRealRepo();
  addBuilderWorktree(repo, root, 'overstory/builder-a/red3', staleArtifact());

  const r = invokeHookSubprocess(repo, 'git pull origin overstory/builder-a/red3');
  assert.equal(r.code, 0);
  assert.ok(r.parsedDeny);
});

test('E2E: red builder + git push <X>:main → real subprocess denies', () => {
  const { root, repo } = setupRealRepo();
  addBuilderWorktree(repo, root, 'overstory/builder-a/red4', staleArtifact());

  const r = invokeHookSubprocess(repo, 'git push origin overstory/builder-a/red4:main');
  assert.equal(r.code, 0);
  assert.ok(r.parsedDeny);
});

test('E2E: shell forgery (echo > .http-smoke.json) → real subprocess denies', () => {
  const { root, repo } = setupRealRepo();
  const r = invokeHookSubprocess(
    repo,
    `echo '{"exitCode":0,"summary":{"total":1,"passed":1,"failed":0},"cases":[{"label":"x","passed":true}]}' > ${root}/wt/.claude/hooks/.http-smoke.json`
  );
  assert.equal(r.code, 0);
  assert.ok(r.parsedDeny);
  assert.match(r.parsedDeny.hookSpecificOutput.permissionDecisionReason, /PROBE_ARTIFACT_FORGERY/);
});

test('E2E: cherry-pick on main → real subprocess denies', () => {
  const { root, repo } = setupRealRepo();
  // HEAD on `repo` is `main` after init.
  const r = invokeHookSubprocess(repo, 'git cherry-pick deadbeef');
  assert.equal(r.code, 0);
  assert.ok(r.parsedDeny);
  assert.match(r.parsedDeny.hookSpecificOutput.permissionDecisionReason, /UNGATED_CODE_LANDING/);
});

test('E2E: cherry-pick on a feature branch → real subprocess allows', () => {
  const { root, repo } = setupRealRepo();
  runGit(repo, ['checkout', '-q', '-b', 'feature/x']);
  const r = invokeHookSubprocess(repo, 'git cherry-pick deadbeef');
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
});

test('E2E: PROBE_STALE — commit on builder branch newer than artifact', () => {
  const { root, repo } = setupRealRepo();
  const wt = addBuilderWorktree(repo, root, 'overstory/builder-a/late', greenProbe());
  // Backdate the artifact, then add a real new commit on the branch.
  const oldMs = Date.now() - 60 * 60 * 1000; // 1h ago
  const artifact = path.join(wt, '.claude', 'hooks', '.http-smoke.json');
  fs.utimesSync(artifact, oldMs / 1000, oldMs / 1000);
  // Commit something new on the builder branch via the worktree.
  fs.writeFileSync(path.join(wt, 'new.txt'), 'late edit\n');
  runGit(wt, ['add', '.']);
  runGit(wt, ['commit', '-q', '-m', 'late edit']);

  const r = invokeHookSubprocess(repo, 'ov merge --branch overstory/builder-a/late');
  assert.equal(r.code, 0);
  assert.ok(r.parsedDeny);
  assert.match(r.parsedDeny.hookSpecificOutput.permissionDecisionReason, /PROBE_STALE/);
});

test('E2E: missing worktree → real subprocess denies SOURCE_WORKTREE_NOT_FOUND', () => {
  const { repo } = setupRealRepo();
  const r = invokeHookSubprocess(repo, 'ov merge --branch overstory/builder-a/ghost');
  assert.equal(r.code, 0);
  assert.ok(r.parsedDeny);
  assert.match(r.parsedDeny.hookSpecificOutput.permissionDecisionReason, /SOURCE_WORKTREE_NOT_FOUND/);
});

test('E2E: 2 real worktrees, one green one red — selects correct artifact', () => {
  const { root, repo } = setupRealRepo();
  addBuilderWorktree(repo, root, 'overstory/builder-a/alpha', greenProbe());
  addBuilderWorktree(repo, root, 'overstory/builder-a/beta', staleArtifact());

  // alpha (green) → allow
  const a = invokeHookSubprocess(repo, 'ov merge --branch overstory/builder-a/alpha');
  assert.equal(a.code, 0);
  assert.equal(a.stdout, '');

  // beta (red) → deny
  const b = invokeHookSubprocess(repo, 'ov merge --branch overstory/builder-a/beta');
  assert.equal(b.code, 0);
  assert.ok(b.parsedDeny);
  assert.match(b.parsedDeny.hookSpecificOutput.permissionDecisionReason, /STACK_BOOT_FAILED/);
});

test('E2E: non-merge command (ls) → real subprocess allows silently', () => {
  const { repo } = setupRealRepo();
  const r = invokeHookSubprocess(repo, 'ls');
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
});
