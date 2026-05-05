'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  detectOAuth,
  scanSecuritySchemes,
  scanPackageDeps,
  scanEndpointPaths,
  scanStrategies,
  resolveOAuthRoles,
  inferProvider,
} = require('../oauth');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oauth-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('scanSecuritySchemes', () => {
  it('should detect oauth2 security scheme with authorization_code flow', () => {
    const matrix = {
      securitySchemes: {
        oauth2: {
          type: 'oauth2',
          flows: {
            authorizationCode: {
              authorizationUrl: 'https://example.com/authorize',
              tokenUrl: 'https://example.com/token',
              scopes: { read: 'Read access', write: 'Write access' },
            },
          },
        },
      },
    };
    const result = scanSecuritySchemes(matrix);
    assert.notEqual(result, null);
    assert.equal(result.schemeName, 'oauth2');
    assert.deepEqual(result.flowTypes, ['authorizationCode']);
    assert.equal(result.authorizeUrl, 'https://example.com/authorize');
    assert.equal(result.tokenUrl, 'https://example.com/token');
    assert.deepEqual(result.scopes, ['read', 'write']);
  });

  it('should detect oauth2 with client_credentials flow', () => {
    const matrix = {
      securitySchemes: {
        cc: {
          type: 'oauth2',
          flows: {
            clientCredentials: {
              tokenUrl: 'https://example.com/token',
              scopes: {},
            },
          },
        },
      },
    };
    const result = scanSecuritySchemes(matrix);
    assert.notEqual(result, null);
    assert.deepEqual(result.flowTypes, ['clientCredentials']);
    assert.equal(result.tokenUrl, 'https://example.com/token');
    assert.equal(result.authorizeUrl, null);
  });

  it('should skip non-oauth2 schemes', () => {
    const matrix = {
      securitySchemes: {
        bearer: { type: 'http', scheme: 'bearer' },
        apiKey: { type: 'apiKey', in: 'header', name: 'X-API-KEY' },
      },
    };
    const result = scanSecuritySchemes(matrix);
    assert.equal(result, null);
  });

  it('should skip oauth2 with empty flows', () => {
    const matrix = {
      securitySchemes: {
        oauth2: { type: 'oauth2', flows: {} },
      },
    };
    const result = scanSecuritySchemes(matrix);
    assert.equal(result, null);
  });

  it('should return null when no securitySchemes', () => {
    assert.equal(scanSecuritySchemes({}), null);
    assert.equal(scanSecuritySchemes(null), null);
  });
});

describe('scanPackageDeps', () => {
  it('should detect passport-google-oauth20', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ dependencies: { 'passport-google-oauth20': '2.0.0' } })
    );
    const result = scanPackageDeps(tmpDir);
    assert.notEqual(result, null);
    assert.equal(result.provider, 'google');
    assert.match(result.source, /package\.json:passport-google-oauth20/);
  });

  it('should detect @nestjs/passport', () => {
    fs.mkdirSync(path.join(tmpDir, 'apps', 'api'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'apps/api/package.json'),
      JSON.stringify({ dependencies: { '@nestjs/passport': '10.0.0' } })
    );
    const result = scanPackageDeps(tmpDir);
    assert.notEqual(result, null);
    assert.equal(result.provider, 'passport');
  });

  it('should detect openid-client', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ dependencies: { 'openid-client': '5.0.0' } })
    );
    const result = scanPackageDeps(tmpDir);
    assert.notEqual(result, null);
    assert.equal(result.provider, 'openid-connect');
  });

  it('should return null when no OAuth packages found', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ dependencies: { express: '4.0.0' } })
    );
    assert.equal(scanPackageDeps(tmpDir), null);
  });

  it('should return null when no package.json exists', () => {
    assert.equal(scanPackageDeps(tmpDir), null);
  });
});

