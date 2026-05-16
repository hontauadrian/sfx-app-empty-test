<!-- written-by: scout-dos-and-donts -->
# F1 dos-and-donts — feature spec

**Task:** `sfx-webapp-boilerplate-34c3` (feature 1 of 2, parent plan `sfx-webapp-boilerplate-bc83` — brand-guidelines part 2/3).
**Sibling feature:** F2 `content-check` screen consumes F1's `GET /api/v1/brands/:brandId/dos-and-donts?category=<enum?>` — it is the read-only downstream. F2 builds AFTER F1 merges.
**Part-1 predecessors (merged to master):** F1-part1 brand-profile (`sfx-webapp-boilerplate-b859`), F2-part1 brand-voice (`sfx-webapp-boilerplate-6fba`), F3-part1 visual-identity (`sfx-webapp-boilerplate-cfeb`). All three CRUD modules are stable; F1 dos-and-donts is the FOURTH brand-scoped resource and is many-per-brand — closest in shape to F1-part1 brand-profile CRUD (list + create + read + update + delete).
**Scope of THIS spec:** F1 only — `DosAndDontEntry` domain entity, Prisma model + additive migration (FK to `brand_profile.id`, `ON DELETE CASCADE`), NestJS `dos-and-donts` module with FIVE endpoints under `/api/v1/brands/:brandId/dos-and-donts`, shared Zod schema + enum constants, frontend `dos-and-donts` feature (data + presentation), new pages `/brands/<id>/dos-and-donts/new` + `/brands/<id>/dos-and-donts/<entry-id>/edit`, real `DosAndDontsCard` mounted on `/brands/<id>` below the existing visual-identity card.
**Out of scope:** F2 content-check screen. Cross-category search / full-text (part 3). Version history (part 3). AI / scoring / content-rule matching (part 3). Agent retrieval API (part 3). Modifying F1-part1 / F2-part1 / F3-part1 endpoints or DB columns. The ONLY F1-part1 schema edit permitted is appending the reverse-relation field `dosAndDonts DosAndDontEntry[]` to `BrandProfile`.

**Auth (binding, verbatim from operator dispatch):** Keycloak + oauth2-proxy + RS256/JWKS is the ONLY auth mechanism. Builder MUST NOT modify `apps/api/src/modules/auth/**`, `apps/api/src/common/auth/**`, `apps/api/src/common/guards/jwt-auth.guard.ts`, `apps/api/src/common/decorators/auth-roles.decorator.ts`, or `apps/web/src/features/auth/**`. The oauth2-proxy logged-in user is the "brand manager". Identity = `request.user.subject` from `JwtAuthGuard`. No `/login`, `/register`, email+password, or HS256 cookie auth. No `OAUTH_*` environment variable removed, renamed, or added.

**Dependency on F1-part1 brand-profile:** `BrandProfile.id` is the FK target. The dos-and-donts controller MUST pre-check ownership via the F1-part1 `IBrandProfileRepository.findById(brandId, ownerSubject)` (DI symbol `BRAND_PROFILE_REPOSITORY` from `@sfx/domain`, already exported by `BrandProfileModule` per `apps/api/src/modules/brand-profile/brand-profile.module.ts` L23) — `null` → `NotFoundException`. Same pattern as F2-part1 / F3-part1 (mulch `mx-b562ca` foundational convention). Builder imports `BrandProfileModule` into `DosAndDontsModule.imports`; no F1-part1 module edit is needed.

**Dependency on F2 content-check:** none. F1 publishes the stable list envelope; F2 consumes post-merge.

---

## 1. User-visible behaviour (what the probe will assert)

### Pages (URLs are exact)

| URL | Purpose | Empty-state / branch |
|---|---|---|
| `/brands/<id>` | Brand overview gets a new **Dos & Don'ts** card mounted below the existing two-column brand-voice + visual-identity grid (third row, full width on `lg:`). Same `space-y-6 p-8` padding. | When `GET .../dos-and-donts` returns `data: []`: empty state with section title `Dos & Don'ts`, one-line copy ("Capture your brand's do's and don'ts so writers stay on-message."), `[+ Add do/don't]` CTA → `/brands/<id>/dos-and-donts/new`. When `data.length >= 1`: entries grouped first by **category** (Tone, Vocabulary, Visuals, Legal, Campaign messaging), then within each category split into **Do** and **Don't** sub-groups. Each row: `title` heading + `body` 2-line truncated preview (`line-clamp-2`) + per-row `Edit` / `Delete`. Card header carries the same `[+ Add do/don't]` CTA. Card shell: `rounded-lg border border-border bg-card p-6`. |
| `/brands/<id>/dos-and-donts/new` | New do/don't form (J1) | FIVE fields: `type` (Do/Don't pill toggle), `category` (single-select), `title` (input), `body` (textarea), `suggestedCorrection` (optional textarea). Submit `POST .../dos-and-donts` → on 201 navigate to `/brands/<id>`. Validation errors render per-field; submit disabled while invalid. Cancel → `/brands/<id>`. |
| `/brands/<id>/dos-and-donts/<entry-id>/edit` | Edit entry form (J2) | Same five-field form pre-populated. Submit `PUT .../dos-and-donts/<entry-id>` → on 200 navigate to `/brands/<id>` (card reflects any category / type group move). Cancel → `/brands/<id>`. 404 from the by-id read → top-level "Entry not found" with link back to `/brands/<id>`. |

The brand-overview page IS the index. There is intentionally NO `/brands/<id>/dos-and-donts` list route per `bc83.md` §2.

### J1 — Add (verbatim from bc83.md §1)

1. Brand manager on `/brands/<brand-id>` (owns the brand). Dos & Don'ts card visible.
2. Zero entries → empty state with `[+ Add do/don't]`. Greater-than-or-equal-to-one entry → grouped list + same CTA in card header.
3. Click `[+ Add do/don't]` → `/brands/<brand-id>/dos-and-donts/new`.
4. Form with FIVE fields (four required + suggestedCorrection optional). Submit disabled until valid.
5. Fill required fields, optionally fill suggestedCorrection, submit.
6. `POST /api/v1/brands/<brand-id>/dos-and-donts` → 201 + persisted envelope. Redirect to `/brands/<brand-id>`. Card shows new entry in its category + type group.

### J2 — Edit (verbatim from bc83.md §1)

1. On `/brands/<brand-id>` with at least one entry.
2. Click `Edit` on a row → `/brands/<brand-id>/dos-and-donts/<entry-id>/edit`. Form pre-populated.
3. Modify, submit.
4. `PUT /api/v1/brands/<brand-id>/dos-and-donts/<entry-id>` → 200 + envelope. Redirect to `/brands/<brand-id>`. Entry may move group if `category` or `type` changed.

### J3 — Delete (verbatim from bc83.md §1)

1. On `/brands/<brand-id>` with at least one entry.
2. Click `Delete` → inline confirm dialog (`DeleteDosAndDontConfirmModal`, mirrors F1-part1 `DeleteBrandConfirmModal`). Cancel → no request.
3. Confirm → `DELETE /api/v1/brands/<brand-id>/dos-and-donts/<entry-id>` → 200 + envelope `data: null`. Card refetches. Per `mx-1d0874`, `onSettled` invalidates `dosAndDontsListQueryKey(brandId)` AND `['brands']`.

### J5 — Brand-delete cascade (verbatim from bc83.md §1)

