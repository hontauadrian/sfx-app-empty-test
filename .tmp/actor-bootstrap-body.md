New probe failure pattern on the latest Stop-hook re-run (state hash `b83d6d4f9e3a`): actor-bootstrap is now failing for BOTH lead-owned actors with a network error. Per the `flow-failure-response` skill's decision-tree this is lead-owned territory — I have not touched any controller.

Full diagnostic block, verbatim:

```
[contract-flows-bootstrap-FAIL] actor=admin scheme=bearer-in-body source="/workspace/.overstory/worktrees/builder-brand-profile/.overstory/runtime-contract.flows/_shared.json" owner=lead reason="login network error: fetch failed"
[contract-flows-bootstrap-FAIL] actor=viewer scheme=bearer-in-body source="/workspace/.overstory/worktrees/builder-brand-profile/.overstory/runtime-contract.flows/_shared.json" owner=lead reason="login network error: fetch failed"
[contract-flows-execute] total=20 passed=7 failed=13 skipped=0 duration=45ms bootstrap-diagnostics=2
```

Cascading impact: 13 contract-flows now fail with `setAuth: binding 'admin' is neither a declared actor nor a captured binding` / `setAuth: binding 'viewer' ...`. These are the same lead-authored special_flows that passed (20/20) on every previous probe run today. The cascade includes both `task-auth:*` flows and all 13 `sfx-webapp-boilerplate-b859:admin-*` / `cross-tenant-*` flows.

Likely root cause: the `_shared.json` actor login bindings point at `${env:OAUTH_ISSUER_URL}/protocol/openid-connect/token`. That URL resolves (per `.stack.json`) to `http://keycloak.localtest.me:37729/realms/sfx-webapp-boilerplate/protocol/openid-connect/token`. The probe runner's network namespace evidently cannot reach `keycloak.localtest.me:37729` right now (the same hostname resolves fine from the Playwright Chromium MCP I drove through the full UI flow in the qa-test run an hour ago, so Keycloak itself is up). Possible triggers:

- The api container has been restarted multiple times by `pnpm probe:smoke` since the last successful contract-flows run — networking may have transiently dropped.
- The OAUTH_ISSUER_URL env may be resolving to the in-container hostname (`host.docker.internal`) instead of `keycloak.localtest.me` from the probe runner's perspective.

I am not touching `_shared.json` or the api/auth module (both off-limits per spec + flow-path-boundary hook).

The pre-existing contract-coverage gaps (`GET /api/v1/auth/me:200`, `GET /api/v1/brands:200`) are still listed — they have the same root cause as documented in msg-rgbbtkwp5sic / msg-qms1wfe7acfc / reply msg-w0zxcneiebqq, and they cascade off the same actor-bootstrap failure now (because the curated flows that would otherwise functionally cover them are also bootstrap-blocked).

Standing by for your arbitration on the actor-login network failure AND the curated-flow coverage-credit question.

(All code-side gates remain green: pnpm typecheck / lint / test / test:coverage / test:integration. qa-test full report was clean — PASSED=24 / FAILED=0 — at `.claude/hook-reports/qa-test-sfx-webapp-boilerplate-b859-528989ae29d3.md`.)
