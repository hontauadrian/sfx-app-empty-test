/**
 * Tests for contract-flows/adapter-interface.ts.
 *
 * The interface is type-only at runtime, so these tests are mostly
 * shape assertions: a stub adapter implementing the contract is
 * usable through `supports()` / `execute()` / `parseSchema()`, and an
 * `ExecCtx` carrying every optional field can be constructed and
 * passed verbatim. The point is to lock the public surface so a
 * downstream HTTP / WS / DB adapter cannot accidentally diverge.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';

import type {
  ProtocolAdapter,
  ExecCtx,
  StepResult,
  AdapterId,
} from '../adapter-interface';
import type { Step, SideEffectDecl } from '../step-types';

class StubAdapter implements ProtocolAdapter {
  id: AdapterId = { transport: 'stub', version: '1' };
  callCount = 0;

  supports(step: Step): boolean {
    return (step as { transport?: string }).transport === 'stub';
  }
  async execute(_step: Step, _ctx: ExecCtx): Promise<StepResult> {
    this.callCount += 1;
    return {
      passed: true,
      capturedBindings: { id: 'captured-id' },
      raw: { ok: true },
      substeps: [{ passed: true }],
    };
  }
  parseSchema(): z.ZodSchema<unknown> {
    return z.object({}).strict();
  }
}

test('ProtocolAdapter contract: supports() / execute() / parseSchema() round-trip', async () => {
  const adapter = new StubAdapter();
  const supported: Step = { kind: 'api', transport: 'stub', method: 'GET', path: '/' };
  const unsupported: Step = { kind: 'api', transport: 'http', method: 'GET', path: '/' };
  assert.equal(adapter.supports(supported), true);
  assert.equal(adapter.supports(unsupported), false);

  const ctx: ExecCtx = {
    bindings: {},
    flowId: 'task:flow',
    client: {},
    cookieJar: undefined,
    flowScratch: new Map<string, unknown>(),
    abortSignal: new AbortController().signal,
    recordSideEffect: (_d: SideEffectDecl) => {},
  };
  const result = await adapter.execute(supported, ctx);
  assert.equal(result.passed, true);
  assert.deepEqual(result.capturedBindings, { id: 'captured-id' });
  assert.equal(adapter.callCount, 1);
  assert.ok(adapter.parseSchema().safeParse({}).success);
});

test('ExecCtx.recordSideEffect is callable for adapter-recorded effects', () => {
  const recorded: SideEffectDecl[] = [];
  const ctx: ExecCtx = {
    bindings: {},
    flowId: 'task:flow',
    client: null,
    recordSideEffect: (decl) => recorded.push(decl),
  };
  ctx.recordSideEffect?.({
    kind: 'audit-log',
    polarity: 'expected',
    description: 'audit logged',
    verifiedBy: 'http-probe',
  });
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].kind, 'audit-log');
});

test('AdapterId.version is locked to "1" so future bumps surface in the type system', () => {
  // Compile-time check — would fail typecheck if version drifted from '1'.
  const id: AdapterId = { transport: 'http', version: '1' };
  assert.equal(id.version, '1');
});
