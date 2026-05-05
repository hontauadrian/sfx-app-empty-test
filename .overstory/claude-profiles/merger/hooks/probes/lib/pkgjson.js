'use strict';

const fs = require('fs');
const path = require('path');

// Monorepo-aware package.json walker.
// Spec: plan 02 §1 — lib/pkgjson.js.

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (readErr) {
    void readErr;
    return null;
  }
}

function readRootPkg(root) {
  const pkgPath = path.join(root, 'package.json');
  return readJsonSafe(pkgPath) || {};
}

function listWorkspaceDirs(root) {
  const pkg = readRootPkg(root);
  const patterns = [];
  if (Array.isArray(pkg.workspaces)) {
    patterns.push(...pkg.workspaces);
  } else if (pkg.workspaces && Array.isArray(pkg.workspaces.packages)) {
    patterns.push(...pkg.workspaces.packages);
  }
  // pnpm-workspace.yaml
  const pnpmFile = path.join(root, 'pnpm-workspace.yaml');
  if (fs.existsSync(pnpmFile)) {
    try {
      const text = fs.readFileSync(pnpmFile, 'utf8');
      for (const line of text.split(/\r?\n/)) {
        const match = line.match(/^\s*-\s*['"]?([^'"\s]+)['"]?\s*$/);
        if (match) patterns.push(match[1]);
      }
    } catch (readErr) {
      void readErr;
    }
  }

  const dirs = new Set();
  for (const pattern of patterns) {
    const match = pattern.match(/^(.+)\/\*+$/);
    if (match) {
      const base = path.join(root, match[1]);
      if (fs.existsSync(base) && fs.statSync(base).isDirectory()) {
        for (const entry of fs.readdirSync(base)) {
          const child = path.join(base, entry);
          if (fs.statSync(child).isDirectory() && fs.existsSync(path.join(child, 'package.json'))) {
            dirs.add(child);
          }
        }
      }
      continue;
    }
    const direct = path.join(root, pattern);
    if (fs.existsSync(direct) && fs.statSync(direct).isDirectory()) {
      dirs.add(direct);
    }
  }
  return Array.from(dirs);
}

function readAllPackages(root) {
  const packages = [];
  const rootPkg = readRootPkg(root);
  packages.push({ dir: root, pkg: rootPkg });
  for (const workspaceDir of listWorkspaceDirs(root)) {
    const pkg = readJsonSafe(path.join(workspaceDir, 'package.json'));
    if (pkg) packages.push({ dir: workspaceDir, pkg });
  }
  return packages;
}

function aggregateDeps(packages) {
  const aggregated = {};
  for (const entry of packages) {
    Object.assign(aggregated, entry.pkg.dependencies || {}, entry.pkg.devDependencies || {});
  }
  return aggregated;
}

module.exports = {
  readJsonSafe,
  readRootPkg,
  readAllPackages,
  aggregateDeps,
  listWorkspaceDirs,
};
