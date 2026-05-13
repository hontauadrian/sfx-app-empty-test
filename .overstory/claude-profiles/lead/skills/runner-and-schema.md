# runner-and-schema

## Implementation status (read first)

The probe-flows v3 plan ships features in phases. Today only the HTTP
module is fully wired. Stick to what the runner backs; everything else
the schema accepts but the runner ignores or stubs.

**Runner-backed today:**
- Step kinds: `api`, `expect`, `capture`, `setAuth`, `logout`, `wait`,
  `poll`, `assertIdempotent`. (`navigate` is a no-op stub.)
- `expect` matchers: `status`, `statusAnyOf`, `statusBetween`,
  `bodyHas`, `bodyIsArray`, `bodyShape`, `headerHas`, `forbidden`.
- Matchers: literals, `{absent}`, `{oneOf}`, `{matches}`, `{type}`.
- Resource fields used by setup/runtime: `name`, `kind`, `create`,
  `capture`, `parents`. `setup[].by` works only on entries that also
  declare `create`; it is not a standalone actor-selection mechanism.
- Config: `reservedActors`, `clockAdvanceEndpoint`, `fixturesRoot`,
  `cookieJar.allowSecureOnHttp`, `envelope.successWrapper`.
- Cookie jar (RFC 6265bis) + capture/replay step variants.

**Schema-accepted but runner-stubbed/unimplemented:**
- Resource blocks: `transitions`, `bulkOperations`, `idempotency`
  (declarative replay checks), `pagination`, `ttl`,
  `optimisticConcurrency`, `multipartCreate`, `concurrencyChecks`.
- Step kinds: `navigate` (returns passed:true, no browser drive),
  any `ws-*` step.
- `page.identity.ts` page-role detection feeds the matrix but the
  HTTP-only adapter has no page navigation runtime.

**What this means for authoring:**
- Per-*.md catalog files (`per-bulk.md`, `per-async.md`, `per-cross-tenant.md`,
  etc.) describe coverage targets the v3 plan reserved. Many use the
  legacy `{request, expect, jsonpath}` shape AND advanced features the
  current runner does not honour. Treat them as *future-coverage*
  references, not copy-paste templates. Use the canonical shape from
  this SKILL.md (next section) and the runner-backed features above.
- For HTTP-only projects (current boilerplate state), focus on:
  resource declarations, special_flows with setup+steps, expect
  bodyHas/headerHas/status, setAuth-driven actor switching,
  envelope.successWrapper config in `_shared.json` if the API wraps
  responses.

## Schema reference — Resource and Special flow

### Resource (array entry)

```json
{
  "name": "<resource-name>",
  "kind": "crud",
  "parents": ["<parent-resource>"],
  "create": {
    "method": "POST",
    "path": "/api/v1/<resource>",
    "body": {},
    "operationId": "<openapi-operation-id-optional>"
  },
  "capture": {
    "bindings": { "id": "$.id" },
    "headerBindings": { "etag": "ETag" }
  },
  "transitions": [
    { "from": "draft", "to": "published",
      "trigger": { "method": "PATCH", "pathSuffix": "/publish" },
      "expectStatus": 200 }
  ],
  "bulkOperations": [
    { "routeSuffix": "/bulk", "shape": "multi-status", "multiStatusCode": 207 }
  ],
  "idempotency": { "keyHeader": "Idempotency-Key", "scope": "route" },
  "pagination": { "shape": "cursor", "defaultLimit": 20 },
  "ttl": { "durationMs": 60000, "expiredStatus": 410 }
}
```

Required: `name`. Required for `kind: "crud"` (default): `create`,
`capture`. Required for `kind: "endpoint"` (read-only probe target):
nothing else — both `create` and `capture` may be omitted.

NO `routes`, NO singular `parent`, NO `actor` field. State-changing
routes belong in `transitions`. Bulk routes in `bulkOperations`.
Read/list/get/delete routes are exercised inline via flow `steps`
(method + path) or via OpenAPI lookup using `operationId`.

### Special flow

```json
{
  "id": "<task-id>:<scenario>",
  "description": "<one-line>",
  "contract": { "kind": "http", "source": "<file>", "endpoint": "GET /x" },
  "dependsOn": ["<other-flow-id>"],
  "setup": [
    { "create": "<resource-name>", "by": "<actor-name>",
      "body": {}, "capture": "<binding-name>" }
  ],
  "steps": [
    { "kind": "setAuth", "binding": "<actor-name>" },
    { "kind": "api", "transport": "http",
      "method": "GET", "path": "/api/v1/<resource>/${id}" },
    { "kind": "expect", "status": 200, "bodyHas": { "$.id": "${id}" } }
  ]
}
```

Actor binding is explicit and never inferred from a by-only setup entry:

- `setup[].by` — which actor performs the create. Defaults to the
  flow's first `setAuth.binding` if omitted. It is valid only when the
  same setup entry also includes `create`.
- `Step { kind: "setAuth", binding: "<actor>" }` — switches the active
  actor for subsequent steps. Use this to test cross-tenant access:
  `setAuth: tenantA-owner` → create resource → `setAuth: tenantB-member`
  → expect 404 / 403.

Steps recognised by the runner: `setAuth`, `api`, `expect`, `capture`,
`logout`, `navigate`, `wait` (full list in
`step-types.ts:STEP_KINDS`).

## Hand-off

Once the file passes self-check:

1. `git add .overstory/runtime-contract.flows/<task-id>.json`
2. `git commit -m "flows(<task-id>): author <feature-name> coverage"`
3. The next builder spawned for this task will see the flow file at
   boot; the probe asserts every entry.

If a builder later mails you with `--type flow_mismatch`:

1. Re-read the relevant flow.
2. Decide:
   - **Code bug** — builder fixes their code; you do nothing.
   - **Wrong flow** — you edit the JSON; reply `flow_update`.
   - **Spec ambiguity** — beyond your authority; escalate via
     `--type flow_escalation` to the coordinator.
3. If you fix the flow, mail the builder back with `--type flow_update`
   and a one-line summary so they re-run probe. The pre-close-gate that
   is blocking their `worker_done` clears once your reply lands in
   their inbox referencing the same `threadId`.

See [failure-modes.md](failure-modes.md) for the full Decision 10
catalog with paste-ready recipes for every code.
