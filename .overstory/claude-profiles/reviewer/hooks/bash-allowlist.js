#!/usr/bin/env node
/**
 * Plan 06 Layer F — Bash command allow-list enforcer.
 *
 * Runs BEFORE no-hook-introspection.js so the cheap allow-list check
 * short-circuits the common case. Claude Code `permissions.allow` is at tool
 * granularity (Bash/Read/Write/...); this hook enforces at command
 * granularity.
 *
 * Contract:
 *   - PreToolUse, matcher "Bash"
 *   - stdin: { tool_name: "Bash", tool_input: { command: "<agent-supplied>" } }
 *   - Allow: exit 0, no stdout.
 *   - Block: exit 0, stdout = generic UNAPPROVED_COMMAND envelope that
 *     echoes the blocked command and names the blocked token so the agent
 *     can self-diagnose without reading hook source.
 *   - On internal error: fail-open.
 *
 * Allow-list file lookup order (first hit wins):
 *   1. <cwd>/.claude/hooks/.bash-allowlist.json           (deployed)
 *   2. <cwd>/.overstory/claude-profiles/<role>/hooks/.bash-allowlist.json
 *   3. <this-dir>/.bash-allowlist.json                    (colocated)
 */

const fs = require('node:fs');
const path = require('node:path');

const EVAL_FLAGS = ['-e', '--eval', '-p', '--print', '--eval-script', '--input-type', '-r', '--require'];
const INLINE_SCRIPT_FLAGS = ['-c', '-s', '-i', '--command', '--stdin', '--interactive'];
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

// pnpm/npm/yarn/bun built-in verbs that are NOT scripts. Anything NOT in
// this set that appears as the first arg may be a project script we should
// recurse into via package.json.
const PACKAGE_MANAGER_BUILTINS = new Set([
  'install', 'i', 'add', 'remove', 'rm', 'update', 'up', 'upgrade',
  'exec', 'dlx', 'x', 'create', 'init', 'link', 'unlink', 'prune',
  'list', 'ls', 'why', 'audit', 'outdated', 'pack', 'publish',
  'run', 'run-script', 'test', 't', 'start', 'restart', 'stop',
  'config', 'get', 'set', 'env', 'rebuild', 'cache', 'store',
  'dedupe', 'doctor', 'import', 'licenses', 'workspace', 'recursive', 'r',
  '-v', '--version', '--help', '-h',
]);

function loadAllowlist(cwd) {
  const candidates = [
    path.join(cwd, '.claude', 'hooks', '.bash-allowlist.json'),
    path.join(__dirname, '.bash-allowlist.json'),
  ];
  const role = process.env.OVERSTORY_AGENT_CAPABILITY || process.env.OVERSTORY_ROLE;
  if (role) {
    candidates.splice(1, 0, path.join(cwd, '.overstory', 'claude-profiles', role, 'hooks', '.bash-allowlist.json'));
  }
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        return JSON.parse(fs.readFileSync(p, 'utf8'));
      } catch {
        // fall through
      }
    }
  }
  return null;
}

function stripShellComments(input) {
  let out = '';
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    const prev = input[i - 1];
    if (c === "'" && prev !== '\\' && !inDouble) inSingle = !inSingle;
    else if (c === '"' && prev !== '\\' && !inSingle) inDouble = !inDouble;
    if (c === '#' && !inSingle && !inDouble && prev !== '\\' && (i === 0 || /\s/.test(prev))) {
      while (i < input.length && input[i] !== '\n') i++;
      continue;
    }
    out += c;
  }
  return out;
}

