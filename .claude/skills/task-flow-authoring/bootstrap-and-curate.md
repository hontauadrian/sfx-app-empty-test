# Bootstrap and curate

> Per Decision 7: bootstrap is **machinery**, not the answer. It
> scaffolds a draft so you don't start from a blank file. The curated
> flow file is what proves the plan.

## What bootstrap does

```bash
pnpm flows:bootstrap --task=<task-id>
```

Reads:

- OpenAPI doc for the API (controllers + DTOs + `@ApiResponse`).
- Prisma / database schema (resource shapes + foreign keys).
- The task spec (`feature-plan` / `product-plan` output).
- `flows.config.json` at project root (project conventions:
  `_shared.json` location, status enumeration policy, default error
  envelope).

Writes a draft to `.overstory/runtime-contract.flows/<task-id>.json`
with:

- `version: 1`, `task_id: "<task-id>"`, `owns: [...]`, `extends: [...]`
  scaffolded from the diff.
- `resources` entries auto-derived from POST handlers + their
  `@Param` chain.
- `special_flows` entries with `"source": "bootstrap:openapi:..."` for
  the easily-inferable categories:
  - happy-path per endpoint (status from `@ApiResponse(2xx)`).
  - auth-bypass per protected endpoint.
  - per-status flow for every `@ApiResponse(4xx)` declared.
  - resource-lifecycle skeleton (CRUD round-trip).

What bootstrap does NOT generate (because it cannot infer them from
code alone):

- Cross-tenant flows (the auth model is plan-level, not code-level).
- Business-rule flows (the plan's prose, not the controller's signature).
- State-transition forbidden-from flows (which state machines exist is
  plan-level).
- Async poll/freeze-at flows (the worker's state machine is plan-level).
- Idempotency replay flows beyond what `Resource.idempotency`
  declares.
- Side-effect assertions (which side-effects matter is plan-level).
- Validation rule boundary cases (which fields matter is plan-level).
- Pagination 8-flow set (cursor-stable-on-insert is non-trivial; only
  the empty / single-page / multi-page-first / multi-page-last flows
  are auto-generated).
- Upload/download MIME and size boundary cases.
- Content-negotiation flows.
- Hierarchical visibility flows.

These all require human judgement on the plan's promises. Bootstrap
gets you ~30% of the way; curation does the remaining ~70%.

## The `source` field convention

Every `special_flows[]` entry carries an optional `source` field. Each
generated entry's source string starts with `bootstrap:openapi:` so
the script can tell generated from curated on re-run. Curated rows use
a plan reference (e.g. `plan-<task-id> §2`):

```json
{
  "id": "<task-id>:<endpoint>-happy",
  "source": "bootstrap:openapi:GET <path>",
  "description": "...",
  "steps": []
}
```

```json
{
  "id": "<task-id>:<endpoint>-cross-tenant",
  "source": "plan-<task-id> §3.2",
  "description": "...",
  "steps": []
}
```

Re-running bootstrap preserves entries whose `source` does NOT start
with `bootstrap:openapi:` and refreshes the rest. This means:

- Run bootstrap → review the generated rows → replace each
  `bootstrap:openapi:*` source with a plan reference once validated.
- Run bootstrap again later (e.g. after a spec change adds a new
  endpoint) → the new generated rows appear; your curated rows are
  untouched.

If a generated row is wrong (e.g. it asserts 200 but the spec actually
says 201), edit the row AND replace the source with the plan
reference. The next bootstrap run will leave your edit alone.

## Workflow

```
1. feature-plan / product-plan produces the spec
        │
        ▼
2. pnpm flows:bootstrap --task=<task-id>
        │
        │  writes draft .overstory/runtime-contract.flows/<task-id>.json
        │  with bootstrap:openapi:* source entries for happy / status / lifecycle
        ▼
3. task-flow-authoring (this skill)
        │
        │  walk Decision 11 checklist top-to-bottom:
        │    - review every bootstrap:openapi:* row → replace source with
        │      a plan reference (or fix + reference)
        │    - add the rows bootstrap didn't generate (cross-tenant,
        │      business rules, state transitions, async, idempotency,
        │      side-effects, validation, pagination, etc.)
        │    - run self-check formula
        ▼
4. git commit + sd close
        │
        │  flow file is now the contract
        ▼
5. builder runs feature → probe asserts your flows
```

## When to replace `bootstrap:openapi:*` with a plan reference

Replace when ALL of these are true:

- The status the row asserts matches the spec (not just the controller's
  `@ApiResponse` decorator).
- The actor is correct (not just "any auth'd actor").
- The body shape (`jsonpath`) asserts the fields the spec promises,
  not just the fields the DTO has.
- The setup correctly establishes the precondition (e.g. for a
  cross-tenant flow, the resource is genuinely seeded under the OTHER
  tenant).

If any of these are not true, edit the row first, then replace the
source.

## When NOT to replace the source

Do NOT replace when:

- The row asserts a status the controller declares but the spec
  doesn't actually promise (decorator drift; remove the row OR fix
  the decorator and re-bootstrap).
- The row uses a generic `<actor>` placeholder when the spec promises
  a specific role.
- The row's setup is incomplete (e.g. no parent resource for a
  chained leaf — the runner will fail at chain capture).

## When to re-run bootstrap

Re-run when:

- The spec changes and adds/removes an endpoint.
- A new `@ApiResponse` decorator is added (forces a new generated
  status flow).
- A new `@ResourceCaptures` is added that affects the resource graph.

Re-running is idempotent for rows with non-`bootstrap:openapi:*`
sources. It is **not** idempotent for the file metadata (`version`,
`task_id`, `owns`, `extends`) — bootstrap will overwrite these to match
the current diff. That is intentional: if you renamed a resource in
code, bootstrap should reflect it.

## What to commit

Commit the curated JSON file with a message describing the feature:

```
flows(<task-id>): author <feature-name> coverage
```

Do NOT commit `bootstrap:openapi:*` rows that you haven't reviewed —
they're stand-ins, not contracts. Either review and replace the
source, or remove the row before commit.

## Failure modes

| Symptom | Diagnosis |
|---|---|
| Bootstrap warns "no `@ApiResponse` decorators found on `<controller>`" | Controller is missing OpenAPI annotations. Builder should fix per `nestjs-probe-coverage`. |
| Bootstrap emits a generated row with `"actor": "anonymous"` for a protected endpoint | Decorator inference incomplete. Check `@UseGuards` on the controller / handler. |
| Bootstrap re-runs delete a row I added | The row had a `bootstrap:openapi:*` source (or no `source` at all). Replace the source with a plan reference and re-add the row. |
| Two bootstrap runs produce different `<task-id>.json` content for the same diff | Non-determinism — the fixtures or the OpenAPI dump changed. Investigate before committing. |
