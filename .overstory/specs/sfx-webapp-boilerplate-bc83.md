# brand-guidelines part 2/3 — Dos & Don'ts + Manual Content-Check Placeholder

**Top-level issue:** `sfx-webapp-boilerplate-bc83`
**Operator dispatch:** msg-zf8te2eqb3z4
**Predecessor:** part 1 (`sfx-webapp-boilerplate-2cb0`) — brand profile + brand voice + visual identity all merged to master.
**Successor:** part 3 (search, version history, agent retrieval API, AI content validation) — OUT OF SCOPE here.

**Auth (binding, inherited from part 1):** Keycloak + oauth2-proxy + RS256/JWKS is the ONLY auth mechanism. No `/login`, `/register`, no email+password, no HS256 cookie auth. The oauth2-proxy logged-in user is the "brand manager". Identity = `request.user.subject` from `JwtAuthGuard`. Ownership-scoping on `BrandProfile.ownerSubject` is the cross-tenant boundary. No modification to `apps/api/src/modules/auth/**`, `apps/api/src/common/auth/**`, `jwt-auth.guard.ts`, `auth-roles.decorator.ts`, or `apps/web/src/features/auth/**`.

**Schema rule:** purely additive. No edit to existing `brand_profile`, `brand_voice`, or `visual_identity` tables beyond adding back-reference relation fields on `BrandProfile`. Existing migrations remain unchanged. Existing F1/F2/F3 data continues to be valid.

---

## 1. Primary user journeys

### J1 — Add a do/don't entry to a brand
1. **Entry:** logged-in brand manager on `/brands/<brand-id>` (brand detail, owns the brand).
2. **Observed state:** the page shows the existing brand-profile / brand-voice / visual-identity cards plus a new **Dos & Don'ts** card. When zero entries exist, the card renders an empty state with `[+ Add do/don't]` CTA. When entries exist, they are grouped first by category (Tone, Vocabulary, Visuals, Legal, Campaign messaging), then within each category by type (Do vs Don't), with an `[+ Add do/don't]` CTA in the card header.
3. **Action:** click `[+ Add do/don't]` → navigates to `/brands/<brand-id>/dos-and-donts/new`.
4. **Observed state:** a form renders with the four required fields (type, category, title, body) and one optional field (suggested correction). Type is a Do / Don't toggle. Category is a single-select restricted to the five enum values. Submit is disabled while any required field is empty or invalid.
5. **Action:** fill all required fields, optionally fill suggested correction, submit.
6. **Observed state:** persisted via `POST /api/v1/brands/<brand-id>/dos-and-donts` → 201 + the persisted resource envelope. User redirected to `/brands/<brand-id>`. The Dos & Don'ts card now shows the new entry in its category + type group.
7. **Exit:** entry is visible read-only on the brand detail page until next edit.

### J2 — Edit an existing do/don't entry
1. **Entry:** brand manager on `/brands/<brand-id>` with at least one do/don't entry in the Dos & Don'ts card.
2. **Action:** click the **Edit** affordance on a specific entry → navigates to `/brands/<brand-id>/dos-and-donts/<entry-id>/edit`.
3. **Observed state:** the form renders pre-populated with the entry's current values. Validation rules identical to J1.
4. **Action:** modify any field. Submit.
5. **Observed state:** persisted via `PUT /api/v1/brands/<brand-id>/dos-and-donts/<entry-id>` → 200 + the persisted resource envelope. User redirected to `/brands/<brand-id>`. The Dos & Don'ts card reflects the change (the entry may move into a different category / type group if its category or type changed).
6. **Exit:** entry visible in the new group, read-only.

### J3 — Delete a do/don't entry
1. **Entry:** brand manager on `/brands/<brand-id>` with at least one do/don't entry.
2. **Action:** click the **Delete** affordance on a specific entry → an inline confirm dialog appears (no separate page).
3. **Action:** confirm.
4. **Observed state:** entry deleted via `DELETE /api/v1/brands/<brand-id>/dos-and-donts/<entry-id>` → 200 + empty `data: null` envelope. The card refetches and the deleted entry is gone. The list query for the brand and the brands list query are both invalidated.
5. **Exit:** entry no longer in the card.

### J4 — Manual content check against the active brand
1. **Entry:** logged-in brand manager. The active-brand store has at least one brand selected (the part 1 selector).
2. **Action:** click the global **Content check** nav item.
3. **Observed state:** routes to `/content-check`. The page renders inside `<AuthGate><AppShell>` and shows: (a) a read-only header naming the active brand, (b) a multi-line text area labelled "Paste content to check", (c) a category single-select with the five category values plus an "All categories" option (the empty-string sentinel), (d) a `[Check content]` CTA.
4. **Action:** paste any text (the text itself is NOT sent to the server — it is local state used to scope what the user is looking at), pick a category (or All), click `[Check content]`.
5. **Observed state:** the page renders the list of dos/don'ts owned by the active brand whose `category` matches the chosen filter (or all five categories when "All" is chosen), grouped by category then by type (Do / Don't), each card showing the entry's title, body, and suggested correction. When zero matches: an empty state ("No dos or don'ts match this category yet — go to the brand to add one."). The pasted text is echoed back as a read-only reference block above the matches so the user can see what they were checking; it is not analysed, scored, or labelled — that lands in part 3.
6. **Exit:** user has a reference list of dos/don'ts they can manually compare against their text. The page persists their text in local state only (component state, NOT the auth store, NOT a server endpoint).

