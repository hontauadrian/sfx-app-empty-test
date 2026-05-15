<!-- written-by: scout-visual-identity -->
<!-- written-by: scout-visual-identity -->
# F3 visual-identity — feature spec

**Task:** `sfx-webapp-boilerplate-cfeb` (feature 3 of 3, parent plan `sfx-webapp-boilerplate-2cb0`).
**Sibling features:** F1 `brand-profile` (merged at master `3caa99c` via `sfx-webapp-boilerplate-b859`), F2 `brand-voice` (parallel sibling, separate task `sfx-webapp-boilerplate-6fba`).
**Scope of THIS spec:** F3 only — `VisualIdentity` domain entity, Prisma model + migration (FK to `brand_profile.id`, `ON DELETE CASCADE`), NestJS module + repository + controller with two endpoints (`GET` + `PUT` upsert), shared Zod schema for the 7 grouped fields, frontend `visual-identity` feature (data + presentation), `/brands/<id>/visual-identity/edit` page, and the visual-identity card on `/brands/<id>` that now renders real data (replacing the F1 placeholder).
**Out of scope:** brand-voice (F2 — parallel sibling). Asset uploads. Design-token system. Search, dos/don'ts, content checking, version history, agent retrieval API, AI integrations land in parts 2 and 3 of the master plan and are explicitly OUT OF SCOPE here.

**Auth (binding):** the existing Keycloak + oauth2-proxy + RS256/JWKS stack is the ONLY auth mechanism. The builder MUST NOT modify `apps/api/src/modules/auth/**`, `apps/api/src/common/auth/**`, `apps/api/src/common/guards/jwt-auth.guard.ts`, `apps/api/src/common/decorators/auth-roles.decorator.ts`, or `apps/web/src/features/auth/**`. The oauth2-proxy logged-in user is the "brand manager". Identity = `request.user.subject` from `JwtAuthGuard`. No `/login`, `/register`, email+password, or HS256 cookie auth.

**Dependency on F1:** F1 (`brand-profile`) is already merged on `master`. `BrandProfile.id` is the FK target for the new `visual_identity` table. The F1 `VisualIdentityCardPlaceholder` component is replaced by a real `VisualIdentityCard` rendered by the F3 feature; the brand-overview page hook + UIModel + index wire the new card.

**Dependency on F2:** none — F3 and F2 own disjoint API paths, disjoint tables, and disjoint UI cards. They can land in either order. The F3 builder MUST avoid touching the F2 paths (`/brands/<id>/voice/**`, `brand_voice` table, `apps/web/src/features/brand-voice/**`, `apps/api/src/modules/brand-voice/**`). If F2 lands first and the brand-overview page hook / UIModel / index already references both real cards, the F3 builder edits the same files additively — no rewrite of the F2-owned voice slot.

---

## 1. User-visible behaviour (what the probe will assert)

### Pages (URLs are exact)

| URL | Purpose | Empty-state / branch |
|---|---|---|
| `/brands/<id>` | Brand overview — visual-identity card now real | When `GET /api/v1/brands/<id>/visual-identity` returns an "empty" payload (every field `null` / every list `[]`), the card renders a compact empty state with section title + `[+ Edit visual identity]` CTA (mirrors today's placeholder). When the payload has any non-empty field, the card renders each populated field as a labelled read-only block, plus the `Edit visual identity` CTA. The card MUST remain visually separated from the brand-voice card per the operator constraint. |
| `/brands/<id>/visual-identity/edit` | Visual-identity edit form | Form with seven grouped sections (see §1 J4 below). Submit `PUT /api/v1/brands/<id>/visual-identity` → on `200` redirect to `/brands/<id>` and refresh the visual-identity card. Validation errors render per-field; the form does NOT submit while errors exist. Cancel → `/brands/<id>`. |

### J4 — editing visual identity (verbatim from product plan §1)

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
5. **Observed state:** persisted via `PUT /api/v1/brands/<brand-id>/visual-identity` → `200 OK`. User redirected to `/brands/<brand-id>`. The **Visual identity** section now reflects the submitted data.
6. **Exit:** visual identity data is visible read-only on the brand detail page until next edit.

J5 (delete cascade, master plan §1):
- Deleting a brand via the F1 brand-settings menu cascades the brand's `visual_identity` row by `ON DELETE CASCADE` on the FK. The F3 migration owns this cascade. The F3 builder does NOT modify any F1 controller / repository / migration to achieve this.

Cross-tenant access (J3/J4/J5 boundary applied to visual-identity):
- Authenticated user CANNOT read or write the visual identity of a brand they do not own. API returns `404 Not Found` (existence is NOT leaked). `403` is forbidden by this rule — the probe will assert `404`.
- The lookup MUST be ownership-scoped via `BrandProfile.ownerSubject === request.user.subject`. The F3 controller pre-checks ownership via the F1 `IBrandProfileRepository.findById(brandId, ownerSubject)` and `404`s on `null` BEFORE delegating to the F3 repository. Mirrors the F1 owner-scoped CRUD pattern already recorded in `mulch` (`mx-b562ca`), keeps F3's repository thin, avoids a Prisma join.

---

## 2. Runtime acceptance criteria

These are the behaviours the runtime probe will assert. Status codes / URLs do NOT live in the flow file directly — they are derived from Zod schemas + NestJS decorators + the contract overlay (see "Runtime flow coverage" in CLAUDE.md). The lead authors `sfx-webapp-boilerplate-cfeb.json` in `.overstory/runtime-contract.flows/` with these behaviours.

### API surface — every endpoint authenticated

For each of the two endpoints below, the probe will assert:
1. Happy path with a valid bearer (`admin` actor from `_shared.json`) → `2xx` + envelope `{ success: true, data: <T> }`.
2. Anonymous (no bearer) → `401`.
3. Cross-tenant (a brand owned by user A, accessed by user B — both authenticated) → `404` for both `GET` and `PUT`.
4. Unknown `brandId` (well-formed but not in DB) → `404` (same shape as cross-tenant; ownership scoping makes the two indistinguishable on purpose).

| Endpoint | Method | Path | Auth | Notes |
|---|---|---|---|---|
| Get visual identity of caller's brand | GET | `/api/v1/brands/:brandId/visual-identity` | yes | Returns `200` with the persisted `VisualIdentity` envelope OR — if no row yet — `200` with an "empty" payload (`logoUsageRules: null`, `colourPalette: []`, `typographyRules: []`, every other text field `null`, and `id` = `''`, `brandId` = the path param, `createdAt`/`updatedAt` = the parent brand's `updatedAt`). NEVER `404` for missing-but-creatable-state — `404` is reserved for "brand not found OR not owned". |
| Upsert visual identity for caller's brand | PUT | `/api/v1/brands/:brandId/visual-identity` | yes | Body = full visual-identity write payload (all 7 fields, with `null` allowed on every nullable text field and `[]` allowed on the two list fields). Creates the row on first save, updates it on subsequent saves. Returns `200` + the persisted resource envelope. `404` if brand not owned. `400` on Zod validation failure. |

