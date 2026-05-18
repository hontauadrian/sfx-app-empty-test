#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

let input = {};
try { input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch {}

const tool = input.tool_name;
if (!['Write', 'Edit', 'MultiEdit'].includes(tool)) process.exit(0);

const filePath = input.tool_input?.file_path || input.tool_input?.path || '';
if (!filePath) process.exit(0);

const root = process.env.HOOK_PROJECT_ROOT || process.cwd();
const rel = path.relative(root, filePath);

const SCOPES = [
  /^apps\/web\/src\/features\/.+\/presentation\/(components|pages|modals|drawers|forms|layouts)\/.+\.tsx$/,
  /^apps\/web\/src\/features\/presentation\/theme\/.+\.(ts|tsx|css)$/,
  /^apps\/web\/src\/app\/globals\.css$/,
  /^apps\/web\/tailwind\.config\.(ts|js|mjs|cjs)$/,
];
if (!SCOPES.some((rx) => rx.test(rel))) process.exit(0);

if (/__tests__|__integration__|\.test\.|\.spec\.|\.stories\./.test(rel)) process.exit(0);

const REQUIRED = ['ui-ux-pro-max', 'page-pattern'];

const usedPath = path.join(root, '.overstory', 'state', 'skill-gate', 'used.json');
let used = {};
try { used = JSON.parse(fs.readFileSync(usedPath, 'utf8')); } catch {}

const missing = REQUIRED.filter(s => !used[s]);
if (missing.length === 0) process.exit(0);

const lines = [];
lines.push('━'.repeat(72));
lines.push('BLOCKED: required design skill(s) not invoked in this session.');
lines.push(`Rejected ${tool} on: ${rel}`);
lines.push('━'.repeat(72));
lines.push('');
lines.push('UI surface files in apps/web/src/features/**/presentation/** must');
lines.push('be authored with the design + structure skills loaded into context.');
lines.push('Skipping them yields inconsistent palettes, sloppy spacing, missed');
lines.push('accessibility patterns, and ad-hoc file structure that diverges from');
lines.push('the rest of the codebase.');
lines.push('');
lines.push('Missing skills:');
missing.forEach(s => lines.push(`  - Skill(skill: "${s}")`));
lines.push('');
lines.push('Invoke each missing skill via the Skill tool BEFORE retrying this');
lines.push('write/edit. Skills can fire multiple times per turn; invoke them');
lines.push('all up front. Skill invocations persist across compaction via the');
lines.push('skill-gate state file, so you do not need to re-invoke after a');
lines.push('compact.');

console.log(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'deny',
    permissionDecisionReason: lines.join('\n'),
  },
}));
process.exit(0);
