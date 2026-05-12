#!/usr/bin/env tsx
/**
 * Plan 07 — HTTP smoke probe (generated-flow runner).
 *
 * Boots (or reuses) the dev stack, reads the derived test matrix and the
 * generated flow battery from `.claude/hooks/.flows.generated.json`, executes
 * flows in topological (dependsOn) order sharing bindings across dependent
 * flows, exercises every page + API endpoint, and emits a structured report.
 *
 * The overlay's `flows[]` field is retired — all flows come from the generator.
 * The overlay is still loaded for `ignore[]` filtering and per-route overrides.
 *
 * Invocation:
 *   pnpm exec tsx .overstory/claude-profiles/<profile>/hooks/probes/http-smoke.ts \
 *     --matrix .claude/hooks/.matrix.json \
 *     --report .claude/hooks/.http-smoke.json
 *
 * Exit codes (plan 04 §6):
 *   0 — all passed
 *   1 — app-under-test failure(s)
 *   2 — boot or probe-internal failure
 *   3 — matrix invalid
 *   4 — config error (missing required file, unreadable overlay)
 */

import { ProbeResult, PROJECT_ROOT } from './shared';
import { runBootOrchestrator, teardownStack } from './boot-orchestrator';
import { loadMatrix, MatrixLoadError, MergedMatrix, MatrixEndpoint, MatrixPage } from './matrix-loader';
import {
  probePage,
  probeEndpoint,
  probeFlowWithBindings,
  ProbeCaseResult,
  formatBlockReason,
  BlockCode,
  GeneratedFlow,
  FlowContext,
  RuntimeDiagnostic,
} from './assertion-library';
import { HttpClient } from './http-client';
import { emptyReport, formatSummary, SmokeCaseEntry, SmokeReport, writeReport } from './smoke-report';
import { generateFixture } from './schema-fixture';
import { join } from 'node:path';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
// Phase 0b additive load — curated flows folder is read at probe start so
// W5 can wire downstream consumption. Until then this just logs counts so
// users can see whether any curated flow is in scope.
import {
  loadCuratedContract,
  formatSummary as formatCuratedSummary,
} from './contract-flows/probe-integration';
// W5 — execute curated contract flows after the matrix probe.
import {
  executeCuratedFlows,
  formatRunSummary as formatCuratedRunSummary,
} from './contract-flows/flow-runner';
import type { TypedError } from './contract-flows/errors';
// RFC 6265bis cookie jar — per-flow jars seeded from declared dependsOn
// parents (see flow loop). Inheritance is driven entirely by the declarative
// dependsOn relationship — never by path/field heuristics.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { CookieJar: RfcCookieJar } = require('./lib/cookie-jar');

/**
 * Build a fresh CookieJar that contains a structural copy of every cookie
 * stored in `src` plus its cleared-name tracking. Used at flow entry to
 * seed the jar from a declared dependsOn parent's final state without
 * mutating the parent. We copy via the jar's own internal state shape
 * (StoredCookie objects keyed by name|path|domain) — no header round-trip,
 * no heuristic.
 *
 * This is read-only access to the jar's public-by-convention internals; we
 * deliberately do not augment cookie-jar.js with a clone() method to keep
 * that module's surface stable.
 */
function cloneJar(src: InstanceType<typeof RfcCookieJar>): InstanceType<typeof RfcCookieJar> {
  const dst = new RfcCookieJar();
  // Copy each stored cookie. attrs is a flat object so a shallow spread is
  // sufficient; cookie names/paths/domains are strings.
  for (const [key, cookie] of src._cookies) {
    dst._cookies.set(key, {
      name: cookie.name,
      value: cookie.value,
      attrs: { ...cookie.attrs },
      effectivePath: cookie.effectivePath,
      effectiveDomain: cookie.effectiveDomain,
      creationIndex: cookie.creationIndex,
      hostOnly: cookie.hostOnly,
    });
  }
  for (const name of src._cleared) {
    dst._cleared.add(name);
  }
  dst._counter = src._counter;
  return dst;
}

/**
 * Build a flow's starting cookie jar by inheriting from each declared
 * dependsOn parent's final jar in declaration order. Flows with no
 * dependsOn parents (or no recorded parent jars) start with a fresh jar.
 *
 * If a parent's final jar is not in the registry (parent failed to run, or
 * was filtered out), we skip it silently — the topo-sort already enforces
 * declaration consistency. This is the only point where dependsOn drives
 * cookie inheritance; nothing else looks at flow IDs or paths.
 */
function jarForFlow(
  dependsOn: readonly string[],
  registry: Map<string, InstanceType<typeof RfcCookieJar>>,
): InstanceType<typeof RfcCookieJar> {
  const parentJars: InstanceType<typeof RfcCookieJar>[] = [];
  for (const parentId of dependsOn) {
    const parentJar = registry.get(parentId);
    if (parentJar) parentJars.push(parentJar);
  }
  if (parentJars.length === 0) {
    const jar = new RfcCookieJar();
    jar.reset();
    return jar;
  }
  // Seed from the first parent, then merge subsequent parents on top.
  // Later-declared parents win on key collisions — matches the order
  // the flow author wrote the dependsOn array.
  const jar = cloneJar(parentJars[0]);
  for (let index = 1; index < parentJars.length; index += 1) {
    const extra = parentJars[index];
    for (const [key, cookie] of extra._cookies) {
      jar._cookies.set(key, {
        name: cookie.name,
        value: cookie.value,
        attrs: { ...cookie.attrs },
        effectivePath: cookie.effectivePath,
        effectiveDomain: cookie.effectiveDomain,
        creationIndex: cookie.creationIndex,
        hostOnly: cookie.hostOnly,
      });
    }
    for (const name of extra._cleared) jar._cleared.add(name);
    if (extra._counter > jar._counter) jar._counter = extra._counter;
  }
  return jar;
}

export interface HttpSmokeOptions {
  matrixPath?: string;
  overlayPath?: string;
  compiledPath?: string;
  reportPath?: string;
  humanReportPath?: string;
  timeoutSec?: number;
  bootTimeoutSec?: number;
  strict?: boolean;
  only?: 'pages' | 'api' | 'auth' | 'forms' | 'flows' | 'all';
  jsonOutput?: boolean;
  fullScope?: boolean;
  readOnly?: boolean;
  profile?: string;
  reuseRunning?: boolean;
  keepStack?: boolean;
  /**
   * Skip the implicit matrix+flows regen step. Default false.
   * Tests and CI paths that pre-seed artifacts set this to true.
   */
  skipRegen?: boolean;
}

export interface HttpSmokeResult {
  exitCode: 0 | 1 | 2 | 3 | 4;
  report: SmokeReport;
  blockReason?: string;
}

export interface AuthContext {
  bearer: string | null;
  email: string | null;
  password: string | null;
  source: 'register' | 'login' | 'cookie' | 'skip';
  error?: string;
}

