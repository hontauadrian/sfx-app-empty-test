# flow-foundation

## Why JSON, not YAML

The contract files are JSON because this pipeline is AI-authored
end-to-end. JSON has loud parse failures; YAML has silent coercion
footguns (`country: NO` → `false`, `version: 1.10` → `1.1`,
indentation traps). When AI writes the file and AI consumes the file,
"loud failure on the smallest mistake" outweighs "human-readable
indentation." The loader globs `*.json` and uses `JSON.parse`.

Convention: write files with `JSON.stringify(obj, null, 2)` (2-space
indent). No comments, no trailing commas, no single quotes. Every
example in this skill follows that convention.

## When this skill runs in the workflow

```
feature-plan / product-plan
        │
        ▼
pnpm flows:bootstrap --task=<task-id>     ← machinery, writes draft with "source":"generated"
        │
        ▼
task-flow-authoring (this skill)          ← you, turning draft into 100% coverage
        │
        ▼
git commit + sd close                     ← flow file is now the contract
        │
        ▼
builder runs feature                      ← probe asserts your flows
        │
        ▼
on FLOW_STEP_FAILED:
  builder mails you (flow_mismatch)       ← back to this skill to fix or extend
```

## File layout (folder-of-files model)

One file per task ID under `.overstory/runtime-contract.flows/`:

```
.overstory/runtime-contract.flows/
├── _shared.json                          ← global actors + cross-feature resources (coordinator-only)
├── <task-id-of-feature-A>.json           ← one feature
├── <task-id-of-feature-B>.json           ← another feature
└── __fixtures__/
    └── <fixture-files>                   ← upload bytes, etc.
```

File naming: `<task-id>.json` — direct mapping to the sd task id.
Avoids merge fights. Easy to grep "what task introduced this flow."

## File metadata (every file MUST start with this)

```json
{
  "version": 1,
  "task_id": "<task-id>",
  "owns": [
    { "resource": "<resource-name>" }
  ],
  "extends": [
    { "resource": "<resource-from-elsewhere>" },
    { "actor": "<actor-from-_shared>" }
  ]
}
```

The full file shape:

```json
{
  "version": 1,
  "task_id": "<task-id>",
  "owns": [{ "resource": "<resource-name>" }],
  "extends": [{ "actor": "<actor-from-_shared>" }],

  "actors": [
    {
      "name": "<actor-name>",
      "auth": { "token": "<token-or-binding>" }
    }
  ],

  "resources": [
    {
      "name": "<resource-name>",
      "parents": ["<parent-resource>"],
      "create": {
        "method": "<verb>",
        "path": "<path-template>",
        "body": { }
      },
      "capture": {
        "bindings": { "id": "$.id" },
        "headerBindings": { "etag": "ETag" }
      }
    }
  ],

  "special_flows": [
    {
      "id": "<task-id>:<short-name>",
      "description": "<one-line>",
      "contract": { "kind": "http", "source": "<src-file>", "endpoint": "<METHOD /path>" },
      "setup": [
        { "create": "<resource-name>", "by": "<actor-name>", "capture": "<binding>" }
      ],
      "steps": [
        { "kind": "setAuth", "binding": "<actor-name>" },
        { "kind": "api", "transport": "http", "method": "<METHOD>", "path": "<path>", "body": {} },
        { "kind": "expect", "status": 200, "bodyHas": { "$.<field>": "<value-or-matcher>" } }
      ]
    }
  ]
}
```

Use `extends` to declare cross-file dependencies. The loader
hard-errors on:

| Conflict | Diagnostic |
|---|---|
| Two files declare the same actor with different credentials | `FLOW_MERGE_CONFLICT` (cites both files) |
| Two files declare the same resource (only one may `owns`) | `FLOW_MERGE_CONFLICT` |
| Two `special_flows` share the same `id` | `FLOW_DUPLICATE_ID` |
| File references actor/resource not declared anywhere | `FLOW_FILE_MISSING_OWNS_OR_EXTENDS` |
