/**
 * JSON + human-readable report writers.
 *
 * The JSON file at `.claude/hooks/.http-smoke.json` is the contract the
 * downstream Stop hooks (e2e-test-on-stop, verify-full-contract) read.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PROJECT_ROOT } from './shared';
import { ProbeCaseResult, RuntimeDiagnostic } from './assertion-library';

export interface SmokeCaseEntry extends ProbeCaseResult {
  category: 'page' | 'endpoint' | 'flow' | 'middleware' | 'auth-bootstrap';
  /** When set, this case was skipped because its declared dependency
   *  (`flow.dependsOn`) failed earlier in the topological walk. The
   *  value is the upstream flow id. The case still counts as passed
   *  in the summary (skipped flows are not failures) but the human
   *  report groups it under its root cause instead of letting it
   *  appear as an independent symptom. */
  derivedOf?: string;
  /** Echo of the request that was issued by the failing step, so the
   *  agent can see the literal payload without grepping logs. Bodies
   *  are rendered with a hard byte cap by `formatHumanReport`. */
  requestEcho?: {
    method: string;
    url: string;
    body?: unknown;
    bodyKind?: string;
  };
  /** Echo of the response associated with the failing step. */
  responseEcho?: {
    status: number;
    body?: unknown;
  };
}

export interface SmokeReport {
  version: '1';
  generatedAt: string;
  projectDir: string;
  scope: 'session' | 'full' | string;
  profile: string;
  mode: {
    readOnly: boolean;
    strict: boolean;
    fullScope: boolean;
  };
  stack: {
    ownership: 'owner' | 'guest' | 'none';
    ports: Record<string, number | undefined>;
    reused: boolean;
    bootPlanDriver: string;
  };
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    durationMs: number;
  };
  exitCode: 0 | 1 | 2 | 3 | 4;
  blockReason?: string;
  blockCodes: string[];
  cases: SmokeCaseEntry[];
  runtimeDiagnostics?: RuntimeDiagnostic[];
  /**
   * Auth-bootstrap failures from the curated-flows runner. Each entry is a
   * TypedError shaped like FlowAuthBootstrapActorFailedError ({ code,
   * actorName, scheme, reason, message }) — the runner produces them when an
   * actor's `auth` block can't be resolved (unknown scheme, login HTTP
   * error, missing required field). Surfaced here so JSON consumers + the
   * human report can show the agent which actor failed to authenticate
   * BEFORE listing the N derived flow failures it caused.
   */
  bootstrapDiagnostics?: ReadonlyArray<{ code: string; message: string } & Record<string, unknown>>;
  /**
   * Contract-flows loader/schema errors detected before any case runs
   * (FLOW_FILE_MISSING_OWNS_OR_EXTENDS, FLOW_MERGE_CONFLICT, FLOW_DUPLICATE_ID,
   * FLOW_TASK_ID_MISMATCH, FLOW_COVERAGE_TEMPLATE_UNKNOWN, etc). Each entry is
   * a TypedError from `contract-flows/errors.ts` — JSON-shaped so external
   * tooling (e.g. probe-run-with-ownership-check.sh) can dispatch
   * remediation mail by `code` without stdout regex.
   */
  loaderDiagnostics?: ReadonlyArray<{ code: string; message: string } & Record<string, unknown>>;
  /**
   * Diagnostics emitted by flows-generator.js when it generates the auto
   * battery — MISSING_BODY_RESOURCE_REF, CONTRACT_STATUS_UNREACHABLE_UNGENERATABLE,
   * and similar codes that indicate the controller is missing an
   * x-probe-* extension the generator needs to produce a valid flow.
   * Same shape as loaderDiagnostics so the wrapper handles both uniformly.
   */
  generatorDiagnostics?: ReadonlyArray<{ code: string; message: string } & Record<string, unknown>>;
  /**
   * Last lines of stack stderr captured by the boot orchestrator when boot
   * fails. Surfaced verbatim in formatSummary so an agent that pipes the
   * probe output to `tail -N` sees the actual TypeError / crash, not just
   * `[http-smoke-block] STACK_BOOT_FAILED:stack:...`.
   */
  bootLogs?: string;
}

export interface WriteReportOptions {
  reportPath?: string;
  humanReportPath?: string;
}

