'use strict';

// Tests for detectors/next.js — Next.js page/route detection.
//
// Verifies that:
//   1. Auth guard + role come ONLY from sibling page.identity.<ext> files.
//   2. Folder-name heuristic (dashboard/authenticated/protected) is NOT used.
//   3. Function-call heuristic (redirect/auth/getServerSession/cookies) is NOT used.
//   4. PAGE_IDENTITY_UNDECLARED diag emitted for pages without identity file.
//   5. pageRoles map populated from valid identity files.
//
// Run directly: `node --test __tests__/next.test.js`

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { detectNextAppPages, detectNextPagesRouter } = require('../detectors/next');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDiag() {
  const entries = [];
  return {
    entries,
    info: (msg) => entries.push({ level: 'info', message: msg }),
    warn: (msg) => entries.push({ level: 'warn', message: msg }),
    error: (msg) => entries.push({ level: 'error', message: msg }),
  };
}

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'next-test-'));
  try {
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function writeFile(dir, relPath, content) {
  const absPath = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, content);
}

const IDENTITY = (role, guard) =>
  `import type { PageIdentity } from '../../types/page-identity';\n` +
  `export const identity: PageIdentity = { role: '${role}', guard: '${guard}' };\n`;

// ---------------------------------------------------------------------------
// Identity-driven guard detection
// ---------------------------------------------------------------------------

test('next: page with sibling page.identity.ts (guard=authenticated) is detected', () => {
  withTempDir((dir) => {
    writeFile(dir, 'app/dashboard/page.tsx', `
      export default function Dashboard() { return <div>Dashboard</div>; }
    `);
    writeFile(dir, 'app/dashboard/page.identity.ts', IDENTITY('post-login-destination', 'authenticated'));
    writeFile(dir, 'app/layout.tsx', 'export default function Root({ children }) { return children; }');
    const diag = makeDiag();
    const result = detectNextAppPages(dir, diag);
    assert.strictEqual(result.pages.length, 1);
    assert.strictEqual(result.pages[0].guard, 'authenticated');
    assert.strictEqual(result.pages[0].role, 'post-login-destination');
  });
});

test('next: page with sibling page.identity.ts (guard=public, role=login-page) is detected', () => {
  withTempDir((dir) => {
    writeFile(dir, 'app/login/page.tsx', `
      export default function Login() { return <div>Login</div>; }
    `);
    writeFile(dir, 'app/login/page.identity.ts', IDENTITY('login-page', 'public'));
    writeFile(dir, 'app/layout.tsx', 'export default function Root({ children }) { return children; }');
    const diag = makeDiag();
    const result = detectNextAppPages(dir, diag);
    assert.strictEqual(result.pages.length, 1);
    assert.strictEqual(result.pages[0].guard, 'public');
    assert.strictEqual(result.pages[0].role, 'login-page');
    assert.strictEqual(result.pageRoles['login-page'], '/login');
  });
});

test('next: page without sibling identity gets guard=unknown', () => {
  withTempDir((dir) => {
    writeFile(dir, 'app/about/page.tsx', `
      export default function About() { return <div>About</div>; }
    `);
    writeFile(dir, 'app/layout.tsx', 'export default function Root({ children }) { return children; }');
    const diag = makeDiag();
    const result = detectNextAppPages(dir, diag);
    assert.strictEqual(result.pages.length, 1);
    assert.strictEqual(result.pages[0].guard, 'unknown');
    assert.strictEqual(result.pages[0].role, null);
  });
});

// ---------------------------------------------------------------------------
// Heuristic folder names NOT used
// ---------------------------------------------------------------------------

test('next: (dashboard) group folder does NOT make page authenticated without identity', () => {
  withTempDir((dir) => {
    writeFile(dir, 'app/(dashboard)/overview/page.tsx', `
      export default function Overview() { return <div>Overview</div>; }
    `);
    writeFile(dir, 'app/layout.tsx', 'export default function Root({ children }) { return children; }');
    const diag = makeDiag();
    const result = detectNextAppPages(dir, diag);
    assert.strictEqual(result.pages.length, 1);
    assert.strictEqual(result.pages[0].guard, 'unknown');
  });
});

test('next: (protected) group folder does NOT make page authenticated without identity', () => {
  withTempDir((dir) => {
    writeFile(dir, 'app/(protected)/secret/page.tsx', `
      export default function Secret() { return <div>Secret</div>; }
    `);
    writeFile(dir, 'app/layout.tsx', 'export default function Root({ children }) { return children; }');
    const diag = makeDiag();
    const result = detectNextAppPages(dir, diag);
    assert.strictEqual(result.pages.length, 1);
    assert.strictEqual(result.pages[0].guard, 'unknown');
  });
});

