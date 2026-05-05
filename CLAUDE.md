# SFX Webapp Boilerplate — Monorepo Development Guide

You are an expert senior engineer working in a Turborepo + pnpm monorepo containing a Next.js frontend, NestJS backend, and shared packages. You follow Clean Architecture with a shared domain layer. You write tests before implementation (90%+ coverage), never ship code without type-checking and linting passing, and produce working code — not explanations.

## Commands

### Root (run from monorepo root)
```bash
pnpm dev                   # Start web + api in parallel
pnpm build                 # Build all packages + apps in dependency order
pnpm test                  # Run all tests
pnpm test:coverage         # Tests with 90%+ coverage enforcement
pnpm test:integration      # Run integration tests (API endpoints, cross-module, DB)
pnpm lint                  # Lint all packages + apps
pnpm typecheck             # Type check all packages + apps
pnpm clean                 # Remove node_modules, dist, .next, .turbo
```

### Stack management (per-worktree, no Docker — preferred for agents)
```bash
pnpm stack:up              # ← AGENTS USE THIS — single command, live log stream, exits cleanly on ready/fail
pnpm stack:status          # Check if PG / API / Web are healthy
pnpm stack:stop            # Tear the stack down cleanly
pnpm stack:reset           # Force-clean state without needing a live daemon
```

`pnpm stack:up` is the **only** boot command agents should use. It calls `stack:start` in detached mode under the hood, streams the boot log live, and exits 0 on `=== Stack ready ===` or 1 on the first `ERROR:`. No `tail -40`, no `2>&1 | grep`, no timeouts. Direct `pnpm stack:start` is hook-blocked for agents — it's reserved for humans debugging the wrapper itself.

#### When do I need to restart vs. just keep coding?

| You changed... | Do this |
|---|---|
| TS source — controllers, services, hooks, components, packages | **Nothing.** `nest --watch` (API) + `turbo watch` (packages) + Next.js HMR hot-reload. Just re-run `pnpm probe:smoke`. |
| Prisma schema (`schema.prisma`) | **Run `pnpm db:migrate -- --name <slug>`** to generate a new migration directory. The per-worker panel-bridge (`scripts/panel-bridge.mjs`, spawned automatically by `stack:up`) detects the new directory within ~1.5s and runs `prisma migrate deploy` against your worker's pg. NO manual `stack:reset` needed for schema changes. |
| Existing migration files (edited in place) | `pnpm stack:reset && pnpm stack:up` — bridge only auto-applies *new* migration directories, not edits to ones already on disk. |
| Seed files (`prisma/seed.ts`) | `pnpm stack:reset && pnpm stack:up` — seeds run only on a clean db. |
| Env vars in `apps/api/.env` or `.env` | **Just edit the file.** The panel UI Environment tab also writes here. The bridge restarts the api service automatically when an env-request `Provide + restart` is fired; for direct file edits, the api's `nest --watch` re-reads on next request. If a value did not take effect, restart manually: `bash workspace-dev/scripts/stack-down-docker.sh && pnpm stack:up`. |
| `package.json` / `pnpm-lock.yaml` | **Just commit.** The bridge polls these paths; on change it runs `pnpm install` then `docker compose -p app-<basename> up -d --build` for your worker stack. ~30-90s. |
| New `@sfx/<pkg>` workspace package | `pnpm install` (postinstall refreshes turbo watch automatically), then `pnpm --filter @sfx/<pkg> build` once. The lockfile change triggers the bridge rebuild path on top of that. |

**Per-worker bridge:** `pnpm stack:up` (docker variant) spawns `scripts/panel-bridge.mjs` as a detached process scoped to your worktree (`PANEL_BRIDGE_WORKSPACE=<worktree>`, `PANEL_BRIDGE_COMPOSE_PROJECT=app-<basename>`). PID at `<worktree>/.bridge.pid`, log at `<worktree>/.bridge.log`. The bridge owns the migration / env-request / lockfile-rebuild watchers — none of that logic lives in the panel anymore.

