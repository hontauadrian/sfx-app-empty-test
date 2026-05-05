'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const HOOK = path.join(__dirname, '..', 'flows-drift-check.js');

function tempProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'flows-drift-'));
}

function git(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  }
  return r.stdout;
}

function runHook(stdin, env = {}) {
  const r = spawnSync('node', [HOOK], {
    input: stdin,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

function setupRepo(cwd) {
  git(cwd, 'init', '-q');
  git(cwd, 'config', 'user.email', 'test@example.com');
  git(cwd, 'config', 'user.name', 'Test');
  fs.writeFileSync(path.join(cwd, 'README.md'), '# init\n');
  git(cwd, 'add', '.');
  git(cwd, 'commit', '-q', '-m', 'init');
  // create main branch alias for the merge-base lookup
  try {
    git(cwd, 'branch', '-M', 'main');
  } catch (_) { /* ignore */ }
}

test('allows when stdin is empty', () => {
  const r = runHook('');
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
});

test('allows when tool is not Bash', () => {
  const r = runHook(JSON.stringify({ tool_name: 'Read', tool_input: {} }));
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
});

test('allows when bash command is unrelated', () => {
  const r = runHook(JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'ls -la' } }));
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
});

test('allows close-gate when no controllers changed', () => {
  const dir = tempProject();
  try {
    setupRepo(dir);
    const r = runHook(
      JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git commit -m foo' } }),
      { CLAUDE_PROJECT_DIR: dir },
    );
    assert.equal(r.code, 0);
    assert.equal(r.stdout, '');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('blocks close-gate when new controller endpoint is uncovered', () => {
  const dir = tempProject();
  try {
    setupRepo(dir);
    fs.mkdirSync(path.join(dir, 'apps', 'api', 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'apps', 'api', 'src', 'users.controller.ts'),
      `@Controller('users')\nexport class UsersController {\n  @Post('signup')\n  signup() {}\n}\n`,
    );
    git(dir, 'add', '.');
    git(dir, 'commit', '-q', '-m', 'add controller');
    const r = runHook(
      JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git commit -m foo' } }),
      { CLAUDE_PROJECT_DIR: dir },
    );
    // Drift check uses HEAD~1 fallback when no main exists; should detect
    // POST /users/signup as new
    assert.equal(r.code, 0);
    if (r.stdout) {
      const parsed = JSON.parse(r.stdout);
      assert.equal(parsed.decision, 'block');
      assert.match(parsed.reason, /FLOW_NEW_ENDPOINT_UNCOVERED/);
      assert.match(parsed.reason, /POST \/users\/signup/);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('allows close-gate when endpoint is covered by a flow file', () => {
  const dir = tempProject();
  try {
    setupRepo(dir);
    fs.mkdirSync(path.join(dir, 'apps', 'api', 'src'), { recursive: true });
    fs.mkdirSync(path.join(dir, '.overstory', 'runtime-contract.flows'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'apps', 'api', 'src', 'users.controller.ts'),
      `@Controller('users')\nclass U {\n  @Post('signup') s() {}\n}\n`,
    );
    const flow = {
      version: 1,
      task_id: 'task',
      owns: [],
      special_flows: [
        {
          id: 'task:signup',
          description: 'happy',
          contract: { kind: 'happy', source: 'hand', endpoint: 'POST /users/signup' },
          steps: [
            { kind: 'api', transport: 'http', method: 'POST', path: '/users/signup' },
            { kind: 'expect', status: 201 },
          ],
        },
      ],
    };
    fs.writeFileSync(
      path.join(dir, '.overstory', 'runtime-contract.flows', 'task.json'),
      JSON.stringify(flow, null, 2),
    );
    git(dir, 'add', '.');
    git(dir, 'commit', '-q', '-m', 'add controller + flow');
    const r = runHook(
      JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git commit -m foo' } }),
      { CLAUDE_PROJECT_DIR: dir },
    );
    assert.equal(r.code, 0);
    assert.equal(r.stdout, '');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('detects sd close as a close-gate command', () => {
  const dir = tempProject();
  try {
    setupRepo(dir);
    fs.mkdirSync(path.join(dir, 'apps', 'api', 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'apps', 'api', 'src', 'a.controller.ts'),
      `@Controller('a')\nclass A {\n  @Get('list') l() {}\n}\n`,
    );
    git(dir, 'add', '.');
    git(dir, 'commit', '-q', '-m', 'add');
    const r = runHook(
      JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'sd close task-1' } }),
      { CLAUDE_PROJECT_DIR: dir },
    );
    assert.equal(r.code, 0);
    if (r.stdout) {
      const parsed = JSON.parse(r.stdout);
      assert.equal(parsed.decision, 'block');
      assert.match(parsed.reason, /GET \/a\/list/);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('detects ov mail send --type worker_done', () => {
  const dir = tempProject();
  try {
    setupRepo(dir);
    fs.mkdirSync(path.join(dir, 'apps', 'api', 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'apps', 'api', 'src', 'b.controller.ts'),
      `@Controller('b')\nclass B {\n  @Delete(':id') d() {}\n}\n`,
    );
    git(dir, 'add', '.');
    git(dir, 'commit', '-q', '-m', 'add');
    const r = runHook(
      JSON.stringify({
        tool_name: 'Bash',
        tool_input: { command: 'ov mail send --to lead --type worker_done --subject foo --body bar' },
      }),
      { CLAUDE_PROJECT_DIR: dir },
    );
    assert.equal(r.code, 0);
    if (r.stdout) {
      const parsed = JSON.parse(r.stdout);
      assert.match(parsed.reason, /FLOW_NEW_ENDPOINT_UNCOVERED/);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
