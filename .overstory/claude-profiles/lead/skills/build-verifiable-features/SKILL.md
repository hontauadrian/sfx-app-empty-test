---
name: build-verifiable-features
description: |
  Required decorator declarations for the runtime probe to verify your code.

  INVOKE WHENEVER `pnpm probe:smoke` (or any [http-smoke-FAIL] block) emits
  ANY of these — these strings auto-route here:
    - RESOURCE_CAPTURE_UNDECLARED
    - RESOURCE_CAPTURE_PATHPARAM_UNDECLARED
    - chain:resource-setup:* step failure
    - FLOW_STEP_FAILED on step2:expect (typically 403 or 404)
    - "chainable POST" / "fromPath" / "pathParam" / "x-resource-captures"
    - missing @ResourceCaptures, @ApiProperty(type:), or @Inject(Token)

  ALSO INVOKE when authoring: chainable POST handlers (resource creation
  endpoints whose response IDs another route consumes), NestJS DTO classes
  (every @ApiProperty needs explicit `type:` under tsx + esbuild), or
  constructor parameter injection (every parameter needs @Inject(Token)).

  Covers @ResourceCaptures (chain captures), @ApiProperty(type:) (reflection
  workaround), @Inject(Token) (constructor injection), and the meta-principles
  behind why these are required. For Swagger decorators (@ApiResponse, cookie
  roles, CSRF, bearer auth) see nestjs-probe-coverage instead.
---

# build-verifiable-features

## What this skill does

Teaches you how to declare features so the runtime-verification probe
(in `.overstory/claude-profiles/<profile>/hooks/probes/`) can automatically
verify them when the stack boots.

**`pnpm probe:smoke` is one command, idempotent, ready out-of-the-box.** It
runs the full bootstrap (stack:up → prisma migrate deploy → prisma generate
→ api reload → openapi:dump → TRUNCATE + seed) before exercising flows. You
do NOT need to run `pnpm stack:reset`, `pnpm db:reset:fast`, or
`pnpm openapi:dump` manually before a probe — even when you've added new
migrations or changed prisma schema. Re-running `pnpm probe:smoke` after a
fix is the entire iteration loop.

## When to invoke a sub-skill

Read the relevant sub-skill BEFORE writing code for that feature:

| If you're building | Read |
|---|---|
| Auth (login / register / logout / refresh / me) | `nestjs-probe-coverage/SKILL.md` §2.9 — **REQUIRED canonical `operationId`** (`authLogin`, `authRegister`, `authLogout`, `authRefresh`, `authMe`) or matching `x-auth-*` extension. Without it the probe cannot pick the right token-issuer and `chain:auth-bootstrap` fails. |
| CSRF protection | `nestjs-probe-coverage/SKILL.md` §2.10 — **V1 strict, no path-regex.** Declare ONE issuer signal: `operationId: 'csrfToken'` (preferred), `csrf:issuer` `SetMetadata`, or `x-csrf-issues-token` extension. Token field name + header name read VERBATIM. Without a declared signal the detector emits `CSRF_TOKEN_ENDPOINT_UNDETECTED`. See also `csrf.md` for the per-feature recipe. |
| OAuth2 authorization / token / callback | `nestjs-probe-coverage/SKILL.md` §2.11 — **V1 strict, no path-regex.** Declare each role via OpenAPI `securitySchemes` flow URLs, `operationId` (`oauthAuthorize` / `oauthToken` / `oauthCallback`), or `x-oauth-role` extension. Path appearance is NOT a signal. Duplicate role declarations emit `OAUTH_ROLE_AMBIGUOUS`. See also `oauth.md` for the per-feature recipe. |
| Multi-tenant isolation | `nestjs-probe-coverage/SKILL.md` §2.12 — **V1 strict, no path-regex.** Declare scope via `@ApiHeader({ name: 'X-Tenant-ID' })` (preferred), `x-multi-tenant` extension, or `@TenantId()` decorator. Path-lures (`:tenantId`, `/tenants/`, `/orgs/`) are NOT detected. Distinct headers across endpoints emit `TENANCY_SCOPE_AMBIGUOUS`. See also `multi-tenancy.md` for the per-feature recipe. |
| Refresh-token rotation (HttpOnly cookie) | `cookies.md` §refresh-token — Declare via `x-cookie-role: 'refresh-token'` + `x-cookie-name` on `@ApiResponse` headers (P2), or `@CookieRole(name, 'refresh-token')` (P3). Probe asserts rotation, attribute drift, tamper/omit rejection. |
| Session-cookie auth | `cookies.md` §session — Declare via `addApiKey({ in: 'cookie' }, 'sessionCookie')` (P1), `x-cookie-role: 'session'` (P2), or `@CookieRole` (P3). Default-strict auto-asserts `httpOnly: true`. |
| CSRF double-submit (cookie + header) | `cookies.md` §csrf-double-submit — Extends `csrf.md`. Declare cookie via P1/P2/P3 + consumer via `@CookieConsumer.csrfDouble(cookieName, headerName)`. Probe asserts echo, mismatch rejection, omission rejection. |
| OAuth `state` cookie | `cookies.md` §oauth-state — Extends `oauth.md`. Declare on `/authorize` response via P1/P2/P3. Consumer on `/callback` via `@CookieConsumer`. Probe asserts tamper/omit rejection on callback. |
| Tenant-scope cookie | `cookies.md` §tenant-scope — Extends `multi-tenancy.md`. Declare via P2/P3 on login. Consumer via `@CookieConsumer`. Probe asserts tenant isolation via cookie swap. |
| Locale / theme / feature-flag cookies | `cookies.md` §locale, §theme, §feature-flag — Declare via P2/P3. Probe asserts capture, attribute drift, default-on-omit. |
| WebSocket / Socket.IO real-time | `websocket.md` |
| GraphQL schema | `graphql.md` |
| Idempotent POST endpoints | `idempotency.md` |
| ETag conditional requests | `etag.md` |
| Paginated list endpoints | `pagination.md` |
| File upload / binary download / SSE | `upload-download-sse.md` |
| Custom error response shapes | `error-shapes.md` — includes `x-error-status-field` / `x-error-message-field` / `x-error-errors-field` OpenAPI extensions for declaring semantic field roles. Without them the probe carries field names verbatim but cannot run semantic-role assertions. |
| Wrapping success responses | `response-envelope.md` |
| Next.js protected pages, tRPC protected procedures, login/register/post-login destination | `auth-pages.md` — declaration-driven only. Folder names like `(auth)`/`(dashboard)` and procedure names like `protectedProcedure` are no longer detected. Use `// @routeGuard authenticated` (Next.js), `// @protected` or `.meta({ protected: true })` (tRPC), and `overlay.auth.{loginPage,registerPage,postLoginDestination}` for page identity. |
| HTML form / `useForm()` submission flows | `forms.md` — **stubbed.** The detector records form markers but no consuming emitter exists today; no `form:*` flows run. The previous source-code regex heuristics (`fetch(...)` URL extraction, `name=` field scanning, `router.push(...)` navigation guess) were removed. Rely on API-side flows for submit-endpoint coverage. |

## Why this matters

The probe is **declaration-driven**. It reads:
- OpenAPI specs generated from `@Api*` decorators
- Zod schemas in `packages/validation/`
- NestJS guards, security requirements, headers
- The compiled runtime contract

If you skip a decorator or use manual `@Res()` instead of throwing
`HttpException`, the probe can't see your intent and either misses the
endpoint or surfaces a drift. **Every sub-skill tells you exactly which
declarations the corresponding detector scans for.**

## Hard rule for verification

If you build a feature that doesn't fit any sub-skill, the probe will
likely miss it. Either:
1. Find the closest sub-skill and adapt — preserve the declaration patterns.
2. Add a new detector + emitter to `hooks/probes/detectors/` AND document
   the pattern as a new sub-skill here.

Never silence a probe failure by adding to `overlay.ignore[]` for routes
your code introduced — that's a banned anti-pattern enforced by hooks.

## Probe-friendly code — meta-principles

Two general principles govern all probe-friendly code in `apps/api/src/`.
Every specific rule below is an application of one or both. When you
encounter a NEW situation not explicitly listed, apply these principles
directly — don't wait for someone to document the specific case.

### Meta-principle A: The probe is declaration-driven, not inferential

