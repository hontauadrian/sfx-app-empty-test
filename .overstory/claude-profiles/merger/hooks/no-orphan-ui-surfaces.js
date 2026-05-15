#!/usr/bin/env node
// PreToolUse hook for Bash. Blocks `ov mail send --type worker_done`
// and `sd close` when an exported UI component / page / modal in
// apps/web/src/features/**/presentation/** is not reachable from any
// non-test source file.
//
// Strategy: for each .tsx file under apps/web/src/features/**/presentation/,
// extract its exported value names (PascalCase functions/consts/classes),
// then grep apps/web/src for `import .*<Name>` in NON-test files outside
// the file itself. If zero non-test importers → orphan.
//
// This does NOT rely on knip — we walk the actual import graph via grep
// so test imports, renamed imports, and barrel cascades all behave correctly.

const { execSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const HOOK_PAYLOAD_RAW = fs.readFileSync(0, 'utf8');
let payload = {};
try { payload = JSON.parse(HOOK_PAYLOAD_RAW); } catch { process.exit(0); }

const toolName = payload.tool_name || '';
const toolInput = payload.tool_input || {};
if (toolName !== 'Bash') process.exit(0);

const command = String(toolInput.command || '');
const isWorkerDone = /\bov\s+mail\s+send\b/.test(command) && /--type\s+worker_done\b/.test(command);
const isSdClose = /\bsd\s+close\b/.test(command);
if (!isWorkerDone && !isSdClose) process.exit(0);

const repoRoot = process.cwd();

const SURFACE_SCOPES = [
  'apps/web/src/features',
];
const SURFACE_DIR_PATTERN = /\/presentation\/(components|pages|modals|drawers|forms|layouts)\//;

// Find every .tsx file under a presentation UI dir (excluding tests).
function findSurfaceFiles() {
  const out = [];
  for (const scope of SURFACE_SCOPES) {
    const abs = path.join(repoRoot, scope);
    if (!fs.existsSync(abs)) continue;
    walk(abs, (filePath) => {
      const rel = path.relative(repoRoot, filePath);
      if (!filePath.endsWith('.tsx')) return;
      if (!SURFACE_DIR_PATTERN.test('/' + rel)) return;
      if (/__tests__|__integration__|\.test\.|\.spec\./.test(rel)) return;
      out.push(rel);
    });
  }
  return out;
}

function walk(dir, cb) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return; }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, cb);
    else cb(full);
  }
}

// Extract exported PascalCase value names from a file.
function readExportNames(filePath) {
  const abs = path.join(repoRoot, filePath);
  let src;
  try { src = fs.readFileSync(abs, 'utf8'); }
  catch { return []; }
  const names = new Set();

  // export function X / export const X / export class X
  for (const m of src.matchAll(/export\s+(?:default\s+)?(?:function|const|class)\s+([A-Z]\w*)/g)) {
    names.add(m[1]);
  }
  // export { X, Y as Z }
  for (const m of src.matchAll(/export\s*\{\s*([^}]+)\}/g)) {
    m[1].split(',').forEach(part => {
      const name = part.trim().split(/\s+as\s+/)[0].trim();
      if (/^[A-Z]\w*$/.test(name)) names.add(name);
    });
  }
  // export default function (anonymous) — fall back to filename
  if (/export\s+default\s+function\s*\(/.test(src)) {
    const base = path.basename(filePath, '.tsx');
    if (/^[A-Z]/.test(base)) names.add(base);
  }
  // export default <Name> bare ref
  for (const m of src.matchAll(/export\s+default\s+([A-Z]\w*)/g)) {
    names.add(m[1]);
  }
  return [...names];
}

// Does this surface file have any non-test importer (outside itself)?
function hasUserReachableImporter(filePath, names) {
  if (names.length === 0) return false;
  // Build a single grep pattern: each name as a whole-word match.
  const pat = names.map(n => `\\b${n}\\b`).join('|');
  let result = '';
  try {
    // grep returns code 1 with no match (which triggers throw); we swallow
    // and check the captured stdout.
    result = execSync(
      `grep -rlE --include='*.tsx' --include='*.ts' "import .*(${pat})|from .*(${pat})" apps/web/src 2>/dev/null || true`,
      { cwd: repoRoot, encoding: 'utf8' }
    );
  } catch { /* no matches */ }
  const importers = result.split('\n')
    .map(s => s.trim())
    .filter(Boolean)
    .filter(p => !/__tests__|__integration__|\.test\.|\.spec\./.test(p))
    .filter(p => p !== filePath);
  if (importers.length === 0) return false;
  // Cascade: if all importers are themselves orphan barrels (no real
  // consumer beyond tests), this file is transitively orphan. To detect,
  // recursively check each importer — but bound depth to avoid loops.
  return true;
}

