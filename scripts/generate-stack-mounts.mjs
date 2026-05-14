#!/usr/bin/env node
/**
 * Generate a docker-compose overlay that bind-mounts every workspace
 * package's `dist/` into the api container, so a builder iterating on
 * a Zod schema or a domain interface can pick up the new code with
 * `pnpm --filter <pkg> build && pnpm stack:reload-api` instead of a
 * full image rebuild (which routinely costs 5+ minutes per cycle).
 *
 * Why structural, not heuristic:
 *   - Source of truth is `pnpm-workspace.yaml`. The generator never
 *     hard-codes package names. New packages added under a glob entry
 *     (e.g. `packages/*`) are picked up on the next stack:up with no
 *     code change anywhere.
 *   - For each resolved package directory, the generator includes the
 *     mount only if `package.json` declares a build output (a top-level
 *     `main` or `module` pointing into `dist/`). Packages that don't
 *     produce a dist (e.g. config-only or test-only sub-packages) are
 *     silently skipped.
 *   - apps/* are excluded by design: they ARE the running services,
 *     not consumed packages. Mounting an app dist over its own image
 *     contents would defeat the purpose of the image.
 *
 * Output:
 *   <project-root>/docker-compose.mounts.generated.yml — included in
 *   the compose overlay chain by scripts/stack-up-docker.sh. The file
 *   is regenerated every time stack:up runs and on `stack:reload-api`,
 *   so the mount list always matches the current workspace state.
 *
 * Exit codes:
 *   0 — file written (possibly empty mounts list, with a header note)
 *   1 — pnpm-workspace.yaml unreadable or malformed
 */
'use strict';

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { argv, cwd, exit, env } from 'node:process';

// `--list` mode emits `<pkg-name>:<dist-relpath>` per package on stdout
// and writes nothing else. stack-up-docker.sh consumes it to drive the
// "build shared packages" loop without hard-coding their names.
const listMode = argv.includes('--list');
const projectRoot = (() => {
  const positional = argv.slice(2).filter((a) => !a.startsWith('--'));
  return positional[0] ? resolve(positional[0]) : cwd();
})();
const workspaceFile = join(projectRoot, 'pnpm-workspace.yaml');
const outputFile = join(projectRoot, 'docker-compose.mounts.generated.yml');

if (!existsSync(workspaceFile)) {
  console.error(`[stack-mounts] ${workspaceFile} not found — cannot derive mount list`);
  exit(1);
}