export function writeReport(report: SmokeReport, options: WriteReportOptions = {}): void {
  const jsonPath = options.reportPath ?? join(PROJECT_ROOT, '.claude', 'hooks', '.http-smoke.json');
  mkdirSync(dirname(jsonPath), { recursive: true });
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  const humanPath = options.humanReportPath ?? join(PROJECT_ROOT, '.claude', 'hook-reports', `http-smoke-${Date.now()}.md`);
  try {
    mkdirSync(dirname(humanPath), { recursive: true });
    writeFileSync(humanPath, formatHumanReport(report));
  } catch {
    // Non-fatal: human report is opacity-governed; probe must not fail on write.
  }
}

export function formatHumanReport(report: SmokeReport): string {
  const lines: string[] = [];
  lines.push(`# HTTP Smoke Report — ${report.generatedAt}`);
  lines.push('');
  lines.push(`- Profile: ${report.profile}`);
  lines.push(`- Scope: ${report.scope}`);
  lines.push(`- Mode: read-only=${report.mode.readOnly} strict=${report.mode.strict} full=${report.mode.fullScope}`);
  lines.push(`- Stack: ownership=${report.stack.ownership} driver=${report.stack.bootPlanDriver}`);
  lines.push(`- Exit: ${report.exitCode}`);
  lines.push(`- Summary: ${report.summary.passed}/${report.summary.total} passed (${report.summary.failed} failed, ${report.summary.skipped} skipped) in ${report.summary.durationMs}ms`);
  lines.push('');
  if (report.blockReason) {
    lines.push('## Block reason');
    lines.push('');
    lines.push(`\`${report.blockReason}\``);
    lines.push('');
  }
  if (report.blockCodes.length > 0) {
    lines.push('## Block codes');
    lines.push('');
    for (const code of report.blockCodes) lines.push(`- ${code}`);
    lines.push('');
  }
  // Bootstrap diagnostics surface FIRST among defect sections so the agent
  // sees auth-actor failures before scrolling through N flow failures that
  // cascade from them. Every authed flow downstream of a failed actor gets
  // 401 from the server and shows up below — fixing the actor here resolves
  // the whole cluster in one edit.
  if (report.bootstrapDiagnostics && report.bootstrapDiagnostics.length > 0) {
    lines.push('## Bootstrap diagnostics');
    lines.push('');
    lines.push('Authed flows depending on these actors will fail or be skipped — fix here to clear the cascade:');
    lines.push('');
    for (const diag of report.bootstrapDiagnostics) {
      const actor = (diag as Record<string, unknown>).actorName;
      const scheme = (diag as Record<string, unknown>).scheme;
      const reason = (diag as Record<string, unknown>).reason;
      if (typeof actor === 'string') {
        lines.push(`- **actor=${actor}** scheme=${String(scheme ?? 'unknown')} — ${String(reason ?? diag.message)}`);
      } else {
        lines.push(`- **${diag.code}** ${diag.message}`);
      }
    }
    lines.push('');
  }
  const failed = report.cases.filter((c) => !c.passed);
  if (failed.length > 0) {
    lines.push('## Failures');
    lines.push('');
    for (const entry of failed) {
      lines.push(`### ${entry.label} [${entry.category}]`);
      if (entry.blockReason) lines.push(`- reason: \`${entry.blockReason}\``);
      if (typeof entry.status === 'number') lines.push(`- status: ${entry.status}`);
      if (entry.finalUrl) lines.push(`- finalUrl: ${entry.finalUrl}`);
      if (entry.location) lines.push(`- location: ${entry.location}`);
      if (typeof entry.elapsedMs === 'number') lines.push(`- elapsedMs: ${entry.elapsedMs}`);
      if (entry.hint) lines.push(`- hint: ${entry.hint}`);
      // Request/response echoes: inline the literal pair the runner
      // saw, capped at REPORT_BODY_CAP bytes so a verbose JSON payload
      // doesn't drown the rest of the report. Renderer never expands
      // recursively — `previewJson` flattens once and slices.
      if (entry.requestEcho) {
        lines.push(`- sent: \`${entry.requestEcho.method} ${entry.requestEcho.url}\``);
        const sentBody = previewJson(entry.requestEcho.body, entry.requestEcho.bodyKind);
        if (sentBody !== null) lines.push(`  - body: \`${sentBody}\``);
      }
      if (entry.responseEcho) {
        const gotBody = previewJson(entry.responseEcho.body);
        const head = `- got: \`status=${entry.responseEcho.status}\``;
        lines.push(gotBody !== null ? `${head} body=\`${gotBody}\`` : head);
      }
      lines.push('');
    }
  }

  // Cascade-skipped cases: group by their root cause so a single bad
  // chain step does not look like N independent symptoms.
  const cascaded = report.cases.filter((c) => c.derivedOf);
  if (cascaded.length > 0) {
    const byRoot = new Map<string, SmokeCaseEntry[]>();
    for (const entry of cascaded) {
      const root = entry.derivedOf as string;
      const list = byRoot.get(root) ?? [];
      list.push(entry);
      byRoot.set(root, list);
    }
    lines.push('## Derived flows skipped (cascade)');
    lines.push('');
    lines.push('These flows were not run because a flow they declare in `dependsOn` failed earlier in the topological walk. Fix the root cause and the derived flows will run on the next probe.');
    lines.push('');
    for (const [root, derived] of byRoot.entries()) {
      lines.push(`### Root: \`${root}\` (${derived.length} derived)`);
      for (const entry of derived) {
        lines.push(`- ${entry.label}`);
      }
      lines.push('');
    }
  }
  const diags = report.runtimeDiagnostics ?? [];
  if (diags.length > 0) {
    lines.push('## Runtime diagnostics');
    lines.push('');
    for (const diag of diags) {
      lines.push(`- **${diag.code}** [${diag.level}]: ${JSON.stringify(diag.details)}`);
    }
    lines.push('');
  }
  if (report.bootLogs && report.bootLogs.trim().length > 0) {
    lines.push('## Stack boot stderr (tail)');
    lines.push('');
    lines.push('```');
    lines.push(report.bootLogs.trimEnd());
    lines.push('```');
    lines.push('');
  }
  return lines.join('\n');
}

