#!/usr/bin/env node
/**
 * verify-full-contract.js — Stop + PreToolUse hook.
 *
 * Bulletproof contract verification. Runs whenever a builder agent tries to
 * close out — either via Stop (agent is finishing its turn) or via a
 * completion-intent Bash command (`sd close`, `ov mail send --type worker_done`,
 * `ov merge` without `--dry-run`). Boots the real API in-process (via
 * supertest) and exercises every endpoint the project exposes with a 6-probe
 * battery:
 *
 *   1. Route-contract       — every route returns correct success/error envelope
 *   2. Validation-matrix    — every Zod field rejects bad input with 400
 *   3. Auth-matrix          — every non-@Public route rejects missing/bad tokens
 *   4. Mutation-roundtrip   — CRUD controllers survive create→read→update→delete
 *   5. Page-crawl           — every Next.js page.tsx renders without console errors
 *   6. Form-fuzzer          — every react-hook-form schema fuzzed for required fields
 *
 * Each probe auto-discovers its subject (routes, schemas, pages, forms) from the
 * source tree — no manifest to maintain. Probes skip silently when their artifacts
 * don't exist yet (you can build API-first or web-first and both are fine).
 *
 * The hook itself is pure Node JS. It shells out to `tsx` to run the actual
 * probes because those need to import TypeScript (AppModule, Zod schemas, etc.)
 * and interact with `@sfx/database` via require-cache injection.
 *
 * Modes:
 *   • Stop mode (legacy): no PreToolUse payload on stdin. Emits
 *     {decision:"block", reason} on failure; exit 0 pass, exit 2 block.
 *   • PreToolUse mode: stdin is a PreToolUse JSON payload with tool_name="Bash".
 *     Only runs probes when the command matches a completion intent; otherwise
 *     exits 0 immediately so we don't pay the probe-boot cost on every Bash
 *     call. On failure, emits
 *     {hookSpecificOutput:{hookEventName,permissionDecision:"deny",...}}
 *     and exits 0 (PreToolUse signals deny via JSON, not exit code).
 *
 * Exit codes:
 *   0 — passed, skipped, or PreToolUse deny emitted via JSON
 *   2 — Stop-mode block (at least one probe failed)
 */
'use strict';

