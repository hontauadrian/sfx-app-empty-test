---
name: task-flow-authoring
description: |
  Author the executable contract (`<task-id>.json` under
  `.overstory/runtime-contract.flows/`) that proves a feature plan or
  product journey is correct, with comprehensive Decision-11 coverage
  across the 17 sub-rows. Owns the flow file for the assigned task.

  INVOKE WHENEVER:
    - You have just finished `feature-plan` and produced a feature spec
    - You have just finished `product-plan` and produced user journeys
    - You receive a `flow_mismatch` mail from a builder asking you to
      correct or extend a flow you authored
    - You receive a `flow_update`/`flow_escalation` thread asking you to
      revise a flow because the spec changed
    - The probe `FLOW_NEW_ENDPOINT_UNCOVERED` was raised by a builder's
      drift hook (you must add coverage; the builder cannot)
    - Any of these strings appear in probe output and the failure cites
      a flow id like `<task-id>:<short-name>`:
        - FLOW_STEP_FAILED
        - FLOW_MERGE_CONFLICT
        - FLOW_DUPLICATE_ID
        - FLOW_FILE_MISSING_OWNS_OR_EXTENDS

  Bootstrap (`pnpm flows:bootstrap --task=<task-id>`) runs first as
  machinery — it scaffolds a draft with `"source": "generated"` entries
  for the easily-inferable categories (status enumeration, resource
  lifecycle skeleton). This skill is what you use to TURN that draft
  into a curated, complete flow file by walking every Decision 11
  sub-row.

  Builders/mergers cannot author flow files (FILE_SCOPE excludes the
  folder; the `flows-path-boundary.js` hook blocks writes and emits
  `FLOW_OWNERSHIP_VIOLATION`). If a builder tells you via
  `flow_mismatch` mail that they need a new flow or a fix to an
  existing one, you are the only person who can edit it.
---

# task-flow-authoring

## Pre-flight gate — read code BEFORE authoring

**Mandatory.** Before writing any flow content, walk
[`read-code-first.md`](read-code-first.md). It enforces the eight steps
that turn a feature spec into a grounded flow file:

1. `sd show <task-id>` — extract module scope and acceptance criteria
2. Read every controller / DTO / guard / Zod schema in scope
3. Read `.overstory/runtime-contract.flows/_shared.json`
4. Read every existing per-task flow file for cross-references
5. `pnpm openapi:dump` — enumerate the live OpenAPI surface
6. Map each endpoint to Decision-11 sub-rows (NEW vs already-covered)
7. Author the flow file
8. Self-check via `self-check-formula.md`

If the task is bug-fix-only (no new endpoints, no changed status codes
or response shapes), the read-code-first gate concludes "no flow file
needed"; mail the lead/coordinator and skip the rest of this skill.

The remainder of this file describes the file layout, schema, and
per-sub-row patterns. It assumes you have completed the pre-flight gate.

## What this skill does

