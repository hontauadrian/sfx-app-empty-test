#!/usr/bin/env node
/**
 * Plan 07 defense-in-depth — PreToolUse guard.
 *
 * Blocks Write/Edit/MultiEdit targeting machine-generated or human-owned
 * contract files that agents must never edit directly:
 *   - .claude/hooks/.flows.generated.json
 *   - .claude/hooks/.matrix.json
 *   - .claude/runtime-contract.logical.json
 *
 * No escape hatch. Humans edit logical.json outside Claude sessions.
 *
 * Contract:
 *   - matcher: "Edit|Write|MultiEdit"
 *   - stdin: { tool_name, tool_input: { file_path } }
 *   - Allow: exit 0, no stdout.
 *   - Block: exit 0, stdout = {"decision":"block","reason":"..."}
 */

const fs = require('node:fs');
const path = require('node:path');

const BLOCKED_SUFFIXES = [
  '.claude/hooks/.flows.generated.json',
  '.claude/hooks/.matrix.json',
  '.claude/runtime-contract.logical.json',
];

function normalizePath(filePath) {
  if (typeof filePath !== 'string') return '';
  return filePath.replace(/\\/g, '/');
}

function isBlocked(filePath) {
  const normalized = normalizePath(filePath);
  for (const suffix of BLOCKED_SUFFIXES) {
    if (normalized.endsWith(suffix) || normalized === suffix) return suffix;
  }
  return null;
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
    if (tool !== 'Write' && tool !== 'Edit' && tool !== 'MultiEdit') {
      return { allow: true };
    }
    const filePath = payload?.tool_input?.file_path;
    const match = isBlocked(filePath);
    if (!match) return { allow: true };

    const reason =
      `GENERATED_FILE_WRITE_BLOCKED: ${match} is machine-generated ` +
      `(matrix / flows) or human-owned (logical contract). Do not edit. ` +
      `To change what is tested, modify a Zod schema, a NestJS decorator, ` +
      `or the logical contract via human review. Regenerate via ` +
      '`pnpm flows:regen` / `pnpm matrix:regen` / edit logical contract ' +
      'outside Claude session.';

    return { allow: false, decision: 'block', reason };
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
  if (result.allow) {
    process.exit(0);
  }
  process.stdout.write(JSON.stringify({ decision: result.decision, reason: result.reason }));
  process.exit(0);
}

if (require.main === module) {
  mainCli();
}

module.exports = { runGuard, isBlocked };
