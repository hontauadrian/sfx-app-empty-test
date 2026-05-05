# §11.1 — Per endpoint introduced or modified

> Decision 11.1: For any endpoint `<endpoint>`, generate flows that
> exercise the happy path, every declared status code, cross-tenant
> denial (if applicable), the auth permutation matrix, non-JSON
> response surfaces, and any header-keyed contract.

## The rule (verbatim from Decision 11.1)

For any endpoint introduced or modified by the diff, you MUST emit
flows that satisfy:

- ☐ **Happy path** with the expected `<actor>`. Status 2xx, body matches
      the response DTO. Use the most-privileged actor authorised by the
      spec.
- ☐ **Each declared `<status-code>`** in the API surface — every 2xx,
      3xx, 4xx, 5xx the endpoint can return is the assertion target of
      at least one flow:
      - **2xx** — 200, 201, 202, 204, 206
      - **3xx** — 301, 302, 303, 304, 307, 308
      - **4xx** — 400, 401, 402, 403, 404, 405, 406, 408, 409, 410,
        412, 413, 415, 422, 428, 429, 451
      - **5xx** — 500, 501, 502, 503, 504 — only when the spec promises
        a recoverable / shaped response.
- ☐ **Cross-tenant test** if `<resource>` has tenant boundaries.
- ☐ **Auth-bypass test.** Anonymous request → expected 401, never 200.
- ☐ **Auth permutation matrix** — present-and-valid, absent, expired,
      malformed, revoked, wrong-issuer, wrong-audience, missing-scope.
- ☐ **Non-JSON response surface** — assert `Content-Type`,
      `Content-Disposition` (when applicable), and one body-shape
      primitive.
- ☐ **Header-keyed contract** — declare any header beyond
      `Authorization` that affects behaviour.

## Failure mode if missing

If the endpoint declares a status (`@ApiResponse`, OpenAPI `responses`)
but no flow asserts it, the probe runs green for an endpoint that the
contract claims behaves a certain way, with **no evidence**. Builders
ship code that "passes the probe" without ever exercising the 422 path.
Customers hit 422 in production and the team discovers the error
envelope is wrong.

If the auth-bypass flow is missing, an endpoint that was protected can
silently lose its guard (decorator deleted in a refactor) and the
probe will not catch it — there is no flow asserting `anonymous → 401`.

## JSON patterns (paste-ready, abstract)

### Pattern 1 — happy path

```json
{
  "id": "<task-id>:<actor>-creates-<resource>",
  "description": "Authenticated <actor> can create a <resource>",
  "actor": "<actor-name>",
  "steps": [
    {
      "request": {
        "method": "POST",
        "path": "<create-path>",
        "body": { "<field>": "<value>" }
      },
      "expect": {
        "status": 201,
        "jsonpath": {
          "$.<owner-field>": "${<actor>.id}"
        }
      }
    }
  ]
}
```

### Pattern 2 — each declared 4xx (validation 400 / 422)

```json
{
  "id": "<task-id>:<endpoint>-invalid-input",
  "description": "<endpoint> rejects invalid input with 400 (or 422)",
  "actor": "<actor>",
  "steps": [
    {
      "request": {
        "method": "<verb>",
        "path": "<path>",
        "body": { "<field>": "<invalid-value>" }
      },
      "expect": {
        "status": 400,
        "jsonpath": {
          "$.errors[*].field": "<expected-field-name>"
        }
      }
    }
  ]
}
```

Use `422` instead of `400` when the spec promises semantic-validation
status codes.

### Pattern 3 — anonymous bypass (401)

```json
{
  "id": "<task-id>:<endpoint>-anonymous-blocked",
  "description": "Anonymous request to <endpoint> returns 401",
  "actor": "anonymous",
  "steps": [
    {
      "request": { "method": "<verb>", "path": "<path>", "body": {} },
      "expect": { "status": 401 }
    }
  ]
}
```

### Pattern 4 — forbidden (403)

```json
{
  "id": "<task-id>:<endpoint>-insufficient-role",
  "description": "<other-role> cannot perform <action> on <resource>",
  "actor": "<actor-with-other-role>",
  "steps": [
    {
      "request": { "method": "<verb>", "path": "<path>", "body": {} },
      "expect": { "status": 403 }
    }
  ]
}
```

### Pattern 5 — not found / hidden (404)

```json
{
  "id": "<task-id>:<endpoint>-missing-resource",
  "description": "<verb> against an id no flow has captured returns 404",
  "actor": "<actor>",
  "steps": [
    {
      "request": { "method": "<verb>", "path": "<path-with-fake-id>", "body": {} },
      "expect": { "status": 404 }
    }
  ]
}
```

### Pattern 6 — conflict / version mismatch (409)

```json
{
  "id": "<task-id>:<endpoint>-conflict",
  "description": "<verb> against <resource> in conflicting state returns 409",
  "actor": "<actor>",
  "setup": [
    { "create": "<resource>", "by": "<actor>", "capture": "$id" },
    { "create": "<resource>", "by": "<actor>", "body": { "<unique-field>": "<same-value>" } }
  ],
  "steps": [
    {
      "request": {
        "method": "POST",
        "path": "<create-path>",
        "body": { "<unique-field>": "<same-value>" }
      },
      "expect": { "status": 409 }
    }
  ]
}
```

### Pattern 7 — gone / consumed / expired (410)

```json
{
  "id": "<task-id>:<endpoint>-token-consumed",
  "description": "Re-use of a one-shot token returns 410",
  "actor": "anonymous",
  "setup": [
    { "create": "<token-resource>", "capture": "$token" },
    {
      "request": {
        "method": "POST",
        "path": "<consume-path>",
        "body": { "token": "${token}" }
      }
    }
  ],
  "steps": [
    {
      "request": {
        "method": "POST",
        "path": "<consume-path>",
        "body": { "token": "${token}" }
      },
      "expect": { "status": 410 }
    }
  ]
}
```

