# §11.11 — Per bulk surface

> Decision 11.11: Bulk endpoints require all-success / all-or-nothing
> failure / best-effort partial / empty array / oversize coverage.

## The rule (verbatim from Decision 11.11)

- ☐ All-success (N valid items).
- ☐ All-or-nothing failure (one invalid → 400, no items written —
      verified by side-effect quantity = 0).
- ☐ Best-effort partial (one invalid → 207 Multi-Status with per-item
      result).
- ☐ Empty array (rejected with 400 OR accepted as empty result, per
      spec).
- ☐ Oversize (N > max → 413 or 400 with limit-exceeded code).

The spec dictates which of all-or-nothing vs. best-effort applies. If
the spec says "all-or-nothing," do NOT emit a 207 flow (it should
never happen). If it says "best-effort 207," do NOT emit an
all-or-nothing 400 flow.

## Failure mode if missing

The all-or-nothing rollback claim ("if any item fails, none are
written") is the highest-stakes part of bulk endpoints and the most
under-tested. Without the negative side-effect flow (`db-row-inserted:
0`), a bulk endpoint that writes the valid items and rejects the
invalid ones with 400 looks correct from the HTTP surface — but the
DB has partially-written state. Customer's downstream invariants
(unique constraints, parent counts) silently corrupt.

Empty-array handling is the second most-skipped. Without it, a bulk
endpoint with `[]` body either 500s on a null pointer (no flow tested
it) or inserts an empty audit row. Either path is a bug; neither is
caught.

## JSON patterns

### Pattern 1 — all-success

```json
{
  "id": "<task-id>:<bulk-endpoint>-all-success",
  "description": "<N> valid items succeed and persist",
  "actor": "<actor>",
  "steps": [
    {
      "request": {
        "method": "POST",
        "path": "<bulk-path>",
        "body": {
          "items": [
            { "<field>": "<valid-A>" },
            { "<field>": "<valid-B>" },
            { "<field>": "<valid-C>" }
          ]
        }
      },
      "expect": {
        "status": 201,
        "jsonpath": {
          "$.data": { "length": 3 },
          "$.data[*].id": { "type": "string" }
        },
        "sideEffects": [
          { "kind": "db-row-inserted", "count": 3, "verifiedBy": "integration-test", "testRef": "<path>" }
        ]
      }
    }
  ]
}
```

### Pattern 2 — all-or-nothing failure (atomic)

The negative side-effect (`"count": 0`) is mandatory per Decision
11.6. Status 400 alone is insufficient — without the side-effect
assertions, a partially-written batch passes the flow.

```json
{
  "id": "<task-id>:<bulk-endpoint>-all-or-nothing",
  "description": "One invalid item rejects the whole batch; no items written",
  "actor": "<actor>",
  "steps": [
    {
      "request": {
        "method": "POST",
        "path": "<bulk-path>",
        "body": {
          "items": [
            { "<field>": "<valid-A>" },
            { "<field>": "<valid-B>" },
            { "<field>": "<invalid>" },
            { "<field>": "<valid-C>" }
          ]
        }
      },
      "expect": {
        "status": 400,
        "jsonpath": {
          "$.errors[*].index": 2,
          "$.errors[*].field": "<field>"
        },
        "sideEffects": [
          { "kind": "db-row-inserted",  "count": 0, "verifiedBy": "integration-test", "testRef": "<path>" },
          { "kind": "audit-log",        "count": 0, "verifiedBy": "http-probe" },
          { "kind": "outbound-webhook", "count": 0, "verifiedBy": "http-probe" }
        ]
      }
    }
  ]
}
```

### Pattern 3 — best-effort partial (207 Multi-Status)

```json
{
  "id": "<task-id>:<bulk-endpoint>-best-effort-partial",
  "description": "One invalid item returns 207 with per-item result",
  "actor": "<actor>",
  "steps": [
    {
      "request": {
        "method": "POST",
        "path": "<bulk-path>",
        "body": {
          "items": [
            { "<field>": "<valid-A>" },
            { "<field>": "<invalid>" },
            { "<field>": "<valid-C>" }
          ]
        }
      },
      "expect": {
        "status": 207,
        "jsonpath": {
          "$.results[0].status": 201,
          "$.results[0].id": { "type": "string" },
          "$.results[1].status": 400,
          "$.results[1].error.field": "<field>",
          "$.results[2].status": 201,
          "$.results[2].id": { "type": "string" }
        },
        "sideEffects": [
          { "kind": "db-row-inserted", "count": 2, "verifiedBy": "integration-test", "testRef": "<path>" }
        ]
      }
    }
  ]
}
```

Only the two valid items persist; the failing item leaves no row.

### Pattern 4 — empty array (spec-dependent outcome)

Pick 400 OR 200 per the spec — do not emit both.

```json
{
  "id": "<task-id>:<bulk-endpoint>-empty-array",
  "description": "Empty items array returns 400 (or 200 empty per spec)",
  "actor": "<actor>",
  "steps": [
    {
      "request": {
        "method": "POST",
        "path": "<bulk-path>",
        "body": { "items": [] }
      },
      "expect": {
        "status": 400,
        "jsonpath": {
          "$.code": { "oneOf": ["EMPTY_BATCH", "BAD_REQUEST"] }
        },
        "sideEffects": [
          { "kind": "db-row-inserted", "count": 0, "verifiedBy": "integration-test", "testRef": "<path>" }
        ]
      }
    }
  ]
}
```

### Pattern 5 — oversize (N > max)

`body_builder` is the P1-6 sugar that expands to `n` repetitions of
`item`, wrapped in the named array.

```json
{
  "id": "<task-id>:<bulk-endpoint>-oversize",
  "description": "Batch exceeding <max> items returns 413 (or 400 with limit-exceeded)",
  "actor": "<actor>",
  "steps": [
    {
      "request": {
        "method": "POST",
        "path": "<bulk-path>",
        "body_builder": {
          "kind": "repeat",
          "n": "<max-plus-1>",
          "item": { "<field>": "<valid-value>" },
          "wrap": "items"
        }
      },
      "expect": {
        "status": 413,
        "jsonpath": {
          "$.code": { "oneOf": ["PAYLOAD_TOO_LARGE", "LIMIT_EXCEEDED"] }
        },
        "sideEffects": [
          { "kind": "db-row-inserted", "count": 0, "verifiedBy": "integration-test", "testRef": "<path>" }
        ]
      }
    }
  ]
}
```

### Pattern 6 — boundary (exactly N = max)

```json
{
  "id": "<task-id>:<bulk-endpoint>-at-limit",
  "description": "Batch exactly at <max> items succeeds",
  "actor": "<actor>",
  "steps": [
    {
      "request": {
        "method": "POST",
        "path": "<bulk-path>",
        "body_builder": {
          "kind": "repeat",
          "n": "<max>",
          "item": { "<field>": "<valid-value>" },
          "wrap": "items"
        }
      },
      "expect": {
        "status": 201,
        "jsonpath": {
          "$.data": { "length": "<max>" }
        }
      }
    }
  ]
}
```

### Pattern 7 — duplicate-within-batch (unique-constraint check)

If the spec promises unique-constraint detection within a single bulk
call:

```json
{
  "id": "<task-id>:<bulk-endpoint>-duplicate-within-batch",
  "description": "Duplicate items within a single batch return 400 with index",
  "actor": "<actor>",
  "steps": [
    {
      "request": {
        "method": "POST",
        "path": "<bulk-path>",
        "body": {
          "items": [
            { "<unique-field>": "<X>" },
            { "<unique-field>": "<Y>" },
            { "<unique-field>": "<X>" }
          ]
        }
      },
      "expect": {
        "status": 400,
        "jsonpath": {
          "$.errors[*].code": "DUPLICATE_WITHIN_BATCH",
          "$.errors[*].indices": [0, 2]
        },
        "sideEffects": [
          { "kind": "db-row-inserted", "count": 0, "verifiedBy": "integration-test", "testRef": "<path>" }
        ]
      }
    }
  ]
}
```

The third item is the duplicate of index 0 — flagged at indices `[0, 2]`.

## Worked example — full §11.11 coverage

> Spec: `POST /<bulk-path>` accepts up to 100 items in `items[]`.
> All-or-nothing semantics. Empty array rejected with 400.

Floor: 5 flows.

| Flow id | Body | Expected |
|---|---|---|
| `<task-id>:<bulk-endpoint>-all-success` | 3 valid items | 201 + db rows: 3 |
| `<task-id>:<bulk-endpoint>-all-or-nothing` | 3 valid + 1 invalid | 400 + db rows: 0 |
| `<task-id>:<bulk-endpoint>-empty-array` | `[]` | 400 |
| `<task-id>:<bulk-endpoint>-at-limit` | 100 valid items | 201 + db rows: 100 |
| `<task-id>:<bulk-endpoint>-oversize` | 101 valid items | 413 + db rows: 0 |

Do NOT emit a 207 flow on this endpoint — the spec is all-or-nothing.

If the spec were 207 best-effort, drop the `all-or-nothing` row,
replace with `best-effort-partial`, and adjust the `db-row-inserted`
counts to match the partial-success expectation.
