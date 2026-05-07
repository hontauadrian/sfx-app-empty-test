# decision-11-coverage

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
