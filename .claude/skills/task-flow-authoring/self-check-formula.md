# Decision 12 — Self-check formula

> Before sealing a flow file, the lead computes a coverage floor.

## The formula (verbatim from Decision 12)

```
floor( N × 5 + B × 2 + T × 2 + S × 2 + I + A + V + P + U + C + H + X + E )
```

Where:

- **N** — distinct `<endpoint>`s introduced or modified
  (×5 = happy + auth-bypass + cross-tenant + ≥1 declared 4xx + non-JSON-
  surface OR header-keyed contract if applicable)
- **B** — business rules (×2 = positive + negative)
- **T** — state transitions (×2 = forward + forbidden-from)
- **S** — side-effects promised by the plan (×2 = positive + negative-
  rollback where the plan claims atomicity)
- **I** — cross-call invariants (idempotency replay, concurrent
  equivalence, ordering, rate-limit)
- **A** — async transitions (one `poll` flow per terminal state + one
  freeze-at flow per intermediate state)
- **V** — validation rules (one per declared rule)
- **P** — pagination surfaces (×8 sub-flows: empty / single / first /
  last / out-of-range / invalid-cursor / stable-on-insert / combo)
- **U** — upload/download surfaces (×6: happy / mime / size / malformed /
  multi / binary-download)
- **C** — concurrency-protected resources (×3: etag-positive / etag-
  stale / lock-contention)
- **H** — hierarchical resources at depth ≥ 3 (×3: leaf-create / wrong-
  parent / reparent-forbidden)
- **X** — cross-tenant matrix (×4 per multi-tenant resource: read / list
  / patch / delete from a foreign tenant)
- **E** — explicit error paths declared by the plan

## What the formula tells you

The formula's only role is a **self-check** that the lead has not
overlooked an entire category. `S`, `I`, `A` will frequently be zero
for plain-CRUD diffs and dominate for async / idempotent diffs. If
your `special_flows` count is below this floor, you have a coverage
gap. Walk the checklist again.

The drift hook (`flows-drift-check.js`) catches missing **endpoints**
— it fires `FLOW_NEW_ENDPOINT_UNCOVERED` when a builder introduces a
route the flow folder doesn't reference. It does NOT catch missing
**edge cases inside an already-covered endpoint**. Coverage gaps
inside an endpoint slip through silently. Only the self-check
formula catches those.

## How to count

For every variable, walk your diff with the corresponding topic file
open. The count is "how many distinct items," not "how many lines of
spec."

### N — endpoints

`@Controller('<root>')` × `@Get/@Post/@Put/@Patch/@Delete('<sub>')`. A
single `@Controller` with five verbs is N=5. Count both new endpoints
AND endpoints whose handler the diff modifies.

### B — business rules

Sentences in the plan that promise behaviour above HTTP basics. Look
for sentences containing "can," "cannot," "only," "when," "if ...
then," "must." Do NOT count HTTP-level rules ("returns 404 if not
found") — those are §11.5 explicit error paths (`E`).

### T — state transitions

Each forward arrow in the state machine. If the plan describes
`<draft> → <pending> → <published>`, T=2 (two transitions).
`<published> ↔ <archived>` (bidirectional) counts as T=2.

### S — side-effects

Every distinct outcome **outside** the HTTP response that the plan
promises. Audit row, email, webhook, queue message, metric, cache
invalidation, downstream call, db row insert/update/delete. Each
qualifies. If a single endpoint promises three side-effects, S=3
for that endpoint, S × 2 = 6 flows (positive + rollback for each).

### I — cross-call invariants

Idempotency replay, idempotency conflict, concurrent equivalence,
result ordering, rate-limit headers, read-your-write across clients.
Each qualifies as one item.

### A — async transitions

Count the terminal states (one `poll` flow each) AND the intermediate
states (one freeze-at flow each). A 4-state machine `<queued> →
<running> → <validating> → <done>` (with `<failed>` from any of the
first three) yields A = 1 (poll to `<done>`) + 3 (freeze at `<queued>`,
`<running>`, `<validating>`) + 1 (poll to `<failed>`) = 5.

### V — validation rules

Each declared per-field rule (minLength, maxLength, regex, enum,
required, format, type, coercion) AND each cross-field rule
(conditional requirement, mutual exclusion, ordering). Boundary
discipline: `minLength=12` is **two** rules (the off-by-one needs
both `length=11 → fail` and `length=12 → succeed`).

### P — pagination surfaces

Each paginated list endpoint. P × 8 = 8 flows per endpoint.

### U — upload/download surfaces

