'use strict';

const { detectAuthFlows } = require('./auth-flows');

// Auth surfaces + session mechanism detection.
// Delegates surface paths to the canonical auth-flows.js detector
// (declaration-driven: operationId / OpenAPI x-* extensions only).
// Session mechanism is derived from frameworks.auth flags (package.json).
// Token storage and persistence are NOT guessed from source code; they
// require explicit overlay declaration or default to 'unknown' + DIAG.
//
// Spec: plan 02 §4.13, heuristic audit 2026-04-27.
function deriveAuth(root, frameworks, pages, endpoints, diag) {
  // Delegate surface detection to auth-flows.js (canonical, declaration-driven).
  // Construct a minimal matrix-like object that detectAuthFlows expects.
  const authFlowsDiag = [];
  const authFlows = detectAuthFlows({ apiEndpoints: endpoints || [] }, authFlowsDiag);

  // Forward auth-flows diagnostics to the caller's diag channel.
  for (const entry of authFlowsDiag) {
    if (diag && typeof diag.push === 'function') {
      diag.push(entry);
    } else if (diag && typeof diag.warn === 'function') {
      diag.warn(`auth-flows: ${entry.code} — ${entry.message}`);
    }
  }

  const loginSurface = authFlows.tokenIssuer ? authFlows.tokenIssuer.path : null;
  const registerSurface = authFlows.register ? authFlows.register.path : null;
  const logoutSurface = authFlows.logout ? authFlows.logout.path : null;

  // Session mechanism: derived from frameworks.auth flags only (package.json
  // dependencies, not source-code regex). These flags are set by the
  // frameworks detector which reads package.json — a declarative source.
  const authFlags = new Set(frameworks.auth || []);
  let sessionMechanism = 'unknown';
  if (authFlags.has('jwt')) sessionMechanism = 'jwt-in-header';
  else if (authFlags.has('supabase')) sessionMechanism = 'supabase';
  else if (authFlags.has('clerk')) sessionMechanism = 'clerk';
  else if (authFlags.has('auth.js')) sessionMechanism = 'auth.js';

  // Token storage + persistence: requires explicit declaration.
  // Source-code regex sniffing (localStorage.setItem, zustand+persist, cookies().set)
  // was a heuristic — removed. Projects must declare via overlay or these stay unknown.
  const tokenStorage = 'unknown';
  const persistsAcrossRefresh = false;

  if (tokenStorage === 'unknown' && sessionMechanism !== 'unknown') {
    if (diag && typeof diag.info === 'function') {
      diag.info(
        'AUTH_TOKEN_STORAGE_UNDECLARED: session mechanism detected via package.json ' +
        `(${sessionMechanism}) but token storage is undeclared. Declare via ` +
        'runtime-contract overlay authDetection.tokenStorage to enable ' +
        'persist-across-refresh assertions.'
      );
    }
  }

  const result = {
    loginSurface,
    registerSurface,
    logoutSurface,
    sessionMechanism,
    tokenStorage,
    persistsAcrossRefresh,
  };
  if (diag && typeof diag.info === 'function') {
    diag.info(`auth: login=${result.loginSurface} session=${result.sessionMechanism} token=${result.tokenStorage}`);
  }
  return result;
}

module.exports = { deriveAuth };
