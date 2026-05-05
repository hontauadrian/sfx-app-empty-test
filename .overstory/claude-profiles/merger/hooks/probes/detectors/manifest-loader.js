'use strict';

const fs = require('fs');
const path = require('path');

// Loads compiled runtime contract + overlay (plan 05 output).
// Spec: plan 02 §5.

function loadFirstJson(candidates, diag) {
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(candidate, 'utf8'));
      parsed.__sourcePath = candidate;
      return parsed;
    } catch (parseErr) {
      diag.warn(`manifest parse failed for ${candidate}: ${parseErr.message}`);
    }
  }
  return null;
}

function loadManifest(root, diag) {
  const compiledCandidates = [
    path.join(root, '.claude/hooks/.runtime-contract.compiled.json'),
    path.join(root, 'runtime-contract.compiled.json'),
  ];
  const overlayCandidates = [
    path.join(root, '.runtime-contract.overlay.json'),
    path.join(root, 'docs/runtime-contract.overlay.json'),
  ];

  const compiled = loadFirstJson(compiledCandidates, diag);
  const overlay = loadFirstJson(overlayCandidates, diag);

  if (compiled) diag.info(`manifest compiled loaded: ${compiled.__sourcePath}`);
  if (overlay) diag.info(`manifest overlay loaded: ${overlay.__sourcePath}`);

  return { compiled, overlay };
}

module.exports = { loadManifest };
