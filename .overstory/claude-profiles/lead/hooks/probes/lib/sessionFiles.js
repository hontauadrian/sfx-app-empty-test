'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

// Reads the tmp session file written by track-session-files.js.
// Returns an array of absolute file paths; empty array when absent.
// Spec: plan 02 §3.
function readSessionFiles(projectDir, override, diag) {
  const tmpPath = override || path.join(
    os.tmpdir(),
    `claude-session-files-${Buffer.from(projectDir).toString('base64url')}.json`
  );
  if (!fs.existsSync(tmpPath)) {
    diag.warn(`session file absent: ${tmpPath}`);
    return [];
  }
  try {
    const raw = fs.readFileSync(tmpPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.files)) {
      diag.warn(`session file has no files array: ${tmpPath}`);
      return [];
    }
    return parsed.files.filter((candidate) => typeof candidate === 'string');
  } catch (parseError) {
    diag.warn(`session file parse failed: ${parseError.message}`);
    return [];
  }
}

module.exports = { readSessionFiles };
