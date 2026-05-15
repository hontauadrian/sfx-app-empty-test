# Brand-Guidelines Part 1/3 — Foundation

**Top-level issue:** `sfx-webapp-boilerplate-2cb0`
**Operator dispatch:** `msg-a3cy1f8sjfle`
**Scope of THIS plan:** part 1/3 only — brand profile entity, active-brand selector, brand-voice CRUD, visual-identity CRUD. Search, dos/don'ts, content checking, version history, agent retrieval API, AI integrations land in parts 2 and 3 and are explicitly OUT OF SCOPE here.

**Auth constraint (binding for every chunk below):** The existing scaffold's auth is Keycloak + oauth2-proxy + RS256/JWKS (verified via `apps/api/src/modules/auth/auth.module.ts`, `JwtAuthGuard`, `/auth/me`, frontend `AuthGate`). No chunk in this plan adds `/login`, `/register`, email+password auth, local HS256 JWT cookies, or removes `OAUTH_*` / Keycloak / oauth2-proxy. The logged-in oauth2-proxy user is treated as "the brand manager". `/auth/me` returns the subject/email/roles and is the canonical source of identity.

---

## 1. Primary user journeys

### Journey J1 — Brand manager creates their first brand profile (zero-state)

1. **Entry:** the brand manager is already authenticated through the scaffold (oauth2-proxy → Keycloak → API `JwtAuthGuard`). They land on `/`.
2. **Observed state:** `/` shows the brands dashboard. With no brands yet, it renders an empty state with the CTA `[+ Create brand]`.
3. **Action:** click `[+ Create brand]` → navigates to `/brands/new`.
4. **Action:** fill the new-brand form (name, optional description). Submit.
5. **Observed state:** the new brand is saved (`POST /api/brands` → `201 Created`). The user is redirected to `/brands/<brand-id>` and the new brand is set as the **active brand** in the active-brand selector (top of layout).
6. **Exit:** the brand detail page renders with two clearly-separated sections — **Brand voice** (empty) and **Visual identity** (empty) — each with its own `[+ Add fields]` / inline-edit affordance.

### Journey J2 — Brand manager switches the active brand

1. **Entry:** the user has ≥2 brands. They are on `/brands/<brand-A-id>`. The active-brand selector at the top of the layout shows **Brand A**.
2. **Action:** open the active-brand selector (dropdown in the global top bar) → choose **Brand B**.
3. **Observed state:** the URL changes to `/brands/<brand-B-id>`. The active-brand selector now shows **Brand B**. The voice section and visual-identity section both reload to show Brand B's data. The active-brand id is persisted (Zustand store with `persist`) so a refresh keeps Brand B active.
4. **Exit:** Brand B's voice + visual identity data are visible and editable.

### Journey J3 — Brand manager edits the brand voice for the active brand

1. **Entry:** on `/brands/<brand-id>` with **Brand voice** section visible and currently empty (or partially filled).
2. **Action:** click the **Brand voice** edit affordance → navigates to `/brands/<brand-id>/voice/edit`.
3. **Observed state:** a form renders with eight grouped fields:
   - **Tone of voice** (multiline text)
   - **Preferred vocabulary** (string list, add/remove rows)
   - **Restricted vocabulary** (string list, add/remove rows)
   - **Messaging pillars** (string list, add/remove rows)
   - **Writing style rules** (string list, add/remove rows)
   - **Audience-specific communication rules** (list of `{ audience: string; rule: string }` pairs, add/remove rows)
   - **Approved example phrases** (string list, add/remove rows)
   - **Rejected example phrases** (string list, add/remove rows)
4. **Action:** edit any/all fields. Submit.
5. **Observed state:** the API persists the voice payload (`PUT /api/brands/<brand-id>/voice` → `200 OK`). The user is redirected to `/brands/<brand-id>` and the **Brand voice** section now reflects the submitted data.
6. **Exit:** voice data is visible read-only on the brand detail page until next edit.

### Journey J4 — Brand manager edits the visual identity for the active brand

