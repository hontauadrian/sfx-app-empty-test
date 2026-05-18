# Brand Guidelines Admin Tab + Multi-Brand + Versioning + Agent Read Access — Product Plan

**Top-level task:** `sfx-webapp-boilerplate-ba09`
**Source dispatch:** msg-qfrflzng1f6t (operator).
**Auth scaffold preserved:** Keycloak + oauth2-proxy + RS256/JWKS unchanged. No new login/register/HS256/cookie work. Admin role from Phase 2 retains write; new `agent` role added for read-only API.
**Builds on:** Phase 2 admin extension (F1 expanded CompanyInfo, F3 AdminTabBar shell, F4 per-resource versioning pattern). Brand Guidelines is the second tab in the existing extensible registry.

---

## 1. Primary user journeys

### J1 — First brand profile (zero → one)
Admin on `/admin/company-info` (Phase 2 default) → clicks **Brand Guidelines** tab in AdminTabBar → lands `/admin/brand-guidelines` → empty state visible (no profiles yet) → CTA **+ Create brand profile** → modal/form → enters name → submit → profile created and selected; profile selector chip shows the new name; below shows the four-section empty form (Voice / Visual / Dos & Donʼts / Metadata) for this brand.

### J2 — Populate Brand Voice
Admin on `/admin/brand-guidelines/<brandId>` with **Brand Voice** section open (default first sub-section) → fills tone-of-voice text, preferred vocabulary list (Add row × N), restricted vocabulary list, messaging pillars (Add row of title + description), writing style rules, audience rules (Add row of audience + rules), approved example phrases, rejected example phrases (optional reason) → clicks **Save Brand Voice** → pending indicator on submit → success toast `Brand Voice saved` → hard refresh persists all values → a new version row exists in this brand's history.

### J3 — Populate Visual Identity
Admin opens **Visual Identity** sub-section → fills logo usage text, color palette (Add row of name + hex + usage notes), typography rules (Add row of font + weight + usage context), spacing/layout guidance, image style guidance, iconography guidance, usage restrictions → **Save Visual Identity** → toast + persist + version row.

### J4 — Manage Dos & Don'ts
Admin opens **Dos & Don'ts** sub-section → adds entries (each: Do/Donʼt type + category from extensible set [tone, vocabulary, visuals, legal, campaign messaging] + rule text + optional example) → filter by **Type = Don't** + **Category = vocabulary** → list narrows to matching rows → edit one rule inline → **Save** → toast + persist + version row.

### J5 — Search across active brand
Admin types `voice` in the search bar at top of `/admin/brand-guidelines/<brandId>` → results panel shows matches grouped by source section (Voice / Visual / Dos & Donʼts / Examples) with the matched fragment → admin clicks a match → page jumps/navigates to that section opened to the matched entry for editing.

### J6 — Version history per brand
Admin clicks **View history** affordance on any sub-section → navigates to `/admin/brand-guidelines/<brandId>/history` → newest-first list of versions with timestamp + editor + optional change note → click row → `/admin/brand-guidelines/<brandId>/history/<versionId>` → read-only snapshot of entire brand guideline set at that point + `Back to current` → return to editable view.

### J7 — Switch brand profile
Admin on `/admin/brand-guidelines/<brandIdA>` → opens profile selector dropdown → chooses different `<brandIdB>` (or selects **+ Create new** for fresh) → URL/route swaps to `/admin/brand-guidelines/<brandIdB>` → all sections reload that brand's data → saves on B affect B's versions only, A is untouched.

### J8 — Agent service-account read
Registered Keycloak client (e.g. `brand-reader-agent-001`) exchanges `client_id` + `client_secret` for a short-lived JWT via OAuth2 Client Credentials grant → adds `Authorization: Bearer <token>` header → calls `GET /api/v1/brands` (lists brand profiles), `GET /api/v1/brands/<id>/guidelines` (current full set), `GET /api/v1/brands/<id>/guidelines/voice/restricted-vocab` (standalone list), `GET /api/v1/brands/<id>/guidelines/dos-and-donts?type=Don't&category=vocabulary` (tag-filterable) — every read succeeds with the `agent` role; the same JWT calling any `POST` / `PUT` / `DELETE` is rejected with 403.

