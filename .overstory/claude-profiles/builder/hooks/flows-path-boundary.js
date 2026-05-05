#!/usr/bin/env node
/* eslint-disable */
'use strict';

/**
 * Path-boundary hook (Decision 3 / Phase 0b).
 *
 * Fires PreToolUse on Write, Edit, MultiEdit, NotebookEdit. If the target
 * file path is under `.overstory/runtime-contract.flows/` AND the current
 * agent profile is NOT `lead` or `coordinator`, blocks with reason
 * `FLOW_OWNERSHIP_VIOLATION`. Read access is unrestricted (no block on
 * Read tool).
 *
 * Profile detection priority:
 *   1. $OVERSTORY_AGENT_CAPABILITY env var (lead | coordinate | implement | review | monitor)
 *   2. $CLAUDE_PROFILE env var (lead | coordinator | builder | merger | …)
 *   3. $OVERSTORY_AGENT_NAME inspected for substring 'lead'/'coordinator'
 *   4. Fall back to checking if process cwd contains
 *      `.overstory/claude-profiles/<role>/` and use that role.
 *   5. Default: builder (the safest default — blocks).
 */

const fs = require('node:fs');
const path = require('node:path');

const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const FLOWS_DIR_REL = path.join('.overstory', 'runtime-contract.flows');
const FLOWS_DIR_ABS = path.join(PROJECT_DIR, FLOWS_DIR_REL);

const OWNER_CAPABILITIES = new Set(['lead', 'coordinate', 'coordinator']);

function allow() {
  process.exit(0);
}

function block(reason) {
  process.stdout.write(JSON.stringify({ decision: 'block', reason }));
  process.exit(0);
}

function readStdinSync() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function detectRole() {
  const cap = (process.env.OVERSTORY_AGENT_CAPABILITY || '').toLowerCase();
  if (cap) return cap;
  const profile = (process.env.CLAUDE_PROFILE || '').toLowerCase();
  if (profile) return profile;
  const name = (process.env.OVERSTORY_AGENT_NAME || '').toLowerCase();
  if (/(^|[^a-z])(lead)([^a-z]|$)/.test(name)) return 'lead';
  if (/(^|[^a-z])(coord(inator)?)([^a-z]|$)/.test(name)) return 'coordinator';
  // Inspect cwd for profile path segment.
  const cwd = (process.cwd() || '').toLowerCase();
  const m = cwd.match(/\.overstory[\/\\]claude-profiles[\/\\]([a-z]+)/);
  if (m) return m[1];
  return 'builder';
}

function isOwner() {
  return OWNER_CAPABILITIES.has(detectRole());
}

function extractFilePath(parsed) {
  const params = parsed.tool_input || parsed.params || parsed.parameters || {};
  return (
    params.file_path ||
    params.path ||
    params.notebook_path ||
    null
  );
}

function isUnderFlowsDir(filePath) {
  if (!filePath) return false;
  const absInput = path.isAbsolute(filePath)
    ? filePath
    : path.join(PROJECT_DIR, filePath);
  const normalized = path.normalize(absInput);
  const normalizedFlows = path.normalize(FLOWS_DIR_ABS);
  return (
    normalized === normalizedFlows ||
    normalized.startsWith(normalizedFlows + path.sep)
  );
}

function main() {
  const input = readStdinSync();
  if (!input) allow();
  let parsed;
  try {
    parsed = JSON.parse(input.trim());
  } catch {
    allow();
  }
  const tool = parsed.tool_name || parsed.tool || '';
  if (!['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(tool)) {
    allow();
  }
  const filePath = extractFilePath(parsed);
  if (!isUnderFlowsDir(filePath)) allow();
  if (isOwner()) allow();

  block(
    'FLOW_OWNERSHIP_VIOLATION: writes to .overstory/runtime-contract.flows/ ' +
      `are restricted to lead and coordinator roles. Detected role: ${detectRole()}. ` +
      'If you are a builder/merger and need a flow added or changed, mail the ' +
      "lead with `--type flow_mismatch` describing the endpoint shape (verb, " +
      'path, body, expected status). The lead invokes task-flow-authoring to ' +
      'edit the file, then replies `--type flow_update`. The pre-close-gate ' +
      'will keep your worker_done from being sent until the lead answers.',
  );
}

main();
