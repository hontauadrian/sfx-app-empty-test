# Cookies

## Why this pattern matters

Cookies carry load-bearing state for refresh-token rotation, session auth,
CSRF double-submit, OAuth state, tenant scope, locale, theme, and feature
flags. The probe today reads tokens and state **only from response bodies
and request headers**. If a cookie is the transport, the probe needs
explicit declarations to know what each cookie means, who issues it, who
consumes it, and what attributes it must have. Without these declarations
the probe cannot verify the flow end-to-end and will emit a diagnostic
rather than guess.

All cookie detection is **declaration-driven**. The probe reads the
declarations you write and verifies the runtime behaviour matches. It never
guesses cookie purpose from names, paths, or response shapes. This is the
NEVER-HEURISTIC rule: if something is ambiguous, the probe emits a DIAG
and stays red until you disambiguate declaratively.

## The cookie roles

Each cookie has at most one role. The role determines which step kinds the
probe emits and what assertions fire.

---

### refresh-token

**What it is.** An HttpOnly cookie carrying the refresh credential. The
client never reads its value directly; the server rotates it on each
refresh call.

**How to declare.**

**(P2) OpenAPI extension on response header (preferred):**

```ts
@Post('login')
@ApiResponse({
  status: 200,
  type: AuthResponseDto,
  headers: {
    'Set-Cookie': {
      schema: { type: 'string' },
      'x-cookie-role': 'refresh-token',
      'x-cookie-name': 'refresh_token',
      'x-cookie-attrs': {
        httpOnly: true,
        secure: true,
        sameSite: 'Strict',
        path: '/',
        maxAge: 604800,
      },
    },
  },
})
```

**(P3) Custom decorator:**

```ts
@Post('login')
@CookieRole('refresh_token', 'refresh-token')
login() { /* ... */ }
```

P1 (`securitySchemes` with `in: 'cookie'`) does NOT apply to
`refresh-token` because it is not a security primitive in the OpenAPI
sense. Use P2 or P3.

**Declare consumers** on every endpoint that reads this cookie:

```ts
@Post('refresh')
@CookieConsumer('refresh_token')
refresh() { /* ... */ }
```

**What the probe verifies.**

| Step kind | Assertion |
|---|---|
| `capture-cookie` | Response contained `Set-Cookie: refresh_token=...`; jar captured it. |
| `assert-cookie-rotated` | After refresh call, the cookie value differs from the prior capture. |
| `assert-cookie-attrs` | Runtime attributes match declared `x-cookie-attrs` (or default-strict: `httpOnly: true`). |
| `assert-cookie-cleared` | After logout/clear endpoint, cookie is expired (`Max-Age=0` or `Expires` in the past). |
| `tamper-cookie` | Tampered cookie sent to consumer endpoint; expect `401`. |
| `omit-cookie` | No cookie sent to consumer endpoint; expect `401`. |

**DIAG codes:** `COOKIE_NAME_MISSING_FOR_ROLE` (if `x-cookie-role` present
but `x-cookie-name` omitted), `COOKIE_HAS_NO_CONSUMER` (warning, if no
endpoint declares `@CookieConsumer` for this name),
`COOKIE_ATTR_DECLARATION_INVALID` (if `x-cookie-attrs` has wrong types).

---

### session

**What it is.** A server session ID cookie (e.g. `connect.sid`,
`_session`). Typically HttpOnly. The server validates the session on each
request; no Bearer token involved.

**How to declare.**

**(P1) Security scheme with `x-cookie-role` (preferred for session cookies):**

```ts
// swagger.ts
const doc = new DocumentBuilder()
  .addApiKey(
    { type: 'apiKey', in: 'cookie', name: 'connect.sid' },
    'sessionCookie',
  )
  .build();

// Post-build: declare the role explicitly (REQUIRED)
const scheme = doc.components?.securitySchemes?.['sessionCookie'];
(scheme as Record<string, unknown>)['x-cookie-role'] = 'session';
```

The role is read EXCLUSIVELY from `x-cookie-role` on the scheme.
Scheme name is NOT used as a detection signal (NEVER-HEURISTIC rule).
If `x-cookie-role` is missing, the detector emits
`COOKIE_SCHEME_ROLE_UNDECLARED` and refuses to guess.

**(P2) OpenAPI extension:**

```ts
@Post('login')
@ApiResponse({
  status: 200,
  headers: {
    'Set-Cookie': {
      schema: { type: 'string' },
      'x-cookie-role': 'session',
      'x-cookie-name': 'connect.sid',
    },
  },
})
```

**(P3) Custom decorator:**

```ts
@Post('login')
@CookieRole('connect.sid', 'session')
login() { /* ... */ }
```

**Declare consumers:**

```ts
@Get('protected')
@CookieConsumer('connect.sid')
@ApiSecurity('sessionCookie')   // if using P1
protected() { /* ... */ }
```

