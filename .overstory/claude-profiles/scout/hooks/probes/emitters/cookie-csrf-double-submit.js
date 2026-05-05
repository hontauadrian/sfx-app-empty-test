'use strict';

/**
 * emitters/cookie-csrf-double-submit.js
 *
 * Emits flow chains for cookieFlows entries with role='csrf-double-submit'.
 *
 * Chain shape (plan SS3.4):
 *   1. GET  {issuer}                 -> expect 2xx, capture-cookie(name)
 *   2. POST {consumer}              -> replay-cookie-as-header(cookieName, headerName) -> expect 2xx
 *   3. POST {consumer}              -> cookie present, no header echo -> expect 403
 *   4. POST {consumer}              -> cookie + tampered header (mismatch) -> expect 403
 *   5. POST {consumer}              -> no cookie + no header (cold) -> expect 403
 *
 * Each negative chain is a SEPARATE flow (per plan rule: "Negative chains
 * MUST exercise specific failure modes").
 *
 * Declaration-driven only. headerEcho comes from consumer's declared
 * headerEcho field — NEVER guessed.
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

function emitCookieCsrfDoubleSubmit(flow, _options) {
  if (!flow || flow.role !== 'csrf-double-submit') return [];
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

  // Find the consumer with headerEcho declared
  const headerEchoConsumer = (flow.consumers || []).find((c) => c.headerEcho);
  if (!headerEchoConsumer) return []; // No headerEcho declared — can't emit CSRF flows

  const headerName = headerEchoConsumer.headerEcho;

  const contract = {
    endpoint: `${headerEchoConsumer.method} ${headerEchoConsumer.path}`,
    kind: 'cookie-csrf-double-submit',
    source: 'cookie-flows-detector',
  };

  // --- Positive chain: issue cookie -> echo as header -> 2xx ---
  flows.push({
    id: `cookie:csrf-double-submit:${cookieName}:happy`,
    contract,
    dependsOn: [],
    onFail: {
      check: [],
      implies: `CSRF double-submit: ${headerEchoConsumer.method} ${headerEchoConsumer.path} should accept valid cookie+header pair.`,
    },
    steps: [
      buildIssuerApiStep(issuer),
      { kind: 'expect', status: 200 },
      { kind: 'capture-cookie', name: cookieName, savePath: `cookie:${cookieName}:csrf` },
      { kind: 'replay-cookie-as-header', cookieName, headerName },
      { kind: 'api', method: headerEchoConsumer.method, path: headerEchoConsumer.path },
      { kind: 'expect', statusNot: 403 },
    ],
  });

  // --- Negative chain 1: cookie present, no header -> 403 ---
  flows.push({
    id: `cookie:csrf-double-submit:${cookieName}:no-header`,
    contract,
    dependsOn: [],
    onFail: {
      check: [],
      implies: `CSRF double-submit: ${headerEchoConsumer.method} ${headerEchoConsumer.path} should reject when header echo is missing.`,
    },
    steps: [
      buildIssuerApiStep(issuer),
      { kind: 'expect', status: 200 },
      { kind: 'capture-cookie', name: cookieName, savePath: `cookie:${cookieName}:csrf-no-hdr` },
      // Request WITHOUT the header echo — jar still sends cookie automatically
      { kind: 'api', method: headerEchoConsumer.method, path: headerEchoConsumer.path },
      { kind: 'expect', status: 403 },
    ],
  });

  // --- Negative chain 2: cookie + tampered header -> 403 ---
  flows.push({
    id: `cookie:csrf-double-submit:${cookieName}:tampered-header`,
    contract,
    dependsOn: [],
    onFail: {
      check: [],
      implies: `CSRF double-submit: ${headerEchoConsumer.method} ${headerEchoConsumer.path} should reject tampered header.`,
    },
    steps: [
      buildIssuerApiStep(issuer),
      { kind: 'expect', status: 200 },
      { kind: 'capture-cookie', name: cookieName, savePath: `cookie:${cookieName}:csrf-tamper` },
      // Send a wrong header value (not matching cookie)
      { kind: 'api', method: headerEchoConsumer.method, path: headerEchoConsumer.path, headers: { [headerName]: 'tampered-csrf-token-probe' } },
      { kind: 'expect', status: 403 },
    ],
  });

  // --- Negative chain 3: no cookie + no header (cold) -> 403 ---
  flows.push({
    id: `cookie:csrf-double-submit:${cookieName}:cold`,
    contract,
    dependsOn: [],
    onFail: {
      check: [],
      implies: `CSRF double-submit: ${headerEchoConsumer.method} ${headerEchoConsumer.path} should reject cold requests (no cookie, no header).`,
    },
    steps: [
      { kind: 'api', method: headerEchoConsumer.method, path: headerEchoConsumer.path },
      { kind: 'expect', status: 403 },
    ],
  });

  return flows;
}

module.exports = { emitCookieCsrfDoubleSubmit };
