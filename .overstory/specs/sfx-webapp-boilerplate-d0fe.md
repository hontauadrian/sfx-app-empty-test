<!-- written-by: scout-f5-history -->
# F5: Frontend history view (list + read-only detail)

**Feature task:** `sfx-webapp-boilerplate-d0fe`
**Scout subtask:** `sfx-webapp-boilerplate-66a6`
**Top-level plan:** `.overstory/specs/sfx-webapp-boilerplate-26a0.md` §3 Chunk C + §5 J2 (frontend half)
**Mode:** direct-builder. Web-only — no Prisma, no API, no migration, no new endpoints.
**Dependencies merged on dev:** F1 backend (`8907`), F2 frontend form (`30fe`), F3 admin tab shell (`1c10`), F4 backend versioning (`1ef9`).

---

## 1. Context — files read

| Path | Purpose |
|---|---|
| `.overstory/specs/sfx-webapp-boilerplate-26a0.md` | Phase-2 product plan (§3 Chunk C + §5 J2) — authoritative behavior for J2 |
| `.overstory/runtime-contract.flows/sfx-webapp-boilerplate-1ef9.json` | F4 flow file — confirms exact backend response envelopes |
| `apps/web/src/features/company-info/presentation/pages/company-info/index.tsx` | F2 form layout. Read-only view MUST mirror its 4-fieldset structure + ArrayField for `coreValues`/`certifications` |
| `apps/web/src/features/company-info/presentation/pages/company-info/types.ts` | `CompanyInfoFieldUIModel`, `CompanyInfoSectionUIModel`, `CompanyInfoSectionKey` — reusable read-only |
| `apps/web/src/features/company-info/presentation/pages/company-info/map-to-company-info-page-ui-model.ts` | `SECTION_SPECS` (legalRegistration / identity / keyFacts / contact) + builders — reusable |
| `apps/web/src/features/company-info/presentation/pages/company-info/use-company-info.ts` | Hook pattern (resolver, translations, error classification). Skeleton for new hooks |
| `apps/web/src/features/company-info/data/repositories/use-company-info-repository.ts` | React-Query repository pattern — `useQuery` w/ `queryKey`, `select` mapper, `retry: false` |
| `apps/web/src/features/company-info/data/remote/fetch-company-info.ts` | `executeRequest<ApiEnvelope<T>>` envelope pattern; `path` is path-relative (`api/v1/...`) |
| `apps/web/src/features/company-info/data/remote/update-company-info.ts` | PUT example confirming envelope shape |
| `apps/web/src/features/company-info/data/mapper/map-to-company-info.ts` | ISO-string → Date rehydration for `createdAt`/`updatedAt` |
| `apps/web/src/features/company-info/data/model/company-info-data-model.ts` | `CompanyInfoDataModel` — versions DTO reuses this as `snapshot` shape |
| `apps/web/src/features/company-info/constants.ts` | `COMPANY_INFO_ENDPOINT`, `COMPANY_INFO_QUERY_KEY` |
| `apps/web/src/app/admin/layout.tsx` | `AuthGate` + `AdminRouteGate` + `AdminTabBar` already wrap all `/admin/**` — F5 inherits |
| `apps/web/src/app/admin/company-info/page.tsx` | Thin route wrapper template |
| `apps/web/src/features/admin-shell/constants.ts` | `ADMIN_TAB_REGISTRY` active-state predicate already matches `/admin/company-info/**` |
| `apps/web/src/features/admin-shell/presentation/components/AdminTabBar/index.tsx` | Tab bar consumed from layout (no per-page wiring) |
| `apps/web/src/features/presentation/networking/execute-request.ts` | 401 auto-redirects to `/oauth2/sign_in?rd=...`; envelope `{ success:true, data:T }` |
| `apps/web/src/features/presentation/localization/types.ts` | `CommonTranslations` typed surface — extend with history keys; TS enforces en+ro parity |
| `apps/web/src/features/presentation/localization/languages/en/common.ts` + `ro/common.ts` | Existing translations — extend with history copy |
| `packages/domain/src/entities/company-info-version.ts` | `CompanyInfoVersion` + `ListCompanyInfoVersionsResult` — IMPORT, do NOT redeclare |
| `packages/domain/src/entities/company-info.ts` | `CompanyInfo` is the `snapshot` payload |
| `packages/domain/src/index.ts` | Type-only barrel — exports `CompanyInfoVersion`, `ListCompanyInfoVersionsResult` |
| `packages/validation/src/schemas/company-info.schema.ts` | `companyInfoVersionResponseSchema`, `companyInfoVersionsPageSchema`, `listCompanyInfoVersionsQuerySchema` |
| `apps/api/src/modules/company-info/application/controllers/company-info.controller.ts` | F4 endpoints (admin-guarded) consumed by F5 |
| `apps/api/src/modules/company-info/application/dto/company-info-version.dto.ts` | Wire DTO mirror of domain entity (createdAt is ISO string on the wire) |
| `apps/web/src/features/company-info/__integration__/company-info.integration-test.tsx` | MSW integration test pattern — F5 follows same harness |

---

## 2. Outcome (user-visible)

Authenticated admin sitting on `/admin/company-info` (the editable form) can:

1. See a **View history** link/affordance on the form page, visible alongside the existing **Save** button.
2. Click it → navigates to `/admin/company-info/history`.
3. The history list page:
   - Renders the same `<AdminTabBar>` (Company Info tab still active — verified by `ADMIN_TAB_REGISTRY` predicate already matching `/admin/company-info/*`).
   - Shows a **skeleton** while loading.
   - When loaded: a **newest-first** list of every saved version. Each row shows the saved timestamp (locale-formatted) and the editor display name. Each row is a `<Link>` to `/admin/company-info/history/<id>`.
   - When empty: empty-state copy `No versions yet — save the form to create the first version.`
   - On 403: reuses the denied surface for consistency with the editable page.