describe('scanStrategies', () => {
  it('should detect GoogleStrategy in source', () => {
    fs.mkdirSync(path.join(tmpDir, 'apps', 'api', 'src', 'auth'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'apps/api/src/auth/google.strategy.ts'),
      'export class GoogleStrategy extends PassportStrategy(Strategy) {}'
    );
    const result = scanStrategies(tmpDir);
    assert.notEqual(result, null);
    assert.equal(result.provider, 'google');
    assert.match(result.source, /strategy:/);
  });

  it('should detect OAuth2Strategy in source', () => {
    fs.mkdirSync(path.join(tmpDir, 'apps', 'api', 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'apps/api/src/oauth2.strategy.ts'),
      'export class OAuth2Strategy {}'
    );
    const result = scanStrategies(tmpDir);
    assert.notEqual(result, null);
    assert.equal(result.provider, 'generic-oauth2');
  });

  it('should return null when no strategy files', () => {
    fs.mkdirSync(path.join(tmpDir, 'apps', 'api', 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'apps/api/src/user.service.ts'),
      'export class UserService {}'
    );
    assert.equal(scanStrategies(tmpDir), null);
  });

  it('should return null when no source dirs exist', () => {
    assert.equal(scanStrategies(tmpDir), null);
  });

  it('should skip test and spec files', () => {
    fs.mkdirSync(path.join(tmpDir, 'apps', 'api', 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'apps/api/src/google.strategy.test.ts'),
      'export class GoogleStrategy {}'
    );
    assert.equal(scanStrategies(tmpDir), null);
  });
});

describe('inferProvider', () => {
  it('should infer google', () => assert.equal(inferProvider('GoogleStrategy'), 'google'));
  it('should infer github', () => assert.equal(inferProvider('GithubStrategy'), 'github'));
  it('should infer facebook', () => assert.equal(inferProvider('FacebookStrategy'), 'facebook'));
  it('should infer microsoft', () => assert.equal(inferProvider('MicrosoftStrategy'), 'microsoft'));
  it('should infer openid-connect', () => assert.equal(inferProvider('OidcStrategy'), 'openid-connect'));
  it('should default to generic-oauth2', () => assert.equal(inferProvider('OAuth2Strategy'), 'generic-oauth2'));
});

// ---------------------------------------------------------------------------
// resolveOAuthRoles — declaration-driven role detection (no path regex)
// ---------------------------------------------------------------------------