1. **Entry:** on `/brands/<brand-id>` with **Visual identity** section visible.
2. **Action:** click the **Visual identity** edit affordance → navigates to `/brands/<brand-id>/visual-identity/edit`.
3. **Observed state:** a form renders with seven grouped fields:
   - **Logo usage rules** (multiline text)
   - **Colour palette** (list of `{ name: string; hex: string; usage?: string }` rows, add/remove)
   - **Typography rules** (list of `{ role: string; family: string; weight?: string; size?: string; notes?: string }` rows, add/remove)
   - **Spacing / layout guidance** (multiline text)
   - **Image style guidance** (multiline text)
   - **Iconography guidance** (multiline text)
   - **Usage restrictions** (multiline text)
4. **Action:** edit any/all fields. Submit.
5. **Observed state:** persisted via `PUT /api/brands/<brand-id>/visual-identity` → `200 OK`. User redirected to `/brands/<brand-id>`. The **Visual identity** section now reflects the submitted data.
6. **Exit:** visual identity data is visible read-only on the brand detail page until next edit.

### Journey J5 — Brand manager renames or deletes a brand

1. **Entry:** the user is on `/brands/<brand-id>`.
2. **Action:** open brand settings menu → choose **Rename** → modal opens, edit name, save → `PUT /api/brands/<brand-id>` → `200 OK`. The active-brand selector reflects the new name.
3. **Action (alt):** choose **Delete** → confirmation modal → confirm → `DELETE /api/brands/<brand-id>` → `200 OK`. If the deleted brand was the active brand, the active-brand store is cleared and the user is redirected to `/` (which shows the brands dashboard, possibly empty-state again).
4. **Exit:** brand list reflects the rename/deletion.

---

## 2. App shell

The existing scaffold has a minimal app shell (`apps/web/src/app/layout.tsx` → `Providers` → `AuthGate` → page). This plan introduces a real app shell layer **inside** `AuthGate` so all authenticated surfaces share a top bar + nav.

### Global top bar (always present once authenticated)

Rendered at the top of every authenticated route. Components, exact labels, exact URLs:

| Slot | Label | URL / Behavior |
|---|---|---|
| Brand mark (left) | `Brand Guidelines` | links to `/` (dashboard) |
| Active-brand selector (centre) | dropdown showing active brand name | clicking opens dropdown of all brands + `[+ Create brand]` row; selecting a brand navigates to `/brands/<id>` |
| User menu (right) | shows email from `/auth/me` | dropdown with `Sign out` → `<OAUTH_PROXY_SIGN_OUT_URL>` (read from runtime config; the boilerplate already exposes the oauth2-proxy sign-out URL — do not invent a new logout route) |

### Left nav (visible on `/brands/<id>/...` routes)

When a brand is active and the user is on a brand-scoped route, a left nav appears:

| Label | URL |
|---|---|
| Overview | `/brands/<brand-id>` |
| Brand voice | `/brands/<brand-id>` (Voice section anchor / read view) — edit at `/brands/<brand-id>/voice/edit` |
| Visual identity | `/brands/<brand-id>` (Visual identity section anchor / read view) — edit at `/brands/<brand-id>/visual-identity/edit` |

The voice and visual-identity sections are **visually separated cards** on `/brands/<brand-id>` so they remain distinct from day one (constraint from operator brief).

### Landing pages, exact URLs, and empty-state CTAs

| URL | Purpose | Empty-state behavior |
|---|---|---|
| `/` | Brands dashboard | If 0 brands: large empty state with `[+ Create brand]` CTA → `/brands/new`. If ≥1 brand and no active brand stored: pick the most recently updated, set active, redirect to `/brands/<id>`. If ≥1 brand and an active brand stored: redirect to `/brands/<active-id>`. |
| `/brands/new` | New brand form | n/a (form). Submit → `POST /api/brands` → redirect to `/brands/<new-id>`. |
| `/brands/<brand-id>` | Brand detail (Overview) | Renders two cards — **Brand voice** + **Visual identity**. Each card shows current values, or an inline empty state with the section's edit CTA (`[+ Edit brand voice]` / `[+ Edit visual identity]`). |
| `/brands/<brand-id>/voice/edit` | Brand voice edit form | n/a (form). Submit → `PUT /api/brands/<brand-id>/voice` → redirect to `/brands/<brand-id>`. |
| `/brands/<brand-id>/visual-identity/edit` | Visual identity edit form | n/a (form). Submit → `PUT /api/brands/<brand-id>/visual-identity` → redirect to `/brands/<brand-id>`. |

