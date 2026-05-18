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

// Allowed fields per auth scheme. Mirrors zod schemas in
// .overstory/claude-profiles/builder/hooks/probes/contract-flows/lib/auth-bootstrap.ts —
// any drift here would let bad actor blocks slip through validation only to
// fail at probe-run time with cryptic JSONPath errors.
const AUTH_SCHEMES = {
  'anonymous':         { required: ['scheme'], optional: [] },
  'bearer-in-body':    { required: ['scheme', 'login'], optional: ['register', 'token'],
                          login: { required: ['path'], optional: ['body', 'key', 'contentType'] },
                          register: { required: ['path'], optional: ['body', 'key', 'contentType'] } },
  'bearer-in-header':  { required: ['scheme', 'login'], optional: ['token'],
                          login: { required: ['path'], optional: ['body', 'headerName', 'contentType'] } },
  'cookie':            { required: ['scheme', 'login'], optional: [],
                          login: { required: ['path'], optional: ['body', 'contentType'] } },
  'api-key':           { required: ['scheme', 'headerName', 'value'], optional: [] },
  'oauth-scoped':      { required: ['scheme', 'tokenEndpoint', 'scopes', 'clientId', 'clientSecret'], optional: ['audience'] },
};

function validateBlock(blockSpec, block, actorName, blockPath) {
  if (!blockSpec) return;
  if (!block || typeof block !== 'object') {
    errors.push(`actor "${actorName}" auth.${blockPath}: expected an object`);
    return;
  }
  const allowed = new Set([...(blockSpec.required || []), ...(blockSpec.optional || [])]);
  for (const required of blockSpec.required || []) {
    if (block[required] === undefined) {
      errors.push(`actor "${actorName}" auth.${blockPath}: missing required field "${required}". Allowed: ${[...allowed].join(', ')}.`);
    }
  }
  for (const key of Object.keys(block)) {
    if (allowed.has(key)) continue;
    // Already-handled nested blocks listed in spec keys (login/register).
    if (blockSpec[key] && typeof blockSpec[key] === 'object') continue;
    errors.push(`actor "${actorName}" auth.${blockPath}: unknown field "${key}". Allowed: ${[...allowed].join(', ')}. Did you mean one of those?`);
  }
}

for (const actor of actors) {
  const auth = actor?.auth;
  const actorName = actor?.name || '?';
  if (!auth || typeof auth !== 'object') continue;
  const scheme = auth.scheme;
  if (typeof scheme !== 'string') {
    errors.push(`actor "${actorName}" auth.scheme is required and must be a string. Allowed schemes: ${Object.keys(AUTH_SCHEMES).join(', ')}.`);
    continue;
  }
  const spec = AUTH_SCHEMES[scheme];
  if (!spec) {
    errors.push(`actor "${actorName}" auth.scheme "${scheme}" is not a recognized scheme. Allowed: ${Object.keys(AUTH_SCHEMES).join(', ')}.`);
    continue;
  }

  // Top-level fields
  const allowedTop = new Set([...spec.required, ...spec.optional]);
  for (const required of spec.required) {
    if (auth[required] === undefined) {
      errors.push(`actor "${actorName}" auth.${required} is required for scheme "${scheme}". Allowed top-level fields: ${[...allowedTop].join(', ')}.`);
    }
  }
  for (const key of Object.keys(auth)) {
    if (allowedTop.has(key)) continue;
    errors.push(`actor "${actorName}" auth.${key}: unknown field for scheme "${scheme}". Allowed top-level fields: ${[...allowedTop].join(', ')}. (e.g. token-extraction JSONPath goes in auth.login.key, not auth.${key} or auth.login.${key === 'tokenPath' ? 'tokenPath' : key}.)`);
  }

  // Nested login / register blocks
  if (auth.login !== undefined) validateBlock(spec.login, auth.login, actorName, 'login');
  if (auth.register !== undefined) validateBlock(spec.register, auth.register, actorName, 'register');

  // Token interpolation check (preserves prior behavior)
  const tokenStr = auth.token ?? '';
  if (typeof tokenStr === 'string' && tokenStr.length > 0) {
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
        errors.push(`actor "${actorName}" references \${${varName}} in auth.token but no flow captures "${varName}" and no actor.bootstrap chain declares it. Either add a chain that captures "${varName}" or attach bootstrap: { runFlow: "<chain>", capture: "${varName}" }.`);
      }
    }
  }
}

