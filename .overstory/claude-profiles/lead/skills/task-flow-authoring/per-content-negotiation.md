# §11.15 — Per content-negotiation surface

> Decision 11.15: Accept variants + Content-Type rejection + Accept-
> Language + custom required headers + CORS preflight + Cache-Control.

## The rule (verbatim from Decision 11.15)

- ☐ `Accept` mismatch → 406.
- ☐ `Accept` versioned variant routes to the versioned handler.
- ☐ `Content-Type` rejection on POST → 415.
- ☐ `Accept-Language` localisation.
- ☐ Custom required headers (missing / wrong format).
- ☐ CORS preflight (OPTIONS).
- ☐ `Cache-Control` declared on read endpoints (overlap with §11.13).

## Decision 17 P1-11 — coverage_template for matrix expansion

When the same shape applies across multiple values (3 Accept variants,
4 locales), use `coverage_template`. The expander emits one flow per
value in `over`. `over` accepts arrays or maps for matrix expansion
across multiple axes.

```json
{
  "coverage_template": {
    "template": {
      "id": "<task-id>:<endpoint>-accept-${variant}",
      "description": "<endpoint> with Accept=${variant} returns Content-Type=${variant}",
      "actor": "<actor>",
      "steps": [
        {
          "request": { "method": "GET", "path": "<path>", "headers": { "Accept": "${variant}" } },
          "expect": {
            "status": 200,
            "headers": { "Content-Type": { "matches": "^${variant}" } }
          }
        }
      ]
    },
    "over": {
      "variant": ["application/json", "application/xml", "text/csv"]
    }
  }
}
```

## Failure mode if missing

A versioned endpoint declared `application/vnd.api.v2+json` is silently
served by the v1 handler because nobody tested the version dispatch.
v2 clients see v1 responses and fail to deserialise.

CORS preflight is the most-skipped row. A new endpoint without `OPTIONS
<path>` returning the right `Access-Control-Allow-Methods` headers
breaks the browser's preflight check; the front-end can't call the
endpoint at all. The probe never sent OPTIONS, so it's invisible.

## JSON patterns

### Pattern 1 — Accept variant (200 with declared content-type)

```json
{
  "id": "<task-id>:<endpoint>-accept-json",
  "description": "Accept: application/json returns JSON",
  "actor": "<actor>",
  "steps": [
    {
      "request": { "method": "GET", "path": "<path>", "headers": { "Accept": "application/json" } },
      "expect": {
        "status": 200,
        "headers": { "Content-Type": { "matches": "^application/json" } }
      }
    }
  ]
}
```

```json
{
  "id": "<task-id>:<endpoint>-accept-csv",
  "description": "Accept: text/csv returns CSV",
  "actor": "<actor>",
  "steps": [
    {
      "request": { "method": "GET", "path": "<path>", "headers": { "Accept": "text/csv" } },
      "expect": {
        "status": 200,
        "headers": { "Content-Type": { "matches": "^text/csv" } },
        "body": { "contains": "<expected-header-row>" }
      }
    }
  ]
}
```

### Pattern 2 — Accept mismatch (406)

```json
{
  "id": "<task-id>:<endpoint>-accept-unsupported",
  "description": "Accept: application/xml returns 406 when not supported",
  "actor": "<actor>",
  "steps": [
    {
      "request": { "method": "GET", "path": "<path>", "headers": { "Accept": "application/xml" } },
      "expect": { "status": 406 }
    }
  ]
}
```

### Pattern 3 — Versioned Accept (vendor-prefixed)

```json
{
  "id": "<task-id>:<endpoint>-accept-v2",
  "description": "Accept: application/vnd.<vendor>.v2+json routes to v2 handler",
  "actor": "<actor>",
  "steps": [
    {
      "request": {
        "method": "GET",
        "path": "<path>",
        "headers": { "Accept": "application/vnd.<vendor>.v2+json" }
      },
      "expect": {
        "status": 200,
        "headers": { "Content-Type": { "matches": "vnd\\.<vendor>\\.v2\\+json" } },
        "jsonpath": {
          "$.apiVersion": "v2"
        }
      }
    }
  ]
}
```

`$.apiVersion: "v2"` is a v2-only field — its presence proves the
routing dispatched correctly.

### Pattern 4 — Content-Type rejection on POST (415)