**What the probe verifies.**

| Step kind | Assertion |
|---|---|
| `capture-cookie` | Login response sets the session cookie. |
| `assert-cookie-attrs` | Attributes match declaration (default-strict: `httpOnly: true`). |
| `assert-cookie-cleared` | Logout response expires the cookie. |
| `omit-cookie` | Request without cookie to protected endpoint; expect `401`. |
| `tamper-cookie` | Tampered session ID; expect `401`. |

**DIAG codes:** `COOKIE_ROLE_AMBIGUOUS` (if two cookies both declare role
`session`), `COOKIE_HAS_NO_CONSUMER`.

---

### csrf-double-submit

**What it is.** A token cookie that the client must echo back in a request
header. The server compares the cookie value with the header value. This
role extends the CSRF pattern documented in `csrf.md`.

**How to declare.**

**(P1) Security scheme with `x-cookie-role`:**

```ts
const doc = new DocumentBuilder()
  .addApiKey(
    { type: 'apiKey', in: 'cookie', name: 'XSRF-TOKEN' },
    'csrfCookie',
  )
  .build();

// Post-build: declare the role explicitly (REQUIRED)
const scheme = doc.components?.securitySchemes?.['csrfCookie'];
(scheme as Record<string, unknown>)['x-cookie-role'] = 'csrf-double-submit';
```

**(P2) OpenAPI extension:**

```ts
@Get('csrf-token')
@ApiResponse({
  status: 200,
  headers: {
    'Set-Cookie': {
      schema: { type: 'string' },
      'x-cookie-role': 'csrf-double-submit',
      'x-cookie-name': 'XSRF-TOKEN',
    },
  },
})
```

**(P3) Custom decorator:**

```ts
@Get('csrf-token')
@CookieRole('XSRF-TOKEN', 'csrf-double-submit')
issueToken() { /* ... */ }
```

**Declare the consumer with the header echo pairing (REQUIRED):**

```ts
@Post('submit')
@CookieConsumer.csrfDouble('XSRF-TOKEN', 'X-CSRF-Token')
submit() { /* ... */ }
```

The `headerName` parameter tells the probe which request header to echo
the cookie value into. This pairing is mandatory. Without it the detector
emits `COOKIE_CSRF_HEADER_NOT_DECLARED`.

**What the probe verifies.**

| Step kind | Assertion |
|---|---|
| `capture-cookie` | Issuer response sets the CSRF cookie. |
| `replay-cookie-as-header` | Cookie value echoed in the declared header on protected POST. |
| `assert-cookie-attrs` | Attributes match if declared. |
| `omit-cookie` | No cookie and no header; expect `403`. |
| `tamper-cookie` | Cookie present but header value differs (mismatch); expect `403`. |

**DIAG codes:** `COOKIE_CSRF_HEADER_NOT_DECLARED` (no consumer declares
the header echo), `COOKIE_ROLE_AMBIGUOUS`.

Note: `csrf-double-submit` is equivalent to value-substitution with target
`{ in: 'header', name: 'X-CSRF-Token' }`. The `.csrfDouble()` helper is
sugar for `.withValueSource()`.

---

### value-substitution

**What it solves.** When a consumer reads the cookie value from a query
param, header, or body field (NOT from `req.cookies`), the probe must
ferry the captured value into the next request explicitly. Without a
declaration the probe does not know where to put the value.

**Three declaration vehicles:**

**(P1) OpenAPI parameter `x-cookie-value-source` extension:**

```ts
@ApiQuery({
  name: 'state',
  type: String,
  required: true,
  'x-cookie-value-source': { cookieName: 'oauth_state' },
})
@Get('callback')
@CookieConsumer('oauth_state')
callback() { /* ... */ }
```

**(P2) OpenAPI requestBody schema property extension:**

```ts
// In the body DTO's OpenAPI schema:
// { "properties": { "csrf_token": { "type": "string", "x-cookie-value-source": { "cookieName": "XSRF-TOKEN" } } } }
```

**(P3) `@CookieConsumer.withValueSource` decorator helper (preferred for NestJS):**

```ts
@Get('callback')
@CookieConsumer.withValueSource('oauth_state', { in: 'query', name: 'state' })
callback() { /* ... */ }
```

**Mechanism.** `capture-cookie` writes the value to
`ctx.bindings['cookie:<name>:<key>']`. The sigil
`${cookie:<name>:<key>}` substitutes the value into the next API step's
query, headers, or body.

**DIAG code:** `COOKIE_VALUE_SUBSTITUTION_UNDECLARED` fires when a
consumer has non-path params but no `x-cookie-value-source` declaration.

**Worked example: OAuth callback with value-substitution.**

Happy chain (state matches):

```json
[
  { "kind": "request", "method": "GET", "path": "/authorize" },
  { "kind": "capture-cookie", "name": "oauth_state" },
  { "kind": "request", "method": "GET", "path": "/callback?state=${cookie:oauth_state:value}&code=abc" },
  { "kind": "assert-status", "expected": 200 }
]
```

