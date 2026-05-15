Coordinator-authorized worker_done attempt was BLOCKED by the close-gate. Pasting the exact hook denial text below, per your msg-9adfqz8tgcac instruction. Standing by for your arbitration (overlay adjustment or coordinator-side flow-file extension, both yours to make).

## Exact hook denial

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BLOCKED: Cannot run `worker_done mail` — 1 quality gate(s) failed.
Rejected command: ov mail send --to coordinator --subject "Worker done: sfx-webapp-boilerplate-da81" --type worker_done --priority high --agent builder-brand-…
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### Runtime-verification probe
Runtime-verification probe FAILED (exitCode=1).

Block codes: CONTRACT_STATUS_UNREACHABLE

Block reason:
CONTRACT_STATUS_UNREACHABLE: GET /api/v1/auth/me declares 200 but no flow reached it (source: )

Failed cases:
  ✗ contract-coverage:GET /api/v1/auth/me:200 — CONTRACT_STATUS_UNREACHABLE: GET /api/v1/auth/me declares 200 but no flow reached it (source: )
  ✗ contract-coverage:GET /api/v1/brands:200 — CONTRACT_STATUS_UNREACHABLE: GET /api/v1/brands declares 200 but no flow reached it (source: )

Exit-code map:
  1 = app-under-test failure(s)     → fix the failing route/endpoint
  2 = boot or probe-internal error  → check .smoke-logs/start-*.log
  3 = matrix invalid                → regenerate with `pnpm matrix:regen`
  4 = config error / missing matrix → run `pnpm probe:smoke` from scratch
```

## Missing artifact (per hook expectations)

The hook expects a probe artifact reporting `total=N passed=N failed=0` for `contract-coverage`. The two failing cases above are emitted by the `contract-coverage` tracker even though both endpoints have curated `special_flows` that PASS (`task-auth:happy-admin-can-read-own-session`, `sfx-webapp-boilerplate-b859:admin-list-happy`). The tracker reports `(source: )` empty, suggesting it does not credit the curated `contract.source` field on these flows.

## Worker_done evidence (would have been the body)

Saved at `.tmp/worker-done-body.md` in my worktree. Contains:
- test-gates table (typecheck / lint / test / test:coverage / test:integration — all green)
- runtime-evidence JSON (`contract-flows total=20 passed=20 failed=0`)
- `### known-pre-existing-diagnostics` listing both `CONTRACT_STATUS_UNREACHABLE` lines with baseline reproduction citation and the curated flow ids that functionally cover each
- qa-test-evidence (report path `.claude/hook-reports/qa-test-sfx-webapp-boilerplate-b859-8a955dd536c6.md`, state hash `8a955dd536c6`, PASSED=24 FAILED=0 CRITICAL=0 HIGH=0)
- one-line diff summary, head commit `a270f9a`, branch ref `overstory/builder-brand-profile/sfx-webapp-boilerplate-b859`

Ready to retry worker_done the moment the gate clears. Will NOT iterate on the probe failure myself — both endpoints lie outside FILE_SCOPE-resolvable territory (auth/me is in the off-limits auth module; brands 200 needs either a curated-flow coverage-credit declaration the lead owns OR a matrix/overlay adjustment you own).
