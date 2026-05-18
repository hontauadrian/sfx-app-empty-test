#!/usr/bin/env node
const { spawnSync } = require('node:child_process');
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

const SURFACE_SCOPES = ['apps/web/src/features'];
const SURFACE_DIR_PATTERN = /\/presentation\/(components|pages|modals|drawers|forms|layouts)\//;

function walk(dir, cb) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, cb);
    else cb(full);
  }
}

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

function readExportNames(filePath) {
  const abs = path.join(repoRoot, filePath);
  let src;
  try { src = fs.readFileSync(abs, 'utf8'); } catch { return []; }
  const names = new Set();
  for (const m of src.matchAll(/export\s+(?:default\s+)?(?:function|const|class)\s+([A-Z]\w*)/g)) names.add(m[1]);
  for (const m of src.matchAll(/export\s*\{\s*([^}]+)\}/g)) {
    m[1].split(',').forEach(part => {
      const name = part.trim().split(/\s+as\s+/)[0].trim();
      if (/^[A-Z]\w*$/.test(name)) names.add(name);
    });
  }
  if (/export\s+default\s+function\s*\(/.test(src)) {
    const base = path.basename(filePath, '.tsx');
    if (/^[A-Z]/.test(base)) names.add(base);
  }
  for (const m of src.matchAll(/export\s+default\s+([A-Z]\w*)/g)) names.add(m[1]);
  return [...names];
}

function stripJsonComments(text) {
  let out = '';
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    const next = text[i + 1];
    if (c === '"') {
      const start = i;
      i++;
      while (i < n) {
        if (text[i] === '\\' && i + 1 < n) { i += 2; continue; }
        if (text[i] === '"') { i++; break; }
        i++;
      }
      out += text.slice(start, i);
      continue;
    }
    if (c === '/' && next === '/') {
      while (i < n && text[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && next === '*') {
      i += 2;
      while (i < n && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    out += c;
    i++;
  }
  return out.replace(/,(\s*[}\]])/g, '$1');
}

let internalPrefixesCache = null;
function getInternalPrefixes() {
  if (internalPrefixesCache) return internalPrefixesCache;
  const prefixes = new Set();

  const tsconfigs = [
    'apps/web/tsconfig.json',
    'tsconfig.base.json',
    'tsconfig.json',
  ];
  for (const tsc of tsconfigs) {
    const abs = path.join(repoRoot, tsc);
    if (!fs.existsSync(abs)) continue;
    try {
      const cfg = JSON.parse(stripJsonComments(fs.readFileSync(abs, 'utf8')));
      const paths = cfg?.compilerOptions?.paths || {};
      for (const key of Object.keys(paths)) {
        prefixes.add(key.replace(/\*$/, '').replace(/\/$/, ''));
      }
    } catch { /* skip */ }
  }

  const pkgPaths = ['package.json'];
  for (const root of ['apps', 'packages']) {
    const abs = path.join(repoRoot, root);
    if (!fs.existsSync(abs)) continue;
    for (const name of fs.readdirSync(abs)) {
      const p = path.join(root, name, 'package.json');
      if (fs.existsSync(path.join(repoRoot, p))) pkgPaths.push(p);
    }
  }
  for (const pkg of pkgPaths) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(repoRoot, pkg), 'utf8'));
      if (typeof data?.name === 'string' && data.name) prefixes.add(data.name);
    } catch { /* skip */ }
  }

  internalPrefixesCache = prefixes;
  return prefixes;
}

function isInternalImportPath(spec) {
  if (!spec) return false;
  if (spec.startsWith('.') || spec.startsWith('/')) return true;
  for (const prefix of getInternalPrefixes()) {
    if (spec === prefix || spec.startsWith(prefix + '/')) return true;
  }
  return false;
}

function fileImportsLocalReference(importerPath, exportNames, fileBaseNoExt, parentDirName) {
  const abs = path.join(repoRoot, importerPath);
  let src;
  try { src = fs.readFileSync(abs, 'utf8'); } catch { return false; }
  const specRe = /(?:from|import\s*\(?)\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = specRe.exec(src)) !== null) {
    const spec = m[1];
    if (!isInternalImportPath(spec)) continue;
    if (spec.endsWith('/' + fileBaseNoExt)) return true;
    if (spec.endsWith('/' + fileBaseNoExt + '/index')) return true;
    if (parentDirName && spec.endsWith('/' + parentDirName)) return true;
    const lineStart = src.lastIndexOf('\n', m.index) + 1;
    const lineEnd = src.indexOf('\n', m.index);
    const line = src.slice(lineStart, lineEnd === -1 ? src.length : lineEnd);
    for (const name of exportNames) {
      if (new RegExp(`\\b${name}\\b`).test(line)) return true;
    }
    const importStart = src.lastIndexOf('import', m.index);
    if (importStart !== -1 && m.index - importStart < 2000) {
      const block = src.slice(importStart, m.index);
      for (const name of exportNames) {
        if (new RegExp(`\\b${name}\\b`).test(block)) return true;
      }
    }
  }
  return false;
}

