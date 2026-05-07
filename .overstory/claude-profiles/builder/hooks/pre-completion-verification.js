const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

let input = {};
try {
  const raw = fs.readFileSync(0, 'utf8').trim();
  if (raw) input = JSON.parse(raw);
} catch {
  // stdin may be empty when run as a quality gate command (not a Stop hook)
}

const projectRoot = process.env.HOOK_TEST_PROJECT_ROOT || path.resolve(__dirname, '..', '..');

if (!fs.existsSync(path.join(projectRoot, 'package.json'))) {
  process.exit(0);
}

if (!fs.existsSync(path.join(projectRoot, 'node_modules', '.bin', 'tsc'))) {
  process.exit(0);
}

const checks = [
  { command: 'pnpm run typecheck', label: 'Type errors' },
  { command: 'pnpm run lint', label: 'Lint errors' },
  { command: 'pnpm run test:coverage', label: 'Test failures' },
  { command: 'pnpm run test:integration', label: 'Integration test failures' },
];

const TIMEOUT_MS = 120000;

// Spawn each check in its own process group (detached: true → setsid).
// Reaping the negative PID on exit/timeout/signal kills the entire tree
// (pnpm → vitest → worker pool). execSync would leave the worker pool
// detached and adopted by init when the hook itself was killed.
//
// SIGKILL of the hook bypasses Node signal handlers, so a per-check
// detached watchdog also polls our pid and reaps the child group when
// the hook disappears (e.g. Claude Code timeout enforcement).
function spawnWatchdog(parentPid, childPid) {
  const code = `
const parent = ${parentPid};
const child = ${childPid};
const interval = setInterval(() => {
  try { process.kill(parent, 0); }
  catch {
    try { process.kill(-child, 'SIGKILL'); } catch {}
    clearInterval(interval);
    process.exit(0);
  }
}, 500);
process.on('SIGUSR1', () => { clearInterval(interval); process.exit(0); });
`;
  const wd = spawn(process.execPath, ['-e', code], {
    detached: true,
    stdio: 'ignore',
  });
  wd.unref();
  return wd;
}

function runCheck(check) {
  return new Promise((resolve) => {
    const child = spawn('sh', ['-c', check.command], {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });

    const watchdog = spawnWatchdog(process.pid, child.pid);

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
      if (stdout.length > 4000) stdout = stdout.slice(-4000);
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 4000) stderr = stderr.slice(-4000);
    });

    const killGroup = (signal) => {
      try {
        process.kill(-child.pid, signal);
      } catch {}
    };
    const dismissWatchdog = () => {
      try { process.kill(watchdog.pid, 'SIGUSR1'); } catch {}
    };

    const timer = setTimeout(() => {
      killGroup('SIGKILL');
    }, TIMEOUT_MS);
    timer.unref();

    const onParentExit = () => killGroup('SIGKILL');
    process.once('exit', onParentExit);
    process.once('SIGTERM', () => { killGroup('SIGKILL'); process.exit(143); });
    process.once('SIGINT', () => { killGroup('SIGKILL'); process.exit(130); });
    process.once('SIGHUP', () => { killGroup('SIGKILL'); process.exit(129); });

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      process.removeListener('exit', onParentExit);
      dismissWatchdog();
      resolve({
        code,
        signal,
        stdout: stdout.slice(-500),
        stderr: stderr.slice(-500),
      });
    });
  });
}

(async () => {
  for (const check of checks) {
    const result = await runCheck(check);
    if (result.code !== 0) {
      const output = result.stderr || result.stdout || (result.signal ? `killed by ${result.signal}` : 'Command failed with no output');
      console.log(
        JSON.stringify({
          decision: 'block',
          reason: check.label + ' detected. Fix before completing.\n' + output,
        })
      );
      process.exit(0);
    }
  }
  process.exit(0);
})();
