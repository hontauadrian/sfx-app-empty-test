import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { mkdtempSync, writeFileSync, appendFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  splitCommand,
  isStackHealthy,
  loadDefaultHealthPaths,
  deriveStatusCmd,
  pollStackStatus,
  scanLogForFastFail,
  tailLastLine,
  pollUntilReady,
} from '../boot-orchestrator';

test('splitCommand handles simple tokens', () => {
  assert.deepEqual(splitCommand('foo bar baz'), ['foo', 'bar', 'baz']);
});

test('splitCommand preserves quoted args', () => {
  assert.deepEqual(splitCommand('foo "bar baz" qux'), ['foo', 'bar baz', 'qux']);
});

test('splitCommand handles empty string', () => {
  assert.deepEqual(splitCommand(''), []);
});

test('splitCommand handles extra whitespace', () => {
  assert.deepEqual(splitCommand('  foo   bar  '), ['foo', 'bar']);
});

test('splitCommand handles single quotes', () => {
  assert.deepEqual(splitCommand("foo 'bar baz'"), ['foo', 'bar baz']);
});

test('loadDefaultHealthPaths returns a sane default', () => {
  const paths = loadDefaultHealthPaths();
  assert.ok(paths.api.length > 0);
  assert.ok(paths.web.length > 0);
  assert.ok(paths.api.some((p) => p.includes('health')));
});

test('isStackHealthy returns ok when api health responds 2xx', async () => {
  const api = createServer((req, res) => {
    if (req.url?.startsWith('/api/v1/health')) { res.statusCode = 200; res.end('{}'); return; }
    res.statusCode = 404;
    res.end();
  });
  await new Promise<void>((r) => api.listen(0, '127.0.0.1', () => r()));
  const apiPort = (api.address() as AddressInfo).port;
  try {
    const result = await isStackHealthy({ api_port: apiPort }, { api: ['/api/v1/health'], web: ['/'] });
    assert.equal(result.ok, true);
  } finally {
    await new Promise<void>((r) => api.close(() => r()));
  }
});

test('isStackHealthy fails when api health does not respond', async () => {
  // Pick a port that is almost certainly not bound.
  const result = await isStackHealthy({ api_port: 1 }, { api: ['/health'], web: ['/'] });
  assert.equal(result.ok, false);
  assert.match(result.reason, /api :1/);
});

test('isStackHealthy passes when all configured ports respond', async () => {
  const web = createServer((_q, res) => { res.statusCode = 200; res.end('ok'); });
  await new Promise<void>((r) => web.listen(0, '127.0.0.1', () => r()));
  const webPort = (web.address() as AddressInfo).port;
  try {
    const result = await isStackHealthy({ web_port: webPort }, { api: ['/health'], web: ['/'] });
    assert.equal(result.ok, true);
  } finally {
    await new Promise<void>((r) => web.close(() => r()));
  }
});

test('isStackHealthy skips probes when port undefined', async () => {
  const result = await isStackHealthy({}, { api: ['/health'], web: ['/'] });
  assert.equal(result.ok, true);
});

// ── deriveStatusCmd ─────────────────────────────────────────────────

test('deriveStatusCmd swaps trailing "start" with "status"', () => {
  assert.equal(deriveStatusCmd('scripts/worktree-stack.sh start'), 'scripts/worktree-stack.sh status');
});

test('deriveStatusCmd swaps "start" even with args after it', () => {
  assert.equal(deriveStatusCmd('scripts/worktree-stack.sh start --detach'), 'scripts/worktree-stack.sh status');
});

test('deriveStatusCmd appends "status" if no "start" present', () => {
  assert.equal(deriveStatusCmd('foo bar baz'), 'foo bar baz status');
});

test('deriveStatusCmd handles multi-segment paths', () => {
  assert.equal(
    deriveStatusCmd('./path/to/script.sh start'),
    './path/to/script.sh status',
  );
});

// ── pollStackStatus ─────────────────────────────────────────────────

function makeStatusScript(dir: string, body: string): string {
  const path = join(dir, 'status.sh');
  writeFileSync(path, `#!/usr/bin/env bash\n${body}\n`);
  chmodSync(path, 0o755);
  return path;
}