// ---------------------------------------------------------------------------
// Generated flows file shape
// ---------------------------------------------------------------------------

export interface GeneratedFlowsFile {
  version: string;
  generatedAt: string;
  matrixSource: string;
  logicalSource?: string;
  flows: GeneratedFlow[];
  diagnostics?: Array<{ code: string; message: string; endpoint?: string }>;
}

// ---------------------------------------------------------------------------
// Flow loading
// ---------------------------------------------------------------------------

export function loadGeneratedFlows(flowsPath: string): GeneratedFlowsFile {
  if (!existsSync(flowsPath)) {
    throw new FlowsLoadError(
      'FLOWS_GENERATED_MISSING',
      `Generated flows file not found at ${flowsPath}. Run \`pnpm flows:regen\` first.`,
    );
  }
  try {
    return JSON.parse(readFileSync(flowsPath, 'utf8')) as GeneratedFlowsFile;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new FlowsLoadError('FLOWS_GENERATED_INVALID', `Generated flows at ${flowsPath} is not valid JSON: ${message}`);
  }
}

export class FlowsLoadError extends Error {
  readonly code: 'FLOWS_GENERATED_MISSING' | 'FLOWS_GENERATED_INVALID';
  constructor(code: FlowsLoadError['code'], message: string) {
    super(message);
    this.code = code;
    this.name = 'FlowsLoadError';
  }
}

// ---------------------------------------------------------------------------
// Topological sort for flow dependency ordering
// ---------------------------------------------------------------------------

export function topoSortFlows(flows: GeneratedFlow[]): GeneratedFlow[] {
  const byId = new Map<string, GeneratedFlow>();
  for (const flow of flows) byId.set(flow.id, flow);

  const visited = new Set<string>();
  const inStack = new Set<string>();
  const sorted: GeneratedFlow[] = [];

  function visit(flowId: string): void {
    if (visited.has(flowId)) return;
    if (inStack.has(flowId)) {
      throw new FlowDependencyCycleError(flowId);
    }
    inStack.add(flowId);
    const flow = byId.get(flowId);
    if (flow) {
      for (const dep of flow.dependsOn) {
        if (byId.has(dep)) visit(dep);
      }
      visited.add(flowId);
      inStack.delete(flowId);
      sorted.push(flow);
    } else {
      visited.add(flowId);
      inStack.delete(flowId);
    }
  }

  for (const flow of flows) visit(flow.id);
  return sorted;
}

export class FlowDependencyCycleError extends Error {
  readonly flowId: string;
  constructor(flowId: string) {
    super(`FLOW_DEPENDENCY_CYCLE: cycle detected involving flow "${flowId}"`);
    this.flowId = flowId;
    this.name = 'FlowDependencyCycleError';
  }
}

// ---------------------------------------------------------------------------
// Strict contract coverage check
// ---------------------------------------------------------------------------

export interface ContractCoverageFailure {
  method: string;
  path: string;
  declaredStatus: number;
  controllerFile: string;
}

export function checkContractCoverage(
  matrix: MergedMatrix,
  observedTuples: Set<string>,
  ungeneratableStatuses?: Set<string>,
): ContractCoverageFailure[] {
  // Build a list of endpoint path templates that contain params (e.g.
  // /api/v1/probe-ref/tenants/:tenantId/items). These are used to
  // normalize observed paths back to their template form so that
  // flows using substituted paths (e.g. /tenants/probe-tenant-a/items)
  // still satisfy the contract-coverage check for the template path.
  const paramTemplates: Array<{ method: string; segments: string[]; template: string }> = [];
  for (const ep of matrix.endpoints) {
    if (ep.path.includes(':')) {
      paramTemplates.push({
        method: ep.method,
        segments: ep.path.split('/'),
        template: ep.path,
      });
    }
  }

  // Expand observedTuples with template-normalized equivalents.
  const expanded = new Set(observedTuples);
  for (const tuple of observedTuples) {
    const parts = tuple.split(' ');
    if (parts.length !== 3) continue;
    const [method, observedPath, status] = parts;
    const observedSegs = observedPath.split('/');
    for (const tmpl of paramTemplates) {
      if (tmpl.method !== method) continue;
      if (tmpl.segments.length !== observedSegs.length) continue;
      let matches = true;
      for (let i = 0; i < tmpl.segments.length; i++) {
        if (tmpl.segments[i].startsWith(':')) continue; // param segment — always matches
        if (tmpl.segments[i] !== observedSegs[i]) { matches = false; break; }
      }
      if (matches) {
        expanded.add(`${method} ${tmpl.template} ${status}`);
      }
    }
  }

  const failures: ContractCoverageFailure[] = [];
  for (const endpoint of matrix.endpoints) {
    const raw = (endpoint as unknown as Record<string, unknown>);
    const swagger = raw.swaggerDeclared as { statuses?: number[] } | undefined;
    if (!swagger?.statuses) continue;
    for (const status of swagger.statuses) {
      const key = `${endpoint.method} ${endpoint.path} ${status}`;
      if (!expanded.has(key)) {
        // Skip statuses that the flows-generator marked as ungeneratable —
        // these are genuinely unreachable by the probe (e.g. success paths
        // requiring real auth, security-covered endpoints with no success flow).
        if (ungeneratableStatuses?.has(key)) continue;
        failures.push({
          method: endpoint.method,
          path: endpoint.path,
          declaredStatus: status,
          controllerFile: endpoint.file,
        });
      }
    }
  }
  return failures;
}

/**
 * Regenerate .claude/hooks/.matrix.json and .claude/hooks/.flows.generated.json
 * from source so the probe never reads stale artifacts. Returns a non-null
 * error string on failure, null on success.
 *
 * The scripts live next to this file; we spawn them as sibling Node processes
 * to keep regen logic in a single entrypoint (derive-test-matrix.js /
 * flows-generator.js) rather than duplicating their orchestration here.
 */
function regenerateArtifacts(full: boolean): string | null {
  const deriveMatrix = join(__dirname, 'derive-test-matrix.js');
  const flowsGen = join(__dirname, 'flows-generator.js');
  const matrixArgs = full ? [deriveMatrix, '--full'] : [deriveMatrix];
  const matrixResult = spawnSync(process.execPath, matrixArgs, {
    cwd: PROJECT_ROOT,
    stdio: ['ignore', 'inherit', 'inherit'],
    env: process.env,
  });
  if (matrixResult.status !== 0) {
    return `matrix:regen exited with code ${matrixResult.status ?? 'null'} (signal=${matrixResult.signal ?? 'none'})`;
  }
  const flowsResult = spawnSync(process.execPath, [flowsGen], {
    cwd: PROJECT_ROOT,
    stdio: ['ignore', 'inherit', 'inherit'],
    env: process.env,
  });
  if (flowsResult.status !== 0) {
    return `flows:regen exited with code ${flowsResult.status ?? 'null'} (signal=${flowsResult.signal ?? 'none'})`;
  }
  return null;
}

