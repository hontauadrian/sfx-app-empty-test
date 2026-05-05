# §11.4 — Per state transition

> Decision 11.4: For any path `<from-state> → <to-state>`, emit a
> forward flow, a forbidden-from flow, a pre-condition flow, a
> side-effect-of-transition flow (if applicable), and a version-bump
> assertion.

## The rule (verbatim from Decision 11.4)

A "state transition" is any path `<from-state> → <to-state>`.

- ☐ **Forward flow** — `<resource>` in `<from-state>`, perform
      `<action>`, assert `<to-state>`.
- ☐ **Forbidden-from flow** — `<resource>` in another state, perform
      `<action>`, assert conflict.
- ☐ **Pre-condition flow** — if the transition requires another
      condition, construct a one-condition-met case and assert it
      fails.
- ☐ **Side-effect-of-transition** — combine with §11.6 if the
      transition promises an audit / cache / webhook.
- ☐ **Version-bump** — every transition increments
      `version`/`revision`/`updatedAt` (assert via header or body).

## Failure mode if missing

A state machine without a forbidden-from flow ships the bug "any state
can transition to any state." The probe sees `state_X → state_Y`
succeed (because the forward flow tested it) and never tries
`state_Y → state_Y`, so the no-op-or-conflict path is untested.

The version-bump assertion catches a subtle but common bug: the
transition mutates state but forgets to bump the optimistic-concurrency
field, breaking concurrent clients that rely on `If-Match`.

## JSON patterns

### Pattern 1 — forward flow

```json
{
  "id": "<task-id>:<resource>-transitions-X-to-Y",
  "description": "<resource> in state <from-state> transitions to <to-state> on <verb>",
  "actor": "<actor>",
  "setup": [
    { "create": "<resource>", "by": "<actor>", "capture": "$id", "body": { "state": "<from-state>" } }
  ],
  "steps": [
    {
      "request": {
        "method": "<verb>",
        "path": "<transition-path>",
        "body": { "state": "<to-state>" }
      },
      "expect": {
        "status": 200,
        "jsonpath": { "$.state": "<to-state>" }
      }
    }
  ]
}
```

### Pattern 2 — forbidden-from flow

```json
{
  "id": "<task-id>:<resource>-cannot-X-from-Z",
  "description": "<resource> already in <other-state> cannot transition to <to-state>",
  "actor": "<actor>",
  "setup": [
    { "create": "<resource>", "by": "<actor>", "capture": "$id", "body": { "state": "<other-state>" } }
  ],
  "steps": [
    {
      "request": {
        "method": "<verb>",
        "path": "<transition-path>",
        "body": { "state": "<to-state>" }
      },
      "expect": { "status": 409 }
    }
  ]
}
```

### Pattern 3 — pre-condition flow

> Spec: "A `<resource>` can transition to `<published>` only if
> `<draft-validated>` is `true` AND `<owner>` is set."

```json
{
  "id": "<task-id>:<resource>-publish-requires-validation",
  "description": "Transition to <published> fails when <draft-validated> is false",
  "actor": "<actor>",
  "setup": [
    {
      "create": "<resource>",
      "by": "<actor>",
      "capture": "$id",
      "body": {
        "state": "<draft>",
        "draftValidated": false,
        "owner": "${<actor>.id}"
      }
    }
  ],
  "steps": [
    {
      "request": {
        "method": "<verb>",
        "path": "<publish-path>"
      },
      "expect": { "status": 422 }
    }
  ]
}
```

### Pattern 4 — side-effect of transition (combines with §11.6)

```json
{
  "id": "<task-id>:<resource>-transition-emits-audit",
  "description": "Transitioning to <to-state> writes an audit row",
  "actor": "<actor>",
  "setup": [
    { "create": "<resource>", "by": "<actor>", "capture": "$id", "body": { "state": "<from-state>" } }
  ],
  "steps": [
    {
      "request": {
        "method": "<verb>",
        "path": "<transition-path>",
        "body": { "state": "<to-state>" }
      },
      "expect": {
        "status": 200,
        "sideEffects": [
          {
            "kind": "audit-log",
            "count": 1,
            "shape_match": {
              "actor": "${<actor>.id}",
              "action": "<state-X>-to-<state-Y>",
              "subject": "${id}"
            },
            "verifiedBy": "http-probe"
          }
        ]
      }
    }
  ]
}
```

### Pattern 5 — version-bump assertion

```json
{
  "id": "<task-id>:<resource>-transition-bumps-version",
  "description": "Every transition increments <version-field>",
  "actor": "<actor>",
  "setup": [
    { "create": "<resource>", "by": "<actor>", "capture": "$id", "body": { "state": "<from-state>" } }
  ],
  "steps": [
    {
      "request": { "method": "GET", "path": "<get-path>" },
      "capture": { "bindings": { "v0": "$.version" } }
    },
    {
      "request": {
        "method": "<verb>",
        "path": "<transition-path>",
        "body": { "state": "<to-state>" }
      },
      "expect": {
        "status": 200,
        "jsonpath": {
          "$.version": { "matches": "^\\d+$" }
        }
      }
    },
    {
      "request": { "method": "GET", "path": "<get-path>" },
      "expect": {
        "status": 200,
        "jsonpath": {
          "$.version": { "greater_than": "${v0}" }
        }
      }
    }
  ]
}
```

## Worked example — three-state machine

> Spec: A `<resource>` has states `<draft> → <pending> → <published>`,
> with `<published>` reversible to `<archived>` only.
> `<published> → <draft>` is forbidden.

Floor: 6 forward + 3 forbidden + 3 version-bump = 12 flows. The matrix:

| from | to | flow id suffix | expected |
|---|---|---|---|
| `<draft>` | `<pending>` | `draft-to-pending` | 200 |
| `<pending>` | `<published>` | `pending-to-published` | 200 |
| `<published>` | `<archived>` | `published-to-archived` | 200 |
| `<archived>` | `<published>` | `archived-to-published` | 200 (restore) |
| `<draft>` | `<published>` | `draft-cannot-skip-pending` | 409 |
| `<published>` | `<draft>` | `published-cannot-revert-to-draft` | 409 |
| `<archived>` | `<draft>` | `archived-cannot-go-to-draft` | 409 |
| `<pending>` | `<archived>` | `pending-cannot-skip-published` | 409 |
| `<draft>` | `<archived>` | `draft-cannot-skip-publish-cycle` | 409 |

For every forward transition, add a side-effect (§11.6) flow if the
plan promises one (audit log, webhook), and a version-bump assertion.
For every forbidden-from flow, also assert no version bump occurred
(GET version before, transition fails, GET version after — equal).
