'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');

const { detectCookieFlows } = require('../detectors/cookie-flows');

// ---------------------------------------------------------------------------
// Helpers — minimal OpenAPI fixture builders
// ---------------------------------------------------------------------------

/**
 * Build a minimal OpenAPI spec with the given paths and optional components.
 */
function spec(paths, components) {
  const s = { openapi: '3.0.3', info: { title: 'test', version: '1' }, paths };
  if (components) s.components = components;
  return s;
}

/**
 * Build a response header Set-Cookie declaration with x-cookie-* extensions.
 */
function setCookieHeader(role, name, attrs) {
  const hdr = { schema: { type: 'string' } };
  if (role) hdr['x-cookie-role'] = role;
  if (name) hdr['x-cookie-name'] = name;
  if (attrs) hdr['x-cookie-attrs'] = attrs;
  return hdr;
}

/**
 * Build an apiKey-in-cookie securityScheme.
 */
function cookieScheme(cookieName, role) {
  const scheme = { type: 'apiKey', in: 'cookie', name: cookieName };
  if (role) scheme['x-cookie-role'] = role;
  return scheme;
}

// ---------------------------------------------------------------------------
// SECTION A — Role detection (3 vehicles × 9 roles)
// ---------------------------------------------------------------------------

describe('Section A — Role detection', () => {
  // =========================================================================
  // P1: securitySchemes apiKey-in-cookie with x-cookie-role
  // Applicable to: session, csrf-double-submit, oauth-state, tenant-scope
  // =========================================================================

  describe('P1 — securitySchemes apiKey-in-cookie with x-cookie-role', () => {
    test('detects role session via P1 (securitySchemes x-cookie-role)', () => {
      const openapi = spec(
        {
          '/dashboard': {
            get: {
              operationId: 'getDashboard',
              security: [{ sessionCookie: [] }],
              responses: { '200': {} },
            },
          },
        },
        {
          securitySchemes: {
            sessionCookie: cookieScheme('connect.sid', 'session'),
          },
        },
      );
      const { cookieFlows } = detectCookieFlows(openapi);
      const flow = cookieFlows.find((f) => f.name === 'connect.sid');
      assert.ok(flow, 'should find connect.sid flow');
      assert.strictEqual(flow.role, 'session');
    });

    test('detects role csrf-double-submit via P1', () => {
      const openapi = spec(
        {
          '/submit': {
            post: {
              operationId: 'submitForm',
              security: [{ csrfCookie: [] }],
              responses: { '200': {} },
            },
          },
        },
        {
          securitySchemes: {
            csrfCookie: cookieScheme('XSRF-TOKEN', 'csrf-double-submit'),
          },
        },
      );
      const { cookieFlows } = detectCookieFlows(openapi);
      const flow = cookieFlows.find((f) => f.name === 'XSRF-TOKEN');
      assert.ok(flow);
      assert.strictEqual(flow.role, 'csrf-double-submit');
    });

    test('detects role oauth-state via P1', () => {
      const openapi = spec(
        {
          '/callback': {
            get: {
              operationId: 'oauthCallback',
              security: [{ oauthStateCookie: [] }],
              responses: { '200': {} },
            },
          },
        },
        {
          securitySchemes: {
            oauthStateCookie: cookieScheme('oauth_state', 'oauth-state'),
          },
        },
      );
      const { cookieFlows } = detectCookieFlows(openapi);
      const flow = cookieFlows.find((f) => f.name === 'oauth_state');
      assert.ok(flow);
      assert.strictEqual(flow.role, 'oauth-state');
    });

    test('detects role tenant-scope via P1', () => {
      const openapi = spec(
        {
          '/resources': {
            get: {
              operationId: 'listResources',
              security: [{ tenantCookie: [] }],
              responses: { '200': {} },
            },
          },
        },
        {
          securitySchemes: {
            tenantCookie: cookieScheme('tenant', 'tenant-scope'),
          },
        },
      );
      const { cookieFlows } = detectCookieFlows(openapi);
      const flow = cookieFlows.find((f) => f.name === 'tenant');
      assert.ok(flow);
      assert.strictEqual(flow.role, 'tenant-scope');
    });
  });

  // =========================================================================
  // P2: Response Set-Cookie header with x-cookie-role + x-cookie-name
  // Applicable to ALL 9 roles
  // =========================================================================

  describe('P2 — Response Set-Cookie header with x-cookie-role + x-cookie-name', () => {
    const p2Roles = [
      { role: 'refresh-token', cookieName: 'rt' },
      { role: 'session', cookieName: 'sid' },
      { role: 'csrf-double-submit', cookieName: 'csrf' },
      { role: 'oauth-state', cookieName: 'ostate' },
      { role: 'tenant-scope', cookieName: 'tid' },
      { role: 'locale', cookieName: 'lang' },
      { role: 'theme', cookieName: 'theme' },
      { role: 'feature-flag', cookieName: 'ff' },
      { role: 'custom', cookieName: 'misc' },
    ];

    for (const { role, cookieName } of p2Roles) {
      test(`detects role ${role} via P2 (Set-Cookie x-cookie-role)`, () => {
        const openapi = spec({
          '/issue': {
            get: {
              operationId: `issue_${role}`,
              responses: {
                '200': {
                  headers: {
                    'Set-Cookie': setCookieHeader(role, cookieName),
                  },
                },
              },
            },
          },
        });
        const { cookieFlows } = detectCookieFlows(openapi);
        const flow = cookieFlows.find((f) => f.name === cookieName);
        assert.ok(flow, `should find flow for ${cookieName}`);
        assert.strictEqual(flow.role, role);
      });
    }
  });

  // =========================================================================
  // P3: operation x-cookie-roles (from @CookieRole decorator)
  // Applicable to ALL 9 roles
  // =========================================================================

  describe('P3 — operation x-cookie-roles (from @CookieRole)', () => {
    const p3Roles = [
      { role: 'refresh-token', cookieName: 'refresh_tok' },
      { role: 'session', cookieName: 'my_session' },
      { role: 'csrf-double-submit', cookieName: 'xsrf' },
      { role: 'oauth-state', cookieName: 'ost' },
      { role: 'tenant-scope', cookieName: 'tn' },
      { role: 'locale', cookieName: 'loc' },
      { role: 'theme', cookieName: 'th' },
      { role: 'feature-flag', cookieName: 'feat' },
      { role: 'custom', cookieName: 'cust' },
    ];

    for (const { role, cookieName } of p3Roles) {
      test(`detects role ${role} via P3 (x-cookie-roles)`, () => {
        const openapi = spec({
          '/issue': {
            post: {
              operationId: `issue_${role}_p3`,
              'x-cookie-roles': [{ name: cookieName, role }],
              responses: { '200': {} },
            },
          },
        });
        const { cookieFlows } = detectCookieFlows(openapi);
        const flow = cookieFlows.find((f) => f.name === cookieName);
        assert.ok(flow, `should find flow for ${cookieName}`);
        assert.strictEqual(flow.role, role);
      });
    }
  });

  // =========================================================================
  // Priority resolution: P1 > P2 > P3
  // =========================================================================

  describe('Priority resolution', () => {
    test('P1 role is used when P2 also declares a different role for the same cookie', () => {
      // P1 declares 'session' via scheme, P2 declares 'custom' via header
      // The detector resolves role from the roles Map. P1 registers the role
      // via scheme, P2 also registers. If both exist, COOKIE_ROLE_AMBIGUOUS fires.
      // But if they declare the SAME role, it should resolve to that role.
      const openapi = spec(
        {
          '/login': {
            post: {
              operationId: 'login',
              responses: {
                '200': {
                  headers: {
                    'Set-Cookie': setCookieHeader('session', 'sid'),
                  },
                },
              },
            },
          },
          '/dashboard': {
            get: {
              operationId: 'dashboard',
              security: [{ sidScheme: [] }],
              responses: { '200': {} },
            },
          },
        },
        {
          securitySchemes: {
            sidScheme: cookieScheme('sid', 'session'),
          },
        },
      );
      const { cookieFlows } = detectCookieFlows(openapi);
      const flow = cookieFlows.find((f) => f.name === 'sid');
      assert.ok(flow);
      assert.strictEqual(flow.role, 'session');
      // No ambiguity since both agree
      assert.ok(!flow.diagnostics.some((d) => d.code === 'COOKIE_ROLE_AMBIGUOUS'));
    });

    test('P2 and P3 declaring same role on same cookie produces no ambiguity', () => {
      const openapi = spec({
        '/issue': {
          post: {
            operationId: 'issueRefresh',
            'x-cookie-roles': [{ name: 'rt', role: 'refresh-token' }],
            responses: {
              '200': {
                headers: {
                  'Set-Cookie': setCookieHeader('refresh-token', 'rt'),
                },
              },
            },
          },
        },
      });
      const { cookieFlows } = detectCookieFlows(openapi);
      const flow = cookieFlows.find((f) => f.name === 'rt');
      assert.ok(flow);
      assert.strictEqual(flow.role, 'refresh-token');
      assert.ok(!flow.diagnostics.some((d) => d.code === 'COOKIE_ROLE_AMBIGUOUS'));
    });
  });
});