// Minimal yaml parse for `packages: ["a", "b"]` shape. Workspace files
// in this codebase are tiny and deliberately stay in the simple shape
// that pnpm itself documents, so a hand-rolled extractor avoids the
// dependency on a parser package.
function parseWorkspacePatterns(text) {
  const lines = text.split(/\r?\n/);
  let inPackages = false;
  const out = [];
  for (const raw of lines) {
    const line = raw.replace(/#.*$/, ''); // strip comments
    if (/^\s*packages\s*:/.test(line)) {
      inPackages = true;
      // single-line array form `packages: ["a", "b"]`
      const inline = line.match(/\[(.*)\]/);
      if (inline) {
        for (const piece of inline[1].split(',')) {
          const stripped = piece.trim().replace(/^['"]|['"]$/g, '');
          if (stripped) out.push(stripped);
        }
        return out;
      }
      continue;
    }
    if (!inPackages) continue;
    // List item under packages:
    const item = line.match(/^\s*-\s*['"]?(.+?)['"]?\s*$/);
    if (item) {
      out.push(item[1]);
      continue;
    }
    // Stop on the next top-level key.
    if (/^[A-Za-z]/.test(line)) {
      inPackages = false;
    }
  }
  return out;
}

const workspaceText = readFileSync(workspaceFile, 'utf8');
const patterns = parseWorkspacePatterns(workspaceText);

if (patterns.length === 0) {
  console.error(`[stack-mounts] no patterns in ${workspaceFile}`);
  exit(1);
}

// Resolve glob entries against the filesystem. Only `<root>/*` (single
// star at the leaf) is supported — that matches every entry pnpm
// treats as a workspace root in practice. Anything fancier is left to
// the human who edited the workspace file; we don't attempt full glob
// semantics, just the documented common case.
const packageDirs = [];
for (const pattern of patterns) {
  const m = pattern.match(/^([^*]+)\/\*$/);
  if (!m) {
    // Literal path (no glob) — include it directly if it exists.
    if (existsSync(join(projectRoot, pattern))) {
      packageDirs.push(pattern);
    }
    continue;
  }
  const root = m[1];
  // Apps are excluded — they are running services, not consumed deps.
  // Without this guard, mounting `apps/api/dist` would override the
  // image's own compiled api with the host's, which would defeat the
  // whole point of the image.
  if (root === 'apps' || root.startsWith('apps/')) continue;
  const rootAbs = join(projectRoot, root);
  if (!existsSync(rootAbs)) continue;
  for (const entry of readdirSync(rootAbs, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.')) continue;
    packageDirs.push(`${root}/${entry.name}`);
  }
}

// For each package, decide whether it produces a dist. The signal is
// `package.json` declaring `main` or `module` under a `dist/` path.
// Packages that aren't libraries (e.g. integration test scaffolding)
// are skipped without ceremony.
const mounts = [];
const skipped = [];
for (const dir of packageDirs) {
  const pkgJsonPath = join(projectRoot, dir, 'package.json');
  if (!existsSync(pkgJsonPath)) {
    skipped.push(`${dir} (no package.json)`);
    continue;
  }
  let pkgJson;
  try {
    pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
  } catch (err) {
    skipped.push(`${dir} (package.json parse: ${err.message})`);
    continue;
  }
  const entry = pkgJson.main ?? pkgJson.module ?? '';
  if (!/^\.?\/?dist\//.test(entry) && entry !== 'dist/index.js' && !entry.startsWith('dist/')) {
    skipped.push(`${dir} (no dist/ entry in package.json main/module)`);
    continue;
  }
  mounts.push({ rel: `./${dir}/dist`, container: `/app/${dir}/dist`, name: pkgJson.name ?? dir });
}

// Path translation for docker-in-docker (agent running inside the
// panel container). The api container is a SIBLING managed by the
// host docker daemon; relative paths resolve against the *host*
// filesystem, not the panel container's `/workspace` view. Without
// this rewrite the bind source resolves to a non-existent host path
// and the api container starts with empty mounts (silently — docker
// just creates the missing dir).
//
// SFX_HOST_WORKSPACE_PATH is exported by the panel's
// docker-compose.override.yml when the panel runs in dev mode and
// holds the host-absolute path of the workspace volume. Outside the
// panel container it is undefined and we fall back to relative paths
// so a host operator running `pnpm stack:up` directly still gets the
// correct mounts via cwd resolution.
const hostWorkspace = env.SFX_HOST_WORKSPACE_PATH;
const isPanelContainer =
  (existsSync('/.dockerenv') || env.SFX_STACK_FORCE_PANEL_CONTAINER === '1') && hostWorkspace;
let hostBase;
if (isPanelContainer) {
  // Mirror the path computation that scripts/stack-up-docker.sh uses
  // for the existing OVERRIDE_FILE: a worktree under
  // .overstory/worktrees/<name> maps to
  // ${SFX_HOST_WORKSPACE_PATH}/.overstory/worktrees/<name>; running
  // at the workspace root itself maps straight to the host root.
  if (projectRoot === '/workspace') {
    hostBase = hostWorkspace;
  } else {
    hostBase = `${hostWorkspace}/.overstory/worktrees/${basename(projectRoot)}`;
  }
}

for (const m of mounts) {
  m.host = isPanelContainer
    ? `${hostBase}/${m.rel.replace(/^\.\//, '')}`
    : m.rel;
}

const header = [
  '# AUTO-GENERATED by scripts/generate-stack-mounts.mjs — do not edit.',
  '#',
  '# Bind-mounts host-built dist/ from every workspace package into the',
  '# api container so `pnpm stack:reload-api` propagates a fresh build',
  '# without rebuilding the docker image. Mount list is derived from',
  `# pnpm-workspace.yaml at ${new Date().toISOString()}.`,
  '#',
  `# Resolved ${mounts.length} package(s) with a dist/ entry; skipped ${skipped.length}.`,
];
for (const s of skipped) header.push(`#   skipped: ${s}`);

const lines = [
  ...header,
  'services:',
  '  api:',
];
if (mounts.length > 0) {
  lines.push('    volumes:');
  for (const m of mounts) {
    lines.push(`      - ${m.host}:${m.container}`);
  }
} else {
  lines.push('    # No workspace packages with dist/ entries detected.');
}
lines.push('');

if (listMode) {
  // <pkg-name>:<dist-relpath> per line, machine-consumed.
  for (const m of mounts) {
    process.stdout.write(`${m.name}:${m.rel.replace(/^\.\//, '')}\n`);
  }
} else {
  writeFileSync(outputFile, lines.join('\n'));
  console.error(`[stack-mounts] wrote ${outputFile} — ${mounts.length} package(s)`);
  for (const m of mounts) console.error(`[stack-mounts]   ${m.name} -> ${m.host}`);
}