4. Click any row → navigates to `/admin/company-info/history/<versionId>`.
5. The version-detail page:
   - Renders the same `<AdminTabBar>` (Company Info still active).
   - Renders a **banner**: `Read-only — version saved by {editor} at {timestamp}`.
   - Renders the **same four sections** as the F2 editable form (Legal & Registration / Identity / Key Facts / Contact) with **all inputs disabled** (visually disabled + `aria-disabled="true"` + `disabled` attribute + `readOnly` where applicable). Array fields render as **read-only lists** (no Add/Remove buttons).
   - Renders a **Back to current** link returning to `/admin/company-info`.
   - On 404 (unknown id): renders a not-found surface with the **Back to current** link.
   - On 403: reuses the denied surface.
6. Hard-refresh on any history URL: page persists, gates re-evaluate via the parent layout.
7. Non-admin authed visitor: `AdminRouteGate` (inherited) denies. F5 adds NO per-page gates.
8. Unauth visitor: `AuthGate` (inherited) handles via oauth2-proxy redirect.

Pagination strategy for v1: spec §5 J2 only requires "after two PUTs, list shows ≥2 entries". **Builder MUST request the first page with the default `take` (50) and render only the items returned. Do NOT wire a "Load more" / cursor-follow UI in this feature** — the response carries `nextCursor` but exposing it is out of scope (defer to a future task). The hook MUST type the response so a follow-up can add Load-more without re-shaping (tolerate `nextCursor: string | null`).

---

## 3. Existing state (verified)

**F4 backend already merged on `dev`** (task `1ef9`). Endpoints exposed:

| Method | Path | Behavior |
|---|---|---|
| `GET /api/v1/company-info/versions` | List, newest-first. Query: `take` (1-100, default 50), `cursor` (id of last item on prior page). Response: `{ success:true, data:{ items: CompanyInfoVersionResponse[], nextCursor: string \| null } }`. 200 with empty page on unknown cursor. 401 unauth. 403 non-admin. 400 unknown query keys (strict). |
| `GET /api/v1/company-info/versions/:id` | Single version. Response: `{ success:true, data: CompanyInfoVersionResponse }`. 401 unauth. 403 non-admin. 404 missing. |

**Wire shape (`CompanyInfoVersionResponse`):**

```
{
  id: string;
  companyInfoId: string;
  snapshot: CompanyInfoResponse;   // every CompanyInfo field; scalar dates as ISO strings on wire
  editorUserId: string;
  editorDisplayName: string;
  createdAt: string;                // ISO-8601 on wire; Date in domain
}
```

**Already correct (do NOT modify):**
- `packages/domain/src/**` — `CompanyInfoVersion`, `ListCompanyInfoVersionsInput`, `ListCompanyInfoVersionsResult` exported.
- `packages/validation/src/schemas/company-info.schema.ts` — backend schemas exist.
- `apps/api/src/modules/company-info/**` — backend complete.
- `apps/web/src/app/admin/layout.tsx` — gates + tab bar already wrap all `/admin/**`.
- `apps/web/src/features/admin-shell/constants.ts` — predicate already matches `/admin/company-info/*`.
- `apps/web/src/features/company-info/presentation/pages/company-info/{types,map-to-company-info-page-ui-model}.ts` — `SECTION_SPECS` is the section schema F5 reuses.

**Builder MUST NOT touch:**
- `apps/web/src/features/auth/**`
- `apps/api/src/modules/auth/**`
- Anything under `packages/{domain,validation,database,shared}/**`
- F2 editable form internals (only the page-shell-level "View history" affordance is added)
- F4 controllers / DTOs / pipes
- `.overstory/runtime-contract.flows/sfx-webapp-boilerplate-d0fe.json` (path-boundary blocks builders)

---

## 4. Task breakdown

Tests are written FIRST per CLAUDE.md (the Stop gate + live pending-tests gate block forward motion without paired tests). Suggested order: A → B → C → D → E → F → G → H → I.

### Task A — Translations (en + ro + types)

| File | Change |
|---|---|
| `apps/web/src/features/presentation/localization/types.ts` | Extend `AdminTabsTranslations` with `readonly history: string`. Add `AdminCompanyInfoHistoryTranslations` + `AdminCompanyInfoHistoryDetailTranslations` (see §6 below) and add both to `AdminCompanyInfoTranslations`. |
| `apps/web/src/features/presentation/localization/languages/en/common.ts` | Add `admin.tabs.history = "History"`. Add `adminCompanyInfo.history.*` + `adminCompanyInfo.historyDetail.*` per §6. |
| `apps/web/src/features/presentation/localization/languages/ro/common.ts` | Same keys, Romanian translations. TS enforces parity. |

Tests:

| Test file | Asserts |
|---|---|
| `apps/web/src/features/presentation/localization/languages/en/__tests__/common.test.ts` (extend existing if present, else new) | New keys present on the typed object. |
| `apps/web/src/features/presentation/localization/languages/ro/__tests__/common.test.ts` | Same. |

### Task B — Data layer: model

| File | Change |
|---|---|
| `apps/web/src/features/company-info/data/model/company-info-version-data-model.ts` (NEW) | Export `CompanyInfoVersionDataModel` (wire shape: `id`, `companyInfoId`, `snapshot: CompanyInfoDataModel`, `editorUserId`, `editorDisplayName`, `createdAt: string`). Export `CompanyInfoVersionsPageDataModel` (`{ items: readonly CompanyInfoVersionDataModel[]; nextCursor: string \| null }`). |
| `apps/web/src/features/company-info/data/model/__tests__/company-info-version-data-model.test.ts` (NEW) | Type-shape smoke test (template: existing `company-info-data-model.test.ts`). |

