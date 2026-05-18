<!-- written-by: scout-bg-chunk-b-v1 -->
# Feature spec — Chunk B: Brand Voice + Visual Identity guidelines (per active brand)

Top-level: `sfx-webapp-boilerplate-ba09` (Phase-3 product plan, §3 Chunk B + §5 J2 + §5 J3).
Feature task: `sfx-webapp-boilerplate-72fd`.
Source dispatch: msg-n79a0ihct5e4 (coordinator → scout-bg-chunk-b-v1).
Scout: scout-bg-chunk-b-v1. Mode: direct-builder. Auth scaffold preserved — Keycloak + oauth2-proxy + RS256/JWKS unchanged; no new login/register/HS256/cookie work.

Builds on Chunk A (`sfx-webapp-boilerplate-3e6a`): Brand domain entity + Prisma `Brand` model + `BrandModule` parent + `/api/v1/brands` CRUD + `/admin/brand-guidelines` route shell + `BrandGuidelinesDetailPage` placeholder body + `BrandProfileSelector` + EN/RO translations.

Builder produces backend nested-singleton sub-resources (`/voice` + `/visual`), frontend Brand Voice + Visual Identity forms (mounted as the first two sub-sections of the active brand workspace), localization for both, and a `BRAND_GUIDELINES_SUB_NAV_REGISTRY` that Chunk C will additively extend.

---

## 1. Context (files read)

### Chunk A delivered surface (keep — do not redefine)
- `packages/domain/src/entities/brand.ts` — `Brand` entity (`id, name, slug, ownerUserId, createdAt, updatedAt, deletedAt`). Chunk B adds FKs from `BrandVoice` + `VisualIdentity` to `Brand.id`.
- `packages/domain/src/ports/brand-repository.ts` — `BrandRepository` interface. Chunk B does NOT modify. Adds new ports `BrandVoiceRepository` + `VisualIdentityRepository`.
- `packages/domain/src/index.ts` — type-only barrel. Chunk B appends `BrandVoice`, `UpsertBrandVoiceInput`, `BrandVoiceRepository`, `VisualIdentity`, `UpsertVisualIdentityInput`, `VisualIdentityRepository`, `BrandGuidelineEditor` exports (additive only).
- `apps/api/src/modules/brand/brand.module.ts` — parent NestJS module. Chunk B extends `controllers` + `providers` arrays additively to register `BrandVoiceController`, `VisualIdentityController`, their pipes, and the two new repositories. Does NOT remove or rewrite existing entries.
- `apps/api/src/modules/brand/application/controllers/brand.controller.ts` — `BrandController`. Chunk B does NOT modify any handler body. **Carve-out (mx-3bf156):** the `@ResourceCaptures` decorator on `createBrand` MAY additionally accept tuples with `pathParam: 'brandId'` (same `fromPath: 'id'`, same `resource: 'brand'`) when the probe emits `RESOURCE_CAPTURE_PATHPARAM_UNDECLARED` for the nested `/brands/:brandId/guidelines/*` routes. This single additive edit is permitted without ownership escalation. Builder MUST NOT change any other line of this file.
- `apps/api/src/modules/brand/data/repositories/brand.tokens.ts` — `BRAND_REPOSITORY`, `PRISMA_CLIENT`. Chunk B reuses `PRISMA_CLIENT` (shared singleton) and adds two new tokens `BRAND_VOICE_REPOSITORY`, `VISUAL_IDENTITY_REPOSITORY` in a NEW file `apps/api/src/modules/brand/data/repositories/brand-guidelines.tokens.ts` (does NOT modify `brand.tokens.ts`).
- `packages/validation/src/schemas/brand.schema.ts` — `createBrandSchema`, `renameBrandSchema`, `brandResponseSchema`, `brandIdParamSchema`. Chunk B does NOT modify. Adds new file `packages/validation/src/schemas/brand-guidelines.schema.ts` (or two siblings `brand-voice.schema.ts` + `visual-identity.schema.ts` — builder picks; pattern same).
- `packages/database/prisma/schema.prisma` — `Brand` model present. Chunk B APPENDS two models `BrandVoice` + `VisualIdentity` (each FK → `Brand`, each `@@unique([brandId])` for per-brand singleton). Adds back-relations `voice BrandVoice?` + `visualIdentity VisualIdentity?` on the `Brand` model — single-line additions, no other field touched.

### Chunk A delivered frontend (extend additively)
- `apps/web/src/features/brand-shell/index.ts` — barrel: `BrandGuidelinesEmptyPage`, `BrandGuidelinesDetailPage`. Chunk B keeps both exports, ADDS `BrandGuidelinesSubNav`, `BrandVoiceForm`, `VisualIdentityForm`, plus the `BRAND_GUIDELINES_SUB_NAV_REGISTRY` constant (re-export through the barrel for Chunk C consumers).
- `apps/web/src/features/brand-shell/constants.ts` — currently exports `BRANDS_ENDPOINT`, `BRANDS_QUERY_KEY`. Chunk B APPENDS endpoint constants (`brandGuidelinesVoiceEndpoint(brandId)`, `brandGuidelinesVisualEndpoint(brandId)` — functions, not literals, because the brandId is path-bound), query-key factories (`brandVoiceQueryKey(brandId)`, `visualIdentityQueryKey(brandId)`), AND the `BRAND_GUIDELINES_SUB_NAV_REGISTRY` array. Chunk B does NOT modify existing exports.
- `apps/web/src/features/brand-shell/presentation/pages/brand-guidelines-detail/index.tsx` — Chunk A page. Chunk B REPLACES the inline `<section>placeholder</section>` block with `<BrandGuidelinesSubNav activeBrandId={props.brandId} />` (mounts the sub-nav once per active brand). Builder MAY also re-fit the heading hierarchy if necessary; everything else (loading skeleton, not-found surface, selector mount, navigation handler call) stays.
- `apps/web/src/features/brand-shell/presentation/pages/brand-guidelines-detail/types.ts` + `use-brand-guidelines-detail.ts` + `map-to-brand-guidelines-detail-ui-model.ts` — Chunk B does NOT modify (UIModel `placeholder` block can stay but goes unused; or builder may delete it and adjust the mapper test — minor cleanup, OK to do).
- `apps/web/src/features/brand-shell/presentation/components/BrandProfileSelector/*` — Chunk B does NOT modify.
- `apps/web/src/app/admin/brand-guidelines/[brandId]/page.tsx` — thin wrapper rendering `<BrandGuidelinesDetailPage brandId={brandId} />`. Chunk B does NOT modify.

### Phase-2 reference (read for pattern, do NOT modify)
- `apps/api/src/modules/company-info/data/repositories/company-info.repository.ts` — `upsertSingleton` Prisma `$transaction` pattern. Chunk B mirrors per-brand (`upsertVoiceForBrand`, `upsertVisualForBrand`) — except in B these are NOT yet wrapped in a version-row write; the `BrandGuidelinesVersion` snapshot table is delivered by Chunk D. B writes only the per-brand singleton row.
- `apps/api/src/modules/company-info/application/controllers/company-info.controller.ts` — singleton `GET` + `PUT` controller shape. Chunk B mirrors but mounted at `/brands/:brandId/guidelines/voice` and `/brands/:brandId/guidelines/visual`.
- `apps/api/src/modules/company-info/application/pipes/upsert-company-info.pipe.ts` — `createZodValidationPipe(upsertCompanyInfoSchema)` shape. Mirror for B.
- `apps/api/src/modules/company-info/application/dto/company-info.dto.ts` — `@ApiProperty({ type: ... })` declaration convention (every property explicit). Mirror for B.
- `apps/web/src/features/company-info/presentation/pages/company-info/index.tsx` — `ArrayField` component (lines 142–230). Chunk B EXTRACTS this pattern into a shared component `apps/web/src/features/brand-shell/presentation/components/ArrayField/` (parameterized on row shape) AND/OR re-implements per form — builder picks; preferable is to extract once. If extracted, place under `brand-shell/presentation/components/ArrayField/` (4-file pattern: `index.tsx`, `types.ts`, `use-array-field.ts`, `map-to-array-field-ui-model.ts`) plus a separate `RepeatableRowGroup` for {title, description}-style tuples. Tests follow standard `__tests__/` layout.

### Out-of-scope (DO NOT touch)
- `apps/web/src/features/admin-shell/*` (untouched — Chunk A registry entry already present).
- `apps/web/src/features/company-info/*`, `apps/api/src/modules/company-info/*` (unchanged).
- Any auth file under `apps/api/src/common/auth/*`, `apps/api/src/common/guards/*`, or `apps/web/src/features/auth/*` — Keycloak + oauth2-proxy untouched.
- `apps/api/src/modules/brand/application/controllers/brand.controller.ts` — **EXCEPT** the additive `@ResourceCaptures` tuple per mx-3bf156 carve-out (see §1).
- `packages/database/prisma/schema.prisma` `Brand` model — **EXCEPT** appending `voice BrandVoice?` + `visualIdentity VisualIdentity?` back-relation lines.
- `.overstory/runtime-contract.flows/sfx-webapp-boilerplate-72fd.json` — lead/coordinator authors. Builder does NOT create or edit. The path-boundary hook will block.

---

## 2. Domain (Tasks B-D1, B-D2)

### Task B-D1 — `BrandVoice` entity + port

Create `packages/domain/src/entities/brand-voice.ts`:
```ts
export interface BrandVoiceMessagingPillar {
  readonly title: string;
  readonly description: string;
}

export interface BrandVoiceAudienceRule {
  readonly audience: string;
  readonly rules: string;
}

export interface BrandVoiceApprovedExample {
  readonly phrase: string;
}

export interface BrandVoiceRejectedExample {
  readonly phrase: string;
  readonly reason: string | null;
}

export interface BrandVoice {
  readonly brandId: string;
  readonly tone: string;
  readonly preferredVocabulary: readonly string[];
  readonly restrictedVocabulary: readonly string[];
  readonly messagingPillars: readonly BrandVoiceMessagingPillar[];
  readonly writingStyleRules: string;
  readonly audienceRules: readonly BrandVoiceAudienceRule[];
  readonly approvedExamples: readonly BrandVoiceApprovedExample[];
  readonly rejectedExamples: readonly BrandVoiceRejectedExample[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface UpsertBrandVoiceInput {
  readonly tone: string;
  readonly preferredVocabulary?: readonly string[];
  readonly restrictedVocabulary?: readonly string[];
  readonly messagingPillars?: readonly BrandVoiceMessagingPillar[];
  readonly writingStyleRules?: string | null;
  readonly audienceRules?: readonly BrandVoiceAudienceRule[];
  readonly approvedExamples?: readonly BrandVoiceApprovedExample[];
  readonly rejectedExamples?: readonly BrandVoiceRejectedExample[];
}
```