Tampered chain (state mismatch):

```json
[
  { "kind": "request", "method": "GET", "path": "/authorize" },
  { "kind": "capture-cookie", "name": "oauth_state" },
  { "kind": "tamper-cookie", "name": "oauth_state", "transform": "flip-bit" },
  { "kind": "request", "method": "GET", "path": "/callback?state=${cookie:oauth_state:value}&code=abc" },
  { "kind": "assert-status", "expected": [400, 403] }
]
```

---

### oauth-state

**What it is.** An anti-CSRF nonce set during the OAuth `/authorize`
redirect, validated on `/callback`. Prevents authorization code injection.
This role extends the OAuth pattern documented in `oauth.md`.

**How to declare.**

**(P1) Security scheme with `x-cookie-role`:**

```ts
const doc = new DocumentBuilder()
  .addApiKey(
    { type: 'apiKey', in: 'cookie', name: 'oauth_state' },
    'oauthStateCookie',
  )
  .build();

// Post-build: declare the role explicitly (REQUIRED)
const scheme = doc.components?.securitySchemes?.['oauthStateCookie'];
(scheme as Record<string, unknown>)['x-cookie-role'] = 'oauth-state';
```

**(P2) OpenAPI extension (preferred for OAuth state):**

```ts
@Get('authorize')
@ApiResponse({
  status: 302,
  headers: {
    'Set-Cookie': {
      schema: { type: 'string' },
      'x-cookie-role': 'oauth-state',
      'x-cookie-name': 'oauth_state',
    },
  },
})
```

**(P3) Custom decorator:**

```ts
@Get('authorize')
@CookieRole('oauth_state', 'oauth-state')
authorize() { /* ... */ }
```

**Declare the consumer on the callback:**

```ts
@Get('callback')
@CookieConsumer('oauth_state')
callback() { /* ... */ }
```

**What the probe verifies.**

| Step kind | Assertion |
|---|---|
| `capture-cookie` | Authorize response sets the state cookie. |
| `assert-cookie-attrs` | Attributes match if declared. |
| `tamper-cookie` | Tampered state cookie on callback; expect `4xx`. |
| `omit-cookie` | No state cookie on callback; expect `4xx`. |

**DIAG codes:** `COOKIE_ISSUER_AMBIGUOUS` (two endpoints both issuing
this role), `COOKIE_HAS_NO_CONSUMER`.

If your callback reads `state` from a query param (the standard OAuth
shape), declare the substitution via
`@CookieConsumer.withValueSource('oauth_state', { in: 'query', name: 'state' })`.
See the value-substitution section above.

---

### tenant-scope

**What it is.** An implicit tenant identifier cookie set on login or
tenant switch. Subsequent requests carry the tenant context without an
explicit header. This role extends the multi-tenancy pattern in
`multi-tenancy.md`.

**How to declare.**

P1 does NOT apply (tenant scope is not a security scheme).

**(P2) OpenAPI extension (preferred):**

```ts
@Post('login')
@ApiResponse({
  status: 200,
  headers: {
    'Set-Cookie': {
      schema: { type: 'string' },
      'x-cookie-role': 'tenant-scope',
      'x-cookie-name': 'tenant',
    },
  },
})
```

**(P3) Custom decorator:**

```ts
@Post('login')
@CookieRole('tenant', 'tenant-scope')
login() { /* ... */ }
```

If the tenant-set issuer is POST, declare a body example:

```ts
@Post('set-tenant')
@CookieRole('tenant', 'tenant-scope')
@ApiBody({ examples: { default: { value: { tenantId: 'tenant-a' } } } })
setTenant() { /* ... */ }
```

**Declare consumers:**

```ts
@Get('resources')
@CookieConsumer('tenant')
list() { /* ... */ }
```

**What the probe verifies.**

| Step kind | Assertion |
|---|---|
| `capture-cookie` | Login response sets the tenant cookie. |
| `assert-cookie-attrs` | Attributes match if declared. |
| `omit-cookie` | No tenant cookie; expect `4xx`. |

The probe also verifies tenant isolation: login as tenant A, access
resource (expect tenant-A data), login as tenant B, access same resource
(expect tenant-B data, NOT tenant-A). Finally, omit the cookie and expect
rejection.

**DIAG codes:** `COOKIE_ROLE_AMBIGUOUS`, `COOKIE_HAS_NO_CONSUMER`.

---

### locale

**What it is.** A language preference cookie (e.g. `lang=fr`). Page render
or API response depends on its value.

**How to declare.**

**(P2) OpenAPI extension:**

```ts
@Get('set-locale')
@ApiResponse({
  status: 200,
  headers: {
    'Set-Cookie': {
      schema: { type: 'string' },
      'x-cookie-role': 'locale',
      'x-cookie-name': 'lang',
    },
  },
})
```

