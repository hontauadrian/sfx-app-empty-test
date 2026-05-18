# Phase-2: Admin Sidebar + Company Info Management — Versioning, History, Expanded Fields, Tab Shell

**Top-level issue:** `sfx-webapp-boilerplate-26a0`
**Source brief:** operator mail `msg-go6tz9dxjj9g` (full dispatch, 2026-05-17T00:30Z).
**Prior phase shipped (Phase-1, against truncated brief):** sidebar with Home/Admin tabs (`features/admin-shell/Sidebar`), `AdminRouteGate`, `/admin` landing, `/admin/company-info` CRUD-singleton page with basic fields, NestJS `CompanyInfo` module + Prisma model, shared role const `AUTH_ROLE_ADMIN`, `@sfx/domain` `CompanyInfo` entity + repo iface, `@sfx/validation` upsert + response schemas.

This document plans the **Phase-2 extension only**. Phase-1 is treated as the baseline; this plan assumes its merged code as the starting point.

Auth model is preserved: Keycloak + oauth2-proxy + RS256/JWKS as already scaffolded. No new local-account, `/login`, `/register`, or email/password is invented.

---

## 1. Primary user journeys

### J1 — Admin edits the full company info record (Identity + Key Facts + repeatable lists)
- **Entry:** authenticated admin on any page, clicks **Admin** in the global sidebar.
- **Sequence:**
  1. Sidebar `Admin` → navigate to `/admin`.
  2. `/admin` renders the admin tab shell; **Company Info** is the active tab by default.
  3. Form renders four sections (Legal & Registration, Identity, Key Facts, Contact) with all fields prefilled from the latest persisted version (empty values when no record yet).
  4. Admin edits a top-level field (e.g. `companyName`), a long-text field (`missionStatement`), a numeric field (`foundedYear`), and a repeatable-list field (adds 3 entries to `coreValues`, removes 1 from `certifications`).
  5. Admin clicks **Save**. Submit button shows pending state. Backend validates server-side, persists a new version row, returns the latest snapshot.
  6. Success toast renders; form re-renders with persisted values; pending state clears.
- **Exit:** form is back in editable state showing the new persisted values. The previous values are now retrievable from history.

### J2 — Admin reviews the full edit history and inspects a past version
- **Entry:** authenticated admin on `/admin/company-info`.
- **Sequence:**
  1. Admin clicks the **View history** affordance on the Company Info tab.
  2. History list view opens (newest-first) listing every saved version with timestamp and editor display-name.
  3. Admin clicks a row. A read-only per-version view renders the full snapshot with a clear visual distinction from the editable form (e.g. banner + disabled inputs + "Read-only — version saved at …").
  4. Admin clicks **Back to current** (or equivalent affordance).
- **Exit:** admin returns to the editable Company Info tab showing the **current** version.

### J3 — Admin lands on `/admin` and uses the internal tab bar
- **Entry:** authenticated admin clicks **Admin** in sidebar.
- **Sequence:**
  1. Navigate to `/admin`.
  2. Layout renders the admin shell with an internal tab bar at the top.
  3. **Company Info** tab is active by default (active state derived from route; `/admin` and `/admin/company-info` both keep `Company Info` active).
  4. Browser refresh on `/admin/company-info` keeps the same tab active.
- **Exit:** admin is on `/admin/company-info` with `Company Info` tab marked active.

### J4 — Non-admin attempts to reach `/admin` or admin API
- **Entry:** authenticated non-admin user.
- **Sequence:**
  1. Sidebar does not render the **Admin** tab in the DOM (not just CSS-hidden — conditionally rendered).
  2. User types `/admin` in the address bar.
  3. `AdminRouteGate` (server-component or client-redirect, already shipped) blocks access — user is redirected or sees a deny screen.
  4. User issues a direct `GET /api/v1/company-info` or `GET /api/v1/company-info/versions` from a tool with a non-admin token. Backend admin guard returns `403`.
- **Exit:** non-admin cannot see, navigate to, or query admin surfaces.

### J5 — Unauthenticated visitor hits a protected page or endpoint
- **Entry:** anonymous browser session, no oauth2-proxy cookie.
- **Sequence:**
  1. User navigates to `/admin/company-info`.
  2. oauth2-proxy intercepts and redirects to the existing Keycloak login surface.
  3. After login, user is returned to `/admin/company-info`; admin gate is then re-evaluated (J4 path if non-admin, J1 path if admin).
  4. Direct `curl /api/v1/company-info/versions` without a token returns `401`.
- **Exit:** session established (or 401 returned). Admin surfaces are unreachable until a logged-in admin actor exists.

---

## 2. App shell

Phase-1 already provides the global sidebar with `Home` (`/`) and `Admin` (`/admin`, admin-only). Phase-2 keeps the sidebar unchanged. The new shell additions are **internal to `/admin`**:

### Global sidebar (unchanged)
| Item   | URL      | Visibility                  | Active when                          |
|--------|----------|-----------------------------|--------------------------------------|
| Home   | `/`      | all authenticated users     | route is `/`                         |
| Admin  | `/admin` | role === `AUTH_ROLE_ADMIN`  | route starts with `/admin`           |

### Admin internal tab bar (new — Phase-2)
| Tab          | URL                       | Visibility                  | Default | Active when                                           |
|--------------|---------------------------|-----------------------------|---------|-------------------------------------------------------|
| Company Info | `/admin/company-info`     | role === `AUTH_ROLE_ADMIN`  | yes     | route is `/admin` OR starts with `/admin/company-info`|

The tab bar is rendered by a layout component (e.g. `features/admin-shell/presentation/components/AdminTabBar`) and consumed by `app/admin/layout.tsx`. The component must accept a tab registry (array of `{ id, label, href, isActive(pathname) }`) so future tabs are added without refactor.

### Empty-state / landing CTA
- `/admin` (with no `/admin/<tab>` segment): redirect to or render `/admin/company-info` (the default tab content). Pathname-based active state means navigating to `/admin` and `/admin/company-info` both highlight the same tab.
- `/admin/company-info` with no persisted record: render an empty form with the **Save** button enabled; first save creates the singleton via upsert semantics (already implemented in Phase-1; behavior extends to the new fields).

### Company Info tab — new affordances
- **View history** link/button visible alongside the **Save** button (or in the tab header).
- Clicking it navigates to a history list view. URL: `/admin/company-info/history`.
- Clicking a row in the list navigates to a read-only per-version view. URL: `/admin/company-info/history/:versionId`.
- Both history routes live inside the same `/admin` tab shell — the **Company Info** tab remains active while the user is viewing history.

### Existing user menu / auth surface
- oauth2-proxy `/oauth2/sign_in` and `/oauth2/sign_out` continue to handle login/logout. No changes.

---

## 3. Chunk decomposition

Direct-builder mode (see §4). Three chunks; each is a vertical, user-capability-oriented slice.

### Chunk A — Company Info: full field set + section-grouped form
User-capability outcome: an admin can record every required piece of company information (legal, identity, key facts, contact) including repeatable lists.

- **Features within:**
  - Expand `@sfx/domain` `CompanyInfo` entity + `UpsertCompanyInfoInput` with the new fields. Update validation schemas (`@sfx/validation/company-info.schema.ts`) to mirror — `companyName` (string, ≤200), `foundedYear` (int, 4-digit reasonable bounds), `teamSize` (int, ≥0), `industry` (string, ≤120), `missionStatement` (text, ≤4000), `visionStatement` (text, ≤4000), `coreValues` (string[], ≤32 items, each ≤200), `certifications` (string[], ≤32 items, each ≤200). All optional except the existing required `legalName`.
  - Prisma schema migration: add columns to `company_info` (text + integer + JSONB or `String[]` for arrays — pick `String[]` per Prisma Postgres array support). Generate migration via `pnpm db:migrate -- --name expand-company-info-fields`.
  - NestJS backend wiring: extend `CompanyInfoService` upsert input + response DTO to carry the new fields; ensure `@ApiProperty()` declares `type:` on every new property per CLAUDE.md hard rule.
  - Frontend form expansion: split form into four labeled sections (Legal & Registration / Identity / Key Facts / Contact); each section a `<fieldset>` with a `<legend>` for a11y. Add repeatable-list controls for `coreValues` and `certifications` (add/remove rows, react-hook-form `useFieldArray`). Add numeric inputs with client-side validation matching Zod bounds.
- **Domain entities touched:** `CompanyInfo` (extended).
- **App-shell entries registered:** none new (already at `/admin/company-info`); behavior of the existing route is extended.
- **"User can …" demo at chunk end:** an admin logged in via oauth2-proxy navigates to `/admin/company-info`, fills `companyName`, `missionStatement`, `foundedYear=1998`, adds 3 `coreValues` and 2 `certifications`, clicks **Save**, sees a success toast, refreshes the page, and sees all values persisted.
- **Suggested capability:** `builder` (direct).

### Chunk B — Admin internal tab shell
User-capability outcome: an admin lands on `/admin` and sees a tabbed admin area; the structure supports adding future tabs without refactor.

