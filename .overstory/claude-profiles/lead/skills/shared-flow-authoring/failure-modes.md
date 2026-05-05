# Decision 10 — Failure-mode catalog

> Five named failure codes appear in probe output, hook denials, or
> mail payloads. Each has a paste-ready resolution recipe. Do NOT
> silence any by adding to `overlay.ignore[]`.

## The five codes

| Code | Where it fires | Affects |
|---|---|---|
| `FLOW_OWNERSHIP_VIOLATION` | `flows-path-boundary.js` (PreToolUse) | Builder/merger tried to write to flows folder |
| `FLOW_NEW_ENDPOINT_UNCOVERED` | `flows-drift-check.js` (PreToolUse on close commands) | Diff has an endpoint not declared in any flow file |
| `FLOW_MERGE_CONFLICT` | Loader at boot | Two files declare same actor/resource with different definitions |
| `FLOW_DUPLICATE_ID` | Loader at boot | Two `special_flows[].id` collide |
| `FLOW_FILE_MISSING_OWNS_OR_EXTENDS` | Loader at boot | File references actor/resource not declared anywhere |

## `FLOW_OWNERSHIP_VIOLATION`

**Where it fires:** `flows-path-boundary.js` — PreToolUse on
`Write|Edit|MultiEdit|NotebookEdit` against any path under
`.overstory/runtime-contract.flows/`. Profile detection cascade:
`OVERSTORY_AGENT_CAPABILITY` → `CLAUDE_PROFILE` →
`OVERSTORY_AGENT_NAME` substring → cwd path → builder default.

**What it means:** A profile that is not lead/coordinator attempted to
write to the flows folder. The hook blocks the action and emits the
diagnostic.

**Recipe — builder/merger received this:**

You cannot edit the flow folder. Mail the lead instead:

```bash
ov mail send \
  --to lead-<task-id> \
  --type flow_mismatch \
  --subject "<one-line summary of the issue>" \
  --body "$(cat <<'EOF'
## Context
Task: <task-id>
Branch: <branch> @ <sha>

## What I tried to do
<the edit you attempted>

## Why
<the failure that prompted the edit>

## Probe output
<paste relevant probe stanza>

## Proposed flow change
<your proposed JSON diff, expressed as prose>
EOF
)"
```

The pre-close-gate will block your `worker_done` until the lead
replies with `flow_update`. Wait. Do not retry the edit.

**Recipe — lead/coordinator received this:**

Your role detection is misconfigured. Check:

- `OVERSTORY_AGENT_CAPABILITY` env var is set to `lead` or
  `coordinate` / `coordinator`.
- OR `CLAUDE_PROFILE` is `lead` or `coordinator`.
- OR `OVERSTORY_AGENT_NAME` contains `lead` or `coordinator` as a
  substring.
- OR your cwd path includes `/lead/` or `/coordinator/`.

If none of the above match, you'll be detected as a builder. Surface
this to the orchestrator (escalation mail) — the role detection is
the bug, not your edit.

## `FLOW_NEW_ENDPOINT_UNCOVERED`

**Where it fires:** `flows-drift-check.js` — PreToolUse on `Bash` with
`git commit`, `sd close`, or `ov mail send --type worker_done`.

**What it means:** The diff introduces or modifies a route (METHOD +
PATH derived from changed controller files) that no `*.json` in
`.overstory/runtime-contract.flows/` declares. The hook blocks the
forward-motion command and emits the diagnostic.

**Recipe — builder received this:**

You cannot self-resolve. Mail the lead:

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

Once the lead replies `flow_update` with the JSON edit, re-run probe
and re-attempt the close. Pre-close-gate clears automatically.

**Recipe — lead received this DM:**

Invoke this skill (`task-flow-authoring`) for the
`<task-id>.json` file. Walk the Decision 11 checklist for the new
endpoint. Add the flows that satisfy §11.1 (per-endpoint), §11.5
(declared error paths), and any other applicable sub-rows. Reply to
the builder with `--type flow_update` once committed.

## `FLOW_MERGE_CONFLICT`

**Where it fires:** Loader at boot (Phase 0a). The loader globs all
`*.json` files, merges them in-memory, and hard-errors on conflicts.

**What it means:** Two files in the flow folder declare the same
named entity (actor or resource) with different definitions, OR two
files both `owns` the same resource.

**Diagnostic shape:**

```
FLOW_MERGE_CONFLICT
  entity: actor:<actor-name>     OR resource:<resource-name>
  conflict:
    file: .overstory/runtime-contract.flows/<task-id-A>.json
    file: .overstory/runtime-contract.flows/<task-id-B>.json
  reason: <details>
```

