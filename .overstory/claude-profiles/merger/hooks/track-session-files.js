/**
 * PreToolUse hook (Edit|Write matcher)
 *
 * Two jobs:
 *   1. Track every file Claude modifies (for e2e-test-on-stop.js)
 *   2. On first invocation per session, auto-install Playwright MCP
 *      so browser testing is available when the Stop hook fires
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, spawn } = require('child_process');

const PROJECT_DIR = process.env.HOOK_TEST_PROJECT_ROOT || path.resolve(__dirname, '..', '..');
const MCP_CONFIG = path.join(PROJECT_DIR, '.mcp.json');
const SESSION_FILE = path.join(
  os.tmpdir(),
  `claude-session-files-${Buffer.from(PROJECT_DIR).toString('base64url')}.json`
);
const SETUP_FLAG = path.join(
  os.tmpdir(),
  `claude-mcp-setup-done-${Buffer.from(PROJECT_DIR).toString('base64url')}`
);

const MAX_AGE_MS = 2 * 60 * 60 * 1000;

const MCP_TEMPLATE = {
  mcpServers: {
    playwright: {
      command: 'npx',
      // --headless is required: @playwright/mcp defaults to HEADED mode,
      // and headed Chromium needs an X server (DISPLAY) which the panel
      // container does not provide. Without --headless the MCP server
      // launches the browser in the background and every browser_*
      // tool call errors out, leaving the e2e-test-on-stop hook with
      // no evidence to read — same end result as the older stdin-crash
      // bug, just from a different cause.
      args: ['-y', '@playwright/mcp', '--headless'],
      type: 'stdio',
    },
  },
};

// ── Parse stdin ─────────────────────────────────────────────────────
// Tolerate missing/empty stdin. In Docker tmux runtime fd 0 may carry
// no data and JSON.parse('') throws — exiting silently here cascades
// into the rest of this hook never running, which means .mcp.json
// never gets written and Playwright MCP never gets wired. The agent
// then has no browser tools, e2e-test-on-stop sees zero MCP evidence,
// and the gate fails open. Fall back to {} so the rest of the hook
// (ensureMcpJson, ensureBrowsers, the file-tracker) still runs.
let input = {};
try {
  const raw = fs.readFileSync(0, 'utf8');
  input = raw ? JSON.parse(raw) : {};
} catch {
  input = {};
}

// ── Auto-install Playwright MCP (once per session) ──────────────────
if (!fs.existsSync(SETUP_FLAG)) {
  fs.writeFileSync(SETUP_FLAG, Date.now().toString());
  try {
    ensureMcpJson();
    ensureBrowsers();
  } catch {
    // Silent — never block edits for MCP setup issues
  }
}

// ── Track changed files ─────────────────────────────────────────────
const filePath = input?.tool_input?.file_path;
if (filePath) {
  let tracked = { startedAt: Date.now(), files: [] };
  try {
    const existing = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
    if (Date.now() - existing.startedAt < MAX_AGE_MS) {
      tracked = existing;
    }
  } catch {}

  if (!tracked.files.includes(filePath)) {
    tracked.files.push(filePath);
    fs.writeFileSync(SESSION_FILE, JSON.stringify(tracked, null, 2));
  }
}

// Always allow — this hook only tracks + installs, never blocks
process.exit(0);

// ── Helpers ─────────────────────────────────────────────────────────

function ensureMcpJson() {
  if (!fs.existsSync(MCP_CONFIG)) {
    // Create .mcp.json from scratch
    fs.writeFileSync(MCP_CONFIG, JSON.stringify(MCP_TEMPLATE, null, 2) + '\n');
    return;
  }

  // Patch existing .mcp.json if playwright entry is missing
  try {
    const config = JSON.parse(fs.readFileSync(MCP_CONFIG, 'utf8'));
    if (!config.mcpServers?.playwright) {
      config.mcpServers = config.mcpServers || {};
      config.mcpServers.playwright = MCP_TEMPLATE.mcpServers.playwright;
      fs.writeFileSync(MCP_CONFIG, JSON.stringify(config, null, 2) + '\n');
    }
  } catch {}
}

function ensureBrowsers() {
  // Quick check: can playwright find chromium?
  try {
    execSync('npx playwright install --dry-run 2>&1', {
      timeout: 15000,
      stdio: 'pipe',
    });
  } catch {
    // Browsers may be missing — install in background so we don't slow down the edit
    const child = spawn('npx', ['playwright', 'install', 'chromium'], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
  }
}
