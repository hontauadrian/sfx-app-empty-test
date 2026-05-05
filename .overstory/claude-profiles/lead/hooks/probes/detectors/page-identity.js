'use strict';

/**
 * page-identity.js — declaration-driven page identity detector.
 *
 * Replaces the legacy `// @routeGuard authenticated` comment heuristic in
 * detectors/next.js. A page declares its role + auth guard via a sibling
 * file `page.identity.{ts,tsx,js,jsx}` next to its `page.{ext}`.
 *
 * Canonical form (the developer/agent writes this):
 *
 *   // apps/web/src/app/login/page.identity.ts
 *   import type { PageIdentity } from '../../types/page-identity';
 *   export const identity: PageIdentity = {
 *     role: 'login-page',
 *     guard: 'public',
 *   };
 *
 * The detector statically parses the `identity` export literal — no AST
 * library required, no runtime evaluation. The TypeScript annotation
 * `: PageIdentity` is optional from the parser's perspective; it exists for
 * developer affordance (autocomplete, misspelling errors at compile time).
 *
 * Recognized roles:
 *   - 'login-page'              → where unauth users get redirected
 *   - 'register-page'           → registration form
 *   - 'post-login-destination'  → where users land after login
 *   - 'logout-destination'      → where users land after logout
 *   - 'public'                  → public marketing/info page (no special role)
 *
 * Recognized guards:
 *   - 'public'                  → no auth required (default for marketing routes)
 *   - 'authenticated'           → requires a valid session (probe expects redirect to login on unauth)
 *
 * Diagnostics:
 *   - PAGE_IDENTITY_UNDECLARED   info: page has no sibling identity file (probe skips auth assertions)
 *   - PAGE_IDENTITY_INVALID      error: identity file exists but role/guard missing or unrecognized
 *   - PAGE_ROLE_AMBIGUOUS        error: ≥2 pages declare the same role (refuse to pick one)
 *
 * Spec: 2026-04-27 declaration-driven page identity rewrite (replaces routeGuard comment regex).
 */

const fs = require('node:fs');
const path = require('node:path');

const VALID_ROLES = new Set([
  'login-page',
  'register-page',
  'post-login-destination',
  'logout-destination',
  'public',
]);

const VALID_GUARDS = new Set(['public', 'authenticated']);

const IDENTITY_FILE_BASENAME_RE = /^page\.identity\.(tsx|ts|jsx|js)$/;

// Anchored on the keyword `identity` so we don't accidentally match an unrelated
// `export const foo = { ... }` literal in the same file.
const IDENTITY_BLOCK_RE =
  /export\s+const\s+identity\s*(?::\s*[A-Za-z_$][\w$.]*\s*)?=\s*(\{[\s\S]*?\})\s*(?:as\s+const)?\s*;?/m;

// Strict key extractors — operate on the captured `{ ... }` body.
const ROLE_KEY_RE = /(?:^|[\s{,])role\s*:\s*['"]([^'"]+)['"]/;
const GUARD_KEY_RE = /(?:^|[\s{,])guard\s*:\s*['"]([^'"]+)['"]/;

/**
 * Walk a directory tree under root and return absolute paths of every
 * `page.identity.{ts,tsx,js,jsx}` file. Skips node_modules, .next, dist.
 */
function findIdentityFiles(rootDir) {
  /** @type {string[]} */
  const out = [];
  if (!fs.existsSync(rootDir)) return out;

  /** @param {string} dir */
  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules') continue;
        if (entry.name === '.next') continue;
        if (entry.name === 'dist') continue;
        if (entry.name === '.turbo') continue;
        if (entry.name === '__tests__') continue;
        walk(full);
        continue;
      }
      if (entry.isFile() && IDENTITY_FILE_BASENAME_RE.test(entry.name)) {
        out.push(full);
      }
    }
  }
  walk(rootDir);
  return out;
}

/**
 * Parse a single identity file. Returns null on parse failure (caller emits diag).
 *
 * @param {string} source
 * @returns {{ role: string, guard: string } | null}
 */
function parseIdentityFile(source) {
  const block = IDENTITY_BLOCK_RE.exec(source);
  if (!block) return null;
  const body = block[1];
  const roleMatch = ROLE_KEY_RE.exec(body);
  const guardMatch = GUARD_KEY_RE.exec(body);
  if (!roleMatch || !guardMatch) return null;
  return { role: roleMatch[1], guard: guardMatch[1] };
}

