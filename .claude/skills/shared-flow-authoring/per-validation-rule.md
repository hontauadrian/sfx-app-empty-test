# §11.9 — Per validation rule

> Decision 11.9: For every validation rule the spec declares
> (per-field, cross-field, enum drift), emit a flow that violates the
> rule and asserts the declared status + envelope.

## The rule (verbatim from Decision 11.9)

- ☐ **Per-field** — min/max length, regex, enum, nullable vs required,
      default, type, format (uuid/email/url), trim/lowercase coercion.
- ☐ **Cross-field** — conditional requirement, mutual exclusion,
      cross-row ordering (`<endDate> >= <startDate>`).
- ☐ **Enum drift** — adding a value should not break old clients;
      removing a promised value should keep working.

## Failure mode if missing

A DTO declares `<field>: { "minLength": 3, "maxLength": 64 }` but the
service uses the wrong validator (e.g. `min` instead of `minLength`).
Without per-rule flows, only the happy path is tested; the validator
silently accepts a 1-character string. The bug ships, the database
table has rows with single-character values, downstream code breaks.

Cross-field rules are the most under-tested. "If `<type>` is
`<premium>`, `<billingId>` is required" looks like a single rule but
is two flows: `type=premium, billingId=null` (must fail) and
`type=basic, billingId=null` (must succeed). Without both, the
spec's conditional requirement is invisible.

## JSON patterns

### Pattern 1 — per-field min/max length

```json
{
  "id": "<task-id>:<endpoint>-<field>-too-short",
  "description": "<field> below minLength rejects with 422",
  "actor": "<actor>",
  "steps": [
    {
      "request": {
        "method": "<verb>",
        "path": "<path>",
        "body": { "<field>": "<value-of-length-min-minus-1>" }
      },
      "expect": {
        "status": 422,
        "jsonpath": {
          "$.errors[*].field": "<field>",
          "$.errors[*].rule": "minLength"
        }
      }
    }
  ]
}
```

```json
{
  "id": "<task-id>:<endpoint>-<field>-too-long",
  "description": "<field> above maxLength rejects with 422",
  "actor": "<actor>",
  "steps": [
    {
      "request": {
        "method": "<verb>",
        "path": "<path>",
        "body": { "<field>": "<value-of-length-max-plus-1>" }
      },
      "expect": {
        "status": 422,
        "jsonpath": {
          "$.errors[*].field": "<field>",
          "$.errors[*].rule": "maxLength"
        }
      }
    }
  ]
}
```

Boundary discipline: emit `minLength - 1` AND `minLength` (positive),
`maxLength` (positive) AND `maxLength + 1`. Don't pick "obviously
small" / "obviously large"; pick boundary-adjacent.

### Pattern 2 — per-field regex

```json
{
  "id": "<task-id>:<endpoint>-<field>-regex-violation",
  "description": "<field> not matching <pattern> rejects with 422",
  "actor": "<actor>",
  "steps": [
    {
      "request": {
        "method": "<verb>",
        "path": "<path>",
        "body": { "<field>": "<value-violating-regex>" }
      },
      "expect": {
        "status": 422,
        "jsonpath": {
          "$.errors[*].field": "<field>",
          "$.errors[*].rule": "pattern"
        }
      }
    }
  ]
}
```

### Pattern 3 — per-field enum

```json
{
  "id": "<task-id>:<endpoint>-<field>-not-in-enum",
  "description": "<field> with value outside enum rejects with 422",
  "actor": "<actor>",
  "steps": [
    {
      "request": {
        "method": "<verb>",
        "path": "<path>",
        "body": { "<field>": "<value-not-in-enum>" }
      },
      "expect": {
        "status": 422,
        "jsonpath": {
          "$.errors[*].field": "<field>",
          "$.errors[*].rule": "enum"
        }
      }
    }
  ]
}
```

Add one positive flow per enum value (or `coverage_template` if there
are many — see [per-content-negotiation.md](per-content-negotiation.md)
for the matrix pattern).

### Pattern 4 — required vs nullable