### Task C — Data layer: mapper

| File | Change |
|---|---|
| `apps/web/src/features/company-info/data/mapper/map-to-company-info-version.ts` (NEW) | Two exports: `mapToCompanyInfoVersion(data: CompanyInfoVersionDataModel): CompanyInfoVersion` — rehydrates `data.createdAt` to `Date`, calls existing `mapToCompanyInfo(data.snapshot)` for the snapshot. Second: `mapToCompanyInfoVersionsPage(data: CompanyInfoVersionsPageDataModel): { items: readonly CompanyInfoVersion[]; nextCursor: string \| null }`. |
| `apps/web/src/features/company-info/data/mapper/__tests__/map-to-company-info-version.test.ts` (NEW) | (1) `createdAt` rehydrated to Date; (2) `snapshot.createdAt`/`snapshot.updatedAt` rehydrated via `mapToCompanyInfo`; (3) page mapper iterates items + preserves `nextCursor` (null + string cases). |

### Task D — Data layer: remote

| File | Change |
|---|---|
| `apps/web/src/features/company-info/data/remote/fetch-company-info-versions.ts` (NEW) | `fetchCompanyInfoVersions(params?: { take?: number; cursor?: string }): Promise<CompanyInfoVersionsPageDataModel>`. Path `${COMPANY_INFO_ENDPOINT}/versions` with optional querystring (only append `take`/`cursor` when defined; use `URLSearchParams`). Uses `executeRequest<ApiEnvelope<...>>`. |
| `apps/web/src/features/company-info/data/remote/fetch-company-info-version-by-id.ts` (NEW) | `fetchCompanyInfoVersionById(id: string): Promise<CompanyInfoVersionDataModel>`. Path `${COMPANY_INFO_ENDPOINT}/versions/${encodeURIComponent(id)}`. |
| `apps/web/src/features/company-info/data/remote/__tests__/fetch-company-info-versions.test.ts` (NEW) | Mock `executeRequest`. (1) default call uses no querystring; (2) `take` only → `?take=N`; (3) `take + cursor` → both params; (4) returns `response.data.data`. |
| `apps/web/src/features/company-info/data/remote/__tests__/fetch-company-info-version-by-id.test.ts` (NEW) | (1) path URL-encodes id; (2) returns `response.data.data`. |
| `apps/web/src/features/company-info/constants.ts` (EDIT) | Add `COMPANY_INFO_VERSIONS_QUERY_KEY = ["company-info", "versions"] as const` and `COMPANY_INFO_VERSION_QUERY_KEY = (id: string) => ["company-info", "versions", id] as const`. Matches existing prefix-array shape so a future `invalidateQueries({ queryKey: ["company-info"] })` refreshes singleton + versions atomically (see CLAUDE.md gotcha). |
| `apps/web/src/features/company-info/__tests__/constants.test.ts` (extend or new) | Asserts new keys (list is a 2-tuple array; detail factory returns a 3-tuple). |

### Task E — Data layer: repository hooks

| File | Change |
|---|---|
| `apps/web/src/features/company-info/data/repositories/use-company-info-versions-repository.ts` (NEW) | `useCompanyInfoVersionsRepository(input?: { take?: number; cursor?: string }): { versionsPageQuery: UseQueryResult<{ items: readonly CompanyInfoVersion[]; nextCursor: string \| null }, unknown> }`. `queryKey: [...COMPANY_INFO_VERSIONS_QUERY_KEY, input?.take ?? null, input?.cursor ?? null]`, `queryFn: () => fetchCompanyInfoVersions(input)`, `select: mapToCompanyInfoVersionsPage`, `retry: false`. |
| `apps/web/src/features/company-info/data/repositories/use-company-info-version-repository.ts` (NEW) | `useCompanyInfoVersionRepository(id: string): { versionQuery: UseQueryResult<CompanyInfoVersion, unknown> }`. `queryKey: COMPANY_INFO_VERSION_QUERY_KEY(id)`, `queryFn: () => fetchCompanyInfoVersionById(id)`, `select: mapToCompanyInfoVersion`, `retry: false`, `enabled: id.length > 0`. |
| `apps/web/src/features/company-info/data/repositories/__tests__/use-company-info-versions-repository.test.ts` (NEW) | Mock remote fetch. (1) happy path returns items mapped to domain (`createdAt: Date`); (2) error propagates; (3) different `take` produce different cache keys. Use `QueryClientProvider` wrapper + `renderHook`. |
| `apps/web/src/features/company-info/data/repositories/__tests__/use-company-info-version-repository.test.ts` (NEW) | (1) happy path; (2) 404 surfaces; (3) `enabled: false` when id empty. |

### Task F — Presentation: history list page (feature)

