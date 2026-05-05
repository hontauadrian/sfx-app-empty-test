/**
 * Plan 06 Layer D — shared humanized-report writer.
 *
 * Every gate hook that blocks imports this and emits a short human-readable
 * .md file under <worktree>/.claude/hook-reports/. The agent's stdout is ONE
 * block-reason envelope; detail lives in the report (the only feedback
 * surface the agent is allowed to read under Layer A).
 *
 * Policy:
 *   - Never include regexes, tokenizer rules, check names, probe hashes, or
 *     the exact HTTP body the probe sent.
 *   - Do include: failure mode, time, hook name, a plain-language description
 *     of the broken contract, and a plain-language recovery action.
 *   - Pruning (§5.3): keep all reports from current UTC day; keep latest 50;
 *     keep latest per <hook-name>.
 */

const fs = require('node:fs');
const path = require('node:path');

const HOOK_REPORTS_DIR_NAME = path.join('.claude', 'hook-reports');

function isoTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').replace(/-\d{3}Z$/, 'Z');
}

function ensureDir(cwd) {
  const dir = path.join(cwd, HOOK_REPORTS_DIR_NAME);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Render a single report body from structured fields. Every field except
 * `hookName` and `failureMode` is optional; missing fields are elided.
 */
function renderReport({
  hookName,
  failureMode,
  taskId,
  agentName,
  whatBroke,
  whatToDo,
  relatedFiles,
}) {
  const lines = [];
  lines.push(`# ${hookName} — BLOCK`);
  lines.push('');
  lines.push(`**Time:** ${new Date().toISOString()}`);
  if (taskId) lines.push(`**Task:** ${taskId}`);
  if (agentName) lines.push(`**Agent:** ${agentName}`);
  lines.push(`**Failure mode:** ${failureMode}`);
  lines.push('');
  if (whatBroke) {
    lines.push('## What broke');
    lines.push('');
    lines.push(whatBroke);
    lines.push('');
  }
  if (whatToDo) {
    lines.push('## What to do');
    lines.push('');
    lines.push(whatToDo);
    lines.push('');
  }
  if (Array.isArray(relatedFiles) && relatedFiles.length > 0) {
    lines.push('## Related files');
    lines.push('');
    for (const f of relatedFiles) lines.push(`- \`${f}\``);
    lines.push('');
  }
  return lines.join('\n');
}

function writeReport({
  cwd,
  hookName,
  failureMode,
  taskId,
  agentName,
  whatBroke,
  whatToDo,
  relatedFiles,
}) {
  try {
    const dir = ensureDir(cwd);
    const filename = `${hookName}-${isoTimestamp()}.md`;
    const filePath = path.join(dir, filename);
    const body = renderReport({
      hookName,
      failureMode,
      taskId: taskId || process.env.OVERSTORY_TASK_ID,
      agentName: agentName || process.env.OVERSTORY_AGENT_NAME,
      whatBroke,
      whatToDo,
      relatedFiles,
    });
    fs.writeFileSync(filePath, body);
    prune(dir);
    return filePath;
  } catch {
    return null;
  }
}

/**
 * Prune reports per §5.3.
 */
function prune(dir, now = new Date()) {
  let entries;
  try {
    entries = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => ({ f, full: path.join(dir, f), stat: fs.statSync(path.join(dir, f)) }));
  } catch {
    return;
  }
  const todayUtc = now.toISOString().slice(0, 10);
  const keep = new Set();
  for (const e of entries) {
    const day = e.stat.mtime.toISOString().slice(0, 10);
    if (day === todayUtc) keep.add(e.full);
  }
  entries.sort((a, b) => b.stat.mtime - a.stat.mtime);
  entries.slice(0, 50).forEach((e) => keep.add(e.full));
  const latestPerHook = new Map();
  for (const e of entries) {
    const hookName = e.f.replace(/-\d{4}-\d{2}-\d{2}T.*\.md$/, '');
    if (!latestPerHook.has(hookName)) {
      latestPerHook.set(hookName, e.full);
      keep.add(e.full);
    }
  }
  for (const e of entries) {
    if (!keep.has(e.full)) {
      try {
        fs.unlinkSync(e.full);
      } catch {
        // ignore
      }
    }
  }
}

module.exports = { writeReport, renderReport, prune, isoTimestamp };