**(P3) Custom decorator:**

```ts
@ApiQuery({ name: 'lang', type: String, required: true, example: 'en' })
@Get('set-locale')
@CookieRole('lang', 'locale')
setLocale() { /* ... */ }
```

> **GET issuer query-example requirement.** If your issuer is
> GET/DELETE/HEAD with required query params, every required param MUST
> have `@ApiQuery({ example: ... })`. The detector reads
> `parameter.example` or `parameter.schema.example` — without it the
> probe cannot synthesize a valid request and the flow fails.

**What the probe verifies.**

| Step kind | Assertion |
|---|---|
| `capture-cookie` | Response sets the locale cookie. |
| `assert-cookie-attrs` | Attributes match if declared. |
| `omit-cookie` | Without cookie, response uses default locale. |

**DIAG codes:** `COOKIE_ROLE_AMBIGUOUS`.

---

### theme

**What it is.** A UI theme preference cookie (e.g. `theme=dark`).

**How to declare.** Same pattern as `locale` — use P2 or P3:

```ts
@ApiQuery({ name: 'theme', type: String, required: true, example: 'dark' })
@Get('set-theme')
@CookieRole('theme', 'theme')
setTheme() { /* ... */ }
```

Or via `x-cookie-role: 'theme'` on the `@ApiResponse` headers.
If the issuer takes required query params, declare `@ApiQuery({ example: ... })` on each (see locale section above).

**What the probe verifies.** Same step kinds as `locale`: `capture-cookie`,
`assert-cookie-attrs`, `omit-cookie`.

**DIAG codes:** `COOKIE_ROLE_AMBIGUOUS`.

---

### feature-flag

**What it is.** A server-controlled feature toggle cookie. The server sets
it; the client sends it back on subsequent requests so the server can gate
behaviour.

**How to declare.** Same pattern as `locale` and `theme` — use P2 or P3:

```ts
@ApiQuery({ name: 'feature', type: String, required: true, example: 'dark_mode' })
@Get('set-feature')
@CookieRole('feature_x', 'feature-flag')
setFeature() { /* ... */ }
```

Or via `x-cookie-role: 'feature-flag'` on the `@ApiResponse` headers.
If the issuer takes required query params, declare `@ApiQuery({ example: ... })` on each (see locale section above).

**What the probe verifies.** Same step kinds as `locale`: `capture-cookie`,
`assert-cookie-attrs`, `omit-cookie`.

**DIAG codes:** `COOKIE_ROLE_AMBIGUOUS`.

---

### custom

**What it is.** A catch-all for cookies the probe should know about but
that have no role-specific assertions. Declare `custom` when your app sets
a cookie that does not fit any role above. The probe will track it in the
jar, assert declared attributes, and warn if it appears at runtime without
a declaration (`COOKIE_UNDECLARED`).

**How to declare.** Use P2 or P3 with `role: 'custom'`:

```ts
@CookieRole('tracking_id', 'custom')
```

**What the probe verifies.** Only `capture-cookie` and
`assert-cookie-attrs` (if attributes declared). No role-specific negative
chains.

---

## Attribute declarations (`x-cookie-attrs`)

Declare cookie attributes so the probe can assert the runtime `Set-Cookie`
header matches your intent. The only accepted declaration is
`x-cookie-attrs` on the `@ApiResponse` header definition.

Full example with every supported attribute:

```ts
@ApiResponse({
  status: 200,
  type: AuthResponseDto,
  headers: {
    'Set-Cookie': {
      schema: { type: 'string' },
      'x-cookie-role': 'refresh-token',
      'x-cookie-name': 'refresh_token',
      'x-cookie-attrs': {
        httpOnly: true,
        secure: true,
        sameSite: 'Strict',   // 'Strict' | 'Lax' | 'None'
        path: '/',
        domain: '.example.com',
        maxAge: 604800,        // seconds
      },
    },
  },
})
```

**Attribute rules:**

- `httpOnly` — boolean. For `refresh-token` and `session` roles, if
  `x-cookie-attrs` is absent the probe auto-asserts `httpOnly: true`
  (default-strict mode, per A2 in the spec). Other roles have no default.
- `secure` — boolean. Required if cookie name uses `__Secure-` or
  `__Host-` prefix.
- `sameSite` — `'Strict'`, `'Lax'`, or `'None'`. If `'None'`, `secure`
  MUST also be `true` or the probe emits
  `COOKIE_SAMESITE_NONE_WITHOUT_SECURE`.
- `path` — string. `__Host-` prefixed cookies MUST declare `path: '/'`.
- `domain` — string. `__Host-` prefixed cookies MUST NOT declare `domain`.
- `maxAge` — number (seconds). The probe does not enforce a minimum or
  maximum, but will assert the runtime value matches the declaration.

