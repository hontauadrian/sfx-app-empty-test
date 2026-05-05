/**
 * Stack boot + readiness orchestration. Driver path (preferred) or generic
 * fallback (package-json / docker-compose / turbo / none).
 *
 * Never duplicates driver logic: for worktree-stack, we simply exec the
 * driver and trust its exit code + `.stack.json`. For generic drivers we
 * spawn detached so SIGTERM on the probe kills the whole tree.
 */

import { spawn, spawnSync, execSync, ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { connect as tcpConnect } from 'node:net';
import { BootPlan } from './matrix-loader';
import { PROJECT_ROOT } from './shared';

export interface BootResult {
  ownership: 'owner' | 'guest';
  ports: StackPorts | null;
  reused: boolean;
  baseUrls: {
    web: string;
    api: string;
  };
  error?: {
    kind: 'STACK_BOOT_FAILED' | 'STACK_UNHEALTHY' | 'STACK_PORT_CONFLICT' | 'STACK_DRIVER_MISSING';
    message: string;
    hint?: string;
    logs?: string;
  };
}

export interface StackPorts {
  pg_port?: number;
  api_port?: number;
  web_port?: number;
  [key: string]: number | undefined;
}

export interface BootOptions {
  bootTimeoutSec?: number;
  readinessTimeoutSec?: number;
  reuseRunning?: boolean;
  keepStack?: boolean;
  healthPaths?: { api: string[]; web: string[] };
  logDir?: string;
}

export interface StackFile {
  pg_port?: number;
  api_port?: number;
  web_port?: number;
  db_url?: string;
  is_worktree?: boolean;
  pid?: number;
  started_at?: string;
  [key: string]: unknown;
}

const DEFAULT_BOOT_TIMEOUT = 360;          // hard ceiling (was 180)
const DEFAULT_READY_TIMEOUT = 60;
const POLL_INTERVAL_MS = 3000;             // status poll cadence
const STALL_THRESHOLD_MS = 60_000;         // 60s no progress = stuck
const DETACH_SPAWN_TIMEOUT_S = 10;         // detach call should return fast
const FAST_FAIL_PATTERNS: Array<{ name: string; rx: RegExp }> = [
  { name: 'EADDRINUSE',          rx: /EADDRINUSE/ },
  { name: 'MODULE_NOT_FOUND',    rx: /Cannot find module ['"]/ },
  { name: 'TS_COMPILE_ERROR',    rx: /error TS\d+:/ },
  { name: 'PRISMA_SCHEMA',       rx: /Prisma schema validation/i },
  { name: 'PG_REFUSED',          rx: /connect ECONNREFUSED.*:543\d/ },
  { name: 'NEST_DI_FAILURE',     rx: /Nest can't resolve dependencies/ },
  { name: 'JWT_SECRET_MISSING',  rx: /JwtStrategy requires a secret/ },
];

export function readStackFile(): StackFile | null {
  const path = join(PROJECT_ROOT, '.stack.json');
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as StackFile;
  } catch {
    return null;
  }
}

export async function runBootOrchestrator(plan: BootPlan, options: BootOptions = {}): Promise<BootResult> {
  const logDir = options.logDir ?? join(PROJECT_ROOT, '.claude', 'hooks', '.smoke-logs');
  ensureDir(logDir);
  rotateOldLogs(logDir, 7 * 24 * 60 * 60 * 1000);

  const healthPaths = options.healthPaths ?? loadDefaultHealthPaths();
  const reuseRunning = options.reuseRunning ?? process.env.HTTP_SMOKE_REUSE_RUNNING !== '0';

  // Step 1: reuse healthy stack if present.
  const existing = readStackFile();
  if (existing && reuseRunning) {
    const healthy = await isStackHealthy(existing, healthPaths);
    if (healthy.ok) {
      return {
        ownership: 'guest',
        ports: toPorts(existing),
        reused: true,
        baseUrls: buildBaseUrls(existing),
      };
    }
    // Stale — attempt cleanup via driver stopCmd if available.
    if (plan.stopCmd) {
      try {
        await runCommand(plan.stopCmd, { cwd: PROJECT_ROOT, timeoutSec: 30, logPath: join(logDir, `stop-stale-${timestamp()}.log`) });
      } catch {
        // best-effort
      }
    }
  }

  // Step 2: invoke driver startCmd (or generic fallback).
  if (plan.driver === 'worktree-stack' || (plan.startCmd && plan.stopCmd && plan.portsCmd)) {
    return bootViaDriver(plan, {
      ...options,
      logDir,
      healthPaths,
    });
  }

  if (plan.driver === 'none') {
    // Caller expects an already-running stack and didn't get one.
    return {
      ownership: 'owner',
      ports: null,
      reused: false,
      baseUrls: { web: '', api: '' },
      error: {
        kind: 'STACK_DRIVER_MISSING',
        message: 'bootPlan.driver === "none" and no running stack detected',
        hint: 'start the dev stack manually or configure a boot driver in plan 02',
      },
    };
  }

  if (plan.driver === 'package-json' || plan.driver === 'docker-compose' || plan.driver === 'turbo') {
    return bootViaGeneric(plan, { ...options, logDir, healthPaths });
  }

  return {
    ownership: 'owner',
    ports: null,
    reused: false,
    baseUrls: { web: '', api: '' },
    error: {
      kind: 'STACK_DRIVER_MISSING',
      message: `unknown bootPlan.driver=${plan.driver}`,
      hint: 'derive-test-matrix must emit a supported driver',
    },
  };
}

async function bootViaDriver(plan: BootPlan, options: BootOptions & { logDir: string; healthPaths: { api: string[]; web: string[] } }): Promise<BootResult> {
  const logDir = options.logDir;
  if (!plan.startCmd || !plan.stopCmd) {
    return {
      ownership: 'owner',
      ports: null,
      reused: false,
      baseUrls: { web: '', api: '' },
      error: { kind: 'STACK_DRIVER_MISSING', message: 'bootPlan.startCmd / stopCmd missing' },
    };
  }

  // Driver-script existence check (optional but useful diagnostic).
  if (plan.driverPath) {
    const driverFull = join(PROJECT_ROOT, plan.driverPath);
    if (!existsSync(driverFull)) {
      return {
        ownership: 'owner',
        ports: null,
        reused: false,
        baseUrls: { web: '', api: '' },
        error: {
          kind: 'STACK_DRIVER_MISSING',
          message: `driver script not found: ${plan.driverPath}`,
          hint: `expected ${driverFull}`,
        },
      };
    }
  }

  // Preview ports (cheap probe, 5s timeout). Failure here is non-fatal.
  if (plan.portsCmd) {
    try {
      await runCommand(plan.portsCmd, { cwd: PROJECT_ROOT, timeoutSec: 5, logPath: join(logDir, `ports-${timestamp()}.log`) });
    } catch {
      // ignore
    }
  }

  const startLog = join(logDir, `start-${timestamp()}.log`);

  // Worktree-stack supports detach + status polling; other drivers do not.
  if (plan.driver !== 'worktree-stack') {
    return await bootViaDriverLegacy(plan, options, startLog);
  }

  // 1. Spawn boot script in detach mode (returns ~immediately, exits 0).
  const detachCmd = `${plan.startCmd} --detach`;
  try {
    await runCommand(detachCmd, {
      cwd: PROJECT_ROOT,
      timeoutSec: DETACH_SPAWN_TIMEOUT_S,
      logPath: startLog,
    });
  } catch {
    // Detach unsupported — fall back to legacy synchronous boot
    return await bootViaDriverLegacy(plan, options, startLog);
  }

  // 2. Derive statusCmd by swapping trailing "start" for "status".
  const statusCmd = deriveStatusCmd(plan.startCmd);

  // 3. Poll loop with three-layer escape valve.
  const pollResult = await pollUntilReady({
    statusCmd,
    apiLogPath: join(PROJECT_ROOT, '.api.log'),
    webLogPath: join(PROJECT_ROOT, '.web.log'),
    startLogPath: startLog,
    hardCeilingMs: (options.bootTimeoutSec ?? DEFAULT_BOOT_TIMEOUT) * 1000,
    stallThresholdMs: STALL_THRESHOLD_MS,
    pollIntervalMs: POLL_INTERVAL_MS,
  });

  if (pollResult.kind !== 'ready') {
    return {
      ownership: 'owner',
      ports: null,
      reused: false,
      baseUrls: { web: '', api: '' },
      error: {
        kind: 'STACK_BOOT_FAILED',
        message: pollResult.message,
        hint: pollResult.hint,
        logs: pollResult.diagnostics,
      },
    };
  }

  const finalStack = readStackFile();
  if (!finalStack) {
    return {
      ownership: 'owner',
      ports: null,
      reused: false,
      baseUrls: { web: '', api: '' },
      error: {
        kind: 'STACK_BOOT_FAILED',
        message: 'status poll returned ready but .stack.json was not written',
        hint: 'driver is broken or is not writing the expected stackFile; diagnose with: scripts/worktree-stack.sh status; try: scripts/worktree-stack.sh reset',
      },
    };
  }

  const healthy = await isStackHealthy(finalStack, options.healthPaths);
  if (!healthy.ok) {
    try {
      if (plan.stopCmd) await runCommand(plan.stopCmd, { cwd: PROJECT_ROOT, timeoutSec: 30, logPath: join(logDir, `stop-unhealthy-${timestamp()}.log`) });
    } catch {
      // best-effort
    }
    return {
      ownership: 'owner',
      ports: null,
      reused: false,
      baseUrls: { web: '', api: '' },
      error: {
        kind: 'STACK_UNHEALTHY',
        message: healthy.reason,
        hint: 'driver reported ready but health probes failed; diagnose with: scripts/worktree-stack.sh status; try: scripts/worktree-stack.sh reset',
        logs: tailLog(join(PROJECT_ROOT, '.api.log'), 50),
      },
    };
  }

  registerCleanupHook(plan, 'owner', !!options.keepStack);

  return {
    ownership: 'owner',
    ports: toPorts(finalStack),
    reused: false,
    baseUrls: buildBaseUrls(finalStack),
  };
}

async function bootViaDriverLegacy(
  plan: BootPlan,
  options: BootOptions & { logDir: string; healthPaths: { api: string[]; web: string[] } },
  startLog?: string,
): Promise<BootResult> {
  const logDir = options.logDir;
  const sLog = startLog ?? join(logDir, `start-${timestamp()}.log`);
  const bootTimeout = options.bootTimeoutSec ?? DEFAULT_BOOT_TIMEOUT;

  if (!plan.startCmd || !plan.stopCmd) {
    return {
      ownership: 'owner',
      ports: null,
      reused: false,
      baseUrls: { web: '', api: '' },
      error: { kind: 'STACK_DRIVER_MISSING', message: 'bootPlan.startCmd / stopCmd missing' },
    };
  }

  try {
    await runCommand(plan.startCmd, { cwd: PROJECT_ROOT, timeoutSec: bootTimeout, logPath: sLog });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ownership: 'owner',
      ports: null,
      reused: false,
      baseUrls: { web: '', api: '' },
      error: {
        kind: 'STACK_BOOT_FAILED',
        message,
        hint: `see ${sLog}; diagnose with: scripts/worktree-stack.sh status; if persistent, run: scripts/worktree-stack.sh reset`,
        logs: tailLog(sLog, 50),
      },
    };
  }

  const finalStack = readStackFile();
  if (!finalStack) {
    return {
      ownership: 'owner',
      ports: null,
      reused: false,
      baseUrls: { web: '', api: '' },
      error: {
        kind: 'STACK_BOOT_FAILED',
        message: 'driver start returned 0 but .stack.json was not written',
        hint: 'driver is broken or is not writing the expected stackFile; diagnose with: scripts/worktree-stack.sh status; try: scripts/worktree-stack.sh reset',
      },
    };
  }

  const healthy = await isStackHealthy(finalStack, options.healthPaths);
  if (!healthy.ok) {
    try {
      if (plan.stopCmd) await runCommand(plan.stopCmd, { cwd: PROJECT_ROOT, timeoutSec: 30, logPath: join(logDir, `stop-unhealthy-${timestamp()}.log`) });
    } catch {
      // best-effort
    }
    return {
      ownership: 'owner',
      ports: null,
      reused: false,
      baseUrls: { web: '', api: '' },
      error: {
        kind: 'STACK_UNHEALTHY',
        message: healthy.reason,
        hint: 'driver reported ready but health probes failed; diagnose with: scripts/worktree-stack.sh status; try: scripts/worktree-stack.sh reset',
        logs: tailLog(join(PROJECT_ROOT, '.api.log'), 50) || tailLog(sLog, 50),
      },
    };
  }

  registerCleanupHook(plan, 'owner', !!options.keepStack);

  return {
    ownership: 'owner',
    ports: toPorts(finalStack),
    reused: false,
    baseUrls: buildBaseUrls(finalStack),
  };
}

async function bootViaGeneric(_plan: BootPlan, options: BootOptions & { logDir: string; healthPaths: { api: string[]; web: string[] } }): Promise<BootResult> {
  // Generic fallback is declared supported by the plan; but the scripts array
  // is project-specific. Until a concrete project ships without a worktree-
  // stack driver, we return a useful error directing the user to plan 02.
  return {
    ownership: 'owner',
    ports: null,
    reused: false,
    baseUrls: { web: '', api: '' },
    error: {
      kind: 'STACK_DRIVER_MISSING',
      message: 'generic boot fallback not implemented for this matrix',
      hint: 'plan 02 should emit a concrete bootPlan.scripts[] for non-worktree-stack projects',
    },
  };
}

export interface HealthResult { ok: boolean; reason: string; }

export async function isStackHealthy(stack: StackFile, healthPaths: { api: string[]; web: string[] }): Promise<HealthResult> {
  const host = typeof (stack as { host?: unknown }).host === 'string' && (stack as { host: string }).host
    ? (stack as { host: string }).host
    : '127.0.0.1';
  if (typeof stack.api_port === 'number') {
    const ok = await probeHttpHealth(`http://${host}:${stack.api_port}`, healthPaths.api);
    if (!ok) return { ok: false, reason: `api :${stack.api_port} did not respond 2xx on any of ${healthPaths.api.join(', ')}` };
  }
  if (typeof stack.web_port === 'number') {
    const ok = await probeHttpHealth(`http://${host}:${stack.web_port}`, healthPaths.web);
    if (!ok) return { ok: false, reason: `web :${stack.web_port} did not respond 2xx on any of ${healthPaths.web.join(', ')}` };
  }
  if (typeof stack.pg_port === 'number') {
    const ok = await probeTcp(host, stack.pg_port, 2000);
    if (!ok) return { ok: false, reason: `postgres tcp :${stack.pg_port} refused` };
  }
  return { ok: true, reason: 'all ports healthy' };
}

async function probeHttpHealth(origin: string, paths: string[]): Promise<boolean> {
  for (const path of paths) {
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 2000);
      const response = await fetch(`${origin}${path}`, { signal: ac.signal });
      clearTimeout(timer);
      if (response.status >= 200 && response.status < 500) return true;
    } catch {
      // try next path
    }
  }
  return false;
}

