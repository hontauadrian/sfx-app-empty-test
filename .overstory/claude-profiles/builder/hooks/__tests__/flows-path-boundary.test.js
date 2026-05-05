'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const HOOK = path.join(__dirname, '..', 'flows-path-boundary.js');

function tempProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flows-pb-'));
  fs.mkdirSync(path.join(dir, '.overstory', 'runtime-contract.flows'), { recursive: true });
  return dir;
}

function runHook(stdin, env = {}) {
  // Strip parent process env that could leak role detection (e.g.
  // OVERSTORY_AGENT_NAME from the harness running these tests).
  const cleanEnv = { ...process.env };
  delete cleanEnv.OVERSTORY_AGENT_CAPABILITY;
  delete cleanEnv.OVERSTORY_AGENT_NAME;
  delete cleanEnv.CLAUDE_PROFILE;
  const r = spawnSync('node', [HOOK], {
    input: stdin,
    encoding: 'utf8',
    env: { ...cleanEnv, ...env },
    cwd: env.CLAUDE_PROJECT_DIR || os.tmpdir(),
  });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

test('allows when stdin is empty', () => {
  const r = runHook('');
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
});

test('allows non-Write tool invocations', () => {
  const r = runHook(JSON.stringify({ tool_name: 'Read', tool_input: { file_path: '/x' } }));
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
});

test('allows writes outside the flows folder', () => {
  const dir = tempProject();
  try {
    const target = path.join(dir, 'src', 'foo.ts');
    const r = runHook(
      JSON.stringify({ tool_name: 'Write', tool_input: { file_path: target } }),
      { CLAUDE_PROJECT_DIR: dir },
    );
    assert.equal(r.code, 0);
    assert.equal(r.stdout, '');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('blocks builder writes inside the flows folder', () => {
  const dir = tempProject();
  try {
    const target = path.join(dir, '.overstory', 'runtime-contract.flows', 'task1.yaml');
    const r = runHook(
      JSON.stringify({ tool_name: 'Write', tool_input: { file_path: target } }),
      { CLAUDE_PROJECT_DIR: dir, OVERSTORY_AGENT_CAPABILITY: 'implement' },
    );
    assert.equal(r.code, 0);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.decision, 'block');
    assert.match(parsed.reason, /FLOW_OWNERSHIP_VIOLATION/);
    assert.match(parsed.reason, /lead/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('blocks merger writes inside the flows folder', () => {
  const dir = tempProject();
  try {
    const target = path.join(dir, '.overstory', 'runtime-contract.flows', 'shared.yaml');
    const r = runHook(
      JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: target } }),
      { CLAUDE_PROJECT_DIR: dir, OVERSTORY_AGENT_CAPABILITY: 'review' },
    );
    assert.equal(r.code, 0);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.decision, 'block');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('allows lead writes inside the flows folder', () => {
  const dir = tempProject();
  try {
    const target = path.join(dir, '.overstory', 'runtime-contract.flows', 'task1.yaml');
    const r = runHook(
      JSON.stringify({ tool_name: 'Write', tool_input: { file_path: target } }),
      { CLAUDE_PROJECT_DIR: dir, OVERSTORY_AGENT_CAPABILITY: 'lead' },
    );
    assert.equal(r.code, 0);
    assert.equal(r.stdout, '');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('allows coordinator writes inside the flows folder', () => {
  const dir = tempProject();
  try {
    const target = path.join(dir, '.overstory', 'runtime-contract.flows', '_shared.yaml');
    const r = runHook(
      JSON.stringify({ tool_name: 'Write', tool_input: { file_path: target } }),
      { CLAUDE_PROJECT_DIR: dir, OVERSTORY_AGENT_CAPABILITY: 'coordinate' },
    );
    assert.equal(r.code, 0);
    assert.equal(r.stdout, '');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('detects role from CLAUDE_PROFILE env when capability not set', () => {
  const dir = tempProject();
  try {
    const target = path.join(dir, '.overstory', 'runtime-contract.flows', 'task.yaml');
    const r = runHook(
      JSON.stringify({ tool_name: 'Write', tool_input: { file_path: target } }),
      { CLAUDE_PROJECT_DIR: dir, CLAUDE_PROFILE: 'coordinator' },
    );
    assert.equal(r.code, 0);
    assert.equal(r.stdout, '');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('detects builder role by default when no env hints', () => {
  const dir = tempProject();
  try {
    const target = path.join(dir, '.overstory', 'runtime-contract.flows', 'task.yaml');
    const r = runHook(
      JSON.stringify({ tool_name: 'Write', tool_input: { file_path: target } }),
      { CLAUDE_PROJECT_DIR: dir },
    );
    assert.equal(r.code, 0);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.decision, 'block');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('blocks MultiEdit on a flows-folder file', () => {
  const dir = tempProject();
  try {
    const target = path.join(dir, '.overstory', 'runtime-contract.flows', 'task.yaml');
    const r = runHook(
      JSON.stringify({ tool_name: 'MultiEdit', tool_input: { file_path: target } }),
      { CLAUDE_PROJECT_DIR: dir, OVERSTORY_AGENT_CAPABILITY: 'implement' },
    );
    assert.equal(r.code, 0);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.decision, 'block');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('blocks NotebookEdit on a flows-folder file', () => {
  const dir = tempProject();
  try {
    const target = path.join(dir, '.overstory', 'runtime-contract.flows', 'x.ipynb');
    const r = runHook(
      JSON.stringify({ tool_name: 'NotebookEdit', tool_input: { notebook_path: target } }),
      { CLAUDE_PROJECT_DIR: dir, OVERSTORY_AGENT_CAPABILITY: 'implement' },
    );
    assert.equal(r.code, 0);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.decision, 'block');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('handles relative file_path by resolving against CLAUDE_PROJECT_DIR', () => {
  const dir = tempProject();
  try {
    const r = runHook(
      JSON.stringify({
        tool_name: 'Write',
        tool_input: { file_path: '.overstory/runtime-contract.flows/task.yaml' },
      }),
      { CLAUDE_PROJECT_DIR: dir, OVERSTORY_AGENT_CAPABILITY: 'implement' },
    );
    assert.equal(r.code, 0);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.decision, 'block');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('does not block when file_path is missing', () => {
  const r = runHook(
    JSON.stringify({ tool_name: 'Write', tool_input: {} }),
    { OVERSTORY_AGENT_CAPABILITY: 'implement' },
  );
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
});