// ─── Per-step ${var} reference resolution ───────────────────────────────
//
// Walk every step in every flow. Collect captures from `capture` steps
// PRIOR to the current step (per-flow scope). Scan path/body/query/
// headers/expect/bodyHas for `${var}` references and verify each var is
// either:
//   - captured by an earlier capture step in the same flow
//   - declared by an actor (auth.bootstrap.capture or auth.bootstrap.captures)
//   - a probe-runner built-in sigil (see BUILTIN_SIGILS below)
//
// Catches the most common DSL authoring mistake: assertion or path
// references a `${var}` that was never bound, so probe sends the literal
// string at runtime and the match fails with a misleading
// `expected ${X}, got <real-value>`.
const BUILTIN_SIGILS = new Set([
  'uniqEmail', 'uniqString', 'uniqUuid', 'uniqUuid2',
  'accessToken', 'registerToken', 'registeredEmail', 'userId', 'runId',
]);

function isBuiltinSigil(varName) {
  if (BUILTIN_SIGILS.has(varName)) return true;
  if (varName.startsWith('uniq:')) return true;
  if (varName.startsWith('resource:')) return true; // chain-captured resource sigils
  return false;
}

function actorBindings(actor) {
  const out = new Set();
  if (!actor) return out;
  if (actor.bootstrap) {
    if (typeof actor.bootstrap.capture === 'string') out.add(actor.bootstrap.capture);
    if (Array.isArray(actor.bootstrap.captures)) {
      for (const c of actor.bootstrap.captures) if (typeof c === 'string') out.add(c);
    }
  }
  return out;
}

function collectVarRefs(value, accumulator) {
  if (value === null || value === undefined) return;
  if (typeof value === 'string') {
    for (const match of value.matchAll(/\$\{([a-zA-Z_][a-zA-Z_0-9]*(?::[^}]+)?)\}/g)) {
      accumulator.push(match[1]);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) collectVarRefs(v, accumulator);
    return;
  }
  if (typeof value === 'object') {
    for (const v of Object.values(value)) collectVarRefs(v, accumulator);
  }
}

function collectMustacheRefs(value, accumulator) {
  if (value === null || value === undefined) return;
  if (typeof value === 'string') {
    for (const match of value.matchAll(/\{\{\s*([a-zA-Z_][a-zA-Z_0-9.:]*)\s*\}\}/g)) {
      accumulator.push(match[1]);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) collectMustacheRefs(v, accumulator);
    return;
  }
  if (typeof value === 'object') {
    for (const v of Object.values(value)) collectMustacheRefs(v, accumulator);
  }
}

const allActorBindings = new Set();
for (const actor of actors) {
  for (const b of actorBindings(actor)) allActorBindings.add(b);
}

