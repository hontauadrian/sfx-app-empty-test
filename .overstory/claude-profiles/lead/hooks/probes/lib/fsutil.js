'use strict';

const fs = require('fs');
const path = require('path');

// Lightweight glob + file utilities — no external deps.
// Spec: plan 02 §4 — detector globbing needs.

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.turbo', '.next', '.nuxt', '.svelte-kit',
  'dist', 'build', 'out', 'coverage', '.cache', '.vercel',
  '__tests__', '__fixtures__', '__mocks__', '.overstory',
]);

function walkFiles(root, options) {
  const { extensions, maxDepth = 20 } = options || {};
  const results = [];
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) return results;

  function descend(dir, depth) {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (readErr) {
      void readErr;
      return;
    }
    for (const entry of entries) {
      const name = entry.name;
      if (name.startsWith('.') && name !== '.' && name !== '..') {
        // allow specific hidden dirs if needed — skip by default
        if (SKIP_DIRS.has(name)) continue;
      }
      if (SKIP_DIRS.has(name)) continue;
      const full = path.join(dir, name);
      if (entry.isDirectory()) {
        descend(full, depth + 1);
      } else if (entry.isFile()) {
        if (!extensions || extensions.some((ext) => name.endsWith(ext))) {
          results.push(full);
        }
      }
    }
  }

  descend(root, 0);
  return results;
}

function hasFile(root, candidates) {
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(root, candidate))) return true;
  }
  return false;
}

function hasGlob(root, patternRelative) {
  // Very small subset of glob: supports `**` anywhere and literal segments.
  // Returns true if at least one file matches.
  const patternParts = patternRelative.split('/');
  return matchDir(root, patternParts);
}

function matchDir(dir, parts) {
  if (!fs.existsSync(dir)) return false;
  if (parts.length === 0) return false;
  const [head, ...rest] = parts;
  if (head === '**') {
    if (rest.length === 0) return true;
    if (matchDir(dir, rest)) return true;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return false; }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;
      if (entry.isDirectory()) {
        if (matchDir(path.join(dir, entry.name), parts)) return true;
      }
    }
    return false;
  }
  if (rest.length === 0) {
    // head is a filename glob (supports *.ext)
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return false; }
    const regex = globToRegExp(head);
    for (const entry of entries) {
      if (entry.isFile() && regex.test(entry.name)) return true;
    }
    return false;
  }
  const nextDir = path.join(dir, head);
  if (fs.existsSync(nextDir) && fs.statSync(nextDir).isDirectory()) {
    return matchDir(nextDir, rest);
  }
  // Try as wildcard (e.g. `apps/*`)
  if (head.includes('*')) {
    const regex = globToRegExp(head);
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return false; }
    for (const entry of entries) {
      if (entry.isDirectory() && regex.test(entry.name)) {
        if (matchDir(path.join(dir, entry.name), rest)) return true;
      }
    }
  }
  return false;
}

function globToRegExp(pattern) {
  let regex = '';
  for (const ch of pattern) {
    if (ch === '*') regex += '[^/]*';
    else if (ch === '?') regex += '.';
    else if (/[.+^${}()|[\]\\]/.test(ch)) regex += '\\' + ch;
    else regex += ch;
  }
  return new RegExp('^' + regex + '$');
}

function isExecutable(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function findDirs(root, predicate, maxDepth = 10) {
  const results = [];
  function descend(dir, depth) {
    if (depth > maxDepth) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (predicate(full, entry.name)) results.push(full);
      descend(full, depth + 1);
    }
  }
  descend(root, 0);
  return results;
}

function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (readErr) {
    void readErr;
    return null;
  }
}

module.exports = {
  walkFiles,
  hasFile,
  hasGlob,
  isExecutable,
  findDirs,
  readFileSafe,
  SKIP_DIRS,
};