**Quick debug commands** (mirror `worktree-stack.sh` UX, no tail truncation, no timeouts, real exit codes — chain freely):

```bash
pnpm stack:debug          # one-shot JSON snapshot: pg/api/web/bridge state
pnpm stack:ps             # docker compose ps -a for this worktree's project
pnpm stack:logs           # last 200 lines of every service
pnpm stack:logs api       # last 200 lines of one service (also web, postgres)
pnpm stack:follow         # tail -f compose logs (Ctrl-C to exit)
pnpm stack:follow api     # tail -f one service
pnpm stack:bridge         # last 200 lines of .bridge.log (auto-apply trace)
pnpm stack:bridge:tail    # tail -F .bridge.log live
```

These work from inside any worktree the same way: project name is derived from `basename $PWD`, so `app-<basename>` lights up automatically. No need to remember the project name.

**When the stack misbehaves:**
1. `pnpm stack:debug` first — confirms which container is missing/exited.
2. If api is down, `pnpm stack:logs api` then `pnpm stack:follow api` to see the crash loop.
3. If a migration didn't apply, `pnpm stack:bridge` — the `.bridge.log` records every poll, every apply attempt, and every error. The bridge swallows nothing.
4. If a rebuild didn't fire after a lockfile bump, `pnpm stack:bridge` shows whether content-hash dedupe skipped it (intentional when content unchanged).

**The idempotence trap:** if `stack:up` prints `Stack already running (all green)`, the compose project is reused as-is. The bridge is still spawned (idempotent: skipped if `.bridge.pid` is alive). Existing migration directories are NOT re-applied — the bridge only fires on dir-creation events seen since startup. To re-apply everything from a clean db, use `pnpm stack:reset && pnpm stack:up`.

**Race-free `probe:smoke` chain:** because `stack:up` blocks until the stack is genuinely ready (or fails), this is safe:

```bash
pnpm stack:up && pnpm probe:smoke
```

The probe never runs against a half-booted stack.

### Docker
```bash
pnpm docker:up             # Dev: web (3000) + api (3001) + postgres (5432)
pnpm docker:down           # Stop all containers
pnpm docker:prod           # Production build + run
```

### Database
```bash
pnpm db:migrate            # Run Prisma migrations (dev)
pnpm db:migrate:deploy     # Run Prisma migrations (prod)
pnpm db:seed               # Seed database
pnpm db:studio             # Open Prisma Studio
pnpm db:generate           # Regenerate Prisma client
```

### Per-App
```bash
pnpm --filter @sfx/web dev       # Start frontend only (Next 15 + Turbopack)
pnpm --filter @sfx/api dev       # Start backend only (Nest 11 + SWC)
pnpm --filter @sfx/web test      # Test frontend only
pnpm --filter @sfx/api test      # Test backend only
```

### Dev compilers (do NOT change)

- `apps/api` dev MUST use SWC: `nest start -b swc --watch`. Drops ~40-60% RSS, ~20× faster restart vs `tsc --watch`. Config in `apps/api/.swcrc` (legacyDecorator + decoratorMetadata enabled). Type-check still happens at the close-gate via `pnpm typecheck`.
- `apps/web` dev runs plain `next dev` (Webpack), NOT `--turbo`. Turbopack peaks at 4-9GB on cold compile of this monorepo (Prisma client + zod-openapi + shared packages graph) and triggers OOM kills inside the agent stack. Webpack peak ~2-3GB at the cost of ~25-50s slower cold compile. Agent loops always cold-start (every `pnpm stack:reset` wipes `.next/`), so Turbopack's HMR speedup never amortizes here. If you're iterating interactively on a feature on the host, run `next dev --turbo` locally — just don't commit it back to the dev script.
- These flags are wired in each app's `package.json` `dev` script. Do not revert them when editing scripts. If you hit a SWC-incompatible decorator, fix the decorator (project rule: `@Inject(TOKEN)` per ctor param + `type:` on every `@ApiProperty`) — do not drop SWC.

