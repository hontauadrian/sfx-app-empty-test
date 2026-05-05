'use strict';

/**
 * emitters/cookie-oauth-state.js
 *
 * Emits flow chains for cookieFlows entries with role='oauth-state'.
 *
 * Chain shape (plan SS3.4):
 *   1. GET  /authorize?... -> expect 3xx, capture-cookie(state)
 *   2. GET  /callback?state={captured} -> expect 2xx
 *   3. GET  /callback?state=tampered -> expect 4xx
 *   4. GET  /callback (no cookie) -> expect 4xx
 *
 * The issuer is the /authorize endpoint. The consumer is the /callback
 * endpoint. Both identified by operationId — NEVER by path regex.
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

/**
 * Build consumer api step, applying value substitutions from declarations.
 *
 * When the consumer declares valueSubstitutions (via x-cookie-value-source),
 * inject query/header/body fields with ${savePath} sigils so the runtime
 * resolves captured cookie values automatically via bindings.
 */
function buildConsumerApiStep(consumerRef, cookieName, savePath) {
  const step = { kind: 'api', method: consumerRef.method, path: consumerRef.path };

  const subs = consumerRef.valueSubstitutions;
  if (!Array.isArray(subs) || subs.length === 0) return step;

  for (const sub of subs) {
    if (sub.cookieName !== cookieName) continue;
    const sigil = `\${${savePath}}`;

    if (sub.target.in === 'query') {
      step.query = step.query || {};
      step.query[sub.target.name] = sigil;
    } else if (sub.target.in === 'header') {
      step.headers = step.headers || {};
      step.headers[sub.target.name] = sigil;
    } else if (sub.target.in === 'body') {
      // Body JSONPath like $.state → set body.state
      const fieldName = sub.target.name.replace(/^\$\./, '');
      step.body = step.body || {};
      step.body[fieldName] = sigil;
    }
  }

  return step;
}

function emitCookieOAuthState(flow, _options) {
  if (!flow || flow.role !== 'oauth-state') return [];
  if (!flow.issuers || flow.issuers.length === 0) return [];
  if (!flow.consumers || flow.consumers.length === 0) return [];

  const flows = [];
  const cookieName = flow.name;
  const issuer = flow.issuers[0];

  // For POST issuers with declared schema but no example: skip flows.
  const issuerMethod = (issuer.method || '').toUpperCase();
  if ((issuerMethod === 'POST' || issuerMethod === 'PUT' || issuerMethod === 'PATCH') &&
      issuer.requestBodyExample === null) {
    return [];
  }
  const consumer = flow.consumers[0];
  const savePath = `cookie:${cookieName}:state`;

  const contract = {
    endpoint: `${issuer.method} ${issuer.path}`,
    kind: 'cookie-oauth-state',
    source: 'cookie-flows-detector',
  };

  // --- Positive chain: authorize -> capture state cookie -> callback with substituted value -> 2xx ---
  flows.push({
    id: `cookie:oauth-state:${cookieName}:happy`,
    contract,
    dependsOn: [],
    onFail: {
      check: [],
      implies: `OAuth state cookie '${cookieName}': valid state on ${consumer.method} ${consumer.path} should succeed.`,
    },
    steps: [
      buildIssuerApiStep(issuer),
      { kind: 'expect', statusAnyOf: [200, 302] },
      { kind: 'capture-cookie', name: cookieName, savePath },
      buildConsumerApiStep(consumer, cookieName, savePath),
      { kind: 'expect', status: 200 },
    ],
  });

  // --- Negative chain 1: tampered state cookie -> 4xx ---
  // Tamper the cookie value, but still substitute it into the consumer step.
  // This tests that the callback rejects when cookie and param mismatch.
  const tamperSavePath = `cookie:${cookieName}:state-tamper`;
  flows.push({
    id: `cookie:oauth-state:${cookieName}:tampered`,
    contract,
    dependsOn: [],
    onFail: {
      check: [],
      implies: `OAuth state cookie '${cookieName}': tampered state should be rejected.`,
    },
    steps: [
      buildIssuerApiStep(issuer),
      { kind: 'expect', statusAnyOf: [200, 302] },
      { kind: 'capture-cookie', name: cookieName, savePath: tamperSavePath },
      { kind: 'tamper-cookie', name: cookieName, withValue: 'tampered-oauth-state-probe' },
      // Consumer gets the ORIGINAL captured value as query param,
      // but the cookie is tampered — so cookie !== param → reject
      buildConsumerApiStep(consumer, cookieName, tamperSavePath),
      { kind: 'expect', statusAnyOf: [400, 401, 403] },
    ],
  });

  // --- Negative chain 2: no state cookie (cold callback) -> 4xx ---
  flows.push({
    id: `cookie:oauth-state:${cookieName}:no-cookie`,
    contract,
    dependsOn: [],
    onFail: {
      check: [],
      implies: `OAuth state cookie '${cookieName}': callback without state cookie should be rejected.`,
    },
    steps: [
      { kind: 'api', method: consumer.method, path: consumer.path },
      { kind: 'expect', statusAnyOf: [400, 401, 403] },
    ],
  });

  return flows;
}

module.exports = { emitCookieOAuthState };
