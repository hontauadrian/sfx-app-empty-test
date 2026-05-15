<!-- written-by: scout-brand-profile (relayed by coordinator after scout-branch merge conflict on zombie-recovered files) -->
# F1 brand-profile — feature spec

**Task:** `sfx-webapp-boilerplate-b859` (feature 1 of 3, parent plan `sfx-webapp-boilerplate-2cb0`).
**Scope of THIS spec:** F1 only — `BrandProfile` entity, full CRUD API behind `JwtAuthGuard`, ownership scoping, active-brand Zustand store with `persist`, AppShell (top bar + user menu + active-brand selector + brand-mark + brand-scoped left-nav), routes `/`, `/brands/new`, `/brands/<id>` shell (the two section cards inside are present but EMPTY/STUBBED — F2 and F3 fill them).
**Out of scope:** brand-voice fields & endpoints (F2), visual-identity fields & endpoints (F3), search, dos/don'ts, version history, agent retrieval API, AI integrations (parts 2+3).

**Auth (binding):** the existing Keycloak + oauth2-proxy + RS256/JWKS stack is the ONLY auth mechanism. The builder MUST NOT modify `apps/api/src/modules/auth/**`, `apps/api/src/common/auth/**`, `apps/api/src/common/guards/jwt-auth.guard.ts`, `apps/api/src/common/decorators/auth-roles.decorator.ts`, or `apps/web/src/features/auth/**`. The oauth2-proxy logged-in user is the "brand manager". Identity = `request.user.subject` from `JwtAuthGuard`. No `/login`, `/register`, email+password, or HS256 cookie auth.

---

## 1. User-visible behaviour (what the probe will assert)

### Shell (every authenticated route)

- Brand mark `Brand Guidelines` at the left of the top bar → links to `/`.
- Active-brand selector in the centre of the top bar. Shows current active brand name, dropdown lists every brand the caller owns + `[+ Create brand]` row at the bottom.
- User menu at the right of the top bar. Shows the `email` value returned by `GET /api/v1/auth/me`. `Sign out` action targets the existing `getOAuth2ProxyLogoutHref()` URL — no in-app `/login` route is added.
- Left nav appears ONLY on `/brands/<id>` and brand-scoped child routes. Items: `Overview` (`/brands/<id>`), `Brand voice` (anchor on `/brands/<id>` — link only, F2 wires the actual edit route), `Visual identity` (anchor on `/brands/<id>` — link only, F3 wires the actual edit route).
- `AuthGate` (existing component in `apps/web/src/features/auth/presentation/components/AuthGate/**`) MUST remain the outermost client wrapper for every authenticated route. Render order from `app/<route>/page.tsx`: `<AuthGate><AppShell><PageBody/></AppShell></AuthGate>`.

### Pages (URLs are exact)

| URL | Purpose | Empty-state / branch |
|---|---|---|
| `/` | Brands dashboard | 0 brands: empty state with `[+ Create brand]` CTA to `/brands/new`. >=1 brand and no active brand stored: pick most-recently-updated brand, set as active, redirect to `/brands/<id>`. >=1 brand and active-brand id stored: redirect to `/brands/<active-id>`. If stored active-brand id no longer exists (was deleted out-of-band): clear store, fall through to "no active brand stored" branch. |
| `/brands/new` | New-brand form | Single form with `name` (required, 1..120 chars after trim) and `description` (optional, 0..2000 chars). Submit `POST /api/v1/brands` on `201` redirect to `/brands/<new-id>` and set the new brand as active. Validation errors render per-field. |
| `/brands/<id>` | Brand overview (shell only in F1) | Renders header (name + settings menu) + two visually-separated cards labelled **Brand voice** and **Visual identity**. F1 renders each card as an empty placeholder with the section title and a `[+ Edit brand voice]` / `[+ Edit visual identity]` CTA that links to `/brands/<id>/voice/edit` / `/brands/<id>/visual-identity/edit` — those routes 404 in F1; F2/F3 add them. The cards' placeholder rendering MUST stay visually separated from day one. |

### Brand-profile journeys