const { existsSync, readFileSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const { join } = require('node:path');

const PROJECT_ROOT = process.cwd();
const PROBES_DIR = join(PROJECT_ROOT, '.claude', 'hooks', 'probes');
const PROBES_FALLBACK_DIR = join(PROJECT_ROOT, '.overstory', 'claude-profiles', 'builder', 'hooks', 'probes');

/**
 * Extract the `[probes-summary] ...` line emitted by probes/index.ts so the
 * PreToolUse allow-path can surface a compact, readable reason instead of
 * dumping the full results table into permissionDecisionReason.
 */
function extractSummaryLine(text) {
  if (!text) return '';
  const match = text.match(/^\[probes-summary\][^\n]*/m);
  return match ? match[0] : '';
}

/**
 * Write a full invocation trace to .overstory/logs/verify-full-contract/ so
 * agents and operators have out-of-band evidence of every probe run — pass,
 * fail, or skip — independent of whether Claude Code surfaced the hook's
 * stdout/stderr to the transcript. Best-effort: never throws.
 *
 * Opt out with VERIFY_FULL_CONTRACT_AUDIT=0.
 */
function writeAuditLog({ mode, status, stdout, stderr }) {
  if (process.env.VERIFY_FULL_CONTRACT_AUDIT === '0') return;
  try {
    const fs = require('node:fs');
    const logDir = join(PROJECT_ROOT, '.overstory', 'logs', 'verify-full-contract');
    fs.mkdirSync(logDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const file = join(logDir, `${ts}-${process.pid}-${status}.log`);
    const body = [
      '== verify-full-contract audit ==',
      `timestamp: ${new Date().toISOString()}`,
      `mode: ${mode}`,
      `status: ${status}`,
      `agent: ${process.env.OVERSTORY_AGENT_NAME || 'unknown'}`,
      `task_id: ${process.env.OVERSTORY_TASK_ID || 'unknown'}`,
      `cwd: ${PROJECT_ROOT}`,
      '-- stdout --',
      stdout || '',
      '-- stderr --',
      stderr || '',
    ].join('\n');
    fs.writeFileSync(file, body, 'utf8');
    rotateAuditLogs(logDir, 50);
  } catch {
    // Best-effort — never break the hook on log write error.
  }
}

/**
 * Keep the most recent `keep` audit logs; delete the rest by mtime.
 * Ignores all errors — rotation failure must never break the hook.
 */
function rotateAuditLogs(dir, keep) {
  try {
    const fs = require('node:fs');
    const entries = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.log'))
      .map((f) => ({ f, mtime: fs.statSync(join(dir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    for (const entry of entries.slice(keep)) {
      try {
        fs.unlinkSync(join(dir, entry.f));
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}

// Known locations to scan for .env.example files. We source from these IN ORDER,
// so apps/api wins over repo root when both define the same key (matches what
// real dev tooling does).
const ENV_EXAMPLE_CANDIDATES = [
  join(PROJECT_ROOT, '.env.example'),
  join(PROJECT_ROOT, 'apps', 'api', '.env.example'),
  join(PROJECT_ROOT, 'apps', 'web', '.env.example'),
];

function locateProbesDir() {
  // After `ov sling`, the profile is copied into .claude/hooks/, so that's the
  // primary location. Falls back to the source dir for direct invocations (e.g.
  // a human running `node .overstory/claude-profiles/builder/hooks/verify-full-contract.js`).
  if (existsSync(join(PROBES_DIR, 'index.ts'))) return PROBES_DIR;
  if (existsSync(join(PROBES_FALLBACK_DIR, 'index.ts'))) return PROBES_FALLBACK_DIR;
  return null;
}

function hasApiApp() {
  return existsSync(join(PROJECT_ROOT, 'apps', 'api', 'src', 'app.module.ts'));
}

function hasWebApp() {
  return existsSync(join(PROJECT_ROOT, 'apps', 'web', 'src', 'app'));
}

/**
 * Parse a simple dotenv file: KEY=VALUE lines, skipping blanks and # comments.
 * Quotes are stripped. Variable expansion / multi-line strings are NOT
 * supported — the probe just needs schema-satisfying defaults, not a real
 * dotenv parser.
 */
function parseDotenv(path) {
  try {
    const contents = readFileSync(path, 'utf8');
    const parsed = {};
    for (const rawLine of contents.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq < 0) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (key) parsed[key] = value;
    }
    return parsed;
  } catch {
    return {};
  }
}

/**
 * Build the probe env by layering all .env.example files the project ships.
 * The probe runs in NODE_ENV=test with PROBE_PROJECT_ROOT pointing at the
 * project root — everything else is whatever the example files declared.
 *
 * We deliberately do NOT read .env (it may contain real secrets). Only the
 * committed .env.example files are used as the source of truth for schema
 * compatibility.
 */
function buildProbeEnv() {
  const envFromExamples = {};
  for (const path of ENV_EXAMPLE_CANDIDATES) {
    if (!existsSync(path)) continue;
    Object.assign(envFromExamples, parseDotenv(path));
  }

  return {
    ...envFromExamples,
    // Caller's process.env wins over example defaults — CI / local envs may
    // legitimately override any of these.
    ...process.env,
    PROBE_PROJECT_ROOT: PROJECT_ROOT,
    NODE_ENV: 'test',
  };
}

/**
 * Pattern-match known probe failure signatures and emit numbered,
 * prescriptive actions the agent can take. Returned as an array of strings;
 * caller prepends a numbered "Actions to take" section to the block reason
 * when non-empty.
 *
 * Keep patterns tight — false positives are worse than silence. Each
 * pattern/hint pair mirrors a real failure mode observed in probe output.
 */
function buildActionableHints(combined) {
  if (!combined) return [];
  const hints = [];
  const seen = new Set();
  const add = (hint) => {
    if (seen.has(hint)) return;
    seen.add(hint);
    hints.push(hint);
  };

  const matrixMissing = /MATRIX_MISSING|matrix not found at/.test(combined);
  if (matrixMissing) {
    add('Matrix file missing — run `pnpm matrix:regen` to derive .claude/hooks/.matrix.json from the source tree, then rerun the probe.');
  }

  const moduleMatch = combined.match(/Cannot find module ['"]([^'"]+)['"]/);
  if (moduleMatch) {
    add(`Missing module "${moduleMatch[1]}" — add it to package.json devDependencies and run \`pnpm install\`, or remove the import if unused.`);
  }

  if (/AppModule failed to boot/.test(combined) && !moduleMatch) {
    add('AppModule failed to boot — check apps/api/src/app.module.ts imports & providers; every @Injectable referenced must be declared in a module.');
  }

  if (/no JWT guard detected/.test(combined)) {
    add('Register the JWT guard globally in apps/api/src/app.module.ts providers: `{ provide: APP_GUARD, useClass: JwtAuthGuard }`. Mark public routes with `@Public()`.');
  }

  if (/no useForm\(\)\s*with zodResolver/.test(combined)) {
    add('Forms missing `useForm({ resolver: zodResolver(schema) })` — wire the Zod schema via @hookform/resolvers/zod in every form component.');
  }

  if (/uses tsconfig path alias|path alias — not resolvable outside/.test(combined)) {
    add('A page imports a tsconfig path alias that breaks outside the Next build — rewrite the aliased import as a relative path (./ or ../).');
  }

  if (/PROBE_INTERNAL_ERROR/.test(combined) && !matrixMissing) {
    add('Probe crashed before producing results — verify devDependencies (@swc-node/register, reflect-metadata, supertest) and run `pnpm db:generate`.');
  }

  return hints;
}

/**
 * Invoke the probe chain through the canonical `pnpm probe:smoke` script.
 * That script chains `bash scripts/probe-bootstrap.sh` (db:reset:fast +
 * stack health) → `pnpm openapi:check` → the full probe chain entrypoint
 * (.overstory/claude-profiles/<profile>/hooks/probes/index.ts), so this
 * hook stays the single source of truth with the May 9 stop-hook fix.
 *
 * `entryPath` is retained in the signature for callsite compatibility but
 * is no longer used — index.ts location lives in package.json now.
 */
function runProbeChain(_entryPath, _env) {
  // Inherit caller env (process.env). Do NOT layer .env.example values —
  // those declare DATABASE_URL=localhost:5432 which collides with the real
  // per-worktree URL (host.docker.internal:<dynamic-port>) that
  // packages/database/.env holds. The bootstrap script + pnpm scripts that
  // probe:smoke chains all read packages/database/.env themselves and
  // resolve the correct URL.
  return spawnSync('pnpm', ['probe:smoke'], {
    cwd: PROJECT_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
    timeout: 300_000, // 5 minutes — bootstrap + reset + full chain
    encoding: 'utf8',
  });
}

/**
 * Run derive-test-matrix.js --full to (re)build .claude/hooks/.matrix.json.
 * Called when the probe output indicates MATRIX_MISSING so we can
 * self-heal without forcing the agent to manually run `pnpm matrix:regen`.
 *
 * Returns { ok, stdout, stderr } — callers log on failure but proceed to
 * rerun the probes anyway so the agent still gets the real error surface.
 */
function regenerateMatrix(probesDir, env) {
  const deriveScript = join(probesDir, 'derive-test-matrix.js');
  if (!existsSync(deriveScript)) {
    return { ok: false, stdout: '', stderr: `derive-test-matrix.js not found at ${deriveScript}` };
  }
  const res = spawnSync('node', [deriveScript, '--full'], {
    cwd: PROJECT_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
    timeout: 60_000,
    encoding: 'utf8',
  });
  return {
    ok: res.status === 0 && !res.error,
    stdout: res.stdout ?? '',
    stderr: res.stderr ?? (res.error ? res.error.message : ''),
  };
}

function emitDecision(decision, reason) {
  // Claude Code Stop hook protocol — stdout JSON with decision + reason.
  // Reason is surfaced to the agent so they see the exact failing probes.
  process.stdout.write(JSON.stringify({ decision, reason }) + '\n');
}

function emitPreToolUseDeny(reason) {
  // Claude Code PreToolUse hook protocol — stdout JSON with
  // hookSpecificOutput.permissionDecision="deny". PreToolUse hooks signal
  // deny via the JSON payload (not exit code); exit 0 after emitting.
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }) + '\n',
  );
}

// Completion-intent patterns — mirrors pre-close-gate.js:46-48. We only run
// probes in PreToolUse mode when the Bash command matches one of these, so
// the hook does not pay the probe-boot cost on every random shell command.
const CLOSE_PATTERN = /\bsd\s+close\b/;
const WORKER_DONE_PATTERN = /--type[= ]\s*worker_done\b/;
const OV_MERGE_PATTERN = /\bov\s+merge\b(?![\s\S]*--dry-run\b)/;

/**
 * Read stdin synchronously without hanging when no input was piped.
 * Returns '' on TTY or any read error. Claude Code pipes JSON + closes stdin
 * for both Stop and PreToolUse hooks, so the read terminates in practice.
 */
function readStdinSafely() {
  if (process.stdin.isTTY) return '';
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

/**
 * Decide which mode to run in based on stdin.
 *
 *   { mode: 'stop' }                                 — run probes, emit decision=block on fail
 *   { mode: 'pretooluse-skip' }                      — non-completion Bash command, exit 0
 *   { mode: 'pretooluse-enforce' }                   — matched completion intent, run probes
 *
 * PreToolUse payloads always have tool_name. If the parsed stdin carries
 * tool_name==="Bash" we're in PreToolUse mode; otherwise (empty, non-JSON, or
 * Stop's session payload) we fall through to Stop mode, matching today's
 * behavior.
 */
function decideMode() {
  const raw = readStdinSafely();
  if (!raw.trim()) return { mode: 'stop' };
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { mode: 'stop' };
  }
  if (!parsed || parsed.tool_name !== 'Bash') return { mode: 'stop' };
  const command = (parsed.tool_input && parsed.tool_input.command) || '';
  const matched =
    CLOSE_PATTERN.test(command) ||
    WORKER_DONE_PATTERN.test(command) ||
    OV_MERGE_PATTERN.test(command);
  return { mode: matched ? 'pretooluse-enforce' : 'pretooluse-skip' };
}

function main() {
  const { mode } = decideMode();

  // PreToolUse non-completion commands: exit 0 immediately without running
  // probes. This keeps the hook cheap on routine Bash calls.
  if (mode === 'pretooluse-skip') {
    process.exit(0);
  }

  // If neither API nor web exists, nothing to verify — exit clean.
  if (!hasApiApp() && !hasWebApp()) {
    writeAuditLog({ mode, status: 'skip-no-app', stdout: '', stderr: '' });
    process.exit(0);
  }

  const probesDir = locateProbesDir();
  if (!probesDir) {
    // Hook installed without probes — warn but don't block (fail-open for partial installs).
    process.stderr.write('verify-full-contract: probes directory not found, skipping\n');
    writeAuditLog({
      mode,
      status: 'skip-no-probes',
      stdout: '',
      stderr: 'probes directory not found',
    });
    process.exit(0);
  }

  // Delegate to the TS probe runner. We invoke the probes via
  // `@swc-node/register` (not tsx) because tsx's esbuild pipeline does not
  // emit decorator metadata — NestJS needs `design:paramtypes` reflection to
  // resolve constructor injection at compile time, and without it the boot
  // fails with "Cannot read properties of undefined (reading 'getOrThrow')"
  // or similar DI-undefined errors. swc-node honors `emitDecoratorMetadata`
  // from apps/api/tsconfig.json.
  //
  // TS_NODE_PROJECT lets swc-node pick up the NestJS project's tsconfig so
  // decorator + paramtype metadata emission is on.
  const entryPath = join(probesDir, 'index.ts');
  const apiTsConfig = join(PROJECT_ROOT, 'apps/api/tsconfig.json');
  const env = {
    ...buildProbeEnv(),
    ...(existsSync(apiTsConfig) ? { TS_NODE_PROJECT: apiTsConfig } : {}),
  };

  let result = runProbeChain(entryPath, env);
  let stdout = result.stdout ?? '';
  let stderr = result.stderr ?? '';
  let combined = `${stdout}\n${stderr}`.trim();
  let autoRegen = null;

  // Self-heal: if the probes failed *only* because .matrix.json is missing,
  // regenerate it and rerun the probes once. Saves the agent a round-trip
  // through `pnpm matrix:regen` → rerun hook → see actual failures.
  const matrixMissing =
    result.status !== 0 &&
    !result.error &&
    /MATRIX_MISSING|matrix not found at/.test(combined);
  if (matrixMissing) {
    autoRegen = regenerateMatrix(probesDir, env);
    if (autoRegen.ok) {
      result = runProbeChain(entryPath, env);
      stdout = result.stdout ?? '';
      stderr = result.stderr ?? '';
      combined = `${stdout}\n${stderr}`.trim();
    }
  }

  if (result.error) {
    // Spawn error (e.g. @swc-node/register not installed) — warn and fail-open
    // to avoid blocking Stop for a misconfigured runtime. The agent gets a
    // clear message about which deps are missing.
    process.stderr.write(`verify-full-contract: runner failed to start — ${result.error.message}\n`);
    process.stderr.write(
      'Install probe deps at repo root:\n' +
        '  pnpm add -w -D @swc-node/register @swc/core reflect-metadata supertest @types/supertest glob\n',
    );
    writeAuditLog({ mode, status: 'skip-spawn-error', stdout, stderr });
    process.exit(0);
  }

  if (result.status === 0) {
    // All probes passed. Make the pass signal visible to the agent:
    //   - Stop mode: write results to stderr so they appear in the transcript.
    //   - PreToolUse mode: emit a hookSpecificOutput with the summary line as
    //     permissionDecisionReason so Claude Code surfaces it to the agent
    //     (plain allow-path stderr is suppressed by Claude Code).
    if (combined.length > 0) {
      process.stderr.write(combined);
      process.stderr.write('\n');
    }
    writeAuditLog({ mode, status: 'pass', stdout, stderr });
    if (mode === 'pretooluse-enforce') {
      const summary = extractSummaryLine(combined) || 'Contract verification passed.';
      process.stdout.write(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'allow',
            permissionDecisionReason: summary,
          },
        }) + '\n',
      );
    }
    process.exit(0);
  }

  // Non-zero exit = at least one probe failed. Block completion with the full
  // output so the agent sees exactly which route / field / page is broken.
  const hints = buildActionableHints(combined);
  const hintSection = hints.length
    ? [
        '▸ Actions to take (fix these, then rerun):',
        ...hints.map((hint, idx) => `  ${idx + 1}. ${hint}`),
        '',
      ]
    : [];
  const regenSection =
    autoRegen && !autoRegen.ok
      ? [
          '⚠ Auto-regen of .matrix.json failed — you must run `pnpm matrix:regen` manually.',
          autoRegen.stderr ? `  reason: ${autoRegen.stderr.trim().slice(-400)}` : '',
          '',
        ].filter(Boolean)
      : [];
  const reason = [
    'Contract verification failed. The agent cannot close until every probe passes.',
    '',
    ...hintSection,
    ...regenSection,
    combined,
    '',
    'Fix the underlying code (controller / schema / page / form) — do NOT',
    'bypass the hook by deleting probe assertions or stubbing envelopes.',
  ].join('\n');

  writeAuditLog({ mode, status: 'fail', stdout, stderr });

  if (mode === 'pretooluse-enforce') {
    // PreToolUse deny is signaled via JSON payload, not exit code.
    emitPreToolUseDeny(reason);
    process.exit(0);
  }

  emitDecision('block', reason);
  process.exit(2);
}

main();
