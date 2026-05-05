'use strict';

/**
 * detectors/auth-flows.js — declaration-driven auth-flow detection.
 *
 * Two layers, two policies:
 *
 * --- Layer 1: ROLE selection (which endpoint plays which role) -------------
 *
 *   Strict canonical signal only. The probe REFUSES to guess intent.
 *   Accepted signals (per role):
 *
 *     1. operationId equals the canonical name for that role.
 *     2. OpenAPI extension flag set to `true` on the endpoint.
 *
 *   Path regex, body shape, response shape, and operationId substrings are
 *   NEVER consulted — those produced wrong picks on register-with-auto-login
 *   projects (chain:auth-bootstrap captured undefined).
 *
 *     tokenIssuer (login):  operationId === 'authLogin'    OR x-auth-issues-token: true
 *     register:             operationId === 'authRegister' OR x-auth-registers-user: true
 *     logout:               operationId === 'authLogout'   OR x-auth-logs-out: true
 *     refresh:              operationId === 'authRefresh'  OR x-auth-refreshes-token: true
 *     mePoll:               operationId === 'authMe'       OR x-auth-current-user: true
 *
 *   Set in NestJS via @ApiOperation({ operationId: 'authLogin' }), or via
 *   `addExtension('x-auth-issues-token', true)` on the OperationObject.
 *
 * --- Layer 2: FIELD NAME extraction (what each endpoint calls its tokens) -
 *
 *   PURE introspection — the probe reads the project's declared Zod /
 *   OpenAPI schemas and uses whatever field names the project actually
 *   declares. snake_case, camelCase, `rt`, `token`, anything — the probe
 *   adapts. The probe does NOT enforce a naming convention; it reflects
 *   the source of truth.
 *
 *   Strategy:
 *     - Single-field schema → that field name is used verbatim.
 *     - Multi-field schema → disambiguate via name correspondence between
 *       the refresh endpoint's request and response (the rotated refresh
 *       token shares the field name with the input; the other field is the
 *       access token).
 *     - Genuine ambiguity (multiple unrelated fields, no correspondence) →
 *       DIAG asks the developer to make the schema unambiguous, NOT to
 *       rename to a canonical form.
 *
 * --- Exports ---------------------------------------------------------------
 *
 *   detectAuthFlows(matrix, diag?)
 *     → { tokenIssuer, register, logout, refresh, mePoll }
 *     where tokenIssuer/refresh include extracted field names.
 *
 *   detectTokenFields(ep) → { accessTokenField, refreshTokenField }
 *   detectRefreshRequestField(ep) → string | null
 */

// ---------------------------------------------------------------------------
// Extension lookup helper — checks both top-level and swaggerDeclared.extensions
// ---------------------------------------------------------------------------

function getExtension(ep, key) {
  if (ep[key] !== undefined) return ep[key];
  if (ep.swaggerDeclared && ep.swaggerDeclared.extensions && ep.swaggerDeclared.extensions[key] !== undefined) {
    return ep.swaggerDeclared.extensions[key];
  }
  return undefined;
}

const ROLES = {
  tokenIssuer: { method: 'POST', operationId: 'authLogin', extension: 'x-auth-issues-token' },
  register: { method: 'POST', operationId: 'authRegister', extension: 'x-auth-registers-user' },
  logout: { method: 'POST', operationId: 'authLogout', extension: 'x-auth-logs-out' },
  refresh: { method: 'POST', operationId: 'authRefresh', extension: 'x-auth-refreshes-token' },
  mePoll: { method: 'GET', operationId: 'authMe', extension: 'x-auth-current-user' },
};

// ---------------------------------------------------------------------------
// Role detection (canonical operationId / extension only — no heuristics)
// ---------------------------------------------------------------------------

function extractSchemeName(ep) {
  if (!ep.securityRequirement || ep.securityRequirement.length === 0) return null;
  const first = ep.securityRequirement[0];
  const names = Object.keys(first);
  return names.length > 0 ? names[0] : null;
}

function buildResult(ep, source) {
  return {
    method: ep.method,
    path: ep.path,
    schemeName: extractSchemeName(ep),
    source,
  };
}

function isStructurallyEligible(role, ep) {
  if (role !== 'mePoll') return true;
  return Boolean(ep.authDecorators && ep.authDecorators.authRequired === true);
}

