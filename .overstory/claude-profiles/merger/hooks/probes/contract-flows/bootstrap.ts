/**
 * contract-flows/bootstrap.ts
 *
 * Decision 7 — bootstrap is a starting point, not the answer.
 *
 * Reads the project OpenAPI surface (file/command/http per flows.config.json)
 * and writes a draft `<task-id>.json` under .overstory/runtime-contract.flows/.
 *
 * Source attribution lives on every special_flow's `contract.source` field
 * (the schema's free-form string slot):
 *
 *   - Bootstrap-generated entries set `contract.source` starting with the
 *     `BOOTSTRAP_SOURCE_PREFIX` ('bootstrap:openapi:').
 *   - Lead-curated entries use any other source string (typically
 *     'plan-<task-id> §<n>' or 'hand'). On re-run, anything NOT starting
 *     with the bootstrap prefix is preserved verbatim.
 *
 * The prefix scheme is deliberate: contract.source is already required +
 * validated, so we re-use it instead of bolting a parallel attribution
 * field onto a strict schema. JSON has no comments — this is the only
 * place attribution can live without weakening the contract shape.
 *
 * The script intentionally seeds only the trivially-inferable surface:
 *
 *   1. One happy-path `:happy` flow per OpenAPI operation.
 *   2. One `:status-<code>` flow per declared 4xx/5xx response code.
 *
 * Cross-tenant, business rules, state transitions, idempotency, async
 * polling and side-effects are NOT inferred — the lead adds those by hand
 * via the `task-flow-authoring` skill.
 *
 * Usage:
 *   pnpm flows:bootstrap --task=<task-id>
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────

/** Prefix used on every bootstrap-generated `contract.source` value.
 *  Re-run preservation is keyed on this exact prefix — change cautiously. */
export const BOOTSTRAP_SOURCE_PREFIX = 'bootstrap:openapi:';

/** Prefix used when --scope=<glob> filters the OpenAPI surface. Distinct
 *  from the unscoped prefix so re-runs can tell scoped seeds from full-spec
 *  seeds; both share preservation semantics: anything NOT starting with
 *  either prefix (i.e. lead-curated) is preserved verbatim. */
export const BOOTSTRAP_SCOPED_SOURCE_PREFIX = 'bootstrap:scoped:openapi:';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

interface FlowsConfig {
  openapi:
    | { source: 'file'; path: string }
    | { source: 'command'; command: string; path?: string }
    | { source: 'http'; url: string };
  schema?: { source: string; path: string };
  apiBaseUrl: string;
  flowsDir: string;
}

interface OpenApiResponse {
  description?: string;
}

interface OpenApiOperation {
  operationId?: string;
  summary?: string;
  responses?: Record<string, OpenApiResponse>;
}

type OpenApiPathItem = Partial<Record<
  'get' | 'post' | 'put' | 'patch' | 'delete' | 'options' | 'head',
  OpenApiOperation
>>;

interface OpenApiDoc {
  paths?: Record<string, OpenApiPathItem>;
}

interface BootstrapStep {
  kind: 'api' | 'expect';
  [key: string]: unknown;
}

interface BootstrapSpecialFlow {
  id: string;
  description: string;
  contract: { kind: string; source: string; endpoint: string };
  steps: BootstrapStep[];
}

interface ContractFileShape {
  version: 1;
  task_id: string;
  owns: unknown[];
  extends?: unknown[];
  actors?: unknown[];
  resources?: unknown[];
  special_flows?: Array<BootstrapSpecialFlow & Record<string, unknown>>;
  config?: unknown;
}

// ────────────────────────────────────────────────────────────────────────────
// CLI
// ────────────────────────────────────────────────────────────────────────────

interface CliArgs {
  taskId: string;
  configPath: string;
  cwd: string;
  /**
   * Optional path-prefix filter applied to OpenAPI operations. Comma-separated;
   * each entry matches operations whose path starts with the entry. When set,
   * generated entries use prefix `bootstrap:scoped:openapi:` so a re-run can
   * tell scoped seeds from full-spec seeds. Curated entries (any other
   * `contract.source` value) are preserved verbatim regardless of scope.
   */
  scope?: readonly string[];
}

export function parseArgs(argv: readonly string[]): CliArgs {
  const args = argv.slice();
  let taskId: string | null = null;
  let configPath = 'flows.config.json';
  let scope: string[] | undefined;
  for (const raw of args) {
    if (raw.startsWith('--task=')) taskId = raw.slice('--task='.length);
    else if (raw.startsWith('--config=')) configPath = raw.slice('--config='.length);
    else if (raw.startsWith('--scope=')) {
      scope = raw.slice('--scope='.length).split(',').map((s) => s.trim()).filter(Boolean);
    }
  }
  if (!taskId) {
    throw new Error('Missing required --task=<task-id>');
  }
  if (!/^[A-Za-z0-9_-]+$/.test(taskId)) {
    throw new Error(`Invalid --task value '${taskId}': must match [A-Za-z0-9_-]+`);
  }
  return { taskId, configPath, cwd: process.cwd(), scope };
}

