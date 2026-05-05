#!/usr/bin/env node
/**
 * PreToolUse hook — block ANY way of landing unverified builder code on the
 * canonical branch, and prevent forgery of the source builder's probe
 * artifact.
 *
 * Why this exists:
 *   `ov merge` reports `tier: clean-merge` (a git-conflict check) only and
 *   does not gate on probe state. A naive merge gate that only matches
 *   `ov merge` is trivially bypassed by `git merge`, `git pull`, `git push
 *   <X>:main`, `git cherry-pick`, `git rebase`, `git am`, or by an agent
 *   shell-redirecting a fake green artifact into the source worktree's
 *   `.http-smoke.json`.
 *
 *   This hook closes ALL of those paths.
 *
 * Gates (every entry below denies the Bash call unless source probes pass):
 *   1. `ov merge --branch X`        / `ov merge --branch=X` / `ov merge X`
 *   2. `git merge <flags...> X`     (X = builder branch)
 *   3. `git pull <remote> X`        (pull = fetch + merge)
 *   4. `git pull X`                 (resolved as remote tracking ref)
 *   5. `git push <remote> X:main`   (force-merge via push)
 *   6. `git cherry-pick ...`        (when HEAD is canonical)
 *   7. `git rebase X`               (when HEAD is canonical)
 *   8. `git am ...`                 (when HEAD is canonical)
 *   9. `git apply <patch>`          (when HEAD is canonical)
 *  10. ANY shell command that writes to `.http-smoke.json` via redirection
 *      (`>`, `>>`, `tee`, `cp`, `mv`, `dd`, `cat <<EOF >`) — independent of
 *      merge intent. This protects the artifact from forgery, complementing
 *      the path-deny rules on Write/Edit.
 *
 * Probe-validation rules (any source-branch gate, after extracting branch):
 *   - No live worktree for branch        → SOURCE_WORKTREE_NOT_FOUND
 *   - Missing `.http-smoke.json`         → PROBE_ARTIFACT_MISSING
 *   - Malformed JSON                     → PROBE_ARTIFACT_CORRUPT
 *   - exitCode !== 0                     → PROBE_EXITCODE_NONZERO
 *   - blockCodes non-empty               → PROBE_BLOCKED
 *   - summary.total === 0 / cases empty  → PROBE_NO_CASES
 *   - summary.failed > 0                 → PROBE_CASES_FAILED
 *   - summary.skipped > 0 && passed === 0 → PROBE_ALL_SKIPPED
 *   - Any commit on branch newer than artifact mtime → PROBE_STALE
 *
 * Pass-through (never gates):
 *   - `--dry-run` flag present
 *   - `git merge --abort`/`--continue`/`--quit` (no source branch involved)
 *   - Source branch resolves to main/master/origin/main/origin/master/HEAD/
 *     FETCH_HEAD/upstream/@{u}/@{upstream}
 *   - `git pull` with no positional args (pulls current upstream which for a
 *     lead is canonical)
 *
 * Contract:
 *   - PreToolUse, matcher "Bash"
 *   - stdin: { tool_name: "Bash", tool_input: { command: "<agent-supplied>" } }
 *   - Allow:  exit 0, no stdout.
 *   - Block:  exit 0, stdout = PreToolUse deny envelope with reason text.
 *   - Internal error: fail-open. Bugs in this hook MUST NOT prevent
 *     non-merge work. Same fail-open contract as bash-allowlist.js.
 *
 * Out of scope:
 *   This hook does NOT run lint/test/integration/e2e. Those belong to the
 *   existing close gates (pre-close-gate.js / verify-full-contract.js).
 *   It only enforces "the source branch is verified green and its artifact
 *   has not been forged."
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

// Branches that are NEVER source builders.
const CANONICAL_SOURCES = new Set([
  'main',
  'master',
  'origin/main',
  'origin/master',
  'upstream/main',
  'upstream/master',
  'HEAD',
  'FETCH_HEAD',
  '@{u}',
  '@{upstream}',
]);

const CANONICAL_DESTINATIONS = new Set([
  'main', 'master',
  'refs/heads/main', 'refs/heads/master',
  'origin/main', 'origin/master',
]);

const GIT_MERGE_NONMERGE_FLAGS = new Set([
  '--abort', '--continue', '--quit',
]);

const REMOTE_NAMES = new Set(['origin', 'upstream', 'fork', 'canonical']);

function stripShellComments(command) {
  return command.replace(/#.*$/gm, '');
}

/**
 * Flags that consume the next token as a value. The token immediately
 * following one of these is a flag-VALUE, not a flag itself, so a
 * `--dry-run` substring inside a `-m "msg with --dry-run"` payload must
 * NOT trigger the dry-run pass-through.
 */
const VALUE_CONSUMING_FLAGS = new Set([
  '-m',
  '-F',
  '-c',
  '-S',
  '--message',
  '--file',
  '--gpg-sign',
]);