Create `packages/domain/src/ports/brand-voice-repository.ts`:
```ts
export interface BrandGuidelineEditor {
  readonly editorUserId: string;
  readonly editorDisplayName: string;
}

export interface BrandVoiceRepository {
  findByBrandId(brandId: string): Promise<BrandVoice | null>;
  upsertForBrand(
    brandId: string,
    input: UpsertBrandVoiceInput,
    editor: BrandGuidelineEditor,
  ): Promise<BrandVoice>;
}
```

Extend `packages/domain/src/index.ts` (append, do NOT modify existing lines):
```ts
export type {
  BrandVoice,
  BrandVoiceMessagingPillar,
  BrandVoiceAudienceRule,
  BrandVoiceApprovedExample,
  BrandVoiceRejectedExample,
  UpsertBrandVoiceInput,
} from './entities/brand-voice';
export type {
  BrandVoiceRepository,
  BrandGuidelineEditor,
} from './ports/brand-voice-repository';
```

Tests under `packages/domain/src/entities/__tests__/brand-voice.test.ts` — type-only barrel test (pure type re-export, mirror `packages/domain/src/entities/__tests__/brand.test.ts`). Domain has zero runtime so test asserts the module loads + exported type names resolve.

Acceptance: `pnpm --filter @sfx/domain typecheck && pnpm --filter @sfx/domain test` — green.
Estimated diff: ~80 lines added across 3 files (entity, port, barrel + test).

### Task B-D2 — `VisualIdentity` entity + port

Create `packages/domain/src/entities/visual-identity.ts`:
```ts
export interface VisualIdentityColorPaletteEntry {
  readonly name: string;
  readonly hex: string;
  readonly usageNotes: string | null;
}

export interface VisualIdentityTypographyEntry {
  readonly font: string;
  readonly weight: string;
  readonly usageContext: string | null;
}

export interface VisualIdentity {
  readonly brandId: string;
  readonly logoUsage: string;
  readonly colorPalette: readonly VisualIdentityColorPaletteEntry[];
  readonly typography: readonly VisualIdentityTypographyEntry[];
  readonly spacingGuidance: string;
  readonly imageStyleGuidance: string;
  readonly iconographyGuidance: string;
  readonly usageRestrictions: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface UpsertVisualIdentityInput {
  readonly logoUsage: string;
  readonly colorPalette?: readonly VisualIdentityColorPaletteEntry[];
  readonly typography?: readonly VisualIdentityTypographyEntry[];
  readonly spacingGuidance?: string | null;
  readonly imageStyleGuidance?: string | null;
  readonly iconographyGuidance?: string | null;
  readonly usageRestrictions?: string | null;
}
```

Create `packages/domain/src/ports/visual-identity-repository.ts`:
```ts
export interface VisualIdentityRepository {
  findByBrandId(brandId: string): Promise<VisualIdentity | null>;
  upsertForBrand(
    brandId: string,
    input: UpsertVisualIdentityInput,
    editor: BrandGuidelineEditor,
  ): Promise<VisualIdentity>;
}
```

Extend `packages/domain/src/index.ts` (append):
```ts
export type {
  VisualIdentity,
  VisualIdentityColorPaletteEntry,
  VisualIdentityTypographyEntry,
  UpsertVisualIdentityInput,
} from './entities/visual-identity';
export type { VisualIdentityRepository } from './ports/visual-identity-repository';
```

Tests: matching `__tests__/visual-identity.test.ts`.
Acceptance: typecheck + test green.
Estimated diff: ~70 lines across 3 files.

**Note:** `tone` and `logoUsage` are the singletons' required scalar fields — minimum-non-empty enforced at Zod (§3). Lists default to empty arrays at the data-mapper boundary (§5). `writingStyleRules`, `spacingGuidance`, etc. are optional text fields stored as `""` when client omits — same pattern as CompanyInfo's nullable text fields.

---

## 3. Validation — Zod schemas (Task B-V1, B-V2)

### Task B-V1 — `brand-voice.schema.ts`

Create `packages/validation/src/schemas/brand-voice.schema.ts`:
```ts
import '../openapi';
import { z } from 'zod';

const optionalStringMax = (max: number, description: string) =>
  z.string().max(max).nullish().openapi({ description, example: '' });

const messagingPillarSchema = z
  .object({
    title: z.string().trim().min(1, 'Pillar title is required').max(120),
    description: z.string().trim().min(1, 'Pillar description is required').max(4000),
  })
  .strict()
  .openapi({ description: 'Messaging pillar (title + description)' });

const audienceRuleSchema = z
  .object({
    audience: z.string().trim().min(1).max(200),
    rules: z.string().trim().min(1).max(4000),
  })
  .strict()
  .openapi({ description: 'Audience-specific rule block' });

const approvedExampleSchema = z
  .object({ phrase: z.string().trim().min(1).max(2000) })
  .strict()
  .openapi({ description: 'Approved example phrase' });

const rejectedExampleSchema = z
  .object({
    phrase: z.string().trim().min(1).max(2000),
    reason: z.string().trim().max(2000).nullish().openapi({ example: '' }),
  })
  .strict()
  .openapi({ description: 'Rejected example phrase (optional reason)' });

export const upsertBrandVoiceSchema = z
  .object({
    tone: z
      .string()
      .trim()
      .min(1, 'Tone of voice is required')
      .max(4000, 'Tone must be 4000 characters or fewer')
      .openapi({ description: 'Tone of voice', example: 'Warm, expert, never condescending' }),
    preferredVocabulary: z
      .array(z.string().trim().min(1).max(200))
      .max(256)
      .optional()
      .openapi({ description: 'Preferred vocabulary list', example: ['craft', 'partner'] }),
    restrictedVocabulary: z
      .array(z.string().trim().min(1).max(200))
      .max(256)
      .optional()
      .openapi({ description: 'Restricted vocabulary list', example: ['cheap', 'guarantee'] }),
    messagingPillars: z.array(messagingPillarSchema).max(64).optional()
      .openapi({ description: 'Repeatable messaging pillars' }),
    writingStyleRules: optionalStringMax(4000, 'Writing style rules'),
    audienceRules: z.array(audienceRuleSchema).max(64).optional()
      .openapi({ description: 'Per-audience rule rows' }),
    approvedExamples: z.array(approvedExampleSchema).max(128).optional(),
    rejectedExamples: z.array(rejectedExampleSchema).max(128).optional(),
  })
  .strict()
  .openapi({ description: 'Payload for upserting Brand Voice for a brand' });

export type UpsertBrandVoiceInput = z.infer<typeof upsertBrandVoiceSchema>;

// Response schema for OpenAPI body and admin/agent GET response.
export const brandVoiceResponseSchema = upsertBrandVoiceSchema
  .extend({
    brandId: z.string().min(1).openapi({ description: 'Owning brand id' }),
    createdAt: z.date().openapi({ description: 'Created timestamp' }),
    updatedAt: z.date().openapi({ description: 'Updated timestamp' }),
  })
  .strict()
  .openapi({ description: 'Persisted Brand Voice' });

export type BrandVoiceResponse = z.infer<typeof brandVoiceResponseSchema>;

export const brandIdGuidelineParamSchema = z
  .object({ brandId: z.string().min(1, 'brandId is required') })
  .strict();
export type BrandIdGuidelineParam = z.infer<typeof brandIdGuidelineParamSchema>;
```

Tests: `packages/validation/src/schemas/__tests__/brand-voice.schema.test.ts` — valid payload, missing tone → 400 message, `tone` whitespace-only → 400, every list at max + 1 → 400, unknown key under `.strict()` → 400, nested pillar empty `title` → 400.

### Task B-V2 — `visual-identity.schema.ts`

Create `packages/validation/src/schemas/visual-identity.schema.ts`:
```ts
const HEX_COLOR_REGEX = /^#([0-9a-fA-F]{3}){1,2}$/;

const paletteEntrySchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    hex: z.string().trim().regex(HEX_COLOR_REGEX, 'Invalid hex color (e.g. #1A2B3C)'),
    usageNotes: z.string().trim().max(2000).nullish(),
  })
  .strict();

const typographyEntrySchema = z
  .object({
    font: z.string().trim().min(1).max(120),
    weight: z.string().trim().min(1).max(40),
    usageContext: z.string().trim().max(2000).nullish(),
  })
  .strict();

export const upsertVisualIdentitySchema = z
  .object({
    logoUsage: z
      .string()
      .trim()
      .min(1, 'Logo usage guidance is required')
      .max(4000)
      .openapi({ description: 'Logo usage guidance' }),
    colorPalette: z.array(paletteEntrySchema).max(64).optional(),
    typography: z.array(typographyEntrySchema).max(64).optional(),
    spacingGuidance: optionalStringMax(4000, 'Spacing & layout guidance'),
    imageStyleGuidance: optionalStringMax(4000, 'Image style guidance'),
    iconographyGuidance: optionalStringMax(4000, 'Iconography guidance'),
    usageRestrictions: optionalStringMax(4000, 'Usage restrictions'),
  })
  .strict()
  .openapi({ description: 'Payload for upserting Visual Identity for a brand' });

export const visualIdentityResponseSchema = upsertVisualIdentitySchema
  .extend({
    brandId: z.string().min(1),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .strict();
```

Tests: matching `__tests__/visual-identity.schema.test.ts`. Cover invalid hex (e.g. `'red'`, `'#12'`, `'#GGGGGG'`), valid 3-char + 6-char hex, max array, unknown key.

**Export both schemas + types from `packages/validation/src/index.ts`** (append; do NOT modify existing exports). The barrel test in `packages/validation/src/__tests__/index.test.ts` will need a `'upsertBrandVoiceSchema is exported'` assertion appended (additive).

Estimated diff per task: ~150 lines (schema + 30–40 test cases).

---

