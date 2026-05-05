'use strict';

// Token normalization: lowercase, collapse whitespace, trim punctuation.
// Spec: plan 02 §1 — lib/normalize.js
function normalizeToken(value) {
  if (value === undefined || value === null) return '';
  return String(value)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^[\s.,:;!?'"`]+|[\s.,:;!?'"`]+$/g, '')
    .trim();
}

module.exports = { normalizeToken };