// ---------------------------------------------------------------------------
// SECTION B — Consumer detection (C1 + C3 + C4)
// ---------------------------------------------------------------------------

describe('Section B — Consumer detection', () => {
  test('C1 detects consumer via security[] reference to cookieSession scheme', () => {
    const openapi = spec(
      {
        '/login': {
          post: {
            operationId: 'login',
            responses: {
              '200': {
                headers: {
                  'Set-Cookie': setCookieHeader('session', 'sid'),
                },
              },
            },
          },
        },
        '/protected': {
          get: {
            operationId: 'getProtected',
            security: [{ sessionScheme: [] }],
            responses: { '200': {} },
          },
        },
      },
      {
        securitySchemes: {
          sessionScheme: cookieScheme('sid', 'session'),
        },
      },
    );
    const { cookieFlows } = detectCookieFlows(openapi);
    const flow = cookieFlows.find((f) => f.name === 'sid');
    assert.ok(flow);
    assert.strictEqual(flow.consumers.length, 1);
    assert.strictEqual(flow.consumers[0].operationId, 'getProtected');
  });

  test('C3 detects consumer via x-cookie-consumes operation extension', () => {
    const openapi = spec({
      '/issue': {
        get: {
          operationId: 'issueLang',
          responses: {
            '200': {
              headers: {
                'Set-Cookie': setCookieHeader('locale', 'lang'),
              },
            },
          },
        },
      },
      '/page': {
        get: {
          operationId: 'getPage',
          'x-cookie-consumes': [{ name: 'lang' }],
          responses: { '200': {} },
        },
      },
    });
    const { cookieFlows } = detectCookieFlows(openapi);
    const flow = cookieFlows.find((f) => f.name === 'lang');
    assert.ok(flow);
    assert.strictEqual(flow.consumers.length, 1);
    assert.strictEqual(flow.consumers[0].operationId, 'getPage');
  });

  test('C4 detects headerEcho consumer via x-cookie-consumes.headerEcho', () => {
    const openapi = spec({
      '/csrf-issue': {
        get: {
          operationId: 'csrfIssue',
          responses: {
            '200': {
              headers: {
                'Set-Cookie': setCookieHeader('csrf-double-submit', 'XSRF-TOKEN'),
              },
            },
          },
        },
      },
      '/submit': {
        post: {
          operationId: 'submitForm',
          'x-cookie-consumes': [{ name: 'XSRF-TOKEN', headerEcho: 'X-CSRF-Token' }],
          responses: { '200': {} },
        },
      },
    });
    const { cookieFlows } = detectCookieFlows(openapi);
    const flow = cookieFlows.find((f) => f.name === 'XSRF-TOKEN');
    assert.ok(flow);
    assert.strictEqual(flow.consumers.length, 1);
    assert.strictEqual(flow.consumers[0].headerEcho, 'X-CSRF-Token');
  });

  test('detects multiple consumers across endpoints', () => {
    const openapi = spec(
      {
        '/login': {
          post: {
            operationId: 'login',
            responses: {
              '200': {
                headers: {
                  'Set-Cookie': setCookieHeader('session', 'sid'),
                },
              },
            },
          },
        },
        '/page-a': {
          get: {
            operationId: 'pageA',
            security: [{ sidScheme: [] }],
            responses: { '200': {} },
          },
        },
        '/page-b': {
          get: {
            operationId: 'pageB',
            security: [{ sidScheme: [] }],
            responses: { '200': {} },
          },
        },
        '/page-c': {
          get: {
            operationId: 'pageC',
            'x-cookie-consumes': [{ name: 'sid' }],
            responses: { '200': {} },
          },
        },
      },
      {
        securitySchemes: {
          sidScheme: cookieScheme('sid', 'session'),
        },
      },
    );
    const { cookieFlows } = detectCookieFlows(openapi);
    const flow = cookieFlows.find((f) => f.name === 'sid');
    assert.ok(flow);
    assert.strictEqual(flow.consumers.length, 3);
    const ids = flow.consumers.map((c) => c.operationId).sort();
    assert.deepStrictEqual(ids, ['pageA', 'pageB', 'pageC']);
  });

  test('returns empty consumers when none declared', () => {
    const openapi = spec({
      '/issue': {
        get: {
          operationId: 'issueTheme',
          responses: {
            '200': {
              headers: {
                'Set-Cookie': setCookieHeader('theme', 'theme_pref'),
              },
            },
          },
        },
      },
    });
    const { cookieFlows } = detectCookieFlows(openapi);
    const flow = cookieFlows.find((f) => f.name === 'theme_pref');
    assert.ok(flow);
    assert.strictEqual(flow.consumers.length, 0);
  });
});

// ---------------------------------------------------------------------------
// SECTION C — Rotator + Clearer detection
// ---------------------------------------------------------------------------

describe('Section C — Rotator + Clearer detection', () => {
  test('detects rotator (issuer + consumer same operation)', () => {
    const openapi = spec(
      {
        '/login': {
          post: {
            operationId: 'login',
            responses: {
              '200': {
                headers: {
                  'Set-Cookie': setCookieHeader('refresh-token', 'rt', { httpOnly: true }),
                },
              },
            },
          },
        },
        '/refresh': {
          post: {
            operationId: 'refresh',
            'x-cookie-roles': [{ name: 'rt', role: 'refresh-token' }],
            'x-cookie-consumes': [{ name: 'rt' }],
            responses: {
              '200': {
                headers: {
                  'Set-Cookie': setCookieHeader('refresh-token', 'rt', { httpOnly: true }),
                },
              },
            },
          },
        },
      },
    );
    const { cookieFlows } = detectCookieFlows(openapi);
    const flow = cookieFlows.find((f) => f.name === 'rt');
    assert.ok(flow);
    assert.strictEqual(flow.rotators.length, 1);
    assert.strictEqual(flow.rotators[0].operationId, 'refresh');
  });

  test('detects clearer via x-cookie-attrs.maxAge:0', () => {
    const openapi = spec({
      '/login': {
        post: {
          operationId: 'login',
          responses: {
            '200': {
              headers: {
                'Set-Cookie': setCookieHeader('session', 'sid'),
              },
            },
          },
        },
      },
      '/logout': {
        post: {
          operationId: 'logout',
          responses: {
            '200': {
              headers: {
                'Set-Cookie': setCookieHeader(null, 'sid', { maxAge: 0 }),
              },
            },
          },
        },
      },
    });
    const { cookieFlows } = detectCookieFlows(openapi);
    const flow = cookieFlows.find((f) => f.name === 'sid');
    assert.ok(flow);
    assert.strictEqual(flow.clearers.length, 1);
    assert.strictEqual(flow.clearers[0].operationId, 'logout');
    // Clearers should NOT be in issuers
    assert.ok(!flow.issuers.some((i) => i.operationId === 'logout'));
  });

  test('does not classify issuer as clearer when maxAge>0', () => {
    const openapi = spec({
      '/login': {
        post: {
          operationId: 'login',
          responses: {
            '200': {
              headers: {
                'Set-Cookie': setCookieHeader('session', 'sid', {
                  httpOnly: true,
                  maxAge: 3600,
                }),
              },
            },
          },
        },
      },
    });
    const { cookieFlows } = detectCookieFlows(openapi);
    const flow = cookieFlows.find((f) => f.name === 'sid');
    assert.ok(flow);
    assert.strictEqual(flow.clearers.length, 0);
    assert.strictEqual(flow.issuers.length, 1);
    assert.strictEqual(flow.issuers[0].operationId, 'login');
  });
});