function detectRole(role, endpoints, diag) {
  const cfg = ROLES[role];
  const candidatesByMethod = endpoints.filter((ep) => ep.method === cfg.method);
  const eligible = candidatesByMethod.filter((ep) => isStructurallyEligible(role, ep));

  // Priority 1: exact canonical operationId
  const opIdMatches = eligible.filter((ep) => ep.operationId === cfg.operationId);
  if (opIdMatches.length === 1) return { result: buildResult(opIdMatches[0], 'operationId'), reason: 'detected' };
  if (opIdMatches.length > 1) {
    diag.push({
      code: 'AUTH_FLOW_OPID_DUPLICATE',
      message:
        `Multiple ${cfg.method} endpoints declare operationId='${cfg.operationId}' ` +
        `(${opIdMatches.map((e) => `${e.method} ${e.path}`).join(', ')}). ` +
        'operationId must be unique per OpenAPI spec — keep it on the canonical ' +
        `${role} endpoint and remove from the others.`,
    });
    return { result: null, reason: 'duplicate-opid' };
  }

  // Priority 2: explicit extension flag
  const extMatches = eligible.filter((ep) => getExtension(ep, cfg.extension) === true);
  if (extMatches.length === 1) return { result: buildResult(extMatches[0], 'extension'), reason: 'detected' };
  if (extMatches.length > 1) {
    diag.push({
      code: 'AUTH_FLOW_EXT_DUPLICATE',
      message:
        `Multiple ${cfg.method} endpoints set ${cfg.extension}=true ` +
        `(${extMatches.map((e) => `${e.method} ${e.path}`).join(', ')}). ` +
        'At most one endpoint may carry this extension.',
    });
    return { result: null, reason: 'duplicate-ext' };
  }

  // Structural mismatch (e.g. authMe on a public GET).
  if (role === 'mePoll') {
    const opIdElsewhere = candidatesByMethod.filter((ep) => ep.operationId === cfg.operationId);
    const extElsewhere = candidatesByMethod.filter((ep) => getExtension(ep, cfg.extension) === true);
    if (opIdElsewhere.length > 0 || extElsewhere.length > 0) {
      const ep = opIdElsewhere[0] || extElsewhere[0];
      diag.push({
        code: 'AUTH_FLOW_MEPOLL_NOT_PROTECTED',
        message:
          `${ep.method} ${ep.path} declares the mePoll role but is not auth-protected. ` +
          'Add @UseGuards(AuthGuard) (NestJS) or an OpenAPI security requirement so ' +
          'authDecorators.authRequired === true. The mePoll role is meaningless on a ' +
          'public endpoint.',
      });
      return { result: null, reason: 'not-protected' };
    }
  }

  return { result: null, reason: 'undetected' };
}

// ---------------------------------------------------------------------------
// Schema introspection (extract whatever the project's schemas declare)
// ---------------------------------------------------------------------------

function getFieldNames(contract) {
  if (!contract) return [];
  const fields = contract.fields || [];
  return fields
    .map((f) => (typeof f === 'string' ? f : f && f.name))
    .filter(Boolean);
}

/**
 * Pick the refresh-token input field name from the refresh endpoint's
 * request body. Single field → use it verbatim. Empty or multi-field →
 * DIAG (ambiguity bug, not naming bug).
 */
function pickRefreshInputField(ep, diag) {
  const reqFields = getFieldNames(ep.zodContract);

  // No schema declared → silent. Project may not have declared yet, or may
  // carry the refresh token via cookie / header instead of body.
  if (reqFields.length === 0) return null;

  // Exactly one field → use it verbatim, whatever it's called.
  if (reqFields.length === 1) return reqFields[0];

  // Multiple fields → ambiguous. The probe needs ONE signal to know which
  // field carries the refresh token. Don't enforce a name — ask the
  // developer to make the schema unambiguous OR use matching name in the
  // response so we can correlate.
  diag.push({
    code: 'AUTH_FLOW_REFRESH_REQUEST_AMBIGUOUS',
    message:
      `Refresh endpoint ${ep.method} ${ep.path} request body has multiple fields ` +
      `(${JSON.stringify(reqFields)}). The probe needs to know which one carries the ` +
      'refresh token. Either reduce the schema to a single field, or use the same ' +
      'field name in the response (rotated refresh) so the probe can match by name.',
  });
  return null;
}

/**
 * Identify scalar (leaf) fields using the declared requiredPaths. A field is
 * nested if requiredPaths contains any entry starting with `fieldName.`
 * (e.g. `user.email` proves `user` is an object, not a token string).
 * Fields with no sub-paths in requiredPaths are considered scalar candidates.
 *
 * This is purely declarative — reads the OpenAPI/Zod schema structure that
 * the developer declared. No field-name guessing.
 */
