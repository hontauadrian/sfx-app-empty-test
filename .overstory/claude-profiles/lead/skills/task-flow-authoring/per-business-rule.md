# §11.3 — Per business rule

> Decision 11.3: For any rule R that promises "actor `<A>` can perform
> operation `<O>` when condition `<C>`," emit a positive flow AND a
> negative flow.

## The rule (verbatim from Decision 11.3)

A "business rule" is any sentence in the plan that promises behaviour
above HTTP basics — anything beyond status codes and field validation.
For any rule R that promises "actor `<A>` can perform operation `<O>`
when condition `<C>`":

- ☐ **Positive flow.** Condition `<C>` met; action succeeds.
- ☐ **Negative flow.** Condition `<C>` not met; action fails with the
      expected status.

## Failure mode if missing

Business rules are the part of the spec the probe most often fails to
catch when only HTTP-level coverage exists. The endpoint returns 200
when called by `<actor-A>` and 200 when called by `<actor-B>` — the
probe is happy, but the spec said only `<actor-A>` should succeed and
the code drifted to allow both. Without an explicit negative flow, the
regression is invisible.

This row is the most common source of "the probe ran green and we
shipped a bug": HTTP shape is preserved, business invariant is not.

## JSON patterns

### Pattern 1 — positive

The setup block establishes the precondition described by the rule.

```json
{
  "id": "<task-id>:<rule-name>-positive",
  "description": "<actor-A> can <operation> on <resource> when <condition>",
  "actor": "<actor-A>",
  "setup": [
    { "_note": "prerequisites that establish condition C" }
  ],
  "steps": [
    {
      "request": { "method": "<verb>", "path": "<path>", "body": {} },
      "expect": {
        "status": 200,
        "jsonpath": {
          "$.<invariant-the-rule-promises>": "<expected-value>"
        }
      }
    }
  ]
}
```

### Pattern 2 — negative (other actor)

```json
{
  "id": "<task-id>:<rule-name>-negative-actor",
  "description": "<actor-B> cannot <operation> when only <actor-A> is permitted",
  "actor": "<actor-B>",
  "setup": [
    { "_note": "same prerequisites as positive" }
  ],
  "steps": [
    {
      "request": { "method": "<verb>", "path": "<path>", "body": {} },
      "expect": { "status": 403 }
    }
  ]
}
```

### Pattern 3 — negative (condition unmet)

```json
{
  "id": "<task-id>:<rule-name>-negative-condition",
  "description": "<actor-A> cannot <operation> when <condition> is not satisfied",
  "actor": "<actor-A>",
  "setup": [
    { "_note": "prerequisites that explicitly DO NOT establish condition C" }
  ],
  "steps": [
    {
      "request": { "method": "<verb>", "path": "<path>", "body": {} },
      "expect": { "status": "<expected-failure>" }
    }
  ]
}
```

### Pattern 4 — multi-condition rule (every condition matters)

If the rule is "`<actor-A>` can `<operation>` when `<C1>` AND `<C2>`,"
emit one negative flow per missing condition — never just one.

```json
{
  "id": "<task-id>:<rule-name>-c1-met-c2-unmet",
  "description": "<C1> alone is insufficient; rule requires <C2> as well",
  "actor": "<actor-A>",
  "setup": [
    { "_note": "satisfy C1, leave C2 unmet" }
  ],
  "steps": [
    {
      "request": { "method": "<verb>", "path": "<path>", "body": {} },
      "expect": { "status": "<expected-failure>" }
    }
  ]
}
```

```json
{
  "id": "<task-id>:<rule-name>-c1-unmet-c2-met",
  "description": "<C2> alone is insufficient; rule requires <C1> as well",
  "actor": "<actor-A>",
  "setup": [
    { "_note": "satisfy C2, leave C1 unmet" }
  ],
  "steps": [
    {
      "request": { "method": "<verb>", "path": "<path>", "body": {} },
      "expect": { "status": "<expected-failure>" }
    }
  ]
}
```

## Worked example — quota-based rule

> Spec: "An `<actor>` with role `<role-X>` can create up to `<N>`
> `<resource>`s; the `<N+1>`th attempt returns 402."

Three flows are required:

```json
{
  "id": "<task-id>:<resource>-quota-positive",
  "description": "<actor> can create <resource> while under quota",
  "actor": "<actor>",
  "setup": [
    { "loop": "<N-1>", "create": "<resource>", "by": "<actor>" }
  ],
  "steps": [
    {
      "request": { "method": "POST", "path": "<create-path>", "body": {} },
      "expect": { "status": 201 }
    }
  ]
}
```

```json
{
  "id": "<task-id>:<resource>-quota-boundary",
  "description": "At quota, the next create returns 402",
  "actor": "<actor>",
  "setup": [
    { "loop": "<N>", "create": "<resource>", "by": "<actor>" }
  ],
  "steps": [
    {
      "request": { "method": "POST", "path": "<create-path>", "body": {} },
      "expect": { "status": 402 }
    }
  ]
}
```

```json
{
  "id": "<task-id>:<resource>-quota-negative-role",
  "description": "<other-role> cannot create <resource> at all (quota = 0)",
  "actor": "<actor-with-other-role>",
  "steps": [
    {
      "request": { "method": "POST", "path": "<create-path>", "body": {} },
      "expect": { "status": 403 }
    }
  ]
}
```

The boundary flow (`= N`) is what catches off-by-one mistakes the
positive flow alone cannot: a check `count < N` (correct) vs.
`count <= N` (off-by-one, ships if only the positive flow exists).
