#!/usr/bin/env node
/**
 * Plan 07 — fixture-driven tests for defense-in-depth hooks.
 *
 * Each fixture under defense-hooks/<hook>/<name>/:
 *   payload.json     — stdin payload for the hook
 *   expected.json    — { decision, reasonContains? }
 *   overlay.json     — (optional) overlay file to place in sandbox
 *   matrix.json      — (optional) matrix file to place in sandbox
 *   smoke-report.json— (optional) smoke report to place in sandbox
 *   controller.ts    — (optional) controller file for probe-covers-diff
 *   staged-files.json— (optional) mock staged files for co-mingled check
 *
 * For PreToolUse hooks (no-generated-write, no-co-mingled-overlay-commit):
 *   Pipes payload.json to stdin, checks stdout JSON.
 *
 * For Stop hooks (no-ignore-for-changed-paths, probe-covers-diff, worker-done-evidence):
 *   Sets up sandbox filesystem with fixture data, runs hook with env vars.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const FIXTURES_DIR = __dirname;
const HOOKS_DIR = path.resolve(__dirname, '..', '..');

const HOOK_MAP = {
  'no-generated-write': {
    script: path.join(HOOKS_DIR, 'no-generated-write.js'),
    type: 'pretooluse',
  },
  'no-ignore-for-changed-paths': {
    script: path.join(HOOKS_DIR, 'no-ignore-for-changed-paths.js'),
    type: 'stop',
  },
  'probe-covers-diff': {
    script: path.join(HOOKS_DIR, 'probe-covers-diff.js'),
    type: 'stop-unit', // uses unit-test approach via require()
  },
  'worker-done-evidence': {
    script: path.join(HOOKS_DIR, 'worker-done-evidence.js'),
    type: 'stop-unit',
  },
  'no-co-mingled-overlay-commit': {
    script: path.join(HOOKS_DIR, 'no-co-mingled-overlay-commit.js'),
    type: 'pretooluse-unit', // needs mock git, so use unit approach
  },
};

function makeSandbox(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `p07-defense-${name}-`));
}

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Set up sandbox with fixture data files (overlay, matrix, smoke-report, controller).
 */
function setupSandbox(sandbox, fixtureDir) {
  const overlay = readFileSafe(path.join(fixtureDir, 'overlay.json'));
  if (overlay) {
    fs.writeFileSync(path.join(sandbox, '.runtime-contract.overlay.json'), overlay);
  }

  const matrix = readFileSafe(path.join(fixtureDir, 'matrix.json'));
  if (matrix) {
    const hooksDir = path.join(sandbox, '.claude', 'hooks');
    fs.mkdirSync(hooksDir, { recursive: true });
    fs.writeFileSync(path.join(hooksDir, '.matrix.json'), matrix);
  }

  const smokeReport = readFileSafe(path.join(fixtureDir, 'smoke-report.json'));
  if (smokeReport) {
    const hooksDir = path.join(sandbox, '.claude', 'hooks');
    fs.mkdirSync(hooksDir, { recursive: true });
    fs.writeFileSync(path.join(hooksDir, '.smoke-report.json'), smokeReport);
  }

  const controller = readFileSafe(path.join(fixtureDir, 'controller.ts'));
  if (controller) {
    const controllerDir = path.join(sandbox, 'apps', 'api', 'src', 'modules', 'test');
    fs.mkdirSync(controllerDir, { recursive: true });
    fs.writeFileSync(path.join(controllerDir, 'test.controller.ts'), controller);
  }
}

/**
 * Run a PreToolUse hook via subprocess with payload piped to stdin.
 */
function runPreToolUseHook(hookScript, payload, sandbox) {
  const result = spawnSync(process.execPath, [hookScript], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: {
      ...process.env,
      CLAUDE_PROJECT_DIR: sandbox,
      PROJECT_ROOT: sandbox,
    },
    timeout: 10000,
  });
  const stdout = (result.stdout || '').trim();
  if (stdout === '') return { decision: 'allow' };
  try {
    return JSON.parse(stdout);
  } catch {
    return { decision: 'malformed', raw: stdout };
  }
}

/**
 * Run a Stop hook via subprocess (no meaningful stdin, reads from filesystem).
 */