function filterScalarFields(fields, responseContract) {
  const requiredPaths = (responseContract && responseContract.requiredPaths) || [];
  return fields.filter((fieldName) => {
    const prefix = fieldName + '.';
    return !requiredPaths.some((rp) => rp.startsWith(prefix));
  });
}

/**
 * Given the refresh response schema and the (already-picked) refresh-input
 * field name, identify which response field is the access token and which
 * is the rotated refresh token.
 *
 * Disambiguation:
 *   - 0 fields → silent (project may not return a body; e.g. 204 + cookie).
 *   - 1 field  → that field is the access token.
 *   - 2+ fields → the field whose name matches the request input is the
 *                 rotated refresh; the remaining field is the access token.
 *                 If multiple "other" fields remain, use requiredPaths to
 *                 exclude nested-object fields (those with sub-paths like
 *                 `user.email`). If exactly one scalar remains → pick it.
 *                 Otherwise → ambiguity DIAG.
 */
function pickResponseTokenFields(ep, refreshInputField, diag, role) {
  const respFields = getFieldNames(ep.responseContract);
  if (respFields.length === 0) return { accessTokenField: null, refreshTokenField: null };

  if (respFields.length === 1) {
    return { accessTokenField: respFields[0], refreshTokenField: null };
  }

  if (refreshInputField && respFields.includes(refreshInputField)) {
    const others = respFields.filter((n) => n !== refreshInputField);
    if (others.length === 1) {
      return { accessTokenField: others[0], refreshTokenField: refreshInputField };
    }
    // Multiple "other" fields — narrow by excluding nested objects using
    // declared requiredPaths (e.g. user.email proves user is an object).
    const scalarOthers = filterScalarFields(others, ep.responseContract);
    if (scalarOthers.length === 1) {
      return { accessTokenField: scalarOthers[0], refreshTokenField: refreshInputField };
    }
    diag.push({
      code: 'AUTH_FLOW_RESPONSE_AMBIGUOUS',
      message:
        `${role} endpoint ${ep.method} ${ep.path} response has the rotated refresh field ` +
        `'${refreshInputField}' plus multiple scalar fields (${JSON.stringify(scalarOthers.length > 0 ? scalarOthers : others)}). ` +
        'The probe cannot tell which is the access token. Reduce the response to two ' +
        'string fields (refresh + access), or ensure non-token fields have declared ' +
        'sub-paths in requiredPaths (e.g. user.email) so the probe can exclude them.',
    });
    return { accessTokenField: null, refreshTokenField: refreshInputField };
  }

  // Multi-field response, no name correspondence with the refresh input.
  // Narrow to scalar fields before giving up.
  const scalarFields = filterScalarFields(respFields, ep.responseContract);
  if (scalarFields.length === 1) {
    return { accessTokenField: scalarFields[0], refreshTokenField: null };
  }

  diag.push({
    code: 'AUTH_FLOW_RESPONSE_AMBIGUOUS',
    message:
      `${role} endpoint ${ep.method} ${ep.path} response has multiple scalar fields ` +
      `(${JSON.stringify(scalarFields.length > 0 ? scalarFields : respFields)}) and none match the refresh input field name ` +
      `${refreshInputField ? `'${refreshInputField}'` : '(none declared)'}. ` +
      'The probe cannot identify the access-token field. Use matching field names ' +
      'between the refresh request and the response so the probe can correlate.',
  });
  return { accessTokenField: null, refreshTokenField: null };
}

// ---------------------------------------------------------------------------
// Auth-signal gate (suppress UNDETECTED noise on no-auth projects)
// ---------------------------------------------------------------------------

function hasAnyAuthSignal(endpoints) {
  return endpoints.some((ep) => {
    if (ep.authDecorators && ep.authDecorators.authRequired === true) return true;
    for (const cfg of Object.values(ROLES)) {
      if (ep.operationId === cfg.operationId) return true;
      if (getExtension(ep, cfg.extension) === true) return true;
    }
    return false;
  });
}

// ---------------------------------------------------------------------------
// Main entrypoint
// ---------------------------------------------------------------------------

