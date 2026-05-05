#!/usr/bin/env node
/**
 * Unit tests for worker-done-evidence Stop hook.
 *
 * Covers the original PreToolUse contract (block worker_done mails missing
 * runtime-evidence) plus the tightened guards added 2026-04-27:
 *   - Reject total=0 (zero-effort claims)
 *   - Cross-reference .claude/hooks/.http-smoke.json (fabrication detector)
 *   - Reject stale artifacts (>30 minutes old)
 *   - Reject claims that hide probe failure (artifact says fail, claim says pass)
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const hook = require('../worker-done-evidence.js');

function makeSandbox(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `wde-${name}-`));
}

function writeArtifact(sandbox, payload, mtimeMs) {
  const dir = path.join(sandbox, '.claude', 'hooks');
  fs.mkdirSync(dir, { recursive: true });
  const artifactPath = path.join(dir, '.http-smoke.json');
  fs.writeFileSync(artifactPath, JSON.stringify(payload));
  if (typeof mtimeMs === 'number') {
    fs.utimesSync(artifactPath, mtimeMs / 1000, mtimeMs / 1000);
  }
  return artifactPath;
}

function makePayload(body) {
  return JSON.stringify({
    tool_name: 'Bash',
    tool_input: {
      command: `ov mail send --to team-lead --subject worker_done --body "$(cat <<'EOF'\n${body}\nEOF\n)"`,
    },
  });
}

test('allows non-Bash payloads', () => {
  const result = hook.runGuard({
    stdinRaw: JSON.stringify({ tool_name: 'Edit', tool_input: {} }),
    cwd: makeSandbox('non-bash'),
  });
  assert.equal(result.allow, true);
});

test('allows Bash commands that are not ov mail send worker_done', () => {
  const result = hook.runGuard({
    stdinRaw: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'echo hello' } }),
    cwd: makeSandbox('not-mail'),
  });
  assert.equal(result.allow, true);
});

test('blocks worker_done with no runtime-evidence block', () => {
  const sandbox = makeSandbox('no-evidence');
  try {
    const result = hook.runGuard({
      stdinRaw: makePayload('## Summary\nAll done. exit code 0.'),
      cwd: sandbox,
    });
    assert.equal(result.allow, false);
    assert.equal(result.decision, 'block');
    assert.match(result.reason, /WORKER_DONE_EVIDENCE_MISSING/);
    assert.match(result.reason, /Prose claims like "exit code 0" are not accepted/);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test('blocks zero-effort claims (total=0)', () => {
  const sandbox = makeSandbox('zero');
  try {
    const result = hook.runGuard({
      stdinRaw: makePayload(
        '## Summary\nDone\n\n## runtime-evidence\nprobe:smoke: total=0 passed=0 failed=0'
      ),
      cwd: sandbox,
    });
    assert.equal(result.allow, false);
    assert.equal(result.decision, 'block');
    assert.match(result.reason, /WORKER_DONE_EVIDENCE_EMPTY/);
    assert.match(result.reason, /total=0/);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test('blocks fabricated counts (claim disagrees with on-disk artifact)', () => {
  const sandbox = makeSandbox('fab');
  try {
    writeArtifact(sandbox, {
      summary: { total: 5, passed: 2, failed: 3, skipped: 0, durationMs: 100 },
      exitCode: 1,
    });
    const result = hook.runGuard({
      stdinRaw: makePayload(
        '## Summary\nDone\n\n## runtime-evidence\nprobe:smoke: total=10 passed=10 failed=0'
      ),
      cwd: sandbox,
    });
    assert.equal(result.allow, false);
    assert.equal(result.decision, 'block');
    assert.match(result.reason, /WORKER_DONE_EVIDENCE_FABRICATED/);
    assert.match(result.reason, /total=5 passed=2 failed=3/);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test('allows claim that exactly matches on-disk artifact (passing run)', () => {
  const sandbox = makeSandbox('match-pass');
  try {
    writeArtifact(sandbox, {
      summary: { total: 7, passed: 7, failed: 0, skipped: 0, durationMs: 100 },
      exitCode: 0,
    });
    const result = hook.runGuard({
      stdinRaw: makePayload(
        '## Summary\nDone\n\n## runtime-evidence\nprobe:smoke: total=7 passed=7 failed=0'
      ),
      cwd: sandbox,
    });
    assert.equal(result.allow, true);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test('blocks stale artifact (older than 30 minutes)', () => {
  const sandbox = makeSandbox('stale');
  try {
    const oldMtime = Date.now() - 31 * 60 * 1000;
    writeArtifact(
      sandbox,
      { summary: { total: 7, passed: 7, failed: 0, skipped: 0, durationMs: 1 }, exitCode: 0 },
      oldMtime
    );
    const result = hook.runGuard({
      stdinRaw: makePayload(
        '## Summary\nDone\n\n## runtime-evidence\nprobe:smoke: total=7 passed=7 failed=0'
      ),
      cwd: sandbox,
    });
    assert.equal(result.allow, false);
    assert.equal(result.decision, 'block');
    assert.match(result.reason, /WORKER_DONE_EVIDENCE_STALE/);
    assert.match(result.reason, /minutes old/);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test('blocks claim that hides probe failure (artifact exitCode!=0 but claim failed=0)', () => {
  const sandbox = makeSandbox('hides-fail');
  try {
    writeArtifact(sandbox, {
      summary: { total: 0, passed: 0, failed: 0, skipped: 0, durationMs: 100 },
      exitCode: 2,
      blockReason: 'STACK_BOOT_FAILED:stack:boot stalled',
    });
    // The hook will first hit total=0 → WORKER_DONE_EVIDENCE_EMPTY. To exercise
    // the HIDES_FAILURE path, we need total>0 in evidence but exitCode!=0 in
    // artifact and failed=0 in claim. Set up that scenario.
    writeArtifact(sandbox, {
      summary: { total: 3, passed: 3, failed: 0, skipped: 0, durationMs: 100 },
      exitCode: 2,
      blockReason: 'PROBE_INTERNAL_ERROR:matrix-post-boot:something broke',
    });
    const result = hook.runGuard({
      stdinRaw: makePayload(
        '## Summary\nDone\n\n## runtime-evidence\nprobe:smoke: total=3 passed=3 failed=0'
      ),
      cwd: sandbox,
    });
    assert.equal(result.allow, false);
    assert.equal(result.decision, 'block');
    assert.match(result.reason, /WORKER_DONE_EVIDENCE_HIDES_FAILURE/);
    assert.match(result.reason, /exitCode=2/);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test('allows claim when no artifact exists yet (back-compat for non-probe tasks)', () => {
  const sandbox = makeSandbox('no-artifact');
  try {
    const result = hook.runGuard({
      stdinRaw: makePayload(
        '## Summary\nDone\n\n## runtime-evidence\nprobe:smoke: total=4 passed=4 failed=0'
      ),
      cwd: sandbox,
    });
    // No artifact → falls through to changed-write-endpoints check.
    // No matrix → 0 changed endpoints → allow.
    assert.equal(result.allow, true);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test('parseRuntimeEvidence parses canonical line', () => {
  const ev = hook.parseRuntimeEvidence(
    '## runtime-evidence\nprobe:smoke: total=10 passed=8 failed=2'
  );
  assert.deepEqual(ev, { total: 10, passed: 8, failed: 2 });
});

test('parseRuntimeEvidence returns null when block is missing', () => {
  assert.equal(hook.parseRuntimeEvidence('no evidence here'), null);
  assert.equal(hook.parseRuntimeEvidence(''), null);
  assert.equal(hook.parseRuntimeEvidence(null), null);
});

test('readSmokeArtifact returns null when file is absent', () => {
  const sandbox = makeSandbox('absent');
  try {
    assert.equal(hook.readSmokeArtifact(sandbox), null);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test('readSmokeArtifact returns parsed contents and mtime when present', () => {
  const sandbox = makeSandbox('read');
  try {
    writeArtifact(sandbox, { summary: { total: 1, passed: 1, failed: 0 }, exitCode: 0 });
    const result = hook.readSmokeArtifact(sandbox);
    assert.ok(result);
    assert.equal(result.parsed.summary.total, 1);
    assert.equal(typeof result.mtimeMs, 'number');
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test('extractMailBody extracts heredoc body', () => {
  const cmd = `ov mail send --body "$(cat <<'EOF'
hello
world
EOF
)"`;
  const body = hook.extractMailBody(cmd);
  assert.match(body, /hello/);
  assert.match(body, /world/);
});

test('exits 0 even on block (Stop hook contract)', () => {
  // Smoke test: the CLI path should always exit 0; decision goes via stdout JSON.
  // We don't spawn a subprocess here — covered by the integration in defense-hooks.
  // Just verify runGuard returns a structured result (not throwing).
  const result = hook.runGuard({ stdinRaw: '', cwd: '/tmp' });
  assert.equal(typeof result, 'object');
});
