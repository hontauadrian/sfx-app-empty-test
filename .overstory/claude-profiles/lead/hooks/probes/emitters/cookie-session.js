'use strict';

/**
 * emitters/cookie-session.js
 *
 * Emits flow chains for cookieFlows entries with role='session'.
 *
 * Positive chain (plan SS3.4):
 *   1. POST {issuer}        -> expect 2xx, capture-cookie(name), assert-cookie-attrs
 *   2. GET  {protectedRoute} -> with jar -> expect 2xx (session valid)
 *   3. POST {logoutRoute}   -> expect 2xx, assert-cookie-cleared(name) // if logout declared
 *   4. GET  {protectedRoute} -> without jar (no cookie) -> expect 401
 *
 * Negative chains:
 *   A. GET {protectedRoute} -> without jar (cold) -> expect 401
 *   B. GET {protectedRoute} -> omit-cookie(name) (after login) -> expect 401
 *   C. GET {protectedRoute} -> tamper-cookie(name) -> expect 401
 *
 * Declaration-driven only. Uses operationId to look up paths.
 */

/**
 * @param {import('../contract-types').CookieFlow} flow
 * @param {object} _options
 * @returns {Array}
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

function emitCookieSession(flow, _options) {
  if (!flow || flow.role !== 'session') return [];
  if (!flow.issuers || flow.issuers.length === 0) return [];

  const flows = [];
  const cookieName = flow.name;
  const issuer = flow.issuers[0];

  // For POST issuers with declared schema but no example: skip flows.
  const issuerMethod = (issuer.method || '').toUpperCase();
  if ((issuerMethod === 'POST' || issuerMethod === 'PUT' || issuerMethod === 'PATCH') &&
      issuer.requestBodyExample === null) {
    return [];
  }

  // First consumer is the protected route
  const consumer = flow.consumers && flow.consumers.length > 0 ? flow.consumers[0] : null;
  const clearer = flow.clearers && flow.clearers.length > 0 ? flow.clearers[0] : null;

  const contract = {
    endpoint: `${issuer.method} ${issuer.path}`,
    kind: 'cookie-session',
    source: 'cookie-flows-detector',
  };

  // --- Positive chain: login -> access -> [logout -> re-access(401)] ---
  if (consumer) {
    const steps = [];

    // Step 1: Login — issue session cookie
    steps.push(buildIssuerApiStep(issuer));
    steps.push({ kind: 'expect', status: 200 });
    steps.push({ kind: 'capture-cookie', name: cookieName, savePath: `cookie:${cookieName}:session` });

    // Assert attributes if declared
    if (flow.attrs && Object.keys(flow.attrs).length > 0) {
      steps.push({ kind: 'assert-cookie-attrs', name: cookieName, expected: flow.attrs });
    }

    // Step 2: Access protected route with session cookie
    steps.push({ kind: 'api', method: consumer.method, path: consumer.path });
    steps.push({ kind: 'expect', status: 200 });

    // Step 3: Logout (if declared) — clears cookie
    if (clearer) {
      steps.push({ kind: 'api', method: clearer.method, path: clearer.path });
      steps.push({ kind: 'expect', status: 200 });
      steps.push({ kind: 'assert-cookie-cleared', name: cookieName });

      // Step 4: Re-access after logout — should 401
      steps.push({ kind: 'api', method: consumer.method, path: consumer.path });
      steps.push({ kind: 'expect', status: 401 });
    }

    flows.push({
      id: `cookie:session:${cookieName}:lifecycle`,
      contract,
      dependsOn: [],
      onFail: {
        check: [],
        implies: `Session cookie '${cookieName}' lifecycle: login -> access -> ${clearer ? 'logout -> denied' : 'access'}.`,
      },
      steps,
    });

    // --- Negative chain A: Cold access (no login) -> 401 ---
    flows.push({
      id: `cookie:session:${cookieName}:cold-access`,
      contract,
      dependsOn: [],
      onFail: {
        check: [],
        implies: `${consumer.method} ${consumer.path} should reject unauthenticated requests with 401.`,
      },
      steps: [
        { kind: 'api', method: consumer.method, path: consumer.path },
        { kind: 'expect', status: 401 },
      ],
    });

    // --- Negative chain B: Omit cookie after login -> 401 ---
    flows.push({
      id: `cookie:session:${cookieName}:omit-cookie`,
      contract,
      dependsOn: [],
      onFail: {
        check: [],
        implies: `${consumer.method} ${consumer.path} should reject when session cookie is omitted.`,
      },
      steps: [
        // Login first
        buildIssuerApiStep(issuer),
        { kind: 'expect', status: 200 },
        { kind: 'capture-cookie', name: cookieName, savePath: `cookie:${cookieName}:omit-test` },
        // Omit cookie then access
        { kind: 'omit-cookie', name: cookieName },
        { kind: 'api', method: consumer.method, path: consumer.path },
        { kind: 'expect', status: 401 },
      ],
    });

    // --- Negative chain C: Tamper cookie after login -> 401 ---
    flows.push({
      id: `cookie:session:${cookieName}:tamper-cookie`,
      contract,
      dependsOn: [],
      onFail: {
        check: [],
        implies: `${consumer.method} ${consumer.path} should reject tampered session cookie.`,
      },
      steps: [
        // Login first
        buildIssuerApiStep(issuer),
        { kind: 'expect', status: 200 },
        { kind: 'capture-cookie', name: cookieName, savePath: `cookie:${cookieName}:tamper-test` },
        // Tamper cookie then access
        { kind: 'tamper-cookie', name: cookieName, withValue: 'tampered-invalid-session-probe' },
        { kind: 'api', method: consumer.method, path: consumer.path },
        { kind: 'expect', status: 401 },
      ],
    });
  }

  return flows;
}

module.exports = { emitCookieSession };