/**
 * Return true iff one of the TOKENS is a top-level `--dry-run` flag (or
 * `--dry-run=...`). Quoted message bodies (`-m "--dry-run notes"`) are
 * skipped via the value-consuming-flag tracker so they cannot bypass the
 * gate by smuggling `--dry-run` into a commit message.
 */
function isDryRun(tokens) {
  let consumeNext = false;
  for (const tok of tokens) {
    if (consumeNext) {
      consumeNext = false;
      continue;
    }
    if (VALUE_CONSUMING_FLAGS.has(tok)) {
      consumeNext = true;
      continue;
    }
    if (tok === '--dry-run' || tok.startsWith('--dry-run=')) {
      return true;
    }
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────
// Tokenizer (quote-aware, splits on shell separators)
// ─────────────────────────────────────────────────────────────────────

/**
 * Split `command` into a list of *segments* on shell separators (`;`, `&&`,
 * `||`, `|`, `&`). Each segment is then tokenized respecting quotes.
 * Returns an array of segments, each itself an array of tokens.
 *
 * This lets us match `cd /tmp && git merge X` as two segments — the second
 * is a real merge command we must gate.
 */
function splitSegments(command) {
  const segments = [];
  let buf = '';
  let inSingle = false;
  let inDouble = false;
  let i = 0;
  function pushSegment() {
    if (buf.length > 0) segments.push(buf);
    buf = '';
  }
  while (i < command.length) {
    const ch = command[i];
    const next = command[i + 1];
    if (!inSingle && !inDouble) {
      if (ch === "'") { inSingle = true; buf += ch; i += 1; continue; }
      if (ch === '"') { inDouble = true; buf += ch; i += 1; continue; }
      if ((ch === '&' && next === '&') || (ch === '|' && next === '|')) {
        pushSegment(); i += 2; continue;
      }
      if (ch === ';' || ch === '|' || ch === '&') {
        pushSegment(); i += 1; continue;
      }
      buf += ch; i += 1; continue;
    }
    if (inSingle) {
      if (ch === "'") inSingle = false;
      buf += ch; i += 1; continue;
    }
    if (ch === '"') inDouble = false;
    buf += ch; i += 1;
  }
  pushSegment();
  return segments.map((s) => ({ raw: s, tokens: tokenize(s) }));
}

/**
 * Tokenize a single segment respecting single/double quotes. Strips outer
 * quotes from each token; collapses whitespace.
 */
function tokenize(segment) {
  const tokens = [];
  let buf = '';
  let inSingle = false;
  let inDouble = false;
  let i = 0;
  while (i < segment.length) {
    const ch = segment[i];
    if (!inSingle && !inDouble) {
      if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
        if (buf.length > 0) { tokens.push(buf); buf = ''; }
        i += 1; continue;
      }
      if (ch === "'") { inSingle = true; i += 1; continue; }
      if (ch === '"') { inDouble = true; i += 1; continue; }
      buf += ch; i += 1; continue;
    }
    if (inSingle) {
      if (ch === "'") { inSingle = false; i += 1; continue; }
      buf += ch; i += 1; continue;
    }
    if (ch === '"') { inDouble = false; i += 1; continue; }
    buf += ch; i += 1;
  }
  if (buf.length > 0) tokens.push(buf);
  return tokens;
}

function isCanonicalSource(branch) {
  if (!branch) return true; // unparseable → don't gate
  if (CANONICAL_SOURCES.has(branch)) return true;
  // refs/heads/main, refs/remotes/origin/main, etc.
  if (/^refs\/(heads|remotes\/[^/]+)\/(main|master)$/.test(branch)) return true;
  return false;
}

function lastNonFlagPositional(tokens) {
  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    const tok = tokens[i];
    if (!tok || tok.startsWith('-')) continue;
    return tok;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────
// Per-command intent detectors
// ─────────────────────────────────────────────────────────────────────

function parseOvMergeBranch(tokensAfterMerge) {
  // Short-circuit help / version invocations — these never trigger a merge
  // and don't take a branch arg, so the gate has nothing to verify.
  for (const tok of tokensAfterMerge) {
    if (tok === '--help' || tok === '-h' || tok === '--version' || tok === '-v') {
      return null;
    }
  }
  for (const tok of tokensAfterMerge) {
    if (tok.startsWith('--branch=')) return tok.slice('--branch='.length);
  }
  for (let i = 0; i < tokensAfterMerge.length - 1; i += 1) {
    if (tokensAfterMerge[i] === '--branch') return tokensAfterMerge[i + 1];
  }
  for (const tok of tokensAfterMerge) {
    if (!tok || tok.startsWith('-')) continue;
    // Skip shell-redirect leftovers if the tokenizer didn't strip them
    // (e.g. `2>`, `&1`, `2>&1`, `>>foo.log`). A real branch name never
    // contains these characters.
    if (/[<>&|]/.test(tok)) continue;
    return tok;
  }
  return null;
}

function detectInSegment(segmentTokens) {
  if (segmentTokens.length === 0) return { kind: 'allow' };

  // Skip leading env assignments and `cd ... &&` shell-builtin wrappers.
  // Also skip leading `sudo`.
  let tokens = segmentTokens.slice();
  while (tokens.length > 0 && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[0])) {
    tokens = tokens.slice(1);
  }
  if (tokens[0] === 'sudo') tokens = tokens.slice(1);

  const segmentRaw = tokens.join(' ');
  if (isDryRun(tokens)) return { kind: 'allow' };

  // ── Artifact-forgery detector ──────────────────────────────────────
  if (writesProbeArtifact(tokens, segmentRaw)) {
    return { kind: 'forgery' };
  }

  // ── ov merge ───────────────────────────────────────────────────────
  // Find the position of `ov` followed by `merge`.
  for (let i = 0; i < tokens.length - 1; i += 1) {
    if (tokens[i] === 'ov' && tokens[i + 1] === 'merge') {
      const tail = tokens.slice(i + 2);
      const branch = parseOvMergeBranch(tail);
      if (!branch) return { kind: 'allow' };
      if (isCanonicalSource(branch)) return { kind: 'allow' };
      return { kind: 'gate', op: 'ov merge', sourceBranch: branch };
    }
  }

  // ── git ... ────────────────────────────────────────────────────────
  const gitIdx = tokens.indexOf('git');
  if (gitIdx === -1) return { kind: 'allow' };

  // Strip `git -C <dir>` / `-c key=val` style options.
  let gi = gitIdx + 1;
  while (gi < tokens.length) {
    const tok = tokens[gi];
    if (tok === '-C' || tok === '-c' || tok === '--git-dir' || tok === '--work-tree' || tok === '--namespace') {
      gi += 2; continue;
    }
    if (tok && tok.startsWith('-')) { gi += 1; continue; }
    break;
  }
  const subcommand = tokens[gi];
  const rest = tokens.slice(gi + 1);

  switch (subcommand) {
    case 'merge': {
      for (const tok of rest) {
        if (GIT_MERGE_NONMERGE_FLAGS.has(tok)) return { kind: 'allow' };
      }
      const branch = lastNonFlagPositional(rest);
      if (!branch) return { kind: 'allow' };
      if (isCanonicalSource(branch)) return { kind: 'allow' };
      return { kind: 'gate', op: 'git merge', sourceBranch: branch };
    }
    case 'pull': {
      // Forms:
      //   git pull                        → allow (current upstream)
      //   git pull <remote>               → allow (current upstream)
      //   git pull <remote> <branch>      → gate <branch>
      //   git pull <branch>               → gate <branch>
      const positionals = rest.filter((t) => t && !t.startsWith('-'));
      if (positionals.length === 0) return { kind: 'allow' };
      let candidate;
      if (positionals.length >= 2 && REMOTE_NAMES.has(positionals[0])) {
        candidate = positionals[1];
      } else if (positionals.length === 1 && REMOTE_NAMES.has(positionals[0])) {
        return { kind: 'allow' };
      } else {
        candidate = positionals[positionals.length - 1];
      }
      if (isCanonicalSource(candidate)) return { kind: 'allow' };
      return { kind: 'gate', op: 'git pull', sourceBranch: candidate };
    }
    case 'push': {
      // Forms that land code on canonical:
      //   git push <remote> <local>:main
      //   git push <remote> +<local>:main
      //   git push <remote> <local>:refs/heads/main
      //   git push <remote> HEAD:main
      // We gate by: any refspec where the right side is canonical.
      for (const tok of rest) {
        if (!tok || tok.startsWith('-')) continue;
        if (!tok.includes(':')) continue;
        let [src, dst] = tok.split(':', 2);
        if (src.startsWith('+')) src = src.slice(1);
        if (!CANONICAL_DESTINATIONS.has(dst) && !/^refs\/heads\/(main|master)$/.test(dst)) continue;
        // HEAD on the LOCAL repo at push time is the agent's CURRENT branch.
        // `git push origin HEAD:main` from a builder worktree on `feat/X` is
        // identical to `git push origin feat/X:main` and MUST be gated.
        // CANONICAL_SOURCES intentionally lists `HEAD` for the *named-source*
        // branches (`git merge HEAD` is a no-op), but not for push refspecs.
        // Resolve HEAD/refs/heads/HEAD via git rev-parse before letting it
        // through isCanonicalSource.
        let resolvedSrc = src;
        if (src === 'HEAD' || src === 'refs/heads/HEAD') {
          try {
            resolvedSrc = execSync('git rev-parse --abbrev-ref HEAD', {
              encoding: 'utf8',
              stdio: ['ignore', 'pipe', 'ignore'],
            }).trim();
          } catch {
            // Conservative: cannot resolve HEAD → gate.
            return { kind: 'gate', op: `git push <X>:${dst}`, sourceBranch: 'HEAD' };
          }
          // Defensive: if rev-parse came back empty, gate.
          if (!resolvedSrc) {
            return { kind: 'gate', op: `git push <X>:${dst}`, sourceBranch: 'HEAD' };
          }
        }
        if (isCanonicalSource(resolvedSrc)) return { kind: 'allow' };
        return { kind: 'gate', op: `git push <X>:${dst}`, sourceBranch: resolvedSrc };
      }
      return { kind: 'allow' };
    }
    case 'cherry-pick':
    case 'am':
    case 'apply':
    case 'rebase': {
      // We can't always know which branch is being applied. Defer to
      // `currentBranchIsCanonical` at gate time — return a sentinel and
      // resolve in runGuard().
      return { kind: 'gate-rewrite', op: `git ${subcommand}` };
    }
    default:
      return { kind: 'allow' };
  }
}

function detectMergeIntent(rawCommand) {
  if (typeof rawCommand !== 'string' || rawCommand.length === 0) {
    return { kind: 'allow' };
  }
  const command = stripShellComments(rawCommand);
  const segments = splitSegments(command);

  // First non-allow wins; forgery > gate > gate-rewrite.
  let firstGate = null;
  for (const seg of segments) {
    const result = detectInSegment(seg.tokens);
    if (result.kind === 'forgery') return result;
    if (result.kind !== 'allow' && firstGate === null) firstGate = result;
  }
  return firstGate || { kind: 'allow' };
}

// ─────────────────────────────────────────────────────────────────────
// Artifact-forgery detector
// ─────────────────────────────────────────────────────────────────────

const PROBE_ARTIFACT_BASENAME = '.http-smoke.json';

function tokenWritesArtifact(tok) {
  if (typeof tok !== 'string') return false;
  return tok.includes(PROBE_ARTIFACT_BASENAME);
}

/**
 * Detect any shell command in this segment that would WRITE to a
 * `.http-smoke.json` file (any path, any worktree). Conservative: matches
 * on basename presence in token stream PLUS a write-shaped operator/utility.
 */
function writesProbeArtifact(tokens, segmentRaw) {
  if (!segmentRaw.includes(PROBE_ARTIFACT_BASENAME)) return false;

  // Redirection: `> .claude/hooks/.http-smoke.json` / `>> .claude/hooks/.http-smoke.json`.
  // Tokens after our tokenizer don't preserve `>`/`>>` as separate tokens
  // (we strip whitespace but `>` is not a separator we split on). Match raw:
  if (/[>][>]?\s*[^\s]*\.http-smoke\.json\b/.test(segmentRaw)) return true;
  if (/\|\s*tee\b[^|;&]*\.http-smoke\.json\b/.test(segmentRaw)) return true;
  // tee directly: `tee path/.http-smoke.json` (with stdin from prior pipe
  // OR heredoc). The `|` form is matched above; bare `tee FILE` also writes.
  if (tokens.includes('tee')) {
    for (const tok of tokens) if (tokenWritesArtifact(tok)) return true;
  }
  // cp/mv/install/rsync write to their LAST argument. Only flag if the
  // destination matches the artifact basename (read-only `cat FILE` and
  // `cp FILE elsewhere` must not trigger).
  if (
    tokens[0] === 'cp' || tokens[0] === 'mv' ||
    tokens[0] === 'install' || tokens[0] === 'rsync'
  ) {
    const positionals = tokens.slice(1).filter((t) => t && !t.startsWith('-'));
    if (positionals.length > 0) {
      const dest = positionals[positionals.length - 1];
      if (tokenWritesArtifact(dest)) return true;
    }
  }
  if (tokens[0] === 'dd') {
    for (const tok of tokens) {
      if (tok.startsWith('of=') && tok.includes(PROBE_ARTIFACT_BASENAME)) return true;
    }
  }
  // `printf ... > FILE` / `echo ... > FILE` — already caught by the regex
  // above because `> FILE` is in segmentRaw.
  // `python -c "open('....http-smoke.json','w')"` — block any python/node
  // -e/-c that names the artifact.
  if (
    (tokens[0] === 'python' || tokens[0] === 'python3' ||
     tokens[0] === 'node' || tokens[0] === 'ruby' || tokens[0] === 'perl')
  ) {
    for (const tok of tokens) if (tokenWritesArtifact(tok)) return true;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────
// Worktree / probe resolution
// ─────────────────────────────────────────────────────────────────────

function resolveWorktreeForBranch(branch, opts) {
  const cwd = opts.cwd;
  const exec = opts.execSync || execSync;
  let porcelain;
  try {
    porcelain = exec('git worktree list --porcelain', { cwd, encoding: 'utf8' });
  } catch {
    return null;
  }
  const blocks = porcelain.split(/\n\n+/);
  // Strip any `origin/` / `<remote>/` prefix before suffix-matching.
  const branchVariants = new Set([
    branch,
    `refs/heads/${branch}`,
    branch.replace(/^origin\//, ''),
    branch.replace(/^[a-z][a-z0-9_-]*\//, ''),
  ]);
  for (const block of blocks) {
    const wtMatch = block.match(/^worktree\s+(.+)$/m);
    const branchMatch = block.match(/^branch\s+(.+)$/m);
    if (!wtMatch || !branchMatch) continue;
    const wtPath = wtMatch[1].trim();
    const fullRef = branchMatch[1].trim();
    for (const variant of branchVariants) {
      if (fullRef === variant) return wtPath;
      if (fullRef === `refs/heads/${variant}`) return wtPath;
      if (fullRef.endsWith(`/${variant}`)) return wtPath;
    }
  }
  return null;
}

function currentBranchIsCanonical(opts) {
  const cwd = opts.cwd;
  const exec = opts.execSync || execSync;
  try {
    const out = exec('git rev-parse --abbrev-ref HEAD', { cwd, encoding: 'utf8' }).trim();
    return out === 'main' || out === 'master';
  } catch {
    // Conservative: if we can't tell HEAD, assume canonical and gate.
    return true;
  }
}

function newestCommitMtimeOnBranch(branch, opts) {
  const cwd = opts.cwd;
  const exec = opts.execSync || execSync;
  try {
    const sec = exec(
      `git log -1 --format=%ct ${shellQuote(branch)}`,
      { cwd, encoding: 'utf8' }
    ).trim();
    const n = Number(sec);
    if (!Number.isFinite(n)) return null;
    return n * 1000;
  } catch {
    return null;
  }
}

function shellQuote(arg) {
  return `'${String(arg).replace(/'/g, "'\\''")}'`;
}

function evaluateProbeArtifact(worktreePath, branch, opts) {
  const probePath = path.join(worktreePath, '.claude', 'hooks', '.http-smoke.json');
  if (!fs.existsSync(probePath)) {
    return {
      code: 'PROBE_ARTIFACT_MISSING',
      message: `Source worktree has no probe artifact at ${probePath}.`,
    };
  }
  let probe;
  let artifactMtimeMs;
  try {
    artifactMtimeMs = fs.statSync(probePath).mtimeMs;
    probe = JSON.parse(fs.readFileSync(probePath, 'utf8'));
  } catch (error) {
    return {
      code: 'PROBE_ARTIFACT_CORRUPT',
      message: `Probe artifact is not valid JSON: ${error.message}`,
    };
  }

  const exitCode = Number(probe?.exitCode);
  const blockCodes = Array.isArray(probe?.blockCodes) ? probe.blockCodes : [];
  const blockReason =
    typeof probe?.blockReason === 'string' && probe.blockReason.length > 0
      ? probe.blockReason : null;

  if (blockCodes.length > 0) {
    return {
      code: 'PROBE_BLOCKED',
      message: `Probe reported block codes: ${blockCodes.join(', ')}.`,
      details: blockReason,
    };
  }
  if (!Number.isFinite(exitCode) || exitCode !== 0) {
    return {
      code: 'PROBE_EXITCODE_NONZERO',
      message: `Probe exitCode is ${probe?.exitCode}, expected 0.`,
      details: blockReason,
    };
  }

  const summary = probe?.summary;
  // Forged artifacts that omit `summary` or set non-numeric counters
  // (e.g. `summary: {failed: "n/a"}`) must NOT pass the gate. Treat any
  // missing or non-finite counter as a corrupt artifact.
  if (typeof summary !== 'object' || summary === null) {
    return {
      code: 'PROBE_ARTIFACT_CORRUPT',
      message: 'Probe artifact is missing summary block.',
    };
  }
  const cases = Array.isArray(probe?.cases) ? probe.cases : [];
  const total = Number(summary.total);
  const failed = Number(summary.failed);
  const passed = Number(summary.passed);
  const skipped = Number(summary.skipped);
  if (
    !Number.isFinite(total) ||
    !Number.isFinite(failed) ||
    !Number.isFinite(passed) ||
    !Number.isFinite(skipped)
  ) {
    return {
      code: 'PROBE_ARTIFACT_CORRUPT',
      message: 'Probe summary has missing or non-numeric counters.',
    };
  }

  if (total === 0 || cases.length === 0) {
    return {
      code: 'PROBE_NO_CASES',
      message: 'Probe ran but exercised zero cases (summary.total=0 / cases empty).',
    };
  }
  if (failed > 0) {
    const failingCases = cases.filter((c) => c && c.passed === false);
    const lines = failingCases.slice(0, 15).map((c) => {
      const label = c?.label ?? '(unknown)';
      const status = typeof c?.status === 'number' ? ` [${c.status}]` : '';
      const reason = c?.blockReason ?? 'failed';
      return `  ✗ ${label}${status} — ${reason}`;
    });
    return {
      code: 'PROBE_CASES_FAILED',
      message: `Probe reports ${failed} failing case(s).`,
      details: lines.length > 0 ? lines.join('\n') : null,
    };
  }
  if (skipped > 0 && passed === 0) {
    return {
      code: 'PROBE_ALL_SKIPPED',
      message: `Probe skipped every case (skipped=${skipped}, passed=0).`,
    };
  }

  // Staleness: any commit on the source branch newer than the artifact
  // means the probe ran against an older tree than what's about to land.
  const newestCommitMs = newestCommitMtimeOnBranch(branch, opts);
  if (
    Number.isFinite(newestCommitMs) && Number.isFinite(artifactMtimeMs) &&
    newestCommitMs > artifactMtimeMs + 1000
  ) {
    return {
      code: 'PROBE_STALE',
      message: [
        `Source branch \`${branch}\` has commits NEWER than its probe artifact.`,
        `  Probe ran at:    ${new Date(artifactMtimeMs).toISOString()}`,
        `  Newest commit:   ${new Date(newestCommitMs).toISOString()}`,
        '',
        'The probe did not exercise the current tip of the branch.',
      ].join('\n'),
    };
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────
// Block-message rendering
// ─────────────────────────────────────────────────────────────────────

/**
 * Per-code diagnostic block — tells the agent WHY this code fired and
 * exactly how to investigate inside the source worktree. Goal: stuck-agent
 * recovery without escalation.
 */
function getDiagnostic(code, details, worktreePath) {
  const wt = worktreePath || '<source-worktree>';
  switch (code) {
    case 'SOURCE_WORKTREE_NOT_FOUND':
      return [
        'WHAT: No live worktree found for the source branch. Either the',
        'builder closed their worktree before you tried to merge, or the',
        'branch was force-pushed without a corresponding worktree.',
        '',
        'INVESTIGATE:',
        '  git worktree list --porcelain   # see all worktrees',
        '  git branch -a                   # branch still exists?',
        '',
        'FIX:',
        '  - If branch exists but worktree is gone: ask the builder to',
        '    re-create their worktree (`ov worktree resume <task-id>`)',
        '    and re-run `pnpm probe:smoke` so the artifact is restored.',
        '  - If branch was deleted: the work is gone; do not merge.',
      ].join('\n');

    case 'PROBE_ARTIFACT_MISSING':
      return [
        'WHAT: The source worktree has no `.http-smoke.json` file. The',
        'builder either never ran `pnpm probe:smoke`, or the probe crashed',
        'before writing the artifact.',
        '',
        'INVESTIGATE (in the source worktree):',
        `  cd ${wt}`,
        '  pnpm stack:debug              # is pg/api/web up?',
        '  pnpm stack:logs api           # any boot errors?',
        '  ls -la .claude/hooks/.http-smoke.json       # confirm artifact missing',
        '',
        'FIX:',
        `  cd ${wt}`,
        '  pnpm stack:up && pnpm probe:smoke',
        '  jq ".summary" .claude/hooks/.http-smoke.json   # verify after run',
      ].join('\n');

    case 'PROBE_ARTIFACT_CORRUPT':
      return [
        'WHAT: `.http-smoke.json` exists but is not valid JSON. The probe',
        'was killed mid-write (Ctrl-C, OOM, or stack crash during run).',
        '',
        'INVESTIGATE:',
        `  cd ${wt}`,
        '  cat .claude/hooks/.http-smoke.json | tail -5    # see truncation point',
        '',
        'FIX:',
        `  cd ${wt}`,
        '  pnpm stack:up && pnpm probe:smoke   # full re-run',
      ].join('\n');

    case 'PROBE_EXITCODE_NONZERO':
      return [
        `WHAT: Probe exited non-zero (${details || ''}). Either the runner`,
        'itself failed (config / contract compile error) or one or more',
        'HTTP cases returned an unexpected response.',
        '',
        'INVESTIGATE:',
        `  cd ${wt}`,
        '  cat .claude/hooks/.http-smoke.md          # human-readable per-case summary',
        '  jq ".exitCode, .blockCodes, .summary" .claude/hooks/.http-smoke.json',
        '  jq \'.cases[] | select(.status != "passed")\' .claude/hooks/.http-smoke.json',
        '',
        'FIX: triage by failure type.',
        '  - HTTP code mismatch          → fix controller / guard / pipe',
        '  - Contract diagnostic         → see PROBE_BLOCKED diagnostics',
        '  - Stack not booted            → see PROBE_ALL_SKIPPED',
        'Then re-run probe:smoke in the source worktree.',
      ].join('\n');

    case 'PROBE_BLOCKED':
      return [
        `WHAT: Static-analysis blockers prevented the probe from running`,
        'cases. Each block code maps to a fixable code-level issue (missing',
        'decorator, ambiguous capture, unreachable status, etc.).',
        '',
        'INVESTIGATE:',
        `  cd ${wt}`,
        '  jq ".blockCodes" .claude/hooks/.http-smoke.json',
        '',
        'FIX (route by code; see CLAUDE.md "probe failure → skill routing"):',
        '  RESOURCE_CAPTURE_UNDECLARED        → build-verifiable-features',
        '  RESOURCE_CAPTURE_PATHPARAM_UNDEC.. → build-verifiable-features',
        '  CONTRACT_STATUS_UNREACHABLE_UNGE.. → nestjs-probe-coverage §2.8',
        '  Cookie / CSRF / auth-bootstrap     → nestjs-probe-coverage §2.9',
        '  FLOW_*                             → flow-failure-response',
        'After fix, re-run `pnpm probe:smoke` in the source worktree.',
      ].join('\n');

    case 'PROBE_NO_CASES':
      return [
        'WHAT: Probe ran but produced zero test cases. Either the diff added',
        'no controller endpoints, or the contract compiler returned an',
        'empty matrix (silent compile error).',
        '',
        'INVESTIGATE:',
        `  cd ${wt}`,
        '  jq "length" .claude/hooks/.matrix.json     # endpoint count',
        '  cat .claude/hooks/.matrix.stderr.log       # any silent compile errors?',
        '',
        'FIX: ask the builder to either add at least one endpoint or fix',
        'the matrix compiler (likely missing @ApiResponse / @ApiTags).',
      ].join('\n');

    case 'PROBE_CASES_FAILED':
      return [
        `WHAT: ${details || 'one or more'} probe case(s) hit the API and got`,
        'an unexpected response (status code, header, or body shape',
        'mismatch).',
        '',
        'INVESTIGATE:',
        `  cd ${wt}`,
        '  cat .claude/hooks/.http-smoke.md      # human-readable per-case failure',
        '  jq \'.cases[] | select(.status == "failed")\' .claude/hooks/.http-smoke.json',
        '',
        'FIX (per failed case): the probe shows expected vs actual. The',
        'BUILDER patches controller / DTO / guard / overlay until expected',
        'matches actual, then re-runs probe to refresh artifact.',
      ].join('\n');

    case 'PROBE_ALL_SKIPPED':
      return [
        'WHAT: Every case was skipped. Almost always means the stack did',
        'not boot — pg / api / web container failed health checks before',
        'cases ran.',
        '',
        'INVESTIGATE:',
        `  cd ${wt}`,
        '  pnpm stack:debug          # JSON snapshot of pg/api/web/bridge',
        '  pnpm stack:logs api       # last 200 lines of api logs',
        '  pnpm stack:logs postgres',
        '',
        'FIX: triage by which service is red (the BUILDER fixes this).',
        '  - api down               → typecheck + DI errors + missing env',
        '  - postgres down          → migration error / port collision',
        '  - bridge missing         → pnpm stack:reset && pnpm stack:up',
      ].join('\n');

    case 'PROBE_STALE':
      return [
        'WHAT: New commits landed on the branch after the probe ran, so the',
        'artifact does not reflect current code.',
        '',
        'INVESTIGATE:',
        `  cd ${wt}`,
        '  git log -3 --format="%h %ct %s"   # last commits + timestamps',
        '  stat .claude/hooks/.http-smoke.json             # artifact mtime',
        '',
        'FIX: builder runs `pnpm probe:smoke` in the source worktree. Stack',
        'stays booted between runs; re-run is fast (<10s typical).',
      ].join('\n');

    default:
      return [
        `WHAT: Failure code ${code}. Details: ${details || '(none)'}.`,
        '',
        'INVESTIGATE:',
        `  cd ${wt}`,
        '  cat .claude/hooks/.http-smoke.md',
        '  jq "." .claude/hooks/.http-smoke.json',
        '',
        'FIX: builder re-runs `pnpm probe:smoke` after diagnosing.',
      ].join('\n');
  }
}

function buildBlockMessage({ matchedCommand, op, sourceBranch, worktreePath, block }) {
  const truncatedCommand =
    matchedCommand.length > 140 ? `${matchedCommand.slice(0, 140)}…` : matchedCommand;
  const diagnostic = getDiagnostic(block.code, block.details, worktreePath);
  const lines = [
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    `BLOCKED: Refusing \`${op}\` of \`${sourceBranch}\` — source probes not green.`,
    `Reason code:       ${block.code}`,
    `Rejected command:  ${truncatedCommand.trim()}`,
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    block.message,
  ];
  if (worktreePath) lines.push('', `Source worktree:   ${worktreePath}`);
  if (block.details) lines.push('', 'Details:', block.details);
  lines.push(
    '',
    diagnostic,
    '',
    'RETRY: once the probe is green in the source worktree, retry your',
    'merge command. Use `ov merge --branch <X>` — not raw `git merge` /',
    '`git pull` / `git push X:main` / cherry-pick / rebase / am.',
    '',
    'Do NOT bypass with `--dry-run` — dry-run skips the gate but does',
    'not perform the merge.',
    '',
    'COORDINATION: if you are the lead/coordinator, the BUILDER of the',
    'source branch must re-run the probe in their worktree. You cannot',
    'fix the code from your own worktree. Mail them with:',
    `  ov mail send --type question --to <builder-name> \\`,
    `      --subject "<task-id>: probe ${block.code}, please re-run"`,
    'including the failure code above.',
    '',
    'This hook only checks recorded probe state. Lint, tests, integration,',
    'and e2e gates are enforced separately by the close gates.',
  );
  return lines.join('\n');
}

function buildForgeryMessage({ matchedCommand }) {
  const truncated =
    matchedCommand.length > 140 ? `${matchedCommand.slice(0, 140)}…` : matchedCommand;
  return [
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    'BLOCKED: Refusing to write `.http-smoke.json` via shell.',
    `Reason code:       PROBE_ARTIFACT_FORGERY`,
    `Rejected command:  ${truncated.trim()}`,
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    'Only `pnpm probe:smoke` is allowed to write `.http-smoke.json`.',
    'Hand-edited or fabricated artifacts would let you bypass the merge',
    'gate. Run the real probe in the source worktree instead.',
  ].join('\n');
}

function buildRewriteRefusalMessage({ matchedCommand, op }) {
  const truncated =
    matchedCommand.length > 140 ? `${matchedCommand.slice(0, 140)}…` : matchedCommand;
  return [
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    `BLOCKED: \`${op}\` on canonical bypasses the source-probe gate.`,
    `Reason code:       UNGATED_CODE_LANDING`,
    `Rejected command:  ${truncated.trim()}`,
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    `The lead is not allowed to land builder code via \`${op}\` because the`,
    'source branch cannot be unambiguously identified for probe verification.',
    '',
    'Use `ov merge --branch <builder-branch>` instead. That command names',
    'the source branch explicitly and runs through this gate.',
  ].join('\n');
}

function emitDeny(message) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: message,
    },
  }));
}

// ─────────────────────────────────────────────────────────────────────
// Pure entry point
// ─────────────────────────────────────────────────────────────────────

function runGuard(opts) {
  const { stdinRaw, cwd, execSync: execStub } = opts;

  let input;
  try { input = JSON.parse(stdinRaw); }
  catch { return { allow: true }; }

  if (input?.tool_name !== 'Bash') return { allow: true };

  const command = input?.tool_input?.command || '';
  const intent = detectMergeIntent(command);
  if (intent.kind === 'allow') return { allow: true };

  if (intent.kind === 'forgery') {
    return {
      allow: false,
      code: 'PROBE_ARTIFACT_FORGERY',
      message: buildForgeryMessage({ matchedCommand: command }),
    };
  }

  try {
    if (intent.kind === 'gate-rewrite') {
      const onCanonical = currentBranchIsCanonical({ cwd, execSync: execStub });
      if (!onCanonical) return { allow: true };
      return {
        allow: false,
        code: 'UNGATED_CODE_LANDING',
        message: buildRewriteRefusalMessage({
          matchedCommand: command,
          op: intent.op,
        }),
      };
    }

    // intent.kind === 'gate' — branch-named source.
    const worktreePath = resolveWorktreeForBranch(intent.sourceBranch, {
      cwd,
      execSync: execStub,
    });
    if (!worktreePath) {
      const block = {
        code: 'SOURCE_WORKTREE_NOT_FOUND',
        message: [
          `No live worktree found for source branch \`${intent.sourceBranch}\`.`,
          '',
          'Cannot verify probes for a branch that has no live worktree.',
          'Refusing to merge unverified.',
        ].join('\n'),
      };
      return {
        allow: false,
        code: block.code,
        message: buildBlockMessage({
          matchedCommand: command,
          op: intent.op,
          sourceBranch: intent.sourceBranch,
          worktreePath: null,
          block,
        }),
      };
    }

    const block = evaluateProbeArtifact(worktreePath, intent.sourceBranch, {
      cwd, execSync: execStub,
    });
    if (!block) return { allow: true };

    return {
      allow: false,
      code: block.code,
      message: buildBlockMessage({
        matchedCommand: command,
        op: intent.op,
        sourceBranch: intent.sourceBranch,
        worktreePath,
        block,
      }),
    };
  } catch {
    return { allow: true };
  }
}

function readStdinSafe() {
  try {
    if (process.stdin.isTTY) return '';
    return fs.readFileSync(0, 'utf8');
  } catch { return ''; }
}

function mainCli() {
  try {
    const cwd = process.env.CLAUDE_PROJECT_DIR || process.env.PROJECT_ROOT || process.cwd();
    const stdinRaw = readStdinSafe();
    const result = runGuard({ stdinRaw, cwd });
    if (result.allow) process.exit(0);
    emitDeny(result.message);
    process.exit(0);
  } catch { process.exit(0); }
}

if (require.main === module) mainCli();

module.exports = {
  runGuard,
  detectMergeIntent,
  resolveWorktreeForBranch,
  evaluateProbeArtifact,
  parseOvMergeBranch,
  tokenize,
  splitSegments,
  writesProbeArtifact,
  currentBranchIsCanonical,
  isCanonicalSource,
};
