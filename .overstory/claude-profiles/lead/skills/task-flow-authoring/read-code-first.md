# Read code first — mandatory pre-flight before authoring

You cannot author a meaningful flow file from a feature spec alone. Specs
describe intent; flows must reflect actual endpoint shapes, declared
status codes, validation rules, and existing coverage. Skipping the
code-read phase produces flows that don't match the running system,
which the probe will then reject with confusing errors that look like
endpoint bugs but are really flow-author bugs.

**Run every step below BEFORE invoking the rest of this skill.** No
exceptions. If the task is a bug-fix that doesn't add new endpoints,
this phase tells you that — you may then skip flow authoring entirely
and proceed directly to the fix.

## Step 1 — Read the task body

```
sd show <task-id>
```

Extract:
- **Modules in scope** (e.g. `apps/api/src/modules/auth`,
  `packages/validation/auth`).
- **New behaviors** vs **modified behaviors** vs **bug-fix only**.
- **Acceptance criteria** that imply observable HTTP behavior.

If the task body says "fix X bug in Y handler" with no new endpoints
or new validation rules, **STOP**: bug-fix tasks don't need new flow
files unless the bug fix changes a status code or response shape that
no existing flow exercises. Mail the lead/coordinator to confirm; if
confirmed, skip the rest of this skill.

## Step 2 — Read every module in scope

For each module path the task names, read:
- `controllers/*.ts` — the actual `@Get`/`@Post`/`@Put`/`@Patch`/
  `@Delete` decorations + their full signatures
- `dtos/*.ts` — the request/response shapes the controller declares
- Any `guards/`, `pipes/`, `interceptors/` the controller decorates with
- Any Zod schemas referenced (likely under `packages/validation/`)
- Any `@ApiResponse(...)` decorators — these declare the response
  status codes the probe will expect to verify
- Any `@ApiBearerAuth()` / `@UseGuards(...)` decorators — these tell
  you whether the endpoint requires auth, and which actor to use

For every endpoint, write down on a scratch list:
```
METHOD path → declared statuses → auth scheme → request body shape → response body shape
```

## Step 3 — Read `_shared.json`

```
.overstory/runtime-contract.flows/_shared.json
```

This is the cross-task contract — global actors (anonymous, member,
admin, owner-tenantA, etc.), shared resources (tenants, users), shared
fixtures (small.png, oversize-blob.bin), and the error-envelope
declaration. Your task flow REUSES these via `extends:`. Don't
re-declare actors that already exist; declare new ones via the shared
flow's coordinator-side skill if you need them globally.

## Step 4 — Read every existing per-task flow file

```
.overstory/runtime-contract.flows/*.json
```

For each `<other-task>.json`:
- Note which endpoints they cover — your task should NOT duplicate
  coverage of an endpoint that's already exercised by another task's
  flow (unless your task changes that endpoint's behavior).
- Note `owns:` and `extends:` — these tell you the resource graph.
- Note `special_flows[].contract.endpoint` — these are the
  human-readable claim of which endpoint each flow exercises.
- Note `coverageTemplate:` values — these reveal the Decision-11
  sub-rows already covered for that endpoint.

If your task's endpoints are ALREADY covered by an existing task flow,
you don't need a new flow — extend the existing one (mail the original
author) or write a small per-task flow that only covers genuinely new
behavior.

## Step 5 — Enumerate the OpenAPI surface for your scope

```
pnpm openapi:dump
```

Or read `apps/api/.openapi.json`. Filter to endpoints whose path matches
your scope (e.g. `/api/v1/auth/*`). For each:
- Cross-check against your scratch list from Step 2 — anything the
  controller declares but doesn't appear in the OpenAPI dump is a
  decorator-emission bug, not a flow concern.
- Anything the OpenAPI declares that isn't in your scratch list means
  you missed reading a controller — go back and read it.

## Step 6 — Map endpoints to Decision-11 sub-rows

For every endpoint in scope, ask each Decision-11 question. For each
answer, note whether the behavior is NEW (your task introduces it)
or already-covered (some existing flow file already exercises it).

