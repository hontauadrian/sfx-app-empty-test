# §11.13 — Per time-sensitive feature

> Decision 11.13: Expiration boundary, scheduled action, TTL
> declarative, rate-limit window, cache freshness.

## The rule (verbatim from Decision 11.13)

- ☐ **Expiration boundary** — token / invite / session at
      `expires_at - 1` vs. `expires_at + 1`, asserting the transition.
- ☐ **Scheduled action** — scheduled-future state vs. post-time
      triggered.
- ☐ **TTL declarative** (Decision 17 P1-4) — auto-emits create → wait
      (advanceMs) → assert expired.
- ☐ **Rate-limit window**.
- ☐ **Cache freshness** — `Cache-Control: max-age=N` or
      `If-Modified-Since` → 304.

## Decision 17 P1-4 — TTL declarative

```json
{
  "resources": {
    "<expiring-resource>": {
      "ttl": {
        "durationMs": "<int>",
        "expiredStatus": 410
      }
    }
  }
}
```

`expiredStatus` may be 410, 401, or 404 per the spec. When set, the
emitter auto-generates:

- `chain:ttl:<expiring-resource>:pre-expiry-happy`
- `chain:ttl:<expiring-resource>:post-expiry-rejected`
- `chain:ttl:<expiring-resource>:boundary-at-expiry-minus-1ms`

After review, leads flip `"source": "generated"` to `"source": "curated"`.

## Failure mode if missing

The boundary-adjacent test catches off-by-one errors in expiry checks
(`expires_at < now` vs. `expires_at <= now`). Without it, a token
that expires at exactly the second `now == expires_at` may be either
accepted or rejected — both look correct in isolation, but only one
matches the spec.

Cache-freshness coverage matters because reverse proxies and CDN
caches honour `Cache-Control` faithfully — a wrong `max-age` ships as
"works in dev, breaks in prod" because dev has no proxy.

## JSON patterns

### Pattern 1 — expiration boundary (pre / post)

```json
{
  "id": "<task-id>:<expiring-resource>-pre-expiry-happy",
  "description": "<resource> at expires_at - 1 still works",
  "actor": "<actor>",
  "setup": [
    { "create": "<expiring-resource>", "by": "<actor>", "capture": "$id", "completedAt": "-(<ttl> - 1s)" }
  ],
  "steps": [
    {
      "request": { "method": "GET", "path": "<get-path-with-${id}>" },
      "expect": { "status": 200 }
    }
  ]
}
```

```json
{
  "id": "<task-id>:<expiring-resource>-post-expiry-rejected",
  "description": "<resource> at expires_at + 1 returns 410",
  "actor": "<actor>",
  "setup": [
    { "create": "<expiring-resource>", "by": "<actor>", "capture": "$id", "completedAt": "-(<ttl> + 1s)" }
  ],
  "steps": [
    {
      "request": { "method": "GET", "path": "<get-path-with-${id}>" },
      "expect": { "status": 410 }
    }
  ]
}
```

Status 401 / 404 are equivalent options — pick the one the spec
specifies and stay consistent.

### Pattern 2 — boundary-at-expiry (clock advance mid-flow)

```json
{
  "id": "<task-id>:<expiring-resource>-boundary-mid-flow",
  "description": "<resource> alive before clock advance, expired after",
  "actor": "<actor>",
  "isolated_clock": true,
  "setup": [
    { "create": "<expiring-resource>", "by": "<actor>", "capture": "$id" }
  ],
  "steps": [
    {
      "request": { "method": "GET", "path": "<get-path-with-${id}>" },
      "expect": { "status": 200 }
    },
    { "wait": { "advanceMs": "<ttl> + 1000" } },
    {
      "request": { "method": "GET", "path": "<get-path-with-${id}>" },
      "expect": { "status": 410 }
    }
  ]
}
```

### Pattern 3 — scheduled action (future state vs. post-trigger)

```json
{
  "id": "<task-id>:<scheduled-resource>-pending-before-time",
  "description": "Scheduled action is <pending> before scheduled time",
  "actor": "<actor>",
  "setup": [
    { "create": "<scheduled-resource>", "by": "<actor>", "capture": "$id", "body": { "runAt": "+1h" } }
  ],
  "steps": [
    {
      "request": { "method": "GET", "path": "<get-path-with-${id}>" },
      "expect": {
        "status": 200,
        "jsonpath": { "$.state": "<pending>" }
      }
    }
  ]
}
```

