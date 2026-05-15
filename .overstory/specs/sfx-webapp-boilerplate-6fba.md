<!-- written-by: scout-brand-voice -->
# F2 brand-voice — feature spec

**Task:** `sfx-webapp-boilerplate-6fba` (feature 2 of 3, parent plan `sfx-webapp-boilerplate-2cb0`).
**Depends on:** F1 (`sfx-webapp-boilerplate-b859`) merged at master `3caa99c`. F1 introduced the `BrandProfile` entity, `/api/v1/brands*` CRUD, `AuthGate`/`AppShell`/active-brand selector, the brand-overview shell, and the `BrandVoiceCardPlaceholder` stub on `/brands/<id>`. F2 replaces that stub with real data and adds the `BrandVoice` entity + endpoints + edit page.
**Scope of THIS spec:** F2 only — `BrandVoice` domain entity (8 fields), Prisma model + migration with FK to `brand_profile.id` + `ON DELETE CASCADE`, NestJS `brand-voice` module behind `JwtAuthGuard`, owner-scoped 1:1 upsert semantics, shared Zod schema, frontend `brand-voice` feature, `/brands/<id>/voice/edit` page, real `BrandVoiceCard` on `/brands/<id>` that replaces `BrandVoiceCardPlaceholder`.
**Out of scope:** visual-identity (F3 — `sfx-webapp-boilerplate-cfeb`), search, dos/don'ts, version history, agent retrieval API, AI integrations (parts 2+3). Do NOT touch `/api/v1/brands*` (F1-owned) or anything under the OFF LIMITS list in §6. The `<VisualIdentityCardPlaceholder>` render on `/brands/<id>` stays — F3 swaps that one.

**Auth (binding):** the existing Keycloak + oauth2-proxy + RS256/JWKS stack is the ONLY auth mechanism. The builder MUST NOT modify `apps/api/src/modules/auth/**`, `apps/api/src/common/auth/**`, `apps/api/src/common/guards/jwt-auth.guard.ts`, `apps/api/src/common/decorators/auth-roles.decorator.ts`, or `apps/web/src/features/auth/**`. Identity = `request.user.subject` from `JwtAuthGuard`. Repository methods take `(brandProfileId, ownerSubject)` and return `null` for either "brand not found" OR "brand not owned" — the controller maps `null` to `NotFoundException` and NEVER returns `ForbiddenException`. Per mulch `mx-b562ca` (foundational pattern, applied a second time in F2).

---

## 1. User-visible behaviour (what the probe will assert)

### Pages (URLs are exact)

| URL | Purpose | Empty-state / branch |
|---|---|---|
| `/brands/<id>` | Brand overview (F1 shell; F2 fills the **Brand voice** card) | If the brand has no voice row yet OR every field is empty: render the existing-style empty-state card with the section title `Brand voice` and a `[+ Edit brand voice]` CTA to `/brands/<id>/voice/edit`. If the voice row has any non-empty field: render a read-only summary card showing each populated field as a labelled subsection (tone-of-voice as multiline text; the seven list-shaped fields as bulleted/chip lists with item counts in the section header) and a top-right `Edit` button to `/brands/<id>/voice/edit`. The card MUST remain visually separated from the Visual Identity card (existing two-column grid on `lg:` per F1). |
| `/brands/<id>/voice/edit` | Brand voice edit form | Renders a form with the eight grouped fields below. Submit → `PUT /api/v1/brands/<id>/voice`. On `200`: navigate back to `/brands/<id>` and the voice card reflects the new values without a hard refresh (React Query invalidation of `['brand-voice', id]`, NOT `router.refresh()`). On validation failure: per-field errors render; no navigation; no persist. On `404` (brand deleted out-of-band or not owned): show a top-level "Brand not found" error and a link back to `/`. On `401` (session expired): existing `executeRequest` interceptor emits `auth:loginRequired` and `AuthGate` handles redirect — F2 adds no new redirect logic. |

**The eight voice fields (J3 binding):**

1. **Tone of voice** — `toneOfVoice` — multiline text. 0..4000 chars after trim. Whitespace-only collapses to empty string. Stored as a Prisma `String?` column (nullable text); empty string is normalised to `null` server-side.
2. **Preferred vocabulary** — `preferredVocabulary` — list of strings. Add/remove rows in UI. Each item: trimmed, 1..200 chars. No duplicates within the list (case-insensitive compare). Max 200 items per list. Stored as JSONB.
3. **Restricted vocabulary** — `restrictedVocabulary` — same shape + rules as preferred.
4. **Messaging pillars** — `messagingPillars` — list of strings, trimmed 1..200 chars per item, no duplicates, max 50 items. JSONB.
5. **Writing style rules** — `writingStyleRules` — list of strings, trimmed 1..1000 chars per item, no duplicates, max 100 items. JSONB.
6. **Audience-specific communication rules** — `audienceRules` — list of `{ audience: string; rule: string }`. `audience`: trimmed 1..120 chars (no duplicates by audience within the list, case-insensitive). `rule`: trimmed 1..1000 chars. Max 50 entries. JSONB.
7. **Approved example phrases** — `approvedExamplePhrases` — list of strings, trimmed 1..500 chars per item, no duplicates, max 100 items. JSONB.
8. **Rejected example phrases** — `rejectedExamplePhrases` — list of strings, trimmed 1..500 chars per item, no duplicates, max 100 items. JSONB.

All `*MAX_LENGTH` / `*MAX_ITEMS` numeric values MUST live as exported constants on `@sfx/validation/schemas/brand-voice.schema.ts` AND be re-exported as `BRAND_VOICE_*` constants on `apps/web/src/features/brand-voice/constants.ts` for the form UI (mirror the F1 `BRAND_NAME_MAX_LENGTH` pattern at `packages/validation/src/schemas/brand-profile.schema.ts` + `apps/web/src/features/brand-profile/constants.ts`).

### Shell integration

- F1's `BrandOverviewPage` (`apps/web/src/features/brand-profile/presentation/pages/brand-overview/`) currently renders `<BrandVoiceCardPlaceholder/>`. F2 MUST replace that with `<BrandVoiceCard brandId={brandId}/>` from `@/features/brand-voice`. The new card OWNS its own data fetch (React Query hook), its own loading skeleton, its own empty-state, and its own read-only summary rendering. The page-hook in `brand-profile` does NOT need to fetch voice data — keeping fetch ownership inside the card preserves F1's clean architecture (`brand-profile` feature does not import from `brand-voice` feature internals; it imports only the component barrel via `@/features/brand-voice`).
- The placeholder file `apps/web/src/features/brand-profile/presentation/components/BrandVoiceCardPlaceholder/**` MUST be deleted by the builder (along with its `__tests__/` directory). The placeholder becomes dead code once `<BrandVoiceCard>` ships. If it cannot be deleted (e.g. an unrelated import surfaces during refactor), the builder MUST at minimum stop referencing it from `brand-overview/index.tsx` AND remove it from `apps/web/src/features/brand-profile/index.ts` barrel exports (if exported). Document the choice in the PR description.
- The `editBrandVoice` localisation key (already present from F1 — value `'+ Edit brand voice'`) MUST be reused. F2 adds new keys for the eight field labels, the edit page title, list-row add/remove labels, per-field validation messages, and the "voice not yet configured" empty-state copy. ALL new keys MUST be added to both `en/common.ts` AND `ro/common.ts` — TypeScript via `CommonTranslations` enforces parity.
- F1's `map-to-brand-overview-page-ui-model.ts` currently exposes `brandVoiceTitle` / `brandVoiceCtaLabel` / `brandVoiceCtaHref` on the UI model so the placeholder could read them. Now that `<BrandVoiceCard>` owns its own labels via `useTranslations`, those three UI-model fields SHOULD be removed (and their assertions in `map-to-brand-overview-page-ui-model.test.ts` + `BrandOverviewPage.test.tsx` updated). The equivalent visual-identity fields STAY — F3 swaps those.