describe('resolveOAuthRoles', () => {
  describe('Priority 1: securitySchemes flow URLs', () => {
    it('should resolve authorize + token roles from securitySchemes URLs', () => {
      const matrix = {
        securitySchemes: {
          oauth2: {
            type: 'oauth2',
            flows: {
              authorizationCode: {
                authorizationUrl: 'https://example.com/oauth/authorize',
                tokenUrl: 'https://example.com/oauth/token',
                scopes: {},
              },
            },
          },
        },
        apiEndpoints: [
          { method: 'GET', path: '/oauth/authorize' },
          { method: 'POST', path: '/oauth/token' },
          { method: 'GET', path: '/oauth/callback' },
        ],
      };
      const diag = [];
      const roles = resolveOAuthRoles(matrix, diag);

      assert.notEqual(roles.authorize, null);
      assert.equal(roles.authorize.path, '/oauth/authorize');
      assert.match(roles.authorize.source, /securityScheme-flow/);

      assert.notEqual(roles.token, null);
      assert.equal(roles.token.path, '/oauth/token');
      assert.match(roles.token.source, /securityScheme-flow/);

      // callback is NOT in securitySchemes and has no operationId/extension —
      // path regex is no longer consulted, so callback stays null. No DIAG
      // (UNDETECTED is emitted by detectOAuth, not resolveOAuthRoles).
      assert.equal(roles.callback, null);
      assert.equal(diag.length, 0);
    });

    it('should resolve with relative securitySchemes URLs', () => {
      const matrix = {
        securitySchemes: {
          myOauth: {
            type: 'oauth2',
            flows: {
              authorizationCode: {
                authorizationUrl: '/auth/authorize',
                tokenUrl: '/auth/token',
                scopes: {},
              },
            },
          },
        },
        apiEndpoints: [
          { method: 'GET', path: '/auth/authorize' },
          { method: 'POST', path: '/auth/token' },
        ],
      };
      const diag = [];
      const roles = resolveOAuthRoles(matrix, diag);
      assert.notEqual(roles.authorize, null);
      assert.equal(roles.authorize.path, '/auth/authorize');
      assert.notEqual(roles.token, null);
      assert.equal(roles.token.path, '/auth/token');
      assert.equal(diag.length, 0);
    });
  });

  describe('Priority 2: operationId-driven assignment', () => {
    it('should resolve all three roles from operationId', () => {
      const matrix = {
        apiEndpoints: [
          { method: 'GET', path: '/custom/auth-start', operationId: 'oauthAuthorize' },
          { method: 'POST', path: '/custom/get-token', operationId: 'oauthToken' },
          { method: 'GET', path: '/custom/return', operationId: 'oauthCallback' },
        ],
      };
      const diag = [];
      const roles = resolveOAuthRoles(matrix, diag);

      assert.notEqual(roles.authorize, null);
      assert.equal(roles.authorize.path, '/custom/auth-start');
      assert.equal(roles.authorize.source, 'operationId');

      assert.notEqual(roles.token, null);
      assert.equal(roles.token.path, '/custom/get-token');
      assert.equal(roles.token.source, 'operationId');

      assert.notEqual(roles.callback, null);
      assert.equal(roles.callback.path, '/custom/return');
      assert.equal(roles.callback.source, 'operationId');

      // No DIAG when resolved via operationId
      assert.equal(diag.length, 0);
    });

    it('should resolve partial roles via operationId', () => {
      const matrix = {
        apiEndpoints: [
          { method: 'POST', path: '/token', operationId: 'oauthToken' },
          { method: 'GET', path: '/other' },
        ],
      };
      const diag = [];
      const roles = resolveOAuthRoles(matrix, diag);
      assert.notEqual(roles.token, null);
      assert.equal(roles.token.source, 'operationId');
      assert.equal(roles.authorize, null);
      assert.equal(roles.callback, null);
      assert.equal(diag.length, 0);
    });
  });

  describe('Priority 3: x-oauth-role extension', () => {
    it('should resolve roles from x-oauth-role extension', () => {
      const matrix = {
        apiEndpoints: [
          { method: 'GET', path: '/my/auth', 'x-oauth-role': 'authorize' },
          { method: 'POST', path: '/my/tok', 'x-oauth-role': 'token' },
          { method: 'POST', path: '/my/cb', 'x-oauth-role': 'callback' },
        ],
      };
      const diag = [];
      const roles = resolveOAuthRoles(matrix, diag);

      assert.notEqual(roles.authorize, null);
      assert.equal(roles.authorize.path, '/my/auth');
      assert.equal(roles.authorize.source, 'extension');

      assert.notEqual(roles.token, null);
      assert.equal(roles.token.path, '/my/tok');
      assert.equal(roles.token.source, 'extension');

      assert.notEqual(roles.callback, null);
      assert.equal(roles.callback.path, '/my/cb');
      assert.equal(roles.callback.source, 'extension');

      assert.equal(diag.length, 0);
    });
  });

  describe('UNDETECTED — path lure must NOT be detected', () => {
    it('should leave roles null for path-only matches without declarations', () => {
      // Path-lure: /oauth/token, /oauth/authorize, /oauth/callback present
      // but no operationId, no extension, no securityScheme. Path regex is
      // gone, so nothing should resolve.
      const matrix = {
        apiEndpoints: [
          { method: 'GET', path: '/oauth/authorize' },
          { method: 'POST', path: '/oauth/token' },
          { method: 'GET', path: '/oauth/callback' },
        ],
      };
      const diag = [];
      const roles = resolveOAuthRoles(matrix, diag);
      assert.equal(roles.authorize, null);
      assert.equal(roles.token, null);
      assert.equal(roles.callback, null);
      // resolveOAuthRoles does not emit UNDETECTED — only AMBIGUOUS. The
      // UNDETECTED DIAG is emitted by detectOAuth when other OAuth presence
      // is signaled (scheme/package/strategy).
      assert.equal(diag.length, 0);
    });

    it('should leave roles null for /auth/* path lure', () => {
      const matrix = {
        apiEndpoints: [
          { method: 'GET', path: '/auth/authorize' },
          { method: 'POST', path: '/auth/token' },
        ],
      };
      const diag = [];
      const roles = resolveOAuthRoles(matrix, diag);
      assert.equal(roles.authorize, null);
      assert.equal(roles.token, null);
      assert.equal(diag.length, 0);
    });

    it('should leave role null for trailing-segment path lure', () => {
      const matrix = {
        apiEndpoints: [
          { method: 'GET', path: '/api/v1/authorize' },
          { method: 'POST', path: '/api/v1/token' },
          { method: 'POST', path: '/api/v1/callback' },
        ],
      };
      const diag = [];
      const roles = resolveOAuthRoles(matrix, diag);
      assert.equal(roles.authorize, null);
      assert.equal(roles.token, null);
      assert.equal(roles.callback, null);
      assert.equal(diag.length, 0);
    });
  });

  describe('AMBIGUOUS — multiple endpoints declare same role', () => {
    it('should emit OAUTH_ROLE_AMBIGUOUS when two endpoints share operationId', () => {
      const matrix = {
        apiEndpoints: [
          { method: 'POST', path: '/oauth/token', operationId: 'oauthToken' },
          { method: 'POST', path: '/oauth2/token', operationId: 'oauthToken' },
        ],
      };
      const diag = [];
      const roles = resolveOAuthRoles(matrix, diag);
      assert.equal(roles.token, null);
      assert.equal(diag.length, 1);
      assert.equal(diag[0].code, 'OAUTH_ROLE_AMBIGUOUS');
      assert.equal(diag[0].role, 'token');
      assert.equal(diag[0].level, 'warn');
      assert.equal(diag[0].candidates.length, 2);
    });

    it('should emit OAUTH_ROLE_AMBIGUOUS when extension and operationId point at different endpoints', () => {
      const matrix = {
        apiEndpoints: [
          { method: 'POST', path: '/a/token', operationId: 'oauthToken' },
          { method: 'POST', path: '/b/token', 'x-oauth-role': 'token' },
        ],
      };
      const diag = [];
      const roles = resolveOAuthRoles(matrix, diag);
      assert.equal(roles.token, null);
      assert.equal(diag.length, 1);
      assert.equal(diag[0].code, 'OAUTH_ROLE_AMBIGUOUS');
      assert.equal(diag[0].role, 'token');
    });

    it('should NOT emit AMBIGUOUS when multiple signals point at the SAME endpoint', () => {
      const matrix = {
        apiEndpoints: [
          { method: 'POST', path: '/oauth/token', operationId: 'oauthToken', 'x-oauth-role': 'token' },
        ],
      };
      const diag = [];
      const roles = resolveOAuthRoles(matrix, diag);
      assert.notEqual(roles.token, null);
      assert.equal(roles.token.path, '/oauth/token');
      // Higher-priority signal label wins — operationId beats extension.
      assert.equal(roles.token.source, 'operationId');
      assert.equal(diag.length, 0);
    });
  });

  describe('nothing declared', () => {
    it('should return all nulls when nothing matches', () => {
      const matrix = {
        apiEndpoints: [
          { method: 'GET', path: '/api/v1/users' },
          { method: 'POST', path: '/api/v1/products' },
        ],
      };
      const diag = [];
      const roles = resolveOAuthRoles(matrix, diag);
      assert.equal(roles.authorize, null);
      assert.equal(roles.token, null);
      assert.equal(roles.callback, null);
      assert.equal(diag.length, 0);
    });

    it('should return all nulls for null matrix', () => {
      const roles = resolveOAuthRoles(null);
      assert.equal(roles.authorize, null);
      assert.equal(roles.token, null);
      assert.equal(roles.callback, null);
    });

    it('should return all nulls for empty endpoints', () => {
      const roles = resolveOAuthRoles({ apiEndpoints: [] });
      assert.equal(roles.authorize, null);
      assert.equal(roles.token, null);
      assert.equal(roles.callback, null);
    });
  });

  describe('priority cascade (signal-label preference)', () => {
    it('should prefer securityScheme-flow source label when scheme + operationId match the same endpoint', () => {
      const matrix = {
        securitySchemes: {
          oauth2: {
            type: 'oauth2',
            flows: {
              authorizationCode: {
                authorizationUrl: 'https://example.com/oauth/authorize',
                tokenUrl: 'https://example.com/oauth/token',
                scopes: {},
              },
            },
          },
        },
        apiEndpoints: [
          { method: 'GET', path: '/oauth/authorize', operationId: 'oauthAuthorize' },
          { method: 'POST', path: '/oauth/token', operationId: 'oauthToken' },
        ],
      };
      const diag = [];
      const roles = resolveOAuthRoles(matrix, diag);
      assert.match(roles.authorize.source, /securityScheme-flow/);
      assert.match(roles.token.source, /securityScheme-flow/);
      assert.equal(diag.length, 0);
    });

    it('should prefer operationId over extension when both match the same endpoint', () => {
      const matrix = {
        apiEndpoints: [
          { method: 'POST', path: '/tok', operationId: 'oauthToken', 'x-oauth-role': 'token' },
        ],
      };
      const diag = [];
      const roles = resolveOAuthRoles(matrix, diag);
      assert.equal(roles.token.source, 'operationId');
      assert.equal(diag.length, 0);
    });
  });
});

