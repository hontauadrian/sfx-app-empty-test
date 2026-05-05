'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const { detectCookieFlows, extractValueSubstitutions } = require('../detectors/cookie-flows');

// ---------------------------------------------------------------------------
// extractValueSubstitutions — P1: parameter x-cookie-value-source
// ---------------------------------------------------------------------------

test('P1: extracts valueSubstitution from query parameter with x-cookie-value-source', () => {
  const spec = {};
  const op = {
    parameters: [
      {
        name: 'state',
        in: 'query',
        schema: { type: 'string' },
        'x-cookie-value-source': { cookieName: 'oauth_state' },
      },
    ],
  };
  const subs = extractValueSubstitutions(spec, op);
  assert.strictEqual(subs.length, 1);
  assert.deepStrictEqual(subs[0], {
    cookieName: 'oauth_state',
    target: { in: 'query', name: 'state' },
  });
});

test('P1: extracts valueSubstitution from header parameter with x-cookie-value-source', () => {
  const spec = {};
  const op = {
    parameters: [
      {
        name: 'X-State-Token',
        in: 'header',
        schema: { type: 'string' },
        'x-cookie-value-source': { cookieName: 'session_token' },
      },
    ],
  };
  const subs = extractValueSubstitutions(spec, op);
  assert.strictEqual(subs.length, 1);
  assert.deepStrictEqual(subs[0], {
    cookieName: 'session_token',
    target: { in: 'header', name: 'X-State-Token' },
  });
});

test('P1: ignores path parameters (not a valid substitution target)', () => {
  const spec = {};
  const op = {
    parameters: [
      {
        name: 'id',
        in: 'path',
        schema: { type: 'string' },
        'x-cookie-value-source': { cookieName: 'some_cookie' },
      },
    ],
  };
  const subs = extractValueSubstitutions(spec, op);
  assert.strictEqual(subs.length, 0);
});

test('P1: ignores parameters without x-cookie-value-source', () => {
  const spec = {};
  const op = {
    parameters: [
      { name: 'state', in: 'query', schema: { type: 'string' } },
    ],
  };
  const subs = extractValueSubstitutions(spec, op);
  assert.strictEqual(subs.length, 0);
});

test('P1: ignores x-cookie-value-source without cookieName', () => {
  const spec = {};
  const op = {
    parameters: [
      {
        name: 'state',
        in: 'query',
        schema: { type: 'string' },
        'x-cookie-value-source': { wrongField: 'oauth_state' },
      },
    ],
  };
  const subs = extractValueSubstitutions(spec, op);
  assert.strictEqual(subs.length, 0);
});

test('P1: resolves $ref parameters', () => {
  const spec = {
    components: {
      parameters: {
        StateParam: {
          name: 'state',
          in: 'query',
          schema: { type: 'string' },
          'x-cookie-value-source': { cookieName: 'oauth_state' },
        },
      },
    },
  };
  const op = {
    parameters: [
      { $ref: '#/components/parameters/StateParam' },
    ],
  };
  const subs = extractValueSubstitutions(spec, op);
  assert.strictEqual(subs.length, 1);
  assert.strictEqual(subs[0].cookieName, 'oauth_state');
  assert.strictEqual(subs[0].target.in, 'query');
  assert.strictEqual(subs[0].target.name, 'state');
});

// ---------------------------------------------------------------------------
// extractValueSubstitutions — P2: body schema property x-cookie-value-source
// ---------------------------------------------------------------------------

test('P2: extracts valueSubstitution from requestBody schema property', () => {
  const spec = {};
  const op = {
    requestBody: {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              csrfToken: {
                type: 'string',
                'x-cookie-value-source': { cookieName: 'csrf_token' },
              },
              otherField: { type: 'string' },
            },
          },
        },
      },
    },
  };
  const subs = extractValueSubstitutions(spec, op);
  assert.strictEqual(subs.length, 1);
  assert.deepStrictEqual(subs[0], {
    cookieName: 'csrf_token',
    target: { in: 'body', name: '$.csrfToken' },
  });
});