test('next: (authenticated) group folder does NOT make page authenticated without identity', () => {
  withTempDir((dir) => {
    writeFile(dir, 'app/(authenticated)/profile/page.tsx', `
      export default function Profile() { return <div>Profile</div>; }
    `);
    writeFile(dir, 'app/layout.tsx', 'export default function Root({ children }) { return children; }');
    const diag = makeDiag();
    const result = detectNextAppPages(dir, diag);
    assert.strictEqual(result.pages.length, 1);
    assert.strictEqual(result.pages[0].guard, 'unknown');
  });
});

// ---------------------------------------------------------------------------
// Heuristic function calls NOT used
// ---------------------------------------------------------------------------

test('next: layout with redirect() call does NOT make page authenticated without identity', () => {
  withTempDir((dir) => {
    writeFile(dir, 'app/secure/layout.tsx', `
      import { redirect } from 'next/navigation';
      export default function SecureLayout({ children }) {
        if (!auth()) redirect('/login');
        return children;
      }
    `);
    writeFile(dir, 'app/secure/page.tsx', `
      export default function SecurePage() { return <div>Secure</div>; }
    `);
    writeFile(dir, 'app/layout.tsx', 'export default function Root({ children }) { return children; }');
    const diag = makeDiag();
    const result = detectNextAppPages(dir, diag);
    const securePage = result.pages.find((p) => p.route.includes('secure'));
    assert.ok(securePage);
    assert.strictEqual(securePage.guard, 'unknown');
  });
});

test('next: layout with getServerSession() does NOT make page authenticated without identity', () => {
  withTempDir((dir) => {
    writeFile(dir, 'app/private/layout.tsx', `
      import { getServerSession } from 'next-auth';
      export default async function Layout({ children }) {
        const session = await getServerSession();
        return children;
      }
    `);
    writeFile(dir, 'app/private/page.tsx', `
      export default function Private() { return <div>Private</div>; }
    `);
    writeFile(dir, 'app/layout.tsx', 'export default function Root({ children }) { return children; }');
    const diag = makeDiag();
    const result = detectNextAppPages(dir, diag);
    const privatePage = result.pages.find((p) => p.route.includes('private'));
    assert.ok(privatePage);
    assert.strictEqual(privatePage.guard, 'unknown');
  });
});

test('next: layout with cookies().get(session) does NOT make page authenticated without identity', () => {
  withTempDir((dir) => {
    writeFile(dir, 'app/members/layout.tsx', `
      import { cookies } from 'next/headers';
      export default function Layout({ children }) {
        const session = cookies().get('session-token');
        return children;
      }
    `);
    writeFile(dir, 'app/members/page.tsx', `
      export default function Members() { return <div>Members</div>; }
    `);
    writeFile(dir, 'app/layout.tsx', 'export default function Root({ children }) { return children; }');
    const diag = makeDiag();
    const result = detectNextAppPages(dir, diag);
    const membersPage = result.pages.find((p) => p.route.includes('members'));
    assert.ok(membersPage);
    assert.strictEqual(membersPage.guard, 'unknown');
  });
});

// ---------------------------------------------------------------------------
// DIAG emission
// ---------------------------------------------------------------------------

test('next: emits PAGE_IDENTITY_UNDECLARED diag for pages without identity file', () => {
  withTempDir((dir) => {
    writeFile(dir, 'app/page.tsx', 'export default function Home() { return <div>Home</div>; }');
    writeFile(dir, 'app/layout.tsx', 'export default function Root({ children }) { return children; }');
    const diag = makeDiag();
    detectNextAppPages(dir, diag);
    const undeclared = diag.entries.find(
      (entry) => entry.message.includes('PAGE_IDENTITY_UNDECLARED')
    );
    assert.ok(undeclared, 'Expected PAGE_IDENTITY_UNDECLARED diag');
    assert.ok(undeclared.message.includes('page.identity'));
  });
});

test('next: emits PAGE_IDENTITY_INVALID for malformed identity file', () => {
  withTempDir((dir) => {
    writeFile(dir, 'app/login/page.tsx', 'export default function Login() { return <div>Login</div>; }');
    writeFile(dir, 'app/login/page.identity.ts', `
      // missing role + guard keys
      export const identity = { foo: 'bar' };
    `);
    writeFile(dir, 'app/layout.tsx', 'export default function Root({ children }) { return children; }');
    const diag = makeDiag();
    detectNextAppPages(dir, diag);
    const invalid = diag.entries.find((entry) => entry.message.includes('PAGE_IDENTITY_INVALID'));
    assert.ok(invalid, 'Expected PAGE_IDENTITY_INVALID diag');
  });
});