- **Features within:**
  - New component `features/admin-shell/presentation/components/AdminTabBar` with a typed tab registry (`AdminTab = { id; label; href; isActive(pathname: string): boolean }`). Active state derived from the current `usePathname()`. Each tab is a Next.js `<Link>` for nav.
  - New `app/admin/layout.tsx` (server-component-friendly) wraps `{children}` in the tab bar. Layout consumes the tab registry exported from `features/admin-shell/constants.ts`.
  - `app/admin/page.tsx`: redirect (server-side `redirect()`) to `/admin/company-info` so `/admin` and `/admin/company-info` map to the same default tab content.
  - Mapper-driven labels (`useTranslations('admin')`) for tab labels per ADR-007.
  - Tests: tab bar with multiple tabs, active state at `/admin`, `/admin/company-info`, `/admin/company-info/history`, `/admin/company-info/history/:id`, role-based rendering (already covered by `AdminRouteGate`, this chunk does not touch the gate).
- **Domain entities touched:** none (UI + routing only).
- **App-shell entries registered:** internal tab bar (Company Info default).
- **"User can …" demo at chunk end:** an admin clicks `Admin` in the sidebar → lands on `/admin` → the URL becomes `/admin/company-info` → tab bar renders with **Company Info** highlighted → user refreshes the browser → tab remains highlighted.
- **Suggested capability:** `builder` (direct).

### Chunk C — Version history end-to-end
User-capability outcome: every save creates a versioned snapshot; an admin can browse the full edit history and inspect any past version in read-only form.

- **Features within:**
  - Prisma model `CompanyInfoVersion` (`id`, `companyInfoId` (FK), `snapshot` (Jsonb — entire CompanyInfo payload at save time), `editorUserId` (string, from auth), `editorDisplayName` (string, denormalized for history display), `createdAt`). Migration: `pnpm db:migrate -- --name add-company-info-versions`.
  - `CompanyInfoVersion` entity in `@sfx/domain`; matching `companyInfoVersionResponseSchema` (id, createdAt, editorUserId, editorDisplayName, snapshot of all CompanyInfo fields) in `@sfx/validation`.
  - Service change: `CompanyInfoService.upsert` writes a new `CompanyInfoVersion` row in the same transaction as the upsert; pulls `editorUserId` and `editorDisplayName` from the request user (Keycloak JWT claims).
  - New endpoints under the existing admin-guarded controller:
    - `GET /api/v1/company-info/versions` — list, newest first, paginated (default `take=50`, `cursor=createdAt+id`). Admin-guarded (401 unauth, 403 non-admin).
    - `GET /api/v1/company-info/versions/:id` — single snapshot. Admin-guarded. 404 when missing.
  - Frontend: **View history** affordance on the Company Info tab. Routes `app/admin/company-info/history/page.tsx` (list) and `app/admin/company-info/history/[versionId]/page.tsx` (per-version read-only).
  - List view: table with `Saved at` (ISO timestamp + locale-formatted), `Editor`, row click navigates to detail. Loading skeleton, empty state ("No history yet — save the form to create the first version").
  - Detail view: full read-only snapshot rendered with the same section grouping as the editable form; visual distinction (banner reading "Read-only — version saved by {editor} at {timestamp}"); `Back to current` link returning to `/admin/company-info`.
- **Domain entities touched:** `CompanyInfo` (read), `CompanyInfoVersion` (new).
- **App-shell entries registered:** `/admin/company-info/history`, `/admin/company-info/history/:versionId` — both keep the **Company Info** tab active.
- **"User can …" demo at chunk end:** admin saves the form (Chunk A behavior) twice with different values; clicks **View history**; sees 2 rows with timestamps + their own display name; clicks the older row; sees the read-only snapshot of the previous values; clicks **Back to current**; returns to the editable form showing the latest values.
- **Suggested capability:** `builder` (direct).

**Dependency order:** Chunk A and Chunk B can run in parallel. Chunk C depends on Chunk A (uses the full field set in snapshots). Chunk C's history routes live under the tab shell — they work standalone but look right inside Chunk B's `app/admin/layout.tsx`; if Chunk B is in flight when Chunk C builder starts, the history routes still render correctly because Next.js layouts apply automatically once Chunk B's layout file lands.

---

## 4. Dispatch plan (slot-aware)

`.overstory/config.yaml` capacity (from runtime overlay): `maxConcurrent=6`, `maxAgentsPerLead=2`, `maxDepth=3`. Reserved 2 (coordinator + monitor). Available: 4 slots.

**Chosen branch:** **Direct-builder mode** (coordinator acts as lead for all three chunks).

**Slot math:**
- Each chunk dispatched as a direct `builder` (1 slot each).
- Wave 1: Chunk A + Chunk B in parallel → 2 builders → 2 slots used → 2 spare.
- Wave 2: Chunk C builder after Chunk A merges → 1 slot used → 3 spare.

Going with all-direct-builders is preferred at 4 available slots per the cost-awareness table: "1 lead (2 slots) costs more than 1 builder (1 slot); all direct = 3 producing immediately." Each chunk is small enough (≤4 features, single feature scope per CLAUDE.md per-feature decomposition) that a lead would mostly add ceremony.

