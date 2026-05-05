#!/usr/bin/env node
/**
 * PreToolUse hook — block `ov stop <builder>` while the target builder's
 * smoke probe artifact is missing or red.
 *
 * Why this exists:
 *   On 2026-04-27 a lead ran `ov stop builder-task-backend` while the
 *   builder was actively retrying `ov mail send --type worker_done` and
 *   being correctly denied by the `worker-done-evidence` hook. Killing a
 *   live builder discards its in-progress fixes; merging its branch
 *   afterwards bypasses the probe gate. The merge-time gate
 *   (`no-merge-without-source-probes.js`) catches the merge but the
 *   builder's context is already gone. The right place to gate is at
 *   `ov stop`, before the builder is killed.
 *
 *   This hook only targets builders/mergers (by name pattern). Scouts,
 *   reviewers, probe-runners, finishers, and fixers are NOT gated — leads
 *   must be free to clean those up.
 *
 * Contract:
 *   - PreToolUse, matcher "Bash"
 *   - stdin: { tool_name: "Bash", tool_input: { command: "<agent-supplied>" } }
 *   - Allow:  exit 0, no stdout.
 *   - Block:  exit 0, stdout = PreToolUse deny envelope with reason text.
 *   - Internal error: fail-open. Bugs in this hook MUST NOT prevent
 *     non-stop work. Same fail-open contract as bash-allowlist.js and
 *     no-merge-without-source-probes.js.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

// Heuristic: which targets are gated. Scouts/reviewers/helpers are not.
const BUILDER_NAME_RE = /^(builder[-_]|b[0-9]+[-_]|merger[-_])/i;

function stripShellComments(command) {
  return command.replace(/#.*$/gm, '');
}

function extractStopTarget(rawCommand) {
  if (typeof rawCommand !== 'string' || rawCommand.length === 0) return null;
  const command = stripShellComments(rawCommand);
  // Match `ov stop <target>` allowing whitespace and prior tokens.
  const match = command.match(/\bov\s+stop\s+(\S+)/);
  if (!match) return null;
  const target = match[1];
  if (!target) return null;
  // Skip flags / --all / --help.
  if (target.startsWith('-')) return null;
  if (target === '--all' || target === '--help') return null;
  return target;
}

function isBuilderLikeName(target) {
  return BUILDER_NAME_RE.test(target);
}

function resolveTargetWorktree(target, opts) {
  const cwd = opts.cwd;
  const exec = opts.execSync || execSync;
  let porcelain;
  try {
    porcelain = exec('git worktree list --porcelain', { cwd, encoding: 'utf8' });
  } catch {
    return null;
  }
  const blocks = porcelain.split(/\n\n+/);
  for (const block of blocks) {
    const wtMatch = block.match(/^worktree\s+(.+)$/m);
    const branchMatch = block.match(/^branch\s+(.+)$/m);
    if (!wtMatch) continue;
    const wtPath = wtMatch[1].trim();
    const fullRef = branchMatch ? branchMatch[1].trim() : '';
    // Match by worktree path ending in `/.overstory/worktrees/<target>`.
    if (
      wtPath.endsWith(`/.overstory/worktrees/${target}`) ||
      wtPath.endsWith(`\\.overstory\\worktrees\\${target}`)
    ) {
      return wtPath;
    }
    // Match by branch ref containing `/<target>/`.
    if (fullRef && fullRef.includes(`/${target}/`)) {
      return wtPath;
    }
    if (fullRef && fullRef.endsWith(`/${target}`)) {
      return wtPath;
    }
  }
  return null;
}

function evaluateProbeArtifact(worktreePath) {
  const probePath = path.join(worktreePath, '.claude', 'hooks', '.http-smoke.json');
  if (!fs.existsSync(probePath)) {
    return {
      code: 'PROBE_NEVER_GREEN',
      message: `Builder worktree has no probe artifact at ${probePath}.`,
      probePath,
    };
  }
  let probe;
  try {
    probe = JSON.parse(fs.readFileSync(probePath, 'utf8'));
  } catch (error) {
    return {
      code: 'PROBE_ARTIFACT_CORRUPT',
      message: `Probe artifact is not valid JSON: ${error.message}`,
      probePath,
    };
  }

  const exitCode = Number(probe?.exitCode);
  const blockCodes = Array.isArray(probe?.blockCodes) ? probe.blockCodes : [];
  const blockReason =
    typeof probe?.blockReason === 'string' && probe.blockReason.length > 0
      ? probe.blockReason : null;

  if (blockCodes.length > 0) {
    return {
      code: 'PROBE_BLOCKED',
      message: `Probe reported block codes: ${blockCodes.join(', ')}.`,
      details: blockReason,
      probePath,
    };
  }
  if (!Number.isFinite(exitCode) || exitCode !== 0) {
    return {
      code: 'PROBE_EXITCODE_NONZERO',
      message: `Probe exitCode is ${probe?.exitCode}, expected 0.`,
      details: blockReason,
      probePath,
    };
  }

  const summary = probe?.summary || {};
  const cases = Array.isArray(probe?.cases) ? probe.cases : [];
  const total = Number(summary.total);
  const failed = Number(summary.failed);
  const passed = Number(summary.passed);
  const skipped = Number(summary.skipped);

  if ((Number.isFinite(total) && total === 0) || cases.length === 0) {
    return {
      code: 'PROBE_NO_CASES',
      message: 'Probe ran but exercised zero cases (summary.total=0 / cases empty).',
      probePath,
    };
  }
  if (Number.isFinite(failed) && failed > 0) {
    const failingCases = cases.filter((c) => c && c.passed === false);
    const lines = failingCases.slice(0, 10).map((c) => {
      const label = c?.label ?? '(unknown)';
      const status = typeof c?.status === 'number' ? ` [${c.status}]` : '';
      const reason = c?.blockReason ?? 'failed';
      return `  ✗ ${label}${status} — ${reason}`;
    });
    return {
      code: 'PROBE_CASES_FAILED',
      message: `Probe reports ${failed} failing case(s).`,
      details: lines.length > 0 ? lines.join('\n') : null,
      probePath,
    };
  }
  if (
    Number.isFinite(skipped) && skipped > 0 &&
    Number.isFinite(passed) && passed === 0
  ) {
    return {
      code: 'PROBE_ALL_SKIPPED',
      message: `Probe skipped every case (skipped=${skipped}, passed=0).`,
      probePath,
    };
  }

  return null;
}

function buildBlockMessage({ matchedCommand, target, worktreePath, block }) {
  const truncated =
    matchedCommand.length > 140 ? `${matchedCommand.slice(0, 140)}…` : matchedCommand;
  const lines = [
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    `BLOCKED: Refusing \`ov stop ${target}\` — its smoke probes are not green.`,
    `Reason code:       ${block.code}`,
    `Rejected command:  ${truncated.trim()}`,
    `Worktree:          ${worktreePath}`,
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    block.message,
  ];
  if (block.details) lines.push('', 'Details:', block.details);
  lines.push(
    '',
    '### Why this is blocked',
    '',
    "A red or missing probe artifact on a builder's worktree means the builder",
    'has not yet shipped a verifiable result. Stopping it now discards its',
    'in-progress fixes and forces the lead (or coordinator) to either ship',
    'unverified work or rebuild from scratch.',
    '',
    "**A hook denying the builder's tool calls is the gate WORKING — not a",
    'stuck builder.** If `ov mail send --type worker_done` is being blocked by',
    '`worker-done-evidence`, that means the builder has not satisfied the',
    'evidence contract yet. Killing it does not solve that; it only hides it.',
    '',
    '### Remediation',
    '',
    '1. Run `ov inspect <builder> --limit 30` to see live tool activity. A',
    '   builder hitting hook denials repeatedly is iterating, not stuck.',
    "2. Read the builder's actual probe artifact at the path above to",
    '   understand WHY probes are red. STACK_BOOT_FAILED is not automatically',
    '   "infrastructure" — check schema migrations, port collisions, env vars,',
    "   and the builder's own diff for what they may have broken.",
    '3. If you can help, send a `status` mail with concrete diagnostics. Do',
    '   NOT nudge the builder to bypass the gate (e.g. "include the failure',
    '   as the runtime-evidence block, the hook will allow it"). That is',
    '   `GATE_GAMING_NUDGE` and you will be auditable.',
    '4. If you genuinely cannot diagnose, escalate to coordinator with',
    '   `--type error --priority high`. The coordinator can spawn a',
    '   probe-runner. **Do not kill the builder before escalating** — the',
    '   coordinator may want it alive.',
    '5. If the builder is unambiguously deadlocked (no tool activity for >30',
    '   minutes per `ov inspect`), still escalate first; do not bypass this',
    '   hook.',
  );
  return lines.join('\n');
}

function emitDeny(message) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: message,
    },
  }));
}

// ─────────────────────────────────────────────────────────────────────
// Pure entry point
// ─────────────────────────────────────────────────────────────────────

function runGuard(opts) {
  const { stdinRaw, cwd, execSync: execStub } = opts;

  let input;
  try { input = JSON.parse(stdinRaw); }
  catch { return { allow: true }; }

  if (input?.tool_name !== 'Bash') return { allow: true };

  const command = input?.tool_input?.command || '';
  const target = extractStopTarget(command);
  if (!target) return { allow: true };
  if (!isBuilderLikeName(target)) return { allow: true };

  try {
    const worktreePath = resolveTargetWorktree(target, { cwd, execSync: execStub });
    if (!worktreePath) {
      // Target already cleaned / no live worktree → ov stop is a no-op.
      return { allow: true };
    }

    const block = evaluateProbeArtifact(worktreePath);
    if (!block) return { allow: true };

    return {
      allow: false,
      code: block.code,
      message: buildBlockMessage({
        matchedCommand: command,
        target,
        worktreePath,
        block,
      }),
    };
  } catch {
    return { allow: true };
  }
}

function readStdinSafe() {
  try {
    if (process.stdin.isTTY) return '';
    return fs.readFileSync(0, 'utf8');
  } catch { return ''; }
}

function mainCli() {
  try {
    const cwd = process.env.CLAUDE_PROJECT_DIR || process.env.PROJECT_ROOT || process.cwd();
    const stdinRaw = readStdinSafe();
    const result = runGuard({ stdinRaw, cwd });
    if (result.allow) process.exit(0);
    emitDeny(result.message);
    process.exit(0);
  } catch { process.exit(0); }
}

if (require.main === module) mainCli();

module.exports = {
  runGuard,
  extractStopTarget,
  isBuilderLikeName,
  resolveTargetWorktree,
  evaluateProbeArtifact,
};
