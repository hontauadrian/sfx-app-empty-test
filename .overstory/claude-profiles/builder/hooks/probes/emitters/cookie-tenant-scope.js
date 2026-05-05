'use strict';

/**
 * emitters/cookie-tenant-scope.js
 *
 * Emits flow chains for cookieFlows entries with role='tenant-scope'.
 *
 * Chain shape (plan SS3.4):
 *   1. POST /login (tenantA) -> capture-cookie(tenant)
 *   2. GET  /tenant-scoped   -> with jar -> expect 2xx
 *   3. omit-cookie(tenant)   -> GET resource -> expect 4xx
 *
 * Multi-tenant cross-switch (tenantA -> tenantB) is handled by the existing
 * emitTenantIsolationFlows when strategy='cookie'. This emitter covers the
 * cookie-specific aspects: capture, attrs, omit-based denial.
 *
 * Declaration-driven only. Uses operationId paths.
 */

/**
 * Build an api step for an issuer, including body from requestBodyExample
 * if declared. Skips body when undefined/null (no body needed).
 */
function buildIssuerApiStep(issuerRef) {
  const step = { kind: 'api', method: issuerRef.method, path: issuerRef.path };
  if (issuerRef.requestBodyExample !== undefined && issuerRef.requestBodyExample !== null) {
    step.body = issuerRef.requestBodyExample;
  }
  return step;
}

/**
 * @param {import('../contract-types').CookieFlow} flow
 * @param {object} _options
 * @returns {Array}
 */
function emitCookieTenantScope(flow, _options) {
  if (!flow || flow.role !== 'tenant-scope') return [];
  if (!flow.issuers || flow.issuers.length === 0) return [];

  const flows = [];
  const cookieName = flow.name;
  const issuer = flow.issuers[0];

  // For POST issuers: if requestBodyExample is null (declared schema but no example),
  // skip emitting flows — the detector already emitted COOKIE_ISSUER_BODY_EXAMPLE_UNDECLARED.
  const issuerMethod = (issuer.method || '').toUpperCase();
  if ((issuerMethod === 'POST' || issuerMethod === 'PUT' || issuerMethod === 'PATCH') &&
      issuer.requestBodyExample === null) {
    return [];
  }

  const consumer = flow.consumers && flow.consumers.length > 0 ? flow.consumers[0] : null;
  if (!consumer) return []; // No consumer declared — can't verify tenant scoping

  const contract = {
    endpoint: `${issuer.method} ${issuer.path}`,
    kind: 'cookie-tenant-scope',
    source: 'cookie-flows-detector',
  };

  // --- Positive chain: set tenant -> access scoped resource -> 2xx ---
  {
    const steps = [];
    steps.push(buildIssuerApiStep(issuer));
    steps.push({ kind: 'expect', status: 200 });
    steps.push({ kind: 'capture-cookie', name: cookieName, savePath: `cookie:${cookieName}:tenant` });

    if (flow.attrs && Object.keys(flow.attrs).length > 0) {
      steps.push({ kind: 'assert-cookie-attrs', name: cookieName, expected: flow.attrs });
    }

    steps.push({ kind: 'api', method: consumer.method, path: consumer.path });
    steps.push({ kind: 'expect', status: 200 });

    flows.push({
      id: `cookie:tenant-scope:${cookieName}:happy`,
      contract,
      dependsOn: [],
      onFail: {
        check: [],
        implies: `Tenant-scope cookie '${cookieName}': scoped resource should be accessible with valid tenant cookie.`,
      },
      steps,
    });
  }

  // --- Negative chain: omit tenant cookie -> expect 4xx ---
  flows.push({
    id: `cookie:tenant-scope:${cookieName}:omit`,
    contract,
    dependsOn: [],
    onFail: {
      check: [],
      implies: `Tenant-scope cookie '${cookieName}': ${consumer.method} ${consumer.path} should reject when tenant cookie is omitted.`,
    },
    steps: [
      buildIssuerApiStep(issuer),
      { kind: 'expect', status: 200 },
      { kind: 'capture-cookie', name: cookieName, savePath: `cookie:${cookieName}:tenant-omit` },
      { kind: 'omit-cookie', name: cookieName },
      { kind: 'api', method: consumer.method, path: consumer.path },
      { kind: 'expect', statusAnyOf: [400, 401, 403] },
    ],
  });

  // --- Negative chain: tamper tenant cookie -> expect 4xx ---
  flows.push({
    id: `cookie:tenant-scope:${cookieName}:tamper`,
    contract,
    dependsOn: [],
    onFail: {
      check: [],
      implies: `Tenant-scope cookie '${cookieName}': ${consumer.method} ${consumer.path} should reject tampered tenant cookie.`,
    },
    steps: [
      buildIssuerApiStep(issuer),
      { kind: 'expect', status: 200 },
      { kind: 'capture-cookie', name: cookieName, savePath: `cookie:${cookieName}:tenant-tamper` },
      { kind: 'tamper-cookie', name: cookieName, withValue: 'tampered-tenant-id-probe' },
      { kind: 'api', method: consumer.method, path: consumer.path },
      { kind: 'expect', statusAnyOf: [400, 401, 403] },
    ],
  });

  return flows;
}

module.exports = { emitCookieTenantScope };