| # | Sub-row | Question |
|---|---------|----------|
| 1 | per-endpoint | what's the happy path? |
| 2 | cross-tenant | is this tenant-scoped? if yes, write a cross-tenant denial flow |
| 3 | business-rule | are there role/state-gated branches? |
| 4 | state-transition | does this advance/regress a resource state machine? |
| 5 | error-path | what 4xx/5xx envelopes does it emit? |
| 6 | side-effect | does it write audit-log / send mail / fire webhook? |
| 7 | async | does it 202 + poll? |
| 8 | cross-call invariant | is there a read-after-write invariant? |
| 9 | validation | what fields are required / formatted / bounded? |
| 10 | pagination | does it list with cursor/offset? |
| 11 | bulk | does it accept N items + atomic semantics? |
| 12 | upload/download | does it accept multipart / Range / Accept-Encoding? |
| 13 | time-sensitive | does it depend on clock (rate-limit, expiry)? |
| 14 | concurrency | does it use If-Match / Idempotency-Key? |
| 15 | content-negotiation | does it honor Accept / Accept-Language / CORS? |
| 16 | hierarchical | does the path nest sub-resources (parent/:id/child)? |
| 17 | cross-tenant (negative) | will any actor be denied access to another tenant's resource? |

Apply the same matrix for every endpoint, even ones that look trivial.

## Step 7 — Author the flow

Now you have:
- A scratch list of endpoints + their declared shapes
- A list of which Decision-11 sub-rows are NEW
- Cross-references to existing `_shared.json` actors / resources / fixtures
- Cross-references to existing task flows for already-covered behavior

Author `<task-id>.json` that:
- Extends `_shared.json` only for actors/resources you actually use
- Includes only flows for sub-rows your task introduces or modifies
- Cross-references existing task-flow files via prose comments (no
  duplicate flow ids)

The per-{sub-row}.md files in this skill describe the exact shape of
each flow type. Walk them in order; skip the ones that don't apply.

## Step 8 — Self-check

Before declaring the flow file done:
- Run `pnpm flows:bootstrap --task=<task-id>` if you haven't already.
  Compare its output against your hand-authored file. The bootstrap
  catches OpenAPI-derivable cases you may have missed.
- Re-read `self-check-formula.md` — apply it before sending
  `worker_done` or invoking `ov sling` for builders.

## Worked example — auth module

The `apps/api/src/modules/probe-ref/auth-r2/application/controllers/`
directory contains controllers like `auth-flows-probe.controller.ts`
with handlers `login`, `register`, `logout`, `refresh`, `me`. Reading
the file reveals:

- `POST /probe-ref/auth-flows/login` → 200/400/401 declared, accepts
  `{ email, password }`, returns `{ accessToken, refreshToken, user }`,
  emits `Set-Cookie: session=...; refresh=...`
- `POST /probe-ref/auth-flows/register` → 201/400/409 declared, same
  body shape, also emits Set-Cookie
- `POST /probe-ref/auth-flows/logout` → 204/401, accepts cookie OR
  bearer, clears cookies
- `POST /probe-ref/auth-flows/refresh` → 200/400, accepts body OR
  cookie, rotates session+refresh
- `GET /probe-ref/auth-flows/me` → 200/401, accepts bearer/cookie/
  X-Session-Token

From that reading, the Decision-11 mapping is:
- per-endpoint: 5 happy flows (one per route)
- error-path: 4 (login-401, register-409 dup, logout-401, me-401)
- validation: 1 (login with malformed email → 400)
- cross-call invariant: 1 (login → me preserves session)
- side-effect: 1 (logout clears session+refresh cookies)
- time-sensitive: 1 (refresh-rotates-cookie)
- per-tenant (cross-tenant): N/A — auth-flows isn't tenant-scoped

**Note**: many of these are already in
`task-cookies-auth-permutations.json` — your new task's flow should
cross-reference rather than duplicate.

## Anti-patterns

- **Authoring from spec alone.** Specs say "user can register"; the
  flow must encode the EXACT path, body, status, headers. Without
  reading the controller you'll get half of those wrong.
- **Skipping `_shared.json`.** Re-declaring `member-tenantA` per-task
  causes `FLOW_MERGE_CONFLICT`.
- **Skipping existing per-task flows.** Two flows with the same id
  cause `FLOW_DUPLICATE_ID`.
- **Treating bug-fix as flow-authoring.** Most bug-fix tasks DON'T
  need new flow files. The boot-check hook was removed precisely
  because it false-positived on bug-fix worktrees. Read the task body;
  if it's bug-fix only, mail the lead/coordinator before authoring.
