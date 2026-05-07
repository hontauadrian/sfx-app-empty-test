/**
 * PostToolUse hook — records Playwright MCP calls to an append-only evidence log.
 *
 * Matcher: mcp__playwright__.*
 *
 * Every call to a Playwright MCP tool is appended as a single JSONL record to
 *   <project>/.claude/hooks/.mcp-evidence/<session_id>.jsonl
 *
 * The log is the single source of truth for pre-close-gate.js E2E verification.
 * The agent cannot forge records because:
 *   1. This hook is invoked by Claude Code itself with the real tool_response
 *      — the agent cannot synthesize a fake invocation.
 *   2. The .mcp-evidence directory sits under .claude/hooks/ which is in
 *      PROTECTED_WORKTREE_GLOBS — the Bash + Write/Edit path-boundary guards
 *      block the agent from writing there via any tool.
 *
 * This hook never blocks — it only records. Errors are swallowed so a logging
 * failure cannot gate the agent's work.
 *
 * Plan 03 — Evidence correlation:
 * Additive fields written per record so downstream Stop hook no longer re-parses
 * `output_preview` on every invocation. The legacy fields
 *   (ts, session, tool, input, output_size, output_preview)
 * are preserved byte-for-byte; new fields are tolerant of older records
 * (pre-schemaVersion records continue to work).
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

function readInput() {
  try {
    return JSON.parse(fs.readFileSync(0, 'utf8'));
  } catch {
    return null;
  }
}

function stringify(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

// ── Unescape helper ───────────────────────────────────────────────────
// output_preview is the JSON.stringify()'d tool_response — real newlines
// arrive as the two-character sequence "\n". We emit the same safe
// lightweight unescape used by e2e-test-on-stop.js.
function unescapePreview(str) {
  if (!str) return '';
  return String(str).replace(/\\n/g, '\n').replace(/\\"/g, '"');
}

// ── Token parser (Playwright accessibility tree) ─────────────────────
const TOKEN_PATTERNS = [
  /-\s*(?:heading|button|link|textbox|combobox|checkbox|radio|tab|menuitem|option|switch)\s+"([^"]+)"/g,
  /aria-label\s*[=:]\s*"?([^"\n\\]+)"?/gi,
  /data-testid\s*=\s*"([^"]+)"/gi,
  /-\s*text:\s*"([^"]+)"/g,
  /Page Title:\s*([^\n\\]+)/gi,
];

function normalizeToken(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s-]/g, '')
    .trim();
}

function extractPageTokens(preview) {
  try {
    const text = unescapePreview(preview);
    const out = new Set();
    for (const re of TOKEN_PATTERNS) {
      re.lastIndex = 0;
      let match;
      while ((match = re.exec(text)) !== null) {
        const token = normalizeToken(match[1]);
        if (token && token.length >= 2 && token.length <= 120) out.add(token);
      }
    }
    return Array.from(out);
  } catch {
    return [];
  }
}

// ── URL extractor ───────────────────────────────────────────────────
const SNAPSHOT_URL_RE = /Page URL:\s*([^\s\\]+)/;

function extractNavigatedUrl(toolName, toolInput, preview) {
  try {
    if (toolName === 'mcp__playwright__browser_navigate') {
      const url = toolInput && typeof toolInput.url === 'string' ? toolInput.url : null;
      if (url) return url;
    }
    if (toolName === 'mcp__playwright__browser_snapshot') {
      const text = unescapePreview(preview);
      const match = SNAPSHOT_URL_RE.exec(text);
      if (match) return match[1];
    }
  } catch {
    // fall through
  }
  return null;
}

function toPath(rawUrl) {
  if (!rawUrl) return null;
  try {
    const parsed = new URL(rawUrl);
    const pathname = parsed.pathname;
    return pathname === '' ? '/' : pathname;
  } catch {
    return typeof rawUrl === 'string' && rawUrl.startsWith('/') ? rawUrl : null;
  }
}

// ── Sticky per-session "current URL" cache ──────────────────────────
function currentUrlCachePath(projectDir) {
  const base64 = Buffer.from(projectDir).toString('base64url');
  return path.join(os.tmpdir(), `claude-mcp-current-url-${base64}.json`);
}

const STICKY_TTL_MS = 10 * 60 * 1000;

function readStickyUrl(projectDir, sessionId) {
  try {
    const cachePath = currentUrlCachePath(projectDir);
    if (!fs.existsSync(cachePath)) return null;
    const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    if (!data || data.session !== sessionId) return null;
    if (typeof data.ts !== 'number' || Date.now() - data.ts > STICKY_TTL_MS) return null;
    return typeof data.url === 'string' ? data.url : null;
  } catch {
    return null;
  }
}

function writeStickyUrl(projectDir, sessionId, url) {
  try {
    const cachePath = currentUrlCachePath(projectDir);
    fs.writeFileSync(
      cachePath,
      JSON.stringify({ session: sessionId, url, ts: Date.now() })
    );
  } catch {
    // best-effort
  }
}

// ── Network-failure extractor ───────────────────────────────────────
const NETWORK_FAIL_RES = [
  /\b(ERR_CONNECTION_REFUSED|net::ERR_[A-Z_]+)\b[^\n]{0,200}?(https?:\/\/\S+)?/g,
  /Failed to fetch\s+(https?:\/\/\S+)?/g,
  /(GET|POST|PUT|PATCH|DELETE)\s+(https?:\/\/\S+)\s+(\d{3})\b/g,
  /\b(ECONNREFUSED)\b/g,
];

function extractNetworkFailures(preview) {
  try {
    const text = unescapePreview(preview);
    const fails = [];

    NETWORK_FAIL_RES[0].lastIndex = 0;
    let match;
    while ((match = NETWORK_FAIL_RES[0].exec(text)) !== null) {
      fails.push({ url: match[2] || null, error: match[1] });
    }

    NETWORK_FAIL_RES[3].lastIndex = 0;
    while ((match = NETWORK_FAIL_RES[3].exec(text)) !== null) {
      fails.push({ url: null, error: match[1] });
    }

    NETWORK_FAIL_RES[1].lastIndex = 0;
    while ((match = NETWORK_FAIL_RES[1].exec(text)) !== null) {
      fails.push({ url: match[1] || null, error: 'Failed to fetch' });
    }

    NETWORK_FAIL_RES[2].lastIndex = 0;
    while ((match = NETWORK_FAIL_RES[2].exec(text)) !== null) {
      const status = Number(match[3]);
      if (status >= 400) {
        fails.push({ url: match[2], error: String(status), method: match[1] });
      }
    }

    return fails;
  } catch {
    return [];
  }
}

// ── Console errors ──────────────────────────────────────────────────
const ERROR_LINE_CAPTURE = /^[\s]*\[error\][^\n]{0,500}/gim;

function extractConsoleErrors(preview) {
  try {
    const text = unescapePreview(preview);
    const matches = text.match(ERROR_LINE_CAPTURE) || [];
    return matches.slice(0, 50).map((line) => line.slice(0, 500));
  } catch {
    return [];
  }
}

// ── Snapshot hash ───────────────────────────────────────────────────
function computeSnapshotHash(preview) {
  try {
    const body = unescapePreview(preview)
      .replace(/\[ref=e?\d+\]/g, '[ref=_]')
      .replace(/cursor=\d+/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return 'sha256:' + crypto.createHash('sha256').update(body).digest('hex');
  } catch {
    return null;
  }
}

// ── Session-files snapshot ──────────────────────────────────────────
function readSessionFiles(projectDir) {
  try {
    const sessionFile = path.join(
      os.tmpdir(),
      `claude-session-files-${Buffer.from(projectDir).toString('base64url')}.json`
    );
    const data = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
    if (Array.isArray(data.files)) return [...data.files];
    return [];
  } catch {
    return [];
  }
}

try {
  const input = readInput();
  if (!input) process.exit(0);

  const toolName = input.tool_name || '';
  if (!toolName.startsWith('mcp__playwright__')) process.exit(0);

  const sessionId = input.session_id || 'unknown-session';
  const projectDir = process.env.HOOK_TEST_PROJECT_ROOT || process.cwd();

  const evidenceDir = path.join(projectDir, '.claude', 'hooks', '.mcp-evidence');
  try {
    fs.mkdirSync(evidenceDir, { recursive: true });
  } catch {
    // Directory creation failure — swallow and continue; append below will
    // either succeed (race-created by another hook call) or we give up.
  }

  const logFile = path.join(evidenceDir, `${sessionId}.jsonl`);

  // Truncate output_preview to 8 KB to keep the log bounded per entry while
  // leaving enough room for e2e-test-on-stop.js to extract the `Page URL:`
  // header, `Errors: N` summary, and any [error] log lines from the tool
  // response. Too small a preview (2 KB) caused the old regex-based error
  // detector to miss real console errors because the summary line was cut.
  const rawOutput = stringify(input.tool_response);
  const outputPreview = rawOutput.length > 8192 ? rawOutput.slice(0, 8192) : rawOutput;
  const toolInput = input.tool_input || {};

  // ── Correlation layer (plan 03) ─────────────────────────────────
  let navigatedUrl = null;
  let pageTokens = [];
  let consoleErrors = [];
  let networkFailures = [];
  let snapshotHash = null;
  let sessionFilesSnapshot = [];

  try {
    navigatedUrl = extractNavigatedUrl(toolName, toolInput, outputPreview);
  } catch {
    navigatedUrl = null;
  }

  if (toolName === 'mcp__playwright__browser_snapshot') {
    try {
      pageTokens = extractPageTokens(outputPreview);
    } catch {
      pageTokens = [];
    }
    try {
      snapshotHash = computeSnapshotHash(outputPreview);
    } catch {
      snapshotHash = null;
    }
  }

  if (toolName === 'mcp__playwright__browser_console_messages') {
    try {
      consoleErrors = extractConsoleErrors(outputPreview);
    } catch {
      consoleErrors = [];
    }
    try {
      networkFailures = extractNetworkFailures(outputPreview);
    } catch {
      networkFailures = [];
    }
  }

  try {
    sessionFilesSnapshot = readSessionFiles(projectDir);
  } catch {
    sessionFilesSnapshot = [];
  }

  // Sticky "current URL" — navigate writes, others read as fallback.
  if (toolName === 'mcp__playwright__browser_navigate' && navigatedUrl) {
    writeStickyUrl(projectDir, sessionId, navigatedUrl);
  }
  let currentUrl = navigatedUrl;
  if (!currentUrl) {
    try {
      currentUrl = readStickyUrl(projectDir, sessionId);
    } catch {
      currentUrl = null;
    }
  }

  const navigatedPath = toPath(navigatedUrl);

  const record = {
    ts: Date.now(),
    session: sessionId,
    tool: toolName,
    input: toolInput,
    output_size: rawOutput.length,
    output_preview: outputPreview,
    navigatedUrl,
    navigatedPath,
    pageTokens,
    consoleErrors,
    networkFailures,
    snapshotHash,
    sessionFilesSnapshot,
    currentUrl,
    schemaVersion: 2,
  };

  try {
    fs.appendFileSync(logFile, `${JSON.stringify(record)}\n`);
  } catch {
    // Append failure — logging is best-effort. The pre-close-gate will flag
    // missing evidence with a clear per-route message; the agent won't be
    // silently approved.
  }
} catch {
  // Top-level catch-all — never block the agent from a logging error.
}

process.exit(0);
