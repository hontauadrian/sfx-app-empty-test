/**
 * contract-flows/flow-runner.ts
 *
 * W5 — execute curated contract flows against a booted API.
 *
 * The runner is a thin loop: for each AttributedSpecialFlow in the merged
 * contract, walk its steps, dispatch each via the adapter registry,
 * aggregate per-step results into a flow-level pass/fail. The runner
 * does NOT re-implement the matrix probe; it is purely the consumer of
 * the adapter contract from `adapter-interface.ts`.
 *
 * Step kinds NOT yet supported by the HTTP adapter (`parallel`,
 * `matrix`, `assertBulk`, `assertSideEffect`) and any flow declaring a
 * `setup[]` entry (resource-graph chain seeding) are reported as
 * `skipped` with an explicit reason. This keeps the runner honest:
 * never claim "passed" for work the adapters declined.
 *
 * Cookie / token primitives (`capture-cookie`, `tamper-cookie`, etc.)
 * are owned by the sibling `CookieJarAdapter` (transport: 'cookie-jar').
 * The runner registers both adapters before walking flows.
 */

import type { Step } from './step-types';
import type { MergedContract, AttributedSpecialFlow } from './contract-flows-merger';
import {
  AdapterRegistry,
  getRegistry,
  __resetRegistryForTests,
} from './adapter-registry';
import type { ExecCtx, StepResult } from './adapter-interface';
import { ContractFlowError, type TypedError } from './errors';

import { HttpAdapter } from './lib/adapters/http-adapter';
import { CookieJarAdapter } from './lib/adapters/cookie-jar-adapter';
import { bootstrapActors, type ActorTokens, type BootstrapResult } from './lib/auth-bootstrap';
import { createFixtureResolver } from './lib/fixtures';

// Step kinds the runner refuses to attempt because the HTTP adapter
// lists them as P2-deferred. Kept in sync with the adapter's switch.
const DEFERRED_STEP_KINDS = new Set<string>([
  'parallel',
  'matrix',
  'assertBulk',
  'assertSideEffect',
]);

export type FlowRunStatus = 'passed' | 'failed' | 'skipped';

export interface FlowStepReport {
  index: number;
  kind: string;
  passed: boolean;
  blockReason?: string;
  capturedBindingNames?: string[];
  /** When this step failed, echoes from the adapter so the renderer
   *  can show the literal request that was issued and the literal
   *  response received. Truncation is the renderer's job — these
   *  carry the un-capped data so other consumers (e.g. test asserts)
   *  can see exactly what the runner saw. */
  requestEcho?: {
    method: string;
    url: string;
    body?: unknown;
    bodyKind?: string;
  };
  responseEcho?: {
    status: number;
    body?: unknown;
  };
}

export interface FlowReport {
  id: string;
  description?: string;
  status: FlowRunStatus;
  reason?: string;
  steps: FlowStepReport[];
  durationMs: number;
  /** When status is 'skipped' with reason 'UPSTREAM_FAILED:<id>', this
   *  carries the failed upstream flow's id. Lets the report group
   *  derived flows under their root cause instead of listing them as
   *  N independent failures. Only set by cascade-detection skips —
   *  unsupported-step skips leave it undefined. */
  derivedOf?: string;
}

export interface RunReport {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;
  flows: FlowReport[];
  /** Bootstrap diagnostics (unreachable login surfaces, etc.). Surfaced
   *  alongside the flow reports so the caller can decide how to treat
   *  them. */
  bootstrapDiagnostics: TypedError[];
  /** Adapter-level errors thrown during flow execution (e.g. unknown
   *  step kind that wasn't on the deferred list). */
  runtimeErrors: TypedError[];
}

export interface RunOptions {
  baseUrl: string;
  /** Override hook for tests. Defaults to globalThis.fetch. */
  fetch?: typeof globalThis.fetch;
  /** Per-step wall-clock timeout in ms. Default 10_000. */
  stepTimeoutMs?: number;
  /** Restrict to a subset of flow IDs (debugging). */
  onlyFlowIds?: ReadonlySet<string>;
  /** Skip the auth-bootstrap step entirely (fast path for tests). */
  skipBootstrap?: boolean;
  /** Prefix to prepend to relative step paths before adapter dispatch
   *  (e.g. NestJS `app.setGlobalPrefix('api/v1')` ⇒ `/api/v1`). Idempotent —
   *  paths already starting with the prefix are left alone. Absolute URLs
   *  (`http://`, `https://`) are passed through unchanged. Default `/api/v1`.
   *  Pass empty string to disable. */
  pathPrefix?: string;
}

