'use strict';

// Tests for detectors/trpc.js — tRPC procedure detection.
//
// Verifies that:
//   1. Procedures are detected from router({ name: proc.query() }) patterns.
//   2. `protectedProcedure` string match is NOT used for guard (heuristic removed).
//   3. Guard is 'unknown' unless explicit `// @protected` or `.meta({ protected: true })`.
//   4. DIAG TRPC_PROTECTION_UNDECLARED emitted for unknown-guard procedures.
//
// Run directly: `node --test __tests__/trpc.test.js`

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { detectTrpc } = require('../detectors/trpc');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDiag() {
  const entries = [];
  return {
    entries,
    info: (msg) => entries.push({ level: 'info', message: msg }),
    warn: (msg) => entries.push({ level: 'warn', message: msg }),
  };
}

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trpc-test-'));
  try {
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Guard detection: protectedProcedure NOT used as heuristic
// ---------------------------------------------------------------------------

test('trpc: protectedProcedure string does NOT make guard=authenticated (heuristic removed)', () => {
  withTempDir((dir) => {
    const source = `
      import { router } from '@trpc/server';
      export const appRouter = router({
        getUser: protectedProcedure.query(() => {}),
      });
    `;
    fs.writeFileSync(path.join(dir, 'router.ts'), source);
    const diag = makeDiag();
    const result = detectTrpc(dir, diag);
    assert.strictEqual(result.endpoints.length, 1);
    assert.strictEqual(result.endpoints[0].guard, 'unknown');
    assert.strictEqual(result.endpoints[0].path, '/trpc/getUser');
    assert.strictEqual(result.endpoints[0].method, 'GET');
  });
});

test('trpc: publicProcedure also gets guard=unknown (no heuristic)', () => {
  withTempDir((dir) => {
    const source = `
      import { router } from '@trpc/server';
      export const appRouter = router({
        listItems: publicProcedure.query(() => {}),
      });
    `;
    fs.writeFileSync(path.join(dir, 'router.ts'), source);
    const diag = makeDiag();
    const result = detectTrpc(dir, diag);
    assert.strictEqual(result.endpoints.length, 1);
    assert.strictEqual(result.endpoints[0].guard, 'unknown');
  });
});

test('trpc: aliased procedure gets guard=unknown (heuristic would have missed this)', () => {
  withTempDir((dir) => {
    const source = `
      import { router } from '@trpc/server';
      const p = protectedProcedure;
      export const appRouter = router({
        secret: p.query(() => {}),
      });
    `;
    fs.writeFileSync(path.join(dir, 'router.ts'), source);
    const diag = makeDiag();
    const result = detectTrpc(dir, diag);
    assert.strictEqual(result.endpoints.length, 1);
    assert.strictEqual(result.endpoints[0].guard, 'unknown');
  });
});

// ---------------------------------------------------------------------------
// Guard detection: declarative annotations
// ---------------------------------------------------------------------------

test('trpc: // @protected comment makes guard=authenticated', () => {
  withTempDir((dir) => {
    const source = `
      import { router } from '@trpc/server';
      export const appRouter = router({
        // @protected
        getUser: protectedProcedure.query(() => {}),
      });
    `;
    fs.writeFileSync(path.join(dir, 'router.ts'), source);
    const diag = makeDiag();
    const result = detectTrpc(dir, diag);
    assert.strictEqual(result.endpoints.length, 1);
    assert.strictEqual(result.endpoints[0].guard, 'authenticated');
  });
});

test('trpc: .meta({ protected: true }) makes guard=authenticated', () => {
  withTempDir((dir) => {
    const source = `
      import { router } from '@trpc/server';
      export const appRouter = router({
        getUser: protectedProcedure.meta({ protected: true }).query(() => {}),
      });
    `;
    fs.writeFileSync(path.join(dir, 'router.ts'), source);
    const diag = makeDiag();
    const result = detectTrpc(dir, diag);
    assert.strictEqual(result.endpoints.length, 1);
    assert.strictEqual(result.endpoints[0].guard, 'authenticated');
  });
});

// ---------------------------------------------------------------------------
// Basic detection
// ---------------------------------------------------------------------------

test('trpc: detects query and mutation procedures', () => {
  withTempDir((dir) => {
    const source = `
      import { router } from '@trpc/server';
      export const appRouter = router({
        getItems: publicProcedure.query(() => []),
        createItem: publicProcedure.mutation(() => {}),
      });
    `;
    fs.writeFileSync(path.join(dir, 'router.ts'), source);
    const diag = makeDiag();
    const result = detectTrpc(dir, diag);
    assert.strictEqual(result.endpoints.length, 2);
    assert.strictEqual(result.endpoints[0].method, 'GET');
    assert.strictEqual(result.endpoints[0].path, '/trpc/getItems');
    assert.strictEqual(result.endpoints[1].method, 'POST');
    assert.strictEqual(result.endpoints[1].path, '/trpc/createItem');
  });
});

test('trpc: detects nested router procedures', () => {
  withTempDir((dir) => {
    const source = `
      import { router } from '@trpc/server';
      export const appRouter = router({
        user: router({
          getById: publicProcedure.query(() => {}),
        }),
      });
    `;
    fs.writeFileSync(path.join(dir, 'router.ts'), source);
    const diag = makeDiag();
    const result = detectTrpc(dir, diag);
    assert.strictEqual(result.endpoints.length, 1);
    assert.strictEqual(result.endpoints[0].path, '/trpc/user.getById');
  });
});

test('trpc: returns empty when no tRPC files', () => {
  withTempDir((dir) => {
    fs.writeFileSync(path.join(dir, 'app.ts'), 'const x = 1;');
    const diag = makeDiag();
    const result = detectTrpc(dir, diag);
    assert.strictEqual(result.endpoints.length, 0);
    assert.deepStrictEqual(result.pages, []);
  });
});

test('trpc: skips node_modules', () => {
  withTempDir((dir) => {
    const nmDir = path.join(dir, 'node_modules', 'pkg');
    fs.mkdirSync(nmDir, { recursive: true });
    fs.writeFileSync(path.join(nmDir, 'router.ts'), `
      import { router } from '@trpc/server';
      export const appRouter = router({
        hidden: publicProcedure.query(() => {}),
      });
    `);
    const diag = makeDiag();
    const result = detectTrpc(dir, diag);
    assert.strictEqual(result.endpoints.length, 0);
  });
});

// ---------------------------------------------------------------------------
// DIAG emission
// ---------------------------------------------------------------------------

test('trpc: emits TRPC_PROTECTION_UNDECLARED diag for unknown-guard procedures', () => {
  withTempDir((dir) => {
    const source = `
      import { router } from '@trpc/server';
      export const appRouter = router({
        listItems: publicProcedure.query(() => []),
      });
    `;
    fs.writeFileSync(path.join(dir, 'router.ts'), source);
    const diag = makeDiag();
    detectTrpc(dir, diag);
    const undeclared = diag.entries.find(
      (entry) => entry.message.includes('TRPC_PROTECTION_UNDECLARED')
    );
    assert.ok(undeclared, 'Expected TRPC_PROTECTION_UNDECLARED diag');
    assert.ok(undeclared.message.includes('@protected'));
  });
});

test('trpc: does NOT emit TRPC_PROTECTION_UNDECLARED when all declared', () => {
  withTempDir((dir) => {
    const source = `
      import { router } from '@trpc/server';
      export const appRouter = router({
        // @protected
        getUser: protectedProcedure.query(() => {}),
      });
    `;
    fs.writeFileSync(path.join(dir, 'router.ts'), source);
    const diag = makeDiag();
    detectTrpc(dir, diag);
    const undeclared = diag.entries.find(
      (entry) => entry.message.includes('TRPC_PROTECTION_UNDECLARED')
    );
    assert.strictEqual(undeclared, undefined);
  });
});

test('trpc: does NOT emit TRPC_PROTECTION_UNDECLARED when no endpoints', () => {
  withTempDir((dir) => {
    fs.writeFileSync(path.join(dir, 'app.ts'), 'const x = 1;');
    const diag = makeDiag();
    detectTrpc(dir, diag);
    const undeclared = diag.entries.find(
      (entry) => entry.message.includes('TRPC_PROTECTION_UNDECLARED')
    );
    assert.strictEqual(undeclared, undefined);
  });
});

// ---------------------------------------------------------------------------
// Input schema extraction
// ---------------------------------------------------------------------------

test('trpc: extracts input literal from .input() chain', () => {
  withTempDir((dir) => {
    const source = `
      import { router } from '@trpc/server';
      export const appRouter = router({
        create: publicProcedure.input(z.object({ name: z.string() })).mutation(() => {}),
      });
    `;
    fs.writeFileSync(path.join(dir, 'router.ts'), source);
    const diag = makeDiag();
    const result = detectTrpc(dir, diag);
    assert.strictEqual(result.endpoints.length, 1);
    assert.ok(result.endpoints[0].inputSchemaRef);
    assert.ok(result.endpoints[0].inputSchemaRef.includes('z.object'));
  });
});