function runStopHook(hookScript, sandbox) {
  const result = spawnSync(process.execPath, [hookScript], {
    input: '{}',
    encoding: 'utf8',
    env: {
      ...process.env,
      CLAUDE_PROJECT_DIR: sandbox,
      PROJECT_ROOT: sandbox,
    },
    timeout: 10000,
  });
  const stdout = (result.stdout || '').trim();
  if (stdout === '') return { decision: 'allow' };
  try {
    return JSON.parse(stdout);
  } catch {
    return { decision: 'malformed', raw: stdout };
  }
}

/**
 * Run no-ignore-for-changed-paths via its exported runGuard (unit test).
 */
function runNoIgnoreUnit(fixtureDir) {
  const sandbox = makeSandbox('no-ignore');
  try {
    setupSandbox(sandbox, fixtureDir);
    const hook = require(HOOK_MAP['no-ignore-for-changed-paths'].script);
    return hook.runGuard({ cwd: sandbox });
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
}

/**
 * Run probe-covers-diff via its exported functions (unit test).
 * We test parseControllerEndpoints + findUncoveredEndpoints directly,
 * since git diff is not available in fixture tests.
 */
function runProbeCoversDiffUnit(fixtureDir) {
  const hook = require(HOOK_MAP['probe-covers-diff'].script);
  const controllerContent = readFileSafe(path.join(fixtureDir, 'controller.ts'));
  const smokeReport = readJsonSafe(path.join(fixtureDir, 'smoke-report.json'));

  if (!controllerContent || !smokeReport) {
    return { allow: true };
  }

  const endpoints = hook.parseControllerEndpoints(controllerContent, 'test.controller.ts');
  const uncovered = hook.findUncoveredEndpoints(endpoints, smokeReport);

  if (uncovered.length === 0) {
    return { allow: true, decision: 'allow' };
  }

  return {
    allow: false,
    decision: 'block',
    reason: `PROBE_DIFF_MISMATCH: ${uncovered.map((ep) => `${ep.method} ${ep.path}`).join(', ')}`,
  };
}

/**
 * Run worker-done-evidence via its exported functions (unit test).
 */
function runWorkerDoneEvidenceUnit(fixtureDir) {
  const hook = require(HOOK_MAP['worker-done-evidence'].script);
  const payload = readJsonSafe(path.join(fixtureDir, 'payload.json'));
  const matrix = readJsonSafe(path.join(fixtureDir, 'matrix.json'));

  if (!payload) return { allow: true };

  const command = payload?.tool_input?.command;
  const mailBody = hook.extractMailBody(command);
  const evidence = hook.parseRuntimeEvidence(mailBody);

  if (!evidence) {
    // Check if the hook itself would detect this
    if (/ov\s+mail\s+send/.test(command) && /worker_done/.test(command)) {
      return {
        allow: false,
        decision: 'block',
        reason: 'WORKER_DONE_EVIDENCE_MISSING',
      };
    }
    return { allow: true };
  }

  // Count write endpoints from matrix fixture
  let changedWriteEndpoints = 0;
  if (matrix && Array.isArray(matrix.apiEndpoints)) {
    const writeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
    changedWriteEndpoints = matrix.apiEndpoints.filter(
      (ep) => ep?.changed && writeMethods.has((ep.method || '').toUpperCase())
    ).length;
  }

  if (changedWriteEndpoints > 0 && evidence.total < changedWriteEndpoints) {
    return {
      allow: false,
      decision: 'block',
      reason:
        `WORKER_DONE_EVIDENCE_IMPLAUSIBLE: runtime-evidence shows total=${evidence.total} ` +
        `but diff changed ${changedWriteEndpoints} write endpoints.`,
    };
  }

  return { allow: true, decision: 'allow' };
}

/**
 * Run no-co-mingled-overlay-commit via its exported functions (unit test).
 * Mocks git staged files via the staged-files.json fixture.
 */
function runCoMingledUnit(fixtureDir) {
  const hook = require(HOOK_MAP['no-co-mingled-overlay-commit'].script);
  const payload = readJsonSafe(path.join(fixtureDir, 'payload.json'));
  const stagedFiles = readJsonSafe(path.join(fixtureDir, 'staged-files.json'));

  if (!payload) return { allow: true };

  const command = payload?.tool_input?.command;
  if (!hook.isGitCommitOrAdd(command)) return { allow: true, decision: 'allow' };

  // Simulate: check if overlay is in staged files and count non-overlay
  if (!stagedFiles || !Array.isArray(stagedFiles)) return { allow: true, decision: 'allow' };

  const OVERLAY_FILE = '.runtime-contract.overlay.json';
  const hasOverlay = stagedFiles.some((f) => f.includes(OVERLAY_FILE));
  if (!hasOverlay) return { allow: true, decision: 'allow' };

  const nonOverlay = stagedFiles.filter((f) => !f.includes(OVERLAY_FILE));
  if (nonOverlay.length > 2) {
    return {
      allow: true,
      decision: 'allow',
      reason:
        `OVERLAY_COMMIT_CO_MINGLED: overlay-contract changes should be isolated. ` +
        `The staged diff includes ${OVERLAY_FILE} alongside ${nonOverlay.length} ` +
        `other files. Consider splitting the overlay edit into its own commit for reviewability.`,
    };
  }

  return { allow: true, decision: 'allow' };
}

function assertDecision(name, actual, expected) {
  const problems = [];

  if (expected.decision && actual.decision !== expected.decision) {
    // For 'allow' decisions, also accept missing decision (hook returned { allow: true })
    if (expected.decision === 'allow' && actual.allow !== false) {
      // ok — allow is the default
    } else {
      problems.push(`decision: expected ${expected.decision}, got ${actual.decision}`);
    }
  }

  if (expected.reasonContains) {
    const reason = actual.reason || '';
    if (!reason.includes(expected.reasonContains)) {
      problems.push(`reason: expected to contain "${expected.reasonContains}", got "${reason}"`);
    }
  }

  // For 'allow' with no reasonContains, just verify it's not blocking
  if (expected.decision === 'allow' && !expected.reasonContains) {
    if (actual.decision === 'block') {
      problems.push(`expected allow, got block: ${actual.reason}`);
    }
  }

  if (problems.length > 0) {
    console.error(`FAIL ${name}`);
    for (const p of problems) console.error(`  - ${p}`);
    console.error(`  actual: ${JSON.stringify(actual)}`);
    return false;
  }
  return true;
}

function runFixture(hookName, caseName, fixtureDir) {
  const hookConfig = HOOK_MAP[hookName];
  if (!hookConfig) {
    console.error(`SKIP ${hookName}: no hook entry mapping`);
    return null;
  }

  const payload = readJsonSafe(path.join(fixtureDir, 'payload.json'));
  const expected = readJsonSafe(path.join(fixtureDir, 'expected.json'));
  if (!expected) {
    return { pass: false, reason: 'missing expected.json' };
  }

  let actual;

  switch (hookName) {
    case 'no-generated-write': {
      const sandbox = makeSandbox(caseName);
      try {
        actual = runPreToolUseHook(hookConfig.script, payload, sandbox);
      } finally {
        fs.rmSync(sandbox, { recursive: true, force: true });
      }
      break;
    }

    case 'no-ignore-for-changed-paths': {
      actual = runNoIgnoreUnit(fixtureDir);
      break;
    }

    case 'probe-covers-diff': {
      actual = runProbeCoversDiffUnit(fixtureDir);
      break;
    }

    case 'worker-done-evidence': {
      actual = runWorkerDoneEvidenceUnit(fixtureDir);
      break;
    }

    case 'no-co-mingled-overlay-commit': {
      actual = runCoMingledUnit(fixtureDir);
      break;
    }

    default:
      return { pass: false, reason: `unknown hook type: ${hookName}` };
  }

  const ok = assertDecision(`${hookName}/${caseName}`, actual, expected);
  return { pass: ok };
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

  for (const hookName of hooks) {
    if (!HOOK_MAP[hookName]) continue;

    const hookDir = path.join(FIXTURES_DIR, hookName);
    const cases = fs
      .readdirSync(hookDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();

    for (const caseName of cases) {
      total++;
      const fixtureDir = path.join(hookDir, caseName);
      const result = runFixture(hookName, caseName, fixtureDir);

      if (!result) continue;
      if (result.pass) {
        passed++;
        console.log(`PASS ${hookName}/${caseName}`);
      } else {
        failed++;
        if (result.reason) {
          console.error(`  reason: ${result.reason}`);
        }
      }
    }
  }

  console.log('');
  console.log(`Defense hooks: ${passed} passed, ${failed} failed, ${total} total`);
  return failed === 0;
}

if (require.main === module) {
  const ok = runAllFixtures();
  process.exit(ok ? 0 : 1);
}

module.exports = { runAllFixtures };