/**
 * Render a body value for the failure report. Returns `null` if the
 * value is undefined or the body kind has no useful preview (e.g.
 * binary or multipart, where the wire payload is opaque). Otherwise
 * returns a JSON-serialised, single-line preview of the full payload.
 *
 * Non-heuristic by construction: serialise → flatten. No regex
 * matching, no field-importance ranking, no truncation. Whitespace is
 * collapsed so the preview stays on one line so the markdown renderer
 * doesn't break inside a code span. The full payload is always
 * preserved — typical API request/response bodies are well under 1
 * KiB and the agent benefits from seeing every field.
 */
function previewJson(value: unknown, bodyKind?: string): string | null {
  if (value === undefined) {
    if (bodyKind && bodyKind !== 'json') return `<${bodyKind} body — not echoed>`;
    return null;
  }
  let serialised: string;
  try {
    serialised = JSON.stringify(value);
  } catch {
    serialised = String(value);
  }
  return serialised.replace(/\s+/g, ' ').trim();
}

// Minimal symptom→skill router. Returns the skill name to invoke, or null
// when no specific recommendation applies (so we stay quiet by default).
// Keep matchers narrow — false positives are worse than no hint.
function hintForFailure(label: string, reason: string): string | null {
  const r = reason || '';
  const l = label || '';
  if (/RESOURCE_CAPTURE_(UNDECLARED|PATHPARAM_UNDECLARED)/.test(r)) return 'build-verifiable-features';
  if (l.includes('chain:resource-setup') && /step2/.test(l)) return 'build-verifiable-features';
  if (/CONTRACT_STATUS_UNREACHABLE_UNGENERATABLE/.test(r)) return 'nestjs-probe-coverage';
  if (/auth-bootstrap|register-with-auto-login|refresh-token/i.test(r + l)) return 'nestjs-probe-coverage';
  if (/\bcookie\b|\bcsrf\b/i.test(r)) return 'nestjs-probe-coverage';
  if (/status === 401/.test(r)) return 'nestjs-probe-coverage';
  return null;
}