function decompose(input) {
  const out = [];
  let buf = '';
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    const prev = input[i - 1];
    if (c === "'" && prev !== '\\' && !inDouble) inSingle = !inSingle;
    else if (c === '"' && prev !== '\\' && !inSingle) inDouble = !inDouble;
    if (!inSingle && !inDouble) {
      const two = input.slice(i, i + 2);
      if (two === '&&' || two === '||') {
        if (buf.trim()) out.push(buf.trim());
        buf = '';
        i++;
        continue;
      }
      if (c === ';' || c === '|') {
        if (buf.trim()) out.push(buf.trim());
        buf = '';
        continue;
      }
    }
    buf += c;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

function firstTokenAfterRedirectsAndAssignments(component) {
  let rest = component;
  while (true) {
    const assign = rest.match(/^\s*\w+=[^\s]*\s+/);
    if (assign) {
      rest = rest.slice(assign[0].length);
      continue;
    }
    const redir = rest.match(/^\s*\d?>&?\d?\s*\S+\s+/);
    if (redir) {
      rest = rest.slice(redir[0].length);
      continue;
    }
    break;
  }
  const tok = rest.trim().split(/\s+/)[0];
  if (!tok) return null;
  return path.basename(tok).toLowerCase();
}

function extractArgs(component) {
  return component.trim().split(/\s+/).slice(1);
}

function resolvePackageScript(firstArg, cwd) {
  // Returns the script body string if `firstArg` is a script in package.json,
  // null otherwise. Works for both `pnpm run <name>` and bare `pnpm <name>`.
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
    const body = pkg?.scripts?.[firstArg];
    return typeof body === 'string' ? body : null;
  } catch {
    return null;
  }
}

function componentHasEvalFlag(args) {
  return args.some((a) => EVAL_FLAGS.includes(a));
}

function componentHasInlineScriptFlag(args) {
  return args.some((a) => INLINE_SCRIPT_FLAGS.includes(a));
}

function hostFromCurlArgs(args) {
  for (const a of args) {
    if (!a || a.startsWith('-')) continue;
    try {
      const url = new URL(a);
      return url.hostname.toLowerCase();
    } catch {
      if (/^[\w.-]+$/.test(a)) return a.toLowerCase();
    }
  }
  return null;
}

function checkComponent(component, allowlist, cwd) {
  const first = firstTokenAfterRedirectsAndAssignments(component);
  if (!first) return { allow: true };
  const commands = allowlist?.commands || [];
  if (!commands.includes(first)) return { allow: false, token: first };
  const restrictions = allowlist?.subcommand_restrictions?.[first] || [];
  const args = extractArgs(component);

  if (restrictions.some((r) => r && typeof r === 'object' && r._no_eval_flags)) {
    if (componentHasEvalFlag(args)) return { allow: false, token: first };
  }

  if (restrictions.some((r) => r && typeof r === 'object' && r._no_inline_scripts)) {
    if (componentHasInlineScriptFlag(args)) return { allow: false, token: first };
  }

  const hostList = restrictions.find((r) => r && typeof r === 'object' && Array.isArray(r._host_allowlist));
  if (hostList) {
    const host = hostFromCurlArgs(args);
    if (host && !hostList._host_allowlist.includes(host) && !LOCAL_HOSTS.has(host)) {
      return { allow: false, token: first };
    }
  }

  // Recurse into package-manager script bodies.
  //   • explicit: `pnpm run <name>` / `npm run <name>` / `yarn run <name>` / `bun run <name>`
  //   • bare shortcut: `pnpm <name>` when <name> is not a package-manager builtin
  // If <name> resolves to a scripts[<name>] body in package.json, each
  // pipeline component of the body must itself pass the allow-list. When a
  // script resolves, the body recursion IS the gate — the plain string
  // subcommand list below is skipped so roles don't have to hand-maintain
  // per-script allow-lists.
  let scriptResolved = false;
  if (['pnpm', 'npm', 'yarn', 'bun'].includes(first) && args.length > 0) {
    let scriptName = null;
    if (args[0] === 'run' && args[1]) {
      scriptName = args[1];
    } else if (!PACKAGE_MANAGER_BUILTINS.has(args[0]) && !args[0].startsWith('-')) {
      scriptName = args[0];
    }
    if (scriptName) {
      const body = resolvePackageScript(scriptName, cwd);
      if (body) {
        scriptResolved = true;
        for (const sub of decompose(stripShellComments(body))) {
          const subFirst = firstTokenAfterRedirectsAndAssignments(sub);
          if (!subFirst) continue;
          if (!commands.includes(subFirst)) return { allow: false, token: subFirst };
        }
      }
      // If body is null, the script doesn't exist — pnpm will fail naturally.
    }
  }

  // Plain string subcommand allow-list (e.g. git: ["status","log",...]).
  // Skipped when a package-manager script was resolved — body recursion is
  // the real gate in that case. Still applied for builtin verbs like
  // `pnpm install` / `pnpm exec` so roles can restrict them.
  if (!scriptResolved) {
    const stringRestrictions = restrictions.filter((r) => typeof r === 'string');
    if (stringRestrictions.length > 0) {
      const sub = args.find((a) => !a.startsWith('-'));
      if (sub && !stringRestrictions.includes(sub)) return { allow: false, token: first };
    }
  }

  return { allow: true };
}

