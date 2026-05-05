#!/usr/bin/env node
/**
 * Plan 06 Layer B' — Write-side guard.
 *
 * An agent can evade Layer B's Bash introspection check by asking a
 * whitelisted runtime (node, vitest) to execute a script it wrote in a
 * previous turn. Layer B can't inspect the script body at Bash time;
 * Layer B' refuses to let the script be written in the first place.
 *
 * Contract:
 *   - PreToolUse, matcher "Edit|Write|NotebookEdit|MultiEdit"
 *   - Allow: exit 0, no stdout.
 *   - Block: exit 0, stdout = single-line JSON
 *     {"decision":"block","reason":"<generic>"}
 *   - On internal error: fall through to allow (don't break the agent's
 *     writes when the guard itself is broken).
 */

const fs = require('node:fs');
const path = require('node:path');

const {
  genericBlockMessage,
  FAILURE_HOOK_INTROSPECTION,
} = (() => {
  try {
    return require('./no-hook-introspection.js');
  } catch {
    return {
      genericBlockMessage: () =>
        'Introspecting hook, profile, or settings source is not permitted. ' +
        'Failure mode: HOOK_INTROSPECTION.',
      FAILURE_HOOK_INTROSPECTION: 'HOOK_INTROSPECTION',
    };
  }
})();

const RESTRICTED_PATH_RE = /(\.claude\/hooks|\.claude\/settings\.local|\.overstory\/claude-profiles|\.overstory\/mail|\.overstory\/hooks|\.overstory\/agent-defs|scripts\/git-hooks)/;

const FILE_READ_API_RE = /(readFileSync|readFile\s*\(|fs\.promises|createReadStream|open\s*\(|File\.read|Pathlib\.Path|\.read_text\s*\(|\.open\s*\(|fetch\s*\(|import\s*\([^)]*\.json\)|require\s*\([^)]*\.json\))/;

const SCRIPT_EXT_RE = /\.(js|ts|mjs|cjs|py|rb|sh|bash|zsh|pl|lua|php)$/i;

const CONFIG_FILE_RE = /(turbo|vite|vitest|jest|playwright|rollup|webpack|esbuild|tsup|swcrc|babel|next|nuxt|astro|sveltekit|remix)\.config\.(m?[jt]s|cjs|json)$/;

const GIT_HOOK_PATHS = [/\.husky\//, /\.git\/hooks\//, /scripts\/git-hooks\//, /lefthook\.ya?ml$/, /pre-commit\./];

const ENV_KEY_RE = /^(OVERSTORY_|HOOK_|PROBE_)[A-Z0-9_]+\s*=/m;

function collectCheckBuffer(toolName, toolInput) {
  const parts = [];
  if (typeof toolInput?.content === 'string') parts.push(toolInput.content);
  if (typeof toolInput?.new_string === 'string') parts.push(toolInput.new_string);
  if (Array.isArray(toolInput?.edits)) {
    for (const edit of toolInput.edits) {
      if (typeof edit?.new_string === 'string') parts.push(edit.new_string);
    }
  }
  if (Array.isArray(toolInput?.new_source)) parts.push(toolInput.new_source.join('\n'));
  if (typeof toolInput?.new_source === 'string') parts.push(toolInput.new_source);
  return parts.join('\n');
}

function basename(filePath) {
  return path.basename(filePath || '');
}

function checkWrite(toolInput) {
  const filePath = typeof toolInput?.file_path === 'string' ? toolInput.file_path : '';
  const buffer = collectCheckBuffer(null, toolInput);
  const base = basename(filePath);

  // Rule 0 (strict): any content referencing a restricted path is blocked.
  // Closes the tsx/node-exec exfil path: an agent cannot create a plain .md,
  // CI config, or any file that even names the restricted paths.
  if (RESTRICTED_PATH_RE.test(buffer)) return true;

  // Rule 1: script extension writing a reader for restricted paths.
  if (SCRIPT_EXT_RE.test(filePath)) {
    if (RESTRICTED_PATH_RE.test(buffer) && FILE_READ_API_RE.test(buffer)) return true;
  }

  // Rule 2: package.json with scripts pointing at restricted paths.
  if (base === 'package.json') {
    try {
      const parsed = JSON.parse(buffer);
      const scripts = parsed?.scripts || {};
      for (const value of Object.values(scripts)) {
        if (typeof value === 'string' && RESTRICTED_PATH_RE.test(value)) return true;
      }
    } catch {
      // If it's not valid JSON, fall back to string scan.
      if (/"scripts"\s*:/.test(buffer) && RESTRICTED_PATH_RE.test(buffer)) return true;
    }
  }

  // Rule 3: build-tool config referencing restricted paths.
  if (CONFIG_FILE_RE.test(base)) {
    if (RESTRICTED_PATH_RE.test(buffer)) return true;
  }

  // Rule 4: .gitignore / .gitattributes adding an entry for restricted paths.
  if (base === '.gitignore' || base === '.gitattributes') {
    if (RESTRICTED_PATH_RE.test(buffer)) return true;
  }

  // Rule 5: git-hook-ish files that mention restricted paths.
  for (const rx of GIT_HOOK_PATHS) {
    if (rx.test(filePath) && RESTRICTED_PATH_RE.test(buffer)) return true;
  }

  // Rule 6: .env* seeding OVERSTORY_/HOOK_/PROBE_ keys.
  if (/(^|\/)\.env(\.|$|\.local$|\..+$)/.test(filePath)) {
    if (ENV_KEY_RE.test(buffer)) return true;
  }

  return false;
}

function writeReport(cwd) {
  try {
    const dir = path.join(cwd, '.claude', 'hook-reports');
    fs.mkdirSync(dir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-').replace(/-\d{3}Z$/, 'Z');
    const file = path.join(dir, `no-hook-author-${ts}.md`);
    const body =
      `# no-hook-author — BLOCK\n\n` +
      `**Time:** ${new Date().toISOString()}\n` +
      `**Failure mode:** ${FAILURE_HOOK_INTROSPECTION}\n\n` +
      `## What broke\n\n` +
      `A write was refused because the file content would read, relay, or re-run ` +
      `hook/profile/mail/settings source. The check fires on script files whose body ` +
      `both references restricted paths and calls a file-read API.\n\n` +
      `## What to do\n\n` +
      `Implement the feature against the contract described in the most recent ` +
      `\`.claude/hook-reports/\` entry. The hook source is intentionally out of scope.\n`;
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
    writeReport(cwd);
    return {
      allow: false,
      decision: 'block',
      reason: genericBlockMessage(FAILURE_HOOK_INTROSPECTION),
    };
  } catch {
    // Fail-open on internal error.
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