## 4. Database — Prisma models + migration (Task B-DB1)

### Task B-DB1 — Prisma models `BrandVoice` + `VisualIdentity`

Append to `packages/database/prisma/schema.prisma`:

```prisma
model BrandVoice {
  brandId              String   @id @map("brand_id")
  tone                 String   @db.Text
  preferredVocabulary  String[] @default([]) @map("preferred_vocabulary")
  restrictedVocabulary String[] @default([]) @map("restricted_vocabulary")
  messagingPillars     Json     @default("[]") @map("messaging_pillars")
  writingStyleRules    String   @default("") @map("writing_style_rules") @db.Text
  audienceRules        Json     @default("[]") @map("audience_rules")
  approvedExamples     Json     @default("[]") @map("approved_examples")
  rejectedExamples     Json     @default("[]") @map("rejected_examples")
  createdAt            DateTime @default(now()) @map("created_at")
  updatedAt            DateTime @updatedAt @map("updated_at")

  brand                Brand    @relation(fields: [brandId], references: [id], onDelete: Cascade)

  @@map("brand_voice")
}

model VisualIdentity {
  brandId             String   @id @map("brand_id")
  logoUsage           String   @db.Text @map("logo_usage")
  colorPalette        Json     @default("[]") @map("color_palette")
  typography          Json     @default("[]")
  spacingGuidance     String   @default("") @map("spacing_guidance") @db.Text
  imageStyleGuidance  String   @default("") @map("image_style_guidance") @db.Text
  iconographyGuidance String   @default("") @map("iconography_guidance") @db.Text
  usageRestrictions   String   @default("") @map("usage_restrictions") @db.Text
  createdAt           DateTime @default(now()) @map("created_at")
  updatedAt           DateTime @updatedAt @map("updated_at")

  brand               Brand    @relation(fields: [brandId], references: [id], onDelete: Cascade)

  @@map("visual_identity")
}
```

Single-line additive edits to the existing `Brand` model — add two back-relation fields immediately above the closing `@@map("brand")` line:
```prisma
  voice          BrandVoice?
  visualIdentity VisualIdentity?
```

**Decisions baked in:**
- `brandId` is BOTH primary key and FK — enforces per-brand singleton at the DB level (no separate `@@unique([brandId])` needed because `@id` already implies uniqueness on a single column).
- `onDelete: Cascade` — Chunk A soft-deletes brands (does not hard-delete), so cascade only fires if a brand is hard-removed. Soft-delete leaves the singleton rows in place (consistent with §5 J7 acceptance "deleted brand's versions are deleted with it" — but per the product plan that decision is "implementation choice in Chunk A" → soft-delete tombstones the slug + sets `deletedAt`, the Voice/Visual rows persist orphan-attached to the soft-deleted brand row until a hard delete sweep). If a future hard-delete is added, cascade triggers.
- `Json` columns default to `"[]"` (empty array literal) — Prisma encodes as the JSON literal `[]`. Mappers (§5) round-trip with `Prisma.InputJsonValue` casts identical to `CompanyInfoVersion.snapshot`.

Run `pnpm db:migrate -- --name add_brand_voice_and_visual_identity` per mulch mx-6d88ea (trust the panel-bridge — the bridge auto-applies the migration within ~1.5s; do NOT run `pnpm stack:reset`). Verify with `pnpm stack:bridge | tail -50`.

After migration applies, the bridge restarts the api watcher and `pnpm db:generate` runs as part of the standard postinstall chain. Confirm `import('@sfx/database').PrismaClient` exposes `prisma.brandVoice` and `prisma.visualIdentity` via a quick typecheck.

Acceptance: `pnpm typecheck && pnpm probe:smoke` (probe at this point still passes; new flows blocked until §6 controllers ship).
Estimated diff: 40 lines schema + 1 new migration directory (auto-generated SQL ~60 lines).

---

## 5. Backend module — nested sub-resources (Tasks B-B1 … B-B6)

Mount points (all under existing `BrandModule`, NO new NestJS module — single module hosts both nested controllers):

| Method | Path | Auth | Behaviour |
|---|---|---|---|
| GET | `/api/v1/brands/:brandId/guidelines/voice` | admin OR agent | 200 with envelope `{ data: BrandVoice }`. Returns the brand's voice row, or 200 with `data: null` when no voice has been saved yet (mirrors `companyInfo.findSingleton` pattern). |
| PUT | `/api/v1/brands/:brandId/guidelines/voice` | admin-only (agent → 403) | Upserts the brand's voice row. Body validated by Zod pipe. 404 if brand not found (or soft-deleted). 400 on invalid body. 200 on success. |
| GET | `/api/v1/brands/:brandId/guidelines/visual` | admin OR agent | Same shape — `data: VisualIdentity` or `data: null`. |
| PUT | `/api/v1/brands/:brandId/guidelines/visual` | admin-only | Upserts visual identity. Same status branches. |

**Multi-role guard config (forward-compat for Chunk E):** the `@AuthRoles(...)` decorator already accepts a variadic role list (see Phase-2 spec `sfx-webapp-boilerplate-1ef9` and brand-controller class-level `@AuthRoles(AUTH_ROLE_ADMIN)`). For B's GET handlers, declare `@AuthRoles(AUTH_ROLE_ADMIN, AUTH_ROLE_AGENT)` where `AUTH_ROLE_AGENT` is imported from `@sfx/shared`. If `AUTH_ROLE_AGENT` is not yet defined in `@sfx/shared`, this is a **hard blocker** — builder MUST verify presence of the constant before authoring; if absent, builder mails coordinator `--type question --priority high` ("Chunk B blocked: AUTH_ROLE_AGENT not in @sfx/shared; either add the constant now or defer multi-role guards to Chunk E"). Until coordinator resolves, builder ships GET endpoints with `@AuthRoles(AUTH_ROLE_ADMIN)` only and documents the forward-compat gap in the integration tests' allowed-roles assertion. **Probe flows for `agent`-role GET success are owned by Chunk E**, so a missing `AUTH_ROLE_AGENT` does NOT trip the Chunk B drift hook.

### Task B-B1 — `brand-guidelines.tokens.ts`
Create `apps/api/src/modules/brand/data/repositories/brand-guidelines.tokens.ts`:
```ts
export const BRAND_VOICE_REPOSITORY = Symbol.for('BrandVoiceRepository');
export const VISUAL_IDENTITY_REPOSITORY = Symbol.for('VisualIdentityRepository');
```
Test `__tests__/brand-guidelines.tokens.test.ts` asserts both are `typeof 'symbol'` and `Symbol.keyFor` returns expected key (identical pattern to `brand.tokens.test.ts`).

### Task B-B2 — Brand existence guard helper
Create `apps/api/src/modules/brand/application/guards/brand-exists.helper.ts` (NOT a NestJS guard — a small helper used inside controller handlers BEFORE delegating to the repository). Signature: `async assertBrandActive(brandRepository: BrandRepository, brandId: string): Promise<void>` — throws `NotFoundException('Brand not found')` if `findActiveById` returns null.

Inject `BrandRepository` into the new controllers (already a provider on `BrandModule`) so the helper can be called from both PUT and GET handlers.

Test `__tests__/brand-exists.helper.test.ts` — covers existing brand → no throw; missing brand → `NotFoundException` with message `'Brand not found'`.

**Why a helper, not a guard:** the brand-id is a path param; Nest guards run before pipes, so a guard would need its own param-binding. A handler-internal helper keeps the pipe-then-existence order from Chunk A's `mx-spec-a8` rule (Zod runs first, existence check second — only relevant for the PUT body shape, since GET has no body). Tests verify ordering by sending a PUT with bad body to a known-missing brand and asserting 400 (not 404).

### Task B-B3 — `upsert-brand-voice.pipe.ts` + `upsert-visual-identity.pipe.ts`
Create both under `apps/api/src/modules/brand/application/pipes/`. Each delegates to `createZodValidationPipe(<schema>)`. Mirror `apps/api/src/modules/company-info/application/pipes/upsert-company-info.pipe.ts`. Tests in matching `__tests__/`.

### Task B-B4 — DTOs
Create `apps/api/src/modules/brand/application/dto/brand-voice.dto.ts`:
- `BrandVoiceMessagingPillarDto`, `BrandVoiceAudienceRuleDto`, `BrandVoiceApprovedExampleDto`, `BrandVoiceRejectedExampleDto` (each `@ApiProperty({ type: String, ... })` on every scalar; `reason: string | null` uses `@ApiPropertyOptional({ type: String, nullable: true })`).
- `BrandVoiceDto` — `@ApiProperty({ type: String })` on `brandId, tone, writingStyleRules`; `@ApiProperty({ type: [String], isArray: true })` on `preferredVocabulary, restrictedVocabulary`; `@ApiProperty({ type: [BrandVoiceMessagingPillarDto], isArray: true })` on `messagingPillars` (and similarly for the other Json-stored lists); `@ApiProperty({ type: String, format: 'date-time' })` on `createdAt, updatedAt`.

Create `apps/api/src/modules/brand/application/dto/visual-identity.dto.ts` analogously.

**Hard rule (declaration-driven, mulch mx-cbd785 + mx-967e12):** every `@ApiProperty` declares `type:` explicitly because tsx + esbuild does NOT emit reliable `design:type` reflect metadata. Arrays use `type: [DtoClass], isArray: true`. Nullable fields use `@ApiPropertyOptional({ type: ..., nullable: true })`. NEVER infer.

Tests in matching `__tests__/brand-voice.dto.test.ts` + `__tests__/visual-identity.dto.test.ts` assert: each DTO instantiates, every Swagger metadata key has `type` defined, and the OpenAPI generator includes the DTO in `/api-docs-json` paths (smoke). Pattern: `apps/api/src/modules/brand/application/dto/__tests__/brand.dto.test.ts`.

### Task B-B5 — Repositories
Create `apps/api/src/modules/brand/data/repositories/brand-voice.repository.ts`:
```ts
@Injectable()
export class BrandVoicePrismaRepository implements BrandVoiceRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  async findByBrandId(brandId: string): Promise<BrandVoice | null> {
    const row = await this.prisma.brandVoice.findUnique({ where: { brandId } });
    return row ? toBrandVoice(row) : null;
  }

  async upsertForBrand(
    brandId: string,
    input: UpsertBrandVoiceInput,
    _editor: BrandGuidelineEditor,
  ): Promise<BrandVoice> {
    const data = toPrismaUpsertData(input);
    const row = await this.prisma.brandVoice.upsert({
      where: { brandId },
      create: { brandId, ...data },
      update: data,
    });
    return toBrandVoice(row);
  }
}
```