The global `api/v1` prefix is set in `apps/api/src/main.ts`. F3 registers `@Controller('brands/:brandId/visual-identity')` so final paths are `/api/v1/brands/:brandId/visual-identity`.

### Validation (Zod schemas in `@sfx/validation/schemas/visual-identity.schema.ts`)

The schema MUST be authored in `packages/validation/src/schemas/visual-identity.schema.ts` and re-exported from `packages/validation/src/index.ts`. Every field carries `.openapi({ description, example })` so the flows generator sees the body shape (per CLAUDE.md "Runtime flow coverage").

**Top-level text fields (5):**

| Field | Type | Constraint | OpenAPI hint |
|---|---|---|---|
| `logoUsageRules` | `string \| null` (trimmed) | `null` allowed; if present, ≤ `VISUAL_IDENTITY_LONG_TEXT_MAX_LENGTH` (=`4000`) chars after trim. | `description: 'Free-form rules for logo placement, clear space, minimum size, mono vs colour, exclusions.'` |
| `spacingLayoutGuidance` | `string \| null` (trimmed) | same as `logoUsageRules`. | `description: 'Spacing rhythm, grid system, layout rules.'` |
| `imageStyleGuidance` | `string \| null` (trimmed) | same. | `description: 'Photography/illustration style guidance.'` |
| `iconographyGuidance` | `string \| null` (trimmed) | same. | `description: 'Icon style, stroke weight, corner radius, families.'` |
| `usageRestrictions` | `string \| null` (trimmed) | same. | `description: 'What MUST NOT be done with the visual identity.'` |

**List fields (2):**

| Field | Item shape | Constraints |
|---|---|---|
| `colourPalette` | `{ name: string; hex: string; usage?: string \| null }` | `name`: trimmed, 1..`VISUAL_IDENTITY_LIST_ITEM_TEXT_MAX_LENGTH`(=`120`). `hex`: MUST match `/^#(?:[0-9a-fA-F]{3}\|[0-9a-fA-F]{6})$/` (`#RGB` or `#RRGGBB`, case-insensitive) per the operator dispatch. `usage`: optional, `null` or trimmed ≤`VISUAL_IDENTITY_LONG_TEXT_MAX_LENGTH`. Outer array: 0..`VISUAL_IDENTITY_LIST_MAX_ITEMS` (=`50`). Duplicate `name` (case-insensitive after trim) within the list MUST be rejected by a `.superRefine` with a field-level error so the form can render per-row feedback. |
| `typographyRules` | `{ role: string; family: string; weight?: string \| null; size?: string \| null; notes?: string \| null }` | `role`: trimmed, 1..`VISUAL_IDENTITY_LIST_ITEM_TEXT_MAX_LENGTH`. `family`: trimmed, 1..`VISUAL_IDENTITY_LIST_ITEM_TEXT_MAX_LENGTH`. `weight`/`size`: optional, `null` or trimmed ≤`VISUAL_IDENTITY_LIST_ITEM_TEXT_MAX_LENGTH`. `notes`: optional, `null` or trimmed ≤`VISUAL_IDENTITY_LONG_TEXT_MAX_LENGTH`. Outer array: 0..`VISUAL_IDENTITY_LIST_MAX_ITEMS`. Duplicate `role` (case-insensitive after trim) MUST be rejected. |

**Constants** exported from the schema module:
- `VISUAL_IDENTITY_LONG_TEXT_MAX_LENGTH = 4000`
- `VISUAL_IDENTITY_LIST_ITEM_TEXT_MAX_LENGTH = 120`
- `VISUAL_IDENTITY_LIST_MAX_ITEMS = 50`
- `VISUAL_IDENTITY_HEX_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/`

