---
name: task-flow-authoring
description: |
  Author the executable contract (`<task-id>.json` under
  `.overstory/runtime-contract.flows/`) that proves a feature plan or
  product journey is correct, with comprehensive Decision-11 coverage
  across the 17 sub-rows. Owns the flow file for the assigned task.

  INVOKE WHENEVER:
    - You have just finished `feature-plan` and produced a feature spec
    - You have just finished `product-plan` and produced user journeys
    - You receive a `flow_mismatch` mail from a builder asking you to
      correct or extend a flow you authored
    - You receive a `flow_update`/`flow_escalation` thread asking you to
      revise a flow because the spec changed
    - The probe `FLOW_NEW_ENDPOINT_UNCOVERED` was raised by a builder's
      drift hook (you must add coverage; the builder cannot)
    - Any of these strings appear in probe output and the failure cites
      a flow id like `<task-id>:<short-name>`:
        - FLOW_STEP_FAILED
        - FLOW_MERGE_CONFLICT
        - FLOW_DUPLICATE_ID
        - FLOW_FILE_MISSING_OWNS_OR_EXTENDS

  Bootstrap (`pnpm flows:bootstrap --task=<task-id>`) runs first as
  machinery — it scaffolds a draft with `"source": "generated"` entries
  for the easily-inferable categories (status enumeration, resource
  lifecycle skeleton). This skill is what you use to TURN that draft
  into a curated, complete flow file by walking every Decision 11
  sub-row.

  Builders/mergers cannot author flow files (FILE_SCOPE excludes the
  folder; the `flows-path-boundary.js` hook blocks writes and emits
  `FLOW_OWNERSHIP_VIOLATION`). If a builder tells you via
  `flow_mismatch` mail that they need a new flow or a fix to an
  existing one, you are the only person who can edit it.
---

# task-flow-authoring

## Pre-flight gate — read code BEFORE authoring

**Mandatory.** Before writing any flow content, walk
[`read-code-first.md`](read-code-first.md). It enforces the eight steps
that turn a feature spec into a grounded flow file:

1. `sd show <task-id>` — extract module scope and acceptance criteria
2. Read every controller / DTO / guard / Zod schema in scope
3. Read `.overstory/runtime-contract.flows/_shared.json`
4. Read every existing per-task flow file for cross-references
5. `pnpm openapi:dump` — enumerate the live OpenAPI surface
6. Map each endpoint to Decision-11 sub-rows (NEW vs already-covered)
7. Author the flow file
8. Self-check via `self-check-formula.md`

If the task is bug-fix-only (no new endpoints, no changed status codes
or response shapes), the read-code-first gate concludes "no flow file
needed"; mail the lead/coordinator and skip the rest of this skill.

The remainder of this file describes the file layout, schema, and
per-sub-row patterns. It assumes you have completed the pre-flight gate.

## What this skill does