test('pollStackStatus parses valid JSON', () => {
  const dir = mkdtempSync(join(tmpdir(), 'status-'));
  const json = JSON.stringify({
    has_stack_file: true, starting: false, start_pid: null,
    pg:  { state: 'up', port: 5432 },
    api: { state: 'up', port: 16000 },
    web: { state: 'up', port: 26000 },
    turbo_watch: { state: 'up' },
  });
  const script = makeStatusScript(dir, `cat <<EOF\n${json}\nEOF`);
  const result = pollStackStatus(`bash ${script}`);
  assert.ok(result);
  assert.equal(result?.api.state, 'up');
  assert.equal(result?.api.port, 16000);
});

test('pollStackStatus returns null on garbage output', () => {
  const dir = mkdtempSync(join(tmpdir(), 'status-'));
  const script = makeStatusScript(dir, 'echo "not json {"');
  const result = pollStackStatus(`bash ${script}`);
  assert.equal(result, null);
});

test('pollStackStatus returns null on non-zero exit', () => {
  const dir = mkdtempSync(join(tmpdir(), 'status-'));
  const script = makeStatusScript(dir, 'echo "{}"; exit 1');
  const result = pollStackStatus(`bash ${script}`);
  assert.equal(result, null);
});

test('pollStackStatus returns null on missing executable', () => {
  const result = pollStackStatus('/no/such/binary-asdf-12345');
  assert.equal(result, null);
});

// ── scanLogForFastFail ──────────────────────────────────────────────

test('scanLogForFastFail matches EADDRINUSE', () => {
  const dir = mkdtempSync(join(tmpdir(), 'log-'));
  const path = join(dir, 'a.log');
  writeFileSync(path, 'starting\nError: listen EADDRINUSE: address already in use :::3000\n');
  const result = scanLogForFastFail(path, 0);
  assert.equal(result.matched, true);
  assert.equal(result.pattern, 'EADDRINUSE');
});

test('scanLogForFastFail matches MODULE_NOT_FOUND', () => {
  const dir = mkdtempSync(join(tmpdir(), 'log-'));
  const path = join(dir, 'a.log');
  writeFileSync(path, "Error: Cannot find module 'foo'\n");
  const result = scanLogForFastFail(path, 0);
  assert.equal(result.matched, true);
  assert.equal(result.pattern, 'MODULE_NOT_FOUND');
});

test('scanLogForFastFail matches TS_COMPILE_ERROR', () => {
  const dir = mkdtempSync(join(tmpdir(), 'log-'));
  const path = join(dir, 'a.log');
  writeFileSync(path, 'src/foo.ts(10,5): error TS2304: Cannot find name X.\n');
  const result = scanLogForFastFail(path, 0);
  assert.equal(result.matched, true);
  assert.equal(result.pattern, 'TS_COMPILE_ERROR');
});

test('scanLogForFastFail matches PRISMA_SCHEMA', () => {
  const dir = mkdtempSync(join(tmpdir(), 'log-'));
  const path = join(dir, 'a.log');
  writeFileSync(path, 'Prisma schema validation - some failure\n');
  const result = scanLogForFastFail(path, 0);
  assert.equal(result.matched, true);
  assert.equal(result.pattern, 'PRISMA_SCHEMA');
});

test('scanLogForFastFail matches PG_REFUSED', () => {
  const dir = mkdtempSync(join(tmpdir(), 'log-'));
  const path = join(dir, 'a.log');
  writeFileSync(path, 'connect ECONNREFUSED 127.0.0.1:5432\n');
  const result = scanLogForFastFail(path, 0);
  assert.equal(result.matched, true);
  assert.equal(result.pattern, 'PG_REFUSED');
});

test('scanLogForFastFail matches NEST_DI_FAILURE', () => {
  const dir = mkdtempSync(join(tmpdir(), 'log-'));
  const path = join(dir, 'a.log');
  writeFileSync(path, "Nest can't resolve dependencies of FooService\n");
  const result = scanLogForFastFail(path, 0);
  assert.equal(result.matched, true);
  assert.equal(result.pattern, 'NEST_DI_FAILURE');
});

test('scanLogForFastFail matches JWT_SECRET_MISSING', () => {
  const dir = mkdtempSync(join(tmpdir(), 'log-'));
  const path = join(dir, 'a.log');
  writeFileSync(path, 'JwtStrategy requires a secret or key\n');
  const result = scanLogForFastFail(path, 0);
  assert.equal(result.matched, true);
  assert.equal(result.pattern, 'JWT_SECRET_MISSING');
});

