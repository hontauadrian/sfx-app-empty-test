---
name: shared-flow-authoring
description: |
  Coordinator-side authoring of the contract-flows folder. Owns
  `_shared.json` (cross-feature actors, resources, fixtures, error-
  envelope, test-endpoint registry) and authors cross-task flows
  whose endpoints span multiple feature files. Resolves
  `flow_escalation` mails forwarded by leads when a spec is
  ambiguous, when a flow needs cross-feature scope, or when two
  feature files disagree on a shared declaration.

  INVOKE WHENEVER:
    - You have just finished `product-plan` and need to seed
      `_shared.json` for the new initiative (global actors, shared
      tenants, cross-cutting fixtures, error-envelope)
    - You receive a `flow_escalation` mail from a lead asking you to
      arbitrate a cross-feature concern
    - A lead reports `FLOW_FILE_MISSING_OWNS_OR_EXTENDS` for an entity
      that belongs in `_shared.json` (global actor, cross-feature
      resource, shared fixture)
    - A lead reports `FLOW_MERGE_CONFLICT` between two feature files
      for an entity that should have been declared in `_shared.json`
      from the start
    - A flow exercises endpoints from ≥2 feature files and you must
      decide which feature file owns the cross-task flow
    - The probe surfaces a contradiction at the cross-feature seam
      that no single lead can resolve

  Per Decision 3, the flows folder is owned by lead and coordinator
  roles only. Builders/mergers cannot author flow files (FILE_SCOPE
  excludes the folder; the `flows-path-boundary.js` hook blocks
  writes and emits `FLOW_OWNERSHIP_VIOLATION`).

  The complementary skill `task-flow-authoring` covers per-task
  authoring (`<task-id>.json`); this skill covers `_shared.json` and
  cross-task arbitration. Coordinators read `task-flow-authoring` to
  understand the per-task body; leads read this skill to understand
  what `_shared.json` provides them.
---

# shared-flow-authoring

## Pre-flight gate — read code BEFORE authoring `_shared.json`

**Mandatory.** Before writing any cross-task contract content, walk
[`read-code-first.md`](read-code-first.md). It enforces the nine
discovery steps that turn a product plan into a grounded `_shared.json`:

1. Read `.overstory/specs/<top-level-issue-id>.md` — extract personas,
   tenant model, fixtures, error envelope shape
2. Read every auth-related module — actual scheme, login response shape,
   cookie attributes
3. Read every tenant-related module — tenant scoping strategy, role
   resolution
4. List existing fixtures in `.overstory/runtime-contract.flows/fixtures/`
5. Read every existing per-task flow file — what's already declared,
   what should lift to global
6. Read every controller's auth decorations — cross-check `_shared.json`
   actor declarations
7. Decide what's truly globally-shared vs per-task
8. Author / extend `_shared.json` with minimal diff
9. Re-run `pnpm probe:smoke` — every existing task flow should still
   pass (changes ripple)

The remainder of this file describes the file layout, schema, and
per-sub-row patterns. It assumes you have completed the pre-flight gate.

## What this skill does

Authors and maintains the **cross-feature CONFIG** parts of the
contract-flows folder. Coordinator scope is intentionally narrow:

1. `_shared.json` — actor declarations, resource declarations, fixtures
   map, error-envelope, cookie-jar config, test-endpoint registry.
   **Declarations only, no behaviour assertions.**