Create matching mapper `apps/api/src/modules/brand/data/mapper/brand-voice.mapper.ts` — round-trips Prisma `Json` columns through typed shapes; reuses `Prisma.InputJsonValue` cast pattern from `company-info-version.mapper.ts`. The `editor` field is unused by B (no version row written — that's Chunk D). Keep the parameter so Chunk D can wire snapshot writes by extending the same method body inside a `$transaction` without changing the interface.

Symmetric work for `visual-identity.repository.ts` + `visual-identity.mapper.ts`.

Tests: `__tests__/brand-voice.repository.test.ts` + `__tests__/visual-identity.repository.test.ts` use Prisma client mocked at module level (mirror pattern in `apps/api/src/modules/company-info/data/repositories/__tests__/company-info.repository.test.ts`). Cover: find-missing → null, find-present → mapped domain entity, upsert-create branch, upsert-update branch. **Unit tests do NOT require live db** — they mock `prisma.brandVoice.findUnique` / `.upsert`. Integration tests (§7) hit the real db.

### Task B-B6 — Controllers
Create `apps/api/src/modules/brand/application/controllers/brand-voice.controller.ts`:
```ts
@ApiTags('brand-guidelines')
@Controller('brands/:brandId/guidelines/voice')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('accessToken')
export class BrandVoiceController {
  constructor(
    @Inject(BRAND_REPOSITORY) private readonly brandRepository: BrandRepository,
    @Inject(BRAND_VOICE_REPOSITORY) private readonly voiceRepository: BrandVoiceRepository,
  ) {}

  @Get()
  @AuthRoles(AUTH_ROLE_ADMIN /* , AUTH_ROLE_AGENT — Chunk E */)
  @ApiOperation({ summary: 'Get the Brand Voice for a brand', description: '...' })
  @ApiParam({ name: 'brandId', type: String })
  @ApiResponse({ status: 200, description: 'Brand Voice or null when uninitialised', type: ApiEnvelopeDto(BrandVoiceDto) })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  @ApiResponse({ status: 403, description: 'Authenticated user lacks the admin role' })
  @ApiResponse({ status: 404, description: 'Brand not found' })
  async getVoice(@Param('brandId') brandId: string): Promise<BrandVoice | null> {
    await assertBrandActive(this.brandRepository, brandId);
    return this.voiceRepository.findByBrandId(brandId);
  }

  @Put()
  @AuthRoles(AUTH_ROLE_ADMIN)
  @ApiOperation({ summary: 'Upsert Brand Voice for a brand', description: '...' })
  @ApiParam({ name: 'brandId', type: String })
  @ApiBody({ type: UpsertBrandVoiceDtoFromZod, required: true })
  @ApiResponse({ status: 200, description: 'Persisted Brand Voice', type: ApiEnvelopeDto(BrandVoiceDto) })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  @ApiResponse({ status: 403, description: 'Authenticated user lacks the admin role' })
  @ApiResponse({ status: 404, description: 'Brand not found' })
  @ResourceCaptures({ fromPath: 'brandId', resource: 'brand', pathParam: 'brandId' })
  async putVoice(
    @Param('brandId') brandId: string,
    @Body(UpsertBrandVoicePipe) input: UpsertBrandVoiceInput,
    @Req() req: RequestWithAuthenticatedUser,
  ): Promise<BrandVoice> {
    const user = req.user;
    if (!user) throw new UnauthorizedException('Authenticated user context is missing');
    await assertBrandActive(this.brandRepository, brandId);
    return this.voiceRepository.upsertForBrand(brandId, input, {
      editorUserId: user.subject,
      editorDisplayName: user.email ?? user.subject,
    });
  }
}
```

Symmetric `VisualIdentityController` at `/brands/:brandId/guidelines/visual`.

**`UpsertBrandVoiceDtoFromZod` + `UpsertVisualIdentityDtoFromZod`:** apply `createZodDto(upsertBrandVoiceSchema)` (or whatever helper Phase-2 uses — verify against `apps/api/src/modules/company-info/application/pipes/upsert-company-info.pipe.ts` for the `@ApiBody` binding pattern). Per mulch mx-967e12: PUT handlers declaring `@ApiResponse` 404 MUST bind `@ApiBody({ schema })` via `zodApiBody`/`createZodDto` or the generator sends an empty body fixture, the Zod pipe rejects with 400, and the 404 path never reaches the existence check → `ZOD_CONTRACT_UNDETECTED_FOR_STATUS_REACH` diagnostic. If `createZodDto` is not present in the codebase, builder generates a minimal class shim that hangs `@ApiProperty` decorators off the Zod schema's shape (mirror the company-info module's pattern).

**`@ResourceCaptures({ pathParam: 'brandId' })`:** declares the chain-capture so probe flows resolving `brandId` from a parent POST `/brands` response have a binding to thread through nested routes. This is the second tuple emitted to `BrandController.createBrand`'s `@ResourceCaptures` decorator per mx-3bf156 carve-out — additive only, not a replacement. The probe's chain-resource setup will POST `/brands` → capture `id` → use as `brandId` in PUT/GET `/brands/:brandId/guidelines/voice`.

Register both controllers + their pipes + repositories in `brand.module.ts`:
```ts
@Module({
  controllers: [BrandController, BrandVoiceController, VisualIdentityController],
  providers: [
    AuthTokenService, JwtAuthGuard,
    CreateBrandPipe, RenameBrandPipe,
    UpsertBrandVoicePipe, UpsertVisualIdentityPipe,
    { provide: PRISMA_CLIENT, useValue: prisma },
    { provide: BRAND_REPOSITORY, useClass: BrandPrismaRepository },
    { provide: BRAND_VOICE_REPOSITORY, useClass: BrandVoicePrismaRepository },
    { provide: VISUAL_IDENTITY_REPOSITORY, useClass: VisualIdentityPrismaRepository },
  ],
})
```

Tests: `__tests__/brand-voice.controller.test.ts` + `__tests__/visual-identity.controller.test.ts` — unit-level, mock both repositories. Cover every handler branch: missing brand → 404, missing user context → 401, success path returns mapped entity, role rejection (admin-only PUT).

Acceptance: `pnpm --filter @sfx/api test && pnpm --filter @sfx/api typecheck && pnpm --filter @sfx/api lint` green.
Estimated diff: ~600 lines source + ~800 lines tests across ~14 new files + 1 modified (`brand.module.ts` providers append + 1 line each on `BrandController` decorator if mx-3bf156 carve-out triggers).

---

## 6. Frontend — data layer + presentation (Tasks B-F1 … B-F8)

### Task B-F1 — Constants extension
Append to `apps/web/src/features/brand-shell/constants.ts`:
```ts
export const brandVoiceEndpoint = (brandId: string) =>
  `api/v1/brands/${brandId}/guidelines/voice` as const;
export const visualIdentityEndpoint = (brandId: string) =>
  `api/v1/brands/${brandId}/guidelines/visual` as const;

export const brandVoiceQueryKey = (brandId: string) =>
  ['brand-guidelines', 'voice', brandId] as const;
export const visualIdentityQueryKey = (brandId: string) =>
  ['brand-guidelines', 'visual', brandId] as const;

export interface BrandGuidelinesSubNavEntry {
  readonly id: string;
  readonly labelKey: 'voice' | 'visual' | 'dosAndDonts' | 'metadata'; // Chunk C appends 'dosAndDonts' and 'metadata'
  readonly slot: number; // ascending render order, gaps allowed (10, 20, 30...)
}

export const BRAND_GUIDELINES_SUB_NAV_REGISTRY: readonly BrandGuidelinesSubNavEntry[] = [
  { id: 'voice', labelKey: 'voice', slot: 10 },
  { id: 'visual', labelKey: 'visual', slot: 20 },
] as const;
```

**Sub-nav registry shape — Chunk C extension contract:**
Chunk C appends entries with `slot >= 30` to keep render order deterministic and append-only. The component (§B-F6) sorts by `slot` ascending. Chunk C's FILE_SCOPE includes `apps/web/src/features/brand-shell/constants.ts` for APPEND-only mutation; it MUST NOT change the `BrandGuidelinesSubNavEntry` interface or the existing two entries. The widening of `labelKey` to include `'dosAndDonts' | 'metadata'` already accommodates Chunk C. Chunk D (history) does NOT add a sub-nav entry — history is a separate page route.

Test `__tests__/constants.test.ts` — assert `BRAND_GUIDELINES_SUB_NAV_REGISTRY` has length 2, slots 10 + 20, ids `'voice' + 'visual'`, registry is readonly tuple (`as const`).

### Task B-F2 — Domain mappers + data models
Create `apps/web/src/features/brand-shell/data/model/brand-voice-data-model.ts` mirroring the API response wire shape (`Date` fields are ISO strings on the wire):
```ts
export interface BrandVoiceDataModel {
  readonly brandId: string;
  readonly tone: string;
  readonly preferredVocabulary: readonly string[];
  /* ... matches brandVoiceResponseSchema, Date → string ... */
  readonly createdAt: string;
  readonly updatedAt: string;
}
```

Create `apps/web/src/features/brand-shell/data/mapper/map-to-brand-voice.ts` — maps `BrandVoiceDataModel | null` to `BrandVoice | null`, converting ISO strings to `Date`. Symmetric for visual identity.

Tests under `__tests__/` — null pass-through, populated mapping, malformed timestamp falls through to `Date('Invalid Date')` and is propagated (do NOT swallow).

### Task B-F3 — Remote calls
Create `apps/web/src/features/brand-shell/data/remote/fetch-brand-voice.ts`:
```ts
export async function fetchBrandVoice(brandId: string): Promise<BrandVoiceDataModel | null> {
  return executeRequest({
    method: 'GET',
    endpoint: brandVoiceEndpoint(brandId),
  });
}
```
Symmetric `update-brand-voice.ts`, `fetch-visual-identity.ts`, `update-visual-identity.ts`.