test('scanLogForFastFail returns false on benign content', () => {
  const dir = mkdtempSync(join(tmpdir(), 'log-'));
  const path = join(dir, 'a.log');
  writeFileSync(path, 'Server starting on port 3000\nReady.\n');
  const result = scanLogForFastFail(path, 0);
  assert.equal(result.matched, false);
});

test('scanLogForFastFail does not re-match already-seen content via offset', () => {
  const dir = mkdtempSync(join(tmpdir(), 'log-'));
  const path = join(dir, 'a.log');
  const initial = 'EADDRINUSE error here\n';
  writeFileSync(path, initial);
  const first = scanLogForFastFail(path, 0);
  assert.equal(first.matched, true);
  const second = scanLogForFastFail(path, first.newOffsetByte);
  assert.equal(second.matched, false);
});

test('scanLogForFastFail detects newly appended fast-fail line', () => {
  const dir = mkdtempSync(join(tmpdir(), 'log-'));
  const path = join(dir, 'a.log');
  writeFileSync(path, 'starting up\n');
  const first = scanLogForFastFail(path, 0);
  assert.equal(first.matched, false);
  appendFileSync(path, 'EADDRINUSE: address in use\n');
  const second = scanLogForFastFail(path, first.newOffsetByte);
  assert.equal(second.matched, true);
  assert.equal(second.pattern, 'EADDRINUSE');
});

test('scanLogForFastFail returns matched=false for missing file', () => {
  const result = scanLogForFastFail('/no/such/path.log', 0);
  assert.equal(result.matched, false);
});

// ── tailLastLine ───────────────────────────────────────────────────

test('tailLastLine returns empty for missing file', () => {
  assert.equal(tailLastLine('/no/such/file.log'), '');
});

test('tailLastLine returns empty for empty file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'log-'));
  const path = join(dir, 'a.log');
  writeFileSync(path, '');
  assert.equal(tailLastLine(path), '');
});

test('tailLastLine returns last non-empty line', () => {
  const dir = mkdtempSync(join(tmpdir(), 'log-'));
  const path = join(dir, 'a.log');
  writeFileSync(path, 'one\ntwo\nthree\n\n\n');
  assert.equal(tailLastLine(path), 'three');
});

test('tailLastLine returns single-line file content', () => {
  const dir = mkdtempSync(join(tmpdir(), 'log-'));
  const path = join(dir, 'a.log');
  writeFileSync(path, 'only one line');
  assert.equal(tailLastLine(path), 'only one line');
});

// ── pollUntilReady integration ─────────────────────────────────────

function makeStatefulStatusScript(dir: string, name: string, states: string[]): string {
  // states[i] = JSON to emit on call i (clamps to last entry).
  // Uses a counter file in dir.
  const counter = join(dir, `${name}.counter`);
  writeFileSync(counter, '0');
  const stateFiles: string[] = states.map((json, i) => {
    const p = join(dir, `${name}.state.${i}.json`);
    writeFileSync(p, json);
    return p;
  });
  const path = join(dir, `${name}.sh`);
  const body = `#!/usr/bin/env bash
set -e
COUNTER_FILE="${counter}"
N=$(cat "$COUNTER_FILE")
MAX=${stateFiles.length - 1}
if [ "$N" -gt "$MAX" ]; then N=$MAX; fi
cat "${dir}/${name}.state.$N.json"
echo $((N + 1)) > "$COUNTER_FILE"
`;
  writeFileSync(path, body);
  chmodSync(path, 0o755);
  return path;
}

const allUp = JSON.stringify({
  has_stack_file: true, starting: false, start_pid: null,
  pg: { state: 'up', port: 5432 },
  api: { state: 'up', port: 16000 },
  web: { state: 'up', port: 26000 },
  turbo_watch: { state: 'up' },
});
const apiStarting = JSON.stringify({
  has_stack_file: true, starting: true, start_pid: 12345,
  pg: { state: 'up', port: 5432 },
  api: { state: 'starting', port: 16000 },
  web: { state: 'down', port: null },
  turbo_watch: { state: 'up' },
});
const allDown = JSON.stringify({
  has_stack_file: false, starting: false, start_pid: null,
  pg: { state: 'down', port: null },
  api: { state: 'down', port: null },
  web: { state: 'down', port: null },
  turbo_watch: { state: 'down' },
});

