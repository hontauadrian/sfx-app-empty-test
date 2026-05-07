/**
 * End-to-end test for the cascade detector in flow-runner.ts.
 *
 * Builds a minimal in-memory MergedContract with one chain + two
 * dependent flows, runs executeCuratedFlows with a fetch double that
 * fails the chain's POST, and asserts:
 *   1. chain flow status === 'failed'
 *   2. both dependent flows are 'skipped' with reason 'UPSTREAM_FAILED:<chain-id>'
 *      and `derivedOf` set to the chain's id
 *   3. the fetch double is NOT called for the dependent flows' URLs —
 *      proves the runner short-circuits before issuing requests, which
 *      is the wall-clock saving on top of the report-clarity benefit
 *
 * Also covers the smoke-report renderer: builds a SmokeReport with one
 * root failure + three derived skips, calls formatHumanReport, and
 * asserts the new "Derived flows skipped (cascade)" section appears
 * with the root id and every derived label.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { executeCuratedFlows } from '../flow-runner';
import type { MergedContract } from '../contract-flows-merger';
import { formatHumanReport } from '../../smoke-report';
import type { SmokeReport } from '../../smoke-report';

function makeContract(): MergedContract {
  return {
    actors: new Map(),
    resources: new Map(),
    fixtures: new Map(),
    taskIds: ['test'],
    config: { reservedActors: {} },
    specialFlows: [
      {
        flow: {
          id: 'chain:resource-setup:teams',
          description: 'create the teams resource',
          contract: { kind: 'http', source: 'test' },
          steps: [
            { kind: 'api', transport: 'http', method: 'POST', path: '/teams', body: {} } as never,
            { kind: 'expect', status: 201 } as never,
          ],
        } as never,
        sourceFile: 'test',
        taskId: 'test',
      },
      {
        flow: {
          id: 'flow:teams-id:get:happy',
          description: 'GET /teams/:id with captured id',
          contract: { kind: 'http', source: 'test' },
          dependsOn: ['chain:resource-setup:teams'],
          steps: [
            { kind: 'api', transport: 'http', method: 'GET', path: '/teams/abc' } as never,
            { kind: 'expect', status: 200 } as never,
          ],
        } as never,
        sourceFile: 'test',
        taskId: 'test',
      },
      {
        flow: {
          id: 'flow:teams-id:patch:happy',
          description: 'PATCH /teams/:id with captured id',
          contract: { kind: 'http', source: 'test' },
          dependsOn: ['chain:resource-setup:teams'],
          steps: [
            { kind: 'api', transport: 'http', method: 'PATCH', path: '/teams/abc', body: { name: 'x' } } as never,
            { kind: 'expect', status: 200 } as never,
          ],
        } as never,
        sourceFile: 'test',
        taskId: 'test',
      },
    ],
  };
}

test('cascade: chain failure short-circuits dependent flows with UPSTREAM_FAILED', async () => {
  const calls: string[] = [];
  const fakeFetch: typeof globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : (input as Request).url;
    calls.push(url);
    if (url.includes('/teams') && !url.includes('/teams/')) {
      // chain POST /teams — return validation error
      return new Response(
        JSON.stringify({ success: false, error: { statusCode: 400, message: 'Validation failed' } }),
        { status: 400, headers: { 'content-type': 'application/json' } },
      );
    }
    // any other URL — would succeed if reached. The cascade detector
    // must prevent this branch from being touched.
    return new Response('{}', { status: 200 });
  };

  const report = await executeCuratedFlows(makeContract(), {
    baseUrl: 'http://test.invalid',
    fetch: fakeFetch,
    skipBootstrap: true,
    pathPrefix: '',
  });

  // Chain flow itself failed.
  const chain = report.flows.find((f) => f.id === 'chain:resource-setup:teams');
  assert.ok(chain, 'chain flow must be in report');
  assert.equal(chain!.status, 'failed', `chain status should be failed, got ${chain!.status}`);

  // Dependent flows skipped with the right backref.
  const get = report.flows.find((f) => f.id === 'flow:teams-id:get:happy');
  const patch = report.flows.find((f) => f.id === 'flow:teams-id:patch:happy');
  assert.ok(get && patch);
  for (const dep of [get!, patch!]) {
    assert.equal(dep.status, 'skipped', `${dep.id} must be skipped`);
    assert.equal(dep.reason, 'UPSTREAM_FAILED:chain:resource-setup:teams');
    assert.equal(dep.derivedOf, 'chain:resource-setup:teams');
    assert.deepEqual(dep.steps, [], 'derived skip must record zero step results');
  }

  // Wall-clock proof: fetch was never called for /teams/abc — the
  // cascade detector short-circuited before any dependent request.
  const dependentCalls = calls.filter((u) => u.includes('/teams/abc'));
  assert.equal(
    dependentCalls.length,
    0,
    `dependent flows should not issue HTTP; got: ${dependentCalls.join(', ')}`,
  );

  // Summary counters reflect the new state.
  assert.equal(report.failed, 1);
  assert.equal(report.skipped, 2);
  assert.equal(report.passed, 0);
});

test('cascade: chain success runs dependents normally (no false skips)', async () => {
  // Mirror the failure-case test as the success-case requirement of the
  // procedure: when the chain passes, dependent flows must execute, not
  // be silently skipped.
  const calls: string[] = [];
  const fakeFetch: typeof globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : (input as Request).url;
    const method = (init?.method ?? (typeof input === 'string' ? 'GET' : ((input as Request).method ?? 'GET'))) as string;
    calls.push(`${method} ${url}`);
    if (url.endsWith('/teams') && method === 'POST') {
      return new Response('{"id":"abc"}', { status: 201, headers: { 'content-type': 'application/json' } });
    }
    if (url.includes('/teams/abc')) {
      return new Response('{"id":"abc","name":"ok"}', { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response('{}', { status: 404 });
  };

  const report = await executeCuratedFlows(makeContract(), {
    baseUrl: 'http://test.invalid',
    fetch: fakeFetch,
    skipBootstrap: true,
    pathPrefix: '',
  });

  // No skips, all three flows ran.
  assert.equal(report.passed, 3, `expected 3 passed; got ${report.passed} (failed=${report.failed} skipped=${report.skipped})`);
  assert.equal(report.failed, 0);
  assert.equal(report.skipped, 0);
  for (const flow of report.flows) {
    assert.equal(flow.status, 'passed', `${flow.id} must pass`);
    assert.equal(flow.derivedOf, undefined);
  }

  // Sanity: dependents DID issue HTTP (proves they weren't false-skipped).
  assert.ok(calls.some((c) => c.includes('GET') && c.includes('/teams/abc')));
  assert.ok(calls.some((c) => c.includes('PATCH') && c.includes('/teams/abc')));
});

test('formatHumanReport: derived skips render under their root cause', () => {
  const report: SmokeReport = {
    version: '1',
    generatedAt: '2026-05-06T00:00:00.000Z',
    projectDir: '/test',
    scope: 'session',
    profile: 'builder',
    mode: { readOnly: false, strict: false, fullScope: false },
    stack: { ownership: 'guest', ports: {}, reused: false, bootPlanDriver: 'test' },
    summary: { total: 4, passed: 3, failed: 1, skipped: 3, durationMs: 100 },
    exitCode: 1,
    blockReason: 'FLOW_STEP_FAILED:chain:resource-setup:teams',
    blockCodes: ['FLOW_STEP_FAILED'],
    cases: [
      {
        label: 'contract-flow:chain:resource-setup:teams',
        category: 'flow',
        passed: false,
        blockReason: 'POST /teams returned 400',
      },
      {
        label: 'contract-flow:flow:teams-id:get:happy',
        category: 'flow',
        passed: true,
        derivedOf: 'chain:resource-setup:teams',
      },
      {
        label: 'contract-flow:flow:teams-id:patch:happy',
        category: 'flow',
        passed: true,
        derivedOf: 'chain:resource-setup:teams',
      },
      {
        label: 'contract-flow:flow:teams-id-members:post:happy',
        category: 'flow',
        passed: true,
        derivedOf: 'chain:resource-setup:teams',
      },
    ],
  };

  const text = formatHumanReport(report);

  // Failure section lists the root, not the derivatives.
  assert.match(text, /## Failures/);
  assert.match(text, /### contract-flow:chain:resource-setup:teams/);
  assert.doesNotMatch(
    text.split('## Derived flows skipped')[0],
    /### contract-flow:flow:teams-id:get:happy/,
    'derived flow must not appear in the Failures section',
  );

  // New cascade section names the root + all three derived labels.
  assert.match(text, /## Derived flows skipped \(cascade\)/);
  assert.match(text, /### Root: `chain:resource-setup:teams` \(3 derived\)/);
  assert.match(text, /- contract-flow:flow:teams-id:get:happy/);
  assert.match(text, /- contract-flow:flow:teams-id:patch:happy/);
  assert.match(text, /- contract-flow:flow:teams-id-members:post:happy/);
});

test('payload echo: failed step carries requestEcho and responseEcho through the report', async () => {
  // The chain step issues POST /teams with a body, server returns 400
  // with a structured validation error. The flow report should expose
  // both echoes so the human report can render "you sent X / got Y".
  const fakeFetch: typeof globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : (input as Request).url;
    const method = (init?.method ?? 'GET') as string;
    if (url.endsWith('/teams') && method === 'POST') {
      return new Response(
        JSON.stringify({ success: false, errors: [{ field: 'name', message: 'Required' }] }),
        { status: 400, headers: { 'content-type': 'application/json' } },
      );
    }
    return new Response('{}', { status: 200 });
  };

  const contract = {
    actors: new Map(),
    resources: new Map(),
    fixtures: new Map(),
    taskIds: ['test'],
    config: { reservedActors: {} },
    specialFlows: [
      {
        flow: {
          id: 'chain',
          contract: { kind: 'http', source: 'test' },
          steps: [
            { kind: 'api', transport: 'http', method: 'POST', path: '/teams', body: { slug: 'team-abc' } },
            { kind: 'expect', status: 201 },
          ],
        },
        sourceFile: 'test',
        taskId: 'test',
      },
    ],
  } as never;

  const r = await executeCuratedFlows(contract, {
    baseUrl: 'http://t',
    fetch: fakeFetch,
    skipBootstrap: true,
    pathPrefix: '',
  });

  const chain = r.flows[0];
  assert.equal(chain.status, 'failed');
  const failedStep = chain.steps.find((s) => !s.passed);
  assert.ok(failedStep, 'failed step must exist');
  // requestEcho carries the post-interpolation body that was actually sent.
  assert.deepEqual(failedStep!.requestEcho?.body, { slug: 'team-abc' });
  assert.equal(failedStep!.requestEcho?.method, 'POST');
  assert.match(failedStep!.requestEcho!.url, /\/teams$/);
  // responseEcho carries the parsed JSON the server returned.
  assert.equal(failedStep!.responseEcho?.status, 400);
  assert.deepEqual(failedStep!.responseEcho?.body, {
    success: false,
    errors: [{ field: 'name', message: 'Required' }],
  });
});

test('payload echo: passing flows do not emit echoes (size budget guard)', async () => {
  // Echoes are only useful for failures. A passing flow must leave them
  // undefined so a 256-flow run doesn't blow up the report with hundreds
  // of redundant request/response blocks for green cases.
  const fakeFetch: typeof globalThis.fetch = async () =>
    new Response('{"id":"x"}', { status: 201, headers: { 'content-type': 'application/json' } });
  const contract = {
    actors: new Map(),
    resources: new Map(),
    fixtures: new Map(),
    taskIds: ['test'],
    config: { reservedActors: {} },
    specialFlows: [
      {
        flow: {
          id: 'happy',
          contract: { kind: 'http', source: 'test' },
          steps: [
            { kind: 'api', transport: 'http', method: 'POST', path: '/teams', body: { name: 'x', slug: 'y' } },
            { kind: 'expect', status: 201 },
          ],
        },
        sourceFile: 'test',
        taskId: 'test',
      },
    ],
  } as never;
  const r = await executeCuratedFlows(contract, {
    baseUrl: 'http://t',
    fetch: fakeFetch,
    skipBootstrap: true,
    pathPrefix: '',
  });
  for (const step of r.flows[0].steps) {
    assert.equal(step.requestEcho, undefined, 'passing step must not carry requestEcho');
    assert.equal(step.responseEcho, undefined, 'passing step must not carry responseEcho');
  }
});

test('formatHumanReport: failure renders sent + got blocks within byte cap', () => {
  const report: SmokeReport = {
    version: '1',
    generatedAt: '2026-05-06T00:00:00.000Z',
    projectDir: '/test',
    scope: 'session',
    profile: 'builder',
    mode: { readOnly: false, strict: false, fullScope: false },
    stack: { ownership: 'guest', ports: {}, reused: false, bootPlanDriver: 'test' },
    summary: { total: 1, passed: 0, failed: 1, skipped: 0, durationMs: 10 },
    exitCode: 1,
    blockCodes: ['FLOW_STEP_FAILED'],
    cases: [
      {
        label: 'contract-flow:chain',
        category: 'flow',
        passed: false,
        blockReason: 'expect: expected status === 201, got status === 400',
        requestEcho: {
          method: 'POST',
          url: 'http://t/api/v1/teams',
          body: { slug: 'team-abc' },
          bodyKind: 'json',
        },
        responseEcho: {
          status: 400,
          body: { success: false, errors: [{ field: 'name', message: 'Required' }] },
        },
      },
    ],
  };
  const text = formatHumanReport(report);
  assert.match(text, /sent: `POST http:\/\/t\/api\/v1\/teams`/);
  assert.match(text, /body: `\{"slug":"team-abc"\}`/);
  assert.match(text, /got: `status=400`/);
  assert.match(text, /errors.*name.*Required/);
});

test('formatHumanReport: full body rendered without truncation', () => {
  // Build a 50-field payload and confirm every field appears in the
  // rendered output. Echoes are uncapped — typical API payloads are
  // small enough that compression-only (whitespace flatten) keeps the
  // output a single readable line, and the agent benefits from seeing
  // every field rather than guessing what was dropped.
  const big: Record<string, string> = {};
  for (let i = 0; i < 50; i++) big[`field_${i}`] = `value-${i}`;
  const report: SmokeReport = {
    version: '1',
    generatedAt: '2026-05-06T00:00:00.000Z',
    projectDir: '/test',
    scope: 'session',
    profile: 'builder',
    mode: { readOnly: false, strict: false, fullScope: false },
    stack: { ownership: 'guest', ports: {}, reused: false, bootPlanDriver: 'test' },
    summary: { total: 1, passed: 0, failed: 1, skipped: 0, durationMs: 10 },
    exitCode: 1,
    blockCodes: [],
    cases: [
      {
        label: 'contract-flow:big',
        category: 'flow',
        passed: false,
        blockReason: 'expect: status mismatch',
        requestEcho: { method: 'POST', url: 'http://t/big', body: big, bodyKind: 'json' },
      },
    ],
  };
  const text = formatHumanReport(report);
  assert.doesNotMatch(text, /more chars\)/, 'no truncation suffix expected — body is not capped');
  // Sanity: the first and last fields must both appear, proving the
  // entire payload is in the report.
  assert.match(text, /"field_0":"value-0"/);
  assert.match(text, /"field_49":"value-49"/);
});

test('formatHumanReport: no cascade section when there are no derived skips', () => {
  // Negative case: a clean run (or a run whose only failure has no
  // dependents) should NOT render the cascade section. Otherwise the
  // section would be a confusing empty-state.
  const report: SmokeReport = {
    version: '1',
    generatedAt: '2026-05-06T00:00:00.000Z',
    projectDir: '/test',
    scope: 'session',
    profile: 'builder',
    mode: { readOnly: false, strict: false, fullScope: false },
    stack: { ownership: 'guest', ports: {}, reused: false, bootPlanDriver: 'test' },
    summary: { total: 1, passed: 1, failed: 0, skipped: 0, durationMs: 10 },
    exitCode: 0,
    blockCodes: [],
    cases: [
      {
        label: 'contract-flow:standalone',
        category: 'flow',
        passed: true,
      },
    ],
  };

  const text = formatHumanReport(report);
  assert.doesNotMatch(text, /## Derived flows skipped/);
});