**Schemas** to export:
- `visualIdentityWriteSchema` — body for `PUT`. Every nullable text field is `.nullable().optional()` so the API accepts both `null` (explicit clear) and missing (treat as `null` server-side). Both list fields default to `[]` when missing.
- `visualIdentitySchema` — response shape, mirrors the write schema PLUS `id: string`, `brandId: string`, `createdAt: string`, `updatedAt: string`. The empty-state shape is the same envelope with `id` = `''` (sentinel — keeps the response type tight) and `createdAt`/`updatedAt` set to the parent brand's `updatedAt` (well-typed ISO strings). The flows-generator sees the same shape regardless of whether the row exists; the frontend mapper distinguishes via `id === ''`.
- Inferred TypeScript types: `VisualIdentityWriteInput`, `VisualIdentityShape`, plus the two row-item types `VisualIdentityColourPaletteEntry`, `VisualIdentityTypographyRule`.

**Path-param schema:** reuse `idParamSchema` from `@sfx/validation/schemas/common.schema.ts` for `:brandId` (same `cuid`-style string F1 emits — no F3-specific schema).

### Database — additive-friendly, sibling table

New Prisma model `VisualIdentity` (`@@map("visual_identity")`). Columns:

```prisma
model VisualIdentity {
  id                    String   @id @default(cuid())
  brandId               String   @unique @map("brand_id")
  brand                 BrandProfile @relation(fields: [brandId], references: [id], onDelete: Cascade)
  logoUsageRules        String?  @map("logo_usage_rules")
  colourPalette         Json     @default("[]") @map("colour_palette")
  typographyRules       Json     @default("[]") @map("typography_rules")
  spacingLayoutGuidance String?  @map("spacing_layout_guidance")
  imageStyleGuidance    String?  @map("image_style_guidance")
  iconographyGuidance   String?  @map("iconography_guidance")
  usageRestrictions     String?  @map("usage_restrictions")
  createdAt             DateTime @default(now()) @map("created_at")
  updatedAt             DateTime @updatedAt @map("updated_at")

  @@map("visual_identity")
}
```

Notes:
- `brandId` is `@unique` so the row is 1:1 per brand. `findUnique({ where: { brandId } })` is the canonical lookup.
- `colourPalette` and `typographyRules` are `Json` columns; the server-side Zod schema (`visualIdentityWriteSchema`) is the only guarantee of their internal shape. Default `"[]"` so first-read on a freshly-created row is well-formed without a DB-side migration.
- All remaining user fields are nullable `String` (TEXT in Postgres). No length constraint at the DB layer — Zod enforces it at the API boundary.
- F1 `BrandProfile` model gains a back-reference `visualIdentity VisualIdentity?`. This is the SOLE F1 schema edit the F3 builder may make: add the reverse relation field only — no rename of existing columns, no new constraints, no removal of `@@index([ownerSubject])`.
- Migration name: `pnpm db:migrate -- --name add_visual_identity`. The per-worker `panel-bridge.mjs` auto-applies it within ~1.5s of the directory being created — no manual `stack:reset` needed (mulch `mx-325de6`: schema edits do NOT auto-create migrations; the builder MUST run `pnpm db:migrate -- --name add_visual_identity` themselves).

### Frontend behaviour

