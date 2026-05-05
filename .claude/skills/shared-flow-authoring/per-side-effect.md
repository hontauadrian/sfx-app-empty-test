# §11.6 — Per side-effect promised by the plan

> Decision 11.6 + Decision 14: A side-effect is any observable outcome
> outside the HTTP response — a row in a table the API never returns,
> an outbound webhook, a queued worker job, an email send, a metric
> increment, a cache invalidation. Emit positive AND negative.

## The rule (verbatim from Decision 11.6)

- ☐ **Positive side-effect.** Plan promises "creating `<resource>`
      writes audit log row" or "succeeding sends webhook to `<url>`" →
      emit a flow with a `sideEffects` block describing target and
      quantity.
- ☐ **Negative side-effect** (rollback / anti-enumeration / no-leak).
      Plan promises "if this fails, NOTHING is written" or "an unknown
      `<actor>` produces no observable difference" → emit a flow with
      the same block declaring zero quantity. Mandatory for: bulk
      operations claiming atomicity, anti-enumeration endpoints, every
      error path the plan describes as "no partial state."

## Side-effect vocabulary (Decision 14)

The schema accepts these `kind` values on `expect.sideEffects[]` and
flow-level `sideEffects[]`:

| Kind | Means | Verified by (typical) |
|---|---|---|
| `audit-log` | A row in an audit log table referencing `<actor>` + `<action>` + `<subject>`. | `http-probe` (test endpoint that lists audit rows) OR `integration-test`. |
| `email` | An email queued or sent to `<target>`. | `http-probe` (test mailbox endpoint) OR `integration-test`. |
| `event-bus` | An event published to an internal bus with a declared shape. | `http-probe` (test event log) OR `integration-test`. |
| `outbound-webhook` | A webhook fired to an external `<url-prefix>`. | `http-probe` (test webhook receiver) OR `integration-test`. |
| `queue-message` | A message enqueued on a named worker queue. | `http-probe` (test queue inspector) OR `integration-test`. |
| `cache-invalidation` | A cache key invalidated; subsequent reads observe the new value. | `http-probe` (follow-up GET asserts updated body). |
| `metric-increment` | A named metric counter incremented. | `http-probe` (test metrics endpoint) OR `integration-test`. |
| `db-row-inserted` | A row written to a named table the API never returns directly. | `integration-test` (HTTP probe cannot reach DB by design). |
| `db-row-updated` | A row updated. | `integration-test`. |
| `db-row-deleted` | A row deleted. | `integration-test`. |
| `downstream-call` | A call made to a named downstream service. | `http-probe` (test downstream stub) OR `integration-test`. |
| `other` | Documented free-form. | `manual`. |

`verifiedBy` accepts `http-probe`, `integration-test`, or `manual`.
Test endpoints (mailbox, webhook log, queue inspector, etc.) are
declared once in `_shared.test_endpoints` so leads do not hard-code
paths.

## Failure mode if missing

The probe is HTTP-only by default. Without explicit side-effect
declarations:

- **Audit log silently disappears.** Endpoint behaviour looks correct
  (200 OK). Compliance audit later discovers no audit rows. Liability.
- **Email never sends.** API returns 202; the queue write never
  happened. Customer doesn't get the welcome email. Probe was green.
- **Webhook fires twice on retry.** Plan promised exactly-once;
  positive flow covers "webhook fires once on success" but no negative
  flow asserts "no duplicate on idempotent retry." Customer's
  downstream system processes the same event twice.
- **Bulk endpoint reports "all-or-nothing" but writes some rows on
  partial failure.** Without `count: 0` on the failure path, this
  ships.

## JSON patterns

### Pattern 1 — positive side-effect (audit log)

```json
{
  "id": "<task-id>:<endpoint>-emits-audit",
  "description": "<action> on <resource> writes one audit row",
  "actor": "<actor>",
  "steps": [
    {
      "request": { "method": "<verb>", "path": "<path>", "body": {} },
      "expect": {
        "status": 200,
        "sideEffects": [
          {
            "kind": "audit-log",
            "count": 1,
            "shape_match": {
              "actor": "${<actor>.id}",
              "action": "<action>",
              "subject": "${<resource>.id}"
            },
            "verifiedBy": "http-probe"
          }
        ]
      }
    }
  ]
}
```

### Pattern 2 — positive side-effect (outbound webhook)

```json
{
  "id": "<task-id>:<endpoint>-fires-webhook",
  "description": "Successful <action> fires a webhook to <url-prefix>",
  "actor": "<actor>",
  "steps": [
    {
      "request": { "method": "<verb>", "path": "<path>", "body": {} },
      "expect": {
        "status": 201,
        "sideEffects": [
          {
            "kind": "outbound-webhook",
            "count": 1,
            "shape_match": {
              "url": { "matches": "^<url-prefix>" },
              "event": "<event-name>",
              "payload": { "resourceId": "${<resource>.id}" }
            },
            "verifiedBy": "http-probe"
          }
        ]
      }
    }
  ]
}
```

### Pattern 3 — positive side-effect (email queued)

```json
{
  "id": "<task-id>:<endpoint>-sends-email",
  "description": "<action> queues a welcome email to <target>",
  "actor": "<actor>",
  "steps": [
    {
      "request": { "method": "<verb>", "path": "<path>", "body": { "email": "<target>" } },
      "expect": {
        "status": 201,
        "sideEffects": [
          {
            "kind": "email",
            "count": 1,
            "shape_match": {
              "to": "<target>",
              "template": "<template-name>"
            },
            "verifiedBy": "http-probe"
          }
        ]
      }
    }
  ]
}
```

### Pattern 4 — negative side-effect (rollback on failure)