J1 (first brand creation, zero state):
- Unauthenticated visitor hitting `/`, `/brands/new`, `/brands/<id>`, or any `/api/v1/brands*` endpoint is redirected to the oauth2-proxy login surface (web) OR returned `401` (API).
- Authenticated user with zero brands sees the dashboard empty state.
- Submitting a valid name persists the brand and navigates to `/brands/<new-id>`. The new brand is the active brand.
- Submitting an invalid name (empty after trim, or > 120 chars) shows a per-field error and does NOT create a brand.
- `/brands/<new-id>` renders both empty-card stubs (Brand voice + Visual identity).

J2 (switching active brand):
- User with >=2 brands opens the selector and sees every brand they own (order `updatedAt DESC` to match `/` redirect logic).
- Selecting a brand navigates to `/brands/<id>` and updates the selector label.
- Active-brand id persists across refresh (Zustand `persist` middleware writes to `localStorage` under key `sfx.activeBrand`).
- Active-brand label updates immediately after a rename within the same session — selector reads the brand list cached by React Query, not a snapshot.

J5 (rename / delete):
- Settings menu on `/brands/<id>` exposes `Rename` and `Delete`.
- `Rename` opens a modal, submits `PUT /api/v1/brands/<id>` with the new name. On `200` the selector label updates and the page header reflects the new name without a hard refresh.
- `Delete` opens a confirmation modal, submits `DELETE /api/v1/brands/<id>`. On `200`: if the deleted brand was the active brand, clear the active-brand store and redirect to `/`; otherwise stay on `/brands/<currently-active-id>` and refresh the brand list.
- `DELETE` cascades the future `brand_voice` and `visual_identity` rows by `ON DELETE CASCADE` on the FK from those tables (F2/F3 own those FKs).

Cross-tenant access (J3/J4/J5 boundary applied to brand-profile):
- Authenticated user CANNOT read, rename, or delete a brand they do not own. API returns `404 Not Found` (existence is NOT leaked). `403` is forbidden by this rule — the probe will assert `404`.

---

## 2. Runtime acceptance criteria

These are the behaviours the runtime probe will assert. Status codes / URLs do NOT live in the flow file directly — they are derived from Zod schemas + NestJS decorators + the contract overlay (see "Runtime flow coverage" in CLAUDE.md). The lead authors `sfx-webapp-boilerplate-b859.json` in `.overstory/runtime-contract.flows/` with these behaviours.

### API surface — every endpoint authenticated

For each of the five endpoints below, the probe will assert:
1. Happy path with a valid bearer (`admin` actor from `_shared.json`) → `2xx` + envelope `{ success: true, data: <T> }`.
2. Anonymous (no bearer) → `401`.
3. Cross-tenant (a brand owned by user A, accessed by user B — both authenticated) → `404` for `GET/:id`, `PUT/:id`, `DELETE/:id`.

| Endpoint | Method | Path | Auth | Notes |
|---|---|---|---|---|
| List brands of caller | GET | `/api/v1/brands` | yes | returns `BrandProfile[]` scoped to `request.user.subject`. Ordered `updatedAt DESC`. |
| Create brand | POST | `/api/v1/brands` | yes | body `{ name, description? }`. Returns `201` + the created `BrandProfile`. Sets `ownerSubject = request.user.subject`. MUST carry `@ResourceCaptures({ fromPath: 'id', resource: 'brand', pathParam: 'id' })` so the probe can chain CRUD. |
| Get brand by id | GET | `/api/v1/brands/:id` | yes | `404` if not found OR not owned by caller. |
| Rename / update brand | PUT | `/api/v1/brands/:id` | yes | body `{ name, description? }`. `404` if not owned. |
| Delete brand | DELETE | `/api/v1/brands/:id` | yes | `404` if not owned. `200` on success (per `TransformInterceptor` envelope; returning `void` from the controller method yields `{ success: true, data: null }`). Cascades to F2/F3 sibling tables via FK. |

### Validation (Zod schemas in `@sfx/validation/schemas/brand-profile.schema.ts`)

