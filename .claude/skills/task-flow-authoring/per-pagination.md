# §11.10 — Per pagination surface

> Decision 11.10: Every paginated endpoint requires the eight sub-flow
> set: empty / single / first / last / out-of-range / invalid-cursor /
> cursor-stable-on-insert / filter-sort-paginate combo.

## The rule (verbatim from Decision 11.10)

- ☐ Empty list (no items).
- ☐ Single page (items < pageSize).
- ☐ Multi-page first (page 1 of K).
- ☐ Multi-page last (page K of K).
- ☐ Out-of-range (page beyond last → 200 + empty OR 404 per spec).
- ☐ Invalid cursor → 400.
- ☐ Cursor-stable on insert (insert during pagination does not shift
      already-seen items).
- ☐ Combo: filter + sort + paginate.

## Decision 17 P1-3 — declarative pagination

When the resource declares pagination at the schema level, the emitter
auto-generates the eight sub-flow set:

```json
{
  "resources": {
    "<resource>": {
      "pagination": {
        "shape": "cursor",
        "pageParam": "cursor",
        "limitParam": "limit",
        "defaultLimit": 20,
        "maxLimit": 100,
        "emptyResultAllowed": true
      }
    }
  }
}
```

`shape` is `"cursor"` or `"offset"`. `emptyResultAllowed: true` means
out-of-range returns 200 + empty body; `false` means 404.

After emitter runs, leads review and flip `"source": "generated"` to
`"source": "curated"`. Custom edge-cases (filter+sort+paginate combo)
remain hand-authored.

## Failure mode if missing

The most-shipped pagination bug is **cursor instability on insert**:

- Page 1 returns rows `[1, 2, 3, 4, 5]` with `nextCursor: "5"`.
- A new row is inserted (id=2.5).
- Page 2 with cursor=5 returns `[2.5, 6, 7, 8, 9]` — row 2.5 is shown
  twice (once in page 1's window-shift, once in page 2's window).
- Without the `cursor-stable-on-insert` flow, this never surfaces.

Out-of-range and invalid-cursor are also commonly skipped, leaving 500
errors (instead of declared 200 empty / 400) untested.

## JSON patterns

### Pattern 1 — empty list

```json
{
  "id": "<task-id>:<list-endpoint>-empty",
  "description": "List with no items returns empty array + null cursor",
  "actor": "<actor>",
  "steps": [
    {
      "request": { "method": "GET", "path": "<list-path>" },
      "expect": {
        "status": 200,
        "bodyShape": { "arrayLength": 0 },
        "jsonpath": {
          "$.data": { "length": 0 },
          "$.nextCursor": { "absent": true }
        }
      }
    }
  ]
}
```

### Pattern 2 — single page

```json
{
  "id": "<task-id>:<list-endpoint>-single-page",
  "description": "List with fewer items than pageSize returns one page + null cursor",
  "actor": "<actor>",
  "setup": [
    { "loop": "<pageSize-minus-1>", "create": "<resource>", "by": "<actor>" }
  ],
  "steps": [
    {
      "request": { "method": "GET", "path": "<list-path>" },
      "expect": {
        "status": 200,
        "bodyShape": { "arrayLength": "<pageSize-minus-1>" },
        "jsonpath": { "$.nextCursor": { "absent": true } }
      }
    }
  ]
}
```

### Pattern 3 — multi-page first (with non-null cursor)

```json
{
  "id": "<task-id>:<list-endpoint>-multi-page-first",
  "description": "First page of multi-page result has populated nextCursor",
  "actor": "<actor>",
  "setup": [
    { "loop": "<pageSize-times-2>", "create": "<resource>", "by": "<actor>" }
  ],
  "steps": [
    {
      "request": { "method": "GET", "path": "<list-path>?limit=<pageSize>" },
      "expect": {
        "status": 200,
        "bodyShape": { "arrayLength": "<pageSize>" },
        "jsonpath": {
          "$.nextCursor": { "type": "string", "length_gte": 1 }
        }
      }
    }
  ]
}
```

### Pattern 4 — multi-page last (cursor terminates)

```json
{
  "id": "<task-id>:<list-endpoint>-multi-page-last",
  "description": "Last page of multi-page result returns null cursor",
  "actor": "<actor>",
  "setup": [
    { "loop": "<pageSize-times-2>", "create": "<resource>", "by": "<actor>" }
  ],
  "steps": [
    {
      "request": { "method": "GET", "path": "<list-path>?limit=<pageSize>" },
      "expect": { "status": 200 },
      "capture": { "bindings": { "c1": "$.nextCursor" } }
    },
    {
      "request": { "method": "GET", "path": "<list-path>?limit=<pageSize>&cursor=${c1}" },
      "expect": {
        "status": 200,
        "bodyShape": { "arrayLength": "<pageSize>" },
        "jsonpath": { "$.nextCursor": { "absent": true } }
      }
    }
  ]
}
```

