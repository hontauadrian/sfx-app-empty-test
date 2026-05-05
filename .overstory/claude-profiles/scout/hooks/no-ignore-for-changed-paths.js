#!/usr/bin/env node
/**
 * Plan 07 defense-in-depth — Stop hook.
 *
 * Reads .runtime-contract.overlay.json and .claude/hooks/.matrix.json.
 * For each overlay.ignore[].path, glob-match against matrix endpoints + pages.
 * Any match → block OVERLAY_IGNORE_COVERS_MATRIX_PATH.
 *
 * Belt-and-suspenders duplicate of contract-merge's check — fires at Stop
 * time even if contract-merge wasn't invoked.
 *
 * Contract:
 *   - Stop hook (no stdin payload required, but reads it gracefully)
 *   - Allow: exit 0, no stdout.
 *   - Block: exit 0, stdout = {"decision":"block","reason":"..."}
 */

const fs = require('node:fs');
const path = require('node:path');

/**
 * Minimal glob matcher supporting *, ?, and ** (recursive wildcard).
 * Pure Node stdlib — no minimatch dependency.
 */
function globToRegex(pattern) {
  let result = '^';
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === '*') {
      if (pattern[i + 1] === '*') {
        // ** matches anything including /
        if (pattern[i + 2] === '/') {
          result += '(?:.*/)?';
          i += 3;
        } else {
          result += '.*';
          i += 2;
        }
      } else {
        // * matches anything except /
        result += '[^/]*';
        i++;
      }
    } else if (ch === '?') {
      result += '[^/]';
      i++;
    } else if ('.+^${}()|[]\\'.includes(ch)) {
      result += '\\' + ch;
      i++;
    } else {
      result += ch;
      i++;
    }
  }
  result += '$';
  return new RegExp(result);
}

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function collectMatrixPaths(matrix) {
  const paths = new Set();
  if (Array.isArray(matrix?.apiEndpoints)) {
    for (const ep of matrix.apiEndpoints) {
      if (typeof ep?.path === 'string') paths.add(ep.path);
    }
  }
  if (Array.isArray(matrix?.pages)) {
    for (const page of matrix.pages) {
      if (typeof page?.route === 'string') paths.add(page.route);
    }
  }
  return paths;
}

function collectIgnorePatterns(overlay) {
  const patterns = [];
  if (Array.isArray(overlay?.ignore)) {
    for (const entry of overlay.ignore) {
      if (typeof entry?.path === 'string') {
        patterns.push(entry.path);
      } else if (typeof entry === 'string') {
        patterns.push(entry);
      }
    }
  }
  return patterns;
}

function findOffendingPaths(ignorePatterns, matrixPaths) {
  const offending = [];
  for (const pattern of ignorePatterns) {
    const regex = globToRegex(pattern);
    for (const mpath of matrixPaths) {
      if (regex.test(mpath)) {
        offending.push({ pattern, matchedPath: mpath });
      }
    }
  }
  return offending;
}

function runGuard({ stdinRaw, cwd } = {}) {
  try {
    const projectDir = cwd || process.env.CLAUDE_PROJECT_DIR || process.env.PROJECT_ROOT || process.cwd();

    const overlayPath = path.join(projectDir, '.runtime-contract.overlay.json');
    const matrixPath = path.join(projectDir, '.claude', 'hooks', '.matrix.json');

    const overlay = readJsonSafe(overlayPath);
    const matrix = readJsonSafe(matrixPath);

    // If either file is missing, nothing to check — pass
    if (!overlay || !matrix) return { allow: true };

    const matrixPaths = collectMatrixPaths(matrix);
    if (matrixPaths.size === 0) return { allow: true };

    const ignorePatterns = collectIgnorePatterns(overlay);
    if (ignorePatterns.length === 0) return { allow: true };

    const offending = findOffendingPaths(ignorePatterns, matrixPaths);
    if (offending.length === 0) return { allow: true };

    const details = offending
      .map((o) => `  ignore "${o.pattern}" matches matrix path "${o.matchedPath}"`)
      .join('\n');

    return {
      allow: false,
      decision: 'block',
      reason:
        `OVERLAY_IGNORE_COVERS_MATRIX_PATH: overlay ignore patterns match active ` +
        `matrix paths. This means real endpoints/pages would be skipped by the ` +
        `runtime probe. Remove or narrow the ignore entries, or remove the ` +
        `endpoints from the matrix.\n\nOffending entries:\n${details}`,
    };
  } catch {
    return { allow: true };
  }
}

function readStdinSafe() {
  try {
    if (process.stdin.isTTY) return '';
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function mainCli() {
  const cwd = process.env.CLAUDE_PROJECT_DIR || process.env.PROJECT_ROOT || process.cwd();
  // Consume stdin even though Stop hooks may not send meaningful payloads
  readStdinSafe();
  const result = runGuard({ cwd });
  if (result.allow) {
    process.exit(0);
  }
  process.stdout.write(JSON.stringify({ decision: result.decision, reason: result.reason }));
  process.exit(0);
}

if (require.main === module) {
  mainCli();
}

module.exports = { runGuard, globToRegex, findOffendingPaths, collectMatrixPaths, collectIgnorePatterns };
