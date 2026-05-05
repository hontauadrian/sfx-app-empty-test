'use strict';

/**
 * emitters/cookie-refresh-rotation.js
 *
 * Emits flow chains for cookieFlows entries with role='refresh-token'.
 *
 * Chain shape (from plan SS3.4):
 *   1. POST {issuer}   -> expect <issuer.declaredStatus>, capture-cookie(name)
 *   2. POST {consumer} -> with jar replay -> expect <rotator.declaredStatus>, capture-cookie(name) again
 *   3. assert-cookie-rotated(name, previousFromBag=step1)
 *   4. assert-cookie-attrs(name, expected=declared)   // if attrs declared
 *   5. (optional) POST {clearer} -> assert-cookie-cleared(name)
 *
 * Declaration-driven only:
 *   - operationId / path lookup, NEVER regex
 *   - status code MUST be declared via @HttpCode(N) / @ApiResponse({status:N});
 *     no fallback to a "common success codes" set
 *   - if any required opRef is missing declaredStatus → skip + emit diagnostic
 */

/**
 * Build an api step for an issuer, including body from requestBodyExample
 * if declared. Skips body when undefined/null (no body needed).
 *
 * When `options.endpoints` is provided, looks up the endpoint's zodContract
 * fields and replaces any field with `constraints.format === 'email'` with
 * the `${uniqEmail}` sigil (or `${registeredEmail}` when
 * `options.useRegisteredEmail` is true — for flows that depend on
 * chain:auth-bootstrap and need to re-login with the same email that was
 * registered in the bootstrap chain). Declaration-driven: only Zod `.email()`
 * emits `format: 'email'` in the introspected constraints — no field-name
 * matching.
 */
function buildIssuerApiStep(issuerRef, options) {
  const step = { kind: 'api', method: issuerRef.method, path: issuerRef.path };
  if (issuerRef.requestBodyExample !== undefined && issuerRef.requestBodyExample !== null) {
    step.body = { ...issuerRef.requestBodyExample };

    // Declaration-driven email sigil: look up zodContract.fields from the
    // endpoint registry. When a field declares constraints.format === 'email',
    // substitute the sample value with the appropriate sigil.
    // When useRegisteredEmail is true, use ${registeredEmail} (captured from
    // chain:auth-bootstrap's register response) so the login succeeds against
    // the pre-registered user. Otherwise use ${uniqEmail} for fresh unique.
    const emailSigil = (options && options.useRegisteredEmail)
      ? '${registeredEmail}'
      : '${uniqEmail}';
    const eps = (options && options.endpoints) || [];
    const matchedEp = eps.find(
      (ep) => ep.method === issuerRef.method && ep.path === issuerRef.path,
    );
    if (matchedEp && matchedEp.zodContract && matchedEp.zodContract.fields) {
      // zodContract.fields can be either:
      //   - an array of {name, type, constraints, ...} objects (from zod-introspect)
      //   - an object map {fieldName: {constraints, ...}} (from unit tests / legacy)
      const fields = matchedEp.zodContract.fields;
      if (Array.isArray(fields)) {
        for (const fieldMeta of fields) {
          if (
            fieldMeta &&
            fieldMeta.name &&
            fieldMeta.constraints &&
            fieldMeta.constraints.format === 'email' &&
            step.body[fieldMeta.name] !== undefined
          ) {
            step.body[fieldMeta.name] = emailSigil;
          }
        }
      } else {
        for (const [fieldName, fieldMeta] of Object.entries(fields)) {
          if (
            fieldMeta &&
            fieldMeta.constraints &&
            fieldMeta.constraints.format === 'email' &&
            step.body[fieldName] !== undefined
          ) {
            step.body[fieldName] = emailSigil;
          }
        }
      }
    }
  }
  return step;
}

/**
 * @param {import('../contract-types').CookieFlow} flow
 * @param {object} options — { diagnostics?: Diagnostic[] }
 * @returns {Array} array of generated flow objects
 */