If `x-cookie-attrs` contains unknown keys or wrong value types, the
detector emits `COOKIE_ATTR_DECLARATION_INVALID`.

The `schema.pattern` field on the `Set-Cookie` header is informational and
is NOT parsed by the probe. Only `x-cookie-attrs` is the source of truth.

## DIAG reference

| Code | Trigger | Fix |
|---|---|---|
| `COOKIE_ROLE_AMBIGUOUS` | Two cookies with the same `x-cookie-name` declare different roles, or two cookies with different names both claim the same role (e.g. two `refresh-token` cookies). | Remove the conflicting declaration. Each name has one role; each role has one name. |
| `COOKIE_ISSUER_AMBIGUOUS` | Two endpoints both declare they issue a cookie for the same role (e.g. two methods with `@CookieRole('rt', 'refresh-token')`). | Consolidate issuance to one endpoint, or differentiate the cookie names. |
| `COOKIE_NAME_MISSING_FOR_ROLE` | `x-cookie-role` is declared on the response header but `x-cookie-name` is absent. The probe knows the role but not the cookie name. | Add `'x-cookie-name': 'your_cookie_name'` next to the role declaration. |
| `COOKIE_ATTR_DECLARATION_INVALID` | `x-cookie-attrs` has unknown keys (e.g. `httponly` instead of `httpOnly`) or wrong value types (e.g. `httpOnly: 'yes'` instead of `true`). | Fix the attribute object to use valid keys and types. See the attribute table above. |
| `COOKIE_CSRF_HEADER_NOT_DECLARED` | A cookie with role `csrf-double-submit` exists but no consumer endpoint declares the `headerEcho` pairing via `@CookieConsumer.csrfDouble(cookieName, headerName)`. | Add `@CookieConsumer.csrfDouble('XSRF-TOKEN', 'X-CSRF-Token')` to the protected endpoint. |
| `COOKIE_HOST_PREFIX_INVALID` | Cookie name starts with `__Host-` but declaration violates prefix rules: `Path` is not `/`, `Secure` is not `true`, or `Domain` is declared. | Declare `path: '/'`, `secure: true`, and remove `domain` from `x-cookie-attrs`. |
| `COOKIE_NAME_INVALID` | Cookie name contains characters not allowed by RFC 6265 token rules (spaces, control characters, separators like `(`, `)`, `,`, `;`, etc.). | Rename the cookie to use only RFC-valid token characters. |
| `COOKIE_SAMESITE_NONE_WITHOUT_SECURE` | `x-cookie-attrs` declares `sameSite: 'None'` but `secure` is not `true`. Browsers reject this combination. | Add `secure: true` to the attribute declaration, or change `sameSite` to `'Lax'` or `'Strict'`. |
| `COOKIE_HAS_NO_CONSUMER` | A cookie role is declared on an issuer endpoint but no endpoint declares `@CookieConsumer` for that cookie name. Warning, not blocking — the probe generates issuer-side flows but skips consumer chains. | Add `@CookieConsumer('cookie_name')` to endpoints that read this cookie. |
| `COOKIE_HAS_NO_ISSUER` | An endpoint declares `@CookieConsumer('x')` but no issuer endpoint declares a cookie named `x`. Error — the probe cannot generate the chain because there is no source of the cookie. | Add the corresponding `@CookieRole('x', '...')` or `x-cookie-role` declaration to the endpoint that issues this cookie. |
| `COOKIE_UNDECLARED` | At runtime, the probe's jar sees a `Set-Cookie` header for a name that no declaration covers. Warning, not error. RFC replay is preserved but no role-specific assertions fire. | Either declare the cookie with an appropriate role, or accept the warning if the cookie is unrelated to your feature. |
| `COOKIE_ISSUER_BODY_EXAMPLE_UNDECLARED` | A cookie-flow issuer is POST/PUT/PATCH with a declared `requestBody` schema but no `schema.example`, `content.example`, or `content.examples[*].value`. The probe cannot synthesize a request body. | Add `@ApiBody({ examples: { default: { value: { ... } } } })` to the issuer endpoint. |
| `COOKIE_VALUE_SUBSTITUTION_UNDECLARED` | A cookie-flow consumer has non-path parameters but no `x-cookie-value-source` declaration on any parameter or body property, AND no `valueSubstitution` in `x-cookie-consumes`. The probe cannot determine where to substitute the captured cookie value. | Add `@CookieConsumer.withValueSource(cookieName, { in, name })` (preferred) OR add `x-cookie-value-source: { cookieName }` extension on the parameter/body property. |
| `ENDPOINT_HAPPY_SKIPPED_COOKIE_GUARDED` | The endpoint-happy generator skipped an endpoint because it consumes or rotates a cookie (declared via `@CookieConsumer` or `x-cookie-consumes`). The cookie-flow detector handles full coverage; the unauthenticated endpoint-happy probe would always fail with 401. | This is INFO-level, not an error. The cookie-flow detector covers the endpoint via its own flows. |
| `COOKIE_SCHEME_ROLE_UNDECLARED` | A `securitySchemes` entry uses `type: 'apiKey'` with `in: 'cookie'` but the scheme is missing the `x-cookie-role` extension. The detector refuses to guess the role from the scheme name (NEVER-HEURISTIC rule). | Add `x-cookie-role` to the scheme definition (e.g. `(scheme as Record<string, unknown>)['x-cookie-role'] = 'session'` post-build in `swagger.ts`) OR declare role via P2 (`x-cookie-role` on `@ApiResponse` headers) or P3 (`@CookieRole` decorator). |