### J9 — Audit-log review
Admin navigates to per-brand audit-log surface (within Brand Guidelines tab) → sees recent agent-authenticated requests with `client_id` + endpoint + brand + version-id returned + timestamp → can scroll/filter; this is the traceability artifact for "what did the agent see at content-generation time".

---

## 2. App shell

The Phase 2 AdminTabBar is the registry hub. Brand Guidelines plugs in as the **second** entry; Company Info remains default-active.

| Route | Purpose | Empty-state CTA | Auth |
|---|---|---|---|
| `/admin` | Server-redirect to default tab (`/admin/company-info`). Unchanged from Phase 2. | n/a | AuthGate + AdminRouteGate (Phase 2) |
| `/admin/company-info` | Phase 2 Company Info tab. Unchanged. | n/a | Inherited |
| `/admin/company-info/history`, `/history/<versionId>` | Phase 2 history. Unchanged. | n/a | Inherited |
| `/admin/brand-guidelines` | **NEW.** Brand Guidelines tab landing. With ≥1 brand profile, redirects (or auto-selects) to the most-recently-active profile. With 0 profiles, shows empty state. | `[+ Create brand profile]` opens create form. | Inherited from `/admin/layout.tsx` |
| `/admin/brand-guidelines/<brandId>` | **NEW.** Active brand profile workspace. Top: profile selector chip + dropdown + `[+ Create new]` + `[Rename]` + `[Delete]`; per-brand `[View history]` link. Body: four sub-sections (Voice / Visual / Dos & Donʼts / Metadata) navigable via sub-tabs OR accordions (builder picks based on existing UI patterns). Top of body: full-text **Search active brand** input. | Each sub-section has its own empty state with section-specific add CTAs (`[+ Add row]`, `[+ Add palette entry]`, etc.) | Inherited |
| `/admin/brand-guidelines/<brandId>/history` | **NEW.** Per-brand version list. Newest-first table; columns: timestamp, editor, change note, link to detail. | "No versions yet — save the form to create the first version." | Inherited |
| `/admin/brand-guidelines/<brandId>/history/<versionId>` | **NEW.** Read-only snapshot of all four sections at that revision. Banner: `Read-only — version saved by {editor} at {timestamp}. Note: {changeNote or "—"}`. `[Back to current]` returns to `/admin/brand-guidelines/<brandId>`. | n/a | Inherited |
| `/admin/brand-guidelines/<brandId>/audit-log` | **NEW.** Per-brand agent-request audit log surface. List shows client_id, endpoint, version returned, timestamp. Filter by client_id and date. | "No agent requests recorded yet for this brand." | Inherited |

**AdminTabBar registry** (`apps/web/src/features/admin-shell/constants.ts` `ADMIN_TAB_REGISTRY`) gets a **second entry**: `{ id: 'brandGuidelines', labelKey: 'admin.tabs.brandGuidelines', href: '/admin/brand-guidelines', isActive: (p) => p === '/admin/brand-guidelines' || p.startsWith('/admin/brand-guidelines/') }`. The bar already iterates the registry; no bar refactor.

**Profile selector** is a stateful component at the top of `/admin/brand-guidelines/<brandId>`: dropdown of all brand profiles, the currently active one highlighted, `[+ Create new]` opens a modal, `[Rename]` opens an inline edit, `[Delete]` opens a confirm dialog with "this also deletes all versions and audit-log entries for this brand" warning.

**User menu / profile / logout:** unchanged from existing scaffold (oauth2-proxy + Keycloak account UI). No new surface introduced.