export function loadConfig(configPath: string, cwd: string): FlowsConfig {
  const abs = resolve(cwd, configPath);
  if (!existsSync(abs)) {
    throw new Error(`flows.config.json not found at ${abs}`);
  }
  const raw = JSON.parse(readFileSync(abs, 'utf8'));
  if (!raw.flowsDir) {
    throw new Error(`flows.config.json missing 'flowsDir'`);
  }
  if (!raw.openapi?.source) {
    throw new Error(`flows.config.json missing 'openapi.source'`);
  }
  return raw as FlowsConfig;
}

// ────────────────────────────────────────────────────────────────────────────
// OpenAPI loading
// ────────────────────────────────────────────────────────────────────────────

export function loadOpenApi(config: FlowsConfig, cwd: string): OpenApiDoc {
  const src = config.openapi;
  if (src.source === 'file') {
    const abs = resolve(cwd, src.path);
    if (!existsSync(abs)) {
      throw new Error(`OpenAPI file not found at ${abs}. Generate it first.`);
    }
    return JSON.parse(readFileSync(abs, 'utf8'));
  }
  if (src.source === 'command') {
    if (src.path && existsSync(resolve(cwd, src.path))) {
      return JSON.parse(readFileSync(resolve(cwd, src.path), 'utf8'));
    }
    const out = execSync(src.command, { cwd, encoding: 'utf8' });
    return JSON.parse(out);
  }
  // http
  throw new Error(`OpenAPI source 'http' is not supported by bootstrap (would require a running server). Use 'file' or 'command'.`);
}

// ────────────────────────────────────────────────────────────────────────────
// Seed generation
// ────────────────────────────────────────────────────────────────────────────

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;
type HttpMethod = typeof HTTP_METHODS[number];

export function generateSeedFlows(
  doc: OpenApiDoc,
  taskId: string,
  scope?: readonly string[],
): BootstrapSpecialFlow[] {
  const seeds: BootstrapSpecialFlow[] = [];
  const paths = doc.paths ?? {};
  const scoped = scope && scope.length > 0;
  const sourcePrefix = scoped ? BOOTSTRAP_SCOPED_SOURCE_PREFIX : BOOTSTRAP_SOURCE_PREFIX;
  for (const [pathKey, item] of Object.entries(paths)) {
    if (!item) continue;
    if (scoped && !scope!.some((s) => pathKey.startsWith(s))) continue;
    for (const method of HTTP_METHODS) {
      const op = item[method];
      if (!op) continue;
      seeds.push(buildHappyFlow(taskId, method, pathKey, op, sourcePrefix));
      const responses = op.responses ?? {};
      for (const status of Object.keys(responses).sort()) {
        if (!/^\d{3}$/.test(status)) continue;
        const code = Number(status);
        if (code < 400) continue;
        seeds.push(buildStatusFlow(taskId, method, pathKey, code, sourcePrefix));
      }
    }
  }
  return seeds;
}

function buildHappyFlow(
  taskId: string,
  method: HttpMethod,
  pathKey: string,
  op: OpenApiOperation,
  sourcePrefix: string,
): BootstrapSpecialFlow {
  const slug = sanitizeSlug(`${method}:${pathKey}:happy`);
  const id = `${taskId}:${slug}`;
  const description = op.summary ?? `${method.toUpperCase()} ${pathKey} happy path`;
  const successStatus = pickHappyStatus(op);
  return {
    id,
    description,
    contract: {
      kind: 'happy',
      source: `${sourcePrefix}happy`,
      endpoint: `${method.toUpperCase()} ${pathKey}`,
    },
    steps: [
      { kind: 'api', transport: 'http', method: method.toUpperCase(), path: pathKey },
      { kind: 'expect', status: successStatus },
    ],
  };
}

function buildStatusFlow(
  taskId: string,
  method: HttpMethod,
  pathKey: string,
  status: number,
  sourcePrefix: string,
): BootstrapSpecialFlow {
  const slug = sanitizeSlug(`${method}:${pathKey}:status-${status}`);
  const id = `${taskId}:${slug}`;
  const description = `${method.toUpperCase()} ${pathKey} declared status ${status}`;
  return {
    id,
    description,
    contract: {
      kind: 'status',
      source: `${sourcePrefix}status-${status}`,
      endpoint: `${method.toUpperCase()} ${pathKey}`,
    },
    steps: [
      { kind: 'api', transport: 'http', method: method.toUpperCase(), path: pathKey },
      { kind: 'expect', status },
    ],
  };
}

