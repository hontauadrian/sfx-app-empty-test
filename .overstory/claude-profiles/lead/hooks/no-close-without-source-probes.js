#!/usr/bin/env node
/* eslint-disable */
/**
 * PreToolUse hook — block `sd close <task-id>` / `bd close <task-id>` if
 * the resolved task worktree has a probe artifact that is failing or stale.
 *
 * Why this exists:
 *   The overstory-deployed `.claude/settings.local.json` already blocks an
 *   agent from closing FOREIGN task IDs (must equal $OVERSTORY_TASK_ID). But
 *   that gate short-circuits to ALLOW when $OVERSTORY_TASK_ID is unset —
 *   typical for the human's main session, the coordinator/orchestrator at the
 *   top of the agent tree, or any non-overstory invocation. In those
 *   contexts, lead/coordinator/human can `sd close <builder-task>` or send a
 *   worker_done mail without any probe verification.
 *
 *   This hook closes that gap. Regardless of session env, any close or
 *   worker_done signal is gated on the relevant worktree's probe
 *   artifact. For sd/bd close, the hook resolves <id> to a worktree by
 *   scanning `git worktree list` for a branch whose name ends with
 *   `/<id>` (the overstory convention is `overstory/<agent-name>/<task-id>`,
 *   but the hook is permissive — any branch ending `/<id>` matches).
 *   For worker_done mail, cwd = worktree.
 *
 *   Probe-validation rules mirror no-merge-without-source-probes.js:
 *     - No worktree resolved for task-id   → exit 0 (fail-open;
 *       could be a brand-new task with no work yet, don't block close).
 *     - Missing `.http-smoke.json`         → block: PROBE_ARTIFACT_MISSING
 *     - Malformed JSON                     → block: PROBE_ARTIFACT_CORRUPT
 *     - exitCode !== 0                     → block: PROBE_EXITCODE_NONZERO
 *     - blockCodes non-empty               → block: PROBE_BLOCKED
 *     - summary.total === 0                → block: PROBE_NO_CASES
 *     - summary.failed > 0                 → block: PROBE_CASES_FAILED
 *     - summary.skipped>0 && passed===0    → block: PROBE_ALL_SKIPPED
 *     - newest commit on branch newer than artifact mtime → block:
 *       PROBE_STALE
 *
 * Pass-through (never gates):
 *   - any non-`sd|bd close` Bash command
 *   - `sd close <id> --force` or any flag we don't understand → fail-open
 *   - close commands whose <id> we cannot extract → fail-open
 *
 * Contract:
 *   - PreToolUse, matcher "Bash"
 *   - stdin: { tool_name: "Bash", tool_input: { command: "<agent-supplied>" } }
 *   - Allow:  exit 0, no stdout.
 *   - Block:  exit 0, stdout = PreToolUse deny envelope with reason text.
 *   - Internal error: fail-open. Bugs in this hook MUST NOT prevent
 *     non-close work.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

// The probe writes its JSON artifact to `.claude/hooks/.http-smoke.json`
// inside the worktree (see `pnpm probe:smoke` in package.json). Match that
// path exactly — earlier drafts of this hook used `<worktree>/.http-smoke.json`
// at the worktree root, which always evaluated to PROBE_ARTIFACT_MISSING
// even on green probes.
const PROBE_ARTIFACT_RELPATH = '.claude/hooks/.http-smoke.json';
const SMOKE_REPORT_RELPATH = '.claude/hooks/.http-smoke.md';

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function parseInput(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    // ignore
  }
  return null;
}

/**
 * Split a command string on shell separators (`;`, `&&`, `||`, `|`) into
 * segments. Single-quoted ('...') and double-quoted ("...") regions are
 * treated as opaque — separators inside quotes do NOT split. Backslash
 * escapes the next character.
 *
 * Conservative tokenization: enough to defeat the most common
 * compound-command bypass (`true; sd close <id>`) without trying to be a
 * full shell parser. Edge cases (heredocs, `$(...)` substitution, complex
 * quote nesting) fall through to whichever segment they end up in — the
 * artifact-validation logic below will fail-open if the resulting segment
 * doesn't match the close pattern.
 */