**Per primary entity, where the "Create" affordance lives:**
- Brand profile → top of `/admin/brand-guidelines/*` (profile selector `[+ Create new]`) AND empty state on `/admin/brand-guidelines`.
- Voice / Visual / Dos&Don't entries → per-section `[+ Add row]` / `[+ Add entry]` buttons inline in the form.
- Brand version → implicit (every save to any sub-section creates a version row; no user-facing `[Create version]` button).
- Audit log entry → server-side only (interceptor on agent-authenticated requests); no UI to create.

---

## 3. Chunk decomposition

**Forbidden:** layer-named chunks. Each chunk below is a user-capability vertical slice that one lead (or in direct-builder mode, one coordinator-driven scout+builder pair) owns end-to-end across domain → backend → frontend.

Ordered by dependency. Five chunks.

### Chunk A — Brand profile foundation (CRUD + tab + selector)

**Features within:**
- A1: `Brand` domain entity (id, name, slug, ownerUserId, createdAt, updatedAt, deletedAt nullable) + Prisma model + migration + repository.
- A2: Backend REST endpoints `GET /api/v1/brands` (list active), `POST /api/v1/brands` (create — admin only), `PATCH /api/v1/brands/:id` (rename — admin only), `DELETE /api/v1/brands/:id` (soft-delete — admin only) with admin-guarded Nest module + Zod schemas + DTOs + `@ApiOperation` + `@ApiResponse` 200/400/401/403/404 + integration tests + per-task flow file.
- A3: AdminTabBar registry gets second entry `brandGuidelines` (translations EN+RO `admin.tabs.brandGuidelines`). NO refactor — append.
- A4: Frontend route shell `/admin/brand-guidelines` (empty state + create modal) and `/admin/brand-guidelines/<brandId>` (placeholder body for downstream chunks, but profile selector wired). Includes selector dropdown component, create-form modal, rename inline edit, delete confirm. Translations EN+RO.

**Domain entities touched:** `Brand`.

**App-shell entries this chunk registers:**
- AdminTabBar `Brand Guidelines` → `/admin/brand-guidelines`.
- `/admin/brand-guidelines` + `/admin/brand-guidelines/<brandId>` routes (shell-only; body subsections delivered by later chunks).

**"User can ..." demo state at chunk end:** admin can navigate to Brand Guidelines tab, create / rename / delete / switch between brand profiles. The active brand's `<brandId>` shows in the URL and selector. Body is intentionally empty ("Brand Voice / Visual Identity / Dos & Don'ts / Metadata sections coming next").

**Suggested lead capability:** `lead` (or in direct-builder mode, scout + builder).

**Chunk-A parent-module note (per mulch `mx-3bf156`):** Chunk A's `apps/api/src/modules/brand` parent module + its `POST /api/v1/brands` controller (delivering `@ResourceCaptures` for the `brand` resource) WILL be additively touched by downstream chunks' builders to add nested-resource `@ResourceCaptures(...)` tuples for `brandId` path-param captures on `/api/v1/brands/:brandId/guidelines/*` endpoints. Chunk A delivers the parent surface and does NOT lock the controller behind a blanket "do not modify" wall. Downstream chunk builders may append to the captures array without ownership escalation; the parent file is in their FILE_SCOPE for the additive change only.

### Chunk B — Brand Voice + Visual Identity guidelines (per active brand)

