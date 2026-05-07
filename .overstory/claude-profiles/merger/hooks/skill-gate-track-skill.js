#!/usr/bin/env node
// PostToolUse:Skill — record that a skill was invoked. Persists across
// compaction (state file on disk, not transcript-derived) so that after
// a compact the gate still knows the skill is loaded into context.
const fs = require('fs');
const path = require('path');

let input = {};
try { input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch {}

if (input.tool_name !== 'Skill') process.exit(0);
const skill = input.tool_input?.skill;
if (!skill) process.exit(0);

const root = process.env.HOOK_PROJECT_ROOT || process.cwd();
const stateDir = path.join(root, '.overstory', 'state', 'skill-gate');
fs.mkdirSync(stateDir, { recursive: true });

const usedPath = path.join(stateDir, 'used.json');
let used = {};
try { used = JSON.parse(fs.readFileSync(usedPath, 'utf8')); } catch {}
used[skill] = { ts: new Date().toISOString() };
fs.writeFileSync(usedPath, JSON.stringify(used, null, 2));
process.exit(0);