### Primary "Create <Entity>" affordances

| Entity | Lives at |
|---|---|
| **Brand** | `[+ Create brand]` button in the empty-state dashboard at `/` AND inside the active-brand selector dropdown (top bar) |
| **Brand voice** (per brand) | `[+ Edit brand voice]` on `/brands/<brand-id>` (a single voice record exists per brand; the action is "edit" rather than "create" because the row is created lazily on first save) |
| **Visual identity** (per brand) | `[+ Edit visual identity]` on `/brands/<brand-id>` (same lazy-create-on-first-save semantics) |

### User menu / logout

Already provided by the scaffold via the oauth2-proxy session. The user menu reads `/auth/me` for `email`. The `Sign out` action navigates to the oauth2-proxy sign-out URL exposed by the existing `apps/web` runtime config — no new route or auth surface is added. `AuthGate` continues to gate every authenticated page exactly as today.

---

## 3. Feature decomposition (direct-builder mode — flat, not chunked)

Per §4 below, the chosen branch is **direct-builder mode**. The coordinator acts as lead. The list below is a flat feature decomposition rather than a chunk hand-off. `feature-plan` will dispatch scouts → builders per feature.

### Feature F1 — `brand-profile`

**User capability at end of feature:** brand manager can create, view, rename, and delete brand profiles, and the active brand is selected across the UI.

- Vertical scope: domain entity, Prisma model + migration, NestJS module + repository + controller, shared Zod schema, frontend `brand-profile` feature (data + presentation), `/`, `/brands/new`, `/brands/<id>` (read-only overview shell), top-bar active-brand selector, Zustand `activeBrandStore` with `persist`.
- Domain entities touched: `BrandProfile` (new in `@sfx/domain`).
- App-shell entries this feature registers: global top bar, active-brand selector, `/` dashboard, `/brands/new`, `/brands/<id>` shell (the two section cards inside are stubbed and filled by F2 + F3).
- Endpoints: `GET /api/brands`, `POST /api/brands`, `GET /api/brands/:id`, `PUT /api/brands/:id`, `DELETE /api/brands/:id`. All `@UseGuards(JwtAuthGuard)`.
- DB additive-friendly note: `BrandProfile` keys are stable; parts 2 + 3 will attach `Tag`, `DoDontRule`, `BrandProfileVersion` via FK to `brand_profile.id`. The migration must not introduce constraints that would force destructive changes later (no UNIQUE on name; no NOT-NULL columns that parts 2+3 would need to backfill).

### Feature F2 — `brand-voice`

**User capability at end of feature:** brand manager can edit and view the eight brand-voice fields per brand.

- Vertical scope: `BrandVoice` domain entity, Prisma model + migration (FK to `brand_profile.id`, `ON DELETE CASCADE`), NestJS module + repository + controller, shared Zod schema for the 8 fields, frontend `brand-voice` feature, `/brands/<id>/voice/edit` page, voice-section card on `/brands/<id>` that consumes the data.
- Domain entities touched: `BrandVoice` (new in `@sfx/domain`).
- App-shell entries this feature registers: voice card on `/brands/<id>`, `/brands/<id>/voice/edit`.
- Endpoints: `GET /api/brands/:id/voice` (returns 200 with current data OR 200 with an "empty" voice payload if no row yet — never 404 for missing-but-creatable-state), `PUT /api/brands/:id/voice` (upsert; creates the row on first save). All `@UseGuards(JwtAuthGuard)`.
- DB additive-friendly note: voice fields are stored as typed JSON columns OR as a 1:1 row with explicit columns. Choice: **explicit columns** for top-level scalars (`toneOfVoice` text) and **JSONB** for list-shaped fields (`preferredVocabulary`, `restrictedVocabulary`, `messagingPillars`, `writingStyleRules`, `audienceRules`, `approvedExamplePhrases`, `rejectedExamplePhrases`). Future "dos/don'ts" data lives in a separate `do_dont_rule` table — voice JSONB stays untouched.