function truncateCommand(command) {
  if (typeof command !== 'string') return '';
  const oneLine = command.replace(/\s+/g, ' ').trim();
  if (oneLine.length <= 200) return oneLine;
  return oneLine.slice(0, 200) + '…';
}

function writeReport(cwd, command, token) {
  try {
    const dir = path.join(cwd, '.claude', 'hook-reports');
    fs.mkdirSync(dir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-').replace(/-\d{3}Z$/, 'Z');
    const file = path.join(dir, `bash-allowlist-${ts}.md`);
    const body =
      `# bash-allowlist — BLOCK\n\n` +
      `**Time:** ${new Date().toISOString()}\n` +
      `**Failure mode:** UNAPPROVED_COMMAND\n` +
      `**Blocked token:** \`${token}\`\n\n` +
      `## Command that was blocked\n\n\`\`\`\n${truncateCommand(command)}\n\`\`\`\n\n` +
      `## What to do\n\n` +
      `The token \`${token}\` is not on the allow-list for your role.\n\n` +
      `**Options:**\n` +
      `1. If it's a **diagnostic** (tail/head/grep/wc/sort/uniq/sed/awk/jq/cut) it should already be allowed — check spelling.\n` +
      `2. If it's a **project script**, it must exist in package.json scripts; the hook recurses into the body whether you invoke it as \`pnpm <name>\` or \`pnpm run <name>\`.\n` +
      `3. If you genuinely need a new tool, escalate via \`ov mail --type question --to <parent>\` — do NOT try to work around this guard.\n`;
    fs.writeFileSync(file, body);
  } catch {
    // advisory only
  }
}

// Agent-only redirect: `pnpm stack:start` (and the underlying script) is
// replaced for agents by `pnpm stack:up`, which streams the boot log live
// and exits cleanly on ready/error. Humans (no OVERSTORY_AGENT_NAME) keep
// direct access for wrapper debugging.
function checkStackStartRedirect(command) {
  if (!process.env.OVERSTORY_AGENT_NAME) return { allow: true };
  const cleaned = stripShellComments(command);
  if (/\bstack:start\b/.test(cleaned) || /\bworktree-stack\.sh\s+start\b/.test(cleaned)) {
    return {
      allow: false,
      decision: 'block',
      reason:
        'Use `pnpm stack:up` instead of `pnpm stack:start`. The stack:up wrapper ' +
        'streams the boot log live and exits cleanly on ready/error — no timeout, ' +
        'no `tail -40` truncation, no keyword guessing against output. Direct ' +
        'stack:start is reserved for humans debugging the wrapper itself.',
    };
  }
  return { allow: true };
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
    if (typeof command !== 'string' || command.length === 0) return { allow: true };

    const redirect = checkStackStartRedirect(command);
    if (!redirect.allow) return redirect;

    const allowlist = loadAllowlist(cwd);
    if (!allowlist) return { allow: true };

    const cleaned = stripShellComments(command);
    const components = decompose(cleaned);
    for (const component of components) {
      const r = checkComponent(component, allowlist, cwd);
      if (!r.allow) {
        const token = r.token || '?';
        writeReport(cwd, command, token);
        return {
          allow: false,
          decision: 'block',
          reason:
            `BLOCKED by bash-allowlist. Command token "${token}" is not on ` +
            `the allow-list for your role.\n\n` +
            `Your command (truncated): ${truncateCommand(command)}\n\n` +
            `What to do: if this is a diagnostic (tail/head/grep/wc/sort/uniq/sed/awk/jq/cut) ` +
            `it should already be allowed — check spelling. If it's a project script, it must ` +
            `exist in package.json scripts (hook accepts both \`pnpm <name>\` and \`pnpm run <name>\`). ` +
            `If you genuinely need a new tool, escalate via \`ov mail --type question --to <parent>\`. ` +
            `Failure mode: UNAPPROVED_COMMAND.`,
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
  if (result.allow) process.exit(0);
  process.stdout.write(JSON.stringify({ decision: result.decision, reason: result.reason }));
  process.exit(0);
}

if (require.main === module) {
  mainCli();
}

module.exports = { runGuard, checkComponent, loadAllowlist, checkStackStartRedirect };