**Features within:**
- B1: `BrandVoice` domain entity (brandId FK, tone text, preferredVocabulary string[], restrictedVocabulary string[], messagingPillars Jsonb of {title, description}[], writingStyleRules text, audienceRules Jsonb of {audience, rules}[], approvedExamples Jsonb of {phrase}[], rejectedExamples Jsonb of {phrase, reason?}[]) + Prisma + migration. Singleton per brand (one Voice row per brand).
- B2: `VisualIdentity` domain entity (brandId FK, logoUsage text, colorPalette Jsonb of {name, hex, usageNotes}[], typography Jsonb of {font, weight, usageContext}[], spacingGuidance text, imageStyleGuidance text, iconographyGuidance text, usageRestrictions text) + Prisma + migration. Singleton per brand.
- B3: Backend endpoints `GET /api/v1/brands/:brandId/guidelines/voice`, `PUT /api/v1/brands/:brandId/guidelines/voice` (admin-only write), same pair for `visual`. All admin-guarded write; reads accept admin OR agent role (agent role wired by Chunk E, gates here are forward-compat). Zod schemas, DTOs, `@ApiResponse` 200/400/401/403/404, integration tests, flow file additions.
- B4: Frontend forms — Voice form mirrors the four-section grouping pattern from Phase-2 F2 (fieldsets per logical group: Tone / Vocabulary / Messaging / Audience / Examples) with repeatable list controls (react-hook-form + ArrayField pattern from F2 mx-852671), Visual form with palette/typography ArrayField + textarea inputs for guidance fields, EN+RO translations, deterministic-locale tests.

**Domain entities touched:** `BrandVoice`, `VisualIdentity`, `Brand` (FK reference).

**App-shell entries this chunk registers:** none new at the tab/route level — these are body content for `/admin/brand-guidelines/<brandId>` page delivered by Chunk A. Adds sub-section navigation within that page (sub-tabs or accordions; builder picks).

**"User can ..." demo state at chunk end:** admin on `/admin/brand-guidelines/<brandId>` can open Brand Voice sub-section, fill every field including repeatable lists, save, refresh, see values persisted; same for Visual Identity. Saves persist to per-brand singleton rows.

**Suggested lead capability:** `lead`.

### Chunk C — Dos & Don'ts + Metadata + Search

**Features within:**
- C1: `DosDontsEntry` domain entity (id, brandId FK, type 'do'|'dont', category text from extensible enum, ruleText text, exampleText nullable text, createdAt, updatedAt) + Prisma model + migration. Multiple rows per brand (CRUD on individual entries).
- C2: `BrandMetadata` domain entity (singleton per brand: brandId FK, ownerUserId, lastUpdatedAt, lastUpdatedByUserId, tags string[] of free-form content-type/campaign/market/language tags) + Prisma + migration.
- C3: Backend endpoints `GET/POST/PATCH/DELETE /api/v1/brands/:brandId/guidelines/dos-and-donts` (collection with `?type` + `?category` query filter), `GET/PUT /api/v1/brands/:brandId/guidelines/metadata`, `GET /api/v1/brands/:brandId/guidelines/search?q=` (full-text search across Voice/Visual/D&D/Metadata for that brand, returning categorized matches with section name + matched fragment + deep-link href). Use Postgres `to_tsvector` / `to_tsquery` or `ILIKE` substring scan. All write admin-only; reads admin OR agent. `@ApiResponse` declared. Integration tests + flow file.
- C4: Frontend — Dos & Don'ts sub-section (filterable list with type + category dropdowns, inline add/edit/delete with confirm), Metadata sub-section (owner display, last-updated display, tag editor with chip-pattern Add/Remove), Search bar at top of `/admin/brand-guidelines/<brandId>` page with grouped results panel that deep-links to source section.

**Domain entities touched:** `DosDontsEntry`, `BrandMetadata`, `Brand`.

**App-shell entries this chunk registers:** Dos & Don'ts sub-section + Metadata sub-section + search bar — all body content within `/admin/brand-guidelines/<brandId>` page already delivered by Chunk A. No new tab routes.

