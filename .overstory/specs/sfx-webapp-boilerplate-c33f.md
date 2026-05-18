# Admin Sidebar + Company Info Management

Top-level issue: `sfx-webapp-boilerplate-c33f`
Brief source: chat dispatch 2026-05-16. The dispatch arrived truncated mid-sentence at "Admin — navigates to the admin sec". Operator question mailed; not awaited. Plan adopts the minimal interpretation per propulsion-principle and preserves the existing Keycloak + oauth2-proxy auth scaffold (no replacement login/register, no local JWT, no removal of OAuth env vars).

---

## 1. Primary user journeys

### J1. Authenticated non-admin lands on Home
- **Entry:** an authenticated user with no admin role opens the home surface (root path).
- **Sequence:** `AuthGate` resolves the existing `/api/v1/auth/me` session → allows children → root layout mounts the new left sidebar → only the `Home` nav item is rendered (Admin nav is hidden because `AuthSession.roles` does not contain the admin role).
- **Exit:** user remains on Home; no admin-only affordance is exposed to them anywhere in the app shell.

### J2. Authenticated admin navigates to Admin → Company Info
- **Entry:** an authenticated user whose `AuthSession.roles` contains the admin role opens the home surface.
- **Sequence:** sidebar renders with both `Home` (active) and `Admin` → user clicks `Admin` → client-side navigation lands on the admin landing surface → the landing surface lists `Company Info` as the only sub-item → user clicks `Company Info` → client-side navigation lands on the Company Info management surface → the page fetches the singleton record on mount.
- **Exit:** the form on the Company Info surface is rendered with either the persisted values pre-filled or the empty-state inputs.

### J3. Admin edits and saves Company Info
- **Entry:** admin is on the Company Info management surface, with either an existing record loaded or empty inputs.
- **Sequence:** user edits one or more fields → form validates client-side via the shared upsert schema → user clicks the submit CTA (`Save changes` or `Create company info` depending on existing state) → submit control enters pending state (disabled + visible spinner / label change) → a single `PUT` is fired to the singleton endpoint → on `200` the page state refreshes from the response AND a success toast is rendered → on `400` per-field error messages render under the offending inputs (no toast) → on `401`/`403` the page renders the auth-denied state and a toast surfaces.
- **Exit:** values on screen match what is persisted, and the user has a confirmation cue.

### J4. Authenticated non-admin attempts an admin URL
- **Entry:** authenticated non-admin types `/admin` or `/admin/company-info` into the address bar.
- **Sequence:** route loads inside root layout → `AuthGate` allows (session is valid) → admin route gate inspects `AuthSession.roles` → role missing → page renders an access-denied state with a `Back to Home` link → defense in depth: any API call the page may attempt to fire is rejected by the backend's `@AuthRoles` guard.
- **Exit:** user sees the deny state and returns to Home via the affordance.

### J5. Unauthenticated visitor attempts an admin URL
- **Entry:** visitor without a valid Keycloak session navigates to any admin surface URL.
- **Sequence:** route mounts → `AuthGate` calls `/api/v1/auth/me` → backend returns auth-denied → `AuthGate` renders the existing unauthenticated surface (logout / re-login affordance — no new login or register surface is introduced).
- **Exit:** visitor signs in via the existing OIDC flow handled by oauth2-proxy + Keycloak; on return they re-enter J2 (if admin) or J4 (if not).

---

## 2. App shell

### Root layout — persistent left sidebar
A persistent left navigation surface is mounted by `apps/web/src/app/layout.tsx` as a sibling of `<Providers>{children}</Providers>`. The sidebar is rendered for every route that lives inside the root layout. The sidebar component itself is responsible for not rendering navigation links until the `AuthSession` is resolved and the user is authenticated — when `AuthGate` is showing its unauthenticated surface, the sidebar renders as an empty rail (or hides entirely) so the AuthGate surface owns the screen.

Sidebar nav items:

| # | Label (`en`) | Label (`ro`) | URL | Visibility rule |
|---|---|---|---|---|
| 1 | `Home` | `Acasă` | `/` | every authenticated user |
| 2 | `Admin` | `Administrare` | `/admin` | authenticated users whose `AuthSession.roles` contains the admin role constant `AUTH_ROLE_ADMIN` |

Active-state rule:
- `Home` is active when the current path is exactly `/`.
- `Admin` is active when the current path is `/admin` or starts with `/admin/`.

Labels resolve via `useTranslations('common')` against new keys `nav.home` and `nav.admin` added to both `en/common.ts` and `ro/common.ts`.

