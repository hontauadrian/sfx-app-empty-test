#!/usr/bin/env node
/**
 * Plan 06 Layer B' addendum — reject writes to node_modules/.
 *
 * Agents sometimes "fix" a bug by patching a library directly in
 * node_modules/ instead of updating the actual source or version-pinning a
 * dependency. Those patches are wiped on the next install and hide the real
 * root cause. Block them at write time.
 *
 * Contract:
 *   - PreToolUse, matcher "Edit|Write|NotebookEdit|MultiEdit"
 *   - Allow: exit 0, no stdout.
 *   - Block: exit 0, stdout = {"decision":"block","reason":"..."}
 *   - On internal error: fail-open (do not break unrelated writes).
 */

const fs = require('node:fs');
const path = require('node:path');

const NODE_MODULES_RE = /(^|\/)node_modules\//;

function checkWrite(toolInput) {
  const filePath = typeof toolInput?.file_path === 'string' ? toolInput.file_path : '';
  if (!filePath) return false;
  return NODE_MODULES_RE.test(filePath);
}

function writeReport(cwd, filePath) {
  try {
    const dir = path.join(cwd, '.claude', 'hook-reports');
    fs.mkdirSync(dir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-').replace(/-\d{3}Z$/, 'Z');
    const file = path.join(dir, `no-node-modules-write-${ts}.md`);
    const body =
      `# no-node-modules-write — BLOCK\n\n` +
      `**Time:** ${new Date().toISOString()}\n` +
      `**Failure mode:** NODE_MODULES_WRITE\n\n` +
      `## What broke\n\n` +
      `A write to a file under \`node_modules/\` was refused. Writes into installed ` +
      `dependencies are wiped on the next \`pnpm install\` and hide the real root cause ` +
      `of a bug.\n\n` +
      `## What to do\n\n` +
      `- If the bug is in your own code, find where that library's return value is used ` +
      `and adjust your code there.\n` +
      `- If the bug is genuinely in the library, pin a patched version via ` +
      `\`pnpm patch\` / \`pnpm patch-commit\`, or upgrade to a fixed release, or file an ` +
      `upstream issue.\n` +
      `- If you were looking at source for reference, use \`pnpm why\` / \`pnpm list\` and ` +
      `read the file through \`Read\` (allowed) instead of editing it.\n`;
    void filePath; // the file path is intentionally not echoed to stdout
    fs.writeFileSync(file, body);
  } catch {
    // report is advisory
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
    const tool = payload?.tool_name;
    if (tool !== 'Write' && tool !== 'Edit' && tool !== 'MultiEdit' && tool !== 'NotebookEdit') {
      return { allow: true };
    }
    const blocked = checkWrite(payload.tool_input || {});
    if (!blocked) return { allow: true };
    writeReport(cwd, payload?.tool_input?.file_path);
    return {
      allow: false,
      decision: 'block',
      reason:
        'Writing inside node_modules/ is not permitted — installed dependencies are not ' +
        'editable source. Patch via `pnpm patch`, pin a fixed version, or adjust your own ' +
        'code that consumes the library. See the most recent report under ' +
        '.claude/hook-reports/. Failure mode: NODE_MODULES_WRITE.',
    };
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

module.exports = { runGuard, checkWrite };
