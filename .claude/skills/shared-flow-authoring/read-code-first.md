# Read code first — mandatory pre-flight before authoring `_shared.json`

`_shared.json` describes the cross-task contract: global actors, shared
resources, fixtures, error-envelope shape, test-endpoint registry. You
cannot author it from a product plan alone — the plan describes intent;
`_shared.json` reflects the actual auth scheme, the actual modules, the
actual fixture files on disk. Authoring without reading code produces
shared declarations that conflict with what tasks actually need, which
shows up as `FLOW_MERGE_CONFLICT` or `FLOW_FILE_MISSING_OWNS_OR_EXTENDS`
during probe runs.

**Run every step below BEFORE invoking the rest of this skill.** No
exceptions.

## Step 1 — Read the product plan

```
.overstory/specs/<top-level-issue-id>.md
```

Extract:
- **Top-level personas** (e.g. owner, member, viewer, admin).
- **Multi-tenant constraints** (tenant model, tenant-scoping strategy).
- **Cross-cutting fixtures** (small images, oversize blobs, fake CSV).
- **Error envelope** the platform uses (`{ code, field, message, ... }`).
- **Test-clock / test-endpoint registry** the probe uses for time-sensitive
  flows.

## Step 2 — Read every authentication/auth-related module

For each app's auth module (`apps/api/src/modules/auth*`,
`apps/api/src/modules/probe-ref/auth-r2*`, etc.):
- What auth scheme(s) are supported? (bearer, cookie, apiKey, basic,
  OAuth grant types)
- If this is a generated app, read `infra/keycloak/manifest.json` and
  `infra/keycloak/dev-seed.json` before declaring role actors. The role
  must exist in the manifest and a seeded user must receive it before a
  Keycloak-backed actor can bootstrap.
- What does the login endpoint return? Where do you read the access
  token from? (`$.accessToken` vs `$.data.accessToken` after wrapper)
- If there is no app login endpoint because Keycloak owns auth, use the
  existing Keycloak token endpoint login shape with `${env:...}`
  interpolation; do not leave bearer actors as scheme-only placeholders.
- Are sessions cookie-based? If so, what cookie names + attributes?
- Does the platform use a TransformInterceptor that wraps responses
  (e.g. `{ success: true, data: ... }`)? If yes, every actor's
  `auth.login.key` MUST account for the wrapper.

## Step 3 — Read every tenant-related module

For each app's tenant module:
- How are tenants modeled? (header-driven, path-driven, sub-resource,
  separate database)
- Which actors belong to which tenants? (`owner-tenantA`,
  `member-tenantA`, `member-tenantB`, ...)
- What's the cross-tenant denial behavior? (403 with
  `CROSS_TENANT_FORBIDDEN`?)

## Step 4 — Enumerate cross-task fixtures

```
.overstory/runtime-contract.flows/fixtures/
```

What's already there? Add only fixtures that multiple tasks need.
Per-task fixtures live in the per-task flow file's local fixture
directory (or get generated from controller code at probe time).

## Step 5 — Read existing per-task flow files

```
.overstory/runtime-contract.flows/*.json
```

For each `<task>.json`, note:
- `extends:` entries — which actors does the task reuse?
- `owns:` entries — which resources does the task own?
- Any actor declared in a per-task file that should have been global —
  that's a candidate to lift into `_shared.json`.

## Step 6 — Read every existing controller's auth decorations

Cross-check that `_shared.json`'s `actors[].auth` block matches what
the controllers actually require. If `apps/api/src/modules/probe-ref/
auth-r2/application/controllers/auth-flows-probe.controller.ts` accepts
both bearer AND session cookie on `/me`, the actor declaration should
specify `scheme: 'bearer-in-body'` (or whichever the runner uses) AND
the cookie-jar should be opt-in via `config.cookieJar.allowSecureOnHttp`
in test environments.

## Step 7 — Decide what to declare

Only put in `_shared.json` what is GLOBALLY shared. Anything used by a
single task lives in that task's flow file. Use the discovery from
Steps 1-6 to decide.

Typical contents:
- `owns: [{actor: anonymous}, {actor: member-tenantA}, ...]`
- `actors: [...]` — full credential blocks for any actor a flow can
  reference; anonymous uses `{ "scheme": "anonymous" }`
- `config.reservedActors.anonymous: { auth: { "scheme": "anonymous" } }`
- `config.clockAdvanceEndpoint: ...`
- `config.fixturesRoot: 'fixtures'`
- `config.cookieJar: { allowSecureOnHttp: true }` (test environments)
- `config.envelope: ...` (response wrapper, if applicable)

Generated-app boilerplate notes:
- `AuthTokenService` extracts roles from
  `resource_access[OAUTH_API_CLIENT_ID].roles`.
- `JwtAuthGuard` accepts either `Authorization: Bearer <token>` or
  `x-forwarded-access-token`.
- `GlobalExceptionFilter` defines the error envelope; do not call it
  TBD without reading the file.

## Step 8 — Author / extend `_shared.json`

Now you have the full picture. Edit `_shared.json` (or create it).
Keep diffs minimal — every change cascades to every task flow.

## Step 9 — Self-check

- Run `pnpm probe:smoke` after editing `_shared.json`. ALL existing
  task flows should still pass. If any fail with
  `FLOW_MERGE_CONFLICT` or unexpected auth errors, your edit changed
  contract semantics — revert and consult the lead(s) of affected
  tasks first.

## Worked example — auth-r2 across multiple tasks

The boilerplate's `_shared.json` declares 5 actors (anonymous,
member-tenantA, owner-tenantA, member-tenantB, admin, ephemeral).
That decision came from reading:
- `apps/api/src/modules/probe-ref/auth-r2/application/controllers/auth-flows-probe.controller.ts`
  → register/login accept any email, mint JWTs with `iss` + `aud`
  claims, set `Set-Cookie: session=...; refresh=...`
- `apps/api/src/modules/probe-ref/auth-r2/application/controllers/multi-tenant-probe.controller.ts`
  → `parseProbeSession` distinguishes role from `sub` prefix
  (`owner-tenantA*` → owner, `member-tenantA*` → member, etc.)
- `task-cookies-auth-permutations.json`, `task-tenant-resources.json`
  → both reference these actors via `extends:`

If the auth controller had instead used basic auth, `_shared.json`
would have declared `auth.scheme = 'basic'` instead of
`bearer-in-body`. The point: derive the shared declaration FROM the
code, not the plan.

## Anti-patterns

- **Authoring `_shared.json` from product plan alone.** Plans say
  "users have roles"; the controller decides which header / claim
  encodes the role.
- **Lifting per-task entities to global prematurely.** Only lift after
  ≥2 tasks already reference the entity.
- **Re-declaring an actor that an existing task already has in
  `extends:`** — causes `FLOW_MERGE_CONFLICT` on next probe run.
- **Mutating `_shared.json` without re-running probe smoke.** Every
  edit ripples through every task flow.