Anything the probe needs to know about your code — response shape, error
envelope, capture chain, auth scheme, pagination, idempotency, headers,
cookie roles — MUST be explicitly declared via decorator, OpenAPI extension,
Zod schema, or matrix entry. If you didn't declare it, the probe will
either go red with a DIAG (good — the gate is working) or silently
under-cover your code (bad — coverage gap hides bugs).

**Recognition test:** If you're writing code and thinking "the probe should
be able to figure this out from context" — STOP. It won't, by design. Add
the declaration.

### Meta-principle B: tsx + esbuild don't emit reliable reflect-metadata

The OpenAPI dumper (`apps/api/scripts/dump-openapi.ts`) and the dev server
both run under `tsx`, which uses esbuild for transpilation. esbuild's
`emitDecoratorMetadata` implementation does NOT reliably emit:
- `design:type` for property decorators
- `design:paramtypes` for constructor parameters

Anywhere NestJS or another framework would infer types from TypeScript
at runtime via reflect-metadata, you MUST declare the type explicitly.
The symptom is always misleading — circular-dependency errors, undefined
injections, silent crashes — because the framework assumes the metadata
exists and interprets its absence as something else entirely.

**Recognition test:** If you're adding a decorator that NestJS documents as
"automatically infers the type from TypeScript" — that inference relies on
reflect-metadata and WILL fail under tsx. Add the explicit `type:` or
`@Inject(Token)` declaration.

---

## Worked examples

The following are applications of the meta-principles above. They are
illustrative, not exhaustive. Tomorrow there will be another decorator with
the same root cause — apply the meta-principles, not just these three rules.

### Example 1: `@ApiProperty({ type: ... })` — applies meta-principle B

NestJS Swagger reads `design:type` to resolve property types for OpenAPI
schema generation. Under tsx, that metadata is missing. Swagger trips its
circular-dependency guard and aborts with:

```
Error: A circular dependency has been detected (property key: "X").
Please, make sure that each side of a bidirectional relationships are
using lazy resolvers ("type: () => ClassType").
```

This error is **misleading** — there is no actual circular dependency.
The real cause is missing reflect-metadata.

**Always declare explicit `type:` on every `@ApiProperty` / `@ApiPropertyOptional`:**

```ts
// WRONG — bare decorator. Will fail openapi:dump under tsx.
export class FooDto {
  @ApiProperty()
  id!: string;
  @ApiProperty()
  count!: number;
}

// RIGHT — explicit type, reflection-independent.
export class FooDto {
  @ApiProperty({ type: String })
  id!: string;
  @ApiProperty({ type: Number })
  count!: number;
  @ApiProperty({ type: Boolean })
  active!: boolean;
  @ApiProperty({ type: [String] })
  tags!: string[];
  @ApiProperty({ type: [BarDto] })
  bars!: BarDto[];
  @ApiProperty({ type: BarDto })
  bar!: BarDto;
  @ApiProperty({ type: () => [TreeDto] })  // self-ref needs lazy resolver
  children!: TreeDto[];
}
```

Self-referencing DTOs (`children!: TreeDto[]` inside `TreeDto`) MUST use
a lazy resolver: `type: () => [TreeDto]` — NestJS Swagger handles that
correctly even under tsx.

Enforced via `pnpm --filter @sfx/api openapi:dump` returning exit-0.
Run it locally before any commit that adds a DTO.

Reference DTOs: `apps/api/src/modules/probe-ref/auth-r2/application/dtos/*.dto.ts`

### Example 2: `@Inject(Token)` on constructor parameters — applies meta-principle B

NestJS reads `design:paramtypes` to resolve constructor injection targets.
Under tsx, that metadata is missing. The injector hands `undefined` to the
constructor, and instantiation crashes with:

```
TypeError: Cannot read properties of undefined (reading 'get')
    at new <YourStrategy> (...strategy.ts:NN:NN)
    at Injector.instantiateClass (...injector.js:...)
```

There is no actual missing dependency — the cause is missing reflect-metadata.

**Fix: every constructor parameter of type `Service`/`Strategy`/`Repository`/`Provider` MUST be decorated with `@Inject(Token)`.**

Bad:
```ts
constructor(private configService: ConfigService) { ... }
```

Good:
```ts
import { Inject } from '@nestjs/common';
constructor(@Inject(ConfigService) private configService: ConfigService) { ... }
```

