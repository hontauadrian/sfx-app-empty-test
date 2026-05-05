#!/usr/bin/env node
/**
 * Post-seed verification: every actor email referenced by an
 * `auth-bootstrap` step in `.overstory/runtime-contract.flows/_shared.json`
 * must exist in the database after `pnpm db:seed`.
 *
 * Why: probe chain flows fail with cascading 401/403/404 when a single
 * seed user is missing (e.g. `member@sfx-test.dev` not in the seed).
 * The probe report shows N flow failures rooted in one missing row, and
 * agents spend hours tracing the cascade. This preflight fingerprints
 * the seed gap explicitly so builders see the actual root issue:
 *
 *   ⚠ Seed missing 1 actor referenced by _shared.json:
 *     - member@sfx-test.dev (actor: team-member)
 *
 * Non-fatal — exits 0 even on missing actors so stack:up keeps booting.
 * The warning is the value; builders get an actionable head start
 * before they hit the cascade in probe:smoke.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const PROJECT_ROOT = process.env.PROJECT_ROOT || resolve(process.argv[2] || '.');
const SHARED_FLOW_PATH = join(
  PROJECT_ROOT,
  '.overstory',
  'runtime-contract.flows',
  '_shared.json',
);

function extractActorEmails(sharedFlow) {
  const emails = new Map();
  const actors = Array.isArray(sharedFlow?.actors) ? sharedFlow.actors : [];
  for (const actor of actors) {
    const auth = actor?.auth ?? {};
    const bootstrap = auth?.bootstrap ?? {};
    // Common shapes for bootstrap credentials.
    const candidates = [
      bootstrap?.body?.email,
      bootstrap?.credentials?.email,
      auth?.credentials?.email,
      bootstrap?.email,
    ];
    const email = candidates.find((value) => typeof value === 'string' && value.includes('@'));
    if (email) {
      emails.set(email, actor?.name ?? '<unknown actor>');
    }
  }
  // Walk auth-bootstrap-style special_flows ONLY (path matches login).
  // These flows log in as a pre-seeded actor and capture a token for
  // dependent flows; their email MUST exist in the DB. Register / signup
  // flows are different — they CREATE the user, so their email must NOT
  // pre-exist (a seed row would actually break the flow's 201 happy path
  // with a 409). Filter by step path containing 'login' (or 'signin') to
  // avoid that false positive.
  const specialFlows = Array.isArray(sharedFlow?.special_flows) ? sharedFlow.special_flows : [];
  for (const flow of specialFlows) {
    const steps = Array.isArray(flow?.steps) ? flow.steps : [];
    for (const step of steps) {
      const path = typeof step?.path === 'string' ? step.path.toLowerCase() : '';
      const isLogin = /\blogin\b|\bsignin\b/.test(path);
      if (!isLogin) continue;
      const credEmail = step?.body?.email;
      if (typeof credEmail === 'string' && credEmail.includes('@')) {
        if (!emails.has(credEmail)) {
          emails.set(credEmail, `flow:${flow.id ?? '<unknown>'}`);
        }
      }
    }
  }
  return emails;
}

function querySeededEmails(tableExpr) {
  const composeProject = process.env.PANEL_BRIDGE_COMPOSE_PROJECT || process.env.PROJECT_NAME;
  if (!composeProject) return { ok: false, emails: null };
  const result = spawnSync(
    'docker',
    [
      'compose',
      '-p',
      composeProject,
      'exec',
      '-T',
      'postgres',
      'env',
      `PGPASSWORD=${process.env.POSTGRES_PASSWORD ?? 'app'}`,
      'psql',
      '-U',
      process.env.POSTGRES_USER ?? 'app',
      '-d',
      process.env.POSTGRES_DB ?? 'app_db',
      '-tA',
      '-c',
      `SELECT email FROM ${tableExpr}`,
    ],
    { encoding: 'utf8', timeout: 15000 },
  );
  if (result.status !== 0) return { ok: false, emails: null };
  return {
    ok: true,
    emails: new Set(
      result.stdout
        .split('\n')
        .map((row) => row.trim())
        .filter((row) => row.length > 0),
    ),
  };
}

function listSeededUsers() {
  // Prisma supports either lowercase `users` (with @@map("users")) or
  // PascalCase `"User"` (no map). Try both so the verifier is portable
  // across boilerplates with different naming conventions.
  for (const tableExpr of ['users', '"User"']) {
    const attempt = querySeededEmails(tableExpr);
    if (attempt.ok) return attempt.emails;
  }
  return null;
}

function main() {
  if (!existsSync(SHARED_FLOW_PATH)) {
    // No shared flow file → nothing to validate (project doesn't use
    // contract-flow probes yet). Silent exit.
    process.exit(0);
  }
  let sharedFlow;
  try {
    sharedFlow = JSON.parse(readFileSync(SHARED_FLOW_PATH, 'utf8'));
  } catch (error) {
    console.warn(`[verify-seed-actors] could not parse ${SHARED_FLOW_PATH}: ${error.message}`);
    process.exit(0);
  }
  const requiredEmails = extractActorEmails(sharedFlow);
  if (requiredEmails.size === 0) {
    process.exit(0);
  }
  const seededUsers = listSeededUsers();
  if (!seededUsers) {
    console.warn(
      '[verify-seed-actors] could not list seeded users (postgres unreachable or env unset) — skipping check',
    );
    process.exit(0);
  }
  const missing = [];
  for (const [email, owner] of requiredEmails) {
    if (!seededUsers.has(email)) {
      missing.push({ email, owner });
    }
  }
  if (missing.length === 0) {
    console.warn(
      `[verify-seed-actors] OK — ${requiredEmails.size} actor email(s) present in seed`,
    );
    process.exit(0);
  }
  console.warn(
    `[verify-seed-actors] WARNING: seed is missing ${missing.length} actor email(s) referenced by _shared.json:`,
  );
  for (const item of missing) {
    console.warn(`  - ${item.email}  (referenced by: ${item.owner})`);
  }
  console.warn(
    '[verify-seed-actors] probe:smoke chain flows that depend on these actors will cascade-fail until the seed is updated.',
  );
  process.exit(0);
}

main();
