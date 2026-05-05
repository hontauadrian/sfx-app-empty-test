'use strict';

const path = require('path');
const fs = require('fs');

const { readFileSafe } = require('../lib/fsutil');
const { normalizeToken } = require('../lib/normalize');

// Extract heading/aria-label/data-testid tokens from a page file.
// Spec: plan 02 §1 (tokens detector), §9 (fixture expectations).
function extractTokens(root, relFile, diag) {
  const absPath = path.isAbsolute(relFile) ? relFile : path.join(root, relFile);
  if (!fs.existsSync(absPath)) return [];
  const source = readFileSafe(absPath);
  if (!source) return [];

  const tokens = new Set();
  const add = (value) => {
    const normalized = normalizeToken(value);
    if (normalized && normalized.length <= 120) tokens.add(normalized);
  };

  const heading = /<h[1-6][^>]*>([^<]+)<\/h[1-6]>/gi;
  let match = heading.exec(source);
  while (match) {
    add(match[1]);
    match = heading.exec(source);
  }

  const placeholder = /placeholder\s*=\s*["'`]([^"'`]+)["'`]/gi;
  match = placeholder.exec(source);
  while (match) {
    add(match[1]);
    match = placeholder.exec(source);
  }

  const label = /<label[^>]*>([^<]+)<\/label>/gi;
  match = label.exec(source);
  while (match) {
    add(match[1]);
    match = label.exec(source);
  }

  const ariaLabel = /aria-label\s*=\s*["'`]([^"'`]+)["'`]/gi;
  match = ariaLabel.exec(source);
  while (match) {
    add(match[1]);
    match = ariaLabel.exec(source);
  }

  const dataTestId = /data-testid\s*=\s*["'`]([^"'`]+)["'`]/gi;
  match = dataTestId.exec(source);
  while (match) {
    add(match[1]);
    match = dataTestId.exec(source);
  }

  const buttonText = />([^<>{}]{3,80})<\/button>/gi;
  match = buttonText.exec(source);
  while (match) {
    add(match[1]);
    match = buttonText.exec(source);
  }

  return Array.from(tokens);
}

module.exports = { extractTokens };