/**
 * Recursively walk a directory and return the newest mtime (ms epoch) of any
 * `.ts` file found. Skips node_modules, dist, and __tests__ for speed and to
 * avoid retrigger churn from compiled output. Returns 0 if the directory does
 * not exist (caller treats that as "no source files newer than openapi.json").
 */
function newestTsMtime(dir: string): number {
  let newest = 0;
  let stack: string[];
  try {
    stack = [dir];
  } catch {
    return 0;
  }
  while (stack.length > 0) {
    const current = stack.pop()!;
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules') continue;
        if (entry.name === 'dist') continue;
        if (entry.name === '__tests__') continue;
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith('.ts')) continue;
      if (entry.name.endsWith('.spec.ts')) continue;
      if (entry.name.endsWith('.test.ts')) continue;
      try {
        const stat = statSync(fullPath);
        if (stat.mtimeMs > newest) newest = stat.mtimeMs;
      } catch {
        continue;
      }
    }
  }
  return newest;
}

/**
 * Probe preflight — runs BEFORE matrix/flow regeneration.
 *
 * Three checks:
 *   1. `.stack.json` exists. If not → abort with "stack not started".
 *   2. The API at the recorded port responds to `GET /api/docs-json` with 200.
 *      If not → abort with the same hint.
 *   3. `apps/api/.openapi.json` mtime is at least as new as the newest
 *      `apps/api/src/**\/*.ts` mtime. If stale, run `pnpm --filter @sfx/api
 *      openapi:dump` synchronously and re-check. On rebuild failure, abort
 *      with the @ApiProperty / @Inject hint banner.
 *
 * Returns { ok: true } on success, or { ok: false, reason } on failure. The
 * caller wraps the failure in a probe-internal-error report — the same shape
 * other early failures already use.
 */
export type PreflightResult = { ok: boolean; reason: string };

export function preflightStack(projectRoot: string): PreflightResult {
  // Check 1: .stack.json exists.
  const stackFile = join(projectRoot, '.stack.json');
  if (!existsSync(stackFile)) {
    return {
      ok: false,
      reason: 'stack not started; run pnpm stack:up',
    };
  }

  // Check 2: API responds on the recorded port.
  let apiPort: number | null = null;
  let host = 'localhost';
  try {
    const stackJson = JSON.parse(readFileSync(stackFile, 'utf8'));
    if (typeof stackJson.api_port === 'number') apiPort = stackJson.api_port;
    if (typeof stackJson.host === 'string' && stackJson.host) host = stackJson.host;
  } catch {
    // Malformed .stack.json — treat as not-started.
    return {
      ok: false,
      reason: 'stack not started; run pnpm stack:up',
    };
  }
  if (!apiPort) {
    return {
      ok: false,
      reason: 'stack not started; run pnpm stack:up',
    };
  }
  // Use curl (already a hard dependency of worktree-stack.sh) to probe the
  // docs endpoint with a strict timeout. -sf returns non-zero on HTTP errors
  // and -o /dev/null suppresses the body — we only care about reachability.
  const probeResult = spawnSync('curl', [
    '-sfo', '/dev/null',
    '--max-time', '5',
    `http://${host}:${apiPort}/api/docs-json`,
  ], { stdio: ['ignore', 'ignore', 'ignore'] });
  if (probeResult.status !== 0) {
    return {
      ok: false,
      reason: 'stack not started; run pnpm stack:up',
    };
  }

  // Check 3: openapi.json mtime ≥ newest apps/api/src/*.ts mtime.
  const openapiPath = join(projectRoot, 'apps', 'api', '.openapi.json');
  const apiSrcDir = join(projectRoot, 'apps', 'api', 'src');
  const newestSourceMtime = newestTsMtime(apiSrcDir);
  let openapiMtime = 0;
  if (existsSync(openapiPath)) {
    try {
      openapiMtime = statSync(openapiPath).mtimeMs;
    } catch {
      openapiMtime = 0;
    }
  }
  if (openapiMtime >= newestSourceMtime && newestSourceMtime > 0) {
    // Spec is at least as new as the newest source file → fresh enough.
    return { ok: true, reason: '' };
  }
  // Stale (or missing) → rebuild before letting the probe consume it.
  process.stdout.write('[probe-preflight] openapi.json is stale (api source newer); rebuilding before probe...\n');
  const rebuild = spawnSync(
    'pnpm',
    ['--filter', '@sfx/api', 'openapi:dump'],
    {
      cwd: projectRoot,
      stdio: ['ignore', 'inherit', 'inherit'],
      env: process.env,
    },
  );
  if (rebuild.status !== 0) {
    const banner = [
      '',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '[probe-preflight] openapi:dump failed during stale-spec rebuild',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
      '  Root cause (CLAUDE.md meta-principle B):',
      '    tsx + esbuild do NOT reliably emit reflect-metadata. NestJS',
      '    Swagger then can\'t resolve property/parameter types and fails',
      '    with a misleading error. Two declaration rules MUST be followed:',
      '',
      '      1. Every @ApiProperty() / @ApiPropertyOptional() MUST',
      '         declare an explicit `type:` field.',
      '      2. Every constructor parameter whose type is a class or',
      '         interface MUST be annotated with @Inject(Token) directly',
      '         on the parameter.',
      '',
      '  Apply the meta-principle to any future quirk with the same root',
      '  cause — these two are worked examples, not an exhaustive list.',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
    ].join('\n');
    process.stderr.write(banner);
    return {
      ok: false,
      reason: `openapi:dump exited with code ${rebuild.status ?? 'null'} during stale-spec rebuild`,
    };
  }
  return { ok: true, reason: '' };
}

