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

When the probe fails, walk this tree in order. Stop at the first row
that matches and follow its action.

| Probe output contains... | Action |
|---|---|
| `FLOW_OWNERSHIP_VIOLATION` | Stop. You cannot edit the flow folder. Mail the lead (Option B). |
| `FLOW_NEW_ENDPOINT_UNCOVERED` | Stop. Drift requires lead authorship. Mail the lead (Option B) with the new endpoint shape. |
| `FLOW_STEP_FAILED` referencing a `<task-id>:<flow-name>` | Decision: code bug or contract bug? Default: it's your code (Option A). Only escalate if you can prove the flow's expectation contradicts the spec. |
| `FLOW_MERGE_CONFLICT` / `FLOW_DUPLICATE_ID` / `FLOW_FILE_MISSING_OWNS_OR_EXTENDS` | Lead-only resolution. Mail the lead (Option B) with the diagnostic block from probe output. |
| `[http-smoke-FAIL]` without a `FLOW_*` code | Use `nestjs-probe-coverage` and `build-verifiable-features` skills first; this skill applies only to flow-named failures. |

## Option A — Fix the code

Default response. The flow file is correct; your implementation
doesn't match the contract.

1. **Read the failing flow's expectation.** The probe output cites:

   ```
   FLOW_STEP_FAILED
     flow: <task-id>:<short-name>
     step: <index>
     expected: { status: 422, jsonpath: { $.errors[*].field: <field> } }
     actual:   { status: 500, jsonpath: { $.message: 'Internal Server Error' } }
   ```

   Read the flow file at `.overstory/runtime-contract.flows/<task-id>.json`
   to understand the full step context (setup, prior steps, capture
   bindings). You may READ the file freely — only writes are blocked.

2. **Identify the gap.** The expected shape encodes the spec's
   contract. The actual shape is your implementation's current
   output. Pick one of these failure classes:

   - **Status mismatch** — controller returns 500 when spec says 422.
     Likely a missing exception filter, a Zod issue propagating as
     500, or an explicit `throw` without the right `HttpException`.
   - **Body shape mismatch** — controller returns the right status
     but wrong body keys. Likely a serialiser missed a field, a DTO
     was extended in a refactor, or a new `class-transformer`
     decorator is mis-applied.
   - **Side-effect mismatch** — flow asserts `db-row-inserted: 0` but
     the DB actually has a row. Likely a missing transaction
     rollback in an error path.
   - **Capture mismatch** — a prior step expected to bind `$.id` but
     the response doesn't have an `id` field. Likely a renamed field
     or a wrong response wrapper.

3. **Fix the code.** Edit the controller, service, or DTO that owns
   the gap. Do NOT touch the flow file.

4. **Re-run.** `pnpm probe:smoke`. The same failing flow should now
   pass. If a different flow now fails, repeat from step 1.

## Option B — Mail the lead

Use when:

- The hook blocks you (`FLOW_OWNERSHIP_VIOLATION`).
- The drift hook blocks you (`FLOW_NEW_ENDPOINT_UNCOVERED`).
- After Option A, you have evidence the flow contradicts the spec
  and the right fix is to update the flow.
- A loader-time diagnostic surfaces (`FLOW_MERGE_CONFLICT`,
  `FLOW_DUPLICATE_ID`, `FLOW_FILE_MISSING_OWNS_OR_EXTENDS`).

Use the `flow_mismatch` mail type. The lead either:

- Edits the flow and replies with `--type flow_update` — re-run
  probe.
- Escalates to the coordinator with `--type flow_escalation` if the
  spec is genuinely ambiguous.

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

After sending, **wait**. The pre-close-gate (`worker-done-evidence.js`)
blocks `worker_done`, `git commit`, and `sd close` until the lead's
reply lands in your inbox referencing the same `threadId`. Do not
retry. Do not edit the flow file via shell to bypass the editor — the
hook also intercepts shell writes.

### When to use `FLOW_NEW_ENDPOINT_UNCOVERED`

Mail the lead with a more specific subject and the endpoint shape:

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

The lead invokes `task-flow-authoring` to add the flow, then replies
`flow_update`. Pre-close-gate clears once the reply lands.

## Hook mechanics — what blocks you

| Hook | Triggers on | Effect |
|---|---|---|
| `flows-path-boundary.js` | `Write` / `Edit` / `MultiEdit` / `NotebookEdit` against any path under `.overstory/runtime-contract.flows/` | Blocks the action, emits `FLOW_OWNERSHIP_VIOLATION` |
| `flows-drift-check.js` | `Bash` calls invoking `git commit`, `sd close`, or `ov mail send --type worker_done` | Scans diff for endpoints not declared in any flow file; blocks with `FLOW_NEW_ENDPOINT_UNCOVERED` |
| `worker-done-evidence.js` | `Bash` calls invoking `worker_done` or close commands | Blocks while a `flow_mismatch` thread is unanswered |

You cannot disable these hooks. Editing `settings.json` to remove the
matchers is itself blocked. The hooks are deployed by sfx-overstory's
`hooks-deployer.ts` at agent boot and reset on every restart.

## What NOT to do

| Action | Reason |
|---|---|
| Add the failing flow id or path to `overlay.ignore[]` | Banned anti-pattern. The `probe-covers-diff` hook flags it as a conduct violation. |
| `--no-verify` on commit to bypass the drift hook | Flagged at review. Leaves the repo in an inconsistent state — the drift hook is mechanical, not advisory. |
| Edit the flow file via shell (`echo ... > <task-id>.json`, `sed -i ...`, `python -c "json.dump(...)"`) | The path-boundary hook intercepts the shell write too. |
| Pretend you sent the mail and submit `worker_done` anyway | Pre-close-gate matches the threadId, not just the subject. |
| Copy a flow into a new file you create yourself | The path-boundary hook fires on file creation, not just edit. |
| Wait silently when the lead is unresponsive for an unusually long time | Escalate to the coordinator with `--type flow_escalation`. Default behaviour: trust the lead, but escalate when genuinely blocked. |

## When to expect a quick fix vs. an escalation

| Scenario | Likely lead response |
|---|---|
| Flow asserts a status the spec clearly states | `flow_update` from lead within a turn — code fix on your side |
| Flow asserts a status the controller declares but the spec is silent | Lead either edits the flow OR escalates to coordinator with `flow_escalation` |
| Flow asserts a side-effect the spec promises but you can't observe (e.g. `db-row-inserted` without DB access in your implementation) | Lead either explains observation mechanism (`test_endpoint:downstreamLog`) or escalates |
| Flow's `setup` references a resource your feature doesn't own | Probably a `_shared.json` issue — lead escalates to coordinator |

## Cross-references (read-only)

For deeper context on what the lead/coordinator will do:

- `task-flow-authoring` — per-task `<task-id>.json` authoring,
  Decision 11 walk, self-check formula.
- `shared-flow-authoring` — `_shared.json` ownership,
  cross-task flow placement.

You read these to understand the flow file you're seeing in probe
output. You do NOT invoke them — they are author-side skills.
