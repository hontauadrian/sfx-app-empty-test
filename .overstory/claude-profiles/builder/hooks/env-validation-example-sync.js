/**
 * PreToolUse hook — keep apps/<svc>/.env.example in sync with the Zod
 * schema in apps/<svc>/src/config/env.validation.ts.
 *
 * Trigger: Write/Edit/MultiEdit on a path matching
 *   apps/<svc>/src/config/env.validation.ts
 *
 * Behaviour: resolve the proposed file content (Write content / Edit
 * replacement / MultiEdit chain). Parse out every Zod field that lacks
 * .optional() and .default(...) — those are runtime-required env vars.
 * Read the sibling apps/<svc>/.env.example. If any required key is
 * missing from the example, deny the edit with a helpful diff.
 *
 * Why: backend builder added JWT_REFRESH_SECRET / JWT_EXPIRY /
 * JWT_REFRESH_EXPIRY to the Zod schema but forgot the .env.example. The
 * panel UI scaffolds the env editor from .env.example, so missing keys
 * never surfaced — the user couldn't save them, the API crashed at boot
 * with `Environment validation: JWT_REFRESH_SECRET: Required`, and the
 * stack appeared broken without any single agent's signal pointing at
 * the cause. This hook catches that drift at the keystroke that
 * introduces it, before commit, before deploy, before the next user
 * hits a bootloop.
 *
 * Reverse drift (extra keys in example that the schema doesn't require)
 * is intentionally NOT flagged — extra example keys are harmless and
 * sometimes documented intentionally.
 *
 * Falls open if either file can't be read or parsed (mid-edit safe).
 */
const fs = require('fs');
const path = require('path');

let input;
try {
  input = JSON.parse(fs.readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

const tool = input.tool_name;
if (!['Write', 'Edit', 'MultiEdit'].includes(tool)) process.exit(0);

const filePath = input.tool_input?.file_path || '';
const validationMatch = filePath.match(/^(.*\/apps\/[^/]+)\/src\/config\/env\.validation\.ts$/);
if (!validationMatch) process.exit(0);
const serviceDir = validationMatch[1];

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

function extractRequiredKeys(source) {
  const required = [];
  // Match each `KEY_NAME: z.<chain>` declaration up to the next field
  // boundary (`,` not inside parens, or closing `}`). Works on both
  // multi-line and minified single-line schemas.
  const fieldPattern = /([A-Z][A-Z0-9_]+)\s*:\s*z\.[^,}]*(?:\([^)]*\)[^,}]*)*/g;
  let match;
  while ((match = fieldPattern.exec(source)) !== null) {
    const declaration = match[0];
    if (/\.optional\s*\(/.test(declaration)) continue;
    if (/\.default\s*\(/.test(declaration)) continue;
    required.push(match[1]);
  }
  return required;
}

const requiredKeys = extractRequiredKeys(proposed);
if (requiredKeys.length === 0) process.exit(0);

const examplePath = path.join(serviceDir, '.env.example');
let exampleContent = '';
try {
  exampleContent = fs.readFileSync(examplePath, 'utf8');
} catch {
  // No .env.example yet — let it through; service may be brand new.
  process.exit(0);
}

function exampleHasKey(content, key) {
  const pattern = new RegExp(`^\\s*${key}\\s*=`, 'm');
  return pattern.test(content);
}

const missing = requiredKeys.filter((key) => !exampleHasKey(exampleContent, key));
if (missing.length === 0) process.exit(0);

const reason = [
  `env.validation drift: apps/${path.basename(serviceDir)}/.env.example is missing ${missing.length} required key${missing.length === 1 ? '' : 's'} declared in env.validation.ts.`,
  '',
  'Missing in .env.example:',
  ...missing.map((key) => `  - ${key}`),
  '',
  'When the Zod schema makes a key required (no .optional() / no .default()),',
  '.env.example MUST list it too. The panel UI scaffolds its env editor from',
  '.env.example, so users cannot save what is not listed; the API then crashes',
  'at boot with `Environment validation: <KEY>: Required`.',
  '',
  `Add the missing keys to: ${examplePath.replace(process.cwd() + '/', '')}`,
  'Then retry the edit.',
].join('\n');

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'deny',
    permissionDecisionReason: reason,
  },
}) + '\n');
