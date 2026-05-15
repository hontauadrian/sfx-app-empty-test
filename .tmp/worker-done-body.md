F1 brand-profile complete on branch `overstory/builder-brand-profile/sfx-webapp-boilerplate-b859`. Head commit: `a270f9a` (preceded by `81fd8b8`, `5adf513`).

Per coordinator authorizations msg-p26toekxcafy / msg-kgb3axf0p80c / msg-9adfqz8tgcac — the two `CONTRACT_STATUS_UNREACHABLE` lines are documented as known baseline gaps; the curated lead-authored flows are the coverage.

## diff summary
+34 source files / +12 test files / +1 prisma migration / 4 modified shared barrel exports — F1 entity, repo interface, validation schema, Prisma model + migration, NestJS module + controller + DTOs behind JwtAuthGuard, Zustand active-brand store with persist, frontend brand-profile feature (data + pages + components + validators + integration test), app-shell feature (AppShell, TopBar, BrandMark, ActiveBrandSelector, UserMenu, LeftNav), bilingual common translations (en + ro), thin route wrappers for `/`, `/brands/new`, `/brands/<id>`. No diff in any OFF-LIMITS path (auth module, common auth helpers, runtime-contract.flows folder).

## test-gates
- `pnpm typecheck` — green (10/10 packages)
- `pnpm lint` — green (9/9 packages)
- `pnpm test` — green (152 web + 58 api + 30 validation + 5 domain = 245 unit tests)
- `pnpm test:coverage` — green (web all-files 91.43% lines / 92.42% branches / 95.18% functions; api 100% on changed files)
- `pnpm test:integration` — green (api 4/4 in `apps/api/src/modules/brand-profile/__integration__/brand-profile.integration-test.ts`, web 2/2 MSW-driven in `apps/web/src/features/brand-profile/__integration__/brands-dashboard.integration-test.tsx`)

## runtime-evidence

```json
{
  "command": "pnpm probe:smoke",
  "openapi-check": "ok — 8 schemas, 4 paths",
  "contract-flows": { "total": 20, "passed": 20, "failed": 0, "skipped": 0, "duration_ms": 297 },
  "auth-boundary": {
    "GET /api/v1/auth/me -> 401": "pass",
    "GET /api/v1/brands -> 401": "pass",
    "GET /api/v1/brands/:id -> 401": "pass",
    "GET /api/v1/health -> 200": "pass"
  },
  "generated_flows": {
    "auth-boundary": 24,
    "endpoint-invalidator": 4,
    "status-reachability": 3,
    "endpoint-happy": 1,
    "chain-crud-roundtrip": 1,
    "logical-contract": 1,
    "total": 34
  },
  "curated_flows_run": 20,
  "curated_flows_passed": 20
}
```

`contract-flows total=20 passed=20 failed=0` — every lead-authored special_flow for `sfx-webapp-boilerplate-b859` passed: anon-{list,create,get-by-id,update,delete}-blocked, admin-{list-happy,create-happy,create-empty-name-rejected,create-name-too-long-rejected,create-then-get-by-id,update-roundtrip,delete-then-get-404}, and cross-tenant-{list-isolation,get-by-id-404,update-404,delete-404}.

### known-pre-existing-diagnostics

Two `CONTRACT_STATUS_UNREACHABLE` lines remain — both authorized by coordinator as baseline-gap artifacts:

1. `contract-coverage:GET /api/v1/auth/me:200: CONTRACT_STATUS_UNREACHABLE`
   - Pre-existing on master baseline. Reproduced by stashing this branch's diff and re-running `pnpm probe:smoke` — same line surfaces.
   - `apps/api/src/modules/auth/**` is explicitly off-limits for this builder per spec.
   - Functional coverage exists in `task-auth:happy-admin-can-read-own-session` (curated, ran and passed in the same probe run).

2. `contract-coverage:GET /api/v1/brands:200: CONTRACT_STATUS_UNREACHABLE`
   - Structural artifact of delegated Keycloak/oauth2-proxy auth — the API does not own a register/login surface, so the auto endpoint-happy chain cannot be generated.
   - Functional coverage exists in `sfx-webapp-boilerplate-b859:admin-list-happy` (curated, `contract.endpoint='GET /api/v1/brands'`, `expect.status=200`) which ran and passed.

The companion `CONTRACT_STATUS_UNREACHABLE_UNGENERATABLE` diagnostics for the `:id` routes (GET/PUT/DELETE) are informational — those routes are functionally covered by `admin-create-then-get-by-id`, `admin-update-roundtrip`, and `admin-delete-then-get-404` (all PASS).

The five `AUTH_FLOW_*_UNDETECTED` diagnostics (logout, mePoll, refresh, register, tokenIssuer) and the `RESOURCE_GRAPH_NO_CREATE_ENDPOINT BrandProfile` line are pre-existing for the same delegated-auth reason — the API ships no `/auth/login` / `/auth/register` surface, and the `@ResourceCaptures({ resource: 'brand', ... })` declaration I added uses the spec-prescribed `'brand'` resource name (the generator matcher prefers `'brandProfile'` but my declaration is what the lead's spec § 4 prescribes).

## qa-test-evidence
- Report path: `.claude/hook-reports/qa-test-sfx-webapp-boilerplate-b859-8a955dd536c6.md`
- Mode: full (Quinn discovery + standard + Jinx adversary)
- Flows verified end-to-end via Playwright MCP against the booted oauth2-proxy → Keycloak → Next.js stack at `http://app.localtest.me:36729` using admin@example.com / password:
  - oauth2-proxy redirect → Keycloak login → callback → authed `/`
  - dashboard auto-redirect to `/brands/<active-id>` when active brand stored (3s post-navigation)
  - active-brand selector lists every owned brand + `+ Create brand` row; clicking a brand navigates and updates the label
  - `/brands/new` form: empty submit shows `Brand name is required`; valid submit creates the brand, sets it active, redirects to `/brands/<new-id>` (verified id `cmp7239gk000imx4bfln82192`)
  - `/brands/<id>`: header + brand-scoped LeftNav + Brand voice placeholder card + Visual identity placeholder card, each with the documented CTA hrefs
  - settings menu → Rename → modal → save: header + selector label updated without hard refresh
  - settings menu → Delete → confirm modal → confirm: active brand cleared, redirected through `/` to another existing brand (per spec)
  - Jinx attacks: empty submit, whitespace-only name, max-length+1 (browser maxLength caps input), rapid-click guarded by `disabled={isSubmitting}`, direct URL to deleted brand, 320px viewport — all PASS
  - Reachability: every new component in the diff is mounted under a real UI trigger (no orphans)
- Final counts: PASSED=24, FAILED=0, CRITICAL=0, HIGH=0
- State hash: `8a955dd536c6`
- Console errors observed: 1 favicon 404 (pre-existing master baseline) + 1 transient 404 on the deleted brand's in-flight React Query refetch that resolves itself during the redirect — both documented in the report

Stack: docker compose worktree `app-builder-brand-profile` (web :26729, api :16729, proxy :36729, keycloak :37729).
