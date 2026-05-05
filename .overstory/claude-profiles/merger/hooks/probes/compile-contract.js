#!/usr/bin/env node
/**
 * Plan 05 — Contract compiler.
 *
 * Runs each registered extractor, merges their outputs, dedupes routes + endpoints,
 * writes the compiled artifact to disk, and returns it for in-process consumers.
 *
 * Exit codes:
 *   0 — compilation succeeded
 *   2 — agent-actionable compile failure
 *   3 — internal error
 */

const fs = require('node:fs');
const path = require('node:path');

const { EXTRACTORS } = require('./extractors/index.js');

async function compileContract({ projectRoot, touchedPaths } = {}) {
  if (!projectRoot) throw new Error('compileContract: projectRoot required');
  const routes = [];
  const endpoints = [];
  const diagnostics = [];

  for (const extractor of EXTRACTORS) {
    try {
      if (typeof extractor.detect === 'function' && !extractor.detect({ projectRoot })) {
        continue;
      }
      const result = await extractor.extract({ projectRoot, touchedPaths });
      if (result?.routes) routes.push(...result.routes);
      if (result?.endpoints) endpoints.push(...result.endpoints);
      if (result?.diagnostics) diagnostics.push(...result.diagnostics);
    } catch (error) {
      diagnostics.push({
        level: 'error',
        code: 'EXTRACTOR_FAILURE',
        message: `${extractor.name}: ${error.message}`,
      });
    }
  }

  const uniqueRoutes = dedupeRoutes(routes);
  const uniqueEndpoints = dedupeEndpoints(endpoints);

  const compiled = {
    version: '1',
    generatedAt: new Date().toISOString(),
    routes: uniqueRoutes,
    endpoints: uniqueEndpoints,
    diagnostics,
  };

  return compiled;
}

function dedupeRoutes(routes) {
  const seen = new Map();
  for (const route of routes) {
    const key = `${route.app}::${route.path}`;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, { ...route, sourceFiles: [...(route.sourceFiles || [])] });
      continue;
    }
    for (const sourceFile of route.sourceFiles || []) {
      if (!existing.sourceFiles.includes(sourceFile)) existing.sourceFiles.push(sourceFile);
    }
    if (existing.auth === 'unknown' && route.auth !== 'unknown') existing.auth = route.auth;
    for (const key2 of route.metadataKeys || []) {
      if (!existing.metadataKeys.includes(key2)) existing.metadataKeys.push(key2);
    }
  }
  return Array.from(seen.values());
}

function dedupeEndpoints(endpoints) {
  const seen = new Map();
  for (const endpoint of endpoints) {
    const key = `${endpoint.app}::${endpoint.method} ${endpoint.path}`;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, { ...endpoint });
      continue;
    }
    if (existing.auth === 'unknown' && endpoint.auth !== 'unknown') existing.auth = endpoint.auth;
    if (!existing.guard && endpoint.guard) existing.guard = endpoint.guard;
  }
  return Array.from(seen.values());
}

function writeCacheFile(projectRoot, compiled) {
  const cacheDir = path.join(projectRoot, '.claude', 'hooks');
  try {
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(
      path.join(cacheDir, '.contract.cache.json'),
      JSON.stringify(compiled, null, 2),
    );
  } catch {
    // cache is advisory, ignore write failures
  }
}

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--project-root') options.projectRoot = argv[++i];
    else if (arg === '--out') options.out = argv[++i];
    else if (arg === '--touched') options.touchedListPath = argv[++i];
  }
  return options;
}

async function mainCli(argv) {
  try {
    const args = parseArgs(argv);
    const projectRoot =
      args.projectRoot || process.env.PROJECT_ROOT || process.env.OVERSTORY_WORKTREE_PATH || process.cwd();

    let touchedPaths;
    if (args.touchedListPath && fs.existsSync(args.touchedListPath)) {
      touchedPaths = fs
        .readFileSync(args.touchedListPath, 'utf8')
        .split(/\r?\n/)
        .filter(Boolean);
    }

    const compiled = await compileContract({ projectRoot, touchedPaths });
    writeCacheFile(projectRoot, compiled);

    if (args.out) {
      fs.mkdirSync(path.dirname(args.out), { recursive: true });
      fs.writeFileSync(args.out, JSON.stringify(compiled, null, 2));
    } else {
      process.stdout.write(JSON.stringify(compiled, null, 2) + '\n');
    }
    return 0;
  } catch (error) {
    process.stderr.write(`compile-contract: ${error.message}\n`);
    return 3;
  }
}

if (require.main === module) {
  mainCli(process.argv.slice(2)).then((code) => process.exit(code));
}

module.exports = { compileContract, dedupeRoutes, dedupeEndpoints };