### Brand-voice journeys

**J3 — editing brand voice (zero-state):**
- Unauthenticated visitor hitting `/brands/<id>/voice/edit` is redirected to the oauth2-proxy login surface (existing `AuthGate` chain). Unauthenticated API caller on either `/api/v1/brands/:id/voice` endpoint receives `401`.
- Authenticated user on `/brands/<id>` clicks the voice card's edit CTA → navigates to `/brands/<id>/voice/edit`.
- The form renders all eight fields above with the appropriate input controls (textarea for tone-of-voice; repeatable string-row controls for the six string-list fields; repeatable two-input rows for `audienceRules`).
- Submitting with valid data → `PUT /api/v1/brands/<id>/voice` returns `200` + the upserted payload. On `200` the page navigates back to `/brands/<id>` and the voice card reflects the new values within the same React Query cache cycle (no hard refresh).
- Submitting with invalid data (any per-field rule violated) → no `PUT` is fired (RHF + Zod resolver blocks it client-side) AND if the user circumvents the client, the server returns `400` with the standard NestJS validation envelope.
- A user with an empty voice row sees the empty-state card on `/brands/<id>` because GET returns `200` with the "empty" payload, not `404`. The empty-state branch renders identically to "no voice row exists yet".

**J3 — editing brand voice (already populated):**
- Authenticated user on `/brands/<id>` whose brand has a voice row sees the summary card. The card's `Edit` button → navigates to `/brands/<id>/voice/edit` with the form pre-populated with the current values (React Query feeds the same `['brand-voice', id]` cache the card reads).
- Saving an unchanged form → still returns `200` (idempotent upsert).
- Clearing the tone-of-voice (empty string) → server normalises to `null`. GET subsequently returns `toneOfVoice: null`.

**Cross-tenant (J3 boundary):**
- Authenticated user CANNOT read or write the voice of a brand they do NOT own. API returns `404 Not Found` for both `GET` and `PUT` (existence is NOT leaked). The probe will assert `404`, NOT `403`.

