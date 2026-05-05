# §11.17 — Per cross-tenant + cross-resource combination

> Decision 11.17 + Decision 18.2 + Decision 18.3: Every multi-tenant
> resource gets the four-flow set (read / list / patch / delete from a
> foreign tenant). Decision 18.2 enumerates additional cross-tenant
> patterns the catalogue must cover when the spec invokes them.

## The rule (verbatim from Decision 11.17 + Decision 18.3)

The Cartesian product of auth and hierarchy. The checklist row is
satisfied when every multi-tenant `<resource>` has the four-flow set:
read / list / patch / delete from a foreign tenant or insufficient
role.

This is the **floor**. Decisions 18.2.4–18.2.9 (cross-tenant
relationship rejection, invitation, token binding, role denial,
hierarchical role precedence, service-account scope) extend it as the
spec demands.

## Failure mode if missing

Cross-tenant data leaks are the highest-stakes class of bug a SaaS
ships. They fail in ways that look correct from inside a single
tenant — the customer-facing flow works perfectly. Only when an
attacker, a misconfigured client, or an employee debugging in
production crosses the boundary does the leak surface.

The four-flow set is the absolute minimum:

- **Read** alone is insufficient — a leak might exist only via list.
- **List** alone is insufficient — read may bypass the list filter.
- **Patch** alone is insufficient — delete may use a different path.
- **Delete** alone is insufficient — patch may use a different path.

Each verb takes a different code path. Each code path is its own
chance to forget the tenant scope.

## Decision 17 P1-13 / P1-14 — declarative tenancy

Declare tenant scoping on the resource and per-tenant credentials on
the actor:

```json
{
  "resources": {
    "<resource>": {
      "tenant_scoped_by": "<field>"
    }
  },
  "actors": {
    "<actor>": {
      "tenants": ["<tenant-A>", "<tenant-B>"],
      "credentials_per_tenant": {
        "<tenant-A>": { },
        "<tenant-B>": { }
      }
    }
  }
}
```

Once declared, the emitter auto-generates the four-flow set. Lead
reviews and flips `"source": "generated"` to `"source": "curated"`.

## JSON patterns — the four-flow set

### Pattern 1 — read isolation (Decision 18.2.1)

```json
{
  "id": "<task-id>:<resource>-read-foreign-tenant",
  "description": "<actor-A> cannot read <resource> owned by <tenant-B>",
  "actor": "<actor-A>",
  "setup": [
    { "create": "<resource>", "by": "<actor-B>", "tenant": "<tenant-B>", "capture": "$id" }
  ],
  "steps": [
    {
      "request": { "method": "GET", "path": "<get-path-with-${id}>" },
      "expect": { "status": 404 }
    }
  ]
}
```

The 403-vs-404 choice MUST be consistent across the entire API. A
mix is itself a vulnerability — leaking existence via the choice. Use
404 when existence is hidden; use 403 when the spec exposes it.

### Pattern 2 — list leak (Decision 18.2.2)

```json
{
  "id": "<task-id>:<resource>-list-excludes-foreign-tenant",
  "description": "<actor-A>'s list response excludes <tenant-B>'s items",
  "actor": "<actor-A>",
  "setup": [
    { "create": "<resource>", "by": "<actor-A>", "tenant": "<tenant-A>", "capture": "$aId", "body": { "name": "a-name" } },
    { "create": "<resource>", "by": "<actor-B>", "tenant": "<tenant-B>", "capture": "$bId", "body": { "name": "b-name" } }
  ],
  "steps": [
    {
      "request": { "method": "GET", "path": "<list-path>" },
      "expect": {
        "status": 200,
        "jsonpath": {
          "$.data[*].id":   { "contains": "${aId}", "excludes": "${bId}" },
          "$.data[*].name": { "contains": "a-name", "excludes": "b-name" }
        }
      }
    }
  ]
}
```

### Pattern 3 — mutate isolation: patch (Decision 18.2.3)

The follow-up read by `<actor-B>` must observe the original value —
not the value `<actor-A>` attempted to write — to prove the mutation
did not silently land on the foreign tenant.

