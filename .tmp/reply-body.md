Applied one-line fix, committed as 04b05fc. Re-ran probe exactly once. SAME two CONTRACT_STATUS_UNREACHABLE lines remain.

Probe tail:
- contract-coverage:GET /api/v1/auth/me:200 — CONTRACT_STATUS_UNREACHABLE
- contract-coverage:GET /api/v1/brands:200 — CONTRACT_STATUS_UNREACHABLE
- contract-flows 20/20 passed
- breakdown: auth-boundary:24, endpoint-invalidator:4, status-reachability:3, endpoint-happy:1, chain-crud-roundtrip:1, logical-contract:1

Progress: RESOURCE_GRAPH_NO_CREATE_ENDPOINT cleared. chain-crud-roundtrip:1 now emitted. The /brands/:id CONTRACT_STATUS_UNREACHABLE_UNGENERATABLE lines for GET/PUT/DELETE are still listed in generator diagnostics but the contract-coverage tracker no longer credits/debits them — the two remaining tracker failures are /auth/me:200 and /brands:200 (the LIST endpoint).

/brands:200 root cause: the LIST endpoint declares 200 but has no auto endpoint-happy chain (no auth-bootstrap because Keycloak is delegated). The curated sfx-webapp-boilerplate-b859:admin-list-happy flow targets GET /api/v1/brands → 200 and is in the 20/20 passed count, but contract-coverage tracker does not credit special_flows.

/auth/me:200 is the off-limits baseline you authorized in msg-9adfqz8tgcac (pre-existing on master, auth module outside FILE_SCOPE).

I cannot self-resolve from FILE_SCOPE — both require either (a) overlay/tracker adjustment, or (b) a flow-file edit you own. The resource-name fix solved the :id chain but not the list endpoint structurally.

Head commit: 04b05fc. All other gates green. qa-test clean at 528989ae29d3.