This applies to every:
- `*.strategy.ts`
- `*.service.ts` (when injected by another class)
- `*.repository.ts`
- guards, interceptors, exception filters with constructor params
- any class instantiated by NestJS DI under tsx

Without `@Inject`, `pnpm openapi:dump` crashes silently with code 1, no
stderr by default, and the live API may also fail to boot from the same
class. Both `pnpm probe:smoke` (depends on `.openapi.json`) and the static
matrix regen break.

### Example 3: `@ResourceCaptures(...)` on chainable POST handlers — applies meta-principle A

NestJS controllers expose path-param chains: `POST /teams` returns a team
with an `id`, then `GET /teams/:id`, `PATCH /teams/:id`, `DELETE /teams/:id`
all consume that id. The runtime probe needs to know which response field to
capture and which sibling-route param it satisfies. Without an explicit
declaration the probe cannot guess (NEVER HEURISTIC) — it stays silent and
CRUD coverage drops.

**Apply `@ResourceCaptures(...)` from `apps/api/src/common/decorators/resource-captures.decorator.ts` to any POST handler whose response contains an identifier consumed by another route in the same module.**

The decorator takes one or more `ResourceCapture` records:

| Field      | What it is                                             | Example values                          |
|------------|--------------------------------------------------------|-----------------------------------------|
| `fromPath` | JSONPath into the response body (envelope-aware)       | `'id'`, `'slug'`, `'data.token'`, `'user.id'` |
| `resource` | Semantic name of the captured resource                 | `'team'`, `'user'`, `'membership'`      |
| `pathParam`| Which sibling-route `:param` this satisfies            | `'id'`, `'slug'`, `'userId'`, `'teamId'`|

#### Code examples

POST returning a single id used by GET/PATCH/DELETE:
```ts
import { ResourceCaptures } from '@/common/decorators/resource-captures.decorator';

@Post()
@ResourceCaptures({ fromPath: 'id', resource: 'team', pathParam: 'id' })
@ApiResponse({ status: 201, type: TeamResponseDto })
create(@Body() dto: CreateTeamDto) { ... }
```

POST creating multiple chainable resources (e.g. team membership returns
membership id AND associated user id, both consumed by sibling routes):
```ts
@Post(':teamId/members')
@ResourceCaptures(
  { fromPath: 'id',     resource: 'membership', pathParam: 'membershipId' },
  { fromPath: 'userId', resource: 'user',       pathParam: 'userId' },
)
addMember(@Param('teamId') teamId: string, @Body() dto: AddMemberDto) { ... }
```

POST returning a custom-named identifier (slug instead of id):
```ts
@Post()
@ResourceCaptures({ fromPath: 'slug', resource: 'gizmo', pathParam: 'slug' })
createGizmo(@Body() dto: CreateGizmoDto) { ... }
```

POST whose response is wrapped by a TransformInterceptor envelope
(`{success: true, data: {...}}`) — the probe is envelope-aware, so just
declare the field name as if the envelope wasn't there:
```ts
// envelope: {success:true, data:{user:{id, ...}, accessToken}}
@Post('login')
@ResourceCaptures(
  { fromPath: 'user.id',     resource: 'user', pathParam: 'userId' },
  { fromPath: 'accessToken', resource: 'auth', pathParam: 'accessToken' },
)
login(@Body() dto: LoginDto) { ... }
```

#### Failure mode

If you don't add `@ResourceCaptures` to a chainable POST:
- The probe will not generate a `chain-crud-roundtrip` flow for that resource.
- GET/PATCH/DELETE on `:id` will be probed in isolation with placeholder ids
  (likely 404), masquerading as healthy responses.
- CRUD coverage gap goes undetected — until a hook author later instruments
  it and finds your endpoint missing.

The probe will NOT guess based on field names. Heuristic detection was
explicitly removed in commit 8a652f2; declarations are the only signal.

### Example 4: `@BodyResourceRefs(...)` on consumers of foreign records — applies meta-principle A