function pickHappyStatus(op: OpenApiOperation): number {
  const responses = op.responses ?? {};
  const codes = Object.keys(responses).filter((k) => /^2\d\d$/.test(k));
  if (codes.length === 0) return 200;
  return Number(codes.sort()[0]);
}

function sanitizeSlug(raw: string): string {
  return raw.replace(/[^A-Za-z0-9._:-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

// ────────────────────────────────────────────────────────────────────────────
// File writing — preserve curated entries
// ────────────────────────────────────────────────────────────────────────────

/** True when an entry's contract.source identifies it as bootstrap-generated
 *  (either full-spec or scoped). Curated entries use any other source string. */
export function isBootstrapGenerated(flow: { contract?: { source?: string } }): boolean {
  const src = flow.contract?.source;
  if (typeof src !== 'string') return false;
  return src.startsWith(BOOTSTRAP_SOURCE_PREFIX) || src.startsWith(BOOTSTRAP_SCOPED_SOURCE_PREFIX);
}

interface RenderResult {
  content: ContractFileShape;
  preserved: number;
  refreshed: number;
  added: number;
}

/** Build the next contract-file shape: preserve curated entries (those whose
 *  `contract.source` does NOT start with the bootstrap prefix) and merge in
 *  fresh seeds for the remaining ids. */
export function renderFlowFile(
  taskId: string,
  existing: ContractFileShape | null,
  seeds: BootstrapSpecialFlow[],
): RenderResult {
  const existingFlows = existing?.special_flows ?? [];
  const curated = existingFlows.filter((f) => !isBootstrapGenerated(f));
  const previousGeneratedIds = new Set(
    existingFlows.filter((f) => isBootstrapGenerated(f)).map((f) => f.id),
  );

  const curatedIds = new Set(curated.map((f) => f.id));
  const freshGenerated = seeds.filter((s) => !curatedIds.has(s.id));

  const refreshedCount = freshGenerated.filter((s) => previousGeneratedIds.has(s.id)).length;
  const addedCount = freshGenerated.length - refreshedCount;

  const next: ContractFileShape = {
    version: 1,
    task_id: taskId,
    owns: existing?.owns ?? [],
    ...(existing?.extends ? { extends: existing.extends } : {}),
    ...(existing?.actors ? { actors: existing.actors } : {}),
    ...(existing?.resources ? { resources: existing.resources } : {}),
    special_flows: [...curated, ...freshGenerated],
    ...(existing?.config ? { config: existing.config } : {}),
  };

  return {
    content: next,
    preserved: curated.length,
    refreshed: refreshedCount,
    added: addedCount,
  };
}

interface WriteResult {
  written: boolean;
  reason: 'created' | 'updated';
  preserved: number;
  refreshed: number;
  added: number;
}

export function writeFlowFile(
  taskId: string,
  flowsDir: string,
  cwd: string,
  seeds: BootstrapSpecialFlow[],
): WriteResult {
  const dirAbs = resolve(cwd, flowsDir);
  const fileAbs = join(dirAbs, `${taskId}.json`);
  const existed = existsSync(fileAbs);
  const existing: ContractFileShape | null = existed
    ? (JSON.parse(readFileSync(fileAbs, 'utf8')) as ContractFileShape)
    : null;
  const rendered = renderFlowFile(taskId, existing, seeds);
  if (!existsSync(dirAbs)) mkdirSync(dirAbs, { recursive: true });
  writeFileSync(fileAbs, JSON.stringify(rendered.content, null, 2) + '\n', 'utf8');
  return {
    written: true,
    reason: existed ? 'updated' : 'created',
    preserved: rendered.preserved,
    refreshed: rendered.refreshed,
    added: rendered.added,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Entry point
// ────────────────────────────────────────────────────────────────────────────

export function runBootstrap(argv: readonly string[]): WriteResult {
  const args = parseArgs(argv);
  const config = loadConfig(args.configPath, args.cwd);
  const doc = loadOpenApi(config, args.cwd);
  const seeds = generateSeedFlows(doc, args.taskId, args.scope);
  return writeFlowFile(args.taskId, config.flowsDir, args.cwd, seeds);
}

// Auto-run when invoked as `tsx bootstrap.ts ...`
const isMain = (() => {
  try {
    const entry = process.argv[1] ?? '';
    return entry.endsWith('bootstrap.ts') || entry.endsWith('bootstrap.js');
  } catch {
    return false;
  }
})();

if (isMain) {
  try {
    const result = runBootstrap(process.argv.slice(2));
    process.stdout.write(
      `[flows:bootstrap] ${result.reason}: ${result.preserved} curated preserved, ` +
        `${result.refreshed} generated refreshed, ${result.added} new generated\n`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[flows:bootstrap] ERROR: ${message}\n`);
    process.exit(1);
  }
}