1. On `/brands/<brand-id>` with at least one entry.
2. Delete the brand via the F1-part1 brand-settings menu.
3. All `dos_and_dont_entries` rows cascaded via `ON DELETE CASCADE`. Subsequent `GET /api/v1/brands/<brand-id>/dos-and-donts` → 404 (brand not found / not owned, NOT 200-with-empty-array).

### J6 — Cross-tenant (verbatim from bc83.md §1)

1. Brand A owned by `admin`, has at least one entry.
2. `viewer` (different authenticated identity, owns no brand) attempts LIST / READ / CREATE / UPDATE / DELETE on brand A's dos/don'ts.
3. Every method × path returns 404 (NEVER 403, NEVER leak existence). Same scoping rule as F2-part1 / F3-part1.

### Cross-cutting (mirrors bc83.md §5)

- Brands list query (`/api/v1/brands` — order `updatedAt DESC`) is invalidated by every successful dos/don'ts mutation. Builder MUST bump `BrandProfile.updatedAt` inside each create/update/delete repository call — recommended `prisma.$transaction([entryOp, prisma.brandProfile.update({ where: { id: brandId }, data: {} })])` per mutation. Empty `data: {}` triggers `@updatedAt`. Repository owns this; controller never touches Prisma directly (ADR-004).
- Existing F1-part1 / F2-part1 / F3-part1 endpoint shapes unchanged. Probe matrices `b859.json`, `6fba.json`, `cfeb.json` MUST remain green post-merge.

---

## 2. Runtime acceptance criteria

Status codes / URLs do NOT live in the flow file directly — derived from Zod schemas + NestJS decorators + contract overlay. Lead authors `.overstory/runtime-contract.flows/sfx-webapp-boilerplate-34c3.json` with these behaviours.

### API surface — every endpoint authenticated

For each of the five endpoints the probe will assert:
1. Happy path with valid bearer (`admin` actor from `_shared.json`) → 2xx + envelope `{ success: true, data: <T> }`.
2. Anonymous (no bearer) → 401.
3. Cross-tenant (brand owned by user A, accessed by user B, both authenticated) → 404 for every method.
4. Unknown `brandId` (well-formed cuid absent from DB) → 404 (ownership scoping makes "not found" and "cross-tenant" indistinguishable on purpose).
5. Unknown `entryId` on a brand the caller DOES own → 404 for GET-one / PUT / DELETE.
6. Validation failures on POST + PUT bodies → 400. Unknown `?category` enum on LIST → 400.

| # | Endpoint | Method | Path | Happy | Notes |
|---|---|---|---|---|---|
| 1 | List entries (optional category filter) | GET | `/api/v1/brands/:brandId/dos-and-donts?category=<enum?>` | 200 | `{ success: true, data: DosAndDontEntry[] }`. Order: `category ASC, type ASC, createdAt DESC`. Empty array (`data: []`) is the well-formed empty state — NEVER 404. `?category=` filters server-side; missing/empty → no filter. Unknown enum → 400. |
| 2 | Create | POST | `/api/v1/brands/:brandId/dos-and-donts` | 201 | Body = `dosAndDontWriteSchema`. Server-set `id` (cuid) + `brandId` (path). 400 on Zod, 404 if brand not owned. MUST carry `@ResourceCaptures({ fromPath: 'id', resource: 'dosAndDontEntry', pathParam: 'entryId' }, { fromPath: 'brandId', resource: 'brandProfile', pathParam: 'brandId' })` per CLAUDE.md probe-friendly rule 3. Operator-dispatch shorthand `('dosAndDontEntry', { id: 'data.id', brandId: 'data.brandId' })` binds to this array-of-`ResourceCapture` form per the actual decorator signature in `apps/api/src/common/decorators/resource-captures.decorator.ts` L31. |
| 3 | Get one | GET | `/api/v1/brands/:brandId/dos-and-donts/:entryId` | 200 | 404 if brand not owned OR entry not on this brand OR entry unknown. |
| 4 | Update (full replace) | PUT | `/api/v1/brands/:brandId/dos-and-donts/:entryId` | 200 | Body = `dosAndDontWriteSchema`. 400 / 404 as above. |
| 5 | Delete | DELETE | `/api/v1/brands/:brandId/dos-and-donts/:entryId` | 200 | Envelope `data: null` (controller returns `void`; `TransformInterceptor` wraps; `@HttpCode(200)` per F1-part1 `BrandProfileController.remove` L161). 404 as above. |

Global `api/v1` prefix in `apps/api/src/main.ts`. F1 dos-and-donts registers `@Controller('brands/:brandId/dos-and-donts')`.

### Validation (Zod — `@sfx/validation/schemas/dos-and-donts.schema.ts`)

Schemas + constants + types in `packages/validation/src/schemas/dos-and-donts.schema.ts`, re-exported from `packages/validation/src/index.ts`. Every field carries `.openapi({ description, example })`.

**Constants exported:**

```
DOS_AND_DONT_TYPE_VALUES        = ['do', 'dont'] as const
DOS_AND_DONT_CATEGORY_VALUES    = ['tone', 'vocabulary', 'visuals', 'legal', 'campaign-messaging'] as const
DOS_AND_DONT_TITLE_MAX_LENGTH   = 200
DOS_AND_DONT_BODY_MAX_LENGTH    = 4000
```

`type` storage value is `'dont'` (kebab-safe, per operator dispatch verbatim: "Constant: DOS_AND_DONT_TYPE_VALUES = ['do', 'dont'] as const (kebab-safe; localise the apostrophe in UI labels only)"). The web feature MUST map `'dont'` → `Don't` via `useTranslations('common').dosAndDontTypeDontLabel`. NEVER persist the apostrophe form.

`category` uses kebab-case for `'campaign-messaging'` (NOT `'campaignMessaging'`) per the operator spec verbatim.

**Field constraints (verbatim from bc83.md "Validation field constraints"):**

| Field | Type | Rule |
|---|---|---|
| `type` | `z.enum(DOS_AND_DONT_TYPE_VALUES)` | Required. Unknown → 400. |
| `category` | `z.enum(DOS_AND_DONT_CATEGORY_VALUES)` | Required. Unknown → 400. |
| `title` | `z.string().trim().min(1).max(DOS_AND_DONT_TITLE_MAX_LENGTH)` | Required, trimmed, 1..200. Empty / whitespace-only after trim → 400. |
| `body` | `z.string().trim().min(1).max(DOS_AND_DONT_BODY_MAX_LENGTH)` | Required, trimmed, 1..4000. |
| `suggestedCorrection` | `z.string().trim().max(DOS_AND_DONT_BODY_MAX_LENGTH).transform(empty→null).nullable().optional()` | Optional. `null` OR trimmed string less-than-or-equal-to 4000. Empty after trim normalises to `null` (mirror F2-part1 `toneOfVoice` transform — same `mx-4d4764` ordering rule). |

**Schemas to export:**
- `dosAndDontWriteSchema` — body for POST + PUT. `suggestedCorrection` is `.nullable().optional()` so the API accepts both `null` and missing key. Top-level `.openapi({ description: 'Body for creating or updating a dos-and-donts entry' })`.
- `dosAndDontSchema` — response shape. Mirrors `dosAndDontWriteSchema` PLUS `id: string`, `brandId: string`, `createdAt: string` (ISO), `updatedAt: string` (ISO).
- `dosAndDontListQuerySchema` — `{ category: z.enum(DOS_AND_DONT_CATEGORY_VALUES).optional() }`. Empty string in `category` normalises to `undefined` BEFORE the enum check via `.preprocess((v) => v === '' ? undefined : v, ...)` so the F2 content-check "All categories" sentinel works on the wire.