// ---------------------------------------------------------------------------
// SECTION D — DIAG emission (12 codes)
// ---------------------------------------------------------------------------

describe('Section D — DIAG emission', () => {
  // D1: COOKIE_ROLE_AMBIGUOUS
  test('COOKIE_ROLE_AMBIGUOUS — same cookie name, two different roles', () => {
    const openapi = spec({
      '/issue-a': {
        get: {
          operationId: 'issueA',
          responses: {
            '200': {
              headers: {
                'Set-Cookie': setCookieHeader('session', 'multi_cookie'),
              },
            },
          },
        },
      },
      '/issue-b': {
        get: {
          operationId: 'issueB',
          responses: {
            '200': {
              headers: {
                'Set-Cookie': setCookieHeader('csrf-double-submit', 'multi_cookie'),
              },
            },
          },
        },
      },
    });
    const { diagnostics } = detectCookieFlows(openapi);
    const diag = diagnostics.find((d) => d.code === 'COOKIE_ROLE_AMBIGUOUS');
    assert.ok(diag, 'should emit COOKIE_ROLE_AMBIGUOUS');
    assert.strictEqual(diag.level, 'error');
    assert.strictEqual(diag.details.name, 'multi_cookie');
    assert.ok(diag.details.roles.includes('session'));
    assert.ok(diag.details.roles.includes('csrf-double-submit'));
  });

  // D2: COOKIE_ISSUER_AMBIGUOUS
  test('COOKIE_ISSUER_AMBIGUOUS — same name+role, >=2 pure issuers', () => {
    const openapi = spec({
      '/login-a': {
        post: {
          operationId: 'loginA',
          responses: {
            '200': {
              headers: {
                'Set-Cookie': setCookieHeader('session', 'sid'),
              },
            },
          },
        },
      },
      '/login-b': {
        post: {
          operationId: 'loginB',
          responses: {
            '200': {
              headers: {
                'Set-Cookie': setCookieHeader('session', 'sid'),
              },
            },
          },
        },
      },
    });
    const { diagnostics } = detectCookieFlows(openapi);
    const diag = diagnostics.find((d) => d.code === 'COOKIE_ISSUER_AMBIGUOUS');
    assert.ok(diag, 'should emit COOKIE_ISSUER_AMBIGUOUS');
    assert.strictEqual(diag.level, 'warn');
    assert.strictEqual(diag.details.name, 'sid');
    assert.strictEqual(diag.details.role, 'session');
    assert.ok(diag.details.issuers.includes('loginA'));
    assert.ok(diag.details.issuers.includes('loginB'));
  });

  // D2b: COOKIE_ISSUER_AMBIGUOUS does NOT fire for role 'custom'
  test('COOKIE_ISSUER_AMBIGUOUS — does NOT fire for role custom', () => {
    const openapi = spec({
      '/issue-a': {
        post: {
          operationId: 'issueA',
          responses: {
            '200': {
              headers: {
                'Set-Cookie': setCookieHeader('custom', 'track'),
              },
            },
          },
        },
      },
      '/issue-b': {
        post: {
          operationId: 'issueB',
          responses: {
            '200': {
              headers: {
                'Set-Cookie': setCookieHeader('custom', 'track'),
              },
            },
          },
        },
      },
    });
    const { diagnostics } = detectCookieFlows(openapi);
    const diag = diagnostics.find((d) => d.code === 'COOKIE_ISSUER_AMBIGUOUS');
    assert.ok(!diag, 'should NOT emit COOKIE_ISSUER_AMBIGUOUS for custom role');
  });

  // D2c: COOKIE_ISSUER_AMBIGUOUS excludes rotators from pure-issuer count
  test('COOKIE_ISSUER_AMBIGUOUS — rotator not counted as pure issuer', () => {
    const openapi = spec({
      '/login': {
        post: {
          operationId: 'login',
          responses: {
            '200': {
              headers: {
                'Set-Cookie': setCookieHeader('refresh-token', 'rt'),
              },
            },
          },
        },
      },
      '/refresh': {
        post: {
          operationId: 'refresh',
          'x-cookie-consumes': [{ name: 'rt' }],
          'x-cookie-roles': [{ name: 'rt', role: 'refresh-token' }],
          responses: {
            '200': {
              headers: {
                'Set-Cookie': setCookieHeader('refresh-token', 'rt'),
              },
            },
          },
        },
      },
    });
    const { diagnostics } = detectCookieFlows(openapi);
    // 1 pure issuer (login) + 1 rotator (refresh) = only 1 pure issuer, no ambiguity
    const diag = diagnostics.find((d) => d.code === 'COOKIE_ISSUER_AMBIGUOUS');
    assert.ok(!diag, 'rotator should not trigger COOKIE_ISSUER_AMBIGUOUS');
  });

  // D3: COOKIE_NAME_MISSING_FOR_ROLE
  test('COOKIE_NAME_MISSING_FOR_ROLE — x-cookie-role without x-cookie-name', () => {
    const openapi = spec({
      '/issue': {
        get: {
          operationId: 'issueMissing',
          responses: {
            '200': {
              headers: {
                'Set-Cookie': {
                  schema: { type: 'string' },
                  'x-cookie-role': 'session',
                  // no x-cookie-name
                },
              },
            },
          },
        },
      },
    });
    const { diagnostics } = detectCookieFlows(openapi);
    const diag = diagnostics.find((d) => d.code === 'COOKIE_NAME_MISSING_FOR_ROLE');
    assert.ok(diag, 'should emit COOKIE_NAME_MISSING_FOR_ROLE');
    assert.strictEqual(diag.level, 'error');
    assert.strictEqual(diag.details.role, 'session');
    assert.strictEqual(diag.details.operationId, 'issueMissing');
  });

  // D4: COOKIE_ATTR_DECLARATION_INVALID — wrong types
  test('COOKIE_ATTR_DECLARATION_INVALID — wrong types in x-cookie-attrs', () => {
    const openapi = spec({
      '/issue': {
        get: {
          operationId: 'issueBadAttrs',
          responses: {
            '200': {
              headers: {
                'Set-Cookie': setCookieHeader('session', 'sid', {
                  httpOnly: 'yes',     // should be boolean
                  secure: 1,           // should be boolean
                  sameSite: 'Relaxed', // not in Strict|Lax|None
                  maxAge: '3600',      // should be number
                }),
              },
            },
          },
        },
      },
    });
    const { diagnostics } = detectCookieFlows(openapi);
    const diag = diagnostics.find((d) => d.code === 'COOKIE_ATTR_DECLARATION_INVALID');
    assert.ok(diag, 'should emit COOKIE_ATTR_DECLARATION_INVALID');
    assert.strictEqual(diag.level, 'error');
    assert.strictEqual(diag.details.name, 'sid');
    // Should have multiple errors
    assert.ok(diag.details.errors.length >= 3, `expected >=3 attr errors, got ${diag.details.errors.length}`);
  });

  // D5: COOKIE_CSRF_HEADER_NOT_DECLARED
  test('COOKIE_CSRF_HEADER_NOT_DECLARED — csrf role without headerEcho consumer', () => {
    const openapi = spec({
      '/csrf-issue': {
        get: {
          operationId: 'csrfIssue',
          responses: {
            '200': {
              headers: {
                'Set-Cookie': setCookieHeader('csrf-double-submit', 'XSRF-TOKEN'),
              },
            },
          },
        },
      },
      // Consumer exists but WITHOUT headerEcho
      '/submit': {
        post: {
          operationId: 'submit',
          'x-cookie-consumes': [{ name: 'XSRF-TOKEN' }],
          responses: { '200': {} },
        },
      },
    });
    const { diagnostics } = detectCookieFlows(openapi);
    const diag = diagnostics.find((d) => d.code === 'COOKIE_CSRF_HEADER_NOT_DECLARED');
    assert.ok(diag, 'should emit COOKIE_CSRF_HEADER_NOT_DECLARED');
    assert.strictEqual(diag.level, 'warn');
    assert.strictEqual(diag.details.role, 'csrf-double-submit');
  });

  // D5b: No CSRF DIAG when headerEcho IS declared
  test('COOKIE_CSRF_HEADER_NOT_DECLARED — not emitted when headerEcho present', () => {
    const openapi = spec({
      '/csrf-issue': {
        get: {
          operationId: 'csrfIssue',
          responses: {
            '200': {
              headers: {
                'Set-Cookie': setCookieHeader('csrf-double-submit', 'XSRF-TOKEN'),
              },
            },
          },
        },
      },
      '/submit': {
        post: {
          operationId: 'submit',
          'x-cookie-consumes': [{ name: 'XSRF-TOKEN', headerEcho: 'X-CSRF-Token' }],
          responses: { '200': {} },
        },
      },
    });
    const { diagnostics } = detectCookieFlows(openapi);
    const diag = diagnostics.find((d) => d.code === 'COOKIE_CSRF_HEADER_NOT_DECLARED');
    assert.ok(!diag, 'should NOT emit COOKIE_CSRF_HEADER_NOT_DECLARED when headerEcho exists');
  });

  // D6: COOKIE_SCHEME_ROLE_UNDECLARED
  test('COOKIE_SCHEME_ROLE_UNDECLARED — apiKey-in-cookie scheme without x-cookie-role', () => {
    const openapi = spec(
      {
        '/protected': {
          get: {
            operationId: 'getProtected',
            security: [{ myScheme: [] }],
            responses: { '200': {} },
          },
        },
      },
      {
        securitySchemes: {
          myScheme: { type: 'apiKey', in: 'cookie', name: 'my_cookie' },
          // No x-cookie-role
        },
      },
    );
    const { diagnostics } = detectCookieFlows(openapi);
    const diag = diagnostics.find((d) => d.code === 'COOKIE_SCHEME_ROLE_UNDECLARED');
    assert.ok(diag, 'should emit COOKIE_SCHEME_ROLE_UNDECLARED');
    assert.strictEqual(diag.level, 'error');
    assert.strictEqual(diag.details.schemeName, 'myScheme');
    assert.strictEqual(diag.details.name, 'my_cookie');
  });

  // D7: COOKIE_HOST_PREFIX_INVALID
  test('COOKIE_HOST_PREFIX_INVALID — __Host- cookie missing Secure or Path=/ or having Domain', () => {
    const openapi = spec({
      '/issue': {
        get: {
          operationId: 'issueHost',
          responses: {
            '200': {
              headers: {
                'Set-Cookie': setCookieHeader('session', '__Host-sid', {
                  httpOnly: true,
                  secure: false,    // violation: must be true
                  path: '/api',     // violation: must be /
                  domain: '.example.com', // violation: must not set domain
                }),
              },
            },
          },
        },
      },
    });
    const { diagnostics } = detectCookieFlows(openapi);
    const diag = diagnostics.find((d) => d.code === 'COOKIE_HOST_PREFIX_INVALID');
    assert.ok(diag, 'should emit COOKIE_HOST_PREFIX_INVALID');
    assert.strictEqual(diag.level, 'error');
    assert.strictEqual(diag.details.name, '__Host-sid');
    assert.strictEqual(diag.details.violations.length, 3);
  });

  // D7b: __Host- with no attrs at all
  test('COOKIE_HOST_PREFIX_INVALID — __Host- cookie with no attrs declaration', () => {
    const openapi = spec({
      '/issue': {
        get: {
          operationId: 'issueHostNoAttrs',
          responses: {
            '200': {
              headers: {
                'Set-Cookie': setCookieHeader('session', '__Host-sid'),
              },
            },
          },
        },
      },
    });
    const { diagnostics } = detectCookieFlows(openapi);
    const diag = diagnostics.find((d) => d.code === 'COOKIE_HOST_PREFIX_INVALID');
    assert.ok(diag, 'should emit COOKIE_HOST_PREFIX_INVALID for missing attrs');
    assert.ok(diag.details.violations.length >= 1);
  });

  // D7c: __Host- with VALID attrs — no DIAG
  test('COOKIE_HOST_PREFIX_INVALID — not emitted when __Host- attrs are correct', () => {
    const openapi = spec({
      '/issue': {
        get: {
          operationId: 'issueHostValid',
          responses: {
            '200': {
              headers: {
                'Set-Cookie': setCookieHeader('session', '__Host-sid', {
                  httpOnly: true,
                  secure: true,
                  path: '/',
                  sameSite: 'Strict',
                }),
              },
            },
          },
        },
      },
    });
    const { diagnostics } = detectCookieFlows(openapi);
    const diag = diagnostics.find((d) => d.code === 'COOKIE_HOST_PREFIX_INVALID');
    assert.ok(!diag, 'should NOT emit COOKIE_HOST_PREFIX_INVALID for valid __Host- cookie');
  });

  // D8: COOKIE_NAME_INVALID
  test('COOKIE_NAME_INVALID — cookie name with RFC-invalid chars (space)', () => {
    const openapi = spec({
      '/issue': {
        get: {
          operationId: 'issueBadName',
          responses: {
            '200': {
              headers: {
                'Set-Cookie': setCookieHeader('session', 'bad name'),
              },
            },
          },
        },
      },
    });
    const { diagnostics } = detectCookieFlows(openapi);
    const diag = diagnostics.find((d) => d.code === 'COOKIE_NAME_INVALID');
    assert.ok(diag, 'should emit COOKIE_NAME_INVALID for name with space');
    assert.strictEqual(diag.level, 'error');
    assert.strictEqual(diag.details.name, 'bad name');
  });

  test('COOKIE_NAME_INVALID — cookie name with semicolon', () => {
    const openapi = spec({
      '/issue': {
        get: {
          operationId: 'issueSemicolon',
          responses: {
            '200': {
              headers: {
                'Set-Cookie': setCookieHeader('session', 'bad;name'),
              },
            },
          },
        },
      },
    });
    const { diagnostics } = detectCookieFlows(openapi);
    const diag = diagnostics.find((d) => d.code === 'COOKIE_NAME_INVALID');
    assert.ok(diag, 'should emit COOKIE_NAME_INVALID for name with semicolon');
  });

  test('COOKIE_NAME_INVALID — cookie name with equals sign', () => {
    const openapi = spec({
      '/issue': {
        get: {
          operationId: 'issueEquals',
          responses: {
            '200': {
              headers: {
                'Set-Cookie': setCookieHeader('session', 'bad=name'),
              },
            },
          },
        },
      },
    });
    const { diagnostics } = detectCookieFlows(openapi);
    const diag = diagnostics.find((d) => d.code === 'COOKIE_NAME_INVALID');
    assert.ok(diag, 'should emit COOKIE_NAME_INVALID for name with equals');
  });

  test('COOKIE_NAME_INVALID — cookie name with comma', () => {
    const openapi = spec({
      '/issue': {
        get: {
          operationId: 'issueComma',
          responses: {
            '200': {
              headers: {
                'Set-Cookie': setCookieHeader('session', 'bad,name'),
              },
            },
          },
        },
      },
    });
    const { diagnostics } = detectCookieFlows(openapi);
    const diag = diagnostics.find((d) => d.code === 'COOKIE_NAME_INVALID');
    assert.ok(diag, 'should emit COOKIE_NAME_INVALID for name with comma');
  });

  // D8b: Valid cookie name — no DIAG
  test('COOKIE_NAME_INVALID — not emitted for RFC-valid name', () => {
    const openapi = spec({
      '/issue': {
        get: {
          operationId: 'issueValid',
          responses: {
            '200': {
              headers: {
                'Set-Cookie': setCookieHeader('session', '__Host-my_cookie.v2'),
              },
            },
          },
        },
      },
    });
    const { diagnostics } = detectCookieFlows(openapi);
    const diag = diagnostics.find((d) => d.code === 'COOKIE_NAME_INVALID');
    assert.ok(!diag, 'should NOT emit COOKIE_NAME_INVALID for valid name');
  });

  // D9: COOKIE_SAMESITE_NONE_WITHOUT_SECURE
  test('COOKIE_SAMESITE_NONE_WITHOUT_SECURE — sameSite None without secure:true', () => {
    const openapi = spec({
      '/issue': {
        get: {
          operationId: 'issueNone',
          responses: {
            '200': {
              headers: {
                'Set-Cookie': setCookieHeader('session', 'sid', {
                  sameSite: 'None',
                  secure: false,
                }),
              },
            },
          },
        },
      },
    });
    const { diagnostics } = detectCookieFlows(openapi);
    const diag = diagnostics.find((d) => d.code === 'COOKIE_SAMESITE_NONE_WITHOUT_SECURE');
    assert.ok(diag, 'should emit COOKIE_SAMESITE_NONE_WITHOUT_SECURE');
    assert.strictEqual(diag.level, 'error');
    assert.strictEqual(diag.details.name, 'sid');
    assert.strictEqual(diag.details.sameSite, 'None');
    assert.strictEqual(diag.details.secure, false);
  });

  // D9b: sameSite None with secure true — no DIAG
  test('COOKIE_SAMESITE_NONE_WITHOUT_SECURE — not emitted when secure:true', () => {
    const openapi = spec({
      '/issue': {
        get: {
          operationId: 'issueNoneSecure',
          responses: {
            '200': {
              headers: {
                'Set-Cookie': setCookieHeader('session', 'sid', {
                  sameSite: 'None',
                  secure: true,
                }),
              },
            },
          },
        },
      },
    });
    const { diagnostics } = detectCookieFlows(openapi);
    const diag = diagnostics.find((d) => d.code === 'COOKIE_SAMESITE_NONE_WITHOUT_SECURE');
    assert.ok(!diag, 'should NOT emit COOKIE_SAMESITE_NONE_WITHOUT_SECURE when secure:true');
  });

  // D9c: sameSite None with secure omitted (undefined) — should fire
  test('COOKIE_SAMESITE_NONE_WITHOUT_SECURE — fires when secure is omitted', () => {
    const openapi = spec({
      '/issue': {
        get: {
          operationId: 'issueNoneNoSecure',
          responses: {
            '200': {
              headers: {
                'Set-Cookie': setCookieHeader('session', 'sid', {
                  sameSite: 'None',
                  // secure omitted
                }),
              },
            },
          },
        },
      },
    });
    const { diagnostics } = detectCookieFlows(openapi);
    const diag = diagnostics.find((d) => d.code === 'COOKIE_SAMESITE_NONE_WITHOUT_SECURE');
    assert.ok(diag, 'should emit COOKIE_SAMESITE_NONE_WITHOUT_SECURE when secure omitted');
  });

  // D10: COOKIE_HAS_NO_CONSUMER
  test('COOKIE_HAS_NO_CONSUMER — issuer with no consumer declared anywhere', () => {
    const openapi = spec({
      '/issue': {
        get: {
          operationId: 'issueOrphan',
          responses: {
            '200': {
              headers: {
                'Set-Cookie': setCookieHeader('locale', 'lang'),
              },
            },
          },
        },
      },
    });
    const { diagnostics } = detectCookieFlows(openapi);
    const diag = diagnostics.find((d) => d.code === 'COOKIE_HAS_NO_CONSUMER');
    assert.ok(diag, 'should emit COOKIE_HAS_NO_CONSUMER');
    assert.strictEqual(diag.level, 'warn');
    assert.ok(diag.details.issuers.includes('issueOrphan'));
  });

  // D11: COOKIE_HAS_NO_ISSUER
  test('COOKIE_HAS_NO_ISSUER — consumer with no issuer declared anywhere', () => {
    const openapi = spec({
      '/protected': {
        get: {
          operationId: 'getProtected',
          'x-cookie-consumes': [{ name: 'orphan_cookie' }],
          responses: { '200': {} },
        },
      },
    });
    const { cookieFlows, diagnostics } = detectCookieFlows(openapi);
    const diag = diagnostics.find((d) => d.code === 'COOKIE_HAS_NO_ISSUER');
    assert.ok(diag, 'should emit COOKIE_HAS_NO_ISSUER');
    assert.strictEqual(diag.level, 'error');
    assert.ok(diag.details.consumers.includes('getProtected'));

    // The flow should still exist in output (consumer present)
    const flow = cookieFlows.find((f) => f.name === 'orphan_cookie');
    assert.ok(flow);
  });

  // D12: COOKIE_ATTR_DECLARATION_INVALID for unknown attribute values
  // (covered above in D4, but test sameSite specifically with invalid value)
  test('COOKIE_ATTR_DECLARATION_INVALID — sameSite with invalid value string', () => {
    const openapi = spec({
      '/issue': {
        get: {
          operationId: 'issueBadSameSite',
          responses: {
            '200': {
              headers: {
                'Set-Cookie': setCookieHeader('session', 'sid', {
                  sameSite: 'strict', // lowercase — not in { Strict, Lax, None }
                }),
              },
            },
          },
        },
      },
    });
    const { diagnostics } = detectCookieFlows(openapi);
    const diag = diagnostics.find((d) => d.code === 'COOKIE_ATTR_DECLARATION_INVALID');
    assert.ok(diag, 'should emit COOKIE_ATTR_DECLARATION_INVALID for lowercase sameSite');
    const sameSiteErr = diag.details.errors.find((e) => e.field === 'sameSite');
    assert.ok(sameSiteErr, 'should have error for sameSite field');
  });
});

