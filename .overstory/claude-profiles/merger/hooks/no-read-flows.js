#!/usr/bin/env node
// PreToolUse:Read|Glob|Grep — block builder access to flow files.
//
// Builders waste large amounts of context reading
// `.overstory/runtime-contract.flows/*.json`. The files describe what the
// probe asserts, NOT what the builder must implement. Probe failures are
// reported in `.claude/hooks/.http-smoke.md` with `requestEcho` /
// `responseEcho` / `serverStack` / `bootstrapDiagnostics` — everything a
// builder needs to debug a failure is in that one file. Reading the
// upstream flow JSON gives no actionable information and costs hundreds
// of lines of context per file (multiple files in a typical session =
// thousands of tokens spent staring at JSON the builder cannot edit).
//
// The block fires for the builder/merger/scout/reviewer profiles. Lead
// and coordinator are the flow-file authors and need full read access;
// they are gated by `OVERSTORY_AGENT_CAPABILITY` instead of this hook
// being deployed at all (see hooks-deployer's per-capability filter).

const fs = require('node:fs');

let input = {};
try {
  input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
} catch {
  process.exit(0);
}

const tool = input.tool_name;
if (tool !== 'Read' && tool !== 'Glob' && tool !== 'Grep') process.exit(0);

const candidates = [];
const fp = input.tool_input?.file_path;
if (typeof fp === 'string') candidates.push(fp);
const pattern = input.tool_input?.pattern;
if (typeof pattern === 'string') candidates.push(pattern);
const path = input.tool_input?.path;
if (typeof path === 'string') candidates.push(path);

const FLOW_PATH = /\/\.overstory\/runtime-contract\.flows(\/|$)/;
const hits = candidates.some((c) => FLOW_PATH.test(c));
if (!hits) process.exit(0);

const reason = [
  `${tool} on .overstory/runtime-contract.flows/* is not allowed for `,
  `${process.env.OVERSTORY_AGENT_CAPABILITY || 'this capability'}.`,
  '',
  'Flow files are the probe contract — owned by lead/coordinator, derived',
  'from YOUR code surface (schemas, decorators, controllers). Reading them',
  'gives you no actionable information for your job and burns context.',
  '',
  'Probe failures are reported in `.claude/hooks/.http-smoke.md` with the',
  'exact requestEcho / responseEcho / serverStack / bootstrapDiagnostics',
  'inline. Read THAT file instead.',
  '',
  'If a flow appears wrong, mail `flow_mismatch` to your parent with the',
  "specific case label — DO NOT try to read the JSON to 'understand' it.",
].join('\n');

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'deny',
    permissionDecisionReason: reason,
  },
}) + '\n');
process.exit(0);