`@ResourceCaptures` covers path-param chains (parent path produces an id, child path consumes it). It does NOT cover request-body fields whose value must reference an **existing** record (invite-by-email, transfer-ownership-by-userId, share-with-org, follow-by-username, mention-by-handle). For those, the probe needs a parallel declaration so it pre-creates the referenced record before exercising your endpoint — otherwise the body sigil expands to a fresh `${uniqEmail}` / `${uniqString}` that exists nowhere, and your handler returns `404 X not found`.

**Apply `@BodyResourceRefs(...)` from `apps/api/src/common/decorators/body-resource-refs.decorator.ts` to any endpoint whose request body contains a field referencing a record that must already exist in the database.**

| Field          | What it is                                                                                                  | Example                                  |
|----------------|-------------------------------------------------------------------------------------------------------------|------------------------------------------|
| `parentField`  | Body field name                                                                                             | `'email'`, `'ownerId'`, `'projectSlug'`, `'<arrayFkField>'` |
| `parentCreate` | `{ operationId }` of the creator endpoint                                                                   | `{ operationId: 'register' }`            |
| `resource`     | Alternative to `parentCreate`: path of the creator POST                                                     | `'/api/v1/auth/register'`                |
| `captureFrom`  | JSONPath into creator's success response body (envelope-aware). Defaults to creator's `@ResourceCaptures`.  | `'$.email'`, `'$.data.user.id'`          |
| `kind`         | Field shape. `'scalar'` (default) substitutes a single captured id. `'array'` pre-creates `count` parents and substitutes an array of ids. | `'scalar'`, `'array'` |
| `count`        | For `kind: 'array'`: number of parents to pre-create. Default `2`.                                          | `2`, `3`                                 |

```ts
import { BodyResourceRefs } from '@/common/decorators/body-resource-refs.decorator';

// POST /teams/:id/members invites an EXISTING user by email
@Post(':id/members')
@BodyResourceRefs({
  parentField: 'email',
  parentCreate: { operationId: 'register' },
  captureFrom: '$.email',
})
inviteMember(...) { ... }

// POST /projects assigns an existing user as owner by id
@Post()
@BodyResourceRefs({
  parentField: 'ownerId',
  parentCreate: { operationId: 'register' },
  captureFrom: '$.id',
})
createProject(...) { ... }
```

#### Array-of-FK body fields — `kind: 'array'`

Bulk endpoints whose body field is an **array of foreign-key ids** (`<arrayFkField>: string[]`) need the array shape. The probe pre-creates `count` parents and substitutes the body field with an array of captured ids — `[${resource:<label>:id:0}, ${resource:<label>:id:1}]`. Cascading parent chains are handled transparently (e.g. each created child first chains through its own `@BodyResourceRefs` dependencies).

```ts
// Bulk endpoint: body field is an array of FK ids referring to EXISTING records.
@Post('<sub-path>')
@BodyResourceRefs({
  parentField: '<arrayFkField>',
  resource: '/<api-prefix>/<parent-path>',
  kind: 'array',
  count: 2,
})
<handler>(...) { ... }
```

The generator emits `chain:resource-setup:<label>:array:<count>` (distinct from the scalar `chain:resource-setup:<label>`), so a single resource can be referenced both as scalar and as array across the API without colliding.

**Never modify the handler to silence the probe.** If the bulk handler validates id existence (404 on first missing) or auth (403 on non-member), keep that behavior — the decorator's job is to teach the probe to send real ids, not to soften the handler. Patching the handler to accept bogus ids weakens auth and is a conduct failure (see CLAUDE.md § "No gate-gaming").

#### Failure mode without it

`pnpm probe:smoke` reports the consumer endpoint failing with `4xx X not found` — the probe sent body containing `${uniqEmail}` / `${uniqString}` etc., the value resolves to a fresh random per-flow seed, the referenced record does not exist. **Do not debug your handler** — it is correct per its contract. The gap is the missing declaration. Add `@BodyResourceRefs` to teach the probe to seed the foreign record first.

#### Use vs `@ResourceCaptures`

- **`@ResourceCaptures`** = "my response produces a value used as a sibling-route `:param`" (path producer).
- **`@BodyResourceRefs`** = "my request body field references a foreign record that must exist" (body consumer).

They are symmetric and additive. An endpoint may declare both.

#### Stateful chains and mutating dependents — automatic fan-out