async function probeTcp(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const socket = tcpConnect({ host, port });
    let done = false;
    const finish = (ok: boolean): void => {
      if (done) return;
      done = true;
      try { socket.destroy(); } catch { /* ignore */ }
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.on('connect', () => finish(true));
    socket.on('timeout', () => finish(false));
    socket.on('error', () => finish(false));
  });
}

function registerCleanupHook(plan: BootPlan, ownership: 'owner' | 'guest', keepStack: boolean): void {
  if (ownership !== 'owner') return;
  if (keepStack || process.env.HTTP_SMOKE_KEEP_STACK === '1') return;
  const cleanup = (): void => {
    if (!plan.stopCmd) return;
    try {
      execSync(plan.stopCmd, { cwd: PROJECT_ROOT, timeout: 30_000, stdio: 'ignore' });
    } catch {
      // best-effort
    }
  };
  process.once('exit', cleanup);
  process.once('SIGINT',  () => { cleanup(); process.exit(130); });
  process.once('SIGTERM', () => { cleanup(); process.exit(143); });
  process.once('uncaughtException', (error) => {
    cleanup();
    process.stderr.write(`uncaughtException during probe: ${error instanceof Error ? error.stack : error}\n`);
    process.exit(1);
  });
}

export async function teardownStack(plan: BootPlan): Promise<void> {
  if (!plan.stopCmd) return;
  try {
    execSync(plan.stopCmd, { cwd: PROJECT_ROOT, timeout: 30_000, stdio: 'ignore' });
  } catch {
    // best-effort
  }
}