Produces or updates `.overstory/runtime-contract.flows/<task-id>.json` —
the executable form of the plan you (lead) just wrote, or that the
coordinator handed you. Every claim in the plan ("for any actor `<A>`,
operation `<O>` on resource `<Y>` owned by actor `<B>` fails with
status `<Z>`") is converted into a positive flow AND a negative flow.
The result is the single source of truth the runtime probe asserts
against.

You hold an exclusive write lock on this folder. Builders and mergers
cannot edit it. Their only recourse if a flow is wrong or missing is to
mail you with `--type flow_mismatch`. You answer with `flow_update`.

### Where to write the flow update — IN THE BUILDER'S WORKTREE

When you receive a `flow_mismatch` mail and decide a flow file needs
fixing, the file you edit MUST be the builder's worktree copy, not your
own:

```
/workspace/.overstory/worktrees/<builder-name>/.overstory/runtime-contract.flows/<task-id>.json
```

Each agent forks its own worktree at sling time and gets its own copy
of the contract-flows folder. If you edit your own worktree's copy
only, the builder keeps running `pnpm probe:smoke` against their
stale copy and the same failure reproduces every cycle. The Write hook
explicitly permits leads to reach into any sibling
`.overstory/worktrees/*/.overstory/runtime-contract.flows/*` path for
exactly this purpose.

Always paste the resolved path into your `flow_update` mail body so
the builder can verify which file they should re-run against. Example:

```bash
ov mail send --to <builder> --type flow_update \
  --subject "flow_update: <task-id>:<flow-id> fixed" \
  --body "Edited /workspace/.overstory/worktrees/<builder>/.overstory/runtime-contract.flows/<task-id>.json — re-run \`pnpm probe:smoke\`."
```

If a fix touches `_shared.json` and multiple builders are running
against it, repeat the edit in each affected worktree. There is no
auto-sync between worktrees mid-iteration — only sling-time copy.

### Lead-owned cross-task flows in `_shared.json`

The coordinator seeds `_shared.json` with **declarations only** —
actors and resources without bootstrap step bodies, plus envelope /
fixtures / endpoint-registry config. **You** are the one who fills in
behaviour assertions for surfaces your chunk delivers.

If your chunk delivers a surface other chunks will reuse (e.g. an
authentication bootstrap endpoint, a fixture-seed endpoint, a
tenant-create endpoint, any cross-cutting setup endpoint), append the
bootstrap flow body to `_shared.json` after the endpoint exists in
your code:

- For each actor whose authentication your chunk delivers, write the
  bootstrap flow that captures whatever credential the runtime needs
  (token, session cookie, signed header) — using the actual response
  shape your code returns now, not a future-state schema.
- For each resource whose CRUD endpoints your chunk owns, write the
  cross-task flows future chunks can `extend` from.

**Never assert a field your chunk does not deliver.** If a later
chunk adds another field to the response, that chunk's lead extends
the assertion when their code lands. Asserting future-state today
breaks your own probes.

If a flow you are about to author overlaps with content already in
`_shared.json` from coordinator seed (it shouldn't, given the rule
above), and the existing assertion is wrong for your chunk, escalate
via `ov mail send --type flow_escalation` rather than silently
documenting a "known deviation" in worker_done.

### Correctness over speed — NEVER reduce coverage to dodge a failure

If a probe fails, fix the assertion or the code so the probe passes.
Do NOT delete the resource / owns entry / extends entry / generated
flow to make the failure go away. Removing coverage is a regression,
not a fix — the surface still ships unverified and future changes
won't catch it.

Failure mode: **COVERAGE_REGRESSION_HACK**. If you genuinely think
the coverage is wrong, escalate via `flow_escalation` to coordinator
with rationale before committing. Time pressure is not a
justification.

### NEVER tell the builder to send `worker_done` while flows are red

If the builder's probe report shows failures, the cause is one of:
1. The flow is wrong (your responsibility — fix it).
2. The code is wrong (builder's responsibility — mail
   `flow_update` with the exact failing flow + expected shape).

"Document as a known deviation" is not a path. Either the flow
matches the chunk's actual response shape, or the code matches the
flow. Iterate until probes are green.

**Required pre-read before authoring any flow content** — read [flow-foundation.md](../flow-foundation.md). It defines file layout (folder-of-files), the mandatory file metadata header, the full file shape, and the loader hard-error diagnostics table. If you skip this, the file you produce will be rejected by the loader.

Steps are FLAT (not nested `{request, expect}`). Each step has a
`kind` (`setAuth`, `api`, `expect`, `capture`, `logout`, `navigate`,
`wait`). Actor binding is done with a step:
`{ "kind": "setAuth", "binding": "<actor>" }`. Do NOT use
`setup[].by` to select an actor. `setup[]` is only for creating
declared resources and every setup entry must include `create`.

To avoid id collisions, prefix every `special_flows[].id` with the task
id: `<task-id>:<short-name>`.

## The comprehensive coverage checklist (Decision 11)

You MUST satisfy every applicable item for the diff before committing
the file. Walk the plan top-to-bottom; tick each box. Each section
below corresponds to one Decision 11 sub-row and has its own topic
file with paste-ready JSON patterns.

**Required reference while building the coverage matrix and before commit** — read [decision-11-coverage.md](../decision-11-coverage.md). It carries the Decision 11 sub-row table, Catalogues (Decision 18), the Operational reference, the 17-row cross-cutting pre-commit checklist, the self-check formula, and the Decision 17 P0/P1/P2 schema-extension roadmap. You cannot self-check completeness without it.

**Required reference when defining `resources[]` or `special_flows[]`, when triaging a runner-backed-vs-stubbed feature gap, or when handing off / responding to `flow_mismatch` mail** — read [runner-and-schema.md](../runner-and-schema.md). It carries the probe-flows v3 implementation status (runner-backed vs schema-accepted-but-stubbed features), the Resource and Special-flow schema shapes, and the post-self-check git/commit hand-off + `flow_mismatch` triage decision tree.

## Actor types — pick the smallest pattern that covers your tests

Task-level flows usually consume actors declared in `_shared.json`. When a
new actor is required for THIS task, it must still fit one of the five
canonical types — picked by what your endpoints check, NOT by the project
domain's wording. The five types map directly to the schemes the runtime
supports today (`AUTH_SCHEME_REGISTRY` in `lib/auth-bootstrap.ts`).

The full per-type shapes + the canonical register/login chain examples
live in
[shared-flow-authoring §Actor types](../shared-flow-authoring/SKILL.md#actor-types--pick-the-smallest-pattern-that-covers-your-tests).
Read that section once when authoring a flow that introduces a new actor;
the patterns are project-agnostic and apply identically inside a per-task
file.

The five types (summary):

1. **Public** — `{ "scheme": "anonymous" }`. Reserved name `anonymous`.
2. **Authenticated single-identity** — one user, one bearer. Use
   `bearer-in-body` / `bearer-in-header` / `cookie` per transport.
3. **Permission-scoped** — one actor per scope tier you need to test;
   each declares its own login + a bootstrap chain that grants the scope.
4. **Tenant-scoped** — same shape as type 3, chain assigns tenancy
   instead of role.
5. **Machine** — `api-key` for static header, `oauth-scoped` for OAuth
   client_credentials with scopes.

### Per-task additions land where the flow is authored

If the new actor is used by ONE task only, declare it in the task's
own `<task-id>.json` `actors[]` array. If it's used by multiple tasks,
escalate to coordinator with a `flow_escalation` mail so it lands in
`_shared.json` instead — lifting prevents drift between task copies of
the same actor.

### Anti-patterns (same as shared)

Do NOT declare `auth: {}` as a placeholder — the discriminator rejects
it at contract-load time and probe stdout fills with
`[contract-flows-bootstrap-FAIL] actor=<name> scheme=unknown`. Do NOT
delete an actor to silence a bootstrap diagnostic — the deletion drops
every flow that references it (the role-gated, tenant-gated, and
service-to-service tests become untestable while pass count rises).

If the runtime doesn't support your auth (OAuth authorization-code,
mTLS, SAML, 2FA-challenge mid-login), the registry must be extended
first — see the same shared-flow-authoring section for the path.

## Schema reference (current)

The probe runs `ContractFileSchema.safeParse` on every flow file with
`.strict()` — UNRECOGNIZED keys are rejected. Use the shapes below.
Anything else fails `FLOW_FILE_SCHEMA_INVALID` at probe time.

### Top-level

```json
{
  "version": 1,
  "task_id": "<task-id>",
  "owns": [{ "actor": "<name>" } | { "resource": "<name>" }],
  "extends": [{ "actor": "<name>" } | { "resource": "<name>" }],
  "actors": [ /* see below — ARRAY, not object map */ ],
  "resources": [ /* see below — ARRAY, not object map */ ],
  "special_flows": [ /* see below */ ],
  "config": { /* optional */ }
}
```

### Actor (array entry)

```json
{
  "name": "<actor-name>",
  "auth": { "scheme": "anonymous" },
  "transport": "<optional>"
}
```

NO `role` / `credentials` fields. Auth must use one of the
`AUTH_SCHEME_REGISTRY` schemes from `lib/auth-bootstrap.ts`
(`anonymous`, `bearer-in-body`, `bearer-in-header`, `cookie`,
`api-key`, `oauth-scoped`).

### Special-flow (array entry)

```json
{
  "id": "<task-id>:<short-name>",
  "description": "<one-line>",
  "contract": {
    "kind": "http",
    "source": "<spec-or-code-reference>",
    "endpoint": "GET /api/v1/example"
  },
  "steps": [
    { "kind": "setAuth", "binding": "<actor-name>" },
    { "kind": "api", "transport": "http", "method": "GET", "path": "/api/v1/example" },
    { "kind": "expect", "status": 200 }
  ]
}
```

Every `special_flows[].contract` MUST include `kind` and `source`.
Every HTTP API step MUST include `transport: "http"`. Do not write
top-level flow `source`, `steps[].request`, `setup[].by`-only entries,
or API steps without `transport`; those are rejected by
`FLOW_FILE_SCHEMA_INVALID`.

For Resource (array entry) and the full Special-flow schema, **read [runner-and-schema.md](../runner-and-schema.md) before writing them** — it is the canonical schema reference.
