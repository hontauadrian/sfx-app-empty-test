/**
 * Stop hook — auto-commit dirty worktree as WIP when a builder/scout
 * session ends.
 *
 * Why: builders frequently zombie mid-task (context exhaustion, manual
 * `ov stop`, claude crash). Without this hook, anything they wrote but
 * didn't commit dies when `ov worktree clean --completed` reaps the
 * worktree. We saw teams-backend-builder-1 lose 50min of edits and
 * teams-backend-builder-2 lose ~25min when their sessions ended with 0
 * commits despite real Write activity. Multiply across a run and it
 * costs hours.
 *
 * What: at session end, if the worktree has any modifications or
 * untracked tracked-eligible files, stage everything and commit with a
 * `[WIP-ZOMBIE-RECOVERY]` marker. The branch stays alive, the WIP commit
 * is on it, and lead/coord can cherry-pick or re-spawn against it.
 *
 * Boundaries:
 *  - Only runs for capability=builder|scout|merger. Builders/scouts
 *    write source; mergers can leave a dirty index mid-conflict-
 *    resolution (ai-resolve / hand-resolve writes blobs but the merge
 *    commit hasn't been recorded yet — same loss risk). Leads and
 *    reviewers excluded: their dirty state is coordination metadata
 *    that shouldn't auto-land.
 *  - Only runs in overstory worktrees (OVERSTORY_AGENT_NAME set).
 *  - Skips if the worktree is clean.
 *  - Excludes paths that the skip-worktree machinery already hides
 *    (.claude/* phantom diffs from profile overlay).
 *  - WIP commit message starts with `[WIP-ZOMBIE-RECOVERY]` so lead can
 *    grep it and decide to keep, squash, or drop.
 *  - Never blocks the Stop event — fail-open for any internal error so a
 *    bug here can't trap a session.
 *
 * Recovery flow for lead:
 *   git -C <builder-wt> log --oneline --grep '[WIP-ZOMBIE-RECOVERY]'
 *   git -C <builder-wt> show <wip-sha>
 *   # cherry-pick the actual content, drop the marker commit, etc.
 */
'use strict';

const fs = require('node:fs');
const cp = require('node:child_process');

function out() {
  // Stop hooks can read JSON from stdin (session info) but don't need it.
  // Just exit 0 silently on any error.
  process.exit(0);
}

try {
  const agentName = process.env.OVERSTORY_AGENT_NAME;
  if (!agentName) out();

  const capability = process.env.OVERSTORY_AGENT_CAPABILITY || '';
  if (!['builder', 'scout', 'merger'].includes(capability)) out();

  // Discover the worktree root.
  let toplevel;
  try {
    toplevel = cp.execSync('git rev-parse --show-toplevel', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { out(); }
  if (!toplevel) out();

  // Worktree dirty? Check both staged + unstaged + untracked.
  let porcelain;
  try {
    porcelain = cp.execSync('git status --porcelain', { encoding: 'utf8', cwd: toplevel, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch { out(); }
  // Filter out paths that are skip-worktree'd (.claude/* phantom diffs)
  // — those are not real work, just profile-overlay residue.
  const realDirty = porcelain.split('\n').some((line) => {
    if (line.length < 4) return false;
    const path = line.slice(3).split(' -> ').pop();
    if (!path) return false;
    if (path.startsWith('.claude/')) return false; // profile overlay residue
    return true;
  });
  if (!realDirty) out();

  // Stage real work only — exclude .claude/* paths (profile overlay
  // phantom diffs, never real builder output). Without the exclude, an
  // earlier `git add -A` was bundling the overlay deletions into the WIP
  // commit; a cherry-pick later would re-delete those files on master.
  try {
    cp.execSync("git add -A -- . ':(exclude).claude'", { cwd: toplevel, stdio: 'ignore' });
  } catch { out(); }

  // Anything actually staged?
  let stagedDiff;
  try {
    stagedDiff = cp.execSync('git diff --cached --name-only', { encoding: 'utf8', cwd: toplevel, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { out(); }
  if (!stagedDiff) out();

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const subject = `[WIP-ZOMBIE-RECOVERY] ${agentName} session-end ${ts}`;
  const body = [
    'Auto-committed by .claude/hooks/auto-commit-wip-on-stop.js because the',
    'session ended with a dirty worktree. This commit preserves the agent\'s',
    'in-progress edits so a lead/coord can recover them via cherry-pick',
    'instead of losing the work to `ov worktree clean --completed`.',
    '',
    'Do NOT merge this commit directly into canonical — it bypasses the',
    'normal worker_done / probe pipeline. Cherry-pick the useful pieces',
    'into a fresh builder branch and re-run the standard flow.',
  ].join('\n');

  // Commit using the agent's own git identity (already set by ov sling).
  // Pass message via spawnSync arg-array so newlines in `body` survive
  // (execSync + JSON.stringify produced literal "\n" sequences in the
  // commit message). No --no-verify: if a hook denies this, fall through
  // to fail-open. The point is rescue, not bypass.
  try {
    const result = cp.spawnSync('git', ['commit', '-m', subject, '-m', body], {
      cwd: toplevel,
      stdio: 'ignore',
    });
    if (result.status === 0) {
      process.stderr.write(`[auto-commit-wip-on-stop] WIP committed for ${agentName}\n`);
    }
  } catch { /* fail-open */ }

  out();
} catch {
  out();
}