### Pattern 8 — payload too large (413)

```json
{
  "id": "<task-id>:<endpoint>-oversize",
  "description": "<endpoint> rejects payload over <limit> with 413",
  "actor": "<actor>",
  "steps": [
    {
      "request": {
        "method": "<verb>",
        "path": "<path>",
        "body_builder": {
          "kind": "repeat",
          "n": "<count-over-limit>",
          "item": { "<field>": "<value>" },
          "wrap": "items"
        }
      },
      "expect": { "status": 413 }
    }
  ]
}
```

### Pattern 9 — unsupported media type (415)

```json
{
  "id": "<task-id>:<endpoint>-wrong-media-type",
  "description": "<endpoint> rejects non-JSON body with 415",
  "actor": "<actor>",
  "steps": [
    {
      "request": {
        "method": "<verb>",
        "path": "<path>",
        "bodyKind": "text",
        "body": "<plain text>",
        "headers": { "Content-Type": "text/plain" }
      },
      "expect": { "status": 415 }
    }
  ]
}
```

### Pattern 10 — semantic validation (422)

```json
{
  "id": "<task-id>:<endpoint>-semantic-violation",
  "description": "Well-formed body that violates business rule returns 422",
  "actor": "<actor>",
  "steps": [
    {
      "request": {
        "method": "<verb>",
        "path": "<path>",
        "body": { "<semantically-invalid-combo>": true }
      },
      "expect": {
        "status": 422,
        "jsonpath": {
          "$.errors[*].code": "<expected-error-code>"
        }
      }
    }
  ]
}
```

### Pattern 11 — rate-limited (429 with Retry-After)

```json
{
  "id": "<task-id>:<endpoint>-rate-limited",
  "description": "After <N> calls, <endpoint> returns 429 with Retry-After",
  "actor": "<actor>",
  "steps": [
    {
      "loop": "<N>",
      "request": { "method": "<verb>", "path": "<path>", "body": {} }
    },
    {
      "request": { "method": "<verb>", "path": "<path>", "body": {} },
      "expect": {
        "status": 429,
        "headers": {
          "Retry-After": { "matches": "^\\d+$" }
        }
      }
    }
  ]
}
```

### Pattern 12 — non-JSON response (CSV/PDF/octet-stream)

```json
{
  "id": "<task-id>:<endpoint>-csv-export",
  "description": "<endpoint> returns CSV with declared shape",
  "actor": "<actor>",
  "steps": [
    {
      "request": {
        "method": "GET",
        "path": "<export-path>",
        "headers": { "Accept": "text/csv" }
      },
      "expect": {
        "status": 200,
        "headers": {
          "Content-Type": { "matches": "^text/csv" },
          "Content-Disposition": { "contains": "attachment" }
        },
        "body": {
          "contains": "<header-row>",
          "lines": { "length_gte": 1 }
        }
      }
    }
  ]
}
```

### Pattern 13 — header-keyed contract (Idempotency-Key)

```json
{
  "resources": {
    "<resource>": {
      "create": {
        "method": "POST",
        "path": "<create-path>",
        "body": {}
      },
      "requires": {
        "headers": ["Idempotency-Key"]
      }
    }
  },
  "special_flows": [
    {
      "id": "<task-id>:<resource>-idempotency-replay",
      "description": "Same Idempotency-Key + same body returns the cached response",
      "actor": "<actor>",
      "steps": [
        {
          "request": {
            "method": "POST",
            "path": "<create-path>",
            "headers": { "Idempotency-Key": "${uniqUuid:replay-key}" },
            "body": { "<field>": "<value>" }
          },
          "capture": { "bindings": { "firstResp": "$" } },
          "expect": { "status": 201 }
        },
        {
          "request": {
            "method": "POST",
            "path": "<create-path>",
            "headers": { "Idempotency-Key": "${uniqUuid:replay-key}" },
            "body": { "<field>": "<value>" }
          },
          "expect": {
            "status": 200,
            "headers": { "Idempotency-Replay": "true" },
            "equalsCapture": "${firstResp.body}"
          }
        }
      ]
    }
  ]
}
```

## Worked example — a single endpoint, full §11.1 coverage

For an endpoint `POST /<collection>` that:

- Requires authenticated `<actor>` with `<role-X>`.
- Returns 201 / 400 / 401 / 403 / 409 / 422 / 429.
- Is multi-tenant.

The minimum §11.1 set is 9 flows:

| Flow id | Status | Asserts |
|---|---|---|
| `<task-id>:<resource>-create-happy` | 201 | DTO shape + tenant scoping |
| `<task-id>:<resource>-create-bad-input` | 400 | error envelope names field |
| `<task-id>:<resource>-create-anonymous` | 401 | anonymous bypass blocked |
| `<task-id>:<resource>-create-wrong-role` | 403 | role denial |
| `<task-id>:<resource>-create-cross-tenant` | 403 OR 404 | tenant denial (per spec) |
| `<task-id>:<resource>-create-conflict` | 409 | unique-constraint duplicate |
| `<task-id>:<resource>-create-semantic` | 422 | business-rule violation |
| `<task-id>:<resource>-create-rate-limited` | 429 | `Retry-After` populated |
| `<task-id>:<resource>-create-expired-token` | 401 | uses `fixtures.expired-token` |

Add §11.6 (positive + negative side-effect on `audit-log`) if the spec
promises one. Add §11.8 (idempotency replay + conflict) if the
endpoint declares `Idempotency-Key`. Add §11.12 (multipart) if the body
is multipart instead of JSON.
