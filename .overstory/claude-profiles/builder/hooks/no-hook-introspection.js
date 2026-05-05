#!/usr/bin/env node
/**
 * Plan 06 Layer B — PreToolUse Bash guard.
 *
 * Blocks commands that read, copy, list, or relay hook/profile/mail/settings
 * source so that an agent can't inspect the gates constraining it and then
 * train a prompt template against them.
 *
 * Contract:
 *   - matcher: "Bash" (registered in settings.json PreToolUse)
 *   - stdin: { tool_name: "Bash", tool_input: { command: "<agent-supplied>" } }
 *   - Allow: exit 0, no stdout.
 *   - Block: exit 0, stdout = single-line JSON
 *     {"decision":"block","reason":"<generic, identical per failure-mode>"}
 *   - Never log the matched pattern, never emit anything on stderr the agent
 *     could parse. Debug detail goes to .claude/hook-reports/ only.
 *   - On internal error: fall through to block path with HOOK_OUTPUT_SMUGGLING.
 *     Never throw an unhandled exception (that would surface to the agent).
 */

const fs = require('node:fs');
const path = require('node:path');

const FAILURE_HOOK_INTROSPECTION = 'HOOK_INTROSPECTION';
const FAILURE_HOOK_OUTPUT_SMUGGLING = 'HOOK_OUTPUT_SMUGGLING';

function truncateCommand(command) {
  if (typeof command !== 'string') return '';
  const oneLine = command.replace(/\s+/g, ' ').trim();
  if (oneLine.length <= 200) return oneLine;
  return oneLine.slice(0, 200) + '…';
}

function genericBlockMessage(failureMode, command) {
  const cmdEcho = command ? `\n\nYour command (truncated): ${truncateCommand(command)}` : '';
  const reasonHint =
    failureMode === FAILURE_HOOK_INTROSPECTION
      ? 'It tried to read, list, copy, or grep files under .claude/hooks, .claude/settings.*, .overstory/claude-profiles, .overstory/mail, .overstory/hooks, .overstory/agent-defs, or scripts/git-hooks — or used an introspection tool (ps/env/printenv/lsof/git show/git blame) against those paths.'
      : 'It matched an output-smuggling pattern: eval flags (node -e, python -c, ruby -e, awk system(), osascript -e, etc.), write-then-exec, network exfiltration of hook paths, package-exec (pnpm exec / npx / bun x / deno run https://), or a copy/archive/base64 of restricted paths.';
  return (
    `BLOCKED by no-hook-introspection guard. Failure mode: ${failureMode}.${cmdEcho}\n\n` +
    `Why: ${reasonHint}\n\n` +
    `What to do: do NOT try to read hook source — you cannot, and you don't need to. ` +
    `If a quality gate blocked you, read the most recent .claude/hook-reports/<name>-<timestamp>.md — ` +
    `it names the exact code issue (missing test, type error, lint, runtime). ` +
    `Fix your implementation, not the check. If you need to inspect YOUR OWN code, ` +
    `use paths under apps/, packages/, src/, or tests — those are never blocked.`
  );
}

