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
| `FLOW_STEP_FAILED` referencing a `<task-id>:<flow-name>` | Default: your code (Option A). Escalate only if flow's expectation provably contradicts spec. |
| `FLOW_MERGE_CONFLICT` / `FLOW_DUPLICATE_ID` / `FLOW_FILE_MISSING_OWNS_OR_EXTENDS` | Lead-only resolution. Mail lead (Option B) with diagnostic block. |
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
