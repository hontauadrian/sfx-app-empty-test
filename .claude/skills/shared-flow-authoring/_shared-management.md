# `_shared.json` — coordinator ownership

> Per Open Question 1: coordinator owns `_shared.json`. The file
> contains entities that span multiple feature files and would
> otherwise force every lead to redeclare the same shape.

## What lives in `_shared.json`

| Section | Purpose | Example entries |
|---|---|---|
| `actors` | Global actor identities used across multiple features | `anonymous`, `authenticated-user`, `<role-name>` |
| `resources` | Cross-feature resources (rare — most resources are feature-local) | `<tenant>`, `<organisation>`, `<user>` if every feature touches the user table |
| `fixtures` | Named fixture references that more than one feature consumes | `expired-token`, `malformed-token`, `revoked-refresh`, `small-png`, `large-pdf` |
| `config.envelope` | Project-wide success/error wrapper paths (Decision 17 P1-10) | `{ "successWrapper": ["data"], "errorWrapper": ["error"] }` |
| `test_endpoints` | Mounted-only-in-test endpoints for clock advance, mailbox inspection, webhook log, downstream log, etc. (Decision 14, 15, 17 P1-9) | `clockAdvance`, `mailbox`, `webhookLog`, `downstreamLog`, `freezeAt` |

## File metadata

`_shared.json` does NOT carry a `task_id` — it is global. Mark the
file with a sentinel:

```json
{
  "version": 1,
  "task_id": "_shared",
  "owns": [
    { "actor": "<admin-actor>" },
    { "actor": "<service-account>" },
    { "resource": "<tenant>" }
  ]
}
```

The loader treats any file named `_shared.json` as the global
declaration root. Every other feature file may `extends` entries from
it without naming the source file:

```json
{
  "extends": [
    { "actor": "<admin-actor>" }
  ]
}
```

## Section: `actors`

Declare every actor that more than one feature uses. Per-feature actors
stay in the feature file.

```json
{
  "owns": [
    { "actor": "anonymous" },
    { "actor": "authenticated-user" },
    { "actor": "<role-name>" }
  ],
  "actors": [
    {
      "name": "anonymous",
      "auth": { "scheme": "anonymous" }
    },
    {
      "name": "<role-name>",
      "auth": {
        "scheme": "bearer-in-body",
        "login": {
          "path": "${env:OAUTH_ISSUER_URL}/protocol/openid-connect/token",
          "contentType": "application/x-www-form-urlencoded",
          "body": {
            "grant_type": "password",
            "client_id": "${env:OAUTH2_PROXY_CLIENT_ID}",
            "client_secret": "${env:OAUTH2_PROXY_CLIENT_SECRET}",
            "username": "${env:TEST_ROLE_USER_EMAIL}",
            "password": "${env:TEST_ROLE_USER_PASSWORD}",
            "scope": "openid"
          },
          "key": "$.access_token"
        }
      }
    }
  ]
}
```

Actors are an ARRAY, not an object map. Do not use stale `role` /
`credentials` keys. The `auth` object is a discriminated union on
`scheme`; every non-anonymous actor that a flow can reference needs the
fields required by that scheme.

Generated-app Keycloak actors require an existing Keycloak role and a
seeded user. Before declaring a role actor, verify:

- `infra/keycloak/manifest.json` includes the role under the API client.
- `infra/keycloak/dev-seed.json` assigns the role to a user.
- The actor name is stable and matches flow bindings exactly
  (`<role-name>`, not `<role-name>-actor` in one file and
  `<role-name>` in another).

## Section: `resources`

Reserve `_shared.json` resources for entities that genuinely span
features. Most resources are feature-local — they belong in the
feature's own `<task-id>.json`.

Common shared candidates:

- `<tenant>` — every multi-tenant feature references it.
- `<organisation>` if your domain layers tenants under organisations.
- `<user>` if every feature seeds a user before testing.

Feature-local candidates that should NOT be in `_shared.json`:

- A `<resource>` only used by its own CRUD endpoints. Even if two
  features reference it, the second feature can `extends` from the
  first feature's file by name.

```json
{
  "resources": {
    "<tenant>": {
      "create": {
        "method": "POST",
        "path": "/<tenant-collection>",
        "actor": "<admin-actor>",
        "body": { "name": "<tenant-name>" }
      },
      "capture": { "bindings": { "id": "$.id" } },
      "routes": {
        "get":    "GET /<tenant-collection>/${id}",
        "update": "PATCH /<tenant-collection>/${id}",
        "delete": "DELETE /<tenant-collection>/${id}"
      }
    }
  }
}
```

## Section: `fixtures`

Named fixtures resolve to file paths or token literals. Used by:

- multipart upload steps (`fixtureRef: "small-png"`).
- auth permutations (`expired-token`, `malformed-token`, `revoked-
  refresh` — Decision 17 P0-6).
- body-shape comparison (`bodyMatchesFixture: "<fixture-name>"`).