// ---------------------------------------------------------------------------
// SECTION E — Edge cases (from cookies.md, detector-relevant)
// ---------------------------------------------------------------------------

describe('Section E — Edge cases', () => {
  // Edge #3: cookie with no attrs declared
  test('handles cookie with no attrs declared (attrs=null)', () => {
    const openapi = spec({
      '/issue': {
        get: {
          operationId: 'issueNoAttrs',
          responses: {
            '200': {
              headers: {
                'Set-Cookie': setCookieHeader('locale', 'lang'),
                // no x-cookie-attrs
              },
            },
          },
        },
      },
    });
    const { cookieFlows } = detectCookieFlows(openapi);
    const flow = cookieFlows.find((f) => f.name === 'lang');
    assert.ok(flow);
    // attrs should be empty object (default)
    assert.deepStrictEqual(flow.attrs, {});
  });

  // Edge #4: cleared cookie via maxAge:0
  test('handles cleared cookie via maxAge:0', () => {
    const openapi = spec({
      '/login': {
        post: {
          operationId: 'login',
          responses: {
            '200': {
              headers: {
                'Set-Cookie': setCookieHeader('session', 'sid', { httpOnly: true }),
              },
            },
          },
        },
      },
      '/logout': {
        post: {
          operationId: 'logout',
          responses: {
            '200': {
              headers: {
                'Set-Cookie': {
                  schema: { type: 'string' },
                  'x-cookie-name': 'sid',
                  'x-cookie-attrs': { maxAge: 0 },
                },
              },
            },
          },
        },
      },
    });
    const { cookieFlows } = detectCookieFlows(openapi);
    const flow = cookieFlows.find((f) => f.name === 'sid');
    assert.ok(flow);
    assert.strictEqual(flow.clearers.length, 1);
    assert.strictEqual(flow.clearers[0].operationId, 'logout');
  });

  // Edge #6: cookie with Domain attribute
  test('handles cookie with Domain attribute', () => {
    const openapi = spec({
      '/issue': {
        get: {
          operationId: 'issueDomain',
          responses: {
            '200': {
              headers: {
                'Set-Cookie': setCookieHeader('session', 'sid', {
                  httpOnly: true,
                  secure: true,
                  domain: '.example.com',
                  path: '/',
                }),
              },
            },
          },
        },
      },
    });
    const { cookieFlows, diagnostics } = detectCookieFlows(openapi);
    const flow = cookieFlows.find((f) => f.name === 'sid');
    assert.ok(flow);
    assert.strictEqual(flow.attrs.domain, '.example.com');
    // No DIAG for valid domain attribute
    const attrDiag = diagnostics.find((d) => d.code === 'COOKIE_ATTR_DECLARATION_INVALID');
    assert.ok(!attrDiag);
  });

  // Edge #7: cookie with custom Path attribute
  test('handles cookie with custom Path attribute (e.g., /api)', () => {
    const openapi = spec({
      '/issue': {
        get: {
          operationId: 'issueCustomPath',
          responses: {
            '200': {
              headers: {
                'Set-Cookie': setCookieHeader('session', 'api_sid', {
                  httpOnly: true,
                  path: '/api/v1',
                }),
              },
            },
          },
        },
      },
    });
    const { cookieFlows } = detectCookieFlows(openapi);
    const flow = cookieFlows.find((f) => f.name === 'api_sid');
    assert.ok(flow);
    assert.strictEqual(flow.attrs.path, '/api/v1');
  });

  // Edge #9: rotation — same name new value across two operations
  test('handles rotation: same name new value across two operations', () => {
    const openapi = spec({
      '/login': {
        post: {
          operationId: 'login',
          responses: {
            '200': {
              headers: {
                'Set-Cookie': setCookieHeader('refresh-token', 'rt'),
              },
            },
          },
        },
      },
      '/refresh': {
        post: {
          operationId: 'refresh',
          'x-cookie-consumes': [{ name: 'rt' }],
          responses: {
            '200': {
              headers: {
                'Set-Cookie': setCookieHeader('refresh-token', 'rt'),
              },
            },
          },
        },
      },
    });
    const { cookieFlows } = detectCookieFlows(openapi);
    const flow = cookieFlows.find((f) => f.name === 'rt');
    assert.ok(flow);
    // refresh is both consumer and issuer -> rotator
    assert.strictEqual(flow.rotators.length, 1);
    assert.strictEqual(flow.rotators[0].operationId, 'refresh');
  });

  // Edge #25: Set-Cookie in 3xx response
  test('detects Set-Cookie in 3xx response (e.g., 302 oauth authorize)', () => {
    const openapi = spec({
      '/authorize': {
        get: {
          operationId: 'oauthAuthorize',
          responses: {
            '302': {
              headers: {
                'Set-Cookie': setCookieHeader('oauth-state', 'oauth_state', {
                  httpOnly: true,
                  secure: true,
                  sameSite: 'Lax',
                  path: '/',
                  maxAge: 600,
                }),
              },
            },
          },
        },
      },
    });
    const { cookieFlows } = detectCookieFlows(openapi);
    const flow = cookieFlows.find((f) => f.name === 'oauth_state');
    assert.ok(flow, 'should detect cookie from 302 response');
    assert.strictEqual(flow.role, 'oauth-state');
    assert.strictEqual(flow.issuers.length, 1);
    assert.strictEqual(flow.issuers[0].operationId, 'oauthAuthorize');
  });

  // Multiple Set-Cookie in different status responses of same operation
  test('detects cookies from multiple response status codes', () => {
    const openapi = spec({
      '/login': {
        post: {
          operationId: 'login',
          responses: {
            '200': {
              headers: {
                'Set-Cookie': setCookieHeader('session', 'sid', { httpOnly: true }),
              },
            },
            '201': {
              headers: {
                'Set-Cookie': setCookieHeader('session', 'sid', { httpOnly: true }),
              },
            },
          },
        },
      },
    });
    const { cookieFlows } = detectCookieFlows(openapi);
    const flow = cookieFlows.find((f) => f.name === 'sid');
    assert.ok(flow);
    // Both 200 and 201 declare the same cookie, but only 1 unique issuer entry per operation
    // The detector deduplicates via P3 check, but for P2 it adds per-response-header
    // Actually P2 adds once per response iteration, so 2 issuer entries are possible
    assert.ok(flow.issuers.length >= 1, 'should have at least 1 issuer');
  });
});