## Agent Routing

- **Frontend work** → spawn subagent in `apps/web/`
- **Backend work** → spawn subagent in `apps/api/`
- **Shared domain/validation/types** → work at root in `packages/`
- **Docker/infra changes** → work at root

## Monorepo Structure

```
apps/web/       → Next.js 15 frontend (@sfx/web)
apps/api/       → NestJS 11 backend (@sfx/api)
packages/domain/     → Shared domain entities + interfaces (@sfx/domain)
packages/shared/     → Constants, enums, utility types (@sfx/shared)
packages/validation/ → Shared Zod schemas (@sfx/validation)
packages/database/   → Prisma schema + client (@sfx/database)
```

## Clean Architecture — Dependency Rules

```
@sfx/domain (ZERO deps) ← @sfx/validation, @sfx/shared, @sfx/database
                         ← apps/web (data + presentation layers)
                         ← apps/api (data + application layers)
```

| Source | Can import from |
|--------|----------------|
| `@sfx/domain` | Nothing (pure, zero deps) |
| `@sfx/validation` | `@sfx/domain` only |
| `@sfx/database` | `@sfx/domain` only |
| `@sfx/shared` | `@sfx/domain` only |
| Frontend data layer | `@sfx/domain`, `@sfx/validation`, `@sfx/shared` |
| Frontend presentation | own data layer, `@sfx/domain` |
| Backend data layer | `@sfx/domain`, `@sfx/database` |
| Backend application | own data layer, `@sfx/domain`, `@sfx/validation` |

**NEVER** import from `apps/` in `packages/`. **NEVER** import domain from data. **NEVER** import data from presentation/application.

## Boundaries

### Always do
- Write tests for every new file — see "Testing Requirements" section above. A hook WILL block you if tests are missing.
- Test every branch, edge case, and error path — not just the happy path
- Use Zod schemas from `@sfx/validation` for both frontend forms and backend validation
- Use domain entities from `@sfx/domain` — never redefine them in apps
- Pin dependency versions — no `^` or `~`
- Conventional commits: `type(scope): description`
- Think before acting. Read existing files before writing code.

### Never do
- Duplicate domain models between frontend and backend
- Import from `apps/` inside `packages/`
- Import from `@sfx/database` in the frontend
- Use raw `fetch()` in frontend features — use `executeRequest()`
- Skip tests or ship code below 90% coverage — you WILL be blocked
- Write source files without immediately writing the corresponding test file
- Hardcode secrets or credentials
- Use single-letter variable names

## Naming Conventions

| Type | Case | Example |
|------|------|---------|
| Packages | @sfx/kebab-case | `@sfx/domain`, `@sfx/validation` |
| Components, Types | PascalCase | `UserProfile`, `UserProfileProps` |
| Directories, files | kebab-case | `user-profile/`, `user-profile.tsx` |
| Variables, functions, hooks | camelCase | `handleSubmit`, `isLoading` |
| Environment variables, constants | UPPERCASE | `API_BASE_URL`, `MAX_RETRY_COUNT` |
| NestJS modules | kebab-case folder | `modules/user-management/` |
| Domain entities | PascalCase.ts | `User.ts`, `Product.ts` |

## Testing Requirements — MANDATORY

**Every source file you create or modify MUST have a corresponding test file.** A Stop hook will block you from completing if any source file is missing tests. This is not optional.

### Test file location

For any source file, place its test in one of these locations (hook checks all three):
```
components/user-profile.tsx        → components/__tests__/user-profile.test.tsx   (preferred)
components/user-profile.tsx        → components/user-profile.test.tsx             (also valid)
hooks/useUserProfile.ts            → hooks/__tests__/useUserProfile.test.ts       (preferred)
```

### What to test per layer

#### Domain entities & interfaces (`packages/domain/`)
- Constructor validation (valid + invalid inputs)
- All public methods — every branch, every edge case
- Value objects: equality, immutability
- Factory methods: all creation paths
- **No mocking** — domain is pure, test it directly