### `/admin` landing surface
- Renders inside the root layout (so the sidebar is still present on the left).
- Page area shows a heading `Administration` (localized) + a sub-nav listing one entry: `Company Info` → `/admin/company-info`.
- No data fetching on the landing itself.
- Future admin features will register their sub-nav entries here.

### `/admin/company-info` surface
- Renders inside the root layout (sidebar on the left).
- Form layout grouped by section: **Identity** (legal name, trading name), **Contact** (email, phone, website), **Address** (line 1, line 2, city, postal code, country), **Registration** (tax id, registration number).
- Empty-state distinguished from edit-state by the absence of a fetched record. In the empty state the submit CTA label is `Create company info`; once a record exists the label is `Save changes`. The submit CTA is the single point at the bottom of the form.
- Feedback per the boilerplate's Submit/Action Feedback rule:
  - Pending → submit disabled + visible spinner / label change.
  - Success → in-page state refresh from the response + success toast.
  - Validation failure → per-field error messages rendered under the offending input; no global toast.
  - Transient / auth failure → toast + (for auth failure) the auth-denied surface.

### User menu / logout / login
**Unchanged.** The existing AuthGate logout affordance + oauth2-proxy + Keycloak remain the canonical user-session surface. No new login or register surface is introduced anywhere in this plan.

### Domain entities introduced
- **`CompanyInfo`** — singleton row in a new table `company_info` (PostgreSQL via Prisma).
  - Fields: `id` (cuid PK), `legalName` (string, 1–200, required), `tradingName` (string, ≤200, optional), `email` (string, RFC-email, optional), `phone` (string, ≤40, optional), `website` (string, URL or empty, optional), `addressLine1` (string, ≤200, optional), `addressLine2` (string, ≤200, optional), `city` (string, ≤100, optional), `postalCode` (string, ≤40, optional), `country` (string, ≤56, optional), `taxId` (string, ≤64, optional), `registrationNumber` (string, ≤64, optional), `createdAt`, `updatedAt`.
  - Repository semantics: `findSingleton(): CompanyInfo | null` returns the first row or `null`; `upsertSingleton(payload): CompanyInfo` updates the first row if one exists, else inserts a single new row. The table is functionally constrained to one row by the application — there is no second `PUT` semantic that creates additional rows.
- The Prisma placeholder model `BoilerplatePlaceholder` is removed in the same backend feature, and its `flows.config.json` → `resourceGraph.ignoreModels` exclusion entry is removed alongside.

### Shared role constant
`AUTH_ROLE_ADMIN = 'admin'` is added to `@sfx/shared` (`packages/shared/src/auth-roles.ts`) so the backend (`@AuthRoles(AUTH_ROLE_ADMIN)`) and frontend (sidebar visibility, route gate) share one source of truth and a single grep target.