```json
{
  "id": "<task-id>:<endpoint>-rollback-on-failure",
  "description": "Failed <action> writes nothing — no audit, no email, no webhook",
  "actor": "<actor>",
  "setup": [
    { "_note": "preconditions that force the action to fail" }
  ],
  "steps": [
    {
      "request": { "method": "<verb>", "path": "<path>", "body": {} },
      "expect": {
        "status": "<expected-failure>",
        "sideEffects": [
          { "kind": "audit-log",        "count": 0, "verifiedBy": "http-probe" },
          { "kind": "email",            "count": 0, "verifiedBy": "http-probe" },
          { "kind": "outbound-webhook", "count": 0, "verifiedBy": "http-probe" },
          { "kind": "db-row-inserted",  "count": 0, "verifiedBy": "integration-test", "testRef": "<path-to-test>" }
        ]
      }
    }
  ]
}
```

### Pattern 5 — anti-enumeration (no observable difference)

> Spec: "An unknown email on `POST /<password-reset-collection>`
> returns 200 (same as a real email) and writes nothing observable."

```json
{
  "id": "<task-id>:<password-reset-collection>-unknown-email-no-leak",
  "description": "Unknown email returns 200 and writes no email / audit / queue message",
  "actor": "anonymous",
  "steps": [
    {
      "request": {
        "method": "POST",
        "path": "/<password-reset-collection>",
        "body": { "email": "<unknown-email>" }
      },
      "expect": {
        "status": 200,
        "jsonpath": { "$": { "matches": "^\\{\\}" } },
        "sideEffects": [
          { "kind": "email",         "count": 0, "verifiedBy": "http-probe" },
          { "kind": "audit-log",     "count": 0, "verifiedBy": "http-probe" },
          { "kind": "queue-message", "count": 0, "verifiedBy": "http-probe" }
        ]
      }
    }
  ]
}
```

### Pattern 6 — bulk atomicity (all-or-nothing)

```json
{
  "id": "<task-id>:<bulk-endpoint>-rollback-atomic",
  "description": "One invalid item rolls back the whole batch",
  "actor": "<actor>",
  "steps": [
    {
      "request": {
        "method": "POST",
        "path": "<bulk-path>",
        "body": {
          "items": [
            { "_valid": true },
            { "_valid": true },
            { "_invalid": true },
            { "_valid": true }
          ]
        }
      },
      "expect": {
        "status": 400,
        "sideEffects": [
          { "kind": "db-row-inserted", "count": 0, "verifiedBy": "integration-test", "testRef": "<path>" },
          { "kind": "audit-log",       "count": 0, "verifiedBy": "http-probe" }
        ]
      }
    }
  ]
}
```

### Pattern 7 — cache invalidation

```json
{
  "id": "<task-id>:<endpoint>-invalidates-cache",
  "description": "Mutating <resource> invalidates its read cache",
  "actor": "<actor>",
  "setup": [
    { "create": "<resource>", "by": "<actor>", "capture": "$id" },
    { "request": { "method": "GET", "path": "<get-path>" } }
  ],
  "steps": [
    {
      "request": { "method": "PATCH", "path": "<patch-path>", "body": { "<field>": "<new-value>" } },
      "expect": {
        "status": 200,
        "sideEffects": [
          {
            "kind": "cache-invalidation",
            "count": 1,
            "shape_match": { "key": "<resource-cache-key-pattern>" },
            "verifiedBy": "http-probe"
          }
        ]
      }
    },
    {
      "request": { "method": "GET", "path": "<get-path>" },
      "expect": {
        "jsonpath": { "$.<field>": "<new-value>" }
      }
    }
  ]
}
```

### Pattern 8 — exactly-once on idempotent replay

```json
{
  "id": "<task-id>:<endpoint>-no-double-side-effect",
  "description": "Idempotent replay does not duplicate side-effects",
  "actor": "<actor>",
  "steps": [
    {
      "request": {
        "method": "POST",
        "path": "<create-path>",
        "headers": { "Idempotency-Key": "${uniqUuid:once}" },
        "body": {}
      },
      "expect": {
        "status": 201,
        "sideEffects": [
          { "kind": "outbound-webhook", "count": 1, "verifiedBy": "http-probe" }
        ]
      }
    },
    {
      "request": {
        "method": "POST",
        "path": "<create-path>",
        "headers": { "Idempotency-Key": "${uniqUuid:once}" },
        "body": {}
      },
      "expect": {
        "status": 200,
        "sideEffects": [
          { "kind": "outbound-webhook", "count": 0, "verifiedBy": "http-probe" }
        ]
      }
    }
  ]
}
```

The cumulative webhook count after both calls is 1, not 2.

## Worked example — full coverage on a single endpoint

> Spec: `POST /<orders-collection>` succeeds → writes audit row, fires
> `order.created` webhook, sends confirmation email. Failure → none of
> these side-effects occur.

Floor: 4 flows.

| Flow id | Status | Side-effects asserted |
|---|---|---|
| `<task-id>:<orders-collection>-create-side-effects-positive` | 201 | `audit-log: 1`, `outbound-webhook: 1`, `email: 1` |
| `<task-id>:<orders-collection>-create-rollback-on-validation` | 400 | `audit-log: 0`, `outbound-webhook: 0`, `email: 0`, `db-row-inserted: 0` |
| `<task-id>:<orders-collection>-create-rollback-on-payment-fail` | 402 | `audit-log: 0`, `outbound-webhook: 0`, `email: 0` |
| `<task-id>:<orders-collection>-create-no-double-on-replay` | 200 (replay) | webhook cumulative: 1, email cumulative: 1 |

Without all four, the probe cannot tell the difference between "fully
implemented and tested" and "partially shipped." See
[per-cross-call-invariant.md](per-cross-call-invariant.md) for the
replay invariant patterns.