// ---------------------------------------------------------------------------
// scanEndpointPaths — wrapper over resolveOAuthRoles (declared signals only)
// ---------------------------------------------------------------------------

describe('scanEndpointPaths', () => {
  it('should resolve authorize endpoint via operationId', () => {
    const matrix = {
      apiEndpoints: [
        { method: 'GET', path: '/oauth/authorize', operationId: 'oauthAuthorize' },
      ],
    };
    const result = scanEndpointPaths(matrix);
    assert.notEqual(result, null);
    assert.notEqual(result.authorizeEndpoint, null);
    assert.equal(result.authorizeEndpoint.path, '/oauth/authorize');
  });

  it('should resolve token endpoint via operationId', () => {
    const matrix = {
      apiEndpoints: [
        { method: 'POST', path: '/oauth/token', operationId: 'oauthToken' },
      ],
    };
    const result = scanEndpointPaths(matrix);
    assert.notEqual(result, null);
    assert.notEqual(result.tokenEndpoint, null);
    assert.equal(result.tokenEndpoint.path, '/oauth/token');
  });

  it('should resolve callback endpoint via x-oauth-role extension', () => {
    const matrix = {
      apiEndpoints: [
        { method: 'GET', path: '/auth/callback', 'x-oauth-role': 'callback' },
      ],
    };
    const result = scanEndpointPaths(matrix);
    assert.notEqual(result, null);
    assert.notEqual(result.callbackEndpoint, null);
  });

  it('should resolve all three OAuth endpoints via operationId', () => {
    const matrix = {
      apiEndpoints: [
        { method: 'GET', path: '/oauth/authorize', operationId: 'oauthAuthorize' },
        { method: 'POST', path: '/oauth/token', operationId: 'oauthToken' },
        { method: 'GET', path: '/oauth/callback', operationId: 'oauthCallback' },
      ],
    };
    const result = scanEndpointPaths(matrix);
    assert.notEqual(result, null);
    assert.notEqual(result.authorizeEndpoint, null);
    assert.notEqual(result.tokenEndpoint, null);
    assert.notEqual(result.callbackEndpoint, null);
  });

  it('should return null when path lure has no declaration', () => {
    // /oauth/authorize present but no operationId/extension/scheme — must
    // NOT be detected. Path regex is gone.
    const matrix = {
      apiEndpoints: [
        { method: 'GET', path: '/oauth/authorize' },
      ],
    };
    assert.equal(scanEndpointPaths(matrix), null);
  });

  it('should return null when no matching endpoints', () => {
    const matrix = {
      apiEndpoints: [
        { method: 'GET', path: '/api/v1/users' },
      ],
    };
    assert.equal(scanEndpointPaths(matrix), null);
  });

  it('should return null for empty matrix', () => {
    assert.equal(scanEndpointPaths({}), null);
    assert.equal(scanEndpointPaths(null), null);
  });

  it('should NOT emit DIAG for path-lure-only endpoints (path regex retired)', () => {
    const matrix = {
      apiEndpoints: [
        { method: 'GET', path: '/oauth/authorize' },
        { method: 'POST', path: '/oauth/token' },
      ],
    };
    const diag = [];
    const result = scanEndpointPaths(matrix, diag);
    assert.equal(result, null);
    assert.equal(diag.length, 0);
  });

  it('should NOT emit DIAG when resolved via operationId', () => {
    const matrix = {
      apiEndpoints: [
        { method: 'GET', path: '/custom/auth', operationId: 'oauthAuthorize' },
        { method: 'POST', path: '/custom/tok', operationId: 'oauthToken' },
      ],
    };
    const diag = [];
    const result = scanEndpointPaths(matrix, diag);
    assert.notEqual(result, null);
    assert.equal(diag.length, 0);
  });

  it('should use declaration source in result', () => {
    const matrix = {
      apiEndpoints: [
        { method: 'POST', path: '/my/token', operationId: 'oauthToken' },
      ],
    };
    const result = scanEndpointPaths(matrix);
    assert.notEqual(result, null);
    assert.equal(result.source, 'operationId');
  });

  it('should emit OAUTH_ROLE_AMBIGUOUS when two endpoints share operationId', () => {
    const matrix = {
      apiEndpoints: [
        { method: 'POST', path: '/a/token', operationId: 'oauthToken' },
        { method: 'POST', path: '/b/token', operationId: 'oauthToken' },
      ],
    };
    const diag = [];
    const result = scanEndpointPaths(matrix, diag);
    assert.equal(result, null);
    assert.equal(diag.length, 1);
    assert.equal(diag[0].code, 'OAUTH_ROLE_AMBIGUOUS');
  });
});