### Feature F3 — `visual-identity`

**User capability at end of feature:** brand manager can edit and view the seven visual-identity fields per brand.

- Vertical scope: `VisualIdentity` domain entity, Prisma model + migration (FK to `brand_profile.id`, `ON DELETE CASCADE`), NestJS module + repository + controller, shared Zod schema for the 7 fields, frontend `visual-identity` feature, `/brands/<id>/visual-identity/edit` page, visual-identity card on `/brands/<id>`.
- Domain entities touched: `VisualIdentity` (new in `@sfx/domain`).
- App-shell entries this feature registers: visual-identity card on `/brands/<id>`, `/brands/<id>/visual-identity/edit`.
- Endpoints: `GET /api/brands/:id/visual-identity`, `PUT /api/brands/:id/visual-identity` (upsert). All `@UseGuards(JwtAuthGuard)`.
- DB additive-friendly note: colour palette and typography rules are typed JSONB lists; the remaining 5 fields are nullable text columns. Future iconography expansions or per-asset tagging in parts 2+3 attach to a sibling table by FK, not by mutating these columns.

### Dependency order

1. **F1** must merge first — F2 and F3 both reference `brand_profile.id` and depend on the active-brand selector being live.
2. **F2** and **F3** can run in parallel after F1 merges (independent tables, independent endpoints, independent UI cards).

---

## 4. Dispatch plan (slot-aware)

- `maxConcurrent: 6` → 6 total slots
- Reserved: `coordinator` + `monitor` = 2 slots
- Available for leads + workers: **4 slots**
- `maxAgentsPerLead: 2`

**Branch chosen: direct-builder mode.**

Rationale: leads-mode threshold is "≥4 available slots", and I have exactly 4. A full lead occupies 3 of those (lead + 2 builders) and must run sequentially across chunks → 3 serial lead phases for 3 features. Direct-builder mode lets the coordinator dispatch builders in parallel: F1 first (sequential dependency), then F2 + F3 in parallel under one coordinator. With 4 available slots, that's 2 parallel builders + 2 spare slots for scouts — well under budget. `feature-plan` handles the scout → builder dispatch per feature; the coordinator authors `_shared.json` + per-task flow files but does NOT write feature specs (scouts do).

Sequence:
1. Coordinator invokes `shared-flow-authoring` → seeds `_shared.json`.
2. Coordinator invokes `feature-plan` for the flat feature list above.
3. `feature-plan` dispatches a scout per feature → scout writes `<feature-id>.md` spec.
4. Coordinator invokes `task-flow-authoring` per feature → writes `<task-id>.json` flow file.
5. Coordinator slings a builder per feature.
6. Coordinator merges each builder's branch after worker_done + runtime probe + QA evidence. F1 first; F2 + F3 after.

---

## 5. Runtime acceptance criteria

These are the user-visible behaviors `derive-test-matrix` translates into HTTP / probe assertions. No URLs, no ports, no implementation details.

### J1 — first brand creation (zero-state)

- An unauthenticated visitor hitting any brand-scoped page or any brand API endpoint is redirected to the existing oauth2-proxy login surface (or receives `401` from API).
- A logged-in user with zero brands sees the brands dashboard empty state with the `[+ Create brand]` CTA.
- Submitting the new-brand form with a valid name persists a brand profile and navigates the user to that brand's detail page.
- Submitting the new-brand form with an invalid name (empty, > max-length) shows a form-level error and does NOT create a brand.
- After the first brand is created, the active-brand selector in the top bar reflects that brand.
- The brand-detail page renders both the Brand voice card and the Visual identity card, visually separated, even when both are empty.