```json
{
  "id": "<task-id>:<resource>-patch-foreign-tenant",
  "description": "<actor-A> cannot patch <resource> owned by <tenant-B>; resource unchanged",
  "actor": "<actor-A>",
  "setup": [
    { "create": "<resource>", "by": "<actor-B>", "tenant": "<tenant-B>", "capture": "$id", "body": { "<field>": "<value-B>" } }
  ],
  "steps": [
    {
      "request": {
        "method": "PATCH",
        "path": "<patch-path-with-${id}>",
        "body": { "<field>": "<value-A-attempted>" }
      },
      "expect": { "status": 404 }
    },
    {
      "actor": "<actor-B>",
      "request": { "method": "GET", "path": "<get-path-with-${id}>" },
      "expect": {
        "status": 200,
        "jsonpath": { "$.<field>": "<value-B>" }
      }
    }
  ]
}
```

### Pattern 4 — mutate isolation: delete

```json
{
  "id": "<task-id>:<resource>-delete-foreign-tenant",
  "description": "<actor-A> cannot delete <resource> owned by <tenant-B>; resource still readable",
  "actor": "<actor-A>",
  "setup": [
    { "create": "<resource>", "by": "<actor-B>", "tenant": "<tenant-B>", "capture": "$id" }
  ],
  "steps": [
    {
      "request": { "method": "DELETE", "path": "<delete-path-with-${id}>" },
      "expect": { "status": 404 }
    },
    {
      "actor": "<actor-B>",
      "request": { "method": "GET", "path": "<get-path-with-${id}>" },
      "expect": { "status": 200 }
    }
  ]
}
```

## Decision 18.2 — extended cross-tenant patterns

### Pattern 5 — cross-tenant relationship rejection (18.2.4)

```json
{
  "id": "<task-id>:<linking-resource>-cross-tenant-rejected",
  "description": "<actor-A> cannot link <resource-A> in <tenant-A> to <resource-B> in <tenant-B>",
  "actor": "<actor-A>",
  "setup": [
    { "create": "<resource-A>", "by": "<actor-A>", "tenant": "<tenant-A>", "capture": "$aId" },
    { "create": "<resource-B>", "by": "<actor-B>", "tenant": "<tenant-B>", "capture": "$bId" }
  ],
  "steps": [
    {
      "request": {
        "method": "POST",
        "path": "<linking-path>",
        "body": { "aId": "${aId}", "bId": "${bId}" }
      },
      "expect": {
        "status": 422,
        "jsonpath": {
          "$.code": { "oneOf": ["CROSS_TENANT_LINK_FORBIDDEN", "NOT_FOUND"] }
        }
      }
    }
  ]
}
```

### Pattern 6 — cross-tenant invitation (18.2.5 — explicitly permitted)

```json
{
  "id": "<task-id>:<invitation-resource>-cross-tenant-allowed",
  "description": "Cross-tenant invitation succeeds when explicitly permitted",
  "actor": "<actor-A>",
  "setup": [
    { "create": "<tenant>", "body": { "name": "<tenant-A>" } },
    { "create": "<tenant>", "body": { "name": "<tenant-B>" } }
  ],
  "steps": [
    {
      "request": {
        "method": "POST",
        "path": "<invite-path>",
        "body": { "fromTenant": "<tenant-A>", "toEmail": "<actor-B-email>", "role": "<role>" }
      },
      "expect": {
        "status": 201,
        "jsonpath": { "$.token": { "type": "string" } }
      }
    }
  ]
}
```

```json
{
  "id": "<task-id>:<invitation-resource>-revoked-rejected",
  "description": "Revoked invitation token returns 410",
  "actor": "anonymous",
  "setup": [
    { "create": "<invitation-resource>", "by": "<actor-A>", "capture": "$token" },
    { "request": { "method": "DELETE", "path": "<revoke-path-with-${token}>", "by": "<actor-A>" } }
  ],
  "steps": [
    {
      "request": { "method": "POST", "path": "<accept-path>", "body": { "token": "${token}" } },
      "expect": { "status": 410 }
    }
  ]
}
```

### Pattern 7 — token binding to tenant (18.2.6)

