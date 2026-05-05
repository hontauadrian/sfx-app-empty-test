#!/usr/bin/env node
/**
 * Plan 07 defense-in-depth — Stop hook (LEAD profile only).
 *
 * Intercepts outbound worker_done mails. Parses the mail body's
 * ## runtime-evidence block for probe:smoke stats. Counts write endpoints
 * (POST/PUT/PATCH/DELETE) in the session's git diff. If the evidence
 * total is implausibly low compared to changed write endpoints, blocks.
 *
 * Built in builder profile dir; deployed to lead profile only via task #11.
 *
 * Contract:
 *   - Fires on Bash tool use matching `ov mail send ... worker_done ...`
 *   - Allow: exit 0, no stdout.
 *   - Block: exit 0, stdout = {"decision":"block","reason":"..."}
 */

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

/**
 * Parse runtime-evidence block from mail body text.
 * Looks for: probe:smoke: total=<N> passed=<P> failed=<F>
 */
function parseRuntimeEvidence(mailBody) {
  if (typeof mailBody !== 'string') return null;

  // Find ## runtime-evidence section
  const sectionMatch = mailBody.match(/##\s*runtime-evidence([\s\S]*?)(?=\n##\s|\n---|\s*$)/i);
  if (!sectionMatch) return null;

  const section = sectionMatch[1];
  const probeMatch = section.match(/probe:smoke:\s*total=(\d+)\s+passed=(\d+)\s+failed=(\d+)/);
  if (probeMatch) {
    return {
      total: parseInt(probeMatch[1], 10),
      passed: parseInt(probeMatch[2], 10),
      failed: parseInt(probeMatch[3], 10),
    };
  }

  // Fallback: fenced ```json { "total":N, "passed":P, "failed":F } ``` block.
  // Agents emit the http-smoke summary as raw JSON more often than the plain
  // `probe:smoke:` line. Accept both rather than block on format drift.
  const fencedJson = section.match(/```json\s*([\s\S]*?)\s*```/i);
  if (fencedJson) {
    try {
      const obj = JSON.parse(fencedJson[1]);
      if (
        typeof obj?.total === 'number' &&
        typeof obj?.passed === 'number' &&
        typeof obj?.failed === 'number'
      ) {
        return { total: obj.total, passed: obj.passed, failed: obj.failed };
      }
    } catch {
      // fall through
    }
  }

  // Last fallback: bare JSON object containing total/passed/failed anywhere
  // in the section. Tolerates inline `{...}` without fences.
  const bareJson = section.match(/\{[^{}]*?"total"\s*:\s*(\d+)[^{}]*?"passed"\s*:\s*(\d+)[^{}]*?"failed"\s*:\s*(\d+)[^{}]*?\}/);
  if (bareJson) {
    return {
      total: parseInt(bareJson[1], 10),
      passed: parseInt(bareJson[2], 10),
      failed: parseInt(bareJson[3], 10),
    };
  }

  return null;
}

/**
 * Count changed write endpoints from matrix or git diff.
 */
function countChangedWriteEndpoints(cwd) {
  // Try reading from matrix first
  const matrixPath = path.join(cwd, '.claude', 'hooks', '.matrix.json');
  try {
    const matrix = JSON.parse(fs.readFileSync(matrixPath, 'utf8'));
    if (Array.isArray(matrix?.apiEndpoints)) {
      const writeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
      return matrix.apiEndpoints.filter(
        (ep) => ep?.changed && writeMethods.has((ep.method || '').toUpperCase())
      ).length;
    }
  } catch {
    // Fall through to git-based detection
  }

  // Fallback: count from git diff by parsing controller files
  try {
    let baseRef;
    try {
      baseRef = execSync('git merge-base HEAD main', { cwd, encoding: 'utf8' }).trim();
    } catch {
      baseRef = 'HEAD~1';
    }

    const diff = execSync(`git diff --name-only ${baseRef} HEAD`, {
      cwd,
      encoding: 'utf8',
    }).trim();

    if (!diff) return 0;

    const controllers = diff.split('\n').filter((f) => /\.controller\.ts$/.test(f));
    let count = 0;
    const writeRe = /@(Post|Put|Patch|Delete)\s*\(/g;

    for (const relPath of controllers) {
      try {
        const content = fs.readFileSync(path.join(cwd, relPath), 'utf8');
        const matches = content.match(writeRe);
        if (matches) count += matches.length;
      } catch {
        // deleted file
      }
    }
    return count;
  } catch {
    return 0;
  }
}

/**
 * Extract mail body from the Bash command invoking `ov mail send`.
 */
function extractMailBody(command) {
  if (typeof command !== 'string') return null;

  // Match heredoc patterns: <<'EOF' ... EOF, << EOF ... EOF, etc.
  const heredocMatch = command.match(/<<\s*['"]?(\w+)['"]?\s*\n?([\s\S]*?)\n\1/);
  if (heredocMatch) return heredocMatch[2];

  // Match -m "..." or --body "..." patterns. The body may contain escaped
  // quotes (e.g. fenced JSON evidence has \"total\":5) — a naive lazy match
  // would truncate at the first inner \", losing the runtime-evidence block
  // and false-blocking with WORKER_DONE_EVIDENCE_MISSING. Walk past escaped
  // characters so the captured body spans the full quoted argument, then
  // unescape shell-style backslash sequences for downstream regex matches.
  const flagMatch = command.match(/(?:-m|--body)\s+(["'])((?:\\.|(?!\1)[\s\S])*)\1/);
  if (flagMatch) {
    return flagMatch[2].replace(/\\([\s\S])/g, '$1');
  }

  // Match the portion after worker_done as potential body
  const afterWorkerDone = command.match(/worker_done\s+([\s\S]+)/);
  if (afterWorkerDone) return afterWorkerDone[1];

  return command;
}

/**
 * Read the on-disk smoke-report artifact written by the probe runner.
 * Returns null if missing/unreadable. Used to cross-reference the agent's
 * claimed evidence against what the probe actually wrote.
 */
function readSmokeArtifact(cwd) {
  const artifactPath = path.join(cwd, '.claude', 'hooks', '.http-smoke.json');
  try {
    const stat = fs.statSync(artifactPath);
    const raw = fs.readFileSync(artifactPath, 'utf8');
    const parsed = JSON.parse(raw);
    return { parsed, mtimeMs: stat.mtimeMs, path: artifactPath };
  } catch {
    return null;
  }
}

function runGuard({ stdinRaw, cwd } = {}) {
  try {
    if (!stdinRaw) return { allow: true };

    let payload;
    try {
      payload = JSON.parse(stdinRaw);
    } catch {
      return { allow: true };
    }

    const toolName = payload?.tool_name;
    if (toolName !== 'Bash') return { allow: true };

    const command = payload?.tool_input?.command;
    if (typeof command !== 'string') return { allow: true };

    // Only intercept ov mail send ... worker_done
    if (!/ov\s+mail\s+send/.test(command) || !/worker_done/.test(command)) {
      return { allow: true };
    }

    const projectDir = cwd || process.env.CLAUDE_PROJECT_DIR || process.env.PROJECT_ROOT || process.cwd();

    const mailBody = extractMailBody(command);
    const evidence = parseRuntimeEvidence(mailBody);

    if (!evidence) {
      return {
        allow: false,
        decision: 'block',
        reason:
          'WORKER_DONE_EVIDENCE_MISSING: worker_done mail does not contain a ' +
          '## runtime-evidence block with probe:smoke stats. Run `pnpm probe:smoke` ' +
          'and include the results as: probe:smoke: total=<N> passed=<P> failed=<F>. ' +
          'Prose claims like "exit code 0" are not accepted — paste the actual ' +
          '[http-smoke-summary] line from the probe stdout.',
      };
    }

    // Reject zero-effort claims: total=0 means the probe never ran (or crashed
    // before any case). A worker_done with no executed cases is not evidence.
    if (evidence.total === 0) {
      return {
        allow: false,
        decision: 'block',
        reason:
          'WORKER_DONE_EVIDENCE_EMPTY: runtime-evidence reports total=0 cases. ' +
          'A probe run with zero cases is not evidence — either the matrix is ' +
          'empty or the stack failed to boot. Read the probe stdout for the ' +
          '[http-smoke-stack-stderr] block, fix the underlying error, and re-run ' +
          '`pnpm probe:smoke` until total>0.',
      };
    }

    // Cross-reference the on-disk artifact written by the probe runner. If
    // the agent's claim disagrees with what the probe actually wrote, the
    // claim is fabricated or stale. The artifact is the source of truth.
    const artifact = readSmokeArtifact(projectDir);
    if (artifact) {
      const a = artifact.parsed;
      const claimedMatchesArtifact =
        typeof a?.summary?.total === 'number' &&
        typeof a?.summary?.passed === 'number' &&
        typeof a?.summary?.failed === 'number' &&
        a.summary.total === evidence.total &&
        a.summary.passed === evidence.passed &&
        a.summary.failed === evidence.failed;

      if (!claimedMatchesArtifact) {
        const got = a?.summary
          ? `total=${a.summary.total} passed=${a.summary.passed} failed=${a.summary.failed}`
          : 'no summary';
        return {
          allow: false,
          decision: 'block',
          reason:
            `WORKER_DONE_EVIDENCE_FABRICATED: runtime-evidence claims ` +
            `total=${evidence.total} passed=${evidence.passed} failed=${evidence.failed} ` +
            `but the on-disk probe artifact at .claude/hooks/.http-smoke.json reports ` +
            `${got}. Re-run \`pnpm probe:smoke\` and quote the [http-smoke-summary] ` +
            `line verbatim from stdout — do not paraphrase or invent counts.`,
        };
      }

      // Freshness check — artifact must be newer than 30 minutes. Stale
      // artifacts mean the agent ran probe:smoke earlier in the session and
      // is now claiming completion based on a snapshot that predates recent
      // edits. Either passes or fails matter only relative to current code.
      const ageMs = Date.now() - artifact.mtimeMs;
      const STALE_MS = 30 * 60 * 1000;
      if (ageMs > STALE_MS) {
        const ageMin = Math.floor(ageMs / 60000);
        return {
          allow: false,
          decision: 'block',
          reason:
            `WORKER_DONE_EVIDENCE_STALE: probe artifact at ` +
            `.claude/hooks/.http-smoke.json is ${ageMin} minutes old. Evidence ` +
            `must reflect the current code state. Re-run \`pnpm probe:smoke\` ` +
            `before sending worker_done.`,
        };
      }

      // Block on artifact failure status — the artifact says probe failed,
      // but the agent is claiming worker_done anyway. The block reason from
      // the artifact is authoritative.
      if (typeof a?.exitCode === 'number' && a.exitCode !== 0 && evidence.failed === 0) {
        return {
          allow: false,
          decision: 'block',
          reason:
            `WORKER_DONE_EVIDENCE_HIDES_FAILURE: probe artifact reports ` +
            `exitCode=${a.exitCode}` +
            (a.blockReason ? ` blockReason="${a.blockReason}"` : '') +
            `, but runtime-evidence claims failed=0. The probe failed; ` +
            `worker_done must surface failed>0 or block-reason in the mail.`,
        };
      }
    }

    const changedWriteEndpoints = countChangedWriteEndpoints(projectDir);

    if (changedWriteEndpoints > 0 && evidence.total < changedWriteEndpoints) {
      return {
        allow: false,
        decision: 'block',
        reason:
          `WORKER_DONE_EVIDENCE_IMPLAUSIBLE: runtime-evidence shows total=${evidence.total} ` +
          `but diff changed ${changedWriteEndpoints} write endpoints. Either run the probe ` +
          `again or explain the gap in the mail.`,
      };
    }

    return { allow: true };
  } catch {
    return { allow: true };
  }
}

function readStdinSafe() {
  try {
    if (process.stdin.isTTY) return '';
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function mainCli() {
  const cwd = process.env.CLAUDE_PROJECT_DIR || process.env.PROJECT_ROOT || process.cwd();
  const stdinRaw = readStdinSafe();
  const result = runGuard({ stdinRaw, cwd });
  if (result.allow) {
    process.exit(0);
  }
  process.stdout.write(JSON.stringify({ decision: result.decision, reason: result.reason }));
  process.exit(0);
}

if (require.main === module) {
  mainCli();
}

module.exports = { runGuard, parseRuntimeEvidence, extractMailBody, countChangedWriteEndpoints, readSmokeArtifact };