### J2 — switching active brand

- A user with ≥2 brands can open the active-brand selector and see every brand they own.
- Selecting a brand from the selector navigates the user to that brand's detail page and updates the selector label.
- The active-brand selection persists across page refresh (Zustand `persist`); a refresh keeps the same brand active and the same data visible.
- Reading the active brand's id from the store never produces a stale value after a brand is renamed (the selector label reflects the rename within the same session).

### J3 — editing brand voice

- A logged-in user on the brand-detail page can navigate to the voice edit form via the voice card's edit CTA.
- The voice edit form exposes all eight fields named in §1 J3, each editable, with appropriate list-row add/remove controls.
- Submitting the voice form with valid data persists the voice payload server-side (database row exists for that brand) and navigates the user back to the brand-detail page.
- Submitting the voice form with invalid data (e.g. duplicate item in `preferredVocabulary`, field exceeding max length) shows per-field validation errors and does NOT persist.
- After a successful save, the voice card on the brand-detail page reflects the new values without a hard refresh.
- The voice endpoint denies access (`401`) when called without a valid Keycloak/oauth2-proxy session.
- An authenticated user cannot read or write the voice of a brand that does not belong to them — the API returns `404` (Not Found) so existence is not leaked.

### J4 — editing visual identity

- A logged-in user on the brand-detail page can navigate to the visual-identity edit form via the visual-identity card's edit CTA.
- The visual-identity edit form exposes all seven fields named in §1 J4, each editable, with appropriate list-row add/remove controls for the colour-palette and typography-rules lists.
- Submitting the visual-identity form with valid data persists the payload server-side and navigates the user back to the brand-detail page.
- Submitting with invalid data (e.g. malformed hex value in colour-palette) shows per-field validation errors and does NOT persist.
- After a successful save, the visual-identity card on the brand-detail page reflects the new values without a hard refresh.
- The visual-identity endpoint denies access (`401`) when called without a valid Keycloak/oauth2-proxy session.
- An authenticated user cannot read or write the visual identity of a brand that does not belong to them — the API returns `404`.

### J5 — rename / delete

- A logged-in user can rename their brand via the brand settings menu; the active-brand selector label updates immediately and the change persists across refresh.
- A logged-in user can delete their brand via the brand settings menu after confirming.
- Deleting the active brand cascades the brand-voice and visual-identity rows on the database side (`ON DELETE CASCADE`).
- Deleting the active brand clears the active-brand store and returns the user to `/`.
- Rename and delete deny access (`401`) when unauthenticated; they return `404` when the brand id does not belong to the caller.

### Shell-level acceptance (every page in §2)

- Every URL listed in §2 renders without a runtime error for an authenticated user.
- The global top bar (brand mark, active-brand selector, user menu) is present on every authenticated route.
- The user menu shows the email returned by `/auth/me`.
- The `Sign out` action in the user menu targets the existing oauth2-proxy sign-out URL — no in-app `/login` or `/register` route exists.

### Auth-boundary acceptance (cross-cutting)

- The existing Keycloak + oauth2-proxy + RS256/JWKS stack remains the only authentication mechanism. The diff does not modify `apps/api/src/modules/auth/**`, `apps/api/src/common/auth/**`, `apps/api/src/common/guards/jwt-auth.guard.ts`, or `apps/web/src/features/auth/**`.
- `/auth/me` continues to return the authenticated subject/email/roles unchanged.
- Every new API endpoint introduced by F1, F2, or F3 carries `@UseGuards(JwtAuthGuard)` and returns `401` when called without a valid token.
- No environment variable from the `OAUTH_*` family is removed or renamed.

### Database additive-friendly acceptance

- Migration introduced by F1 creates the `brand_profile` table; migrations introduced by F2 and F3 create sibling tables with FK to `brand_profile.id` and `ON DELETE CASCADE`.
- None of the three migrations re-define columns introduced by another feature in this part.
- None of the three migrations introduce a UNIQUE constraint on a column that parts 2 or 3 are documented to extend (e.g. `name`).