**"User can ..." demo state at chunk end:** admin can manage D&D entries (add Do/Don't, set category, edit, delete, filter list); manage Metadata (tags as chips); search across all sections returns matches grouped by source with deep-links that navigate to the matching section.

**Suggested lead capability:** `lead`.

### Chunk D — Per-brand versioning + history view + standalone read endpoints

**Features within:**
- D1: `BrandGuidelinesVersion` domain entity (id, brandId FK, snapshot Jsonb of full {voice, visual, dosAndDonts, metadata}, editorUserId, editorDisplayName, changeNote nullable, createdAt) + Prisma model + migration. Pattern mirrors Phase-2 `CompanyInfoVersion`.
- D2: Backend — every `PUT` on `voice` / `visual` / `metadata` AND every mutating call on `dos-and-donts` (POST/PATCH/DELETE) writes a `BrandGuidelinesVersion` row in the same transaction with a full snapshot of all four sections after the change. Optional `changeNote` query param or request-body field. New endpoints: `GET /api/v1/brands/:brandId/guidelines/versions` (paginated newest-first cursor pagination matching F4 pattern with `x-cursor-invalid-behavior: empty-200` per ml mx-foundational-protocol from Phase 2) + `GET /api/v1/brands/:brandId/guidelines/versions/:versionId` (404 on miss). Both reads admin OR agent. Plus standalone agent-optimized endpoints: `GET /api/v1/brands/:brandId/guidelines/voice/restricted-vocabulary`, `.../approved-examples`, `.../rejected-examples` (frequent agent calls per operator brief). All standalone reads accept admin OR agent. Every guideline response includes a `versionId` field referencing the version that produced the snapshot.
- D3: Frontend — `/admin/brand-guidelines/<brandId>/history` list page (newest-first table with timestamp + editor + change note column) + `/admin/brand-guidelines/<brandId>/history/<versionId>` read-only snapshot page (renders all four sections disabled, mirrors Phase-2 F5 pattern), `[View history]` affordance on each sub-section page deep-links to the list. `[Back to current]` returns to `/admin/brand-guidelines/<brandId>`. Optional `changeNote` input on the Save button row (per sub-section) sent in PUT body.
- D4: OpenAPI/Swagger documentation: every new endpoint declared with `@ApiTags('brand-guidelines')`, full `@ApiResponse` set, `@ApiOperation` (with `extensions: { 'x-cursor-invalid-behavior': 'empty-200' }` on paginated list), `@ApiBearerAuth('accessToken')`. Resulting `/api/docs` reflects all new routes.

**Domain entities touched:** `BrandGuidelinesVersion`, plus reads from all four guideline entities for snapshot composition.

**App-shell entries this chunk registers:** `/history` + `/history/<versionId>` routes + `[View history]` link affordance.

**"User can ..." demo state at chunk end:** admin can view per-brand version history list, click into any version to see read-only snapshot, return to current. Every save creates a new version row with snapshot + timestamp + editor + optional change note. Agents/admins can fetch standalone restricted-vocab / approved-examples / rejected-examples lists via REST without loading the whole guideline set.

**Suggested lead capability:** `lead`.

### Chunk E — Keycloak `agent` role + audit log + integration docs

**Features within:**
- E1: Keycloak realm-config update: add new role `agent` (additive — does NOT touch existing `admin`) in the realm-config JSON. Document the manifest + provisioning path in repo. (Local dev: re-import realm config; staging/prod: operator runs the Keycloak admin API or kcadm.)
- E2: Backend `@AuthRoles` guard update — define `AUTH_ROLE_AGENT` constant in `@sfx/shared`; extend role-check decorator to accept either of N declared roles per endpoint (existing pattern from Phase 2). Apply to every read endpoint introduced in Chunks A/B/C/D so they accept admin OR agent. Write endpoints retain admin-only. Add per-task flow file flows: `agent-can-read-brands`, `agent-can-read-guidelines`, `agent-can-read-standalone-vocab`, `agent-can-read-dos-and-donts-with-filter`, `agent-can-read-versions`, `agent-write-rejected-403` per endpoint family.
- E3: `AgentAuditLog` domain entity (id, requestId, clientId, endpointPath, brandId nullable, versionIdReturned nullable, requestTimestamp, responseStatus) + Prisma migration. NestJS HTTP interceptor that, on every request authenticated with the `agent` role, inserts an audit row. Configurable retention (set 90-day default; document only — actual purge job out of scope).
- E4: Frontend audit-log surface `/admin/brand-guidelines/<brandId>/audit-log` (admin-only): newest-first list of audit rows, filter by client_id + date range. Renders client_id + endpoint + version + timestamp. Translations EN+RO.
- E5: Documentation `docs/AGENT-INTEGRATION-KEYCLOAK.md` (or equivalent repo location): step-by-step (create Keycloak client → assign agent role → exchange client_credentials for JWT → curl examples for `/api/v1/brands`, `/api/v1/brands/:id/guidelines`, `/api/v1/brands/:id/guidelines/voice/restricted-vocabulary`, `/api/v1/brands/:id/guidelines/dos-and-donts?type=Don't&category=vocabulary`, `/api/v1/brands/:id/guidelines/versions`). Also document write-rejection behavior. Include sample 200 response and sample 403 response.

**Domain entities touched:** `AgentAuditLog`. Plus role-config side effect across every guideline read endpoint already delivered.

**App-shell entries this chunk registers:** `/admin/brand-guidelines/<brandId>/audit-log` route + `[Audit log]` affordance within the brand workspace.

**"User can ..." demo state at chunk end:** an agent client registered in Keycloak with the `agent` role can perform OAuth2 client_credentials exchange + call every read endpoint with a Bearer token + receives 200; the same client calling any write endpoint receives 403. Admin can navigate to `/admin/brand-guidelines/<brandId>/audit-log` and see each agent request logged. Repo has integration guide + Swagger surface at `/api/docs`.

**Suggested lead capability:** `lead`.

---

## 4. Dispatch plan

`.overstory/config.yaml` capacity: maxConcurrent=6, reserved=2 (coordinator+monitor), available=**4 slots**.

Per cost-awareness: maximum 1 full lead with full budget (1 lead + 2 children = 3 slots), leaving 1 spare. With 5 chunks of substantive scope, sequential lead dispatch would serialize the whole initiative.

**Direct-builder mode chosen** (also reinforced by recent session data: 4 compressed-lead zombie occurrences under `--dispatch-max-agents 1`; the one feature dispatched as direct scout+builder in the last session [F5] shipped clean first try).

Coordinator acts as lead for all five chunks. After this product-plan output is committed, next-step is to invoke the `feature-plan` skill which handles per-feature scout+builder dispatch sequence. Within direct-builder mode:
- Scout per feature (1 slot, writes `.overstory/specs/<feature-id>.md`).
- Builder per feature (1 slot, implements + tests + runs probe + qa-test + sends worker_done).
- Coordinator merges via the standard branch-integration command after probe-verifying.

Sequence: chunks ordered A → B → C → D → E by dependency. Within a chunk, features ordered by scout's recommendation. Where chunks don't overlap file scope (e.g. E5 docs vs A4 frontend route shell), parallel scout-of-next-chunk while builder integrates is allowed (≤ 4 slots).

Phase 0a immediately after this plan: invoke `shared-flow-authoring` skill to seed `_shared.json` for the new initiative. The brief introduces a NEW global actor (`agent` with OAuth2 client_credentials scheme) plus a new shared resource (`brand` — referenced by every chunk's nested resources). Both belong in `_shared.json` at seed time (declarations only; bootstrap-flow bodies authored later by the lead/coordinator whose chunk delivers the surface — see propulsion-principle's `_shared.json` config-only rule).

---

## 5. Runtime acceptance criteria

Per journey, behavioral acceptance statements. Probe derives concrete HTTP checks; UI checks come via qa-test full mode per chunk's worker_done evidence.

### J1 — First brand profile
- An authenticated admin visiting the Brand Guidelines tab with zero brand profiles sees an empty state with a primary call-to-action that opens a create form.
- Submitting the create form with a valid brand name results in a new brand profile that becomes the active profile, visible in the profile selector.
- After creation, the URL reflects the new brand's identifier; refreshing the page preserves both the URL and the active profile.

### J2 — Populate Brand Voice
- An admin can fill every Voice field including tone, repeatable preferred and restricted vocabulary lists, repeatable messaging pillars (title + description), writing style, audience rules, and approved/rejected example phrases, and submit the form.
- Submission produces a visible pending state on the submit control and a visible success notification on completion.
- After a hard refresh of the page, every saved value remains present.
- The save is reflected in a new entry on the brand's history list with the current admin's display name.
- An admin cannot save the form while a required field (tone) is empty; client-side validation rejects before network call.

### J3 — Populate Visual Identity
- An admin can populate logo guidance, color palette rows (name + hex + usage), typography rows (font + weight + context), spacing/image/iconography guidance, and restrictions, and submit.
- A hex value that is not a valid color is rejected client-side before network call.
- After save and hard refresh, every value persists; a new version row appears.

### J4 — Manage Dos & Don'ts
- An admin can add a Do or Don't entry, choose a category from the extensible set, write a rule, and optionally an example, and persist it.
- Filtering by Type narrows the list; filtering by Category narrows further; combined filters apply both.
- Editing an existing entry and saving updates the row in place; deleting an entry removes it after confirmation.
- Every Add / Edit / Delete creates a new version row.

### J5 — Search active brand
- A search query against the active brand's content returns matches grouped by source section (Voice, Visual, Dos & Don'ts, Examples).
- An empty query string returns no results without erroring.
- Each result identifies its source section and is interactive — activating it navigates the admin to that section with the matched entry highlighted (or scrolled into view).
- The search response is scoped to the active brand only — content of other brands does not appear.