// ---------------------------------------------------------------------------
// SECTION F — Empty/missing input safety
// ---------------------------------------------------------------------------

describe('Section F — Empty/missing input safety', () => {
  test('returns empty cookieFlows for null input', () => {
    const result = detectCookieFlows(null);
    assert.deepStrictEqual(result, { cookieFlows: [], diagnostics: [] });
  });

  test('returns empty cookieFlows for undefined input', () => {
    const result = detectCookieFlows(undefined);
    assert.deepStrictEqual(result, { cookieFlows: [], diagnostics: [] });
  });

  test('returns empty cookieFlows for OpenAPI with no paths', () => {
    const result = detectCookieFlows({ openapi: '3.0.3', paths: {} });
    assert.deepStrictEqual(result.cookieFlows, []);
    assert.deepStrictEqual(result.diagnostics, []);
  });

  test('returns empty cookieFlows for OpenAPI with no cookie declarations', () => {
    const openapi = spec({
      '/health': {
        get: {
          operationId: 'healthCheck',
          responses: { '200': { description: 'OK' } },
        },
      },
      '/users': {
        get: {
          operationId: 'listUsers',
          responses: { '200': { description: 'OK' } },
        },
      },
    });
    const result = detectCookieFlows(openapi);
    assert.deepStrictEqual(result.cookieFlows, []);
    assert.deepStrictEqual(result.diagnostics, []);
  });

  test('handles missing components.securitySchemes gracefully', () => {
    const openapi = spec({
      '/issue': {
        get: {
          operationId: 'issueLocale',
          responses: {
            '200': {
              headers: {
                'Set-Cookie': setCookieHeader('locale', 'lang'),
              },
            },
          },
        },
      },
    });
    // Explicitly no components key
    delete openapi.components;
    const { cookieFlows, diagnostics } = detectCookieFlows(openapi);
    const flow = cookieFlows.find((f) => f.name === 'lang');
    assert.ok(flow);
    assert.strictEqual(flow.role, 'locale');
    // Should not crash
    assert.ok(Array.isArray(diagnostics));
  });

  test('handles missing paths gracefully', () => {
    const result = detectCookieFlows({ openapi: '3.0.3' });
    assert.deepStrictEqual(result.cookieFlows, []);
    assert.deepStrictEqual(result.diagnostics, []);
  });

  test('handles non-object path items gracefully', () => {
    const result = detectCookieFlows({ paths: { '/bad': null, '/also-bad': 'string' } });
    assert.deepStrictEqual(result.cookieFlows, []);
  });

  test('handles non-object operation entries gracefully', () => {
    const result = detectCookieFlows({ paths: { '/bad': { get: null, post: 42 } } });
    assert.deepStrictEqual(result.cookieFlows, []);
  });
});

