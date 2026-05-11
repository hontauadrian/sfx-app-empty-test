import { test } from 'node:test';
import assert from 'node:assert/strict';

import { HttpAdapter } from '../lib/adapters/http-adapter';
import type { ExecCtx } from '../adapter-interface';
import type { CaptureStep, ExpectStep } from '../step-types';
import type { MergedContract } from '../contract-flows-merger';

const FLOW_SCRATCH_KEY = '__http_adapter_scratch__';

function buildCtx(): ExecCtx {
  return {
    bindings: {},
    flowId: 'test-flow',
    client: null,
    flowScratch: new Map(),
  };
}

function injectResponse(ctx: ExecCtx, body: unknown): void {
  const scratch = {
    cookieJar: { list: () => [], serializeForRequest: () => '', clear: () => {}, ingest: () => {} },
    lastResponse: { status: 200, headers: {}, body, rawText: JSON.stringify(body) },
  };
  ctx.flowScratch!.set(FLOW_SCRATCH_KEY, scratch);
}

function makeContract(envelopeWrapper: string[] | undefined): MergedContract {
  return {
    actors: new Map(),
    resources: new Map(),
    specialFlows: [],
    fixtures: new Map(),
    config: envelopeWrapper ? { envelope: { successWrapper: envelopeWrapper } } : {},
  } as unknown as MergedContract;
}

async function runCapture(adapter: HttpAdapter, ctx: ExecCtx, path: string): Promise<string> {
  const step = { kind: 'capture', bindings: { x: path } } as CaptureStep;
  const result = await adapter.execute(step, ctx);
  assert.equal(result.passed, false, 'expected capture to fail');
  assert.ok(result.blockReason, 'expected blockReason on failed capture');
  return result.blockReason!;
}

test('capture: body-shape hint shows root keys when envelope wrapper is missing from response', async () => {
  const adapter = new HttpAdapter('http://example', {}, makeContract(['data']));
  const ctx = buildCtx();
  injectResponse(ctx, { success: false, error: { code: 'AUTH_FAIL' } });
  const msg = await runCapture(adapter, ctx, '$.accessToken');
  assert.match(msg, /resolved to undefined/);
  assert.match(msg, /Body at \$\.data \(envelope wrapper\) is undefined/);
});

test('capture: body-shape hint enters envelope and lists keys at $.data when wrapper is present', async () => {
  const adapter = new HttpAdapter('http://example', {}, makeContract(['data']));
  const ctx = buildCtx();
  injectResponse(ctx, { success: true, data: { refreshToken: 'r' } });
  const msg = await runCapture(adapter, ctx, '$.accessToken');
  assert.match(msg, /Body shape at \$\.data \(envelope wrapper\): \{refreshToken\} \(no 'accessToken'\)/);
});

test('capture: body-shape hint walks deep paths and reports the first missing branch', async () => {
  const adapter = new HttpAdapter('http://example', {}, makeContract(['data']));
  const ctx = buildCtx();
  injectResponse(ctx, { success: true, data: { user: { id: 1 } } });
  const msg = await runCapture(adapter, ctx, '$.user.email');
  assert.match(msg, /Body shape at \$\.data\.user: \{id\} \(no 'email'\)/);
});

test('capture: body-shape hint reports array shape when path lands on an array', async () => {
  const adapter = new HttpAdapter('http://example', {}, makeContract(undefined));
  const ctx = buildCtx();
  injectResponse(ctx, []);
  const msg = await runCapture(adapter, ctx, '$.X');
  assert.match(msg, /Body at \$ is array \(length=0\)/);
});

test('capture: body-shape hint truncates key list to 8 with ...N more overflow', async () => {
  const adapter = new HttpAdapter('http://example', {}, makeContract(undefined));
  const ctx = buildCtx();
  injectResponse(ctx, { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7, h: 8, i: 9, j: 10 });
  const msg = await runCapture(adapter, ctx, '$.missing');
  assert.match(msg, /\{a, b, c, d, e, f, g, h, \.\.\.2 more\} \(no 'missing'\)/);
});

test('expect.bodyHas: appends body-shape hint when actual is undefined', async () => {
  const adapter = new HttpAdapter('http://example', {}, makeContract(['data']));
  const ctx = buildCtx();
  injectResponse(ctx, { success: false, error: { code: 'X' } });
  const step = { kind: 'expect', bodyHas: { '$.accessToken': { type: 'string' } } } as ExpectStep;
  const result = await adapter.execute(step, ctx);
  assert.equal(result.passed, false);
  assert.ok(result.blockReason);
  assert.match(result.blockReason!, /actual=undefined/);
  assert.match(result.blockReason!, /Body at \$\.data \(envelope wrapper\) is undefined/);
});

test('expect.bodyHas: does not append shape hint when actual is defined but mismatched', async () => {
  const adapter = new HttpAdapter('http://example', {}, makeContract(['data']));
  const ctx = buildCtx();
  injectResponse(ctx, { success: true, data: { accessToken: 42 } });
  const step = { kind: 'expect', bodyHas: { '$.accessToken': { type: 'string' } } } as ExpectStep;
  const result = await adapter.execute(step, ctx);
  assert.equal(result.passed, false);
  assert.ok(result.blockReason);
  assert.match(result.blockReason!, /actual=42/);
  assert.doesNotMatch(result.blockReason!, /Body shape/);
});
