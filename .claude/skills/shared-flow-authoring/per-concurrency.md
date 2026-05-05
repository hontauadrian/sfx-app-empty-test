# §11.14 — Per concurrency-protected resource

> Decision 11.14: ETag round-trip + lock contention + concurrent
> replay during processing where idempotency applies.

## The rule (verbatim from Decision 11.14)

- ☐ **ETag round-trip** — capture ETag from GET, replay with
      `If-Match`, assert 200; replay stale → 412.
- ☐ **Lock contention** — `<actor-A>` locks; `<actor-B>` mutates →
      423; A unlocks; B succeeds.
- ☐ **Concurrent-replay-during-processing** where idempotency applies
      (overlap with §11.8).

## Failure mode if missing

Without ETag-stale assertion, an endpoint that ignores `If-Match`
ships silently. Two clients edit the same resource simultaneously;
both PATCHes succeed; the second wins; the first's changes are lost
without any conflict warning. The spec promised optimistic
concurrency; the implementation forgot to enforce it.

Lock contention without an explicit unlock → success flow fails to
catch lock-leak bugs: actor A acquires the lock, never releases it,
the `finally` cleanup is missing. The probe sees 423 forever; the
positive-after-unlock path is the contract proof.

## JSON patterns

### Pattern 1 — ETag happy round-trip

The ETag in the response must differ from the captured one — the
update bumps it. The matcher `not: '${etag}'` enforces that.

```json
{
  "id": "<task-id>:<resource>-etag-happy",
  "description": "PATCH with current ETag succeeds",
  "actor": "<actor>",
  "setup": [
    { "create": "<resource>", "by": "<actor>", "capture": "$id" }
  ],
  "steps": [
    {
      "request": { "method": "GET", "path": "<get-path-with-${id}>" },
      "expect": { "status": 200 },
      "capture": { "headerBindings": { "etag": "ETag" } }
    },
    {
      "request": {
        "method": "PATCH",
        "path": "<patch-path-with-${id}>",
        "headers": { "If-Match": "${etag}" },
        "body": { "<field>": "<new-value>" }
      },
      "expect": {
        "status": 200,
        "headers": {
          "ETag": { "matches": "^(W/)?\".*\"$", "not": "${etag}" }
        }
      }
    }
  ]
}
```

### Pattern 2 — ETag stale (412)

The first PATCH bumps the ETag. The third step retries with the
pre-bump ETag — proving the server detects staleness.

```json
{
  "id": "<task-id>:<resource>-etag-stale",
  "description": "PATCH with stale ETag returns 412",
  "actor": "<actor>",
  "setup": [
    { "create": "<resource>", "by": "<actor>", "capture": "$id" }
  ],
  "steps": [
    {
      "request": { "method": "GET", "path": "<get-path-with-${id}>" },
      "expect": { "status": 200 },
      "capture": { "headerBindings": { "etag1": "ETag" } }
    },
    {
      "request": {
        "method": "PATCH",
        "path": "<patch-path-with-${id}>",
        "headers": { "If-Match": "${etag1}" },
        "body": { "<field>": "<intermediate-value>" }
      },
      "expect": { "status": 200 }
    },
    {
      "request": {
        "method": "PATCH",
        "path": "<patch-path-with-${id}>",
        "headers": { "If-Match": "${etag1}" },
        "body": { "<field>": "<new-value>" }
      },
      "expect": {
        "status": 412,
        "jsonpath": {
          "$.code": { "oneOf": ["PRECONDITION_FAILED", "STALE_ETAG"] }
        }
      }
    }
  ]
}
```

### Pattern 3 — Missing If-Match where required (428)

The `If-Match` header is deliberately omitted — proving the server
enforces precondition-required.

```json
{
  "id": "<task-id>:<resource>-missing-if-match",
  "description": "PATCH without If-Match where required returns 428",
  "actor": "<actor>",
  "setup": [
    { "create": "<resource>", "by": "<actor>", "capture": "$id" }
  ],
  "steps": [
    {
      "request": {
        "method": "PATCH",
        "path": "<patch-path-with-${id}>",
        "body": { "<field>": "<new-value>" }
      },
      "expect": {
        "status": 428,
        "jsonpath": {
          "$.code": { "oneOf": ["PRECONDITION_REQUIRED", "IF_MATCH_REQUIRED"] }
        }
      }
    }
  ]
}
```

### Pattern 4 — lock contention

`client: A` and `client: B` declare two distinct HTTP clients; both
authenticate as the named actor but maintain separate cookie/auth
state.