export function formatSummary(report: SmokeReport): string {
  const lines: string[] = [];
  const failed = report.cases.filter((c) => !c.passed);

  // Emit failure header BEFORE per-case listing so `| tail -N` catches failures.
  if (failed.length > 0) {
    lines.push('');
    lines.push('═══════════════════════════════════════════════════════════════');
    lines.push(`[http-smoke-FAIL] ${failed.length} cases failed out of ${report.summary.total}`);
    lines.push('═══════════════════════════════════════════════════════════════');
    lines.push('');

    // Cluster failures by (status, body-fingerprint) so cascades collapse
    // into a single root-cause line. A single 404 missing-user cascades
    // into every dependent chain probe (patch, delete, role-change),
    // listing them as 24 distinct failures hides the real signal. The
    // cluster view shows the root issue plus the count of affected
    // flows so the agent fixes one thing and re-runs.
    const clusters = clusterFailures(failed);
    if (clusters.length > 0) {
      lines.push('Root-cause clusters — fix the root and dependent failures clear together:');
      lines.push('');
      for (const cluster of clusters) {
        const clusterLabel = cluster.signature || 'unclassified';
        lines.push(`  • ${clusterLabel}`);
        lines.push(`    affects ${cluster.cases.length} flows:`);
        for (const member of cluster.cases.slice(0, 5)) {
          lines.push(`      - ${member.label}`);
        }
        if (cluster.cases.length > 5) {
          lines.push(`      … and ${cluster.cases.length - 5} more`);
        }
        const skillHint = hintForFailure(cluster.cases[0].label, cluster.cases[0].blockReason ?? '');
        if (skillHint) lines.push(`    fix with skill: ${skillHint}`);
        lines.push('');
      }
      lines.push('───────────────────────────────────────────────────────────────');
      lines.push('');
    }

    for (const entry of failed) {
      lines.push(`  ✗ ${entry.label}${typeof entry.status === 'number' ? ` [${entry.status}]` : ''}`);
      lines.push(`    reason: ${entry.blockReason ?? 'failed'}`);
      const skill = hintForFailure(entry.label, entry.blockReason ?? '');
      if (skill) lines.push(`    fix with skill: ${skill}`);
      if (entry.failureContext) {
        lines.push(`    contract: ${entry.failureContext.contractSource}`);
        lines.push(`    implies:  ${entry.failureContext.implies}`);
        if (entry.failureContext.checkPaths.length > 0) {
          lines.push(`    check:`);
          for (const checkPath of entry.failureContext.checkPaths) {
            lines.push(`      - ${checkPath}`);
          }
        }
      }
      lines.push('');
    }
    lines.push('───────────────────────────────────────────────────────────────');
  }

  lines.push('');
  lines.push('HTTP-smoke results:');
  for (const entry of report.cases) {
    const glyph = entry.passed ? '✓' : '✗';
    const status = typeof entry.status === 'number' ? ` [${entry.status}]` : '';
    const extra = entry.passed ? '' : `  ← ${entry.blockReason ?? 'failed'}`;
    lines.push(`  ${glyph} ${entry.label}${status}${extra}`);
  }
  const smkDiags = report.runtimeDiagnostics ?? [];
  if (smkDiags.length > 0) {
    lines.push('');
    lines.push(`[http-smoke-runtime-diagnostics] ${smkDiags.length} diagnostic(s):`);
    for (const diag of smkDiags) {
      lines.push(`  [${diag.level}] ${diag.code}: ${JSON.stringify(diag.details)}`);
    }
  }
  // Bootstrap-failure summary in the stdout block too — same data, now next
  // to the case list so an agent doing `tail -N` sees actor→reason inline
  // without separately greping `bootstrap-FAIL` (which is also emitted, for
  // those who pipe the full stream).
  const bootDiags = report.bootstrapDiagnostics ?? [];
  if (bootDiags.length > 0) {
    lines.push('');
    lines.push(`[http-smoke-bootstrap-FAIL] ${bootDiags.length} actor(s) failed authentication:`);
    for (const diag of bootDiags) {
      const actor = (diag as Record<string, unknown>).actorName;
      const scheme = (diag as Record<string, unknown>).scheme;
      const reason = (diag as Record<string, unknown>).reason;
      if (typeof actor === 'string') {
        lines.push(`  - actor=${actor} scheme=${String(scheme ?? 'unknown')} reason=${JSON.stringify(reason ?? diag.message)}`);
      } else {
        lines.push(`  - ${diag.code}: ${diag.message}`);
      }
    }
  }
  lines.push('');
  lines.push(`[http-smoke-summary] total=${report.summary.total} passed=${report.summary.passed} failed=${report.summary.failed} skipped=${report.summary.skipped} exit=${report.exitCode} duration=${report.summary.durationMs}ms`);
  if (report.blockReason) lines.push(`[http-smoke-block] ${report.blockReason}`);

  // Stack-boot diagnostics — emitted AFTER summary so a `tail -N` on the
  // probe output preserves the actual stderr that explains the boot failure.
  // Without this block, agents see only `STACK_BOOT_FAILED:stack:boot stalled`
  // and have no idea WHY (e.g. `TypeError: this.$connect is not a function`).
  if (report.bootLogs && report.bootLogs.trim().length > 0) {
    const bootTail = report.bootLogs.trimEnd().split('\n').slice(-80).join('\n');
    lines.push('');
    lines.push('═══════════════════════════════════════════════════════════════');
    lines.push('[http-smoke-stack-stderr] last 80 lines from stack stderr:');
    lines.push('═══════════════════════════════════════════════════════════════');
    lines.push(bootTail);
    lines.push('═══════════════════════════════════════════════════════════════');
    lines.push('[http-smoke-stack-stderr-end]');
  }

  // Final marker for grep.
  if (failed.length === 0) {
    lines.push('[http-smoke-PASS]');
  } else {
    lines.push('[http-smoke-FAIL]');
  }
  lines.push('');
  return lines.join('\n');
}

