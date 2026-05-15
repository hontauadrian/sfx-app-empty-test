## Escalation — Option A insufficient for mx-cd88c5

r5 ran `pnpm probe:smoke` once on fcf811f. EXIT:1, same two failures as r3:
- `contract-coverage GET /api/v1/auth/me:200 CONTRACT_STATUS_UNREACHABLE`
- `contract-coverage GET /api/v1/brands:200 CONTRACT_STATUS_UNREACHABLE`

Curated contract-flows: 20/20 PASS at runtime. Generator UNGENERATABLE filter excludes them. Smoke gate still rejects them.

## Builder's "asymmetric patch" hypothesis is wrong

Builder noted 31 insertions in `claude-profiles/builder/hooks/probes/http-smoke.ts` vs 39 in the other 4 profiles and inferred incomplete deploy. I verified the diff myself from /workspace — the asymmetry is NOT the ordering fix:

- All 5 profiles got the **identical** 31-line ordering block at L961+ (pre-populates `observedTuples` from `curatedSummary.contract.specialFlows[].flow.steps` api+expect pairs, normalizes method upper-case, handles `step.status` + `step.statusAnyOf`).
- Lead/merger/reviewer/scout (4 of 5) additionally got an 8-line `host`-override delta in `readStackRuntimeEnvValue` at L1323+ — **unrelated** to mx-cd88c5, looks like a separate worker-host fix that happened to ride along.

So the ordering patch IS live in builder run-path. The bug reproduces anyway.

## Likely real root causes

Patch shape:
```ts
observedTuples.add(`${lastApi.method} ${lastApi.path} ${step.status}`)
```

The two failures are `GET /api/v1/auth/me 200` and `GET /api/v1/brands 200` — both **no path params**. So 928e961's path-param canonicalization is not relevant here. Candidates:

1. **Path-prefix mismatch.** `step.path` in the curated flow JSON may be `/auth/me` (loader prepends `/api/v1`) or absolute `http://...:3000/api/v1/auth/me`. observedTuples ends up with a tuple the contract-tuples set never matches. Compare what's in `.overstory/runtime-contract.flows/_shared.json` and `task-auth.json` against what `checkContractCoverage` builds from the contract-side status enumeration.
2. **`curatedSummary.contract.specialFlows` not populated at gate time.** The patch sits inside `runHttpSmokeMain` at L961 — verify `curatedSummary.contract` is the assembled multi-file contract by that point, not still-loading. If empty, the for-loop is a no-op.
3. **Method case or trailing-slash mismatch.** Patch uppercases method; if contract-side tuples have lower-case method or canonical-vs-as-declared path normalization elsewhere, the .add() builds the wrong key.

## Coverage matrix file inspection

I can't (and won't) edit `.flows.generated.json` or probe internals. Recommend you (operator):

```bash
# Pin down which side has the wrong tuple
grep -n 'observedTuples' .overstory/claude-profiles/builder/hooks/probes/http-smoke.ts
# Then compare with how checkContractCoverage builds the contract-side set
```

The smoke-json output file (which builder couldn't `jq`) is the fastest answer — print `observedTuples` and the missing-tuples list side-by-side.

## Decision points

Per mulch mx-cd88c5 you had three options. Option A applied as designed but the fix doesn't reach the failure mode. Suggest:

- **A'** — same approach, fix the tuple-key build to match contract-side normalization (probably the bug is one line: path or method form).
- **B** — move /auth/me and /brands curated flows from per-task json to `_shared.json` (loadCuratedFlowSteps L174 excludes _shared.json from coverage credit → ungeneratableStatuses gets the credit → gate clears). Cleanest if you don't want to touch http-smoke.ts again.
- **C** — gate override (.runtime-contract.overlay.json — but matrix-ignore on a path the diff introduced is hook-blocked, so this likely fails).

I'd recommend B at this point — A took two patch rounds already (canonicalize 928e961 + ordering fcf811f), still reproduces, and the smoke gate is acquiring scar tissue.

## Holding state

- r5 builder parked (msg-lcm0ik5hjaqs — "hold, do not commit cosmetic deletions").
- HEAD fcf811f untouched.
- No code edits. No further slings until you decide A'/B/C.

Reply with decision + any patch you apply, I'll re-spawn r6 from the chosen base.