**Inferred TypeScript types** (re-exported from `@sfx/validation`):
- `DosAndDontType = 'do' | 'dont'`
- `DosAndDontCategory = 'tone' | 'vocabulary' | 'visuals' | 'legal' | 'campaign-messaging'`
- `DosAndDontWriteInput = z.infer<typeof dosAndDontWriteSchema>`
- `DosAndDontShape = z.infer<typeof dosAndDontSchema>`
- `DosAndDontListQueryInput = z.infer<typeof dosAndDontListQuerySchema>`

**Path-param schemas:** reuse `idParamSchema` from `@sfx/validation/schemas/common.schema.ts` for both `:brandId` and `:entryId` (same cuid-style string).

**Zod gotchas** (from `apps/web/CLAUDE.md` Gotchas + mulch):
- Apply `.refine()` AFTER final shape assembly. Do NOT `.merge()`/`.extend()` a refined schema — silent drop.
- `.transform()` runs after a failed `.refine()` on Zod v4 — guard via `.pipe()` or conditional logic.
- `.refine()` runs even after `.min()`/`.max()` already failed — use `{ abort: true }` on the inner `.min(1)` for `title` and `body`.

### Schema decision — String column + Zod enum, NOT PostgreSQL enum

Operator flagged "type/category as String with Zod-enforced enum at API layer or PostgreSQL enum — pick one and justify". **Decision: String column at DB; enum enforced ONLY by Zod at the API boundary.**

**Why:** F2-part1 brand-voice and F3-part1 visual-identity use `Json @default("[]")` for enum-shaped JSONB lists and rely on Zod for shape; adding a Postgres enum here breaks convention without buying durability the application layer cannot enforce. Part 3 may extend `category` without a destructive migration — Postgres enum would require `ALTER TYPE ... ADD VALUE` per addition, which Prisma's shadow-DB workflow handles unevenly. Zod is the single source of truth; DB columns are `String` with no `CHECK`. Trade-off: direct SQL writers can store invalid values — same trade-off F1-part1 / F2-part1 / F3-part1 already accept.

### Database — additive only

New Prisma model `DosAndDontEntry` (`@@map("dos_and_dont_entries")`):

```prisma
model DosAndDontEntry {
  id                   String   @id @default(cuid())
  brandId              String   @map("brand_id")
  brand                BrandProfile @relation(fields: [brandId], references: [id], onDelete: Cascade)
  type                 String
  category             String
  title                String
  body                 String
  suggestedCorrection  String?  @map("suggested_correction")
  createdAt            DateTime @default(now()) @map("created_at")
  updatedAt            DateTime @updatedAt @map("updated_at")

  @@index([brandId])
  @@index([brandId, category])
  @@map("dos_and_dont_entries")
}
```

Notes:
- `brandId` is NOT `@unique` — many entries per brand (distinguishing trait vs F2-part1 / F3-part1).
- `@@index([brandId])` for LIST. `@@index([brandId, category])` for the filtered LIST and F2 content-check per-category fetch.
- `title`, `body`, `type`, `category` all `String` per §2 decision. No DB length constraint — Zod enforces at the API boundary.
- F1-part1 `BrandProfile` gains a back-reference `dosAndDonts DosAndDontEntry[]`. SOLE F1-part1 schema edit permitted — purely additive, no impact on F1-part1's existing rows or migrations. Append immediately after the existing `voice BrandVoice?` and `visualIdentity VisualIdentity?` (see `packages/database/prisma/schema.prisma` L17-18).
- Migration directory name: `add_dos_and_dont_entries` (verbatim per operator). Builder runs `pnpm db:migrate -- --name add_dos_and_dont_entries`. Panel-bridge auto-applies within ~1.5s — no manual `stack:reset` needed (mulch `mx-325de6`: schema edits do NOT auto-create migrations).

### Frontend behaviour

- `/brands/<id>` brand-overview hook reads brand-by-id query (F1-part1). The new `DosAndDontsCard` OWNS its own fetch — the brand-overview hook does NOT pre-fetch dos/don'ts; it just mounts `<DosAndDontsCard brandId={brandId}/>` below the existing two-column grid. Mirror F2-part1 `BrandVoiceCard` + F3-part1 `VisualIdentityCard` self-fetching ownership (`apps/web/src/features/brand-profile/presentation/pages/brand-overview/index.tsx` L50-53).
- Mutations invalidate `dosAndDontsListQueryKey(brandId)` AND `['brands']` (brand `updatedAt` bump affects list ordering on `/`). React Query `invalidateQueries` uses array-prefix matching. `onSettled` (not `onSuccess`) per `mx-1d0874`.
- Active-brand selector unchanged by F1 dos-and-donts.

### Shell-level

- `/brands/<id>/dos-and-donts/new` and `/brands/<id>/dos-and-donts/<entry-id>/edit` render inside `<AuthGate><AppShell>` (mirror `/brands/<id>/visual-identity/edit`).
- F1-part1 left-nav unchanged. Card-row `Edit` + card-header `[+ Add do/don't]` are the entry points to form routes.
- The new global `Content check` left-nav item is OUT OF SCOPE — F2 owns it.

### Auth-boundary

- Diff does NOT modify `apps/api/src/modules/auth/**`, `apps/api/src/common/auth/**`, `jwt-auth.guard.ts`, `auth-roles.decorator.ts`, `apps/web/src/features/auth/**`.
- `GET /api/v1/auth/me` continues to return `{ subject, email, roles, isAuthenticated }` unchanged.
- All FIVE dos-and-donts endpoints carry `@UseGuards(JwtAuthGuard)` + `@ApiBearerAuth('accessToken')`. Probe asserts 401 on missing bearer.
- No `OAUTH_*` env var removed, renamed, or added. No new env var.

---

## 3. Guard contract

| Surface | Auth | Unauth behaviour |
|---|---|---|
| Web `/brands/<id>/dos-and-donts/new` | authenticated | `AuthGate` redirects unauth users to oauth2-proxy login. No new redirect path. |
| Web `/brands/<id>/dos-and-donts/<entry-id>/edit` | authenticated | same. |
| API `GET /api/v1/brands/:brandId/dos-and-donts` | authenticated, owner-scoped | 401 unauth; 404 if brand not owned; 400 on unknown `?category`. |
| API `POST /api/v1/brands/:brandId/dos-and-donts` | authenticated, owner-scoped | 401 unauth; 400 on Zod; 404 if brand not owned. |
| API `GET /api/v1/brands/:brandId/dos-and-donts/:entryId` | authenticated, owner-scoped | 401 unauth; 404 if brand not owned OR entry unknown OR entry not on this brand. |
| API `PUT /api/v1/brands/:brandId/dos-and-donts/:entryId` | authenticated, owner-scoped | 401 unauth; 400 on Zod; 404 as above. |
| API `DELETE /api/v1/brands/:brandId/dos-and-donts/:entryId` | authenticated, owner-scoped | 401 unauth; 404 as above. |