## Edge case checklist

These 25 edge cases are all exercised by the probe's synthetic endpoints.
Each has a declaration-side action you must take if the edge applies to your
feature.

1. **Multiple `Set-Cookie` headers in one response.** Each is parsed independently. Declare each cookie name separately.
2. **Cookie value contains `;` and `=` (e.g. base64-with-padding).** The jar handles RFC parsing. No special declaration needed.
3. **Cookie with no attributes (session cookie).** The jar applies defaults (no Max-Age, Path defaults to request path). If you need attribute assertions, declare them explicitly.
4. **Cookie cleared via `Max-Age=0`.** The probe asserts `isCleared`. No declaration change needed; just use the `assert-cookie-cleared` step.
5. **Cookie cleared via `Expires=Thu, 01 Jan 1970...`.** Same assertion fires. Both clearing mechanisms are equivalent.
6. **Cookie with `Domain=.example.com` (subdomain).** On localhost the jar uses exact host match. Document this if your tests differ from production.
7. **Cookie with `Path=/api/v1` only.** The jar only replays on requests to paths under `/api/v1`. Declare `path: '/api/v1'` in `x-cookie-attrs`.
8. **Cookie ordering by Path length (RFC 6265 section 5.4).** The jar sends longest-prefix-match first. No declaration action needed.
9. **Rotation: same name, new value.** The `assert-cookie-rotated` step checks the value differs from the prior capture. Declare the rotation endpoint as a consumer.
10. **Tampered cookie (negative test).** The `tamper-cookie` step flips bits. No declaration needed; the probe generates this for all roles except `custom`.
11. **Omitted cookie (negative test).** The `omit-cookie` step drops the cookie. Same as above.
12. **Attribute drift (declared vs runtime).** If you declare `httpOnly: true` but the runtime omits HttpOnly, the probe surfaces an assertion failure. Fix the runtime, not the declaration.
13. **Two cookies with same name on different Paths.** Not supported. The jar uses last-write-wins and emits a warning. Avoid this pattern.
14. **HttpOnly + JavaScript-set cookie collision.** N/A for the probe (server-side observer only).
15. **`SameSite=None` requires `Secure`.** Declare both or the detector emits `COOKIE_SAMESITE_NONE_WITHOUT_SECURE`.
16. **Cookie with invalid name (per RFC token rules).** The detector emits `COOKIE_NAME_INVALID`. Rename the cookie.
17. **Empty cookie value (`name=`).** Allowed. The jar stores an empty string.
18. **`__Host-` prefix.** You MUST declare `path: '/'`, `secure: true`, and no `domain` in `x-cookie-attrs`. Otherwise `COOKIE_HOST_PREFIX_INVALID`.
19. **`__Secure-` prefix.** You MUST declare `secure: true`. Otherwise `COOKIE_HOST_PREFIX_INVALID`.
20. **Idempotent re-issue (same value across two responses).** `assert-cookie-rotated` FAILS correctly because the value did not change. If rotation is not your intent, do not declare a rotation chain.
21. **Cookie issued but no consumer declared.** `COOKIE_HAS_NO_CONSUMER` warning. The probe generates issuer steps but no consumer chain.
22. **Cookie consumed but no issuer declared.** `COOKIE_HAS_NO_ISSUER` error. The chain is ungeneratable.
23. **Concurrent flow runs.** Each flow gets its own jar instance. No cross-talk between parallel probe runs.
24. **Cookie with quoted value (`"v"`).** RFC 6265 unquotes in the jar. Equality compares the unquoted value.
25. **`Set-Cookie` in a 3xx response.** The jar captures BEFORE following the redirect. The cookie is included in the redirected request.

## Common anti-patterns (BANNED)

These are explicitly forbidden by the NEVER-HEURISTIC rule. The probe
will NOT use them and you must NOT rely on them.

### Path-regex detection

```ts
// BANNED — the probe never does this
if (path.match(/\/refresh|\/token|\/login/)) {
  role = 'refresh-token';
}
```

Cookie role comes from declarations (P1/P2/P3), never from the URL path.
Paths like `/auth/refresh`, `/token`, `/login` are irrelevant to the
detector. Two endpoints at `/a` and `/b` can issue the same cookie role
as long as they do not conflict on the same name.