### Backend HTTP surface (under `/api/v1`)
- `GET /api/v1/company-info` — `@UseGuards(JwtAuthGuard)` + `@AuthRoles(AUTH_ROLE_ADMIN)`. Returns `200` with an envelope whose `data` is the singleton record, or `data: null` when no row exists yet. (Returning 200 + null instead of 404 simplifies the frontend's "load form" path: only one happy-path branch instead of two.)
- `PUT /api/v1/company-info` — `@UseGuards(JwtAuthGuard)` + `@AuthRoles(AUTH_ROLE_ADMIN)` + Zod validation pipe over `upsertCompanyInfoSchema`. Upserts the singleton row and returns `200` with the persisted record (envelope DTO).
- Both endpoints emit `ApiEnvelopeDto(CompanyInfoDto)` for OpenAPI / probe coverage.
- Both endpoints documented with `@ApiResponse` for `200`, `400`, `401`, `403`.

### Frontend feature folders introduced
- `apps/web/src/features/admin-shell/` — the sidebar component, the `/admin` landing component, and `AdminRouteGate` (role-gate wrapper).
- `apps/web/src/features/company-info/` — full Clean Architecture stack for the management page.

---

## 3. Chunk decomposition (flat features — direct-builder mode)

Since §4 selects direct-builder mode, §3 is enumerated as flat features rather than chunks. Features are ordered by dependency. Each feature is the unit a single builder owns.

### F1. Shared role constant + `CompanyInfo` domain type + Zod schemas
- **Features within:**
  - Add `AUTH_ROLE_ADMIN` to `@sfx/shared` with barrel export.
  - Add `CompanyInfo` entity type + `CompanyInfoRepository` interface (`findSingleton`, `upsertSingleton`) to `@sfx/domain`.
  - Add `upsertCompanyInfoSchema` (input validation for both the controller pipe and the React Hook Form resolver) and `companyInfoResponseSchema` to `@sfx/validation` under `packages/validation/src/schemas/company-info.schema.ts`.
  - Tests at 90%+ for every package touched.
- **Domain entities touched:** `CompanyInfo`.
- **App-shell entries this feature registers:** none directly (foundational).
- **Demo state at end:** `pnpm typecheck` and `pnpm test:coverage` are green for `@sfx/domain`, `@sfx/validation`, `@sfx/shared`. Backend + web both type-check against the new exports (they don't consume them yet, but the symbols compile).
- **Suggested capability:** `builder` (direct).

### F2. CompanyInfo backend module (Prisma + Nest)
- **Features within:**
  - Remove the `BoilerplatePlaceholder` Prisma model and its `flows.config.json` exclusion.
  - Add the `CompanyInfo` Prisma model exactly as specified in §2.
  - Generate the first real migration: `pnpm db:migrate -- --name company_info` (the per-worker panel-bridge applies it inside docker; see CLAUDE.md).
  - Create `apps/api/src/modules/company-info/` with full Clean Architecture: `application/controllers/company-info.controller.ts`, `application/dto/company-info.dto.ts`, `application/pipes/upsert-company-info.pipe.ts`, `data/repositories/company-info.repository.ts`, `data/mapper/company-info.mapper.ts`, `data/model/`, `company-info.module.ts`, `index.ts`.
  - Register the module in `app.module.ts`.
  - Each `@ApiProperty()` declares `type:` explicitly (boilerplate rule); each constructor injection uses explicit `@Inject(SYMBOL)`; the controller declares the full `@ApiResponse` set (200/400/401/403) and `@ResourceCaptures` if it returns a chainable resource (here: singleton — single `id` from upsert).
  - Tests at 90%+: controller (happy paths, validation errors, auth, role-denied), repository (Prisma mocked), mapper, pipe.
- **Domain entities touched:** `CompanyInfo`.
- **App-shell entries this feature registers:** none.
- **Demo state at end:** with the stack up, `curl /api/v1/company-info` returns `401` without bearer; returns `403` with a non-admin bearer; returns `200 { data: null }` with an admin bearer on an empty DB; `PUT` with a valid body returns `200 { data: <record> }` and a subsequent `GET` returns the persisted record.
- **Suggested capability:** `builder` (direct).

### F3. Sidebar + admin shell + `/admin` landing
- **Features within:**
  - Create `apps/web/src/features/admin-shell/` with Clean Architecture layout.
  - `Sidebar` component (`presentation/components/Sidebar/`): reads `useAuthSessionRepository()`, reads `usePathname()`, renders nav items per §2, with active-state rule per §2, labels via `useTranslations('common')`.
  - `AdminLandingPage` component (`presentation/pages/admin-landing/`): renders `Administration` heading + sub-nav (one entry: `Company Info`).
  - `AdminRouteGate` component (`presentation/components/AdminRouteGate/`): reads `AuthSession.roles`, renders children when admin role is present, renders an access-denied surface (heading + body copy + `Back to Home` link) otherwise; renders a skeleton while the session is loading.
  - Add `nav.home`, `nav.admin`, `admin.landing.title`, `admin.subnav.companyInfo`, `admin.denied.title`, `admin.denied.message`, `admin.denied.backToHome` to both `en/common.ts` and `ro/common.ts`.
  - Mount the sidebar in `app/layout.tsx` — the sidebar lives in the root layout next to `<Providers>{children}</Providers>` so it persists across navigation. The sidebar self-hides when `AuthSession.isAuthenticated === false`.
  - Create thin route wrappers: `apps/web/src/app/admin/page.tsx` → renders `AuthGate > AdminRouteGate > AdminLandingPage`.
  - Tests at 90%+: `Sidebar` (every visibility branch — loading, unauth, authed-non-admin, authed-admin; active-state per pathname), `AdminLandingPage`, `AdminRouteGate` (allowed, denied, loading), layout mount.
- **Domain entities touched:** consumes `AuthSession` (read-only).
- **App-shell entries this feature registers:** `Home` and `Admin` sidebar items + `/admin` landing surface + admin sub-nav with `Company Info` entry.
- **Demo state at end:** admin sees both tabs and reaches `/admin`; non-admin sees only Home and `/admin` shows the deny state; unauthenticated visitor sees the existing AuthGate surface with no sidebar in the way.
- **Suggested capability:** `builder` (direct).

### F4. `/admin/company-info` management page
- **Features within:**
  - Create `apps/web/src/features/company-info/` with Clean Architecture: `data/remote/fetch-company-info.ts` (uses `executeRequest()`), `data/remote/update-company-info.ts` (`executeRequest()`), `data/model/company-info-data-model.ts`, `data/mapper/map-to-company-info.ts`, `data/repositories/use-company-info-repository.ts` (TanStack Query: `useQuery` for fetch + `useMutation` for upsert with `invalidateQueries`), `presentation/pages/company-info/index.tsx`, `use-company-info.ts`, `map-to-company-info-page-ui-model.ts`, `types.ts`, `validators/upsert-company-info.resolver.ts`.
  - Page wraps `AuthGate > AdminRouteGate > CompanyInfoPage`.
  - Form built with React Hook Form + Zod resolver against `upsertCompanyInfoSchema` (imported from `@sfx/validation`).
  - Submit handler maps each `400` field error from the envelope error onto the form's per-field error state; non-field errors emit a toast.
  - Submit CTA label flips between `Create company info` and `Save changes` based on whether the GET returned `data: null`.
  - Labels added to `en/common.ts` and `ro/common.ts` (under `adminCompanyInfo.*`): page title, section titles, every field label and placeholder, every validation message, the two CTA labels, the success toast.
  - Thin route wrapper: `apps/web/src/app/admin/company-info/page.tsx` renders the feature's page component.
  - Tests at 90%+: hooks (every state), mapper (every UI branch), page (loading skeleton, empty state, populated state, save success path, save validation-error path, save auth/role-error path, denied path).
- **Domain entities touched:** `CompanyInfo`.
- **App-shell entries this feature registers:** `/admin/company-info` page reachable via the admin sub-nav registered in F3.
- **Demo state at end:** admin opens `/admin/company-info`, sees existing values (or empty state with `Create` CTA), edits, saves, observes success toast and refreshed values; non-admin sees deny; unauth sees AuthGate surface; backend remains the source of truth for what is persisted.
- **Suggested capability:** `builder` (direct).

---

## 4. Dispatch plan

**Mode:** direct-builder.

**Slot math:** `maxConcurrent=6`, reserved=2 (coordinator + monitor), available=4.

Cost-awareness table allows two patterns at available=4: `1 lead (2 slots) + 2 direct builders (2 slots)` OR up to 4 direct builders. This is a single coherent chunk (one user-capability story decomposed into 4 small features), so wrapping it in an intermediate lead adds layering without parallelization upside. Direct-builder mode chosen — the coordinator acts as lead.

**Sequencing** (dependency edge `F1 → {F2, F3, F4}`; `F3 → F4` because F4 imports `AdminRouteGate` from F3):

1. **F1** (shared layer) — single builder, 1 slot. Must merge before F2/F3/F4 can build (they import from the packages F1 ships).
2. **F2 + F3** in parallel — backend module and web admin-shell are independent. 2 slots concurrent.
3. **F4** — depends on F3's `AdminRouteGate` and F2's HTTP surface. 1 slot.

Peak concurrency: 2 builders. Within the 4-slot budget.

**Per-task flow files (Phase 0b.flow):**
- F1: library-only, no HTTP surface — no flow file authored.
- F2: flow file authored via `task-flow-authoring` before sling (`GET` happy/auth/role/empty, `PUT` happy/validation/auth/role/upsert-vs-update semantics, error envelope shape).
- F3: flow file authored — covers sidebar visibility per role, `/admin` landing, deny-state behavior. (Mostly client-side; flow asserts navigability + auth-denied behavior of any indirect API calls.)
- F4: flow file authored — covers the page's GET → form-populated, PUT → success/validation-error/auth-denied behavior end-to-end.
- `_shared.json` (Phase 0a): seeds the `admin` actor (auth bootstrap referencing an existing admin role-bearing Keycloak fixture user) and the `user` actor (no roles). Config-only — no response-shape assertions; F2's lead (= coordinator in direct-builder mode) appends the bootstrap response shape to `_shared.json` only after F2 ships and the actual `/auth/me` response shape for the admin user is observable.

**Next action (immediately after writing this plan):** invoke the `feature-plan` skill. It owns the per-feature sub-issue creation, scout dispatch (per-feature specs), and builder dispatch in the F1 → F2+F3 → F4 sequence above.

---

## 5. Runtime acceptance criteria

### J1 — authenticated non-admin lands on Home
- An authenticated user whose session does not contain the admin role and who lands on the home surface sees a sidebar that contains exactly one nav item with the visible label `Home`.
- The same user does NOT see any nav item with the visible label `Admin`.
- Server endpoints guarded for the admin role return auth-denied when called by this user.

### J2 — admin navigates to Admin → Company Info
- An authenticated user whose session contains the admin role landing on the home surface sees a sidebar with exactly two nav items, labelled `Home` and `Admin`.
- Activating the `Admin` nav item lands on a surface whose visible content includes the heading "Administration" (localized) and a sub-nav entry labelled `Company Info` that links to the Company Info management surface.
- Activating that sub-nav entry lands on a surface that issues a `GET` to the Company Info singleton endpoint on mount.
- That GET returns `200` with either the persisted record or `data: null`; the surface renders accordingly (populated form or empty inputs with a `Create` CTA).

### J3 — admin edits and saves Company Info
- Submitting the Company Info form with valid input issues exactly one `PUT` to the singleton endpoint with the form payload.
- While the request is in flight the submit control is disabled and a visible pending indicator is present.
- On a `200` response the surface re-renders with the values from the response payload and a success toast is rendered.
- On a `400` response, per-field error messages render under the offending controls; no success toast is rendered.
- On a `401` or `403` response, the surface renders the auth-denied state and a toast surfaces a non-success message.

### J4 — non-admin attempts an admin URL directly
- An authenticated non-admin who navigates directly to the admin landing surface URL sees an access-denied surface with a visible link back to Home.
- An authenticated non-admin who navigates directly to the Company Info management surface URL sees the access-denied surface, AND any HTTP request the surface would have issued to the singleton endpoint returns auth-denied (server-side defense).

### J5 — unauthenticated visitor on an admin URL
- An unauthenticated visitor navigating to any admin surface URL sees the existing scaffold's unauthenticated surface (AuthGate output), with no new login or register surface introduced anywhere in the app.
- The session-check endpoint returns auth-denied for the unauthenticated request.

### Sidewide acceptance (binds §2 items not bound to a single journey)
- Every nav item named in §2 navigates without runtime error to a surface that renders.
- The sidebar is present on every authenticated route inside the root layout and is absent from (or invisible on) the unauthenticated surface.
- Backend endpoints under `/api/v1/company-info` return: auth-denied for an unauthenticated request, auth-denied for an authenticated non-admin request, success for an authenticated admin request.
- The Prisma client compiles after `BoilerplatePlaceholder` is removed and the new `CompanyInfo` model is added; the api boots; the web app boots; `pnpm probe:smoke` passes.

---

## Self-review

1. Every entity in the brief appears in ≥1 feature: ✓ — `CompanyInfo` in F1/F2/F4; admin role constant in F1, consumed in F2/F3.
2. Every "Create X" CTA in §2 lives on a page that appears in a feature: ✓ — `Create company info` CTA is on `/admin/company-info` (F4).
3. From the post-login zero-data landing, the demo admin reaches every feature's capability via nav/CTA without typing a URL: ✓ — sidebar `Admin` → admin landing sub-nav `Company Info` → form. Non-admin reaches only Home (intentional).
4. No TBD or "standard CRUD" language: ✓.
5. No feature named after a layer: ✓ — F1 is the borderline case (shared types/schemas), but direct-builder mode explicitly allows flat features at this granularity, and F1 is a small foundational feature, not a "Domain entities" or "Backend modules" chunk.
6. Every journey in §1 has ≥1 acceptance statement in §5: ✓ — J1–J5 each have a numbered acceptance block.
7. Every nav item / page in §2 has an implied acceptance in §5: ✓ — Sidewide acceptance covers sidebar presence + every named nav target.
8. Every auth boundary is named in §5: ✓ — unauth, authed-non-admin, authed-admin are all written out.
9. Auth scaffold preserved: ✓ — Keycloak + oauth2-proxy + `OAUTH_*` env vars + AuthGate + `/api/v1/auth/me` are unchanged; no `/login`, `/register`, or local JWT is introduced.

---

## Handoff

Direct-builder mode. Immediately after this file is written:

1. The top-level issue `sfx-webapp-boilerplate-c33f` already exists.
2. The coordinator invokes the `shared-flow-authoring` skill (Phase 0a) to seed `.overstory/runtime-contract.flows/_shared.json` (config-only: actors, fixtures, error envelope).
3. The coordinator invokes the `feature-plan` skill. That skill handles per-feature sub-issue creation, scout dispatch, per-task flow authoring via `task-flow-authoring` before each `ov sling`, and builder dispatch in the F1 → F2+F3 → F4 sequence.
4. After every feature is merged the coordinator closes `sfx-webapp-boilerplate-c33f`.
