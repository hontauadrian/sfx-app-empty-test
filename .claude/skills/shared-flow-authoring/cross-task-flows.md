# Cross-task flows — placement and ownership

> Per Open Question 3: when a flow exercises endpoints from multiple
> feature files, place it in the file of the **leaf-action feature**,
> cross-reference resources from earlier files via `extends`.

A "cross-task flow" is any `special_flows[]` entry whose `steps` invoke
endpoints declared in two or more feature files. The drift hook does
not care which file the flow lives in — only that it covers every new
endpoint. Coordinators decide placement so the file structure stays
intelligible to future readers.

## The placement rule

The leaf-action feature is the file whose endpoint **completes** the
interaction. Every flow has a culminating assertion — the place the
test would fail if the contract slipped. The flow lives in the file
that owns that culminating endpoint.

| Interaction shape | Leaf-action feature |
|---|---|
| Feature A creates a resource, feature B reads it | feature B (the read is the assertion) |
| Feature A grants a permission, feature B exercises it | feature B (the exercise is the assertion) |
| Feature A enqueues a job, feature B observes the result | feature B (the observation is the assertion) |
| Feature A sends a webhook, feature B's handler receives it | feature B (the receive is the assertion) |
| Feature A updates a tenant; feature B's listing reflects the update | feature B (the listing is the assertion) |

If the assertion genuinely lives in feature A AND feature B (e.g. a
flow that asserts both "B can read after A creates" AND "A's create
audit-log emits"), split into two flows.

## What the file looks like

The leaf-action file (`<task-id-B>.json`) declares the flow.
Resources from `<task-id-A>.json` are referenced via `extends`:

```json
{
  "version": 1,
  "task_id": "<task-id-B>",
  "owns": [
    { "resource": "<resource-B>" }
  ],
  "extends": [
    { "resource": "<resource-A>" }
  ],
  "special_flows": [
    {
      "id": "<task-id-B>:cross-task-A-creates-then-B-reads",
      "description": "Feature A's creation is observable through feature B's listing",
      "actor": "<actor>",
      "setup": [
        { "create": "<resource-A>", "by": "<actor>", "capture": "$aId" }
      ],
      "steps": [
        {
          "request": {
            "method": "GET",
            "path": "<resource-B-list-path>",
            "query": { "aId": "${aId}" }
          },
          "expect": {
            "status": 200,
            "jsonpath": {
              "$.data[*].id": { "contains": "${aId}" }
            }
          }
        }
      ]
    }
  ]
}
```

The `setup` step uses feature A's create endpoint (declared in
`<task-id-A>.json`'s `resources`); the `request` step exercises
feature B's read endpoint (declared locally). The drift hook accepts
this — feature B's endpoint is referenced.

## What about feature A's own coverage?

Feature A's `<task-id-A>.json` independently has its own §11 coverage
for `<resource-A>`'s create endpoint (happy path, validation, auth
permutations, etc.). The cross-task flow does NOT replace per-feature
coverage — it asserts the cross-feature interaction on top.

Per-feature: "feature A correctly creates `<resource-A>`."
Cross-task: "the resource feature A creates is correctly visible to
feature B."

## When the leaf-action feature is genuinely shared

If the interaction's culminating endpoint lives in `_shared.json`
itself (e.g. tenant listing under `_shared.resources.<tenant>`), the
flow goes in the file of whichever feature **introduces the change**
that the shared endpoint must reflect. `_shared.json` is metadata —
it does not carry `special_flows[]`. (Exception: project-wide
contract proofs that have no feature owner go in `_shared.json` only
if every alternative is worse; in practice, prefer adding them to
the most-recent feature in the change set.)

## Mailing the leads

When you decide a flow's placement, mail the relevant lead with
`--type flow_update`:

```bash
ov mail send \
  --to lead-<task-id-B> \
  --type flow_update \
  --subject "cross-task flow: A creates → B reads belongs in <task-id-B>.json" \
  --body "$(cat <<'EOF'
## Decision
The flow asserting feature A's create is observable through feature
B's listing belongs in <task-id-B>.json. Reasoning: the assertion is
the listing endpoint, which is feature B's surface.

## Action
Add to <task-id-B>.json:
- `extends`: [{ "resource": "<resource-A>" }]
- New `special_flows[]` entry: <task-id-B>:cross-task-A-creates-then-B-reads (skeleton attached)

## Authority
This skill (shared-flow-authoring) §cross-task-flows leaf-action rule.
EOF
)"
```

If the cross-task flow needs a `_shared.json` change too (e.g. the
flow needs an actor that no feature currently uses but is now needed
by both A and B), make that edit yourself first, commit it, then mail
the lead so they reference it.

## When a lead disagrees with placement

If a lead replies arguing the flow belongs in their counterpart's file
instead, decide based on which assertion's failure is the customer-
facing bug. The leaf-action rule prioritises the observable contract —
ties go to the file most likely to be edited next.

If the lead's argument exposes that you mis-categorised which endpoint
is the assertion, accept the correction and re-mail the right lead.
That is a normal coordinator-lead exchange; it is NOT escalation.

## What NOT to do

| Action | Reason |
|---|---|
| Put the flow in BOTH feature files | The loader emits `FLOW_DUPLICATE_ID` at boot. |
| Put the flow in `_shared.json` so neither lead has to maintain it | `_shared.json` is metadata, not a flow file. The loader rejects `special_flows[]` outside per-feature files. |
| Synthesise a third "cross" task id and create a third file just for cross-task flows | Decision 1 (folder-of-files) maps tasks 1:1 to files. A cross-task file has no task. Use the leaf-action feature's file. |
| Inline-redeclare feature A's `<resource-A>` in feature B's file (instead of `extends`) | Triggers `FLOW_MERGE_CONFLICT` — two files own the same resource. Always use `extends`. |