```json
{
  "id": "<task-id>:<endpoint>-tenant-A-token-tenant-B-url",
  "description": "Token issued for <tenant-A> against <tenant-B> URL returns 403",
  "actor": "<actor-with-tenant-A-token>",
  "setup": [
    { "create": "<resource>", "by": "<actor-B>", "tenant": "<tenant-B>", "capture": "$id" }
  ],
  "steps": [
    {
      "request": {
        "method": "GET",
        "path": "/<tenant-B>/<resource-collection>/${id}"
      },
      "expect": { "status": 403 }
    }
  ]
}
```

### Pattern 8 — within-tenant role denial (18.2.7)

```json
{
  "id": "<task-id>:<endpoint>-viewer-cannot-mutate",
  "description": "<viewer> in same tenant cannot perform <action> reserved for <owner>",
  "actor": "<actor-with-viewer-role>",
  "setup": [
    { "create": "<resource>", "by": "<owner-actor>", "tenant": "<tenant-A>", "capture": "$id" }
  ],
  "steps": [
    {
      "request": {
        "method": "PATCH",
        "path": "<patch-path-with-${id}>",
        "body": { "<field>": "<value>" }
      },
      "expect": { "status": 403 }
    }
  ]
}
```

### Pattern 9 — hierarchical role precedence (18.2.8)

Two specs are possible. Spec choice 1: a `<superadmin>` of `<parent>`
automatically applies to children → assert 200. Spec choice 2: each
`<child>` enforces its own membership → assert 403. Pick the one the
spec demands; do not author both.

```json
{
  "id": "<task-id>:<child-resource>-superadmin-precedence",
  "description": "<superadmin> of <parent> can <action> on <child> (per spec)",
  "actor": "<superadmin-of-parent>",
  "setup": [
    { "create": "<parent-resource>", "capture": "$parentId" },
    { "create": "<child-resource>", "parent": "${parentId}", "by": "<other-actor>", "capture": "$childId" }
  ],
  "steps": [
    {
      "request": { "method": "PATCH", "path": "<child-path-with-${parentId}-${childId}>", "body": { } },
      "expect": { "status": 200 }
    }
  ]
}
```

### Pattern 10 — service-account scope (18.2.9)

```json
{
  "id": "<task-id>:<endpoint>-service-account-wrong-scope",
  "description": "Service account with <other-scope> cannot access <required-scope> endpoint",
  "actor": "<service-account-with-other-scope>",
  "steps": [
    {
      "request": { "method": "<verb>", "path": "<path>", "body": { } },
      "expect": {
        "status": 403,
        "headers": {
          "WWW-Authenticate": { "matches": "scope=" }
        },
        "jsonpath": {
          "$.code": { "oneOf": ["INSUFFICIENT_SCOPE", "FORBIDDEN"] }
        }
      }
    }
  ]
}
```

## Worked example — full §11.17 coverage on a multi-tenant resource

> Spec: `<resource>` is tenant-scoped. Cross-tenant access returns 404
> (existence hidden). API tokens are bound to a tenant. Three roles
> per tenant: viewer, editor, owner. Cross-tenant linking is forbidden.

Floor: 8 flows.

| Flow id | Asserts | Decision 18.2 row |
|---|---|---|
| `<task-id>:<resource>-read-foreign-tenant` | 404 | 18.2.1 |
| `<task-id>:<resource>-list-excludes-foreign-tenant` | foreign items absent | 18.2.2 |
| `<task-id>:<resource>-patch-foreign-tenant` | 404 + B's value unchanged | 18.2.3 |
| `<task-id>:<resource>-delete-foreign-tenant` | 404 + still readable by B | 18.2.3 |
| `<task-id>:<linking-resource>-cross-tenant-rejected` | 422 | 18.2.4 |
| `<task-id>:<resource>-tenant-A-token-tenant-B-url` | 403 | 18.2.6 |
| `<task-id>:<resource>-viewer-cannot-mutate` | 403 | 18.2.7 |
| `<task-id>:<resource>-editor-cannot-delete` | 403 | 18.2.7 (per-verb role denial) |

The four-flow set (rows 1-4) is mandatory for every multi-tenant
resource. Rows 5-8 are mandatory only when the spec invokes the
corresponding pattern.