/**
 * Apply the configured path prefix to a relative path.
 * - Empty prefix → identity.
 * - Path is `http(s)://...` → identity (absolute URL).
 * - Path already starts with `<prefix>/` or equals `<prefix>` → identity.
 * - Otherwise → `${prefix}${path}` (with a `/` between, deduped).
 */
export function applyPathPrefix(path: string, prefix: string): string {
  if (!prefix) return path;
  if (/^https?:\/\//i.test(path)) return path;
  const normPrefix = prefix.startsWith('/') ? prefix : `/${prefix}`;
  if (path === normPrefix || path.startsWith(`${normPrefix}/`)) return path;
  if (!path.startsWith('/')) return `${normPrefix}/${path}`;
  return `${normPrefix}${path}`;
}

/** Mutate a step in place to apply the path prefix where the step has a path. */
function rewriteStepPath(step: Step, prefix: string): void {
  if (!prefix) return;
  const anyStep = step as Record<string, unknown>;
  if (typeof anyStep.path === 'string') {
    anyStep.path = applyPathPrefix(anyStep.path, prefix);
  }
  // PollStep + AssertIdempotentStep + AssertBulkStep nest the path under
  // `request: { method, path, ... }`. Rewrite there too.
  const req = anyStep.request as { path?: string } | undefined;
  if (req && typeof req.path === 'string') {
    req.path = applyPathPrefix(req.path, prefix);
  }
  // ParallelStep / MatrixStep nest steps; recurse so their child api/poll
  // steps get the same treatment even though the runner currently skips
  // those flows. Cheap and future-proof.
  const branches = anyStep.branches as Array<{ steps?: Step[] }> | undefined;
  if (Array.isArray(branches)) {
    for (const branch of branches) {
      if (Array.isArray(branch.steps)) {
        for (const inner of branch.steps) rewriteStepPath(inner, prefix);
      }
    }
  }
  const template = anyStep.template as { steps?: Step[] } | undefined;
  if (template && Array.isArray(template.steps)) {
    for (const inner of template.steps) rewriteStepPath(inner, prefix);
  }
}

/**
 * Sort flows topologically by their declared `dependsOn` field so that
 * dependencies execute before dependents. This is the structural
 * prerequisite for cascade detection: when a flow fails, every
 * downstream flow declaring it in `dependsOn` must already be queued
 * after the failure has been recorded so the runner can short-circuit
 * them with `UPSTREAM_FAILED:<id>` instead of letting them issue HTTP
 * requests that will fail with confusing cascading errors (404s on
 * captured resources that were never created, etc.).
 *
 * `dependsOn` entries that reference IDs not present in `flows` are
 * ignored — they may legitimately point at auth-bootstrap flows or
 * chains executed outside this loop. Cycles fall back to the original
 * order; the resource-graph builder already surfaces cycles as
 * FLOW_RESOURCE_CYCLE at load time.
 */
export function topoSortFlows(flows: AttributedSpecialFlow[]): AttributedSpecialFlow[] {
  const idToIndex = new Map<string, number>();
  flows.forEach((af, i) => idToIndex.set(af.flow.id, i));

  const incoming: Array<Set<number>> = flows.map(() => new Set());
  const outgoing: Array<Set<number>> = flows.map(() => new Set());
  for (let i = 0; i < flows.length; i++) {
    const deps = (flows[i].flow as { dependsOn?: string[] }).dependsOn ?? [];
    for (const dep of deps) {
      const j = idToIndex.get(dep);
      if (j === undefined) continue; // external dep; ignore
      incoming[i].add(j);
      outgoing[j].add(i);
    }
  }

  const ready: number[] = [];
  for (let i = 0; i < flows.length; i++) {
    if (incoming[i].size === 0) ready.push(i);
  }
  const sorted: AttributedSpecialFlow[] = [];
  while (ready.length > 0) {
    const i = ready.shift()!;
    sorted.push(flows[i]);
    for (const child of outgoing[i]) {
      incoming[child].delete(i);
      if (incoming[child].size === 0) ready.push(child);
    }
  }
  if (sorted.length !== flows.length) {
    // Cycle detected. Fall back to the input order; the cycle is also
    // reported by the resource-graph builder at load time so the human
    // report surfaces it independently.
    return flows;
  }
  return sorted;
}

/** Reasons a flow is skipped (the runner refuses to start it). */
function whyFlowIsSkipped(flow: AttributedSpecialFlow): string | null {
  if (flow.flow.setup && flow.flow.setup.length > 0) {
    return 'setup-step-not-yet-supported';
  }
  for (const step of flow.flow.steps) {
    const kind = (step as { kind: string }).kind;
    if (DEFERRED_STEP_KINDS.has(kind)) {
      return `deferred-step-kind:${kind}`;
    }
  }
  return null;
}

/**
 * Execute every special_flow in the merged contract against the booted
 * API at `baseUrl`. Returns a structured report. Never throws — adapter
 * errors are captured as failed steps.
 */
export async function executeCuratedFlows(
  merged: MergedContract,
  options: RunOptions,
): Promise<RunReport> {
  const startedAt = Date.now();

  // Step 1 — fresh registry for this run; register both adapters.
  // We do NOT reuse the global singleton because http-smoke may run
  // multiple invocations and the singleton's `register()` rejects
  // duplicates loudly.
  // Compute the effective base URL once. The path-prefix (e.g. NestJS
  // `app.setGlobalPrefix('api/v1')`) is part of the API root from the
  // adapter's perspective, so we fold it into baseUrl. Both auth-bootstrap
  // and HttpAdapter then issue requests against the prefixed root and
  // step paths can stay un-prefixed.
  const pathPrefix = options.pathPrefix ?? '/api/v1';
  const trimmedBase = options.baseUrl.replace(/\/+$/, '');
  const trimmedPrefix = pathPrefix
    ? (pathPrefix.startsWith('/') ? pathPrefix : `/${pathPrefix}`)
    : '';
  const effectiveBaseUrl = trimmedPrefix ? `${trimmedBase}${trimmedPrefix}` : trimmedBase;

  __resetRegistryForTests();
  const registry: AdapterRegistry = getRegistry();
  const fixtureResolver = createFixtureResolver({ fixtures: merged.fixtures });
  const httpAdapter = new HttpAdapter(
    effectiveBaseUrl,
    {
      fetch: options.fetch,
      timeoutMs: options.stepTimeoutMs ?? 10_000,
      fixtureResolver,
      testEndpoints: extractTestEndpoints(merged),
    },
    merged,
  );
  registry.register(httpAdapter);
  registry.register(new CookieJarAdapter());

  // Step 2 — populate ActorTokens. Failures are diagnostics, not
  // showstoppers: anonymous flows still run, role-gated flows that
  // need a missing actor will fail at setAuth time with a clear reason.
  let bootstrapDiagnostics: TypedError[] = [];
  let actorTokens: ActorTokens = {};
  if (!options.skipBootstrap) {
    const bootResult: BootstrapResult = await bootstrapActors(merged, {
      baseUrl: effectiveBaseUrl,
      fetch: options.fetch,
    });
    actorTokens = bootResult.tokens;
    bootstrapDiagnostics = bootResult.diagnostics;
  }
  httpAdapter.setActorTokens(actorTokens);

  // Step 3 — walk flows in topological order so the cascade detector
  // can short-circuit downstream flows when an upstream dependency
  // fails. Without ordering, a flow declaring `dependsOn: ['chain-X']`
  // could be visited before chain-X's status is known.
  const orderedFlows = topoSortFlows(merged.specialFlows);

  // Failed flow IDs accumulate as the loop walks the topo order. A
  // flow is downgraded from "would-fail" to "skipped:UPSTREAM_FAILED"
  // the moment any of its declared dependencies is in this set —
  // before any HTTP request is issued. This collapses N derived
  // failures into one root cause in the report and saves the wall
  // clock that would have been spent issuing requests guaranteed to
  // fail because of the upstream gap.
  const failedFlowIds = new Set<string>();

  const reports: FlowReport[] = [];
  const runtimeErrors: TypedError[] = [];

  for (const af of orderedFlows) {
    if (options.onlyFlowIds && !options.onlyFlowIds.has(af.flow.id)) continue;

    // Cascade detection: any declared dependency already failed?
    const deps = (af.flow as { dependsOn?: string[] }).dependsOn ?? [];
    const failedDep = deps.find((d) => failedFlowIds.has(d));
    if (failedDep !== undefined) {
      reports.push({
        id: af.flow.id,
        description: af.flow.description,
        status: 'skipped',
        reason: `UPSTREAM_FAILED:${failedDep}`,
        derivedOf: failedDep,
        steps: [],
        durationMs: 0,
      });
      continue;
    }

    const skipReason = whyFlowIsSkipped(af);
    if (skipReason) {
      reports.push({
        id: af.flow.id,
        description: af.flow.description,
        status: 'skipped',
        reason: skipReason,
        steps: [],
        durationMs: 0,
      });
      continue;
    }
    // Path prefix is folded into HttpAdapter's baseUrl (and bootstrap's)
    // above, so step paths stay un-prefixed and the adapter's joinUrl
    // produces the correct concatenation. No per-step rewrite needed.
    const flowReport = await runOneFlow(af, registry, runtimeErrors);
    if (flowReport.status === 'failed') {
      failedFlowIds.add(af.flow.id);
    }
    reports.push(flowReport);
  }

  const passed = reports.filter((r) => r.status === 'passed').length;
  const failed = reports.filter((r) => r.status === 'failed').length;
  const skipped = reports.filter((r) => r.status === 'skipped').length;

  return {
    total: reports.length,
    passed,
    failed,
    skipped,
    durationMs: Date.now() - startedAt,
    flows: reports,
    bootstrapDiagnostics,
    runtimeErrors,
  };
}

async function runOneFlow(
  af: AttributedSpecialFlow,
  registry: AdapterRegistry,
  runtimeErrors: TypedError[],
): Promise<FlowReport> {
  const startedAt = Date.now();
  const stepReports: FlowStepReport[] = [];
  const ctx: ExecCtx = {
    bindings: {},
    flowId: af.flow.id,
    client: undefined,
    flowScratch: new Map<string, unknown>(),
  };

  let firstFailureReason: string | undefined;

  for (let i = 0; i < af.flow.steps.length; i++) {
    const step: Step = af.flow.steps[i];
    const kind = (step as { kind: string }).kind;
    let result: StepResult;
    try {
      const adapter = registry.resolve(step);
      result = await adapter.execute(step, ctx);
    } catch (e) {
      if (e instanceof ContractFlowError) {
        runtimeErrors.push(e.typed);
        result = { passed: false, blockReason: `${e.typed.code}: ${e.message}` };
      } else {
        const message = e instanceof Error ? e.message : String(e);
        result = { passed: false, blockReason: `runtime-error: ${message}` };
      }
    }

    const captured = result.capturedBindings;
    if (captured) {
      for (const [k, v] of Object.entries(captured)) {
        ctx.bindings[k] = v;
      }
    }

    stepReports.push({
      index: i,
      kind,
      passed: result.passed,
      blockReason: result.passed ? undefined : result.blockReason,
      capturedBindingNames: captured ? Object.keys(captured) : undefined,
      // Carry adapter-emitted echoes through to the FlowStepReport so
      // the smoke-report renderer can show the agent the literal
      // request/response pair, eliminating a 5-turn loop of "look at
      // logs, curl manually, hypothesise" with a single self-contained
      // diagnostic.
      requestEcho: result.passed ? undefined : result.requestEcho,
      responseEcho: result.passed ? undefined : result.responseEcho,
    });

    if (!result.passed) {
      if (firstFailureReason === undefined) {
        firstFailureReason = result.blockReason ?? 'step-failed';
      }
      // Stop walking on first failure — downstream steps depend on the
      // captured bindings of failed steps and would emit cascading
      // false-failures. Aggregate one root-cause per flow.
      break;
    }
  }

  const status: FlowRunStatus = firstFailureReason === undefined ? 'passed' : 'failed';
  return {
    id: af.flow.id,
    description: af.flow.description,
    status,
    reason: firstFailureReason,
    steps: stepReports,
    durationMs: Date.now() - startedAt,
  };
}

/**
 * Pull the test-endpoint registry from the merged config. Falls back to
 * an empty record so the HttpAdapter's wait-step uses its built-in
 * default. Phase 1 §_shared.test_endpoints currently lives only in the
 * config block; later contract revisions may surface it more directly.
 */
function extractTestEndpoints(merged: MergedContract): Record<string, string> {
  const out: Record<string, string> = {};
  if (merged.config.clockAdvanceEndpoint) {
    out.clockAdvance = merged.config.clockAdvanceEndpoint;
  }
  return out;
}

/** Pretty-print the run report as a one-line probe log entry. */
export function formatRunSummary(report: RunReport): string {
  const parts = [
    `total=${report.total}`,
    `passed=${report.passed}`,
    `failed=${report.failed}`,
    `skipped=${report.skipped}`,
    `duration=${report.durationMs}ms`,
  ];
  if (report.bootstrapDiagnostics.length > 0) {
    parts.push(`bootstrap-diagnostics=${report.bootstrapDiagnostics.length}`);
  }
  if (report.runtimeErrors.length > 0) {
    parts.push(`runtime-errors=${report.runtimeErrors.length}`);
  }
  return `[contract-flows-execute] ${parts.join(' ')}`;
}
