#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

let input;
try {
  input = JSON.parse(fs.readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

if (input?.tool_name !== 'Skill') {
  process.exit(0);
}

const skillName = input?.tool_input?.skill;
if (typeof skillName !== 'string' || !skillName) {
  process.exit(0);
}

const sessionId = input?.session_id || 'unknown';
const markerFile = path.join(os.tmpdir(), `skills-invoked-${sessionId}.json`);

let invoked = [];
try {
  invoked = JSON.parse(fs.readFileSync(markerFile, 'utf8'));
  if (!Array.isArray(invoked)) invoked = [];
} catch {
  invoked = [];
}

if (!invoked.includes(skillName)) {
  invoked.push(skillName);
  try {
    fs.writeFileSync(markerFile, JSON.stringify(invoked));
  } catch {
    // best-effort: failure to record is non-fatal
  }
}

process.exit(0);