- `name`: trimmed, 1..120 chars after trim. Empty / whitespace-only triggers a `400` with field-level error.
- `description`: optional. If present, 0..2000 chars after trim. `null` is allowed on PUT (clears the field).
- `id` path param: shares `idParamSchema` from `@sfx/validation/schemas/common.schema.ts`.
- POST and PUT use the same shared Zod schema (`brandProfileWriteSchema`); PUT additionally validates `:id` via `idParamSchema`.
- DB-level uniqueness is NOT enforced on `name` (parts 2+3 may attach tags / versions that would conflict). Same `name` across two of the caller's brands is allowed.

### Shell-level

- Every URL in §1 renders without a runtime error for an authenticated user.
- The user menu shows the email returned by `/api/v1/auth/me`.
- `Sign out` targets the existing oauth2-proxy URL; no new `/login` or `/logout` route is added.

### Auth-boundary

- The diff does NOT modify `apps/api/src/modules/auth/**`, `apps/api/src/common/auth/**`, `apps/api/src/common/guards/jwt-auth.guard.ts`, `apps/api/src/common/decorators/auth-roles.decorator.ts`, or `apps/web/src/features/auth/**`. Reviewer / probe will check the diff.
- `GET /api/v1/auth/me` continues to return `{ subject, email, roles, isAuthenticated }` unchanged.
- Every brand-profile endpoint carries `@UseGuards(JwtAuthGuard)` and `@ApiBearerAuth('accessToken')`. Probe asserts `401` on missing bearer.
- No `OAUTH_*` environment variable is removed or renamed. Builder adds NO new env var unless strictly required for DB; `DATABASE_URL` already works.

### Database — additive-friendly

