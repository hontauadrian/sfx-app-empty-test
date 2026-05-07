/**
 * PreToolUse:Bash hook — refuse `ov stop <agent> --clean-worktree` when the
 * agent's branch has not yet been merged into the canonical branch.
 *
 * `ov stop --clean-worktree` deletes BOTH the worktree AND the branch in a
 * single transaction. If the caller runs this before `ov merge` lands the
 * branch into master/main, the commits become unreachable — the agent's work
 * is lost and the lead has no probe artifact to satisfy the merge gate
 * (worktree gone) and no branch to merge against (branch gone). The
 * coordinator's natural pattern of "stop and clean up after worker_done"
 * silently drops the entire chunk.
 *
 * Block path: parse the command, locate the agent name, read its branch from
 * sessions.db, and verify the branch is an ancestor of the canonical branch.
 * If not merged, deny with the exact safe sequence to follow.
 *
 * Allow path: branch already merged → cleanup is the right call. Pass through.
 *
 * Falls open if any data is unavailable (sessions.db missing, agent not
 * found, git command fails) — better to let cleanup proceed than block on a
 * stale-state false positive.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

let input;
try {
  input = JSON.parse(fs.readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

if (input.tool_name !== 'Bash') process.exit(0);

const command = input.tool_input?.command ?? '';
if (typeof command !== 'string') process.exit(0);

const STOP_CLEAN_PATTERN = /\bov\s+stop\b[^|;&]*\s--clean-worktree\b/;
if (!STOP_CLEAN_PATTERN.test(command)) process.exit(0);

const agentMatch = command.match(/\bov\s+stop\s+(?:--[\w-]+(?:=\S+)?\s+)*([A-Za-z0-9][\w.-]*)/);
const agentName = agentMatch?.[1];
if (!agentName) process.exit(0);

function findOverstoryRoot(startDir) {
  let current = startDir;
  for (let depth = 0; depth < 10; depth += 1) {
    const candidate = path.join(current, '.overstory', 'sessions.db');
    if (fs.existsSync(candidate)) return path.join(current, '.overstory');
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

const cwd = process.cwd();
const overstoryDir = findOverstoryRoot(cwd);
if (!overstoryDir) process.exit(0);

const sessionsDbPath = path.join(overstoryDir, 'sessions.db');
const projectRoot = path.dirname(overstoryDir);

function loadBetterSqlite3() {
  const candidates = [
    'better-sqlite3',
    '/app/node_modules/better-sqlite3',
    '/workspace/node_modules/better-sqlite3',
    path.join(projectRoot, 'node_modules', 'better-sqlite3'),
    '/Users/mako/Documents/GitHub/sfx-team-panel/node_modules/better-sqlite3',
  ];
  for (const candidate of candidates) {
    try { return require(candidate); } catch { /* try next */ }
  }
  return null;
}

let session;
try {
  const Database = loadBetterSqlite3();
  if (!Database) process.exit(0);
  const db = new Database(sessionsDbPath, { readonly: true });
  session = db.prepare(
    'SELECT branch_name, state FROM sessions WHERE agent_name = ? ORDER BY started_at DESC LIMIT 1'
  ).get(agentName);
  db.close();
} catch {
  process.exit(0);
}

const branch = session?.branch_name;
if (!branch) process.exit(0);

function detectCanonicalBranch() {
  // Authoritative source 1: overstory config.yaml — operator-declared.
  try {
    const cfgPath = path.join(overstoryDir, 'config.yaml');
    if (fs.existsSync(cfgPath)) {
      const cfgText = fs.readFileSync(cfgPath, 'utf8');
      const match = cfgText.match(/^\s*canonicalBranch:\s*(\S+)/m);
      if (match) return match[1].replace(/['"]/g, '');
    }
  } catch {
    // fall through
  }
  // Authoritative source 2: git's own record of origin's default HEAD.
  try {
    const head = execSync('git symbolic-ref --short refs/remotes/origin/HEAD', {
      cwd: projectRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (head.startsWith('origin/')) return head.slice('origin/'.length);
    if (head) return head;
  } catch {
    // fall through
  }
  return null;
}

const canonicalBranch = detectCanonicalBranch();
if (!canonicalBranch) process.exit(0);

let branchMerged = false;
try {
  execSync(
    `git merge-base --is-ancestor ${branch} ${canonicalBranch}`,
    { cwd: projectRoot, stdio: ['ignore', 'pipe', 'pipe'] }
  );
  branchMerged = true;
} catch {
  branchMerged = false;
}

if (branchMerged) process.exit(0);

const reason = [
  `BLOCKED: \`ov stop ${agentName} --clean-worktree\` would destroy unmerged work.`,
  '',
  `  Branch:           ${branch}`,
  `  Canonical:        ${canonicalBranch}`,
  `  Merged into ${canonicalBranch}? NO`,
  '',
  '`--clean-worktree` deletes the worktree AND the branch in one transaction.',
  'Running it now leaves no branch to merge from and no probe artifact to',
  'satisfy the merge gate. The agent\'s commits become unreachable.',
  '',
  'Safe sequence:',
  `  1. ov merge --branch ${branch}     # land code into ${canonicalBranch}`,
  `  2. ov stop ${agentName} --clean-worktree   # safe to clean now`,
  '',
  'If the merge is blocked by PROBE_ARTIFACT_MISSING, run probe:smoke in the',
  'agent\'s worktree (still on disk until you clean it) BEFORE stopping.',
].join('\n');

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'deny',
    permissionDecisionReason: reason,
  },
}) + '\n');