Produces or updates `.overstory/runtime-contract.flows/<task-id>.json` —
the executable form of the plan you (lead) just wrote, or that the
coordinator handed you. Every claim in the plan ("for any actor `<A>`,
operation `<O>` on resource `<Y>` owned by actor `<B>` fails with
status `<Z>`") is converted into a positive flow AND a negative flow.
The result is the single source of truth the runtime probe asserts
against.

You hold an exclusive write lock on this folder. Builders and mergers
cannot edit it. Their only recourse if a flow is wrong or missing is to
mail you with `--type flow_mismatch`. You answer with `flow_update`.

### Where to write the flow update — IN THE BUILDER'S WORKTREE

When you receive a `flow_mismatch` mail and decide a flow file needs
fixing, the file you edit MUST be the builder's worktree copy, not your
own:

```
/workspace/.overstory/worktrees/<builder-name>/.overstory/runtime-contract.flows/<task-id>.json
```

Each agent forks its own worktree at sling time and gets its own copy
of the contract-flows folder. If you edit your own worktree's copy
only, the builder keeps running `pnpm probe:smoke` against their
stale copy and the same failure reproduces every cycle. The Write hook
explicitly permits leads to reach into any sibling
`.overstory/worktrees/*/.overstory/runtime-contract.flows/*` path for
exactly this purpose.

Always paste the resolved path into your `flow_update` mail body so
the builder can verify which file they should re-run against. Example:

```bash
ov mail send --to <builder> --type flow_update \
  --subject "flow_update: <task-id>:<flow-id> fixed" \
  --body "Edited /workspace/.overstory/worktrees/<builder>/.overstory/runtime-contract.flows/<task-id>.json — re-run \`pnpm probe:smoke\`."
```

If a fix touches `_shared.json` and multiple builders are running
against it, repeat the edit in each affected worktree. There is no
auto-sync between worktrees mid-iteration — only sling-time copy.

### Lead-owned cross-task flows in `_shared.json`

The coordinator seeds `_shared.json` with **declarations only** —
actors and resources without bootstrap step bodies, plus envelope /
fixtures / endpoint-registry config. **You** are the one who fills in
behaviour assertions for surfaces your chunk delivers.

If your chunk delivers a surface other chunks will reuse (e.g. an
authentication bootstrap endpoint, a fixture-seed endpoint, a
tenant-create endpoint, any cross-cutting setup endpoint), append the
bootstrap flow body to `_shared.json` after the endpoint exists in
your code:

- For each actor whose authentication your chunk delivers, write the
  bootstrap flow that captures whatever credential the runtime needs
  (token, session cookie, signed header) — using the actual response
  shape your code returns now, not a future-state schema.
- For each resource whose CRUD endpoints your chunk owns, write the
  cross-task flows future chunks can `extend` from.

**Never assert a field your chunk does not deliver.** If a later
chunk adds another field to the response, that chunk's lead extends
the assertion when their code lands. Asserting future-state today
breaks your own probes.

If a flow you are about to author overlaps with content already in
`_shared.json` from coordinator seed (it shouldn't, given the rule
above), and the existing assertion is wrong for your chunk, escalate
via `ov mail send --type flow_escalation` rather than silently
documenting a "known deviation" in worker_done.

### Correctness over speed — NEVER reduce coverage to dodge a failure

If a probe fails, fix the assertion or the code so the probe passes.
Do NOT delete the resource / owns entry / extends entry / generated
flow to make the failure go away. Removing coverage is a regression,
not a fix — the surface still ships unverified and future changes
won't catch it.

Failure mode: **COVERAGE_REGRESSION_HACK**. If you genuinely think
the coverage is wrong, escalate via `flow_escalation` to coordinator
with rationale before committing. Time pressure is not a
justification.

### NEVER tell the builder to send `worker_done` while flows are red

If the builder's probe report shows failures, the cause is one of:
1. The flow is wrong (your responsibility — fix it).
2. The code is wrong (builder's responsibility — mail
   `flow_update` with the exact failing flow + expected shape).

"Document as a known deviation" is not a path. Either the flow
matches the chunk's actual response shape, or the code matches the
flow. Iterate until probes are green.

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

Steps are FLAT (not nested `{request, expect}`). Each step has a
`kind` (`setAuth`, `api`, `expect`, `capture`, `logout`, `navigate`,
`wait`). Actor binding is per-flow via `setup[].by` and per-step via
`{ kind: "setAuth", binding: <actor> }` — never on the flow object itself.

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

Task-level flows usually consume actors declared in `_shared.json`. When a
new actor is required for THIS task, it must still fit one of the five
canonical types — picked by what your endpoints check, NOT by the project
domain's wording. The five types map directly to the schemes the runtime
supports today (`AUTH_SCHEME_REGISTRY` in `lib/auth-bootstrap.ts`).

The full per-type shapes + the canonical register/login chain examples
live in
[shared-flow-authoring §Actor types](../shared-flow-authoring/SKILL.md#actor-types--pick-the-smallest-pattern-that-covers-your-tests).
Read that section once when authoring a flow that introduces a new actor;
the patterns are project-agnostic and apply identically inside a per-task
file.

The five types (summary):

1. **Public** — `{ "scheme": "anonymous" }`. Reserved name `anonymous`.
2. **Authenticated single-identity** — one user, one bearer. Use
   `bearer-in-body` / `bearer-in-header` / `cookie` per transport.
3. **Permission-scoped** — one actor per scope tier you need to test;
   each declares its own login + a bootstrap chain that grants the scope.
4. **Tenant-scoped** — same shape as type 3, chain assigns tenancy
   instead of role.
5. **Machine** — `api-key` for static header, `oauth-scoped` for OAuth
   client_credentials with scopes.

### Per-task additions land where the flow is authored

If the new actor is used by ONE task only, declare it in the task's
own `<task-id>.json` `actors[]` array. If it's used by multiple tasks,
escalate to coordinator with a `flow_escalation` mail so it lands in
`_shared.json` instead — lifting prevents drift between task copies of
the same actor.

### Anti-patterns (same as shared)

Do NOT declare `auth: {}` as a placeholder — the discriminator rejects
it at contract-load time and probe stdout fills with
`[contract-flows-bootstrap-FAIL] actor=<name> scheme=unknown`. Do NOT
delete an actor to silence a bootstrap diagnostic — the deletion drops
every flow that references it (the role-gated, tenant-gated, and
service-to-service tests become untestable while pass count rises).

If the runtime doesn't support your auth (OAuth authorization-code,
mTLS, SAML, 2FA-challenge mid-login), the registry must be extended
first — see the same shared-flow-authoring section for the path.

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

The probe runs `ContractFileSchema.safeParse` on every flow file with
`.strict()` — UNRECOGNIZED keys are rejected. Use the shapes below.
Anything else fails `FLOW_FILE_SCHEMA_INVALID` at probe time.

### Top-level

```json
{
  "version": 1,
  "task_id": "<task-id>",
  "owns": [{ "actor": "<name>" } | { "resource": "<name>" }],
  "extends": [{ "actor": "<name>" } | { "resource": "<name>" }],
  "actors": [ /* see below — ARRAY, not object map */ ],
  "resources": [ /* see below — ARRAY, not object map */ ],
  "special_flows": [ /* see below */ ],
  "config": { /* optional */ }
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

NO `role` / `credentials` fields. Auth is a free-form object the
adapter interprets (e.g. `{ "token": "Bearer …" }` or `{ "session":
"<binding>" }`).

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
