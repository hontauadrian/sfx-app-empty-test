#!/usr/bin/env node
// PostToolUse:Bash — detect probe failures, map to skills via INVOKE
// WHEN bullets, mark those skills as required-before-backend-edit.
//
// Generic: reads every SKILL.md under `.claude/skills/` and (if running
// inside a Claude profile) `<profile>/skills/`, parses lines after
// "INVOKE WHEN" bullets, and uses each line as a substring matcher
// against the Bash tool output. No hardcoded project knowledge.
const fs = require('fs');
const path = require('path');

let input = {};
try { input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch {}
if (input.tool_name !== 'Bash') process.exit(0);

const stdout = String(input.tool_response?.stdout || '');
const stderr = String(input.tool_response?.stderr || '');
const outputBlob = stdout + '\n' + stderr;
if (!outputBlob.trim()) process.exit(0);

const projectRoot = process.env.HOOK_PROJECT_ROOT || process.cwd();

function findSkillDirs() {
  const dirs = [];
  const candidates = [path.join(projectRoot, '.claude', 'skills')];
  const profileSkills = path.resolve(__dirname, '..', 'skills');
  if (fs.existsSync(profileSkills)) candidates.push(profileSkills);
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    for (const name of fs.readdirSync(candidate)) {
      const skillFile = path.join(candidate, name, 'SKILL.md');
      if (fs.existsSync(skillFile)) dirs.push({ name, file: skillFile });
    }
  }
  return dirs;
}

function extractInvokeWhen(skillFile) {
  const text = fs.readFileSync(skillFile, 'utf8');
  const lines = text.split('\n');
  const triggers = [];
  let inBlock = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (/^INVOKE WHEN(?:EVER)?\s*[:.]?\s*$/i.test(line)) {
      inBlock = true;
      continue;
    }
    if (inBlock) {
      if (!line) { if (triggers.length > 0) inBlock = false; continue; }
      if (/^[A-Z][A-Z ]+:\s*$/.test(line) || /^#{1,6}\s/.test(line)) { inBlock = false; continue; }
      const bulletMatch = line.match(/^[-*]\s+(.*)/);
      if (!bulletMatch) continue;
      const body = bulletMatch[1];
      const ticks = [...body.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
      const fallback = body.replace(/[*_`]/g, '').replace(/[,.;]+$/, '').trim();
      if (ticks.length) triggers.push(...ticks);
      else if (fallback.length >= 6 && fallback.length <= 80) triggers.push(fallback);
    }
  }
  return triggers;
}

const skills = findSkillDirs();
const matched = new Set();
for (const skill of skills) {
  let triggers = [];
  try { triggers = extractInvokeWhen(skill.file); } catch { continue; }
  for (const trigger of triggers) {
    if (!trigger || trigger.length < 4) continue;
    if (outputBlob.includes(trigger)) {
      matched.add(skill.name);
      break;
    }
  }
}

if (matched.size === 0) process.exit(0);

const stateDir = path.join(projectRoot, '.overstory', 'state', 'skill-gate');
fs.mkdirSync(stateDir, { recursive: true });
const requiredPath = path.join(stateDir, 'required.json');
let required = {};
try { required = JSON.parse(fs.readFileSync(requiredPath, 'utf8')); } catch {}
const ts = new Date().toISOString();
for (const name of matched) {
  required[name] = { ts, reason: 'probe failure detected in Bash output' };
}
fs.writeFileSync(requiredPath, JSON.stringify(required, null, 2));
process.exit(0);
