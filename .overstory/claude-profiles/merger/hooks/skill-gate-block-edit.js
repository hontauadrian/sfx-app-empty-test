#!/usr/bin/env node
// PreToolUse:Edit|Write|MultiEdit — block backend file edits if a probe
// failure earlier in the session marked a skill as required and that
// skill has not been invoked since the failure (state survives compact).
const fs = require('fs');
const path = require('path');

let input = {};
try { input = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8') || '{}'); } catch {}
const tool = input.tool_name;
if (!['Edit', 'Write', 'MultiEdit'].includes(tool)) process.exit(0);

const filePath = input.tool_input?.file_path || input.tool_input?.path || '';
if (!filePath) process.exit(0);

const projectRoot = process.env.HOOK_PROJECT_ROOT || process.cwd();
const rel = path.relative(projectRoot, filePath);

// Backend = NestJS app under apps/api/src/. Generic enough for any project
// that follows the apps/api/src layout. Override with HOOK_BACKEND_GLOB.
const backendPattern = process.env.HOOK_BACKEND_GLOB || 'apps/api/src/';
if (!rel.startsWith(backendPattern)) process.exit(0);

const stateDir = path.join(projectRoot, '.overstory', 'state', 'skill-gate');
const requiredPath = path.join(stateDir, 'required.json');
const usedPath = path.join(stateDir, 'used.json');

let required = {};
let used = {};
try { required = JSON.parse(fs.readFileSync(requiredPath, 'utf8')); } catch {}
try { used = JSON.parse(fs.readFileSync(usedPath, 'utf8')); } catch {}

const pending = [];
for (const [name, entry] of Object.entries(required)) {
  const requiredAt = entry?.ts;
  const usedAt = used[name]?.ts;
  if (!requiredAt) continue;
  if (!usedAt || usedAt < requiredAt) pending.push({ name, requiredAt });
}

if (pending.length === 0) process.exit(0);

const list = pending.map((entry) => `  - ${entry.name} (required since ${entry.requiredAt})`).join('\n');
const reason = `Probe failure earlier in this session requires invoking the listed skill before editing backend code:
${list}

Run: Skill <skill-name> for each entry above. State survives compact — re-invoke after compact too.
File: ${rel}`;

console.log(JSON.stringify({ decision: 'block', reason }));
process.exit(0);
