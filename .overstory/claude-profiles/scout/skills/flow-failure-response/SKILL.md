---
name: flow-failure-response
description: |
  Builder-side response when the runtime probe fails on a flow you do
  NOT own. Per Decision 9, your options collapse to two: fix your code,
  or mail the lead. There is no third "edit the flow file" branch —
  the `flows-path-boundary.js` hook blocks any Write/Edit/MultiEdit/
  NotebookEdit on `.overstory/runtime-contract.flows/` from the
  builder profile and emits `FLOW_OWNERSHIP_VIOLATION`.

  INVOKE WHENEVER:
    - `pnpm probe:smoke` reports `FLOW_STEP_FAILED` referencing a flow
      id like `<task-id>:<short-name>`
    - `pnpm probe:smoke` reports `FLOW_NEW_ENDPOINT_UNCOVERED` —
      your diff added an endpoint no flow file references
    - The probe blocks `git commit`, `sd close`, or
      `ov mail send --type worker_done` due to a flow drift or
      ownership diagnostic
    - `FLOW_MERGE_CONFLICT`, `FLOW_DUPLICATE_ID`, or
      `FLOW_FILE_MISSING_OWNS_OR_EXTENDS` surfaces in probe output

  This skill is intentionally narrow. It does NOT teach flow-file
  authoring — that lives in `task-flow-authoring` (per-task) and
  `shared-flow-authoring` (`_shared.json` + cross-task). You
  read those skills to understand what the lead will do; you do not
  invoke them.
---

# flow-failure-response

## Decision tree (apply top-down)

Walk top-down. Stop at first match, follow its action.

| Probe output contains... | Action |
|---|---|
| `FLOW_OWNERSHIP_VIOLATION` | Cannot edit flow folder. Mail lead (Option B). |
| `FLOW_NEW_ENDPOINT_UNCOVERED` | Drift requires lead authorship. Mail lead (Option B) with new endpoint shape. |
| `[contract-flows-bootstrap-FAIL]` (one or more lines) | Actor declaration is broken in a lead-owned flow file. **Do not touch controllers** — actor-bootstrap failures cascade into 10+ contract-flow failures all rooted in the same actor. The line includes `source=<file>` and `owner=lead`; copy that into a `flow_actor_bootstrap` mail to lead with the full diagnostic line. Common causes: typo (`tokenPath` instead of `key`), missing DB seed for the actor's email, wrong login path. Do NOT chase the cascading flow failures. |
| `expect: expected bodyHas.<path>="${<var>}"` (literal `${...}` in expected) | Lead authored an assertion referencing a variable that wasn't bound at runtime, OR the response envelope wrapper hides the captured value. Lead-owned flow file. Mail lead with `flow_assertion_unbound_var` and the line. Do NOT touch controllers — the API is returning correct data, the assertion shape is wrong. |
| `expect: expected bodyHas.$={"type":"array"}, got actual={"success":...,"data":[...]}` (or any envelope mismatch where `$.data.<...>` would match) | Lead authored a non-envelope-aware bodyHas path. Mail lead with `flow_assertion_envelope` and the assertion line; lead must rewrite path as `$.<wrapper>.<rest>`. Do NOT touch controllers. |
| `FLOW_STEP_FAILED` referencing a `<task-id>:<flow-name>` | Default: your code (Option A). Escalate only if flow's expectation provably contradicts spec. First confirm there are no `[contract-flows-bootstrap-FAIL]` lines above — if present, fix those first (above row). |
| `FLOW_MERGE_CONFLICT` / `FLOW_DUPLICATE_ID` / `FLOW_FILE_MISSING_OWNS_OR_EXTENDS` | Lead-only resolution. Mail lead (Option B) with diagnostic block. |
| `MISSING_BODY_RESOURCE_REF` | Your controller. Add `@BodyResourceRefs([{ parentField: '<field>', resource: '<parent-POST-path>' }])` to the create handler. Generator detected a Prisma FK in the body that the runtime probe needs to substitute. See `build-verifiable-features/SKILL.md §Resource-ref decorators` for the exact pattern. Do NOT remove `@ResourceCaptures` — both decorators coexist. |
| `MISSING_BODY_RESOURCE_REF_PARENT_UNRESOLVED` | Two options: (a) add `@ResourceCaptures({ resource: '<parentModel-camelCase>' })` to the parent's POST handler, OR (b) declare `@BodyResourceRefs([{ parentField, resource: '/<explicit-path>' }])` on this endpoint. Generator can't auto-locate the parent's create endpoint. |
| `:happy` flow fails with `4xx <X> not found` on an endpoint whose body has an **array of FK ids** (`<arrayFkField>: <id-type>[]`) | Add `kind: 'array'` to `@BodyResourceRefs` on that endpoint. Generator pre-creates `count` parents and substitutes the body field with an array of captured ids. See `build-verifiable-features/SKILL.md §Array-of-FK body fields`. **DO NOT modify the handler** to silently skip non-existent ids or weaken the auth/existence check — that is a conduct failure (CLAUDE.md § "No gate-gaming"). The decorator teaches the probe to send real ids; the handler stays strict per its declared `@ApiResponse`. Example: `@BodyResourceRefs({ parentField: '<arrayFkField>', resource: '/<api-prefix>/<parent-path>', kind: 'array', count: 2 })`. |
| `STATUS_REACH_404_BODY_FK_UNTYPED` / `OVERRIDE_TRANSFORM_UNTYPED` | Your code. Either (a) add `.uuid()`/`.email()` constraint to the Zod schema field in `packages/validation/schemas/`, OR (b) add `@relation(fields:[<fk>], references:[id])` in the Prisma schema so the parent's id column type is resolvable. Generator refuses to guess the placeholder type. |
| `RESOURCE_GRAPH_NO_CREATE_ENDPOINT` | Informational, NOT a failure. Prisma model has no standalone POST endpoint — usually a derived resource (e.g. Activity auto-created by other handlers, TeamMember created via invite). Ignore unless you intended to expose a create endpoint. |
| `ROLE_REQUIREMENT_PARENT_FK_UNKNOWN` | Your controller. An `@ApiExtension('x-requires-parent-role', { parentField })` value doesn't match any Prisma FK on the resource. Fix the field name in the extension OR add `@relation` for the column in Prisma. |
| `CHAIN_AUTH_UNRESOLVABLE` | Two declarations needed. (1) ON THIS ENDPOINT (declared via `@ApiExtension('x-requires-parent-role', { parentField, minimumRole, acceptableRoles })`); (2) ON THE PARENT'S create endpoint, add `@ApiExtension('x-on-create-grant-role', { role: '<role>', toCaller: true })` so the user creating the parent automatically becomes the required role. Without both, the chain emitter intentionally skips emission rather than ship a 403-failing flow. |
| `[http-smoke-FAIL]` without a `FLOW_*` code | Use `nestjs-probe-coverage` and `build-verifiable-features` first; this skill applies only to flow-named failures. |