Each upload OR download endpoint. U × 6 = 6 flows per endpoint.
(Range request adds a 7th when applicable.)

### C — concurrency-protected resources

Each ETag-protected OR lock-protected resource. C × 3 = 3 flows per
resource (etag-positive, etag-stale, lock-contention).

### H — hierarchical resources at depth ≥ 3

Each `<grandparent> → <parent> → <child>` (or deeper) chain. H × 3 =
3 flows per chain (leaf-create, wrong-parent, reparent-forbidden).

### X — cross-tenant matrix

Each multi-tenant resource. X × 4 = 4 flows per resource (read, list,
patch, delete from foreign tenant).

### E — explicit error paths

Every error code declared in the plan that isn't already covered by N
(the per-endpoint declared status). If `<endpoint>` declares 400/401/
403/404/409/422/429, those are part of N×5. If the plan additionally
promises a custom 451 ("legal block"), that's E=1 for that endpoint.

## Worked examples

### Example 1 — plain CRUD (low complexity)

> Diff: a `<resources-collection>` endpoint set with single-tenant
> read/write. Three roles. Two business rules. No async. No
> idempotency.

| Variable | Count | Floor contribution |
|---|---|---|
| N (endpoints) | 5 (POST, GET-list, GET-id, PATCH, DELETE) | 25 |
| B (business rules) | 2 | 4 |
| T (transitions) | 0 | 0 |
| S (side-effects) | 1 (audit log) | 2 |
| I | 0 | 0 |
| A | 0 | 0 |
| V (validation rules) | 8 | 8 |
| P | 1 (the list endpoint) | 8 |
| U | 0 | 0 |
| C | 0 | 0 |
| H | 0 | 0 |
| X | 0 (single-tenant) | 0 |
| E | 0 (no custom error codes) | 0 |
| **Floor** | | **47** |

47 flows is the minimum bar. If your file has 30, you missed
~17 flows. Walk the checklist.

### Example 2 — async + idempotent (high complexity)

> Diff: A bulk job processor. POST `<jobs-collection>` enqueues; the
> worker emits webhooks. Idempotency-Key supported. Multi-tenant.
> 3-state machine. 24h TTL on completed jobs.

| Variable | Count | Floor contribution |
|---|---|---|
| N | 3 (POST, GET-status, GET-result) | 15 |
| B | 1 ("only the submitter can cancel") | 2 |
| T | 2 (`<queued>→<running>`, `<running>→<done>`) | 4 |
| S | 2 (audit, webhook) | 4 |
| I | 3 (idempotency replay, idempotency conflict, concurrent equivalence) | 3 |
| A | 4 (poll-`<done>`, poll-`<failed>`, freeze-`<queued>`, freeze-`<running>`) | 4 |
| V | 5 | 5 |
| P | 1 | 8 |
| U | 0 | 0 |
| C | 0 | 0 |
| H | 0 | 0 |
| X | 1 multi-tenant resource | 4 |
| E | 1 (purge-after-24h returns 410, distinct from declared 410-on-expired-token) | 1 |
| **Floor** | | **50** |

50 is again the minimum. If your file has 30, you almost certainly
skipped freeze-at flows AND idempotency-conflict.

### Example 3 — file upload + download (concurrency + hierarchy)

> Diff: An asset-upload service. Three-level hierarchy:
> `<organisation>` → `<project>` → `<asset>`. Multi-tenant. ETag-
> protected. PATCH on `<asset>` requires `If-Match`.

| Variable | Count | Floor contribution |
|---|---|---|
| N | 4 (POST upload, GET, PATCH, DELETE) | 20 |
| B | 1 | 2 |
| T | 0 | 0 |
| S | 1 (cdn cache invalidation) | 2 |
| I | 0 | 0 |
| A | 0 | 0 |
| V | 4 | 4 |
| P | 1 (list assets) | 8 |
| U | 1 upload + 1 download | 12 |
| C | 1 (`<asset>` ETag-protected) | 3 |
| H | 1 (3-level chain) | 3 |
| X | 1 (`<asset>` multi-tenant) | 4 |
| E | 0 | 0 |
| **Floor** | | **58** |

## How to use the result

After computing the floor F, count your `special_flows[]` array.
- If `count >= F`: pass. Run the cross-cutting checklist (17 rows in
  the SKILL body) one more time as final-pass coverage check.
- If `count < F`: fail. Identify which variable's contribution is
  missing. Walk the corresponding topic file. Add flows.

Do not be tempted to inflate the count with redundant flows ("eight
flows asserting the same 200 with eight different field values" is
not eight flows; it's one flow). The floor is a sanity check, not a
target to game.