- `/brands/<id>` brand-overview hook now reads from BOTH the brand-by-id query (F1) AND a new visual-identity query (F3). Both queries run in parallel; the page renders when both settle (or shows the existing F1 skeleton while either is loading). The visual-identity card displays loading skeleton, empty-state CTA, populated read view, or error state — each driven by `uiModel.*` fields, never by branching on raw query state in JSX.
- Submitting the edit form invalidates the visual-identity query for the affected brand id AND the brands list query (the brand's `updatedAt` is touched by the upsert, which affects ordering on `/`).
- The active-brand selector is unchanged by F3 (no new keys in `active-brand-store`).

### Shell-level

- `/brands/<id>/visual-identity/edit` renders inside `<AuthGate><AppShell>` exactly like every other authenticated route (mirrors `/brands/new` and `/brands/<id>`).
- Left-nav `Visual identity` item (wired in F1 to anchor on `/brands/<id>`) is NOT changed by F3. The card's CTA — not the left nav — is the entry point to the edit form.

### Auth-boundary

- The diff does NOT modify `apps/api/src/modules/auth/**`, `apps/api/src/common/auth/**`, `apps/api/src/common/guards/jwt-auth.guard.ts`, `apps/api/src/common/decorators/auth-roles.decorator.ts`, or `apps/web/src/features/auth/**`. Reviewer / probe will check the diff.
- `GET /api/v1/auth/me` continues to return `{ subject, email, roles, isAuthenticated }` unchanged.
- Both visual-identity endpoints carry `@UseGuards(JwtAuthGuard)` and `@ApiBearerAuth('accessToken')`. Probe asserts `401` on missing bearer.
- No `OAUTH_*` environment variable is removed or renamed. Builder adds NO new env var (`DATABASE_URL` already covers the persistence layer).

---

## 3. Guard contract

| Surface | Auth | Unauth behaviour |
|---|---|---|
| Web `/brands/<id>/visual-identity/edit` | authenticated | `AuthGate` already redirects unauth users to oauth2-proxy login. F3 does NOT add a new redirect path. |
| API `GET /api/v1/brands/:brandId/visual-identity` | authenticated, owner-scoped | `401` unauth; `404` if brand not owned (NEVER `403`, NEVER leak existence). |
| API `PUT /api/v1/brands/:brandId/visual-identity` | authenticated, owner-scoped | `401` unauth; `400` on Zod failure; `404` if brand not owned. |

Ownership = `BrandProfile.ownerSubject === request.user.subject`. The controller MUST pre-check via the F1 `IBrandProfileRepository.findById(brandId, ownerSubject)` injected from the F1 module — `null` → `NotFoundException`. Cross-tenant tests in §2 assert `404`, not `403`.

---

## 4. Contract annotations the builder must maintain

The flows-generator reads NestJS Swagger decorators + Zod `.openapi()` annotations + the runtime-contract overlay. The builder MUST keep these annotations current — they are the contract.

### NestJS files to annotate (apps/api)

- `apps/api/src/modules/visual-identity/visual-identity.module.ts` — new module. Imports `AuthModule` (for `JwtAuthGuard`) AND `BrandProfileModule` (to access the F1 `IBrandProfileRepository` for ownership pre-check). Providers: `PRISMA_CLIENT` token (mirror the F1 `infrastructure/prisma-client.token.ts` pattern in a sibling file under `apps/api/src/modules/visual-identity/infrastructure/`), `VisualIdentityRepository` (provided under a new `VISUAL_IDENTITY_REPOSITORY` DI symbol re-exported from `@sfx/domain`). Constructor injection on the repository MUST use `@Inject(PRISMA_CLIENT)` per the SWC reflect-metadata constraint in CLAUDE.md (`build-verifiable-features` skill).
- Register the new module in `apps/api/src/app.module.ts`.
- `apps/api/src/modules/visual-identity/application/controllers/visual-identity.controller.ts` — `@Controller('brands/:brandId/visual-identity')` with both methods:
  - `@ApiTags('visual-identity')` on the class.
  - `@UseGuards(JwtAuthGuard)` on every method.
  - `@ApiBearerAuth('accessToken')` on every method.
  - `@ApiOperation({ summary: ... })`.
  - `@ApiParam({ name: 'brandId', type: String, example: 'cuid12345', description: 'Brand identifier' })` on every method.
  - `@ApiResponse({ status: 200, description: ..., type: ApiEnvelopeDto(VisualIdentityDto) })` on both GET and PUT.
  - `@ApiResponse({ status: 401, ... })` on both.
  - `@ApiResponse({ status: 404, ... })` on both.
  - `@ApiResponse({ status: 400, ... })` on PUT only.
  - `@ApiBody({ type: VisualIdentityWriteDto })` on PUT.
  - The PUT body MUST be validated via `@Body(new ZodValidationPipe(visualIdentityWriteSchema))` — mirror the F1 controller exactly. Per `mulch mx-4d4764`, when a handler accepts both `@Param` and `@Body`, the `ZodValidationPipe` MUST be applied via `@Body(...)` (not class-level `@UsePipes()`) so it runs only against the body and not the path-param shape.
  - No `@ResourceCaptures` is required — the F3 resource id is not chained anywhere in part 1. The relevant chain is `brandId` (created by F1 POST `/brands`), already declared on the F1 controller. F3 endpoints CONSUME the chain via `:brandId` path-param.
- `apps/api/src/modules/visual-identity/application/dto/visual-identity.dto.ts`, `visual-identity-write.dto.ts`, plus row-shape DTOs `visual-identity-colour-palette-entry.dto.ts` and `visual-identity-typography-rule.dto.ts` — every `@ApiProperty()` MUST declare `type:` explicitly (per `tsx + esbuild` reflect-metadata constraint in `build-verifiable-features`). List fields use `@ApiProperty({ type: () => [VisualIdentityColourPaletteEntryDto] })`. `null` allowed → `nullable: true`. Mirror the F1 DTO style (`declare <field>: <T>;`).
- `apps/api/src/modules/visual-identity/data/repositories/visual-identity.repository.ts` — implements `IVisualIdentityRepository` from `@sfx/domain`. Constructor injection MUST use `@Inject(<TOKEN>)` on EACH parameter — no positional `private readonly prisma: PrismaClient` shortcut. Methods:
  - `findByBrandId(brandId: string): Promise<VisualIdentity | null>` — pure DB lookup. No ownership check at the repo layer (controller pre-checks).
  - `upsertByBrandId(brandId: string, payload: VisualIdentityWritePayload): Promise<VisualIdentity>` — Prisma `upsert({ where: { brandId }, create: { brandId, ...payload }, update: { ...payload } })`.

### Zod schemas (packages/validation)

- `packages/validation/src/schemas/visual-identity.schema.ts`: schemas + constants + types per §2 Validation.
- `packages/validation/src/index.ts`: re-export every new symbol from the schema module.

### Domain (packages/domain)

- `packages/domain/src/entities/visual-identity.ts`: `VisualIdentity` (readonly interface mirroring the Prisma row, with `colourPalette: readonly VisualIdentityColourPaletteEntry[]`, `typographyRules: readonly VisualIdentityTypographyRule[]`, every nullable text field typed `string | null`, `id`, `brandId`, `createdAt: Date`, `updatedAt: Date`). Define `VisualIdentityColourPaletteEntry` and `VisualIdentityTypographyRule` interfaces and re-export.
- `packages/domain/src/contracts/visual-identity-repository.ts`: `IVisualIdentityRepository` interface, `VISUAL_IDENTITY_REPOSITORY` DI symbol, `VisualIdentityWritePayload` input shape (typed list-of-entries + nullable text fields — domain DOES NOT depend on Zod).
- `packages/domain/src/index.ts`: re-export entity + interfaces + symbol.

### Prisma (packages/database)

- `packages/database/prisma/schema.prisma`: add the `VisualIdentity` model defined in §2 AND add the reverse relation `visualIdentity VisualIdentity?` on `BrandProfile`.
- New migration directory `packages/database/prisma/migrations/<timestamp>_add_visual_identity/`.

### Frontend (apps/web)

- `apps/web/src/features/visual-identity/` — full clean-architecture layout mirroring `features/brand-profile/`:
  - `data/remote/fetch-visual-identity.ts` — `executeRequest()`, unwraps the envelope (mirror `features/brand-profile/data/remote/fetch-brand-by-id.ts`).
  - `data/remote/upsert-visual-identity.ts` — `executeRequest()` with `method: 'PUT'`, body = write payload.
  - `data/model/visual-identity-data-model.ts` — DTO interface mirroring the API response (everything is strings + arrays of plain objects; timestamps are ISO strings).
  - `data/mapper/map-to-visual-identity.ts` — coerces ISO timestamps to `Date`. Detects the empty-state envelope (`id === ''`) and returns `null` so the hook can branch via a single nullish check. Document this in the mapper test.
  - `data/repositories/use-visual-identity-repository.ts` — `useQuery`. Keyed under `visualIdentityQueryKey(brandId) = ['visualIdentity', brandId] as const`.
  - `data/repositories/use-upsert-visual-identity-mutation.ts` — `useMutation`. `onSettled` invalidates `['visualIdentity', brandId]` AND `['brands']` (the brand's `updatedAt` is bumped server-side, affecting list ordering on `/`). React Query `invalidateQueries` uses array prefix matching (see `apps/web/CLAUDE.md` gotcha). `onSettled` (not `onSuccess`) per `mulch mx-1d0874`.
  - `presentation/pages/edit-visual-identity/` — page hook + UI model + index for `/brands/<id>/visual-identity/edit`. Form uses React Hook Form + a Zod resolver derived from `visualIdentityWriteSchema`. Submit calls the mutation, redirects to `/brands/<id>` on success via a `navigationTarget` state field + `useEffect` that calls `router.push()` (NEVER call `router.push()` inside a returned handler per `apps/web/CLAUDE.md` Hook Return Audit).
  - `presentation/components/VisualIdentityCard/` — REAL card (replaces the F1 placeholder usage on the brand-overview page). Renders empty state OR populated read view, with the edit CTA wired to `/brands/<id>/visual-identity/edit`.
  - `presentation/components/ColourPaletteListEditor/`, `TypographyRulesListEditor/` — list-of-rows editors with add/remove. Mirror the F1 `RenameBrandModal`/`DeleteBrandConfirmModal` folder shape (own `__tests__/`, own `types.ts`). Built on React Hook Form's `useFieldArray`.
  - `presentation/components/VisualIdentityReadView/` — read-only view used by `VisualIdentityCard` when the row is populated.
  - `presentation/validators/visual-identity-form.ts` — Zod-derived RHF resolver re-exported from `@sfx/validation`.
  - `constants.ts`:
    - `VISUAL_IDENTITY_ENDPOINT(brandId)` → returns the path `api/v1/brands/<brandId>/visual-identity`.
    - `visualIdentityQueryKey(brandId)` → returns `['visualIdentity', brandId] as const`.
    - `visualIdentityEditRoute(brandId)` → returns `/brands/<brandId>/visual-identity/edit`.
    - Plus the `VISUAL_IDENTITY_*` numeric constants re-exported from `@sfx/validation` for form-side enforcement.
  - `index.ts` — barrel.
- `apps/web/src/features/brand-profile/presentation/pages/brand-overview/index.tsx` — replace the `VisualIdentityCardPlaceholder` import + usage with `VisualIdentityCard` from `@/features/visual-identity`. F3 builder edits ONLY the two lines that import + render that placeholder; everything else on the page (brand header, rename/delete modals, brand-voice slot) is left untouched.
- `apps/web/src/features/brand-profile/presentation/pages/brand-overview/use-brand-overview.ts` AND `.../map-to-brand-overview-page-ui-model.ts` — extend to query the visual-identity hook and surface its loading/error/empty state on the UIModel as new fields (`visualIdentityIsLoading`, `visualIdentityHasError`, `visualIdentityErrorLabel`, `visualIdentityIsEmpty`, `visualIdentityFields`). Existing F1 UIModel keys (e.g. `visualIdentityTitle`, `visualIdentityCtaLabel`, `visualIdentityCtaHref`) STAY — `VisualIdentityCard` consumes them for the empty state and the populated header.
- `apps/web/src/features/brand-profile/presentation/components/VisualIdentityCardPlaceholder/**` — DELETE. It is replaced by the real `VisualIdentityCard` in the new `features/visual-identity` tree. If F2 has merged first and depends on this folder, leave it alone and audit imports.
- `apps/web/src/app/brands/[id]/visual-identity/edit/page.tsx` — thin wrapper: `<AuthGate><AppShell><EditVisualIdentityPage brandId={params.id}/></AppShell></AuthGate>`.
- `apps/web/src/features/presentation/localization/languages/en/common.ts` AND `.../ro/common.ts` — add keys (English + Romanian for parity; TypeScript enforces parity via `CommonTranslations` in `apps/web/src/features/presentation/localization/types.ts`). At minimum:
  - `visualIdentityTitle` (already in F1 — verify; reuse if present)
  - `visualIdentityEmptyStateBody`, `visualIdentityEditCta`, `visualIdentityReadCta`
  - Per-field labels: `visualIdentityLogoUsageRulesLabel`, `visualIdentitySpacingLayoutGuidanceLabel`, `visualIdentityImageStyleGuidanceLabel`, `visualIdentityIconographyGuidanceLabel`, `visualIdentityUsageRestrictionsLabel`, `visualIdentityColourPaletteLabel`, `visualIdentityTypographyRulesLabel`
  - Per-field placeholders for the edit form
  - Colour-palette row labels: `colourPaletteNameLabel`, `colourPaletteHexLabel`, `colourPaletteUsageLabel`, `colourPaletteAddRowCta`, `colourPaletteRemoveRowCta`
  - Typography-row labels: `typographyRoleLabel`, `typographyFamilyLabel`, `typographyWeightLabel`, `typographySizeLabel`, `typographyNotesLabel`, `typographyAddRowCta`, `typographyRemoveRowCta`
  - Validation messages: `visualIdentityHexInvalidError`, `visualIdentityListItemRequiredError`, `visualIdentityListItemTooLongError`, `visualIdentityTextTooLongError`, `visualIdentityColourPaletteDuplicateNameError`, `visualIdentityTypographyDuplicateRoleError`
  - Form-level: `visualIdentitySubmitLabel`, `visualIdentityCancelLabel`, `visualIdentitySaveError`
  - The diff MUST update `apps/web/src/features/presentation/localization/types.ts`'s `CommonTranslations` type so both language files compile.

### Tests

- Every new source file MUST have a co-located test file under `__tests__/` OR a sibling `.test.ts(x)`. ≥90% coverage. Hook will block the close gate otherwise.
- Backend integration test (`apps/api/src/modules/visual-identity/__integration__/visual-identity.integration-test.ts`) using `supertest` + `Test.createTestingModule` covering: anonymous → `401` on GET + PUT; admin happy path GET on a brand with no row → empty-state envelope; admin upsert (PUT first call) → `200` + envelope; admin GET after upsert → returns the persisted row; admin upsert again with different values → `200` and second GET reflects the update; admin PUT with invalid hex → `400`; admin PUT with duplicate colour-palette `name` → `400`; admin PUT with duplicate typography `role` → `400`; admin GET / PUT on a brand owned by another user → `404`; cascade — delete the parent brand and then GET → `404`.
- Repository unit test mocks `PrismaClient` and asserts the `upsert` `where`/`create`/`update` arguments shape match the write payload.
- Frontend page tests use `@testing-library/react` + mocked repositories (per `apps/web/CLAUDE.md`). Mock at the repository boundary, not at `executeRequest`. Cover: form submits with valid payload → calls the mutation with the expected body and redirects on success; submits with invalid hex → renders a per-field error and DOES NOT call the mutation; cancel button navigates to `/brands/<id>` without calling the mutation.
- `VisualIdentityCard` test renders empty state when the mapper returns `null` and renders the populated read view when given a fully-populated entity.
- `mapper` test exercises ISO → `Date` coercion AND the empty-state detection branch.

### Runtime contract overlay (NOT runtime-contract.flows)

- `.runtime-contract.overlay.json` — the builder MAY add visible-page tokens (Logical App Contract hints) for `/brands/<id>/visual-identity/edit`. Do NOT add `overlay.flows` (retired) or `overlay.ignore[]` entries for new paths — both will be rejected by the contract compiler / hook.

### Flow file (owned by lead — builder must NOT edit)

- `.overstory/runtime-contract.flows/sfx-webapp-boilerplate-cfeb.json` — lead authors via the `task-flow-authoring` skill. It MUST cover:
  - anonymous → `401` on `GET /brands/:brandId/visual-identity` and `PUT /brands/:brandId/visual-identity`
  - admin happy path: create brand (chain via the F1 `brandProfile` resource declared in the F1 task flow file) → GET visual-identity → expect `200` + empty-state envelope (envelope keys present, `id == ''`, `colourPalette: []`, `typographyRules: []`)
  - admin upsert (PUT) with all 7 fields populated → expect `200` + envelope with the persisted shape (every field round-tripped)
  - admin GET after upsert → expect `200` + the persisted shape
  - admin upsert PARTIAL update (e.g. PUT with only `logoUsageRules` set, others `null`/`[]`) — verifies "explicit null clears the field"
  - admin validation: PUT with invalid hex (`#ZZZ`) → `400`; PUT with `colourPalette` item missing `name` → `400`; PUT with duplicate `role` in `typographyRules` → `400` (covers the `.superRefine` branch)
  - cross-tenant: admin creates a brand; viewer GETs → `404`; viewer PUTs → `404` (mirrors the F1 cross-tenant flow set)
  - lifecycle / cascade: admin creates brand → upserts visual-identity → DELETEs the brand → subsequent GET on `/api/v1/brands/:brandId/visual-identity` returns `404` (proves the FK cascade fires)
- Builder responds to flow-file failures via the `flow-failure-response` skill — NEVER edits the JSON. The `flows-path-boundary` hook will block any edit attempt from a builder profile and emit `FLOW_OWNERSHIP_VIOLATION`.

---

## 5. Implementation notes the builder must read before writing code

- Mirror the F1 `apps/api/src/modules/brand-profile/**` tree exactly for the module/controller layout, the `infrastructure/prisma-client.token.ts` pattern, and the Swagger decorator style. Re-use the F1 `ApiEnvelopeDto` from `apps/api/src/common/dto/envelope.dto.ts` and `ZodValidationPipe` from `apps/api/src/common/pipes/zod-validation.pipe.ts`.
- The controller MUST inject the F1 `IBrandProfileRepository` (DI symbol `BRAND_PROFILE_REPOSITORY` exported from `@sfx/domain`) to check ownership before delegating. Import `BrandProfileModule` in `VisualIdentityModule` so DI is satisfied. Do NOT duplicate the F1 repo logic.
- Mirror `apps/web/src/features/brand-profile/**` exactly for the frontend clean-architecture layout (`data/remote/`, `data/model/`, `data/mapper/`, `data/repositories/`, `presentation/pages/`, `presentation/components/`, `constants.ts`, `index.ts`).
- React Hook Form + `useFieldArray` for the two list-shaped fields (`colourPalette`, `typographyRules`). Each row component lives in its own folder and receives its `index` + `remove` callback from the parent.
- ALL frontend strings come from `useTranslations('common')` — no inline JSX strings. Both `en/common.ts` and `ro/common.ts` MUST be updated; TypeScript enforces parity via `CommonTranslations`.
- ALL API calls go through `executeRequest()` — never raw `fetch`. Unwrap the envelope (`response.data.data`) in `data/remote/*` (mirror `fetch-brand-by-id.ts`).
- `useCallback` every returned hook function. Never call `router.push()` inside a hook return — use a `navigationTarget` state field + `useEffect` (per `apps/web/CLAUDE.md` Hook Return Audit rule).
- Theme tokens via Tailwind classes (`bg-card`, `text-foreground`, `border-border`) — no hex literals in page chrome. The colour-palette swatch background uses an inline style (`style={{ backgroundColor: entry.hex }}`) because the value is user-provided runtime data — this is the only permitted inline-style usage in F3.
- React Query keys are nested arrays: `['visualIdentity', brandId]`. `invalidateQueries({ queryKey: ['visualIdentity', brandId] })` matches exact + descendants by array-prefix (per `apps/web/CLAUDE.md` gotcha). Cross-feature invalidation after the mutation: `['brands']` (the brand-list `updatedAt` ordering changes) AND `['brands', brandId]` (the brand-by-id row).
- React Query `useMutation`'s `onSettled` is the right hook for cross-key invalidation per the `mulch mx-1d0874` failure record (NEVER `onSuccess`-only — `onSettled` runs in both success and error paths so a failed PUT still refreshes the stale view).
- The `VisualIdentity` Prisma model + reverse-relation edit on `BrandProfile` MUST be in the SAME commit as the new migration directory (`pnpm db:migrate -- --name add_visual_identity`) — the panel-bridge auto-applies it. No manual `stack:reset` is needed for an additive migration with FK + default JSON.
- Before the close gate, run `pnpm probe:smoke` against the booted stack. If it reports `RESOURCE_CAPTURE_*`, invoke `build-verifiable-features`. If it reports `CONTRACT_STATUS_UNREACHABLE_UNGENERATABLE` or a cookie/CSRF/401-on-protected failure, invoke `nestjs-probe-coverage`. If a `FLOW_STEP_FAILED` references `sfx-webapp-boilerplate-cfeb:*`, invoke `flow-failure-response` (NEVER edit the JSON — mail the lead). The `flows-path-boundary` hook will block any edit to `.overstory/runtime-contract.flows/` from the builder profile.
- `worker_done` evidence MUST include the JSON summary from `pnpm probe:smoke` as a `## runtime-evidence` block per the parent CLAUDE.md Runtime Verification section.
- Recorded conventions / failures already validated upstream — read before touching:
  - `mulch mx-b562ca` (owner-scoped CRUD via repo null-return) — F3 uses the same pattern by delegating to F1's repo for the ownership check.
  - `mulch mx-4d4764` (`ZodValidationPipe` at `@Body(...)` not class-level) — F3 PUT must follow this.
  - `mulch mx-325de6` (Prisma schema edits do not auto-create migrations) — the builder MUST run `pnpm db:migrate -- --name add_visual_identity` after editing `schema.prisma`.
  - `mulch mx-1d0874` (React Query `onSettled` + array-prefix invalidation) — F3 mutation must invalidate in `onSettled`, NOT `onSuccess`.
  - `mulch mx-cd88c5` / `mx-e2ad2d` (probe contract-coverage tuple mismatch on curated-only flows for endpoints without path-params) — F3 endpoints DO have a `:brandId` path-param, so this failure mode does NOT apply directly. If the lead sees `CONTRACT_STATUS_UNREACHABLE` on `GET .../visual-identity:200`, that is the SAME class of bug — escalate to lead via `flow_mismatch` mail.

---

## 6. Files in F3 builder's scope

Builder may create or modify ONLY these paths. Anything else (especially `apps/api/src/modules/auth/**`, `apps/api/src/common/**` except the existing shared `ApiEnvelopeDto` + `ZodValidationPipe` imports, `apps/web/src/features/auth/**`, `apps/web/src/features/brand-voice/**` (F2 territory), `apps/api/src/modules/brand-voice/**` (F2 territory), the runtime-contract.flows folder) is OFF LIMITS and requires a mail to the lead.

- `packages/domain/src/entities/visual-identity.ts` (new) + `__tests__/`
- `packages/domain/src/contracts/visual-identity-repository.ts` (new) + `__tests__/` (type-only tests acceptable; mirror F1)
- `packages/domain/src/index.ts` (modify — re-export entity + interface + DI symbol)
- `packages/validation/src/schemas/visual-identity.schema.ts` (new) + `__tests__/`
- `packages/validation/src/index.ts` (modify — re-export schemas + constants + types)
- `packages/database/prisma/schema.prisma` (modify — add `VisualIdentity` model + reverse relation on `BrandProfile`; NO column rename, NO new constraint on existing `BrandProfile` columns)
- `packages/database/prisma/migrations/<timestamp>_add_visual_identity/migration.sql` (new — generated by `pnpm db:migrate`)
- `apps/api/src/modules/visual-identity/**` (new tree)
- `apps/api/src/app.module.ts` (modify — register `VisualIdentityModule`)
- `apps/web/src/features/visual-identity/**` (new tree)
- `apps/web/src/features/brand-profile/presentation/pages/brand-overview/index.tsx` (modify — swap `VisualIdentityCardPlaceholder` for the real `VisualIdentityCard`)
- `apps/web/src/features/brand-profile/presentation/pages/brand-overview/use-brand-overview.ts` (modify — add visual-identity query)
- `apps/web/src/features/brand-profile/presentation/pages/brand-overview/map-to-brand-overview-page-ui-model.ts` (modify — surface visual-identity loading / error / empty / fields on the UIModel)
- `apps/web/src/features/brand-profile/presentation/pages/brand-overview/__tests__/**` (modify — extend existing tests; do NOT delete unrelated assertions)
- `apps/web/src/features/brand-profile/presentation/components/VisualIdentityCardPlaceholder/**` (delete — replaced by `VisualIdentityCard` in the new `features/visual-identity` tree; if F2 has merged first and depends on this folder, leave it alone and audit imports)
- `apps/web/src/app/brands/[id]/visual-identity/edit/page.tsx` (new — thin wrapper)
- `apps/web/src/features/presentation/localization/languages/en/common.ts` (modify — add keys)
- `apps/web/src/features/presentation/localization/languages/ro/common.ts` (modify — add keys, identical key set)
- `apps/web/src/features/presentation/localization/types.ts` (modify — extend `CommonTranslations`)
- `.runtime-contract.overlay.json` (modify only to add page tokens if needed; NEVER add `flows` / `ignore` entries)

OFF LIMITS (cite this list in any mail to the lead):
- `apps/api/src/modules/auth/**`
- `apps/api/src/common/auth/**`
- `apps/api/src/common/guards/jwt-auth.guard.ts`
- `apps/api/src/common/decorators/auth-roles.decorator.ts`
- `apps/api/src/modules/brand-profile/**` (F1 territory; only the F1 `IBrandProfileRepository` is consumed via DI — no file edits)
- `apps/api/src/modules/brand-voice/**` (F2 territory)
- `apps/web/src/features/auth/**`
- `apps/web/src/features/brand-voice/**` (F2 territory)
- `apps/web/src/features/brand-profile/presentation/components/BrandVoiceCardPlaceholder/**` (F2 territory if F2 still owns its own placeholder swap)
- `apps/web/src/stores/active-brand-store.ts` (no F3 changes — F3 reads `activeBrandId` only via the existing selector hook from the F1 layout if needed)
- `.overstory/runtime-contract.flows/**` (lead-owned, hook-blocked anyway)
- `.flows.generated.json`, `.matrix.json`, `.runtime-contract.logical.json` (hook-blocked)
- Anything outside the worktree.

---

## 7. Definition of done

- Both endpoints in §2 implemented, tested (unit + integration), and behind `JwtAuthGuard`.
- `/brands/<id>/visual-identity/edit` renders for an authenticated user with no console errors.
- `/brands/<id>` shows the real `VisualIdentityCard` (no F1 placeholder) — empty state on a brand with no row, populated read view otherwise.
- Cross-tenant probe returns `404` (NOT `403`, NOT `200`) for both GET and PUT.
- Delete-brand cascade verified by integration test: `DELETE /api/v1/brands/:id` followed by `GET /api/v1/brands/:id/visual-identity` returns `404`.
- `pnpm typecheck`, `pnpm lint`, `pnpm test:coverage` (≥90%), `pnpm test:integration`, `pnpm probe:smoke` all pass.
- `worker_done` mail to lead carries the probe JSON summary as a `## runtime-evidence` block.
- No diff in OFF-LIMITS paths above.
- F2 (`brand-voice`) is unaffected by F3's diff — if F2 has already merged, the brand-overview page renders both real cards; if F2 has not merged, F3's diff leaves the `BrandVoiceCardPlaceholder` import untouched so F2 can swap it independently.