```json
{
  "id": "<task-id>:<endpoint>-<field>-required",
  "description": "Missing required <field> rejects with 422",
  "actor": "<actor>",
  "steps": [
    {
      "request": {
        "method": "<verb>",
        "path": "<path>",
        "body": { "_other_fields_only": true }
      },
      "expect": {
        "status": 422,
        "jsonpath": {
          "$.errors[*].field": "<field>",
          "$.errors[*].rule": "required"
        }
      }
    }
  ]
}
```

```json
{
  "id": "<task-id>:<endpoint>-<field>-nullable-accepted",
  "description": "Explicit null on nullable <field> succeeds",
  "actor": "<actor>",
  "steps": [
    {
      "request": {
        "method": "<verb>",
        "path": "<path>",
        "body": { "<field>": null }
      },
      "expect": { "status": "<success>" }
    }
  ]
}
```

### Pattern 5 — per-field format (uuid/email/url)

```json
{
  "id": "<task-id>:<endpoint>-<field>-not-uuid",
  "description": "<field> with non-UUID value rejects with 422",
  "actor": "<actor>",
  "steps": [
    {
      "request": {
        "method": "<verb>",
        "path": "<path>",
        "body": { "<field>": "not-a-uuid" }
      },
      "expect": {
        "status": 422,
        "jsonpath": {
          "$.errors[*].field": "<field>",
          "$.errors[*].rule": { "oneOf": ["format", "uuid"] }
        }
      }
    }
  ]
}
```

### Pattern 6 — per-field type

```json
{
  "id": "<task-id>:<endpoint>-<field>-wrong-type",
  "description": "<field> with non-<expected-type> value rejects with 400",
  "actor": "<actor>",
  "steps": [
    {
      "request": {
        "method": "<verb>",
        "path": "<path>",
        "body": { "<field>": "<wrong-typed-value>" }
      },
      "expect": {
        "status": 400,
        "jsonpath": {
          "$.errors[*].field": "<field>"
        }
      }
    }
  ]
}
```

### Pattern 7 — per-field coercion (trim/lowercase)

```json
{
  "id": "<task-id>:<endpoint>-<field>-trims-whitespace",
  "description": "<field> with surrounding whitespace is trimmed and persisted",
  "actor": "<actor>",
  "steps": [
    {
      "request": {
        "method": "POST",
        "path": "<create-path>",
        "body": { "<field>": "  <value>  " }
      },
      "expect": {
        "status": 201,
        "jsonpath": { "$.<field>": "<value>" }
      }
    }
  ]
}
```

### Pattern 8 — cross-field conditional requirement

```json
{
  "id": "<task-id>:<endpoint>-<conditional-field>-required-when",
  "description": "<field-B> is required when <field-A> is <trigger-value>",
  "actor": "<actor>",
  "steps": [
    {
      "request": {
        "method": "<verb>",
        "path": "<path>",
        "body": { "<field-A>": "<trigger-value>" }
      },
      "expect": {
        "status": 422,
        "jsonpath": {
          "$.errors[*].field": "<field-B>",
          "$.errors[*].rule": "requiredWhen"
        }
      }
    }
  ]
}
```

```json
{
  "id": "<task-id>:<endpoint>-<conditional-field>-not-required-when-not",
  "description": "<field-B> not required when <field-A> is not <trigger-value>",
  "actor": "<actor>",
  "steps": [
    {
      "request": {
        "method": "<verb>",
        "path": "<path>",
        "body": { "<field-A>": "<other-value>" }
      },
      "expect": { "status": "<success>" }
    }
  ]
}
```

### Pattern 9 — cross-field mutual exclusion

```json
{
  "id": "<task-id>:<endpoint>-mutually-exclusive",
  "description": "<field-A> and <field-B> cannot both be set",
  "actor": "<actor>",
  "steps": [
    {
      "request": {
        "method": "<verb>",
        "path": "<path>",
        "body": { "<field-A>": "<value-A>", "<field-B>": "<value-B>" }
      },
      "expect": {
        "status": 422,
        "jsonpath": {
          "$.errors[*].rule": "mutuallyExclusive"
        }
      }
    }
  ]
}
```

### Pattern 10 — cross-field ordering