function emitCookieRefreshRotation(flow, options) {
  const opts = options || {};
  const diagnostics = opts.diagnostics; // optional sink

  if (!flow || flow.role !== 'refresh-token') return [];
  if (!flow.issuers || flow.issuers.length === 0) return [];

  const flows = [];
  const cookieName = flow.name;

  // Rotator is required for rotation assertion — an endpoint that both
  // consumes AND re-issues the cookie.
  const rotator = flow.rotators && flow.rotators.length > 0 ? flow.rotators[0] : null;
  const clearer = flow.clearers && flow.clearers.length > 0 ? flow.clearers[0] : null;

  // Pick a rotation-safe seed issuer. Skip:
  //  - issuers that ARE the rotator (would make step1 == step4 — same op probed twice)
  //  - issuers declaring 201 Created — RFC 7231 §6.3.2: 201 indicates a new
  //    resource was created, which is non-idempotent; calling it twice against
  //    a long-lived stack collides on persisted state. Reading the developer's
  //    declared status and honoring its RFC semantic is declaration-driven,
  //    not a heuristic.
  // If no rotation-safe issuer is declared, skip the chain with a DIAG —
  // never silently fall back to a non-idempotent issuer.
  const isRotatorRef = (op) =>
    rotator &&
    op.operationId === rotator.operationId &&
    op.path === rotator.path &&
    op.method === rotator.method;

  const repeatableIssuers = flow.issuers.filter(
    (i) => !isRotatorRef(i) && i.declaredStatus !== 201,
  );

  if (repeatableIssuers.length === 0) {
    if (diagnostics) {
      diagnostics.push({
        level: 'info',
        code: 'COOKIE_REFRESH_NO_REPEATABLE_ISSUER',
        message:
          `Skipped cookie-refresh-rotation chain for cookie '${cookieName}' — ` +
          `no declared issuer is rotation-safe (all are either the rotator itself ` +
          `or declare 201 Created, which is non-idempotent per RFC 7231 §6.3.2). ` +
          `Tag a 200-status issuer (e.g. login) with @CookieRole(name, 'refresh-token').`,
      });
    }
    return [];
  }

  const issuer = repeatableIssuers[0];

  // For POST issuers with declared schema but no example: skip flows.
  const issuerMethod = (issuer.method || '').toUpperCase();
  if ((issuerMethod === 'POST' || issuerMethod === 'PUT' || issuerMethod === 'PATCH') &&
      issuer.requestBodyExample === null) {
    return [];
  }

  // Declaration-driven status: every opRef MUST have declaredStatus from the
  // detector. If null/missing, the detector already emitted an error diag at
  // the cookie-flow level — refuse to emit a runnable chain since asserting
  // an undeclared status would be a heuristic.
  if (issuer.declaredStatus == null) {
    if (diagnostics) {
      diagnostics.push({
        level: 'info',
        code: 'COOKIE_REFRESH_CHAIN_SKIPPED_NO_DECLARED_STATUS',
        endpoint: `${issuer.method} ${issuer.path}`,
        message: `Skipped cookie-refresh-rotation chain — issuer '${issuer.operationId || issuer.path}' has no declared 2xx response. Add @HttpCode(N) and @ApiResponse({status:N}) on the issuer endpoint.`,
      });
    }
    return [];
  }

  if (rotator && rotator.declaredStatus == null) {
    if (diagnostics) {
      diagnostics.push({
        level: 'info',
        code: 'COOKIE_REFRESH_CHAIN_SKIPPED_NO_DECLARED_STATUS',
        endpoint: `${rotator.method} ${rotator.path}`,
        message: `Skipped cookie-refresh-rotation chain — rotator '${rotator.operationId || rotator.path}' has no declared 2xx response. Add @HttpCode(N) and @ApiResponse({status:N}) on the rotator endpoint.`,
      });
    }
    return [];
  }

  if (clearer && clearer.declaredStatus == null) {
    if (diagnostics) {
      diagnostics.push({
        level: 'info',
        code: 'COOKIE_REFRESH_CHAIN_SKIPPED_NO_DECLARED_STATUS',
        endpoint: `${clearer.method} ${clearer.path}`,
        message: `Skipped cookie-refresh-rotation chain — clearer '${clearer.operationId || clearer.path}' has no declared 2xx response. Add @HttpCode(N) and @ApiResponse({status:N}) on the clearer endpoint.`,
      });
    }
    return [];
  }

  const contract = {
    endpoint: `${issuer.method} ${issuer.path}`,
    kind: 'cookie-refresh-rotation',
    source: 'cookie-flows-detector',
  };

  // --- Positive chain: issue -> rotate -> assert-rotated [-> attrs] [-> clear] ---
  if (rotator) {
    const steps = [];
    // First pass: build with ${uniqEmail} to detect if bootstrap is needed
    const probeStep = buildIssuerApiStep(issuer, opts);
    const needsBootstrap = probeStep.body &&
      Object.values(probeStep.body).some((v) => typeof v === 'string' && v.includes('${uniqEmail}'));
    // When bootstrap is needed, the issuer is a login endpoint (not register)
    // and requires the email that was registered in chain:auth-bootstrap.
    // Rebuild with ${registeredEmail} so the login matches the registered user.
    const issuerApiStep = needsBootstrap
      ? buildIssuerApiStep(issuer, { ...opts, useRegisteredEmail: true })
      : probeStep;

    if (needsBootstrap) {
      steps.push({ kind: 'setAuth', binding: 'accessToken' });
    }

    // Step 1: Issue the cookie
    steps.push(issuerApiStep);
    steps.push({ kind: 'expect', status: issuer.declaredStatus });
    steps.push({ kind: 'capture-cookie', name: cookieName, savePath: `cookie:${cookieName}:initial` });

    // Step 2: Rotate — consumer that also re-issues
    steps.push({ kind: 'api', method: rotator.method, path: rotator.path });
    steps.push({ kind: 'expect', status: rotator.declaredStatus });
    steps.push({ kind: 'capture-cookie', name: cookieName, savePath: `cookie:${cookieName}:rotated` });

    // Step 3: Assert rotation happened
    steps.push({ kind: 'assert-cookie-rotated', name: cookieName, previousFromBag: `cookie:${cookieName}:initial` });

    // Step 4: Assert attributes (only if declared)
    if (flow.attrs && Object.keys(flow.attrs).length > 0) {
      steps.push({ kind: 'assert-cookie-attrs', name: cookieName, expected: flow.attrs });
    }

    // Step 5: Clear (only if clearer declared)
    if (clearer) {
      steps.push({ kind: 'api', method: clearer.method, path: clearer.path });
      steps.push({ kind: 'expect', status: clearer.declaredStatus });
      steps.push({ kind: 'assert-cookie-cleared', name: cookieName });
    }

    flows.push({
      id: `cookie:refresh-token:${cookieName}:rotation`,
      contract,
      dependsOn: needsBootstrap ? ['chain:auth-bootstrap'] : [],
      onFail: {
        check: [],
        implies: `Refresh-token cookie '${cookieName}' should rotate on ${rotator.method} ${rotator.path}.`,
      },
      steps,
    });
  }

  // --- Issue-only chain (when no rotator): just issue + capture + attrs ---
  if (!rotator) {
    const steps = [];
    // Same two-pass pattern as the rotator branch: detect bootstrap need,
    // then rebuild with ${registeredEmail} if the issuer is a login endpoint.
    const probeStepIssue = buildIssuerApiStep(issuer, opts);
    const needsBootstrapIssue = probeStepIssue.body &&
      Object.values(probeStepIssue.body).some((v) => typeof v === 'string' && v.includes('${uniqEmail}'));
    const issuerApiStep = needsBootstrapIssue
      ? buildIssuerApiStep(issuer, { ...opts, useRegisteredEmail: true })
      : probeStepIssue;

    if (needsBootstrapIssue) {
      steps.push({ kind: 'setAuth', binding: 'accessToken' });
    }

    steps.push(issuerApiStep);
    steps.push({ kind: 'expect', status: issuer.declaredStatus });
    steps.push({ kind: 'capture-cookie', name: cookieName, savePath: `cookie:${cookieName}:initial` });

    if (flow.attrs && Object.keys(flow.attrs).length > 0) {
      steps.push({ kind: 'assert-cookie-attrs', name: cookieName, expected: flow.attrs });
    }

    if (clearer) {
      steps.push({ kind: 'api', method: clearer.method, path: clearer.path });
      steps.push({ kind: 'expect', status: clearer.declaredStatus });
      steps.push({ kind: 'assert-cookie-cleared', name: cookieName });
    }

    flows.push({
      id: `cookie:refresh-token:${cookieName}:issue`,
      contract,
      dependsOn: needsBootstrapIssue ? ['chain:auth-bootstrap'] : [],
      onFail: {
        check: [],
        implies: `Refresh-token cookie '${cookieName}' should be issued by ${issuer.method} ${issuer.path}.`,
      },
      steps,
    });
  }

  return flows;
}

module.exports = { emitCookieRefreshRotation };
