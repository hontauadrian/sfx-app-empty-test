'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { detectCookieFlows } = require('../../probes/detectors/cookie-flows');

// Load the live OpenAPI spec from W1's committed dump.
// Walk up from __tests__/cookie-flows/ to the worktree root, then into apps/api/.
// __dirname is .overstory/claude-profiles/builder/hooks/__tests__/cookie-flows/
// Worktree root is 6 levels up.
const OPENAPI_PATH = path.resolve(__dirname, '../../../../../../apps/api/.openapi.json');

let spec;
try {
  spec = JSON.parse(fs.readFileSync(OPENAPI_PATH, 'utf8'));
} catch {
  // If the static dump is missing, skip all tests
  spec = null;
}

const skipReason = spec ? undefined : 'apps/api/.openapi.json not found';

// ---------------------------------------------------------------------------
// Run the detector once on the full spec
// ---------------------------------------------------------------------------

const result = spec ? detectCookieFlows(spec) : { cookieFlows: [], diagnostics: [] };
const { cookieFlows, diagnostics } = result;

function findFlow(name) {
  return cookieFlows.find((f) => f.name === name);
}

function findDiag(code) {
  return diagnostics.find((d) => d.code === code);
}

// ---------------------------------------------------------------------------
// Role coverage — each expected role should produce an entry
// ---------------------------------------------------------------------------

describe('Live OpenAPI fixture — role coverage', { skip: skipReason }, () => {
  const expectedRoles = [
    { name: 'refresh_token', role: 'refresh-token' },
    { name: 'pr_session', role: 'session' },
    { name: 'pr_xsrf', role: 'csrf-double-submit' },
    { name: 'pr_oauth_state', role: 'oauth-state' },
    { name: 'pr_tenant', role: 'tenant-scope' },
    { name: 'pr_locale', role: 'locale' },
    { name: 'pr_theme', role: 'theme' },
    { name: 'pr_attrs_strict', role: 'custom' },
    { name: 'pr_attrs_drift', role: 'custom' },
  ];

  for (const { name, role } of expectedRoles) {
    it(`should detect ${name} with role=${role}`, () => {
      const flow = findFlow(name);
      assert.ok(flow, `missing cookieFlow for ${name}`);
      assert.equal(flow.role, role, `expected role=${role} for ${name}, got ${flow.role}`);
    });
  }
});

// ---------------------------------------------------------------------------
// Issuer/consumer/rotator/clearer assertions
// ---------------------------------------------------------------------------

