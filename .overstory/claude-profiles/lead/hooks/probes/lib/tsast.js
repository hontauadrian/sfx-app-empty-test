'use strict';

// Tiny ts-aware helpers. This avoids a hard dependency on ts-morph — we use
// regex + structural scans that are sufficient for the plan-02 detectors.
// Spec: plan 02 §1 — lib/tsast.js (reuse probes/shared.ts helpers when present;
// here we intentionally stay dependency-free for the Stop-hook invocation path).

function findDecoratorArgs(source, decoratorName) {
  // Returns an array of raw-argument strings for each decoration site.
  const results = [];
  const regex = new RegExp('@' + decoratorName + '\\s*\\(([^)]*)\\)', 'g');
  let match = regex.exec(source);
  while (match) {
    results.push(match[1].trim());
    match = regex.exec(source);
  }
  return results;
}

function extractStringLiteral(text) {
  if (text === undefined || text === null) return null;
  const match = text.match(/^\s*['"`]([^'"`]*)['"`]\s*/);
  return match ? match[1] : null;
}

function matchAll(source, regex) {
  const out = [];
  let match = regex.exec(source);
  while (match) {
    out.push(match);
    match = regex.exec(source);
  }
  return out;
}

module.exports = { findDecoratorArgs, extractStringLiteral, matchAll };