### J5 — Brand-delete cascade
1. **Entry:** brand manager on `/brands/<brand-id>` with one or more dos/don'ts entries.
2. **Action:** delete the brand via the F1 brand-settings menu.
3. **Observed state:** the brand is deleted; all dos_and_donts rows are cascaded via `ON DELETE CASCADE` on the FK. Subsequent `GET /api/v1/brands/<brand-id>/dos-and-donts` returns 404 (brand not found / not owned — same ownership rule as F1/F2/F3).
4. **Exit:** brand and all its child rows are gone.

### J6 — Cross-tenant denial (boundary)
1. Brand A owned by `admin`, brand A has dos/don'ts entries.
2. `viewer` (a different authenticated identity, owns no brand) attempts to list/read/write any of brand A's dos/don'ts.
3. **Observed state:** every dos-and-donts endpoint returns 404 (existence NOT leaked; NEVER 403). Same scoping rule used in F2 / F3.

---

## 2. App shell

Concrete additions to the part 1 shell. No replacement of any existing nav item.

### Global nav additions (left rail, below the existing `Brands` + `Visual identity` group)

| Position | Label | URL | When visible | Empty-state behaviour |
|---|---|---|---|---|
| New (top-level item) | `Content check` | `/content-check` | always (authenticated) | Page renders the "no active brand" state with a CTA `[Pick a brand]` linking to `/` (brands list) when the active-brand selector is empty. |

The existing `Brands` nav item is unchanged.

### Per-brand surfaces