A `chain:resource-setup:*` creates a stateful record (membership, post, comment, etc.). When two or more dependent flows MUTATE that record (DELETE / PATCH / PUT / POST that consumes it), the generator now emits one chain copy per mutator with renamed binding keys, so each dependent gets its own fresh record. You do not declare anything for this — it is detected from the dependsOn graph and step methods.

Implication: do NOT debug a `404 X not found` on the second mutator (e.g. PATCH:happy after DELETE:happy passed). The chain will fan out automatically next regen. If your handler is correct, the issue is upstream.

If an endpoint with a mutating verb is actually idempotent (PUT upsert, POST query) and should keep sharing chain state, declare `@ApiExtension('x-idempotent', true)` (extension hook reserved for this — currently treated as a passive marker).

---

### Example 5: `@ApiExtension('x-requires-parent-role', ...)` + `@ApiExtension('x-on-create-grant-role', ...)` — chain auth threading

`@BodyResourceRefs` makes the probe pre-create the referenced parent record. That works when the parent's create endpoint is open to any authenticated user. It fails when the **child** endpoint additionally requires the caller to hold a role on the parent — e.g. child create has `await this.requireRole(body.<parentFkField>, userId, '<minimumRole>')`. The chain emitter would otherwise emit `register user A → user A creates parent → user A creates child` and 403 at runtime because the role check looks at a membership row the chain hasn't asserted exists.

**Two declarations make this deterministic. Both required.**

| Decorator | Where | Semantic |
|---|---|---|
| `@ApiExtension('x-on-create-grant-role', { role: '<role>', toCaller: true })` | The **parent's** create endpoint | The user calling this POST automatically becomes `<role>` on the new resource. Encode in code via the create handler also writing the membership/ownership row. |
| `@ApiExtension('x-requires-parent-role', { parentField: '<fkField>', minimumRole: '<role>', acceptableRoles: ['<roleA>', '<roleB>'] })` | The **child's** create endpoint | The caller must hold one of `acceptableRoles` on the resource referenced by the body's `<fkField>`. |

```ts
// Parent: the resource whose creation grants its creator a role.
@Post()
@ResourceCaptures({ fromPath: '<idField>', resource: '<parent-resource>', pathParam: '<idField>' })
@ApiExtension('x-on-create-grant-role', { role: '<role>', toCaller: true })
async create<Parent>(...) {
  const created = await this.repo.create({ ..., ownerId: caller.sub });
  await this.repo.addMember(created.id, caller.sub, '<role>');
  return this.toDto(created);
}

// Child: the resource whose creation requires the caller already hold a role
// on the parent named in body.<fkField>.
@Post()
@ResourceCaptures({ fromPath: '<idField>', resource: '<child-resource>', pathParam: '<idField>' })
@BodyResourceRefs([{ parentField: '<fkField>', resource: '/api/v1/<parent-path>' }])
@ApiExtension('x-requires-parent-role', {
  parentField: '<fkField>',
  minimumRole: '<role>',
  acceptableRoles: ['<role>', '<higherRole>'],
})
async create<Child>(...) {
  await this.requireRole(body.<fkField>, caller.sub, '<role>');
}
```

#### Failure mode without it

`chain:crud-roundtrip` emits a flow using the same auth-bootstrap token for both create steps. If the parent's create doesn't grant the required role (declaration absent OR runtime grant logic missing), the child step returns 403 at runtime. The chain looks correct on paper but always fails.

With both declarations present, the chain emitter validates the granted role covers the requirement. If it does, the flow emits with auto-threaded auth. If grant is declared but doesn't cover requirement (parent grants role X but child requires role Y where Y is not in `acceptableRoles`), the emitter emits `CHAIN_AUTH_UNRESOLVABLE` and **does NOT emit the chain flow** — better to surface the missing declaration than ship a 403-failing flow.

#### When NOT to declare

Endpoints that only require generic authentication (no role check on a parent) don't need either decorator. Skip both. The emitter falls back to the standard chain.

#### Symmetry note

The two decorators are independent. A resource may grant a role on creation without any child consumer requiring it (declare the grant for future use). A child may require a role on a parent without that parent declaring a grant (the chain will emit `CHAIN_AUTH_UNRESOLVABLE` until the parent's grant is declared OR the child's requirement is removed). The pairing is enforced by the generator at flow-emit time, not by NestJS — your runtime guards still must enforce the same rule independently.

