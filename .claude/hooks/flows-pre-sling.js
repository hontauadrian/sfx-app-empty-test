#!/usr/bin/env node
/* eslint-disable */
'use strict';

/**
 * Pre-sling hook (Decision 9 extension).
 *
 * Fires PreToolUse on Bash. Detects `ov sling --task=<id>` invocations
 * coming FROM a coordinator/lead session (no OVERSTORY_TASK_ID env) and
 * blocks if the per-task flow file does not yet exist in main repo HEAD.
 *
 * Why: `ov sling` (sfx-overstory src/worktree/manager.ts) creates worker
 * worktrees from main HEAD at sling-time. If the lead hasn't authored
 * `.overstory/runtime-contract.flows/<task-id>.json` BEFORE running
 * sling, the builder forks without it and cannot pass the flow probe.
 *
 * Hook contract: PreToolUse — JSON on stdin, write
 * { decision: 'block', reason: '...' } to stdout to block, exit 0 silently
 * to allow.
 */

const fs = require('node:fs');
const path = require('node:path');

const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const FLOWS_DIR = path.join(PROJECT_DIR, '.overstory', 'runtime-contract.flows');

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

function parseToolInput(input) {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function getBashCommand(parsed) {
  if (!parsed) return '';
  const tool = parsed.tool_name || parsed.tool || '';
  if (tool !== 'Bash') return '';
  const params = parsed.tool_input || parsed.params || parsed.parameters || {};
  return String(params.command || '');
}

function extractTaskIdFromOvSling(cmd) {
  if (!/\bov\s+sling(?:\s|$)/.test(cmd)) return null;
  // Match --task=<id> or --task <id>. Task ids are lowercase alphanumeric +
  // dashes (per existing convention).
  const eq = cmd.match(/--task[=\s]+([a-z0-9-]+)/);
  return eq ? eq[1] : null;
}

function main() {
  // If this session is itself a builder (OVERSTORY_TASK_ID set), the lead
  // already pre-authored the flow file before slinging us. Skip.
  if (process.env.OVERSTORY_TASK_ID) {
    return allow();
  }
  const input = readStdinSync();
  const parsed = parseToolInput(input);
  const cmd = getBashCommand(parsed);
  if (!cmd) return allow();
  const taskId = extractTaskIdFromOvSling(cmd);
  if (!taskId) return allow();

  const flowFile = path.join(FLOWS_DIR, `${taskId}.json`);
  if (fs.existsSync(flowFile)) return allow();

  const reason = [
    'FLOW_PRE_SLING_MISSING:',
    `cannot dispatch builder for task ${taskId} — flow file`,
    `'.overstory/runtime-contract.flows/${taskId}.json' does not exist.`,
    'Author it first via the task-flow-authoring skill (or shared-flow-authoring',
    'if cross-task), commit, then retry sling.',
  ].join(' ');
  return block(reason);
}

main();
