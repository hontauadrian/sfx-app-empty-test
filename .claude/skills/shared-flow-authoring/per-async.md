# §11.7 — Per async or worker-driven transition

> Decision 11.7 + Decision 15: If transitions happen outside the
> request that triggered them (worker, scheduler, message queue), use
> the `poll` step to assert eventual state. Cover end-to-end happy,
> intermediate, failure-path, and time-bounded states.

## The rule (verbatim from Decision 11.7)

If the plan describes a state machine where transitions happen
**outside** the request that triggered them (worker, scheduler,
message queue):

- ☐ **End-to-end happy poll.** Use a `poll` step against the status
      route with `whileBody` / `whileStatus` and `timeoutMs` tied to
      the spec's stated SLO; on exit, exercise the post-transition
      action.
- ☐ **Intermediate-state assertion.** For every state the plan exposes
      (e.g. `<queued>`, `<running>`, `<processing>`), pin or freeze the
      worker (`{ "create": "<resource>", "freezeAt": "<state>" }`)
      and assert the API's behaviour at that state.
- ☐ **Failure-path transition.** If the plan describes a `<failed>`
      terminal state, construct a request that triggers it and `poll`
      until the failed state.
- ☐ **Time-bounded states.** If the plan promises "expires after
      `<T>`," use `{ "create": "<resource>", "completedAt":
      "-<T+1>" }` or `clock_advance: <T+1>` and assert the post-expiry
      response.

## The `poll` step (Decision 15.1)

```json
{
  "kind": "poll",
  "request": { "method": "<verb>", "path": "<status-path>" },
  "whileBody": { "<jsonpath>": "<matcher>" },
  "whileStatus": [200],
  "intervalMs": 250,
  "timeoutMs": 10000,
  "finalExpect": { "status": 200 },
  "finalCapture": { "bindings": { "resultUrl": "$.resultUrl" } }
}
```

Semantics:

- The runner issues the request, evaluates the while-conditions, sleeps
  `intervalMs`, repeats.
- If timeout elapses with conditions still true → `FLOW_POLL_TIMEOUT`.
- On exit, `finalExpect` runs against the last response.
- Diagnostics include attempt count and the last observed status / body
  excerpt.

## Failure mode if missing

Without async coverage, a worker that silently fails to dequeue is
invisible. The endpoint returns 202 (accepted); the probe declares
victory; the job sits in the queue forever. The same is true for
scheduled actions: spec says "job runs at `<T>`," code never registers
the schedule, but the synchronous `POST /schedule` returns 200.

Without intermediate-state assertions, a worker that transitions
`<queued> → <done>` without ever entering `<running>` (because someone
removed the "set running before processing" call) ships unnoticed.
Every state the plan EXPOSES is a contract the probe must enforce.

## JSON patterns

### Pattern 1 — end-to-end happy poll

```json
{
  "id": "<task-id>:<resource>-async-completes",
  "description": "<resource> async job transitions to <done> within SLO",
  "actor": "<actor>",
  "setup": [
    {
      "request": { "method": "POST", "path": "<trigger-path>", "body": {} },
      "capture": { "bindings": { "jobId": "$.id" } }
    }
  ],
  "steps": [
    {
      "kind": "poll",
      "request": { "method": "GET", "path": "<status-path>/${jobId}" },
      "whileStatus": [200],
      "whileBody": { "$.status": { "oneOf": ["<queued>", "<running>"] } },
      "intervalMs": 250,
      "timeoutMs": 10000,
      "finalExpect": {
        "status": 200,
        "jsonpath": { "$.status": "<done>" }
      },
      "finalCapture": { "bindings": { "resultUrl": "$.resultUrl" } }
    },
    {
      "request": { "method": "GET", "path": "${resultUrl}" },
      "expect": { "status": 200 }
    }
  ]
}
```

### Pattern 2 — intermediate-state freeze

```json
{
  "id": "<task-id>:<resource>-cannot-download-while-queued",
  "description": "Download attempt while job is <queued> returns 409",
  "actor": "<actor>",
  "setup": [
    { "create": "<resource>", "by": "<actor>", "capture": "$jobId", "freezeAt": "<queued>" }
  ],
  "steps": [
    {
      "request": { "method": "GET", "path": "<download-path>/${jobId}" },
      "expect": { "status": 409 }
    }
  ]
}
```

The `freezeAt` setup macro routes through the test endpoint declared
in `_shared.test_endpoints.freezeAt`. The system under test must
expose this — it's part of the test-only API surface.

### Pattern 3 — failure-path poll

```json
{
  "id": "<task-id>:<resource>-async-fails",
  "description": "Trigger payload that the worker cannot process transitions to <failed>",
  "actor": "<actor>",
  "setup": [
    {
      "request": { "method": "POST", "path": "<trigger-path>", "body": { "_unprocessable": true } },
      "capture": { "bindings": { "jobId": "$.id" } }
    }
  ],
  "steps": [
    {
      "kind": "poll",
      "request": { "method": "GET", "path": "<status-path>/${jobId}" },
      "whileStatus": [200],
      "whileBody": { "$.status": { "oneOf": ["<queued>", "<running>"] } },
      "intervalMs": 250,
      "timeoutMs": 10000,
      "finalExpect": {
        "status": 200,
        "jsonpath": {
          "$.status": "<failed>",
          "$.error.code": { "type": "string" }
        }
      }
    }
  ]
}
```

### Pattern 4 — time-bounded expiry (relative completedAt)

```json
{
  "id": "<task-id>:<resource>-expires-after-T",
  "description": "<resource> expires <T> after creation; post-expiry returns 410",
  "actor": "<actor>",
  "setup": [
    { "create": "<resource>", "by": "<actor>", "capture": "$id", "completedAt": "-<T+1>" }
  ],
  "steps": [
    {
      "request": { "method": "GET", "path": "<get-path>/${id}" },
      "expect": { "status": 410 }
    }
  ]
}
```

OR using mid-flow clock advance (Decision 15.3):

```json
{
  "id": "<task-id>:<resource>-expires-mid-flow",
  "description": "<resource> expires after clock advances past <T>",
  "actor": "<actor>",
  "isolated_clock": true,
  "setup": [
    { "create": "<resource>", "by": "<actor>", "capture": "$id" }
  ],
  "steps": [
    {
      "request": { "method": "GET", "path": "<get-path>/${id}" },
      "expect": { "status": 200 }
    },
    { "kind": "wait", "advanceMs": "<T+1>" },
    {
      "request": { "method": "GET", "path": "<get-path>/${id}" },
      "expect": { "status": 410 }
    }
  ]
}
```

### Pattern 5 — all intermediate states enumerated

> Spec: Job has states `<queued> → <running> → <validating> → <done>`
> (or `<failed>` from any of the first three).

```json
{
  "id": "<task-id>:<resource>-frozen-queued-allows-cancel",
  "description": "Cancel attempt while <queued> succeeds (cancellable)",
  "actor": "<actor>",
  "setup": [
    { "create": "<resource>", "by": "<actor>", "capture": "$id", "freezeAt": "<queued>" }
  ],
  "steps": [
    {
      "request": { "method": "POST", "path": "<cancel-path>/${id}" },
      "expect": { "status": 200 }
    }
  ]
}
```

```json
{
  "id": "<task-id>:<resource>-frozen-running-blocks-cancel",
  "description": "Cancel attempt while <running> returns 409 (uncancellable)",
  "actor": "<actor>",
  "setup": [
    { "create": "<resource>", "by": "<actor>", "capture": "$id", "freezeAt": "<running>" }
  ],
  "steps": [
    {
      "request": { "method": "POST", "path": "<cancel-path>/${id}" },
      "expect": { "status": 409 }
    }
  ]
}
```

```json
{
  "id": "<task-id>:<resource>-frozen-validating-blocks-cancel",
  "description": "Cancel attempt while <validating> returns 409 (uncancellable)",
  "actor": "<actor>",
  "setup": [
    { "create": "<resource>", "by": "<actor>", "capture": "$id", "freezeAt": "<validating>" }
  ],
  "steps": [
    {
      "request": { "method": "POST", "path": "<cancel-path>/${id}" },
      "expect": { "status": 409 }
    }
  ]
}
```

### Pattern 6 — `setClock` absolute (Decision 15.3)

When the test must run at a specific wall-clock time:

```json
{
  "id": "<task-id>:<resource>-scheduled-fires-at-T",
  "description": "Scheduled job fires when clock reaches scheduled time",
  "actor": "<actor>",
  "isolated_clock": true,
  "setup": [
    { "setClock": "<absolute-time>" },
    {
      "request": { "method": "POST", "path": "<schedule-path>", "body": { "runAt": "<absolute-time + 1s>" } },
      "capture": { "bindings": { "jobId": "$.id" } }
    }
  ],
  "steps": [
    {
      "request": { "method": "GET", "path": "<status-path>/${jobId}" },
      "expect": { "jsonpath": { "$.status": "<pending>" } }
    },
    { "kind": "wait", "advanceMs": 1100 },
    {
      "kind": "poll",
      "request": { "method": "GET", "path": "<status-path>/${jobId}" },
      "whileStatus": [200],
      "whileBody": { "$.status": { "oneOf": ["<pending>", "<running>"] } },
      "intervalMs": 250,
      "timeoutMs": 5000,
      "finalExpect": { "jsonpath": { "$.status": "<done>" } }
    }
  ]
}
```

`isolated_clock: true` ensures the clock state does not leak into
other flows that share the same test environment.

## Worked example — full §11.7 coverage on a job processor

> Spec: `POST /<jobs-collection>` enqueues a job. States:
> `<queued> → <running> → <done>` (or `<failed>`). SLO: completes
> within 10s. After 24h, completed jobs are purged (subsequent
> read returns 410).

Floor: 5 authored flows.

| Flow id | Asserts |
|---|---|
| `<task-id>:<jobs-collection>-async-completes` | poll until `<done>`, then download result |
| `<task-id>:<jobs-collection>-async-fails` | poll until `<failed>` with declared error envelope |
| `<task-id>:<jobs-collection>-frozen-queued` | freeze at `<queued>`, assert API behaviour |
| `<task-id>:<jobs-collection>-frozen-running` | freeze at `<running>`, assert API behaviour |
| `<task-id>:<jobs-collection>-purge-after-24h` | `completedAt: "-25h"` → GET returns 410 |
