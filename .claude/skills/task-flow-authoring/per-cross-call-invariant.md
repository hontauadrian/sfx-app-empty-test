# §11.8 — Per cross-call invariant

> Decision 11.8 + Decision 16: A cross-call invariant is a contract
> that holds **between** requests, not within one. Cover idempotency
> replay/conflict, concurrent equivalence, ordering, rate-limit
> headers, and read-your-write.

## The rule (verbatim from Decision 11.8)

- ☐ **Idempotency replay.** Plan promises "same `<idempotency-header>`
      + same body returns the cached response" → call twice, assert
      `equalsCapture: firstResp.body` AND replay-status header AND
      replayed status.
- ☐ **Idempotency conflict.** Plan promises "same key + different
      body returns 409 (or 422)" → emit it.
- ☐ **Concurrent equivalence.** Plan promises atomicity under
      concurrency ("exactly one `<action>` per concurrent batch") →
      use `parallel: N` with `aggregate.unique.count: 1` plus a
      side-effect quantity assertion. Test with N≥3 and N=2 (the
      smallest race).
- ☐ **Result ordering.** Plan promises a ranking ("`<criterion>`
      outranks `<other-criterion>`," "newest first") → emit a flow
      with two specifically-constructed setup rows and assert
      positional ordering.
- ☐ **Rate-limit headers.** Plan promises rate-limiting → emit a
      `loop: N` flow whose final step asserts `status: 429` AND a
      non-empty `Retry-After`.
- ☐ **Read-your-write across clients.** `<actor>` writes via client A
      and reads via client B (separate cookie jar / token) — both
      observe the same final state.

## Decision 16 — Idempotency declarative form

When a resource declares idempotency at the schema level, the emitter
auto-generates three flows. The lead does not need to author them by
hand.

```json
{
  "resources": {
    "<resource>": {
      "idempotency": {
        "keyHeader": "Idempotency-Key",
        "scope": "route",
        "conflictStatus": 409,
        "replayStatusCode": 200,
        "replayHeader": "Idempotency-Replay"
      }
    }
  }
}
```

`scope` is `"route"`, `"tenant"`, or `"global"`. `replayStatusCode`
defaults to the same status as the first call.

Auto-emitted flows (do NOT hand-author these — flip from
`"source": "generated"` to `"source": "curated"` after review):

- `chain:idempotency:<resource>:replay-same-payload`
- `chain:idempotency:<resource>:replay-different-body`
- `chain:idempotency:<resource>:different-key`

For everything else (operational, ad-hoc inside `special_flows`), use
the patterns below.

## Failure mode if missing

| Missing | Bug that ships |
|---|---|
| Idempotency replay flow | Server caches response per the spec — but cache key omits the idempotency-header value. Same key + same body returns a different id every time. Customer's downstream system thinks it has two orders. |
| Idempotency conflict flow | Same key + different body returns 200 with the cached response. Customer sends a corrected payload, gets the previous (wrong) order back. |
| Concurrent equivalence | Race between two clients submitting "same logical action" creates two rows. Plan promised exactly-one. |
| Ordering | List endpoint returns rows in insertion order despite `sort=<criterion>`. UI shows wrong "top result." |
| Rate-limit headers | Endpoint returns 429 but with no `Retry-After`. Clients back off based on a default and overload the server. |
| Read-your-write | Client A writes, immediately reads via Client B (separate connection / replica), sees stale data. |

## JSON patterns

### Pattern 1 — idempotency replay (operational)

```json
{
  "id": "<task-id>:<endpoint>-replay-same-key",
  "description": "Same Idempotency-Key + same body returns cached response",
  "actor": "<actor>",
  "steps": [
    {
      "request": {
        "method": "POST",
        "path": "<create-path>",
        "headers": { "Idempotency-Key": "${uniqUuid:replay-test}" },
        "body": { "<field>": "<value>" }
      },
      "expect": { "status": 201 },
      "capture": { "bindings": { "firstId": "$.id", "firstBody": "$" } }
    },
    {
      "request": {
        "method": "POST",
        "path": "<create-path>",
        "headers": { "Idempotency-Key": "${uniqUuid:replay-test}" },
        "body": { "<field>": "<value>" }
      },
      "expect": {
        "status": 200,
        "headers": { "Idempotency-Replay": "true" },
        "equalsCapture": "${firstBody}"
      }
    }
  ]
}
```

### Pattern 2 — idempotency conflict (operational)

```json
{
  "id": "<task-id>:<endpoint>-replay-different-body",
  "description": "Same Idempotency-Key + different body returns 409",
  "actor": "<actor>",
  "steps": [
    {
      "request": {
        "method": "POST",
        "path": "<create-path>",
        "headers": { "Idempotency-Key": "${uniqUuid:conflict-test}" },
        "body": { "<field>": "<value-A>" }
      },
      "expect": { "status": 201 }
    },
    {
      "request": {
        "method": "POST",
        "path": "<create-path>",
        "headers": { "Idempotency-Key": "${uniqUuid:conflict-test}" },
        "body": { "<field>": "<value-B>" }
      },
      "expect": { "status": 409 }
    }
  ]
}
```

### Pattern 3 — `assertIdempotent` step (operational sugar)

```json
{
  "id": "<task-id>:<endpoint>-assert-idempotent",
  "description": "<endpoint> is idempotent under same-key + same-body replay",
  "actor": "<actor>",
  "steps": [
    {
      "kind": "assertIdempotent",
      "request": {
        "method": "POST",
        "path": "<create-path>",
        "body": { "<field>": "<value>" }
      },
      "keyHeader": "Idempotency-Key",
      "expectReplayStatus": 200
    }
  ]
}
```

### Pattern 4 — concurrent equivalence (parallel: N)

```json
{
  "id": "<task-id>:<endpoint>-concurrent-equivalence",
  "description": "N parallel requests with same idempotency key produce exactly one row",
  "actor": "<actor>",
  "steps": [
    {
      "kind": "parallel",
      "n": 5,
      "api": {
        "method": "POST",
        "path": "<create-path>",
        "headers": { "Idempotency-Key": "${uniqUuid:race-test}" },
        "body": { "<field>": "<value>" }
      },
      "capture": "responses"
    },
    {
      "expect": {
        "aggregate": "${responses}",
        "unique": { "field": "$.id", "count": 1 },
        "statusCounts": { "201": { "length": 1 }, "200": { "length": 4 } },
        "sideEffects": [
          { "kind": "db-row-inserted", "count": 1, "verifiedBy": "integration-test", "testRef": "<path>" }
        ]
      }
    }
  ]
}
```

Test the smallest race (N=2) AND a higher fan-out (N≥3):

```json
{
  "id": "<task-id>:<endpoint>-concurrent-equivalence-N2",
  "description": "Smallest race (N=2) still preserves exactly-one",
  "actor": "<actor>",
  "steps": [
    {
      "kind": "parallel",
      "n": 2,
      "api": {
        "method": "POST",
        "path": "<create-path>",
        "headers": { "Idempotency-Key": "${uniqUuid:race-N2}" },
        "body": { "<field>": "<value>" }
      },
      "capture": "responses"
    },
    {
      "expect": {
        "aggregate": "${responses}",
        "unique": { "field": "$.id", "count": 1 }
      }
    }
  ]
}
```

### Pattern 5 — result ordering

```json
{
  "id": "<task-id>:<list-endpoint>-orders-newest-first",
  "description": "List returns items newest-first",
  "actor": "<actor>",
  "setup": [
    { "create": "<resource>", "by": "<actor>", "body": { "name": "first",  "createdAt": "-2h" } },
    { "create": "<resource>", "by": "<actor>", "body": { "name": "middle", "createdAt": "-1h" } },
    { "create": "<resource>", "by": "<actor>", "body": { "name": "last",   "createdAt": "-1m" } }
  ],
  "steps": [
    {
      "request": { "method": "GET", "path": "<list-path>" },
      "expect": {
        "status": 200,
        "ordering": [
          { "$.data[0].name": "last" },
          { "$.data[1].name": "middle" },
          { "$.data[2].name": "first" }
        ]
      }
    }
  ]
}
```

### Pattern 6 — rate-limit headers

```json
{
  "id": "<task-id>:<endpoint>-rate-limit-burst",
  "description": "After <N> calls in window, <endpoint> returns 429 with Retry-After",
  "actor": "<actor>",
  "steps": [
    {
      "loop": "<N>",
      "request": { "method": "<verb>", "path": "<path>", "body": {} }
    },
    {
      "request": { "method": "<verb>", "path": "<path>", "body": {} },
      "expect": {
        "status": 429,
        "headers": {
          "Retry-After": { "matches": "^\\d+$" },
          "X-RateLimit-Remaining": "0"
        }
      }
    }
  ]
}
```

### Pattern 7 — read-your-write across clients

```json
{
  "id": "<task-id>:<resource>-read-your-write",
  "description": "Write via client A is observable by client B immediately",
  "actor": "<actor>",
  "setup": [
    {
      "client": "A",
      "create": "<resource>",
      "body": { "<field>": "<value-A>" },
      "capture": { "bindings": { "id": "$.id" } }
    }
  ],
  "steps": [
    {
      "client": "A",
      "request": {
        "method": "PATCH",
        "path": "<patch-path>/${id}",
        "body": { "<field>": "<value-B>" }
      },
      "expect": { "status": 200 }
    },
    {
      "client": "B",
      "request": { "method": "GET", "path": "<get-path>/${id}" },
      "expect": {
        "status": 200,
        "jsonpath": { "$.<field>": "<value-B>" }
      }
    }
  ]
}
```

`client: "A"` and `client: "B"` use independent cookie jars / tokens —
declared via the actor's `clients` block in `_shared.json`.

## Worked example — full §11.8 coverage on an idempotent POST

> Spec: `POST /<orders-collection>` accepts `Idempotency-Key`. Same
> key + same body returns the cached order (200, replay header). Same
> key + different body returns 409. Rate-limited at 100/min/actor.

Floor: 5 flows.

| Flow id | Asserts |
|---|---|
| `<task-id>:<orders-collection>-replay-same-key` | 201 then 200 + same body + replay header |
| `<task-id>:<orders-collection>-replay-different-body` | 201 then 409 |
| `<task-id>:<orders-collection>-different-key` | Two distinct ids, side-effect count = 2 |
| `<task-id>:<orders-collection>-concurrent-equivalence-N2` | parallel 2, exactly one id |
| `<task-id>:<orders-collection>-rate-limit-burst` | 100 OK, 101st 429 + Retry-After |

If the resource declares `idempotency` (Decision 16), the first three
are auto-emitted; lead reviews and flips to `"source": "curated"`.
Lead hand-authors only the last two.