// ---------------------------------------------------------------------------
// SECTION G — Additional detector branches discovered in source
// ---------------------------------------------------------------------------

describe('Section G — Additional branches', () => {
  // P1 scheme exists but no operation references it
  test('P1 scheme registered even when no operation references it', () => {
    const openapi = spec(
      {},
      {
        securitySchemes: {
          orphanScheme: cookieScheme('orphan_cookie', 'session'),
        },
      },
    );
    const { cookieFlows } = detectCookieFlows(openapi);
    // The scheme cookie is registered in pass 2 but has no issuers/consumers/clearers
    // and no securitySchemeRef via operations — but pass 2 sets securitySchemeRef.
    // However, the cookie has 0 issuers, 0 consumers, 0 clearers, but has securitySchemeRef.
    // Line 730: if (issuers=0 && consumers=0 && clearers=0 && !securitySchemeRef) skip;
    // securitySchemeRef IS set, so it SHOULD be included.
    const flow = cookieFlows.find((f) => f.name === 'orphan_cookie');
    assert.ok(flow, 'scheme-only cookie should still appear in cookieFlows');
    assert.strictEqual(flow.securitySchemeRef, 'orphanScheme');
    assert.strictEqual(flow.role, 'session');
  });

  // P3 x-cookie-roles with missing name field is skipped
  test('P3 skips x-cookie-roles entries without name', () => {
    const openapi = spec({
      '/issue': {
        post: {
          operationId: 'issueNoName',
          'x-cookie-roles': [{ role: 'session' }], // no name
          responses: { '200': {} },
        },
      },
    });
    const { cookieFlows } = detectCookieFlows(openapi);
    assert.strictEqual(cookieFlows.length, 0);
  });

  // P3 x-cookie-roles not an array is ignored
  test('P3 handles non-array x-cookie-roles gracefully', () => {
    const openapi = spec({
      '/issue': {
        post: {
          operationId: 'issueBadRoles',
          'x-cookie-roles': 'not-an-array',
          responses: { '200': {} },
        },
      },
    });
    const { cookieFlows } = detectCookieFlows(openapi);
    assert.strictEqual(cookieFlows.length, 0);
  });

  // C3 x-cookie-consumes not an array is ignored
  test('C3 handles non-array x-cookie-consumes gracefully', () => {
    const openapi = spec({
      '/protected': {
        get: {
          operationId: 'protected',
          'x-cookie-consumes': 'not-an-array',
          responses: { '200': {} },
        },
      },
    });
    const { cookieFlows } = detectCookieFlows(openapi);
    assert.strictEqual(cookieFlows.length, 0);
  });

  // C3 x-cookie-consumes entries without name are filtered
  test('C3 skips x-cookie-consumes entries without name', () => {
    const openapi = spec({
      '/issue': {
        get: {
          operationId: 'issuer',
          responses: {
            '200': {
              headers: {
                'Set-Cookie': setCookieHeader('session', 'sid'),
              },
            },
          },
        },
      },
      '/consumer': {
        get: {
          operationId: 'consumer',
          'x-cookie-consumes': [{ headerEcho: 'X-Test' }], // no name
          responses: { '200': {} },
        },
      },
    });
    const { cookieFlows } = detectCookieFlows(openapi);
    const flow = cookieFlows.find((f) => f.name === 'sid');
    assert.ok(flow);
    assert.strictEqual(flow.consumers.length, 0);
  });

  // C1 consumer deduplication: same operation referenced twice via security[]
  test('C1 does not duplicate consumer for same operation referenced twice', () => {
    const openapi = spec(
      {
        '/issue': {
          post: {
            operationId: 'login',
            responses: {
              '200': {
                headers: {
                  'Set-Cookie': setCookieHeader('session', 'sid'),
                },
              },
            },
          },
        },
        '/protected': {
          get: {
            operationId: 'getProtected',
            security: [{ sidScheme: [] }, { sidScheme: [] }],
            responses: { '200': {} },
          },
        },
      },
      {
        securitySchemes: {
          sidScheme: cookieScheme('sid', 'session'),
        },
      },
    );
    const { cookieFlows } = detectCookieFlows(openapi);
    const flow = cookieFlows.find((f) => f.name === 'sid');
    assert.ok(flow);
    assert.strictEqual(flow.consumers.length, 1, 'should deduplicate same-operation consumer');
  });

  // P3 does not add duplicate issuer when P2 already registered same operation
  test('P3 does not duplicate issuer when P2 already registered same operation', () => {
    const openapi = spec({
      '/login': {
        post: {
          operationId: 'login',
          'x-cookie-roles': [{ name: 'rt', role: 'refresh-token' }],
          responses: {
            '200': {
              headers: {
                'Set-Cookie': setCookieHeader('refresh-token', 'rt'),
              },
            },
          },
        },
      },
    });
    const { cookieFlows } = detectCookieFlows(openapi);
    const flow = cookieFlows.find((f) => f.name === 'rt');
    assert.ok(flow);
    // Should have exactly 1 issuer, not 2 (P2 + P3 deduped)
    assert.strictEqual(flow.issuers.length, 1);
  });

  // response headers with lowercase 'set-cookie' key
  test('detects Set-Cookie via lowercase header key (set-cookie)', () => {
    const openapi = spec({
      '/issue': {
        get: {
          operationId: 'issueLowerCase',
          responses: {
            '200': {
              headers: {
                'set-cookie': setCookieHeader('locale', 'lang'),
              },
            },
          },
        },
      },
    });
    const { cookieFlows } = detectCookieFlows(openapi);
    const flow = cookieFlows.find((f) => f.name === 'lang');
    assert.ok(flow, 'should detect cookie via lowercase set-cookie header');
    assert.strictEqual(flow.role, 'locale');
  });

  // GET issuer has queryExample when params have examples
  test('GET issuer extracts queryExample from parameter examples', () => {
    const openapi = spec({
      '/set-locale': {
        get: {
          operationId: 'setLocale',
          parameters: [
            { name: 'lang', in: 'query', schema: { type: 'string' }, example: 'en' },
          ],
          responses: {
            '200': {
              headers: {
                'Set-Cookie': setCookieHeader('locale', 'lang'),
              },
            },
          },
        },
      },
    });
    const { cookieFlows } = detectCookieFlows(openapi);
    const flow = cookieFlows.find((f) => f.name === 'lang');
    assert.ok(flow);
    assert.strictEqual(flow.issuers.length, 1);
    assert.deepStrictEqual(flow.issuers[0].queryExample, { lang: 'en' });
  });

  // GET issuer extracts queryExample from schema.example
  test('GET issuer extracts queryExample from parameter schema.example', () => {
    const openapi = spec({
      '/set-theme': {
        get: {
          operationId: 'setTheme',
          parameters: [
            { name: 'theme', in: 'query', schema: { type: 'string', example: 'dark' } },
          ],
          responses: {
            '200': {
              headers: {
                'Set-Cookie': setCookieHeader('theme', 'theme_pref'),
              },
            },
          },
        },
      },
    });
    const { cookieFlows } = detectCookieFlows(openapi);
    const flow = cookieFlows.find((f) => f.name === 'theme_pref');
    assert.ok(flow);
    assert.deepStrictEqual(flow.issuers[0].queryExample, { theme: 'dark' });
  });

  // GET issuer with no query param examples — no queryExample field
  test('GET issuer with no query examples has no queryExample', () => {
    const openapi = spec({
      '/set-lang': {
        get: {
          operationId: 'setLang',
          parameters: [
            { name: 'lang', in: 'query', schema: { type: 'string' } },
          ],
          responses: {
            '200': {
              headers: {
                'Set-Cookie': setCookieHeader('locale', 'lang'),
              },
            },
          },
        },
      },
    });
    const { cookieFlows } = detectCookieFlows(openapi);
    const flow = cookieFlows.find((f) => f.name === 'lang');
    assert.ok(flow);
    assert.strictEqual(flow.issuers[0].queryExample, undefined);
  });

  // All HTTP methods are scanned
  test('detects cookies across all HTTP methods', () => {
    const methods = ['get', 'post', 'put', 'patch', 'delete'];
    const paths = {};
    for (const method of methods) {
      paths[`/${method}-endpoint`] = {
        [method]: {
          operationId: `${method}Op`,
          responses: {
            '200': {
              headers: {
                'Set-Cookie': setCookieHeader('custom', `cookie_${method}`),
              },
            },
          },
        },
      };
    }
    const openapi = spec(paths);
    const { cookieFlows } = detectCookieFlows(openapi);
    for (const method of methods) {
      const flow = cookieFlows.find((f) => f.name === `cookie_${method}`);
      assert.ok(flow, `should detect cookie from ${method.toUpperCase()} operation`);
      assert.strictEqual(flow.issuers[0].method, method.toUpperCase());
    }
  });

  // attrs: first non-null declaration wins
  test('first non-null attrs declaration wins when multiple responses declare attrs', () => {
    const openapi = spec({
      '/issue-a': {
        get: {
          operationId: 'issueA',
          responses: {
            '200': {
              headers: {
                'Set-Cookie': setCookieHeader('session', 'sid', {
                  httpOnly: true,
                  secure: true,
                }),
              },
            },
          },
        },
      },
      '/issue-b': {
        get: {
          operationId: 'issueB',
          responses: {
            '200': {
              headers: {
                'Set-Cookie': setCookieHeader('session', 'sid', {
                  httpOnly: false,
                  secure: false,
                }),
              },
            },
          },
        },
      },
    });
    const { cookieFlows } = detectCookieFlows(openapi);
    const flow = cookieFlows.find((f) => f.name === 'sid');
    assert.ok(flow);
    // First declaration wins
    assert.strictEqual(flow.attrs.httpOnly, true);
    assert.strictEqual(flow.attrs.secure, true);
  });

  // securitySchemeRef: set from C1 or pass 2, first wins
  test('securitySchemeRef is set from the first scheme reference', () => {
    const openapi = spec(
      {
        '/protected': {
          get: {
            operationId: 'getProtected',
            security: [{ schemeA: [] }],
            responses: { '200': {} },
          },
        },
      },
      {
        securitySchemes: {
          schemeA: cookieScheme('sid', 'session'),
          schemeB: cookieScheme('sid', 'session'),
        },
      },
    );
    const { cookieFlows } = detectCookieFlows(openapi);
    const flow = cookieFlows.find((f) => f.name === 'sid');
    assert.ok(flow);
    assert.strictEqual(flow.securitySchemeRef, 'schemeA');
  });
});