describe('Live OpenAPI fixture — issuer/consumer/rotator/clearer', { skip: skipReason }, () => {
  it('refresh_token has issuers: cookieRefreshIssue + cookieRefreshRotate', () => {
    const flow = findFlow('refresh_token');
    assert.ok(flow);
    const issuerIds = flow.issuers.map((i) => i.operationId);
    assert.ok(issuerIds.includes('cookieRefreshIssue'), 'missing cookieRefreshIssue issuer');
    assert.ok(issuerIds.includes('cookieRefreshRotate'), 'missing cookieRefreshRotate issuer');
  });

  it('refresh_token has consumers: cookieRefreshRotate + cookieRefreshClear', () => {
    const flow = findFlow('refresh_token');
    assert.ok(flow);
    const consumerIds = flow.consumers.map((c) => c.operationId);
    assert.ok(consumerIds.includes('cookieRefreshRotate'), 'missing cookieRefreshRotate consumer');
    assert.ok(consumerIds.includes('cookieRefreshClear'), 'missing cookieRefreshClear consumer');
  });

  it('refresh_token has rotator cookieRefreshRotate and clearer cookieRefreshClear', () => {
    const flow = findFlow('refresh_token');
    assert.ok(flow);
    // cookieRefreshRotate both issues and consumes refresh_token → rotator.
    assert.ok(flow.rotators.length >= 1, 'should have at least 1 rotator');
    assert.ok(
      flow.rotators.some((r) => r.operationId === 'cookieRefreshRotate'),
      'cookieRefreshRotate should be a rotator',
    );
    // cookieRefreshClear declares x-cookie-attrs: { maxAge: 0 } → clearer.
    assert.ok(flow.clearers.length >= 1, 'should have at least 1 clearer');
    assert.ok(
      flow.clearers.some((c) => c.operationId === 'cookieRefreshClear'),
      'cookieRefreshClear should be a clearer',
    );
  });

  it('pr_session has clearer: cookieSessionLogout', () => {
    const flow = findFlow('pr_session');
    assert.ok(flow);
    // cookieSessionLogout declares x-cookie-attrs: { maxAge: 0 } → clearer.
    assert.ok(flow.clearers.length >= 1, 'should have at least 1 clearer');
    assert.ok(
      flow.clearers.some((c) => c.operationId === 'cookieSessionLogout'),
      'cookieSessionLogout should be a clearer',
    );
    // Also a consumer via @CookieConsumer.
    const consumerIds = flow.consumers.map((c) => c.operationId);
    assert.ok(consumerIds.includes('cookieSessionLogout'), 'missing cookieSessionLogout consumer');
  });

  it('pr_xsrf csrf-issue is issuer, csrf-mutate is consumer with headerEcho', () => {
    const flow = findFlow('pr_xsrf');
    assert.ok(flow);
    assert.ok(flow.issuers.some((i) => i.operationId === 'cookieCsrfIssue'));
    const consumer = flow.consumers.find((c) => c.operationId === 'cookieCsrfMutate');
    assert.ok(consumer, 'missing cookieCsrfMutate consumer');
    assert.equal(consumer.headerEcho, 'X-Probe-CSRF-Token');
  });

  it('pr_oauth_state has issuer: cookieOAuthStateAuthorize, consumer: cookieOAuthStateCallback', () => {
    const flow = findFlow('pr_oauth_state');
    assert.ok(flow);
    assert.ok(flow.issuers.some((i) => i.operationId === 'cookieOAuthStateAuthorize'));
    assert.ok(flow.consumers.some((c) => c.operationId === 'cookieOAuthStateCallback'));
  });

  it('pr_tenant has issuer: cookieTenantSet, consumer: cookieTenantScoped', () => {
    const flow = findFlow('pr_tenant');
    assert.ok(flow);
    assert.ok(flow.issuers.some((i) => i.operationId === 'cookieTenantSet'));
    assert.ok(flow.consumers.some((c) => c.operationId === 'cookieTenantScoped'));
  });

  it('pr_locale has issuer: cookieLocaleSet, consumer: cookieLocaleRead', () => {
    const flow = findFlow('pr_locale');
    assert.ok(flow);
    assert.ok(flow.issuers.some((i) => i.operationId === 'cookieLocaleSet'));
    assert.ok(flow.consumers.some((c) => c.operationId === 'cookieLocaleRead'));
  });

  it('pr_theme has issuer: cookieThemeSet, consumer: cookieThemeRead', () => {
    const flow = findFlow('pr_theme');
    assert.ok(flow);
    assert.ok(flow.issuers.some((i) => i.operationId === 'cookieThemeSet'));
    assert.ok(flow.consumers.some((c) => c.operationId === 'cookieThemeRead'));
  });

  it('pr_attrs_strict has attrs with httpOnly + secure + sameSite + path + maxAge', () => {
    const flow = findFlow('pr_attrs_strict');
    assert.ok(flow);
    assert.deepEqual(flow.attrs, {
      httpOnly: true,
      secure: true,
      sameSite: 'Strict',
      path: '/api',
      maxAge: 300,
    });
  });

  it('pr_attrs_drift has declared httpOnly:true in attrs', () => {
    const flow = findFlow('pr_attrs_drift');
    assert.ok(flow);
    assert.equal(flow.attrs.httpOnly, true);
  });
});

// ---------------------------------------------------------------------------
// DIAG coverage — each expected DIAG code should appear from diag endpoints
// ---------------------------------------------------------------------------

