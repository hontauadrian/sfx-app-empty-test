/**
 * PreToolUse hook (matcher: Write|Edit|MultiEdit)
 *
 * TIER 1 of 3-tier missing-test detection.
 *
 * Tracks per-session "pending test debt": source files written/edited that
 * still lack a matching test file. Debt is surfaced to the agent in-line
 * via `additionalContext` once it reaches a threshold — never blocks a
 * Write, just nudges.
 *
 * State file: /tmp/pending-tests-<project-hash>.json
 *   { "startedAt": <ms>, "pending": ["<relPath>", ...] }
 *
 * Companion hooks:
 *   block-commit-if-missing.js — PreToolUse:Bash, hard-blocks commits/close
 *   require-tests-for-changes.js — Stop, final backstop
 *
 * Debug: `node .claude/hooks/track-pending-tests.js --dump`
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const { needsTest, findTestFile, deriveSourceFromTest } = require('./lib/test-pairing');

const PROJECT_DIR = process.env.HOOK_TEST_PROJECT_ROOT || path.resolve(__dirname, '..', '..');
const STATE_FILE = path.join(
  os.tmpdir(),
  `pending-tests-${Buffer.from(PROJECT_DIR).toString('base64url')}.json`
);

// Session freshness window — 2 hours, same as track-session-files.js
const MAX_AGE_MS = 2 * 60 * 60 * 1000;

// Nudge threshold: don't spam the agent on the first missing test.
const NUDGE_THRESHOLD = 3;

// ── Helpers ─────────────────────────────────────────────────────────
function loadState() {
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    if (Date.now() - (raw.startedAt || 0) > MAX_AGE_MS) {
      return { startedAt: Date.now(), pending: [] };
    }
    return {
      startedAt: raw.startedAt || Date.now(),
      pending: Array.isArray(raw.pending) ? raw.pending : [],
    };
  } catch {
    return { startedAt: Date.now(), pending: [] };
  }
}

function saveState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch {
    // Never block the tool on state-file write failure
  }
}

function toRelative(filePath) {
  if (!filePath) return null;
  const abs = path.isAbsolute(filePath) ? filePath : path.join(PROJECT_DIR, filePath);
  if (abs.startsWith(PROJECT_DIR)) {
    return abs.slice(PROJECT_DIR.length + 1);
  }
  return filePath;
}

function isTestFile(relPath) {
  return /__tests__|__integration__|\.test\.|\.spec\.|\.integration-test\./i.test(relPath);
}

// ── Debug dump mode ─────────────────────────────────────────────────
if (process.argv.includes('--dump')) {
  const state = loadState();
  console.log(JSON.stringify(state, null, 2));
  console.log('\nState file:', STATE_FILE);
  process.exit(0);
}

// ── Parse tool input ────────────────────────────────────────────────
let input;
try {
  input = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'));
} catch {
  process.exit(0);
}

const filePath = input?.tool_input?.file_path;
if (!filePath) process.exit(0);

const relative = toRelative(filePath);
if (!relative) process.exit(0);

const state = loadState();

// ── Case A: agent is writing a test file — clear its matching source from pending
if (isTestFile(relative)) {
  const candidates = deriveSourceFromTest(relative).map((p) => toRelative(p));
  const before = state.pending.length;
  state.pending = state.pending.filter((src) => !candidates.includes(src));
  if (state.pending.length !== before) {
    saveState(state);
  }
  process.exit(0);
}

// ── Case B: agent is writing a source file — add to pending if unpaired
if (needsTest(relative)) {
  const { found } = findTestFile(filePath, PROJECT_DIR);
  if (!found && !state.pending.includes(relative)) {
    state.pending.push(relative);
    saveState(state);
  }
}

// ── Emit nudge if debt ≥ threshold ──────────────────────────────────
if (state.pending.length >= NUDGE_THRESHOLD) {
  const list = state.pending.map((p) => `  - ${p}`).join('\n');
  const message = `⚠️ ${state.pending.length} source files lack tests:\n${list}\n\nWrite tests for these before creating more source files. Commits and worker_done will be blocked until debt clears.`;
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        additionalContext: message,
      },
    })
  );
}

process.exit(0);