### J6 — Version history per brand
- An admin can navigate from a sub-section to the per-brand history list via a `View history` affordance.
- The history list is ordered newest-first and shows timestamp, editor display name, and optional change note for each version.
- Activating any history row navigates to a read-only snapshot of that version with a banner identifying the editor + timestamp + change note (or em-dash if none).
- From the snapshot view, a `Back to current` control returns the admin to the editable view at `/admin/brand-guidelines/<brandId>`.
- The current editable view is always equivalent to the latest snapshot in the history list.

### J7 — Switch brand profile
- Switching the active profile from the selector reloads all four sub-section bodies with the chosen brand's data.
- A save performed on brand B does not create a version row for brand A; brand A's history list is unchanged after the operation.
- Deleting a brand profile via the selector confirm dialog removes it from the selector and from the listing endpoint; its versions and audit-log entries are deleted with it (or marked deleted — implementation choice in Chunk A).

### J8 — Agent service-account read
- A Keycloak client provisioned with the `agent` role and registered for OAuth2 client_credentials can exchange `client_id` + `client_secret` for a short-lived JWT.
- A request to a read endpoint (`/api/v1/brands`, any `/api/v1/brands/:id/guidelines/*` GET, any standalone-list GET, `/versions` and `/versions/:id`) bearing the agent JWT is accepted and returns 200 with a body containing a `versionId` field where applicable.
- A request to any write endpoint (`POST`, `PUT`, `PATCH`, `DELETE` on the same families) bearing the agent JWT is rejected with 403.
- An unauthenticated request to any read or write endpoint is rejected with 401.
- A non-admin, non-agent authenticated request (a `viewer` from Phase 2 fixtures) to a guideline read endpoint is rejected with 403.
- A read endpoint supporting `?tag=` or `?type=`/`?category=` filters returns only the matching subset.
- A request to `/versions?cursor=<unknown-id>` returns 200 with an empty page (Linear/GitHub cursor semantics per Phase-2 `x-cursor-invalid-behavior: empty-200`).