- New Prisma model `BrandProfile` (`@@map("brand_profile")`). Columns: `id String @id @default(cuid())`, `ownerSubject String @map("owner_subject")`, `name String`, `description String?`, `createdAt DateTime @default(now()) @map("created_at")`, `updatedAt DateTime @updatedAt @map("updated_at")`.
- Index on `(ownerSubject)` for the list-by-owner query.
- NO `UNIQUE` constraint on `name` (parts 2+3 must remain free to attach tags / versions / dos-don'ts).
- F1 migration MUST be additive only. F1 SHOULD delete the placeholder model from `packages/database/prisma/schema.prisma` (`BoilerplatePlaceholder`) and remove the matching `flows.config.json` `resourceGraph.ignoreModels` entry. If that triggers a destructive change in the migration diff, leave the placeholder in place — the doc comment in `schema.prisma` already covers the rationale.
- The migration name MUST be `add_brand_profile` (`pnpm db:migrate -- --name add_brand_profile`). The per-worker `panel-bridge.mjs` auto-applies it within ~1.5s of the directory being created — no manual `stack:reset` needed.

---

## 3. Guard contract

| Surface | Auth | Unauth behaviour |
|---|---|---|
| Web `/` | authenticated | `AuthGate` already redirects unauth users to oauth2-proxy login. F1 does NOT add a new redirect path. |
| Web `/brands/new` | authenticated | same as `/`. |
| Web `/brands/<id>` | authenticated | same. |
| API `GET /api/v1/brands` | authenticated | `401` |
| API `POST /api/v1/brands` | authenticated | `401` |
| API `GET /api/v1/brands/:id` | authenticated, owner-scoped | `401` unauth; `404` if not owned (NEVER `403`, NEVER leak existence). |
| API `PUT /api/v1/brands/:id` | authenticated, owner-scoped | `401` unauth; `404` if not owned. |
| API `DELETE /api/v1/brands/:id` | authenticated, owner-scoped | `401` unauth; `404` if not owned. |

Ownership = `BrandProfile.ownerSubject === request.user.subject`. The repository's `findById` MUST take `(id, ownerSubject)` and return `null` for either "not found" or "found but not owned" — the controller maps `null` to `NotFoundException` and never returns `ForbiddenException`.

---

## 4. Contract annotations the builder must maintain

The flows-generator reads NestJS Swagger decorators + Zod `.openapi()` annotations + the runtime-contract overlay. The builder MUST keep these annotations current — they are the contract.

### NestJS files to annotate (apps/api)

- `apps/api/src/modules/brand-profile/brand-profile.module.ts` — wire controllers + providers, `@Inject(BRAND_PROFILE_REPOSITORY)` for the repository symbol.
- `apps/api/src/modules/brand-profile/application/controllers/brand-profile.controller.ts` — every method:
  - `@ApiTags('brand-profile')` on the class.
  - `@UseGuards(JwtAuthGuard)` on every method.
  - `@ApiBearerAuth('accessToken')` on every method.
  - `@ApiOperation({ summary: ... })`, `@ApiResponse({ status, type: ApiEnvelopeDto(<Dto>) })` for `200`/`201`, `@ApiResponse({ status: 400, ... })`, `@ApiResponse({ status: 401, ... })`, `@ApiResponse({ status: 404, ... })` for `/:id` routes.
  - `@ApiParam({ name: 'id', type: String })` for `:id` routes.
  - `@ApiBody({ type: <Dto> })` for POST/PUT.
  - `@ResourceCaptures({ fromPath: 'id', resource: 'brand', pathParam: 'id' })` on the POST handler — REQUIRED for chain coverage (see `apps/api/src/common/decorators/resource-captures.decorator.ts`).
- `apps/api/src/modules/brand-profile/application/dto/*.dto.ts` — every `@ApiProperty()` MUST declare `type:` explicitly (per `tsx + esbuild` reflect-metadata constraint in `build-verifiable-features` skill). Example: `@ApiProperty({ type: String }) declare name: string;`.
- `apps/api/src/modules/brand-profile/data/repositories/brand-profile.repository.ts` — implements `IBrandProfileRepository` from `@sfx/domain`. Constructor injection MUST use `@Inject(<TOKEN>)` on EACH parameter — no positional `private readonly prisma: PrismaClient` shortcut.
- `apps/api/src/app.module.ts` — register the new `BrandProfileModule`.

### Zod schemas (packages/validation)

- `packages/validation/src/schemas/brand-profile.schema.ts`: `brandProfileWriteSchema`, `brandProfileSchema` (the response shape), inferred types. Every field carries `.openapi({ description, example })` so the flows generator sees the body shape.
- Update `packages/validation/src/index.ts` to re-export the new schemas + inferred types.

### Domain (packages/domain)

- `packages/domain/src/entities/brand-profile.ts`: `BrandProfile` (readonly interface OR class with a factory; pick the same shape that `brandProfileSchema` infers). Fields: `id`, `ownerSubject`, `name`, `description: string | null`, `createdAt: Date`, `updatedAt: Date`.
- `packages/domain/src/repositories/brand-profile-repository.ts`: `IBrandProfileRepository` interface:
  - `listByOwner(ownerSubject: string): Promise<BrandProfile[]>` (ordered `updatedAt DESC`)
  - `findById(id: string, ownerSubject: string): Promise<BrandProfile | null>`
  - `create(input: { ownerSubject: string; name: string; description: string | null }): Promise<BrandProfile>`
  - `update(id: string, ownerSubject: string, patch: { name?: string; description?: string | null }): Promise<BrandProfile | null>` (null if not owned/not found)
  - `delete(id: string, ownerSubject: string): Promise<boolean>` (false if not owned/not found)
- `packages/domain/src/index.ts`: re-export entity + interface + a `BRAND_PROFILE_REPOSITORY` DI symbol.

### Prisma (packages/database)

- `packages/database/prisma/schema.prisma`: add the `BrandProfile` model defined in §2.
- New migration directory `packages/database/prisma/migrations/<timestamp>_add_brand_profile/`.

### Frontend (apps/web)

- `apps/web/src/features/brand-profile/` — full clean-architecture layout mirroring `features/home/`:
  - `data/remote/fetch-brands.ts`, `create-brand.ts`, `update-brand.ts`, `delete-brand.ts`, `fetch-brand-by-id.ts` — each uses `executeRequest()`, unwraps the envelope (mirror `home/data/remote/fetch-health.ts`).
  - `data/model/brand-profile-data-model.ts` — DTO interface mirroring the API response.
  - `data/mapper/map-to-brand-profile.ts` — coerces ISO timestamps to `Date`.
  - `data/repositories/use-brands-repository.ts` (`useQuery`), `use-brand-by-id-repository.ts`, `use-create-brand-mutation.ts`, `use-update-brand-mutation.ts`, `use-delete-brand-mutation.ts` (mutations invalidate `['brands']` — array-prefix matching, see `apps/web/CLAUDE.md` React Query gotcha).
  - `presentation/pages/dashboard/` — page hook + UI model + index for `/`.
  - `presentation/pages/new-brand/` — page hook + UI model + index for `/brands/new`.
  - `presentation/pages/brand-overview/` — page hook + UI model + index for `/brands/<id>`.
  - `presentation/components/BrandHeader/`, `BrandVoiceCardPlaceholder/`, `VisualIdentityCardPlaceholder/`, `RenameBrandModal/`, `DeleteBrandConfirmModal/` — each in its own folder with `__tests__/`.
  - `presentation/validators/brand-profile-form.ts` — Zod-derived RHF resolver re-exported from `@sfx/validation`.
  - `constants.ts` — `BRANDS_ENDPOINT = 'api/v1/brands'`, `BRANDS_QUERY_KEY = ['brands'] as const`, max-length constants mirroring the Zod schema.
  - `index.ts` — barrel.
- `apps/web/src/features/app-shell/` — new feature module:
  - `presentation/components/AppShell/` — top bar + main area wrapper + brand-scoped left nav.
  - `presentation/components/TopBar/`, `BrandMark/`, `ActiveBrandSelector/`, `UserMenu/`, `LeftNav/` — each in its own folder.
  - `index.ts` exports `<AppShell />`.
- `apps/web/src/stores/active-brand-store.ts` — Zustand store with `persist` middleware:
  - State: `{ activeBrandId: string | null }`.
  - Actions: `setActiveBrandId(id: string | null): void`, `clear(): void`.
  - Persist key: `sfx.activeBrand`. Storage: `createJSONStorage(() => localStorage)`.
  - Use individual-field selectors or `useShallow` per the Zustand gotcha in `apps/web/CLAUDE.md`.
- `apps/web/src/features/presentation/localization/languages/en/common.ts` AND `.../ro/common.ts` — add new keys (English + Romanian for parity). Add at least: `brandGuidelinesAppName` (`'Brand Guidelines'`), `brands`, `createBrand`, `brandNameLabel`, `brandNamePlaceholder`, `descriptionLabel`, `descriptionPlaceholder`, `submit`, `noBrandsTitle`, `noBrandsBody`, `noBrandsCta`, `brandSettings`, `rename`, `deleteBrandConfirmTitle`, `deleteBrandConfirmBody`, `editBrandVoice`, `editVisualIdentity`, `brandVoiceSectionTitle`, `visualIdentitySectionTitle`, `signOut` (alias for `logout`), `selectBrand`, per-field validation messages.
  - Both language files MUST have identical keys — TypeScript enforces this via `CommonTranslations` in `apps/web/src/features/presentation/localization/types.ts`. Update `types.ts` to extend `CommonTranslations` with the new keys.
  - Do NOT override the existing `appName` key — the brand mark uses the new `brandGuidelinesAppName` key.
- `apps/web/src/app/page.tsx` — replace the current `<HomePage />` body with the dashboard page. RECOMMENDED: render `<AuthGate><AppShell><BrandsDashboardPage/></AppShell></AuthGate>`. Builder picks between (a) deleting `features/home/**` entirely and (b) moving the health UI to `app/health/page.tsx`. Either is acceptable provided `apps/web/CLAUDE.md` boundaries are honoured. Document the choice in the PR description.
- `apps/web/src/app/brands/new/page.tsx` — thin wrapper: `<AuthGate><AppShell><NewBrandPage/></AppShell></AuthGate>`.
- `apps/web/src/app/brands/[id]/page.tsx` — thin wrapper. Reads `params.id`, passes to `<BrandOverviewPage brandId={params.id} />`.

### Tests

- Every new source file MUST have a co-located test file under `__tests__/` OR a sibling `.test.ts(x)`. >=90% coverage. Hook will block the close gate otherwise.
- Backend integration test (Supertest + `Test.createTestingModule`) covering all five endpoints, happy paths, validation failures, anonymous → 401, cross-tenant → 404. Place in `apps/api/src/modules/brand-profile/application/controllers/__tests__/brand-profile.controller.test.ts` (mirror `auth.controller.test.ts`) + an e2e file if cross-module setup is needed.
- Frontend page tests use `@testing-library/react` + mocked repositories (per `apps/web/CLAUDE.md`). Mock at the repository boundary, not at `executeRequest`.
- Zustand store test: assert `setActiveBrandId` updates state, `clear` resets it, and that the `persist` middleware writes the expected key to `localStorage`.

### Runtime contract overlay (NOT runtime-contract.flows)

- `.runtime-contract.overlay.json` — the builder MAY add visible-page tokens (Logical App Contract hints) for `/`, `/brands/new`, `/brands/<id>`. Do NOT add `overlay.flows` (retired) or `overlay.ignore[]` entries for new paths — both will be rejected by the contract compiler.

### Flow file (owned by lead — builder must NOT edit)

- `.overstory/runtime-contract.flows/sfx-webapp-boilerplate-b859.json` — lead authors via the `task-flow-authoring` skill. It will cover: anonymous → 401 on each new API path, admin happy path, admin cross-tenant → 404 (two-actor setup using `_shared.json` `admin` + `viewer` actors), POST chain capture for downstream :id routes, validation (empty name → 400, long name → 400), and the rename/delete state transitions. Builder responds to flow-file failures via the `flow-failure-response` skill — NEVER edits the JSON.

---

## 5. Implementation notes the builder must read before writing code

- Mirror the `apps/api/src/modules/health` module shape exactly for module/controller layout; mirror `apps/api/src/modules/auth/application/controllers/auth.controller.ts` for the Swagger decorator pattern (`@ApiTags`, `@UseGuards`, `@ApiBearerAuth('accessToken')`, `@ApiResponse({ type: ApiEnvelopeDto(<Dto>) })`).
- Mirror `apps/web/src/features/home/**` exactly for the frontend clean-architecture layout (`data/remote/`, `data/model/`, `data/mapper/`, `data/repositories/`, `presentation/pages/`, `presentation/components/`, `constants.ts`, `index.ts`).
- Mirror `apps/web/src/features/auth/presentation/components/AuthGate/**` for the Page UIModel + hook + mapper pattern (`use-<feature>.ts`, `map-to-<feature>-ui-model.ts`, `types.ts`).
- Mirror `apps/web/src/stores/app-store.ts` for the Zustand store skeleton. ADD `persist` middleware (the existing store does not use it — the F1 active-brand store does).
- ALL frontend strings come from `useTranslations('common')` — no inline JSX strings. Both `en/common.ts` and `ro/common.ts` MUST be updated; TypeScript enforces parity.
- ALL API calls go through `executeRequest()` — never raw `fetch`. Unwrap the envelope (`response.data.data`) in `data/remote/*` (mirror `fetch-health.ts`).
- `useCallback` every returned hook function. Never call `router.push()` inside a hook — return `navigationTarget` state and let the page act on it (per `apps/web/CLAUDE.md` Hook Return Audit rule).
- Theme tokens via Tailwind classes (`bg-card`, `text-foreground`, `border-border`) — no hex literals.
- React Query keys are nested arrays: `['brands']`, `['brands', id]`. `invalidateQueries({ queryKey: ['brands'] })` matches all entries (array prefix matching).
- The `BrandProfile` Prisma model MUST be added in the SAME commit that introduces the new migration (`pnpm db:migrate -- --name add_brand_profile`) — the panel-bridge auto-applies it. No manual `stack:reset` is needed for an additive migration.
- Before the close gate, run `pnpm probe:smoke` against the booted stack. If it reports `RESOURCE_CAPTURE_*`, invoke the `build-verifiable-features` skill. If it reports `CONTRACT_STATUS_UNREACHABLE_UNGENERATABLE` or a cookie/CSRF/401-on-protected failure, invoke the `nestjs-probe-coverage` skill. If a `FLOW_STEP_FAILED` references `sfx-webapp-boilerplate-b859:*`, invoke `flow-failure-response` (NEVER edit the JSON — mail the lead instead). The path-boundary hook will block any edit to `.overstory/runtime-contract.flows/` from the builder profile.
- `worker_done` evidence MUST include the JSON summary from `pnpm probe:smoke` as a `## runtime-evidence` block per the parent CLAUDE.md Runtime Verification section.

---

## 6. Files in F1 builder's scope

Builder may create or modify ONLY these paths. Anything else (especially `apps/api/src/modules/auth/**`, `apps/api/src/common/**`, `apps/web/src/features/auth/**`, the runtime-contract.flows folder) is OFF LIMITS and requires a mail to the lead.

- `packages/domain/src/entities/brand-profile.ts` (new) + `__tests__/`
- `packages/domain/src/repositories/brand-profile-repository.ts` (new) + `__tests__/` (interface tests are typically trivial; supply at minimum a type-only test or skip if zero runtime code)
- `packages/domain/src/index.ts` (modify — re-export)
- `packages/validation/src/schemas/brand-profile.schema.ts` (new) + `__tests__/`
- `packages/validation/src/index.ts` (modify — re-export)
- `packages/database/prisma/schema.prisma` (modify — add model)
- `packages/database/prisma/migrations/<timestamp>_add_brand_profile/migration.sql` (new — generated by `pnpm db:migrate`)
- `apps/api/src/modules/brand-profile/**` (new tree)
- `apps/api/src/app.module.ts` (modify — register module)
- `apps/web/src/features/brand-profile/**` (new tree)
- `apps/web/src/features/app-shell/**` (new tree)
- `apps/web/src/stores/active-brand-store.ts` (new) + `__tests__/`
- `apps/web/src/app/page.tsx` (modify — wire `<BrandsDashboardPage/>` inside `<AuthGate><AppShell>`)
- `apps/web/src/app/brands/new/page.tsx` (new — thin wrapper)
- `apps/web/src/app/brands/[id]/page.tsx` (new — thin wrapper)
- `apps/web/src/features/presentation/localization/languages/en/common.ts` (modify — add keys)
- `apps/web/src/features/presentation/localization/languages/ro/common.ts` (modify — add keys, identical key set)
- `apps/web/src/features/presentation/localization/types.ts` (modify — extend `CommonTranslations`)
- `.runtime-contract.overlay.json` (modify only to add page tokens if needed; NEVER add `flows` / `ignore` entries)
- `apps/web/src/features/home/**` (modify or remove if `/` is repurposed — document in PR; OR move health page to `/health` if keeping)
- `flows.config.json` (modify only if removing `BoilerplatePlaceholder` from `resourceGraph.ignoreModels`)

OFF LIMITS (cite this list in any mail to the lead):
- `apps/api/src/modules/auth/**`
- `apps/api/src/common/auth/**`
- `apps/api/src/common/guards/jwt-auth.guard.ts`
- `apps/api/src/common/decorators/auth-roles.decorator.ts`
- `apps/web/src/features/auth/**`
- `.overstory/runtime-contract.flows/**` (lead-owned, hook-blocked anyway)
- `.flows.generated.json`, `.matrix.json`, `.runtime-contract.logical.json` (hook-blocked)
- Anything outside the worktree.

---

## 7. Definition of done

- All endpoints in §2 implemented, tested (unit + integration), and behind `JwtAuthGuard`.
- All pages in §1 render for an authenticated user without console errors.
- Active-brand store persists across refresh (Zustand `persist`).
- Cross-tenant probe returns `404` (NOT `403`, NOT `200`) for every `/:id` route.
- `pnpm typecheck`, `pnpm lint`, `pnpm test:coverage` (>=90%), `pnpm test:integration`, `pnpm probe:smoke` all pass.
- `worker_done` mail to lead carries the probe JSON summary as a `## runtime-evidence` block.
- No diff in OFF-LIMITS paths above.
- F2 and F3 can begin work without dependency conflicts — `brand_profile.id` is stable, no UNIQUE on `name`, sibling tables can FK-cascade.
