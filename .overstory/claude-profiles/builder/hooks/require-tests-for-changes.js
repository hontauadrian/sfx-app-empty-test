/**
 * Stop hook — blocks completion if any source file modified this session
 * does not have a corresponding test file on disk.
 *
 * Reads the session file written by track-session-files.js.
 * Pairing logic lives in lib/test-pairing.js (shared with the PreToolUse
 * pending-test tracker).
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const { needsTest, findTestFile } = require('./lib/test-pairing');

// Read stdin tolerantly. Containerised panel runtimes (Docker tmux,
// detached child processes) deliver fd 0 with no data — JSON.parse('')
// throws SyntaxError and the hook crashes, claude treats the non-zero
// exit as advisory, and the gate silently fails open. The hook does
// not depend on the stdin payload (it reads the session-tracker file
// + git diff), so an empty fallback keeps the gate enforcing.
let input = {};
try {
  const raw = fs.readFileSync(0, 'utf8');
  input = raw ? JSON.parse(raw) : {};
} catch {
  input = {};
}

const PROJECT_DIR = process.env.HOOK_TEST_PROJECT_ROOT || path.resolve(__dirname, '..', '..');
const SESSION_FILE = path.join(
  os.tmpdir(),
  `claude-session-files-${Buffer.from(PROJECT_DIR).toString('base64url')}.json`
);

// ── Load session file ───────────────────────────────────────────────
let sessionFiles = [];
try {
  const session = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
  sessionFiles = session.files || [];
} catch {
  // No session file — nothing was modified, allow completion
  process.exit(0);
}

if (sessionFiles.length === 0) {
  process.exit(0);
}

// ── Check all modified files ────────────────────────────────────────
const missing = [];

for (const file of sessionFiles) {
  // Normalize to relative path for pattern matching
  const relative = file.startsWith(PROJECT_DIR)
    ? file.slice(PROJECT_DIR.length + 1)
    : file;

  if (!needsTest(relative)) continue;

  // Check the file still exists (might have been deleted)
  const absPath = path.isAbsolute(file)
    ? file
    : path.join(PROJECT_DIR, file);
  if (!fs.existsSync(absPath)) continue;

  if (!findTestFile(file, PROJECT_DIR).found) {
    missing.push(relative);
  }
}

if (missing.length > 0) {
  const fileList = missing.map((f) => `  - ${f}`).join('\n');
  console.log(
    JSON.stringify({
      decision: 'block',
      reason: `BLOCKED: ${missing.length} source file(s) modified without corresponding test files.\n\nFiles missing tests:\n${fileList}\n\nEvery source file you create or modify must have a corresponding .test.ts(x) file.\nAdd test files then try completing again.`,
    })
  );
}

process.exit(0);
