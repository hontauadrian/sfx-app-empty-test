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
- Bootstrap step bodies for any actor — the request payload + the
  response shape the bootstrap endpoint returns. Declare the actor
  with `{ auth: { scheme: <scheme-name> } }` and stop. The lead whose
  chunk delivers that authentication surface fills in the bootstrap
  flow once the endpoint exists.
- Any assertion that references a field a chunk has not delivered yet.
  Future-state schemas in `_shared.json` break the chunk that lands
  first because its probes assert fields its response does not yet
  contain. Assert only what the *first* chunk consuming the actor or
  resource actually returns.

### What CAN be in `_shared.json`

- `actors[]` — name + scheme (no bootstrap body).
- `resources[]` — entity declarations, optionally with a CRUD-endpoint
  hint, but no flow steps.
- `fixtures` — fixture roots / file paths.
- Response envelope is read from `apps/api/.openapi.json` `x-response-envelope` (sourced from API's TransformInterceptor.ENVELOPE static). Do NOT declare `successWrapper` in `_shared.json`.
- `config.cookieJar`, `config.fixturesRoot`, and similar toggles.
- `test-endpoint` registry entries when the project exposes them
  (e.g. clock-advance, mailbox, webhook log).

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

## Why JSON, not YAML

The contract files are JSON because this pipeline is AI-authored
end-to-end. JSON has loud parse failures; YAML has silent coercion
footguns (`country: NO` → `false`, `version: 1.10` → `1.1`,
indentation traps). When AI writes the file and AI consumes the file,
"loud failure on the smallest mistake" outweighs "human-readable
indentation." The loader globs `*.json` and uses `JSON.parse`.

Convention: write files with `JSON.stringify(obj, null, 2)` (2-space
indent). No comments, no trailing commas, no single quotes. Every
example in this skill follows that convention.

## When this skill runs in the workflow

```
feature-plan / product-plan
        │
        ▼
pnpm flows:bootstrap --task=<task-id>     ← machinery, writes draft with "source":"generated"
        │
        ▼
task-flow-authoring (this skill)          ← you, turning draft into 100% coverage
        │
        ▼
git commit + sd close                     ← flow file is now the contract
        │
        ▼
builder runs feature                      ← probe asserts your flows
        │
        ▼
on FLOW_STEP_FAILED:
  builder mails you (flow_mismatch)       ← back to this skill to fix or extend
```

## File layout (folder-of-files model)

One file per task ID under `.overstory/runtime-contract.flows/`:

```
.overstory/runtime-contract.flows/
├── _shared.json                          ← global actors + cross-feature resources (coordinator-only)
├── <task-id-of-feature-A>.json           ← one feature
├── <task-id-of-feature-B>.json           ← another feature
└── __fixtures__/
    └── <fixture-files>                   ← upload bytes, etc.
```

File naming: `<task-id>.json` — direct mapping to the sd task id.
Avoids merge fights. Easy to grep "what task introduced this flow."

## File metadata (every file MUST start with this)

```json
{
  "version": 1,
  "task_id": "<task-id>",
  "owns": [
    { "resource": "<resource-name>" }
  ],
  "extends": [
    { "resource": "<resource-from-elsewhere>" },
    { "actor": "<actor-from-_shared>" }
  ]
}
```

The full file shape:

```json
{
  "version": 1,
  "task_id": "<task-id>",
  "owns": [{ "resource": "<resource-name>" }],
  "extends": [{ "actor": "<actor-from-_shared>" }],

  "actors": [
    {
      "name": "<actor-name>",
      "auth": { "token": "<token-or-binding>" }
    }
  ],

  "resources": [
    {
      "name": "<resource-name>",
      "parents": ["<parent-resource>"],
      "create": {
        "method": "<verb>",
        "path": "<path-template>",
        "body": { }
      },
      "capture": {
        "bindings": { "id": "$.id" },
        "headerBindings": { "etag": "ETag" }
      }
    }
  ],

  "special_flows": [
    {
      "id": "<task-id>:<short-name>",
      "description": "<one-line>",
      "contract": { "kind": "http", "source": "<src-file>", "endpoint": "<METHOD /path>" },
      "setup": [
        { "create": "<resource-name>", "by": "<actor-name>", "capture": "<binding>" }
      ],
      "steps": [
        { "kind": "setAuth", "binding": "<actor-name>" },
        { "kind": "api", "transport": "http", "method": "<METHOD>", "path": "<path>", "body": {} },
        { "kind": "expect", "status": 200, "bodyHas": { "$.<field>": "<value-or-matcher>" } }
      ]
    }
  ]
}
```

Use `extends` to declare cross-file dependencies. The loader
hard-errors on:

| Conflict | Diagnostic |
|---|---|
| Two files declare the same actor with different credentials | `FLOW_MERGE_CONFLICT` (cites both files) |
| Two files declare the same resource (only one may `owns`) | `FLOW_MERGE_CONFLICT` |
| Two `special_flows` share the same `id` | `FLOW_DUPLICATE_ID` |
| File references actor/resource not declared anywhere | `FLOW_FILE_MISSING_OWNS_OR_EXTENDS` |

To avoid id collisions, prefix every `special_flows[].id` with the task
id: `<task-id>:<short-name>`.

## The comprehensive coverage checklist (Decision 11)

You MUST satisfy every applicable item for the diff before committing
the file. Walk the plan top-to-bottom; tick each box. Each section
below corresponds to one Decision 11 sub-row and has its own topic
file with paste-ready JSON patterns.

| § | Topic | Topic file |
|---|---|---|
| 11.1 | Per endpoint: happy + every declared status + cross-tenant + auth permutations + non-JSON + header-keyed | [per-endpoint.md](per-endpoint.md) |
| 11.2 | Per cross-resource chain: graph entry, leaf-create, wrong-parent, reparent-forbidden | [per-cross-resource-chain.md](per-cross-resource-chain.md) |
| 11.3 | Per business rule: positive + negative | [per-business-rule.md](per-business-rule.md) |
| 11.4 | Per state transition: forward + forbidden-from + pre-condition + side-effect + version-bump | [per-state-transition.md](per-state-transition.md) |
| 11.5 | Per declared error path: trigger + envelope shape | [per-error-path.md](per-error-path.md) |
| 11.6 | Per side-effect: positive + negative-rollback (uses Decision 14 vocabulary) | [per-side-effect.md](per-side-effect.md) |
| 11.7 | Per async / worker-driven: poll + freeze-at intermediate + failure-path + time-bounded | [per-async.md](per-async.md) |
| 11.8 | Per cross-call invariant: idempotency replay/conflict + concurrent equivalence + ordering + rate-limit + read-your-write | [per-cross-call-invariant.md](per-cross-call-invariant.md) |
| 11.9 | Per validation rule: per-field + cross-field + enum drift | [per-validation-rule.md](per-validation-rule.md) |
| 11.10 | Per pagination surface: 8 sub-flows | [per-pagination.md](per-pagination.md) |
| 11.11 | Per bulk surface: all-success / all-or-nothing / partial / empty / oversize | [per-bulk.md](per-bulk.md) |
| 11.12 | Per upload/download: happy + MIME + size + malformed + multi + binary + range | [per-upload-download.md](per-upload-download.md) |
| 11.13 | Per time-sensitive: expiration boundary + scheduled action + TTL + rate-limit window + cache freshness | [per-time-sensitive.md](per-time-sensitive.md) |
| 11.14 | Per concurrency-protected: ETag round-trip + lock contention + concurrent-replay | [per-concurrency.md](per-concurrency.md) |
| 11.15 | Per content-negotiation: Accept variants + Content-Type rejection + Accept-Language + custom headers + CORS + Cache-Control | [per-content-negotiation.md](per-content-negotiation.md) |
| 11.16 | Per hierarchical / nested: 3+ level chain + multi-id paths + body-FK + wrong-parent + reparent-forbidden + visibility + leak prevention | [per-hierarchical.md](per-hierarchical.md) |
| 11.17 | Per cross-tenant + cross-resource: the four-flow set per multi-tenant resource | [per-cross-tenant.md](per-cross-tenant.md) |

### Catalogues (Decision 18)

| Topic | File |
|---|---|
| Resource-graph patterns (1:N path-nested, N:M junction, polymorphic, self-referential, body-FK, 3+ chain) | [resource-patterns.md](resource-patterns.md) |
| Cross-tenant patterns (read-isolation, list-leak, mutate-isolation, cross-tenant relationship rejection, invitation, token-binding, role denial, hierarchical role precedence, service-account scope) — includes the four-flow set | [per-cross-tenant.md](per-cross-tenant.md) |

### Operational reference

| Topic | File |
|---|---|
| Self-check formula (Decision 12 — count and verify floor) | [self-check-formula.md](self-check-formula.md) |
| Bootstrap (`pnpm flows:bootstrap --task=<task-id>`) and the `"source": "generated"` vs `"source": "curated"` convention | [bootstrap-and-curate.md](bootstrap-and-curate.md) |
| Failure-mode catalog (Decision 10 — paste-ready resolution recipes) | [failure-modes.md](failure-modes.md) |

### Coordinator-only topics

| Topic | File |
|---|---|
| `_shared.json` — actors, cross-feature resources, fixtures, error-envelope, test-endpoint registry | [_shared-management.md](_shared-management.md) |
| Cross-task flows — when an interaction crosses ≥2 feature files, which file owns it (per Open Question 3) | [cross-task-flows.md](cross-task-flows.md) |

## Schema-extension roadmap (Decision 17)

The base schema is enough for happy / auth / cross-tenant /
synchronous-state-transition flows. Comprehensive coverage relies on
additive optional extensions delivered in three tiers.

### P0 — required for a complete HTTP coverage surface

| # | Extension | Resolves |
|---|---|---|
| P0-1 | `CaptureStep.headerBindings: { "<binding>": "<header-name>" }` — capture from response headers (ETag, Set-Cookie, Retry-After) | §11.1 (412), §11.6, §11.14 |
| P0-2 | `kind: "poll"` step with `whileBody` / `whileStatus` / `intervalMs` / `timeoutMs` / `finalExpect` / `finalCapture` | §11.7 (async) |
| P0-3 | `ApiStep.bodyKind: "json" \| "multipart" \| "form-urlencoded" \| "text" \| "binary"` + `multipart: [{ name, value?, file?: { fixtureRef, mimeType, filename? } }]` | §11.12 (uploads) |
| P0-4 | `Resource.idempotency: { keyHeader, scope, conflictStatus, replayStatusCode, replayHeader }` + `kind: "assertIdempotent"` | §11.8 (idempotency invariants) |
| P0-5 | `expect.sideEffects: [...]` and flow-level `sideEffects: [...]` (Decision 14 vocabulary) | §11.6 |
| P0-6 | Top-level `fixtures` map for named tokens (`expired-token`, `malformed-token`, `revoked-refresh`) | §11.1 auth permutations |

### P1 — long tail of common patterns

| # | Extension | Resolves |
|---|---|---|
| P1-1 | Richer matchers: `{ "matches": "<regex>" }`, `{ "absent": true }`, `{ "oneOf": [...] }`, `{ "type": "..." }`, `{ "contains": "..." }`, `{ "length": N }`, `{ "length_gte": N }` | Negative-shape + security-sensitive "field MUST be absent" |
| P1-2 | `expect.bodyShape: { arrayLength, arrayLengthAtLeast, arrayLengthAtMost, contains, excludes }` | §11.10, §11.11 |
| P1-3 | `Resource.pagination: { shape, pageParam, limitParam, defaultLimit, maxLimit, emptyResultAllowed }` | §11.10 |
| P1-4 | `Resource.ttl: { durationMs, expiredStatus }` + `WaitStep.advanceMs` + `WaitStep.advanceEndpoint` | §11.13 |
| P1-5 | Cookie capture: `"capture": { "<binding>": "cookie:<name>" }` | §11.7 refresh-token rotation |
| P1-6 | `setup: [{ "loop": <n>, "create": "<resource>", "captureEach": "<binding>" }]` + `body_builder: { kind, n, item, wrap }` | §11.10 multi-page seeding, §11.11 bulk seeding |
| P1-7 | `setup_helpers` named macros for common sequences (create / delete / archive / restore / loginAs / advanceClock / freezeAt) | DRY |
| P1-8 | `${uniqUuid:<name>}` interpolation for stable named UUIDs | §11.8 idempotency replays needing fixed keys |
| P1-9 | `_shared.test_endpoints: { clockAdvance, mailbox, webhookLog, downstreamLog, freezeAt, ... }` | Decision 14, Decision 15 |
| P1-10 | `_shared.error_envelope: { fields: [...] }` + `field_error("<field>")` matcher | §11.5, §11.9 |
| P1-11 | `coverage_template: { template, over: { ... } }` for matrix expansion | §11.15, §11.17 |
| P1-12 | `Resource.immutable_fields: [ "<field>" ]` | §11.16 reparent forbidden |
| P1-13 | `Resource.tenant_scoped_by: "<field>"` | §11.17 |
| P1-14 | `Actor.tenants: [ "<tenant>" ]` + per-tenant credential blocks | §11.17 |

### P2 — sugar / deferred

| # | Extension | Notes |
|---|---|---|
| P2-1 | `kind: "parallel"` with branches + aggregate (statusCounts, unique, successCount) | §11.8 concurrent equivalence — defer until needed |
| P2-2 | `Resource.transitions: [{ from, to, trigger, expectStatus, reverseAllowed }]` | §11.4 sugar |
| P2-3 | `kind: "matrix"` with axis + template + per-cell expects | §11.15, §11.17 sugar |
| P2-4 | `Resource.bulkOperations: [{ routeSuffix, shape, multiStatusCode }]` | §11.11 sugar |
| P2-5 | Range / SSE / WebSocket adapters | §11.12 range, streaming — separate adapter bundles |
| P2-6 | DB adapter consuming `db-row-*` side-effect declarations | Decision 14 |

Every extension is **optional and additive**. Existing flow files keep
working as new extensions land.

## Self-check formula (Decision 12)

Before sealing the flow file, count the categories below and verify
your `special_flows` count is at least the floor. See
[self-check-formula.md](self-check-formula.md) for the verbatim formula
and worked examples.

```
floor( N×5 + B×2 + T×2 + S×2 + I + A + V + P + U + C + H + X + E )
```

`S`, `I`, `A` will frequently be zero for plain-CRUD diffs and dominate
for async / idempotent diffs. If your count is lower, you have a
coverage gap. Walk the checklist again. The drift hook will not catch
missing edge cases — only missing endpoints. Coverage gaps inside an
endpoint slip through silently.

## Cross-cutting checklist (run before commit)

For every `<task-id>.json` you author, walk this 17-row list. Each row
maps one-to-one to a Decision 11 sub-row.

1. Each declared status (`@ApiResponse`, OpenAPI doc, etc.) on every
   controller in the diff has a `special_flows` entry that triggers it.
   (§11.1 — see [per-endpoint.md](per-endpoint.md))
2. Each protected endpoint has at least one anonymous-bypass flow.
   (§11.1)
3. Each tenant-scoped resource has the four-flow cross-tenant set
   (read/list/patch/delete from a foreign tenant). (§11.17 — see
   [per-cross-tenant.md](per-cross-tenant.md))
4. Each chainable POST is declared in `resources` with `parents`,
   `create`, and `capture`. State-changing routes go in `transitions`;
   bulk routes go in `bulkOperations`. (§11.2, §11.16 — see
   [per-cross-resource-chain.md](per-cross-resource-chain.md),
   [resource-patterns.md](resource-patterns.md))
5. Each soft-delete-capable resource has read-after-delete,
   list-excludes-archived, and restore flows. (§11.4 lifecycle)
6. Each idempotent endpoint has the replay-same-key flow AND the
   replay-different-body flow. (§11.8 — see
   [per-cross-call-invariant.md](per-cross-call-invariant.md))
7. Each side effect promised by the spec has at least one flow.
   (§11.6 — see [per-side-effect.md](per-side-effect.md))
8. Each state machine has positive + forbidden-from flows for every
   transition. (§11.4 — see
   [per-state-transition.md](per-state-transition.md))
9. Per-field validation has a flow per declared rule. (§11.9 — see
   [per-validation-rule.md](per-validation-rule.md))
10. Bulk endpoints have all-success, all-or-nothing-failure (or 207),
    oversize, empty-array flows. (§11.11 — see
    [per-bulk.md](per-bulk.md))
11. Paginated endpoints have empty/single/first/last/out-of-range/
    invalid-cursor/cursor-stable/combo flows. (§11.10 — see
    [per-pagination.md](per-pagination.md))
12. Upload endpoints have happy/MIME/size/malformed flows; download
    endpoints have content-type/disposition/range flows. (§11.12 — see
    [per-upload-download.md](per-upload-download.md))
13. Time-sensitive features have expiration-boundary flows using
    `advanceClock`. (§11.13 — see
    [per-time-sensitive.md](per-time-sensitive.md))
14. Lockable / ETag-protected resources have contention flows.
    (§11.14 — see [per-concurrency.md](per-concurrency.md))
15. Versioned / `Accept`-driven endpoints have content-negotiation
    flows. (§11.15 — see
    [per-content-negotiation.md](per-content-negotiation.md))
16. Three-level (or deeper) hierarchical resources have leaf-create +
    wrong-parent + reparent-forbidden flows. (§11.16 — see
    [per-hierarchical.md](per-hierarchical.md))
17. Cross-tenant + cross-resource scenarios are covered for every
    multi-tenant resource. (§11.17)

If any row is unchecked, the file is incomplete. The self-check formula
in [self-check-formula.md](self-check-formula.md) gives the floor; this
catalog gives the breadth.

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
placeholder. The runtime sees no scheme, treats the actor as failed
bootstrap, and every flow that references it cascades to 401 (the
`[contract-flows-bootstrap-FAIL] actor=<name> scheme=unknown` lines you
see in probe stdout). If you don't yet have credentials wired:

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

## Implementation status (read first)

The probe-flows v3 plan ships features in phases. Today only the HTTP
module is fully wired. Stick to what the runner backs; everything else
the schema accepts but the runner ignores or stubs.

**Runner-backed today:**
- Step kinds: `api`, `expect`, `capture`, `setAuth`, `logout`, `wait`,
  `poll`, `assertIdempotent`. (`navigate` is a no-op stub.)
- `expect` matchers: `status`, `statusAnyOf`, `statusBetween`,
  `bodyHas`, `bodyIsArray`, `bodyShape`, `headerHas`, `forbidden`.
- Matchers: literals, `{absent}`, `{oneOf}`, `{matches}`, `{type}`.
- Resource fields used by setup/runtime: `name`, `kind`, `create`,
  `capture`, `parents`. `setup[].by` actor binding works.
- Config: `reservedActors`, `clockAdvanceEndpoint`, `fixturesRoot`,
  `cookieJar.allowSecureOnHttp`. Response envelope sourced from API code via openapi.json (NOT `_shared.json`).
- Cookie jar (RFC 6265bis) + capture/replay step variants.

**Schema-accepted but runner-stubbed/unimplemented:**
- Resource blocks: `transitions`, `bulkOperations`, `idempotency`
  (declarative replay checks), `pagination`, `ttl`,
  `optimisticConcurrency`, `multipartCreate`, `concurrencyChecks`.
- Step kinds: `navigate` (returns passed:true, no browser drive),
  any `ws-*` step.
- `page.identity.ts` page-role detection feeds the matrix but the
  HTTP-only adapter has no page navigation runtime.

**What this means for authoring:**
- Per-*.md catalog files (`per-bulk.md`, `per-async.md`, `per-cross-tenant.md`,
  etc.) describe coverage targets the v3 plan reserved. Many use the
  legacy `{request, expect, jsonpath}` shape AND advanced features the
  current runner does not honour. Treat them as *future-coverage*
  references, not copy-paste templates. Use the canonical shape from
  this SKILL.md (next section) and the runner-backed features above.
- For HTTP-only projects (current boilerplate state), focus on:
  resource declarations, special_flows with setup+steps, expect
  bodyHas/headerHas/status, setAuth-driven actor switching,
  response envelope is sourced from `apps/api/.openapi.json` `x-response-envelope` (declared in API code via TransformInterceptor.ENVELOPE) — do not duplicate in `_shared.json`. The probe halts loud if envelope undeclared. The runner enters the wrapper, so flow paths like
  responses.

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
  "auth": { "token": "<value-or-binding>" },
  "transport": "<optional>"
}
```

NO `role` / `credentials`. The `auth` object is a discriminated union
on `scheme` — see "Actor types" above for the five canonical shapes
and the `AUTH_SCHEME_REGISTRY` reference. Bare `auth: {}` is rejected
at contract-load with `actors.N.auth.scheme · Invalid discriminator
value` — for an anonymous-equivalent actor declare
`{ "scheme": "anonymous" }` explicitly.

### Resource (array entry)

```json
{
  "name": "<resource-name>",
  "kind": "crud",
  "parents": ["<parent-resource>"],
  "create": {
    "method": "POST",
    "path": "/api/v1/<resource>",
    "body": {},
    "operationId": "<openapi-operation-id-optional>"
  },
  "capture": {
    "bindings": { "id": "$.id" },
    "headerBindings": { "etag": "ETag" }
  },
  "transitions": [
    { "from": "draft", "to": "published",
      "trigger": { "method": "PATCH", "pathSuffix": "/publish" },
      "expectStatus": 200 }
  ],
  "bulkOperations": [
    { "routeSuffix": "/bulk", "shape": "multi-status", "multiStatusCode": 207 }
  ],
  "idempotency": { "keyHeader": "Idempotency-Key", "scope": "route" },
  "pagination": { "shape": "cursor", "defaultLimit": 20 },
  "ttl": { "durationMs": 60000, "expiredStatus": 410 }
}
```

Required: `name`. Required for `kind: "crud"` (default): `create`,
`capture`. Required for `kind: "endpoint"` (read-only probe target):
nothing else — both `create` and `capture` may be omitted.

NO `routes`, NO singular `parent`, NO `actor` field. State-changing
routes belong in `transitions`. Bulk routes in `bulkOperations`.
Read/list/get/delete routes are exercised inline via flow `steps`
(method + path) or via OpenAPI lookup using `operationId`.

### Special flow

```json
{
  "id": "<task-id>:<scenario>",
  "description": "<one-line>",
  "contract": { "kind": "http", "source": "<file>", "endpoint": "GET /x" },
  "dependsOn": ["<other-flow-id>"],
  "setup": [
    { "create": "<resource-name>", "by": "<actor-name>",
      "body": {}, "capture": "<binding-name>" }
  ],
  "steps": [
    { "kind": "setAuth", "binding": "<actor-name>" },
    { "kind": "api", "transport": "http",
      "method": "GET", "path": "/api/v1/<resource>/${id}" },
    { "kind": "expect", "status": 200, "bodyHas": { "$.id": "${id}" } }
  ]
}
```

Actor binding lives at FLOW level, not resource level:

- `setup[].by` — which actor performs the create. Defaults to the
  flow's first `setAuth.binding` if omitted.
- `Step { kind: "setAuth", binding: "<actor>" }` — switches the active
  actor for subsequent steps. Use this to test cross-tenant access:
  `setAuth: tenantA-owner` → create resource → `setAuth: tenantB-member`
  → expect 404 / 403.

Steps recognised by the runner: `setAuth`, `api`, `expect`, `capture`,
`logout`, `navigate`, `wait` (full list in
`step-types.ts:STEP_KINDS`).

## Hand-off

Once the file passes self-check:

1. `git add .overstory/runtime-contract.flows/<task-id>.json`
2. `git commit -m "flows(<task-id>): author <feature-name> coverage"`
3. The next builder spawned for this task will see the flow file at
   boot; the probe asserts every entry.

If a builder later mails you with `--type flow_mismatch`:

1. Re-read the relevant flow.
2. Decide:
   - **Code bug** — builder fixes their code; you do nothing.
   - **Wrong flow** — you edit the JSON; reply `flow_update`.
   - **Spec ambiguity** — beyond your authority; escalate via
     `--type flow_escalation` to the coordinator.
3. If you fix the flow, mail the builder back with `--type flow_update`
   and a one-line summary so they re-run probe. The pre-close-gate that
   is blocking their `worker_done` clears once your reply lands in
   their inbox referencing the same `threadId`.

See [failure-modes.md](failure-modes.md) for the full Decision 10
catalog with paste-ready recipes for every code.
