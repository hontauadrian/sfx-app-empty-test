---
name: nestjs-probe-coverage
description: |
  Annotate every NestJS endpoint so `/api/docs` is self-explanatory and the
  flows generator emits full probe coverage. Covers Swagger decorators
  (@ApiTags, @ApiOperation, @ApiResponse, @ApiParam, @ApiQuery, @ApiBody,
  @ApiOkResponse), Zod `.openapi()` annotations, bearer-auth guards, cookie
  roles (@CookieRole, @CookieConsumer), CSRF declarations, and custom
  composed decorators.

  INVOKE WHEN:
    - creating or modifying a controller, module, guard, or endpoint
    - `pnpm probe:smoke` reports CONTRACT_STATUS_UNREACHABLE_UNGENERATABLE,
      [http-smoke-FAIL] with cookie/CSRF/auth-bootstrap context, FLOW_STEP_FAILED
      with 401 on protected routes, missing @ApiResponse status declarations,
      or "auth-bootstrap" / "register-with-auto-login" / "refresh-token" failures
    - you see DIAG codes about declared statuses, security schemes, or auth
      surfaces

  Without these, /api/docs is empty boxes, the probe silently under-covers
  your code, and 409/403/422 branches ship untested.

  For chain-capture failures (RESOURCE_CAPTURE_*, chain:resource-setup,
  @ResourceCaptures), see build-verifiable-features instead.
---

# NestJS Probe-Coverage + Swagger Navigability

Two audiences read the same artifact (`/api/docs-json` + the static dump at `apps/api/.openapi.json`):

1. **The runtime probe** (`pnpm probe:smoke`) — consumes OpenAPI paths, request/response schemas, security requirements, and status codes to generate flows. Every missing decorator = an uncovered branch that ships untested.
2. **A human client developer** opening `/api/docs` in a browser — needs to see what each endpoint does, what body it expects, which errors it can return, and what shape the response has. An unannotated endpoint shows up as a row with no summary, empty body preview, and a bare `200: OK`. Useless.

**Both problems have one fix: annotate correctly.** Swagger is the single source of truth — the matrix detector hard-fails with `OPENAPI_SPEC_MISSING` if the spec is not reachable, and there is no regex fallback to paper over omissions. Every decorator you skip is visible in the spec as a missing field.

---

## DO NOT READ FLOW FILES — they are output, not input

Files under `.overstory/runtime-contract.flows/` are owned by lead/coordinator
(per Decision 3, enforced by the `flows-path-boundary.js` hook). They are
the **probe contract** — what tests assert — derived from your code surface.
You author the API; detectors generate the flows automatically from your
schemas + decorators + controller decorations.

Reading those files gives you ZERO actionable information for your job and
costs hundreds of lines of context per file. The probe failure report
(`.claude/hooks/.http-smoke.md`) already contains everything you need:

- `requestEcho`: the exact body the probe sent.
- `responseEcho`: the exact response your API returned (status + body).
- `serverStack`: file:line of the throw site for any 5xx (filter attaches
  `Error.name` + `Error.stack` on dev responses).
- `[contract-flows-bootstrap-FAIL]`: per-actor scheme + reason — actor
  setup failures are NOT yours to fix; mail lead.

If a probe fails:

1. Open `.claude/hooks/.http-smoke.md` (or the JSON sibling).
2. Read the failure block for the case in question.
3. Compare `expected` vs `actual` — fix YOUR code to match the contract.
4. Do NOT open the flow file. The contract IS the API surface you declared
   — if the flow expects something your code doesn't produce, the gap is
   in your code or in the lead's flow file. Either way you don't edit
   flows. If the flow itself looks wrong (wrong status, wrong shape), mail
   `flow_mismatch` to lead with the specific case label.

Anti-pattern that wastes minutes per cycle: reading
`runtime-contract.flows/*.json` to "understand" what the probe expects.
Stop. The report says it directly.

## 0. Boot-time setup (already wired — understand it, don't break it)

`apps/api/src/swagger.ts` exports `buildSwaggerDocument(app)`. Title / version / description are pulled from `apps/api/package.json` so a rename is a one-file edit.

Recommended builder-chain additions (edit once in `swagger.ts`):

```ts
const builder = new DocumentBuilder()
  .setTitle(prettifyName(pkg.name))
  .setVersion(pkg.version)
  .setDescription(pkg.description ?? '')
  .addBearerAuth(
    { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    'accessToken',                     // named scheme — reference with @ApiBearerAuth('accessToken')
  )
  .addServer('http://localhost:3001', 'Local dev')
  .addServer('https://api.example.com', 'Production')
  .setContact('Backend', 'https://example.com', 'api@example.com');
```

And in `main.ts`:

```ts
SwaggerModule.setup('api/docs', app, document, {
  swaggerOptions: { persistAuthorization: true },   // keeps bearer across page reloads
});
```

Use the top-level description for cross-cutting info: auth flow overview, role matrix, rate-limit table, error envelope shape. Markdown is supported.

---

## 1. Controller-level annotations

### 1.1 `@ApiTags('resource')` — mandatory
Groups endpoints in the sidebar. One tag per controller. Use the plural resource noun (`users`, `tasks`), not verbs.

```ts
@ApiTags('tasks')
@Controller('tasks')
export class TasksController { ... }
```

### 1.2 `@ApiBearerAuth('accessToken')` at class level when the whole controller is protected
Saves repeating it on every handler. Must match the named scheme from `swagger.ts`.

```ts
@ApiTags('tasks')
@ApiBearerAuth('accessToken')
@UseGuards(JwtAuthGuard)
@Controller('tasks')
export class TasksController { ... }
```

Any single handler that bypasses auth uses `@Public()` + omits/removes `@ApiBearerAuth`.

---

## 2. Per-handler — MANDATORY checklist

For every `@Get`/`@Post`/`@Put`/`@Patch`/`@Delete` handler, **all** of the following must be present. Treat a missing item as a bug.

### 2.0 `@ApiOperation({ summary, description })`
- `summary` — one-line label shown in the sidebar. Max ~60 chars. Imperative voice ("Register a new user", not "User registration").
- `description` — shown below the summary in the UI. Markdown supported. Use it for: required roles, rate limits, side effects ("also sends welcome email"), idempotency hints.

```ts
@ApiOperation({
  summary: 'Register a new user',
  description: `
Creates an account and returns a JWT bearer.

**Rate limit:** 5/min per IP
**Side effects:** sends welcome email asynchronously.
  `,
})
```

### 2.1 Route + HTTP verb
```ts
@Post('register')
```
Captured into `matrix.apiEndpoints[].path`.

### 2.2 Guard OR `@Public()`
Every handler must be explicit about auth posture — no silent defaulting.

```ts
@UseGuards(JwtAuthGuard)   // protected
// OR
@Public()                  // public — must be a real decorator, not a comment
```

Drives the 401/403 flows. If omitted, the probe assumes unknown and emits **no** auth-boundary coverage.

### 2.3 `@ApiBearerAuth('accessToken')` on protected handlers (or at class level)
Chains the endpoint to the login happy-path and emits "garbage bearer → 401" / "expired bearer → 401" flows.

### 2.4 `@Roles(...)` when role-gated
```ts
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
```
Drives the 403-on-non-admin flow.

### 2.5 Body — Zod schema via `@ApiBody({ schema: zodToOpenApi(X, { ref: 'Name' }) })`
Global `ZodValidationPipe` enforces at runtime; `@ApiBody` makes the schema Swagger-visible. The `{ ref }` option registers the schema as a **named OpenAPI component** (it shows up once under "Schemas" in the UI and gets `$ref`-referenced from every endpoint that uses it).

```ts
// ✅ preferred — Swagger-visible, named $ref, pipe runs globally
@ApiBody({ schema: zodToOpenApi(registerSchema, { ref: 'RegisterInput' }) as never })
async register(@Body() body: RegisterInput) { ... }

// ✅ also correct — explicit pipe per handler (older pattern, still supported)
async register(@Body(new ZodValidationPipe(registerSchema)) body: RegisterInput) { ... }

// ❌ wrong — inline z.object(), generator cannot resolve a name, UI inlines anonymous schema
async register(@Body(new ZodValidationPipe(z.object({ email: z.string() }))) body: any) { ... }

// ❌ wrong — class-validator DTO, emits `endpoint-stub-untyped`
async register(@Body() dto: RegisterDto) { ... }

// ❌ wrong — untyped, zero validation
async register(@Body() body: any) { ... }
```

`zodToOpenApi` is exported from `@sfx/validation`. **Zod schemas must be exported by name** from `packages/validation/src/schemas/*.schema.ts`.

### 2.5.1 Make `Example Value` render — never `Unknown Type: object` — MANDATORY

A correctly-named `@ApiBody({ schema: zodToOpenApi(X, { ref: 'Name' }) })` is **not enough**. If the underlying Zod schema has no per-field `.openapi({ example, description })` annotations, the Swagger UI will collapse the body preview to literal text `Unknown Type: object` (or an empty `{}`), and "Try it out" pre-fills nothing. Client devs cannot discover the contract; the probe still works, but the UI is useless.

**Rule:** every Zod field exported from `packages/validation/src/schemas/*.schema.ts` MUST carry `.openapi({ example, description })`, AND every `@ApiBody` MUST carry an `examples:` block with at least one named example. Both are required. One without the other still degrades to `Unknown Type: object` in some Swagger UI versions.

```ts
// packages/validation/src/schemas/auth.schema.ts
export const registerSchema = z.object({
  name: z.string().min(2).openapi({ example: 'Alice Smith', description: 'Display name' }),
  email: z.string().email().openapi({ example: 'alice@example.com', description: 'Primary email' }),
  password: z.string().min(8).openapi({ example: 'hunter2!secure', description: 'Min 8 chars' }),
  teamName: z.string().min(2).openapi({ example: 'Acme Inc', description: 'Tenant team name' }),
});
```

```ts
// apps/api/src/modules/auth/application/controllers/auth.controller.ts
@Post('register')
@ApiBody({
  schema: zodToOpenApi(registerSchema, { ref: 'RegisterInput' }) as never,
  examples: {
    default: {
      summary: 'Standard registration',
      value: {
        name: 'Alice Smith',
        email: 'alice@example.com',
        password: 'hunter2!secure',
        teamName: 'Acme Inc',
      },
    },
  },
})
async register(@Body() body: RegisterInput) { ... }
```