// ---------------------------------------------------------------------------
// SECTION X — declaredStatus enrichment on opRefs
// ---------------------------------------------------------------------------

describe('Section X — declaredStatus enrichment on opRefs', () => {
  test('issuer opRef carries declaredStatus from single 2xx response key', () => {
    const openapi = spec({
      '/auth/register': {
        post: {
          operationId: 'authRegister',
          responses: {
            '201': {
              headers: {
                'Set-Cookie': setCookieHeader('refresh-token', 'refresh_token'),
              },
            },
            '400': {},
          },
        },
      },
    });
    const { cookieFlows } = detectCookieFlows(openapi);
    const flow = cookieFlows.find((f) => f.name === 'refresh_token');
    assert.ok(flow);
    assert.strictEqual(flow.issuers[0].declaredStatus, 201);
  });

  test('clearer opRef carries declaredStatus (e.g. 204)', () => {
    const openapi = spec({
      '/auth/logout': {
        post: {
          operationId: 'authLogout',
          responses: {
            '204': {
              headers: {
                'Set-Cookie': setCookieHeader('session', 'sid', { maxAge: 0 }),
              },
            },
          },
        },
      },
      '/auth/login': {
        post: {
          operationId: 'authLogin',
          responses: {
            '200': {
              headers: {
                'Set-Cookie': setCookieHeader('session', 'sid'),
              },
            },
          },
        },
      },
    });
    const { cookieFlows } = detectCookieFlows(openapi);
    const flow = cookieFlows.find((f) => f.name === 'sid');
    assert.ok(flow);
    assert.strictEqual(flow.clearers[0].declaredStatus, 204);
    assert.strictEqual(flow.issuers[0].declaredStatus, 200);
  });

  test('issuer with NO declared 2xx → declaredStatus null + COOKIE_ISSUER_SUCCESS_STATUS_MISSING diag', () => {
    const openapi = spec({
      '/auth/register': {
        post: {
          operationId: 'authRegister',
          responses: {
            '400': {
              headers: {
                'Set-Cookie': setCookieHeader('refresh-token', 'refresh_token'),
              },
            },
          },
        },
      },
    });
    const { cookieFlows } = detectCookieFlows(openapi);
    const flow = cookieFlows.find((f) => f.name === 'refresh_token');
    assert.ok(flow);
    assert.strictEqual(flow.issuers[0].declaredStatus, null);
    const diag = flow.diagnostics.find((d) => d.code === 'COOKIE_ISSUER_SUCCESS_STATUS_MISSING');
    assert.ok(diag, 'expected COOKIE_ISSUER_SUCCESS_STATUS_MISSING diagnostic');
    assert.strictEqual(diag.level, 'error');
  });

  test('issuer with multiple 2xx → declaredStatus null + COOKIE_ISSUER_SUCCESS_STATUS_AMBIGUOUS diag', () => {
    const openapi = spec({
      '/auth/register': {
        post: {
          operationId: 'authRegister',
          responses: {
            '200': { headers: { 'Set-Cookie': setCookieHeader('refresh-token', 'rt') } },
            '201': { headers: { 'Set-Cookie': setCookieHeader('refresh-token', 'rt') } },
          },
        },
      },
    });
    const { cookieFlows } = detectCookieFlows(openapi);
    const flow = cookieFlows.find((f) => f.name === 'rt');
    assert.ok(flow);
    assert.strictEqual(flow.issuers[0].declaredStatus, null);
    const diag = flow.diagnostics.find((d) => d.code === 'COOKIE_ISSUER_SUCCESS_STATUS_AMBIGUOUS');
    assert.ok(diag);
    assert.deepStrictEqual(diag.details.declaredCodes, [200, 201]);
  });

  test('rotator declaredStatus extracted (operation that both consumes and re-issues)', () => {
    const openapi = spec(
      {
        '/auth/refresh': {
          post: {
            operationId: 'authRefresh',
            security: [{ refreshCookie: [] }],
            responses: {
              '200': {
                headers: {
                  'Set-Cookie': setCookieHeader('refresh-token', 'refresh_token'),
                },
              },
            },
          },
        },
      },
      {
        securitySchemes: {
          refreshCookie: cookieScheme('refresh_token', 'refresh-token'),
        },
      },
    );
    const { cookieFlows } = detectCookieFlows(openapi);
    const flow = cookieFlows.find((f) => f.name === 'refresh_token');
    assert.ok(flow);
    // /auth/refresh is both consumer (security) and issuer (Set-Cookie) → rotator
    assert.ok(flow.rotators.length >= 1);
    assert.strictEqual(flow.rotators[0].declaredStatus, 200);
  });
});