| File | Change |
|---|---|
| `apps/web/src/features/company-info/presentation/pages/company-info-history/types.ts` (NEW) | `CompanyInfoHistoryPageStatus = "loading" \| "empty" \| "ready" \| "denied" \| "error"`. `CompanyInfoHistoryRowUIModel { id; href; savedAtLabel; editorLabel; ariaLabel; }`. `CompanyInfoHistoryEmptyUIModel { title; message; }`. `CompanyInfoHistoryPageUIModel { status; title; columnHeaders:{savedAt;editor}; rows: readonly CompanyInfoHistoryRowUIModel[]; empty; denied: CompanyInfoDeniedUIModel; error:{title;message}; backToCurrent:{label;href}; }`. `UseCompanyInfoHistoryReturn = { uiModel }`. |
| `apps/web/src/features/company-info/presentation/pages/company-info-history/map-to-company-info-history-page-ui-model.ts` (NEW) | Pure mapper. Input: `{ translations, items, isLoading, isDenied, isErrored, locale }`. Derives status; formats `createdAt` via `new Intl.DateTimeFormat(locale, { dateStyle:"medium", timeStyle:"short" })`; builds rows with `href: /admin/company-info/history/${id}`. `backToCurrent.href = "/admin/company-info"`. |
| `apps/web/src/features/company-info/presentation/pages/company-info-history/use-company-info-history.ts` (NEW) | Reads `useTranslations("common")`, `useLanguage()` for locale, calls `useCompanyInfoVersionsRepository()` (default take), derives `isDenied` from `status === 403` on the query error (mirror `use-company-info.ts`), builds `uiModel` via mapper. |
| `apps/web/src/features/company-info/presentation/pages/company-info-history/index.tsx` (NEW) | `"use client"`. `export function CompanyInfoHistoryPage(): ReactNode`. Branches on `uiModel.status`: `loading` → `<CompanyInfoHistorySkeleton title={uiModel.title} />` (pulse motif from F2); `denied` → `<DeniedSurface uiModel={uiModel.denied} />` (lift from F2 — see Notable Finding #2); `empty` → empty-state `<section>` with title + message + back-to-current link; `error` → error surface; `ready` → semantic `<table>` with header row + `<tbody>` of `<tr>`-wrapped `<Link>` rows. Top: `<h1>` + back-to-current link. |
| `apps/web/src/features/company-info/presentation/pages/company-info-history/__tests__/CompanyInfoHistoryPage.test.tsx` (NEW) | Mock `useCompanyInfoHistory`. Assert each branch (loading busy=true; empty copy; ready N rows w/ href + visible timestamp + editor; denied; error; back-to-current link). |
| `apps/web/src/features/company-info/presentation/pages/company-info-history/__tests__/map-to-company-info-history-page-ui-model.test.ts` (NEW) | (1) loading → status "loading"; (2) empty list → "empty"; (3) populated → "ready" + rows mapped with deterministic en-US formatting; (4) isDenied → "denied"; (5) isErrored → "error"; (6) row `ariaLabel` includes editor + timestamp. |
| `apps/web/src/features/company-info/presentation/pages/company-info-history/__tests__/use-company-info-history.test.tsx` (NEW) | Mock repository + translations. Wrap in `QueryClientProvider`. Status transitions: loading → ready; loading → empty; 403 → denied; 500 → error. |
| `apps/web/src/features/company-info/index.ts` (EDIT) | Re-export `CompanyInfoHistoryPage`. |

### Task G — Presentation: history detail page (feature)

| File | Change |
|---|---|
| `apps/web/src/features/company-info/presentation/pages/company-info-history-detail/types.ts` (NEW) | `CompanyInfoHistoryDetailStatus = "loading" \| "ready" \| "denied" \| "not-found" \| "error"`. `CompanyInfoHistoryDetailSectionUIModel` = same shape as `CompanyInfoSectionUIModel` but each field carries `displayValue: string` (or array). `CompanyInfoHistoryDetailPageUIModel { status; title; banner:{message:string}; sections; backToCurrent:{label;href}; denied; notFound:{title;message;backToCurrentLabel;backToCurrentHref}; }`. `UseCompanyInfoHistoryDetailInput { versionId: string }`. `UseCompanyInfoHistoryDetailReturn { uiModel }`. |
| `apps/web/src/features/company-info/presentation/pages/company-info-history-detail/map-to-company-info-history-detail-page-ui-model.ts` (NEW) | Reuses `SECTION_SPECS` from the editable F2 module (import the constant — DO NOT redeclare). For each field, resolves displayValue from `version.snapshot[fieldName]` via switch on `field.type`: scalars → snapshot string or "—" (`emptyValuePlaceholder`); number → toString or "—"; textarea → snapshot string or "—"; array → raw `readonly string[]` for the renderer to draw a `<ul>`. Banner: substitutes `{editor}` and `{timestamp}` in `historyDetail.bannerTemplate`. |
| `apps/web/src/features/company-info/presentation/pages/company-info-history-detail/use-company-info-history-detail.ts` (NEW) | Calls `useCompanyInfoVersionRepository(versionId)`. Derives `isDenied` (403), `isNotFound` (404 — extract `RequestError.status`), `isErrored` (other), `isLoading`. Builds `uiModel` via mapper. |
| `apps/web/src/features/company-info/presentation/pages/company-info-history-detail/index.tsx` (NEW) | `"use client"`. `export function CompanyInfoHistoryDetailPage({ versionId }: { readonly versionId: string }): ReactNode`. Status branches: loading → skeleton; denied → `DeniedSurface`; `not-found` → not-found surface (title + message + back link); error → error surface; ready → banner (`role="status"`, `aria-live="polite"`) + four `<fieldset>` blocks mirroring F2, every input rendered as `<input>` / `<textarea>` / read-only `<ul>` (no add/remove). All inputs carry `disabled` AND `aria-disabled="true"` AND `readOnly` where supported. Back-to-current `<Link>` at bottom. |
| `apps/web/src/features/company-info/presentation/pages/company-info-history-detail/__tests__/CompanyInfoHistoryDetailPage.test.tsx` (NEW) | (1) banner text contains editor + timestamp; (2) all 20 field inputs/textareas present AND disabled AND aria-disabled="true"; (3) coreValues of 3 entries renders 3 `<li>` with no Add/Remove; (4) no `<button type="submit">`; (5) back link `/admin/company-info`; (6) not-found branch; (7) denied/error branches. |
| `apps/web/src/features/company-info/presentation/pages/company-info-history-detail/__tests__/map-to-company-info-history-detail-page-ui-model.test.ts` (NEW) | (1) null scalar → "—"; (2) number → "1998"; (3) array preserved; (4) banner substitution; (5) all status branches. |
| `apps/web/src/features/company-info/presentation/pages/company-info-history-detail/__tests__/use-company-info-history-detail.test.tsx` (NEW) | 404 → "not-found"; 403 → "denied"; 200 → "ready" with snapshot wired into UI model. |
| `apps/web/src/features/company-info/index.ts` (EDIT) | Re-export `CompanyInfoHistoryDetailPage`. |

### Task H — Route wrappers (thin app/ pages) + "View history" affordance

| File | Change |
|---|---|
| `apps/web/src/app/admin/company-info/history/page.tsx` (NEW) | Thin wrapper. `import { CompanyInfoHistoryPage } from "@/features/company-info"` + `export default function Page(): ReactNode { return <CompanyInfoHistoryPage />; }`. Include `/** @routeGuard authenticated @unauthRedirect /login */` JSDoc to match existing `/admin/company-info/page.tsx`. |
| `apps/web/src/app/admin/company-info/history/[versionId]/page.tsx` (NEW) | Next.js 15 async params: `export default async function Page({ params }: { params: Promise<{ versionId: string }> }): Promise<ReactNode> { const { versionId } = await params; return <CompanyInfoHistoryDetailPage versionId={versionId} />; }`. Same JSDoc. |
| `apps/web/src/app/admin/company-info/history/__tests__/page.test.tsx` (NEW) | Mock feature page. Assert thin-wrapper renders feature only, no per-page gates. Template: `apps/web/src/app/admin/company-info/__tests__/page.test.tsx`. |
| `apps/web/src/app/admin/company-info/history/[versionId]/__tests__/page.test.tsx` (NEW) | Same harness; assert versionId from awaited params forwarded to detail page. |
| `apps/web/src/features/company-info/presentation/pages/company-info/map-to-company-info-page-ui-model.ts` (EDIT) | Extend mapper output with `viewHistory: { label: string; href: string }`. label from `translations.adminCompanyInfo.history.viewHistoryCta`. href `"/admin/company-info/history"`. |
| `apps/web/src/features/company-info/presentation/pages/company-info/types.ts` (EDIT) | Add `viewHistory` to `CompanyInfoPageUIModel`. |
| `apps/web/src/features/company-info/presentation/pages/company-info/index.tsx` (EDIT) | Render `<Link href={uiModel.viewHistory.href}>{uiModel.viewHistory.label}</Link>` adjacent to the submit button (NOT inside `<form>`). |
| `apps/web/src/features/company-info/presentation/pages/company-info/__tests__/CompanyInfoPage.test.tsx` (EDIT) | Assert View history link present with `href="/admin/company-info/history"`. |
| `apps/web/src/features/company-info/presentation/pages/company-info/__tests__/map-to-company-info-page-ui-model.test.ts` (EDIT) | Assert `viewHistory.href` + label resolves from translations. |

### Task I — Integration test

| File | Change |
|---|---|
| `apps/web/src/features/company-info/__integration__/company-info-history.integration-test.tsx` (NEW) | MSW-backed integration test mirroring existing harness. Scenarios: (1) **List happy** — 2 items + `nextCursor: null` → hook reaches `status: "ready"`, newest-first preserved; (2) **Empty** — `{ items: [], nextCursor: null }` → `status: "empty"`; (3) **Denied** — 403 → `status: "denied"`; (4) **Detail happy** — version returned → banner data + section snapshots; (5) **Detail 404** → `status: "not-found"`; (6) **Detail 403** → `status: "denied"`. |

---

## 5. TDD plan per task

For every task above, order is invariant:

1. Create test file in `__tests__/` adjacent to the future source. Stub expected exports + types but leave implementations as `throw new Error("not implemented")` placeholders so TS sees the symbols.
2. Write failing tests for every behavior described in the task row. Each `it` test names one branch.
3. Run `pnpm --filter @sfx/web test -- --watch <test-file>` and watch the test fail.
4. Implement the source file. Iterate until every test in the file passes.
5. Run `pnpm --filter @sfx/web test:coverage` scoped to the file and verify 90%+. Add edge-case tests if needed (null fields, empty arrays, locale formatting under explicit en-US locale).
6. Move to the next task.

**Critical:** the live pending-tests gate injects a soft nudge when 3+ source files lack tests and HARD-BLOCKS `git commit` / `worker_done` / `sd close`. Writing tests in the same commit as source is mandatory.

---

## 6. Translation key surface (authoritative)

### types.ts additions

```
export interface AdminTabsTranslations {
  readonly companyInfo: string;
  readonly history: string;          // NEW
}

export interface AdminCompanyInfoHistoryTranslations {
  readonly pageTitle: string;          // "Company Info — History"
  readonly viewHistoryCta: string;     // "View history"
  readonly columnHeaders: {
    readonly savedAt: string;          // "Saved at"
    readonly editor: string;           // "Editor"
  };
  readonly emptyState: {
    readonly title: string;            // "No versions yet"
    readonly message: string;          // "Save the form to create the first version."
  };
  readonly loadingLabel: string;       // "Loading history…"
  readonly errorTitle: string;         // "We could not load history"
  readonly errorMessage: string;       // "Try again in a moment."
}

export interface AdminCompanyInfoHistoryDetailTranslations {
  readonly pageTitle: string;          // "Company Info — Version"
  readonly bannerTemplate: string;     // "Read-only — version saved by {editor} at {timestamp}"
  readonly backToCurrent: string;      // "Back to current"
  readonly readOnlyAriaSuffix: string; // " (read only)"
  readonly emptyValuePlaceholder: string; // "—"
  readonly notFoundTitle: string;      // "Version not found"
  readonly notFoundMessage: string;    // "This version does not exist or was removed."
}

export interface AdminCompanyInfoTranslations {
  // ... existing keys ...
  readonly history: AdminCompanyInfoHistoryTranslations;
  readonly historyDetail: AdminCompanyInfoHistoryDetailTranslations;
}
```

### Banner substitution

The mapper substitutes `{editor}` → `version.editorDisplayName` and `{timestamp}` → locale-formatted `version.createdAt`. Placeholders MUST appear literally in BOTH languages.

### Romanian template example

`"Doar citire — versiune salvata de {editor} la {timestamp}"`

---

## 7. Runtime acceptance (probe-asserted)

Restating §5 J2 for clarity:

1. `GET /admin/company-info` returns HTML containing a link with `href="/admin/company-info/history"` and label resolving from `adminCompanyInfo.history.viewHistoryCta` (en: "View history").
2. `GET /admin/company-info/history` returns HTML containing the admin tab bar with **Company Info** active AND either a table with column headers `Saved at` / `Editor` (when ≥1 version exists) OR the empty-state copy.
3. Each row visible is a link whose href matches `/admin/company-info/history/<id>` and whose visible text contains the editor display name + a locale-formatted timestamp.
4. `GET /admin/company-info/history/<valid-id>` returns HTML containing:
   - The admin tab bar with **Company Info** active.
   - A banner text matching `Read-only — version saved by <editor> at <timestamp>`.
   - 4 `<fieldset>` blocks matching the F2 sections.
   - Every input/textarea is `disabled` AND `aria-disabled="true"`.
   - No `<button type="submit">`, no Add/Remove buttons.
   - A link with `href="/admin/company-info"` and label resolving from `historyDetail.backToCurrent`.
5. `GET /admin/company-info/history/<unknown-id>` renders the not-found surface in-content (page returns 200; backend `GET /versions/:id` returns 404, data layer surfaces).
6. Hard refresh on either history route re-evaluates `AuthGate` + `AdminRouteGate` via inherited `/admin/layout.tsx` (no per-page gate).
7. Unauth visitor: `executeRequest` 401 path triggers oauth2-proxy redirect (existing behavior).
8. Non-admin authed visitor: `AdminRouteGate` denies (existing behavior).
9. No regression: sidebar `Admin` item still visible to admins, absent for non-admins; editable `/admin/company-info` flow continues to work end-to-end.

### Probe coverage observations

F4 flow file already covers: `GET /versions` newest-first; `GET /versions` admin happy / viewer 403 / anonymous 401; `GET /versions/:id` admin happy / viewer 403 / anonymous 401 / unknown id 404; unknown cursor → 200 empty; strict-query unknown key → 400.

F5 introduces NO new endpoint. NO backend flows added.

If runtime-probe coverage of the **frontend matrix** (page-level rendering of newest-first list, banner content, disabled inputs) is required, the coordinator (not scout, not builder) must author it. **Recommendation: extend the d0fe flow file with two `kind:"http"` flows that fetch the rendered HTML of `/admin/company-info/history` (after a setup PUT) and `/admin/company-info/history/<vid>` (after capture from list) and assert the page contains the expected text fragments + `disabled` attribute on the inputs.** Builder is path-blocked from authoring this. Scout cannot author either.

---

## 8. Guard contract

- Both new pages protected by existing `/admin/layout.tsx` (`AuthGate` + `AdminRouteGate`). F5 adds NO per-page gates.
- Unauth behavior: `executeRequest` 401 path auto-redirects to `/oauth2/sign_in?rd=<returnTo>`.
- Non-admin behavior: `AdminRouteGate` renders denied surface.
- API guards: F4 endpoints already declare `@UseGuards(JwtAuthGuard) @AuthRoles(AUTH_ROLE_ADMIN)`. No frontend-side role checks.

| Surface | Guard category |
|---|---|
| `/admin/company-info/history` (page) | authenticated + admin role (inherited from `/admin/layout.tsx`) |
| `/admin/company-info/history/[versionId]` (page) | Same |
| `GET /api/v1/company-info/versions` (consumed) | authenticated + admin role (F4-shipped) |
| `GET /api/v1/company-info/versions/:id` (consumed) | Same |

---

## 9. File scope (exclusive ownership for builder)

Worktree-rooted paths. Builder MUST limit edits to this list.

**New files:**
- `apps/web/src/app/admin/company-info/history/page.tsx`
- `apps/web/src/app/admin/company-info/history/[versionId]/page.tsx`
- `apps/web/src/app/admin/company-info/history/__tests__/page.test.tsx`
- `apps/web/src/app/admin/company-info/history/[versionId]/__tests__/page.test.tsx`
- `apps/web/src/features/company-info/data/model/company-info-version-data-model.ts`
- `apps/web/src/features/company-info/data/model/__tests__/company-info-version-data-model.test.ts`
- `apps/web/src/features/company-info/data/mapper/map-to-company-info-version.ts`
- `apps/web/src/features/company-info/data/mapper/__tests__/map-to-company-info-version.test.ts`
- `apps/web/src/features/company-info/data/remote/fetch-company-info-versions.ts`
- `apps/web/src/features/company-info/data/remote/fetch-company-info-version-by-id.ts`
- `apps/web/src/features/company-info/data/remote/__tests__/fetch-company-info-versions.test.ts`
- `apps/web/src/features/company-info/data/remote/__tests__/fetch-company-info-version-by-id.test.ts`
- `apps/web/src/features/company-info/data/repositories/use-company-info-versions-repository.ts`
- `apps/web/src/features/company-info/data/repositories/use-company-info-version-repository.ts`
- `apps/web/src/features/company-info/data/repositories/__tests__/use-company-info-versions-repository.test.ts`
- `apps/web/src/features/company-info/data/repositories/__tests__/use-company-info-version-repository.test.ts`
- `apps/web/src/features/company-info/presentation/pages/company-info-history/index.tsx`
- `apps/web/src/features/company-info/presentation/pages/company-info-history/types.ts`
- `apps/web/src/features/company-info/presentation/pages/company-info-history/use-company-info-history.ts`
- `apps/web/src/features/company-info/presentation/pages/company-info-history/map-to-company-info-history-page-ui-model.ts`
- `apps/web/src/features/company-info/presentation/pages/company-info-history/__tests__/CompanyInfoHistoryPage.test.tsx`
- `apps/web/src/features/company-info/presentation/pages/company-info-history/__tests__/use-company-info-history.test.tsx`
- `apps/web/src/features/company-info/presentation/pages/company-info-history/__tests__/map-to-company-info-history-page-ui-model.test.ts`
- `apps/web/src/features/company-info/presentation/pages/company-info-history-detail/index.tsx`
- `apps/web/src/features/company-info/presentation/pages/company-info-history-detail/types.ts`
- `apps/web/src/features/company-info/presentation/pages/company-info-history-detail/use-company-info-history-detail.ts`
- `apps/web/src/features/company-info/presentation/pages/company-info-history-detail/map-to-company-info-history-detail-page-ui-model.ts`
- `apps/web/src/features/company-info/presentation/pages/company-info-history-detail/__tests__/CompanyInfoHistoryDetailPage.test.tsx`
- `apps/web/src/features/company-info/presentation/pages/company-info-history-detail/__tests__/use-company-info-history-detail.test.tsx`
- `apps/web/src/features/company-info/presentation/pages/company-info-history-detail/__tests__/map-to-company-info-history-detail-page-ui-model.test.ts`
- `apps/web/src/features/company-info/__integration__/company-info-history.integration-test.tsx`

**Edited files (additive — do NOT remove existing exports):**
- `apps/web/src/features/company-info/index.ts` — add 2 new page exports.
- `apps/web/src/features/company-info/constants.ts` — add 2 query-key constants.
- `apps/web/src/features/presentation/localization/types.ts` — add new interfaces + tabs.history.
- `apps/web/src/features/presentation/localization/languages/en/common.ts` — add new keys.
- `apps/web/src/features/presentation/localization/languages/ro/common.ts` — add new keys.
- `apps/web/src/features/company-info/presentation/pages/company-info/{types,map-to-company-info-page-ui-model,index}.{ts,tsx}` — add `viewHistory` + render the link.
- `apps/web/src/features/company-info/presentation/pages/company-info/__tests__/{CompanyInfoPage,map-to-company-info-page-ui-model}.test.{ts,tsx}` — assert new link.
- `apps/web/src/features/company-info/__tests__/constants.test.ts` (or co-located if no `__tests__/` exists) — assert new query-key shapes.
- `apps/web/src/features/presentation/localization/languages/{en,ro}/__tests__/common.test.ts` — extend with new keys.

**OUT of scope (DO NOT touch):**
- `apps/web/src/features/auth/**`
- `apps/api/**`
- `packages/**`
- `apps/web/src/features/admin-shell/**` (predicate already covers `/admin/company-info/**`)
- `.overstory/runtime-contract.flows/**` (path-blocked for builders)
- `.claude/runtime-contract.{logical,overlay}.json`

---

## 10. Recommended `ml prime` + skill invocations for builder

Before opening any file:

```
ml prime --files apps/web/src/features/company-info/presentation/pages/company-info/use-company-info.ts
ml prime --files apps/web/src/features/company-info/data/repositories/use-company-info-repository.ts
ml prime --files apps/web/src/features/presentation/networking/execute-request.ts
ml search "executeRequest error parser"
ml search "rhf-array-list-field-flat-schema"
ml search "tab registry active-state"
```

Skill invocations (each via the `Skill` tool, NOT `Read`):

- `Skill(skill: "page-pattern")` — before authoring history pages. Enforces (page wrapper + feature page + hook + mapper + types + nav handler) layering.
- `Skill(skill: "web-patterns")` — before wiring the Next.js 15 dynamic route (`params` is async); reinforces thin-wrapper-only rule for `app/`.
- `Skill(skill: "clean-architecture")` — data + presentation split for the new feature subdomain.
- `Skill(skill: "ui-styling")` — for read-only inputs / banner / table styling. Skeleton already uses `bg-muted` pulse motif (see the F2 page index lines 235-247).
- `Skill(skill: "ui-ux-pro-max")` — for banner contrast + table row hover + read-only input visual distinction.

Builder should NOT invoke `nestjs-probe-coverage` or `build-verifiable-features` — web-only feature, no decorators to add.

If runtime probe reports a backend-side `FLOW_NEW_ENDPOINT_UNCOVERED` or `FLOW_STEP_FAILED`, invoke `Skill(skill: "flow-failure-response")`. Per F4 coverage, this should not occur.

---

## 11. Notable findings (classification per overlay protocol)

| # | Finding | Classification |
|---|---|---|
| 1 | `ADMIN_TAB_REGISTRY.isActive` predicate at `apps/web/src/features/admin-shell/constants.ts:20-23` already matches `/admin/company-info/*` via `pathname.startsWith(/admin/company-info/)`. F5 needs ZERO changes to the tab bar. | **foundational** — already recorded as `mx-a9eaa5`. Builder MUST NOT add the history route to the registry. |
| 2 | `DeniedSurface` is currently inlined inside the F2 page file (`apps/web/src/features/company-info/presentation/pages/company-info/index.tsx:253-268`, private function, not exported). History pages need the same surface. Builder should **lift** `DeniedSurface` to a shared module (e.g. `apps/web/src/features/admin-shell/presentation/components/DeniedSurface/index.tsx`) and re-export. F2 tests must be updated. | **tactical** — recommend `ml record` after lift. |
| 3 | `executeRequest` error envelope reads `errorBody.error.message` AND `errorBody.error.errors[]` first, fallback to top-level. Foundational record `mx-e7eb2d`. History hooks reuse error path verbatim. | **foundational** — already recorded. |
| 4 | Locale formatting must be deterministic in tests. `new Intl.DateTimeFormat(locale, ...)` produces locale-specific output; tests MUST pin locale to `"en-US"` (or whatever `useLanguage()` returns for `"en"`) and assert against the deterministic string. Mapper takes `locale` as an injected parameter — locale is data, not a hook dep. | **tactical** — record once builder confirms the `useLanguage` API. |
| 5 | F4 backend `cursor` invalid semantics is `empty-200`, declared via `@ApiExtension("x-cursor-invalid-behavior", "empty-200")` at `apps/api/src/modules/company-info/application/controllers/company-info.controller.ts:110`. F5 does NOT pass `cursor` in v1, but the repository test should encode the 200-empty + null-nextCursor expectation for future Load-more. | **foundational — protocol contract.** |
| 6 | Next.js 15 `params` is async. Dynamic-route pages must `await` the params promise. F5 `[versionId]/page.tsx` is the codebase first dynamic admin route — record the pattern. | **tactical — convention.** Worth `ml record`. |
| 7 | Query-key shape `["company-info"]` is the existing singleton key. Adding versions under `["company-info", "versions"]` and detail under `["company-info", "versions", id]` uses React-Query prefix matching so a future `invalidateQueries({ queryKey: ["company-info"] })` (e.g. after PUT) refreshes BOTH singleton AND versions list automatically. CLAUDE.md gotcha already warns. F5 MUST respect array-prefix structure (NOT string keys). | **foundational — repository convention.** |
| 8 | `useFieldArray` is intentionally NOT used in F2. Record `mx-852671` (rhf-array-list-field-flat-schema): flat `string[]` Zod schemas use `form.watch` + `form.setValue`. F5 detail page is read-only — uses neither, renders as `<ul>`. | **foundational** — already recorded. |
| 9 | Integration test harness uses `vitest`, not `jest` (see `company-info.integration-test.tsx`). Although CLAUDE.md mentions Jest, actual `apps/web` runner is vitest with `vi.mock`. Builder MUST use vitest for new tests. | **observational** — confirm before recording. |
| 10 | Flow file `.overstory/runtime-contract.flows/sfx-webapp-boilerplate-d0fe.json` is empty (no `owns`, no `special_flows`). Path-boundary blocks builders + scouts. Coordinator decision: if frontend matrix coverage of disabled inputs / banner content is required, coordinator authors the flow update. Otherwise F5 inherits F4 backend coverage. | **decision** — coordinator visibility, not a record. |

---

## 12. Acceptance checklist (gate pipeline)

Builder MUST run and pass every step before sending `worker_done`. Gate chain blocks at every step.

- [ ] `pnpm typecheck` — zero TS errors across monorepo.
- [ ] `pnpm lint` — zero lint errors across monorepo.
- [ ] `pnpm --filter @sfx/web test:coverage` — every new + edited file ≥ 90% line/branch.
- [ ] `pnpm test:coverage` — root coverage gate still passes.
- [ ] `pnpm test:integration` — `company-info-history.integration-test.tsx` passes; existing `company-info.integration-test.tsx` still passes.
- [ ] `pnpm stack:up && pnpm probe:smoke` — all generated + curated flows green. No `FLOW_NEW_ENDPOINT_UNCOVERED`. No `[http-smoke-FAIL]`.
- [ ] `Skill(skill: "qa-test")` full mode against `/admin/company-info` + `/admin/company-info/history` + `/admin/company-info/history/<vid>` with admin Keycloak login. PASSED rows include:
  - `/admin/company-info` shows View history link.
  - Link → `/admin/company-info/history` with tab bar showing Company Info active.
  - List populated after two saves (newest-first verified).
  - Empty state on fresh db (re-seed if needed).
  - Row click → detail page renders banner, all inputs disabled, no submit button, back link returns to `/admin/company-info`.
  - Non-admin (viewer) → denied surface on both history routes.
  - Unauth → oauth2-proxy redirect.
- [ ] `pnpm --filter @sfx/web test -- run` — full unit-test suite passes.
- [ ] Live pending-tests gate reports zero pending tests.
- [ ] Conventional commit: `feat(web): add admin company-info history list + read-only detail`.
- [ ] worker_done mail to lead/coordinator includes runtime-evidence JSON + qa-test evidence + this spec path.

---

## 13. References

- Top-level plan: `.overstory/specs/sfx-webapp-boilerplate-26a0.md`
- F2 frontend form spec: `.overstory/specs/sfx-webapp-boilerplate-30fe.md`
- F3 admin tab shell spec: `.overstory/specs/sfx-webapp-boilerplate-1c10.md`
- F4 backend versioning flow: `.overstory/runtime-contract.flows/sfx-webapp-boilerplate-1ef9.json`
- F4 spec file: NOT present in `.overstory/specs/` (issue closed without scout-spec writeback; backend behavior fully captured in flow file + controller source).
- F5 placeholder flow: `.overstory/runtime-contract.flows/sfx-webapp-boilerplate-d0fe.json` (empty; coordinator-owned).