**ADR-002:** every remote call goes through `executeRequest` — never raw fetch. Mirror pattern in `apps/web/src/features/brand-shell/data/remote/fetch-brands.ts`.

Tests in matching `__tests__/`. Mock `executeRequest` (already mockable via the shared networking module — see `apps/web/src/features/company-info/data/remote/__tests__/fetch-company-info.test.ts`). Cover network error, 401, 403, 404, 200 with envelope, 200 with empty `data: null`.

### Task B-F4 — Repository hooks
Create `apps/web/src/features/brand-shell/data/repositories/use-brand-voice-repository.ts`:
```ts
export function useBrandVoiceRepository(brandId: string) {
  const queryClient = useQueryClient();
  const voiceQuery = useQuery({
    queryKey: brandVoiceQueryKey(brandId),
    queryFn: () => fetchBrandVoice(brandId).then(mapToBrandVoiceOrNull),
  });
  const updateMutation = useMutation({
    mutationFn: (input: UpsertBrandVoiceInput) => updateBrandVoice(brandId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: brandVoiceQueryKey(brandId) });
    },
  });
  return { voiceQuery, updateMutation };
}
```
Symmetric `use-visual-identity-repository.ts`.

Tests under `__tests__/` use `@testing-library/react` + `QueryClientProvider` wrapper, mock `fetch-*` modules. Cover loading, success, error, mutation invalidation (per mulch mx-cbd785).

### Task B-F5 — Form resolvers
Create `apps/web/src/features/brand-shell/presentation/validators/upsert-brand-voice.resolver.ts`:
```ts
export const upsertBrandVoiceResolver = zodResolver(upsertBrandVoiceSchema);
```
Symmetric `upsert-visual-identity.resolver.ts`. Tests verify the resolver matches Zod errors to RHF errors for: missing tone, oversize tone (>4000), invalid hex on visual entry, etc.

### Task B-F6 — `BrandGuidelinesSubNav` component
Path: `apps/web/src/features/brand-shell/presentation/components/BrandGuidelinesSubNav/`. Four-file pattern:
- `types.ts` — `BrandGuidelinesSubNavProps { readonly activeBrandId: string }`, `BrandGuidelinesSubNavUIModel { readonly tabs: readonly { id, label, isActive }[]; readonly activeBody: ReactNode }`.
- `use-brand-guidelines-sub-nav.ts` — reads URL search param `?section=voice|visual|...` (or local state if section state shouldn't be URL-persistable; recommended URL for shareability + back-button) using `useSearchParams` from `next/navigation`. Tracks active section, exposes `setActiveSection`. Uses `useTranslations('common').adminBrandGuidelines.subNav` for labels keyed by `entry.labelKey`.
- `map-to-brand-guidelines-sub-nav-ui-model.ts` — iterates `BRAND_GUIDELINES_SUB_NAV_REGISTRY` sorted by `slot`, resolves each label, renders the correct body component based on the active entry's `id`. Bodies that aren't B's responsibility (Chunk C's `dosAndDonts`, `metadata`) render a placeholder `<section>{labels.placeholderComingNextChunk}</section>` until Chunk C lands; this is forward-compat and lets the iteration over the registry remain lossless.
- `index.tsx` — renders the tab strip + the active body. Uses semantic `<nav aria-label="brand guidelines sub-sections">` + `<button>` per tab (NOT `<Link>` because route-level navigation here is intra-page and the page is `'use client'`).

The Voice + Visual bodies are mounted as full `<BrandVoiceForm brandId={...} />` and `<VisualIdentityForm brandId={...} />` (next tasks).

**Dirty-state warn-on-leave:** the sub-nav handler MUST guard against losing edited state when switching sections while a form is dirty. Implementation: each form component accepts a `onDirtyChange?: (dirty: boolean) => void` callback; the sub-nav hook tracks per-section dirty state in a `Record<entryId, boolean>` map and intercepts `setActiveSection` with `if (currentDirty && !window.confirm(translations.unsavedChangesWarning)) return;`. Test asserts the confirm path.

Tests:
- `__tests__/map-to-brand-guidelines-sub-nav-ui-model.test.ts` — registry → UIModel mapping, slot ordering, locale fallback.
- `__tests__/use-brand-guidelines-sub-nav.test.tsx` — section state + URL sync + dirty-blocking with mocked `window.confirm`.
- `__tests__/BrandGuidelinesSubNav.test.tsx` — render, click tab → active class moves, click while dirty → confirm dialog, accept → switches, reject → stays.

### Task B-F7 — `BrandVoiceForm` component
Path: `apps/web/src/features/brand-shell/presentation/components/BrandVoiceForm/`. Same 4-file pattern.

The form uses `react-hook-form` with `upsertBrandVoiceResolver`. Fieldsets per logical group:
1. Tone — single textarea, required, max 4000 chars.
2. Preferred vocabulary — repeatable list (extract `ArrayField` from `apps/web/src/features/company-info/presentation/pages/company-info/index.tsx` lines 142-230 into a shared `apps/web/src/features/brand-shell/presentation/components/ArrayField/` — string row variant).
3. Restricted vocabulary — same shape.
4. Messaging pillars — repeatable list of {title, description} tuples. New `RepeatableRowGroup` component (also under `presentation/components/`), parametrized on the row schema. Each row renders two text inputs side-by-side (`grid-cols-2`).
5. Writing style rules — textarea.
6. Audience rules — repeatable {audience, rules} tuples (same `RepeatableRowGroup`).
7. Approved examples — repeatable {phrase} (string-row).
8. Rejected examples — repeatable {phrase, reason} tuples (`RepeatableRowGroup`).

The form mirrors `CompanyInfoPage`'s shell:
- Pending state — submit button `disabled + aria-busy={pending}`, label switches to `labels.cta.saving`.
- Success — emit toast from the hook (`useToast()` per mulch mx-cbd785) `labels.toast.success`. NEVER silent.
- Failure — set form-level error from `executeRequest` error-envelope per mulch mx-e7eb2d (`errorBody.error.message` + `errorBody.error.errors[]` BEFORE `error.message`). Render in form-level alert + per-field `formState.errors`.
- Refresh persistence — guaranteed by the GET returning the latest server state on mount.

**Hook signature:**
```ts
function useBrandVoiceForm(brandId: string): {
  uiModel: BrandVoiceFormUIModel;
  form: UseFormReturn<UpsertBrandVoiceInput>;
  handleSubmit: (event: FormEvent) => Promise<void>;
}
```

Avoid infinite re-renders per mulch mx-d9b182: gate `form.reset(serverState)` on `useRef` containing the signature `${brandId}::${updatedAt.toISOString()}` — only call `reset` when signature changes.

Tests:
- `__tests__/use-brand-voice-form.test.tsx` — happy submit, validation rejection (empty tone), server 400 surfaces field errors, server 404 surfaces brand-not-found, dirty-on-edit + reset on server fetch.
- `__tests__/BrandVoiceForm.test.tsx` — all field types render with labels in EN locale; clicking `+ Add` on each list adds a row; clicking `Remove` deletes; submit fires hook handler. Locale-deterministic per mulch convention.
- `__tests__/map-to-brand-voice-form-ui-model.test.ts` — server null → form defaults all-empty; server populated → form prefilled.

### Task B-F8 — `VisualIdentityForm` component
Symmetric to B-F7. Fieldsets:
1. Logo usage — required textarea.
2. Color palette — repeatable {name, hex, usageNotes} (`RepeatableRowGroup` 3-column variant). The hex field uses `<input type="color">` paired with a text input synced via RHF's `watch` + `setValue`, OR a single text input with `pattern="^#([0-9a-fA-F]{3}){1,2}$"` + Zod-resolver client-side validation that runs before submit (`mode: 'onBlur'`). Decision: simple text input + regex pattern, because `<input type="color">` UX differs across browsers and limits hex inputs to 6 chars. Resolver rejects invalid hex client-side BEFORE network call (per §10 acceptance).
3. Typography — repeatable {font, weight, usageContext}.
4. Spacing/layout — textarea.
5. Image style — textarea.
6. Iconography — textarea.
7. Usage restrictions — textarea.

Same pending/success/failure pattern, same dirty-state propagation up to `BrandGuidelinesSubNav`.

Tests symmetric. Invalid-hex case is the new branch worth a dedicated test.

### Task B-F9 — Page integration
Edit `apps/web/src/features/brand-shell/presentation/pages/brand-guidelines-detail/index.tsx`:
Replace the `<section>placeholder</section>` block with:
```tsx
<BrandGuidelinesSubNav activeBrandId={props.brandId} />
```
Update the corresponding test `__tests__/BrandGuidelinesDetailPage.test.tsx` to assert sub-nav mount (mock the sub-nav component so the page test stays focused; the sub-nav has its own tests).

Cleanup: `placeholder` block in `BrandGuidelinesDetailUIModel` can be removed; the mapper + types are simplified. Update `map-to-brand-guidelines-detail-ui-model.ts` + its test accordingly.

Export new components from `apps/web/src/features/brand-shell/index.ts`:
```ts
export { BrandGuidelinesSubNav } from './presentation/components/BrandGuidelinesSubNav';
export { BrandVoiceForm } from './presentation/components/BrandVoiceForm';
export { VisualIdentityForm } from './presentation/components/VisualIdentityForm';
export {
  BRAND_GUIDELINES_SUB_NAV_REGISTRY,
  brandVoiceEndpoint,
  visualIdentityEndpoint,
  brandVoiceQueryKey,
  visualIdentityQueryKey,
} from './constants';
export type { BrandGuidelinesSubNavEntry } from './constants';
```

Acceptance:
- `pnpm --filter @sfx/web typecheck && pnpm --filter @sfx/web lint && pnpm --filter @sfx/web test:coverage` — 90%+ coverage, all green.

Estimated diff for §6 total: ~1500 lines source + ~2000 lines tests across ~30 new files + 3 modified (`constants.ts`, `index.ts`, `brand-guidelines-detail/index.tsx`).

---

## 7. Localization (Task B-L1)

Append translation keys to both language files (TypeScript enforces parity per `apps/web/src/features/presentation/localization/types.ts`).

`apps/web/src/features/presentation/localization/languages/en/common.ts` — add under `common.adminBrandGuidelines.subNav` + `.voice` + `.visual` namespaces. Example shape:

```ts
adminBrandGuidelines: {
  // ... existing Chunk A entries (page titles, selector labels, etc.) ...
  subNav: {
    voice: 'Brand Voice',
    visual: 'Visual Identity',
    placeholderComingNextChunk: 'Coming in the next release.',
    unsavedChangesWarning: 'You have unsaved changes. Discard and switch sections?',
  },
  voice: {
    pageTitle: 'Brand Voice',
    sections: {
      tone: 'Tone of voice',
      preferredVocabulary: 'Preferred vocabulary',
      restrictedVocabulary: 'Restricted vocabulary',
      messagingPillars: 'Messaging pillars',
      writingStyle: 'Writing style',
      audienceRules: 'Audience rules',
      approvedExamples: 'Approved examples',
      rejectedExamples: 'Rejected examples',
    },
    fields: {
      tone: { label: 'Tone of voice', placeholder: 'Warm, expert, never condescending', required: true },
      preferredVocabulary: { label: 'Preferred vocabulary' },
      // ... per field ...
    },
    cta: {
      save: 'Save Brand Voice',
      saving: 'Saving...',
      addPreferred: '+ Add preferred term',
      removePreferred: 'Remove',
      addRestricted: '+ Add restricted term',
      removeRestricted: 'Remove',
      addPillar: '+ Add messaging pillar',
      removePillar: 'Remove pillar',
      addAudience: '+ Add audience rule',
      removeAudience: 'Remove audience rule',
      addApprovedExample: '+ Add approved example',
      removeApprovedExample: 'Remove',
      addRejectedExample: '+ Add rejected example',
      removeRejectedExample: 'Remove',
    },
    toast: {
      success: 'Brand Voice saved',
      error: 'Could not save Brand Voice',
    },
    validation: {
      toneRequired: 'Tone of voice is required',
    },
  },
  visual: {
    pageTitle: 'Visual Identity',
    sections: {
      logo: 'Logo usage',
      colorPalette: 'Color palette',
      typography: 'Typography',
      spacing: 'Spacing & layout',
      imageStyle: 'Image style',
      iconography: 'Iconography',
      restrictions: 'Usage restrictions',
    },
    fields: {
      logoUsage: { label: 'Logo usage guidance', placeholder: '...', required: true },
      paletteName: { label: 'Color name' },
      paletteHex: { label: 'Hex value', placeholder: '#1A2B3C' },
      paletteUsage: { label: 'Usage notes' },
      typographyFont: { label: 'Font' },
      typographyWeight: { label: 'Weight' },
      typographyContext: { label: 'Usage context' },
      spacingGuidance: { label: 'Spacing & layout guidance' },
      imageStyleGuidance: { label: 'Image style guidance' },
      iconographyGuidance: { label: 'Iconography guidance' },
      usageRestrictions: { label: 'Usage restrictions' },
    },
    cta: {
      save: 'Save Visual Identity',
      saving: 'Saving...',
      addPaletteEntry: '+ Add palette entry',
      removePaletteEntry: 'Remove palette entry',
      addTypographyEntry: '+ Add typography entry',
      removeTypographyEntry: 'Remove typography entry',
    },
    toast: { success: 'Visual Identity saved', error: 'Could not save Visual Identity' },
    validation: { logoUsageRequired: 'Logo usage guidance is required', invalidHex: 'Invalid hex color (e.g. #1A2B3C)' },
  },
},
```

`apps/web/src/features/presentation/localization/languages/ro/common.ts` — same keys, Romanian copy. Recommended translations: `subNav.voice = 'Vocea brandului'`, `subNav.visual = 'Identitate vizuala'`, `voice.toast.success = 'Vocea brandului salvata'`, `visual.toast.success = 'Identitate vizuala salvata'`, etc. Use locale-correct diacritics where the existing Chunk A entries do (e.g. `Informatii companie` — no diacritics — so stay consistent; do NOT mix `ț`/`t` styles).

Update `apps/web/src/features/presentation/localization/types.ts` — extend `AdminTranslations.brandGuidelines` (whatever path Chunk A used) with the new `subNav` + `voice` + `visual` namespaces. TypeScript enforces parity between EN + RO files; missing keys are a compile error.

Tests: `apps/web/src/features/presentation/localization/__tests__/parity.test.ts` (already enforces EN/RO parity per Phase-2 pattern) covers the new keys automatically. Add explicit assertion that `subNav.voice` + `subNav.visual` resolve to non-empty strings in both locales.

Estimated diff: ~120 lines per language file + ~40 lines `types.ts`.

---

## 8. Integration tests (Task B-IT1, B-IT2, B-UI-QA)

### Task B-IT1 — `brand-voice.integration-test.ts`

Path: `apps/api/src/modules/brand/__integration__/brand-voice.integration-test.ts`. Mirrors `apps/api/src/modules/brand/__integration__/brand.integration-test.ts` + `apps/api/src/modules/company-info/__integration__/company-info.integration-test.ts`. Pattern:
1. Boot `AppModule` test container, override `JwtAuthGuard` with `buildTestAuthGuard`, hit real Prisma db.
2. `beforeEach` cleans `prisma.brandVoice.deleteMany()` + `prisma.visualIdentity.deleteMany()` + `prisma.brand.deleteMany()`.
3. Setup helper creates an active brand via `POST /api/v1/brands` (admin role).
4. Test matrix per method (GET + PUT) × auth state (anonymous + viewer + admin) × brand state (missing + active + soft-deleted) × body (valid + invalid).

Concrete test cases (15-ish):
- GET admin on missing brand → 404.
- GET admin on active brand without voice row → 200 envelope with `data: null`.
- GET admin on active brand with voice row → 200 envelope with full payload, `brandId` matches, list fields are arrays.
- GET anonymous → 401.
- GET viewer → 403.
- PUT admin valid body, no prior voice → creates row, returns 200 envelope.
- PUT admin valid body, with prior voice → updates row, `updatedAt` advances, `createdAt` stays.
- PUT admin missing tone → 400.
- PUT admin tone = whitespace-only → 400.
- PUT admin unknown body key → 400.
- PUT admin valid body to missing brand → 404 (pipe runs first, body is valid, then existence check 404).
- PUT admin valid body to soft-deleted brand → 404.
- PUT admin valid body with messagingPillars empty entry → 400.
- PUT anonymous → 401.
- PUT viewer → 403.

### Task B-IT2 — `visual-identity.integration-test.ts`
Symmetric matrix. Hex-validation cases:
- PUT admin with `colorPalette[0].hex = 'red'` → 400, error message contains `'Invalid hex'`.
- PUT admin with `colorPalette[0].hex = '#GGG'` → 400.
- PUT admin with valid 3-char hex `'#fff'` → 200.
- PUT admin with valid 6-char hex `'#1A2B3C'` → 200.

### Task B-UI-QA — qa-test full-mode J2 + J3 coverage
Invoke the `qa-test` skill with **standard criteria mode** against the booted stack:
- Journey J2 — admin lands on `/admin/brand-guidelines/<brandId>`, clicks Brand Voice sub-nav, fills every field including all list types (preferredVocabulary, restrictedVocabulary, messagingPillars, audienceRules, approvedExamples, rejectedExamples), clicks Save, expects pending state on the submit button + success toast `Brand Voice saved`, hard refresh, asserts every value persists.
- Journey J3 — admin clicks Visual Identity sub-nav, fills logo + palette (with valid hex) + typography + spacing + image + iconography + restrictions, clicks Save, expects pending + success + persist; then attempts to save with `hex = 'red'`, expects client-side rejection BEFORE network call (no PUT request fires in Playwright network log).
- Auth boundaries — assert unauth visit to `/admin/brand-guidelines/<brandId>` redirects via oauth2-proxy; non-admin visit hits `AdminRouteGate` denied surface (already covered by Phase-2 F5 inherited tests but include a smoke assertion).
- Dirty-state warn-on-leave — fill any Voice field, click Visual Identity sub-nav without saving, expect `window.confirm` dialog, cancel → stay on Voice; accept → switch.
- All console + network logs clean — zero JS errors, zero 4xx/5xx (except the intentional 400 case in the hex-validation test).

The qa-test transcript + screenshots ship in builder's `worker_done` mail under `## ui-evidence`.

Acceptance:
- `pnpm test:integration` includes the two new files; all matrices green.
- `pnpm probe:smoke` runs against the booted stack and reports zero failures for B's diff (new chain-capture flows + nested-singleton flows pass — these are the auto-generated probe flows from Zod + decorators, plus a small curated set added to `.overstory/runtime-contract.flows/sfx-webapp-boilerplate-72fd.json` by the lead/coordinator).
- qa-test report attached.

Estimated diff: ~600 lines integration tests + qa-test artifacts (no source files).

---

## 9. Runtime acceptance (required spec field)

Per parent product plan §5 J2 + J3 + cross-cutting:

**J2 — Brand Voice population**
- An admin can fill every Voice field including tone, repeatable preferred and restricted vocabulary lists, repeatable messaging pillars (title + description), writing style, audience rules, and approved/rejected example phrases, and submit the form.
- Submission produces a visible pending state on the submit control and a visible success notification on completion.
- After a hard refresh of the page, every saved value remains present.
- An admin cannot save the form while a required field (tone) is empty; client-side validation rejects before network call.
- Switching to the Visual Identity sub-section while Brand Voice has unsaved edits surfaces a confirm dialog; rejecting it keeps the admin on Brand Voice with edits intact.

**J3 — Visual Identity population**
- An admin can populate logo guidance, color palette rows (name + hex + usage), typography rows (font + weight + context), spacing/image/iconography guidance, and restrictions, and submit.
- A hex value that is not a valid color is rejected client-side before network call (no PUT fires).
- After save and hard refresh, every value persists.

**Cross-cutting auth boundaries (every endpoint)**
- Unauthenticated → 401 on every endpoint.
- Authenticated non-admin (`viewer`) → 403 on every endpoint (writes AND reads; agent-role reads land in Chunk E).
- Authenticated admin → 200/201/204 on success; 400 on invalid body; 404 on missing/soft-deleted brand.
- Unauthenticated visitor to any `/admin/brand-guidelines/*` page hits inherited `AuthGate` from `/admin/layout.tsx` and is redirected to oauth2-proxy login.

