'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { detectCookieFlows } = require('../../probes/detectors/cookie-flows');

// ---------------------------------------------------------------------------
// Helpers: build minimal OpenAPI specs for each test case
// ---------------------------------------------------------------------------

function makeSpec(overrides = {}) {
  return {
    openapi: '3.0.3',
    info: { title: 'test', version: '1.0.0' },
    paths: {},
    components: { securitySchemes: {} },
    ...overrides,
  };
}

function makeOperation(operationId, extras = {}) {
  return {
    operationId,
    responses: { '200': { description: 'OK' } },
    ...extras,
  };
}

function setCookieHeader(overrides = {}) {
  return {
    schema: { type: 'string' },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// P1: securitySchemes apiKey-in-cookie detection
// ---------------------------------------------------------------------------

describe('P1 — securitySchemes apiKey-in-cookie', () => {
  it('should detect a session cookie from securitySchemes with x-cookie-role', () => {
    const spec = makeSpec({
      components: {
        securitySchemes: {
          sessionCookie: { type: 'apiKey', in: 'cookie', name: 'connect.sid', 'x-cookie-role': 'session' },
        },
      },
      paths: {
        '/protected': {
          get: makeOperation('protectedGet', {
            security: [{ sessionCookie: [] }],
          }),
        },
      },
    });

    const { cookieFlows } = detectCookieFlows(spec);
    const entry = cookieFlows.find((f) => f.name === 'connect.sid');
    assert.ok(entry, 'should have a connect.sid entry');
    assert.equal(entry.role, 'session');
    assert.equal(entry.securitySchemeRef, 'sessionCookie');
    assert.equal(entry.consumers.length, 1);
    assert.equal(entry.consumers[0].operationId, 'protectedGet');
  });

  it('should read csrf-double-submit role from x-cookie-role on scheme', () => {
    const spec = makeSpec({
      components: {
        securitySchemes: {
          csrfCookie: { type: 'apiKey', in: 'cookie', name: 'XSRF-TOKEN', 'x-cookie-role': 'csrf-double-submit' },
        },
      },
      paths: {
        '/mutate': {
          post: makeOperation('mutatePost', {
            security: [{ csrfCookie: [] }],
          }),
        },
      },
    });

    const { cookieFlows } = detectCookieFlows(spec);
    const entry = cookieFlows.find((f) => f.name === 'XSRF-TOKEN');
    assert.ok(entry);
    assert.equal(entry.role, 'csrf-double-submit');
  });

  it('should read oauth-state role from x-cookie-role on scheme', () => {
    const spec = makeSpec({
      components: {
        securitySchemes: {
          oauthStateCookie: { type: 'apiKey', in: 'cookie', name: 'oauth_state', 'x-cookie-role': 'oauth-state' },
        },
      },
      paths: {},
    });

    const { cookieFlows } = detectCookieFlows(spec);
    const entry = cookieFlows.find((f) => f.name === 'oauth_state');
    assert.ok(entry);
    assert.equal(entry.role, 'oauth-state');
  });

  it('should emit COOKIE_SCHEME_ROLE_UNDECLARED when x-cookie-role missing on scheme', () => {
    const spec = makeSpec({
      components: {
        securitySchemes: {
          myCookie: { type: 'apiKey', in: 'cookie', name: 'my_cookie' },
        },
      },
      paths: {
        '/use': {
          get: makeOperation('useGet', {
            security: [{ myCookie: [] }],
          }),
        },
      },
    });

    const { cookieFlows, diagnostics } = detectCookieFlows(spec);
    const entry = cookieFlows.find((f) => f.name === 'my_cookie');
    assert.ok(entry);
    assert.equal(entry.role, null, 'role must be null when x-cookie-role is missing');
    const diag = diagnostics.find(
      (d) => d.code === 'COOKIE_SCHEME_ROLE_UNDECLARED' && d.details.name === 'my_cookie',
    );
    assert.ok(diag, 'should emit COOKIE_SCHEME_ROLE_UNDECLARED');
    assert.equal(diag.details.schemeName, 'myCookie');
  });
});

// ---------------------------------------------------------------------------
// P2: x-cookie-role/name on response header Set-Cookie
// ---------------------------------------------------------------------------

describe('P2 — response header x-cookie-role + x-cookie-name', () => {
  it('should detect issuer from response header declarations', () => {
    const spec = makeSpec({
      paths: {
        '/auth/login': {
          post: makeOperation('authLogin', {
            responses: {
              '200': {
                description: 'OK',
                headers: {
                  'Set-Cookie': setCookieHeader({
                    'x-cookie-role': 'refresh-token',
                    'x-cookie-name': 'refresh_token',
                    'x-cookie-attrs': {
                      httpOnly: true,
                      secure: true,
                      sameSite: 'Strict',
                      path: '/',
                      maxAge: 604800,
                    },
                  }),
                },
              },
            },
          }),
        },
      },
    });

    const { cookieFlows } = detectCookieFlows(spec);
    const entry = cookieFlows.find((f) => f.name === 'refresh_token');
    assert.ok(entry, 'should have refresh_token entry');
    assert.equal(entry.role, 'refresh-token');
    assert.equal(entry.issuers.length, 1);
    assert.equal(entry.issuers[0].operationId, 'authLogin');
    assert.deepEqual(entry.attrs, {
      httpOnly: true,
      secure: true,
      sameSite: 'Strict',
      path: '/',
      maxAge: 604800,
    });
  });

  it('should detect clearer when x-cookie-attrs.maxAge === 0', () => {
    const spec = makeSpec({
      paths: {
        '/auth/logout': {
          post: makeOperation('authLogout', {
            responses: {
              '200': {
                description: 'OK',
                headers: {
                  'Set-Cookie': setCookieHeader({
                    'x-cookie-role': 'refresh-token',
                    'x-cookie-name': 'refresh_token',
                    'x-cookie-attrs': { maxAge: 0 },
                  }),
                },
              },
            },
          }),
        },
      },
    });

    const { cookieFlows } = detectCookieFlows(spec);
    const entry = cookieFlows.find((f) => f.name === 'refresh_token');
    assert.ok(entry);
    assert.equal(entry.clearers.length, 1);
    assert.equal(entry.clearers[0].operationId, 'authLogout');
    // Clearer should NOT be in issuers
    assert.equal(entry.issuers.length, 0);
  });
});

// ---------------------------------------------------------------------------
// P3: x-cookie-roles operation extension (from @CookieRole decorator)
// ---------------------------------------------------------------------------

describe('P3 — x-cookie-roles operation extension', () => {
  it('should detect issuer from x-cookie-roles extension', () => {
    const spec = makeSpec({
      paths: {
        '/auth/login': {
          post: makeOperation('authLogin', {
            'x-cookie-roles': [{ name: 'session_id', role: 'session' }],
          }),
        },
      },
    });

    const { cookieFlows } = detectCookieFlows(spec);
    const entry = cookieFlows.find((f) => f.name === 'session_id');
    assert.ok(entry);
    assert.equal(entry.role, 'session');
    assert.equal(entry.issuers.length, 1);
    assert.equal(entry.issuers[0].operationId, 'authLogin');
  });
});

// ---------------------------------------------------------------------------
// C1: security ref consumer
// ---------------------------------------------------------------------------

describe('C1 — security ref consumer', () => {
  it('should detect consumer from security reference to cookie scheme', () => {
    const spec = makeSpec({
      components: {
        securitySchemes: {
          sessionCookie: { type: 'apiKey', in: 'cookie', name: 'sid' },
        },
      },
      paths: {
        '/login': {
          post: makeOperation('login', {
            'x-cookie-roles': [{ name: 'sid', role: 'session' }],
          }),
        },
        '/protected': {
          get: makeOperation('protected', {
            security: [{ sessionCookie: [] }],
          }),
        },
      },
    });

    const { cookieFlows } = detectCookieFlows(spec);
    const entry = cookieFlows.find((f) => f.name === 'sid');
    assert.ok(entry);
    assert.equal(entry.consumers.length, 1);
    assert.equal(entry.consumers[0].operationId, 'protected');
    assert.equal(entry.issuers.length, 1);
    assert.equal(entry.issuers[0].operationId, 'login');
  });
});

// ---------------------------------------------------------------------------
// C3: x-cookie-consumes (from @CookieConsumer decorator)
// ---------------------------------------------------------------------------

describe('C3 — x-cookie-consumes operation extension', () => {
  it('should detect consumer from x-cookie-consumes extension', () => {
    const spec = makeSpec({
      paths: {
        '/protected': {
          get: makeOperation('protectedGet', {
            'x-cookie-consumes': [{ name: 'auth_session' }],
          }),
        },
      },
    });

    const { cookieFlows } = detectCookieFlows(spec);
    const entry = cookieFlows.find((f) => f.name === 'auth_session');
    assert.ok(entry);
    assert.equal(entry.consumers.length, 1);
    assert.equal(entry.consumers[0].operationId, 'protectedGet');
  });
});

// ---------------------------------------------------------------------------
// C4: csrfDouble — consumer with headerEcho
// ---------------------------------------------------------------------------

describe('C4 — csrf double-submit consumer with headerEcho', () => {
  it('should detect headerEcho on consumer', () => {
    const spec = makeSpec({
      paths: {
        '/csrf-issue': {
          get: makeOperation('csrfIssue', {
            'x-cookie-roles': [{ name: 'xsrf', role: 'csrf-double-submit' }],
          }),
        },
        '/mutate': {
          post: makeOperation('mutatePost', {
            'x-cookie-consumes': [{ name: 'xsrf', headerEcho: 'X-XSRF-Token' }],
          }),
        },
      },
    });

    const { cookieFlows } = detectCookieFlows(spec);
    const entry = cookieFlows.find((f) => f.name === 'xsrf');
    assert.ok(entry);
    assert.equal(entry.role, 'csrf-double-submit');
    const consumer = entry.consumers.find((c) => c.operationId === 'mutatePost');
    assert.ok(consumer);
    assert.equal(consumer.headerEcho, 'X-XSRF-Token');
    // Should NOT fire COOKIE_CSRF_HEADER_NOT_DECLARED because headerEcho exists
    const csrfDiag = entry.diagnostics.find((d) => d.code === 'COOKIE_CSRF_HEADER_NOT_DECLARED');
    assert.equal(csrfDiag, undefined);
  });
});

// ---------------------------------------------------------------------------
// Rotator detection
// ---------------------------------------------------------------------------

describe('Rotator detection', () => {
  it('should detect rotator when operation both issues and consumes same cookie', () => {
    const spec = makeSpec({
      paths: {
        '/auth/login': {
          post: makeOperation('authLogin', {
            'x-cookie-roles': [{ name: 'rt', role: 'refresh-token' }],
          }),
        },
        '/auth/refresh': {
          post: makeOperation('authRefresh', {
            'x-cookie-roles': [{ name: 'rt', role: 'refresh-token' }],
            'x-cookie-consumes': [{ name: 'rt' }],
          }),
        },
      },
    });

    const { cookieFlows } = detectCookieFlows(spec);
    const entry = cookieFlows.find((f) => f.name === 'rt');
    assert.ok(entry);
    assert.equal(entry.rotators.length, 1);
    assert.equal(entry.rotators[0].operationId, 'authRefresh');
  });
});

// ---------------------------------------------------------------------------
// Attrs extraction
// ---------------------------------------------------------------------------

describe('Attrs extraction', () => {
  it('should extract full attrs from declaration', () => {
    const spec = makeSpec({
      paths: {
        '/set': {
          post: makeOperation('setCookie', {
            'x-cookie-roles': [{ name: 'strict_cookie', role: 'custom' }],
            responses: {
              '200': {
                description: 'OK',
                headers: {
                  'Set-Cookie': setCookieHeader({
                    'x-cookie-role': 'custom',
                    'x-cookie-name': 'strict_cookie',
                    'x-cookie-attrs': {
                      httpOnly: true,
                      secure: true,
                      sameSite: 'Strict',
                      path: '/api',
                      domain: '.example.com',
                      maxAge: 300,
                    },
                  }),
                },
              },
            },
          }),
        },
      },
    });

    const { cookieFlows } = detectCookieFlows(spec);
    const entry = cookieFlows.find((f) => f.name === 'strict_cookie');
    assert.ok(entry);
    assert.deepEqual(entry.attrs, {
      httpOnly: true,
      secure: true,
      sameSite: 'Strict',
      path: '/api',
      domain: '.example.com',
      maxAge: 300,
    });
  });
});

// ---------------------------------------------------------------------------
// DIAG: COOKIE_ROLE_AMBIGUOUS
// ---------------------------------------------------------------------------

describe('DIAG: COOKIE_ROLE_AMBIGUOUS', () => {
  it('should fire when same cookie name has two different roles', () => {
    const spec = makeSpec({
      paths: {
        '/a': {
          post: makeOperation('opA', {
            'x-cookie-roles': [{ name: 'ambig', role: 'refresh-token' }],
          }),
        },
        '/b': {
          post: makeOperation('opB', {
            'x-cookie-roles': [{ name: 'ambig', role: 'session' }],
          }),
        },
      },
    });

    const { cookieFlows, diagnostics } = detectCookieFlows(spec);
    const diag = diagnostics.find((d) => d.code === 'COOKIE_ROLE_AMBIGUOUS');
    assert.ok(diag, 'should emit COOKIE_ROLE_AMBIGUOUS');
    assert.ok(diag.details.roles.includes('refresh-token'));
    assert.ok(diag.details.roles.includes('session'));
  });
});

// ---------------------------------------------------------------------------
// DIAG: COOKIE_ISSUER_AMBIGUOUS
// ---------------------------------------------------------------------------

describe('DIAG: COOKIE_ISSUER_AMBIGUOUS', () => {
  it('should fire when same name+role has ≥2 pure issuers', () => {
    const spec = makeSpec({
      paths: {
        '/issuer-a': {
          post: makeOperation('issuerA', {
            'x-cookie-roles': [{ name: 'token', role: 'refresh-token' }],
          }),
        },
        '/issuer-b': {
          post: makeOperation('issuerB', {
            'x-cookie-roles': [{ name: 'token', role: 'refresh-token' }],
          }),
        },
      },
    });

    const { diagnostics } = detectCookieFlows(spec);
    const diag = diagnostics.find((d) => d.code === 'COOKIE_ISSUER_AMBIGUOUS');
    assert.ok(diag, 'should emit COOKIE_ISSUER_AMBIGUOUS');
    assert.deepEqual(diag.details.issuers, ['issuerA', 'issuerB']);
  });
});

// ---------------------------------------------------------------------------
// DIAG: COOKIE_NAME_MISSING_FOR_ROLE
// ---------------------------------------------------------------------------

describe('DIAG: COOKIE_NAME_MISSING_FOR_ROLE', () => {
  it('should fire when x-cookie-role present but x-cookie-name absent on response header', () => {
    const spec = makeSpec({
      paths: {
        '/nameless': {
          post: makeOperation('nameless', {
            responses: {
              '200': {
                description: 'OK',
                headers: {
                  'Set-Cookie': setCookieHeader({
                    'x-cookie-role': 'session',
                    // no x-cookie-name
                  }),
                },
              },
            },
          }),
        },
      },
    });

    const { diagnostics } = detectCookieFlows(spec);
    const diag = diagnostics.find((d) => d.code === 'COOKIE_NAME_MISSING_FOR_ROLE');
    assert.ok(diag, 'should emit COOKIE_NAME_MISSING_FOR_ROLE');
    assert.equal(diag.details.role, 'session');
    assert.equal(diag.details.operationId, 'nameless');
  });
});

// ---------------------------------------------------------------------------
// DIAG: COOKIE_ATTR_DECLARATION_INVALID
// ---------------------------------------------------------------------------

describe('DIAG: COOKIE_ATTR_DECLARATION_INVALID', () => {
  it('should fire when x-cookie-attrs has wrong types', () => {
    const spec = makeSpec({
      paths: {
        '/bad-attrs': {
          post: makeOperation('badAttrs', {
            'x-cookie-roles': [{ name: 'bad', role: 'custom' }],
            responses: {
              '200': {
                description: 'OK',
                headers: {
                  'Set-Cookie': setCookieHeader({
                    'x-cookie-role': 'custom',
                    'x-cookie-name': 'bad',
                    'x-cookie-attrs': {
                      httpOnly: 'yes',  // wrong: should be boolean
                    },
                  }),
                },
              },
            },
          }),
        },
      },
    });

    const { diagnostics } = detectCookieFlows(spec);
    const diag = diagnostics.find((d) => d.code === 'COOKIE_ATTR_DECLARATION_INVALID');
    assert.ok(diag, 'should emit COOKIE_ATTR_DECLARATION_INVALID');
    assert.ok(diag.details.errors.length > 0);
    assert.equal(diag.details.errors[0].field, 'httpOnly');
  });
});

// ---------------------------------------------------------------------------
// DIAG: COOKIE_CSRF_HEADER_NOT_DECLARED
// ---------------------------------------------------------------------------

describe('DIAG: COOKIE_CSRF_HEADER_NOT_DECLARED', () => {
  it('should fire when csrf-double-submit role but no headerEcho consumer', () => {
    const spec = makeSpec({
      paths: {
        '/csrf-issue': {
          get: makeOperation('csrfIssue', {
            'x-cookie-roles': [{ name: 'csrf_tok', role: 'csrf-double-submit' }],
          }),
        },
      },
    });

    const { diagnostics } = detectCookieFlows(spec);
    const diag = diagnostics.find((d) => d.code === 'COOKIE_CSRF_HEADER_NOT_DECLARED');
    assert.ok(diag, 'should emit COOKIE_CSRF_HEADER_NOT_DECLARED');
  });
});

// ---------------------------------------------------------------------------
// DIAG: COOKIE_HOST_PREFIX_INVALID
// ---------------------------------------------------------------------------

describe('DIAG: COOKIE_HOST_PREFIX_INVALID', () => {
  it('should fire for __Host- prefix without correct attrs', () => {
    const spec = makeSpec({
      paths: {
        '/host': {
          post: makeOperation('hostCookie', {
            'x-cookie-roles': [{ name: '__Host-session', role: 'session' }],
            responses: {
              '200': {
                description: 'OK',
                headers: {
                  'Set-Cookie': setCookieHeader({
                    'x-cookie-role': 'session',
                    'x-cookie-name': '__Host-session',
                    'x-cookie-attrs': {
                      httpOnly: true,
                      secure: false,  // violation: must be true
                      path: '/api',   // violation: must be /
                      domain: '.example.com', // violation: must not be set
                    },
                  }),
                },
              },
            },
          }),
        },
      },
    });

    const { diagnostics } = detectCookieFlows(spec);
    const diag = diagnostics.find((d) => d.code === 'COOKIE_HOST_PREFIX_INVALID');
    assert.ok(diag, 'should emit COOKIE_HOST_PREFIX_INVALID');
    assert.ok(diag.details.violations.length >= 3);
  });

  it('should NOT fire for __Host- prefix with correct attrs', () => {
    const spec = makeSpec({
      paths: {
        '/host': {
          post: makeOperation('hostCookie', {
            'x-cookie-roles': [{ name: '__Host-session', role: 'session' }],
            responses: {
              '200': {
                description: 'OK',
                headers: {
                  'Set-Cookie': setCookieHeader({
                    'x-cookie-role': 'session',
                    'x-cookie-name': '__Host-session',
                    'x-cookie-attrs': {
                      httpOnly: true,
                      secure: true,
                      path: '/',
                    },
                  }),
                },
              },
            },
          }),
        },
      },
    });

    const { diagnostics } = detectCookieFlows(spec);
    const diag = diagnostics.find((d) => d.code === 'COOKIE_HOST_PREFIX_INVALID');
    assert.equal(diag, undefined, 'should NOT emit COOKIE_HOST_PREFIX_INVALID');
  });
});

// ---------------------------------------------------------------------------
// DIAG: COOKIE_NAME_INVALID
// ---------------------------------------------------------------------------

describe('DIAG: COOKIE_NAME_INVALID', () => {
  it('should fire for cookie name with invalid characters', () => {
    const spec = makeSpec({
      paths: {
        '/invalid': {
          post: makeOperation('invalidName', {
            'x-cookie-roles': [{ name: 'bad name', role: 'custom' }],
          }),
        },
      },
    });

    const { diagnostics } = detectCookieFlows(spec);
    const diag = diagnostics.find((d) => d.code === 'COOKIE_NAME_INVALID');
    assert.ok(diag, 'should emit COOKIE_NAME_INVALID');
  });

  it('should NOT fire for valid cookie names', () => {
    const spec = makeSpec({
      paths: {
        '/valid': {
          post: makeOperation('validName', {
            'x-cookie-roles': [{ name: 'valid_cookie-name.123', role: 'custom' }],
          }),
        },
      },
    });

    const { diagnostics } = detectCookieFlows(spec);
    const diag = diagnostics.find((d) => d.code === 'COOKIE_NAME_INVALID');
    assert.equal(diag, undefined, 'should NOT emit COOKIE_NAME_INVALID');
  });
});

// ---------------------------------------------------------------------------
// DIAG: COOKIE_SAMESITE_NONE_WITHOUT_SECURE
// ---------------------------------------------------------------------------

describe('DIAG: COOKIE_SAMESITE_NONE_WITHOUT_SECURE', () => {
  it('should fire when sameSite=None without secure=true', () => {
    const spec = makeSpec({
      paths: {
        '/samesite': {
          post: makeOperation('samesiteCookie', {
            'x-cookie-roles': [{ name: 'cross', role: 'custom' }],
            responses: {
              '200': {
                description: 'OK',
                headers: {
                  'Set-Cookie': setCookieHeader({
                    'x-cookie-role': 'custom',
                    'x-cookie-name': 'cross',
                    'x-cookie-attrs': {
                      sameSite: 'None',
                      secure: false,
                    },
                  }),
                },
              },
            },
          }),
        },
      },
    });

    const { diagnostics } = detectCookieFlows(spec);
    const diag = diagnostics.find((d) => d.code === 'COOKIE_SAMESITE_NONE_WITHOUT_SECURE');
    assert.ok(diag, 'should emit COOKIE_SAMESITE_NONE_WITHOUT_SECURE');
  });

  it('should NOT fire when sameSite=None with secure=true', () => {
    const spec = makeSpec({
      paths: {
        '/samesite': {
          post: makeOperation('samesiteCookie', {
            'x-cookie-roles': [{ name: 'cross', role: 'custom' }],
            responses: {
              '200': {
                description: 'OK',
                headers: {
                  'Set-Cookie': setCookieHeader({
                    'x-cookie-role': 'custom',
                    'x-cookie-name': 'cross',
                    'x-cookie-attrs': {
                      sameSite: 'None',
                      secure: true,
                    },
                  }),
                },
              },
            },
          }),
        },
      },
    });

    const { diagnostics } = detectCookieFlows(spec);
    const diag = diagnostics.find((d) => d.code === 'COOKIE_SAMESITE_NONE_WITHOUT_SECURE');
    assert.equal(diag, undefined, 'should NOT emit COOKIE_SAMESITE_NONE_WITHOUT_SECURE');
  });
});

// ---------------------------------------------------------------------------
// DIAG: COOKIE_HAS_NO_CONSUMER
// ---------------------------------------------------------------------------

describe('DIAG: COOKIE_HAS_NO_CONSUMER', () => {
  it('should fire when issuer has no consumer', () => {
    const spec = makeSpec({
      paths: {
        '/issue': {
          post: makeOperation('issueCookie', {
            'x-cookie-roles': [{ name: 'orphan', role: 'refresh-token' }],
          }),
        },
      },
    });

    const { diagnostics } = detectCookieFlows(spec);
    const diag = diagnostics.find((d) => d.code === 'COOKIE_HAS_NO_CONSUMER');
    assert.ok(diag, 'should emit COOKIE_HAS_NO_CONSUMER');
    assert.equal(diag.level, 'warn');
  });
});

// ---------------------------------------------------------------------------
// DIAG: COOKIE_HAS_NO_ISSUER
// ---------------------------------------------------------------------------

describe('DIAG: COOKIE_HAS_NO_ISSUER', () => {
  it('should fire when consumer has no issuer', () => {
    const spec = makeSpec({
      paths: {
        '/consume': {
          get: makeOperation('consumeCookie', {
            'x-cookie-consumes': [{ name: 'ghost' }],
          }),
        },
      },
    });

    const { diagnostics } = detectCookieFlows(spec);
    const diag = diagnostics.find((d) => d.code === 'COOKIE_HAS_NO_ISSUER');
    assert.ok(diag, 'should emit COOKIE_HAS_NO_ISSUER');
    assert.equal(diag.level, 'error');
  });
});

// ---------------------------------------------------------------------------
// Empty / null spec handling
// ---------------------------------------------------------------------------

describe('Edge cases — empty or null input', () => {
  it('should return empty for null input', () => {
    const result = detectCookieFlows(null);
    assert.deepEqual(result, { cookieFlows: [], diagnostics: [] });
  });

  it('should return empty for spec with no paths', () => {
    const result = detectCookieFlows(makeSpec());
    assert.deepEqual(result, { cookieFlows: [], diagnostics: [] });
  });
});

// ---------------------------------------------------------------------------
// Deduplication — same operation should not appear twice in issuers/consumers
// ---------------------------------------------------------------------------

describe('Deduplication', () => {
  it('should not duplicate an issuer when both P2 and P3 declare the same operation', () => {
    const spec = makeSpec({
      paths: {
        '/login': {
          post: makeOperation('login', {
            'x-cookie-roles': [{ name: 'tok', role: 'session' }],
            responses: {
              '200': {
                description: 'OK',
                headers: {
                  'Set-Cookie': setCookieHeader({
                    'x-cookie-role': 'session',
                    'x-cookie-name': 'tok',
                  }),
                },
              },
            },
          }),
        },
      },
    });

    const { cookieFlows } = detectCookieFlows(spec);
    const entry = cookieFlows.find((f) => f.name === 'tok');
    assert.ok(entry);
    // Should have exactly 1 issuer, not 2
    assert.equal(entry.issuers.length, 1);
  });
});