**Brand deletion cascade (J5 — defined here, exercised by F2 flow but enforced by F2's FK):**
- When F1's `DELETE /api/v1/brands/:id` succeeds, the `brand_voice` row (if any) is removed via the FK's `ON DELETE CASCADE`. A subsequent `GET /api/v1/brands/:id/voice` for that id returns `404` (the brand no longer exists for the caller). The curated F2 flow asserts this with a `POST brand → PUT voice → DELETE brand → GET voice → 404` chain.

---

## 2. Runtime acceptance criteria

These are the behaviours the runtime probe will assert. Status codes / URLs are derived from the Zod schemas + NestJS decorators + the curated flow file `sfx-webapp-boilerplate-6fba.json` (lead-authored — builder MUST NOT edit).

### API surface — both endpoints authenticated

For each endpoint the probe will assert:

1. Happy path with a valid bearer (`admin` actor from `_shared.json`) → `2xx` + envelope `{ success: true, data: <T> }`.
2. Anonymous (no bearer) → `401`.
3. Cross-tenant (brand owned by user A, accessed by user B — both authenticated) → `404` for `GET` AND `PUT`.

| Endpoint | Method | Path | Auth | Notes |
|---|---|---|---|---|
| Get brand voice | GET | `/api/v1/brands/:id/voice` | yes | If brand exists AND owned: `200` + envelope. The `data` payload ALWAYS matches `BrandVoiceShape` — when no row exists yet, the eight fields take their "empty" defaults (`toneOfVoice: null`, six string-lists `[]`, `audienceRules: []`) and `createdAt`/`updatedAt` are `null`. If brand not owned OR not found: `404`. |
| Upsert brand voice | PUT | `/api/v1/brands/:id/voice` | yes | Body shape: `brandVoiceWriteSchema` (all 8 fields, each with sensible defaults if omitted — see "Validation"). Creates the row on first save, updates thereafter. Returns `200` + the upserted payload. `400` on validation failure (per-field error envelope). `404` if brand not owned. Always uses `request.user.subject` as ownership scope — body never carries `ownerSubject`. |

There is intentionally NO `DELETE /api/v1/brands/:id/voice` endpoint. The voice row is cleared by sending an empty payload via `PUT`, and deleted only via the `ON DELETE CASCADE` triggered by F1's `DELETE /api/v1/brands/:id`.

### Validation (Zod schemas in `@sfx/validation/schemas/brand-voice.schema.ts`)

Two schemas exported:

- `brandVoiceWriteSchema` — used by `PUT` body validation:
  - `toneOfVoice`: `z.string().trim().max(BRAND_VOICE_TONE_MAX_LENGTH)`, then chained `.transform((value) => (value.length === 0 ? null : value))`, then `.nullable().optional().default(null)`. Empty string after trim normalises to `null`. Tone-of-voice is optional.
  - `preferredVocabulary`: `z.array(z.string().trim().min(1, '<key>').max(BRAND_VOICE_LIST_ITEM_SHORT_MAX_LENGTH, '<key>')).max(BRAND_VOICE_VOCAB_MAX_ITEMS, '<key>').default([])`. After array assembly: `.refine((items) => caseInsensitiveUniqueOK(items), '<key>')`.
  - `restrictedVocabulary`: same shape + rules as `preferredVocabulary`.
  - `messagingPillars`: `z.array(z.string().trim().min(1).max(BRAND_VOICE_LIST_ITEM_SHORT_MAX_LENGTH)).max(BRAND_VOICE_PILLARS_MAX_ITEMS).default([])` + uniqueness refine.
  - `writingStyleRules`: `z.array(z.string().trim().min(1).max(BRAND_VOICE_LIST_ITEM_LONG_MAX_LENGTH)).max(BRAND_VOICE_RULES_MAX_ITEMS).default([])` + uniqueness refine.
  - `audienceRules`: `z.array(z.object({ audience: z.string().trim().min(1).max(BRAND_VOICE_AUDIENCE_MAX_LENGTH), rule: z.string().trim().min(1).max(BRAND_VOICE_LIST_ITEM_LONG_MAX_LENGTH) })).max(BRAND_VOICE_AUDIENCE_RULES_MAX_ITEMS).default([])`. Refine: no duplicate `audience` values (case-insensitive).
  - `approvedExamplePhrases`: `z.array(z.string().trim().min(1).max(BRAND_VOICE_PHRASE_MAX_LENGTH)).max(BRAND_VOICE_PHRASES_MAX_ITEMS).default([])` + uniqueness refine.
  - `rejectedExamplePhrases`: same as `approvedExamplePhrases`.
  - Top-level schema carries `.openapi({ description: 'Body for upserting a brand voice' })`.

Suggested constant values (builder MAY tune, but document if changed):

```
BRAND_VOICE_TONE_MAX_LENGTH                 = 4000
BRAND_VOICE_LIST_ITEM_SHORT_MAX_LENGTH      = 200
BRAND_VOICE_LIST_ITEM_LONG_MAX_LENGTH       = 1000
BRAND_VOICE_AUDIENCE_MAX_LENGTH             = 120
BRAND_VOICE_PHRASE_MAX_LENGTH               = 500
BRAND_VOICE_VOCAB_MAX_ITEMS                 = 200
BRAND_VOICE_PILLARS_MAX_ITEMS               = 50
BRAND_VOICE_RULES_MAX_ITEMS                 = 100
BRAND_VOICE_AUDIENCE_RULES_MAX_ITEMS        = 50
BRAND_VOICE_PHRASES_MAX_ITEMS               = 100
```

- `brandVoiceSchema` — used as the response shape (the `data` field of the envelope):
  - All 8 fields above + `brandProfileId: z.string()` + `createdAt: z.string().nullable()` + `updatedAt: z.string().nullable()` (`null` when no row yet exists).
  - Inferred types `BrandVoiceWriteInput` and `BrandVoiceShape` re-exported via `packages/validation/src/index.ts`.

Per **mulch `mx-4d4764`** (foundational convention): `new ZodValidationPipe(brandVoiceWriteSchema)` MUST be bound to the `@Body()` parameter — NOT at the handler level — otherwise the pipe runs against `@Param` too and rejects `:id`.

Per **project-level Zod gotchas** (CLAUDE.md "Gotchas"):
- Apply `.refine()` AFTER the final shape is assembled. Do NOT `.merge()` or `.extend()` a refined schema — refines and transforms are silently dropped.
- `.transform()` still runs after a failed `.refine()` on Zod v4. Use `.pipe()` or conditional logic inside the transform to avoid crashing on bad input. (Applies to the `toneOfVoice` empty-string-to-null transform.)
- `.refine()` runs even after `.min()` / `.max()` already failed unless you set `{ abort: true }` on the first check or chain via `.pipe()`. Decide whether duplicate-check should suppress when the array contains an item already failing min/max — recommendation: use `{ abort: true }` on the inner-item `.min(1)` so the user does not see both "is required" and "must be unique" simultaneously.

### Validation — failure flows (per-field, probe-asserted)

| Field | Bad input | Expected status |
|---|---|---|
| `toneOfVoice` | string of length > `BRAND_VOICE_TONE_MAX_LENGTH` after trim | 400 |
| `preferredVocabulary` | `["", "  "]` (item below min length after trim) | 400 |
| `preferredVocabulary` | `["foo", "FOO"]` (case-insensitive duplicate) | 400 |
| `preferredVocabulary` | array length > `BRAND_VOICE_VOCAB_MAX_ITEMS` | 400 |
| `audienceRules` | `[{ audience: "", rule: "hi" }]` | 400 |
| `audienceRules` | `[{ audience: "a", rule: "x" }, { audience: "A", rule: "y" }]` (dup audience) | 400 |

The curated flow file will assert at least one per-table-row case as `expect.status === 400` + `bodyHas: { "$.success": false, "$.error.statusCode": 400 }`. Field-name detail in the error envelope is the standard NestJS exception filter shape (mirrors F1's `admin-create-empty-name-rejected` flow at `.overstory/runtime-contract.flows/sfx-webapp-boilerplate-b859.json` L168) — do not invent a new error response format.

### Shell-level

- `/brands/<id>/voice/edit` renders without a runtime error for an authenticated user with an owned brand.
- For an authenticated user with a brand that does NOT belong to them, `/brands/<id>/voice/edit` shows a top-level "Brand not found" branch (mirror the F1 `notFound` branch in `brand-overview/use-brand-overview.ts` L24-30 of the rendered page). No `403` is shown.
- The voice card on `/brands/<id>` renders the summary OR empty-state and links to `/brands/<id>/voice/edit`. After a successful save, the card updates without a hard refresh (React Query invalidation of `['brand-voice', id]`).
- The F1 `BrandVoiceCardPlaceholder` and its tests are removed from the diff (or at minimum dereferenced from `brand-overview/index.tsx` and removed from the barrel — see §1 "Shell integration").

### Auth-boundary

- The diff does NOT modify `apps/api/src/modules/auth/**`, `apps/api/src/common/auth/**`, `apps/api/src/common/guards/jwt-auth.guard.ts`, `apps/api/src/common/decorators/auth-roles.decorator.ts`, or `apps/web/src/features/auth/**`. Reviewer + probe verify the diff.
- `GET /api/v1/auth/me` continues to return `{ subject, email, roles, isAuthenticated }` unchanged.
- Every brand-voice endpoint carries `@UseGuards(JwtAuthGuard)` and `@ApiBearerAuth('accessToken')`. Probe asserts `401` on missing bearer for both.
- No `OAUTH_*` environment variable is removed or renamed. Builder adds NO new env var — `DATABASE_URL` already works.

### Database — additive-friendly

- New Prisma model `BrandVoice` (`@@map("brand_voice")`). Columns (use F1's `@map`/`@@map` convention; ALL column names snake_case at the DB level):
  - `id String @id @default(cuid())`
  - `brandProfileId String @unique @map("brand_profile_id")` — 1:1 with `brand_profile.id`. UNIQUE enforces 1-row-per-brand.
  - `toneOfVoice String? @map("tone_of_voice")` — nullable text.
  - `preferredVocabulary Json @default("[]") @map("preferred_vocabulary")`
  - `restrictedVocabulary Json @default("[]") @map("restricted_vocabulary")`
  - `messagingPillars Json @default("[]") @map("messaging_pillars")`
  - `writingStyleRules Json @default("[]") @map("writing_style_rules")`
  - `audienceRules Json @default("[]") @map("audience_rules")`
  - `approvedExamplePhrases Json @default("[]") @map("approved_example_phrases")`
  - `rejectedExamplePhrases Json @default("[]") @map("rejected_example_phrases")`
  - `createdAt DateTime @default(now()) @map("created_at")`
  - `updatedAt DateTime @updatedAt @map("updated_at")`
  - Relation: `brandProfile BrandProfile @relation(fields: [brandProfileId], references: [id], onDelete: Cascade)`.
  - `@@map("brand_voice")`.
- `BrandProfile` model in F1's schema MUST be updated to back-reference the relation: add `voice BrandVoice?` (no `@relation` keywords required on the optional 1:1 side; Prisma infers from the FK side). This is the ONLY edit to the F1 model permitted in F2 — purely additive (no DB column, no migration impact on F1's existing rows) and cannot break F1's existing CRUD because no F1 controller/repository references the `voice` accessor.
- Index on `(brandProfileId)` is implicit from `@unique` — do NOT add a redundant `@@index([brandProfileId])`.
- Migration name MUST be `add_brand_voice` (`pnpm db:migrate -- --name add_brand_voice`). Per mulch `mx-325de6` — migrations are NOT auto-created on schema edit. The per-worker `panel-bridge.mjs` auto-applies the new migration directory within ~1.5s — no manual `stack:reset` needed.
- NO destructive changes to F1's `brand_profile` table. The migration SQL MUST contain only `CREATE TABLE "brand_voice"`, the FK constraint with `ON DELETE CASCADE`, and the implicit unique index — nothing else.

---

## 3. Guard contract

| Surface | Auth | Unauth behaviour |
|---|---|---|
| Web `/brands/<id>/voice/edit` | authenticated | `AuthGate` already redirects unauth users to oauth2-proxy login (existing chain in `apps/web/src/features/auth/**`). F2 does NOT add a new redirect path. |
| API `GET /api/v1/brands/:id/voice` | authenticated, owner-scoped via brand | `401` unauth; `404` if brand not owned. `200` (even with empty payload) if owned brand exists. |
| API `PUT /api/v1/brands/:id/voice` | authenticated, owner-scoped via brand | `401` unauth; `404` if brand not owned; `400` on body validation failure; `200` on upsert. |

Ownership = `BrandProfile.ownerSubject === request.user.subject` for the brand id in the path. The brand-voice repository's `findByBrand(brandProfileId, ownerSubject)` and `upsertForBrand(brandProfileId, ownerSubject, payload)` MUST take both arguments and return `null` (or refuse to write) when the brand is not owned. The controller maps `null` to `NotFoundException` and NEVER returns `ForbiddenException`. This is the **mulch `mx-b562ca` pattern** applied a second time.

Implementation note: the repository SHOULD perform the ownership check + voice access in a single SQL round-trip where possible (`findFirst({ where: { brandProfileId, brandProfile: { ownerSubject } } })` for GET; for PUT, do a guard `findFirst` on the brand FIRST and short-circuit to `null` if not owned, THEN call `prisma.brandVoice.upsert({ where: { brandProfileId }, create: { brandProfileId, ...payload }, update: payload })`). Two-round-trip implementations are acceptable as long as they preserve the 404-on-not-owned semantics — DO NOT short-circuit on a `Prisma.NotFoundError` from `upsert` directly, because that leaks "row absent" vs "brand absent" timing. The `build-verifiable-features` skill calls this out as the "permission-before-existence ordering" pitfall.

---

## 4. Contract annotations the builder must maintain

The flows-generator reads NestJS Swagger decorators + Zod `.openapi()` annotations + the runtime-contract overlay. The builder MUST keep these annotations current — they ARE the contract. Mirror the F1 `BrandProfileController` pattern (`apps/api/src/modules/brand-profile/application/controllers/brand-profile.controller.ts`) exactly.

### NestJS files to annotate (apps/api)

- `apps/api/src/modules/brand-voice/brand-voice.module.ts` — wire controllers + providers. Mirror F1's pattern (`apps/api/src/modules/brand-profile/brand-profile.module.ts`):
  - Local `PRISMA_CLIENT` token at `apps/api/src/modules/brand-voice/infrastructure/prisma-client.token.ts` (mirror F1's `apps/api/src/modules/brand-profile/infrastructure/prisma-client.token.ts`). Do NOT reuse F1's token — module isolation is the convention here.
  - Provider for `BRAND_VOICE_REPOSITORY` → `BrandVoiceRepository`.
  - Provider for the existing F1 `BRAND_PROFILE_REPOSITORY` — F2 needs the brand-profile repository to do its ownership check. F2 has TWO options to obtain it without touching F1: (a) import `BrandProfileModule` and have it export `BRAND_PROFILE_REPOSITORY` (requires a one-line `exports: [BRAND_PROFILE_REPOSITORY]` addition to F1's module — counts as a minimal F1 edit, permitted under "exports-only" — see §6 "Permitted but with care"); (b) declare a sibling provider in `BrandVoiceModule` that resolves to the same Prisma-backed implementation (duplicated wiring, no F1 edit). Recommended: **(a) — add the single `exports` line to `BrandProfileModule`**, document in the PR, since it preserves DI singleton semantics. The path-boundary hook does NOT block additive `exports` declarations on F1's module file.
  - Import `AuthModule` (mirrors F1).
- `apps/api/src/modules/brand-voice/application/controllers/brand-voice.controller.ts`:
  - Class-level `@ApiTags('brand-voice')` and `@Controller('brands/:id/voice')`. Using `id` as the path-param name (NOT `brandId`) matches F1's `:id` convention so existing chain-capture from F1's POST `/brands` (`@ResourceCaptures({ fromPath: 'id', resource: 'brandProfile', pathParam: 'id' })` at `apps/api/src/modules/brand-profile/application/controllers/brand-profile.controller.ts` L75) substitutes correctly.
  - Methods:
    - `@Get()` `getVoice` → `@UseGuards(JwtAuthGuard)`, `@ApiBearerAuth('accessToken')`, `@ApiOperation({ summary: ... })`, `@ApiParam({ name: 'id', type: String, example: 'cuid12345' })`, `@ApiResponse({ status: 200, type: ApiEnvelopeDto(BrandVoiceDto) })`, `@ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })`, `@ApiResponse({ status: 404, description: 'Brand not found or not owned by caller' })`.
    - `@Put()` `upsertVoice` → all of the above + `@ApiBody({ type: BrandVoiceWriteDto, examples: { empty: { summary: 'Empty/clear', value: {} }, populated: { summary: 'Populated', value: { toneOfVoice: '...', preferredVocabulary: ['..'], ...all 8 } } } })`, `@ApiResponse({ status: 200, type: ApiEnvelopeDto(BrandVoiceDto) })`, `@ApiResponse({ status: 400, description: 'Validation failed' })`.
  - Parameter binding: `@Body(new ZodValidationPipe(brandVoiceWriteSchema)) body: BrandVoiceWriteInput`. NOT handler-level `@UsePipes` (mx-4d4764).
  - Constructor injection MUST use `@Inject(BRAND_PROFILE_REPOSITORY)` + `@Inject(BRAND_VOICE_REPOSITORY)` on EACH parameter (no positional shortcut). Per `build-verifiable-features` skill / tsx+esbuild reflect-metadata constraint.
  - Body normalisation: in the controller (after the Zod pipe), `toneOfVoice = (typeof body.toneOfVoice === 'string' && body.toneOfVoice.length === 0) ? null : body.toneOfVoice ?? null`. The Zod transform should already handle this — the controller belt-and-suspenders for direct Prisma calls.
- `apps/api/src/modules/brand-voice/application/dto/brand-voice.dto.ts` — every `@ApiProperty()` MUST declare `type:` explicitly. The seven JSONB list fields:
  - Six string-lists: `@ApiProperty({ type: [String] }) declare preferredVocabulary: readonly string[];` etc.
  - `audienceRules`: `@ApiProperty({ type: [AudienceRuleDto] }) declare audienceRules: readonly AudienceRuleDto[];`.
  - Nullable timestamps + tone: `@ApiProperty({ type: String, nullable: true, format: 'date-time' })` etc.
- `apps/api/src/modules/brand-voice/application/dto/brand-voice-write.dto.ts` — analogous shape, all 8 fields `required: false` and `default` documented for the JSONB lists. The Swagger `examples:` on the controller's `@ApiBody` doubles as the canonical example payload.
- `apps/api/src/modules/brand-voice/application/dto/audience-rule.dto.ts` — `audience: string` + `rule: string`, both `@ApiProperty({ type: String })`. This DTO is referenced from both `BrandVoiceDto` and `BrandVoiceWriteDto`.
- `apps/api/src/modules/brand-voice/data/repositories/brand-voice.repository.ts` — implements `IBrandVoiceRepository` from `@sfx/domain`. Inject `PRISMA_CLIENT` (the local one) via `@Inject`. Mirror F1's `apps/api/src/modules/brand-profile/data/repositories/brand-profile.repository.ts` shape, including the `toDomain` row mapper.
- `apps/api/src/app.module.ts` — register the new `BrandVoiceModule` in the `imports` array alongside `BrandProfileModule` and `HealthModule`. Insertion order matters for the docs page order — put `BrandVoiceModule` right after `BrandProfileModule`.

The `@ResourceCaptures` decorator is NOT needed on F2's endpoints because neither `GET` nor `PUT /brands/:id/voice` creates a chainable resource — the brand `:id` itself is captured by F1's POST `/brands` via the existing `@ResourceCaptures`. F2's curated flow reuses that chain.

### Zod schemas (packages/validation)

- `packages/validation/src/schemas/brand-voice.schema.ts`: `brandVoiceWriteSchema`, `brandVoiceSchema`, inferred types `BrandVoiceWriteInput` and `BrandVoiceShape`, and the `BRAND_VOICE_*` constants.
- `packages/validation/src/index.ts`: re-export the new schemas, inferred types, and constants. Do NOT remove F1's exports.
- The schema file MUST `import '../openapi'` for the side-effect (mirror `brand-profile.schema.ts` L2) so `.openapi()` calls register.

### Domain (packages/domain)

- `packages/domain/src/entities/brand-voice.ts`: `BrandVoice` readonly interface. Fields:
  - `id: string`
  - `brandProfileId: string`
  - `toneOfVoice: string | null`
  - `preferredVocabulary: readonly string[]`
  - `restrictedVocabulary: readonly string[]`
  - `messagingPillars: readonly string[]`
  - `writingStyleRules: readonly string[]`
  - `audienceRules: readonly AudienceRule[]`
  - `approvedExamplePhrases: readonly string[]`
  - `rejectedExamplePhrases: readonly string[]`
  - `createdAt: Date | null`
  - `updatedAt: Date | null`
  - `AudienceRule`: `{ readonly audience: string; readonly rule: string }` (exported alongside).
- `packages/domain/src/contracts/brand-voice-repository.ts`: `IBrandVoiceRepository` interface (mirror F1's location: `packages/domain/src/contracts/brand-profile-repository.ts`):
  - `findByBrand(brandProfileId: string, ownerSubject: string): Promise<BrandVoice | null>` — returns the row when owned and present; `null` if either the brand is not owned or no voice row exists yet. **Important:** the controller MUST distinguish "brand not owned" from "no voice row yet" by performing an ownership probe FIRST (via `IBrandProfileRepository.findById(id, ownerSubject)`) — if that returns `null` → 404; otherwise call `findByBrand` and synthesise the empty payload if it returns `null`.
  - `upsertForBrand(brandProfileId: string, ownerSubject: string, payload: BrandVoiceUpsertInput): Promise<BrandVoice | null>` — returns the upserted row, or `null` if the brand is not owned.
  - `BrandVoiceUpsertInput`: same shape as the eight schema fields post-Zod-transform (readonly types).
- `packages/domain/src/index.ts`: append (do NOT remove F1 exports) `BrandVoice`, `AudienceRule`, `IBrandVoiceRepository`, `BrandVoiceUpsertInput`, and a `BRAND_VOICE_REPOSITORY` DI symbol.

### Prisma (packages/database)

- `packages/database/prisma/schema.prisma`: add the `BrandVoice` model defined in §2 AND add the `voice BrandVoice?` back-relation to the existing `BrandProfile` model. Do NOT alter any existing F1 columns.
- New migration directory `packages/database/prisma/migrations/<timestamp>_add_brand_voice/migration.sql`. The migration MUST be additive only.

### Frontend (apps/web)

- `apps/web/src/features/brand-voice/` — full clean-architecture layout mirroring `apps/web/src/features/brand-profile/`:
  - `data/remote/fetch-brand-voice.ts` — `executeRequest('api/v1/brands/<id>/voice', GET)`, unwraps `response.data.data`. Mirror `apps/web/src/features/brand-profile/data/remote/fetch-brand-by-id.ts`.
  - `data/remote/upsert-brand-voice.ts` — `executeRequest(..., PUT)`, unwraps envelope. Mirror `apps/web/src/features/brand-profile/data/remote/update-brand.ts`.
  - `data/model/brand-voice-data-model.ts` — DTO interface matching the API response (8 fields + `brandProfileId` + nullable timestamps).
  - `data/mapper/map-to-brand-voice.ts` — coerce `createdAt`/`updatedAt` ISO strings to `Date | null`; pass-through the eight content fields unchanged. Exports `BrandVoice` UI-side type alongside `mapToBrandVoice`.
  - `data/repositories/use-brand-voice-repository.ts` — React Query `useQuery({ queryKey: ['brand-voice', brandId], queryFn: ..., select: mapToBrandVoice, enabled: id !== null && id.length > 0 })`. Mirror `apps/web/src/features/brand-profile/data/repositories/use-brand-by-id-repository.ts`.
  - `data/repositories/use-upsert-brand-voice-mutation.ts` — `useMutation` that invalidates `['brand-voice', brandId]` on `onSettled`. Per mulch `mx-1d0874` (foundational React-Query gotcha): use `exact: true` on the invalidation to avoid prefix-match refetching unrelated keys.
  - `presentation/pages/voice-edit/` — page hook + UI model + index for `/brands/<id>/voice/edit`. Page hook:
    - Calls `useBrandVoiceRepository(brandId)` for initial form values (loading + notFound + error branches).
    - Uses RHF + `zodResolver(brandVoiceWriteSchema)` from `@sfx/validation` (re-exported via a presentation-layer validator at `presentation/validators/brand-voice-form.ts` — mirror F1's `apps/web/src/features/brand-profile/presentation/validators/brand-profile-form.ts`).
    - Calls `useUpsertBrandVoiceMutation()` on submit. On success → `router.push(brandRoute(brandId))`. Mirror `apps/web/src/features/brand-profile/presentation/pages/new-brand/use-new-brand.ts` for the imperative `router.push` pattern (NOT calling `router.push` inside the mutation `onSuccess`; the hook controls navigation).
    - `useCallback`-wrap every returned function (project Hook Return Audit rule).
  - `presentation/components/BrandVoiceCard/` — read-only summary card. Reads `useBrandVoiceRepository(brandId)`. Branches:
    - `isLoading`: skeleton (NOT a "Loading…" string — per project ADR-006).
    - `error` (non-404): use the same destructive-text pattern as F1's `BrandOverviewPage` error branch.
    - `notFound` (404 from API): same destructive-text "Brand not found" pattern. The brand-overview page handles this at a higher level; the card SHOULD gracefully render the empty state if a card-only fetch fails — the page-level guard means this branch is mostly defensive.
    - Empty (no voice row OR all fields empty): render the empty-state with section title `brandVoiceSectionTitle` and CTA `editBrandVoice` linking to `${brandRoute(brandId)}/voice/edit`. Match the existing Tailwind shell: `rounded-lg border border-border bg-card p-6` for visual continuity with `BrandVoiceCardPlaceholder`.
    - Populated: tone-of-voice as `<p>` (multiline; preserve whitespace via `whitespace-pre-wrap`); each non-empty list as a labelled subsection. For long lists, show up to N chips/items (e.g. first 5) with a "+M more" indicator that LINKS to the edit page (no in-card expansion — keeps the card compact).
  - `presentation/components/VoiceEditForm/` — the eight-field form. Uses RHF + `useFieldArray` for the six string-list fields, a nested `useFieldArray` for `audienceRules`, and a plain `<textarea>` for `toneOfVoice`. All labels via `useTranslations('common')`. Submit handler delegates to the page hook's `handleSubmit`. Server validation errors (rare; client should catch them) render as a non-field-level banner via the existing `serverError` state pattern in F1's `new-brand` hook.
  - `presentation/components/StringListField/` — generic add/remove string-row control (recommended — eliminates copy-paste across the six string-list fields). Props: `label`, `addRowLabel`, `removeRowLabel`, `placeholder`, `name` (RHF field name), `maxItems`, `itemMaxLength`, plus the validation message keys. Alternative: inline per-field — both acceptable, builder picks one and documents in PR.
  - `presentation/components/AudienceRuleListField/` — two-input audience+rule rows. Mirrors `StringListField` shape.
  - `presentation/validators/brand-voice-form.ts` — RHF `zodResolver(brandVoiceWriteSchema)`. Re-export `BrandVoiceFormValues = z.infer<typeof brandVoiceWriteSchema>` (or use the `BrandVoiceWriteInput` from `@sfx/validation` directly).
  - Co-located `__tests__/` for each of: `BrandVoiceCard`, `VoiceEditForm`, `StringListField`, `AudienceRuleListField`, `use-voice-edit`, `map-to-voice-edit-page-ui-model`, `use-brand-voice-repository`, `use-upsert-brand-voice-mutation`, `mapToBrandVoice`, `fetch-brand-voice`, `upsert-brand-voice`, `voice-edit-page` (integration). Full coverage per project rule (>=90%).
  - `constants.ts`:
    - `brandVoiceEndpoint(brandId: string): string` builder → `` `api/v1/brands/${brandId}/voice` ``
    - `brandVoiceQueryKey(brandId: string): readonly [string, string]` → `['brand-voice', brandId] as const`
    - `voiceEditRoute(brandId: string): string` → `` `/brands/${brandId}/voice/edit` ``
    - Re-export `BRAND_VOICE_*` numeric constants from `@sfx/validation` (mirror F1's `BRAND_NAME_MAX_LENGTH` re-export in `apps/web/src/features/brand-profile/constants.ts`).
  - `index.ts` — barrel exporting `BrandVoiceCard`, `VoiceEditPage`, `brandVoiceQueryKey`.
- `apps/web/src/app/brands/[id]/voice/edit/page.tsx` — thin wrapper. Awaits `params` like F1's `apps/web/src/app/brands/[id]/page.tsx`:
  ```tsx
  import type { ReactNode } from 'react';
  import { AuthGate } from '@/features/auth';
  import { AppShell } from '@/features/app-shell';
  import { VoiceEditPage } from '@/features/brand-voice';

  interface VoiceEditRouteProps {
    readonly params: Promise<{ readonly id: string }>;
  }

  export default async function Page({ params }: VoiceEditRouteProps): Promise<ReactNode> {
    const { id } = await params;
    return (
      <AuthGate>
        <AppShell>
          <VoiceEditPage brandId={id} />
        </AppShell>
      </AuthGate>
    );
  }
  ```
- `apps/web/src/features/brand-profile/presentation/pages/brand-overview/index.tsx` — replace the `<BrandVoiceCardPlaceholder ... />` render with `<BrandVoiceCard brandId={brandId} />` (imported from `@/features/brand-voice`). The `<VisualIdentityCardPlaceholder>` render STAYS — F3 will swap that one. Remove the placeholder import.
- `apps/web/src/features/brand-profile/presentation/pages/brand-overview/map-to-brand-overview-page-ui-model.ts` — remove `brandVoiceTitle`, `brandVoiceCtaLabel`, `brandVoiceCtaHref` from the UI model and their assertions in `__tests__/map-to-brand-overview-page-ui-model.test.ts` + `__tests__/BrandOverviewPage.test.tsx`. Keep the equivalent `visualIdentity*` fields.
- `apps/web/src/features/brand-profile/presentation/components/BrandVoiceCardPlaceholder/**` — delete entirely (recommended) OR keep and stop referencing. If deleted, also remove any barrel re-export.
- `apps/web/src/features/brand-profile/index.ts` — only modify if the placeholder is currently exported from the barrel (it is NOT today per `apps/web/src/features/brand-profile/index.ts` L1-5). No-op expected.
- `apps/web/src/features/presentation/localization/languages/en/common.ts` AND `apps/web/src/features/presentation/localization/languages/ro/common.ts` — add new keys (English + Romanian for parity). Minimum new keys:
  - Field labels: `brandVoiceToneOfVoiceLabel`, `brandVoicePreferredVocabularyLabel`, `brandVoiceRestrictedVocabularyLabel`, `brandVoiceMessagingPillarsLabel`, `brandVoiceWritingStyleRulesLabel`, `brandVoiceAudienceRulesLabel`, `brandVoiceApprovedPhrasesLabel`, `brandVoiceRejectedPhrasesLabel`.
  - Sub-labels: `brandVoiceAudienceRuleAudienceLabel`, `brandVoiceAudienceRuleRuleLabel`.
  - List controls: `brandVoiceAddRow`, `brandVoiceRemoveRow`, `brandVoiceEmptyListPlaceholder`.
  - Edit page chrome: `brandVoiceEditPageTitle`, plus reuse existing `save` / `cancel` keys.
  - Empty-state copy on card: `brandVoiceEmptyStateBody` (replacement for the hard-coded English currently in `BrandVoiceCardPlaceholder/index.tsx` L19-20).
  - Validation messages: `brandVoiceValidationToneTooLong`, `brandVoiceValidationListItemRequired`, `brandVoiceValidationListItemTooLong`, `brandVoiceValidationListItemDuplicate`, `brandVoiceValidationAudienceRequired`, `brandVoiceValidationRuleRequired`, `brandVoiceValidationListTooLong` (count exceeded).
  - Both language files MUST have identical keys — TypeScript enforces this via `CommonTranslations` in `apps/web/src/features/presentation/localization/types.ts`. Update `types.ts` to extend `CommonTranslations` with the new keys.

### Tests

- Every new source file MUST have a co-located test file under `__tests__/` OR a sibling `.test.ts(x)`. >=90% coverage. The Stop-hook coverage gate will block close otherwise.
- Backend integration test (Vitest + Supertest + `Test.createTestingModule`, modelled on `apps/api/src/modules/brand-profile/__integration__/brand-profile.integration-test.ts`) covering:
  - GET happy path on owned brand without a voice row → 200 + empty payload.
  - GET happy path on owned brand with a voice row populated by a prior PUT → 200 + populated payload.
  - PUT happy path with an empty body → 200 + empty payload + row exists in repo.
  - PUT happy path with a fully populated body → 200 + every field round-trips.
  - PUT idempotency: same body twice → both return 200 with identical content.
  - Validation failures (per §2 table) → 400.
  - Anonymous → 401 for both methods.
  - Cross-tenant → 404 for GET AND PUT.
  - Brand-delete cascade: admin creates a brand, PUTs voice, F1's DELETE removes the brand, subsequent GET voice → 404. (Note: this requires both repositories injected — easiest via the integration harness's in-memory pair.)
- Backend repository unit test against an `InMemoryBrandVoiceRepository` covering all `IBrandVoiceRepository` methods and ownership-scoping branches. Mirror F1's `apps/api/src/modules/brand-profile/data/repositories/__tests__/brand-profile.repository.test.ts`.
- Backend module wiring test: confirm `BRAND_VOICE_REPOSITORY` resolves to `BrandVoiceRepository` and that the controller can be resolved (mirror `brand-profile.module.test.ts`).
- Frontend integration test at `apps/web/src/features/brand-voice/__integration__/voice-edit.integration-test.tsx` — mirror `apps/web/src/features/brand-profile/__integration__/brands-dashboard.integration-test.tsx`. MSW-driven, covers: empty state, populated state, save success (page navigates back), save validation failure, brand-deleted-out-of-band 404.
- Page tests for `VoiceEditPage` and `BrandVoiceCard` use `@testing-library/react` + mocked repositories. Mock at the repository boundary, not at `executeRequest` (apps/web/CLAUDE.md gotcha — boundary mocking is the convention).
- Zod schema unit tests covering each validation rule in §2 table.

### Runtime contract overlay (NOT runtime-contract.flows)

- `.runtime-contract.overlay.json` — the builder MAY add visible-page tokens for `/brands/<id>/voice/edit` (currently `routes: {}` is empty — F1 didn't populate it either). Do NOT add `overlay.flows` (retired) or `overlay.ignore[]` entries for new paths — both will be rejected by the contract compiler.

### Flow file (owned by lead — builder must NOT edit)

- `.overstory/runtime-contract.flows/sfx-webapp-boilerplate-6fba.json` — lead authors via the `task-flow-authoring` skill. The expected coverage (mirror the F1 shape at `.overstory/runtime-contract.flows/sfx-webapp-boilerplate-b859.json`):
  - `anon-get-voice-blocked`: GET `/brands/non-existent-id/voice` with anonymous → 401.
  - `anon-upsert-voice-blocked`: PUT `/brands/non-existent-id/voice` with anonymous + `body: {}` → 401.
  - `admin-get-voice-empty`: admin POST brand → admin GET voice → 200 + body has `$.success: true`, `$.data.brandProfileId: "${brandId}"`, `$.data.toneOfVoice: null`, `$.data.preferredVocabulary: { type: array }` (or `[]`), `$.data.audienceRules: { type: array }`.
  - `admin-upsert-voice-empty`: admin POST brand → admin PUT voice `body: {}` → 200 + body same shape as `admin-get-voice-empty`.
  - `admin-upsert-voice-populated`: admin POST brand → admin PUT voice with all 8 fields populated → 200 + every field round-trips.
  - `admin-upsert-then-get-roundtrip`: admin POST brand → admin PUT voice → admin GET voice → GET returns the just-PUT payload (mirror F1's `admin-update-roundtrip` chain).
  - `admin-upsert-validation-duplicate-vocab`: admin POST brand → admin PUT voice with `preferredVocabulary: ["foo", "FOO"]` → 400.
  - `admin-upsert-validation-empty-list-item`: admin POST brand → admin PUT voice with `preferredVocabulary: ["  "]` → 400.
  - `admin-upsert-validation-tone-too-long`: admin POST brand → admin PUT voice with a 5000-char `toneOfVoice` → 400.
  - `cross-tenant-get-voice-404`: admin POST brand → viewer GET voice → 404.
  - `cross-tenant-upsert-voice-404`: admin POST brand → viewer PUT voice → 404.
  - `brand-delete-cascade-voice-404`: admin POST brand → admin PUT voice → admin DELETE brand → admin GET voice → 404.

Each flow uses F1's `brandProfile` resource for `${brandId}` capture and `_shared.json`'s `admin` / `viewer` / `anonymous` actors.

The lead's flow file is what makes the curated coverage credit per mulch `mx-cd88c5` / `mx-e2ad2d` operate correctly. The builder responds to flow-file failures via the `flow-failure-response` skill — NEVER edits the JSON.

---

## 5. Implementation notes the builder must read before writing code

- **Read F1 first.** Mirror `apps/api/src/modules/brand-profile/**` exactly for module/controller/repository layout. Mirror `apps/web/src/features/brand-profile/**` exactly for the frontend clean-architecture layout. The two-call ownership pattern is documented at mulch `mx-b562ca` — read it.
- **Skill invocations BEFORE writing code:** invoke `nestjs-probe-coverage` before the controller, invoke `build-verifiable-features` before the DTO classes (for the `@ApiProperty({ type: ... })` + `@Inject(TOKEN)` reminders), invoke `clean-architecture` before the module scaffold, invoke `page-pattern` before `VoiceEditPage`. Do this via the `Skill` tool — NOT by reading SKILL.md files (SKILL_BYPASS failure mode).
- **Ownership-scoped repository.** The brand-voice repository MUST take `(brandProfileId, ownerSubject)` on every method and return `null` when the brand is not owned. The controller MUST do the ownership check via the F1 `BrandProfileRepository` AND short-circuit to `NotFoundException` BEFORE attempting to upsert. Otherwise PUT would silently create a voice row for a brand the caller does not own.
- **Order of operations in `upsertForBrand`:** verify brand ownership FIRST (read `brand_profile` by `(id, ownerSubject)`); on null → return null (controller → 404). Then `prisma.brandVoice.upsert({ where: { brandProfileId }, create: { brandProfileId, ...payload }, update: payload })`. Per `build-verifiable-features` "permission-before-existence ordering".
- **GET semantics on an owned brand with no voice row:** the controller MUST synthesise the empty payload from the schema defaults rather than persisting a placeholder row. The flows generator expects `200` (not `204`, not `404`) and the body MUST match `brandVoiceSchema` with empty defaults. Do NOT eagerly create a row on first read.
- **Body normalisation:** `toneOfVoice` empty-string (after the Zod trim transform) MUST be persisted as SQL `NULL`. The repository's `upsertForBrand` accepts the post-transform value (`string | null`) — the Zod transform plus a defensive controller-level coalesce both apply.
- **Zod refines after shape assembly.** Apply `.refine()` (the duplicate-check rules) AFTER `.default([])` and AFTER any `.transform()`. Do NOT `.merge()` or `.extend()` after refining (mulch + project-level Zod gotcha — silent drop).
- **Zod `.transform()` after a failed refine** still runs on v4 (project-level Zod gotcha). Guard transforms with `.pipe()` or conditional logic inside the transform to avoid crashing on bad input.
- **Zod `.refine()` runs even after `.min()` / `.max()` already failed.** Use `{ abort: true }` on the inner-item `.min(1)` so the user does not see "is required" + "must be unique" simultaneously.
- **`@UsePipes` placement.** `ZodValidationPipe(brandVoiceWriteSchema)` MUST be bound to the `@Body()` parameter, NOT at the handler level. Per mulch `mx-4d4764`.
- **`@Inject(TOKEN)` per ctor param.** Every parameter of every NestJS class constructor MUST be `@Inject(...)`-decorated explicitly. tsx + esbuild reflect-metadata is unreliable for `design:paramtypes`. Per `build-verifiable-features` skill / meta-principle (B).
- **`@ApiProperty({ type: ... })` on every field.** The seven JSONB list fields MUST declare element type via `type: [String]` (or `type: [AudienceRuleDto]`). The two timestamp fields declare `type: String, format: 'date-time', nullable: true`. Per `build-verifiable-features` skill / meta-principle (B).
- **NO new `@ResourceCaptures` decorator.** Neither GET nor PUT creates a chainable resource. The brand id is captured by F1's POST `/brands` already; the curated flow chains via `${brandId}` substitution.
- **Migration command.** Run `pnpm db:migrate -- --name add_brand_voice` BEFORE `pnpm probe:smoke` — the panel-bridge auto-applies the migration but ONLY after the directory exists. Per mulch `mx-325de6`, schema-edit alone does NOT create a migration.
- **Probe expectations.** Run `pnpm probe:smoke` against the booted stack. If it reports `RESOURCE_CAPTURE_*`, you missed `@ResourceCaptures` somewhere on F1 (don't touch F1) — mail the lead. If it reports `CONTRACT_STATUS_UNREACHABLE_UNGENERATABLE` for `/brands/:id/voice:200` or similar, you missed an `@ApiResponse` declaration — invoke `nestjs-probe-coverage` §2.8. If a `FLOW_STEP_FAILED` references `sfx-webapp-boilerplate-6fba:*`, invoke `flow-failure-response` — NEVER edit the flow JSON. The path-boundary hook blocks any edit attempt and emits `FLOW_OWNERSHIP_VIOLATION`.
- **Mulch `mx-cd88c5` / `mx-e2ad2d`.** Curated coverage credit for `/brands/:id/voice:200` paths depends on the operator's resolution of these two records (Option A' vs B vs C). r5/r6's `apiPrefix`-prefix tuple fix landed on master via `975f936` and cleared the two F1 `/auth/me:200` + `/brands:200` failures. F2's voice endpoints SHOULD inherit that fix. If the probe nonetheless reports `CONTRACT_STATUS_UNREACHABLE` on `/brands/:id/voice:200` despite curated flows passing at runtime, mail the lead with the exact failure shape — do NOT patch the hook code or re-architect the flow file. Operator wants the precise failure to disambiguate.
- **F1 `BrandProfileModule` exports edit.** Recommended approach to inject `BRAND_PROFILE_REPOSITORY` into `BrandVoiceModule`: append a one-line `exports: [BRAND_PROFILE_REPOSITORY]` to F1's `apps/api/src/modules/brand-profile/brand-profile.module.ts`. Then `BrandVoiceModule` does `imports: [AuthModule, BrandProfileModule]` and the controller `@Inject(BRAND_PROFILE_REPOSITORY)` resolves to the same singleton. This is the ONLY edit to F1's brand-profile module permitted by F2 — additive `exports` only, no logic change.
- **`worker_done` evidence.** MUST include BOTH:
  - `## runtime-evidence` — full `pnpm probe:smoke` JSON summary, EXIT 0, every `:200` / `:404` curated flow PASS, zero CONTRACT_STATUS_UNREACHABLE for `/brands/:id/voice:*`.
  - `## qa-test-evidence` — report path under `.claude/hook-reports/qa-test-<task>-<hash>.md`, mode=full, flows verified covering every spec feature (voice edit happy + empty + populated + validation + cross-tenant + brand-delete-cascade), final FAILED=0 CRITICAL=0 HIGH=0.

---

## 6. Files in F2 builder's scope

Builder may create or modify ONLY these paths. Anything else (especially F1's brand-profile feature internals, the auth module, the runtime-contract.flows folder, the common decorators) is OFF LIMITS and requires a mail to the lead.

In scope (new tree):
- `packages/domain/src/entities/brand-voice.ts` + `__tests__/`
- `packages/domain/src/contracts/brand-voice-repository.ts` + `__tests__/` (interface tests can be minimal — at least a type-only assertion file; runtime test if there's runtime code such as a token constant assertion)
- `packages/validation/src/schemas/brand-voice.schema.ts` + `__tests__/`
- `packages/database/prisma/migrations/<timestamp>_add_brand_voice/migration.sql` (generated by `pnpm db:migrate`)
- `apps/api/src/modules/brand-voice/` (new tree mirroring `modules/brand-profile/` layout: `brand-voice.module.ts`, `application/controllers/`, `application/dto/`, `data/repositories/`, `infrastructure/prisma-client.token.ts`, and matching `__tests__/` and `__integration__/`)
- `apps/web/src/features/brand-voice/` (new tree mirroring `features/brand-profile/`)
- `apps/web/src/app/brands/[id]/voice/edit/page.tsx` (thin wrapper)

In scope (additive modifications only):
- `packages/domain/src/index.ts` (re-export new items; do NOT remove F1 exports)
- `packages/validation/src/index.ts` (re-export new items)
- `packages/database/prisma/schema.prisma` (add `BrandVoice` model + the `voice BrandVoice?` back-reference on `BrandProfile`; do NOT alter F1 columns)
- `apps/api/src/app.module.ts` (add `BrandVoiceModule` to `imports`; do NOT remove existing imports)
- `apps/api/src/modules/brand-profile/brand-profile.module.ts` (append `exports: [BRAND_PROFILE_REPOSITORY]` — ONLY this one-line addition; do NOT change any other line of F1's module)
- `apps/web/src/features/brand-profile/presentation/pages/brand-overview/index.tsx` (swap `<BrandVoiceCardPlaceholder>` for `<BrandVoiceCard>`; leave `<VisualIdentityCardPlaceholder>` alone — F3 owns it)
- `apps/web/src/features/brand-profile/presentation/pages/brand-overview/map-to-brand-overview-page-ui-model.ts` (remove voice-card UI-model fields; keep visual-identity fields)
- `apps/web/src/features/brand-profile/presentation/pages/brand-overview/__tests__/*` (update assertions to match the new card; do NOT regress the unchanged Visual Identity placeholder branch)
- `apps/web/src/features/brand-profile/presentation/components/BrandVoiceCardPlaceholder/**` (delete entirely — recommended — OR keep and stop referencing; document choice)
- `apps/web/src/features/brand-profile/index.ts` (no-op expected; only modify if the placeholder is currently exported)
- `apps/web/src/features/presentation/localization/languages/en/common.ts` (add new keys)
- `apps/web/src/features/presentation/localization/languages/ro/common.ts` (add new keys; identical key set to English)
- `apps/web/src/features/presentation/localization/types.ts` (extend `CommonTranslations` with the new keys)
- `.runtime-contract.overlay.json` (modify only to add page tokens for `/brands/<id>/voice/edit` if needed; NEVER add `flows` / `ignore` entries)

OFF LIMITS (cite this list in any mail to the lead):
- `apps/api/src/modules/auth/**`
- `apps/api/src/modules/brand-profile/**` EXCEPT the one-line `exports: [BRAND_PROFILE_REPOSITORY]` addition described above (F1-owned; voice cascade is enforced at the F2-owned FK on `brand_voice`)
- `apps/api/src/modules/brand-profile/infrastructure/prisma-client.token.ts` (F1-owned; F2 creates its own under `apps/api/src/modules/brand-voice/infrastructure/`)
- `apps/api/src/common/auth/**`, `apps/api/src/common/guards/jwt-auth.guard.ts`, `apps/api/src/common/decorators/auth-roles.decorator.ts`, `apps/api/src/common/decorators/resource-captures.decorator.ts`, `apps/api/src/common/dto/envelope.dto.ts`, `apps/api/src/common/filters/**`, `apps/api/src/common/interceptors/**`, `apps/api/src/common/pipes/**`
- `apps/web/src/features/auth/**`
- `apps/web/src/features/app-shell/**` (F1-owned)
- `apps/web/src/stores/active-brand-store.ts` (F1-owned — F2 reads via `useActiveBrandStore` but does NOT mutate the store API)
- `apps/web/src/features/brand-profile/**` EXCEPT the brand-overview swap + UI-model fields + placeholder deletion described above
- `.overstory/runtime-contract.flows/**` (lead-owned; hook-blocked anyway; `FLOW_OWNERSHIP_VIOLATION` if attempted)
- `.flows.generated.json`, `.matrix.json`, `.runtime-contract.logical.json` (hook-blocked)
- Anything outside the worktree (PATH_BOUNDARY_VIOLATION).
- F3 territory: any `visual-identity` Prisma model, NestJS module, web feature, or page (those are `sfx-webapp-boilerplate-cfeb` — scout-visual-identity is producing that spec in parallel).

---

## 7. Definition of done

- Both endpoints in §2 implemented, tested (unit + integration), and behind `JwtAuthGuard` + `@ApiBearerAuth('accessToken')`.
- `/brands/<id>/voice/edit` renders for an authenticated owned-brand user without console errors and round-trips PUT → GET via the curated flow.
- `BrandVoiceCard` on `/brands/<id>` renders empty-state (zero-state) and summary (populated state) without console errors and updates without a hard refresh after a successful save.
- Cross-tenant probe returns `404` (NOT `403`, NOT `200`, NOT `500`) for both `GET` and `PUT /brands/:id/voice`.
- Brand-delete cascade test: deleting the brand via F1's endpoint removes the voice row; subsequent GET → `404`.
- All Zod validation rules enforced server-side: empty list item → 400, case-insensitive duplicate → 400, item-too-long → 400, list-too-many-items → 400, tone-too-long → 400, audience-rule duplicate → 400.
- `pnpm typecheck`, `pnpm lint`, `pnpm test:coverage` (>=90%), `pnpm test:integration`, `pnpm probe:smoke` all pass — EXIT 0 on the probe.
- `worker_done` mail to lead carries the probe JSON summary as a `## runtime-evidence` block AND the QA-test report path as a `## qa-test-evidence` block.
- No diff in OFF-LIMITS paths above (except the one-line `exports` addition to `BrandProfileModule`).
- F3 (`visual-identity`) can begin work without dependency conflicts — F2 and F3 are sibling 1:1 tables hanging off `brand_profile.id`, neither references the other. The `<VisualIdentityCardPlaceholder>` render on `/brands/<id>` is untouched by F2 so F3 can swap it cleanly.