**Cross-cutting freshness**
- An update to Brand Voice or Visual Identity becomes visible to a subsequent GET by the same or another admin without any cache invalidation step from the caller (React Query invalidates on success per §6 B-F4).

---

## 10. Guard contract (required spec field)

| Surface | Guard |
|---|---|
| `/admin/brand-guidelines/<brandId>` page (and all sub-section bodies mounted within) | `authenticated` (via inherited `app/admin/layout.tsx` `<AuthGate>` + `<AdminRouteGate>` from Phase-2 F3+F5) |
| Unauth behaviour for protected page | 302/307 redirect via oauth2-proxy to `/oauth2/sign_in` |
| Non-admin authenticated behaviour | `AdminRouteGate` renders denied surface (Phase-2 F5 pattern) |
| `GET /api/v1/brands/:brandId/guidelines/voice` | `@UseGuards(JwtAuthGuard) + @AuthRoles(AUTH_ROLE_ADMIN)` (extend to `AUTH_ROLE_ADMIN, AUTH_ROLE_AGENT` once Chunk E lands `AUTH_ROLE_AGENT` in `@sfx/shared`) |
| `PUT /api/v1/brands/:brandId/guidelines/voice` | `@UseGuards(JwtAuthGuard) + @AuthRoles(AUTH_ROLE_ADMIN)` — admin-only forever |
| `GET /api/v1/brands/:brandId/guidelines/visual` | Same as Voice GET |
| `PUT /api/v1/brands/:brandId/guidelines/visual` | `@AuthRoles(AUTH_ROLE_ADMIN)` |
| Unauth → API | 401 (`UnauthorizedException` from `JwtAuthGuard`) |
| Non-admin (or non-agent for GET, post-E) → API | 403 (`ForbiddenException` from `AuthRoles` guard chain) |
| Missing/soft-deleted brand → API | 404 (`NotFoundException` from `assertBrandActive` helper) |

---

## 11. Contract annotations (required spec field)

Files where the builder MUST maintain route-metadata / API-description / validation-schema / auth-guard annotations so the contract compiler can extract them:

1. `apps/api/src/modules/brand/application/controllers/brand-voice.controller.ts`
   - Class-level: `@ApiTags('brand-guidelines') @Controller(...) @UseGuards(JwtAuthGuard) @ApiBearerAuth('accessToken')`.
   - Per handler: `@ApiOperation`, `@ApiParam({ name: 'brandId', type: String })`, `@ApiResponse({ status: 200|400|401|403|404, type: ApiEnvelopeDto(BrandVoiceDto) })`, `@AuthRoles(...)`, `@Body(UpsertBrandVoicePipe)`, `@ApiBody({ type: UpsertBrandVoiceDtoFromZod, required: true })` on PUT, `@ResourceCaptures({ fromPath: 'brandId', resource: 'brand', pathParam: 'brandId' })` on PUT.
2. `apps/api/src/modules/brand/application/controllers/visual-identity.controller.ts`
   - Same decorator set, swap names.
3. `apps/api/src/modules/brand/application/dto/brand-voice.dto.ts` + `visual-identity.dto.ts`
   - Every property declares `@ApiProperty({ type: ... })` or `@ApiPropertyOptional({ type: ..., nullable: true })` with EXPLICIT type — mulch mx-cbd785.
4. `apps/api/src/modules/brand/application/pipes/upsert-brand-voice.pipe.ts` + `upsert-visual-identity.pipe.ts`
   - Bound to Zod schema via `createZodValidationPipe(<schema>)` — schema has `.openapi()` on every field.
5. `packages/validation/src/schemas/brand-voice.schema.ts` + `visual-identity.schema.ts`
   - Every field calls `.openapi({ description, example })`.
6. `apps/api/src/modules/brand/application/controllers/brand.controller.ts` (mx-3bf156 carve-out)
   - The `@ResourceCaptures` decorator on `createBrand` MAY be additively extended with `{ fromPath: 'id', resource: 'brand', pathParam: 'brandId' }` — same `fromPath`, same `resource`, only `pathParam` differs. This is the single additive edit permitted on this file.

For the frontend route boundary:
7. `apps/web/src/features/brand-shell/presentation/components/BrandGuidelinesSubNav/index.tsx` — keep `'use client'` directive; this component mounts inside the existing `BrandGuidelinesDetailPage` which already declares `@routeGuard authenticated`.

---

## 12. FILE_SCOPE (for builder dispatch)

Builder for `sfx-webapp-boilerplate-72fd` is granted exclusive write access to the following paths inside the worktree:

```
packages/domain/src/entities/brand-voice.ts
packages/domain/src/entities/visual-identity.ts
packages/domain/src/entities/__tests__/brand-voice.test.ts
packages/domain/src/entities/__tests__/visual-identity.test.ts
packages/domain/src/ports/brand-voice-repository.ts
packages/domain/src/ports/visual-identity-repository.ts
packages/domain/src/ports/__tests__/brand-voice-repository.test.ts
packages/domain/src/ports/__tests__/visual-identity-repository.test.ts
packages/domain/src/index.ts   (APPEND-only — additive type re-exports)

packages/validation/src/schemas/brand-voice.schema.ts
packages/validation/src/schemas/visual-identity.schema.ts
packages/validation/src/schemas/__tests__/brand-voice.schema.test.ts
packages/validation/src/schemas/__tests__/visual-identity.schema.test.ts
packages/validation/src/index.ts   (APPEND-only)
packages/validation/src/__tests__/index.test.ts   (APPEND-only — add 2 assertions)

packages/database/prisma/schema.prisma   (APPEND BrandVoice + VisualIdentity models; 2-line additive edit on Brand model for back-relations)
packages/database/prisma/migrations/<timestamp>_add_brand_voice_and_visual_identity/   (auto-generated by db:migrate)

apps/api/src/modules/brand/brand.module.ts   (APPEND-only: 2 controllers, 2 pipes, 2 repository providers — preserves all existing entries)
apps/api/src/modules/brand/data/repositories/brand-guidelines.tokens.ts
apps/api/src/modules/brand/data/repositories/__tests__/brand-guidelines.tokens.test.ts
apps/api/src/modules/brand/data/repositories/brand-voice.repository.ts
apps/api/src/modules/brand/data/repositories/visual-identity.repository.ts
apps/api/src/modules/brand/data/repositories/__tests__/brand-voice.repository.test.ts
apps/api/src/modules/brand/data/repositories/__tests__/visual-identity.repository.test.ts
apps/api/src/modules/brand/data/mapper/brand-voice.mapper.ts
apps/api/src/modules/brand/data/mapper/visual-identity.mapper.ts
apps/api/src/modules/brand/data/mapper/__tests__/brand-voice.mapper.test.ts
apps/api/src/modules/brand/data/mapper/__tests__/visual-identity.mapper.test.ts
apps/api/src/modules/brand/application/controllers/brand-voice.controller.ts
apps/api/src/modules/brand/application/controllers/visual-identity.controller.ts
apps/api/src/modules/brand/application/controllers/__tests__/brand-voice.controller.test.ts
apps/api/src/modules/brand/application/controllers/__tests__/visual-identity.controller.test.ts
apps/api/src/modules/brand/application/pipes/upsert-brand-voice.pipe.ts
apps/api/src/modules/brand/application/pipes/upsert-visual-identity.pipe.ts
apps/api/src/modules/brand/application/pipes/__tests__/upsert-brand-voice.pipe.test.ts
apps/api/src/modules/brand/application/pipes/__tests__/upsert-visual-identity.pipe.test.ts
apps/api/src/modules/brand/application/dto/brand-voice.dto.ts
apps/api/src/modules/brand/application/dto/visual-identity.dto.ts
apps/api/src/modules/brand/application/dto/__tests__/brand-voice.dto.test.ts
apps/api/src/modules/brand/application/dto/__tests__/visual-identity.dto.test.ts
apps/api/src/modules/brand/application/guards/brand-exists.helper.ts
apps/api/src/modules/brand/application/guards/__tests__/brand-exists.helper.test.ts
apps/api/src/modules/brand/__integration__/brand-voice.integration-test.ts
apps/api/src/modules/brand/__integration__/visual-identity.integration-test.ts
apps/api/src/modules/brand/index.ts   (APPEND-only)

apps/web/src/features/brand-shell/constants.ts   (APPEND-only: endpoint factories, query-key factories, BRAND_GUIDELINES_SUB_NAV_REGISTRY, BrandGuidelinesSubNavEntry interface)
apps/web/src/features/brand-shell/__tests__/constants.test.ts   (APPEND-only)
apps/web/src/features/brand-shell/index.ts   (APPEND-only)
apps/web/src/features/brand-shell/data/model/brand-voice-data-model.ts
apps/web/src/features/brand-shell/data/model/visual-identity-data-model.ts
apps/web/src/features/brand-shell/data/model/__tests__/*.test.ts
apps/web/src/features/brand-shell/data/mapper/map-to-brand-voice.ts
apps/web/src/features/brand-shell/data/mapper/map-to-visual-identity.ts
apps/web/src/features/brand-shell/data/mapper/__tests__/*.test.ts
apps/web/src/features/brand-shell/data/remote/fetch-brand-voice.ts
apps/web/src/features/brand-shell/data/remote/update-brand-voice.ts
apps/web/src/features/brand-shell/data/remote/fetch-visual-identity.ts
apps/web/src/features/brand-shell/data/remote/update-visual-identity.ts
apps/web/src/features/brand-shell/data/remote/__tests__/*.test.ts
apps/web/src/features/brand-shell/data/repositories/use-brand-voice-repository.ts
apps/web/src/features/brand-shell/data/repositories/use-visual-identity-repository.ts
apps/web/src/features/brand-shell/data/repositories/__tests__/*.test.tsx
apps/web/src/features/brand-shell/presentation/validators/upsert-brand-voice.resolver.ts
apps/web/src/features/brand-shell/presentation/validators/upsert-visual-identity.resolver.ts
apps/web/src/features/brand-shell/presentation/validators/__tests__/*.test.ts
apps/web/src/features/brand-shell/presentation/components/ArrayField/   (extracted shared component — 4-file pattern + __tests__/)
apps/web/src/features/brand-shell/presentation/components/RepeatableRowGroup/   (new shared component — 4-file pattern + __tests__/)
apps/web/src/features/brand-shell/presentation/components/BrandGuidelinesSubNav/   (4-file pattern + __tests__/)
apps/web/src/features/brand-shell/presentation/components/BrandVoiceForm/   (4-file pattern + __tests__/)
apps/web/src/features/brand-shell/presentation/components/VisualIdentityForm/   (4-file pattern + __tests__/)
apps/web/src/features/brand-shell/presentation/pages/brand-guidelines-detail/index.tsx   (REPLACE the placeholder <section> block with <BrandGuidelinesSubNav .../>)
apps/web/src/features/brand-shell/presentation/pages/brand-guidelines-detail/types.ts   (REMOVE the unused placeholder UIModel block; minor refactor permitted within the file)
apps/web/src/features/brand-shell/presentation/pages/brand-guidelines-detail/map-to-brand-guidelines-detail-ui-model.ts   (drop placeholder mapping; corresponding test updates)
apps/web/src/features/brand-shell/presentation/pages/brand-guidelines-detail/__tests__/*.test.{ts,tsx}   (UPDATE existing tests to mock the sub-nav component and assert mount)

apps/web/src/features/presentation/localization/languages/en/common.ts   (APPEND adminBrandGuidelines.subNav, .voice, .visual sub-trees)
apps/web/src/features/presentation/localization/languages/ro/common.ts   (APPEND parallel keys)
apps/web/src/features/presentation/localization/types.ts   (extend AdminBrandGuidelinesTranslations to include the new keys; TS parity gate enforces both languages)
apps/web/src/features/presentation/localization/__tests__/parity.test.ts   (APPEND assertions for new keys)
```

