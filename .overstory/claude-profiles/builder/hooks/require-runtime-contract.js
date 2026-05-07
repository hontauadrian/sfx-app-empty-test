#!/usr/bin/env node
/**
 * Plan 05 — Stop hook: require-runtime-contract.
 *
 * Fires only when touched files match source patterns that affect the contract:
 *   - packages/validation/**\/*.schema.ts
 *   - apps/api/src/**\/*.controller.ts
 *   - apps/api/src/**\/*.router.ts
 *   - apps/web/src/**\/(page|layout|route).tsx?
 *   - apps/web/middleware.ts
 *
 * Emits a single JSON line on stdout with the decision envelope:
 *   {"decision":"allow"|"block","category":"...","reason":"...","summary":{...}}
 *
 * Env overrides:
 *   OVERSTORY_AGENT_CAPABILITY=lead   — advisory mode (never blocks)
 *   OVERSTORY_WORKTREE_PATH / PROJECT_ROOT — project dir override
 */

const fs = require('node:fs');
const path = require('node:path');

const { compileContract } = require('./probes/compile-contract.js');
const { loadOverlay, validateOverlay, mergeContract } = require('./probes/contract-merge.js');

const TOUCHED_SOURCE_PATTERNS = [
  /\.controller\.ts$/,
  /\.router\.ts$/,
  /(^|\/)page\.(t|j)sx?$/,
  /(^|\/)layout\.(t|j)sx?$/,
  /(^|\/)route\.(t|j)sx?$/,
  /(^|\/)middleware\.(t|j)sx?$/,
  /packages\/validation\/.+\.schema\.ts$/,
];