test('P2: extracts multiple body properties with x-cookie-value-source', () => {
  const spec = {};
  const op = {
    requestBody: {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              tokenA: {
                type: 'string',
                'x-cookie-value-source': { cookieName: 'cookie_a' },
              },
              tokenB: {
                type: 'string',
                'x-cookie-value-source': { cookieName: 'cookie_b' },
              },
            },
          },
        },
      },
    },
  };
  const subs = extractValueSubstitutions(spec, op);
  assert.strictEqual(subs.length, 2);
  assert.strictEqual(subs[0].cookieName, 'cookie_a');
  assert.strictEqual(subs[0].target.name, '$.tokenA');
  assert.strictEqual(subs[1].cookieName, 'cookie_b');
  assert.strictEqual(subs[1].target.name, '$.tokenB');
});

test('P2: resolves $ref on requestBody schema', () => {
  const spec = {
    components: {
      schemas: {
        CallbackBody: {
          type: 'object',
          properties: {
            state: {
              type: 'string',
              'x-cookie-value-source': { cookieName: 'oauth_state' },
            },
          },
        },
      },
    },
  };
  const op = {
    requestBody: {
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/CallbackBody' },
        },
      },
    },
  };
  const subs = extractValueSubstitutions(spec, op);
  assert.strictEqual(subs.length, 1);
  assert.strictEqual(subs[0].cookieName, 'oauth_state');
  assert.strictEqual(subs[0].target.in, 'body');
  assert.strictEqual(subs[0].target.name, '$.state');
});

test('P2: ignores body properties without x-cookie-value-source', () => {
  const spec = {};
  const op = {
    requestBody: {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              normalField: { type: 'string' },
            },
          },
        },
      },
    },
  };
  const subs = extractValueSubstitutions(spec, op);
  assert.strictEqual(subs.length, 0);
});

// ---------------------------------------------------------------------------
// extractValueSubstitutions — P3: x-cookie-consumes valueSubstitution
// ---------------------------------------------------------------------------

test('P3: extracts valueSubstitution from x-cookie-consumes entry', () => {
  const spec = {};
  const op = {
    'x-cookie-consumes': [
      {
        name: 'oauth_state',
        valueSubstitution: {
          cookieName: 'oauth_state',
          target: { in: 'query', name: 'state' },
        },
      },
    ],
  };
  const subs = extractValueSubstitutions(spec, op);
  assert.strictEqual(subs.length, 1);
  assert.deepStrictEqual(subs[0], {
    cookieName: 'oauth_state',
    target: { in: 'query', name: 'state' },
  });
});

test('P3: ignores x-cookie-consumes entries without valueSubstitution', () => {
  const spec = {};
  const op = {
    'x-cookie-consumes': [
      { name: 'some_cookie' },
      { name: 'another_cookie', headerEcho: 'X-CSRF-Token' },
    ],
  };
  const subs = extractValueSubstitutions(spec, op);
  assert.strictEqual(subs.length, 0);
});

test('P3: ignores malformed valueSubstitution (missing target)', () => {
  const spec = {};
  const op = {
    'x-cookie-consumes': [
      {
        name: 'oauth_state',
        valueSubstitution: { cookieName: 'oauth_state' },
      },
    ],
  };
  const subs = extractValueSubstitutions(spec, op);
  assert.strictEqual(subs.length, 0);
});

test('P3: ignores malformed valueSubstitution (missing cookieName)', () => {
  const spec = {};
  const op = {
    'x-cookie-consumes': [
      {
        name: 'oauth_state',
        valueSubstitution: { target: { in: 'query', name: 'state' } },
      },
    ],
  };
  const subs = extractValueSubstitutions(spec, op);
  assert.strictEqual(subs.length, 0);
});

// ---------------------------------------------------------------------------
// Combined P1 + P3: multiple extraction paths
// ---------------------------------------------------------------------------