function detectAuthFlows(matrix, diagnostics) {
  const diag = diagnostics || [];
  const endpoints = matrix.apiEndpoints || [];
  const empty = { tokenIssuer: null, register: null, logout: null, refresh: null, mePoll: null };

  if (!hasAnyAuthSignal(endpoints)) return empty;

  const roleNames = ['tokenIssuer', 'register', 'logout', 'refresh', 'mePoll'];
  const detections = {};
  for (const role of roleNames) {
    detections[role] = detectRole(role, endpoints, diag);
  }

  // Suppress UNDETECTED for roles that have no candidate endpoints at all.
  const hasPost = endpoints.some((ep) => ep.method === 'POST');
  const hasProtectedGet = endpoints.some(
    (ep) => ep.method === 'GET' && ep.authDecorators && ep.authDecorators.authRequired === true,
  );

  for (const role of roleNames) {
    const { reason } = detections[role];
    if (reason !== 'undetected') continue;
    if (role === 'mePoll' && !hasProtectedGet) continue;
    if (role !== 'mePoll' && !hasPost) continue;

    const cfg = ROLES[role];
    diag.push({
      code: `AUTH_FLOW_${role.toUpperCase()}_UNDETECTED`,
      message:
        `${role} endpoint not detected. Declare it on a single ${cfg.method} endpoint by ` +
        `adding either @ApiOperation({ operationId: '${cfg.operationId}' }) (NestJS) OR ` +
        `the OpenAPI extension '${cfg.extension}: true'. Without this declaration, ` +
        'dependent probe flows will be skipped.',
    });
  }

  // ---- Schema introspection: extract field names per endpoint ----------

  // 1. Refresh endpoint: pick input field, then resolve response fields by
  //    name correspondence.
  let refreshInputField = null;
  let refreshResult = detections.refresh.result;
  if (refreshResult) {
    const refreshEp = endpoints.find(
      (ep) => ep.method === refreshResult.method && ep.path === refreshResult.path,
    );
    if (refreshEp) {
      refreshInputField = pickRefreshInputField(refreshEp, diag);
      const { accessTokenField, refreshTokenField } = pickResponseTokenFields(
        refreshEp,
        refreshInputField,
        diag,
        'refresh',
      );
      refreshResult = {
        ...refreshResult,
        refreshInputField,
        accessTokenField,
        refreshTokenField,
        tokenRotation: Boolean(refreshTokenField),
      };
    }
  }

  // 2. Token-issuer (login) endpoint: extract access/refresh field names
  //    from its declared response. Use the refresh input field name (if
  //    known) for correspondence-based disambiguation.
  let tokenIssuerResult = detections.tokenIssuer.result;
  if (tokenIssuerResult) {
    const issuerEp = endpoints.find(
      (ep) => ep.method === tokenIssuerResult.method && ep.path === tokenIssuerResult.path,
    );
    if (issuerEp) {
      const { accessTokenField, refreshTokenField } = pickResponseTokenFields(
        issuerEp,
        refreshInputField,
        diag,
        'tokenIssuer',
      );
      tokenIssuerResult = {
        ...tokenIssuerResult,
        accessTokenField,
        refreshTokenField,
      };
    }
  }

  return {
    tokenIssuer: tokenIssuerResult,
    register: detections.register.result,
    logout: detections.logout.result,
    refresh: refreshResult,
    mePoll: detections.mePoll.result,
  };
}

// ---------------------------------------------------------------------------
// Single-endpoint introspection helpers (used by callers that already have a
// chosen endpoint via declarative role detection).
// ---------------------------------------------------------------------------

/**
 * Extract token field names from an endpoint's declared response. Without
 * a refresh-input correspondence, returns the single field if there's
 * exactly one, otherwise nulls.
 */
function detectTokenFields(ep, opts) {
  const refreshInputField = (opts && opts.refreshInputField) || null;
  const respFields = getFieldNames(ep.responseContract);
  if (respFields.length === 0) return { accessTokenField: null, refreshTokenField: null };
  if (respFields.length === 1) return { accessTokenField: respFields[0], refreshTokenField: null };
  if (refreshInputField && respFields.includes(refreshInputField)) {
    const others = respFields.filter((n) => n !== refreshInputField);
    if (others.length === 1) {
      return { accessTokenField: others[0], refreshTokenField: refreshInputField };
    }
  }
  return { accessTokenField: null, refreshTokenField: null };
}

/**
 * Extract the refresh-token request field name from a refresh endpoint's
 * declared body. Single-field → use verbatim. Else → null.
 */
function detectRefreshRequestField(ep) {
  const reqFields = getFieldNames(ep.zodContract);
  return reqFields.length === 1 ? reqFields[0] : null;
}

module.exports = {
  detectAuthFlows,
  detectTokenFields,
  detectRefreshRequestField,
  filterScalarFields,
  ROLES,
};