2. **Arbitration** — answering `flow_escalation` mails from leads when
   the spec is ambiguous, two feature files disagree, or an entity needs
   to be promoted from a feature file into `_shared.json`. Reply with a
   directive (which chunk's lead owns the assertion); do NOT write the
   assertion yourself.

### What MUST NOT be in `_shared.json` at coordinator seed time

- `special_flows[]` with `expect.bodyHas` / `expect.status` /
  `expect.statusAnyOf` / step bodies that pin a response shape. Those
  are owned by the lead whose chunk *delivers* the surface, because
  that lead has the truth about what the endpoint actually returns at
  the moment the chunk lands.
- Future bootstrap step bodies for actors whose auth surface is NOT in
  the codebase yet. If the app already has a working auth baseline
  (for example generated apps with local Keycloak + seeded users),
  `_shared.json` MUST include the concrete actor `auth.login` block
  needed by the probe runner to mint a token. A bare
  `{ auth: { scheme: "bearer-in-body" } }` actor is not enough for
  bearer-backed flows and will cascade into auth bootstrap failures.
- Any assertion that references a field a chunk has not delivered yet.
  Future-state schemas in `_shared.json` break the chunk that lands
  first because its probes assert fields its response does not yet
  contain. Assert only what the *first* chunk consuming the actor or
  resource actually returns.

### What CAN be in `_shared.json`

- `actors[]` — name + the smallest complete auth declaration the
  runner can execute. Anonymous actors only need
  `{ "scheme": "anonymous" }`; bearer/cookie actors need the login or
  fixture fields required by their scheme unless no current flow can
  reference them.
- `resources[]` — entity declarations, optionally with a CRUD-endpoint
  hint, but no flow steps.
- `fixtures` — fixture roots / file paths.
- `config.envelope` — `successWrapper` / `errorWrapper` paths.
- `config.cookieJar`, `config.fixturesRoot`, and similar toggles.
- `test-endpoint` registry entries when the project exposes them
  (e.g. clock-advance, mailbox, webhook log).

### Generated-app Keycloak baseline — do not treat auth as future work

Generated apps in this repository already ship an authentication
baseline: local Keycloak, `oauth2-proxy`, JWT/JWKS validation in the
API, `infra/keycloak/manifest.json`, and `infra/keycloak/dev-seed.json`.
When a plan asks for a new generated-app role, the coordinator MUST:

1. Read `infra/keycloak/manifest.json` and `infra/keycloak/dev-seed.json`
   before naming actors.
2. If the role or seeded user is missing, direct the feature work to add
   both first. Do not declare an actor that Keycloak cannot mint.
3. Use one canonical actor name everywhere. Prefer the role name
   (`<role-name>`) over variants such as `<role-name>-actor`.
4. For bearer actors, include the concrete Keycloak ROPC login block
   with env interpolation. The auth surface already exists, so this is
   shared config, not a lead-owned future bootstrap assertion.
5. Read `GlobalExceptionFilter` and `TransformInterceptor` before
   writing `config.envelope`; do not mark the envelope as TBD when code
   already defines it.

For the current boilerplate, a working Keycloak actor looks like:

```json
{
  "name": "<role-name>",
  "auth": {
    "scheme": "bearer-in-body",
    "login": {
      "path": "${env:OAUTH_ISSUER_URL}/protocol/openid-connect/token",
      "contentType": "application/x-www-form-urlencoded",
      "body": {
        "grant_type": "password",
        "client_id": "${env:OAUTH2_PROXY_CLIENT_ID}",
        "client_secret": "${env:OAUTH2_PROXY_CLIENT_SECRET}",
        "username": "${env:TEST_ROLE_USER_EMAIL}",
        "password": "${env:TEST_ROLE_USER_PASSWORD}",
        "scope": "openid"
      },
      "key": "$.access_token"
    }
  }
}
```

You and the leads share write access to the folder. Leads append
bootstrap flows + cross-task flows to `_shared.json` as their chunks
deliver them. Builders and mergers cannot edit any of it. The
`flows-path-boundary.js` hook enforces ownership.

For per-task authoring detail (the Decision 11 walk for a single
feature), read [task-flow-authoring](../task-flow-authoring/SKILL.md).
This skill assumes that body and adds the coordinator-only topics on
top.

## Where to edit `_shared.json` — IN THE BUILDER'S WORKTREE

Each agent is forked into its own git worktree at sling time and gets
its own copy of `.overstory/runtime-contract.flows/`. There is NO auto-
sync between worktrees once they exist. If you edit `_shared.json` in
your own coordinator worktree only, every builder running against the
chunk keeps probing their stale copy and the same FLOW_* failure
reproduces every cycle until somebody manually relays the change.

Two cases:

1. **Initial seed (no builder running yet for this initiative).** Edit
   in your own worktree. The seed reaches builders via the normal
   merge-queue: it lands on master, the chunk's first builder branches
   off master with the seed already in place.

2. **Mid-chunk fix (one or more builders are already running).** Edit
   the file DIRECTLY in each affected builder's worktree:

   ```
   /workspace/.overstory/worktrees/<builder-name>/.overstory/runtime-contract.flows/_shared.json
   ```

   `cd` into that worktree, run `git add` + `git commit` there — the
   commit lands on the builder's branch and their next
   `pnpm probe:smoke` picks it up with no fetch, no restore, no mail
   relay. The `flows-path-boundary.js` hook explicitly permits
   coordinator/lead writes into any sibling
   `.overstory/worktrees/*/.overstory/runtime-contract.flows/*` for
   exactly this purpose.

If a single fix touches `_shared.json` AND multiple builders are
running against it (e.g. teams-backend-builder + teams-frontend-builder
on the same chunk), repeat the edit in each builder's worktree. There
is no auto-sync between sibling worktrees mid-iteration.

Always paste the resolved path into the `flow_update` mail body so the
builder can verify which file they should re-run against:

```bash
ov mail send --to <builder-name> --type flow_update \
  --subject "flow_update: _shared.json:<actor-or-resource> fixed" \
  --body "Edited /workspace/.overstory/worktrees/<builder-name>/.overstory/runtime-contract.flows/_shared.json — re-run \`pnpm probe:smoke\`."
```

Why this matters: editing in your own coordinator worktree without
also writing into the builder's worktree is the single biggest cause
of "lead fixed the flow but the builder kept failing" loops. Each
manual fetch/restore relay costs 5–30 min per round-trip. Writing
straight into the builder's worktree collapses it to one git commit.

## Who authors `<task-id>.json` — depends on whether you're slinging a lead

`_shared.json` is co-authored: you (coordinator) seed it; leads append
chunk-specific bootstrap step bodies + cross-task `special_flows` during
their chunk; you arbitrate via `flow_escalation` mail when leads
disagree. That convention does NOT apply to per-task flow files.

For `<task-id>.json` ownership, the rule depends on what you sling next:

- **You sling a LEAD with the chunk:** the lead authors
  `<task-id>.json` for the tasks under their chunk. Do NOT pre-author
  the file before slinging the lead. Pre-authoring forces the lead into
  a contract shape they didn't design, undermines their `read-code-first`
  walk in `task-flow-authoring`, and creates merge headaches when the
  lead inevitably needs to amend it. Sling the lead with the spec; let
  them invoke `task-flow-authoring` and write the file in their
  worktree.

- **You sling a BUILDER directly (no lead intermediary):** YOU author
  `<task-id>.json` before slinging the builder. The builder cannot
  author flow files (`flows-path-boundary.js` hook denies, `no-read-flows`
  hook denies even reads), and there is no lead to do it. You wear both
  hats for that task. Invoke `task-flow-authoring` for the per-task
  authoring rules (yes — coordinator can invoke a lead-side skill in
  this mode; the skill content is project-agnostic and the same shape
  guidance applies regardless of which capability is doing the writing).

How to tell which mode you're in: look at the dispatch you're about to
issue. `ov sling --capability lead` → mode A (don't pre-author).
`ov sling --capability builder` → mode B (pre-author). If you find
yourself reaching for the flow file but the next action is a lead
sling, stop and let the lead handle it.

**Required pre-read before authoring any flow content** — read [flow-foundation.md](../flow-foundation.md). It defines file layout (folder-of-files), the mandatory file metadata header, the full file shape, and the loader hard-error diagnostics table. If you skip this, the file you produce will be rejected by the loader.

To avoid id collisions, prefix every `special_flows[].id` with the task
id: `<task-id>:<short-name>`.

## The comprehensive coverage checklist (Decision 11)

You MUST satisfy every applicable item for the diff before committing
the file. Walk the plan top-to-bottom; tick each box. Each section
below corresponds to one Decision 11 sub-row and has its own topic
file with paste-ready JSON patterns.

**Required reference while building the coverage matrix and before commit** — read [decision-11-coverage.md](../decision-11-coverage.md). It carries the Decision 11 sub-row table, Catalogues (Decision 18), the Operational reference, the 17-row cross-cutting pre-commit checklist, the self-check formula, and the Decision 17 P0/P1/P2 schema-extension roadmap. You cannot self-check completeness without it.

### Coordinator-only topics

| Topic | File |
|---|---|
| `_shared.json` — actors, cross-feature resources, fixtures, error-envelope, test-endpoint registry | [_shared-management.md](_shared-management.md) |
| Cross-task flows — when an interaction crosses ≥2 feature files, which file owns it (per Open Question 3) | [cross-task-flows.md](cross-task-flows.md) |

## Actor types — pick the smallest pattern that covers your tests

Every actor an HTTP-tested API needs falls into one of five canonical
types. Pick by what your endpoints check, NOT by what the project domain
calls "roles". The five types together cover every auth scheme the
runtime supports today (`AUTH_SCHEME_REGISTRY` in
`lib/auth-bootstrap.ts` — see "If your auth doesn't fit" at the end of
this section).

### 1. Public actor — endpoints reachable with NO credentials

Reserved actor name `anonymous`. Always present. Use as the binding for
any flow that hits a public endpoint or asserts a 401 on a missing-token
path.

```json
{ "name": "anonymous", "auth": { "scheme": "anonymous" } }
```

### 2. Authenticated single-identity actor — one user, one token

For endpoints that gate on "any logged-in user". The actor declares the
register+login chain so the bootstrap creates the account, then captures
its bearer.

```json
{
  "name": "user",
  "auth": {
    "scheme": "bearer-in-body",
    "register": {
      "path": "<project's signup endpoint>",
      "body": { "<minimum fields the schema requires>": "<value>" },
      "key": "<JSONPath to the access token in the response body>"
    },
    "login": {
      "path": "<project's login endpoint>",
      "body": { "<email-equivalent>": "<value>", "<password-equivalent>": "<value>" },
      "key": "<JSONPath to the access token in the response body>"
    }
  }
}
```

The `register` block is optional — drop it if the project has no signup
endpoint and seed the user via fixture instead. The `key` matches the
project's response envelope (e.g. `$.data.accessToken`, `$.token`,
`$.access_token` — whatever the API returns; read the controller code
or the API contract to find it). Use `bearer-in-header` instead of
`bearer-in-body` if the API returns the token in a response header
(e.g. `Authorization: Bearer <token>`). Use `cookie` if the API sets a
session cookie and gates by `Cookie:`.

For generated apps backed by local Keycloak, do not hardcode the
Keycloak host or port in shared actors. Worktree stacks assign dynamic
ports, so login URLs must use env interpolation:

```json
{
  "name": "authenticated-user",
  "auth": {
    "scheme": "bearer-in-body",
    "login": {
      "path": "${env:OAUTH_ISSUER_URL}/protocol/openid-connect/token",
      "contentType": "application/x-www-form-urlencoded",
      "body": {
        "grant_type": "password",
        "client_id": "${env:OAUTH2_PROXY_CLIENT_ID}",
        "client_secret": "${env:OAUTH2_PROXY_CLIENT_SECRET}",
        "username": "viewer@example.com",
        "password": "Viewer123!"
      },
      "key": "$.access_token"
    }
  }
}
```

The contract-flow bootstrap resolves `${env:...}` placeholders before
fetching. This keeps `_shared.json` portable between the canonical
checkout, Overstory worktrees, and CI.

### 3. Permission-scoped actor — distinct identity at a specific scope

Use when the API gates on a permission tier (admin / writer / reader,
high-tier / low-tier, owner / editor / viewer — whatever this project
calls them). Declare ONE actor PER SCOPE TIER you need to test.

Each scope-tier actor is itself a single-identity actor (type 2) — its
own credentials, its own bearer. The DIFFERENCE is that BEFORE this
actor's token is used in flows, a setup chain assigns the scope:

```json
{
  "name": "<tier-A>",
  "auth": {
    "scheme": "bearer-in-body",
    "register": { "...": "..." },
    "login":    { "...": "..." }
  },
  "bootstrap": { "runFlow": "chain:assign-<tier-A>" }
}
```

The chain is a `special_flows` entry that:

1. Authenticates as the controlling identity (typically the `user` actor
   declared in type 2, or whatever identity the project gives broadest
   permissions).
2. Performs the API calls that grant `<tier-A>` permission to this
   actor's user (membership row, group invite, role assignment, ACL
   entry, etc.).
