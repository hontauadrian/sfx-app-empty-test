#!/usr/bin/env node
/**
 * Plan 05 — Fixture harness for runtime-contract merger + Stop hook.
 *
 * Each fixture triple under __tests__/fixtures/runtime-contract/<name>/:
 *   overlay.json   — overlay payload (optional if expected.source === 'compiled')
 *   session.json   — Stop hook stdin payload { files: [{ path }] }
 *   expected.json  — { decision, categoryContains?, reasonsContain? }
 *
 * Runs require-runtime-contract.js in a temp project dir and asserts the
 * emitted JSON decision matches.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'runtime-contract');
const HOOK_ENTRY = path.resolve(__dirname, '..', '..', 'require-runtime-contract.js');

function makeSandbox(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `rc-${name}-`));
}

function withFixture(name, fn) {
  const sandbox = makeSandbox(name);
  try {
    return fn(sandbox);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function runHook(projectRoot, sessionPayload) {
  const result = spawnSync(process.execPath, [HOOK_ENTRY], {
    input: JSON.stringify(sessionPayload),
    encoding: 'utf8',
    env: { ...process.env, PROJECT_ROOT: projectRoot },
  });
  const lines = (result.stdout || '').trim().split(/\r?\n/).filter(Boolean);
  const lastLine = lines[lines.length - 1] || '{}';
  return JSON.parse(lastLine);
}

function assertDecision(fixtureName, actual, expected) {
  const problems = [];
  if (expected.decision && actual.decision !== expected.decision) {
    problems.push(`decision: expected ${expected.decision}, got ${actual.decision}`);
  }
  if (expected.categoryContains && (actual.category || '').indexOf(expected.categoryContains) === -1) {
    problems.push(
      `category: expected to contain "${expected.categoryContains}", got ${JSON.stringify(actual.category)}`,
    );
  }
  if (Array.isArray(expected.reasonsContain)) {
    for (const needle of expected.reasonsContain) {
      if ((actual.reason || '').indexOf(needle) === -1) {
        problems.push(`reason: expected to contain "${needle}", got ${JSON.stringify(actual.reason)}`);
      }
    }
  }
  if (problems.length > 0) {
    console.error(`FAIL ${fixtureName}`);
    for (const problem of problems) console.error(`  - ${problem}`);
    return false;
  }
  return true;
}

function runAllFixtures() {
  const names = fs
    .readdirSync(FIXTURES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  let passed = 0;
  let failed = 0;
  for (const name of names) {
    const dir = path.join(FIXTURES_DIR, name);
    const expected = readJson(path.join(dir, 'expected.json'));
    const session = readJson(path.join(dir, 'session.json'));
    const overlayPath = path.join(dir, 'overlay.json');
    const hasOverlay = fs.existsSync(overlayPath);

    withFixture(name, (sandbox) => {
      if (hasOverlay) {
        fs.copyFileSync(overlayPath, path.join(sandbox, '.runtime-contract.overlay.json'));
      }
      const actual = runHook(sandbox, session);
      const ok = assertDecision(name, actual, expected);
      if (ok) {
        passed++;
        console.log(`PASS ${name}`);
      } else {
        failed++;
        console.error(`  actual: ${JSON.stringify(actual)}`);
      }
    });
  }

  console.log('');
  console.log(`Fixtures: ${passed} passed, ${failed} failed, ${names.length} total`);
  return failed === 0;
}

if (require.main === module) {
  const ok = runAllFixtures();
  process.exit(ok ? 0 : 1);
}

module.exports = { runAllFixtures };