### Field-name sniffing

```ts
// BANNED — the probe never does this
if (cookieName === 'rt' || cookieName.includes('refresh')) {
  role = 'refresh-token';
}
```

Cookie names are read VERBATIM from declarations. What the name "looks
like" is irrelevant. A cookie named `x7q` with `x-cookie-role:
'refresh-token'` is a valid refresh token. A cookie named
`refresh_token` without any role declaration has role `custom` (or
triggers `COOKIE_UNDECLARED` at runtime).

### Silent fallback on missing declaration

```ts
// BANNED — the probe never does this
const role = declaration?.role ?? guessRoleFromName(name);
```

If the declaration is missing, the probe emits a DIAG and stays red. It
never falls back to guessing. The red state IS the value the probe
provides — it tells you that you need to add a declaration.

### Validate cookie VALUE, not just presence

```ts
// BANNED — passes tamper-cookie test
@Get('protected')
@CookieConsumer('session_id')
protected(@Req() req: Request) {
  if (!req.cookies.session_id) throw new UnauthorizedException();
  return { ok: true };  // accepts ANY string
}
```

The `tamper-cookie` step replaces the cookie value with arbitrary garbage.
Your endpoint must validate the value against a registry — not just check
presence. Pattern:

```ts
const sessionStore = new Set<string>();
// ... in login: sessionStore.add(sessionId)
// ... in protected:
if (!sessionId || !sessionStore.has(sessionId)) {
  throw new UnauthorizedException();
}
```

Without the membership check, the tamper test succeeds with the tampered
value and the probe fails.

### Suppressing cookie paths in `overlay.ignore[]`

```ts
// BANNED — hooks will block this
{ "ignore": ["/auth/refresh", "/auth/login"] }
```

Adding paths to `overlay.ignore[]` to suppress probe failures on
cookie-related endpoints is blocked by the `probe-covers-diff` hook.
The ignore list is for framework internals only (e.g. `/_next/**`,
`/api/health`).

## Worked example: refresh-token rotation end-to-end

> **POST/PUT/PATCH issuer body-example requirement.** If your issuer is
> POST/PUT/PATCH, declare a request body example via
> `@ApiBody({ examples: { default: { value: { ... } } } })`. Without it
> the probe emits `COOKIE_ISSUER_BODY_EXAMPLE_UNDECLARED` and skips the
> flow.

This walks through the complete declaration for a refresh-token rotation
flow and traces what the probe generates.

### Step 1 — DTO

```ts
// apps/api/src/modules/auth/dto/auth-response.dto.ts
import { ApiProperty } from '@nestjs/swagger';

export class AuthResponseDto {
  @ApiProperty({ type: String })
  accessToken: string;
}
```

### Step 2 — Controller (issuer + rotator + clearer)

```ts
// apps/api/src/modules/auth/auth.controller.ts
import { Controller, Post, Body, Res } from '@nestjs/common';
import { ApiTags, ApiResponse, ApiOperation, ApiBody } from '@nestjs/swagger';
import { Response } from 'express';
import { CookieRole, CookieConsumer } from '../../common/decorators';
import { AuthResponseDto } from './dto/auth-response.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  @Post('login')
  @ApiOperation({ operationId: 'authLogin' })
  @CookieRole('refresh_token', 'refresh-token')
  @ApiBody({ examples: { default: { value: { email: 'user@example.com', password: 'P@ssw0rd!' } } } })
  @ApiResponse({
    status: 200,
    type: AuthResponseDto,
    headers: {
      'Set-Cookie': {
        schema: { type: 'string' },
        'x-cookie-role': 'refresh-token',
        'x-cookie-name': 'refresh_token',
        'x-cookie-attrs': {
          httpOnly: true,
          secure: true,
          sameSite: 'Strict',
          path: '/',
          maxAge: 604800,
        },
      },
    },
  })
  login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const refreshToken = this.authService.issueRefresh(dto);
    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
      maxAge: 604800,
    });
    return { accessToken: this.authService.issueAccess(dto) };
  }

  @Post('refresh')
  @ApiOperation({ operationId: 'authRefresh' })
  @CookieConsumer('refresh_token')
  @CookieRole('refresh_token', 'refresh-token')   // also re-issues (rotation)
  @ApiResponse({
    status: 200,
    type: AuthResponseDto,
    headers: {
      'Set-Cookie': {
        schema: { type: 'string' },
        'x-cookie-role': 'refresh-token',
        'x-cookie-name': 'refresh_token',
        'x-cookie-attrs': {
          httpOnly: true,
          secure: true,
          sameSite: 'Strict',
          path: '/',
          maxAge: 604800,
        },
      },
    },
  })
  refresh(@Res({ passthrough: true }) res: Response) {
    // Read cookie from request, validate, rotate
    const newRefresh = this.authService.rotateRefresh(/* ... */);
    res.cookie('refresh_token', newRefresh, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
      maxAge: 604800,
    });
    return { accessToken: this.authService.issueAccess(/* ... */) };
  }

  @Post('logout')
  @ApiOperation({ operationId: 'authLogout' })
  @CookieConsumer('refresh_token')
  @ApiResponse({
    status: 200,
    headers: {
      'Set-Cookie': {
        schema: { type: 'string' },
        'x-cookie-name': 'refresh_token',
      },
    },
  })
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('refresh_token', { path: '/' });
    return { success: true };
  }
}
```

### Step 3 — What the detector produces in the matrix

```json
{
  "cookieFlows": [
    {
      "name": "refresh_token",
      "role": "refresh-token",
      "issuer": {
        "method": "POST",
        "path": "/auth/login",
        "operationId": "authLogin"
      },
      "consumers": [
        {
          "method": "POST",
          "path": "/auth/refresh",
          "operationId": "authRefresh"
        }
      ],
      "attrs": {
        "httpOnly": true,
        "secure": true,
        "sameSite": "Strict",
        "path": "/",
        "maxAge": 604800
      },
      "rotation": {
        "rotatedBy": ["authRefresh"],
        "clearedBy": ["authLogout"]
      },
      "headerEcho": null
    }
  ]
}
```

### Step 4 — What the flows-generator emits

```json
[
  {
    "id": "cookie:refresh-token:issue",
    "steps": [
      { "kind": "request", "method": "POST", "path": "/auth/login", "body": { "...": "..." } },
      { "kind": "capture-cookie", "name": "refresh_token" },
      { "kind": "assert-cookie-attrs", "name": "refresh_token", "expected": { "httpOnly": true, "secure": true, "sameSite": "Strict", "path": "/", "maxAge": 604800 } }
    ]
  },
  {
    "id": "cookie:refresh-token:rotate",
    "steps": [
      { "kind": "request", "method": "POST", "path": "/auth/login", "body": { "...": "..." } },
      { "kind": "capture-cookie", "name": "refresh_token" },
      { "kind": "request", "method": "POST", "path": "/auth/refresh" },
      { "kind": "capture-cookie", "name": "refresh_token" },
      { "kind": "assert-cookie-rotated", "name": "refresh_token", "fromVar": "cookie:refresh_token:0" }
    ]
  },
  {
    "id": "cookie:refresh-token:clear",
    "steps": [
      { "kind": "request", "method": "POST", "path": "/auth/login", "body": { "...": "..." } },
      { "kind": "capture-cookie", "name": "refresh_token" },
      { "kind": "request", "method": "POST", "path": "/auth/logout" },
      { "kind": "assert-cookie-cleared", "name": "refresh_token" }
    ]
  },
  {
    "id": "cookie:refresh-token:tamper",
    "steps": [
      { "kind": "request", "method": "POST", "path": "/auth/login", "body": { "...": "..." } },
      { "kind": "capture-cookie", "name": "refresh_token" },
      { "kind": "tamper-cookie", "name": "refresh_token", "transform": "flip-bit" },
      { "kind": "request", "method": "POST", "path": "/auth/refresh" },
      { "kind": "assert-status", "expected": 401 }
    ]
  },
  {
    "id": "cookie:refresh-token:omit",
    "steps": [
      { "kind": "omit-cookie", "name": "refresh_token" },
      { "kind": "request", "method": "POST", "path": "/auth/refresh" },
      { "kind": "assert-status", "expected": 401 }
    ]
  }
]
```

### Trace walkthrough

1. The detector reads `x-cookie-role: 'refresh-token'` and
   `x-cookie-name: 'refresh_token'` from the `@ApiResponse` headers on
   `authLogin`. It also reads `@CookieRole('refresh_token',
   'refresh-token')` via P3. Both agree — no ambiguity.

2. The detector sees `@CookieConsumer('refresh_token')` on `authRefresh`
   and `authLogout`. It adds them as consumers.

3. Since `authRefresh` also has `@CookieRole('refresh_token',
   'refresh-token')`, the detector recognises it as a rotator (issues the
   same cookie it consumes). It adds `authRefresh` to
   `rotation.rotatedBy`.

4. `authLogout` has `x-cookie-name: 'refresh_token'` in its response
   header but no `x-cookie-role`. The detector sees it clears the cookie
   (response header without role implies clearing). It adds `authLogout`
   to `rotation.clearedBy`.

5. `x-cookie-attrs` on `authLogin` populates `attrs`. The probe will
   assert every attribute on every `capture-cookie` step.

6. The flows-generator reads the matrix entry and emits five flows:
   issue, rotate, clear, tamper, omit. Each exercises a different branch
   of the cookie lifecycle.

7. At runtime, the probe boots the real stack, runs each flow, and
   compares actual `Set-Cookie` headers against the matrix. Any mismatch
   is a contract drift — surfaced in the probe report.