| URL | Purpose | Empty-state | CTA from |
|---|---|---|---|
| `/brands/<id>` | Brand overview — existing page gets a new **Dos & Don'ts** card slot, mounted below the visual-identity card and visually separated from it (same padding rhythm the voice / visual-identity cards already use). | When no entries: card title + `[+ Add do/don't]` CTA + one-line copy ("Capture your brand's do's and don'ts so writers stay on-message."). | The card itself. |
| `/brands/<id>/dos-and-donts/new` | New do/don't entry form (J1). | First-time form (no prefill). | `[+ Add do/don't]` on `/brands/<id>` Dos & Don'ts card. |
| `/brands/<id>/dos-and-donts/<entry-id>/edit` | Edit existing do/don't entry form (J2). | Pre-populated. | `Edit` on each row in the Dos & Don'ts card. |

The card on `/brands/<id>` is the SOLE entry point for creating, editing, and deleting do/don't entries. There is no separate index page like `/brands/<id>/dos-and-donts` — the brand overview IS the index.

### Global content-check surface

| URL | Purpose | Empty-state |
|---|---|---|
| `/content-check` | Manual content-check screen (J4). | When no active brand: shows `[Pick a brand]` CTA → `/`. When active brand has zero dos/don'ts: shows category selector and a "No dos or don'ts yet — go to <brand-name> to add some" CTA → `/brands/<active-brand-id>`. |

The content-check page is intentionally NOT scoped under `/brands/<id>/...`. It reads from the active-brand store (set in part 1) so users can switch brands via the existing selector without leaving the page.

### User menu / profile / logout

UNCHANGED from part 1. oauth2-proxy continues to own the logout flow.

---

## 3. Feature decomposition (direct-builder mode)

Direct-builder mode is in effect (see §4). Features are flat, not chunked, because the coordinator is acting as lead.

### F1 — dos-and-donts CRUD (per-brand, owner-scoped)

- **Domain entity:** `DosAndDontEntry` (interface in `@sfx/domain`, no behaviour).
- **Validation:** `dosAndDontWriteSchema` + `dosAndDontSchema` (response) + `dosAndDontCategoryEnum` + `dosAndDontTypeEnum` in `@sfx/validation`. Constants for max lengths exported from the schema module.
- **Schema:** new Prisma model `DosAndDontEntry`, `@@map("dos_and_dont_entries")`, FK to `brand_profile.id` with `ON DELETE CASCADE`. Reverse relation `dosAndDonts DosAndDontEntry[]` on `BrandProfile`. Migration name `add_dos_and_dont_entries`.
- **API (5 endpoints under `/api/v1/brands/:brandId/dos-and-donts`):**
  - `GET /` (list, optional `?category=<enum>` filter) → 200 with `data: DosAndDontEntry[]` (empty array allowed; NOT 404 for "no entries").
  - `POST /` (create) → 201 with persisted envelope. 400 on Zod failure. 404 if brand not owned.
  - `GET /:entryId` (read one) → 200 / 404.
  - `PUT /:entryId` (full replace) → 200. 400 / 404 as appropriate.
  - `DELETE /:entryId` → 200 with `data: null`.
- **Frontend feature** under `apps/web/src/features/dos-and-donts/`: data layer (repository, hooks for list/create/update/delete), presentation (Dos & Don'ts card on `/brands/<id>`, edit form mounted at `/brands/<id>/dos-and-donts/new` and `/brands/<id>/dos-and-donts/<entry-id>/edit`).
- **App-shell entries registered:** `Dos & Don'ts` card on `/brands/<id>`, two routes under `/brands/<id>/dos-and-donts/...`.
- **"User can ..." demo state at chunk end:** J1, J2, J3, J5, J6 (J4 needs F2). Acceptance: a brand manager opens their brand detail, adds three dos/don'ts in three different categories, edits one, deletes one, then deletes the brand and observes the cascade.

### F2 — content-check screen (read-only consumer)

- **No new API endpoint.** Reuses F1's `GET /api/v1/brands/:brandId/dos-and-donts?category=<enum>`. F2 only consumes; no controller / module / repository.
- **Validation:** new client-side Zod schema `contentCheckFormSchema` in `@sfx/validation` for `{ pastedText: string; category: DosAndDontCategoryEnum | '' }` (the empty-string sentinel means "All categories" and is mapped to omitting the query param on the wire). Re-uses the F1 category enum, does NOT redeclare it.
- **Frontend feature** under `apps/web/src/features/content-check/`: hook that reads the active-brand-id from the part 1 `useActiveBrand()` selector, calls F1's list hook with the chosen category filter, renders the form + result list. Local state for `pastedText`. NOT a server-side feature.
- **App-shell entries registered:** new top-level `Content check` left-nav item linking to `/content-check`; new route `/content-check` mounted inside `<AuthGate><AppShell>`.
- **"User can ..." demo state at chunk end:** J4 plus the protected-route boundary (unauthenticated `/content-check` redirected by `AuthGate`).
- **Depends on:** F1 (specifically the response shape of `GET /brands/:brandId/dos-and-donts?category=<enum>`).

### Domain entities touched

| Entity | Source | Edit in part 2 |
|---|---|---|
| `BrandProfile` | part 1 (`@sfx/domain/entities/brand-profile.ts`) | add the back-reference `dosAndDonts` field only; no other change. |
| `BrandVoice` | part 1 | UNCHANGED. |
| `VisualIdentity` | part 1 | UNCHANGED. |
| `DosAndDontEntry` | new | full CRUD. |

---

## 4. Dispatch plan

**Config:** `maxConcurrent=6`, reserved `coordinator + monitor = 2`, available = 4 slots.

**Mode chosen:** **direct-builder.** The coordinator acts as lead.

**Slot math justification:** two features, F2 depends on F1's response shape. Running them sequentially keeps the active slot count at 1 builder + 0 leads = 1 slot per builder cycle, leaving 3 slots of headroom for monitor + watchdog spawns. Spawning a real lead would cost 2 slots minimum (lead + builder) with no benefit — there is no scout/spec/review cycle that the coordinator cannot itself orchestrate at this scale. Per the cost-awareness table at 4-5 available slots, "all direct builders" is one of the two recommended strategies; it is selected here.

**Sequence:**

1. **F1 first (sole builder cycle).** Sling one builder named `builder-dos-and-donts` against the F1 spec. Builder implements F1 end-to-end, runs `pnpm probe:smoke` against the F1 flow file, mails `worker_done` with runtime-evidence + qa-test-evidence. Coordinator verifies, runs the runtime walk on the builder branch, merges.
2. **F2 after F1 is merged.** Sling one builder named `builder-content-check` against the F2 spec. Builder consumes F1's response shape (now on master). Builder implements F2 (frontend-only), runs probes, mails `worker_done`. Coordinator verifies + merges.
3. Close parent issue + report to operator.

**No parallel builders.** F2's frontend depends on F1's wire shape; parallel risks F2 racing ahead with a guessed shape and re-writing on merge.

**Per the protocol's Phase 0b (direct-builder mode):** after this plan is committed, the coordinator invokes the `feature-plan` skill, which handles scout + builder dispatch per feature.

**Per Phase 0b.flow (mandatory before any `ov sling --task=<id>`):** the coordinator invokes `task-flow-authoring` to author `<task-id>.json` for each feature. Each per-task flow MUST be committed before its `ov sling`.

---

## 5. Runtime acceptance criteria

These behavioural assertions feed the `derive-test-matrix` generator and the per-task flow files. Status codes / URLs are present here only because the boundary semantics require them — they live in the flow files as `expect.status` values.

### J1 (add do/don't)
- An authenticated brand manager who navigates to their brand detail page sees a Dos & Don'ts card whose initial state matches the database (zero entries → empty state with create CTA; ≥1 entry → grouped list).
- Clicking the `[+ Add do/don't]` CTA navigates to a form route. The form does not render if the user is not authenticated.
- Submitting the form with all four required fields populated persists the entry and the API responds with the persisted envelope. The user is then on the brand detail page and the new entry appears in its category + type group.
- Submitting with a missing required field, an unrecognised category enum value, or an unrecognised type enum value does NOT persist and surfaces a client-side validation error before the network call. If the request reaches the server with an invalid payload (e.g. via direct API call), the server responds with a 400 carrying the standard error envelope.

### J2 (edit do/don't)
- Clicking `Edit` on a specific entry routes to a form pre-populated with that entry's current values.
- Submitting valid changes persists them; the API responds with the persisted envelope; the user returns to the brand detail page and the entry reflects the change.
- Editing an entry the caller does not own (URL-tampering) returns 404, not 403.

### J3 (delete do/don't)
- Clicking `Delete` shows a confirm affordance; cancelling does NOT fire the delete request.
- Confirming deletes the entry; subsequent reads of the entry's id return 404; the list re-fetches and the entry is gone.

### J4 (manual content check)
- An authenticated brand manager with an active brand selected can navigate to the content-check page via the global `Content check` nav item.
- Pasting text and selecting "All categories" returns every dos/don'ts entry owned by the active brand.
- Pasting text and selecting a specific category returns only entries whose `category` matches that filter.
- The pasted text is NOT sent to the server; the only server interaction is `GET /api/v1/brands/:activeBrandId/dos-and-donts?category=<enum?>`.
- When the active brand has zero matching entries, the page renders an empty state with a CTA pointing to the brand detail page.
- When there is no active brand selected, the page renders a "pick a brand" empty state.

### J5 (cascade)
- Deleting a brand removes all of that brand's dos_and_donts rows; subsequent reads return 404 at the brand boundary.

### J6 (cross-tenant)
- An authenticated user who does NOT own a brand sees 404 (not 403) when they try to list, read, write, or delete that brand's dos/don'ts.

### Authentication boundary (provider-neutral)
- An unauthenticated request to any new API endpoint under `/api/v1/brands/:brandId/dos-and-donts` returns 401 carrying the standard error envelope.
- An unauthenticated visitor hitting `/content-check` is redirected by the existing `AuthGate` to the existing oauth2-proxy login surface. The plan adds no new login or register route.
- A logged-in user who refreshes any new page (`/brands/<id>/dos-and-donts/new`, `/brands/<id>/dos-and-donts/<id>/edit`, `/content-check`) remains logged in. Session storage is unchanged from part 1.

### Logical App Contract rows affected
- "unauthenticated + protected page → 3xx redirect" — applies to `/content-check`, `/brands/<id>/dos-and-donts/new`, `/brands/<id>/dos-and-donts/<id>/edit`.
- "unauthenticated + protected API → 401" — applies to all five new API endpoints.
- "authenticated + refresh → still 2xx" — applies to every new authenticated page.
- "authenticated + logout → 3xx" — unchanged (oauth2-proxy owns logout).

### Cross-cutting
- The brands list query (`/api/v1/brands`) is invalidated by every successful dos/don'ts mutation, because `BrandProfile.updatedAt` is touched by `prisma.brandProfile.update({ where: { id }, data: { updatedAt: <now> } })` inside each dos-and-donts mutation OR (preferred) by the existing F1 repository pattern — F1 builder will document which.
- Existing F1 / F2 / F3 endpoints continue to return their existing response shapes. A part 2 builder MUST NOT modify any of them. The probe suite from cfeb.json / 6fba.json / b859.json must remain green after every part 2 merge.

---

## Self-review

1. ✅ Every entity in the brief appears in ≥1 chunk (DosAndDontEntry → F1).
2. ✅ Every "Create X" button in §2 lives on a page in ≥1 chunk (`[+ Add do/don't]` lives on `/brands/<id>` Dos & Don'ts card → F1; the `[Check content]` CTA on `/content-check` is not a "Create X" — it's a read-only filter → F2).
3. ✅ From `/dashboard` (post-login, zero data) a user can reach every chunk's capabilities: brand → `/brands/new` (part 1) → `/brands/<id>` (part 1 — F1 card lives here) → `/brands/<id>/dos-and-donts/new` (F1) → `/content-check` via top-nav (F2).
4. ✅ No TBD / "similar to" / "standard CRUD" — every endpoint, status, and validation rule is enumerated.
5. ✅ No chunk named after a layer — F1 = "dos-and-donts CRUD", F2 = "content-check screen", both user-capability-oriented.
6. ✅ Every journey in §1 has ≥1 acceptance statement in §5 (J1 through J6 all covered).
7. ✅ Every page / nav item in §2 has an implied acceptance statement in §5.
8. ✅ Every auth boundary is named in §5 (unauth API 401, unauth page redirect, refresh persistence, logout via oauth2-proxy).
9. ✅ Auth replacement was NOT requested; the plan preserves Keycloak + oauth2-proxy + RS256/JWKS, contains no email/password, no `/login`, no `/register`, no local JWT cookies, no `OAUTH_*` removal.
