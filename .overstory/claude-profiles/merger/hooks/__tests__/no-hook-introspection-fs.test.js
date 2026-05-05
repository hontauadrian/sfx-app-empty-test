#!/usr/bin/env node
/**
 * Unit tests for no-hook-introspection-fs.js (Layer B' filesystem guard).
 *
 * Uses the built-in node:test runner. Each case builds a PreToolUse
 * payload and asserts the hook's allow/block decision.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

const { runGuard } = require('../no-hook-introspection-fs');

function sandbox() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'p06-fs-'));
}

function payload(toolName, toolInput) {
  return JSON.stringify({ tool_name: toolName, tool_input: toolInput });
}

function run(toolName, toolInput) {
  return runGuard({ stdinRaw: payload(toolName, toolInput), cwd: sandbox() });
}

test('Read on a regular source file is allowed', () => {
  const result = run('Read', { file_path: 'apps/api/src/main.ts' });
  assert.equal(result.allow, true);
});

test('Read on .claude/hooks/* is blocked', () => {
  const result = run('Read', { file_path: '.claude/hooks/no-hook-author.js' });
  assert.equal(result.allow, false);
  assert.equal(result.decision, 'block');
});

test('Read with absolute path into .overstory/claude-profiles is blocked', () => {
  const result = run('Read', {
    file_path:
      '/Users/mako/Documents/GitHub/sfx-webapp-boilerplate/.overstory/claude-profiles/builder/hooks/no-hook-author.js',
  });
  assert.equal(result.allow, false);
  assert.equal(result.decision, 'block');
});

test('Read with parent-traversal path into profile hooks is blocked', () => {
  const result = run('Read', {
    file_path: '../../.overstory/claude-profiles/builder/hooks/no-hook-author.js',
  });
  assert.equal(result.allow, false);
  assert.equal(result.decision, 'block');
});

test('Read into a sibling worktree hooks dir is blocked', () => {
  const result = run('Read', {
    file_path: '.overstory/worktrees/other-agent/.claude/hooks/x.js',
  });
  assert.equal(result.allow, false);
  assert.equal(result.decision, 'block');
});

test('Glob with **/.claude/hooks/** pattern is blocked', () => {
  const result = run('Glob', { pattern: '**/.claude/hooks/**' });
  assert.equal(result.allow, false);
  assert.equal(result.decision, 'block');
});

test('Glob with benign pattern but path=".claude/hooks" is blocked', () => {
  const result = run('Glob', { pattern: 'apps/**/*.ts', path: '.claude/hooks' });
  assert.equal(result.allow, false);
  assert.equal(result.decision, 'block');
});

test('Grep scoped to .overstory/mail is blocked', () => {
  const result = run('Grep', { pattern: 'secret', path: '.overstory/mail' });
  assert.equal(result.allow, false);
  assert.equal(result.decision, 'block');
});

test('Edit on .claude/settings.json is blocked', () => {
  const result = run('Edit', { file_path: '.claude/settings.json' });
  assert.equal(result.allow, false);
  assert.equal(result.decision, 'block');
});

test('Edit on absolute .claude/settings.local.json is blocked', () => {
  const result = run('Edit', {
    file_path: '/Users/mako/Documents/GitHub/sfx-webapp-boilerplate/.claude/settings.local.json',
  });
  assert.equal(result.allow, false);
  assert.equal(result.decision, 'block');
});

test('Write on scripts/git-hooks/pre-commit is blocked', () => {
  const result = run('Write', { file_path: 'scripts/git-hooks/pre-commit' });
  assert.equal(result.allow, false);
  assert.equal(result.decision, 'block');
});

test('NotebookEdit targeting profile hooks is blocked', () => {
  const result = run('NotebookEdit', {
    notebook_path: '.overstory/claude-profiles/builder/hooks/foo.ipynb',
  });
  assert.equal(result.allow, false);
  assert.equal(result.decision, 'block');
});

test('Empty stdin is allowed (fail open)', () => {
  const result = runGuard({ stdinRaw: '', cwd: sandbox() });
  assert.equal(result.allow, true);
});

test('Malformed JSON stdin is allowed (fail open on parse error)', () => {
  const result = runGuard({ stdinRaw: 'not json', cwd: sandbox() });
  assert.equal(result.allow, true);
});

test('Unknown tool (Bash) is allowed — not this hook\'s matcher', () => {
  const result = run('Bash', { command: 'cat .claude/hooks/no-hook-author.js' });
  assert.equal(result.allow, true);
});

test('Write on allowed overlay file is allowed (control)', () => {
  const result = run('Write', { file_path: '.runtime-contract.overlay.json' });
  assert.equal(result.allow, true);
});

test('Read on apps source file is allowed (control)', () => {
  const result = run('Read', { file_path: 'apps/web/src/features/auth/domain/model/User.ts' });
  assert.equal(result.allow, true);
});