## Option A — Fix the code

Default response. Flow file correct; implementation doesn't match contract.

1. **Read the failing flow's expectation.** Probe output cites:

   ```
   FLOW_STEP_FAILED
     flow: <task-id>:<short-name>
     step: <index>
     expected: { status: 422, jsonpath: { $.errors[*].field: <field> } }
     actual:   { status: 500, jsonpath: { $.message: 'Internal Server Error' } }
   ```

   Read flow file at `.overstory/runtime-contract.flows/<task-id>.json` for full step context (setup, prior steps, capture bindings). READ allowed — only writes blocked.

2. **Identify the gap.** Expected = spec contract. Actual = current output. Failure classes:

   - **Status mismatch** — controller returns 500 when spec says 422. Likely missing exception filter, Zod issue propagating as 500, or `throw` without right `HttpException`.
   - **Body shape mismatch** — right status, wrong body keys. Likely serialiser missed field, DTO extended in refactor, or `class-transformer` decorator mis-applied.
   - **Side-effect mismatch** — flow asserts `db-row-inserted: 0` but DB has row. Likely missing transaction rollback in error path.
   - **Capture mismatch** — prior step expected to bind `$.id` but response has no `id`. Likely renamed field or wrong response wrapper.

3. **Fix the code.** Edit controller, service, or DTO owning the gap. Do NOT touch flow file.

4. **Re-run.** `pnpm probe:smoke`. Failing flow should pass. If different flow fails, repeat from step 1.

## Option B — Mail the lead

Use when:

- Hook blocks you (`FLOW_OWNERSHIP_VIOLATION`).
- Drift hook blocks you (`FLOW_NEW_ENDPOINT_UNCOVERED`).
- After Option A, evidence shows flow contradicts spec.
- Loader-time diagnostic surfaces (`FLOW_MERGE_CONFLICT`, `FLOW_DUPLICATE_ID`, `FLOW_FILE_MISSING_OWNS_OR_EXTENDS`).

Use `flow_mismatch` mail type. Lead either:

- Edits flow, replies `--type flow_update` — re-run probe.
- Escalates to coordinator with `--type flow_escalation` if spec ambiguous.

### Mail template