test('pollUntilReady returns ready when all up', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'poll-'));
  const script = makeStatefulStatusScript(dir, 's1', [allUp]);
  const apiLog = join(dir, '.api.log');
  const webLog = join(dir, '.web.log');
  const startLog = join(dir, '.start.log');
  writeFileSync(apiLog, ''); writeFileSync(webLog, ''); writeFileSync(startLog, '');
  const result = await pollUntilReady({
    statusCmd: `bash ${script}`,
    apiLogPath: apiLog,
    webLogPath: webLog,
    startLogPath: startLog,
    hardCeilingMs: 2000,
    stallThresholdMs: 1000,
    pollIntervalMs: 50,
  });
  assert.equal(result.kind, 'ready');
});

test('pollUntilReady returns stalled when status frozen past threshold', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'poll-'));
  // Returns apiStarting forever — never advances.
  const script = makeStatefulStatusScript(dir, 's2', [apiStarting]);
  const apiLog = join(dir, '.api.log');
  const webLog = join(dir, '.web.log');
  const startLog = join(dir, '.start.log');
  writeFileSync(apiLog, ''); writeFileSync(webLog, ''); writeFileSync(startLog, '');
  const result = await pollUntilReady({
    statusCmd: `bash ${script}`,
    apiLogPath: apiLog,
    webLogPath: webLog,
    startLogPath: startLog,
    hardCeilingMs: 5000,
    stallThresholdMs: 200,
    pollIntervalMs: 50,
  });
  assert.equal(result.kind, 'stalled');
  assert.match(result.message, /stalled/);
});

test('pollUntilReady returns fast_failed when log contains EADDRINUSE', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'poll-'));
  const script = makeStatefulStatusScript(dir, 's3', [apiStarting]);
  const apiLog = join(dir, '.api.log');
  const webLog = join(dir, '.web.log');
  const startLog = join(dir, '.start.log');
  writeFileSync(apiLog, ''); writeFileSync(webLog, ''); writeFileSync(startLog, '');
  const result = pollUntilReady({
    statusCmd: `bash ${script}`,
    apiLogPath: apiLog,
    webLogPath: webLog,
    startLogPath: startLog,
    hardCeilingMs: 5000,
    stallThresholdMs: 5000,
    pollIntervalMs: 50,
  });
  // Append the fatal line shortly after starting the poll so the scanner
  // sees it as newly-appended (offset-tracked).
  setTimeout(() => {
    appendFileSync(apiLog, 'Error: listen EADDRINUSE :::16000\n');
  }, 100);
  const finished = await result;
  assert.equal(finished.kind, 'fast_failed');
  assert.match(finished.message, /EADDRINUSE/);
});

test('pollUntilReady returns timeout when nothing happens but log keeps growing', async () => {
  // Use down state and stall threshold > hard ceiling so timeout wins.
  const dir = mkdtempSync(join(tmpdir(), 'poll-'));
  const script = makeStatefulStatusScript(dir, 's4', [allDown]);
  const apiLog = join(dir, '.api.log');
  const webLog = join(dir, '.web.log');
  const startLog = join(dir, '.start.log');
  writeFileSync(apiLog, ''); writeFileSync(webLog, ''); writeFileSync(startLog, '');
  // Append benign progress so stall detector keeps resetting until ceiling hit.
  const interval = setInterval(() => {
    try { appendFileSync(apiLog, `progress ${Date.now()}\n`); } catch { /* ignore */ }
  }, 50);
  try {
    const result = await pollUntilReady({
      statusCmd: `bash ${script}`,
      apiLogPath: apiLog,
      webLogPath: webLog,
      startLogPath: startLog,
      hardCeilingMs: 400,
      stallThresholdMs: 10_000,
      pollIntervalMs: 50,
    });
    assert.equal(result.kind, 'timeout');
  } finally {
    clearInterval(interval);
  }
});

test('pollUntilReady does not stall when status changes within window', async () => {
  // status: down → starting → up across 3 calls.
  const dir = mkdtempSync(join(tmpdir(), 'poll-'));
  const script = makeStatefulStatusScript(dir, 's5', [allDown, apiStarting, allUp]);
  const apiLog = join(dir, '.api.log');
  const webLog = join(dir, '.web.log');
  const startLog = join(dir, '.start.log');
  writeFileSync(apiLog, ''); writeFileSync(webLog, ''); writeFileSync(startLog, '');
  const result = await pollUntilReady({
    statusCmd: `bash ${script}`,
    apiLogPath: apiLog,
    webLogPath: webLog,
    startLogPath: startLog,
    hardCeilingMs: 5000,
    stallThresholdMs: 200,
    pollIntervalMs: 50,
  });
  assert.equal(result.kind, 'ready');
});
