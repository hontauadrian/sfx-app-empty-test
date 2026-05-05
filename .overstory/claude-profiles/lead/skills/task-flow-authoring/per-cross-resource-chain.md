# §11.2 — Per cross-resource chain

> Decision 11.2: A chain is any path-param that comes from another
> resource's create response. Declare the resource graph, exercise the
> chain, prove wrong-parent and reparent-forbidden cases.

## The rule (verbatim from Decision 11.2)

- ☐ **Resource-graph entry** declares `parent`, `create`, `capture`,
      `routes` for the chained resource.
- ☐ **At least one flow** that creates `<parent-resource>`, captures
      the id, then uses it for `<child-resource>` (a chain-CRUD-
      roundtrip flow).
- ☐ **Recursive parent traversal** for deeper chains (3+ levels) is
      tested end-to-end (see §11.16).
- ☐ **Wrong-parent flow** — for any leaf `<child-resource>` under
      parent `<parent-resource-A>`, attempt the same operation under a
      different parent `<parent-resource-B>` and assert the spec's
      expected status (typically 403 or 404).
- ☐ **Reparent-forbidden flow** — if `<parent-id>` is declared
      immutable, attempt to `PATCH` it to a new parent and assert the
      spec's expected status (typically 422 or 403).

## Failure mode if missing

Without a `resources` graph entry, the loader cannot wire up
`${<resource>.id}` interpolation across `setup` and `steps`. Probes
that try to create `<child-resource>` get a literal string `${...}` in
the path. Diagnostic: `RESOURCE_CAPTURE_UNDECLARED` or
`RESOURCE_CAPTURE_PATHPARAM_UNDECLARED` (route this to the
`build-verifiable-features` skill — the controller is missing
`@ResourceCaptures`).

Without a wrong-parent flow, an endpoint that fails to scope by parent
ID (e.g. `findById` instead of `findByParentAndId`) silently allows
cross-parent reads. Probe runs green; bug ships.

## JSON patterns

### Pattern 1 — resource-graph entry

```json
{
  "resources": {
    "<child-resource>": {
      "parent": "<parent-resource>",
      "create": {
        "method": "POST",
        "path": "/<parent-collection>/${<parent-resource>.id}/<child-collection>",
        "actor": "<creator-actor>",
        "body": { "<field>": "<value>" }
      },
      "capture": {
        "bindings": { "id": "$.id" }
      },
      "routes": {
        "get":    "GET    /<parent-collection>/${<parent-resource>.id}/<child-collection>/${id}",
        "update": "PATCH  /<parent-collection>/${<parent-resource>.id}/<child-collection>/${id}",
        "delete": "DELETE /<parent-collection>/${<parent-resource>.id}/<child-collection>/${id}"
      }
    }
  }
}
```

### Pattern 2 — chain-CRUD-roundtrip

```json
{
  "id": "<task-id>:<child-resource>-crud-roundtrip",
  "description": "Create <parent>, then create / read / update / delete <child> chained off it",
  "actor": "<actor>",
  "setup": [
    { "create": "<parent-resource>", "by": "<actor>", "capture": "$parentId" }
  ],
  "steps": [
    {
      "request": {
        "method": "POST",
        "path": "/<parent-collection>/${parentId}/<child-collection>",
        "body": { "<field>": "<value>" }
      },
      "capture": { "bindings": { "childId": "$.id" } },
      "expect": { "status": 201 }
    },
    {
      "request": {
        "method": "GET",
        "path": "/<parent-collection>/${parentId}/<child-collection>/${childId}"
      },
      "expect": {
        "status": 200,
        "jsonpath": { "$.id": "${childId}" }
      }
    },
    {
      "request": {
        "method": "PATCH",
        "path": "/<parent-collection>/${parentId}/<child-collection>/${childId}",
        "body": { "<field>": "<new-value>" }
      },
      "expect": { "status": 200 }
    },
    {
      "request": {
        "method": "DELETE",
        "path": "/<parent-collection>/${parentId}/<child-collection>/${childId}"
      },
      "expect": { "status": 204 }
    },
    {
      "request": {
        "method": "GET",
        "path": "/<parent-collection>/${parentId}/<child-collection>/${childId}"
      },
      "expect": { "status": 404 }
    }
  ]
}
```

### Pattern 3 — wrong-parent

```json
{
  "id": "<task-id>:<child-resource>-wrong-parent",
  "description": "<child> created under <parent-A> cannot be read under <parent-B>",
  "actor": "<actor>",
  "setup": [
    { "create": "<parent-resource>", "by": "<actor>", "capture": "$parentA" },
    { "create": "<parent-resource>", "by": "<actor>", "capture": "$parentB" },
    { "create": "<child-resource>",  "by": "<actor>", "parent": "${parentA}", "capture": "$childId" }
  ],
  "steps": [
    {
      "request": {
        "method": "GET",
        "path": "/<parent-collection>/${parentB}/<child-collection>/${childId}"
      },
      "expect": { "status": 404 }
    }
  ]
}
```

Use `403` instead of `404` when the spec's enumeration policy leaks
existence; pick one consistently.

### Pattern 4 — reparent-forbidden

Declare the immutable field on the resource:

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
  "description": "<child>.<parent-id-field> cannot be re-pointed at a different parent",
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
        "path": "/<parent-collection>/${parentA}/<child-collection>/${childId}",
        "body": { "<parent-id-field>": "${parentB}" }
      },
      "expect": { "status": 422 }
    }
  ]
}
```

## Worked example — three-level chain

`<grandparent>` → `<parent-resource>` → `<child-resource>`. To exercise
the leaf:

```json
{
  "resources": {
    "<grandparent>": {
      "create": { "method": "POST", "path": "/<grandparent-collection>", "body": {} },
      "capture": { "bindings": { "id": "$.id" } }
    },
    "<parent-resource>": {
      "parent": "<grandparent>",
      "create": {
        "method": "POST",
        "path": "/<grandparent-collection>/${<grandparent>.id}/<parent-collection>",
        "body": {}
      },
      "capture": { "bindings": { "id": "$.id" } }
    },
    "<child-resource>": {
      "parent": "<parent-resource>",
      "create": {
        "method": "POST",
        "path": "/<grandparent-collection>/${<grandparent>.id}/<parent-collection>/${<parent-resource>.id}/<child-collection>",
        "body": {}
      },
      "capture": { "bindings": { "id": "$.id" } }
    }
  },
  "special_flows": [
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
          "expect": { "status": 201 }
        }
      ]
    }
  ]
}
```

See [resource-patterns.md](resource-patterns.md) for the six
resource-graph shapes and how each maps to a `resources` block.