#### Validation schemas (`packages/validation/`)
- Valid input → passes parse
- Each field: missing, wrong type, boundary values (min/max length, empty string, null)
- Cross-field validation rules
- Error message content (verify user-facing messages are correct)

#### Data layer — repositories & networking (`apps/*/src/features/*/data/`)
- Mock the external dependency (API, database) — test the mapping/transformation logic
- Success path: API returns data → repository maps to domain entity correctly
- Error paths: network error, 404, 500, malformed response, timeout
- Edge cases: empty arrays, null fields, pagination boundaries

#### Presentation — hooks (`apps/*/src/features/*/presentation/hooks/`)
- Use `@testing-library/react` + `renderHook`
- Mock the repository/data layer
- Test initial state, loading state, success state, error state
- Test all user actions (submit, delete, refresh, navigate)
- Test side effects (what happens after a successful mutation?)

#### Presentation — components (`apps/*/src/features/*/presentation/components/`)
- Use `@testing-library/react` + `render`
- Test rendering with all prop variations
- Test user interactions (click, type, submit)
- Test conditional rendering (loading, error, empty, populated)
- Test accessibility: roles, labels, keyboard navigation
- **Never snapshot test** — assert specific content

#### API controllers (`apps/api/src/modules/*/`)
- Use `supertest` with NestJS `Test.createTestingModule`
- Test every endpoint: happy path, validation errors, auth errors, not found
- Test request body validation (bad input → 400 with clear error)
- Test response shape matches expected DTO
- Test error responses: correct status codes and error messages

### Test quality rules

1. **Test behavior, not implementation** — assert what the user/caller sees, not internal state
2. **Every branch must be tested** — if there's an `if`, test both paths. If there's a `catch`, trigger it
3. **Edge cases are mandatory** — empty arrays, null values, boundary values, concurrent operations
4. **No test should depend on another test** — each test sets up and tears down its own state
5. **Name tests clearly** — `it('should return 404 when user does not exist')` not `it('test3')`
6. **Mock at boundaries only** — mock APIs, databases, external services. Never mock the code under test

### Quality gates that block completion

When you try to finish, these checks run automatically and will block you:
1. `pnpm typecheck` — zero TypeScript errors
2. `pnpm lint` — zero lint errors
3. `pnpm test:coverage` — all tests pass, 90%+ coverage
4. `pnpm test:integration` — integration tests pass (API endpoints, cross-module communication, DB queries)

**You will be blocked and forced to fix issues before you can complete.** Write tests as you go, not at the end.

### Live missing-test debt (tracked during the session)

You do not need to wait for closeout to discover missing tests. Two PreToolUse hooks track debt live:

1. **Soft nudge** — when ≥3 source files lack a matching test file, every subsequent `Write`/`Edit`/`MultiEdit` will inject a reminder listing the unpaired files. Clear one by writing its test (same directory, `__tests__/`, or parent `__tests__/`).
2. **Hard block on forward-motion commands** — `git commit`, `ov mail send`, `worker_done`, and `sd close` are denied while any debt exists. The denial lists exactly which files need tests.

Debug: `node .claude/hooks/track-pending-tests.js --dump` prints current debt.

Writing the matching test file clears the debt immediately — no re-run needed. Do not attempt to bypass by writing empty `it.todo` tests; the Stop hook coverage gate will still block you.

## Runtime flow coverage (generated)

Unit tests run in-process with mocks. Runtime flow coverage proves that the
real stack actually executes the user journeys your diff introduces.

Probe flows are **generated** by `flows-generator.js` from Zod schemas
(`packages/validation/**/*.schema.ts`) + NestJS decorators (`@UseGuards`,
`@Public`, `@Roles`, `@ApiResponse`) + `.claude/runtime-contract.logical.json`.
The generated file `.claude/hooks/.flows.generated.json` is write-locked.
To add a test case, add a Zod field, a decorator, or a logical-contract row.

`overlay.flows` is retired. The overlay schema rejects it.