### J9 — Audit log
- Every agent-authenticated read produces an audit log entry containing the calling client_id, the request endpoint path, the brand id (when path-bound), the version id returned (when the response carries one), and a timestamp.
- An admin can view the audit log per brand from a dedicated surface within the Brand Guidelines tab, with filters on client_id and date range.
- The audit log surface is admin-only — an agent JWT cannot read it.

### Cross-cutting auth boundaries (every chunk inherits)
- Unauthenticated visitors to any `/admin/brand-guidelines/*` page hit the existing AuthGate and are redirected to the existing login surface (oauth2-proxy via Keycloak hosted form) — unchanged from Phase 2.
- A non-admin authenticated visitor (e.g. `viewer`) to any `/admin/brand-guidelines/*` page hits the inherited `AdminRouteGate` denied surface — same lift as Phase-2 F5.
- The `agent` role does not grant access to any `/admin/*` page — agents are API-only.

### Cross-cutting OpenAPI / discoverability
- Every new endpoint introduced in Chunks A through E appears at `/api/docs` with full `@ApiResponse` set (200/400/401/403/404 where applicable) and `@ApiBearerAuth('accessToken')`.
- Every read endpoint returning a guideline payload carries a `versionId` field in the response body.

### Cross-cutting freshness
- An update to any guideline section becomes visible to a subsequent read by either admin or agent without any cache invalidation step from the caller.
- No agent retraining surface, queue, or notification is built — guidelines are data, not training.

