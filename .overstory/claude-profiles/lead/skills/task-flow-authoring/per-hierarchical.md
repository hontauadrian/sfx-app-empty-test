# §11.16 — Per hierarchical / nested resource

> Decision 11.16: 3+ level chain + multi-id paths + body-FK +
> wrong-parent + reparent-forbidden + visibility + leak prevention.

## The rule (verbatim from Decision 11.16)

- ☐ Three-level (or deeper) chain — leaf-create works end-to-end.
- ☐ Multi-`<id-param>` path captures from different parents.
- ☐ Cross-resource setup (body references multiple foreign keys).
- ☐ Wrong-parent mismatch.
- ☐ Reparent forbidden if parent-id is immutable.
- ☐ Nested resource visibility (listing under one parent does not
      leak another parent's children).
- ☐ Cross-tree leak prevention.

## Failure mode if missing

The "list under parent A leaks children of parent B" bug ships because
the implementation forgot the `WHERE parentId = ...` filter on the
nested list endpoint. The §11.1 cross-tenant flow doesn't catch it
because both parents may be in the same tenant — the leak is
*intra-tenant, cross-resource*, and only the visibility flow
demonstrates it.

Three-level chains expose path-resolution bugs: a controller that
ignores `:grandparentId` (`@Param('grandparentId')` decorator deleted
in a refactor) and just trusts `:parentId`. The bug works when the
parent is unique across grandparents; it breaks when two grandparents
share a parent name. The leaf-create flow is what proves the controller
honours every level.

## JSON patterns

### Pattern 1 — three-level chain (declarative + flow)

See [per-cross-resource-chain.md](per-cross-resource-chain.md) for
the resource-graph declaration. The flow:

```json
{
  "id": "<task-id>:<child-resource>-three-level-create",
  "description": "Recursive parent traversal seeds <grandparent> + <parent>, then creates <child>",
  "actor": "<actor>",
  "setup": [
    { "create": "<grandparent>",     "by": "<actor>", "capture": "$g" },
    { "create": "<parent-resource>", "by": "<actor>", "parent": "${g}", "capture": "$p" }
  ],
  "steps": [
    {
      "request": {
        "method": "POST",
        "path": "/<grandparent-collection>/${g}/<parent-collection>/${p}/<child-collection>",
        "body": { "<field>": "<value>" }
      },
      "capture": { "bindings": { "childId": "$.id" } },
      "expect": { "status": 201 }
    },
    {
      "request": {
        "method": "GET",
        "path": "/<grandparent-collection>/${g}/<parent-collection>/${p}/<child-collection>/${childId}"
      },
      "expect": { "status": 200 }
    }
  ]
}
```

### Pattern 2 — multi-id path captures from different parents

```json
{
  "id": "<task-id>:<child-resource>-multi-parent-path",
  "description": "Same <child-resource> id is unique only within parent scope",
  "actor": "<actor>",
  "setup": [
    { "create": "<parent-resource>", "by": "<actor>", "capture": "$parentA" },
    { "create": "<parent-resource>", "by": "<actor>", "capture": "$parentB" },
    { "create": "<child-resource>",  "by": "<actor>", "parent": "${parentA}", "body": { "name": "x" }, "capture": "$childA" },
    { "create": "<child-resource>",  "by": "<actor>", "parent": "${parentB}", "body": { "name": "x" }, "capture": "$childB" }
  ],
  "steps": [
    {
      "request": { "method": "GET", "path": "/<parents>/${parentA}/<children>/${childA}" },
      "expect": { "status": 200, "jsonpath": { "$.id": "${childA}" } }
    },
    {
      "request": { "method": "GET", "path": "/<parents>/${parentB}/<children>/${childB}" },
      "expect": { "status": 200, "jsonpath": { "$.id": "${childB}" } }
    },
    {
      "request": { "method": "GET", "path": "/<parents>/${parentA}/<children>/${childB}" },
      "expect": { "status": 404 }
    }
  ]
}
```

The third step proves B's id is not under A — the flow asserts the
parent-scoped uniqueness contract.

### Pattern 3 — cross-resource setup (body references multiple FKs)

```json
{
  "id": "<task-id>:<linking-resource>-cross-resource-setup",
  "description": "<linking-resource> body references both <resource-A> and <resource-B>",
  "actor": "<actor>",
  "setup": [
    { "create": "<resource-A>", "by": "<actor>", "capture": "$aId" },
    { "create": "<resource-B>", "by": "<actor>", "capture": "$bId" }
  ],
  "steps": [
    {
      "request": {
        "method": "POST",
        "path": "<linking-path>",
        "body": {
          "aId": "${aId}",
          "bId": "${bId}",
          "<other-field>": "<value>"
        }
      },
      "expect": {
        "status": 201,
        "jsonpath": {
          "$.aId": "${aId}",
          "$.bId": "${bId}"
        }
      }
    }
  ]
}
```

### Pattern 4 — wrong-parent mismatch

```json
{
  "id": "<task-id>:<child-resource>-wrong-parent-mismatch",
  "description": "<child> created under <parent-A> cannot be read under <parent-B>",
  "actor": "<actor>",
  "setup": [
    { "create": "<parent-resource>", "by": "<actor>", "capture": "$parentA" },
    { "create": "<parent-resource>", "by": "<actor>", "capture": "$parentB" },
    { "create": "<child-resource>",  "by": "<actor>", "parent": "${parentA}", "capture": "$childId" }
  ],
  "steps": [
    {
      "request": { "method": "GET", "path": "/<parents>/${parentB}/<children>/${childId}" },
      "expect": { "status": 404 }
    }
  ]
}
```

Status 403 is acceptable per spec; pick one and stay consistent.

### Pattern 5 — reparent-forbidden

Declare `immutable_fields` (Decision 17 P1-12) on the resource:

```json
{
  "resources": {
    "<child-resource>": {
      "parent": "<parent-resource>",
      "immutable_fields": ["<parent-id-field>"]
    }
  }
}
```

Then assert:

```json
{
  "id": "<task-id>:<child-resource>-reparent-forbidden",
  "description": "Cannot re-point <child-resource>.<parent-id-field> at a new parent",
  "actor": "<actor>",
  "setup": [
    { "create": "<parent-resource>", "by": "<actor>", "capture": "$parentA" },
    { "create": "<parent-resource>", "by": "<actor>", "capture": "$parentB" },
    { "create": "<child-resource>",  "by": "<actor>", "parent": "${parentA}", "capture": "$childId" }
  ],
  "steps": [
    {
      "request": {
        "method": "PATCH",
        "path": "/<parents>/${parentA}/<children>/${childId}",
        "body": { "<parent-id-field>": "${parentB}" }
      },
      "expect": {
        "status": 422,
        "jsonpath": {
          "$.errors[*].field": "<parent-id-field>",
          "$.errors[*].rule": "immutable"
        }
      }
    }
  ]
}
```

### Pattern 6 — nested visibility (no leak across parents)

```json
{
  "id": "<task-id>:<child-resource>-listing-scoped-to-parent",
  "description": "Listing children of <parent-A> excludes children of <parent-B>",
  "actor": "<actor>",
  "setup": [
    { "create": "<parent-resource>", "by": "<actor>", "capture": "$parentA" },
    { "create": "<parent-resource>", "by": "<actor>", "capture": "$parentB" },
    { "create": "<child-resource>",  "by": "<actor>", "parent": "${parentA}", "body": { "name": "a-child" }, "capture": "$childA" },
    { "create": "<child-resource>",  "by": "<actor>", "parent": "${parentB}", "body": { "name": "b-child" }, "capture": "$childB" }
  ],
  "steps": [
    {
      "request": { "method": "GET", "path": "/<parents>/${parentA}/<children>" },
      "expect": {
        "status": 200,
        "jsonpath": {
          "$.data[*].id":   { "contains": "${childA}",  "excludes": "${childB}" },
          "$.data[*].name": { "contains": "a-child",    "excludes": "b-child" }
        }
      }
    }
  ]
}
```

### Pattern 7 — cross-tree leak prevention (deep chain)

The mismatched ids: `pA`'s grandparent is `gA`, not `gB`. A correct
controller rejects with 404; a buggy one that only checks `pA → cA`
returns the child.

```json
{
  "id": "<task-id>:<child-resource>-cross-tree-leak",
  "description": "Path-traversal attempt with mismatched grandparent/parent ids returns 404",
  "actor": "<actor>",
  "setup": [
    { "create": "<grandparent>",     "by": "<actor>", "capture": "$gA" },
    { "create": "<grandparent>",     "by": "<actor>", "capture": "$gB" },
    { "create": "<parent-resource>", "by": "<actor>", "parent": "${gA}", "capture": "$pA" },
    { "create": "<parent-resource>", "by": "<actor>", "parent": "${gB}", "capture": "$pB" },
    { "create": "<child-resource>",  "by": "<actor>", "parent": "${pA}", "capture": "$cA" }
  ],
  "steps": [
    {
      "request": {
        "method": "GET",
        "path": "/<grandparents>/${gB}/<parents>/${pA}/<children>/${cA}"
      },
      "expect": { "status": 404 }
    }
  ]
}
```

## Worked example — full §11.16 coverage on a 3-level hierarchy

> Spec: `<grandparent>` → `<parent-resource>` → `<child-resource>`
> with paths `/<grandparents>/:gid/<parents>/:pid/<children>/:cid`.
> Both `:gid` and `:pid` enforced. `<child>.parentId` immutable.

Floor: 7 flows (matches §11.16's 7-row checklist).

| Flow id | Asserts |
|---|---|
| `<task-id>:<child-resource>-three-level-create` | full chain create works |
| `<task-id>:<child-resource>-multi-parent-path` | same name in two parents resolves correctly |
| `<task-id>:<linking-resource>-cross-resource-setup` | body-FK references resolve |
| `<task-id>:<child-resource>-wrong-parent-mismatch` | child of A unreachable via B |
| `<task-id>:<child-resource>-reparent-forbidden` | immutable parent rejects PATCH |
| `<task-id>:<child-resource>-listing-scoped-to-parent` | list under A excludes B's children |
| `<task-id>:<child-resource>-cross-tree-leak` | mismatched grandparent/parent → 404 |

Add §11.17 cross-tenant flows on top — leak prevention across tenants
is its own row, distinct from leak prevention across parents in the
same tenant.