export async function runHttpSmokeMain(options: HttpSmokeOptions): Promise<HttpSmokeResult> {
  const started = Date.now();
  const profile = options.profile ?? inferProfileFromCwd() ?? 'unknown';
  const mode = {
    readOnly: !!options.readOnly,
    strict: !!options.strict,
    fullScope: !!options.fullScope,
  };

  // Phase 0b additive — load curated flows (.overstory/runtime-contract.flows/)
  // alongside the existing generated battery. The merged contract is reported
  // here for visibility; W5 will wire it into adapter execution. Errors from
  // the loader/merger are non-fatal for now (they surface in stderr) so a
  // half-authored folder cannot break the existing probe path.
  const curatedSummary = loadCuratedContract(PROJECT_ROOT);
  process.stderr.write(formatCuratedSummary(curatedSummary) + '\n');
  // Structured loader diagnostics — written to the report so downstream
  // tooling (probe-run-with-ownership-check.sh) can dispatch remediation
  // mail by error code without parsing stdout.
  const loaderDiagnostics: ReadonlyArray<{ code: string; message: string } & Record<string, unknown>> =
    curatedSummary.errors.map((err) => ({ ...(err as Record<string, unknown>), code: err.code, message: err.message }));
  for (const err of curatedSummary.errors) {
    process.stderr.write(`[contract-flows] ${err.code}: ${err.message}\n`);
  }
  const attachLoaderDiagnostics = (report: SmokeReport): SmokeReport => {
    if (loaderDiagnostics.length > 0) report.loaderDiagnostics = loaderDiagnostics;
    // generatorDiagnostics is populated when flows-generator output is read
    // below. Re-attach on every writeReport call so failure paths surface them.
    if (generatorDiagnostics && generatorDiagnostics.length > 0) {
      report.generatorDiagnostics = generatorDiagnostics;
    }
    return report;
  };
  // Filled in once flowsFile loads (see below). Declared here so the closure
  // above can read it; early-exit paths emit reports before flows load and
  // they get an empty list, which is correct.
  let generatorDiagnostics: ReadonlyArray<{ code: string; message: string } & Record<string, unknown>> = [];

  try {
    const earlyFlowsPath = join(PROJECT_ROOT, '.claude', 'hooks', '.flows.generated.json');
    if (existsSync(earlyFlowsPath)) {
      const earlyFlowsFile = JSON.parse(readFileSync(earlyFlowsPath, 'utf8')) as GeneratedFlowsFile;
      const earlyDiagnostics = earlyFlowsFile.diagnostics ?? [];
      generatorDiagnostics = earlyDiagnostics.map((diag) => ({ ...(diag as Record<string, unknown>), code: diag.code, message: diag.message }));
    }
  } catch {
    // best-effort — if the file is missing or unreadable, fall through.
    // The later loadGeneratedFlows call will surface a real failure.
  }

  // -1. Probe preflight — fail fast if the stack isn't booted, the API isn't
  //    reachable, or the static OpenAPI dump is older than its source files.
  //    Skipping this and proceeding straight to matrix regen produces a
  //    confusing chain of downstream errors when the probe runs against a
  //    stale spec or a stack that was never started. Tests can opt out via
  //    skipRegen (which also skips this preflight).
  if (!options.skipRegen) {
    const preflight = preflightStack(PROJECT_ROOT);
    if (!preflight.ok) {
      const report = emptyReport(profile, options.fullScope ? 'full' : 'session', mode);
      report.exitCode = 2;
      report.blockCodes = ['PROBE_INTERNAL_ERROR'];
      report.blockReason = formatBlockReason('PROBE_INTERNAL_ERROR', 'preflight', preflight.reason);
      writeReport(attachLoaderDiagnostics(report), { reportPath: options.reportPath, humanReportPath: options.humanReportPath });
      return { exitCode: 2, report, blockReason: report.blockReason };
    }
  }

  // 0. Regenerate matrix + flows from source (Zod schemas, NestJS decorators,
  //    OpenAPI dump, logical contract). This is mandatory — running the probe
  //    against stale artifacts silently under-covers diffs and produces false
  //    failures. Tests can opt out via skipRegen.
  if (!options.skipRegen) {
    // Bug fix: previously `options.fullScope !== false`, which evaluates to
    // `true` when fullScope is undefined (the default). That caused every Stop
    // chain run — which calls http-smoke without `--full` — to silently
    // regenerate the matrix as `scope: "full"` with every page stamped
    // `changed: true`, bulldozing the prior session-scoped regen from the Stop
    // chain's earlier derive-test-matrix step. Coerce to a strict boolean so
    // only an explicit `--full` triggers a full-scope regen here.
    const regenFailure = regenerateArtifacts(options.fullScope === true);
    if (regenFailure) {
      const report = emptyReport(profile, options.fullScope ? 'full' : 'session', mode);
      report.exitCode = 2;
      report.blockCodes = ['PROBE_INTERNAL_ERROR'];
      report.blockReason = formatBlockReason('PROBE_INTERNAL_ERROR', 'regen', regenFailure);
      writeReport(attachLoaderDiagnostics(report), { reportPath: options.reportPath, humanReportPath: options.humanReportPath });
      return { exitCode: 2, report, blockReason: report.blockReason };
    }
  }

  // 1. Load matrix (+ overlay, compiled).
  let matrix: MergedMatrix;
  try {
    matrix = loadMatrix({
      matrixPath: options.matrixPath,
      overlayPath: options.overlayPath,
      compiledPath: options.compiledPath,
      scopeOverride: options.fullScope ? 'full' : undefined,
    });
  } catch (error) {
    const report = emptyReport(profile, options.fullScope ? 'full' : 'session', mode);
    if (error instanceof MatrixLoadError) {
      report.exitCode = error.code === 'MATRIX_MISSING' ? 4 : error.code === 'MATRIX_INVALID' ? 3 : 4;
      report.blockReason = formatBlockReason('PROBE_INTERNAL_ERROR', 'matrix', `${error.code}: ${error.message}`);
      report.blockCodes = [error.code];
    } else {
      report.exitCode = 2;
      report.blockReason = formatBlockReason('PROBE_INTERNAL_ERROR', 'matrix', error instanceof Error ? error.message : String(error));
      report.blockCodes = ['PROBE_INTERNAL_ERROR'];
    }
    writeReport(attachLoaderDiagnostics(report), { reportPath: options.reportPath, humanReportPath: options.humanReportPath });
    return { exitCode: report.exitCode, report, blockReason: report.blockReason };
  }

  // 2. Boot stack.
  const boot = await runBootOrchestrator(matrix.bootPlan, {
    bootTimeoutSec: options.bootTimeoutSec,
    reuseRunning: options.reuseRunning,
    keepStack: options.keepStack,
  });

  if (boot.error || !boot.ports) {
    const report = emptyReport(profile, matrix.scope, mode);
    report.stack = {
      ownership: boot.ownership,
      ports: (boot.ports ?? {}) as Record<string, number | undefined>,
      reused: boot.reused,
      bootPlanDriver: matrix.bootPlan.driver,
    };
    report.exitCode = 2;
    report.blockReason = boot.error
      ? formatBlockReason(boot.error.kind as BlockCode, 'stack', boot.error.message)
      : formatBlockReason('STACK_BOOT_FAILED', 'stack', 'boot orchestrator returned no ports');
    report.blockCodes = [boot.error?.kind ?? 'STACK_BOOT_FAILED'];
    // Propagate the stack stderr tail into the report so formatSummary can
    // surface the actual boot failure (e.g. `TypeError: this.$connect is not
    // a function`) verbatim in the agent-visible probe output.
    if (boot.error?.logs) report.bootLogs = boot.error.logs;
    report.summary.durationMs = Date.now() - started;
    writeReport(attachLoaderDiagnostics(report), { reportPath: options.reportPath, humanReportPath: options.humanReportPath });
    return { exitCode: 2, report, blockReason: report.blockReason };
  }

  // 2b. Post-boot regen — the pre-boot regen at step 0 may have read a stale
  //    static `apps/api/.openapi.json` (NestJS hot-reload had not yet flushed
  //    the new spec, or stack was not running). Now that the stack is healthy,
  //    we settle for hot-reload to complete, then regenerate so matrix + flows
  //    are derived from the *live* `/api/docs-json` the probe is about to hit.
  //    This is the staleness firewall — by construction, the matrix the probe
  //    runs against and the spec the API serves come from the same in-memory
  //    NestJS process at the same instant.
  if (!options.skipRegen) {
    const SETTLE_MS = 3000;
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    // Same bug fix as the pre-boot regen above — coerce to strict boolean so
    // `--full` is only forwarded when explicitly requested.
    const regenFailure = regenerateArtifacts(options.fullScope === true);
    if (regenFailure) {
      const report = emptyReport(profile, matrix.scope, mode);
      report.exitCode = 2;
      report.blockCodes = ['PROBE_INTERNAL_ERROR'];
      report.blockReason = formatBlockReason('PROBE_INTERNAL_ERROR', 'regen-post-boot', regenFailure);
      writeReport(attachLoaderDiagnostics(report), { reportPath: options.reportPath, humanReportPath: options.humanReportPath });
      return { exitCode: 2, report, blockReason: report.blockReason };
    }
    // Re-load matrix so steps 3+ use the freshly-regenerated artifacts.
    try {
      matrix = loadMatrix({
        matrixPath: options.matrixPath,
        overlayPath: options.overlayPath,
        compiledPath: options.compiledPath,
        scopeOverride: options.fullScope ? 'full' : undefined,
      });
    } catch (error) {
      const report = emptyReport(profile, options.fullScope ? 'full' : 'session', mode);
      if (error instanceof MatrixLoadError) {
        report.exitCode = error.code === 'MATRIX_MISSING' ? 4 : error.code === 'MATRIX_INVALID' ? 3 : 4;
        report.blockReason = formatBlockReason('PROBE_INTERNAL_ERROR', 'matrix-post-boot', `${error.code}: ${error.message}`);
        report.blockCodes = [error.code];
      } else {
        report.exitCode = 2;
        report.blockReason = formatBlockReason('PROBE_INTERNAL_ERROR', 'matrix-post-boot', error instanceof Error ? error.message : String(error));
        report.blockCodes = ['PROBE_INTERNAL_ERROR'];
      }
      writeReport(attachLoaderDiagnostics(report), { reportPath: options.reportPath, humanReportPath: options.humanReportPath });
      return { exitCode: report.exitCode, report, blockReason: report.blockReason };
    }
  }

  // 3. Build clients.
  const webBase = boot.baseUrls.web || (boot.ports.web_port ? `http://127.0.0.1:${boot.ports.web_port}` : '');
  const apiBase = boot.baseUrls.api || (boot.ports.api_port ? `http://127.0.0.1:${boot.ports.api_port}` : '');
  const webClient = webBase ? new HttpClient(webBase, { timeoutMs: (options.timeoutSec ?? 180) * 1000 }) : null;
  const apiClient = apiBase ? new HttpClient(apiBase, { timeoutMs: (options.timeoutSec ?? 180) * 1000 }) : null;

  // 4. Bootstrap auth (best-effort). `readOnly` callers still need an auth
  //    context for 401 assertions — register/login still run.
  const authContext = apiClient ? await bootstrapAuth(apiClient, matrix) : { bearer: null, email: null, password: null, source: 'skip' as const };

  // 5. Exercise matrix.
  const cases: SmokeCaseEntry[] = [];
  // Captured from the curated-flows runner below so the SmokeReport can
  // surface bootstrap failures alongside flow failures. Both writers (JSON +
  // MD) read this single source.
  let capturedBootstrapDiagnostics: TypedError[] = [];
  const only = options.only ?? 'all';

  if (webClient && (only === 'all' || only === 'pages')) {
    for (const page of matrix.pages) {
      if (!options.fullScope && page.changed === false) continue;
      // Public probe (no bearer).
      const publicResult = await probePage(webClient, page, matrix, {
        authed: false,
        bearer: null,
        strict: options.strict,
        loginSurface: matrix.authDetection.loginSurface,
      });
      cases.push({ ...publicResult, category: 'page' });

      // Authed probe for authenticated routes (only if we obtained a bearer).
      if (page.guard === 'authenticated' && authContext.bearer) {
        const authedResult = await probePage(webClient, page, matrix, {
          authed: true,
          bearer: authContext.bearer,
          strict: options.strict,
          loginSurface: matrix.authDetection.loginSurface,
        });
        cases.push({ ...authedResult, category: 'page' });
      }
    }
  }

  if (apiClient && (only === 'all' || only === 'api' || only === 'auth')) {
    for (const endpoint of matrix.endpoints) {
      if (!options.fullScope && endpoint.changed === false) continue;
      const results = await probeEndpoint(apiClient, endpoint, matrix, {
        bearer: authContext.bearer,
        readOnly: options.readOnly,
      });
      for (const entry of results) cases.push({ ...entry, category: 'endpoint' });
    }
  }

  let flowsDiagnostics: Array<{ code: string; message: string; endpoint?: string }> = [];
  const allRuntimeDiagnostics: RuntimeDiagnostic[] = [];
  if (only === 'all' || only === 'flows') {
    const flowsPath = join(PROJECT_ROOT, '.claude', 'hooks', '.flows.generated.json');
    let generatedFlows: GeneratedFlow[] = [];
    try {
      const flowsFile = loadGeneratedFlows(flowsPath);
      generatedFlows = flowsFile.flows;
      flowsDiagnostics = flowsFile.diagnostics ?? [];
      // Mirror flowsDiagnostics into the closure-scoped variable that
      // attachLoaderDiagnostics() reads, so every subsequent writeReport
      // call carries them in `report.generatorDiagnostics`. The wrapper
      // (probe-run-with-ownership-check.sh) reads that field.
      generatorDiagnostics = flowsDiagnostics.map((diag) => ({ ...(diag as Record<string, unknown>), code: diag.code, message: diag.message }));
    } catch (error) {
      if (error instanceof FlowsLoadError) {
        cases.push({
          label: 'flows:load',
          passed: false,
          category: 'flow',
          blockReason: formatBlockReason('PROBE_INTERNAL_ERROR', 'flows', `${error.code}: ${error.message}`),
        });
      } else {
        const message = error instanceof Error ? error.message : String(error);
        cases.push({
          label: 'flows:load',
          passed: false,
          category: 'flow',
          blockReason: formatBlockReason('PROBE_INTERNAL_ERROR', 'flows', message),
        });
      }
      generatedFlows = [];
    }

    if (generatedFlows.length > 0) {
      // Topologically sort flows so dependencies run first.
      let sortedFlows: GeneratedFlow[];
      try {
        sortedFlows = topoSortFlows(generatedFlows);
      } catch (error) {
        if (error instanceof FlowDependencyCycleError) {
          cases.push({
            label: 'flows:topo-sort',
            passed: false,
            category: 'flow',
            blockReason: formatBlockReason('PROBE_INTERNAL_ERROR', 'flows', error.message),
          });
          sortedFlows = [];
        } else {
          throw error;
        }
      }

      const initialEnvelopeKey: string[] | null = matrix.responseEnvelope.successWrapper;
      interface FlowFinalState {
        bindings: Record<string, unknown>;
        bearer: string | null;
        envelopeKey: string[] | null;
      }
      const flowFinalState = new Map<string, FlowFinalState>();
      function bindingsForFlow(dependsOn: readonly string[]): FlowFinalState {
        const merged: Record<string, unknown> = {};
        let bearer: string | null = authContext.bearer;
        let envelopeKey: string[] | null = initialEnvelopeKey;
        for (const parentId of dependsOn) {
          const parentState = flowFinalState.get(parentId);
          if (!parentState) continue;
          Object.assign(merged, parentState.bindings);
          if (parentState.bearer !== null) bearer = parentState.bearer;
          if (parentState.envelopeKey !== null) envelopeKey = parentState.envelopeKey;
        }
        return { bindings: merged, bearer, envelopeKey };
      }
      // Per-flow cookie jar registry. Each flow's starting jar is built
      // by inheriting from its declared dependsOn parents' FINAL jar state
      // (see jarForFlow). A flow with empty dependsOn gets a fresh jar.
      // After the flow runs, its jar (now containing whatever Set-Cookie
      // headers the steps captured plus any clears from logout steps) is
      // recorded so child flows can inherit from it.
      //
      // Why per-flow rather than one global jar:
      // - chain:auth-bootstrap sets a cookie. logical:authed-login-page
      //   declares dependsOn=[chain:auth-bootstrap] and needs it.
      // - chain:session-lifecycle calls logout (clears cookies). It MUST
      //   NOT clear the jar that logical:authed-login-page inherits from.
      // - logical:unauth-public-page has no dependsOn and MUST start
      //   cookie-free regardless of topo order.
      //
      // The mapping is purely declarative: dependsOn drives inheritance,
      // nothing else. Path/method/field-name guesses are not consulted.
      const flowFinalJars = new Map<string, InstanceType<typeof RfcCookieJar>>();

      for (const flow of sortedFlows) {
        const flowJar = jarForFlow(flow.dependsOn ?? [], flowFinalJars);
        const inherited = bindingsForFlow(flow.dependsOn ?? []);
        const flowBindings: Record<string, unknown> = { ...inherited.bindings };
        // Per-flow primary client: api steps run against apiClient, pure
        // navigate/wait flows run against webClient. Both clients are
        // forwarded to probeFlowWithBindings so individual steps can route
        // by their declared step.kind: navigate steps always use webClient,
        // api/ws/graphql steps always use apiClient — regardless of which
        // is the flow's primary. Routes by declared step taxonomy, not by
        // path or content guesses.
        const hasApiStep = flow.steps.some((s) => typeof s.kind === 'string' && (s.kind.startsWith('api') || s.kind.startsWith('ws-') || s.kind.startsWith('graphql')));
        const primaryClient = hasApiStep ? (apiClient ?? webClient) : (webClient ?? apiClient);
        if (!primaryClient) continue;

        const flowResult = await probeFlowWithBindings(primaryClient, flow, matrix, {
          readOnly: options.readOnly,
          bearer: inherited.bearer,
          bindings: flowBindings,
          envelopeKey: inherited.envelopeKey,
          sharedCookieJar: flowJar,
          webClient: webClient ?? undefined,
          apiClient: apiClient ?? undefined,
        });

        // Record this flow's FINAL jar state so dependent flows can
        // inherit from it. The jar was passed by reference, so any
        // Set-Cookie captures or logout-driven clears are already
        // reflected in flowJar at this point.
        flowFinalJars.set(flow.id, flowJar);

        Object.assign(flowBindings, flowResult.bindings);
        const finalBearer = flowResult.authHeader !== null ? flowResult.authHeader : inherited.bearer;
        const finalEnvelopeKey = flowResult.envelopeKey !== null ? flowResult.envelopeKey : inherited.envelopeKey;
        flowFinalState.set(flow.id, {
          bindings: flowBindings,
          bearer: finalBearer,
          envelopeKey: finalEnvelopeKey,
        });

        for (const entry of flowResult.cases) {
          cases.push({ ...entry, category: 'flow', label: `flow:${flow.id}:${entry.label}` });
        }
        for (const diag of flowResult.runtimeDiagnostics) {
          allRuntimeDiagnostics.push(diag);
        }
      }
    }
  }

  // 5b. Deduplicate runtime diagnostics (same code+cookieName emitted once)
  const seenDiagKeys = new Set<string>();
  const dedupedRuntimeDiagnostics: RuntimeDiagnostic[] = [];
  for (const diag of allRuntimeDiagnostics) {
    const key = `${diag.code}:${(diag.details as Record<string, unknown>).cookieName ?? ''}`;
    if (!seenDiagKeys.has(key)) {
      seenDiagKeys.add(key);
      dedupedRuntimeDiagnostics.push(diag);
    }
  }

  // 6. Strict contract coverage check — verify every swaggerDeclared.statuses[]
  //    was reached by at least one case.
  const observedTuples = new Set<string>();
  for (const entry of cases) {
    if (typeof entry.status === 'number' && entry.label) {
      // Extract method and path from flow labels. Step-kind prefix is one of
      // `api` (default), `upload` (api-upload), `download` (api-download),
      // `stream` (api-stream) — all share the same METHOD PATH format after
      // the prefix. Example: "flow:ep:post:upload-happy:step0:upload POST /api/v1/probe-ref/upload-image".
      const apiMatch = entry.label.match(/(?:api|upload|download|stream)\s+(GET|POST|PUT|PATCH|DELETE)\s+(\/\S+)/);
      if (apiMatch) {
        observedTuples.add(`${apiMatch[1]} ${apiMatch[2]} ${entry.status}`);
      }
      // Also match endpoint category labels like "POST /api/v1/auth/register (happy)"
      const epMatch = entry.label.match(/^(GET|POST|PUT|PATCH|DELETE)\s+(\/\S+)/);
      if (epMatch) {
        observedTuples.add(`${epMatch[1]} ${epMatch[2]} ${entry.status}`);
      }
    }
  }

  // Build set of "METHOD PATH STATUS" keys from flows-generator UNGENERATABLE
  // diagnostics. These statuses are genuinely unreachable by the probe (e.g.
  // success paths requiring real auth, security-covered endpoints).
  const ungeneratableStatuses = new Set<string>();
  for (const diag of flowsDiagnostics) {
    if (diag.code === 'CONTRACT_STATUS_UNREACHABLE_UNGENERATABLE') {
      // Parse: "Status 401 declared on POST /api/v1/probe-ref/refresh-token but ..."
      const m = diag.message.match(/Status (\d+) declared on (\w+) (\S+)/);
      if (m) ungeneratableStatuses.add(`${m[2]} ${m[3]} ${m[1]}`);
    }
  }

  const coverageFailures = checkContractCoverage(matrix, observedTuples, ungeneratableStatuses);
  for (const failure of coverageFailures) {
    cases.push({
      label: `contract-coverage:${failure.method} ${failure.path}:${failure.declaredStatus}`,
      passed: false,
      category: 'endpoint',
      blockReason: `CONTRACT_STATUS_UNREACHABLE: ${failure.method} ${failure.path} declares ${failure.declaredStatus} but no flow reached it (source: ${failure.controllerFile})`,
    });
  }

  // 6b. Execute curated contract flows (additive — doesn't affect matrix
  //     summary cases above; surfaces a separate stderr line + appended
  //     entries on the smoke report so failures are visible without
  //     replacing the matrix probe).
  if (curatedSummary.contract && curatedSummary.contract.specialFlows.length > 0 && apiBase) {
    const curatedReport = await executeCuratedFlows(curatedSummary.contract, {
      baseUrl: apiBase,
      stepTimeoutMs: (options.timeoutSec ?? 30) * 1000,
    });
    process.stderr.write(formatCuratedRunSummary(curatedReport) + '\n');
    for (const flow of curatedReport.flows) {
      const passed = flow.status === 'passed';
      const skipped = flow.status === 'skipped';
      const blockReason = passed
        ? undefined
        : (flow.reason ?? 'flow-failed');
      // For a failed flow, surface the first failing step's echoes
      // (request that was sent + response that was returned) so the
      // smoke-report renderer can show the agent the exact pair
      // without having to grep logs or rerun curl. Skipped flows
      // never have echoes — they didn't issue any HTTP.
      const failedStep = passed || skipped
        ? undefined
        : flow.steps.find((s) => !s.passed);
      cases.push({
        label: `contract-flow:${flow.id}`,
        passed: passed || skipped,
        category: 'endpoint',
        blockReason,
        // Carry the cascade-detection backref through to the smoke
        // report so the human render can group derived skips under
        // their root cause instead of listing them as N orphan rows.
        derivedOf: flow.derivedOf,
        requestEcho: failedStep?.requestEcho,
        responseEcho: failedStep?.responseEcho,
      });
    }
    capturedBootstrapDiagnostics = curatedReport.bootstrapDiagnostics;
    // Print one structured key=value line per failed actor immediately so an
    // agent piping `pnpm probe:smoke 2>&1 | grep bootstrap-FAIL` sees the
    // exact actor + scheme + reason for every failure without opening the
    // .md or .json. This is the FIRST signal when probes can't run their
    // authed flows; everything downstream cascades from these lines.
    for (const diag of curatedReport.bootstrapDiagnostics) {
      if (diag.code === 'FLOW_AUTH_BOOTSTRAP_ACTOR_FAILED') {
        const d = diag as { actorName: string; scheme: string; reason: string; sourceFile?: string; message: string };
        const sourcePart = d.sourceFile ? ` source=${JSON.stringify(d.sourceFile)} owner=lead` : '';
        process.stderr.write(
          `[contract-flows-bootstrap-FAIL] actor=${d.actorName} scheme=${d.scheme}${sourcePart} reason=${JSON.stringify(d.reason)}\n`,
        );
      } else {
        process.stderr.write(`[contract-flows-execute] ${diag.code}: ${diag.message}\n`);
      }
    }
    for (const err of curatedReport.runtimeErrors) {
      process.stderr.write(`[contract-flows-execute] ${err.code}: ${err.message}\n`);
    }
  }

  // 7. Build + write report.
  const summary = { total: cases.length, passed: 0, failed: 0, skipped: 0, durationMs: 0 };
  for (const entry of cases) {
    if (entry.passed) summary.passed++;
    else summary.failed++;
  }
  summary.durationMs = Date.now() - started;

  const blockCodes = new Set<string>();
  const blockReasons: string[] = [];
  for (const entry of cases) {
    if (!entry.passed && entry.blockReason) {
      blockReasons.push(entry.blockReason);
      const code = entry.blockReason.split(':', 1)[0];
      if (code) blockCodes.add(code);
    }
  }

  const exitCode: 0 | 1 | 2 | 3 | 4 = summary.failed === 0 ? 0 : 1;
  const report: SmokeReport = {
    version: '1',
    generatedAt: new Date().toISOString(),
    projectDir: PROJECT_ROOT,
    scope: matrix.scope,
    profile,
    mode,
    stack: {
      ownership: boot.ownership,
      ports: boot.ports as Record<string, number | undefined>,
      reused: boot.reused,
      bootPlanDriver: matrix.bootPlan.driver,
    },
    summary,
    exitCode,
    blockCodes: Array.from(blockCodes),
    blockReason: blockReasons[0],
    cases,
    runtimeDiagnostics: dedupedRuntimeDiagnostics,
    bootstrapDiagnostics: capturedBootstrapDiagnostics.length > 0
      ? capturedBootstrapDiagnostics
      : undefined,
  };

  writeReport(attachLoaderDiagnostics(report), { reportPath: options.reportPath, humanReportPath: options.humanReportPath });

  // 8. Teardown if we own the stack and caller didn't opt out.
  if (boot.ownership === 'owner' && !options.keepStack && process.env.HTTP_SMOKE_KEEP_STACK !== '1') {
    await teardownStack(matrix.bootPlan);
  }

  return { exitCode, report, blockReason: report.blockReason };
}

