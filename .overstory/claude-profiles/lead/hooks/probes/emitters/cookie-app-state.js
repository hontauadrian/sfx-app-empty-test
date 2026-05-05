'use strict';

/**
 * emitters/cookie-app-state.js
 *
 * Emits flow chains for cookieFlows entries with roles:
 *   'locale', 'theme', 'feature-flag'
 *
 * Chain shape (plan SS3.4):
 *   1. GET  /pref-set?... -> expect 2xx, capture-cookie(name), assert-cookie-attrs
 *   2. GET  /             -> with jar -> expect 2xx (pref applied)
 *   3. GET  /             -> omit-cookie(name) -> expect 2xx (default applied)
 *
 * Declaration-driven only. Uses operationId to look up paths.
 */

const APP_STATE_ROLES = new Set(['locale', 'theme', 'feature-flag']);

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
  if (issuerRef.queryExample !== undefined && issuerRef.queryExample !== null) {
    step.query = issuerRef.queryExample;
  }
  return step;
}

function emitCookieAppState(flow, _options) {
  if (!flow || !APP_STATE_ROLES.has(flow.role)) return [];
  if (!flow.issuers || flow.issuers.length === 0) return [];

  const flows = [];
  const cookieName = flow.name;
  const role = flow.role;
  const issuer = flow.issuers[0];

  // For POST issuers with declared schema but no example: skip flows.
  const issuerMethod = (issuer.method || '').toUpperCase();
  if ((issuerMethod === 'POST' || issuerMethod === 'PUT' || issuerMethod === 'PATCH') &&
      issuer.requestBodyExample === null) {
    return [];
  }

  const consumer = flow.consumers && flow.consumers.length > 0 ? flow.consumers[0] : null;

  const contract = {
    endpoint: `${issuer.method} ${issuer.path}`,
    kind: `cookie-app-state-${role}`,
    source: 'cookie-flows-detector',
  };

  // --- Positive chain: set preference -> read preference -> 2xx ---
  {
    const steps = [];
    steps.push(buildIssuerApiStep(issuer));
    steps.push({ kind: 'expect', status: 200 });
    steps.push({ kind: 'capture-cookie', name: cookieName, savePath: `cookie:${cookieName}:${role}` });

    if (flow.attrs && Object.keys(flow.attrs).length > 0) {
      steps.push({ kind: 'assert-cookie-attrs', name: cookieName, expected: flow.attrs });
    }

    // If consumer is declared, verify the preference is applied
    if (consumer) {
      steps.push({ kind: 'api', method: consumer.method, path: consumer.path });
      steps.push({ kind: 'expect', status: 200 });
    }

    flows.push({
      id: `cookie:app-state:${role}:${cookieName}:set`,
      contract,
      dependsOn: [],
      onFail: {
        check: [],
        implies: `App-state cookie '${cookieName}' (${role}): preference should be set via ${issuer.method} ${issuer.path}.`,
      },
      steps,
    });
  }

  // --- Omit chain: set pref -> omit cookie -> read -> 2xx (fallback to default) ---
  if (consumer) {
    flows.push({
      id: `cookie:app-state:${role}:${cookieName}:omit`,
      contract,
      dependsOn: [],
      onFail: {
        check: [],
        implies: `App-state cookie '${cookieName}' (${role}): ${consumer.method} ${consumer.path} should return default when cookie omitted.`,
      },
      steps: [
        buildIssuerApiStep(issuer),
        { kind: 'expect', status: 200 },
        { kind: 'capture-cookie', name: cookieName, savePath: `cookie:${cookieName}:${role}-omit` },
        { kind: 'omit-cookie', name: cookieName },
        { kind: 'api', method: consumer.method, path: consumer.path },
        { kind: 'expect', status: 200 },
      ],
    });
  }

  return flows;
}

module.exports = { emitCookieAppState };
