#!/usr/bin/env node
/**
 * Plan 06 — unit tests for Layer B / B' / F guards.
 *
 * Each fixture under __tests__/fixtures/hook-opacity/<hook>/<name>/:
 *   payload.json   — stdin payload for the hook
 *   expected.json  — { decision, reasonContains? }
 *
 * The test harness spawns each hook binary as a subprocess with the fixture's
 * payload piped to stdin, and asserts the emitted JSON decision matches.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'hook-opacity');
const HOOKS_DIR = path.resolve(__dirname, '..');

const HOOK_MAP = {
  'no-hook-introspection': path.join(HOOKS_DIR, 'no-hook-introspection.js'),
  'no-hook-author': path.join(HOOKS_DIR, 'no-hook-author.js'),
  'no-node-modules-write': path.join(HOOKS_DIR, 'no-node-modules-write.js'),
  'bash-allowlist': path.join(HOOKS_DIR, 'bash-allowlist.js'),
};

function makeSandbox(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `p06-${name}-`));
}

function runHook(hookEntry, payload, cwd) {
  const result = spawnSync(process.execPath, [hookEntry], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: cwd, PROJECT_ROOT: cwd, OVERSTORY_AGENT_CAPABILITY: 'builder' },
  });
  const stdout = (result.stdout || '').trim();
  if (stdout === '') return { decision: 'allow' };
  try {
    return JSON.parse(stdout);
  } catch {
    return { decision: 'malformed', raw: stdout };
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function assertDecision(name, actual, expected) {
  const problems = [];
  if (expected.decision && actual.decision !== expected.decision) {
    problems.push(`decision: expected ${expected.decision}, got ${actual.decision}`);
  }
  if (expected.reasonContains && !(actual.reason || '').includes(expected.reasonContains)) {
    problems.push(`reason: expected to contain "${expected.reasonContains}", got ${JSON.stringify(actual.reason)}`);
  }
  if (problems.length > 0) {
    console.error(`FAIL ${name}`);
    for (const p of problems) console.error(`  - ${p}`);
    console.error(`  actual: ${JSON.stringify(actual)}`);
    return false;
  }
  return true;
}

function runAllFixtures() {
  const hooks = fs
    .readdirSync(FIXTURES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  let passed = 0;
  let failed = 0;
  let total = 0;

  for (const hook of hooks) {
    const hookEntry = HOOK_MAP[hook];
    if (!hookEntry) {
      console.error(`SKIP ${hook}: no hook entry mapping`);
      continue;
    }
    const hookDir = path.join(FIXTURES_DIR, hook);
    const names = fs
      .readdirSync(hookDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
    for (const name of names) {
      total++;
      const dir = path.join(hookDir, name);
      const payload = readJson(path.join(dir, 'payload.json'));
      const expected = readJson(path.join(dir, 'expected.json'));
      const fixturePackagePath = path.join(dir, 'package.json');
      const sandbox = makeSandbox(name);
      try {
        if (fs.existsSync(fixturePackagePath)) {
          fs.copyFileSync(fixturePackagePath, path.join(sandbox, 'package.json'));
        }
        if (hook === 'bash-allowlist') {
          // Copy builder allow-list into sandbox so the hook finds it.
          const allowlistSrc = path.join(HOOKS_DIR, '.bash-allowlist.json');
          const allowlistDestDir = path.join(sandbox, '.claude', 'hooks');
          fs.mkdirSync(allowlistDestDir, { recursive: true });
          fs.copyFileSync(allowlistSrc, path.join(allowlistDestDir, '.bash-allowlist.json'));
        }
        const actual = runHook(hookEntry, payload, sandbox);
        const ok = assertDecision(`${hook}/${name}`, actual, expected);
        if (ok) {
          passed++;
          console.log(`PASS ${hook}/${name}`);
        } else {
          failed++;
        }
      } finally {
        fs.rmSync(sandbox, { recursive: true, force: true });
      }
    }
  }

  console.log('');
  console.log(`Fixtures: ${passed} passed, ${failed} failed, ${total} total`);
  return failed === 0;
}

if (require.main === module) {
  const ok = runAllFixtures();
  process.exit(ok ? 0 : 1);
}

module.exports = { runAllFixtures };