/**
 * Probe-battery adapter. When http-smoke is registered alongside the legacy
 * 6-probe battery (see index.ts §1.2), the registry expects a
 * `() => ProbeResult[]` surface. We adapt the smoke report into that shape.
 */
export async function runHttpSmoke(): Promise<ProbeResult[]> {
  const result = await runHttpSmokeMain(parseArgsFromEnv());
  return adaptToProbeBattery(result);
}

function adaptToProbeBattery(result: HttpSmokeResult): ProbeResult[] {
  if (result.exitCode === 0) {
    return [{
      name: 'HTTP-smoke',
      status: 'pass',
      note: `${result.report.summary.passed}/${result.report.summary.total} cases passed in ${result.report.summary.durationMs}ms`,
    }];
  }
  const note = result.blockReason ?? `exit=${result.exitCode}, failed=${result.report.summary.failed}`;
  const details = result.report.cases
    .filter((c) => !c.passed)
    .map((c) => `${c.label}: ${c.blockReason ?? 'failed'}`)
    .join('\n');
  return [{
    name: 'HTTP-smoke',
    status: 'fail',
    note,
    details,
  }];
}

function parseArgsFromEnv(): HttpSmokeOptions {
  return parseArgvOptions(process.argv.slice(2));
}

export function parseArgvOptions(argv: string[]): HttpSmokeOptions {
  const opts: HttpSmokeOptions = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const take = (): string => argv[++i];
    if (arg === '--matrix') opts.matrixPath = take();
    else if (arg === '--overlay') opts.overlayPath = take();
    else if (arg === '--compiled') opts.compiledPath = take();
    else if (arg === '--report') opts.reportPath = take();
    else if (arg === '--human-report') opts.humanReportPath = take();
    else if (arg === '--timeout') opts.timeoutSec = Number(take());
    else if (arg === '--boot-timeout') opts.bootTimeoutSec = Number(take());
    else if (arg === '--strict') opts.strict = true;
    else if (arg === '--read-only') opts.readOnly = true;
    else if (arg === '--full') opts.fullScope = true;
    else if (arg === '--json') opts.jsonOutput = true;
    else if (arg === '--profile') opts.profile = take();
    else if (arg === '--only') opts.only = take() as HttpSmokeOptions['only'];
    else if (arg === '--keep-stack') opts.keepStack = true;
    else if (arg === '--no-reuse') opts.reuseRunning = false;
  }
  return opts;
}

