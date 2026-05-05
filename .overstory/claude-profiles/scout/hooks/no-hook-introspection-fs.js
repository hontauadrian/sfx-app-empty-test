#!/usr/bin/env node
/**
 * Layer B' — PreToolUse filesystem guard.
 *
 * Sibling to no-hook-introspection.js. Where the existing hook blocks
 * Bash / MCP calls that touch hook/profile/mail/settings/git-hooks source,
 * this hook blocks the equivalent Read / Edit / Write / Glob / Grep /
 * MultiEdit / NotebookEdit / NotebookRead calls.
 *
 * The settings.json permissions.deny globs are cwd-relative and DO NOT
 * match absolute paths or `..`-traversed paths. A spawned agent cwd'd
 * inside a worktree can still Read the canonical profile source via an
 * absolute or parent-relative path. This hook closes that gap by running
 * the same substring-regex set (PATH_REGEXES, imported) against the
 * tool_input path/pattern — substring regex matches absolute, relative,
 * and `..`-traversed spellings identically.
 *
 * Contract (same shape as no-hook-introspection.js):
 *   - stdin: { tool_name, tool_input }
 *   - Allow: exit 0, no stdout.
 *   - Block: exit 0, stdout = single-line JSON
 *     {"decision":"block","reason":"<generic, identical per failure-mode>"}
 *   - Never log the matched path. Debug report goes to .claude/hook-reports/.
 *   - On internal error: fall through to block path. Never throw.
 */

const fs = require('node:fs');
const path = require('node:path');
const {
  PATH_REGEXES,
  genericBlockMessage,
  FAILURE_HOOK_INTROSPECTION,
  FAILURE_HOOK_OUTPUT_SMUGGLING,
} = require('./no-hook-introspection');

// Per-tool list of string fields in tool_input that can carry a path or
// glob pattern. Each value is coerced to string and checked against
// PATH_REGEXES.
const FS_TOOL_FIELDS = {
  Read: ['file_path', 'notebook_path'],
  Edit: ['file_path', 'notebook_path'],
  Write: ['file_path', 'notebook_path'],
  MultiEdit: ['file_path', 'notebook_path'],
  NotebookEdit: ['file_path', 'notebook_path'],
  NotebookRead: ['file_path', 'notebook_path'],
  Glob: ['pattern', 'path'],
  Grep: ['pattern', 'path', 'glob'],
};

function matchAny(regexes, text) {
  for (const rx of regexes) {
    if (rx.test(text)) return true;
  }
  return false;
}

function writeReport(cwd, failureMode) {
  try {
    const dir = path.join(cwd, '.claude', 'hook-reports');
    fs.mkdirSync(dir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-').replace(/-\d{3}Z$/, 'Z');
    const file = path.join(dir, `no-hook-introspection-fs-${ts}.md`);
    const body =
      `# no-hook-introspection-fs — BLOCK\n\n` +
      `**Time:** ${new Date().toISOString()}\n` +
      `**Failure mode:** ${failureMode}\n\n` +
      `## What to do\n\n` +
      `A filesystem tool (Read / Glob / Grep / Edit / Write) was blocked because ` +
      `its path resolved to hook, profile, or settings source. **This is not ` +
      `where your fix lives.**\n\n` +
      `**Instead:**\n` +
      `1. Read the most recent gate report under \`.claude/hook-reports/\` — it tells ` +
      `you exactly what failed and what to fix.\n` +
      `2. Fix the code issue described in that report (missing tests, type errors, ` +
      `lint errors, runtime failures).\n` +
      `3. Re-run the quality gate (\`pnpm test\`, \`pnpm typecheck\`, \`pnpm lint\`, ` +
      `\`pnpm probe:smoke\`).\n\n` +
      `Do not try to read hook files. The gates verify your implementation ` +
      `quality — improve your code to pass them.\n`;
    fs.writeFileSync(file, body);
  } catch {
    // report is advisory
  }
}

function decideBlock(failureMode) {
  return { decision: 'block', reason: genericBlockMessage(failureMode) };
}

function runGuard({ stdinRaw, cwd } = {}) {
  try {
    if (!stdinRaw) return { allow: true };
    let payload;
    try {
      payload = JSON.parse(stdinRaw);
    } catch {
      // Match existing hook: fail open when input is unparseable.
      return { allow: true };
    }
    const toolName = payload?.tool_name;
    if (typeof toolName !== 'string' || toolName.length === 0) return { allow: true };
    const fields = FS_TOOL_FIELDS[toolName];
    if (!fields) return { allow: true };

    const toolInput = payload?.tool_input || {};
    for (const field of fields) {
      const rawValue = toolInput[field];
      if (rawValue === undefined || rawValue === null) continue;
      const value = String(rawValue);
      if (value.length === 0) continue;
      if (matchAny(PATH_REGEXES, value)) {
        writeReport(cwd, FAILURE_HOOK_INTROSPECTION);
        return { allow: false, ...decideBlock(FAILURE_HOOK_INTROSPECTION) };
      }
    }
    return { allow: true };
  } catch {
    // Internal error — fail closed.
    try {
      writeReport(cwd, FAILURE_HOOK_OUTPUT_SMUGGLING);
    } catch {
      // ignore
    }
    return { allow: false, ...decideBlock(FAILURE_HOOK_OUTPUT_SMUGGLING) };
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

module.exports = {
  runGuard,
  FS_TOOL_FIELDS,
};