Coordinator workflow after this plan:
1. Invoke the `feature-plan` skill on each chunk (Phase 0b mandate for direct-builder mode). `feature-plan` produces per-feature specs via scouts (scouts dispatched, not coordinator-authored).
2. Author the per-task contract flow at `.overstory/runtime-contract.flows/<task-id>.json` via the `task-flow-authoring` skill BEFORE `ov sling --task=<task-id> --capability builder` (Phase 0b.flow gate).
3. Commit the per-task flow file before slinging — `flows-pre-sling.js` hook blocks `ov sling` when the flow is missing.
4. Sling each builder with `--spec .overstory/specs/sfx-webapp-boilerplate-26a0.md`.
5. On `worker_done`, verify per-builder QA evidence + run runtime probe on the builder's branch before merging; merge with `ov merge --branch <name>`.
6. Close each chunk's task on successful merge; close the top-level `sfx-webapp-boilerplate-26a0` when all chunks merged + probe-clean on `dev`.

---

## 5. Runtime acceptance criteria

These are user-visible behaviors. The probe derives concrete HTTP assertions from the Zod schemas + NestJS decorators + the logical contract; this list defines the **journey-level outcomes** each builder is responsible for.

### Auth boundaries (preserved from Phase-1; restated for clarity)
- An unauthenticated visitor hitting `/admin/company-info`, `/admin/company-info/history`, or `/admin/company-info/history/:versionId` is redirected by oauth2-proxy to the existing Keycloak login surface.
- An unauthenticated request to `GET /api/v1/company-info`, `PUT /api/v1/company-info`, `GET /api/v1/company-info/versions`, or `GET /api/v1/company-info/versions/:id` returns 401.
- An authenticated non-admin requesting any of those same endpoints receives 403.
- A non-admin loading any page in the app does **not** see the **Admin** sidebar item rendered in the DOM (not CSS-hidden).
- An authenticated user who refreshes the browser on any admin page remains logged in (session persisted by oauth2-proxy cookie).

### J1 — Edit full company info
- An admin who submits `PUT /api/v1/company-info` with a valid payload containing all new fields (including `coreValues: [a,b,c]`, `certifications: [x,y]`) gets a `200` response whose body matches `companyInfoResponseSchema` with those fields echoed.
- The same payload is observable via `GET /api/v1/company-info` immediately after.
- A `PUT` with `legalName` missing or empty returns `400` and the error envelope `{ success:false, error:{ statusCode:400, message:'Validation failed', errors:[{field:'legalName', message:'Legal name is required'}] } }`.
- A `PUT` with `foundedYear: 'not-a-number'` returns `400` with a `foundedYear` field error.
- A `PUT` with `website: 'not-a-url'` returns `400` with a `website` field error.
- A `PUT` with `coreValues: ['ok', 12345]` (mixed types) returns `400` with a `coreValues` field error.
- The frontend form, on a successful submit, transitions submit button to pending state, then back to enabled state, and a visible success toast renders. Field values persist after a hard refresh.

### J2 — Browse history
- After two successful `PUT`s, `GET /api/v1/company-info/versions` returns a list with ≥ 2 entries, ordered newest-first, each entry containing `id`, `createdAt`, `editorUserId`, `editorDisplayName`, and the full snapshot.
- `GET /api/v1/company-info/versions/:id` with a real id returns 200 + the snapshot.
- `GET /api/v1/company-info/versions/:id` with a syntactically valid but unknown id returns 404.
- The frontend `/admin/company-info/history` page lists those rows (newest first). Clicking a row navigates to `/admin/company-info/history/:versionId`. That page renders a read-only view distinguishable from the editable form (banner present, all inputs disabled). The page has an affordance returning the user to `/admin/company-info`.

### J3 — Internal tab shell
- `GET /admin` (server-side) issues a redirect to `/admin/company-info` (3xx).
- `GET /admin/company-info` returns HTML containing the admin tab bar with a tab labeled `Company Info` whose link target is `/admin/company-info` and which carries an active-state marker (e.g. `aria-current="page"` or active CSS class).
- `GET /admin/company-info/history` returns HTML containing the same tab bar with `Company Info` still active.
- The CTA on the Company Info tab named **View history** is reachable from `/admin/company-info` and links to `/admin/company-info/history`.
- No regression: the existing sidebar's `Admin` item remains visible to admins and absent for non-admins.

### J4 / J5 — Auth boundaries
Already covered by the global auth boundaries section above.

### General
- Every CTA named in §2 (App shell) leads somewhere that renders without a runtime error (no React `Error: …` overlay, no 500 in the network panel).
- Probe coverage: every new endpoint in this plan has a generated flow (via `@ApiResponse` + Zod schema + the logical contract); `pnpm probe:smoke` on each builder branch must be green before merge.