// ---------------------------------------------------------------------------
// detectOAuth (integration)
// ---------------------------------------------------------------------------

describe('detectOAuth', () => {
  it('should return detected: false when nothing found', () => {
    const result = detectOAuth(tmpDir);
    assert.equal(result.detected, false);
    assert.equal(result.flows, null);
    assert.equal(result.provider, null);
    assert.equal(result.authorizeUrl, null);
    assert.equal(result.tokenUrl, null);
    assert.equal(result.callbackUrl, null);
    assert.equal(result.source, null);
    assert.deepEqual(result.roles, { authorize: null, token: null, callback: null });
  });

  it('should detect via OpenAPI security schemes', () => {
    const matrix = {
      securitySchemes: {
        oauth2: {
          type: 'oauth2',
          flows: {
            authorizationCode: {
              authorizationUrl: 'https://example.com/auth',
              tokenUrl: 'https://example.com/token',
              scopes: {},
            },
          },
        },
      },
      apiEndpoints: [],
    };
    const result = detectOAuth(tmpDir, matrix);
    assert.equal(result.detected, true);
    assert.deepEqual(result.flows, ['authorizationCode']);
    assert.equal(result.authorizeUrl, 'https://example.com/auth');
    assert.equal(result.tokenUrl, 'https://example.com/token');
  });

  it('should detect via package deps', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ dependencies: { 'passport-github2': '0.1.0' } })
    );
    const result = detectOAuth(tmpDir);
    assert.equal(result.detected, true);
    assert.equal(result.provider, 'github');
  });

  it('should NOT detect roles via path-lure (no declaration) and emit UNDETECTED DIAGs when scheme is present', () => {
    const matrix = {
      // Empty oauth2 flows so scheme-presence is signaled but no URLs match.
      securitySchemes: {
        oauth2: {
          type: 'oauth2',
          flows: {
            authorizationCode: {
              authorizationUrl: 'https://elsewhere.example/x',
              tokenUrl: 'https://elsewhere.example/y',
              scopes: {},
            },
          },
        },
      },
      apiEndpoints: [
        { method: 'GET', path: '/oauth/authorize' },
        { method: 'POST', path: '/oauth/token' },
        { method: 'GET', path: '/oauth/callback' },
      ],
    };
    const diag = [];
    const result = detectOAuth(tmpDir, matrix, diag);
    assert.equal(result.detected, true); // scheme-presence
    assert.equal(result.roles.authorize, null);
    assert.equal(result.roles.token, null);
    assert.equal(result.roles.callback, null);
    // 3 UNDETECTED DIAGs — one per role
    const undetected = diag.filter((d) => d.code === 'OAUTH_ROLE_UNDETECTED');
    assert.equal(undetected.length, 3);
    const undetectedRoles = undetected.map((d) => d.role).sort();
    assert.deepEqual(undetectedRoles, ['authorize', 'callback', 'token']);
  });

  it('should detect via operationId without DIAG', () => {
    const matrix = {
      apiEndpoints: [
        { method: 'GET', path: '/custom/a', operationId: 'oauthAuthorize' },
        { method: 'POST', path: '/custom/t', operationId: 'oauthToken' },
        { method: 'GET', path: '/custom/c', operationId: 'oauthCallback' },
      ],
    };
    const diag = [];
    const result = detectOAuth(tmpDir, matrix, diag);
    assert.equal(result.detected, true);
    assert.equal(result.roles.authorize.source, 'operationId');
    assert.equal(result.roles.token.source, 'operationId');
    assert.equal(result.roles.callback.source, 'operationId');
    assert.equal(diag.length, 0);
  });

  it('should merge scheme + endpoint results', () => {
    const matrix = {
      securitySchemes: {
        oauth2: {
          type: 'oauth2',
          flows: {
            authorizationCode: {
              authorizationUrl: 'https://ext.example.com/auth',
              tokenUrl: 'https://ext.example.com/token',
              scopes: {},
            },
          },
        },
      },
      apiEndpoints: [
        { method: 'GET', path: '/oauth/callback', operationId: 'oauthCallback' },
      ],
    };
    const result = detectOAuth(tmpDir, matrix);
    assert.equal(result.detected, true);
    assert.equal(result.authorizeUrl, 'https://ext.example.com/auth');
    assert.equal(result.callbackUrl, '/oauth/callback');
  });

  it('should skip matrix scans when no matrix provided', () => {
    const result = detectOAuth(tmpDir);
    assert.equal(result.detected, false);
  });

  it('should include roles in result with all priorities', () => {
    const matrix = {
      securitySchemes: {
        oauth2: {
          type: 'oauth2',
          flows: {
            authorizationCode: {
              authorizationUrl: 'https://example.com/oauth/authorize',
              tokenUrl: 'https://example.com/oauth/token',
              scopes: {},
            },
          },
        },
      },
      apiEndpoints: [
        { method: 'GET', path: '/oauth/authorize' },
        { method: 'POST', path: '/oauth/token' },
        { method: 'GET', path: '/oauth/callback', operationId: 'oauthCallback' },
      ],
    };
    const diag = [];
    const result = detectOAuth(tmpDir, matrix, diag);
    assert.equal(result.detected, true);
    assert.notEqual(result.roles.authorize, null);
    assert.match(result.roles.authorize.source, /securityScheme-flow/);
    assert.notEqual(result.roles.token, null);
    assert.match(result.roles.token.source, /securityScheme-flow/);
    assert.notEqual(result.roles.callback, null);
    assert.equal(result.roles.callback.source, 'operationId');
    assert.equal(diag.length, 0);
  });

  it('should emit AMBIGUOUS DIAG when two endpoints declare the same role', () => {
    const matrix = {
      apiEndpoints: [
        { method: 'POST', path: '/a/token', operationId: 'oauthToken' },
        { method: 'POST', path: '/b/token', operationId: 'oauthToken' },
      ],
    };
    const diag = [];
    const result = detectOAuth(tmpDir, matrix, diag);
    assert.equal(result.detected, true);
    assert.equal(result.roles.token, null);
    const ambiguous = diag.filter((d) => d.code === 'OAUTH_ROLE_AMBIGUOUS');
    assert.equal(ambiguous.length, 1);
    assert.equal(ambiguous[0].role, 'token');
  });
});