Run `pnpm probe:smoke` at any time to execute the HTTP probe yourself
against the booted stack.

## Runtime Verification — MANDATORY

Unit tests, integration tests, typecheck, and lint are necessary but NOT
sufficient. They run in-process with mocks. The Stop hook boots the real stack
(web + api + database) via the project's boot driver and executes HTTP probes
against every route and endpoint derived from your file diff.

Probe flows are **generated** — not hand-authored. `flows-generator.js`
reads Zod schemas (`packages/validation/**/*.schema.ts`), NestJS decorators
(`@UseGuards`, `@Public`, `@Roles`, `@ApiResponse`), and
`.claude/runtime-contract.logical.json` to produce
`.claude/hooks/.flows.generated.json` (write-locked). To change which
assertions the probe runs, change a Zod schema, a decorator, or a
logical-contract row. Never edit `.flows.generated.json` directly.

You must:

1. Run the probe during your task via `pnpm probe:smoke` — not just at close.
2. Fix every failure the probe reports.
3. Include the probe's JSON summary in your `worker_done` mail as a
   `## runtime-evidence` block.

The probe detects boot scripts, ports, routes, Zod schemas, NestJS Swagger
decorators, Next.js metadata, and middleware matchers automatically. You do
not configure it.

### Probe flow definition (folder-of-files model)

Curated flow definitions live in `.overstory/runtime-contract.flows/` (Decision 1).
The folder contains one `<task-id>.json` per task plus `_shared.json` for
cross-feature actors and shared resources. The loader globs `*.json` and merges
them into one logical contract (Decision 2: deep-equal conflict between two
files → `FLOW_MERGE_CONFLICT` naming both files; duplicate `special_flows.id`
across files → `FLOW_DUPLICATE_ID`).

**Edit ownership (Decision 3).** The folder is owned by lead and coordinator
roles only. Builders and mergers have read-only access; the
`flows-path-boundary.js` hook blocks any Write/Edit/MultiEdit/NotebookEdit on
the folder for non-owner roles and emits `FLOW_OWNERSHIP_VIOLATION`. If a
builder needs a flow added or changed, they MUST mail the lead — they cannot
self-resolve.

**Mail flow (Decision 4).** Three message types coordinate the conversation:
`flow_mismatch` (builder → lead: probe disagrees with my code), `flow_update`
(lead → builder: I edited the file, re-run the probe), `flow_escalation`
(lead → coordinator: spec is ambiguous). Send via `ov mail send --type
flow_mismatch --to <lead-name> --subject 'flow <id>: probe vs flow disagreement'
--body '<analysis>'`.

**Drift hook (Decision 8).** `flows-drift-check.js` runs at the close-gate
(`git commit`, `sd close`, `ov mail send --type worker_done`). It scans the
diff for new controller endpoints; any endpoint not referenced by any flow
file blocks with `FLOW_NEW_ENDPOINT_UNCOVERED` and instructs the builder to
mail the lead. Builders cannot edit the JSON to clear the block.

**Hook deployment.** The drift-check and path-boundary hooks live in
`.overstory/claude-profiles/builder/hooks/` and are deployed to
`.claude/hooks/` at agent boot by sfx-overstory's `hooks-deployer.ts`.
Activation requires a one-time addition of the matching `settings.json`
entries (PreToolUse on `Bash` for drift-check; PreToolUse on
`Write|Edit|MultiEdit|NotebookEdit` for path-boundary), shipped separately
on the sfx-overstory side.

**Bootstrap.** `pnpm flows:bootstrap --task=<task-id>` reads the OpenAPI surface
declared in `flows.config.json` and writes a draft `<task-id>.json`. Each
generated entry's `contract.source` is prefixed with `bootstrap:openapi:` so
the script can tell generated from curated on re-run. The lead invokes the
`task-flow-authoring` skill to add cross-tenant / business-rule / state-
transition / async / idempotency / side-effect flows that auto-generation
cannot infer, replacing the `bootstrap:openapi:*` source with a curated
reference (e.g. `plan-<task-id> §2`) as each one is verified. Re-running
bootstrap preserves entries whose `contract.source` does NOT start with
`bootstrap:openapi:` and refreshes the rest.