for (const flow of flows) {
  const flowId = flow.id || flow.name || '?';
  const boundInFlow = new Set(allActorBindings);
  const steps = Array.isArray(flow.steps) ? flow.steps : [];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (!step || typeof step !== 'object') continue;

    // Collect refs in this step's user-visible fields BEFORE adding this
    // step's own captures (a capture step's binding key is bound AFTER
    // its api response, so `${X}` referring to X declared in this very
    // capture step would only resolve in subsequent steps).
    const mustacheRefs = [];
    collectMustacheRefs(step.path, mustacheRefs);
    collectMustacheRefs(step.body, mustacheRefs);
    collectMustacheRefs(step.query, mustacheRefs);
    collectMustacheRefs(step.headers, mustacheRefs);
    collectMustacheRefs(step.expect, mustacheRefs);
    collectMustacheRefs(step.bodyHas, mustacheRefs);
    for (const varName of mustacheRefs) {
      errors.push(`flow "${flowId}" step ${i}: uses {{${varName}}} (Mustache/Handlebars syntax) — the probe runner ONLY resolves \${name} placeholders. Replace every {{${varName}}} with \${${varName}} in path/body/query/headers/expect/bodyHas. Anything else is sent to the API verbatim and produces 404.`);
    }

    const refs = [];
    collectVarRefs(step.path, refs);
    collectVarRefs(step.body, refs);
    collectVarRefs(step.query, refs);
    collectVarRefs(step.headers, refs);
    collectVarRefs(step.expect, refs);
    collectVarRefs(step.bodyHas, refs);
    for (const varName of refs) {
      if (boundInFlow.has(varName)) continue;
      if (isBuiltinSigil(varName)) continue;
      errors.push(`flow "${flowId}" step ${i}: references \${${varName}} but no earlier capture or actor binding declares it. Add a capture step before step ${i} that binds "${varName}" (e.g. capture: { bindings: { ${varName}: "$.<jsonpath-into-response>" } }), or change the assertion to not use a variable.`);
    }

    // Now register captures from THIS step for downstream steps.
    if (step.kind === 'capture' && step.bindings && typeof step.bindings === 'object') {
      for (const k of Object.keys(step.bindings)) boundInFlow.add(k);
    }
    if (step.capture && step.capture.bindings && typeof step.capture.bindings === 'object') {
      for (const k of Object.keys(step.capture.bindings)) boundInFlow.add(k);
    }
  }
}

// ─── Envelope-aware bodyHas path check ──────────────────────────────────
//
// When the project has a known successWrapper (e.g. NestJS
// TransformInterceptor wraps everything in `{success, data: <payload>}`),
// any bodyHas assertion at root `$` is comparing against the wrapper, not
// the payload. Surface this as an error so lead writes envelope-aware
// paths (`$.data.<...>`).
let envelopeWrapper = null;
try {
  const matrixPath = '.claude/hooks/.matrix.json';
  if (fs.existsSync(matrixPath)) {
    const matrix = JSON.parse(fs.readFileSync(matrixPath, 'utf8'));
    const sw = matrix && matrix.responseEnvelope && matrix.responseEnvelope.successWrapper;
    if (Array.isArray(sw) && sw.length > 0) envelopeWrapper = sw;
  }
} catch {
  envelopeWrapper = null;
}

if (envelopeWrapper) {
  const wrapperPrefix = `$.${envelopeWrapper.join('.')}`;
  for (const flow of flows) {
    const flowId = flow.id || flow.name || '?';
    const steps = Array.isArray(flow.steps) ? flow.steps : [];
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (!step || step.kind !== 'expect') continue;
      const bodyHas = step.bodyHas;
      if (!bodyHas || typeof bodyHas !== 'object' || Array.isArray(bodyHas)) continue;
      for (const path of Object.keys(bodyHas)) {
        // The probe runner auto-unwraps the envelope ONLY for paths that
        // start with `$.<field>` — those are rewritten to `$.<wrapper>.<field>`
        // transparently. Root `$` is treated literally (matches the whole
        // body including the wrapper). Asserting `$ = {type:'array'}` on a
        // wrapped response sees the wrapper, not the payload — wrong.
        // Lead must use `${wrapperPrefix}` for whole-payload shape checks.
        // Nested paths (`$.<field>`) are correct as-is and must NOT include
        // the wrapper prefix (double-prefix breaks resolution).
        if (path === '$') {
          errors.push(`flow "${flowId}" step ${i}: bodyHas path "$" matches the response wrapper, not the payload. Project response wrapper is "${wrapperPrefix}" — for a whole-payload shape check use "${wrapperPrefix}". Nested paths like "$.<field>" auto-unwrap and stay relative to the payload.`);
        } else if (path.startsWith(`${wrapperPrefix}.`)) {
          errors.push(`flow "${flowId}" step ${i}: bodyHas path "${path}" double-prefixes the response wrapper. The runner auto-unwraps "${wrapperPrefix}" for any "$.<field>" path — drop the wrapper prefix and use "$.${path.slice(wrapperPrefix.length + 1)}".`);
        }
      }
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