test('P1+P3: combines substitutions from parameters and x-cookie-consumes', () => {
  const spec = {};
  const op = {
    parameters: [
      {
        name: 'token',
        in: 'header',
        schema: { type: 'string' },
        'x-cookie-value-source': { cookieName: 'auth_cookie' },
      },
    ],
    'x-cookie-consumes': [
      {
        name: 'state_cookie',
        valueSubstitution: {
          cookieName: 'state_cookie',
          target: { in: 'query', name: 'state' },
        },
      },
    ],
  };
  const subs = extractValueSubstitutions(spec, op);
  assert.strictEqual(subs.length, 2);
  assert.strictEqual(subs[0].target.in, 'header');
  assert.strictEqual(subs[1].target.in, 'query');
});

// ---------------------------------------------------------------------------
// No declarations — empty result, no fallback (NEVER heuristic)
// ---------------------------------------------------------------------------

test('returns empty array when operation has no declarations at all', () => {
  const spec = {};
  const op = {
    operationId: 'someEndpoint',
    responses: { 200: { description: 'OK' } },
  };
  const subs = extractValueSubstitutions(spec, op);
  assert.strictEqual(subs.length, 0);
});

test('returns empty array when operation has no parameters and no body', () => {
  const spec = {};
  const op = {};
  const subs = extractValueSubstitutions(spec, op);
  assert.strictEqual(subs.length, 0);
});

// ---------------------------------------------------------------------------
// detectCookieFlows integration — valueSubstitutions on consumers
// ---------------------------------------------------------------------------

test('detectCookieFlows attaches valueSubstitutions to consumer from P3 (x-cookie-consumes)', () => {
  const spec = {
    paths: {
      '/authorize': {
        get: {
          operationId: 'oauthAuthorize',
          responses: {
            302: {
              description: 'Redirect',
              headers: {
                'Set-Cookie': {
                  schema: { type: 'string' },
                  'x-cookie-role': 'oauth-state',
                  'x-cookie-name': 'oauth_state',
                  'x-cookie-attrs': { httpOnly: true, secure: true, sameSite: 'Lax', path: '/', maxAge: 600 },
                },
              },
            },
          },
        },
      },
      '/callback': {
        get: {
          operationId: 'oauthCallback',
          parameters: [
            { name: 'state', in: 'query', schema: { type: 'string' } },
          ],
          'x-cookie-consumes': [
            {
              name: 'oauth_state',
              valueSubstitution: {
                cookieName: 'oauth_state',
                target: { in: 'query', name: 'state' },
              },
            },
          ],
          responses: { 200: { description: 'OK' } },
        },
      },
    },
  };

  const { cookieFlows, diagnostics } = detectCookieFlows(spec);
  assert.strictEqual(cookieFlows.length, 1);
  const flow = cookieFlows[0];
  assert.strictEqual(flow.name, 'oauth_state');
  assert.strictEqual(flow.role, 'oauth-state');
  assert.strictEqual(flow.consumers.length, 1);

  const consumer = flow.consumers[0];
  assert.ok(consumer.valueSubstitutions, 'consumer should have valueSubstitutions');
  assert.strictEqual(consumer.valueSubstitutions.length, 1);
  assert.deepStrictEqual(consumer.valueSubstitutions[0], {
    cookieName: 'oauth_state',
    target: { in: 'query', name: 'state' },
  });

  // Should NOT have COOKIE_VALUE_SUBSTITUTION_UNDECLARED since declaration exists
  const undeclaredDiags = diagnostics.filter((d) => d.code === 'COOKIE_VALUE_SUBSTITUTION_UNDECLARED');
  assert.strictEqual(undeclaredDiags.length, 0);
});