```json
{
  "id": "<task-id>:<resource>-lock-contention",
  "description": "<actor-B> cannot mutate while <actor-A> holds the lock",
  "actor": "<actor-A>",
  "setup": [
    { "create": "<resource>", "by": "<actor-A>", "capture": "$id" }
  ],
  "steps": [
    {
      "client": "A",
      "request": { "method": "POST", "path": "<lock-path-with-${id}>" },
      "expect": { "status": 200 }
    },
    {
      "client": "B",
      "request": {
        "method": "PATCH",
        "path": "<patch-path-with-${id}>",
        "body": { "<field>": "<value>" }
      },
      "expect": { "status": 423 }
    },
    {
      "client": "A",
      "request": { "method": "POST", "path": "<unlock-path-with-${id}>" },
      "expect": { "status": 200 }
    },
    {
      "client": "B",
      "request": {
        "method": "PATCH",
        "path": "<patch-path-with-${id}>",
        "body": { "<field>": "<value>" }
      },
      "expect": { "status": 200 }
    }
  ]
}
```

### Pattern 5 — concurrent-replay during processing (idempotency overlap)

The first call enqueues; the second arrives while the first is still
processing and must return the same `jobId` — not enqueue a duplicate.

```json
{
  "id": "<task-id>:<async-endpoint>-concurrent-replay-during-processing",
  "description": "Idempotent replay submitted while job is <running> still returns the in-flight job",
  "actor": "<actor>",
  "steps": [
    {
      "request": {
        "method": "POST",
        "path": "<trigger-path>",
        "headers": { "Idempotency-Key": "${uniqUuid:concurrent}" },
        "body": { }
      },
      "expect": { "status": 202 },
      "capture": { "bindings": { "firstId": "$.jobId" } }
    },
    {
      "request": {
        "method": "POST",
        "path": "<trigger-path>",
        "headers": { "Idempotency-Key": "${uniqUuid:concurrent}" },
        "body": { }
      },
      "expect": {
        "status": 202,
        "jsonpath": { "$.jobId": "${firstId}" },
        "sideEffects": [
          { "kind": "queue-message", "count": 0, "verifiedBy": "http-probe" }
        ]
      }
    }
  ]
}
```

The `queue-message: 0` assertion is cumulative-since-previous-step:
the first call already enqueued; the second must NOT enqueue again.

### Pattern 6 — version-bump on successful PATCH

```json
{
  "id": "<task-id>:<resource>-version-bumps-on-update",
  "description": "Each successful PATCH increments version field AND ETag",
  "actor": "<actor>",
  "setup": [
    { "create": "<resource>", "by": "<actor>", "capture": "$id" }
  ],
  "steps": [
    {
      "request": { "method": "GET", "path": "<get-path-with-${id}>" },
      "expect": { "status": 200, "jsonpath": { "$.version": 1 } },
      "capture": { "headerBindings": { "etag1": "ETag" } }
    },
    {
      "request": {
        "method": "PATCH",
        "path": "<patch-path-with-${id}>",
        "headers": { "If-Match": "${etag1}" },
        "body": { "<field>": "<value>" }
      },
      "expect": {
        "status": 200,
        "jsonpath": { "$.version": 2 }
      },
      "capture": { "headerBindings": { "etag2": "ETag" } }
    },
    {
      "request": {
        "method": "PATCH",
        "path": "<patch-path-with-${id}>",
        "headers": { "If-Match": "${etag2}" },
        "body": { "<field>": "<other-value>" }
      },
      "expect": {
        "status": 200,
        "jsonpath": { "$.version": 3 }
      }
    }
  ]
}
```

## Worked example — full §11.14 coverage

> Spec: `<resource>` is ETag-protected. PATCH requires `If-Match`.
> Stale → 412. Missing → 428. Resource has explicit lock endpoints
> (`POST <lock>` / `POST <unlock>`); contended writes return 423.

Floor: 5 flows.

| Flow id | Asserts |
|---|---|
| `<task-id>:<resource>-etag-happy` | 200 + ETag bumped |
| `<task-id>:<resource>-etag-stale` | 412 + STALE_ETAG envelope |
| `<task-id>:<resource>-missing-if-match` | 428 + PRECONDITION_REQUIRED |
| `<task-id>:<resource>-lock-contention` | A locks, B 423, A unlocks, B 200 |
| `<task-id>:<resource>-version-bumps-on-update` | version monotonic, ETag changes |

§11.8 concurrent-equivalence (parallel-N) overlaps; if the spec
includes "exactly one writer succeeds under contention," that flow
also lives here OR in [per-cross-call-invariant.md](per-cross-call-invariant.md)
— pick one location and cross-link.