**Excluded paths (do NOT modify, hook will block):**
- `apps/api/src/modules/brand/application/controllers/brand.controller.ts` — **EXCEPT** the single additive `@ResourceCaptures` tuple per mx-3bf156 carve-out (above). If the runtime probe emits `RESOURCE_CAPTURE_PATHPARAM_UNDECLARED` after wiring the nested controllers, builder MAY append `{ fromPath: 'id', resource: 'brand', pathParam: 'brandId' }` as a second tuple to the decorator and ONLY this. Any other edit to this file requires a `flow_mismatch` mail to the lead.
- `apps/api/src/modules/company-info/**` — Phase-2 reference, read-only.
- `apps/web/src/features/company-info/**` — Phase-2 reference, read-only.
- `apps/web/src/features/admin-shell/**` — Chunk A already added registry entry; no further edits.
- `apps/web/src/features/auth/**`, `apps/api/src/common/auth/**`, `apps/api/src/common/guards/**` — Keycloak/oauth2-proxy untouched.
- `.overstory/runtime-contract.flows/sfx-webapp-boilerplate-72fd.json` — flow file authored by lead/coordinator. Builder does NOT write; path-boundary hook blocks Write/Edit/MultiEdit/NotebookEdit.

---

## 13. mx-3bf156 carve-out (verbatim, REQUIRED)

**Exception:** a single additive `@ResourceCaptures` tuple on the parent brand CREATE handler (`apps/api/src/modules/brand/application/controllers/brand.controller.ts`) — same `fromPath`, same `resource`, only `pathParam` differs — is permitted and required when the runtime probe emits `RESOURCE_CAPTURE_PATHPARAM_UNDECLARED`. The parent module + its `POST /api/v1/brands` controller is delivered by Chunk A but is NOT locked behind a blanket "do not modify" wall. Downstream chunk builders (Chunks B, C, D, E) may append to the captures array without ownership escalation; the parent file is in the builder's FILE_SCOPE for this additive change only.

---

## 14. Build/test pipeline order (TDD)

For each task above, the builder's loop is:

1. Read the task's referenced existing-code files (concrete paths above).
2. Create the test file FIRST under `__tests__/` with red-only assertions for the planned API.
3. Run `pnpm --filter <package> test -- <test-path>` and confirm RED with expected error messages (no test infrastructure failures).
4. Write the implementation file.
5. Run the test → GREEN.
6. Run `pnpm --filter <package> typecheck && pnpm --filter <package> lint` → green.
7. Move to next task.

After all source tasks:

8. `pnpm typecheck && pnpm lint` at repo root.
9. `pnpm test:coverage` → 90% line/branch coverage across all new files.
10. `pnpm db:generate` (idempotent — confirm `prisma.brandVoice` / `prisma.visualIdentity` are in the generated client).
11. `pnpm db:migrate -- --name add_brand_voice_and_visual_identity` (per mulch mx-6d88ea — trust the bridge, do NOT `pnpm stack:reset`). Verify with `pnpm stack:bridge`.
12. `pnpm test:integration` → both new integration files pass.
13. `pnpm probe:smoke` → zero failures. If probe emits `RESOURCE_CAPTURE_PATHPARAM_UNDECLARED`, apply mx-3bf156 carve-out (§13) and re-run.
14. Invoke `qa-test` skill in standard mode for J2 + J3 acceptance per §8 B-UI-QA.
15. Send `worker_done` mail with `## runtime-evidence` (probe summary), `## ui-evidence` (qa-test transcript), `## coverage` (test:coverage summary), and the diff stat per file group.

If any of steps 8–14 fail and the root cause is in a flow file (`.overstory/runtime-contract.flows/sfx-webapp-boilerplate-72fd.json` or `_shared.json`), invoke the `flow-failure-response` skill — DO NOT edit the flow file directly (hook will block).

---

## 15. Estimated total diff size

| Layer | Lines source | Lines test | New files | Modified files |
|---|---:|---:|---:|---:|
| Domain | ~150 | ~150 | 4 | 1 |
| Validation | ~280 | ~250 | 2 | 2 |
| Database | ~40 prisma + ~60 migration SQL | n/a | 0 + migration dir | 1 (schema.prisma) |
| Backend module | ~600 | ~800 | ~14 | 2 (brand.module.ts, brand.controller.ts if carve-out) |
| Frontend data | ~250 | ~350 | ~12 | 0 |
| Frontend presentation | ~1500 | ~2000 | ~20 | 4 (constants, index, page, page-related tests) |
| Localization | ~250 | ~50 | 0 | 4 |
| Integration tests | n/a | ~600 | 2 | 0 |
| **Total** | **~3000** | **~4200** | **~54** | **~14** |

Builder dispatch capacity per `.overstory/config.yaml`: 1 builder slot. Estimated wall-clock with TDD discipline: 6–10 hours of focused builder time.

---

## 16. References

- Parent product plan: `.overstory/specs/sfx-webapp-boilerplate-ba09.md` §3 Chunk B + §5 J2 + §5 J3 + cross-cutting.
- Chunk A spec: `.overstory/specs/sfx-webapp-boilerplate-3e6a.md` (pointer to scout-bg-chunk-a's full spec at `/workspace/.overstory/worktrees/scout-bg-chunk-a/.overstory/specs/sfx-webapp-boilerplate-3e6a.md` — 787 lines).
- Phase-2 F2 backend reference: `apps/api/src/modules/company-info/` (singleton + version transaction pattern).
- Phase-2 F2 frontend reference: `apps/web/src/features/company-info/presentation/pages/company-info/` (ArrayField pattern, form shell, pending/success/error UX).
- Mulch records consulted: mx-cbd785 (declaration-driven contract), mx-967e12 (PATCH/PUT 404 + @ApiBody Zod binding), mx-d9b182 (form.reset infinite re-render guard), mx-e7eb2d (executeRequest error parser), mx-852671 (ArrayField repeatable list pattern — Phase-2 F2), mx-6d88ea (trust the bridge for `pnpm db:migrate`), mx-3bf156 (parent-module carve-out for nested @ResourceCaptures).
- Dispatch mail: `msg-n79a0ihct5e4` (coordinator → scout-bg-chunk-b-v1, 2026-05-17).

---

## 17. Notable findings (for coordinator's mulch ingest)

- **Sub-nav registry placement decision (tactical):** `BRAND_GUIDELINES_SUB_NAV_REGISTRY` lives in `apps/web/src/features/brand-shell/constants.ts`, NOT in a new file. Reason: keeps Chunk C's FILE_SCOPE narrow (one file to APPEND to) and mirrors Chunk A's `ADMIN_TAB_REGISTRY` co-location in `admin-shell/constants.ts`. Risk: file grows; mitigated by keeping registry entries small (id + labelKey + slot).
- **`ArrayField` extraction is opportunistic (observational):** Phase-2 F2's `ArrayField` (inline in `company-info/.../index.tsx` lines 142-230) is parameterized only on field-name shape. Extracting into a shared component under `brand-shell/presentation/components/ArrayField/` is the right move now that a second consumer exists; without it, Chunk B would duplicate ~90 lines. If builder finds the extraction breaks Phase-2 tests, fall back to inline duplication in B and file a follow-up cleanup task. Flagged for review.
- **Singleton PK choice (foundational):** `BrandVoice.brandId @id` and `VisualIdentity.brandId @id` — using `brandId` as BOTH PK + FK enforces per-brand singleton at the DB level with zero index overhead. Pattern is the standard "1:0..1 with shared PK" — mirrors how Phase-2 `CompanyInfo` would have been modeled if multi-tenant. Worth recording as a project convention.
- **`@ResourceCaptures` additive carve-out (foundational):** mx-3bf156 carve-out wording promoted to spec §13 verbatim. Every downstream chunk's spec (C, D, E) inherits the same exception. Recommend the lead bake this into the product-plan template so future scouts don't re-derive.
- **`AUTH_ROLE_AGENT` is a Chunk E deliverable; B forward-compats by deferring multi-role guard to admin-only until E lands (project):** if `AUTH_ROLE_AGENT` is NOT yet in `@sfx/shared` at B-build time, B ships GET with admin-only and Chunk E adds `, AUTH_ROLE_AGENT` in a single-line append. This avoids a B-blocks-E dependency reversal.
- **Json columns + Prisma upsert (tactical):** Prisma's `upsert` on a single-PK model is one round-trip; `update` falls back to `create` when no row matches. `data` object's Json columns get cast via `Prisma.InputJsonValue` — pattern mirrors `company-info-version.mapper.ts` `toVersionSnapshotJson`.

Classification suggestion: sub-nav registry + ArrayField extraction = **tactical**; singleton PK + carve-out + role forward-compat = **foundational**; Json/upsert + AUTH_ROLE_AGENT pattern = **observational** until the builder confirms green.