/**
 * Derive the route a `page.identity.<ext>` file describes by stripping
 * the basename and applying Next.js App Router segment rules.
 *
 * Example: `apps/web/src/app/(public)/login/page.identity.ts`
 *          relative-to-app-dir = '(public)/login/page.identity.ts'
 *          → '/login'
 *
 * @param {string} appDir absolute path to the framework's app/ root
 * @param {string} absFile absolute path to the page.identity.<ext>
 */
function routeFromIdentityFile(appDir, absFile) {
  const {
    stripGroupSegments,
    paramizeNextBrackets,
    normalizeLeadingSlash,
  } = require('../lib/routeNormalize');
  const rel = path.relative(appDir, absFile).replace(/\\/g, '/');
  const withoutBasename = rel
    .replace(/\/page\.identity\.(tsx|ts|jsx|js)$/, '')
    .replace(/^page\.identity\.(tsx|ts|jsx|js)$/, '');
  const withoutGroups = stripGroupSegments(withoutBasename);
  const paramized = paramizeNextBrackets(withoutGroups);
  return normalizeLeadingSlash('/' + paramized);
}

/**
 * Build the identity map across one or more app dirs (Next.js App Router
 * supports `app/`, `src/app/`, and monorepo variants — caller passes the
 * resolved list).
 *
 * @param {string[]} appDirs absolute paths
 * @param {{ info: (msg:string)=>void, warn: (msg:string)=>void, error?: (msg:string)=>void }} diag
 * @returns {{
 *   byRoute: Map<string, { role: string, guard: string, file: string }>,
 *   byRole: Record<string, string>
 * }}
 */
function buildIdentityMap(appDirs, diag) {
  const byRoute = new Map();
  /** @type {Record<string, string>} */
  const byRole = {};
  /** @type {Record<string, string[]>} */
  const roleConflicts = {};

  for (const appDir of appDirs) {
    const files = findIdentityFiles(appDir);
    for (const file of files) {
      let source;
      try {
        source = fs.readFileSync(file, 'utf8');
      } catch (error) {
        diag.warn(`PAGE_IDENTITY_INVALID: cannot read ${file}: ${error.message}`);
        continue;
      }
      const parsed = parseIdentityFile(source);
      if (!parsed) {
        diag.warn(
          `PAGE_IDENTITY_INVALID: ${path.relative(process.cwd(), file)} — ` +
          'expected `export const identity = { role: "...", guard: "..." }`. ' +
          'Both keys are required and must be string literals.',
        );
        continue;
      }
      if (!VALID_ROLES.has(parsed.role)) {
        diag.warn(
          `PAGE_IDENTITY_INVALID: ${path.relative(process.cwd(), file)} — ` +
          `unknown role "${parsed.role}". Valid roles: ${[...VALID_ROLES].join(', ')}.`,
        );
        continue;
      }
      if (!VALID_GUARDS.has(parsed.guard)) {
        diag.warn(
          `PAGE_IDENTITY_INVALID: ${path.relative(process.cwd(), file)} — ` +
          `unknown guard "${parsed.guard}". Valid guards: ${[...VALID_GUARDS].join(', ')}.`,
        );
        continue;
      }

      const route = routeFromIdentityFile(appDir, file);
      byRoute.set(route, {
        role: parsed.role,
        guard: parsed.guard,
        file: path.relative(process.cwd(), file),
      });

      // Track role assignments. A 'public' role is non-unique by design
      // (many pages can declare role: 'public'); skip uniqueness check for it.
      if (parsed.role !== 'public') {
        if (byRole[parsed.role] && byRole[parsed.role] !== route) {
          roleConflicts[parsed.role] = roleConflicts[parsed.role] || [byRole[parsed.role]];
          if (!roleConflicts[parsed.role].includes(route)) {
            roleConflicts[parsed.role].push(route);
          }
        } else {
          byRole[parsed.role] = route;
        }
      }
    }
  }

  // Emit role-conflict diagnostics. We refuse to pick a winner — the developer
  // must rename one of the conflicting identity files (NEVER HEURISTIC rule).
  for (const [role, routes] of Object.entries(roleConflicts)) {
    diag.warn(
      `PAGE_ROLE_AMBIGUOUS: role "${role}" claimed by ${routes.length} pages: ${routes.join(', ')}. ` +
      'Probe will not infer which one to use. Edit the page.identity.ts files so exactly one page ' +
      'has each unique role.',
    );
    delete byRole[role];
  }

  return { byRoute, byRole };
}

module.exports = {
  buildIdentityMap,
  parseIdentityFile,
  findIdentityFiles,
  routeFromIdentityFile,
  VALID_ROLES,
  VALID_GUARDS,
};