interface RunOptions { cwd: string; timeoutSec: number; logPath: string; env?: Record<string, string>; }

async function runCommand(cmd: string, options: RunOptions): Promise<{ stdout: string; stderr: string }> {
  return await new Promise((resolve, reject) => {
    const started = Date.now();
    const parts = splitCommand(cmd);
    if (parts.length === 0) { reject(new Error('empty command')); return; }

    const [exe, ...args] = parts;
    const child: ChildProcess = spawn(exe, args, {
      cwd: options.cwd,
      env: { ...process.env, ...(options.env ?? {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    const appendLog = (chunk: Buffer | string, target: 'stdout' | 'stderr'): void => {
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      if (target === 'stdout') stdout += text; else stderr += text;
      try {
        const prefix = target === 'stdout' ? '' : '[stderr] ';
        const line = text.split('\n').map((l) => `${prefix}${l}`).join('\n');
        const fd = require('node:fs') as typeof import('node:fs');
        fd.appendFileSync(options.logPath, line);
      } catch { /* ignore log-write failures */ }
    };
    child.stdout?.on('data', (chunk) => appendLog(chunk, 'stdout'));
    child.stderr?.on('data', (chunk) => appendLog(chunk, 'stderr'));

    const timer = setTimeout(() => {
      try { child.kill('SIGTERM'); } catch { /* ignore */ }
      setTimeout(() => {
        try { child.kill('SIGKILL'); } catch { /* ignore */ }
      }, 5000);
      reject(new Error(`command timed out after ${options.timeoutSec}s: ${cmd}`));
    }, options.timeoutSec * 1000);

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      const elapsed = Date.now() - started;
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        const stderrTail = stderr.split('\n').filter((line) => line.trim().length > 0).slice(-20).join('\n');
        const stdoutTail = stderrTail ? '' : stdout.split('\n').filter((line) => line.trim().length > 0).slice(-20).join('\n');
        const detail = stderrTail || stdoutTail;
        const suffix = detail ? `\n--- output tail ---\n${detail}` : '';
        reject(new Error(`command exited ${code} after ${elapsed}ms: ${cmd}${suffix}`));
      }
    });
  });
}

export function splitCommand(cmd: string): string[] {
  // Minimal whitespace-aware splitter with quote handling.
  const out: string[] = [];
  let buf = '';
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i];
    if (quote) {
      if (ch === quote) { quote = null; continue; }
      buf += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === ' ' || ch === '\t') {
      if (buf.length > 0) { out.push(buf); buf = ''; }
    } else {
      buf += ch;
    }
  }
  if (buf.length > 0) out.push(buf);
  return out;
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function ensureDir(dir: string): void {
  try { mkdirSync(dir, { recursive: true }); } catch { /* ignore */ }
}

function rotateOldLogs(dir: string, maxAgeMs: number): void {
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      try {
        const info = statSync(full);
        if (Date.now() - info.mtimeMs > maxAgeMs) rmSync(full, { force: true });
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}

function tailLog(path: string, lines: number): string {
  try {
    const text = readFileSync(path, 'utf8');
    const parts = text.split('\n');
    return parts.slice(-lines).join('\n');
  } catch {
    return '';
  }
}

function toPorts(stack: StackFile): StackPorts {
  const out: StackPorts = {};
  if (typeof stack.pg_port === 'number') out.pg_port = stack.pg_port;
  if (typeof stack.api_port === 'number') out.api_port = stack.api_port;
  if (typeof stack.web_port === 'number') out.web_port = stack.web_port;
  return out;
}

function buildBaseUrls(stack: StackFile): { web: string; api: string } {
  const host = typeof (stack as { host?: unknown }).host === 'string' && (stack as { host: string }).host
    ? (stack as { host: string }).host
    : '127.0.0.1';
  const web = typeof stack.web_port === 'number' ? `http://${host}:${stack.web_port}` : '';
  const api = typeof stack.api_port === 'number' ? `http://${host}:${stack.api_port}` : '';
  return { web, api };
}

// ── Status polling + 3-layer escape valve ─────────────────────────

export interface StatusJson {
  has_stack_file: boolean;
  starting: boolean;
  start_pid: number | null;
  pg:  { state: 'up' | 'down' | 'starting'; port: number | null };
  api: { state: 'up' | 'down' | 'starting'; port: number | null };
  web: { state: 'up' | 'down' | 'starting'; port: number | null };
  turbo_watch: { state: 'up' | 'down' | 'starting' };
}

export interface PollOptions {
  statusCmd: string;
  apiLogPath: string;
  webLogPath: string;
  startLogPath: string;
  hardCeilingMs: number;
  stallThresholdMs: number;
  pollIntervalMs: number;
}

export interface PollResult {
  kind: 'ready' | 'stalled' | 'fast_failed' | 'timeout';
  message: string;
  hint?: string;
  diagnostics: string;
  status?: StatusJson;
}

/**
 * Derive the status command from a worktree-stack start command by swapping
 * the trailing "start" token (and any args after it) for "status".
 */
export function deriveStatusCmd(startCmd: string): string {
  const parts = splitCommand(startCmd);
  if (parts.length === 0) return 'status';
  // Find the last index that is exactly "start"; if none, append "status".
  let startIdx = -1;
  for (let i = parts.length - 1; i >= 0; i--) {
    if (parts[i] === 'start') { startIdx = i; break; }
  }
  if (startIdx === -1) {
    return [...parts, 'status'].map(quoteIfNeeded).join(' ');
  }
  const next = [...parts.slice(0, startIdx), 'status'];
  return next.map(quoteIfNeeded).join(' ');
}

function quoteIfNeeded(token: string): string {
  if (/[\s"']/.test(token)) {
    if (token.includes("'")) return `"${token.replace(/"/g, '\\"')}"`;
    return `'${token}'`;
  }
  return token;
}

/**
 * Run the status command synchronously. Returns parsed JSON or null on
 * any error (non-zero exit, garbage output, parse failure).
 */
export function pollStackStatus(statusCmd: string): StatusJson | null {
  const parts = splitCommand(statusCmd);
  if (parts.length === 0) return null;
  const [exe, ...args] = parts;
  try {
    const result = spawnSync(exe, args, {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      timeout: 10_000,
    });
    if (result.status !== 0) return null;
    const stdout = (result.stdout ?? '').trim();
    if (!stdout) return null;
    const parsed = JSON.parse(stdout) as StatusJson;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Incrementally read appended bytes of a log file from `sinceOffsetByte` and
 * scan for any FAST_FAIL_PATTERNS match. Returns the new byte offset so the
 * caller can resume from there next tick.
 */
export function scanLogForFastFail(logPath: string, sinceOffsetByte: number): {
  matched: boolean;
  line?: string;
  pattern?: string;
  newOffsetByte: number;
} {
  let buf: Buffer;
  let size = 0;
  try {
    const info = statSync(logPath);
    size = info.size;
    if (size <= sinceOffsetByte) {
      return { matched: false, newOffsetByte: sinceOffsetByte };
    }
    // Read appended slice only.
    const fd = require('node:fs') as typeof import('node:fs');
    const handle = fd.openSync(logPath, 'r');
    try {
      const length = size - sinceOffsetByte;
      buf = Buffer.alloc(length);
      fd.readSync(handle, buf, 0, length, sinceOffsetByte);
    } finally {
      fd.closeSync(handle);
    }
  } catch {
    return { matched: false, newOffsetByte: sinceOffsetByte };
  }

  const text = buf.toString('utf8');
  const lines = text.split('\n');
  for (const line of lines) {
    for (const p of FAST_FAIL_PATTERNS) {
      if (p.rx.test(line)) {
        return { matched: true, line: line.trim(), pattern: p.name, newOffsetByte: size };
      }
    }
  }
  return { matched: false, newOffsetByte: size };
}

/** Last non-empty line of a log file, or '' if missing/empty. */
export function tailLastLine(logPath: string): string {
  try {
    const text = readFileSync(logPath, 'utf8');
    const parts = text.split('\n').map((line) => line).filter((line) => line.trim().length > 0);
    if (parts.length === 0) return '';
    return parts[parts.length - 1];
  } catch {
    return '';
  }
}

export async function pollUntilReady(opts: PollOptions): Promise<PollResult> {
  const startedAt = Date.now();
  let stallSince = startedAt;
  let lastStatusHash = '';
  let lastApiLine = '';
  let lastWebLine = '';

  let apiLogOffset = 0;
  let webLogOffset = 0;
  let startLogOffset = 0;

  // Capture current sizes so we don't re-fire fast-fails from prior runs.
  apiLogOffset = currentSize(opts.apiLogPath);
  webLogOffset = currentSize(opts.webLogPath);
  startLogOffset = currentSize(opts.startLogPath);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const now = Date.now();
    const elapsed = now - startedAt;

    // Layer 3: hard ceiling.
    if (elapsed > opts.hardCeilingMs) {
      const status = pollStackStatus(opts.statusCmd);
      const diag = renderDiagnostics(status, opts);
      return {
        kind: 'timeout',
        message: `boot exceeded hard ceiling of ${Math.round(opts.hardCeilingMs / 1000)}s`,
        hint: 'inspect logs and run: scripts/worktree-stack.sh status; if persistent, run: scripts/worktree-stack.sh reset',
        diagnostics: diag,
        status: status ?? undefined,
      };
    }

    // Poll status.
    const status = pollStackStatus(opts.statusCmd);

    // Ready check: all three components up.
    if (status &&
        status.pg.state === 'up' &&
        status.api.state === 'up' &&
        status.web.state === 'up') {
      return {
        kind: 'ready',
        message: 'all components up',
        diagnostics: renderDiagnostics(status, opts),
        status,
      };
    }

    // Layer 1: fast-fail log scan (incremental).
    for (const [path, off, setOff] of [
      [opts.apiLogPath, apiLogOffset, (n: number) => { apiLogOffset = n; }] as const,
      [opts.webLogPath, webLogOffset, (n: number) => { webLogOffset = n; }] as const,
      [opts.startLogPath, startLogOffset, (n: number) => { startLogOffset = n; }] as const,
    ]) {
      const scan = scanLogForFastFail(path, off);
      setOff(scan.newOffsetByte);
      if (scan.matched) {
        const status2 = status ?? pollStackStatus(opts.statusCmd);
        return {
          kind: 'fast_failed',
          message: `boot fast-failed: pattern ${scan.pattern} matched in ${path}: ${scan.line}`,
          hint: `inspect ${path} for full context; fix the underlying error and re-run`,
          diagnostics: renderDiagnostics(status2, opts),
          status: status2 ?? undefined,
        };
      }
    }

    // Stall detection — track changes in status JSON + last log lines.
    const statusHash = status ? JSON.stringify(status) : '';
    const apiLine = tailLastLine(opts.apiLogPath);
    const webLine = tailLastLine(opts.webLogPath);
    if (statusHash !== lastStatusHash || apiLine !== lastApiLine || webLine !== lastWebLine) {
      stallSince = now;
      lastStatusHash = statusHash;
      lastApiLine = apiLine;
      lastWebLine = webLine;
    }

    // Layer 2: stall threshold.
    if (now - stallSince > opts.stallThresholdMs) {
      const stalledFor = Math.round((now - stallSince) / 1000);
      const which = status
        ? (status.api.state !== 'up' ? 'api' : status.web.state !== 'up' ? 'web' : status.pg.state !== 'up' ? 'pg' : 'unknown')
        : 'unknown';
      const stateStr = status
        ? `${which}.state='${(status as any)[which]?.state ?? 'unknown'}'`
        : 'no status JSON received';
      return {
        kind: 'stalled',
        message: `boot stalled: ${stateStr} for ${stalledFor}s`,
        hint: 'inspect logs and run: scripts/worktree-stack.sh status; if persistent, run: scripts/worktree-stack.sh reset',
        diagnostics: renderDiagnostics(status, opts),
        status: status ?? undefined,
      };
    }

    await sleep(opts.pollIntervalMs);
  }
}

function currentSize(path: string): number {
  try { return statSync(path).size; } catch { return 0; }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function renderDiagnostics(status: StatusJson | null, opts: PollOptions): string {
  const lines: string[] = [];
  lines.push('--- status ---');
  lines.push(status ? JSON.stringify(status, null, 2) : '(no status JSON)');
  lines.push('--- api log tail ---');
  lines.push(tailLog(opts.apiLogPath, 30));
  lines.push('--- web log tail ---');
  lines.push(tailLog(opts.webLogPath, 30));
  lines.push('--- start log tail ---');
  lines.push(tailLog(opts.startLogPath, 30));
  return lines.join('\n');
}

export function loadDefaultHealthPaths(): { api: string[]; web: string[] } {
  try {
    const fixture = readFileSync(join(__dirname, 'fixtures', 'default-health-paths.json'), 'utf8');
    const parsed = JSON.parse(fixture) as { apiHealth?: string[]; webHealth?: string[] };
    return {
      api: parsed.apiHealth ?? ['/api/v1/health', '/health'],
      web: parsed.webHealth ?? ['/'],
    };
  } catch {
    return { api: ['/api/v1/health', '/health'], web: ['/'] };
  }
}

// Test-only export: forcefully write a stack file (used in __tests__ only).
export function writeStackFileForTest(contents: StackFile, root: string = PROJECT_ROOT): void {
  writeFileSync(join(root, '.stack.json'), JSON.stringify(contents, null, 2));
}