3. Returns once the assignment is confirmed.

Naming the chain after the tier keeps the wiring traceable. Without the
chain, the actor's token is valid but holds no scope — every
permission-gated endpoint returns 403 because the API can't see the
assignment. That 403-cluster is the canonical sign that a scope-tier
actor was declared without its bootstrap chain.

### 4. Tenant-scoped actor — same role, different tenancy boundary

Use to test tenant isolation: actor-A from tenant-X must NOT see data
from tenant-Y. Declare TWO actors with the SAME scheme/login shape,
DIFFERENT identifiers (different `body.email`, different tenant slug,
whatever creates separate identity in this project), and bootstrap
chains that put each in a different tenant.

The actor-types pattern doesn't change between role-scoping (type 3)
and tenant-scoping (type 4) — both are "single-identity + scope-
assignment chain". The difference is what the chain assigns: a role
within a tenant (type 3) vs membership in a different tenant (type 4).

### 5. Machine actor — service-to-service credential

Use for endpoints called by background jobs, webhooks, internal RPC.
No login flow — the credential is static.

```json
{
  "name": "service-X",
  "auth": {
    "scheme": "api-key",
    "headerName": "<header the API checks, e.g. X-API-Key>",
    "value": "<key string the API will accept>"
  }
}
```

Or for OAuth client-credentials flow (m2m):