**Verification recipe** — run after editing any controller body, before declaring the work done:

1. `pnpm --filter @sfx/api build:openapi` (or boot the API — whichever produces the dump).
2. `cat apps/api/.openapi.json | jq '.components.schemas.RegisterInput'` — must print an object with `type: "object"` AND a non-empty `properties` map. If it prints `null` or `{ "type": "object" }` with no `properties`, the schema isn't being registered — re-check `extendZodWithOpenApi` import in `packages/validation/src/openapi.ts` and the `{ ref }` argument.
3. `cat apps/api/.openapi.json | jq '.paths."/api/v1/auth/register".post.requestBody'` — must contain `content."application/json".examples.default.value` with the populated payload, AND `content."application/json".schema.$ref` pointing to `#/components/schemas/RegisterInput`. If the `schema.$ref` is missing or the `examples` block is empty, the UI will fall back to "Unknown Type: object".
4. Open `http://127.0.0.1:<api_port>/api/docs` → expand the endpoint → "Request body" panel must show **a fully-populated JSON payload under "Example Value"**, the field-by-field breakdown under "Schema", and a working "Try it out" button. If you see literal `Unknown Type: object` or an empty `{}`, you skipped step 2.5.1.

**Common causes of `Unknown Type: object` even with `@ApiBody` set:**
- Zod fields lack `.openapi({ example })` → schema registers but has no field-level examples → UI cannot synthesize a payload preview.
- `@ApiBody` lacks an `examples` block → UI renders the type without a sample value.
- Schema is built from a `z.object()` defined inline at the controller (instead of imported from `@sfx/validation`) → no `.openapi()` annotations, anonymous component name, no `$ref`.
- Forgot the side-effect import `import '@sfx/validation/openapi'` in the validation package barrel → `.openapi()` is a no-op.

**Same rule applies to `@ApiResponse`** — for every named response schema you reference, the underlying Zod schema must annotate its fields, otherwise the response panel also degrades to `Unknown Type: object`.

### 2.5.2 Hand-written `$ref` in `@ApiBody` — the dangling-reference trap

The shorthand `@ApiBody({ schema: zodToOpenApi(X, { ref: 'X' }) })` registers the schema as a side effect of evaluating `zodToOpenApi(...)`. That is the only reason it resolves at bootstrap. The moment you reach for `allOf` / `oneOf` / `anyOf` composition and write the `$ref` by hand, the side-effect call is no longer there — and nothing tells you. NestJS Swagger silently emits the operation as `{}` in the dump, the contract probe synthesises an empty request body, the server returns 400, and every chain step that depends on the resource cascades into 404 "not found" failures.

**❌ Wrong — produces a dangling `$ref`, empty operation in `.openapi.json`:**
```ts
@ApiBody({
  schema: {
    allOf: [
      { $ref: '#/components/schemas/CreateTeamInput' },   // hand-written
      { required: ['name', 'slug'], properties: { ... } },
    ],
  },
})
// no zodToOpenApi(createTeamSchema, { ref: 'CreateTeamInput' }) anywhere
//   → schema is never registered → $ref resolves to nothing
```

**✅ Right — use the `zodApiBody` helper which pairs registration + ref in one call:**
```ts
import { zodApiBody } from '@sfx/validation';

@ApiBody(zodApiBody(createTeamSchema, 'CreateTeamInput'))
async create(@Body(new ZodValidationPipe(createTeamSchema)) body: CreateTeamInput) { ... }
```

The helper is impossible to misuse: it cannot return a `$ref` without registering the target schema. If you ever genuinely need `allOf` composition (rare — usually a sign you should split the schema), register first and compose second:

```ts
zodToOpenApi(createTeamSchema, { ref: 'CreateTeamInput' });   // explicit register
@ApiBody({ schema: { allOf: [{ $ref: '#/components/schemas/CreateTeamInput' }, { ... }] } })
```

**Pre-flight catches this**: `pnpm probe:smoke` runs `pnpm openapi:check` first, which reads `apps/api/.openapi.json` and rejects any operation that is empty `{}` or contains a `$ref` not present in `components.schemas`. If the check fires, you forgot a registration somewhere — fix the call site, do not skip the gate.

### 2.6 Query — ZodValidationPipe when the handler reads query
```ts
// ✅ correct — generator emits happy-path with ?page=1&pageSize=10 + invalidator per field
async list(@Query(new ZodValidationPipe(listTasksQuerySchema)) query: ListTasksQuery) { ... }

// ❌ wrong — probe can't tell which query fields are valid/required
async list(@Query() query: any) { ... }
```

Pair it with `@ApiQuery({ name, required, example })` per field for UI clarity (optional for the probe — the Zod schema already informs it — but essential for the human reader).

### 2.7 Path params — `@ApiParam({ name, description, example })`
Without this, the UI shows a bare `id (string)` with no hint what a valid id looks like.

```ts
@Get(':id')
@ApiParam({
  name: 'id',
  description: 'Task UUID',
  example: '018f2d4b-0000-7aaa-bbbb-ccccccccccccc',
})
findOne(@Param('id') id: string) { ... }
```

### 2.8 `@ApiResponse` for **every** status the handler can return — NON-NEGOTIABLE

This is the single most-forgotten annotation. Documentation-only at runtime (your code runs fine without it), but the probe uses it to decide what flows to emit, and the UI uses it to list possible errors. **A missing status = a branch that ships without a smoke-test.**

#### 2.8.1 The enumeration rule

**For every `@ApiResponse({ status, description })`-less status code your handler can produce, the probe emits ZERO flows for that branch.** Conversely, every declared status with a reachable path generates a probe flow.

Therefore: list **every** status, including the success one, explicitly — no implicit defaults.

#### 2.8.2 Per-verb baseline status matrix — copy as your starting point

These are the minimum status codes each verb commonly emits. Start with this set, then add handler-specific ones (409, 422, 429, etc.) as the service dictates.

| Verb | Auth? | Baseline statuses every handler should declare |
|---|---|---|
| `@Get()` (list) | public | `200`, `400` (bad query) |
| `@Get()` (list) | protected | `200`, `400`, `401`, `403` (if role-gated) |
| `@Get(':id')` | protected | `200`, `401`, `403` (if role-gated), `404` |
| `@Post()` create | public | `201`, `400`, `409` (if uniqueness constraint) |
| `@Post()` create | protected | `201`, `400`, `401`, `403` (if role-gated), `409` |
| `@Put(':id')` / `@Patch(':id')` | protected | `200`, `400`, `401`, `403`, `404`, `409` (if conflict possible) |
| `@Delete(':id')` | protected | `204`, `401`, `403`, `404` |
| `@Post('login')` | public | `200`, `400`, `401` |
| `@Post('register')` | public | `201`, `400`, `409` |

Additional statuses to add when applicable:
- `422` — semantic validation failure (schema valid, business rule rejected)
- `429` — rate-limited endpoint (`@Throttle(...)`)
- `503` — dependency-unavailable (e.g. health-check reporting DB down)

**405 — declaration shape decides the probe**

The 405 emitter dispatches on the declared status set composition (no path/operationId guessing). Two shapes:

- **Wrong-method probe** — handler declares a 2xx success status alongside 405. Probe sends a wrong method to the handler's path and asserts 405. Use this when 405 is route-level enforcement on a path that ALSO serves a happy method.
  ```ts
  @Post('items')                         // POST is the happy verb
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 405 })          // Express returns 405 for non-POST
  ```
- **Self-method probe** — handler declares ONLY 405 (no 2xx). Probe calls the handler's OWN method and asserts 405. Use this for an explicit fallback handler whose only purpose is to throw 405 (so Express returns 405 instead of its default 404 for unmatched verb+path).
  ```ts
  @Get('items')                          // explicit GET fallback
  @ApiResponse({ status: 405, description: 'Method Not Allowed' })
  fallback(): never { throw new HttpException('...', HttpStatus.METHOD_NOT_ALLOWED); }
  ```

Putting `@ApiResponse({ status: 405 })` on the wrong handler (e.g. on the POST when only the GET fallback throws 405) generates a wrong-method probe that tries DELETE/etc. and 404s — `CONTRACT_STATUS_UNREACHABLE`. Place 405 on the handler that actually returns it.

#### 2.8.3 Status audit procedure — do this for every handler you touch

1. Grep the handler + its service for: `throw new \w+Exception`, `HttpStatus\.\w+`, `res\.status(\d+)`, **and `throw new Error(`, `throw new TypeError(`** — Nest surfaces raw thrown `Error`/`TypeError` (including implicit `TypeError` from accessing a field on a missing body) as **500**. If your handler can throw any of those, you MUST declare `@ApiResponse({ status: 500, description: '...' })` — see 2.8.5.
2. For each unique status found, confirm a `@ApiResponse({ status: N, description: '...' })` exists above the handler.
3. Include the success status (`200` / `201` / `204`) explicitly — don't rely on the Nest default.
4. Every declared status needs a `description`. Never `@ApiResponse({ status: 409 })` alone.
5. Run `pnpm probe:smoke` (which now regenerates matrix + flows automatically before running) and confirm every declared status appears as a flow in `.claude/hooks/.flows.generated.json`. If the probe reports `CONTRACT_STATUS_UNREACHABLE`, either add the missing flow coverage, or remove the status (because you just admitted the branch is dead code).

#### 2.8.4 Example — every status enumerated

```ts
// @Post users/register — public, can 201 / 400 / 409
@ApiResponse({ status: 201, description: 'Registered successfully' })
@ApiResponse({ status: 400, description: 'Invalid input (field-level validation failed)' })
@ApiResponse({ status: 409, description: 'Email already exists' })

// @Get tasks/:id — protected, can 200 / 401 / 403 / 404
@ApiResponse({ status: 200, description: 'Task found' })
@ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
@ApiResponse({ status: 403, description: 'Caller does not own this task' })
@ApiResponse({ status: 404, description: 'No task with that id' })

// @Delete tasks/:id — protected admin-only, can 204 / 401 / 403 / 404
@ApiResponse({ status: 204, description: 'Task deleted (no body)' })
@ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
@ApiResponse({ status: 403, description: 'Caller is not an admin' })
@ApiResponse({ status: 404, description: 'No task with that id' })
```