function readStdinSafe() {
  try {
    if (process.stdin.isTTY) return '';
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function parseSessionInput(raw) {
  if (!raw) return { files: [] };
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return { files: parsed };
    if (Array.isArray(parsed.files)) return { files: parsed.files };
    return { files: [] };
  } catch {
    return { files: raw.split(/\r?\n/).filter(Boolean).map((p) => ({ path: p })) };
  }
}

function touchedSources(files) {
  return files
    .map((entry) => (typeof entry === 'string' ? entry : entry?.path))
    .filter(Boolean)
    .filter((p) => TOUCHED_SOURCE_PATTERNS.some((rx) => rx.test(p)));
}

function buildReport(projectRoot, merged, decision) {
  try {
    const reportsDir = path.join(projectRoot, '.claude', 'hook-reports');
    fs.mkdirSync(reportsDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = path.join(reportsDir, `runtime-contract-${ts}.md`);
    const lines = [
      `# Runtime Contract Report — ${new Date().toISOString()}`,
      '',
      `**Decision:** ${decision.decision}${decision.category ? ` (${decision.category})` : ''}`,
      decision.reason ? `**Reason:** ${decision.reason}` : '',
      '',
      `## Summary`,
      `- Source:            ${decision.summary.source}`,
      `- Compiled routes:   ${merged.source.compiledRoutes}`,
      `- Compiled endpoints:${merged.source.compiledEndpoints}`,
      `- Overlay:           ${merged.source.hasOverlay ? 'present' : 'absent'}`,
      `- Merge errors:      ${merged.mergeErrors.length}`,
      `- Advisory:          ${decision.summary.advisory ? 'yes' : 'no'}`,
      '',
    ];
    if (merged.mergeErrors.length > 0) {
      lines.push('## Merge errors');
      for (const err of merged.mergeErrors) {
        lines.push(`- **${err.code}** — ${err.message}`);
      }
      lines.push('');
    }
    fs.writeFileSync(reportPath, lines.filter(Boolean).join('\n') + '\n');
  } catch {
    // report is advisory
  }
}

function writeMergedArtifact(projectRoot, merged) {
  try {
    const out = path.join(projectRoot, '.runtime-contract.compiled.json');
    fs.writeFileSync(out, JSON.stringify(merged, null, 2));
  } catch {
    // artifact is advisory
  }
}

async function runHook({ projectRoot, stdinRaw, capability } = {}) {
  const resolvedRoot =
    projectRoot ||
    process.env.PROJECT_ROOT ||
    process.env.OVERSTORY_WORKTREE_PATH ||
    process.cwd();
  const resolvedCapability = capability || process.env.OVERSTORY_AGENT_CAPABILITY || '';
  const advisory = resolvedCapability === 'lead';

  const raw = stdinRaw ?? readStdinSafe();
  const session = parseSessionInput(raw);
  const touched = touchedSources(session.files);

  if (touched.length === 0 && session.files.length > 0) {
    // Omit `decision` so Claude Code's default Stop behavior runs and the
    // remaining Stop-hook chain (e2e-test, pre-close-gate, etc.) still fires.
    // `decision: 'allow'` is not in the Stop-hook schema; `'approve'` would
    // skip the rest of the chain — neither is what we want here.
    const allow = {
      summary: {
        source: 'skip',
        routes: 0,
        endpoints: 0,
        flows: 0,
        overlay: false,
        mergeErrors: 0,
        advisory,
        reason: 'no contract-relevant files changed',
      },
    };
    return allow;
  }

  // Compile + load overlay + merge
  const compiled = await compileContract({ projectRoot: resolvedRoot });
  const { overlay, parseError } = loadOverlay(resolvedRoot);

  if (parseError) {
    return {
      decision: advisory ? undefined : 'block',
      category: 'RUNTIME_CONTRACT_VIOLATION',
      reason: `OVERLAY_PARSE_ERROR: ${parseError.message}`,
      summary: {
        source: 'overlay',
        routes: 0,
        endpoints: 0,
        flows: 0,
        overlay: true,
        mergeErrors: 1,
        advisory,
      },
    };
  }

  if (overlay) {
    const schemaDiagnostics = validateOverlay(overlay);
    if (schemaDiagnostics.length > 0) {
      return {
        decision: advisory ? undefined : 'block',
        category: 'RUNTIME_CONTRACT_VIOLATION',
        reason: `${schemaDiagnostics[0].code}: ${schemaDiagnostics[0].message}`,
        summary: {
          source: 'overlay',
          routes: 0,
          endpoints: 0,
          flows: 0,
          overlay: true,
          mergeErrors: schemaDiagnostics.length,
          advisory,
        },
      };
    }
  }

  const { merged, mergeErrors } = mergeContract({ compiled, overlay });
  writeMergedArtifact(resolvedRoot, merged);

  if (mergeErrors.length > 0) {
    const first = mergeErrors[0];
    const decision = {
      decision: advisory ? undefined : 'block',
      category: 'RUNTIME_CONTRACT_VIOLATION',
      reason: `${first.code}: ${first.message}`,
      summary: {
        source: 'merged',
        routes: merged.routes.length,
        endpoints: merged.endpoints.length,
        flows: merged.flows?.length ?? 0,
        overlay: merged.source.hasOverlay,
        mergeErrors: mergeErrors.length,
        advisory,
      },
    };
    buildReport(resolvedRoot, merged, decision);
    return decision;
  }

  const allow = {
    summary: {
      source: 'merged',
      routes: merged.routes.length,
      endpoints: merged.endpoints.length,
      flows: merged.flows?.length ?? 0,
      overlay: merged.source.hasOverlay,
      mergeErrors: 0,
      advisory,
    },
  };
  buildReport(resolvedRoot, merged, allow);
  return allow;
}

async function mainCli() {
  try {
    const decision = await runHook();
    process.stdout.write(JSON.stringify(decision) + '\n');
    return 0;
  } catch (error) {
    // Fail closed on internal hook error. The previous output here was
    // {decision:"allow"} with an `advisory: true` summary, but
    // (a) "allow" is not in Claude Code's accepted Stop-hook decision
    // schema (only "approve"|"block"), so the JSON gets schema-rejected
    // and the agent's Stop is silently allowed — defeating the gate; and
    // (b) treating an unverified runtime contract as a pass is exactly
    // the failure mode this gate exists to prevent. An exception thrown
    // out of runHook means we crashed before producing a verdict, which
    // is operationally identical to "could not verify" — block.
    process.stdout.write(
      JSON.stringify({
        decision: 'block',
        reason:
          `require-runtime-contract.js crashed before producing a verdict — ` +
          `runtime contract could not be verified. Internal error: ${error.message}. ` +
          `If the failure is environmental (missing artifact, IO error), re-run ` +
          `the gate locally or escalate to your parent. Do not retry the agent ` +
          `Stop until the contract is verifiable.`,
      }) + '\n',
    );
    return 0;
  }
}

if (require.main === module) {
  mainCli().then((code) => process.exit(code));
}

module.exports = { runHook, touchedSources, TOUCHED_SOURCE_PATTERNS };
