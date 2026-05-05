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