**Rule restated:** for every `throw new ConflictException`, `throw new ForbiddenException`, `throw new NotFoundException`, `throw new UnauthorizedException`, `throw new Error(...)`, `throw new TypeError(...)`, or `HttpStatus.*` literal in your handler or its service, there must be a matching `@ApiResponse({ status: N, description: '...' })`. **Every** `@ApiResponse` must have a description.

#### 2.8.5 5xx interaction with the logical-contract `unauth-public-api` row

The Logical App Contract row `unauth-public-api: forbidden ["5xx"]` enforces a universal "no 5xx for public endpoints" invariant on every public route. The flows generator implements this with a source-of-truth filter:

- **Endpoint declares ANY 5xx** via `@ApiResponse({ status: 5xx, description: '...' })` → the universal invariant is **skipped** for that endpoint. The declared 5xx **IS the contract** — the probe trusts your declaration.
- **Endpoint does NOT declare a 5xx but returns one at runtime** → the probe flags it as drift (`unauth-public-api: forbidden 5xx` failure). Fix is one of: (a) declare the 5xx if it's intentional, or (b) catch the throw in the handler and return a documented 4xx instead.

Concrete example — a synthetic that throws by design must declare 500:

```ts
@Post('idempotent-create')
@HttpCode(201)
@ApiResponse({ status: 201, description: 'Created' })
@ApiResponse({ status: 500, description: 'Missing required Idempotency-Key (handler throws raw Error by design)' })
idempotentCreate(@Headers('idempotency-key') key?: string) {
  if (!key) throw new Error('Idempotency-Key header is required'); // → Nest surfaces 500
  // …
}
```

Without the explicit `status: 500` declaration, the logical-contract probe sees the runtime 500 and (correctly) flags it as drift. **Declared 5xx = intentional. Undeclared 5xx = bug.** No heuristics, no path regex — only the declaration disambiguates.

### 2.9 Auth endpoints — REQUIRED canonical `operationId` (or `x-auth-*` extension)

The probe identifies which endpoint is your **login**, which is your **register**, which is your **logout**, which is your **refresh**, and which is your **me/profile** poll **strictly by declared signal**. There is no path-regex matching (`/auth/login` is not a signal), no body-shape matching (`{email, password}` is not a signal), no response-shape guessing (`{accessToken}` is not a signal). All of those are heuristics and the detector refuses to use them.

This is non-negotiable: without the canonical declaration, the auth-bootstrap chain is **not generated**, every authenticated probe flow that depends on it is **skipped**, and the probe will emit one or more `AUTH_FLOW_*_UNDETECTED` diagnostics.

#### 2.9.1 Canonical declarations — pick one per role

Pick **either** the canonical `operationId` (recommended, idiomatic OpenAPI) **or** the `x-auth-*` extension flag. Don't use both; don't use neither.

| Role | `operationId` (recommended) | OpenAPI extension flag |
|---|---|---|
| Login (token issuer) | `'authLogin'` | `'x-auth-issues-token': true` |
| Register | `'authRegister'` | `'x-auth-registers-user': true` |
| Logout | `'authLogout'` | `'x-auth-logs-out': true` |
| Refresh | `'authRefresh'` | `'x-auth-refreshes-token': true` |
| Me / profile poll | `'authMe'` | `'x-auth-current-user': true` |

The detector requires:
- **Exactly one** endpoint per role (HTTP `POST` for the first four; HTTP `GET` for `authMe`).
- For `authMe`: the endpoint must also be declared auth-protected (`@UseGuards(JwtAuthGuard)` + `@ApiBearerAuth(...)` or an OpenAPI security requirement). A public endpoint with `operationId: 'authMe'` is a misconfiguration and emits `AUTH_FLOW_MEPOLL_NOT_PROTECTED`.

If two endpoints declare the same canonical signal, the detector refuses to pick and emits `AUTH_FLOW_OPID_DUPLICATE` / `AUTH_FLOW_EXT_DUPLICATE`. Only one endpoint may carry each canonical signal — an OpenAPI spec rule, not a probe rule.

#### 2.9.2 Why this matters — the SFX register-with-auto-login case

Standard NestJS auth controllers expose **both** `POST /auth/register` and `POST /auth/login`, **both** returning `{accessToken, user, ...}`. To the response-shape detector they are indistinguishable — that's why response-shape detection is forbidden. Without the explicit `authLogin`/`authRegister` operationIds, the probe doesn't know which one is the token issuer; it would have to guess by path, body shape, or declaration order, and any guess that picks the wrong endpoint will silently corrupt the `auth-bootstrap` chain. Symptoms:

- `step0: POST /register [201]` → captures token
- `step2: POST /register [400]` (because the chain re-runs register thinking it's login, with login-shaped body)
- `step4: setAuth(undefined)` — the entire authenticated probe surface fails

The fix is **always** to add the canonical declaration on both endpoints. The probe will then run cleanly.

#### 2.9.3 NestJS code — exactly what to write

```ts
// apps/api/src/modules/auth/application/controllers/auth.controller.ts
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  @Post('login')
  @Public()
  @ApiOperation({
    operationId: 'authLogin',                            // ⬅ REQUIRED canonical signal
    summary: 'Exchange credentials for a bearer token',
  })
  @ApiBody({ schema: zodToOpenApi(loginSchema, { ref: 'LoginInput' }) as never })
  @ApiResponse({
    status: 200,
    description: 'Login success',
    schema: zodToOpenApi(loginResponseSchema, { ref: 'LoginResponse' }) as never,
  })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body() body: LoginInput) { ... }

  @Post('register')
  @Public()
  @ApiOperation({
    operationId: 'authRegister',                         // ⬅ REQUIRED canonical signal
    summary: 'Create a new account',
  })
  @ApiBody({ schema: zodToOpenApi(registerSchema, { ref: 'RegisterInput' }) as never })
  @ApiResponse({
    status: 201,
    description: 'Account created',
    schema: zodToOpenApi(loginResponseSchema, { ref: 'LoginResponse' }) as never,
  })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  async register(@Body() body: RegisterInput) { ... }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('accessToken')
  @ApiOperation({
    operationId: 'authLogout',                           // ⬅ REQUIRED canonical signal
    summary: 'Invalidate the current session',
  })
  @ApiResponse({ status: 204, description: 'Logged out (no body)' })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  async logout(@Req() req: AuthenticatedRequest) { ... }

  @Post('refresh')
  @Public()
  @ApiOperation({
    operationId: 'authRefresh',                          // ⬅ REQUIRED canonical signal
    summary: 'Rotate the bearer token using the refresh token',
  })
  @ApiBody({ schema: zodToOpenApi(refreshSchema, { ref: 'RefreshInput' }) as never })
  @ApiResponse({
    status: 200,
    description: 'New access token (and optionally new refresh token)',
    schema: zodToOpenApi(loginResponseSchema, { ref: 'LoginResponse' }) as never,
  })
  @ApiResponse({ status: 401, description: 'Refresh token invalid or expired' })
  async refresh(@Body() body: RefreshInput) { ... }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('accessToken')
  @ApiOperation({
    operationId: 'authMe',                               // ⬅ REQUIRED canonical signal
    summary: 'Return the authenticated user',
  })
  @ApiResponse({ status: 200, description: 'Current user', schema: zodToOpenApi(userSchema, { ref: 'User' }) as never })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  async me(@Req() req: AuthenticatedRequest) { ... }
}
```

#### 2.9.4 Refresh request/response field names — extracted verbatim from your Zod schemas

Once the refresh endpoint is identified by `operationId` / extension, the probe reads its **declared Zod / OpenAPI schemas** to find the token field names. **The probe uses whatever names your schemas declare, verbatim.** No naming convention is enforced — `refreshToken`, `refresh_token`, `rt`, `tok`, anything works. This is pure schema introspection.

How disambiguation works (so the probe can tell access-token from refresh-token):

- **Single-field request body** → that field is the refresh-token input. Done.
- **Single-field response body** → that field is the access token. Done.
- **Multi-field response body** → the field whose name matches the **request input field** is the rotated refresh token; the remaining field is the access token. Use matching names between request and response so the probe can correlate.

Examples that all "just work" with no rename required:

```ts
// camelCase project
export const refreshSchema = z.object({ refreshToken: z.string() });
export const refreshResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),  // matches input name → rotated refresh
});

// snake_case project (e.g. RFC6749-style OAuth)
export const refreshSchema = z.object({ refresh_token: z.string() });
export const refreshResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),  // matches input name → rotated refresh
});

// short names — also fine
export const refreshSchema = z.object({ rt: z.string() });
export const refreshResponseSchema = z.object({ at: z.string(), rt: z.string() });
```

The probe captures `$.<whatever name your response schema declares>` and replays under `$.body.<whatever name your request schema declares>`. Schema-driven, project-naming-agnostic.

#### 2.9.5 When the probe DIAGs (genuine schema ambiguity, not naming)

A DIAG only fires when the schema itself doesn't give the probe enough information to pick a token field deterministically — never because of naming style.

| Code | Cause | Fix |
|---|---|---|
| `AUTH_FLOW_TOKENISSUER_UNDETECTED` | No POST has `operationId:'authLogin'` or `x-auth-issues-token:true` | Add `@ApiOperation({ operationId: 'authLogin' })` on your login handler |
| `AUTH_FLOW_REGISTER_UNDETECTED` | No POST has the register signal | Add `@ApiOperation({ operationId: 'authRegister' })` |
| `AUTH_FLOW_LOGOUT_UNDETECTED` | No POST has the logout signal | Add `@ApiOperation({ operationId: 'authLogout' })` (or `x-auth-logs-out`) |
| `AUTH_FLOW_REFRESH_UNDETECTED` | No POST has the refresh signal | Add `@ApiOperation({ operationId: 'authRefresh' })` |
| `AUTH_FLOW_MEPOLL_UNDETECTED` | No protected GET has the mePoll signal | Add `@ApiOperation({ operationId: 'authMe' })` and confirm `@UseGuards` |
| `AUTH_FLOW_OPID_DUPLICATE` | Two endpoints declare the same canonical operationId | Remove the operationId from the wrong endpoint |
| `AUTH_FLOW_EXT_DUPLICATE` | Two endpoints set the same `x-auth-*` extension to true | Remove the extension from the wrong endpoint |
| `AUTH_FLOW_MEPOLL_NOT_PROTECTED` | `authMe` declared on a public endpoint | Add `@UseGuards(JwtAuthGuard)` + `@ApiBearerAuth(...)` to that handler |
| `AUTH_FLOW_REFRESH_REQUEST_AMBIGUOUS` | Refresh request body has 2+ fields and the probe can't tell which carries the refresh token | Reduce the request schema to a single field, OR use the same field name in the response so the probe can match by name correspondence |
| `AUTH_FLOW_RESPONSE_AMBIGUOUS` | Refresh / login response has 2+ fields and no name correspondence with the request input | Use matching names between refresh request and refresh response so the probe can identify the rotated refresh token by name; the remaining field is then the access token |

### 2.9.1 Cookie-based auth flows — `@CookieRole`, `@CookieConsumer`, `securitySchemes`

If your auth uses **cookies** instead of (or in addition to) bearer-token bodies — for example a `refresh_token` cookie that the API sets on register and reads on refresh — the body-based refresh-chain detector cannot help you. You MUST declare the cookie surface so the `cookie-flows.js` detector picks it up. Otherwise the body-based chain runs, fails to find a `refreshToken` field in the response, and you get an opaque `AUTH_FLOW_REFRESH_RESPONSE_AMBIGUOUS` (or worse, the chain runs and asserts a body field that doesn't exist).

Cookie-flow vocabulary (declaration-only, NEVER inferred):

| Decorator / extension | Purpose | Where it goes |
|---|---|---|
| `@CookieRole(name, role)` | Marks an endpoint as **issuer** of a cookie with a known role (`refresh-token`, `session`, `csrf-double-submit`, `oauth-state`, `tenant-scope`, `locale`, `theme`) | Issuer / rotator / clearer handler (e.g. `@Post('register')`, `@Post('refresh')`, `@Post('logout')`) |
| `@CookieConsumer(name)` | Marks an endpoint as **consumer** that reads the cookie value | Any handler that reads `req.cookies[name]` |
| `securitySchemes: { X: { type: 'apiKey', in: 'cookie', name, 'x-cookie-role': role } }` | Cross-cuts: declares any operation referring to scheme `X` is a consumer of that cookie | OpenAPI `components.securitySchemes` (in `swagger.ts`) |
| Response header `Set-Cookie` with `x-cookie-role`, `x-cookie-name`, `x-cookie-attrs` | Per-response declaration of cookie attributes | `@ApiResponse({ headers: { 'Set-Cookie': { ... } } })` |
| Response header `x-cookie-attrs.maxAge: 0` on a Set-Cookie | Marks the operation as **clearer** (logout) | Logout response declaration |

**Roles recognized by `cookie-flows.js`:**

- `refresh-token` — refresh token in cookie. Issuer (e.g. register/login), rotator (e.g. refresh), clearer (e.g. logout).
- `session` — session cookie. Issuer + consumer + clearer.
- `csrf-double-submit` — CSRF cookie that must be echoed in a request header by consumers.
- `oauth-state` — short-lived state cookie for OAuth callback verification.
- `tenant-scope` — tenant-resolution cookie consumed by tenant-aware endpoints.
- `locale`, `theme` — preference cookies.

**Pattern: refresh-token cookie chain (issuer + rotator + clearer)**

Below is the declaration that makes the probe emit a complete `cookie:refresh-token:refresh_token:rotation` chain (issue → rotate → assert-rotated → assert-attrs → clear → assert-cleared):

```ts
@Controller('auth')
@ApiTags('auth')
export class AuthController {
  // ISSUER — register sets the refresh-token cookie
  @Post('register')
  @Public()
  @HttpCode(201)                                 // ← MANDATORY: declared success status
  @ApiOperation({ operationId: 'authRegister', summary: 'Register a new user' })
  @ApiBody({ schema: zodToOpenApi(registerSchema, { ref: 'RegisterInput' }) as never })
  @ApiResponse({
    status: 201,                                 // ← matches @HttpCode
    description: 'Registered',
    headers: {
      'Set-Cookie': {
        schema: { type: 'string' },
        'x-cookie-role': 'refresh-token',
        'x-cookie-name': 'refresh_token',
        'x-cookie-attrs': { httpOnly: true, secure: true, sameSite: 'Strict', path: '/', maxAge: 604800 },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 409, description: 'Email already registered' })
  @CookieRole('refresh_token', 'refresh-token')  // ← issuer marker
  async register(@Body() body: RegisterInput) { ... }

  // ROTATOR — refresh both consumes the existing cookie AND re-issues a new one
  @Post('refresh')
  @Public()
  @HttpCode(200)
  @ApiOperation({ operationId: 'authRefresh', summary: 'Rotate the refresh-token cookie' })
  @ApiResponse({
    status: 200,
    description: 'New access token; refresh-token cookie rotated',
    headers: { 'Set-Cookie': { schema: { type: 'string' }, 'x-cookie-role': 'refresh-token', 'x-cookie-name': 'refresh_token' } },
  })
  @ApiResponse({ status: 401, description: 'Refresh cookie missing or invalid' })
  @CookieRole('refresh_token', 'refresh-token')   // ← also marked issuer (rotator = consumer + issuer)
  @CookieConsumer('refresh_token')                // ← marks consumer
  async refresh(@Req() req) { ... }

  // CLEARER — logout invalidates the cookie
  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ operationId: 'authLogout', summary: 'Clear the refresh-token cookie' })
  @ApiResponse({
    status: 204,
    description: 'Logged out',
    headers: {
      'Set-Cookie': {
        schema: { type: 'string' },
        'x-cookie-role': 'refresh-token',
        'x-cookie-name': 'refresh_token',
        'x-cookie-attrs': { maxAge: 0 },           // ← maxAge:0 marks this as clearer
      },
    },
  })
  @CookieRole('refresh_token', 'refresh-token')
  async logout(@Res() res) { ... }
}
```

**MANDATORY for every cookie issuer / rotator / clearer:**

1. **`@HttpCode(N)`** — exact success status. The cookie-flow emitter asserts `expect: { status: N }` verbatim. There is **no** "common-codes" fallback. If you skip this, you get `COOKIE_ISSUER_SUCCESS_STATUS_MISSING` and the chain is skipped.
2. **`@ApiResponse({ status: N, ... })`** — matching the `@HttpCode`. Without this the OpenAPI spec is missing the response and the detector emits `COOKIE_ISSUER_SUCCESS_STATUS_MISSING`.
3. **Set-Cookie header** with `x-cookie-role` AND `x-cookie-name` — tells the detector which role + name this operation issues / rotates / clears.
4. **`@CookieRole(name, role)` decorator** — the project's NestJS decorator that contributes `x-cookie-roles` on the operation (used as a redundant signal).
5. **`x-cookie-attrs`** on the issuer's Set-Cookie — declares the cookie attributes the probe will assert via `assert-cookie-attrs`. Include `httpOnly`, `secure`, `sameSite`, `path`, and `maxAge` for refresh-tokens.
6. **`x-cookie-attrs: { maxAge: 0 }`** on the clearer's Set-Cookie — this is the **only** signal `cookie-flows.js` accepts to recognize an operation as a clearer.

**What the probe asserts when fully declared (refresh-token cookie):**

```
chain id: cookie:refresh-token:refresh_token:rotation
steps:
  1. POST /auth/register                      → expect 201 (from issuer.declaredStatus)
  2. capture-cookie refresh_token             → save as cookie:refresh_token:initial
  3. POST /auth/refresh                       → expect 200 (from rotator.declaredStatus)
  4. capture-cookie refresh_token             → save as cookie:refresh_token:rotated
  5. assert-cookie-rotated                    → cookie value differs from :initial
  6. assert-cookie-attrs                      → httpOnly+secure+sameSite+path+maxAge match declared attrs
  7. POST /auth/logout                        → expect 204 (from clearer.declaredStatus)
  8. assert-cookie-cleared                    → cookie removed (maxAge=0 received)
```

**Important:** when a cookie covers the refresh path, the **body-based** refresh-chain emitter automatically skips with `REFRESH_CHAIN_SKIPPED_COOKIE_GUARDED`. You don't get duplicate (and broken) coverage. The cookie chain handles it.

**Cookie-flow diagnostics — fix mapping:**

| DIAG code | Cause | Fix |
|---|---|---|
| `COOKIE_ISSUER_SUCCESS_STATUS_MISSING` | Issuer has no declared 2xx response | Add `@HttpCode(N)` + `@ApiResponse({ status: N })` |
| `COOKIE_ISSUER_SUCCESS_STATUS_AMBIGUOUS` | Issuer declares 2+ different 2xx codes | Remove the extra `@ApiResponse` so only one 2xx remains; let `@HttpCode(N)` pick the canonical one |
| `COOKIE_ROTATOR_SUCCESS_STATUS_MISSING` | Rotator has no declared 2xx | Add `@HttpCode(N)` + `@ApiResponse({ status: N })` to the rotator |
| `COOKIE_ROTATOR_SUCCESS_STATUS_AMBIGUOUS` | Rotator declares 2+ different 2xx | Same as issuer-ambiguous |
| `COOKIE_CLEARER_SUCCESS_STATUS_MISSING` | Clearer has no declared 2xx | Add `@HttpCode(204)` (or 200) + `@ApiResponse({ status: 204 })` |
| `COOKIE_CLEARER_SUCCESS_STATUS_AMBIGUOUS` | Clearer declares 2+ different 2xx | Same as issuer-ambiguous |
| `COOKIE_REFRESH_CHAIN_SKIPPED_NO_DECLARED_STATUS` | Emitter refused to build the chain because at least one opRef has `declaredStatus: null` | Find the offending issuer / rotator / clearer (operationId + path are in the diag.endpoint) and add `@HttpCode(N)` |
| `REFRESH_CHAIN_SKIPPED_COOKIE_GUARDED` | Body-based refresh chain skipped because cookie covers it | Informational — no action needed if your refresh is cookie-based |
| `REFRESH_CHAIN_SKIPPED_NO_REFRESH_FIELD` | Body-based refresh chain skipped because `auth-flows.js` could not declare a refresh-token field name | If your refresh is cookie-based: add `@CookieRole(...,'refresh-token')` (the cookie chain will cover it). If body-based: ensure your refresh request schema is unambiguous (single field, or matching response field name) |
| `COOKIE_HAS_NO_CONSUMER` (warn) | Cookie issued but never read | If intended (e.g. logout-only clearer) ignore. Otherwise add `@CookieConsumer(name)` to the reader |
| `COOKIE_HAS_NO_ISSUER` (error) | Cookie consumed but never issued | Add `@CookieRole(name, role)` to the issuing endpoint |
| `COOKIE_ISSUER_BODY_EXAMPLE_UNDECLARED` (warn) | POST/PUT/PATCH issuer has a request body schema but no declared `example` | Add `schema.example`, `content.application/json.example`, or `content.application/json.examples[*].value` |
| `COOKIE_NAME_INVALID` | Cookie name violates RFC 6265 (e.g. spaces) | Use only RFC 6265 token chars |
| `COOKIE_HOST_PREFIX_INVALID` | `__Host-` prefix used without `Path=/`, `Secure`, no `Domain` | Fix the cookie attrs |
| `COOKIE_SAMESITE_NONE_WITHOUT_SECURE` | `SameSite=None` without `Secure` | Add `Secure`; required by modern browsers |
| `COOKIE_SCHEME_ROLE_UNDECLARED` | `apiKey`-in-cookie scheme exists but has no `x-cookie-role` extension | Add `'x-cookie-role': 'session'` (or matching role) to the securityScheme |

**Self-check for cookie-based auth handlers:**

- [ ] `@HttpCode(N)` on issuer / rotator / clearer
- [ ] `@ApiResponse({ status: N })` matching the `@HttpCode`
- [ ] Set-Cookie response header with `x-cookie-role` + `x-cookie-name` + `x-cookie-attrs`
- [ ] `@CookieRole(name, role)` decorator on the issuer / rotator / clearer
- [ ] `@CookieConsumer(name)` decorator on consumers (or use `securitySchemes` apiKey-in-cookie + `security: [{X:[]}]`)
- [ ] On logout: `x-cookie-attrs: { maxAge: 0 }` (the only signal the detector uses for "clearer")
- [ ] Sanity: run `pnpm probe:smoke` and grep `.flows.generated.json` for `cookie:refresh-token:` chain ids — they should appear and assert exact declared statuses

### 2.10 CSRF — declared issuer + verifier (V1 strict, no path-regex)

The `csrf.js` detector is **declaration-driven only** as of the V1 final pass.
Path-substring matching (`/csrf/`, `/csrf-token/`) was removed. To register a
CSRF surface, you MUST add ONE of these declared signals — otherwise the
detector emits `CSRF_TOKEN_ENDPOINT_UNDETECTED` (or, when ≥2 endpoints carry
conflicting signals, `CSRF_TOKEN_ENDPOINT_AMBIGUOUS`) and refuses to pick.

#### 2.10.a Issuer endpoint — pick exactly ONE source-of-truth signal

| Layer | Signal | Example |
|---|---|---|
| 1 (best) | `operationId: 'csrfToken'` on `@ApiOperation` | `@ApiOperation({ operationId: 'csrfToken', summary: '…' })` |
| 2 | `csrf:issuer` route metadata via `SetMetadata` | `@SetMetadata('csrf:issuer', true)` |
| 3 | `x-csrf-issues-token` OpenAPI extension | `@ApiExtension('x-csrf-issues-token', true)` |

```ts
@Controller('csrf')
export class CsrfController {
  @Get('token')
  @ApiOperation({ operationId: 'csrfToken', summary: 'Issue CSRF token' })
  @ApiOkResponse({ schema: zodToOpenApi(csrfTokenSchema, { ref: 'CsrfToken' }) as never })
  issue(@Req() req: Request, @Res({ passthrough: true }) res: Response): { csrfToken: string } {
    // Mint, set cookie, return token in body using the field name your verifier reads.
  }
}
```

#### 2.10.b Token field name — read VERBATIM by the detector

The detector reads the request/response field name verbatim from the schema —
do not rename across layers. If your verifier reads `_csrfToken` from the body,
declare the same name on the issuer response shape and on every state-changing
request body that the verifier protects. The probe asserts byte-for-byte.

#### 2.10.c Header name — declare on every protected mutating handler

For header-carried tokens, attach the declared header name on every protected
endpoint:

```ts
@Post(':id/transition')
@ApiHeader({ name: 'X-CSRF-Token', required: true, description: 'CSRF protection' })
@UseGuards(CsrfGuard)
async transition(...) { ... }
```

The detector reads `X-CSRF-Token` verbatim — there is no canonical name
enforcement and no fallback to `csrf-token`, `xsrf-token`, etc.

#### 2.10.d Diagnostics

| Code | Cause | Fix |
|---|---|---|
| `CSRF_TOKEN_ENDPOINT_UNDETECTED` | Verifier guard / middleware found but no issuer signal anywhere | Add `operationId: 'csrfToken'` (preferred) or one of the declared signals from 2.10.a |
| `CSRF_TOKEN_ENDPOINT_AMBIGUOUS` | ≥2 endpoints declare an issuer signal | Keep exactly one issuer; remove the duplicates |
| `CSRF_VERIFIER_UNDETECTED` | No `CsrfGuard` / middleware / `csrf:verifier` metadata | Wire a verifier on protected handlers |
| `CSRF_TOKEN_FIELD_DRIFT` | Issuer response field name differs from verifier read | Use the exact same field name on both sides |

> **Source-of-truth principle:** path appearance is not a contract.
> Declarations are. Do not work around UNDETECTED by renaming a route; add the
> declared signal.

---

### 2.11 OAuth — declared roles (V1 strict, no path-regex)

The `oauth.js` detector is **declaration-driven only** as of the V1 final
pass. Path-regex Tier 4 (`AUTHORIZE_PATH_RE`, `TOKEN_PATH_RE`,
`CALLBACK_PATH_RE`) was removed. Each OAuth role (`authorize`, `token`,
`callback`) is resolved through three strict signal layers — 0 matches emits
`OAUTH_ROLE_UNDETECTED`, ≥2 emits `OAUTH_ROLE_AMBIGUOUS` and the role is left
null. Ambiguity is presence — the detector still reports `detected: true` so
you can see the conflict in the matrix.

#### 2.11.a Role declaration — pick ONE per role

| Layer | Signal | Example |
|---|---|---|
| 1 | OpenAPI `securitySchemes` flow URLs (`authorizationUrl`, `tokenUrl`) | `components.securitySchemes.oauth2.flows.authorizationCode.{authorizationUrl,tokenUrl}` |
| 2 | `operationId` matches a role canonical name | `@ApiOperation({ operationId: 'oauthAuthorize' })` / `'oauthToken'` / `'oauthCallback'` |
| 3 | `x-oauth-role` extension | `@ApiExtension('x-oauth-role', 'authorize'\|'token'\|'callback')` |

```ts
@Controller('oauth')
export class OAuthController {
  @Get('authorize')
  @ApiOperation({ operationId: 'oauthAuthorize', summary: 'OAuth authorize' })
  @ApiOkResponse({ description: '302 redirect to provider' })
  authorize(...) { ... }

  @Post('token')
  @ApiOperation({ operationId: 'oauthToken', summary: 'OAuth token exchange' })
  @ApiOkResponse({ schema: zodToOpenApi(oauthTokenSchema, { ref: 'OAuthToken' }) as never })
  token(...) { ... }

  @Get('callback')
  @ApiOperation({ operationId: 'oauthCallback', summary: 'OAuth callback' })
  callback(...) { ... }
}
```

#### 2.11.b What is NOT a signal

- A handler at `/auth/login`, `/login`, or `/oauth/sign-in` (path appearance)
- A handler that returns `{ accessToken: '…' }` (body shape)
- A handler tagged `@ApiTags('auth')` (tag appearance)

The detector ignores all of these. Only the three declared layers count.

#### 2.11.c Diagnostics

| Code | Cause | Fix |
|---|---|---|
| `OAUTH_ROLE_UNDETECTED` | Presence signaled (scheme / package / strategy / partial declaration) but a specific role missing | Add the missing role's declaration (operationId or extension) |
| `OAUTH_ROLE_AMBIGUOUS` | ≥2 distinct endpoints declare the same role (e.g. two endpoints with `operationId: 'oauthToken'`) | Pick one canonical issuer per role; remove the duplicates |

> **Source-of-truth principle:** the OAuth role is the contract the
> authorization server publishes — `authorizationUrl` / `tokenUrl` /
> `redirect_uri`. Declare it, don't infer it from URL words.

---

### 2.12 Multi-tenancy — declared scope (V1 strict, no path-regex)

The `multi-tenant.js` detector is **declaration-driven only** as of the V1
final pass. Path-substring matching (`:tenantId`, `/tenants/`, `/orgs/`,
`/organizations/`, `/workspaces/`) was removed. To register a tenancy scope,
you MUST add ONE of these declared signals — supplementary surfaces (Prisma
schema, `nestjs-tenancy` package, middleware classes) only signal **presence**,
not scope. Presence-without-declaration emits `TENANCY_SCOPE_UNDETECTED`.

#### 2.12.a Scope declaration — pick ONE source-of-truth signal

| Layer | Signal | Example |
|---|---|---|
| 1 (best) | OpenAPI header parameter on every tenant-scoped operation | `@ApiHeader({ name: 'X-Tenant-ID', required: true })` |
| 2 | `x-multi-tenant` OpenAPI extension on operation / path / document | `@ApiExtension('x-multi-tenant', true)` |
| 3 | NestJS `@TenantId()` / `@Tenant()` parameter decorator | `find(@TenantId() tenantId: string)` |

```ts
@Controller('projects')
export class ProjectController {
  @Get()
  @ApiHeader({ name: 'X-Tenant-ID', required: true, description: 'Tenant scope' })
  @ApiOkResponse({ schema: zodToOpenApi(projectListSchema, { ref: 'ProjectList' }) as never })
  list(@Headers('x-tenant-id') tenantId: string) { ... }
}
```

#### 2.12.b Header name — read VERBATIM

The detector reads the header name verbatim from the OpenAPI parameter
declaration. `X-Tenant-ID`, `x-tenant-id`, `X-Org-ID`, `X-Workspace-ID`, and
`Tenant-ID` are all distinct names — pick one and use it consistently.

#### 2.12.c Distinct headers across endpoints → AMBIGUOUS

If different endpoints declare different tenant headers (e.g. `X-Tenant-ID` on
`/projects` but `X-Org-ID` on `/users`), the detector emits
`TENANCY_SCOPE_AMBIGUOUS` and refuses to pick a scope. Consolidate to a single
header across the whole tenant surface.

#### 2.12.d Path-lure is NOT a signal

A route at `/api/v1/:tenantId/projects` or `/api/v1/tenants/:id/board`
without an `@ApiHeader`, `x-multi-tenant`, or `@TenantId()` declaration is
NOT detected as a tenancy scope. Path appearance is a lure, not a contract.

#### 2.12.e Diagnostics

| Code | Cause | Fix |
|---|---|---|
| `TENANCY_SCOPE_UNDETECTED` | Presence signaled (Prisma `tenantId` field / `nestjs-tenancy` package / `TenantGuard` class) but no declared header/extension/decorator on any handler | Add `@ApiHeader({ name: 'X-Tenant-ID' })` (preferred) on tenant-scoped handlers |
| `TENANCY_SCOPE_AMBIGUOUS` | ≥2 distinct endpoints declare different tenant signals | Consolidate to a single declared header across the surface |

#### 2.12.f Known propagation drift

`nest-openapi.js` currently strips `@ApiHeader` parameters and arbitrary
`@ApiExtension` markers from `endpoint.swaggerDeclared` (only `tags` +
`statuses` propagate). Until that is fixed, Layers 1 and 2 may not reach the
multi-tenant detector at matrix-regen time even when correctly declared.
Layer 3 (`@TenantId()` / `@Tenant()` decorator) is the only fully reliable
declaration today. Track the upstream fix; do NOT work around by re-adding
path-regex.

---

### 2.13 `@ApiOkResponse({ schema })` (or `@ApiCreatedResponse`) for the success shape
Without a response schema, the UI shows `200: OK` with an empty body preview.

```ts
@Get(':id')
@ApiOkResponse({
  description: 'Task found',
  schema: zodToOpenApi(taskSchema, { ref: 'Task' }) as never,
})
async findOne(@Param('id') id: string): Promise<Task> { ... }
```

The response envelope (`{ success: true, data: <shape> }`) is injected by `TransformInterceptor`. The schema you declare here describes **the `data` payload**, not the envelope — client codegen stays clean.

`TransformInterceptor` automatically bypasses `@Sse()` handlers (detects via NestJS's `__sse__` reflect metadata) so each `MessageEvent` reaches `SseStream` raw. Don't wrap SSE return values yourself, and don't try to "fix" the envelope on streaming endpoints.

---

### 2.14 SSE / streaming endpoints — declare what the probe should observe

Server-Sent Events use `@Sse(path)` returning `Observable<MessageEvent>`. The matrix detects SSE endpoints from `responseContentTypes: ['text/event-stream']` (set automatically when `@ApiResponse({ content: { 'text/event-stream': ... } })` is declared). The probe then reads OpenAPI `x-sse-*` extensions on `@ApiOperation` to decide which assertions to run.

```ts
@Sse('progress')
@ApiOperation({
  operationId: 'progressStream',
  'x-sse-event-names': ['progress', 'complete'],   // expectEventNames check
  'x-sse-retry': 3000,                              // expects `retry:` field on at least one frame
  'x-sse-id-required': true,                        // expects `id:` field on every frame
  'x-sse-heartbeat': true,                          // expects an `event: heartbeat` frame
  'x-sse-multiline': true,                          // expects `data:` lines containing `\n`
} as Record<string, unknown>)
@ApiResponse({
  status: 200,
  description: 'Progress stream',
  content: { 'text/event-stream': { schema: { type: 'string' } } },
})
stream(): Observable<MessageEvent> { ... }
```

**Probe sample size scales with declared event names.** The `api-stream` step's `maxEvents` is `Math.max(3, declaredNamesCount * 5)` so a 2-name endpoint gets sampled with `maxEvents=10`, leaving slack to observe both names even if the producer interleaves them. Endpoints with no `x-sse-event-names` get the floor of 3.

**Heartbeat declaration must emit non-empty data.** `NestJS SseStream` strips the `data:` line when `message.data` is falsy, and the SSE spec dispatch rule discards events whose data buffer is empty. If you declare `x-sse-heartbeat: true`, the producer MUST emit `{ type: 'heartbeat', data: 'hb' }` (or any non-empty string) — `{ type: 'heartbeat', data: '' }` will fail the assertion because the parser drops the event.

**Named events use `type` on the producer, `event:` on the wire, `e.event` in the parser.** A NestJS `MessageEvent` shape:
```ts
{ type: 'progress', id: 'evt-1', retry: 3000, data: '{"step":1}' }
```
serializes to:
```
event: progress
id: evt-1
retry: 3000
data: {"step":1}
```
The probe's parser exposes the event-type field as `e.event` (matching the wire). If you assert in custom flows, use `e.event === 'progress'` — `e.type` is not available.

---

## 3. Per-field Zod annotations (make schemas beautiful)

`extendZodWithOpenApi` is side-effect-imported in `packages/validation/src/openapi.ts`. Every exported schema should annotate its fields:

```ts
// packages/validation/src/schemas/user.schema.ts
export const createUserSchema = z.object({
  email: z
    .string()
    .email()
    .openapi({ example: 'user@example.com', description: 'Primary email' }),
  password: z
    .string()
    .min(8)
    .openapi({ example: 'hunter2!', description: 'Min 8 chars, mixed case' }),
});
```

**Important**: the `@anatine/zod-openapi` version pinned here does NOT support object-level `.openapi({ ref })` on `z.object(...)` — calling it is a no-op and the schema still inlines. Per-field `.openapi({ example, description, format, ... })` IS supported. To get a named component in `/api/docs`, pass `{ ref }` as the **second argument** to `zodToOpenApi()` at the decorator call site (see §3.2). The helper registers the schema in `packages/validation/src/openapi.ts`'s ref registry; `buildSwaggerDocument()` in `apps/api/src/swagger.ts` merges the registry into `document.components.schemas` at bootstrap, so every `$ref` resolves.

### 3.1 Share one schema across request and response
```ts
// packages/validation/src/schemas/task.schema.ts — pure schema, no ref.
export const taskSchema = z.object({ ... });
export const createTaskSchema = taskSchema.omit({ id: true, createdAt: true });
```
```ts
// apps/api/src/modules/task/application/controllers/task.controller.ts
@Post()
@ApiBody({ schema: zodToOpenApi(createTaskSchema, { ref: 'CreateTaskInput' }) as never })
@ApiResponse({ status: 201, schema: zodToOpenApi(taskSchema, { ref: 'Task' }) as never })
create(@Body() body: z.infer<typeof createTaskSchema>) { ... }
```
The first call with a given `ref` name wins — subsequent calls with the same name return the cached `$ref` pointer without re-registering. Keep ref names unique per schema shape.

### 3.2 Multiple request examples
```ts
@ApiBody({
  schema: zodToOpenApi(createUserSchema, { ref: 'CreateUserInput' }) as never,
  examples: {
    minimal: { summary: 'Minimal payload', value: { email: 'a@b.co', password: '12345678' } },
    admin:   { summary: 'Admin payload',   value: { email: 'a@b.co', password: '12345678', role: 'admin' } },
  },
})
```
Client devs get a "Try it out" dropdown pre-filled with real payloads.

### 3.3 String formats — declare them so the probe emits realistic samples + wrong-format invalidators

The probe's `pickSample` (in `detectors/nest-openapi.js`) reads `format` off every string property and emits a format-valid sample at flow-generation time. The companion `buildInvalidators` then emits a wrong-format invalidator for the same field, asserting your handler returns 400.

**Declaration is the only signal.** No path-regex, no field-name guessing. If you do not declare `format`, the probe falls back to `'x'.repeat(min ?? 3)` ("xxx") — fine for unbounded strings but wrong for fields your validator rejects when not in a specific format. **Declare the format on every typed string.**

#### 3.3.1 Supported formats (samples + invalidators the probe will emit)

| `format`      | Format-valid sample (`pickSample`)        | Wrong-format invalidator (`buildInvalidators`) |
|---------------|-------------------------------------------|------------------------------------------------|
| `email`       | `'probe@example.com'`                     | `'not-an-email'`                               |
| `uri` / `url` | `'https://probe.example.com'`             | `'not-a-url'`                                  |
| `uuid`        | `'00000000-0000-4000-8000-000000000000'`  | `'not-a-uuid'`                                 |
| `date`        | `'2024-01-15'`                            | `'not-a-date'`                                 |
| `date-time`   | `'2024-01-15T10:30:00.000Z'`              | `'not-a-datetime'`                             |
| (none)        | `'x'.repeat(min ?? 3)` ("xxx")            | (no wrong-format invalidator)                  |

Every sample is verbatim — the probe sends exactly these strings. Your validator MUST accept the format-valid sample and reject the wrong-format invalidator with 400, or the probe will surface contract drift.

#### 3.3.2 Declaration pattern — DTO `@ApiProperty({ format })` paired with Zod chain

For Nest controllers using `@ApiProperty` DTOs, declare the format on the property AND mirror it on the validator. The Swagger decorator drives the probe; the validator drives the runtime check. They MUST agree.

```ts
// apps/api/src/modules/.../dtos/booking.dto.ts
export class CreateBookingDto {
  @ApiProperty({ type: String, format: 'date',
    description: 'ISO 8601 date (YYYY-MM-DD)' })
  birthday!: string;

  @ApiProperty({ type: String, format: 'date-time',
    description: 'ISO 8601 date-time (RFC3339)' })
  scheduledAt!: string;

  @ApiProperty({ type: String, format: 'email' })
  contactEmail!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  organizerId!: string;

  @ApiProperty({ type: String, format: 'uri' })
  callbackUrl!: string;
}
```

```ts
// apps/api/src/modules/.../pipes/create-booking-validation.pipe.ts
const createBookingSchema = z.object({
  birthday:     z.string().date(),                       // matches format:'date'
  scheduledAt:  z.string().datetime({ offset: true }),   // matches format:'date-time'
  contactEmail: z.string().email(),                      // matches format:'email'
  organizerId:  z.string().uuid(),                       // matches format:'uuid'
  callbackUrl:  z.string().url(),                        // matches format:'uri'/'url'
});

export class CreateBookingValidationPipe implements PipeTransform {
  transform(value: unknown): z.infer<typeof createBookingSchema> {
    const result = createBookingSchema.safeParse(value);
    if (!result.success) {
      const errors = result.error.errors.map((entry) => ({
        field: entry.path.join('.'),
        message: entry.message,
      }));
      throw new BadRequestException({ message: 'Validation failed', errors });
    }
    return result.data;
  }
}
```

#### 3.3.3 Declaration pattern — Zod schema via `zodToOpenApi`

When the body comes from a `packages/validation` schema (preferred), the Zod chain alone declares both the OpenAPI format and the runtime check. `zodToOpenApi` carries `.email()` / `.url()` / `.uuid()` / `.date()` / `.datetime()` through to OpenAPI `format`.

```ts
// packages/validation/src/schemas/booking.schema.ts
export const createBookingSchema = z.object({
  birthday:     z.string().date()
    .openapi({ example: '2024-01-15', description: 'ISO 8601 date' }),
  scheduledAt:  z.string().datetime({ offset: true })
    .openapi({ example: '2024-01-15T10:30:00.000Z' }),
  contactEmail: z.string().email()
    .openapi({ example: 'user@example.com' }),
  organizerId:  z.string().uuid()
    .openapi({ example: '00000000-0000-4000-8000-000000000000' }),
  callbackUrl:  z.string().url()
    .openapi({ example: 'https://example.com/cb' }),
});
```

#### 3.3.4 What the probe will generate from the declarations above

For every string field with a declared `format`, you get:

- **`:happy` flow** — body uses the format-valid sample (`'2024-01-15'` for `date`, `'2024-01-15T10:30:00.000Z'` for `date-time`, etc.). Asserts your declared 2xx status.
- **`:field-<name>:wrong-format` invalidator** — body uses the wrong-format sample (`'not-a-date'`, `'not-a-datetime'`, etc.). Asserts 400 + `errorFieldMentions: '<name>'`.
- **`:field-<name>:missing` invalidator** — body omits the field. Asserts 400 + `errorFieldMentions: '<name>'`.

You do not configure these. The detector reads the schema, the emitter generates the flows. **Your job is to declare the format so the right flows fire.** Skipping the format declaration silently downgrades the probe coverage of that field.

#### 3.3.5 Worked verification — `probe-ref/shapes-r2/date-formats`

The `shapes-r2-probe.controller.ts` Branch 15 endpoint live-exercises both date branches:

```ts
@Post('date-formats')
@HttpCode(200)
@UsePipes(new DateFormatsValidationPipe())
@ApiOperation({ operationId: 'postDateFormats' })
@ApiResponse({ status: 200, type: DateFormatsResponseDto })
@ApiResponse({ status: 400, description: 'Validation failed (date or date-time format)' })
postDateFormats(@Body() body: DateFormatsRequestDto): DateFormatsResponseDto { ... }
```

After regen, `.flows.generated.json` contains:

- `probe-ref-shapes-r2-date-formats:post:happy` — body `{ birthday: '2024-01-15', createdAt: '2024-01-15T10:30:00.000Z' }`, expect 200.
- `:field-birthday:wrong-format` — body `birthday: 'not-a-date'`, expect 400 mentioning `birthday`.
- `:field-createdAt:wrong-format` — body `createdAt: 'not-a-datetime'`, expect 400 mentioning `createdAt`.
- `:field-birthday:missing` / `:field-createdAt:missing` — expect 400.

If you change `format: 'date'` → `format: 'email'` on the DTO without updating the Zod chain, the probe will still send `'probe@example.com'` and the Zod `.date()` chain will reject it → red probe → contract drift surfaced. That is the value the probe provides; do not paper over it by relaxing the validator.

---

## 4. DRY — custom composed decorators

When the same error matrix repeats across N handlers, collapse it:

```ts
// apps/api/src/common/decorators/api-errors.decorator.ts
import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
} from '@nestjs/swagger';

export const ApiCommonErrors = (): MethodDecorator & ClassDecorator =>
  applyDecorators(
    ApiBadRequestResponse({ description: 'Invalid input' }),
    ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' }),
    ApiForbiddenResponse({ description: 'Insufficient role' }),
  );

// usage
@Post()
@ApiCommonErrors()
@ApiResponse({ status: 409, description: 'Email already exists' })
async register(...) { ... }
```

The probe reads the flattened decorators identically — composed or inline, it doesn't care.

Same pattern for protected-endpoint scaffolding:

```ts
export const AuthenticatedEndpoint = () =>
  applyDecorators(
    UseGuards(JwtAuthGuard),
    ApiBearerAuth('accessToken'),
    ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' }),
  );
```

---

## 5. Per-handler template — every status enumerated, no shortcuts

**Every handler in this template lists every status it can return.** Copy as-is; strip statuses that truly cannot fire for your handler (and be ready to justify why during review).

```ts
@ApiTags('tasks')
@ApiBearerAuth('accessToken')
@Controller('tasks')
export class TasksController {
  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Create a task',
    description: 'Creates a task owned by the authenticated user.',
  })
  @ApiBody({
    schema: zodToOpenApi(createTaskSchema, { ref: 'CreateTaskInput' }) as never,
    examples: {
      minimal: { summary: 'Minimal', value: { title: 'Write spec' } },
      dated:   { summary: 'With due date', value: { title: 'Ship', dueAt: '2026-05-01T00:00:00Z' } },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Task created',
    schema: zodToOpenApi(taskSchema, { ref: 'Task' }) as never,
  })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  @ApiResponse({ status: 409, description: 'Title collides with existing task' })
  async create(
    @Body() body: CreateTaskInput,
    @Req() req: AuthenticatedRequest,
  ) { return this.service.create(body, req.user.id); }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List tasks owned by the caller' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'pageSize', required: false, example: 20 })
  @ApiResponse({
    status: 200,
    description: 'Paged list of tasks',
    schema: zodToOpenApi(taskListSchema, { ref: 'TaskList' }) as never,
  })
  @ApiResponse({ status: 400, description: 'Invalid query (bad page / pageSize)' })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  async list(
    @Query(new ZodValidationPipe(listTasksQuerySchema)) query: ListTasksQuery,
  ) { return this.service.list(query); }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get a task by id' })
  @ApiParam({ name: 'id', description: 'Task UUID', example: '018f...' })
  @ApiResponse({
    status: 200,
    description: 'Task found',
    schema: zodToOpenApi(taskSchema, { ref: 'Task' }) as never,
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  @ApiResponse({ status: 403, description: 'Caller does not own this task' })
  @ApiResponse({ status: 404, description: 'No task with that id' })
  async findOne(@Param('id') id: string) { ... }

  @Patch(':id')
  @UseGuards(JwtAuthGuardAPI Error: Claude's response exceeded the 32000 output token maximum. To configure this behavior, set the CLAUDE_CODE_MAX_OUTPUT_TOKENS environment variable.)
  @ApiOperation({ summary: 'Update a task' })
  @ApiParam({ name: 'id', description: 'Task UUID', example: '018f...' })
  @ApiBody({ schema: zodToOpenApi(updateTaskSchema, { ref: 'UpdateTaskInput' }) as never })
  @ApiResponse({
    status: 200,
    description: 'Task updated',
    schema: zodToOpenApi(taskSchema, { ref: 'Task' }) as never,
  })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  @ApiResponse({ status: 403, description: 'Caller does not own this task' })
  @ApiResponse({ status: 404, description: 'No task with that id' })
  @ApiResponse({ status: 409, description: 'Title collides with existing task' })
  async update(
    @Param('id') id: string,
    @Body() body: UpdateTaskInput,
  ) { ... }

  @Delete(':id')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Delete a task (admin only)' })
  @ApiParam({ name: 'id', description: 'Task UUID', example: '018f...' })
  @ApiResponse({ status: 204, description: 'Task deleted (no body)' })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  @ApiResponse({ status: 403, description: 'Caller is not an admin' })
  @ApiResponse({ status: 404, description: 'No task with that id' })
  async remove(@Param('id') id: string) { ... }

  @Post('login')
  @Public()
  @ApiOperation({ summary: 'Exchange credentials for a bearer token' })
  @ApiBody({ schema: zodToOpenApi(loginSchema, { ref: 'LoginInput' }) as never })
  @ApiResponse({
    status: 200,
    description: 'Login success — returns access token',
    schema: zodToOpenApi(loginResponseSchema, { ref: 'LoginResponse' }) as never,
  })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body(new ZodValidationPipe(loginSchema)) body: LoginInput) { ... }
}
```

**What to notice in this template:**
- Every handler uses the same explicit `@ApiResponse({ status, description })` form — no mixing with `@ApiOkResponse`/`@ApiUnauthorizedResponse` shorthand. One file, one style.
- The success status (200/201/204) is declared just like every error status — same decorator, same keyword shape. No "defaults" are relied on.
- The success `@ApiResponse` carries the `schema` field for the body preview; error ones carry only `description`.
- Every protected handler lists `401`. Every role-gated one lists `403`. Every id-bound one lists `404`. Every uniqueness-constrained one lists `409`. Every body-accepting one lists `400`.
- If you remove a status from this template for your handler, you are asserting "this branch cannot happen" — be prepared to defend that in review.

### 5.1 `@ApiResponse` vs shorthand — prefer explicit

This repo's **house style is the explicit `@ApiResponse({ status, description })` form**.

1. `grep -E '@ApiResponse\(\{ status: (4[0-9]{2}|5[0-9]{2})' apps/api/` gives you an instant audit of every error branch across the codebase.

```ts
// ✅ house style — explicit, uniform, grep-friendly
@ApiResponse({ status: 200, description: 'Login success' })
@ApiResponse({ status: 400, description: 'Invalid input' })
@ApiResponse({ status: 401, description: 'Invalid credentials' })

// ⚠️ legal but avoid — shorthand form, harder to audit en masse
@ApiOkResponse({ description: 'Login success' })
@ApiBadRequestResponse({ description: 'Invalid input' })
@ApiUnauthorizedResponse({ description: 'Invalid credentials' })
```

**Never mix the two forms on the same handler.** Mixing (`@ApiOkResponse` alongside `@ApiResponse({ status: 400 })`) is legal but reads inconsistently and breaks the one-line grep audit.
```

---

## 6. How each annotation maps to generated flows

| Annotation | Flow(s) emitted |
|---|---|
| `@Post()` + Zod body | 1 happy-path + N invalidators (1 per field × kind) |
| `@Query(ZodValidationPipe)` | query in happy-path + N query-invalidators |
| `@UseGuards(JwtAuthGuard)` | no-bearer→401, garbage-bearer→401, expired-bearer→401 |
| `@Roles('admin')` | non-admin→403 |
| `@ApiResponse({ status: 409 })` | targeted "reach 409" flow (duplicate-conflict) |
| `@ApiResponse({ status: 404 })` | targeted "reach 404" flow (non-existent id) |
| No annotations | **single stub flow labeled `endpoint-stub-untyped`** — visible red flag |

If your endpoint shows up as `endpoint-stub-untyped` in `.claude/hooks/.flows.generated.json`, the probe is blind to it. Fix the annotations.

---

## 7. Quick-reference decorator table

| Decorator | Where | Purpose |
|---|---|---|
| `@ApiTags('name')` | controller class | UI sidebar grouping |
| `@ApiBearerAuth('accessToken')` | class or handler | security requirement |
| `@ApiOperation({ summary, description })` | handler | sidebar label + markdown body |
| `@ApiParam({ name, description, example })` | handler | path-param docs + example |
| `@ApiQuery({ name, required, example })` | handler | query-param docs |
| `@ApiBody({ schema, examples })` | handler | request body + named ref + example payloads |
| `@ApiOkResponse({ schema, description })` | handler | 200 body shape + description |
| `@ApiCreatedResponse({ schema, description })` | handler | 201 body shape + description |
| `@ApiResponse({ status, description, schema })` | handler | any non-2xx status |
| `@ApiBadRequestResponse`, `@ApiUnauthorizedResponse`, `@ApiForbiddenResponse`, `@ApiNotFoundResponse`, `@ApiConflictResponse` | handler | shorthand for 400/401/403/404/409 |
| `@Roles(...)` | handler | drives 403 probe flow |
| `@Public()` | handler | bypass global guard |
| `@HttpCode(N)` | handler | override default 200/201 |

---

## 8. Self-check before committing

1. `pnpm probe:smoke` — regen runs automatically; does every endpoint in your diff appear in `.claude/hooks/.flows.generated.json`?
2. `grep endpoint-stub-untyped .claude/hooks/.flows.generated.json` — zero hits expected for your endpoints.
3. **Status audit** — for every handler in your diff:
   - `grep -nE '(throw new \w+Exception|HttpStatus\.)' apps/api/src/modules/<your-module>/` — list every status your code can produce.
   - Cross-reference with `grep -nE '@ApiResponse\(\{ status:' apps/api/src/modules/<your-module>/`. **Set of statuses thrown must equal set of statuses declared.**
   - Confirm the success status (200/201/204) is also declared explicitly — no implicit defaults.
   - Confirm every `@ApiResponse` has a `description`. `grep -E '@ApiResponse\(\{ status: \d+ \}\)' <file>` should return nothing (bare declarations).
4. For every protected endpoint, `@UseGuards(JwtAuthGuard)` + `@ApiBearerAuth('accessToken')` are both present (or inherited from class level).
5. `pnpm probe:smoke` produces ≥ (invalidators × fields + auth-boundaries + declared-statuses) flows for your endpoint. Each declared `@ApiResponse` status should correspond to at least one flow entry.
6. Open `/api/docs` in a browser. **The port is NOT hardcoded.** In this monorepo, every worktree / stack picks its own port and writes it to `.stack.json` at the repo root. Read it:
   ```bash
   jq -r '"http://localhost:\(.api_port)/api/docs"' .stack.json
   # e.g. http://localhost:18737/api/docs in a worktree, http://localhost:3001/api/docs on main
   ```
   Then for every endpoint in your diff:
   - Is there a `summary` in the sidebar?
   - Does `description` render markdown correctly?
   - Are path params labeled with examples?
   - Does the 2xx response show a non-empty schema preview?
   - Can you "Try it out" with pre-filled example data?
   - Do every 4xx response row have a description explaining the condition?
7. `grep -c '"\$ref"' apps/api/.openapi.json` — count should grow by roughly one per named Zod schema. Anonymous inline schemas mean you forgot to pass `{ ref: '...' }` to `zodToOpenApi(schema, { ref })` at the `@ApiBody`/`@ApiResponse` site.

If any of these fail, you're shipping endpoints that are illegible to client devs and/or blind to the probe. Add the missing annotation — never edit the overlay or the generated flows file (both are write-locked).

## 9. Stack lifecycle — boot once, keep it running

Stopping/restarting the dev stack between code iterations wastes ~60–90s every time. **Don't do it.** The stack runs in watch mode end-to-end:

- `pnpm --filter @sfx/api dev` uses nest-watch — rebuilds on any change under `apps/api/src/`.
- `pnpm --filter @sfx/web dev` uses next-dev — hot-reloads on any change under `apps/web/src/`.
- `pnpm turbo watch build --filter='./packages/*'` runs in the background (spawned by `scripts/worktree-stack.sh start`) — recompiles `packages/*/dist` on any change, which Nest picks up via symlinks. The Web app consumes `packages/*/src` directly via `transpilePackages` in `next.config.ts`, so no rebuild needed there.

### Workflow

1. **Start once at the beginning of your task.**
   ```bash
   scripts/worktree-stack.sh start   # or: pnpm stack:up
   ```
   This is idempotent. If the stack is already healthy it exits instantly without rebooting anything. Never run `stop` just so you can run `start` again.

2. **Iterate.** Edit controllers, services, packages — watchers pick up changes in 1–3 s. Re-run `pnpm probe:smoke` as many times as you need. No restart.

3. **Diagnose a broken state** with `scripts/worktree-stack.sh status` — prints JSON per-component health (`pg`, `api`, `web`, `turbo_watch`). Each reports `up | stale | down`.
   ```bash
   scripts/worktree-stack.sh status | jq
   ```

4. **Only reset when truly broken.** `scripts/worktree-stack.sh reset` is the nuclear option — kills zombies, clears `.stack.json` + `postmaster.pid`. Costs ~75 s to re-boot. Use only when `status` shows `stale` and you can't explain why.

5. **Never `stop && start` to "pick up a change".** Watch mode handles it. If a change isn't picked up, the watcher is broken — investigate, don't restart.

6. **Docker variant fast path.** When the stack runs as docker containers (`pnpm stack:up` / `scripts/stack-up-docker.sh`, the standard path inside the panel container) the api is **not** in nest-watch — it reads compiled `packages/<X>/dist`. After editing a `packages/` source file run `pnpm --filter @sfx/<pkg> build && pnpm stack:reload-api` (host build + ~10s container restart). Use `pnpm stack:up --rebuild` (~5 min full image rebuild) only for new npm deps, Dockerfile edits, new env vars, or Prisma schema changes that need a fresh `prisma generate`.

### Signs the watcher is broken (rare)

- TypeScript change compiles locally but API still returns old behavior → check `tail -f .api.log` for the nest rebuild (host watcher) or run `pnpm --filter @sfx/<pkg> build && pnpm stack:reload-api` (docker stack).
- Package change in `packages/validation` doesn't flow to API → check `tail -f .turbo-watch.log` for the turbo rebuild.
- Web change doesn't appear → check next-dev output; if none, `pnpm stack:refresh-watch` respawns watchers without rebooting PG/API.

## 10. Adding a new shared package — checklist

When you create a new `packages/<name>/` for cross-app code, do this once:

1. **Name it `@sfx/<kebab-name>`.** The `@sfx/` prefix is load-bearing:
   - `next.config.ts` auto-discovers `@sfx/*` packages and adds them to `transpilePackages` — zero config edit needed.
   - turbo-watch already matches `./packages/*`, so no turbo config edit needed.
   - NestJS consumes the compiled `dist/` via pnpm symlinks — no tsconfig paths needed.

2. **package.json minimal shape:**
   ```json
   {
     "name": "@sfx/<kebab-name>",
     "version": "0.0.0",
     "private": true,
     "main": "./dist/index.js",
     "types": "./dist/index.d.ts",
     "exports": {
       ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" }
     },
     "scripts": {
       "build": "tsc -p tsconfig.json",
       "dev": "tsc -p tsconfig.json --watch"
     }
   }
   ```
   The `main` must point to `./dist/index.js` (compiled) — this is the file Nest consumes. Web consumes `./src` directly via `transpilePackages`, so src is source of truth for Web and dist is source of truth for API.

3. **Respect dependency rules from CLAUDE.md:**
   - `@sfx/domain` has **zero deps** — pure entities and interfaces.
   - Every other `@sfx/*` package may depend on `@sfx/domain` only.
   - Never import `apps/*` from `packages/*`.

4. **Install + pick up the new package:**
   ```bash
   pnpm install                          # registers the package in the workspace
   # postinstall runs: scripts/worktree-stack.sh refresh-watch-if-running
   # which respawns turbo watch + next-dev — picks up the new @sfx/<name> automatically.
   ```
   If the stack wasn't running, postinstall is a silent no-op. Next `pnpm stack:up` picks it up normally.

5. **Build it once before first import** (turbo watch hasn't seen an edit yet, so `dist/` may be empty):
   ```bash
   pnpm --filter @sfx/<kebab-name> build
   ```
   After this, any edit under `packages/<kebab-name>/src/` triggers turbo watch to rebuild.

6. **Write tests** in `packages/<kebab-name>/__tests__/` (or `src/__tests__/`). The monorepo Stop hook enforces 90%+ coverage on every source file you create — no exceptions for new packages.

7. **Never edit** `apps/web/next.config.ts` to add the new package manually. The discovery function does it. If you edit it anyway, the next `pnpm install` + refresh-watch will work identically — but you've added unnecessary churn.