Ownership = `BrandProfile.ownerSubject === request.user.subject`. Controller MUST pre-check via the F1-part1 `IBrandProfileRepository.findById(brandId, ownerSubject)` injected from `BrandProfileModule` — `null` → `NotFoundException`. Cross-tenant tests in §2 assert 404, NOT 403. Per-entry repository methods take `(brandId, entryId)` only — ownership is established by the controller pre-check; the repo's `where` clause uses `{ id: entryId, brandId }` so an entry on a brand the caller does not own cannot reach the repo even if the controller were bypassed. The repository never sees `ownerSubject`.

---

## 4. Contract annotations the builder MUST maintain

Flows-generator reads NestJS Swagger decorators + Zod `.openapi()` + runtime-contract overlay. Apply BOTH meta-principles per CLAUDE.md "Probe-friendly code requirements": (A) declaration-driven, (B) SWC + esbuild reflect-metadata constraint.

### NestJS module — `apps/api/src/modules/dos-and-donts/dos-and-donts.module.ts`

Mirror F3-part1 `apps/api/src/modules/visual-identity/visual-identity.module.ts` exactly:
- `imports: [AuthModule, BrandProfileModule]`. `BrandProfileModule` already exports `BRAND_PROFILE_REPOSITORY` (`brand-profile.module.ts` L23).
- Local `PRISMA_CLIENT` token under `apps/api/src/modules/dos-and-donts/infrastructure/prisma-client.token.ts`. Do NOT reuse other modules' tokens.
- Providers:
  - `{ provide: PRISMA_CLIENT, useValue: prisma }` (`prisma` from `@sfx/database`).
  - `{ provide: DOS_AND_DONT_REPOSITORY, useClass: DosAndDontRepository }` (new DI symbol from `@sfx/domain`).
  - Concrete class `DosAndDontRepository` also listed in `providers`.
- `controllers: [DosAndDontController]`.
- Register module in `apps/api/src/app.module.ts` `imports` after `VisualIdentityModule`.

### NestJS controller — `apps/api/src/modules/dos-and-donts/application/controllers/dos-and-dont.controller.ts`

Class-level: `@ApiTags('dos-and-donts')` + `@Controller('brands/:brandId/dos-and-donts')`. Constructor injects BOTH `@Inject(BRAND_PROFILE_REPOSITORY)` and `@Inject(DOS_AND_DONT_REPOSITORY)` — explicit per-parameter `@Inject` (meta-principle B / `mx-4d4764`).

Per-method decorators (every method):
- `@UseGuards(JwtAuthGuard)`.
- `@ApiBearerAuth('accessToken')`.
- `@ApiOperation({ summary: '...' })`.
- `@ApiParam({ name: 'brandId', type: String, example: 'cuid12345', description: 'Brand identifier' })`. GET-one / PUT / DELETE additionally: `@ApiParam({ name: 'entryId', type: String, example: 'cuid67890', description: 'Dos and Donts entry identifier' })`.
- `@ApiResponse({ status: <success>, type: <envelope DTO> })` — 200 LIST + GET-one + PUT + DELETE, 201 POST.
- `@ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })` on every method.
- `@ApiResponse({ status: 404, description: 'Brand not found, entry not found, or not owned by caller' })` on every method.
- `@ApiResponse({ status: 400, description: 'Validation failed' })` on POST + PUT + LIST.

LIST handler additionally:
- `@ApiQuery({ name: 'category', type: String, required: false, enum: DOS_AND_DONT_CATEGORY_VALUES, description: 'Optional category filter' })`.
- `@Query(new ZodValidationPipe(dosAndDontListQuerySchema)) query: DosAndDontListQueryInput` — pipe on `@Query()` NOT class-level (`mx-4d4764`).

POST handler additionally:
- `@ResourceCaptures({ fromPath: 'id', resource: 'dosAndDontEntry', pathParam: 'entryId' }, { fromPath: 'brandId', resource: 'brandProfile', pathParam: 'brandId' })` — operator-dispatch shorthand `('dosAndDontEntry', { id: 'data.id', brandId: 'data.brandId' })` binds to this array-of-`ResourceCapture` form per `resource-captures.decorator.ts` L31. Both captures: `dosAndDontEntry.id` → `:entryId` chains GET-one / PUT / DELETE off the create; second capture redundantly affirms F1-part1's `brandId` chain so the probe can canonicalise without back-walking the response envelope.
- `@ApiBody({ type: DosAndDontWriteDto, examples: { doToneEntry: { summary: 'Do (tone)', value: { type: 'do', category: 'tone', title: 'Use active voice', body: 'Prefer we ship over products are shipped.' } }, dontVisualsEntry: { summary: 'Dont (visuals)', value: { type: 'dont', category: 'visuals', title: 'No recoloured logos', body: 'Never tint, gradient, or recolour the primary mark.', suggestedCorrection: 'Use the monochrome variant from the asset library.' } } } })`.
- `@Body(new ZodValidationPipe(dosAndDontWriteSchema)) body: DosAndDontWriteInput`.

PUT handler additionally:
- `@ApiBody({ type: DosAndDontWriteDto, examples: { ... } })`.
- `@Body(new ZodValidationPipe(dosAndDontWriteSchema)) body: DosAndDontWriteInput`.

DELETE handler additionally:
- `@HttpCode(200)` (mirror F1-part1 `BrandProfileController.remove` L161).

Controller method signatures (high level):

```ts
async list(@Req() request, @Param('brandId') brandId, @Query(new ZodValidationPipe(dosAndDontListQuerySchema)) query)
async create(@Req() request, @Param('brandId') brandId, @Body(new ZodValidationPipe(dosAndDontWriteSchema)) body)
async findById(@Req() request, @Param('brandId') brandId, @Param('entryId') entryId)
async update(@Req() request, @Param('brandId') brandId, @Param('entryId') entryId, @Body(new ZodValidationPipe(dosAndDontWriteSchema)) body)
async remove(@Req() request, @Param('brandId') brandId, @Param('entryId') entryId)
```

Every handler MUST call `this.brandProfileRepository.findById(brandId, request.user.subject)` FIRST and throw `NotFoundException` on `null` BEFORE touching the dos-and-donts repository — preserves 404-not-403 boundary; matches F3-part1 `VisualIdentityController` L150-205.

### NestJS DTOs — `apps/api/src/modules/dos-and-donts/application/dto/`

Per meta-principle (B): every `@ApiProperty()` declares `type:` explicitly. Mirror F1-part1 `BrandProfileDto` style (`declare <field>: <T>;`).

| DTO file | Fields |
|---|---|
| `dos-and-dont.dto.ts` (`DosAndDontDto`) | `id: string`, `brandId: string`, `type: string` (`enum: DOS_AND_DONT_TYPE_VALUES`), `category: string` (`enum: DOS_AND_DONT_CATEGORY_VALUES`), `title: string`, `body: string`, `suggestedCorrection: string \| null` (`nullable: true`), `createdAt: string` (`format: 'date-time'`), `updatedAt: string` (`format: 'date-time'`). |
| `dos-and-dont-write.dto.ts` (`DosAndDontWriteDto`) | `type`, `category`, `title`, `body`, `suggestedCorrection?: string \| null` (`required: false, nullable: true`). |
| `dos-and-dont-envelope.dto.ts` (`DosAndDontEnvelopeDto`) | `success: true` (`@ApiProperty({ type: Boolean, default: true })`), `data: DosAndDontDto` (`@ApiProperty({ type: DosAndDontDto })`). Mirror F3-part1 `VisualIdentityEnvelopeDto`. |
| `dos-and-dont-list-envelope.dto.ts` (`DosAndDontListEnvelopeDto`) | `success: true`, `data: DosAndDontDto[]` (`@ApiProperty({ type: [DosAndDontDto] })`). Mirror F1-part1 `BrandProfileListEnvelopeDto`. |

