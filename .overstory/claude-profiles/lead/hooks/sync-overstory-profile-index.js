/**
 * SessionStart hook — neutralise phantom .claude/ deltas left by the
 * overstory profile overlay.
 *
 * Why: `ov sling` provisions a worktree, then `runtimes/claude.ts ::
 * copyProfile()` rm's `.claude/{hooks,skills}` and cp's the agent's
 * profile-specific copies in. The boilerplate's master tree tracks a
 * superset of those paths, so git sees 50–80 phantom deletions per
 * worktree. When the agent eventually runs `git add -A` / `git commit
 * -a`, those deletions get committed and cascade into master on merge
 * (commit 165d7b7 was the post-mortem from auth-frontend-builder).
 *
 * Mark every .claude/ path that drifts from HEAD as
 * `skip-worktree` — git ignores worktree changes to it. Agents
 * shouldn't be editing `.claude/` anyway; if they need to, they can
 * `git update-index --no-skip-worktree <path>` manually.
 *
 * Only runs when OVERSTORY_AGENT_NAME is set (i.e. inside an agent
 * worktree, not the panel itself or a developer's working tree).
 */
const cp = require('child_process');

if (!process.env.OVERSTORY_AGENT_NAME) process.exit(0);

let toplevel;
try {
  toplevel = cp.execSync('git rev-parse --show-toplevel', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
} catch {
  process.exit(0);
}

let porcelain;
try {
  porcelain = cp.execSync('git status --porcelain -uno -- .claude', { encoding: 'utf8', cwd: toplevel, stdio: ['ignore', 'pipe', 'ignore'] });
} catch {
  process.exit(0);
}

const drifted = [];
for (const line of porcelain.split('\n')) {
  if (line.length < 4) continue;
  const candidate = line.slice(3).replace(/^"(.*)"$/, '$1');
  if (candidate.startsWith('.claude/')) drifted.push(candidate);
}
if (drifted.length === 0) process.exit(0);

try {
  cp.execSync('git update-index --skip-worktree --stdin', {
    cwd: toplevel,
    input: drifted.join('\n') + '\n',
    stdio: ['pipe', 'ignore', 'ignore'],
  });
} catch {
  for (const path of drifted) {
    try {
      cp.spawnSync('git', ['update-index', '--skip-worktree', '--', path], { cwd: toplevel, stdio: 'ignore' });
    } catch {}
  }
}

process.exit(0);