test('detectCookieFlows emits COOKIE_VALUE_SUBSTITUTION_UNDECLARED when consumer has params but no declaration', () => {
  const spec = {
    paths: {
      '/authorize': {
        get: {
          operationId: 'oauthAuthorize',
          responses: {
            302: {
              description: 'Redirect',
              headers: {
                'Set-Cookie': {
                  schema: { type: 'string' },
                  'x-cookie-role': 'oauth-state',
                  'x-cookie-name': 'oauth_state',
                  'x-cookie-attrs': { httpOnly: true, secure: true, sameSite: 'Lax', path: '/', maxAge: 600 },
                },
              },
            },
          },
        },
      },
      '/callback': {
        get: {
          operationId: 'oauthCallback',
          parameters: [
            { name: 'state', in: 'query', schema: { type: 'string' } },
          ],
          'x-cookie-consumes': [
            { name: 'oauth_state' },
          ],
          responses: { 200: { description: 'OK' } },
        },
      },
    },
  };

  const { cookieFlows, diagnostics } = detectCookieFlows(spec);
  assert.strictEqual(cookieFlows.length, 1);
  const flow = cookieFlows[0];
  const consumer = flow.consumers[0];

  // No valueSubstitutions since no x-cookie-value-source declared
  assert.strictEqual(consumer.valueSubstitutions, undefined);

  // Should emit COOKIE_VALUE_SUBSTITUTION_UNDECLARED
  const undeclaredDiags = diagnostics.filter((d) => d.code === 'COOKIE_VALUE_SUBSTITUTION_UNDECLARED');
  assert.strictEqual(undeclaredDiags.length, 1);
  assert.strictEqual(undeclaredDiags[0].level, 'warn');
  assert.strictEqual(undeclaredDiags[0].details.consumerOperationId, 'oauthCallback');
  assert.strictEqual(undeclaredDiags[0].details.name, 'oauth_state');
});

test('detectCookieFlows does NOT emit COOKIE_VALUE_SUBSTITUTION_UNDECLARED when consumer has headerEcho', () => {
  const spec = {
    paths: {
      '/csrf-issue': {
        get: {
          operationId: 'csrfIssue',
          responses: {
            200: {
              description: 'OK',
              headers: {
                'Set-Cookie': {
                  schema: { type: 'string' },
                  'x-cookie-role': 'csrf-double-submit',
                  'x-cookie-name': 'csrf_token',
                  'x-cookie-attrs': { httpOnly: false, secure: true, sameSite: 'Strict', path: '/' },
                },
              },
            },
          },
        },
      },
      '/submit': {
        post: {
          operationId: 'submitForm',
          parameters: [
            { name: 'X-CSRF-Token', in: 'header', schema: { type: 'string' } },
          ],
          'x-cookie-consumes': [
            { name: 'csrf_token', headerEcho: 'X-CSRF-Token' },
          ],
          responses: { 200: { description: 'OK' } },
        },
      },
    },
  };

  const { diagnostics } = detectCookieFlows(spec);
  const undeclaredDiags = diagnostics.filter((d) => d.code === 'COOKIE_VALUE_SUBSTITUTION_UNDECLARED');
  assert.strictEqual(undeclaredDiags.length, 0);
});

test('detectCookieFlows attaches valueSubstitutions from P1 (parameter x-cookie-value-source)', () => {
  const spec = {
    paths: {
      '/authorize': {
        get: {
          operationId: 'oauthAuthorize',
          responses: {
            302: {
              description: 'Redirect',
              headers: {
                'Set-Cookie': {
                  schema: { type: 'string' },
                  'x-cookie-role': 'oauth-state',
                  'x-cookie-name': 'my_state',
                  'x-cookie-attrs': { httpOnly: true, secure: true, sameSite: 'Lax', path: '/', maxAge: 600 },
                },
              },
            },
          },
        },
      },
      '/callback': {
        get: {
          operationId: 'oauthCallback',
          parameters: [
            {
              name: 'state',
              in: 'query',
              schema: { type: 'string' },
              'x-cookie-value-source': { cookieName: 'my_state' },
            },
          ],
          'x-cookie-consumes': [{ name: 'my_state' }],
          responses: { 200: { description: 'OK' } },
        },
      },
    },
  };

  const { cookieFlows } = detectCookieFlows(spec);
  assert.strictEqual(cookieFlows.length, 1);
  const consumer = cookieFlows[0].consumers[0];
  assert.ok(consumer.valueSubstitutions);
  assert.strictEqual(consumer.valueSubstitutions.length, 1);
  assert.deepStrictEqual(consumer.valueSubstitutions[0], {
    cookieName: 'my_state',
    target: { in: 'query', name: 'state' },
  });
});
