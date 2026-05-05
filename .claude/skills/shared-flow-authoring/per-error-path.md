# §11.5 — Per declared error path

> Decision 11.5: For every error path the plan declares, emit a flow
> that triggers the path AND asserts the error envelope shape (code,
> message-shape, optional details).

## The rule (verbatim from Decision 11.5)

- ☐ Flow that triggers the error path with an explicit error envelope
      assertion (code, message-shape, optional details).

## Failure mode if missing

Status code alone is not enough. Two production-shipped bugs are
invisible without envelope assertion:

1. Server returns the right status but a wrong-shape body
   (`{ "error": "..." }` instead of `{ "code", "message", "details" }`).
   Clients deserialise to a model that has `code` as a required field;
   they crash. Status 422 was correct; envelope was not.
2. Server returns the right status and shape but the `code` is wrong
   (`UNKNOWN_ERROR` instead of `EMAIL_TAKEN`). Clients route the user
   to the generic error page instead of "this email is already in
   use." Status was correct; semantic was lost.

## JSON patterns

### Pattern 1 — generic error envelope assertion

```json
{
  "id": "<task-id>:<endpoint>-<error-name>",
  "description": "<error description from the spec>",
  "actor": "<actor>",
  "setup": [
    { "_note": "preconditions that trigger the error" }
  ],
  "steps": [
    {
      "request": {
        "method": "<verb>",
        "path": "<path>",
        "body": { "<error-trigger>": true }
      },
      "expect": {
        "status": "<expected>",
        "jsonpath": {
          "$.code": "<expected-error-code>",
          "$.message": { "type": "string" },
          "$.details": { "type": "object" }
        }
      }
    }
  ]
}
```

### Pattern 2 — declared error fields via `_shared.error_envelope`

If the project declares the error envelope shape once in `_shared.json`:

```json
{
  "error_envelope": {
    "fields": ["code", "message", "details", "traceId"]
  }
}
```

Then per-error flows use the `field_error` matcher:

```json
{
  "id": "<task-id>:<endpoint>-<error-name>",
  "description": "<error description>",
  "actor": "<actor>",
  "steps": [
    {
      "request": {
        "method": "<verb>",
        "path": "<path>",
        "body": { "<error-trigger>": true }
      },
      "expect": {
        "status": "<expected>",
        "jsonpath": {
          "$": { "field_error": "<expected-code>" }
        }
      }
    }
  ]
}
```

### Pattern 3 — per-field validation envelope

```json
{
  "id": "<task-id>:<endpoint>-<field>-<rule>",
  "description": "<field> violates <rule>; envelope names the field",
  "actor": "<actor>",
  "steps": [
    {
      "request": {
        "method": "<verb>",
        "path": "<path>",
        "body": { "<field>": "<invalid-value>" }
      },
      "expect": {
        "status": 422,
        "jsonpath": {
          "$.code": "VALIDATION_ERROR",
          "$.details.errors[*].field": "<field>",
          "$.details.errors[*].rule": "<rule-name>"
        }
      }
    }
  ]
}
```

### Pattern 4 — error path with traceId capture

When the spec promises every error envelope carries a `traceId`:

```json
{
  "id": "<task-id>:<endpoint>-<error-name>-trace",
  "description": "<error envelope> includes a non-empty traceId",
  "actor": "<actor>",
  "steps": [
    {
      "request": {
        "method": "<verb>",
        "path": "<path>",
        "body": { "<error-trigger>": true }
      },
      "expect": {
        "status": "<expected>",
        "jsonpath": {
          "$.code": "<expected-error-code>",
          "$.traceId": { "matches": "^[a-f0-9-]{16,}$" }
        }
      }
    }
  ]
}
```

## Worked example — registration with email collision

> Spec: `POST /<users-collection>` rejects with 409 + `code:
> EMAIL_TAKEN` + `details.email: <input-email>` when the email is
> already registered.

```json
{
  "id": "<task-id>:<users-collection>-create-email-taken",
  "description": "Re-registering an existing email returns 409 with EMAIL_TAKEN",
  "actor": "anonymous",
  "setup": [
    {
      "create": "<user>",
      "by": "<admin>",
      "capture": "$existing",
      "body": { "email": "<existing-email>" }
    }
  ],
  "steps": [
    {
      "request": {
        "method": "POST",
        "path": "/<users-collection>",
        "body": {
          "email": "<existing-email>",
          "password": "<valid-password>"
        }
      },
      "expect": {
        "status": 409,
        "jsonpath": {
          "$.code": "EMAIL_TAKEN",
          "$.message": { "type": "string", "length_gte": 1 },
          "$.details.email": "<existing-email>",
          "$.traceId": { "matches": "^[a-f0-9-]{16,}$" }
        }
      }
    }
  ]
}
```

The minimum bar for §11.5 on this endpoint is one flow per declared
error code. If the spec lists `EMAIL_TAKEN`, `WEAK_PASSWORD`,
`RATE_LIMITED`, `BANNED_DOMAIN`, that is four flows — one per code.

The shape assertion (`$.code`, `$.message`, `$.details.<field>`) is
what catches envelope drift. Status alone (`status: 409`) is
insufficient.
