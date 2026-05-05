'use strict';

/**
 * detectors/cookie-flows.js — Declaration-driven cookie-flow detection.
 *
 * Reads OpenAPI declarations ONLY — NEVER heuristics, NEVER path regex,
 * NEVER field-name guessing.
 *
 * Declaration vocabulary consumed (in priority order):
 *
 * --- Issuer signals (who SETS the cookie) ---
 *   P1: securitySchemes type='apiKey' in='cookie' → scheme maps to role
 *   P2: response header Set-Cookie with x-cookie-role + x-cookie-name
 *   P3: operation x-cookie-roles (from @CookieRole decorator via swagger.ts)
 *
 * --- Consumer signals (who READS the cookie) ---
 *   C1: operation security[] referencing an apiKey-in-cookie scheme
 *   C3: operation x-cookie-consumes (from @CookieConsumer decorator)
 *   C4: x-cookie-consumes entry with headerEcho → csrf-double-submit consumer
 *
 * --- Clearer signals ---
 *   Response header x-cookie-attrs.maxAge === 0
 *
 * --- Rotator signals ---
 *   Operation both consumes AND issues the same cookie name
 *
 * --- Attribute declarations ---
 *   A1: x-cookie-attrs on response header Set-Cookie
 *
 * Diagnostics (emitted per cookieFlow entry):
 *   COOKIE_ROLE_AMBIGUOUS
 *   COOKIE_ISSUER_AMBIGUOUS
 *   COOKIE_NAME_MISSING_FOR_ROLE
 *   COOKIE_ATTR_DECLARATION_INVALID
 *   COOKIE_CSRF_HEADER_NOT_DECLARED
 *   COOKIE_SCHEME_ROLE_UNDECLARED
 *   COOKIE_HOST_PREFIX_INVALID
 *   COOKIE_NAME_INVALID
 *   COOKIE_SAMESITE_NONE_WITHOUT_SECURE
 *   COOKIE_HAS_NO_CONSUMER (warning)
 *   COOKIE_HAS_NO_ISSUER (error)
 *
 * Exports:
 *   detectCookieFlows(openapi) → { cookieFlows: CookieFlow[], diagnostics: Diagnostic[] }
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_ROLES = new Set([
  'refresh-token',
  'session',
  'csrf-double-submit',
  'oauth-state',
  'tenant-scope',
  'locale',
  'theme',
  'feature-flag',
  'custom',
]);

const VALID_SAMESITE = new Set(['Strict', 'Lax', 'None']);

const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'];

// P1 scheme-name regex REMOVED — NEVER-HEURISTIC rule.
// Role is read from scheme['x-cookie-role'] declaration only.

// RFC 6265 cookie-name token: any CHAR except CTLs, separators.
// Separators: ()<>@,;:\"/[]?={} SP HT
// eslint-disable-next-line no-control-regex
const COOKIE_NAME_INVALID_RE = /[\x00-\x1f\x7f\s"(),/:;<=>?@[\\\]{}]/;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a flat list of (operation, path, method) triples from openapi.paths.
 */