```json
{
  "id": "<task-id>:<endpoint>-end-before-start",
  "description": "<endDate> must be >= <startDate>",
  "actor": "<actor>",
  "steps": [
    {
      "request": {
        "method": "<verb>",
        "path": "<path>",
        "body": { "startDate": "<later>", "endDate": "<earlier>" }
      },
      "expect": {
        "status": 422,
        "jsonpath": {
          "$.errors[*].rule": { "oneOf": ["orderingViolation", "crossFieldOrdering"] }
        }
      }
    }
  ]
}
```

### Pattern 11 — enum drift forward-compat

```json
{
  "id": "<task-id>:<endpoint>-<field>-unknown-enum-value-rejected",
  "description": "Unknown enum value (forward compatibility) rejects deterministically",
  "actor": "<actor>",
  "steps": [
    {
      "request": {
        "method": "<verb>",
        "path": "<path>",
        "body": { "<field>": "<future-enum-value-not-yet-defined>" }
      },
      "expect": {
        "status": 422,
        "jsonpath": {
          "$.errors[*].rule": "enum"
        }
      }
    }
  ]
}
```

### Pattern 12 — enum drift backward-compat (legacy value still accepted)

If the spec promises a previously-accepted value continues to work
even after a soft deprecation:

```json
{
  "id": "<task-id>:<endpoint>-<field>-legacy-value-accepted",
  "description": "Legacy enum value <legacy> still accepted post-soft-deprecation",
  "actor": "<actor>",
  "steps": [
    {
      "request": {
        "method": "<verb>",
        "path": "<path>",
        "body": { "<field>": "<legacy-value>" }
      },
      "expect": { "status": "<success>" }
    }
  ]
}
```

## Worked example — registration DTO

> Spec for `POST /<users-collection>`:
>
> - `email`: required, format=email, lowercased on persist
> - `password`: required, minLength=12, maxLength=128, must contain digit
> - `role`: enum [user, admin, owner], default=user, required-when-tenant-set
> - `tenantId`: nullable; if `role=owner`, required

Floor: 12 flows (boundary discipline + every cross-field branch).

| Flow id | Body | Expected |
|---|---|---|
| `<task-id>:<users-collection>-email-missing` | `{ "password": "<valid>" }` | 422 (`email`, `required`) |
| `<task-id>:<users-collection>-email-format` | `{ "email": "not-an-email" }` | 422 (`email`, `format`) |
| `<task-id>:<users-collection>-email-lowercased` | `{ "email": "A@B.com" }` | 201 → persisted `a@b.com` |
| `<task-id>:<users-collection>-password-too-short` | `{ "password": "aaaaaaaaaaa1" }` (11 chars) | 422 (`password`, `minLength`) |
| `<task-id>:<users-collection>-password-boundary-min` | `{ "password": "aaaaaaaaaaaa1" }` (12 chars + digit) | 201 |
| `<task-id>:<users-collection>-password-too-long` | `{ "password": "<a × 129>" }` | 422 (`password`, `maxLength`) |
| `<task-id>:<users-collection>-password-no-digit` | `{ "password": "<a × 12>" }` | 422 (`password`, `pattern`) |
| `<task-id>:<users-collection>-role-not-in-enum` | `{ "role": "unknown" }` | 422 (`role`, `enum`) |
| `<task-id>:<users-collection>-role-default-user` | role omitted | 201 → persisted `user` |
| `<task-id>:<users-collection>-owner-needs-tenant` | `{ "role": "owner", "tenantId": null }` | 422 (`tenantId`, `requiredWhen`) |
| `<task-id>:<users-collection>-non-owner-no-tenant` | `{ "role": "user", "tenantId": null }` | 201 |
| `<task-id>:<users-collection>-role-required-when-tenant-set` | role omitted, tenantId set | 422 (`role`, `requiredWhen`) |

Boundary discipline matters: minLength=12 means `aaaaaaaaaaa1` (11)
fails AND `aaaaaaaaaaaa1` (12) succeeds. Without both, an off-by-one
in the validator (`length > 12` vs `length >= 12`) ships.