**Recipe — lead/coordinator received this:**

1. Open both files cited.
2. Decide which is canonical. Two patterns:
   - **Same definition both places** — keep one as `owns`, change
     the other to `extends` referencing it.
   - **Different definitions** — only one can be right. The other is
     stale. Either:
     - Delete the stale row.
     - Keep the new definition; remove the old.
     - If the difference is intentional (e.g. two test scenarios with
       different credentials), rename one entity (`<actor>-A` vs
       `<actor>-B`).

3. Re-run the loader (`pnpm flows:bootstrap --validate-only` if the
   bootstrap script exposes a no-op validate mode, otherwise
   `pnpm probe:smoke` will fire the loader and report the diagnostic
   again).

## `FLOW_DUPLICATE_ID`

**Where it fires:** Loader at boot.

**What it means:** Two `special_flows[].id` are identical across
files.

**Diagnostic shape:**

```
FLOW_DUPLICATE_ID
  id: <flow-id>
  conflict:
    file: .overstory/runtime-contract.flows/<task-id-A>.json
    file: .overstory/runtime-contract.flows/<task-id-B>.json
```

**Recipe — lead received this:**

Per the SKILL body convention, every flow id MUST be prefixed with the
task id: `<task-id>:<short-name>`. If both files prefix correctly,
you should never see this diagnostic. If you do, one of the files is
not following the convention.

1. Open both files.
2. Confirm both `id` values start with the file's `task_id`.
3. If one doesn't, fix it (`my-flow` → `<task-id>:my-flow`).
4. If both do, the conflict is genuinely cross-task and one of the
   tasks copied a flow id from the other. Pick one (your task) to
   rename.

## `FLOW_FILE_MISSING_OWNS_OR_EXTENDS`

**Where it fires:** Loader at boot.

**What it means:** A file references an actor or resource that no
file in the folder declares — neither under `owns` nor `extends`.

**Diagnostic shape:**

```
FLOW_FILE_MISSING_OWNS_OR_EXTENDS
  file: .overstory/runtime-contract.flows/<task-id>.json
  missing: actor:<actor-name>     OR resource:<resource-name>
  referenced_at: special_flows[<index>].actor / .setup[<i>] / .steps[<i>].request
```

**Recipe — lead received this:**

Two cases:

**Case 1 — you're the canonical declarer.** Add `owns` to the file
metadata:

```json
{
  "owns": [
    { "resource": "<resource-name>" }
  ]
}
```

Then add the `resources.<resource-name>` block.

**Case 2 — another file is the canonical declarer.** Add `extends`:

```json
{
  "extends": [
    { "resource": "<resource-name>" }
  ]
}
```

The resource is declared in `<other-task-id>.json`. The loader
resolves `extends` lazily — you reference the entity by name, the
loader looks it up across the folder.

If the entity is genuinely cross-feature (e.g. a global actor like
`<admin-actor>`), it should live in `_shared.json`, owned by the
coordinator. Mail the coordinator with `--type flow_escalation`:

```bash
ov mail send \
  --to coordinator \
  --type flow_escalation \
  --subject "shared <actor/resource> needed in _shared.json" \
  --body "<details + proposed declaration>"
```

The coordinator invokes `shared-flow-authoring` to add it to
`_shared.json`.

## What NOT to do

| Action | Reason |
|---|---|
| Add the failing flow id or path to `overlay.ignore[]` | Banned anti-pattern. The `probe-covers-diff` hook flags it as a conduct violation. |
| Disable the path-boundary or drift hook | Hook config is orchestrator-owned. Edits trigger a separate hook block. |
| `--no-verify` on the commit to bypass the drift hook | Flagged at review. The hook is mechanical; bypassing it leaves the repo in an inconsistent state. |
| Edit `<task-id>.json` from a builder profile via shell instead of editor tool | The shell write also triggers the path-boundary hook (the underlying file watcher is in the hook, not the editor). |
| Pretend the flow file is read-only and just submit `worker_done` anyway | The pre-close-gate (`worker-done-evidence.js`) blocks `worker_done` while a `flow_mismatch` is unanswered. |

## When the lead is unresponsive

If you (builder) sent `flow_mismatch` and have not received a
`flow_update` reply for an unusually long time AND your `worker_done`
is blocked by the pre-close-gate:

```bash
ov mail send \
  --to coordinator \
  --type flow_escalation \
  --subject "flow <flow-id>: blocked, lead unresponsive" \
  --body "<context, including thread id of unanswered flow_mismatch>"
```

Default behaviour: trust the lead. Wait. The orchestrator triages
stuck threads. Only escalate when you genuinely cannot proceed.