// --- §2.4.1 safe-CLI fast-path ---
// `ov spec write` and `ov mail send` are project-authored CLIs whose --body
// argument is OPAQUE TEXT DATA, not shell code. Spec/mail bodies routinely
// reference file paths under `.overstory/...` or `.claude/hooks` (agents cite
// paths in prose) and contain markdown with quote characters. Left to the
// generic path / obfuscation checks, those bodies trip PATH_REGEXES or
// `obfuscated: true` on unbalanced dquotes — both of which are false positives
// because the text never reaches a shell interpreter; it's written verbatim
// to `.overstory/specs/<id>.md` or the mail store by the ov CLI.
//
// The fast-path allows these invocations PROVIDED the raw command has no
// command substitution (`$(...)`) and no backticks — those WOULD run in the
// shell before ov receives args, and must be rejected.
//
// Supported shapes (optional `cd <path> && ` prefix or `cat <file> |` pipe):
//   ov spec write <task-id> [--agent X] [--body "..."|< file]
//   ov mail send --to X --subject Y --body "..." [--type Z]
const SAFE_OV_CLI_RE =
  /^(?:\s*cd\s+[^\s&|;<>'"`$]+\s*&&\s*)?(?:cat\s+[^\s&|;<>'"`$]+\s*\|\s*)?ov\s+(?:spec\s+write|mail\s+send)\b/;

function isSafeOvCli(command) {
  if (typeof command !== 'string') return false;
  // Reject command substitution — these would execute before ov receives
  // args. Covers both POSIX `$(...)` and legacy backticks.
  if (/\$\(/.test(command)) return false;
  if (/`/.test(command)) return false;
  const m = SAFE_OV_CLI_RE.exec(command);
  if (!m) return false;
  // After the matched `...ov spec write` / `...ov mail send` prefix, ensure
  // no unquoted shell operator (`&&`, `||`, `;`, `|`) appears that would
  // chain another command. Unbalanced quotes inside the body are ALLOWED
  // and safe: bash refuses to execute a command with an unclosed quote, so
  // any operator that falls inside an unclosed quoted region never runs.
  const rest = command.slice(m[0].length);
  let inS = false;
  let inD = false;
  for (let i = 0; i < rest.length; i++) {
    const c = rest[i];
    const prev = i > 0 ? rest[i - 1] : '';
    if (c === "'" && prev !== '\\' && !inD) { inS = !inS; continue; }
    if (c === '"' && prev !== '\\' && !inS) { inD = !inD; continue; }
    if (inS || inD) continue;
    const two = rest.slice(i, i + 2);
    if (two === '&&' || two === '||') return false;
    if (c === ';' || c === '|') return false;
  }
  return true;
}

// --- §2.4 target-path signals ---
const PATH_REGEXES = [
  /\.claude\/hooks(\/|$|\b)/,
  /\.claude\/settings\.local(\.json)?/,
  /\.claude\/settings\.json/,
  /\.claude\/hook-reports\/.*\.(js|ts|mjs|cjs|py|rb|sh|pl|lua|php)$/,
  /\.overstory\/claude-profiles(\/|$|\b)/,
  /\.overstory\/mail(\/|$|\b)/,
  /\.overstory\/hooks(\/|$|\b)/,
  /\.overstory\/agent-defs(\/|$|\b)/,
  /scripts\/git-hooks(\/|$|\b)/,
];

// --- §2.5 command-shape signals ---
const EVAL_FLAG_REGEXES = [
  /\b(node|nodejs|deno|bun|ts-node|tsx)\s+(-e|--eval|-p|--print|--eval-script|--input-type|-r|--require)\b/,
  /\b(python|python2|python3)\s+(-c|-m\s+base64|-m\s+http\.server|-m\s+smtpd|-m\s+SimpleHTTPServer|-X\s+faulthandler)\b/,
  /\bruby\s+(-e|-rfile|-ropen-uri|-rkernel)\b/,
  /\bperl\s+(-e|-E|-Mopen|-MFile::Slurp)\b/,
  /\bphp\s+-r\b/,
  /\blua\s+-e\b/,
  /\btclsh\s+.*<<\s*['"]?EOF/,
  /\bawk\s+'[^']*(getline|system|printf\s+.*>).*'\s/,
  /\bgawk\s+'[^']*(getline|system).*'/,
  /\bosascript\s+-e\b/,
];

const READ_WITH_RESTRICTED_PATH = [
  /\b(cat|bat|less|more|head|tail|nl|pr|fold|expand|unexpand|col|colrm|cut|paste|join|comm|diff|sdiff|cmp|vimdiff|rev|uniq|sort)\b[^|;&]*(\.claude\/hooks|\.claude\/settings\.local|\.overstory\/claude-profiles|\.overstory\/mail|scripts\/git-hooks)/,
  /\b(sed|awk|gawk|grep|egrep|fgrep|rg|ack|ag)\b[^|;&]*(\.claude\/hooks|\.claude\/settings\.local|\.overstory\/claude-profiles|\.overstory\/mail)/,
  /\b(vim|nvim|vi|emacs|nano|micro|ed|ex)\b[^|;&]*(\.claude\/hooks|\.overstory\/claude-profiles)/,
  /\b(xxd|od|hexdump|strings|file|stat|readlink|realpath|tree|find|fd|locate|mdfind)\b[^|;&]*(\.claude\/hooks|\.overstory\/claude-profiles|\.overstory\/mail)/,
  /\b(ls|ll|dir|exa|eza|lsd)\b\s[^|;&]*(\.claude\/hooks|\.overstory\/claude-profiles|\.overstory\/mail)/,
];

const COPY_WITH_RESTRICTED_PATH = [
  /\b(cp|mv|ln|rsync|scp|sftp|install|pax|cpio)\b[^|;&]*(\.claude\/hooks|\.overstory\/claude-profiles|\.overstory\/mail)/,
  /\b(tar|zip|7z|gzip|bzip2|xz|zstd|unzip|gunzip|bunzip2|unxz)\b[^|;&]*(\.claude\/hooks|\.overstory\/claude-profiles)/,
  /\b(base64|uuencode|uudecode|basenc|openssl\s+enc|openssl\s+base64)\b[^|;&]*(\.claude\/hooks|\.overstory\/claude-profiles)/,
];

const NETWORK_EXFIL = [
  /\b(curl|wget|http|httpie|nc|ncat|socat|telnet|ftp|sftp)\b[^|;&]*file:\/\/[^ ]*(\.claude\/hooks|\.overstory)/,
  /\b(curl|wget)\b[^|;&]*(\.claude\/hooks|\.overstory\/claude-profiles)/,
  /\b(curl|wget|http)\b[^|;&]*(-T|--upload-file|--data-binary\s+@|--data\s+@|--form\s+[^=]+=@|-F\s+[^=]+=@)[^|;&]*@?(\.claude\/hooks|\.overstory)/,
  /\bssh\b[^|;&]*(\.claude\/hooks|\.overstory\/claude-profiles)/,
  /\b(dig|nslookup|host)\b[^|;&]*\sTXT\s/,
];

const GIT_INDIRECT = [
  /\bgit\s+(show|cat-file|archive|log\s+-p|diff\s+[^;|&]*--\s+\.claude\/hooks|stash\s+show\s+-p|grep)\b[^|;&]*(\.claude\/hooks|\.overstory\/claude-profiles|\.overstory\/mail)/,
  /\bgit\s+blame\b[^|;&]*(\.claude\/hooks|\.overstory\/claude-profiles)/,
];

const PROC_ENV_INTROSPECT = [
  /\b(ps)\b[^|;&]*\s(-e|-f|a|x|auxe|auxwwe|-o\s+(args|command|env)|--forest)\b/,
  /\benv\b\s*(\||>|;|$)/,
  /\bprintenv\b/,
  /\benv\s+-i\b/,
  /\/proc\/\d+\/(environ|cmdline|cwd|exe|fd|maps|mem)/,
  /\bcat\s+\/proc\/\S+\/(environ|cmdline)/,
  /\blsof\b[^|;&]*(\.claude|\.overstory)/,
];

const WRITE_THEN_EXEC = [
  />\s*\S+\.(js|mjs|cjs|ts|py|rb|pl|sh|bash|zsh|lua|php)\s*(&&|;|\|)\s*(node|python|ruby|perl|sh|bash|zsh|lua|php|tsx|deno|bun)/,
  /<<\s*['"]?EOF['"]?[\s\S]*?(require|readFileSync|import\s+fs|open\(|fs\.promises|createReadStream|fetch\()[\s\S]*?EOF/,
  /(tee|dd)\s+.*\.(js|mjs|cjs|ts|py|rb|pl|sh)\s*(&&|;)\s*(node|python|ruby|perl|sh|bash|tsx|deno|bun)/,
];

const PACKAGE_EXEC = [
  /\b(pnpm|npm|yarn|bun)\s+(exec|dlx|x)\s/,
  /\bnpx\s/,
  /\bdeno\s+run\s+https?:\/\//,
];

// --- §2.3 normalization ---
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

function resolveSubshells(input) {
  // $(...) and `...`  -> ⟪subshell⟫ placeholder, but keep the inner substring for path checks.
  let out = input;
  let iter = 0;
  while (iter < 16) {
    const before = out;
    out = out.replace(/\$\(([^()]*)\)/g, (_, inner) => `⟪subshell⟫${inner}⟪/subshell⟫`);
    out = out.replace(/`([^`]*)`/g, (_, inner) => `⟪subshell⟫${inner}⟪/subshell⟫`);
    if (out === before) break;
    iter++;
  }
  return out;
}

function dequote(input) {
  const quoteCount = (input.match(/(?<!\\)'/g) || []).length;
  const dquoteCount = (input.match(/(?<!\\)"/g) || []).length;
  if (quoteCount % 2 !== 0 || dquoteCount % 2 !== 0) {
    return { text: input, unbalanced: true };
  }
  const collapsed = input
    .replace(/\$''/g, '')
    .replace(/''/g, '')
    .replace(/""/g, '')
    .replace(/\\([a-zA-Z/._-])/g, '$1');
  return { text: collapsed, unbalanced: false };
}

function expandTrivialAliases(input) {
  const aliasRe = /(^|[;\s&|])(\w+)=([\w./-]+)(?=\s)/g;
  const aliases = {};
  let cleaned = input;
  let match;
  while ((match = aliasRe.exec(input)) !== null) {
    aliases[match[2]] = match[3];
  }
  for (const [k, v] of Object.entries(aliases)) {
    cleaned = cleaned.replace(new RegExp(`\\$${k}\\b|\\$\\{${k}\\}`, 'g'), v);
  }
  const unresolvedVar = /\$\{?[A-Z_][A-Z0-9_]*\}?/.test(cleaned);
  return { text: cleaned, unresolvedVar };
}

function decomposePipeline(input) {
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
      // 2-char operators first (&&, ||)
      const two = input.slice(i, i + 2);
      if (two === '&&' || two === '||') {
        if (buf.trim()) out.push(buf.trim());
        buf = '';
        i++; // consume second char
        continue;
      }
      // 1-char operators (;, |) — but NOT |&, NOT inside &&/||
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

function resolvePnpmRun(component, cwd) {
  // For `pnpm run <name>` / `npm run <name>`: read package.json, resolve scripts[<name>], re-check.
  const re = /^(?:p?npm|yarn|bun)\s+run\s+(\S+)/;
  const m = component.match(re);
  if (!m) return null;
  const scriptName = m[1];
  try {
    const pkgPath = path.join(cwd, 'package.json');
    if (!fs.existsSync(pkgPath)) return { unresolvable: true };
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const scriptBody = pkg?.scripts?.[scriptName];
    if (typeof scriptBody !== 'string') return { unresolvable: true };
    return { scriptBody };
  } catch {
    return { unresolvable: true };
  }
}

function normalize(raw) {
  const noComments = stripShellComments(raw);
  const subshells = resolveSubshells(noComments);
  const { text: dequoted, unbalanced } = dequote(subshells);
  if (unbalanced) return { components: [], obfuscated: true };
  const { text: aliased, unresolvedVar } = expandTrivialAliases(dequoted);
  if (unresolvedVar) return { components: [], obfuscated: true };
  const components = decomposePipeline(aliased);
  return { components, obfuscated: false };
}

function matchAny(regexes, text) {
  for (const rx of regexes) {
    if (rx.test(text)) return true;
  }
  return false;
}

function checkComponent(component, cwd) {
  if (matchAny(EVAL_FLAG_REGEXES, component)) return FAILURE_HOOK_OUTPUT_SMUGGLING;
  if (matchAny(WRITE_THEN_EXEC, component)) return FAILURE_HOOK_OUTPUT_SMUGGLING;
  if (matchAny(PACKAGE_EXEC, component)) return FAILURE_HOOK_OUTPUT_SMUGGLING;
  if (matchAny(NETWORK_EXFIL, component)) return FAILURE_HOOK_OUTPUT_SMUGGLING;
  if (matchAny(READ_WITH_RESTRICTED_PATH, component)) return FAILURE_HOOK_INTROSPECTION;
  if (matchAny(COPY_WITH_RESTRICTED_PATH, component)) return FAILURE_HOOK_OUTPUT_SMUGGLING;
  if (matchAny(GIT_INDIRECT, component)) return FAILURE_HOOK_INTROSPECTION;
  if (matchAny(PROC_ENV_INTROSPECT, component)) return FAILURE_HOOK_INTROSPECTION;
  if (matchAny(PATH_REGEXES, component)) return FAILURE_HOOK_INTROSPECTION;

  // Resolve pnpm/npm/yarn/bun run <name> to script body and recheck.
  const resolved = resolvePnpmRun(component, cwd);
  if (resolved) {
    if (resolved.unresolvable) return FAILURE_HOOK_OUTPUT_SMUGGLING;
    // The script body comes from package.json — project-sanctioned code the
    // agent did not author.  Only block if the body itself contains eval
    // flags or explicit read commands targeting restricted paths (would
    // indicate a compromised package.json, not an agent exploit).
    // PATH_REGEXES, PACKAGE_EXEC, and COPY_WITH_RESTRICTED_PATH are
    // intentionally skipped here because legitimate project scripts
    // (probe:smoke, matrix:regen) reference .claude/hooks/probes/ paths
    // and use `pnpm exec tsx` — both of which are safe to execute.
    const sub = resolved.scriptBody;
    if (matchAny(EVAL_FLAG_REGEXES, sub)) return FAILURE_HOOK_OUTPUT_SMUGGLING;
    if (matchAny(READ_WITH_RESTRICTED_PATH, sub)) return FAILURE_HOOK_INTROSPECTION;
  }
  return null;
}

function writeReport(cwd, failureMode, command) {
  try {
    const dir = path.join(cwd, '.claude', 'hook-reports');
    fs.mkdirSync(dir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-').replace(/-\d{3}Z$/, 'Z');
    const file = path.join(dir, `no-hook-introspection-${ts}.md`);
    const cmdBlock = command
      ? `\n## Command that was blocked\n\n\`\`\`\n${truncateCommand(command)}\n\`\`\`\n`
      : '';
    const isSmuggling = failureMode === FAILURE_HOOK_OUTPUT_SMUGGLING;
    const guidance = isSmuggling
      ? `Your command used an eval flag (\`python -c\`, \`node -e\`, \`ruby -e\`, \`bun -e\`, ` +
        `\`awk system()\`, \`osascript -e\`) or another output-smuggling pattern ` +
        `(write-then-exec, package-exec from URL, base64 of restricted paths). ` +
        `These are blocked unconditionally — even when the target file is legitimate.\n\n` +
        `**What you probably meant:**\n` +
        `- Parsing JSON: use \`jq '.field' file.json\` or read the file with the Read tool ` +
        `and parse in your reasoning.\n` +
        `- Inspecting text: use \`cat\`, \`head\`, \`tail\`, \`grep\`, \`rg\`, or the Read tool.\n` +
        `- Running TypeScript ad-hoc: write a script file and run \`pnpm tsx <file>.ts\`, ` +
        `or use a package.json script.\n` +
        `- Running tests: \`pnpm test\`, \`pnpm probe:smoke\`, \`pnpm typecheck\`, \`pnpm lint\`.\n\n` +
        `**If a quality gate blocked you,** read the most recent ` +
        `\`.claude/hook-reports/<name>-<timestamp>.md\` for the exact code issue and ` +
        `fix your implementation — never the gate.\n`
      : `Your command tried to read, list, copy, or grep files under ` +
        `\`.claude/hooks\`, \`.claude/settings.*\`, \`.overstory/claude-profiles\`, ` +
        `\`.overstory/mail\`, \`.overstory/hooks\`, \`.overstory/agent-defs\`, or ` +
        `\`scripts/git-hooks\`. **This is not where your fix lives.**\n\n` +
        `**Instead:**\n` +
        `1. Read the most recent gate report under \`.claude/hook-reports/\` — it tells ` +
        `you exactly what failed and what to fix.\n` +
        `2. Fix the code issue described in that report (missing tests, type errors, ` +
        `lint errors, runtime failures).\n` +
        `3. Re-run the quality gate (\`pnpm test\`, \`pnpm typecheck\`, \`pnpm lint\`, ` +
        `\`pnpm probe:smoke\`).\n\n` +
        `Do not try to read, copy, or reverse-engineer hook files. The gates verify ` +
        `your implementation quality — improve your code to pass them.\n`;
    const body =
      `# no-hook-introspection — BLOCK\n\n` +
      `**Time:** ${new Date().toISOString()}\n` +
      `**Failure mode:** ${failureMode}\n` +
      cmdBlock +
      `\n## What to do\n\n` +
      guidance;
    fs.writeFileSync(file, body);
  } catch {
    // report is advisory
  }
}

function decideBlock(failureMode, command) {
  return { decision: 'block', reason: genericBlockMessage(failureMode, command) };
}

function runGuard({ stdinRaw, cwd } = {}) {
  try {
    if (!stdinRaw) return { allow: true };
    let payload;
    try {
      payload = JSON.parse(stdinRaw);
    } catch {
      // If we can't parse input, fail open — Claude Code passes JSON reliably.
      return { allow: true };
    }
    const toolName = payload?.tool_name;
    if (typeof toolName !== 'string' || toolName.length === 0) return { allow: true };

    // MCP tools (mcp__*) bypass the Bash-focused command parser but still
    // take file paths / shell-like strings as arguments. Inspect the
    // serialised tool_input against the restricted-path signals. This is
    // defence-in-depth on top of permissions.deny for specific known-bad
    // tools (e.g. context-mode execute / execute_file).
    if (toolName.startsWith('mcp__')) {
      let serialised;
      try {
        serialised = JSON.stringify(payload?.tool_input ?? {});
      } catch {
        serialised = '';
      }
      if (serialised && matchAny(PATH_REGEXES, serialised)) {
        const mcpCmd = `${toolName} ${serialised}`;
        writeReport(cwd, FAILURE_HOOK_INTROSPECTION, mcpCmd);
        return { allow: false, ...decideBlock(FAILURE_HOOK_INTROSPECTION, mcpCmd) };
      }
      return { allow: true };
    }

    if (toolName !== 'Bash') return { allow: true };
    const command = payload?.tool_input?.command;
    if (typeof command !== 'string' || command.length === 0) return { allow: true };

    // Safe-CLI fast-path — `ov spec write` / `ov mail send` bodies are opaque
    // text data, not shell code. Markdown bodies with code fences and quoted
    // content would otherwise trip the obfuscation or path checks below.
    if (isSafeOvCli(command)) return { allow: true };

    const { components, obfuscated } = normalize(command);
    if (obfuscated) {
      writeReport(cwd, FAILURE_HOOK_OUTPUT_SMUGGLING, command);
      return { allow: false, ...decideBlock(FAILURE_HOOK_OUTPUT_SMUGGLING, command) };
    }
    for (const component of components) {
      const failureMode = checkComponent(component, cwd);
      if (failureMode) {
        writeReport(cwd, failureMode, command);
        return { allow: false, ...decideBlock(failureMode, command) };
      }
    }
    return { allow: true };
  } catch {
    // Internal error — fall through to block with generic failure mode.
    try {
      writeReport(cwd, FAILURE_HOOK_OUTPUT_SMUGGLING, '');
    } catch {
      // ignore
    }
    return { allow: false, ...decideBlock(FAILURE_HOOK_OUTPUT_SMUGGLING, '') };
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
  normalize,
  checkComponent,
  genericBlockMessage,
  isSafeOvCli,
  FAILURE_HOOK_INTROSPECTION,
  FAILURE_HOOK_OUTPUT_SMUGGLING,
  PATH_REGEXES,
};