describe('Live OpenAPI fixture — DIAG codes', { skip: skipReason }, () => {
  it('COOKIE_ROLE_AMBIGUOUS from pr_diag_ambig (role-ambig-a/b)', () => {
    const diag = findDiag('COOKIE_ROLE_AMBIGUOUS');
    assert.ok(diag, 'missing COOKIE_ROLE_AMBIGUOUS');
    assert.ok(diag.details.name === 'pr_diag_ambig');
  });

  it('COOKIE_ISSUER_AMBIGUOUS from pr_diag_issuer (issuer-ambig-a/b)', () => {
    // There may be multiple ISSUER_AMBIGUOUS diags (one for pr_diag_ambig due to
    // role ambiguity also producing 2 issuers with role refresh-token). Find the
    // one specifically for pr_diag_issuer.
    const diag = diagnostics.find(
      (d) => d.code === 'COOKIE_ISSUER_AMBIGUOUS' && d.details.name === 'pr_diag_issuer',
    );
    assert.ok(diag, 'missing COOKIE_ISSUER_AMBIGUOUS for pr_diag_issuer');
    assert.ok(diag.details.issuers.includes('cookieDiagIssuerAmbigA'));
    assert.ok(diag.details.issuers.includes('cookieDiagIssuerAmbigB'));
  });

  it('COOKIE_NAME_MISSING_FOR_ROLE from name-missing endpoint', () => {
    const diag = findDiag('COOKIE_NAME_MISSING_FOR_ROLE');
    assert.ok(diag, 'missing COOKIE_NAME_MISSING_FOR_ROLE');
    assert.equal(diag.details.role, 'session');
  });

  it('COOKIE_ATTR_DECLARATION_INVALID from invalid-attrs endpoint', () => {
    const diag = findDiag('COOKIE_ATTR_DECLARATION_INVALID');
    assert.ok(diag, 'missing COOKIE_ATTR_DECLARATION_INVALID');
    assert.equal(diag.details.name, 'pr_diag_invalid_attrs');
  });

  it('COOKIE_CSRF_HEADER_NOT_DECLARED from csrf-no-header endpoint', () => {
    const diag = findDiag('COOKIE_CSRF_HEADER_NOT_DECLARED');
    assert.ok(diag, 'missing COOKIE_CSRF_HEADER_NOT_DECLARED');
    assert.equal(diag.details.name, 'pr_diag_csrf_orphan');
  });

  it('COOKIE_HAS_NO_CONSUMER from no-consumer endpoint', () => {
    const noConsumerDiags = diagnostics.filter(
      (d) => d.code === 'COOKIE_HAS_NO_CONSUMER' && d.details.name === 'pr_diag_no_consumer',
    );
    assert.ok(noConsumerDiags.length > 0, 'missing COOKIE_HAS_NO_CONSUMER for pr_diag_no_consumer');
  });

  it('COOKIE_HAS_NO_ISSUER from no-issuer endpoint', () => {
    const noIssuerDiags = diagnostics.filter(
      (d) => d.code === 'COOKIE_HAS_NO_ISSUER' && d.details.name === 'pr_diag_no_issuer',
    );
    assert.ok(noIssuerDiags.length > 0, 'missing COOKIE_HAS_NO_ISSUER for pr_diag_no_issuer');
  });

  it('should have 7+ distinct DIAG codes total from diag endpoints', () => {
    const codes = new Set(diagnostics.map((d) => d.code));
    const expected = [
      'COOKIE_ROLE_AMBIGUOUS',
      'COOKIE_ISSUER_AMBIGUOUS',
      'COOKIE_NAME_MISSING_FOR_ROLE',
      'COOKIE_ATTR_DECLARATION_INVALID',
      'COOKIE_CSRF_HEADER_NOT_DECLARED',
      'COOKIE_HAS_NO_CONSUMER',
      'COOKIE_HAS_NO_ISSUER',
    ];
    for (const code of expected) {
      assert.ok(codes.has(code), `missing DIAG code: ${code}`);
    }
  });
});
