#!/usr/bin/env node
/**
 * Plan 07 defense-in-depth — PreToolUse (warn, not block).
 *
 * Monitors Bash calls matching `git commit` or `git add`. If the staged
 * diff includes .runtime-contract.overlay.json AND more than 2 non-overlay
 * files, emits a warning suggesting the overlay edit be split into its own
 * commit.
 *
 * Contract:
 *   - PreToolUse, matcher "Bash"
 *   - Always exit 0 (warn, never block)
 *   - Warning: stdout JSON with reason but no "block" decision
 */

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const OVERLAY_FILE = '.runtime-contract.overlay.json';

/**
 * Get currently staged files from git.
 */
function getStagedFiles(cwd) {
  try {
    const output = execSync('git diff --cached --name-only', {
      cwd,
      encoding: 'utf8',
      timeout: 5000,
    }).trim();
    if (!output) return [];
    return output.split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Check if a command is a git commit or git add operation.
 */
function isGitCommitOrAdd(command) {
  if (typeof command !== 'string') return false;
  return /\bgit\s+(commit|add)\b/.test(command);
}

/**
 * Check if a git add command includes the overlay file.
 */
function addsOverlayFile(command) {
  if (typeof command !== 'string') return false;
  return command.includes(OVERLAY_FILE);
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

    if (payload?.tool_name !== 'Bash') return { allow: true };

    const command = payload?.tool_input?.command;
    if (!isGitCommitOrAdd(command)) return { allow: true };

    const projectDir = cwd || process.env.CLAUDE_PROJECT_DIR || process.env.PROJECT_ROOT || process.cwd();

    // For git add, check if overlay is being added along with many files
    if (/\bgit\s+add\b/.test(command) && addsOverlayFile(command)) {
      // Count other files being added in the same command
      const parts = command.split(/\s+/).filter(
        (p) => !p.startsWith('-') && p !== 'git' && p !== 'add' && p !== OVERLAY_FILE
      );
      const otherFiles = parts.filter((p) => !p.includes(OVERLAY_FILE));
      if (otherFiles.length > 2) {
        return {
          allow: true,
          reason:
            `OVERLAY_COMMIT_CO_MINGLED: overlay-contract changes are being staged ` +
            `with ${otherFiles.length} other files. Consider splitting the overlay ` +
            `edit into its own commit for reviewability.`,
        };
      }
      return { allow: true };
    }

    // For git commit, check staged files
    if (/\bgit\s+commit\b/.test(command)) {
      const staged = getStagedFiles(projectDir);
      const hasOverlay = staged.some((f) => f.includes(OVERLAY_FILE));
      if (!hasOverlay) return { allow: true };

      const nonOverlay = staged.filter((f) => !f.includes(OVERLAY_FILE));
      if (nonOverlay.length > 2) {
        return {
          allow: true,
          reason:
            `OVERLAY_COMMIT_CO_MINGLED: overlay-contract changes should be isolated. ` +
            `The staged diff includes ${OVERLAY_FILE} alongside ${nonOverlay.length} ` +
            `other files. Consider splitting the overlay edit into its own commit ` +
            `for reviewability.`,
        };
      }
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
  if (!result.allow) {
    process.stdout.write(JSON.stringify({ decision: result.decision, reason: result.reason }));
  } else if (result.reason) {
    // Warning — emit reason as additional_context but don't block
    process.stdout.write(JSON.stringify({ decision: 'allow', reason: result.reason }));
  }
  process.exit(0);
}

if (require.main === module) {
  mainCli();
}

module.exports = { runGuard, isGitCommitOrAdd, addsOverlayFile, getStagedFiles };