```bash
ov mail send \
  --to lead-<task-id> \
  --type flow_mismatch \
  --subject "flow <task-id>:<flow-name>: probe vs flow disagreement" \
  --body "$(cat <<'EOF'
## Context
Task: <task-id>
Branch: <branch> @ <sha>
Flow: <task-id>:<flow-name>

## Probe output
<paste the FLOW_STEP_FAILED block verbatim>

## My implementation
- Controller: <relative-path>:<line>
- Method: <verb> <path>
- Returns: <status + body shape — describe in prose, attach DTO if relevant>

## Spec citation
<spec-file>#<heading or §number>
"<verbatim quote of the spec line that I believe contradicts the flow>"

## My analysis
<one paragraph — why I think the flow is wrong vs. why the implementation is wrong>

## Proposed flow change (prose, not JSON)
<describe what the flow's expectation should be instead>
EOF
)"
```

After sending, **wait**. Pre-close-gate (`worker-done-evidence.js`) blocks `worker_done`, `git commit`, `sd close` until lead's reply lands referencing same `threadId`. Do not retry. Do not edit flow file via shell to bypass editor — hook also intercepts shell writes.

### When to use `FLOW_NEW_ENDPOINT_UNCOVERED`

Mail lead with specific subject and endpoint shape:

```bash
ov mail send \
  --to lead-<task-id> \
  --type flow_mismatch \
  --subject "New endpoint coverage needed: <METHOD> <path>" \
  --body "$(cat <<'EOF'
## Context
Task: <task-id>
Branch: <branch> @ <sha>

## New endpoint(s) without flow coverage
<METHOD> <path>

## Endpoint shape
- Auth: <required-role-or-anonymous>
- Request DTO: <controller-file-path>
- Response DTO: <controller-file-path>
- Declared statuses (@ApiResponse): <2xx/4xx list>
- Multi-tenant: <yes/no>
- Idempotency-Key: <yes/no>
- Side-effects: <list>

## Spec section
<heading + line>
EOF
)"
```

Lead invokes `task-flow-authoring` to add flow, replies `flow_update`. Pre-close-gate clears when reply lands.

## Hook mechanics — what blocks you

| Hook | Triggers on | Effect |
|---|---|---|
| `flows-path-boundary.js` | `Write` / `Edit` / `MultiEdit` / `NotebookEdit` against any path under `.overstory/runtime-contract.flows/` | Blocks action, emits `FLOW_OWNERSHIP_VIOLATION` |
| `flows-drift-check.js` | `Bash` calls invoking `git commit`, `sd close`, or `ov mail send --type worker_done` | Scans diff for endpoints not declared in any flow file; blocks with `FLOW_NEW_ENDPOINT_UNCOVERED` |
| `worker-done-evidence.js` | `Bash` calls invoking `worker_done` or close commands | Blocks while `flow_mismatch` thread unanswered |

Cannot disable these hooks. Editing `settings.json` to remove matchers is itself blocked. Hooks deployed by sfx-overstory's `hooks-deployer.ts` at agent boot, reset on every restart.

## What NOT to do

| Action | Reason |
|---|---|
| Add failing flow id or path to `overlay.ignore[]` | Banned anti-pattern. `probe-covers-diff` hook flags as conduct violation. |
| `--no-verify` on commit to bypass drift hook | Flagged at review. Leaves repo inconsistent — drift hook is mechanical, not advisory. |
| Edit flow file via shell (`echo ... > <task-id>.json`, `sed -i ...`, `python -c "json.dump(...)"`) | Path-boundary hook intercepts shell write too. |
| Pretend you sent the mail and submit `worker_done` anyway | Pre-close-gate matches threadId, not just subject. |
| Copy a flow into a new file you create yourself | Path-boundary hook fires on file creation, not just edit. |
| Wait silently when lead unresponsive unusually long | Escalate to coordinator with `--type flow_escalation`. |

## When to expect a quick fix vs. an escalation

| Scenario | Likely lead response |
|---|---|
| Flow asserts status spec clearly states | `flow_update` from lead within a turn — code fix on your side |
| Flow asserts status controller declares but spec silent | Lead edits flow OR escalates to coordinator with `flow_escalation` |
| Flow asserts side-effect spec promises but you can't observe (e.g. `db-row-inserted` without DB access) | Lead explains observation mechanism (`test_endpoint:downstreamLog`) or escalates |
| Flow's `setup` references resource your feature doesn't own | Probably `_shared.json` issue — lead escalates to coordinator |

## Cross-references (read-only)

For deeper context on what lead/coordinator will do:

- `task-flow-authoring` — per-task `<task-id>.json` authoring, Decision 11 walk, self-check formula.
- `shared-flow-authoring` — `_shared.json` ownership, cross-task flow placement.

Read these to understand flow file in probe output. Do NOT invoke — author-side skills.