function inferProfileFromCwd(): string | null {
  // When invoked through a profile's hooks/ dir, __dirname will contain
  // the profile name. Fall back gracefully to cwd heuristics.
  const marker = __dirname.match(/claude-profiles\/([^/]+)\//);
  if (marker) return marker[1];
  return null;
}

export async function bootstrapAuth(api: HttpClient, matrix: MergedMatrix): Promise<AuthContext> {
  const registerSurface = matrix.authDetection.registerSurface ?? null;
  const loginSurface = matrix.authDetection.loginSurface ?? null;

  // If there are no authenticated pages AND no authenticated endpoints,
  // skip bootstrap.
  const needsAuth =
    matrix.pages.some((p) => p.guard === 'authenticated') ||
    matrix.endpoints.some((e) => e.guard === 'authenticated');
  if (!needsAuth) {
    return { bearer: null, email: null, password: null, source: 'skip' };
  }

  if (!registerSurface && !loginSurface) {
    return { bearer: null, email: null, password: null, source: 'skip', error: 'AUTH_UNBOOTSTRAPPABLE:no register or login surface in matrix' };
  }

  const email = process.env.HTTP_SMOKE_SEED_EMAIL ?? `smoke+${Date.now()}@example.com`;
  const password = 'Smoke!Password1';
  const body = { email, password, name: 'Smoke User' };

  if (registerSurface) {
    const response = await api.request(registerSurface, { method: 'POST', body, redirect: 'manual' });
    const token = extractToken(response.bodyJson, response.bodyText);
    if (token) return { bearer: token, email, password, source: 'register' };
    if (response.status === 409 && loginSurface) {
      const loginResponse = await api.request(loginSurface, { method: 'POST', body: { email, password }, redirect: 'manual' });
      const loginToken = extractToken(loginResponse.bodyJson, loginResponse.bodyText);
      if (loginToken) return { bearer: loginToken, email, password, source: 'login' };
    }
  }

  if (loginSurface) {
    const loginResponse = await api.request(loginSurface, { method: 'POST', body: { email, password }, redirect: 'manual' });
    const token = extractToken(loginResponse.bodyJson, loginResponse.bodyText);
    if (token) return { bearer: token, email, password, source: 'login' };
  }

  return { bearer: null, email, password, source: 'skip', error: 'AUTH_BOOTSTRAP_INCONSISTENT:no token obtained from register/login' };
}

function extractToken(json: unknown, _text: string): string | null {
  if (!json || typeof json !== 'object') return null;
  const tokenKeys = ['accessToken', 'access_token', 'token', 'jwt'];
  const stack: unknown[] = [json];
  let iterations = 0;
  while (stack.length > 0 && iterations < 32) {
    iterations++;
    const current = stack.shift();
    if (!current || typeof current !== 'object') continue;
    const record = current as Record<string, unknown>;
    for (const key of tokenKeys) {
      const value = record[key];
      if (typeof value === 'string' && value.length > 10) return value;
    }
    for (const value of Object.values(record)) {
      if (value && typeof value === 'object') stack.push(value);
    }
  }
  return null;
}

// Direct CLI entry.
if (require.main === module) {
  const options = parseArgvOptions(process.argv.slice(2));
  if (!existsSync(join(PROJECT_ROOT, 'node_modules'))) {
    process.stderr.write(
      `PROBE_INTERNAL_ERROR: node_modules missing at ${PROJECT_ROOT}. ` +
        `Run \`pnpm install --frozen-lockfile\` before \`pnpm probe:smoke\`.\n`
    );
    process.exit(2);
  }
  runHttpSmokeMain(options)
    .then((result) => {
      if (options.jsonOutput) process.stdout.write(`${JSON.stringify(result.report, null, 2)}\n`);
      else process.stdout.write(formatSummary(result.report));
      if (result.exitCode !== 0) {
        // Surface the real failure on stderr so Claude Code's Stop-hook
        // feedback shows *why* the probe failed instead of "No stderr output".
        if (result.blockReason) process.stderr.write(`${result.blockReason}\n`);
        for (const failure of result.report.cases.filter((entry) => !entry.passed)) {
          process.stderr.write(`  ✗ ${failure.label}: ${failure.blockReason ?? 'failed'}\n`);
        }
      }
      process.exit(result.exitCode);
    })
    .catch((error) => {
      const detail = error instanceof Error ? error.stack || error.message : String(error);
      process.stderr.write(`PROBE_INTERNAL_ERROR: ${detail}\n`);
      // Invariant: every probe invocation must leave a fresh artifact so the
      // pre-close gate cannot read a stale passing report from an earlier run.
      // An unhandled rejection here means the probe failed before reaching
      // loadMatrix or runBootOrchestrator's own error-write paths.
      try {
        const report: SmokeReport = emptyReport(
          options.profile ?? 'unknown',
          options.fullScope ? 'full' : 'session',
          {
            readOnly: !!options.readOnly,
            strict: !!options.strict,
            fullScope: !!options.fullScope,
          }
        );
        report.exitCode = 2;
        report.blockCodes = ['PROBE_INTERNAL_ERROR'];
        report.blockReason = `PROBE_INTERNAL_ERROR: ${detail.split('\n').slice(0, 20).join('\n')}`;
        writeReport(report, {
          reportPath: options.reportPath,
          humanReportPath: options.humanReportPath,
        });
      } catch {
        // Do not mask the original error — best-effort only.
      }
      process.exit(2);
    });
}

// Silence unused imports under strict mode configurations.
export { generateFixture, join };