```json
{
  "name": "service-X",
  "auth": {
    "scheme": "oauth-scoped",
    "tokenEndpoint": "<full URL or relative path of the OAuth token endpoint>",
    "scopes": ["<scope-A>", "<scope-B>"],
    "clientId": "<client id>",
    "clientSecret": "<client secret>",
    "audience": "<optional audience parameter>"
  }
}
```

Each scope produces a separate access token captured into
`actor.scopedBearers[<scope>]` — flows can pick which scope to send via
`setAuth: { binding: "service-X", scope: "<scope-A>" }`.

### Anti-pattern: placeholder actors with empty auth

Do NOT declare an actor with `auth: {}` as a "fill in later"
placeholder. The current schema accepts it for legacy files and the
runner treats it like anonymous credentials, which is even more
dangerous: protected flows reference the actor, send no bearer, and
cascade to 401. If you don't yet have credentials wired:

- **Defer the actor entirely** — don't declare in `actors[]`, don't
  list in `owns[]`. Flows can't reference what doesn't exist; the
  cross-reference validator will catch any leftover binding pointing
  at a missing actor.
- **Stub it as `{ "scheme": "anonymous" }`** ONLY IF no flow currently
  references it AND the test surface doesn't yet include
  permission-gated paths for that tier. Replace the stub with the full
  type 2 / type 3 / type 5 block when the role tests come online.