function buildOperationList(openapi) {
  const ops = [];
  const paths = openapi.paths || {};
  for (const [rawPath, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue;
    for (const method of METHODS) {
      const op = pathItem[method];
      if (!op || typeof op !== 'object') continue;
      ops.push({ op, path: rawPath, method: method.toUpperCase() });
    }
  }
  return ops;
}

/**
 * Resolve a $ref within the OpenAPI spec. Returns the resolved schema or null.
 */
function resolveRef(spec, refOrSchema) {
  if (!refOrSchema) return null;
  if (refOrSchema.$ref) {
    const parts = refOrSchema.$ref.replace(/^#\//, '').split('/');
    let node = spec;
    for (const part of parts) {
      if (!node || typeof node !== 'object') return null;
      node = node[part];
    }
    return node || null;
  }
  return refOrSchema;
}

/**
 * Extract securitySchemes that are apiKey-in-cookie.
 * Returns Map<schemeName, { name: cookieName, originalScheme }>.
 */
function extractCookieSecuritySchemes(openapi) {
  const map = new Map();
  const schemes = (openapi.components && openapi.components.securitySchemes) || {};
  for (const [schemeName, scheme] of Object.entries(schemes)) {
    if (!scheme || typeof scheme !== 'object') continue;
    if (scheme.type === 'apiKey' && scheme.in === 'cookie' && scheme.name) {
      // Read role from explicit x-cookie-role declaration — NEVER guess from name.
      const declaredRole = scheme['x-cookie-role'] || null;
      map.set(schemeName, { cookieName: scheme.name, role: declaredRole, originalScheme: scheme });
    }
  }
  return map;
}

/**
 * Scan response headers for Set-Cookie declarations with x-cookie-* extensions.
 * Returns array of { name, role, attrs, operationId, path, method, isClear }.
 */
function scanResponseHeaders(op, path, method) {
  const results = [];
  const responses = op.responses || {};
  for (const [, resp] of Object.entries(responses)) {
    if (!resp || typeof resp !== 'object') continue;
    const headers = resp.headers || {};
    const setCookie = headers['Set-Cookie'] || headers['set-cookie'];
    if (!setCookie || typeof setCookie !== 'object') continue;

    const role = setCookie['x-cookie-role'];
    const name = setCookie['x-cookie-name'];
    const attrs = setCookie['x-cookie-attrs'] || null;

    if (role || name) {
      const isClear = attrs && typeof attrs === 'object' && attrs.maxAge === 0;
      results.push({
        name: name || null,
        role: role || null,
        attrs,
        operationId: op.operationId || null,
        path,
        method,
        isClear: Boolean(isClear),
      });
    }
  }
  return results;
}

/**
 * Scan operation x-cookie-roles extension (from @CookieRole decorator).
 * Returns array of { name, role }.
 */
function scanOperationCookieRoles(op) {
  const roles = op['x-cookie-roles'];
  if (!Array.isArray(roles)) return [];
  return roles.filter((r) => r && typeof r === 'object');
}

/**
 * Scan operation x-cookie-consumes extension (from @CookieConsumer decorator).
 * Returns array of { name, headerEcho?, valueSubstitutions? }.
 */
function scanOperationCookieConsumes(op) {
  const consumes = op['x-cookie-consumes'];
  if (!Array.isArray(consumes)) return [];
  return consumes.filter((c) => c && typeof c === 'object' && c.name);
}

/**
 * Extract value substitution declarations from an operation's parameters
 * and requestBody schema.
 *
 * Declaration vehicles (all via `x-cookie-value-source: { cookieName: '...' }`):
 *   P1: parameter (in=header|query) with x-cookie-value-source
 *   P2: requestBody schema property with x-cookie-value-source
 *   P3: x-cookie-consumes entry with valueSubstitution field
 *
 * Returns array of { cookieName, target: { in, name } }.
 */
function extractValueSubstitutions(spec, op) {
  const subs = [];

  // P1: Scan operation parameters for x-cookie-value-source
  const params = op.parameters;
  if (Array.isArray(params)) {
    for (const rawParam of params) {
      const param = resolveRef(spec, rawParam);
      if (!param || typeof param !== 'object') continue;
      const source = param['x-cookie-value-source'];
      if (!source || typeof source !== 'object' || !source.cookieName) continue;
      if (param.in === 'header' || param.in === 'query') {
        subs.push({
          cookieName: source.cookieName,
          target: { in: param.in, name: param.name },
        });
      }
    }
  }

  // P2: Scan requestBody schema properties for x-cookie-value-source
  const requestBody = op.requestBody;
  if (requestBody && typeof requestBody === 'object') {
    const content = requestBody.content;
    if (content && typeof content === 'object') {
      const jsonContent = content['application/json'];
      if (jsonContent && typeof jsonContent === 'object') {
        const rawSchema = jsonContent.schema;
        const schema = resolveRef(spec, rawSchema);
        if (schema && typeof schema === 'object' && schema.properties) {
          for (const [propName, rawPropSchema] of Object.entries(schema.properties)) {
            const propSchema = resolveRef(spec, rawPropSchema);
            if (!propSchema || typeof propSchema !== 'object') continue;
            const source = propSchema['x-cookie-value-source'];
            if (!source || typeof source !== 'object' || !source.cookieName) continue;
            subs.push({
              cookieName: source.cookieName,
              target: { in: 'body', name: `$.${propName}` },
            });
          }
        }
      }
    }
  }

  // P3: x-cookie-consumes entries with valueSubstitution field
  const consumes = op['x-cookie-consumes'];
  if (Array.isArray(consumes)) {
    for (const entry of consumes) {
      if (!entry || typeof entry !== 'object') continue;
      const vs = entry.valueSubstitution;
      if (!vs || typeof vs !== 'object') continue;
      if (!vs.cookieName || !vs.target || typeof vs.target !== 'object') continue;
      if (!vs.target.in || !vs.target.name) continue;
      subs.push({
        cookieName: vs.cookieName,
        target: { in: vs.target.in, name: vs.target.name },
      });
    }
  }

  return subs;
}

/**
 * Check if an operation's security[] references a cookie scheme.
 * Returns array of matching schemeName strings.
 */
function getOperationCookieSchemeRefs(op, cookieSchemes) {
  const security = op.security;
  if (!Array.isArray(security)) return [];
  const refs = [];
  for (const req of security) {
    if (!req || typeof req !== 'object') continue;
    for (const schemeName of Object.keys(req)) {
      if (cookieSchemes.has(schemeName)) {
        refs.push(schemeName);
      }
    }
  }
  return refs;
}

// ---------------------------------------------------------------------------
// Attribute validation
// ---------------------------------------------------------------------------

/**
 * Validate x-cookie-attrs declaration types.
 * Returns array of { field, expected, actual } for each invalid entry.
 */
function validateAttrs(attrs) {
  if (!attrs || typeof attrs !== 'object') return [];
  const errors = [];
  const validators = {
    httpOnly: (v) => typeof v === 'boolean',
    secure: (v) => typeof v === 'boolean',
    sameSite: (v) => typeof v === 'string' && VALID_SAMESITE.has(v),
    path: (v) => typeof v === 'string',
    domain: (v) => typeof v === 'string',
    maxAge: (v) => typeof v === 'number',
  };

  for (const [field, value] of Object.entries(attrs)) {
    const validator = validators[field];
    if (validator && !validator(value)) {
      errors.push({ field, expected: typeof value === 'string' ? `valid ${field}` : `typeof ${field}`, actual: value });
    }
  }
  return errors;
}

/**
 * Validate __Host- prefix requirements per RFC 6265bis.
 * Returns array of violation descriptions.
 */
function validateHostPrefix(name, attrs) {
  if (!name || !name.startsWith('__Host-')) return [];
  const violations = [];
  if (!attrs || typeof attrs !== 'object') {
    violations.push('__Host- prefix requires explicit attrs declaration with Path=/, Secure=true, no Domain');
    return violations;
  }
  if (attrs.path !== '/') {
    violations.push(`__Host- prefix requires Path=/, got ${JSON.stringify(attrs.path)}`);
  }
  if (attrs.secure !== true) {
    violations.push(`__Host- prefix requires Secure=true, got ${JSON.stringify(attrs.secure)}`);
  }
  if (attrs.domain !== undefined && attrs.domain !== null) {
    violations.push(`__Host- prefix must not set Domain, got ${JSON.stringify(attrs.domain)}`);
  }
  return violations;
}

/**
 * Validate cookie name per RFC 6265 token rules.
 * Returns true if the name is INVALID.
 */
function isCookieNameInvalid(name) {
  if (!name || typeof name !== 'string' || name.length === 0) return true;
  return COOKIE_NAME_INVALID_RE.test(name);
}

// ---------------------------------------------------------------------------
// Request body example extraction (declaration-driven — NEVER synthesized)
// ---------------------------------------------------------------------------

/**
 * Extract a declared request body example from an OpenAPI operation.
 *
 * Priority order (first non-null wins):
 *   1. requestBody.content['application/json'].schema.example
 *   2. requestBody.content['application/json'].example
 *   3. requestBody.content['application/json'].examples[<first-key>].value
 *   4. null (undeclared) — triggers DIAG for POST issuers
 *
 * NEVER synthesizes, generates, or infers from schema shape. Only declared
 * examples are returned. If none exists, returns null.
 *
 * @param {object} spec — full OpenAPI document (for $ref resolution)
 * @param {object} operation — the OpenAPI operation object
 * @returns {unknown|null} — the example value, or null if undeclared
 */
function extractRequestBodyExample(spec, operation) {
  if (!operation || typeof operation !== 'object') return null;

  const requestBody = operation.requestBody;
  if (!requestBody || typeof requestBody !== 'object') return null;

  const content = requestBody.content;
  if (!content || typeof content !== 'object') return null;

  const jsonContent = content['application/json'];
  if (!jsonContent || typeof jsonContent !== 'object') return null;

  // P1: schema.example (resolve $ref on the schema first)
  const rawSchema = jsonContent.schema;
  if (rawSchema) {
    const resolvedSchema = resolveRef(spec, rawSchema);
    if (resolvedSchema && resolvedSchema.example !== undefined) {
      return resolvedSchema.example;
    }
  }

  // P2: content-level example
  if (jsonContent.example !== undefined) {
    return jsonContent.example;
  }

  // P3: content-level examples map — first key's value
  if (jsonContent.examples && typeof jsonContent.examples === 'object') {
    const keys = Object.keys(jsonContent.examples);
    if (keys.length > 0) {
      const first = jsonContent.examples[keys[0]];
      if (first && typeof first === 'object' && first.value !== undefined) {
        return first.value;
      }
    }
  }

  return null;
}

/**
 * Extract the declared success status code (2xx) from an OpenAPI operation.
 *
 * Declaration-driven: reads `operation.responses` keys ONLY. NEVER guesses,
 * NEVER picks a "default", NEVER falls back to a heuristic set.
 *
 * Returns:
 *   - { status: number } — exactly one 2xx response declared
 *   - { ambiguous: true, codes: number[] } — multiple 2xx declared, must
 *     declare which is the canonical success via @HttpCode(N)
 *   - { missing: true } — no 2xx declared at all
 *
 * @param {object} operation — the OpenAPI operation object
 * @returns {{status:number}|{ambiguous:true,codes:number[]}|{missing:true}}
 */
function extractDeclaredSuccessStatus(operation) {
  if (!operation || typeof operation !== 'object' || !operation.responses) {
    return { missing: true };
  }
  const successCodes = Object.keys(operation.responses)
    .filter((c) => /^2\d\d$/.test(c))
    .map((c) => parseInt(c, 10))
    .sort((a, b) => a - b);
  if (successCodes.length === 0) return { missing: true };
  if (successCodes.length > 1) return { ambiguous: true, codes: successCodes };
  return { status: successCodes[0] };
}

// ---------------------------------------------------------------------------
// Main detector
// ---------------------------------------------------------------------------

/**
 * @param {object} openapi — Full OpenAPI document
 * @returns {{ cookieFlows: CookieFlow[], diagnostics: Diagnostic[] }}
 */
function detectCookieFlows(openapi) {
  if (!openapi || typeof openapi !== 'object') {
    return { cookieFlows: [], diagnostics: [] };
  }

  const diagnostics = [];
  const operations = buildOperationList(openapi);
  const cookieSchemes = extractCookieSecuritySchemes(openapi);

  // Accumulate per-cookie data across all operations
  // Key: cookie name
  const cookieMap = new Map();

  function ensureCookie(name) {
    if (!cookieMap.has(name)) {
      cookieMap.set(name, {
        name,
        roles: new Map(), // role → [{ operationId, path, method }]
        issuers: [],
        consumers: [],
        clearers: [],
        rotators: [],
        attrs: null,
        securitySchemeRef: null,
        headerEchoConsumers: [],
      });
    }
    return cookieMap.get(name);
  }

  // Pass 1: Scan all operations for cookie declarations
  for (const { op, path, method } of operations) {
    const operationId = op.operationId || null;
    const opRef = { operationId, path, method };

    // --- P1: securitySchemes apiKey-in-cookie (issuer signal from scheme existence) ---
    // P1 doesn't directly identify issuers — it identifies cookie names+roles
    // that are used as security credentials. We register the scheme ref.

    // --- P2: Response header Set-Cookie with x-cookie-role/name/attrs ---
    const headerDecls = scanResponseHeaders(op, path, method);
    for (const decl of headerDecls) {
      if (decl.role && !decl.name) {
        // DIAG: x-cookie-role present but x-cookie-name absent
        diagnostics.push({
          code: 'COOKIE_NAME_MISSING_FOR_ROLE',
          level: 'error',
          details: {
            role: decl.role,
            operationId,
            path,
            method,
          },
        });
        continue;
      }
      if (!decl.name) continue;

      const cookie = ensureCookie(decl.name);
      if (decl.role) {
        if (!cookie.roles.has(decl.role)) {
          cookie.roles.set(decl.role, []);
        }
        cookie.roles.get(decl.role).push(opRef);
      }

      if (decl.isClear) {
        cookie.clearers.push(opRef);
      } else {
        // This is an issuer (sets a cookie via response header declaration)
        cookie.issuers.push(opRef);
      }

      // Merge attrs (last declaration wins; if attrs are declared on
      // multiple responses, the first non-null one sticks)
      if (decl.attrs && typeof decl.attrs === 'object' && !cookie.attrs) {
        cookie.attrs = decl.attrs;
      }
    }

    // --- P3: operation x-cookie-roles (from @CookieRole decorator) ---
    const opRoles = scanOperationCookieRoles(op);
    for (const { name, role } of opRoles) {
      if (!name) continue;
      const cookie = ensureCookie(name);
      if (role) {
        if (!cookie.roles.has(role)) {
          cookie.roles.set(role, []);
        }
        cookie.roles.get(role).push(opRef);
      }
      // @CookieRole on an operation means it's an issuer
      // (unless already recorded via P2 for the same operation)
      const alreadyIssuer = cookie.issuers.some(
        (i) => i.operationId === operationId && i.path === path && i.method === method,
      );
      // Check if it's a clearer (recorded from response headers)
      const isClearer = cookie.clearers.some(
        (c) => c.operationId === operationId && c.path === path && c.method === method,
      );
      if (!alreadyIssuer && !isClearer) {
        cookie.issuers.push(opRef);
      }
    }

    // --- C1: security[] referencing a cookie scheme ---
    const schemeRefs = getOperationCookieSchemeRefs(op, cookieSchemes);
    for (const schemeName of schemeRefs) {
      const schemeInfo = cookieSchemes.get(schemeName);
      const cookie = ensureCookie(schemeInfo.cookieName);
      cookie.securitySchemeRef = schemeName;
      // Security ref = consumer
      const alreadyConsumer = cookie.consumers.some(
        (c) => c.operationId === operationId && c.path === path && c.method === method,
      );
      if (!alreadyConsumer) {
        cookie.consumers.push(opRef);
      }
      // Also register the role from the scheme if not already set
      if (schemeInfo.role && !cookie.roles.has(schemeInfo.role)) {
        cookie.roles.set(schemeInfo.role, []);
      }
    }

    // --- C3: operation x-cookie-consumes (from @CookieConsumer) ---
    const opConsumes = scanOperationCookieConsumes(op);
    for (const { name, headerEcho } of opConsumes) {
      const cookie = ensureCookie(name);
      const consumerEntry = { ...opRef };
      if (headerEcho) {
        consumerEntry.headerEcho = headerEcho;
        cookie.headerEchoConsumers.push({ ...opRef, headerEcho });
      }
      const alreadyConsumer = cookie.consumers.some(
        (c) => c.operationId === operationId && c.path === path && c.method === method,
      );
      if (!alreadyConsumer) {
        cookie.consumers.push(consumerEntry);
      }
    }
  }

  // Pass 2: Also register P1 scheme cookies that might not have appeared
  // via P2/P3/C1 yet (e.g. a scheme exists but no operation references it)
  for (const [schemeName, schemeInfo] of cookieSchemes) {
    const cookie = ensureCookie(schemeInfo.cookieName);
    cookie.securitySchemeRef = cookie.securitySchemeRef || schemeName;
    if (schemeInfo.role && !cookie.roles.has(schemeInfo.role)) {
      cookie.roles.set(schemeInfo.role, []);
    }
  }

  // Pass 3: Identify rotators (operations that both issue AND consume same cookie)
  for (const [, cookie] of cookieMap) {
    for (const issuer of cookie.issuers) {
      const isAlsoConsumer = cookie.consumers.some(
        (c) => c.operationId === issuer.operationId && c.path === issuer.path && c.method === issuer.method,
      );
      if (isAlsoConsumer) {
        cookie.rotators.push(issuer);
      }
    }
  }

  // Pass 4: Build final cookieFlows entries + diagnostics
  const cookieFlows = [];

  for (const [name, cookie] of cookieMap) {
    const entryDiags = [];

    // Resolve role — must be exactly one
    let role = null;
    const roleKeys = [...cookie.roles.keys()].filter((r) => VALID_ROLES.has(r));

    if (roleKeys.length === 0) {
      // No role declared via P2/P3. Use the scheme's x-cookie-role if available.
      if (cookie.securitySchemeRef && cookieSchemes.has(cookie.securitySchemeRef)) {
        const schemeRole = cookieSchemes.get(cookie.securitySchemeRef).role;
        if (schemeRole && VALID_ROLES.has(schemeRole)) {
          role = schemeRole;
        } else if (cookie.securitySchemeRef) {
          // Scheme exists but has no x-cookie-role — DIAG, refuse to guess.
          entryDiags.push({
            code: 'COOKIE_SCHEME_ROLE_UNDECLARED',
            level: 'error',
            details: {
              name,
              schemeName: cookie.securitySchemeRef,
              reason: 'apiKey-in-cookie scheme missing x-cookie-role extension; add x-cookie-role to the securityScheme definition',
            },
          });
        }
      }
    } else if (roleKeys.length === 1) {
      role = roleKeys[0];
    } else {
      // DIAG: COOKIE_ROLE_AMBIGUOUS — same name, different roles
      role = roleKeys[0]; // pick first but flag it
      entryDiags.push({
        code: 'COOKIE_ROLE_AMBIGUOUS',
        level: 'error',
        details: {
          name,
          roles: roleKeys,
          operationIds: roleKeys.flatMap((r) =>
            (cookie.roles.get(r) || []).map((o) => o.operationId),
          ),
        },
      });
    }

    // DIAG: COOKIE_ISSUER_AMBIGUOUS — same name+role, ≥2 issuers
    // (excludes rotators — a rotator is expected to also be an issuer)
    const pureIssuers = cookie.issuers.filter(
      (i) => !cookie.rotators.some(
        (r) => r.operationId === i.operationId && r.path === i.path && r.method === i.method,
      ),
    );
    if (pureIssuers.length > 1 && role && role !== 'custom') {
      entryDiags.push({
        code: 'COOKIE_ISSUER_AMBIGUOUS',
        level: 'warn',
        details: {
          name,
          role,
          issuers: pureIssuers.map((i) => i.operationId),
        },
      });
    }

    // DIAG: COOKIE_NAME_INVALID — RFC 6265 token rules
    if (isCookieNameInvalid(name)) {
      entryDiags.push({
        code: 'COOKIE_NAME_INVALID',
        level: 'error',
        details: { name },
      });
    }

    // DIAG: COOKIE_ATTR_DECLARATION_INVALID — wrong types in attrs
    if (cookie.attrs) {
      const attrErrors = validateAttrs(cookie.attrs);
      if (attrErrors.length > 0) {
        entryDiags.push({
          code: 'COOKIE_ATTR_DECLARATION_INVALID',
          level: 'error',
          details: {
            name,
            errors: attrErrors,
          },
        });
      }
    }

    // DIAG: COOKIE_HOST_PREFIX_INVALID — __Host- prefix rules
    const hostViolations = validateHostPrefix(name, cookie.attrs);
    if (hostViolations.length > 0) {
      entryDiags.push({
        code: 'COOKIE_HOST_PREFIX_INVALID',
        level: 'error',
        details: {
          name,
          violations: hostViolations,
        },
      });
    }

    // DIAG: COOKIE_SAMESITE_NONE_WITHOUT_SECURE
    if (
      cookie.attrs &&
      typeof cookie.attrs === 'object' &&
      cookie.attrs.sameSite === 'None' &&
      cookie.attrs.secure !== true
    ) {
      entryDiags.push({
        code: 'COOKIE_SAMESITE_NONE_WITHOUT_SECURE',
        level: 'error',
        details: {
          name,
          sameSite: cookie.attrs.sameSite,
          secure: cookie.attrs.secure,
        },
      });
    }

    // DIAG: COOKIE_CSRF_HEADER_NOT_DECLARED — csrf role without headerEcho consumer
    if (role === 'csrf-double-submit' && cookie.headerEchoConsumers.length === 0) {
      entryDiags.push({
        code: 'COOKIE_CSRF_HEADER_NOT_DECLARED',
        level: 'warn',
        details: {
          name,
          role,
          reason: 'csrf-double-submit role declared but no consumer with headerEcho exists',
        },
      });
    }

    // DIAG: COOKIE_HAS_NO_CONSUMER — issuer without any consumer
    if (cookie.issuers.length > 0 && cookie.consumers.length === 0) {
      entryDiags.push({
        code: 'COOKIE_HAS_NO_CONSUMER',
        level: 'warn',
        details: {
          name,
          issuers: cookie.issuers.map((i) => i.operationId),
        },
      });
    }

    // DIAG: COOKIE_HAS_NO_ISSUER — consumer without any issuer
    if (cookie.consumers.length > 0 && cookie.issuers.length === 0) {
      entryDiags.push({
        code: 'COOKIE_HAS_NO_ISSUER',
        level: 'error',
        details: {
          name,
          consumers: cookie.consumers.map((c) => c.operationId),
        },
      });
    }

    // Only include cookie if it has at least one declaration signal
    if (cookie.issuers.length === 0 && cookie.consumers.length === 0 && cookie.clearers.length === 0 && !cookie.securitySchemeRef) {
      // Push any diags from this cookie and skip
      for (const d of entryDiags) diagnostics.push(d);
      continue;
    }

    const flow = {
      name,
      role: role || null,
      issuers: cookie.issuers.map((i) => {
        const ref = { operationId: i.operationId, path: i.path, method: i.method };

        // Extract declared requestBodyExample from the OpenAPI operation.
        // Look up the operation object from paths by path + method.
        const pathItem = (openapi.paths || {})[i.path];
        const op = pathItem && pathItem[i.method.toLowerCase()];
        const methodUpper = i.method.toUpperCase();

        // Extract declared success status (2xx) — declaration-driven only.
        // Cookie-emitter requires this to assert exact status; no fallback.
        const declared = extractDeclaredSuccessStatus(op);
        if (declared.status !== undefined) {
          ref.declaredStatus = declared.status;
        } else if (declared.ambiguous) {
          ref.declaredStatus = null;
          entryDiags.push({
            code: 'COOKIE_ISSUER_SUCCESS_STATUS_AMBIGUOUS',
            level: 'error',
            details: {
              operationId: i.operationId,
              cookieName: name,
              role: role || null,
              declaredCodes: declared.codes,
              reason: `Cookie issuer declares multiple 2xx responses (${declared.codes.join(', ')}). Add @HttpCode(N) to fix the canonical success code.`,
            },
          });
        } else {
          ref.declaredStatus = null;
          entryDiags.push({
            code: 'COOKIE_ISSUER_SUCCESS_STATUS_MISSING',
            level: 'error',
            details: {
              operationId: i.operationId,
              cookieName: name,
              role: role || null,
              reason: `Cookie issuer has no declared 2xx response. Add @HttpCode(N) and @ApiResponse({ status: N }) to declare the success code.`,
            },
          });
        }

        if (op && (methodUpper === 'POST' || methodUpper === 'PUT' || methodUpper === 'PATCH')) {
          const example = extractRequestBodyExample(openapi, op);
          if (example !== null) {
            ref.requestBodyExample = example;
          } else {
            // POST/PUT/PATCH issuer with requestBody schema but no declared example
            // Check if there IS a requestBody defined (schema exists but example missing)
            const hasRequestBody = op.requestBody &&
              op.requestBody.content &&
              op.requestBody.content['application/json'] &&
              op.requestBody.content['application/json'].schema;
            if (hasRequestBody) {
              ref.requestBodyExample = null;
              entryDiags.push({
                code: 'COOKIE_ISSUER_BODY_EXAMPLE_UNDECLARED',
                level: 'warn',
                details: {
                  operationId: i.operationId,
                  cookieName: name,
                  role: role || null,
                  reason: 'POST/PUT/PATCH cookie issuer has requestBody schema but no declared example. Add schema.example, content example, or content examples[*].value to the OpenAPI operation.',
                },
              });
            }
            // No requestBody at all for POST — set null, no DIAG (unusual but valid for POST with no body)
          }
        }
        // GET/DELETE/etc. issuers: requestBodyExample stays undefined (not applicable)

        // Extract declared query param examples for GET issuers.
        // Declaration-driven: reads `example` from OpenAPI parameter objects.
        if (op && (methodUpper === 'GET' || methodUpper === 'DELETE' || methodUpper === 'HEAD')) {
          const params = Array.isArray(op.parameters) ? op.parameters : [];
          const queryParams = params.filter(
            (p) => p && typeof p === 'object' && p.in === 'query' && typeof p.name === 'string'
          );
          const queryExample = {};
          for (const qp of queryParams) {
            if (qp.example !== undefined) {
              queryExample[qp.name] = qp.example;
            } else if (qp.schema && qp.schema.example !== undefined) {
              queryExample[qp.name] = qp.schema.example;
            }
          }
          if (Object.keys(queryExample).length > 0) {
            ref.queryExample = queryExample;
          }
        }

        return ref;
      }),
      consumers: cookie.consumers.map((c) => {
        const entry = { operationId: c.operationId, path: c.path, method: c.method };
        if (c.headerEcho) entry.headerEcho = c.headerEcho;

        // Extract value substitutions from the operation's OpenAPI declarations
        const pathItem = (openapi.paths || {})[c.path];
        const consumerOp = pathItem && pathItem[c.method.toLowerCase()];
        if (consumerOp) {
          const subs = extractValueSubstitutions(openapi, consumerOp);
          // Filter to only substitutions referencing this cookie
          const relevant = subs.filter((s) => s.cookieName === name);
          if (relevant.length > 0) {
            entry.valueSubstitutions = relevant;
          }
        }

        return entry;
      }),
      clearers: cookie.clearers.map((c) => {
        const ref = { operationId: c.operationId, path: c.path, method: c.method };
        const pathItem = (openapi.paths || {})[c.path];
        const op = pathItem && pathItem[c.method.toLowerCase()];
        const declared = extractDeclaredSuccessStatus(op);
        if (declared.status !== undefined) {
          ref.declaredStatus = declared.status;
        } else if (declared.ambiguous) {
          ref.declaredStatus = null;
          entryDiags.push({
            code: 'COOKIE_CLEARER_SUCCESS_STATUS_AMBIGUOUS',
            level: 'error',
            details: {
              operationId: c.operationId,
              cookieName: name,
              role: role || null,
              declaredCodes: declared.codes,
              reason: `Cookie clearer declares multiple 2xx responses (${declared.codes.join(', ')}). Add @HttpCode(N) to fix the canonical success code.`,
            },
          });
        } else {
          ref.declaredStatus = null;
          entryDiags.push({
            code: 'COOKIE_CLEARER_SUCCESS_STATUS_MISSING',
            level: 'error',
            details: {
              operationId: c.operationId,
              cookieName: name,
              role: role || null,
              reason: `Cookie clearer has no declared 2xx response. Add @HttpCode(N) and @ApiResponse({ status: N }) to declare the success code.`,
            },
          });
        }
        return ref;
      }),
      rotators: cookie.rotators.map((r) => {
        const ref = { operationId: r.operationId, path: r.path, method: r.method };
        const pathItem = (openapi.paths || {})[r.path];
        const op = pathItem && pathItem[r.method.toLowerCase()];
        const declared = extractDeclaredSuccessStatus(op);
        if (declared.status !== undefined) {
          ref.declaredStatus = declared.status;
        } else if (declared.ambiguous) {
          ref.declaredStatus = null;
          entryDiags.push({
            code: 'COOKIE_ROTATOR_SUCCESS_STATUS_AMBIGUOUS',
            level: 'error',
            details: {
              operationId: r.operationId,
              cookieName: name,
              role: role || null,
              declaredCodes: declared.codes,
              reason: `Cookie rotator declares multiple 2xx responses (${declared.codes.join(', ')}). Add @HttpCode(N) to fix the canonical success code.`,
            },
          });
        } else {
          ref.declaredStatus = null;
          entryDiags.push({
            code: 'COOKIE_ROTATOR_SUCCESS_STATUS_MISSING',
            level: 'error',
            details: {
              operationId: r.operationId,
              cookieName: name,
              role: role || null,
              reason: `Cookie rotator has no declared 2xx response. Add @HttpCode(N) and @ApiResponse({ status: N }) to declare the success code.`,
            },
          });
        }
        return ref;
      }),
      attrs: cookie.attrs || {},
      securitySchemeRef: cookie.securitySchemeRef || null,
      diagnostics: entryDiags,
    };

    // DIAG: COOKIE_VALUE_SUBSTITUTION_UNDECLARED — consumer exists, capture+consume
    // relationship implies value substitution needed, but no x-cookie-value-source
    // declared on the consumer's parameters or body schema. Emitted per-consumer.
    for (const consumer of flow.consumers) {
      // Only check consumers that don't already have headerEcho (those use
      // replay-cookie-as-header) and don't have valueSubstitutions.
      if (consumer.headerEcho) continue;
      if (consumer.valueSubstitutions && consumer.valueSubstitutions.length > 0) continue;

      // Check if the consumer's operation has query/header parameters that
      // could plausibly need cookie value injection but lack the declaration.
      // We scan the operation's parameters for any that share the cookie name
      // pattern — but we do NOT guess or auto-wire. We only emit the DIAG.
      const pathItem = (openapi.paths || {})[consumer.path];
      const consumerOp = pathItem && pathItem[consumer.method.toLowerCase()];
      if (consumerOp) {
        const allSubs = extractValueSubstitutions(openapi, consumerOp);
        // If there are subs for OTHER cookies but not this one, that's fine.
        // Only DIAG if zero subs exist for this cookie AND the operation has
        // parameters that could receive a cookie value (non-path params).
        const opParams = consumerOp.parameters;
        const hasNonPathParams = Array.isArray(opParams) && opParams.some((p) => {
          const resolved = resolveRef(openapi, p);
          return resolved && resolved.in !== 'path';
        });
        if (hasNonPathParams) {
          entryDiags.push({
            code: 'COOKIE_VALUE_SUBSTITUTION_UNDECLARED',
            level: 'warn',
            details: {
              name,
              consumerOperationId: consumer.operationId,
              consumerPath: consumer.path,
              consumerMethod: consumer.method,
              reason: `Consumer has non-path parameters but no x-cookie-value-source declared for cookie "${name}". Add x-cookie-value-source: { cookieName: "${name}" } to the relevant parameter.`,
            },
          });
        }
      }
    }

    cookieFlows.push(flow);

    // Also push entry-level diags to top-level diagnostics
    for (const d of entryDiags) {
      diagnostics.push(d);
    }
  }

  return { cookieFlows, diagnostics };
}

module.exports = { detectCookieFlows, extractRequestBodyExample, extractValueSubstitutions };