function getImporters(filePath) {
  const abs = path.join(repoRoot, filePath);
  let src;
  try { src = fs.readFileSync(abs, 'utf8'); } catch { return []; }

  const isReExport = /export\s*(?:\*|\{[^}]+\})\s+from\s+['"]/.test(src);
  const isIndex = /^index\.(ts|tsx)$/.test(path.basename(filePath));

  let pattern;
  let exportNames;
  let fileBaseNoExt;
  let parentDirName = null;

  if (isReExport && isIndex) {
    const parentDir = path.basename(path.dirname(filePath));
    const grandparentDir = path.basename(path.dirname(path.dirname(filePath)));
    pattern = `(import|from)\\s*[({\\s].*["'][^"']*\\b${grandparentDir}[/]${parentDir}["']`;
    exportNames = readExportNames(filePath);
    fileBaseNoExt = parentDir;
    parentDirName = parentDir;
  } else {
    exportNames = readExportNames(filePath);
    if (exportNames.length === 0) return [];
    const namePat = exportNames.map(n => `\\b${n}\\b`).join('|');
    fileBaseNoExt = path.basename(filePath).replace(/\.(tsx|ts)$/, '');
    const namePart = `(import|from)\\s*[({\\s].*(${namePat})`;
    const pathPart = `["'][^"']*[/]${fileBaseNoExt}["']`;
    pattern = `${namePart}|${pathPart}`;
    if (fileBaseNoExt === 'index') {
      parentDirName = path.basename(path.dirname(filePath));
    }
  }

  const res = spawnSync(
    'grep',
    ['-rlE', '--include=*.tsx', '--include=*.ts', pattern, 'apps/web/src'],
    { cwd: repoRoot, encoding: 'utf8' }
  );
  const candidates = (res.stdout || '').split('\n')
    .map(s => s.trim())
    .filter(Boolean)
    .filter(p => !/__tests__|__integration__|\.test\.|\.spec\./.test(p))
    .filter(p => p !== filePath);

  return candidates.filter((p) =>
    fileImportsLocalReference(p, exportNames, fileBaseNoExt, parentDirName)
  );
}

const surfaceCache = new Map();

function isReachableFromEntry(filePath, visited = new Set()) {
  if (surfaceCache.has(filePath)) return surfaceCache.get(filePath);
  if (visited.has(filePath)) return false;
  visited.add(filePath);

  const importers = getImporters(filePath);

  if (importers.length === 0) {
    surfaceCache.set(filePath, false);
    return false;
  }

  const realEntry = importers.find(p => !p.startsWith('apps/web/src/features/'));
  if (realEntry) {
    surfaceCache.set(filePath, true);
    return true;
  }

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
lines.push('entry point. The file is exported but no parent page, layout, route,');
lines.push('button, or sidebar entry mounts or opens it. From the running app a');
lines.push('user has no navigation flow that leads to this surface — the feature');
lines.push('exists in code but is functionally dead.');
lines.push('');
lines.push('Orphan UI surfaces:');
orphans.forEach(f => lines.push(`  - ${f}`));
lines.push('');
lines.push('Wiring the component is not enough — verify the WHOLE FLOW WORKS.');
lines.push('');
lines.push('Static reachability (code-level import) is the floor, not the goal.');
lines.push('Before clearing this gate, for each orphan answer EVERY question:');
lines.push('');
lines.push('  a) What does this component DO? (read its props, its calls)');
lines.push('  b) Which user need does it satisfy? (which step of which flow)');
lines.push('  c) From the login surface, which exact clicks reach the page that');
lines.push('     mounts this surface? Walk the route, the link, the button. If');
lines.push('     the parent page is itself unreachable or broken (404, blank,');
lines.push('     infinite skeleton), wiring this surface there is pointless.');
lines.push('  d) After this surface acts (submits, creates, deletes), where does');
lines.push('     the resulting state show up? Created entities must appear in a');
lines.push('     list, detail page, sidebar, or nav reachable to the same user.');
lines.push('     Creating a project users cannot then SEE or OPEN is broken.');
lines.push('  e) Does the wiring make sense in domain terms? A "Create Project"');
lines.push('     button on a Profile page is wired but nonsensical — the user');
lines.push('     flow has to be coherent.');
lines.push('');
lines.push('To clear the gate:');
lines.push('  1. Wire the surface in a contextually correct parent page where the');
lines.push('     domain action belongs. Verify the parent page itself renders for');
lines.push('     a real user via Playwright (navigate + snapshot + console).');
lines.push('  2. Verify the post-action destination exists and is reachable. If');
lines.push('     creating a Project lands on /projects/<id>, that route must');
lines.push('     render. If a list of created projects is expected, the list');
lines.push('     route must exist AND be linked from sidebar/nav.');
lines.push('  3. Run the full flow in qa-test: login → navigate → open this');
lines.push('     surface → submit → assert outcome → navigate back to verify');
lines.push('     the created entity is visible.');
lines.push('  4. OR remove the file if the design no longer needs it. There is');
lines.push('     no legitimate "staged for later chunk" case.');
lines.push('');
lines.push('Never bypass with a stub render or by wiring the surface to a random');
lines.push('parent just to clear the gate. The qa-test SKILL must execute the');
lines.push('full user flow that this surface participates in.');

console.log(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'deny',
    permissionDecisionReason: lines.join('\n'),
  },
}));
process.exit(0);