---

## Extending this list

Tomorrow there will be another decorator with the same root cause. Apply
the meta-principles above, not just these three worked examples. If you
encounter a new quirk that falls under meta-principle A or B:

1. Write a fresh worked example below using the same structure (symptom,
   misleading error, root cause, bad/good code, enforcement command).
2. Tag it with which meta-principle it applies.
3. Add a follow-up `sd create` issue to teach it back to this skill so
   future agents benefit.

## Architecture model

The probe reads what your code declares, never guesses what it does. The
flow is:

1. You add `@ApiResponse({ status: 415, ... })` to a controller method.
2. `nest-openapi.js` extracts that into `matrix.apiEndpoints[i].swaggerDeclared.statuses`.
3. `flows-generator.js` emits a `:upload-wrong-mime` flow that exercises
   the 415 path.
4. The probe boots the real stack and runs the flow against the real
   endpoint.
5. If the real response disagrees with the declared shape, the probe
   reports a contract drift — **that drift is the value the probe
   provides, not a bug to paper over.**

So: declare what you intend, code what you declared, and let the probe
verify the agreement automatically.

## Declaration-driven detection — DIAG reference

The probe's detectors are **strictly declaration-driven**. Heuristics that
historically guessed intent from path names, folder names, function names,
or field names have been removed. Each removal added an `*_UNDECLARED`
DIAG that points you at the correct declaration to add.

If you see one of these DIAGs in your probe output, the fix is in this
table — never silence the DIAG by adding to `overlay.ignore[]`.

### Auth surfaces (controllers + middleware)

| DIAG | Trigger | Fix |
|---|---|---|
| `AUTH_FLOW_TOKENISSUER_UNDETECTED` | Login endpoint not identifiable. Path-regex (`/login\|signin/`) was removed. | Add `@ApiOperation({ operationId: 'authLogin' })` on the login handler. See `nestjs-probe-coverage/SKILL.md` §2.9. |
| `AUTH_FLOW_REGISTER_UNDETECTED` / `AUTH_FLOW_LOGOUT_UNDETECTED` / `AUTH_FLOW_REFRESH_UNDETECTED` / `AUTH_FLOW_MEPOLL_UNDETECTED` | Same — sibling endpoint not identifiable. | Add the matching canonical `operationId` (`authRegister` / `authLogout` / `authRefresh` / `authMe`). |
| `AUTH_TOKEN_STORAGE_UNDECLARED` | Session mechanism detected (jwt / next-auth / clerk / auth.js) but token storage is undeclared. Source-code regex matching `localStorage.setItem('token', ...)`, `zustand+persist`, and `cookies().set('session', ...)` was removed. | Informational only. No actionable overlay key exists today — the DIAG message references `overlay.authDetection.tokenStorage` but that key is **not** in `hooks/probes/overlay-schema.json`. Until future work adds it, `tokenStorage` stays `'unknown'` and persist-across-refresh assertions are skipped. |
| `EXPRESS_AUTH_UNDECLARED` | Express endpoint detected but middleware function-name match (`requireAuth`, `authGuard`, `isAuthenticated`, `ensureAuth`, `protect`, `jwt`) was removed. All Express endpoints now default to `guard='unknown'`. | Declare via `x-auth-required: true` OpenAPI extension on the endpoint, or move the route to NestJS where guards are first-class. |

### Next.js pages

| DIAG | Trigger | Fix |
|---|---|---|
| `NEXT_AUTH_UNDECLARED` | Next.js page detected but no auth-guard annotation. Folder-group matching (`(dashboard)`, `(authenticated)`, `(app)`, `(protected)`, `(private)`) and layout-source matching (`redirect()`, `auth()`, `getServerSession()`, `cookies().get('session'/'auth'/'token'/'sb-…')`) were all removed. | Add `// @routeGuard authenticated` comment OR `export const routeGuard = 'authenticated'` to the page or any ancestor `layout.tsx`. See `auth-pages.md`. |
| `LOGIN_PAGE_UNDECLARED` | `authed-login-page` logical-contract row matched but `/login\|signin/` page-route regex was removed. | Set `overlay.auth.loginPage = "/login"` (or actual path) in `.runtime-contract.overlay.json`. |
| `REGISTER_PAGE_UNDECLARED` | `authed-register-page` matched but `/register\|signup/` regex was removed. | Set `overlay.auth.registerPage = "/register"`. |
| `AUTH_POST_LOGIN_DEST_UNDECLARED` | Post-register/post-login destination not identifiable. `/dashboard/i` regex + "fall back to any authenticated page" were removed. | Set `overlay.auth.postLoginDestination = "/dashboard"` (or actual route). The route MUST exist as a detected page, otherwise the DIAG also fires with "does not match any page route". |

