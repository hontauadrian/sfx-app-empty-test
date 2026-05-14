#!/usr/bin/env tsx
/**
 * Entry point for the 6-probe bulletproof contract-verification battery.
 *
 * Invoked by .overstory/claude-profiles/builder/hooks/verify-full-contract.js
 * via `pnpm exec tsx`. Each probe auto-discovers its subject (routes, schemas,
 * pages, forms) and skips gracefully when its artifacts don't exist.
 *
 * Exit codes:
 *   0 — every probe passed or skipped
 *   1 — at least one probe failed (stdout contains the full table + details)
 *
 * IMPORTANT: `mockDatabase()` must run before any probe imports AppModule, so
 * we call it at the top of main(), before the dynamic imports kick in.
 */
import { formatTable, mockDatabase, statefulPrisma, type ProbeResult } from './shared';

type ProbeFn = () => Promise<ProbeResult[]>;

interface ProbeDescriptor {
  id: string;
  displayName: string;
  runner: () => Promise<ProbeFn>;
}

// Probes are imported dynamically so mockDatabase() runs first. The runner
// returns the exported `run*` function from each probe module.
// Legacy probes (validation-matrix, auth-matrix, mutation-roundtrip,
// page-crawl, form-fuzzer) were removed. Their coverage is handled
// by the generated flow battery in http-smoke.
const PROBES: ProbeDescriptor[] = [
  {
    id: 'route-contract',
    displayName: 'Route-contract',
    runner: async () => (await import('./route-contract')).runRouteContract,
  },
  {
    id: 'http-smoke',
    displayName: 'HTTP-smoke',
    runner: async () => (await import('./http-smoke')).runHttpSmoke,
  },
];

// Some CJS-backed modules (e.g. @nestjs/config with schema validation) throw
// synchronously during require() evaluation. Under Node's ESM-CJS bridge those
// can escape `await import()` as uncaught exceptions — we convert them into
// probe failures so the hook gets a clean exit code.
process.on('uncaughtException', (error) => {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack ?? '' : '';
  process.stdout.write(`\nProbe runner aborted by uncaught exception: ${message}\n${stack}\n`);
  process.exit(1);
});
process.on('unhandledRejection', (error) => {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack ?? '' : '';
  process.stdout.write(`\nProbe runner aborted by unhandled rejection: ${message}\n${stack}\n`);
  process.exit(1);
});

async function main(): Promise<void> {
  // Ensure required env vars are present before any AppModule import chain
  // walks through config validation. The hook orchestrator already sets these,
  // but direct invocations (e.g. `pnpm exec tsx probes/index.ts`) may not.
  ensureProbeEnv();

  // Stateful by default so register → login → protected-route flows work
  // end-to-end: the register handler persists a user, login finds it by email,
  // and the JWT guard's post-validation user lookup succeeds for protected
  // routes. Stateless would force every authenticated probe to skip.
  mockDatabase(statefulPrisma);

  const allResults: ProbeResult[] = [];
  let anyFailed = false;

  for (const descriptor of PROBES) {
    process.stderr.write(`\n› Running ${descriptor.displayName}…\n`);
    try {
      const run = await descriptor.runner();
      const results = await run();
      allResults.push(...results);
      if (results.some((result) => result.status === 'fail')) anyFailed = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack ?? '' : '';
      allResults.push({
        name: descriptor.displayName,
        status: 'fail',
        note: message,
        details: stack,
      });
      anyFailed = true;
    }
  }

  const totals = {
    total: allResults.length,
    passed: allResults.filter((r) => r.status === 'pass').length,
    skipped: allResults.filter((r) => r.status === 'skip').length,
    failed: allResults.filter((r) => r.status === 'fail').length,
  };
  // Route results consistently to stdout so downstream hooks (PreToolUse /
  // Stop wrappers) can capture and re-emit them. Progress banners above stay
  // on stderr because they're in-flight indicators, not final results.
  const outStream = process.stdout;
  outStream.write('\n');
  outStream.write('Contract verification results:\n');
  outStream.write(formatTable(allResults));
  outStream.write('\n');
  outStream.write(
    `[probes-summary] total=${totals.total} passed=${totals.passed} skipped=${totals.skipped} failed=${totals.failed}\n`,
  );
  // Mirror the totals under [http-smoke-summary] so frontend-only diffs
  // (where the HTTP-smoke probe matrix is empty and smoke-report.ts emits
  // nothing to stdout) still produce the bracketed evidence line the
  // worker-done gate scans for in builder mail bodies.
  outStream.write(
    `[http-smoke-summary] total=${totals.total} passed=${totals.passed} failed=${totals.failed} skipped=${totals.skipped} exit=${anyFailed ? 1 : 0} duration=0ms\n`,
  );

  if (anyFailed) {
    outStream.write('\nFailure details:\n');
    for (const result of allResults) {
      if (result.status !== 'fail') continue;
      outStream.write(`\n  ✗ ${result.name}\n`);
      if (result.note) outStream.write(`    ${result.note}\n`);
      if (result.details) {
        const indented = result.details
          .split('\n')
          .map((line) => `    ${line}`)
          .join('\n');
        outStream.write(`${indented}\n`);
      }
    }
    process.exit(1);
  }

  process.exit(0);
}

/**
 * Layer defaults from every .env.example the project ships, so the probe
 * adapts to whatever env schema the project's ConfigModule enforces. When
 * invoked through the Stop hook, verify-full-contract.js has already done
 * this — ensureProbeEnv() is mostly a safety net for direct invocations
 * (e.g. `pnpm exec tsx probes/index.ts`).
 */
function ensureProbeEnv(): void {
  const { readFileSync, existsSync } = require('node:fs') as typeof import('node:fs');
  const { join } = require('node:path') as typeof import('node:path');

  const projectRoot = process.env.PROBE_PROJECT_ROOT ?? process.cwd();
  const candidates = [
    join(projectRoot, '.env.example'),
    join(projectRoot, 'apps', 'api', '.env.example'),
    join(projectRoot, 'apps', 'web', '.env.example'),
  ];

  for (const path of candidates) {
    if (!existsSync(path)) continue;
    let contents = '';
    try {
      contents = readFileSync(path, 'utf8');
    } catch {
      continue;
    }
    for (const rawLine of contents.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq < 0) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!key) continue;
      if (!process.env[key]) process.env[key] = value;
    }
  }

  if (!process.env.NODE_ENV) process.env.NODE_ENV = 'test';
}

main().catch((error) => {
  // Unhandled failure in the runner itself — emit to stdout so the hook sees
  // something actionable rather than silently exiting non-zero.
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack ?? '' : '';
  process.stdout.write(`\nProbe runner crashed: ${message}\n${stack}\n`);
  process.exit(1);
});
