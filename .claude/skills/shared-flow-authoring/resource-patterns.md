# Decision 18.1 — Resource-graph pattern catalogue

> The schema's resource declarations need to express several recurring
> graph shapes. Each shape has a concrete JSON form; pick the closest
> match from this catalogue.

The catalogue covers six patterns. Every chainable resource in the diff
must map to one of them. If your resource doesn't fit any, it's
probably actually two resources or a flat resource — re-read the spec
before inventing a seventh shape.

| § | Pattern | JSON key signal |
|---|---|---|
| 18.1.1 | 1:N path-nested | `"parent"` + `"path": "/<parents>/${...}/<children>"` |
| 18.1.2 | N:M via junction | `"parents": ["<A>", "<B>"]` + body references both FKs |
| 18.1.3 | Polymorphic | `"polymorphic_parents": ["<kind-A>", "<kind-B>"]` + body discriminator |
| 18.1.4 | Self-referential | `"self_ref_field": "<field>"` + body has optional `${self.id}` |
| 18.1.5 | Body-FK reference (no path nesting) | `"body_refs": [{ "field", "resource" }]` + flat path |
| 18.1.6 | 3+ level chain | `"parent"` chain through ≥2 levels |

## 18.1.1 — 1:N path-nested

`<parent-resource>` owns N `<child-resource>`s. The child path embeds
the parent id: `/<parent-collection>/:<parent-id>/<child-collection>`.

```json
{
  "resources": {
    "<parent-resource>": {
      "create": { "method": "POST", "path": "/<parent-collection>", "body": { } },
      "capture": { "bindings": { "id": "$.id" } }
    },
    "<child-resource>": {
      "parent": "<parent-resource>",
      "create": {
        "method": "POST",
        "path": "/<parent-collection>/${<parent-resource>.id}/<child-collection>",
        "body": { }
      },
      "capture": { "bindings": { "id": "$.id" } }
    }
  }
}
```

**Coverage requirements:** §11.2, §11.16 (chain-CRUD-roundtrip,
wrong-parent, reparent-forbidden, leaf-create end-to-end).

## 18.1.2 — N:M via junction

Two resources `<resource-A>` and `<resource-B>` related many-to-many
via a `<junction-resource>`. The junction has its own create endpoint
and optionally its own id; the body references both foreign keys.

```json
{
  "resources": {
    "<junction-resource>": {
      "parents": ["<resource-A>", "<resource-B>"],
      "create": {
        "method": "POST",
        "path": "/<resource-A-collection>/${<resource-A>.id}/<junction-collection>",
        "body": {
          "<resource-B-id-field>": "${<resource-B>.id}",
          "role": "<role>"
        }
      },
      "capture": { "bindings": { "id": "$.id" } }
    }
  }
}
```

**Coverage requirements:**
- Cross-tenant denial when one side belongs to a foreign tenant
  (§11.17).
- Deletion of either parent must drop or invalidate the junction per
  spec — emit a flow that creates the junction, deletes
  `<resource-A>`, then asserts the junction's behaviour:
  - cascading delete → junction also gone (404)
  - constraint → cannot delete `<resource-A>` while the junction
    exists (409)
  - soft-invalidate → junction returns "<state>: <invalid>"

## 18.1.3 — Polymorphic

`<resource>` can be attached to multiple parent **kinds**
(`<parent-kind-A>`, `<parent-kind-B>`). The body carries a
discriminator (`<parent-kind>`) and the parent's id.

```json
{
  "resources": {
    "<resource>": {
      "polymorphic_parents": ["<parent-kind-A>", "<parent-kind-B>"],
      "create": {
        "method": "POST",
        "path": "/<resource-collection>",
        "body": {
          "parentKind": "<parent-kind>",
          "parentId": "${<parent-kind>.id}"
        }
      },
      "capture": { "bindings": { "id": "$.id" } }
    }
  }
}
```

**Coverage requirements:**
- One happy-path flow per kind (positive).
- Mismatched kind/id combination → expected error per spec.

```json
{
  "id": "<task-id>:<resource>-polymorphic-mismatch",
  "description": "parentKind=<kind-A> with id from <kind-B> rejects",
  "actor": "<actor>",
  "setup": [
    { "create": "<parent-kind-B>", "capture": "$bId" }
  ],
  "steps": [
    {
      "request": {
        "method": "POST",
        "path": "/<resource-collection>",
        "body": { "parentKind": "<kind-A>", "parentId": "${bId}" }
      },
      "expect": { "status": 422 }
    }
  ]
}
```

## 18.1.4 — Self-referential

`<resource>` references its own kind via a parent / predecessor field
(tree, comment thread, reply chain, dependency).

```json
{
  "resources": {
    "<resource>": {
      "self_ref_field": "<field>",
      "create": {
        "method": "POST",
        "path": "/<resource-collection>",
        "body": { "<field>": "${<resource>.id}" }
      },
      "capture": { "bindings": { "id": "$.id" } }
    }
  }
}
```

The `<field>` reference is optional in body — root nodes omit it,
descendants set it. Bootstrap emits the optional flag; curated rows
disambiguate with explicit setup.

**Coverage requirements:**
- Cycle prevention if mutating `<field>` is allowed:

```json
{
  "id": "<task-id>:<resource>-cycle-rejected",
  "description": "PATCH that creates a cycle (A.parent=B; B.parent=A) returns 422",
  "actor": "<actor>",
  "setup": [
    { "create": "<resource>", "by": "<actor>", "capture": "$a" },
    { "create": "<resource>", "by": "<actor>", "parent": "${a}", "capture": "$b" }
  ],
  "steps": [
    {
      "request": { "method": "PATCH", "path": "<patch-path-with-${a}>", "body": { "<field>": "${b}" } },
      "expect": { "status": 422 }
    }
  ]
}
```

- Depth-limit at boundary (if the spec caps tree depth, boundary tests
  at depth-N and depth-N+1):

```json
{
  "id": "<task-id>:<resource>-depth-at-limit",
  "description": "Tree at maxDepth - 1 + leaf-create succeeds (creates depth = maxDepth)",
  "actor": "<actor>",
  "setup": [
    { "create": "<resource>", "by": "<actor>", "capture": "$root" },
    { "loop": "<maxDepth - 1>", "create": "<resource>", "parent_chain_from": "${root}", "captureLast": "$leafParent" }
  ],
  "steps": [
    {
      "request": {
        "method": "POST",
        "path": "/<resource-collection>",
        "body": { "<field>": "${leafParent}" }
      },
      "expect": { "status": 201 }
    }
  ]
}
```

```json
{
  "id": "<task-id>:<resource>-depth-exceeds-limit",
  "description": "Tree at maxDepth + leaf-create returns 422",
  "actor": "<actor>",
  "setup": [
    { "create": "<resource>", "by": "<actor>", "capture": "$root" },
    { "loop": "<maxDepth>", "create": "<resource>", "parent_chain_from": "${root}", "captureLast": "$leafParent" }
  ],
  "steps": [
    {
      "request": {
        "method": "POST",
        "path": "/<resource-collection>",
        "body": { "<field>": "${leafParent}" }
      },
      "expect": { "status": 422 }
    }
  ]
}
```

## 18.1.5 — Body-FK reference (no path nesting)

`<resource>` references `<other-resource>` via a foreign-key field in
the body, but the path is flat (`/<resource-collection>`). Common
when the relationship is loose or many-to-one without ownership
semantics.

```json
{
  "resources": {
    "<resource>": {
      "body_refs": [
        { "field": "<field>", "resource": "<other-resource>" }
      ],
      "create": {
        "method": "POST",
        "path": "/<resource-collection>",
        "body": { "<field>": "${<other-resource>.id}" }
      },
      "capture": { "bindings": { "id": "$.id" } }
    }
  }
}
```

**Coverage requirements:**
- Foreign id from a different tenant → expected error (§11.17).
- Deleting `<other-resource>` while `<resource>` references it —
  cascade or constraint per spec:

```json
{
  "id": "<task-id>:<resource>-orphans-on-delete-of-fk",
  "description": "Deleting <other-resource> cascades to <resource> (per spec)",
  "actor": "<actor>",
  "setup": [
    { "create": "<other-resource>", "by": "<actor>", "capture": "$otherId" },
    { "create": "<resource>", "by": "<actor>", "body": { "<field>": "${otherId}" }, "capture": "$id" }
  ],
  "steps": [
    {
      "request": { "method": "DELETE", "path": "<other-delete-path-with-${otherId}>" },
      "expect": { "status": 204 }
    },
    {
      "request": { "method": "GET", "path": "<get-path-with-${id}>" },
      "expect": { "status": 404 }
    }
  ]
}
```

The 404 step assumes cascading delete; for soft-invalidate or
constraint outcomes, adjust the second step's expected status per spec.

## 18.1.6 — Three-plus-level chain

`<grandparent>` → `<parent-resource>` → `<child-resource>`. Each level
contributes a path id. The recursive parent traversal walks up the
chain to seed all needed captures.

```json
{
  "resources": {
    "<grandparent>": {
      "create": { "method": "POST", "path": "/<grandparent-collection>", "body": { } },
      "capture": { "bindings": { "id": "$.id" } }
    },
    "<parent-resource>": {
      "parent": "<grandparent>",
      "create": {
        "method": "POST",
        "path": "/<grandparent-collection>/${<grandparent>.id}/<parent-collection>",
        "body": { }
      },
      "capture": { "bindings": { "id": "$.id" } }
    },
    "<child-resource>": {
      "parent": "<parent-resource>",
      "create": {
        "method": "POST",
        "path": "/<grandparent-collection>/${<grandparent>.id}/<parent-collection>/${<parent-resource>.id}/<child-collection>",
        "body": { }
      },
      "capture": { "bindings": { "id": "$.id" } }
    }
  }
}
```

**Coverage requirements (§11.16):** leaf-create end-to-end, multi-id
path, wrong-parent at any level, reparent forbidden if any parent-id
is immutable, cross-tree leak prevention at every depth.

## How to pick

| Question | Answer |
|---|---|
| Does the path include the parent id? | YES → 18.1.1 (1:N) or 18.1.6 (3+) |
| Is there a junction table joining two resources? | YES → 18.1.2 |
| Does the body carry a `<kind>` discriminator + `<id>`? | YES → 18.1.3 |
| Does the resource reference itself? | YES → 18.1.4 |
| Is the path flat, with the FK in the body? | YES → 18.1.5 |
| Are there 3+ levels of nesting? | YES → 18.1.6 (extends 18.1.1) |

If two patterns apply (e.g. polymorphic AND self-referential), declare
both: `polymorphic_parents` AND `self_ref_field` can coexist.