### tRPC procedures

| DIAG | Trigger | Fix |
|---|---|---|
| `TRPC_PROTECTION_UNDECLARED` | tRPC procedure has `guard='unknown'`. String-matching `protectedProcedure` by name was removed (aliasing defeats it). | Add `// @protected` comment on the line above the procedure, OR `.meta({ protected: true })` in the procedure chain. |

### Forms (stubbed — no consuming emitter)

Form-flow generation is not currently wired up. The detector emits a
single info-level `FORM_TARGET_UNDECLARED` listing the count of detected
form markers (`<form>`, `<Form>`, `useForm()`, `use:enhance`, `@submit`).
The message text suggests a `packages/validation/**/*.form.schema.ts`
declaration pattern — that pattern is **forward-looking, not landed**.

There is no `FORM_FIELDS_UNDECLARED` or `FORM_NAVIGATE_UNDECLARED` emitted
today; those are placeholder concepts in the source comments only.

Today: rely on the API-side flows that already exercise the submit
endpoint. See `forms.md` for the full status notice.

### Error envelope (global exception filter)

| DIAG | Trigger | Fix |
|---|---|---|
| `ERROR_STATUS_FIELD_UNDECLARED` | Filter object-literal scan finished, but field-name matching (`statusCode`/`status` → `statusField`) was removed. The probe now carries declared field names verbatim. | Add `x-error-status-field: 'statusCode'` (or actual field name) extension on the error response schema in OpenAPI. See `error-shapes.md`. |
| `ERROR_MESSAGE_FIELD_UNDECLARED` | Same — `message`/`detail` name match was removed. | Add `x-error-message-field: 'message'` extension. |
| (no DIAG, but optional) `errorsArrayField` | The `errors` key match was removed. | Add `x-error-errors-field: 'errors'` extension to enable validation-array assertions. |

### Fixture generation (request bodies)

| DIAG | Trigger | Fix |
|---|---|---|
| `FIXTURE_UNDECLARED` | Endpoint has request body but neither manifest `sampleValid` nor a Zod schema is declared. Field-name fallback (`email→smoke@example.com`, `password→Smoke!Password1`, `phone→+15555550100`, `name→'Smoke User'`, `id→randomUuid()`, `url→'https://example.com'`, `count→1`, `is[A-Z]→true`, `date→ISO`, default `'smoke-test'`) was removed. | Provide `sampleValid` in the route manifest (plan 05) OR a Zod schema in `packages/validation/`. Until then the endpoint is skipped. |
| `ZOD_STRING_NO_CONSTRAINT` | Zod string field has no `.email()`, `.url()`, `.uuid()`, or `.min(N)` constraint. The `sampleFromFieldName(name)` fallback was removed. | Add a constraint: `z.string().email()`, `z.string().uuid()`, `z.string().min(3)`. Without one the fixture uses `'x'.repeat(N)` deterministic fill, which usually fails server-side validation. |
| `ZOD_UNSUPPORTED_TYPE` | Zod field uses a type the fixture generator doesn't recognise (e.g. `z.discriminatedUnion`, `z.intersection`, custom `z.lazy`). | Use a supported Zod type, or extract the example into the route manifest's `sampleValid`. |

### Decorator matching (matrix enrichment)

| DIAG | Trigger | Fix |
|---|---|---|
| `DECORATOR_MATCH_AMBIGUOUS` | Matrix enrichment found multiple exact path matches in the OpenAPI document for one endpoint. Suffix-match (Pass 2) and handler-name-match (Pass 3) were removed — only normalized exact-path match (Pass 1) is accepted. | Make the path declaration unique. If two controller methods share the same path, give them distinct `operationId`s and route prefixes. |