function splitSegments(command) {
  const segments = [];
  let current = '';
  let i = 0;
  let quote = null; // null | '"' | "'"
  while (i < command.length) {
    const ch = command[i];
    if (quote) {
      if (ch === '\\' && quote === '"' && i + 1 < command.length) {
        current += ch + command[i + 1];
        i += 2;
        continue;
      }
      if (ch === quote) quote = null;
      current += ch;
      i += 1;
      continue;
    }
    if (ch === '\\' && i + 1 < command.length) {
      current += ch + command[i + 1];
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      i += 1;
      continue;
    }
    // Compound separators: ;  &&  ||  |  &
    const next = command[i + 1];
    if (ch === ';') {
      segments.push(current);
      current = '';
      i += 1;
      continue;
    }
    if ((ch === '&' && next === '&') || (ch === '|' && next === '|')) {
      segments.push(current);
      current = '';
      i += 2;
      continue;
    }
    if (ch === '|' || ch === '&') {
      segments.push(current);
      current = '';
      i += 1;
      continue;
    }
    current += ch;
    i += 1;
  }
  segments.push(current);
  return segments
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Match `sd close <id>` or `bd close <id>` (with optional flags).
 * Captures the id (alphanumeric + dash + underscore).
 *
 * Walks every segment of the (potentially compound) command. Returns the
 * FIRST segment that matches a close pattern. Closes the
 * `true; sd close <id>` bypass.
 */
function detectCloseIntent(command) {
  if (typeof command !== 'string' || command.length === 0) {
    return null;
  }
  const stripped = command.replace(/\s+#[^\n]*$/, '').trim();
  const segments = splitSegments(stripped);
  for (const seg of segments) {
    const match = seg.match(/^\s*(sd|bd)\b[^\n]*\bclose\b\s+([A-Za-z0-9_\-]+)/);
    if (match) {
      return { tracker: match[1], taskId: match[2], rawCommand: stripped };
    }
  }
  return null;
}

function listWorktrees(cwd) {
  try {
    const out = execSync('git worktree list --porcelain', {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const blocks = out.split(/\n\n+/).filter(Boolean);
    return blocks.map((block) => {
      const wt = {};
      for (const line of block.split('\n')) {
        const sp = line.indexOf(' ');
        const key = sp === -1 ? line : line.slice(0, sp);
        const val = sp === -1 ? '' : line.slice(sp + 1);
        if (key === 'worktree') wt.path = val;
        else if (key === 'branch') wt.branch = val.replace(/^refs\/heads\//, '');
        else if (key === 'HEAD') wt.head = val;
      }
      return wt;
    });
  } catch {
    return [];
  }
}

function resolveWorktreeForTaskId(taskId, cwd) {
  const worktrees = listWorktrees(cwd);
  // Match the LAST path segment of the branch against the task id —
  // overstory convention is `overstory/<agent>/<task-id>`, but the hook
  // accepts any branch whose final segment equals the id.
  const candidates = worktrees.filter((wt) => {
    if (!wt.branch) return false;
    const lastSeg = wt.branch.split('/').pop();
    return lastSeg === taskId || wt.branch.endsWith('/' + taskId);
  });
  if (candidates.length === 0) return null;
  // If multiple, prefer the longest branch name (most-specific match).
  candidates.sort((a, b) => b.branch.length - a.branch.length);
  return candidates[0];
}

function newestCommitMtime(branch, worktreePath) {
  try {
    const ts = execSync(
      `git log -1 --format=%ct ${shellQuote(branch)} --`,
      { cwd: worktreePath, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    );
    const seconds = parseInt(ts.trim(), 10);
    if (Number.isFinite(seconds) && seconds > 0) {
      return seconds * 1000;
    }
  } catch {
    // ignore
  }
  return null;
}

function shellQuote(arg) {
  return "'" + String(arg).replace(/'/g, `'\\''`) + "'";
}

function evaluateProbeArtifact(worktreePath, branch) {
  const artifactPath = path.join(worktreePath, PROBE_ARTIFACT_RELPATH);
  let stat;
  try {
    stat = fs.statSync(artifactPath);
  } catch {
    return { ok: false, code: 'PROBE_ARTIFACT_MISSING', detail: artifactPath };
  }
  let raw;
  try {
    raw = fs.readFileSync(artifactPath, 'utf8');
  } catch {
    return { ok: false, code: 'PROBE_ARTIFACT_MISSING', detail: artifactPath };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, code: 'PROBE_ARTIFACT_CORRUPT', detail: artifactPath };
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, code: 'PROBE_ARTIFACT_CORRUPT', detail: artifactPath };
  }
  // Treat non-zero / non-finite exitCode as nonzero. Forged artifacts that
  // omit the field or set it to a string like "ok" must NOT pass the gate.
  if (!Number.isFinite(parsed.exitCode) || parsed.exitCode !== 0) {
    return {
      ok: false,
      code: 'PROBE_EXITCODE_NONZERO',
      detail: `exitCode=${JSON.stringify(parsed.exitCode)}`,
    };
  }
  if (Array.isArray(parsed.blockCodes) && parsed.blockCodes.length > 0) {
    return { ok: false, code: 'PROBE_BLOCKED', detail: parsed.blockCodes.join(', ') };
  }
  // Require summary to be a real object with finite numeric counters.
  // Missing / NaN / non-object summary => corrupt artifact.
  const summary = parsed.summary;
  if (typeof summary !== 'object' || summary === null) {
    return { ok: false, code: 'PROBE_ARTIFACT_CORRUPT', detail: 'summary missing' };
  }
  const total = Number(summary.total);
  const failed = Number(summary.failed);
  const passed = Number(summary.passed);
  const skipped = Number(summary.skipped);
  if (
    !Number.isFinite(total) ||
    !Number.isFinite(failed) ||
    !Number.isFinite(passed) ||
    !Number.isFinite(skipped)
  ) {
    return {
      ok: false,
      code: 'PROBE_ARTIFACT_CORRUPT',
      detail: 'summary.{total|failed|passed|skipped} not finite',
    };
  }
  if (total === 0) {
    return { ok: false, code: 'PROBE_NO_CASES', detail: 'summary.total === 0' };
  }
  if (failed > 0) {
    return { ok: false, code: 'PROBE_CASES_FAILED', detail: `failed=${failed}` };
  }
  if (skipped > 0 && passed === 0) {
    return { ok: false, code: 'PROBE_ALL_SKIPPED', detail: `skipped=${skipped}, passed=0` };
  }
  // Stale check.
  if (branch) {
    const newest = newestCommitMtime(branch, worktreePath);
    if (newest !== null && stat.mtimeMs < newest) {
      const dt = Math.round((newest - stat.mtimeMs) / 1000);
      return { ok: false, code: 'PROBE_STALE', detail: `artifact ${dt}s older than newest commit` };
    }
  }
  return { ok: true };
}

/**
 * Per-code diagnostic block — tells the agent WHY this code fired and
 * exactly how to investigate inside the target worktree. Goal: stuck-agent
 * recovery without escalation.
 */
function getDiagnostic(code, detail, worktreePath) {
  const wt = worktreePath;
  switch (code) {
    case 'PROBE_ARTIFACT_MISSING':
      return [
        'WHAT: The task worktree has no `.http-smoke.json` file. The',
        'builder either never ran `pnpm probe:smoke`, or the probe crashed',
        'before writing the artifact.',
        '',
        'INVESTIGATE (in the task worktree):',
        `  cd ${wt}`,
        '  pnpm stack:debug              # is pg/api/web up?',
        '  pnpm stack:logs api           # any boot errors?',
        '  ls -la .claude/hooks/.http-smoke.json       # confirm artifact missing',
        '',
        'FIX:',
        `  cd ${wt}`,
        '  pnpm stack:up && pnpm probe:smoke',
        '  jq ".summary" .claude/hooks/.http-smoke.json   # verify after run',
      ].join('\n');

    case 'PROBE_ARTIFACT_CORRUPT':
      return [
        'WHAT: `.http-smoke.json` exists but is not valid JSON. The probe',
        'was killed mid-write (Ctrl-C, OOM, or stack crash during run).',
        '',
        'INVESTIGATE:',
        `  cd ${wt}`,
        '  cat .claude/hooks/.http-smoke.json | tail -5    # see truncation point',
        '',
        'FIX:',
        `  cd ${wt}`,
        '  pnpm stack:up && pnpm probe:smoke   # full re-run',
      ].join('\n');

    case 'PROBE_EXITCODE_NONZERO':
      return [
        `WHAT: Probe exited non-zero (${detail}). Either the runner itself`,
        'failed (config / contract compile error) or one or more HTTP cases',
        'returned an unexpected response.',
        '',
        'INVESTIGATE:',
        `  cd ${wt}`,
        '  cat .claude/hooks/.http-smoke.md          # human-readable per-case summary',
        '  jq ".exitCode, .blockCodes, .summary" .claude/hooks/.http-smoke.json',
        '  jq \'.cases[] | select(.status != "passed")\' .claude/hooks/.http-smoke.json',
        '',
        'FIX: triage by failure type.',
        '  - HTTP code mismatch          → fix controller / guard / pipe',
        '  - Contract diagnostic         → see PROBE_BLOCKED diagnostics',
        '  - Stack not booted            → see PROBE_ALL_SKIPPED',
        'Then re-run probe:smoke in the worktree.',
      ].join('\n');

    case 'PROBE_BLOCKED':
      return [
        `WHAT: Static-analysis blockers (${detail}) prevented the probe from`,
        'running cases. Each block code maps to a fixable code-level issue',
        '(missing decorator, ambiguous capture, unreachable status, etc.).',
        '',
        'INVESTIGATE:',
        `  cd ${wt}`,
        '  jq ".blockCodes" .claude/hooks/.http-smoke.json',
        '',
        'FIX (route by code; see CLAUDE.md "probe failure → skill routing"):',
        '  RESOURCE_CAPTURE_UNDECLARED        → build-verifiable-features',
        '  RESOURCE_CAPTURE_PATHPARAM_UNDEC.. → build-verifiable-features',
        '  CONTRACT_STATUS_UNREACHABLE_UNGE.. → nestjs-probe-coverage §2.8',
        '  Cookie / CSRF / auth-bootstrap     → nestjs-probe-coverage §2.9',
        '  FLOW_*                             → flow-failure-response',
        'After fix, re-run `pnpm probe:smoke` in the worktree.',
      ].join('\n');

    case 'PROBE_NO_CASES':
      return [
        'WHAT: Probe ran but produced zero test cases. Either the diff added',
        'no controller endpoints, or the contract compiler returned an',
        'empty matrix (silent compile error).',
        '',
        'INVESTIGATE:',
        `  cd ${wt}`,
        '  jq "length" .claude/hooks/.matrix.json     # endpoint count',
        '  cat .claude/hooks/.matrix.stderr.log       # any silent compile errors?',
        '',
        'FIX:',
        '  - If matrix length is 0 and you DID add endpoints: fix the',
        '    compiler (likely missing @ApiResponse / @ApiTags decorator).',
        '  - If you really added no endpoints: add at least one, or skip',
        '    probing on diff that does not affect HTTP surface.',
      ].join('\n');

    case 'PROBE_CASES_FAILED':
      return [
        `WHAT: ${detail} probe case(s) hit the API and got an unexpected`,
        'response (status code, header, or body shape mismatch).',
        '',
        'INVESTIGATE:',
        `  cd ${wt}`,
        '  cat .claude/hooks/.http-smoke.md      # human-readable per-case failure',
        '  jq \'.cases[] | select(.status == "failed")\' .claude/hooks/.http-smoke.json',
        '',
        'FIX (per failed case): the probe shows expected vs actual. Patch',
        'the controller / DTO / guard / overlay until expected matches',
        'actual, then `pnpm probe:smoke` in the worktree to refresh.',
      ].join('\n');

    case 'PROBE_ALL_SKIPPED':
      return [
        'WHAT: Every case was skipped. Almost always means the stack did',
        'not boot — pg / api / web container failed health checks before',
        'cases ran.',
        '',
        'INVESTIGATE:',
        `  cd ${wt}`,
        '  pnpm stack:debug          # JSON snapshot of pg/api/web/bridge',
        '  pnpm stack:logs api       # last 200 lines of api logs',
        '  pnpm stack:logs postgres',
        '',
        'FIX: triage by which service is red.',
        '  - api down               → typecheck + DI errors + missing env',
        '  - postgres down          → migration error / port collision',
        '  - bridge missing         → pnpm stack:reset && pnpm stack:up',
      ].join('\n');

    case 'PROBE_STALE':
      return [
        `WHAT: ${detail}. New commits landed on the branch after the probe`,
        'ran, so the artifact does not reflect current code.',
        '',
        'INVESTIGATE:',
        `  cd ${wt}`,
        '  git log -3 --format="%h %ct %s"   # last commits + timestamps',
        '  stat .claude/hooks/.http-smoke.json             # artifact mtime',
        '',
        'FIX:',
        `  cd ${wt}`,
        '  pnpm probe:smoke          # re-run against the latest commit',
      ].join('\n');

    default:
      return [
        `WHAT: Unknown failure code (${code}). Detail: ${detail || '(none)'}.`,
        '',
        'INVESTIGATE:',
        `  cd ${wt}`,
        '  cat .claude/hooks/.http-smoke.md',
        '  jq "." .claude/hooks/.http-smoke.json',
        '',
        'FIX: re-run `pnpm probe:smoke` after diagnosing.',
      ].join('\n');
  }
}

function buildBlockMessage({ tracker, taskId, worktreePath, branch, evalResult, rawCommand }) {
  const bar = '━'.repeat(56);
  const diagnostic = getDiagnostic(evalResult.code, evalResult.detail, worktreePath);
  return [
    bar,
    `BLOCKED: Refusing \`${tracker} close ${taskId}\` — source probes not green.`,
    `Reason code:       ${evalResult.code}`,
    `Detail:            ${evalResult.detail || '(none)'}`,
    `Worktree:          ${worktreePath}`,
    `Branch:            ${branch || '(unknown)'}`,
    `Rejected command:  ${rawCommand}`,
    bar,
    '',
    diagnostic,
    '',
    `RETRY: once the probe is green in the worktree above, retry`,
    `\`${tracker} close ${taskId}\`. The hook reads the artifact at`,
    `${worktreePath}/.http-smoke.json — it does NOT re-run the probe.`,
    '',
    'COORDINATION: if you are NOT the builder of this task, do not try',
    'to fix the code yourself. Mail the task owner:',
    `  ov mail send --type question --to <builder-name> \\`,
    `      --subject "${taskId}: probe red, please re-run"`,
    'Include the failure code above. They have worktree access and',
    'context to investigate. Closing the task is your job; running the',
    'probe is theirs.',
  ].join('\n');
}

function emitDeny(message) {
  const envelope = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: message,
    },
  };
  process.stdout.write(JSON.stringify(envelope));
  process.exit(0);
}

function realpathSafe(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return p;
  }
}

function main() {
  const raw = readStdin();
  const input = parseInput(raw);
  if (!input || input.tool_name !== 'Bash') {
    process.exit(0);
  }
  const command = input.tool_input && input.tool_input.command;
  const intent = detectCloseIntent(command);
  if (!intent) {
    process.exit(0);
  }
  const cwd = process.env.CLAUDE_PROJECT_DIR || process.env.PROJECT_ROOT || process.cwd();
  const worktree = resolveWorktreeForTaskId(intent.taskId, cwd);
  if (!worktree) {
    // No worktree for this task — fail-open. Could be a fresh task with
    // no work yet, or a non-overstory task ID. Don't block.
    process.exit(0);
  }
  // If the close is happening from INSIDE the target worktree, treat it
  // as a self-close and fail-open. Lead/coordinator self-closing their
  // own task have no probe artifact in their worktree (they don't run
  // code). Builder/merger self-closing IS gated — but by the overstory
  // close-gate that runs `pnpm probe:smoke` directly as a quality gate,
  // not by reading the artifact. So fail-opening here is safe: foreign
  // closes still hit the artifact check below, and own closes are
  // covered by the appropriate other gate.
  const cwdReal = realpathSafe(cwd);
  const wtReal = realpathSafe(worktree.path);
  if (cwdReal === wtReal) {
    process.exit(0);
  }
  const evalResult = evaluateProbeArtifact(worktree.path, worktree.branch);
  if (evalResult.ok) {
    process.exit(0);
  }
  const message = buildBlockMessage({
    tracker: intent.tracker,
    taskId: intent.taskId,
    worktreePath: worktree.path,
    branch: worktree.branch,
    evalResult,
    rawCommand: intent.rawCommand,
  });
  emitDeny(message);
}

try {
  main();
} catch {
  // Fail-open on any uncaught error.
  process.exit(0);
}