```json
{
  "id": "<task-id>:<endpoint>-content-type-rejected",
  "description": "POST with Content-Type: text/plain rejects with 415",
  "actor": "<actor>",
  "steps": [
    {
      "request": {
        "method": "POST",
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

### Pattern 5 — Accept-Language localisation

```json
{
  "id": "<task-id>:<endpoint>-accept-language-en",
  "description": "Accept-Language: en-US returns English error message",
  "actor": "<actor>",
  "steps": [
    {
      "request": {
        "method": "<verb>",
        "path": "<path>",
        "headers": { "Accept-Language": "en-US" },
        "body": { "<invalid-field>": "<invalid-value>" }
      },
      "expect": {
        "status": 422,
        "jsonpath": {
          "$.message": { "matches": "^[A-Za-z]" }
        }
      }
    }
  ]
}
```

For Japanese, the regex matches kana / kanji ranges:

```json
{
  "id": "<task-id>:<endpoint>-accept-language-ja",
  "description": "Accept-Language: ja returns Japanese error message",
  "actor": "<actor>",
  "steps": [
    {
      "request": {
        "method": "<verb>",
        "path": "<path>",
        "headers": { "Accept-Language": "ja" },
        "body": { "<invalid-field>": "<invalid-value>" }
      },
      "expect": {
        "status": 422,
        "jsonpath": {
          "$.message": { "matches": "[\\u3040-\\u309f\\u30a0-\\u30ff\\u4e00-\\u9faf]" }
        }
      }
    }
  ]
}
```

### Pattern 6 — Custom required header (missing)

The `X-<header-name>` is deliberately omitted from `headers`.

```json
{
  "id": "<task-id>:<endpoint>-missing-custom-header",
  "description": "Missing required X-<header-name> returns 400",
  "actor": "<actor>",
  "steps": [
    {
      "request": { "method": "<verb>", "path": "<path>", "body": { } },
      "expect": {
        "status": 400,
        "jsonpath": {
          "$.errors[*].header": "X-<header-name>"
        }
      }
    }
  ]
}
```

### Pattern 7 — Custom required header (malformed)

```json
{
  "id": "<task-id>:<endpoint>-malformed-custom-header",
  "description": "Wrong-format X-<header-name> returns 400",
  "actor": "<actor>",
  "steps": [
    {
      "request": {
        "method": "<verb>",
        "path": "<path>",
        "headers": { "X-<header-name>": "<malformed-value>" },
        "body": { }
      },
      "expect": { "status": 400 }
    }
  ]
}
```

### Pattern 8 — CORS preflight (OPTIONS)

```json
{
  "id": "<task-id>:<endpoint>-cors-preflight",
  "description": "OPTIONS preflight returns required Access-Control-* headers",
  "actor": "anonymous",
  "steps": [
    {
      "request": {
        "method": "OPTIONS",
        "path": "<path>",
        "headers": {
          "Origin": "https://<allowed-origin>",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "Content-Type, Authorization"
        }
      },
      "expect": {
        "status": 204,
        "headers": {
          "Access-Control-Allow-Origin": "https://<allowed-origin>",
          "Access-Control-Allow-Methods": { "contains": "POST" },
          "Access-Control-Allow-Headers": { "contains": "Content-Type" }
        }
      }
    }
  ]
}
```

```json
{
  "id": "<task-id>:<endpoint>-cors-preflight-disallowed-origin",
  "description": "OPTIONS from disallowed origin omits Access-Control-Allow-Origin",
  "actor": "anonymous",
  "steps": [
    {
      "request": {
        "method": "OPTIONS",
        "path": "<path>",
        "headers": {
          "Origin": "https://<disallowed-origin>",
          "Access-Control-Request-Method": "POST"
        }
      },
      "expect": {
        "status": 204,
        "headers": {
          "Access-Control-Allow-Origin": { "absent": true }
        }
      }
    }
  ]
}
```

### Pattern 9 — Cache-Control declared

```json
{
  "id": "<task-id>:<read-endpoint>-cache-control-declared",
  "description": "Read endpoint declares Cache-Control: max-age=<N>, ETag",
  "actor": "<actor>",
  "setup": [
    { "create": "<resource>", "by": "<actor>", "capture": "$id" }
  ],
  "steps": [
    {
      "request": { "method": "GET", "path": "<get-path-with-${id}>" },
      "expect": {
        "status": 200,
        "headers": {
          "Cache-Control": { "matches": "max-age=<N>" },
          "ETag": { "matches": "^(W/)?\".*\"$" },
          "Last-Modified": { "matches": "^[A-Z][a-z]{2}, " }
        }
      }
    }
  ]
}
```

## Worked example — full §11.15 coverage on a multi-format endpoint

> Spec: `GET /<list-collection>` supports `application/json` (default),
> `application/vnd.<vendor>.v2+json`, `text/csv`. POST endpoints
> require `Content-Type: application/json`. Localised error messages
> via `Accept-Language` (en, ja). CORS allowed for `https://<allowed-
> origin>` only.

Floor: 9 flows (matches §11.15's 7-row checklist + accept matrix).

| Flow id | Asserts |
|---|---|
| `<task-id>:<list-collection>-accept-json` | default JSON content-type |
| `<task-id>:<list-collection>-accept-v2-json` | v2 vendor-prefixed routes correctly |
| `<task-id>:<list-collection>-accept-csv` | CSV content-type |
| `<task-id>:<list-collection>-accept-unsupported` | XML → 406 |
| `<task-id>:<list-collection>-content-type-rejected` | POST text/plain → 415 |
| `<task-id>:<list-collection>-accept-language-en` | English error |
| `<task-id>:<list-collection>-accept-language-ja` | Japanese error |
| `<task-id>:<list-collection>-cors-preflight-allowed` | allowed-origin returns CORS headers |
| `<task-id>:<list-collection>-cors-preflight-disallowed` | disallowed-origin omits CORS headers |

Use `coverage_template` for the three Accept variants if the body
shape is identical — it collapses three flows into one declaration.