```json
{
  "fixtures": {
    "expired-token": {
      "kind": "bearer-token",
      "value": "<deterministic-expired-token-string>"
    },
    "malformed-token": {
      "kind": "bearer-token",
      "value": "not.a.real.jwt"
    },
    "revoked-refresh": {
      "kind": "bearer-token",
      "value": "<deterministic-revoked-refresh-string>"
    },
    "small-png": {
      "kind": "file",
      "path": "<test-fixtures-dir>/small.png",
      "mimeType": "image/png"
    },
    "large-pdf": {
      "kind": "file",
      "path": "<test-fixtures-dir>/over-limit.pdf",
      "mimeType": "application/pdf"
    }
  }
}
```

`<test-fixtures-dir>` is whatever the project conventions specify (the
bootstrap reads it from `flows.config.json`). Keep fixture file names
short and self-describing — they appear in flow ids and probe output.

## Section: `config.envelope`

Decision 17 P1-10 — when every feature responds with the same error
or success wrapper, declare it once. Derive it from the actual
`GlobalExceptionFilter` and `TransformInterceptor`; do not guess from a
plan or mark it TBD when those files exist.

```json
{
  "config": {
    "envelope": {
      "successWrapper": ["data"],
      "errorWrapper": ["error"]
    }
  }
}
```

In this boilerplate, `TransformInterceptor.ENVELOPE` wraps success
responses as `{ "success": true, "data": ... }`, and
`GlobalExceptionFilter` wraps errors as
`{ "success": false, "error": { "statusCode": <number>, "message": <string> } }`.

```json
{
  "expect": {
    "status": 422,
    "errorEnvelope": { "messageMatches": "required" }
  }
}
```

This decouples per-feature flows from the project's chosen envelope.
Changing the wrapper paths later only requires editing this single
declaration.

## Section: `test_endpoints`

Decision 14 + Decision 15 + Decision 17 P1-9 — when the project mounts
test-only endpoints (clock advance, mailbox inspection, webhook log,
freezeAt), declare them here so per-feature flows can reference them
by name without leaking the route.

```json
{
  "test_endpoints": {
    "clockAdvance": {
      "method": "POST",
      "path": "/__test/clock/advance",
      "actor": "<admin-actor>",
      "body_template": { "ms": "<ms>" }
    },
    "freezeAt": {
      "method": "POST",
      "path": "/__test/clock/freeze",
      "actor": "<admin-actor>",
      "body_template": { "iso": "<iso-timestamp>" }
    },
    "mailbox": {
      "method": "GET",
      "path": "/__test/mailbox?to=<email>",
      "actor": "<admin-actor>"
    },
    "webhookLog": {
      "method": "GET",
      "path": "/__test/webhooks?since=<iso-timestamp>",
      "actor": "<admin-actor>"
    },
    "downstreamLog": {
      "method": "GET",
      "path": "/__test/downstream?service=<name>",
      "actor": "<admin-actor>"
    }
  }
}
```

Per-feature flows then reference by name:

```json
{
  "wait": { "advanceMs": 1500, "via": "test_endpoint:clockAdvance" }
}
```

```json
{
  "expect": {
    "sideEffects": [
      { "kind": "email-sent", "verifiedBy": "test_endpoint:mailbox", "to": "<email>" }
    ]
  }
}
```

The runner resolves the `test_endpoint:<name>` indirection at flow
load time. If the test endpoint isn't mounted in the current
environment, the runner emits `TEST_ENDPOINT_UNAVAILABLE` so the
flow fails loudly instead of silently no-oping.

## When a lead asks for a `_shared.json` change

Three escalation forms arrive in your inbox:

| Mail type | Subject pattern | Your response |
|---|---|---|
| `flow_escalation` | `shared <actor/resource> needed in _shared.json` | Add the entity per the lead's proposed shape, commit `flows(_shared): add <entity>`, reply `flow_update` to the lead with the SHA |
| `flow_escalation` | `spec ambiguity: <feature> §<heading>` | Read the spec section + the feature's `<task-id>.json`. Decide. Reply `flow_update` (with the resolution) or escalate further if the spec is genuinely incomplete |
| `flow_escalation` | `cross-feature flow needed: <interaction>` | Decide which feature file owns the cross-task flow per [cross-task-flows.md](cross-task-flows.md), reply with placement decision |

You can also receive `flow_escalation` mails from a builder when the
lead is unresponsive — the builder describes the original
`flow_mismatch` thread. Triage first by checking whether the lead is
unreachable; if so, take the lead's authoring action yourself.

## Failure modes specific to `_shared.json`

| Symptom | Diagnosis |
|---|---|
| `FLOW_MERGE_CONFLICT` between `_shared.json` and a feature file | Feature file declared an entity that should have been in `_shared.json` from the start. Move the declaration, replace with `extends` in the feature file. |
| `FLOW_FILE_MISSING_OWNS_OR_EXTENDS` for an actor used by 3+ feature files | Promote the actor from per-feature `extends`-chains into `_shared.json`'s `owns`. Update each feature's `extends` to reference the new shared entity. |
| Two different leads request the same `<actor>` with different credentials | Decision: rename one (`<actor>-A` vs `<actor>-B`) or pick one canonical. Reply with the choice; both leads update their `extends`. |
| Test-endpoint name collision (two leads named theirs `clockAdvance`) | Names live in `_shared.json` only. Rename per-feature uses to match. |
