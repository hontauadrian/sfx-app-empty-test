#!/usr/bin/env node
/**
 * Plan 07 defense-in-depth — Stop hook.
 *
 * Reads .claude/hooks/.smoke-report.json (probe output) and git diff.
 * For every endpoint in changed *.controller.ts files, asserts at least
 * one smoke-report case covers that METHOD + PATH.
 *
 * Contract:
 *   - Stop hook
 *   - Allow: exit 0, no stdout.
 *   - Block: exit 0, stdout = {"decision":"block","reason":"..."}
 */

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

/**
 * Parse NestJS decorators from controller file content.
 * Extracts @Controller('prefix') and @Get/@Post/@Put/@Patch/@Delete('path').
 */
function parseControllerEndpoints(content, filePath) {
  const endpoints = [];

  // Extract controller prefix
  const controllerMatch = content.match(/@Controller\(\s*['"]([^'"]*)['"]\s*\)/);
  const prefix = controllerMatch ? controllerMatch[1].replace(/^\//, '') : '';

  // Extract HTTP method decorators
  const methodRegex = /@(Get|Post|Put|Patch|Delete)\(\s*(?:['"]([^'"]*?)['"])?\s*\)/g;
  let match;
  while ((match = methodRegex.exec(content)) !== null) {
    const method = match[1].toUpperCase();
    const routePath = match[2] || '';
    const fullPath = '/' + [prefix, routePath].filter(Boolean).join('/');
    // Normalize double slashes
    const normalized = fullPath.replace(/\/+/g, '/');
    endpoints.push({ method, path: normalized, file: filePath });
  }

  return endpoints;
}

/**
 * Get changed controller files from git diff.
 */
function getChangedControllers(cwd) {
  try {
    // Try session base ref first, fall back to merge-base with main
    let baseRef;
    const baseRefPath = path.join(cwd, '.claude', 'hooks', '.session-base-ref');
    try {
      baseRef = fs.readFileSync(baseRefPath, 'utf8').trim();
    } catch {
      try {
        baseRef = execSync('git merge-base HEAD main', { cwd, encoding: 'utf8' }).trim();
      } catch {
        baseRef = 'HEAD~1';
      }
    }

    const diff = execSync(`git diff --name-only ${baseRef} HEAD`, {
      cwd,
      encoding: 'utf8',
    }).trim();

    if (!diff) return [];
    return diff.split('\n').filter((f) => /\.controller\.ts$/.test(f));
  } catch {
    return [];
  }
}

/**
 * Collect all endpoints from changed controller files.
 */
function collectChangedEndpoints(cwd, changedControllers) {
  const endpoints = [];
  for (const relPath of changedControllers) {
    const absPath = path.join(cwd, relPath);
    try {
      const content = fs.readFileSync(absPath, 'utf8');
      const parsed = parseControllerEndpoints(content, relPath);
      endpoints.push(...parsed);
    } catch {
      // File might be deleted — skip
    }
  }
  return endpoints;
}

/**
 * Check which endpoints are covered by smoke report cases.
 */
function findUncoveredEndpoints(endpoints, smokeReport) {
  const cases = Array.isArray(smokeReport?.cases) ? smokeReport.cases : [];

  // Build a set of "METHOD path" strings from smoke report
  const covered = new Set();
  for (const c of cases) {
    if (typeof c?.method === 'string' && typeof c?.path === 'string') {
      covered.add(`${c.method.toUpperCase()} ${c.path}`);
    }
  }

  const uncovered = [];
  for (const ep of endpoints) {
    const key = `${ep.method} ${ep.path}`;
    // Also check with trailing slash variants and param normalization
    const keyNoTrail = `${ep.method} ${ep.path.replace(/\/$/, '')}`;
    const keyTrail = `${ep.method} ${ep.path}/`;
    if (!covered.has(key) && !covered.has(keyNoTrail) && !covered.has(keyTrail)) {
      // Check for parameterized matches: /api/v1/users/:id matches /api/v1/users/123
      let paramMatched = false;
      for (const coveredKey of covered) {
        const [covMethod, covPath] = coveredKey.split(' ', 2);
        if (covMethod !== ep.method) continue;
        // Convert :param to regex
        const paramRegex = new RegExp(
          '^' + ep.path.replace(/:[^/]+/g, '[^/]+').replace(/\//g, '\\/') + '$'
        );
        if (paramRegex.test(covPath)) {
          paramMatched = true;
          break;
        }
      }
      if (!paramMatched) {
        uncovered.push(ep);
      }
    }
  }
  return uncovered;
}

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function runGuard({ stdinRaw, cwd } = {}) {
  try {
    const projectDir = cwd || process.env.CLAUDE_PROJECT_DIR || process.env.PROJECT_ROOT || process.cwd();

    const smokeReportPath = path.join(projectDir, '.claude', 'hooks', '.smoke-report.json');
    const smokeReport = readJsonSafe(smokeReportPath);

    // If no smoke report exists, we can't verify — pass (other hooks enforce probe runs)
    if (!smokeReport) return { allow: true };

    const changedControllers = getChangedControllers(projectDir);
    if (changedControllers.length === 0) return { allow: true };

    const endpoints = collectChangedEndpoints(projectDir, changedControllers);
    if (endpoints.length === 0) return { allow: true };

    const uncovered = findUncoveredEndpoints(endpoints, smokeReport);
    if (uncovered.length === 0) return { allow: true };

    const details = uncovered
      .map((ep) => `  ${ep.method} ${ep.path} (from ${ep.file})`)
      .join('\n');

    return {
      allow: false,
      decision: 'block',
      reason:
        `PROBE_DIFF_MISMATCH: the following endpoints appear in changed controller ` +
        `files but have no matching smoke-probe case. Run \`pnpm probe:smoke\` to ` +
        `generate coverage, or verify the endpoints are correctly decorated.\n\n` +
        `Uncovered endpoints:\n${details}`,
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

module.exports = { runGuard, parseControllerEndpoints, findUncoveredEndpoints };