export function emptyReport(profile: string, scope: string, mode: SmokeReport['mode']): SmokeReport {
  return {
    version: '1',
    generatedAt: new Date().toISOString(),
    projectDir: PROJECT_ROOT,
    scope,
    profile,
    mode,
    stack: {
      ownership: 'none',
      ports: {},
      reused: false,
      bootPlanDriver: 'unknown',
    },
    summary: { total: 0, passed: 0, failed: 0, skipped: 0, durationMs: 0 },
    exitCode: 0,
    blockCodes: [],
    cases: [],
  };
}

interface FailureCluster {
  signature: string;
  cases: SmokeCaseEntry[];
}

/**
 * Group failures by the structural step path embedded in the case
 * label. The probe runner walks chains step-by-step (`chain:<name>:
 * step<N>`) and emits cases under that nomenclature; if N flows all
 * fail at the same chain-step, they cascade from one root regardless
 * of body shape. No body fingerprinting, no project-specific patterns
 * — just the path the runner itself produced.
 *
 * Cluster key = the longest chain-step prefix common to the label.
 * Fallback: full label (so non-chain failures still group only with
 * exact duplicates rather than by guessed body content).
 */
function clusterFailures(failed: SmokeCaseEntry[]): FailureCluster[] {
  const buckets = new Map<string, SmokeCaseEntry[]>();
  for (const entry of failed) {
    const stepKey = chainStepKey(entry.label) ?? entry.label;
    const status = typeof entry.status === 'number' ? `status=${entry.status}` : 'status=?';
    const signature = `${stepKey} (${status})`;
    const list = buckets.get(signature) ?? [];
    list.push(entry);
    buckets.set(signature, list);
  }
  const clusters: FailureCluster[] = [];
  for (const [signature, cases] of buckets) {
    if (cases.length >= 2) {
      clusters.push({ signature, cases });
    }
  }
  // Sort largest cluster first so the dominant root cause leads the report.
  clusters.sort((left, right) => right.cases.length - left.cases.length);
  return clusters;
}

/**
 * Pull the chain step path (`chain:<name>:step<N>`) out of a probe case
 * label. Returns null when the label has no chain segment, so the
 * caller can fall through to per-case grouping for unrelated failures.
 *
 * Example label:
 *   flow:teams-id-members:post:happy:chain:resource-setup:teams:step2:expect
 *   → chain:resource-setup:teams:step2
 */
function chainStepKey(label: string): string | null {
  const match = label.match(/(chain:[^\s:]+(?::[^\s:]+)*?:step\d+)/);
  return match ? match[1] : null;
}

