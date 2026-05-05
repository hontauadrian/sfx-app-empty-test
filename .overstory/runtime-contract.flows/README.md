# Runtime contract — flows folder

Folder model for the probe-flow DSL system. One `<task-id>.json` per task,
plus `_shared.json` for cross-feature actors and shared resources. The
loader globs `*.json` and merges them into a single contract.

## Ownership (Decision 3)

| Role | Can edit? |
|---|---|
| Coordinator | Yes — owns `_shared.json` and may edit any file. |
| Lead | Yes — owns `<task-id>.json` for their assigned task. |
| Builder | No — read-only. On a flow failure, mail the lead with `--type flow_mismatch`. |
| Merger | No — same as builder. |

The path-boundary hook (`flows-path-boundary.js`) enforces this mechanically.
Builders/mergers attempting to write here trigger `FLOW_OWNERSHIP_VIOLATION`.

## Authoring

Bootstrap a draft with `pnpm flows:bootstrap --task=<task-id>`. The script
reads the project OpenAPI surface and seeds one happy-path flow per
operation plus one flow per declared 4xx/5xx response code. Source
attribution lives on each `special_flow.contract.source` string:
bootstrap-generated entries are prefixed with `bootstrap:openapi:`
(or `bootstrap:scoped:openapi:` when `--scope=<glob>` is passed); any
other value (typically `plan-<task-id> §<n>` or a controller reference
like `apps/api HealthController.check`) marks a curated entry.

Re-running `pnpm flows:bootstrap` preserves curated entries verbatim
and only refreshes those whose `contract.source` starts with one of
the bootstrap prefixes.

The lead invokes `task-flow-authoring` to add cross-tenant /
business-rule / state-transition / async / idempotency flows that
auto-generation cannot infer.

## Failure codes

| Code | Resolution |
|---|---|
| `FLOW_OWNERSHIP_VIOLATION` | You wrote here as a builder/merger. Mail the lead. |
| `FLOW_NEW_ENDPOINT_UNCOVERED` | Your diff added an endpoint not covered by any flow. Mail the lead. |
| `FLOW_MERGE_CONFLICT` | Two files declare the same actor/resource. Pick one canonical. |
| `FLOW_DUPLICATE_ID` | Two `special_flows` share an id. Prefix with `<task-id>:`. |
| `FLOW_FILE_MISSING_OWNS_OR_EXTENDS` | A reference is unbound. Add `owns:` or `extends:`. |
