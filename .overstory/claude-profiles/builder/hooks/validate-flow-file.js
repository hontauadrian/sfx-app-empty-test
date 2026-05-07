/**
 * PreToolUse hook — validate runtime-contract flow files at write time.
 *
 * Blocks Write/Edit/MultiEdit on `.overstory/runtime-contract.flows/*.json`
 * (per-task and `_shared.json`) when the proposed content has the common
 * authoring bugs that otherwise only surface at builder probe-run time:
 *
 *   - capture step using "from"/"into" instead of "bindings" map
 *   - navigate step using "path"/"route"/"url" instead of "to"
 *   - setAuth step missing "binding"
 *   - api step missing "method"/"path"
 *   - actor with `${var}` in auth.token where neither a capture step nor
 *     a bootstrap declaration introduces `var`
 *   - unknown step "kind"
 *
 * Each bug previously cost a 10-15min builder round-trip (lead writes →
 * mails builder → builder runs probe → mails diagnosis → lead patches →
 * repeat). Catching them at the lead's keystroke breaks that loop.
 *
 * Allows malformed JSON through unchanged — file may be mid-edit. Schema
 * runs only on parseable JSON.
 */
const fs = require('fs');

let input;
try {
  input = JSON.parse(fs.readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

const tool = input.tool_name;
if (!['Write', 'Edit', 'MultiEdit'].includes(tool)) process.exit(0);

const filePath = input.tool_input?.file_path || '';
const isFlowFile = /runtime-contract\.flows\/[^/]+\.json$/.test(filePath);
if (!isFlowFile) process.exit(0);

function applyEdit(existing, oldString, newString) {
  if (!existing.includes(oldString)) return null;
  return existing.replace(oldString, newString);
}

function resolveProposedContent() {
  if (tool === 'Write') return input.tool_input?.content ?? '';
  if (!fs.existsSync(filePath)) return null;
  const existing = fs.readFileSync(filePath, 'utf8');
  if (tool === 'Edit') {
    return applyEdit(existing, input.tool_input?.old_string || '', input.tool_input?.new_string || '');
  }
  if (tool === 'MultiEdit') {
    let working = existing;
    for (const edit of input.tool_input?.edits || []) {
      const next = applyEdit(working, edit.old_string || '', edit.new_string || '');
      if (next === null) return null;
      working = next;
    }
    return working;
  }
  return null;
}

const proposed = resolveProposedContent();
if (proposed === null || proposed === '') process.exit(0);

let parsed;
try {
  parsed = JSON.parse(proposed);
} catch {
  process.exit(0);
}

const VALID_STEP_KINDS = new Set([
  'api', 'expect', 'capture', 'setAuth', 'logout', 'navigate', 'wait',
  'poll', 'assertIdempotent', 'parallel', 'matrix', 'assertBulk',
  'capture-cookie', 'assert-cookie-rotated', 'assert-cookie-cleared',
  'assert-cookie-attrs', 'replay-cookie-as-header', 'omit-cookie',
  'tamper-cookie', 'assertSideEffect',
]);

const errors = [];

function walkSteps(steps, flowName) {
  if (!Array.isArray(steps)) return;
  for (let stepIndex = 0; stepIndex < steps.length; stepIndex += 1) {
    const step = steps[stepIndex];
    if (!step || typeof step !== 'object') continue;
    const where = `${flowName}[${stepIndex}] kind=${step.kind ?? '?'}`;
    if (step.kind && !VALID_STEP_KINDS.has(step.kind)) {
      errors.push(`${where}: unknown step kind "${step.kind}". Valid kinds include api, expect, capture, setAuth, navigate, logout, wait, poll, assertIdempotent.`);
      continue;
    }
    if (step.kind === 'capture') {
      if ('from' in step || 'into' in step) {
        errors.push(`${where}: uses "from"/"into" — capture step requires "bindings" map. Example: { kind: "capture", bindings: { sfxAdminAccessToken: "$.accessToken" } }`);
      }
      if (!step.bindings && !step.headerBindings && !step.captureEach) {
        errors.push(`${where}: missing "bindings" / "headerBindings" / "captureEach"`);
      }
    }
    if (step.kind === 'navigate') {
      for (const wrongKey of ['path', 'route', 'url']) {
        if (wrongKey in step) {
          errors.push(`${where}: uses "${wrongKey}" — navigate step requires "to". Example: { kind: "navigate", to: "/login" }`);
        }
      }
      if (!step.to) {
        errors.push(`${where}: missing "to" (route path)`);
      }
    }
    if (step.kind === 'setAuth') {
      if (!step.binding) {
        errors.push(`${where}: missing "binding" (actor name)`);
      }
    }
    if (step.kind === 'api') {
      if (!step.method) errors.push(`${where}: api step missing "method"`);
      if (!step.path) errors.push(`${where}: api step missing "path"`);
    }
  }
}

const flows = Array.isArray(parsed.special_flows) ? parsed.special_flows : [];
for (const flow of flows) {
  walkSteps(flow.steps, flow.name || 'unnamed-flow');
}

const declaredCaptures = new Set();
for (const flow of flows) {
  for (const step of flow.steps || []) {
    if (step?.kind === 'capture' && step.bindings) {
      Object.keys(step.bindings).forEach((key) => declaredCaptures.add(key));
    }
    if (step?.capture?.bindings) {
      Object.keys(step.capture.bindings).forEach((key) => declaredCaptures.add(key));
    }
  }
}

const actors = Array.isArray(parsed.actors) ? parsed.actors : [];
for (const actor of actors) {
  const tokenStr = actor?.auth?.token ?? '';
  if (typeof tokenStr !== 'string') continue;
  const placeholders = [...tokenStr.matchAll(/\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g)];
  for (const match of placeholders) {
    const varName = match[1];
    const hasCapture = declaredCaptures.has(varName);
    const hasBootstrap = actor.bootstrap && (
      actor.bootstrap.runFlow ||
      actor.bootstrap.capture === varName ||
      (Array.isArray(actor.bootstrap.captures) && actor.bootstrap.captures.includes(varName))
    );
    if (!hasCapture && !hasBootstrap) {
      errors.push(`actor "${actor.name || '?'}" references \${${varName}} in auth.token but no flow captures "${varName}" and no actor.bootstrap chain declares it. Either add a chain that captures "${varName}" or attach bootstrap: { runFlow: "<chain>", capture: "${varName}" }.`);
    }
  }
}

if (errors.length > 0) {
  const reason = [
    `flow file schema check failed (${errors.length} issue${errors.length === 1 ? '' : 's'}):`,
    '',
    ...errors.map((message) => `  - ${message}`),
    '',
    'Reference: .claude/skills/task-flow-authoring/SKILL.md "Runner-backed today" section.',
  ].join('\n');
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  }) + '\n');
  process.exit(0);
}

process.exit(0);