// Cascade-resolve. For each surface file, mark orphan if no chain of
// non-test importers reaches a real entry point (app router page, layout,
// middleware). We approximate "real entry" as: any importer outside
// `apps/web/src/features/` (e.g. files under `apps/web/src/app/`).
// If a surface file's only importers are themselves in features/, walk
// up and check theirs — if the whole chain stays inside features/, no
// entry point reached → orphan.
const surfaceCache = new Map(); // filePath -> boolean (reachable?)

function getImporters(filePath) {
  const abs = path.join(repoRoot, filePath);
  let src;
  try { src = fs.readFileSync(abs, 'utf8'); } catch { return []; }

  // A "barrel" file re-exports from other modules (`export ... from '...'`).
  // To detect who imports the barrel, we must search for the BARREL'S OWN
  // module specifier (parent directory name for index files, or the file
  // basename for non-index files), NOT the names it re-exports — those
  // are typically also reachable via direct paths that bypass the barrel.
  const isReExport = /export\s*(?:\*|\{[^}]+\})\s+from\s+['"]/.test(src);
  const isIndex = /^index\.(ts|tsx)$/.test(path.basename(filePath));

  let pattern;
  if (isReExport && isIndex) {
    // Barrel index file — look for imports of the parent directory.
    const parentDir = path.basename(path.dirname(filePath));
    pattern = `(import|from)\\s*[({\\s].*["'][^"']*[/]${parentDir}["']`;
  } else {
    // Regular file (component, page, etc.) or non-index re-export.
    const names = readExportNames(filePath);
    if (names.length === 0) return [];
    const namePat = names.map(n => `\\b${n}\\b`).join('|');
    const baseNoExt = path.basename(filePath).replace(/\.(tsx|ts)$/, '');
    const namePart = `(import|from)\\s*[({\\s].*(${namePat})`;
    const pathPart = `["'][^"']*[/]${baseNoExt}["']`;
    pattern = `${namePart}|${pathPart}`;
  }

  const res = spawnSync(
    'grep',
    ['-rlE', '--include=*.tsx', '--include=*.ts', pattern, 'apps/web/src'],
    { cwd: repoRoot, encoding: 'utf8' }
  );
  return (res.stdout || '').split('\n')
    .map(s => s.trim())
    .filter(Boolean)
    .filter(p => !/__tests__|__integration__|\.test\.|\.spec\./.test(p))
    .filter(p => p !== filePath);
}

function isReachableFromEntry(filePath, visited = new Set()) {
  if (surfaceCache.has(filePath)) return surfaceCache.get(filePath);
  if (visited.has(filePath)) return false;
  visited.add(filePath);

  const importers = getImporters(filePath);

  if (importers.length === 0) {
    surfaceCache.set(filePath, false);
    return false;
  }

  // Any importer OUTSIDE features/ counts as a real entry point reach.
  const realEntry = importers.find(p => !p.startsWith('apps/web/src/features/'));
  if (realEntry) {
    surfaceCache.set(filePath, true);
    return true;
  }

  // All importers are inside features/. Recurse to check if any of them
  // is reachable from a real entry.
  for (const upstream of importers) {
    if (isReachableFromEntry(upstream, visited)) {
      surfaceCache.set(filePath, true);
      return true;
    }
  }

  surfaceCache.set(filePath, false);
  return false;
}

const surfaces = findSurfaceFiles();
const orphans = [];
for (const surface of surfaces) {
  if (!isReachableFromEntry(surface)) {
    orphans.push(surface);
  }
}

if (orphans.length === 0) process.exit(0);

orphans.sort();

const lines = [];
lines.push('━'.repeat(72));
lines.push('BLOCKED: orphan UI surfaces detected.');
lines.push(`Rejected command: ${command.slice(0, 200)}${command.length > 200 ? '…' : ''}`);
lines.push('━'.repeat(72));
lines.push('');
lines.push('These component / page / modal files are not reachable from any user');
lines.push('entry point. Either the file has zero non-test importers anywhere,');
lines.push('or its only importers are themselves orphan (e.g. a barrel that no');
lines.push('parent imports). Users cannot reach these surfaces — the feature');
lines.push('exists in the codebase but is functionally dead.');
lines.push('');
lines.push('Orphan UI surfaces:');
orphans.forEach(f => lines.push(`  - ${f}`));
lines.push('');
lines.push('To clear the gate, for each entry above choose one:');
lines.push('  1. Wire the surface — mount the component from a real page/layout,');
lines.push('     open it from a button, register it under a route. The user must');
lines.push('     be able to reach it through normal navigation.');
lines.push('  2. Remove the file. If you wrote it but the design no longer needs');
lines.push('     it, delete it now. There is no legitimate "staged for a later');
lines.push('     chunk" case — a component with no consumer is a contract');
lines.push('     violation, not a deferrable polish item.');
lines.push('');
lines.push('Never bypass with a stub render — the qa-test SKILL will catch a');
lines.push('component that is mounted but never reachable through real user');
lines.push('navigation from the entry point.');

const denial = {
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'deny',
    permissionDecisionReason: lines.join('\n'),
  },
};

console.log(JSON.stringify(denial));
process.exit(0);