### Anti-pattern: deleting an actor to silence bootstrap noise

If a probe shows `[contract-flows-bootstrap-FAIL] actor=<name>
scheme=unknown` (or any other bootstrap diagnostic), the fix is to
declare the actor's auth shape correctly using one of the five types
above. **Do NOT delete the actor** to silence the diagnostic. Deletion
drops every flow that references the actor: the role-gated, tenant-
gated, and service-to-service endpoints become untestable, the probe
becomes "green" while coverage shrinks, and the gap is invisible to
anyone reading just the pass count. The bootstrap-FAIL diagnostic
exists to surface MISSING credentials, not to suggest removal.

### If your auth doesn't fit any of the five types

The schemes available are exactly what `AUTH_SCHEME_REGISTRY` exports
in `lib/auth-bootstrap.ts`: `bearer-in-body`, `bearer-in-header`,
`cookie`, `api-key`, `oauth-scoped`, `anonymous`. If your project needs
OAuth authorization-code (browser-redirect with code exchange), mTLS /
client certificates, SAML / SSO assertions, or 2FA-challenge mid-login,
the registry must be extended FIRST:

1. Add the scheme variant to `AUTH_SCHEME_REGISTRY` (Zod schema +
   handler — see the existing entries for shape).
2. The discriminated union in `contract-flows-schema.ts` and the
   validator hook pick it up automatically — no separate edit.