### Pattern 5 — out-of-range

```json
{
  "id": "<task-id>:<list-endpoint>-out-of-range",
  "description": "Page beyond last returns 200 empty (or 404 per spec)",
  "actor": "<actor>",
  "steps": [
    {
      "request": { "method": "GET", "path": "<list-path>?cursor=<fake-tail-cursor>" },
      "expect": {
        "status": 200,
        "bodyShape": { "arrayLength": 0 }
      }
    }
  ]
}
```

### Pattern 6 — invalid cursor

```json
{
  "id": "<task-id>:<list-endpoint>-invalid-cursor",
  "description": "Malformed cursor returns 400",
  "actor": "<actor>",
  "steps": [
    {
      "request": { "method": "GET", "path": "<list-path>?cursor=<garbage>" },
      "expect": {
        "status": 400,
        "jsonpath": {
          "$.code": { "oneOf": ["INVALID_CURSOR", "BAD_REQUEST"] }
        }
      }
    }
  ]
}
```

### Pattern 7 — cursor-stable on insert

```json
{
  "id": "<task-id>:<list-endpoint>-cursor-stable-on-insert",
  "description": "Insert mid-pagination does not shift already-seen items",
  "actor": "<actor>",
  "setup": [
    { "loop": "<pageSize-times-2>", "create": "<resource>", "by": "<actor>" }
  ],
  "steps": [
    {
      "request": { "method": "GET", "path": "<list-path>?limit=<pageSize>" },
      "expect": { "status": 200 },
      "capture": {
        "bindings": {
          "page1Ids": "$.data[*].id",
          "c1": "$.nextCursor"
        }
      }
    },
    {
      "request": { "method": "POST", "path": "<create-path>", "body": {} }
    },
    {
      "request": { "method": "GET", "path": "<list-path>?limit=<pageSize>&cursor=${c1}" },
      "expect": {
        "status": 200,
        "jsonpath": {
          "$.data[*].id": { "excludes": "${page1Ids}" }
        }
      }
    }
  ]
}
```

### Pattern 8 — filter + sort + paginate combo

```json
{
  "id": "<task-id>:<list-endpoint>-filter-sort-paginate",
  "description": "Filter + sort + paginate compose correctly",
  "actor": "<actor>",
  "setup": [
    { "create": "<resource>", "body": { "type": "A", "name": "zebra",  "createdAt": "-3h" } },
    { "create": "<resource>", "body": { "type": "A", "name": "apple",  "createdAt": "-2h" } },
    { "create": "<resource>", "body": { "type": "B", "name": "banana", "createdAt": "-1h" } },
    { "create": "<resource>", "body": { "type": "A", "name": "mango",  "createdAt": "-30m" } }
  ],
  "steps": [
    {
      "request": { "method": "GET", "path": "<list-path>?type=A&sort=name&limit=2" },
      "expect": {
        "status": 200,
        "bodyShape": { "arrayLength": 2 },
        "ordering": [
          { "$.data[0].name": "apple" },
          { "$.data[1].name": "mango" }
        ],
        "jsonpath": {
          "$.data[*].type": { "matches": "^A$" },
          "$.nextCursor": { "type": "string", "length_gte": 1 }
        }
      }
    }
  ]
}
```

## Worked example — full §11.10 coverage on a list endpoint

> Spec: `GET /<list-collection>` returns paginated cursor-based list.
> Default limit 20, max 100. `?cursor=<opaque>` for pagination.
> `?type=<A|B>` for filter. `?sort=<name|createdAt>` for sort.

Floor: 8 flows (matches §11.10's eight sub-rows exactly).

| Flow id | Asserts |
|---|---|
| `<task-id>:<list-collection>-empty` | 0 items, no cursor |
| `<task-id>:<list-collection>-single-page` | 19 items in 1 page, no cursor |
| `<task-id>:<list-collection>-multi-page-first` | 21 items → page 1 with cursor |
| `<task-id>:<list-collection>-multi-page-last` | follow cursor to terminator |
| `<task-id>:<list-collection>-out-of-range` | fabricated tail cursor → empty |
| `<task-id>:<list-collection>-invalid-cursor` | garbage cursor → 400 |
| `<task-id>:<list-collection>-cursor-stable-on-insert` | insert during pagination doesn't reshow rows |
| `<task-id>:<list-collection>-filter-sort-paginate` | combo of all three params |

Add §11.1 anonymous-bypass and cross-tenant if the endpoint is
protected — those rows live in [per-endpoint.md](per-endpoint.md), not
this one.
