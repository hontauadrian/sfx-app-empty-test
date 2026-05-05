/**
 * Tests for contract-flows/adapter-registry.ts.
 *
 * Coverage:
 *   - register(): rejects double-registration of the same transport.
 *   - resolve(): routes by step.transport when set; falls back to
 *     supports() probing when not.
 *   - resolve(): throws ContractFlowError(FLOW_ADAPTER_UNREGISTERED)
 *     when no adapter claims the step.
 *   - has() / list().
 *   - getRegistry() returns a singleton across calls; __resetRegistryForTests
 *     restores a fresh instance.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';

import {
  AdapterRegistry,
  getRegistry,
  __resetRegistryForTests,
} from '../adapter-registry';
import { ContractFlowError } from '../errors';
import type { ProtocolAdapter } from '../adapter-interface';
import type { Step } from '../step-types';

function makeAdapter(transport: string, supportsKinds: string[]): ProtocolAdapter {
  return {
    id: { transport, version: '1' },
    supports(step: Step) {
      const stepTransport = (step as { transport?: string }).transport;
      if (stepTransport !== undefined && stepTransport !== transport) return false;
      return supportsKinds.includes((step as { kind: string }).kind);
    },
    async execute() { return { passed: true }; },
    parseSchema() { return z.unknown(); },
  };
}

test('register() throws on double-registration of the same transport', () => {
  const reg = new AdapterRegistry();
  reg.register(makeAdapter('http', ['api', 'expect']));
  assert.throws(() => reg.register(makeAdapter('http', ['poll'])), /already registered/);
});

test('resolve() routes by step.transport tag when set', () => {
  const reg = new AdapterRegistry();
  const httpA = makeAdapter('http', ['api']);
  const wsA = makeAdapter('ws', ['api']);
  reg.register(httpA);
  reg.register(wsA);

  const httpStep: Step = { kind: 'api', transport: 'http', method: 'GET', path: '/' };
  const wsStep:   Step = { kind: 'api', transport: 'ws',   method: 'GET', path: '/' };
  assert.equal(reg.resolve(httpStep).id.transport, 'http');
  assert.equal(reg.resolve(wsStep).id.transport,   'ws');
});

test('resolve() falls back to supports() when transport tag is unset', () => {
  const reg = new AdapterRegistry();
  const cookieA = makeAdapter('cookie-jar', ['capture-cookie']);
  reg.register(makeAdapter('http', ['api']));
  reg.register(cookieA);

  // Cookie steps in the schema do not carry an explicit transport — registry
  // probes supports() in registration order.
  const cookieStep = { kind: 'capture-cookie', name: 'sess', binding: 'b' } as unknown as Step;
  assert.equal(reg.resolve(cookieStep).id.transport, 'cookie-jar');
});

test('resolve() throws ContractFlowError(FLOW_ADAPTER_UNREGISTERED) on miss', () => {
  const reg = new AdapterRegistry();
  reg.register(makeAdapter('http', ['api']));
  const step: Step = { kind: 'api', transport: 'grpc', method: 'GET', path: '/' };
  try {
    reg.resolve(step);
    assert.fail('expected throw');
  } catch (e: unknown) {
    assert.ok(e instanceof ContractFlowError);
    const err = e as ContractFlowError;
    assert.equal(err.typed.code, 'FLOW_ADAPTER_UNREGISTERED');
    if (err.typed.code === 'FLOW_ADAPTER_UNREGISTERED') {
      assert.equal(err.typed.transport, 'grpc');
      assert.equal(err.typed.stepKind, 'api');
    }
  }
});

test('has() / list() reflect registered adapters', () => {
  const reg = new AdapterRegistry();
  assert.equal(reg.has('http'), false);
  reg.register(makeAdapter('http', ['api']));
  reg.register(makeAdapter('ws',   ['api']));
  assert.equal(reg.has('http'), true);
  assert.equal(reg.has('ws'),   true);
  assert.equal(reg.has('grpc'), false);
  const list = reg.list();
  assert.equal(list.length, 2);
  assert.deepEqual(list.map((i) => i.transport).sort(), ['http', 'ws']);
});

test('reset() clears registrations', () => {
  const reg = new AdapterRegistry();
  reg.register(makeAdapter('http', ['api']));
  reg.reset();
  assert.equal(reg.has('http'), false);
  assert.equal(reg.list().length, 0);
});

test('getRegistry() returns the same singleton until reset', () => {
  __resetRegistryForTests();
  const a = getRegistry();
  const b = getRegistry();
  assert.equal(a, b);

  __resetRegistryForTests();
  const c = getRegistry();
  assert.notEqual(a, c);
});