3. Add a new actor-type subsection to this skill describing when to use
   the new scheme.

Do NOT improvise an auth shape outside the registry. The schema rejects
unknown schemes at contract-load time with a field-precise error
(`actors.N.auth.scheme · Invalid discriminator value`).

**Required reference when defining `resources[]` or `special_flows[]`, when triaging a runner-backed-vs-stubbed feature gap, or when handing off / responding to `flow_mismatch` mail** — read [runner-and-schema.md](../runner-and-schema.md). It carries the probe-flows v3 implementation status (runner-backed vs schema-accepted-but-stubbed features), the Resource and Special-flow schema shapes, and the post-self-check git/commit hand-off + `flow_mismatch` triage decision tree.

## Schema reference (current)

Every flow file (including `_shared.json`) is parsed by
`ContractFileSchema.safeParse` with `.strict()` — UNRECOGNIZED keys are
rejected. Use the shapes below. Anything else fails
`FLOW_FILE_SCHEMA_INVALID` at probe time.

### Top-level

```json
{
  "version": 1,
  "task_id": "_shared",
  "owns": [{ "actor": "<name>" } | { "resource": "<name>" }],
  "extends": [{ "actor": "<name>" } | { "resource": "<name>" }],
  "actors": [ /* see below — ARRAY, not object map */ ],
  "resources": [ /* see below — ARRAY, not object map */ ],
  "special_flows": [ /* optional */ ],
  "config": {
    "reservedActors": { /* per-actor overrides */ },
    "fixturesRoot": "fixtures",
    "errorEnvelope": { /* shape used by every error response */ }
  }
}
```

### Actor (array entry)

```json
{
  "name": "<actor-name>",
  "auth": { "scheme": "<scheme-name>", "...": "<fields required by that scheme>" },
  "transport": "<optional>"
}
```

NO `role` / `credentials`. The `auth` object is a discriminated union
on `scheme` — see "Actor types" above for the five canonical shapes
and the `AUTH_SCHEME_REGISTRY` reference. Avoid bare `auth: {}` even
though legacy parsing coerces it to anonymous; for an anonymous-
equivalent actor declare `{ "scheme": "anonymous" }` explicitly.

For Resource (array entry) and Special-flow schema shapes, **read [runner-and-schema.md](../runner-and-schema.md) before writing them** — it is the canonical schema reference.
