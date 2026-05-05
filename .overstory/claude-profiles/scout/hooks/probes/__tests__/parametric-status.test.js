'use strict';

const { emitParametricStatusFlows } = require('../flows-generator');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEndpoint(overrides = {}) {
  return {
    method: 'GET',
    path: '/api/v1/probe-ref/shapes-r2/error-per-status/:code',
    file: 'shapes-r2-probe.controller.ts',
    operationId: 'getErrorPerStatus',
    swaggerDeclared: {
      statuses: [200, 400, 401, 500],
      extensions: {
        'x-status-param': 'code',
        'x-status-param-values': { '200': 'ok', '400': '400', '401': '401', '500': '500' },
      },
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// emitParametricStatusFlows
// ---------------------------------------------------------------------------

describe('emitParametricStatusFlows', () => {
  it('should return empty when x-status-param is missing', () => {
    const ep = makeEndpoint({
      swaggerDeclared: { statuses: [200, 400], extensions: {} },
    });
    const diagnostics = [];
    const covered = new Set();
    expect(emitParametricStatusFlows(ep, covered, diagnostics)).toEqual([]);
    expect(diagnostics).toEqual([]);
  });

  it('should return empty when x-status-param-values is missing', () => {
    const ep = makeEndpoint({
      swaggerDeclared: {
        statuses: [200, 400],
        extensions: { 'x-status-param': 'code' },
      },
    });
    const diagnostics = [];
    const covered = new Set();
    expect(emitParametricStatusFlows(ep, covered, diagnostics)).toEqual([]);
  });

  it('should emit flows for each uncovered declared status', () => {
    const ep = makeEndpoint();
    const diagnostics = [];
    const covered = new Set();
    const flows = emitParametricStatusFlows(ep, covered, diagnostics);

    expect(flows.length).toBe(4); // 200, 400, 401, 500
    expect(diagnostics).toEqual([]);

    // Verify param substitution for each
    const flow200 = flows.find((f) => f.id.includes('parametric-status:200'));
    expect(flow200).toBeDefined();
    expect(flow200.steps[0].path).toBe('/api/v1/probe-ref/shapes-r2/error-per-status/ok');
    expect(flow200.steps[1].status).toBe(200);

    const flow401 = flows.find((f) => f.id.includes('parametric-status:401'));
    expect(flow401).toBeDefined();
    expect(flow401.steps[0].path).toBe('/api/v1/probe-ref/shapes-r2/error-per-status/401');
    expect(flow401.steps[1].status).toBe(401);

    const flow500 = flows.find((f) => f.id.includes('parametric-status:500'));
    expect(flow500).toBeDefined();
    expect(flow500.steps[0].path).toBe('/api/v1/probe-ref/shapes-r2/error-per-status/500');
    expect(flow500.steps[1].status).toBe(500);
  });

  it('should skip already-covered statuses', () => {
    const ep = makeEndpoint();
    const diagnostics = [];
    const covered = new Set([200, 400]); // Pre-cover 200 and 400
    const flows = emitParametricStatusFlows(ep, covered, diagnostics);

    expect(flows.length).toBe(2); // Only 401 and 500
    expect(flows.every((f) => !f.id.includes('parametric-status:200'))).toBe(true);
    expect(flows.every((f) => !f.id.includes('parametric-status:400'))).toBe(true);
  });

  it('should add emitted statuses to coveredStatuses set', () => {
    const ep = makeEndpoint();
    const diagnostics = [];
    const covered = new Set();
    emitParametricStatusFlows(ep, covered, diagnostics);

    expect(covered.has(200)).toBe(true);
    expect(covered.has(400)).toBe(true);
    expect(covered.has(401)).toBe(true);
    expect(covered.has(500)).toBe(true);
  });

  it('should emit PARAMETRIC_STATUS_UNMAPPED diagnostic for unmapped statuses', () => {
    const ep = makeEndpoint({
      swaggerDeclared: {
        statuses: [200, 400, 401, 500, 503],
        extensions: {
          'x-status-param': 'code',
          'x-status-param-values': { '200': 'ok', '400': '400' },
          // 401, 500, 503 have no mapping
        },
      },
    });
    const diagnostics = [];
    const covered = new Set();
    const flows = emitParametricStatusFlows(ep, covered, diagnostics);

    // Only 200 and 400 get flows
    expect(flows.length).toBe(2);

    // 401, 500, 503 get diagnostics
    expect(diagnostics.length).toBe(3);
    expect(diagnostics[0].code).toBe('PARAMETRIC_STATUS_UNMAPPED');
    expect(diagnostics[0].message).toContain('401');
    expect(diagnostics[1].message).toContain('500');
    expect(diagnostics[2].message).toContain('503');
  });

  it('should set contract kind to parametric-status', () => {
    const ep = makeEndpoint();
    const diagnostics = [];
    const covered = new Set();
    const flows = emitParametricStatusFlows(ep, covered, diagnostics);

    for (const flow of flows) {
      expect(flow.contract.kind).toBe('parametric-status');
    }
  });

  it('should use correct method from endpoint', () => {
    const ep = makeEndpoint({ method: 'POST' });
    const diagnostics = [];
    const covered = new Set();
    const flows = emitParametricStatusFlows(ep, covered, diagnostics);

    for (const flow of flows) {
      expect(flow.steps[0].method).toBe('POST');
    }
  });

  it('should handle swaggerDeclared with no extensions object', () => {
    const ep = makeEndpoint({
      swaggerDeclared: { statuses: [200] },
    });
    const diagnostics = [];
    const covered = new Set();
    const flows = emitParametricStatusFlows(ep, covered, diagnostics);
    expect(flows).toEqual([]);
  });

  it('should handle x-status-param-values being a non-object', () => {
    const ep = makeEndpoint({
      swaggerDeclared: {
        statuses: [200],
        extensions: { 'x-status-param': 'code', 'x-status-param-values': 'invalid' },
      },
    });
    const diagnostics = [];
    const covered = new Set();
    const flows = emitParametricStatusFlows(ep, covered, diagnostics);
    expect(flows).toEqual([]);
  });

  it('should produce deterministic flow IDs', () => {
    const ep = makeEndpoint();
    const diagnostics = [];
    const covered = new Set();
    const flows = emitParametricStatusFlows(ep, covered, diagnostics);

    expect(flows[0].id).toMatch(/^probe-ref-shapes-r2-error-per-status-code:get:parametric-status:\d+$/);
  });

  it('should include file in onFail.check', () => {
    const ep = makeEndpoint();
    const diagnostics = [];
    const covered = new Set();
    const flows = emitParametricStatusFlows(ep, covered, diagnostics);

    for (const flow of flows) {
      expect(flow.onFail.check).toContain('shapes-r2-probe.controller.ts');
    }
  });
});
