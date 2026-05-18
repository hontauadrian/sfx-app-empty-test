'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execSync, spawnSync } = require('node:child_process');

/**
 * Run a gate command in its own process group and kill the entire group
 * after the wait completes. `execSync` only waits for its direct child
 * (pnpm); turbo + vitest grandchildren survive a non-zero exit and reparent
 * to PID 1, accumulating across retries until ENOMEM. Setting
 * `detached: true` gives the child a fresh process-group id equal to its
 * pid; sending SIGKILL to `-pid` then nukes every member of that group,
 * regardless of whether they exited cleanly. Safe on pass: if the group is
 * already empty, `process.kill` throws ESRCH which we swallow.
 */
function runGateAndKillGroup(command, options) {
  const result = spawnSync(command, {
    shell: true,
    detached: true,
    ...options,
  });
  if (result.pid) {
    try {
      process.kill(-result.pid, 'SIGKILL');
    } catch (_killErr) {
      /* group already drained — expected on clean exits */
    }
  }
  return result;
}

function computeGateStateHash(projectDir) {
  const sh = (cmd) => {
    try {
      return execSync(cmd, {
        cwd: projectDir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        maxBuffer: 50 * 1024 * 1024,
      });
    } catch {
      return '';
    }
  };
  const baseBranch =
    sh('git symbolic-ref refs/remotes/origin/HEAD').trim().replace('refs/remotes/origin/', '') ||
    'master';
  const mergeBase = sh(`git merge-base HEAD origin/${baseBranch}`).trim();
  const excludes = [
    "':(exclude,glob)**/*.tsbuildinfo'",
    "':(exclude,glob)*.tsbuildinfo'",
    "':(exclude,glob)**/*.png'",
    "':(exclude,glob)*.png'",
    "':(exclude,glob)**/*.jpg'",
    "':(exclude,glob)*.jpg'",
    "':(exclude,glob)**/*.jpeg'",
    "':(exclude,glob)*.jpeg'",
    "':(exclude,glob)**/*.webp'",
    "':(exclude,glob)*.webp'",
    "':(exclude,glob).claude/**'",
    "':(exclude,glob).overstory/**'",
    "':(exclude,glob).mulch/**'",
    "':(exclude,glob).seeds/**'",
    "':(exclude,glob).canopy/**'",
    "':(exclude,glob).bridge.*'",
    "':(exclude,glob)._*'",
    "':(exclude,glob).DS_Store'",
  ].join(' ');
  const range = mergeBase ? `${mergeBase} HEAD` : 'HEAD';
  const diff = sh(`git diff ${range} -- . ${excludes}`);
  return crypto.createHash('sha1').update(diff).digest('hex').slice(0, 12);
}

const QUALITY_GATES = [
  { name: 'Typecheck', command: 'pnpm typecheck' },
  { name: 'Lint', command: 'pnpm lint' },
  { name: 'Tests + coverage', command: 'pnpm test:coverage' },
  { name: 'Integration tests', command: 'pnpm test:integration' },
  { name: 'Probe smoke', command: 'pnpm probe:smoke' },
];

const LOCK_STALE_MS = 30 * 60 * 1000;
const LOCK_POLL_INTERVAL_MS = 2000;

function acquireLock(lockPath) {
  try {
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    const fd = fs.openSync(lockPath, 'wx');
    fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    fs.closeSync(fd);
    return true;
  } catch (error) {
    if (error && error.code === 'EEXIST') return false;
    return false;
  }
}

function readLockAgeMs(lockPath) {
  try {
    return Date.now() - fs.statSync(lockPath).mtimeMs;
  } catch {
    return Infinity;
  }
}

function releaseLock(lockPath) {
  try {
    fs.unlinkSync(lockPath);
  } catch {
    /* best-effort */
  }
}

function sleepSync(ms) {
  const sab = new SharedArrayBuffer(4);
  const view = new Int32Array(sab);
  Atomics.wait(view, 0, 0, ms);
}

function waitForLockOrMarker(lockPath, markerPath) {
  while (true) {
    if (fs.existsSync(markerPath)) return { reason: 'marker' };
    if (!fs.existsSync(lockPath)) return { reason: 'released' };
    if (readLockAgeMs(lockPath) >= LOCK_STALE_MS) {
      releaseLock(lockPath);
      return { reason: 'stale' };
    }
    sleepSync(LOCK_POLL_INTERVAL_MS);
  }
}

function checkQualityGates({ projectDir }) {
  if (!fs.existsSync(path.join(projectDir, 'package.json'))) return null;
  if (!fs.existsSync(path.join(projectDir, 'node_modules'))) return null;

  const stateHash = computeGateStateHash(projectDir);
  const markerDir = path.join(projectDir, '.claude', 'hook-reports');
  const markerPath = path.join(markerDir, `quality-gates-pass-${stateHash}.json`);
  if (fs.existsSync(markerPath)) {
    return null;
  }

  const lockPath = path.join(markerDir, `quality-gates-running-${stateHash}.lock`);
  while (true) {
    if (fs.existsSync(lockPath)) {
      const waitOutcome = waitForLockOrMarker(lockPath, markerPath);
      if (waitOutcome.reason === 'marker') {
        return null;
      }
    }
    if (acquireLock(lockPath)) break;
  }

  try {
    if (fs.existsSync(markerPath)) {
      return null;
    }
    for (const gate of QUALITY_GATES) {
      const result = runGateAndKillGroup(gate.command, {
        cwd: projectDir,
        stdio: 'pipe',
        env: {
          ...process.env,
          CI: '1',
          FORCE_COLOR: '0',
          TURBO_CONCURRENCY: '1',
          VITEST_MAX_THREADS: '2',
          VITEST_MIN_THREADS: '1',
        },
      });
      if (result.status !== 0) {
        const stdout = result.stdout ? result.stdout.toString() : '';
        const stderr = result.stderr ? result.stderr.toString() : '';
        const combined = `${stdout}\n${stderr}`.trim() || 'Command failed with no output';
        const tail = combined.split('\n').slice(-40).join('\n');
        return [
          `${gate.name} failed when running \`${gate.command}\`.`,
          '',
          'Last output (tail):',
          '```',
          tail,
          '```',
          '',
          'This gate runs the real quality checks against current code state.',
          'Stale evidence from earlier commits will not satisfy it. Fix the failing',
          'code or tests, re-run the command locally until it passes, then retry.',
        ].join('\n');
      }
    }

    try {
      fs.mkdirSync(markerDir, { recursive: true });
      fs.writeFileSync(
        markerPath,
        JSON.stringify(
          {
            stateHash,
            timestamp: new Date().toISOString(),
            gates: QUALITY_GATES.map((g) => g.name),
          },
          null,
          2,
        ),
      );
    } catch {
      /* best-effort cache write; never fail the gate because of cache failure */
    }
    return null;
  } finally {
    releaseLock(lockPath);
  }
}

module.exports = {
  computeGateStateHash,
  checkQualityGates,
  QUALITY_GATES,
};
