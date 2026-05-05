# flows-generator Universal Coverage Plan — Complete Agent Skill Reference

This document is the authoritative reference for agents working on the 14-commit
flows-generator universal-coverage plan. It contains everything an agent needs to
know to implement any of the remaining commits correctly, without 52 failures,
without hacks, and without violating the source-of-truth principle.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [The Source-of-Truth Principle](#2-the-source-of-truth-principle)
3. [Pipeline Data Flow](#3-pipeline-data-flow)
4. [File Inventory](#4-file-inventory)
5. [Commit Status](#5-commit-status)
6. [Per-Commit Specifications](#6-per-commit-specifications)
7. [Verification Protocol](#7-verification-protocol)
8. [Byte-Parity Sync Protocol](#8-byte-parity-sync-protocol)
9. [Pre-Commit Review Protocol](#9-pre-commit-review-protocol)
10. [Common Patterns and Anti-Patterns](#10-common-patterns-and-anti-patterns)
11. [Reference: Existing Detector Patterns](#11-reference-existing-detector-patterns)
12. [Reference: Existing Synthetic Endpoints](#12-reference-existing-synthetic-endpoints)

---

## 1. Architecture Overview

The runtime-verification probe is a three-phase pipeline:

```
Phase 1: derive-test-matrix.js
  ├── detectors/*.js  — scan source code, OpenAPI spec, package.json
  ├── lib/enrich-matrix.js — attach Zod contracts, NestJS decorators, Swagger data
  └── Outputs: .claude/hooks/.matrix.json

Phase 2: flows-generator.js
  ├── Reads: .matrix.json + runtime-contract.logical.json + overlay
  ├── Emitter functions (emitHappyFlow, emitValidationFlows, etc.)
  └── Outputs: .claude/hooks/.flows.generated.json

Phase 3: http-smoke.ts (probe runtime)
  ├── Reads: .matrix.json + .flows.generated.json
  ├── assertion-library.ts — step kind executors
  ├── http-client.ts — HTTP/FormData/SSE/binary request helpers
  ├── lib/ws-client.js — WebSocket client
  └── Outputs: probe results JSON
```

All probe files live in:
```
.overstory/claude-profiles/builder/hooks/probes/
```

And must be byte-parity synced across 5 profiles:
- builder (canonical source)
- lead
- merger
- reviewer
- scout

### Key Principle: Declaration-Driven

Every assertion the probe makes must trace back to a **declaration** in source
code (OpenAPI decorator, Zod schema, NestJS guard, Prisma schema, etc.). The
probe never guesses. If a declaration is missing, the probe emits nothing for
that code path — it does not fall back to heuristics.

---

## 2. The Source-of-Truth Principle

**MANDATORY. The #1 rule. Violating it is a conduct failure.**

### NEVER acceptable in probe code:

| Anti-pattern | Why it's wrong | Correct approach |
|---|---|---|
| Path regex heuristics (`/login\|signin/`) | Breaks on `/authenticate`, `/token-exchange` | Use `operationId` + response schema + decorators |
| Runtime body sniffing (`if (body.success === false)`) | Papers over contract drift | Static AST/regex scan of the filter source |
| Field-name fallbacks (`status ?? statusCode`) | Hides which field the code actually uses | Static detector already knows; if live doesn't match, that's a bug |
| Optional-chain guards (`body?.error?.message ?? 'unknown'`) | Silences real mismatches | Assert exactly what the code emits |

### ALWAYS the right approach:

- **Static AST/regex scan of the source that produces the behavior.** Mirror
  existing `detectors/response-envelope.js` (parses NestJS `TransformInterceptor`
  `.pipe(map(...))` body) for any new shape extraction.
- For exception-filter shape: scan `useGlobalFilters(new X())` → resolve X
  import → parse `response.json({...})` literal in the catch handler.
- For auth schemes: scan OpenAPI `components.securitySchemes` + per-operation
  `security[]` + NestJS `@UseGuards`/`@ApiBearerAuth`.
- For pagination: scan request param names + response schema array fields.
- Emit the extracted shape into matrix at regen time. flows-generator +
  assertion-library consume the matrix shape directly.

### Historical failures of this rule:

- **Commit 028a565** added `status → statusCode` runtime fallback + runtime body
  sniffing for `{success:false, error:{...}}`. **Reverted** in 511ead0 and
  replaced by Commit 2b (`detectors/error-envelope.js` static scan).
- **Earlier `bodyHas: ['id']`** blanket heuristic — replaced in Commit 1
  (`lib/response-contract.js`) by OpenAPI required-paths extraction.

If a worker proposes a fallback to "make probe green", **reject it**. The probe
being red on a contract drift is the VALUE the probe provides.

---

## 3. Pipeline Data Flow

### Phase 1: Matrix Generation (`derive-test-matrix.js`)

Orchestrates all detectors and merges results into `.matrix.json`:

```
derive-test-matrix.js
  ├── detectFrameworks()          → matrix.detectedFrameworks
  ├── derivePages()               → matrix.pages
  ├── deriveEndpoints()           → matrix.apiEndpoints + matrix.securitySchemes
  │     └── nest-openapi.js       → OpenAPI spec parse, zodContract, authDecorators,
  │                                  swaggerDeclared, responseContract, errorShape,
  │                                  paginationProfile, conditionalProfile,
  │                                  idempotencyProfile, securityRequirement,
  │                                  requestContentTypes, responseContentTypes
  ├── deriveMiddleware()          → matrix.middleware
  ├── deriveForms()               → matrix.forms
  ├── deriveAuth()                → matrix.authDetection
  ├── detectResponseEnvelope()    → matrix.responseEnvelope
  │     (NestJS/Express/Fastify/Koa/OpenAPI consensus)
  ├── detectErrorEnvelope()       → matrix.errorEnvelope
  │     (NestJS GlobalExceptionFilter static parse)
  ├── detectPrismaUniques()       → matrix.prismaModels
  ├── detectGraphQL()             → matrix.graphql
  ├── detectWebSocket()           → matrix.websocketGateways
  ├── detectCsrf()                → matrix.csrf
  ├── detectOAuth()               → matrix.oauth
  ├── detectMultiTenant()         → matrix.multiTenant
  └── enrichMatrix()              → enriches each endpoint in-place
```

### Phase 2: Flow Generation (`flows-generator.js`)

Reads matrix + logical contract + overlay. For each endpoint, emits flows:

```
flows-generator.js
  ├── detectAuthFlows(matrix)     → { tokenIssuer, register, logout, refresh, mePoll }
  ├── emitAuthBootstrapChain()    → chain:auth-bootstrap (register→login→capture token)
  ├── emitRefreshChain()          → chain:auth-refresh (refresh-token rotation flow)
  ├── Per endpoint:
  │   ├── emitHappyFlow()         → :happy (POST with body, GET without)
  │   ├── emitValidationFlows()   → :invalid-* (one per Zod field invalidator)
  │   ├── emitQueryInvalidatorFlows() → :query-invalid-* (pagination param violations)
  │   ├── emitAuthBoundaryFlows() → :no-auth, :expired-token, :wrong-secret
  │   ├── emitStatusReachabilityFlows() → :status-{code} per declared 3xx/4xx/5xx
  │   ├── emitPaginationFlows()   → :first-page, :empty, :past-end, :max-limit, etc.
  │   ├── emitConditionalFlows()  → :etag-304, :if-match-412, etc.
  │   ├── emitIdempotencyFlows()  → :idempotency-replay, :different-key
  │   ├── emitUploadFlows()       → :upload-happy, :upload-oversize, :upload-wrong-mime
  │   ├── emitDownloadFlows()     → :download-happy (magic bytes + Content-Type)
  │   ├── emitStreamingFlows()    → :sse-stream (event count + wire protocol)
  │   ├── emitGraphQLFlows()      → :gql-query-happy, :gql-mutation-*, :gql-introspection
  │   ├── emitWebSocketFlows()    → :ws-connect, :ws-send-*, :ws-expect-*
  │   ├── emitCsrfFlow()          → :csrf-missing, :csrf-valid
  │   ├── emitOAuthFlow()         → :oauth-authorize, :oauth-token-exchange
  │   └── emitTenantIsolationFlow() → :tenant-scoped, :tenant-mismatch
  └── Outputs: .flows.generated.json
```

### Phase 3: Probe Runtime (`http-smoke.ts`)

Reads matrix + flows, boots the stack, executes each flow:

```
http-smoke.ts
  ├── regenerateArtifacts()       → re-runs derive-test-matrix + flows-generator
  ├── loadMatrix()                → matrix-loader.ts (typed coercion)
  ├── loadFlows()                 → .flows.generated.json parse
  ├── bootStack()                 → boot-orchestrator.ts
  ├── Per flow:
  │   ├── executeStep()           → assertion-library.ts step executors
  │   │   ├── api-call            → HTTP request + status/body assertions
  │   │   ├── expect              → body path existence checks
  │   │   ├── expect-error-shape  → family-aware error assertions
  │   │   ├── capture             → save response values to shared state
  │   │   ├── setAuth             → inject auth token for subsequent steps
  │   │   ├── api-upload          → multipart FormData upload
  │   │   ├── api-download        → binary response + magic bytes
  │   │   ├── api-stream          → SSE connection + event assertions
  │   │   ├── ws-connect          → WebSocket connection
  │   │   ├── ws-send             → WebSocket message send
  │   │   ├── ws-expect-event     → WebSocket event assertion
  │   │   ├── ws-close            → WebSocket disconnect
  │   │   ├── gql-query           → GraphQL query execution
  │   │   └── gql-mutation        → GraphQL mutation execution
  │   └── collectResults()
  └── Outputs: probe JSON summary
```

---

## 4. File Inventory

### Detectors (`.overstory/claude-profiles/builder/hooks/probes/detectors/`)

| File | Purpose | Commit |
|---|---|---|
| `endpoints.js` | OpenAPI spec parse → apiEndpoints | pre-existing |
| `nest-openapi.js` | NestJS Swagger decorator extraction (enriches endpoints with zodContract, authDecorators, swaggerDeclared, responseContract, errorShape, paginationProfile, conditionalProfile, idempotencyProfile, content types) | multiple |
| `response-envelope.js` | Success response wrapper (NestJS/Express/Fastify/Koa/OpenAPI consensus) | C4 |
| `error-envelope.js` | Error response wrapper (NestJS GlobalExceptionFilter static parse) | C2b |
| `auth-flows.js` | Declaration-driven auth endpoint identification | C3 |
| `pagination.js` | Pagination style detection (offset/cursor/link-header) | C6 |
| `conditional.js` | ETag/Last-Modified conditional request detection | C8 |
| `graphql.js` | GraphQL endpoint detection + live introspection | C10 |
| `websocket.js` | WebSocket gateway detection (NestJS + socket.io + graphql-ws) | C11 |
| `csrf.js` | CSRF protection detection (package deps + middleware + OpenAPI) | C12 |
| `oauth.js` | OAuth2 flow detection (securitySchemes + deps + strategies) | C12 |
| `multi-tenant.js` | Multi-tenancy detection (headers + paths + prisma + middleware) | C12 |
| `prisma-uniques.js` | Prisma unique constraint discovery | pre-existing |
| `auth.js` | Auth mechanism detection | pre-existing |
| `pages.js` | Frontend page detection | pre-existing |
| `middleware.js` | Middleware detection | pre-existing |
| `forms.js` | Form detection | pre-existing |
| `tokens.js` | Token extraction per page | pre-existing |
| `boot-plan.js` | Boot plan derivation | pre-existing |
| `ports.js` | Port detection | pre-existing |
| `frameworks.js` | Framework detection | pre-existing |
| `manifest-loader.js` | Manifest loading | pre-existing |

### Libraries (`.overstory/claude-profiles/builder/hooks/probes/lib/`)

| File | Purpose | Commit |
|---|---|---|
| `response-contract.js` | OpenAPI response-schema extraction (required paths) | C1 |
| `error-shape.js` | Error family detection + assertion builder | C2 |
| `enrich-matrix.js` | Matrix enrichment (Zod contracts, decorators) | multiple |
| `multipart.js` | FormData builder for multipart uploads | C7 |
| `sse.js` | SSE stream parser | C7 |
| `ws-client.js` | WebSocket client helper | C11 |
| `args.js`, `diag.js`, `fsutil.js`, `merge.js`, `normalize.js`, `pkgjson.js`, `routeNormalize.js`, `sessionFiles.js`, `tsast.js` | Utility libraries | pre-existing |

### Core Pipeline

| File | Purpose |
|---|---|
| `derive-test-matrix.js` | Phase 1 orchestrator |
| `flows-generator.js` | Phase 2 flow generator |
| `matrix-loader.ts` | Typed matrix loading + coercion |
| `http-smoke.ts` | Phase 3 probe runtime |
| `http-client.ts` | HTTP/FormData/SSE/binary client |
| `assertion-library.ts` | Step kind executors |
| `boot-orchestrator.ts` | Stack boot manager |
| `smoke-report.ts` | Result formatting |

### Synthetic Reference Endpoints (self-verify fixtures)

This repo includes synthetic endpoints used to self-verify the probe pipeline.
They exercise specific detector/emitter code paths and are **not** a template
for where consumer endpoints must live. The probe scans the runtime OpenAPI
spec — it does not care where controller source files are located.

| Fixture set | Purpose |
|---|---|
| `probe-ref` | 25+ endpoints exercising response-contract, error-shape, pagination, conditional, idempotency, upload/download/SSE, refresh-token |
| `probe-ref-security` | CSRF, OAuth2, multi-tenant endpoints |

---

## 5. Commit Status

| # | Commit | Status | SHA | Key files added/modified |
|---|---|---|---|---|
| 1 | Response-schema extraction | LANDED | 905cdf5 | `lib/response-contract.js` |
| 2 | Error-shape detection | LANDED | aab91f5 | `lib/error-shape.js` |
| 2b | Static error-envelope detector | LANDED | 538e860 | `detectors/error-envelope.js` |
| 3 | Declaration-driven auth | LANDED | 7606872 | `detectors/auth-flows.js`, `detectors/nest-openapi.js` |
| 4 | Envelope generalization (N-deep) | LANDED | 5fc8e53 | `detectors/response-envelope.js` extended |
| 5 | Status-code coverage | LANDED | 905d712 | `flows-generator.js` (emitStatusReachabilityFlows) |
| 6 | Pagination coverage | LANDED | 327b405 | `detectors/pagination.js` |
| 7 | Content-types (upload/download/SSE) | LANDED | d6468ef | `lib/multipart.js`, `lib/sse.js`, `http-client.ts` |
| 8 | Conditional requests (ETag) | LANDED | 1730727 | `detectors/conditional.js` |
| 9 | Idempotency + refresh-token | LANDED | 6c481f0 | `flows-generator.js` (idempotency + refresh) |
| 10 | GraphQL support | LANDED | 574c3d6 | `detectors/graphql.js` |
| 11 | WebSocket support | LANDED | b7f4cfc | `detectors/websocket.js`, `lib/ws-client.js` |
| 12 | CSRF + OAuth + Multi-tenancy | IN PROGRESS | --- | `detectors/csrf.js`, `detectors/oauth.js`, `detectors/multi-tenant.js` |
| 13 | ORM / unique-constraint generalization | PENDING | --- | `detectors/prisma-uniques.js` (extend) |
| 14 | Pluggable emitter + detector registry | PENDING | --- | Registry pattern refactor |

---

## 6. Per-Commit Specifications

### Commit 12: CSRF + OAuth + Multi-tenancy

**Status:** IN PROGRESS — detectors, emitters, and unit tests landed; needs
byte-parity sync, probe:smoke, and pre-commit review.

#### How builders declare CSRF protection

The probe detects CSRF protection from **OpenAPI declarations only** — it
never inspects file paths, middleware registrations, or field names.

**Required declarations:**

1. **Define a CSRF security scheme** in OpenAPI `components.securitySchemes`:
   ```typescript
   // In your NestJS main.ts or Swagger setup
   const config = new DocumentBuilder()
     .addApiKey(
       { type: 'apiKey', in: 'header', name: 'x-csrf-token' },
       'csrfScheme',                        // scheme name must contain 'csrf' or 'xsrf'
     )
     .build();
   ```

2. **Apply the scheme to protected endpoints** via `@ApiSecurity`:
   ```typescript
   @Post('orders')
   @ApiSecurity('csrfScheme')               // links to the scheme above
   @ApiHeader({ name: 'x-csrf-token' })     // declares which header carries the token
   createOrder(@Body() dto: CreateOrderDto) { /* ... */ }
   ```

3. **(Optional) Declare a token-issuing endpoint** — if your API has a
   `GET` endpoint that returns a CSRF token, annotate it with
   `@ApiResponse({ type: CsrfTokenDto })` where the DTO has a field the
   detector can resolve. The emitter uses `tokenEndpoint.tokenField` to
   build the capture-path for the happy flow.

**What the emitter produces per endpoint:**
- `csrf:<epId>:consume:happy` — fetch token, POST with valid token, expect not-403
  (only if `tokenEndpoint` with `tokenField` is declared)
- `csrf:<epId>:consume:missing-token` — POST without token, expect 403
- `csrf:<epId>:consume:invalid-token` — POST with bogus token, expect 403

**Header resolution order:**
1. Endpoint's own `parameters` (from `@ApiHeader`) — declaration-driven
2. Endpoint's `swaggerDeclared.parameters` — declaration-driven
3. Fallback to the `securitySchemes` entry's `name` field — declaration-driven
4. If none resolves, endpoint is **skipped** (never fabricate a header name)

#### How builders declare OAuth2 flows

**Required declarations:**

1. **Define an OAuth2 security scheme** in `components.securitySchemes`:
   ```typescript
   const config = new DocumentBuilder()
     .addOAuth2({
       type: 'oauth2',
       flows: {
         authorizationCode: {
           authorizationUrl: '/api/v1/oauth/authorize',
           tokenUrl: '/api/v1/oauth/token',
           scopes: { read: 'Read access' },
         },
       },
     }, 'oauth2')
     .build();
   ```

2. **Tag role endpoints** via `@ApiOperation` or `@ApiExtension`:
   ```typescript
   @Get('oauth/authorize')
   @ApiOperation({ operationId: 'oauthAuthorize' })
   // OR: @ApiExtension('x-oauth-role', 'authorize')
   authorize(@Query() params: AuthorizeDto) { /* ... */ }

   @Post('oauth/token')
   @ApiOperation({ operationId: 'oauthToken' })
   // OR: @ApiExtension('x-oauth-role', 'token')
   token(@Body() dto: TokenDto) { /* ... */ }

   @Get('oauth/callback')
   @ApiOperation({ operationId: 'oauthCallback' })
   // OR: @ApiExtension('x-oauth-role', 'callback')
   callback(@Query() params: CallbackDto) { /* ... */ }
   ```

**Required vs optional signals:**
- `securitySchemes.<name>` of type `oauth2` — **required** (without it, detector emits nothing)
- `operationId` or `x-oauth-role` on role endpoints — **required** for the
  detector to resolve URLs to local relative paths (otherwise it falls back to
  scheme URLs, which may be absolute)
- `flows.authorizationCode | implicit | password | clientCredentials` —
  determines which flow families the emitter generates

**What the emitter produces:**
- Token endpoint: `oauth:token:invalid-grant`, `oauth:token:missing-grant-type`, `oauth:token:client-credentials`
- Authorize endpoint: `oauth:authorize:reachable`, `oauth:authorize:missing-client-id`
- Callback endpoint: `oauth:callback:with-code`, `oauth:callback:no-code`, `oauth:callback:error-param`

#### How builders declare multi-tenant scoping

**Required declarations (at least one):**

1. **Header-based tenancy** — declare a tenant header on endpoints:
   ```typescript
   @Get('projects')
   @ApiHeader({ name: 'X-Tenant-ID', required: true })
   @UseGuards(AuthGuard)
   listProjects() { /* ... */ }
   ```
   The detector picks up `@ApiHeader` with a name matching `tenant|org` (case-insensitive).
   For auth-required endpoints (`@UseGuards` present), it emits isolation flows.

2. **Path-param tenancy** — use `:tenantId` in the route:
   ```typescript
   @Get('tenants/:tenantId/items')
   listItems(@Param('tenantId') tenantId: string) { /* ... */ }
   ```
   Detected via OpenAPI path params matching `tenantId|orgId`.

3. **OpenAPI extension** — explicit tenancy scope declaration:
   ```typescript
   @Get('items')
   @ApiExtension('x-tenancy-scope', 'header:X-Tenant-ID')
   listItems() { /* ... */ }
   ```

4. **Prisma model with `tenantId` field** — adds evidence for the detector
   but alone is not sufficient to emit flows (requires at least one endpoint
   declaration above).

**What the emitter produces:**
- Header strategy: `tenant-isolation:header:tenant-a:access`, `tenant-isolation:header:missing:rejected`, `tenant-isolation:header:cross-tenant:rejected`
- Path-param strategy: `tenant-isolation:path:happy`, `tenant-isolation:path:missing-header:rejected`, `tenant-isolation:path:cross-tenant:rejected`

#### Detectors

- `detectors/csrf.js` — scans OpenAPI securitySchemes (apiKey in header with csrf/xsrf name), package.json deps (`csurf`, `csrf-csrf`, `lusca`), and endpoint header annotations
- `detectors/oauth.js` — scans OpenAPI securitySchemes (type `oauth2`), `@ApiOperation`/`@ApiExtension` for role resolution, package deps (`passport-oauth2`, `openid-client`)
- `detectors/multi-tenant.js` — scans `@ApiHeader` for tenant headers, path params for `:tenantId`, `@ApiExtension('x-tenancy-scope')`, Prisma schema `tenantId` fields

#### Emitters

- `emitCsrfFlows(matrix)` — per-endpoint happy/missing/invalid flows
- `emitOAuthFlows(matrix)` — token/authorize/callback flow families
- `emitTenantIsolationFlows(matrix)` — header or path-param isolation flows

#### What remains

1. Byte-parity sync across 5 profiles
2. Run `pnpm probe:smoke` — confirm flows fire correctly
3. Send pre-commit review to lead with evidence
4. Get approval, commit

#### Verification checklist

- CSRF: add `@ApiSecurity('csrfScheme')` + `@ApiHeader` to any controller,
  run `pnpm matrix:regen`, verify `.matrix.json` `csrf.detected: true` and
  header name resolved from securitySchemes
- OAuth: add `@ApiOperation({ operationId: 'oauthToken' })` to any POST
  endpoint with oauth2 securityScheme, run `pnpm matrix:regen`, verify
  `oauth.roles.token` resolved
- Multi-tenant: add `@ApiHeader({ name: 'X-Tenant-ID' })` to any
  auth-guarded endpoint, run `pnpm matrix:regen`, verify
  `multiTenant.detected: true` with `strategy: 'header'`
- Each detector reads from OpenAPI declarations / source code annotations — never path regex

### Commit 13: ORM / Unique-Constraint Generalization

**Status:** PENDING

**Goal:** Generalize the existing `detectors/prisma-uniques.js` beyond Prisma to
support TypeORM `@Unique` decorators, Sequelize `unique: true` model options,
and MikroORM `@Unique()` decorators. The flows-generator already consumes
`matrix.prismaModels` to substitute unique field values with `${uniqEmail}` /
`${uniqString}` / `${uniqUuid}` sigils — this commit makes that work for
non-Prisma ORMs too.

**Implementation plan:**

1. **Rename** `detectors/prisma-uniques.js` to `detectors/orm-uniques.js` (or
   keep the file, add multi-ORM scanning inside it)

2. **Add TypeORM detection:** Scan `*.entity.ts` files for:
   - `@Unique()` decorator on class → composite unique
   - `@Column({ unique: true })` → single-column unique
   - `@Index({ unique: true })` → index-based unique

3. **Add Sequelize detection:** Scan model files for:
   - `unique: true` in column definitions
   - `indexes: [{ unique: true, fields: [...] }]` in model options

4. **Add MikroORM detection:** Scan entity files for:
   - `@Unique()` decorator
   - `@Property({ unique: true })`

5. **Normalize output** to the same shape `{ models: { ModelName: { uniqueFields: [...], compositeUniques: [[...]] } }, source }` that `collectUniqueFieldNames()` in flows-generator already consumes.

6. **Update `derive-test-matrix.js`:** Rename the import/call if file is renamed, or add multi-ORM fallback chain.

7. **Update `matrix-loader.ts`:** Types should already work (same shape), but verify.

**Tests:**
- `__tests__/orm-uniques.test.js` (or extend `prisma-uniques.test.js`):
  - TypeORM entity with `@Column({ unique: true })` → detects field
  - Sequelize model with `unique: true` → detects field
  - MikroORM entity with `@Unique()` → detects field
  - Prisma schema (existing tests still pass)
  - No ORM detected → returns empty models
  - Multiple ORMs in same project → merges all

**Synthetic endpoints:** None needed — the unique-constraint data only affects
`buildSampleBody()` in flows-generator, which replaces body field values with
sigils. The existing probe-ref endpoints with `createProbeItemSchema` already
exercise this path (email field has `@unique` in Prisma schema).

**Verification:**
1. Run `pnpm probe:smoke` with existing endpoints
2. Verify `.matrix.json` `prismaModels` still populated correctly
3. Add temporary TypeORM fixture, verify detection, revert
4. Unit tests cover all ORM detection branches

### Commit 14: Pluggable Emitter + Detector Registry

**Status:** PENDING

**Goal:** Refactor the monolithic `flows-generator.js` (currently ~2000+ lines)
and `derive-test-matrix.js` into a registry-based architecture where each
detector and emitter is a self-contained plugin.

**Implementation plan:**

1. **Create `lib/registry.js`** with:
   ```javascript
   class DetectorRegistry {
     register(name, detector) // detector: { detect(projectDir, diag) → any }
     runAll(projectDir, diag) // returns Map<name, result>
   }

   class EmitterRegistry {
     register(name, emitter) // emitter: { emit(ep, matrix, options) → Flow[] }
     emitAll(ep, matrix, options) // returns Flow[]
   }
   ```

2. **Migrate each detector to a self-registering module:**
   - Each detector exports a `register(registry)` function
   - `derive-test-matrix.js` iterates `detectors/*.js`, calls `register()`
   - Backward-compatible: if detector doesn't export `register()`, wrap it

3. **Migrate each emitter to a self-registering module:**
   - Split `flows-generator.js` emitter functions into separate files under `emitters/`:
     - `emitters/happy.js` (emitHappyFlow)
     - `emitters/validation.js` (emitValidationFlows)
     - `emitters/auth-boundary.js` (emitAuthBoundaryFlows)
     - `emitters/status.js` (emitStatusReachabilityFlows)
     - `emitters/pagination.js` (emitPaginationFlows)
     - `emitters/conditional.js` (emitConditionalFlows)
     - `emitters/idempotency.js` (emitIdempotencyFlows)
     - `emitters/upload.js` (emitUploadFlows)
     - `emitters/download.js` (emitDownloadFlows)
     - `emitters/streaming.js` (emitStreamingFlows)
     - `emitters/graphql.js` (emitGraphQLFlows)
     - `emitters/websocket.js` (emitWebSocketFlows)
     - `emitters/csrf.js` (emitCsrfFlow)
     - `emitters/oauth.js` (emitOAuthFlow)
     - `emitters/tenant.js` (emitTenantIsolationFlow)
     - `emitters/auth-bootstrap.js` (emitAuthBootstrapChain, emitRefreshChain)
   - `flows-generator.js` becomes thin: load registry, iterate endpoints, call `emitAll()`

4. **Assertion library step-kind registry** (optional, lower priority):
   - `assertion-library.ts` already uses a switch/case over step kinds
   - Could be refactored to a map of `stepKind → handler`, but not strictly needed

**Tests:**
- `__tests__/registry.test.js`:
  - Register detector, runAll → result present
  - Register emitter, emitAll → flows returned
  - Backward compat: detector without `register()` still works
  - Duplicate registration throws
- All existing detector + flows tests continue to pass (regression)
- Each new `emitters/*.js` file gets a unit test

**Verification:**
- `pnpm probe:smoke` passes (regression — no behavioral change)
- Flow count identical before and after refactor
- Matrix content identical before and after refactor
- Byte-parity sync across 5 profiles

---

## 7. Verification Protocol

**MANDATORY for every commit touching probe files.**

### Phase A: Unit Tests

```bash
cd .overstory/claude-profiles/builder/hooks/probes
# Run specific test for your detector/lib
node --experimental-vm-modules node_modules/.bin/jest __tests__/your-test.test.js
# Or run all probe tests
node --experimental-vm-modules node_modules/.bin/jest
```

Every new file MUST have a corresponding `__tests__/*.test.js` file. Coverage
must be >=90% on the new code.

### Phase B: Synthetic Reference Endpoints

The probe verifies against REAL endpoints. "Running against `/api/v1/health`
proves nothing for declared-schema logic."

**Adding a synthetic endpoint:**

The probe discovers endpoints from the runtime OpenAPI spec, not from file
paths. You may place the controller anywhere in your NestJS app — the only
requirement is that it declares the decorators your detector depends on.

1. Create (or reuse) a NestJS controller anywhere in the project that
   declares the decorators exercising your code path:
   ```typescript
   @Get('your-feature')
   @ApiOperation({ summary: 'Description' })
   @ApiResponse({ status: 200, description: 'OK', type: YourDto })
   @ApiResponse({ status: 4xx, description: 'Error' })
   yourFeature(): YourDto { ... }
   ```

2. Add matching controller test in `__tests__/`

3. Register the module (if new) in `app.module.ts`

4. For TEMPORARY synthetic endpoints (commits that don't add permanent
   endpoints):
   - Add endpoint, run probe, verify
   - Revert the controller changes (do not stage them)
   - Re-run probe to confirm baseline still green
   - Only stage probe files, not app files

### Phase C: Live Probe

```bash
pnpm probe:smoke
```

This auto-regenerates `.matrix.json` and `.flows.generated.json` before running.

After running, verify:
1. Grep `.flows.generated.json` for your new step kinds / assertion shapes
2. Confirm each branch of your detector/emitter produced distinct flows
3. Check for 0 failures in the probe output

### Phase D: Baseline Verification (for temporary endpoints only)

After reverting temporary synthetic endpoints:
```bash
pnpm probe:smoke
```
Confirm still green on baseline.

---

## 8. Byte-Parity Sync Protocol

All probe files must be identical across 5 profiles:
- `builder` (canonical source)
- `lead`
- `merger`
- `reviewer`
- `scout`

### Sync script:

```bash
BUILDER=".overstory/claude-profiles/builder/hooks/probes"
for profile in lead merger reviewer scout; do
  TARGET=".overstory/claude-profiles/$profile/hooks/probes"
  # Sync all probe files (preserve directory structure)
  for file in $(find "$BUILDER" -type f -not -path '*node_modules*' -not -path '*.git*'); do
    relpath="${file#$BUILDER/}"
    target_file="$TARGET/$relpath"
    mkdir -p "$(dirname "$target_file")"
    cp "$file" "$target_file"
  done
done
```

### Verify byte-parity:

```bash
BUILDER=".overstory/claude-profiles/builder/hooks/probes"
for profile in lead merger reviewer scout; do
  TARGET=".overstory/claude-profiles/$profile/hooks/probes"
  echo "=== $profile ==="
  diff -rq "$BUILDER" "$TARGET" \
    --exclude=node_modules \
    --exclude=.git \
    --exclude='*.log' \
    --exclude='.matrix.json' \
    --exclude='.matrix.stderr.log' \
    --exclude='.flows.generated.json'
done
```

### What to sync:
- All `.js`, `.ts`, `.json` files in `hooks/probes/`
- All files in `hooks/probes/detectors/`, `hooks/probes/lib/`, `hooks/probes/__tests__/`, `hooks/probes/__fixtures__/`
- `derive-test-matrix.js`, `flows-generator.js`, `matrix-loader.ts`

### What NOT to sync:
- `node_modules/`
- `.matrix.json`, `.flows.generated.json` (generated at runtime)
- `.matrix.stderr.log`

### md5 verification:

```bash
BUILDER=".overstory/claude-profiles/builder/hooks/probes"
for f in derive-test-matrix.js flows-generator.js matrix-loader.ts; do
  echo "$f:"
  for profile in builder lead merger reviewer scout; do
    md5 -q ".overstory/claude-profiles/$profile/hooks/probes/$f"
  done | sort -u | wc -l | xargs printf "  unique hashes: %d\n"
done
```

All should show `unique hashes: 1`.

---

## 9. Pre-Commit Review Protocol

The worker MUST NOT commit before receiving "APPROVED" from the lead.

### 9-Piece Pre-Commit Review Message:

1. **Proposed commit message** (conventional commit, no co-author trailer)
   ```
   feat(probes): <description>
   ```

2. **Files changed** — list every file, confirm NO `apps/` files staged (unless
   the commit intentionally adds permanent reference endpoints)

3. **Unit test counts** — `X/X pass` per test suite

4. **Synthetic verification evidence** — paste ACTUAL probe output lines showing
   the new code path firing. Not a summary. The actual lines.

5. **Regenerated `.flows.generated.json` excerpt** — grep for new step kinds /
   assertion shapes per endpoint. Show the actual JSON entries.

6. **Assertion trace** — full assertion output for new flows (PASS/FAIL)

7. **Contract drifts surfaced** — list any. These are GOOD; document, don't
   paper over.

8. **md5 byte-parity confirmation** — paste the md5 output showing all 5
   profiles match

9. **Baseline green confirmation** — "Probe green on baseline after synthetic
   endpoint revert" (or "N/A — permanent endpoint" if applicable)

---

## 10. Common Patterns and Anti-Patterns

### Pattern: Adding a New Detector

```
1. Create detectors/your-feature.js
2. Export a detect function: detectYourFeature(projectDir, diag) → result | null
3. In derive-test-matrix.js:
   - Add require() at top
   - Add try/catch call in main(), assign to matrix field
4. In matrix-loader.ts:
   - Add TypeScript type for the new matrix field
   - Add coercion in loadMatrix()
5. In flows-generator.js:
   - Read the new matrix field
   - Decide which emitter function(s) consume it
6. Create __tests__/your-feature.test.js
7. Byte-parity sync
```

### Pattern: Adding a New Emitter

```
1. In flows-generator.js:
   - Add emitYourFeatureFlows(ep, matrix, options) function
   - Call it in the main endpoint iteration loop
   - Return array of Flow objects
2. Each Flow must have:
   - id: deterministic hash (use sha256(method + path + suffix))
   - name: "method path:suffix" (e.g. "POST /api/v1/items:upload-happy")
   - steps: array of step objects (api-call, expect, capture, etc.)
3. If new step kinds are needed:
   - Add handler in assertion-library.ts
   - Add HTTP helpers in http-client.ts if needed
4. Create or extend __tests__/your-feature.test.js
5. Byte-parity sync
```

### Pattern: Adding a New Step Kind

```
1. In assertion-library.ts:
   - Add case in the step executor switch
   - Implement the execution + assertion logic
2. In http-client.ts (if new HTTP capability needed):
   - Add method (e.g. sendFormData, readBinaryResponse, connectSSE)
3. In flows-generator.js:
   - Emit steps with the new kind
4. In matrix-loader.ts (if new matrix types needed):
   - Add TypeScript types
5. Tests:
   - assertion-library.test.ts — unit test the step executor
   - flows-generator test — verify emitter produces steps with the kind
6. Byte-parity sync
```

### Anti-Pattern: Runtime Sniffing

WRONG:
```javascript
// In flows-generator.js or assertion-library.ts
if (body.success === false && body.error) {
  // sniffing the response shape at runtime
}
```

RIGHT:
```javascript
// In detectors/error-envelope.js (at matrix generation time)
const shape = analyzeErrorShape(jsonCallBody);
// shape.wrapper = ['error'], shape.statusField = 'statusCode'
// This goes into matrix.errorEnvelope
// flows-generator reads matrix.errorEnvelope, not the response
```

### Anti-Pattern: Path Regex for Auth Detection

WRONG:
```javascript
// In flows-generator.js
if (/login|signin/.test(ep.path)) {
  tokenIssuer = ep;
}
```

RIGHT:
```javascript
// In detectors/auth-flows.js
// Priority 1: operationId match
// Priority 2: x-auth-issues-token extension
// Priority 3: response schema has accessToken/token fields
// Priority 4 (FALLBACK, emits DIAG warning): path regex
```

### Anti-Pattern: Blanket Field Assertions

WRONG:
```javascript
// In flows-generator.js
steps.push({ kind: 'expect', bodyHas: ['id'] }); // assumes all responses have 'id'
```

RIGHT:
```javascript
// Use responseContract from OpenAPI schema
const contract = extractResponseContract(spec, operation);
steps.push({ kind: 'expect', bodyHas: contract.requiredPaths });
// bodyHas: ['id', 'title', 'author', 'author.id', 'author.name']
```

---

## 11. Reference: Existing Detector Patterns

### How `response-envelope.js` works (THE model to follow)

1. Finds `apps/api/src/main.ts`
2. Scans for `useGlobalInterceptors(new ClassName())`
3. Resolves `ClassName` via its import path
4. Reads the interceptor source file
5. Parses `.pipe(map((data) => ({ success: true, data })))` to extract wrapper path `['data']`
6. Returns `{ successWrapper: ['data'], errorWrapper: null, source: 'path/to/file.ts' }`

Key design: **no HTTP request, no runtime check**. Pure static source analysis.

### How `error-envelope.js` works

1. Finds `apps/api/src/main.ts`
2. Scans for `useGlobalFilters(new ClassName())`
3. Resolves `ClassName` via its import path
4. Reads the filter source file
5. Finds `response.status(...).json({...})` in the catch handler
6. Parses the object literal: `{ success: false, error: { statusCode, message } }`
7. Returns `{ wrapper: ['error'], statusField: 'statusCode', messageField: 'message', errorsArrayField: 'errors' }`

### How `auth-flows.js` works

1. Reads `matrix.apiEndpoints` (already enriched with zodContract, responseContract, operationId, securityRequirement)
2. For each auth role (tokenIssuer, register, logout, refresh, mePoll):
   - Priority 1: `operationId` match (e.g. `login`, `register`, `refreshToken`)
   - Priority 2: OpenAPI extension (`x-auth-issues-token`)
   - Priority 3: Response schema content (e.g. has `accessToken` field)
   - Priority 4: Path regex fallback (emits DIAG warning)
3. Returns `{ tokenIssuer, register, logout, refresh, mePoll }`

### How `nest-openapi.js` works

The central enrichment detector. Parses the live OpenAPI spec from
`apps/api/.openapi.json` (generated at build time by NestJS Swagger). For each
operation:

1. Extracts `operationId`, `security[]`, `parameters`, `requestBody`, `responses`
2. From `requestBody`: extracts Zod schema reference → zodContract (via tsx subprocess)
3. From `responses`: extracts responseContract (required paths), errorShape (family), content types
4. From `parameters[in=header]`: detects idempotency, conditional, CSRF headers
5. From `parameters[in=query]`: detects pagination profile
6. From `security[]`: maps to securitySchemes → authDecorators

All enrichment data is attached directly to each endpoint object in the matrix.

---

## 12. Reference: Existing Synthetic Endpoints

> **Self-verify fixtures only.** The endpoints below exist in THIS repository
> to verify the probe pipeline itself. They are tools for the probe maintainer,
> not a template for where YOUR endpoints must live. The probe discovers
> endpoints from the runtime OpenAPI spec — controller file locations are
> irrelevant. Any NestJS controller anywhere in any project that declares the
> appropriate decorators will be detected.

### probe-ref controller (25+ endpoints)

| Branch | Path | Purpose |
|---|---|---|
| 1 | `GET /probe-ref/item` | responseContract (nested DTO) |
| 2 | `POST /probe-ref/item` | zodContract + nest-wrapped error |
| 3 | `POST /probe-ref/item-default-error` | nest-default error |
| 4 | `POST /probe-ref/item-errors-array` | errors-array error |
| 5 | `POST /probe-ref/item-no-error-schema` | raw/heuristic error |
| 6 | `GET /probe-ref/error-envelope-verify` | error envelope shape |
| 7 | `GET /probe-ref/redirect-permanent` | 301 redirect |
| 8 | `GET /probe-ref/conditional` | 304 ETag |
| 9 | `POST /probe-ref/method-restricted` | 405 |
| 10 | `GET /probe-ref/gone-resource` | 410 |
| 11 | `PUT /probe-ref/precondition-item` | 412 |
| 12 | `POST /probe-ref/json-only` | 415 |
| 13 | `PUT /probe-ref/require-precondition` | 428 |
| 14 | `GET /probe-ref/rate-limited` | 429 |
| 15 | `GET /probe-ref/legal-block` | 451 |
| 16 | `GET /probe-ref/partial-content` | 206 Range |
| 17 | `GET /probe-ref/list-offset` | offset pagination |
| 18 | `GET /probe-ref/list-cursor` | cursor pagination |
| 19 | `GET /probe-ref/list-links` | link-header pagination |
| 20 | `POST /probe-ref/upload-image` | multipart upload |
| 21 | `POST /probe-ref/upload-octet` | octet-stream upload |
| 22 | `GET /probe-ref/download-png` | binary download (PNG) |
| 23 | `GET /probe-ref/download-pdf` | binary download (PDF) |
| 24 | `GET /probe-ref/download-octet` | binary download (octet) |
| 25 | `GET /probe-ref/stream-events` | SSE stream |
| 26 | `POST /probe-ref/idempotent-create` | idempotency-key |
| 27 | `POST /probe-ref/refresh-token` | refresh-token rotation |

### probe-ref-security controller (6 endpoints)

| Path | Purpose |
|---|---|
| `GET /probe-ref/csrf-token` | CSRF token issuer |
| `POST /probe-ref/csrf-protected` | CSRF-protected endpoint |
| `GET /probe-ref/oauth/authorize` | OAuth2 authorize |
| `POST /probe-ref/oauth/token` | OAuth2 token exchange |
| `GET /probe-ref/oauth/callback` | OAuth2 callback |
| `GET /probe-ref/tenants/:tenantId/items` | Tenant-scoped read |
| `POST /probe-ref/tenants/:tenantId/items` | Tenant-scoped write |

---

## Appendix A: Commit Message Format

```
feat(probes): <concise description>
```

Rules:
- NO `Co-Authored-By: Claude...` trailer
- NO emoji
- Conventional commit format: `type(scope): description`
- Scope is always `probes` for this plan
- Body (if needed): plain prose, no AI attribution

Examples from landed commits:
```
feat(probes): OpenAPI response-schema extraction for happy-flow assertions
feat(probes): static error-envelope detector replacing runtime fallback
feat(probes): declaration-driven auth detection + generalized security scheme support
feat(probes): multipart upload + binary download + SSE streaming coverage
feat(probes): WebSocket detector + Socket.IO probe pipeline
```

## Appendix B: Test Running

```bash
# Run a specific detector test
cd /Users/mako/Documents/GitHub/sfx-webapp-boilerplate
node --experimental-vm-modules .overstory/claude-profiles/builder/hooks/probes/node_modules/.bin/jest \
  .overstory/claude-profiles/builder/hooks/probes/__tests__/your-test.test.js

# Run all probe tests
node --experimental-vm-modules .overstory/claude-profiles/builder/hooks/probes/node_modules/.bin/jest \
  --config .overstory/claude-profiles/builder/hooks/probes/jest.config.js

# Run the live probe
pnpm probe:smoke

# Run the API only
pnpm --filter @sfx/api dev
```

## Appendix C: Envelope Handling

The response envelope is the wrapper that NestJS adds around all responses:

**Success path** (TransformInterceptor):
```json
{ "success": true, "data": <actual response body> }
```
Extracted by `detectors/response-envelope.js` → `matrix.responseEnvelope.successWrapper = ['data']`

**Error path** (GlobalExceptionFilter):
```json
{ "success": false, "error": { "statusCode": 400, "message": "..." } }
```
Extracted by `detectors/error-envelope.js` → `matrix.errorEnvelope.wrapper = ['error']`

The flows-generator and assertion-library consume these paths to:
1. Unwrap `$.accessToken` → `$.data.accessToken` transparently in capture steps
2. Unwrap error assertions to check `$.error.statusCode` instead of `$.statusCode`
3. Prepend envelope paths to `bodyHas` assertions

The probe NEVER sniffs the response to figure out the wrapper. It reads it from
the matrix, which extracted it statically from source code.

## Appendix D: Security Scheme Handling

OpenAPI `securitySchemes` are extracted by `nest-openapi.js` and stored in
`matrix.securitySchemes`. Per-endpoint `securityRequirement[]` maps to a scheme.

The flows-generator resolves the primary scheme type for auth boundary flows:
- `bearer` (HTTP Bearer) → `Authorization: Bearer <token>`
- `apiKey` (API key in header) → `<headerName>: <value>`
- `basic` (HTTP Basic) → `Authorization: Basic <base64>`
- `oauth2` → follows OAuth2 flow

`emitAuthBoundaryFlows()` generates `:no-auth` (no credential → 401), `:expired-token`
(expired JWT → 401), `:wrong-secret` (wrong signature → 401) flows per scheme type.

The `detectAuthFlows()` function in `detectors/auth-flows.js` identifies which
endpoints are auth actors (login, register, refresh, logout, me) via operationId,
extensions, and response schema — NOT path regex.
