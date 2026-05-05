#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// Flow files may only be authored by coordinator (workspace root) and
// lead (worktree). Worker capabilities (builder/merger/reviewer/scout)
// short-circuit so this hook is inert in their worktrees even though
// the file is present in the cloned tree.
const capability = process.env.OVERSTORY_AGENT_CAPABILITY || process.env.OVERSTORY_ROLE || '';
if (capability && capability !== 'coordinator' && capability !== 'lead') {
  process.exit(0);
}

let input;
try {
  input = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'));
} catch {
  process.exit(0);
}

const filePath = input?.tool_input?.file_path;
if (typeof filePath !== 'string' || !filePath) {
  process.exit(0);
}

const isFlowFile = /\/\.overstory\/runtime-contract\.flows\/[^/]+\.json$/.test(filePath);
if (!isFlowFile) {
  process.exit(0);
}

const isSharedFile = /\/_shared\.json$/.test(filePath);
const requiredSkill = isSharedFile ? 'shared-flow-authoring' : 'task-flow-authoring';

const sessionId = input?.session_id || 'unknown';
const markerFile = path.join(os.tmpdir(), `skills-invoked-${sessionId}.json`);

let invoked = [];
try {
  invoked = JSON.parse(fs.readFileSync(markerFile, 'utf8'));
  if (!Array.isArray(invoked)) invoked = [];
} catch {
  invoked = [];
}

if (invoked.includes(requiredSkill)) {
  process.exit(0);
}

const reason =
  `Flow files require the ${requiredSkill} skill before write/edit. ` +
  `The skill encodes the canonical schema shape (resources is an ARRAY of ` +
  `{name, create, capture}, parents is plural, no \`routes\` field). Files ` +
  `under .overstory/runtime-contract.flows/ written without the skill ` +
  `routinely use the wrong shape (object map, parent singular, kind:endpoint) ` +
  `and fail FLOW_FILE_SCHEMA_INVALID at probe time.\n\n` +
  `Action: invoke Skill(skill: "${requiredSkill}") first, then retry the ` +
  `${input?.tool_name || 'edit'} on ${filePath}.`;

console.log(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'deny',
    permissionDecisionReason: reason,
  },
}));

process.exit(0);