### Flow-authoring skills — which skill, which role

Three skills cover the lifecycle of a flow file. Match the role you
hold to the skill you invoke:

| Role | Skill | Scope |
|---|---|---|
| Lead | `task-flow-authoring` | Author / update `<task-id>.json` for the assigned task. Walks Decision 11 (per-endpoint, cross-tenant, business-rule, state-transition, error-path, side-effect, async, cross-call invariant, validation, pagination, bulk, upload/download, time-sensitive, concurrency, content-negotiation, hierarchical, cross-tenant). Owns the per-task file. |
| Coordinator | `shared-flow-authoring` | Author / update `_shared.json` (global actors, cross-feature resources, fixtures, error-envelope, test-endpoint registry). Decide placement of cross-task flows per Open Question 3 (leaf-action feature owns the flow). Arbitrate `flow_escalation` mails from leads. |
| Builder / merger | `flow-failure-response` | Respond to a probe-reported flow failure. Two options: fix the code (default) OR mail the lead with `--type flow_mismatch`. NO third option to edit the JSON yourself — the path-boundary hook blocks it mechanically. |

Per Decision 7, **bootstrap is machinery, not the answer.**
`pnpm flows:bootstrap --task=<task-id>` scaffolds a draft with
`bootstrap:openapi:*` source entries for the easily-inferable
categories (status enumeration, resource lifecycle skeleton). It
gets you ~30% of the way. The lead invokes `task-flow-authoring` to
walk every Decision 11 sub-row that bootstrap cannot infer
(cross-tenant denials, business rules, state-transition
forbidden-from edges, async poll/freeze, side-effect quantities,
validation boundaries, pagination's 8-flow set, etc.). Re-running
bootstrap is idempotent for curated entries — only
`bootstrap:openapi:*`-sourced rows are refreshed.

### Probe failure → skill routing (READ BEFORE EDITING APP CODE)

When `pnpm probe:smoke` reports failures, do NOT start patching app code
blindly. The probe internals (`.claude/hooks/probes/*`, `.flows.generated.json`)
are hook-protected — you cannot grep or read them. The skills below ARE the
supported declaration reference. Match the probe output, invoke the listed
skill, then edit code.

| Probe output contains... | Invoke skill |
|---|---|
| `FLOW_OWNERSHIP_VIOLATION` | `flow-failure-response` (mail the lead — do not edit the JSON) |
| `FLOW_NEW_ENDPOINT_UNCOVERED` | `flow-failure-response` (mail the lead — drift requires lead authorship) |
| `FLOW_STEP_FAILED` referencing a `<task-id>:<flow-name>` | `flow-failure-response` |
| `FLOW_MERGE_CONFLICT` / `FLOW_DUPLICATE_ID` / `FLOW_FILE_MISSING_OWNS_OR_EXTENDS` | `flow-failure-response` (mail the lead with the diagnostic block) |
| `RESOURCE_CAPTURE_UNDECLARED` | `build-verifiable-features` |
| `RESOURCE_CAPTURE_PATHPARAM_UNDECLARED` | `build-verifiable-features` |
| `chain:resource-setup:*` step failure | `build-verifiable-features` |
| `FLOW_STEP_FAILED` on `step2:expect` (403/404) | `build-verifiable-features` (capture path) + audit service for permission-before-existence ordering |
| `CONTRACT_STATUS_UNREACHABLE_UNGENERATABLE` | `nestjs-probe-coverage` (§ 2.8) |
| Cookie / CSRF / `auth-bootstrap` / `register-with-auto-login` / `refresh-token` failure | `nestjs-probe-coverage` (§ 2.9) |
| Missing `@ApiResponse` status / 401 on protected route | `nestjs-probe-coverage` (§ 2.8) |
| `[http-smoke-FAIL]` without a more specific code above | start with `nestjs-probe-coverage`, then `build-verifiable-features` if it's chain-related |

### The Logical App Contract

| Actor state | Surface type | Expected outcome |
|---|---|---|
| unauthenticated | public page (`/`, `/login`, `/register`, marketing) | 2xx, renders with CTAs |
| unauthenticated | protected page (anything inside `(auth)` group or marked `@routeGuard authenticated`) | 3xx redirect to login OR 401 |
| unauthenticated | public API endpoint | 2xx happy / 4xx bad input (never 5xx) |
| unauthenticated | protected API endpoint | 401 |
| just-registered | post-register destination (e.g. `/dashboard`) | 2xx, session persisted in auth store |
| authenticated | `/login` and `/register` | 3xx redirect to post-login destination |
| authenticated + refresh | any page previously accessed | still 2xx, session not lost (Zustand `persist` MUST be configured for auth store) |
| authenticated + logout | any protected page thereafter | 3xx redirect to login |

Every builder touching routes, pages, endpoints, middleware, or auth flows
MUST make the rows affected by their diff hold. The probe verifies this
automatically.

### No gate-gaming

Any of the following is a **conduct failure**, not a technical one:

- Interacting with Next.js Dev Tools, React Query Devtools, or TanStack
  devtools panels to inflate Playwright snapshot size.
- Recording Playwright calls against `/` or unrelated routes to satisfy
  evidence for a diff that added other routes.
- Suppressing coverage on security-critical code via
  `/* istanbul ignore */` or `// c8 ignore`.
- Using `as any`, `@ts-ignore`, or `@ts-expect-error` without a
  justification comment to pass typecheck.
- Marking tasks complete despite console errors, network errors, or 500s
  visible in the Playwright transcript.
- Editing `.flows.generated.json`, `.matrix.json`, or
  `.runtime-contract.logical.json` directly (all are hook-blocked).
- Adding matrix paths to `overlay.ignore[]` to suppress probe failures.

The `probe-covers-diff` and `worker-done-evidence` hooks enforce these
rules mechanically.

### Runtime-contract overlay

The runtime-contract overlay (`.runtime-contract.overlay.json`) provides
hints that cannot be expressed in code annotations (visible page tokens,
auth-boundary hints for the Logical App Contract).

`overlay.flows` is retired — the schema rejects it. Probe flows are now
generated from Zod schemas, NestJS decorators, and the logical contract.
See "Runtime flow coverage (generated)" above.

`overlay.ignore[]` is for framework internals only (e.g. `/_next/**`,
`/api/health`). Ignoring a matrix path that your diff introduced is
blocked by hook.

The contract compiler merges NestJS `@ApiTags`/`@ApiResponse`, Zod
schemas, Next.js `export const metadata`, middleware matchers, and tRPC
routers with the overlay into a compiled contract the probe consumes.
Update the overlay in the same commit as the behavior it describes.

The Logical App Contract table (above) is the prose representation.
`.claude/runtime-contract.logical.json` is the machine-readable mirror —
both must stay in sync.

### Probe-friendly code requirements (HARD RULES)

Two meta-principles govern all probe-friendly code in `apps/api/src/`:

**(A) The probe is declaration-driven, not inferential.** Anything the probe
needs to know — response shape, capture chain, auth scheme, error envelope,
cookie roles — MUST be explicitly declared via decorator/extension/schema.
If you didn't declare it, the probe goes red with a DIAG or silently
under-covers your code. NEVER write code expecting the probe to figure it out.

**(B) tsx + esbuild don't emit reliable reflect-metadata.** `design:type` for
property decorators and `design:paramtypes` for constructor params are NOT
reliably emitted. Anywhere NestJS infers types from TypeScript at runtime,
you MUST declare the type explicitly.

Worked examples (applications of the meta-principles — not exhaustive):

1. **Every `@ApiProperty()` / `@ApiPropertyOptional()` MUST declare `type:`**
   (`type: String`, `type: Number`, `type: [SomeDto]`, etc.) — applies (B).

2. **Every constructor injection MUST use explicit `@Inject(Token)`**
   on each parameter — applies (B).

3. **Every POST handler creating a chainable resource MUST declare
   `@ResourceCaptures(...)`** for `chain-crud-roundtrip` flow generation
   — applies (A).

Tomorrow there will be another decorator with the same root cause. Apply
the meta-principles, not just these three rules. See `build-verifiable-features`
skill for full pattern docs and code examples.

## SOLID Principles

- **S**: Pages render. Hooks manage state. Mappers derive UI. Controllers handle HTTP. Repositories access data.
- **O**: New features = new modules; never modify unrelated modules.
- **L**: All implementations respect interface semantics.
- **I**: Small, focused interfaces (`IUserReader` + `IUserWriter`, not `IUserRepository` with 20 methods).
- **D**: Depend on abstractions (`@sfx/domain` interfaces), not implementations (Prisma, fetch).

## Git Workflow

- Conventional commits: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`
- Format: `type(scope): description` — scope is package/app name
- Examples: `feat(domain): add Product entity`, `fix(api): handle null user in find`

<!-- mulch:start -->
## Project Expertise (Mulch)
<!-- mulch-onboard-v:1 -->

This project uses [Mulch](https://github.com/jayminwest/mulch) for structured expertise management.

**At the start of every session**, run:
```bash
mulch prime
```

This injects project-specific conventions, patterns, decisions, and other learnings into your context.
Use `mulch prime --files src/foo.ts` to load only records relevant to specific files.

**Before completing your task**, review your work for insights worth preserving — conventions discovered,
patterns applied, failures encountered, or decisions made — and record them:
```bash
mulch record <domain> --type <convention|pattern|failure|decision|reference|guide> --description "..."
```

Link evidence when available: `--evidence-commit <sha>`, `--evidence-bead <id>`

Run `mulch status` to check domain health and entry counts.
Run `mulch --help` for full usage.
Mulch write commands use file locking and atomic writes — multiple agents can safely record to the same domain concurrently.

### Before You Finish

1. Discover what to record:
   ```bash
   mulch learn
   ```
2. Store insights from this work session:
   ```bash
   mulch record <domain> --type <convention|pattern|failure|decision|reference|guide> --description "..."
   ```
3. Validate and commit:
   ```bash
   mulch sync
   ```
<!-- mulch:end -->

<!-- seeds:start -->
## Issue Tracking (Seeds)
<!-- seeds-onboard-v:1 -->

This project uses [Seeds](https://github.com/jayminwest/seeds) for git-native issue tracking.

**At the start of every session**, run:
```
sd prime
```

This injects session context: rules, command reference, and workflows.

**Quick reference:**
- `sd ready` — Find unblocked work
- `sd create --title "..." --type task --priority 2` — Create issue
- `sd update <id> --status in_progress` — Claim work
- `sd close <id>` — Complete work
- `sd dep add <id> <depends-on>` — Add dependency between issues
- `sd sync` — Sync with git (run before pushing)

### Before You Finish
1. Close completed issues: `sd close <id>`
2. File issues for remaining work: `sd create --title "..."`
3. Sync and push: `sd sync && git push`
<!-- seeds:end -->

<!-- canopy:start -->
## Prompt Management (Canopy)
<!-- canopy-onboard-v:1 -->

This project uses [Canopy](https://github.com/jayminwest/canopy) for git-native prompt management.

**At the start of every session**, run:
```
cn prime
```

This injects prompt workflow context: commands, conventions, and common workflows.

**Quick reference:**
- `cn list` — List all prompts
- `cn render <name>` — View rendered prompt (resolves inheritance)
- `cn emit --all` — Render prompts to files
- `cn update <name>` — Update a prompt (creates new version)
- `cn sync` — Stage and commit .canopy/ changes

**Do not manually edit emitted files.** Use `cn update` to modify prompts, then `cn emit` to regenerate.
<!-- canopy:end -->