test('next: emits PAGE_IDENTITY_INVALID for unknown role', () => {
  withTempDir((dir) => {
    writeFile(dir, 'app/foo/page.tsx', 'export default function Foo() { return <div>Foo</div>; }');
    writeFile(dir, 'app/foo/page.identity.ts', IDENTITY('admin-portal', 'authenticated'));
    writeFile(dir, 'app/layout.tsx', 'export default function Root({ children }) { return children; }');
    const diag = makeDiag();
    detectNextAppPages(dir, diag);
    const invalid = diag.entries.find((entry) =>
      entry.message.includes('PAGE_IDENTITY_INVALID') && entry.message.includes('admin-portal')
    );
    assert.ok(invalid, 'Expected PAGE_IDENTITY_INVALID for unknown role');
  });
});

test('next: emits PAGE_ROLE_AMBIGUOUS when two pages claim role=login-page', () => {
  withTempDir((dir) => {
    writeFile(dir, 'app/login/page.tsx', 'export default function L() { return <div/>; }');
    writeFile(dir, 'app/login/page.identity.ts', IDENTITY('login-page', 'public'));
    writeFile(dir, 'app/signin/page.tsx', 'export default function S() { return <div/>; }');
    writeFile(dir, 'app/signin/page.identity.ts', IDENTITY('login-page', 'public'));
    writeFile(dir, 'app/layout.tsx', 'export default function Root({ children }) { return children; }');
    const diag = makeDiag();
    const result = detectNextAppPages(dir, diag);
    const ambig = diag.entries.find((entry) => entry.message.includes('PAGE_ROLE_AMBIGUOUS'));
    assert.ok(ambig, 'Expected PAGE_ROLE_AMBIGUOUS diag');
    // Probe refuses to pick → role drops out of pageRoles map.
    assert.strictEqual(result.pageRoles['login-page'], undefined);
  });
});

// ---------------------------------------------------------------------------
// Route detection basics
// ---------------------------------------------------------------------------

test('next: detects API route handlers from route.ts files', () => {
  withTempDir((dir) => {
    writeFile(dir, 'app/api/users/route.ts', `
      export async function GET(req) { return Response.json([]); }
      export async function POST(req) { return Response.json({}); }
    `);
    writeFile(dir, 'app/layout.tsx', 'export default function Root({ children }) { return children; }');
    const diag = makeDiag();
    const result = detectNextAppPages(dir, diag);
    assert.strictEqual(result.endpoints.length, 2);
    assert.strictEqual(result.endpoints[0].method, 'GET');
    assert.strictEqual(result.endpoints[0].guard, 'unknown');
    assert.strictEqual(result.endpoints[1].method, 'POST');
  });
});

test('next: Pages Router pages default to unknown without identity', () => {
  withTempDir((dir) => {
    writeFile(dir, 'pages/index.tsx', 'export default function Home() { return <div>Home</div>; }');
    writeFile(dir, 'pages/about.tsx', 'export default function About() { return <div>About</div>; }');
    const diag = makeDiag();
    const result = detectNextPagesRouter(dir, diag);
    assert.strictEqual(result.pages.length, 2);
    assert.ok(result.pages.every((p) => p.guard === 'unknown'));
  });
});

test('next: Pages Router pages default to unknown (identity-file detection is App Router-only)', () => {
  withTempDir((dir) => {
    writeFile(dir, 'pages/dashboard.tsx', `
      export default function Dashboard() { return <div>Dashboard</div>; }
    `);
    const diag = makeDiag();
    const result = detectNextPagesRouter(dir, diag);
    const dashboardPage = result.pages.find((p) => p.route === '/dashboard');
    assert.ok(dashboardPage, 'Expected /dashboard page');
    // Pages Router doesn't yet have a sibling-identity convention; guards stay
    // 'unknown' until the page is migrated to App Router (where page.identity.<ext>
    // works) or an overlay.auth.* override is set.
    assert.strictEqual(dashboardPage.guard, 'unknown');
  });
});

// ---------------------------------------------------------------------------
// Empty / no files
// ---------------------------------------------------------------------------

test('next: returns empty when no app dir exists', () => {
  withTempDir((dir) => {
    const diag = makeDiag();
    const result = detectNextAppPages(dir, diag);
    assert.strictEqual(result.pages.length, 0);
    assert.strictEqual(result.endpoints.length, 0);
  });
});