---

## Self-review notes (verified inline before commit)

1. Every entity in the brief appears in ≥1 chunk: Brand (A), BrandVoice (B), VisualIdentity (B), DosDontsEntry (C), BrandMetadata (C), BrandGuidelinesVersion (D), AgentAuditLog (E). ✓
2. Every `[Create *]` affordance in §2 lives on a page that appears in ≥1 chunk's features. ✓
3. From `/admin` (post-login, zero data) admin can reach every chunk's capabilities via the AdminTabBar → Brand Guidelines tab → empty state → create profile → in-page selector + sub-sections → history affordance. ✓
4. Zero TBD / "standard CRUD" / "similar to" placeholders. ✓
5. No chunk named after a layer (Brand profile foundation / Brand Voice + Visual / Dos & Don'ts + Metadata + Search / Versioning + History + Standalone reads / Agent role + Audit log + Docs — all user-capability oriented). ✓
6. Every journey in §1 has ≥1 acceptance statement in §5. ✓
7. Every page / nav item in §2 has an implied acceptance statement in §5. ✓
8. Every auth boundary is named in §5 (unauth → login redirect; non-admin → AdminRouteGate denied; agent → reads accepted, writes 403). ✓
9. Brief did not request auth replacement; plan preserves Keycloak + oauth2-proxy + RS256/JWKS; new `agent` role is additive in the same Keycloak realm using existing JWT path. ✓

---

## References

- Phase-2 product plan: `.overstory/specs/sfx-webapp-boilerplate-26a0.md`
- Phase-2 F3 admin tab shell spec: `.overstory/specs/sfx-webapp-boilerplate-1c10.md` (AdminTabBar registry pattern to extend)
- Phase-2 F4 backend versioning spec: `.overstory/specs/sfx-webapp-boilerplate-1ef9.md` (per-resource versioning pattern + `x-cursor-invalid-behavior` declaration)
- Phase-2 F5 frontend history spec: `.overstory/specs/sfx-webapp-boilerplate-d0fe.md` (read-only snapshot UI pattern + per-resource history list)
- Existing shared actors: `.overstory/runtime-contract.flows/_shared.json` (Phase-2 declares `anonymous` + `admin` + `viewer`; Phase-3 adds `agent` with OAuth2 client_credentials)
- Operator brief source: msg-qfrflzng1f6t (received 2026-05-17)