Bind: `@ApiResponse({ status: 200, type: DosAndDontListEnvelopeDto })` (LIST), `@ApiResponse({ status: 201, type: DosAndDontEnvelopeDto })` (CREATE), `@ApiResponse({ status: 200, type: DosAndDontEnvelopeDto })` (GET-one / PUT). DELETE: `@ApiResponse({ status: 200, description: 'Entry deleted' })` (no body DTO; envelope's `data` is `null`).

### NestJS repository — `apps/api/src/modules/dos-and-donts/data/repositories/dos-and-dont.repository.ts`

Implements `IDosAndDontRepository` from `@sfx/domain`. Per (B): constructor uses `@Inject(PRISMA_CLIENT)`. Mirror F1-part1 `BrandProfileRepository` shape including `toDomain` mapper.

| Method | Signature | Implementation |
|---|---|---|
| `listByBrand` | `(brandId: string, filter?: { category?: DosAndDontCategory }) => Promise<DosAndDontEntry[]>` | `findMany({ where: { brandId, ...(filter?.category ? { category: filter.category } : {}) }, orderBy: [{ category: 'asc' }, { type: 'asc' }, { createdAt: 'desc' }] })`. Returns `[]` on no rows. |
| `findById` | `(brandId: string, entryId: string) => Promise<DosAndDontEntry \| null>` | `findFirst({ where: { id: entryId, brandId } })`. `brandId` in `where` prevents cross-brand id leakage. |
| `create` | `(input: { brandId; type; category; title; body; suggestedCorrection }) => Promise<DosAndDontEntry>` | Inside `prisma.$transaction([ create, brandProfile.update({ where: { id: brandId }, data: {} }) ])` — empty `data: {}` triggers `@updatedAt` to bump `BrandProfile.updatedAt`. Per §1 Cross-cutting. |
| `update` | `(brandId, entryId, patch) => Promise<DosAndDontEntry \| null>` | `updateMany({ where: { id: entryId, brandId }, data: patch })`; if `count === 0` → `null`; else `findUnique({ where: { id: entryId } })` → `toDomain`. Same `$transaction` with brand-updatedAt bump. |
| `delete` | `(brandId, entryId) => Promise<boolean>` | `deleteMany({ where: { id: entryId, brandId } })` inside `$transaction` with brand-updatedAt bump. Return `count > 0`. |

### Domain — `packages/domain/src/`

- `entities/dos-and-dont-entry.ts` — `DosAndDontEntry` readonly interface mirroring the Prisma row (`id`, `brandId`, `type: DosAndDontType`, `category: DosAndDontCategory`, `title`, `body`, `suggestedCorrection: string | null`, `createdAt: Date`, `updatedAt: Date`). Re-export `DosAndDontType` + `DosAndDontCategory` literal-union types from this file. The string-literal unions are duplicated between domain (types only) and `@sfx/validation` (constants + Zod) because domain has zero deps.
- `contracts/dos-and-dont-repository.ts` — `IDosAndDontRepository` interface (mirror `contracts/visual-identity-repository.ts`), `DosAndDontCreateInput` + `DosAndDontUpdatePatch` input shapes, `DOS_AND_DONT_REPOSITORY` DI symbol.
- `index.ts` — re-export entity + interfaces + DI symbol + type unions.

### Validation — `packages/validation/src/`

- `schemas/dos-and-donts.schema.ts` — schemas + constants + types per §2. MUST `import '../openapi';` for side-effect (mirror `brand-profile.schema.ts` L2).
- `index.ts` — re-export every new symbol.

### Prisma — `packages/database/`

- `prisma/schema.prisma`: add the `DosAndDontEntry` model AND append `dosAndDonts DosAndDontEntry[]` to existing `BrandProfile` (line follows `visualIdentity VisualIdentity?`).
- New migration directory `packages/database/prisma/migrations/<timestamp>_add_dos_and_dont_entries/`. Builder runs `pnpm db:migrate -- --name add_dos_and_dont_entries`. Migration SQL MUST contain only `CREATE TABLE "dos_and_dont_entries"`, the FK with `ON DELETE CASCADE`, and the two `@@index` entries — nothing else.

---

## 5. Schema additions — full Prisma model + migration

```prisma
// Append to packages/database/prisma/schema.prisma after the BrandVoice model.

model BrandProfile {
  // EXISTING fields — DO NOT CHANGE except the one-line append below.
  // ... existing fields ...
  voice          BrandVoice?
  visualIdentity VisualIdentity?
  dosAndDonts    DosAndDontEntry[]   // <- F1 dos-and-donts adds ONLY this line.
  // ... existing @@index + @@map ...
}

model DosAndDontEntry {
  id                  String   @id @default(cuid())
  brandId             String   @map("brand_id")
  brand               BrandProfile @relation(fields: [brandId], references: [id], onDelete: Cascade)
  type                String
  category            String
  title               String
  body                String
  suggestedCorrection String?  @map("suggested_correction")
  createdAt           DateTime @default(now()) @map("created_at")
  updatedAt           DateTime @updatedAt @map("updated_at")

  @@index([brandId])
  @@index([brandId, category])
  @@map("dos_and_dont_entries")
}
```

**Migration directory name:** `add_dos_and_dont_entries` (verbatim per operator). Generated by `pnpm db:migrate -- --name add_dos_and_dont_entries`. Panel-bridge auto-applies; mulch `mx-325de6` reminds the builder that schema edits do NOT auto-create migrations — running `db:migrate` is the builder's responsibility.

**Why String not Postgres enum for `type` / `category`:** see §2 "Schema decision" — convention parity with F2-part1 / F3-part1 + frictionless part-3 enum extension.

**Why `@@index([brandId, category])`:** the LIST accepts `?category=` and F2 content-check hits this exact filtered LIST. A compound index keeps it a single index scan; cheap to do correctly now.

---

## 6. Frontend feature layout — `apps/web/src/features/dos-and-donts/`

Mirror F3-part1 `apps/web/src/features/visual-identity/**` for the clean-architecture skeleton (`data/remote/`, `data/model/`, `data/mapper/`, `data/repositories/`, `presentation/pages/`, `presentation/components/`, `presentation/validators/`, `constants.ts`, `index.ts`). Many-per-brand list + CRUD mutations follow F1-part1 `apps/web/src/features/brand-profile/**`.

### `data/` layer

- `data/remote/`:
  - `fetch-dos-and-donts.ts` — `executeRequest('GET', dosAndDontsListEndpoint(brandId), { params: { category? } })`, unwraps `response.data.data: DosAndDontDataModel[]`. Mirror `fetch-brands.ts`.
  - `fetch-dos-and-dont-by-id.ts` — single `DosAndDontDataModel`. Mirror `fetch-brand-by-id.ts`.
  - `create-dos-and-dont.ts`, `update-dos-and-dont.ts`, `delete-dos-and-dont.ts` — mirror `create-brand.ts` / `update-brand.ts` / `delete-brand.ts`.
- `data/model/dos-and-dont-data-model.ts` — interface matching the API response (everything as strings; timestamps ISO; `suggestedCorrection: string | null`).
- `data/mapper/map-to-dos-and-dont.ts` — coerces ISO timestamps to `Date`; passes `type`/`category` as the literal-union types. Mirror `map-to-brand-profile.ts`.
- `data/repositories/`:
  - `use-dos-and-donts-repository.ts` — `useQuery({ queryKey: dosAndDontsListQueryKey(brandId, category?), queryFn: ..., select: mapToDosAndDont[] })`. Mirror `use-brands-repository.ts`. `category` is part of the key so F2's filtered list re-uses the same hook.
  - `use-dos-and-dont-by-id-repository.ts` — mirror `use-brand-by-id-repository.ts`.
  - `use-create-dos-and-dont-mutation.ts` — `useMutation`; `onSettled` invalidates `dosAndDontsListQueryKey(brandId)` (prefix-match) AND `BRANDS_QUERY_KEY`. Per `mx-1d0874`.
  - `use-update-dos-and-dont-mutation.ts` — same PLUS invalidates `dosAndDontEntryQueryKey(brandId, entryId)`.
  - `use-delete-dos-and-dont-mutation.ts` — same invalidation set as create.

### `presentation/` layer

- `presentation/components/`:
  - `DosAndDontsCard/` — brand-overview card. Reads `useDosAndDontsRepository(brandId)`. Branches: loading skeleton, empty-state with CTA, populated grouped-list view, error state. Mirror F3-part1 `VisualIdentityCard/` shell (`rounded-lg border border-border bg-card p-6`). Group entries by category then by type via a pure helper `presentation/components/DosAndDontsCard/group-entries.ts` with co-located unit test. Each row renders title + truncated body + per-row `Edit` (links to `dosAndDontEditRoute(brandId, entryId)`) + per-row `Delete` (opens `DeleteDosAndDontConfirmModal`).
  - `DosAndDontEditForm/` — shared form used by both new + edit pages. Five fields: `type` (radio pill toggle), `category` (`<select>` from `DOS_AND_DONT_CATEGORY_VALUES` with localised labels), `title` (`<input>`), `body` (`<textarea>`), `suggestedCorrection` (`<textarea>`, optional). RHF + `zodResolver(dosAndDontWriteSchema)`. Submit handler passed via prop (page hook owns mutation + navigation). Mirror F3-part1 `VisualIdentityEditForm/`.
  - `DeleteDosAndDontConfirmModal/` — inline confirm dialog. Mirror F1-part1 `DeleteBrandConfirmModal/`.
- `presentation/pages/`:
  - `new-dos-and-dont/` — `use-new-dos-and-dont.ts`, `map-to-new-dos-and-dont-page-ui-model.ts`, `types.ts`, `index.tsx`. Hook calls `useCreateDosAndDontMutation()`, on success sets `navigationTarget = brandRoute(brandId)`; a `useEffect` calls `router.push(navigationTarget)` — NEVER inside the mutation callback (Hook Return Audit / `apps/web/CLAUDE.md`). Mirror F1-part1 `new-brand/`.
  - `edit-dos-and-dont/` — `use-edit-dos-and-dont.ts`, mapper, types, index. Reads `useDosAndDontByIdRepository(brandId, entryId)` for pre-fill, calls `useUpdateDosAndDontMutation()` on submit, navigates back on success. 404 from the read → `uiModel.notFound = true`. Mirror F3-part1 `edit-visual-identity/`.
- `presentation/validators/dos-and-dont-form.ts` — RHF `zodResolver(dosAndDontWriteSchema)` re-export (mirror F1-part1 `brand-profile-form.ts`).

### `constants.ts`

```ts
export const DOS_AND_DONTS_ENDPOINT = (brandId: string) => `api/v1/brands/${brandId}/dos-and-donts`;
export const DOS_AND_DONT_ENTRY_ENDPOINT = (brandId: string, entryId: string) => `${DOS_AND_DONTS_ENDPOINT(brandId)}/${entryId}`;
export const dosAndDontsListQueryKey = (brandId: string, category?: DosAndDontCategory): readonly unknown[] =>
  category ? (['dos-and-donts', brandId, category] as const) : (['dos-and-donts', brandId] as const);
export const dosAndDontEntryQueryKey = (brandId: string, entryId: string): readonly [string, string, 'entry', string] =>
  ['dos-and-donts', brandId, 'entry', entryId] as const;
export const dosAndDontNewRoute = (brandId: string): string => `/brands/${brandId}/dos-and-donts/new`;
export const dosAndDontEditRoute = (brandId: string, entryId: string): string =>
  `/brands/${brandId}/dos-and-donts/${entryId}/edit`;
export { DOS_AND_DONT_TYPE_VALUES, DOS_AND_DONT_CATEGORY_VALUES, DOS_AND_DONT_TITLE_MAX_LENGTH, DOS_AND_DONT_BODY_MAX_LENGTH } from '@sfx/validation';
```

`dosAndDontsListQueryKey` returns the 2-tuple form when `category` is absent so mutations can do `invalidateQueries({ queryKey: ['dos-and-donts', brandId] })` and match every category filter by prefix. Per `apps/web/CLAUDE.md` array-prefix gotcha.

### `index.ts`

Barrel exporting `DosAndDontsCard`, `NewDosAndDontPage`, `EditDosAndDontPage`, query-key builders, route builders.

### Brand-overview additive edit

- `apps/web/src/features/brand-profile/presentation/pages/brand-overview/index.tsx` — mount `<DosAndDontsCard brandId={brandId} />` as a NEW full-width section below the existing `<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">…</div>` block (L50-53). Do NOT remove/rearrange the brand-voice + visual-identity cards. Do NOT touch `BrandHeader`, rename modal, delete modal, or any other render branch.
- `apps/web/src/features/brand-profile/presentation/pages/brand-overview/use-brand-overview.ts` and `map-to-brand-overview-page-ui-model.ts` — NO edit required IF the card owns its own fetch (recommended; matches F2-part1 `BrandVoiceCard` and F3-part1 `VisualIdentityCard`). Card reads `useTranslations('common')` for its own labels and `useDosAndDontsRepository(brandId)` for its own data — no `dosAndDonts*` keys added to `BrandOverviewPageUIModel`.
- New page wrappers under `apps/web/src/app/brands/[id]/dos-and-donts/`:
  - `new/page.tsx`: `<AuthGate><AppShell><NewDosAndDontPage brandId={(await params).id}/></AppShell></AuthGate>` (mirror `apps/web/src/app/brands/[id]/visual-identity/edit/page.tsx`).
  - `[entryId]/edit/page.tsx`: `<AuthGate><AppShell><EditDosAndDontPage brandId={...} entryId={...}/></AppShell></AuthGate>`.

### Localisation

`apps/web/src/features/presentation/localization/languages/en/common.ts` AND `.../ro/common.ts` — add EN+RO keys (`CommonTranslations` enforces parity). At minimum:
- Section titles: `dosAndDontsSectionTitle`, `dosAndDontsEmptyStateBody`.
- CTAs: `addDosAndDontCta`, `editDosAndDontCta`, `deleteDosAndDontCta`.
- Field labels: `dosAndDontTypeLabel`, `dosAndDontCategoryLabel`, `dosAndDontTitleLabel`, `dosAndDontBodyLabel`, `dosAndDontSuggestedCorrectionLabel`.
- Type enum labels (apostrophe lives here, NOT on the wire): `dosAndDontTypeDoLabel` (`Do`), `dosAndDontTypeDontLabel` (`Don't`).
- Category enum labels: `dosAndDontCategoryToneLabel`, `dosAndDontCategoryVocabularyLabel`, `dosAndDontCategoryVisualsLabel`, `dosAndDontCategoryLegalLabel`, `dosAndDontCategoryCampaignMessagingLabel`.
- Form chrome: `newDosAndDontPageTitle`, `editDosAndDontPageTitle`, `dosAndDontSubmitLabel`, `dosAndDontCancelLabel`, `dosAndDontSaveError`.
- Validation: `dosAndDontTitleRequiredError`, `dosAndDontTitleTooLongError`, `dosAndDontBodyRequiredError`, `dosAndDontBodyTooLongError`, `dosAndDontSuggestedCorrectionTooLongError`, `dosAndDontTypeRequiredError`, `dosAndDontCategoryRequiredError`.
- Delete confirm: `deleteDosAndDontConfirmTitle`, `deleteDosAndDontConfirmBody`.

`apps/web/src/features/presentation/localization/types.ts` — extend `CommonTranslations` with the new keys so both language files compile.

### Tests (every new file)

- Every new source file MUST have a co-located test (under `__tests__/` OR sibling `.test.ts(x)`). Greater-than-or-equal-to 90% coverage. Stop-hook coverage gate blocks close otherwise.
- Backend integration test `apps/api/src/modules/dos-and-donts/__integration__/dos-and-donts.integration-test.ts` (Vitest + Supertest + `Test.createTestingModule`) covering:
  - anonymous → 401 on LIST, POST, GET-one, PUT, DELETE;
  - admin LIST on owned brand with zero entries → 200 + `data: []`;
  - admin POST happy → 201 + envelope + entry persists;
  - admin GET-one happy → 200 + envelope;
  - admin LIST after POST → 200 + `data.length === 1` + correct sort order;
  - admin LIST with `?category=tone` matches only tone entries; `?category=invalid` → 400;
  - admin PUT happy → 200 + envelope reflects update;
  - admin DELETE happy → 200 + envelope `data: null` + subsequent GET-one → 404;
  - admin POST with empty title → 400; empty body → 400; unknown type → 400; unknown category → 400; oversized title/body → 400;
  - cross-tenant (viewer hits admin's brand) → 404 on every method;
  - cascade — admin POSTs entry, admin DELETEs the brand, subsequent LIST → 404 (brand absent).
- Repository unit tests `apps/api/src/modules/dos-and-donts/data/repositories/__tests__/dos-and-dont.repository.test.ts` — mock `PrismaClient`, assert `where`/`data` arguments for each method PLUS the `$transaction` brand-updatedAt bump.
- DTO instantiation tests under `application/dto/__tests__/` (mirror F3-part1 `__tests__/visual-identity.dto.test.ts`).
- Frontend page tests use `@testing-library/react` + mocked repositories (mock at repo boundary per `apps/web/CLAUDE.md`). Cover:
  - new-entry: submits valid payload → calls create mutation → navigates to brand route;
  - new-entry: empty title → renders error, does NOT call mutation;
  - edit-entry: pre-populates from by-id query;
  - edit-entry: submits → calls update mutation → navigates back;
  - edit-entry: 404 from by-id query → renders not-found branch.
- `DosAndDontsCard` tests: empty-state render, populated render with grouping, per-row Edit / Delete affordances visible, delete confirm modal flow.
- `group-entries.ts` unit test: grouping stability across all five categories × two types, empty input → empty array, single category → single group, sorted output.

### Runtime contract overlay (NOT runtime-contract.flows)

`.runtime-contract.overlay.json` — builder MAY add visible-page tokens for `/brands/<id>/dos-and-donts/new` and `/brands/<id>/dos-and-donts/<entry-id>/edit`. Do NOT add `overlay.flows` (retired) or `overlay.ignore[]` entries — both rejected.

### Flow file (owned by lead — builder MUST NOT edit)

`.overstory/runtime-contract.flows/sfx-webapp-boilerplate-34c3.json` — lead authors via the `task-flow-authoring` skill. MUST cover at minimum:
- anonymous → 401 on every method × path;
- admin happy: POST brand → POST entry → GET-one 200 round-trip → PUT 200 → DELETE 200 → GET-one 404;
- admin LIST after-POST count, then LIST with `?category=tone` filter matches, `?category=invalid` → 400;
- admin validation: POST with empty title / empty body / unknown type / unknown category → 400 each;
- cross-tenant: admin POST brand, viewer LIST / GET-one / POST / PUT / DELETE → 404;
- cascade: admin POST brand → admin POST entry → admin DELETE brand → admin GET LIST → 404.

Builder responds to flow-file failures via the `flow-failure-response` skill — NEVER edits the JSON. `flows-path-boundary` hook blocks any edit attempt and emits `FLOW_OWNERSHIP_VIOLATION`.

---

## 7. Implementation notes the builder MUST read before writing code

- Mirror F3-part1 `apps/api/src/modules/visual-identity/**` for the module shape, the `infrastructure/prisma-client.token.ts` pattern, the Swagger decorator style, and the `BRAND_PROFILE_REPOSITORY` ownership pre-check. Mirror F1-part1 `apps/api/src/modules/brand-profile/**` for the many-per-tenant CRUD repository shape (`listByOwner`-style → `listByBrand`, `findById(brandId, ...)`, `create`, `update`, `delete`). Re-use the shared `ApiEnvelopeDto`, `ZodValidationPipe`, `JwtAuthGuard`, `ResourceCaptures` decorator from `apps/api/src/common/**` — do NOT duplicate.
- Controller MUST inject the F1-part1 `IBrandProfileRepository` via `BRAND_PROFILE_REPOSITORY` and pre-check ownership BEFORE touching the dos-and-donts repository. Per mulch `mx-b562ca` foundational pattern (fourth application).
- Mirror F3-part1 `apps/web/src/features/visual-identity/**` for the frontend clean-architecture layout and F1-part1 `apps/web/src/features/brand-profile/**` for list + CRUD mutation hooks.
- React Hook Form for the form. `category` is a single `<select>`. `type` is `<input type="radio">` rendered as two pill buttons. No `useFieldArray` (entries are scalars, not lists).
- All frontend strings via `useTranslations('common')` — no inline JSX strings. Both `en/common.ts` and `ro/common.ts` MUST stay in sync.
- All API calls via `executeRequest()` — never raw `fetch`. Unwrap the envelope (`response.data.data`) in `data/remote/*`.
- `useCallback` every returned hook function. Never call `router.push()` inside a mutation callback — use a `navigationTarget` state field + `useEffect` (Hook Return Audit).
- Theme tokens via Tailwind classes (`bg-card`, `text-foreground`, `border-border`) — no hex literals.
- React Query keys are nested arrays. `invalidateQueries({ queryKey: ['dos-and-donts', brandId] })` matches every per-category subkey by prefix. `onSettled` (not `onSuccess`) per `mx-1d0874`.
- New Prisma model + reverse-relation edit + new migration directory MUST be in the SAME commit. Panel-bridge auto-applies. Per `mx-325de6`, schema edits do NOT auto-create migrations — running `pnpm db:migrate -- --name add_dos_and_dont_entries` is the builder's responsibility.
- Before close gate, run `pnpm probe:smoke`. Failure routing per `apps/CLAUDE.md` "Probe failure → skill routing":
  - `RESOURCE_CAPTURE_*` → `build-verifiable-features` (likely missing `@ResourceCaptures` on POST).
  - `CONTRACT_STATUS_UNREACHABLE_UNGENERATABLE` → `nestjs-probe-coverage`.
  - `FLOW_STEP_FAILED` referencing `sfx-webapp-boilerplate-34c3:*` → `flow-failure-response` + mail the lead. NEVER edit the JSON.
  - `CONTRACT_STATUS_UNREACHABLE` on `/brands/:brandId/dos-and-donts:200` despite curated flows passing — same class as `mx-cd88c5` / `mx-e2ad2d`. r5/r6's `apiPrefix`-prefix tuple fix landed on master (`975f936`); part-1 builders inherited it cleanly. If it nonetheless fires, mail the lead with the exact failure shape — do NOT patch hook code.
- `worker_done` evidence MUST include:
  - `## runtime-evidence` — full `pnpm probe:smoke` JSON, EXIT 0, every curated flow PASS, zero CONTRACT_STATUS_UNREACHABLE on dos-and-donts endpoints.
  - `## qa-test-evidence` — report path under `.claude/hook-reports/qa-test-<task>-<hash>.md`, mode=full, covering J1 / J2 / J3 / J5 / J6, final FAILED=0 CRITICAL=0 HIGH=0.
- Recorded conventions / failures to read before touching:
  - `mulch mx-b562ca` (owner-scoped CRUD via repo null-return).
  - `mulch mx-4d4764` (`ZodValidationPipe` at `@Body(...)` / `@Query(...)`, NOT class-level).
  - `mulch mx-325de6` (Prisma schema edits do not auto-create migrations).
  - `mulch mx-1d0874` (React Query `onSettled` + array-prefix invalidation).
  - `mulch mx-cd88c5` / `mx-e2ad2d` (probe contract-coverage tuple mismatch) — F1 dos-and-donts endpoints HAVE path-params so this failure mode does NOT apply directly. If it nonetheless surfaces, escalate via `flow_mismatch` mail.

---

## 8. Files in F1 dos-and-donts builder's scope

In scope (new tree):
- `packages/domain/src/entities/dos-and-dont-entry.ts` (new) + `__tests__/`
- `packages/domain/src/contracts/dos-and-dont-repository.ts` (new) + `__tests__/`
- `packages/validation/src/schemas/dos-and-donts.schema.ts` (new) + `__tests__/`
- `packages/database/prisma/migrations/<timestamp>_add_dos_and_dont_entries/migration.sql` (generated)
- `apps/api/src/modules/dos-and-donts/**` (new tree)
- `apps/web/src/features/dos-and-donts/**` (new tree)
- `apps/web/src/app/brands/[id]/dos-and-donts/new/page.tsx` (new thin wrapper)
- `apps/web/src/app/brands/[id]/dos-and-donts/[entryId]/edit/page.tsx` (new thin wrapper)

In scope (additive modifications only):
- `packages/domain/src/index.ts` (re-export)
- `packages/validation/src/index.ts` (re-export)
- `packages/database/prisma/schema.prisma` (add `DosAndDontEntry` model + append `dosAndDonts DosAndDontEntry[]` to `BrandProfile`)
- `apps/api/src/app.module.ts` (register `DosAndDontsModule` in `imports`)
- `apps/web/src/features/brand-profile/presentation/pages/brand-overview/index.tsx` (mount `<DosAndDontsCard/>` as a new full-width section beneath the existing two-column grid; touch nothing else)
- `apps/web/src/features/brand-profile/presentation/pages/brand-overview/__tests__/BrandOverviewPage.test.tsx` (extend with a single assertion that `<DosAndDontsCard/>` renders when the page is in its happy state)
- `apps/web/src/features/presentation/localization/languages/en/common.ts` (add keys)
- `apps/web/src/features/presentation/localization/languages/ro/common.ts` (add keys — identical key set)
- `apps/web/src/features/presentation/localization/types.ts` (extend `CommonTranslations`)
- `.runtime-contract.overlay.json` (page tokens only — NEVER `flows` / `ignore`)

OFF LIMITS (cite in any mail to the lead):
- `apps/api/src/modules/auth/**`
- `apps/api/src/common/auth/**`
- `apps/api/src/common/guards/jwt-auth.guard.ts`
- `apps/api/src/common/decorators/auth-roles.decorator.ts`
- `apps/api/src/common/decorators/resource-captures.decorator.ts` (consume only; do NOT modify)
- `apps/api/src/modules/brand-profile/**` (F1-part1)
- `apps/api/src/modules/brand-voice/**` (F2-part1)
- `apps/api/src/modules/visual-identity/**` (F3-part1)
- `apps/web/src/features/auth/**`
- `apps/web/src/features/app-shell/**` (F1-part1)
- `apps/web/src/features/brand-voice/**` (F2-part1)
- `apps/web/src/features/visual-identity/**` (F3-part1)
- `apps/web/src/features/brand-profile/**` EXCEPT the two brand-overview index files described above
- `apps/web/src/stores/active-brand-store.ts` (F1-part1)
- `.overstory/runtime-contract.flows/**` (lead-owned; hook-blocked)
- `.flows.generated.json`, `.matrix.json`, `.runtime-contract.logical.json` (hook-blocked)
- F2 territory: `content-check` feature, the `/content-check` route, the `Content check` left-nav item.
- Anything outside the worktree.

---

## 9. Definition of done

- All FIVE endpoints in §2 implemented, tested (unit + integration), behind `JwtAuthGuard` + `@ApiBearerAuth('accessToken')`.
- `/brands/<id>` shows the real `DosAndDontsCard` — empty state on a brand with no entries, grouped list otherwise.
- `/brands/<id>/dos-and-donts/new` renders for an authenticated owned-brand user without console errors; submit → 201 → navigates back; card reflects the new entry.
- `/brands/<id>/dos-and-donts/<entry-id>/edit` renders, pre-populates, submits → 200 → navigates back; card reflects the update including any category / type move.
- Per-row `Delete` opens confirm, confirm → 200, card refetches, entry gone.
- Cross-tenant probe returns 404 (NOT 403, NOT 200) for every method × path.
- Brand-delete cascade verified by integration test.
- LIST endpoint with `?category=<enum>` filters correctly; `?category=invalid` → 400.
- POST + PUT validation enforced server-side: empty title → 400, empty body → 400, oversized title / body → 400, unknown type → 400, unknown category → 400, `suggestedCorrection` empty string normalised to `null`.
- `pnpm typecheck`, `pnpm lint`, `pnpm test:coverage` (greater-than-or-equal-to 90%), `pnpm test:integration`, `pnpm probe:smoke` all pass — EXIT 0 on the probe.
- `worker_done` mail to lead carries probe JSON summary as `## runtime-evidence` block AND QA-test report path as `## qa-test-evidence` block.
- No diff in OFF-LIMITS paths.
- F1-part1 / F2-part1 / F3-part1 endpoints continue to pass their existing flow files (`b859.json`, `6fba.json`, `cfeb.json`).
- F2 content-check builder can consume `GET /api/v1/brands/:brandId/dos-and-donts?category=<enum?>` without ambiguity — response envelope is `{ success: true, data: DosAndDontEntry[] }` with `data` always an array (NEVER `null`, NEVER `404` for "no entries").