```json
{
  "id": "<task-id>:<scheduled-resource>-fires-after-time",
  "description": "Scheduled action transitions to <done> after scheduled time",
  "actor": "<actor>",
  "isolated_clock": true,
  "setup": [
    { "create": "<scheduled-resource>", "by": "<actor>", "capture": "$id", "body": { "runAt": "+1s" } }
  ],
  "steps": [
    { "wait": { "advanceMs": 1500 } },
    {
      "poll": {
        "request": { "method": "GET", "path": "<get-path-with-${id}>" },
        "whileBody": { "$.state": "<pending>" },
        "intervalMs": 250,
        "timeoutMs": 5000
      },
      "finalExpect": {
        "jsonpath": { "$.state": "<done>" }
      }
    }
  ]
}
```

### Pattern 4 — rate-limit window (advance past window resets quota)

```json
{
  "id": "<task-id>:<endpoint>-rate-limit-window-resets",
  "description": "After rate-limit window, quota resets",
  "actor": "<actor>",
  "isolated_clock": true,
  "steps": [
    {
      "loop": "<quota>",
      "request": { "method": "<verb>", "path": "<path>", "body": { } }
    },
    {
      "request": { "method": "<verb>", "path": "<path>", "body": { } },
      "expect": { "status": 429 }
    },
    { "wait": { "advanceMs": "<window-ms> + 1000" } },
    {
      "request": { "method": "<verb>", "path": "<path>", "body": { } },
      "expect": { "status": "<success>" }
    }
  ]
}
```

### Pattern 5 — Cache-Control max-age

```json
{
  "id": "<task-id>:<read-endpoint>-cache-control",
  "description": "Read endpoint declares Cache-Control: max-age=<N>",
  "actor": "<actor>",
  "setup": [
    { "create": "<resource>", "by": "<actor>", "capture": "$id" }
  ],
  "steps": [
    {
      "request": { "method": "GET", "path": "<get-path-with-${id}>" },
      "expect": {
        "status": 200,
        "headers": {
          "Cache-Control": { "matches": "max-age=<N>" },
          "ETag": { "matches": "^(W/)?\".*\"$" }
        }
      }
    }
  ]
}
```

### Pattern 6 — If-Modified-Since → 304

```json
{
  "id": "<task-id>:<read-endpoint>-if-modified-since-304",
  "description": "If-Modified-Since with current Last-Modified returns 304",
  "actor": "<actor>",
  "setup": [
    { "create": "<resource>", "by": "<actor>", "capture": "$id" }
  ],
  "steps": [
    {
      "request": { "method": "GET", "path": "<get-path-with-${id}>" },
      "expect": { "status": 200 },
      "capture": { "headerBindings": { "lastMod": "Last-Modified" } }
    },
    {
      "request": {
        "method": "GET",
        "path": "<get-path-with-${id}>",
        "headers": { "If-Modified-Since": "${lastMod}" }
      },
      "expect": { "status": 304 }
    }
  ]
}
```

### Pattern 7 — If-None-Match → 304

```json
{
  "id": "<task-id>:<read-endpoint>-if-none-match-304",
  "description": "If-None-Match with current ETag returns 304",
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
        "method": "GET",
        "path": "<get-path-with-${id}>",
        "headers": { "If-None-Match": "${etag}" }
      },
      "expect": { "status": 304 }
    }
  ]
}
```

## Worked example — invite token

> Spec: An invite token is valid for 24h. After expiry, redemption
> returns 410. After redemption, re-redemption also returns 410.

Floor: 4 flows.

| Flow id | Asserts |
|---|---|
| `<task-id>:<invite-resource>-pre-expiry-happy` | created 23h59m ago, redeem succeeds |
| `<task-id>:<invite-resource>-post-expiry-rejected` | created 24h1m ago, redeem 410 |
| `<task-id>:<invite-resource>-boundary-mid-flow` | redeem succeeds, advance 24h, second use 410 (uses `isolated_clock`) |
| `<task-id>:<invite-resource>-redeemed-then-rejected` | redeem succeeds at t=0, retry at t=0 returns 410 (consumed, not expired) |

The last row is a §11.5 (declared error path) crossover — invite
tokens have two reasons to return 410 (consumed AND expired), and the
spec promises the error envelope distinguishes them.
