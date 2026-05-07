/**
 * PreToolUse hook (matcher: Bash)
 *
 * TIER 2 of 3-tier missing-test detection.
 *
 * Denies forward-motion Bash commands (git commit, ov mail send worker_done,
 * sd close) when the pending-test set (populated by track-pending-tests.js)
 * is non-empty.
 *
 * The agent gets a clear "write tests first" message at the exact moment it
 * would otherwise ship broken state.
 *
 * Design: only blocks the specific forward-motion commands. Normal work
 * (ls, cat, git status, pnpm test, etc.) is never blocked.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const PROJECT_DIR = process.env.HOOK_TEST_PROJECT_ROOT || path.resolve(__dirname, '..', '..');
const STATE_FILE = path.join(
  os.tmpdir(),
  `pending-tests-${Buffer.from(PROJECT_DIR).toString('base64url')}.json`
);

// Forward-motion commands that MUST NOT run with missing-test debt.
// Patterns match anywhere in the command; tuned to avoid false positives
// like `git` subcommands that aren't commits, or echo "worker_done".
const FORWARD_MOTION_PATTERNS = [
  /\bgit\s+commit\b/,
  /\bov\s+mail\s+send\b/,
  /worker_done/,
  /\bsd\s+close\b/,
];

// ── Parse tool input ────────────────────────────────────────────────
let input;
try {
  input = JSON.parse(fs.readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

const command = input?.tool_input?.command;
if (typeof command !== 'string' || !command) {
  process.exit(0);
}

// ── Is this a forward-motion command? ───────────────────────────────
const matched = FORWARD_MOTION_PATTERNS.some((p) => p.test(command));
if (!matched) {
  process.exit(0);
}

// ── Read pending set; exit 0 if empty or missing ────────────────────
let pending = [];
try {
  const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  pending = Array.isArray(raw.pending) ? raw.pending : [];
} catch {
  // No state file = no debt recorded = allow
  process.exit(0);
}

if (pending.length === 0) {
  process.exit(0);
}

// ── Deny with actionable reason ─────────────────────────────────────
const list = pending.map((p) => `  - ${p}`).join('\n');
const reason = `Cannot commit/close — ${pending.length} source file(s) lack tests:\n${list}\n\nWrite tests for each file (same dir, or __tests__/<name>.test.ts) then retry.`;

console.log(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  })
);

process.exit(0);
