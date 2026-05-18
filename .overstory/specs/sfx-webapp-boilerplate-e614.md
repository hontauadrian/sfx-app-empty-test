<!-- written-by: scout-bg-chunk-d-v1 -->
<!-- written-by: scout-bg-chunk-d-v1 -->
# Feature spec — Chunk D: Per-brand versioning + history view + standalone reads + Swagger

Top-level: `sfx-webapp-boilerplate-ba09` (Phase-3 product plan, §3 Chunk D + §5 J6 + §5 cross-cutting openapi/freshness/auth + §5 J8 forward-compat for standalone reads).
Feature task: `sfx-webapp-boilerplate-e614`.
Scout subtask: `sfx-webapp-boilerplate-425e`.
Source dispatch: msg-2a7yqoopllsp (coordinator → scout-bg-chunk-d-v1, 2026-05-17).
Mode: direct-builder. Auth scaffold preserved — Keycloak + oauth2-proxy + RS256/JWKS unchanged; no new login/register/HS256/cookie work.

Builds on Chunk A (`sfx-webapp-boilerplate-3e6a`, merged 6298208), Chunk B (`sfx-webapp-boilerplate-72fd`, merged afbe55d), Chunk C (`sfx-webapp-boilerplate-e554`, merged cd142f2). Builder delivers per-brand `BrandGuidelinesVersion` domain entity + Prisma model + snapshot-on-mutate transactions inside every B/C mutating repo + a new versions controller + standalone Voice list reads + frontend `/history` and `/history/<versionId>` routes + sub-section `[View history]` affordances + optional `changeNote` per save + EN/RO translations + integration tests + qa-test J6 evidence.

---

## 1. Context — files read (and what each contributes)

### Phase-3 prior chunks (consumed; do NOT redefine)

| Path | Role for Chunk D |
|---|---|
| `.overstory/specs/sfx-webapp-boilerplate-ba09.md` | Product plan §3 Chunk D (feature scope), §5 J6 (history acceptance), §5 cross-cutting (`versionId` on every guideline response, freshness, openapi). |
| `.overstory/specs/sfx-webapp-boilerplate-3e6a.md` | Chunk A — Brand entity + Brand CRUD module + `BRAND_REPOSITORY` token; route shell `/admin/brand-guidelines` + `/admin/brand-guidelines/<brandId>`; `mx-3bf156` carve-out pattern verbatim. |
| `.overstory/specs/sfx-webapp-boilerplate-72fd.md` | Chunk B — `BrandVoice` + `VisualIdentity` entities + per-brand singleton repos + `BrandVoiceController` + `VisualIdentityController` (file-scope tells D where to extend without ownership escalation). |
| `.overstory/specs/sfx-webapp-boilerplate-e554.md` | Chunk C — `DosDontsEntry` CRUD + `BrandMetadata` upsert + `GuidelineSearch` + `BrandGuidelinesModule`. **§D (Versioning) at line 891-893 codifies the wrap-in-`$transaction` convention so D can append snapshot inserts without restructuring** — quoted verbatim into §13 below. |
| `.overstory/specs/sfx-webapp-boilerplate-d0fe.md` | Phase-2 F5 frontend history pattern — list page (table newest-first) + read-only detail page (banner + disabled inputs + back-to-current). Chunk D's frontend mirrors the structure under `brand-shell/`. |

### Backend reference (Phase-2 CompanyInfo) — read for pattern, do NOT modify

| Path | What D mirrors |
|---|---|
| `apps/api/src/modules/company-info/application/controllers/company-info.controller.ts` (lines 105-150) | `@Get('versions')` + `@Get('versions/:id')` shape — `@ApiExtension('x-cursor-invalid-behavior', 'empty-200')`, `@ApiQuery` for take/cursor, default page size 50, 404 on unknown id, full `@ApiResponse` set. |
| `apps/api/src/modules/company-info/data/repositories/company-info.repository.ts` (lines 30-93) | `upsertSingleton` writes `companyInfoVersion` inside `prisma.$transaction(...)` (lines 35-50); `listVersions` uses cursor pagination with unknown-cursor → `{ items: [], nextCursor: null }` (lines 53-87); `findVersionById` returns null on miss (lines 90-93). |
| `apps/api/src/modules/company-info/data/mapper/company-info-version.mapper.ts` | `toVersionSnapshotJson(...)` returns a flat record; `toCompanyInfoVersion(...)` rehydrates `createdAt` + array fields. Pattern mirrored for `brand-guidelines-version.mapper.ts`. |
| `apps/api/src/modules/company-info/application/dto/company-info-version.dto.ts` | Per-property `@ApiProperty({ type: ... })` (mulch `mx-cbd785`); nullable cursor declared `type: String, nullable: true`. |
| `apps/api/src/modules/company-info/application/pipes/list-company-info-versions-query.pipe.ts` | Pipe class extending `ZodValidationPipe(listCompanyInfoVersionsQuerySchema)` — D mirrors with `listBrandGuidelinesVersionsQuerySchema`. |
| `packages/validation/src/schemas/company-info.schema.ts` (lines 92-167) | Cursor-pagination schema set: `companyInfoVersionResponseSchema`, `listCompanyInfoVersionsQuerySchema` (`take` 1-100 default 50, optional `cursor`), `companyInfoVersionsPageSchema`. Each field carries `.openapi({ description, example })`. |
| `packages/domain/src/entities/company-info-version.ts` | `CompanyInfoVersion { id, companyInfoId, snapshot, editorUserId, editorDisplayName, createdAt }`; `ListCompanyInfoVersionsInput { take, cursor? }`; `ListCompanyInfoVersionsResult { items, nextCursor }`. D defines analogous types. |
| `packages/domain/src/ports/company-info-repository.ts` | Port interface — `upsertSingleton(input, editor)` + `listVersions(input)` + `findVersionById(id)`. D pattern: a separate port `BrandGuidelinesVersionRepository` because the snapshot composer reads from four other repos. |
| `packages/database/prisma/schema.prisma` (`model CompanyInfoVersion` lines 40-52) | Pattern: `id @id @default(cuid())`, parent FK + `onDelete: Cascade`, `snapshot Json`, `editorUserId/editorDisplayName String`, `createdAt @default(now())`, index `(parentId, createdAt desc, id desc)` for cursor pagination. |

### Existing brand surface (read, then extend additively)

| Path | Current role | Chunk D touches |
|---|---|---|
| `apps/api/src/modules/brand/brand.module.ts` | Registers `BrandController` + `BrandVoiceController` + `VisualIdentityController` + their pipes + `BRAND_REPOSITORY` + `BRAND_VOICE_REPOSITORY` + `VISUAL_IDENTITY_REPOSITORY` providers. | APPEND `BRAND_GUIDELINES_VERSION_REPOSITORY` provider + `ChangeNoteQueryPipe` so the brand-module-scoped Voice/Visual controllers can inject them. |
| `apps/api/src/modules/brand/application/controllers/brand-voice.controller.ts` | `GET` + `PUT` `/brands/:brandId/guidelines/voice`. | **Carve-out:** APPEND three `@Get('restricted-vocabulary')` / `@Get('approved-examples')` / `@Get('rejected-examples')` handlers (§5.E). Add `latestVersionId` to the `@Get()` response envelope (§5.G). Add `?changeNote=...` query param read on PUT. |
| `apps/api/src/modules/brand/application/controllers/visual-identity.controller.ts` | `GET` + `PUT` `/brands/:brandId/guidelines/visual`. | **Carve-out:** add `?changeNote=...` on PUT. Add `latestVersionId` to GET response (§5.G). |
| `apps/api/src/modules/brand/data/repositories/brand-voice.repository.ts` | `upsertForBrand` calls `prisma.brandVoice.upsert(...)` directly (NOT inside `$transaction`). | **Carve-out:** wrap in `prisma.$transaction(async (tx) => { ... })`; append `await writeBrandGuidelinesVersion(tx, brandId, editor, changeNote)` after the singleton write (§5.D, §13). |
| `apps/api/src/modules/brand/data/repositories/visual-identity.repository.ts` | Same shape as brand-voice repo. | **Carve-out:** identical change. |
| `apps/api/src/modules/brand/data/repositories/brand-guidelines.tokens.ts` | Exports `BRAND_VOICE_REPOSITORY`, `VISUAL_IDENTITY_REPOSITORY`. | APPEND `BRAND_GUIDELINES_VERSION_REPOSITORY` symbol. |
| `apps/api/src/modules/brand-guidelines/brand-guidelines.module.ts` | Registers `DosAndDontsController`, `BrandMetadataController`, `GuidelineSearchController`. | APPEND `BrandGuidelinesVersionsController` + `BRAND_GUIDELINES_VERSION_REPOSITORY` provider + `ListBrandGuidelinesVersionsQueryPipe` + `ChangeNoteQueryPipe`. |
| `apps/api/src/modules/brand-guidelines/application/controllers/dos-and-donts.controller.ts` | POST/PATCH/DELETE + GET list. | **Carve-out:** `?changeNote=...` read on POST/PATCH/DELETE; declare `latestVersionId` on list response envelope (§5.G). |
| `apps/api/src/modules/brand-guidelines/application/controllers/brand-metadata.controller.ts` | GET + PUT. | **Carve-out:** `?changeNote=...` on PUT; declare `latestVersionId` on GET response. |
| `apps/api/src/modules/brand-guidelines/data/repositories/dos-and-donts.repository.ts` | Mutations already wrap `prisma.$transaction(...)` (per Chunk C convention, §13). | **Carve-out:** inside each existing `$transaction` block, APPEND `await writeBrandGuidelinesVersion(tx, brandId, editor, changeNote)` after the primary mutation. No restructuring. |
| `apps/api/src/modules/brand-guidelines/data/repositories/brand-metadata.repository.ts` | `upsertByBrandId` already wraps `$transaction`. | **Carve-out:** identical single-line append inside the existing block. |
| `apps/api/src/modules/brand-guidelines/application/dto/*` | DTOs for D&D / metadata / search. | **Carve-out (response-only):** add `latestVersionId: string | null` to the relevant response DTOs (§5.G). |
| `packages/database/prisma/schema.prisma` | Holds `Brand`, `BrandVoice`, `VisualIdentity`, `DosDontsEntry`, `BrandMetadata`, `CompanyInfo`, `CompanyInfoVersion`. | APPEND `model BrandGuidelinesVersion { ... }` + back-relation field `versions BrandGuidelinesVersion[]` on `Brand` model (1-line additive edit). |
| `packages/domain/src/entities/` | Chunks A-C entities. | Add `brand-guidelines-version.ts` (composite snapshot type + version row + list types). No edits to existing entity files. |
| `packages/domain/src/index.ts` | Type-only barrel. | APPEND-only — re-export the new types. |
| `packages/validation/src/schemas/` | Chunk A/B/C schemas. | Add `brand-guidelines-version.schema.ts`. **Carve-out (response-only):** extend `brandVoiceResponseSchema`, `visualIdentityResponseSchema`, `brandMetadataResponseSchema`, and the dos-and-donts list response schema with `latestVersionId: z.string().min(1).nullable()`. Existing upsert schemas unaffected. |

### Frontend reference (Phase-2 CompanyInfo history) — mirror, do NOT modify

| Path | What D mirrors |
|---|---|
| `apps/web/src/features/company-info/presentation/pages/company-info-history/index.tsx` | List page shell (header + back link + skeleton + empty/error/denied/ready branches + semantic `<table>` newest-first). |
| `apps/web/src/features/company-info/presentation/pages/company-info-history-detail/index.tsx` | Detail page shell (banner + `<fieldset>` per section + every input `disabled` + `aria-disabled="true"` + back-to-current link). |
| `apps/web/src/features/company-info/data/repositories/use-company-info-versions-repository.ts` + `use-company-info-version-repository.ts` | React-Query hooks with cursor-page query key + per-id query key; `retry: false`; `select` mapper. |
| `apps/web/src/features/company-info/data/remote/fetch-company-info-versions.ts` + `fetch-company-info-version-by-id.ts` | `executeRequest<ApiEnvelope<T>>` calls; URLSearchParams for `take`/`cursor` only when defined. |
| `apps/web/src/features/company-info/data/model/company-info-version-data-model.ts` + `map-to-company-info-version.ts` | Wire shape + ISO → Date rehydration on snapshot. |
| `apps/web/src/features/company-info/constants.ts` | `COMPANY_INFO_VERSIONS_QUERY_KEY = ['company-info', 'versions']` + `COMPANY_INFO_VERSION_QUERY_KEY = (id) => ['company-info', 'versions', id]`. Mirrored array-prefix structure for D's per-brand version query keys. |

### Existing brand-shell frontend (read, then extend additively)

| Path | Current role | Chunk D touches |
|---|---|---|
| `apps/web/src/features/brand-shell/constants.ts` | Endpoint factories + query keys for brands/voice/visual/dosDonts/metadata/search + `BRAND_GUIDELINES_SUB_NAV_REGISTRY` (4 entries, locked shape `{ id, labelKey, slot }`). | APPEND endpoint factories `brandGuidelinesVersionsEndpoint(brandId)`, `brandGuidelinesVersionEndpoint(brandId, versionId)`, standalone Voice list endpoints; APPEND query-key factories. **No new sub-nav entry** — history is a separate route, surfaced as `[View history]` affordance per sub-section. |
| `apps/web/src/features/brand-shell/presentation/components/BrandVoiceForm/index.tsx`, `VisualIdentityForm/index.tsx`, `DosAndDontsList/index.tsx`, `MetadataForm/index.tsx` | Existing sub-section form/list components. | **Carve-out:** each gets a `[View history]` `<Link>` rendered next to its Save / primary CTA, deep-linking to `/admin/brand-guidelines/<brandId>/history`. Plus optional `changeNote` textarea on Save row whose value flows into the mutation. |
| `apps/web/src/features/brand-shell/presentation/pages/brand-guidelines-detail/index.tsx` | Active-brand workspace; mounts sub-nav + sub-section bodies. | No edits — `[View history]` lives per sub-section, not page-level. |
| `apps/web/src/features/brand-shell/data/repositories/use-brand-voice-repository.ts`, `use-visual-identity-repository.ts`, `use-dos-and-donts-repository.ts`, `use-brand-metadata-repository.ts` | Mutation hooks for B + C. | **Carve-out:** mutation arg extended to optionally include `changeNote?: string`; appended as `?changeNote=...` query string in the remote calls. React-Query `onSuccess` additionally invalidates `brandGuidelinesVersionsQueryKey(brandId)` so the history list refreshes after every save. |
| `apps/web/src/features/presentation/localization/types.ts` (line 434-454) | `AdminBrandGuidelinesTranslations` interface with optional sub-section namespaces. | APPEND `history?: AdminBrandGuidelinesHistoryTranslations` and `historyDetail?: AdminBrandGuidelinesHistoryDetailTranslations` (optional per existing convention). |
| `apps/web/src/app/admin/brand-guidelines/[brandId]/page.tsx` | Thin wrapper. | No edits. |
| `apps/web/src/app/admin/brand-guidelines/[brandId]/history/page.tsx` (NEW) + `[versionId]/page.tsx` (NEW) | New thin wrappers awaiting Next 15 async `params`. | New file group. |

### Out-of-scope (DO NOT touch)

- `apps/api/src/modules/auth/**`, `apps/api/src/common/auth/**`, `apps/api/src/common/guards/**` — Keycloak / oauth2-proxy / RS256 / JWKS preserved.
- `apps/web/src/features/auth/**` — auth pages untouched.
- `apps/api/src/modules/company-info/**` and `apps/web/src/features/company-info/**` — Phase-2 reference, read-only.
- `apps/web/src/features/admin-shell/**` — registry already covers `/admin/brand-guidelines/*` via `startsWith`.
- `apps/api/src/modules/brand/application/controllers/brand.controller.ts` — Chunk A's brand CRUD. **EXCEPT** the single additive `@ResourceCaptures` tuple per `mx-3bf156` carve-out (Chunk A §13) if the probe re-emits `RESOURCE_CAPTURE_PATHPARAM_UNDECLARED` after wiring versions. No other edit permitted.
- `.overstory/runtime-contract.flows/sfx-webapp-boilerplate-e614.json` — flow file authored by lead/coordinator; the path-boundary hook blocks builder writes.
- `apps/web/src/features/brand-shell/constants.ts`'s `BRAND_GUIDELINES_SUB_NAV_REGISTRY` array — D does NOT append a 5th entry. History is a separate route.

---

## 2. Domain (Tasks D-D1, D-D2)

### Task D-D1 — `BrandGuidelinesVersion` entity + composite snapshot type

Create `packages/domain/src/entities/brand-guidelines-version.ts`:

```ts
import type { BrandVoice } from './brand-voice';
import type { VisualIdentity } from './visual-identity';
import type { DosDontsEntry } from './dos-donts-entry';
import type { BrandMetadata } from './brand-metadata';

// Immutable composition of all four guideline sub-resources at a point
// in time. Json-stored on disk; the repository mapper rehydrates Date
// fields and array shapes when reading.
export interface BrandGuidelinesSnapshot {
  readonly voice: BrandVoice | null;
  readonly visual: VisualIdentity | null;
  readonly dosAndDonts: readonly DosDontsEntry[];
  readonly metadata: BrandMetadata | null;
}

export interface BrandGuidelinesVersion {
  readonly id: string;
  readonly brandId: string;
  readonly snapshot: BrandGuidelinesSnapshot;
  readonly editorUserId: string;
  readonly editorDisplayName: string;
  readonly changeNote: string | null;
  readonly createdAt: Date;
}

// Cursor-style newest-first pagination — mirrors
// ListCompanyInfoVersionsInput from F4 (clamped to [1, 100], default 50
// applied at the controller level).
export interface ListBrandGuidelinesVersionsInput {
  readonly brandId: string;
  readonly take: number;
  readonly cursor?: string;
}

export interface ListBrandGuidelinesVersionsResult {
  readonly items: readonly BrandGuidelinesVersion[];
  readonly nextCursor: string | null;
}
```

Append exports to `packages/domain/src/index.ts` (APPEND-only):
```ts
export type {
  BrandGuidelinesVersion,
  BrandGuidelinesSnapshot,
  ListBrandGuidelinesVersionsInput,
  ListBrandGuidelinesVersionsResult,
} from './entities/brand-guidelines-version';
export type { BrandGuidelinesVersionRepository } from './ports/brand-guidelines-version-repository';
```

Tests under `packages/domain/src/entities/__tests__/brand-guidelines-version.test.ts` — type-only barrel test (mirrors `brand-voice.test.ts`).

Acceptance: `pnpm --filter @sfx/domain typecheck && pnpm --filter @sfx/domain test` — green.

### Task D-D2 — Port `BrandGuidelinesVersionRepository`

Create `packages/domain/src/ports/brand-guidelines-version-repository.ts`:

```ts
import type {
  BrandGuidelinesVersion,
  ListBrandGuidelinesVersionsInput,
  ListBrandGuidelinesVersionsResult,
} from '../entities/brand-guidelines-version';

export interface BrandGuidelinesVersionRepository {
  list(input: ListBrandGuidelinesVersionsInput): Promise<ListBrandGuidelinesVersionsResult>;
  findById(id: string): Promise<BrandGuidelinesVersion | null>;
  findLatestForBrand(brandId: string): Promise<BrandGuidelinesVersion | null>;
}
```

Tests under `packages/domain/src/ports/__tests__/brand-guidelines-version-repository.test.ts` — type-only barrel test.

Acceptance: typecheck + test green.

---

## 3. Validation — Zod schemas (Tasks D-V1, D-V2)

### Task D-V1 — `brand-guidelines-version.schema.ts`

Create `packages/validation/src/schemas/brand-guidelines-version.schema.ts`. Mirrors `company-info.schema.ts:92-167` with a composite-snapshot field. The snapshot field references existing Chunk B/C response schemas — builder MUST verify exact import paths against `packages/validation/src/index.ts` before writing (the dos-and-donts + metadata schemas may live in `brand-guidelines.schema.ts` rather than separate files):

```ts
import '../openapi';
import { z } from 'zod';
import { brandVoiceResponseSchema } from './brand-voice.schema';
import { visualIdentityResponseSchema } from './visual-identity.schema';
import {
  dosDontsEntryResponseSchema,
  brandMetadataResponseSchema,
} from './brand-guidelines.schema';

export const brandGuidelinesSnapshotSchema = z
  .object({
    voice: brandVoiceResponseSchema.nullable(),
    visual: visualIdentityResponseSchema.nullable(),
    dosAndDonts: z.array(dosDontsEntryResponseSchema).openapi({ description: 'D&D entries newest-first' }),
    metadata: brandMetadataResponseSchema.nullable(),
  })
  .strict()
  .openapi({ description: 'Full four-section guideline snapshot at the time the version was saved' });

export const brandGuidelinesVersionResponseSchema = z
  .object({
    id: z.string().min(1).openapi({ description: 'Version identifier', example: 'clxbgv0001' }),
    brandId: z.string().min(1).openapi({ description: 'Brand identifier' }),
    snapshot: brandGuidelinesSnapshotSchema,
    editorUserId: z.string().min(1).openapi({ description: 'Auth subject of the editor', example: 'auth-user-abc' }),
    editorDisplayName: z.string().min(1).openapi({ description: 'Editor display name (email or username)' }),
    changeNote: z.string().max(500).nullable().openapi({ description: 'Optional change note supplied by the editor' }),
    createdAt: z.date().openapi({ description: 'Version creation timestamp' }),
  })
  .strict()
  .openapi({ description: 'A single brand-guidelines version row' });

export type BrandGuidelinesVersionResponse = z.infer<typeof brandGuidelinesVersionResponseSchema>;

export const listBrandGuidelinesVersionsQuerySchema = z
  .object({
    take: z.coerce.number().int('take must be an integer').min(1).max(100).optional()
      .openapi({ description: 'Page size; default 50', example: 50 }),
    cursor: z.string().min(1, 'cursor must be a non-empty string').optional()
      .openapi({ description: 'Opaque cursor — id of the last version returned in the previous page' }),
  })
  .strict()
  .openapi({ description: 'Query parameters for listing brand-guidelines versions' });

export type ListBrandGuidelinesVersionsQuery = z.infer<typeof listBrandGuidelinesVersionsQuerySchema>;

export const brandGuidelinesVersionsPageSchema = z
  .object({
    items: z.array(brandGuidelinesVersionResponseSchema).openapi({ description: 'Versions newest-first' }),
    nextCursor: z.string().min(1).nullable().openapi({ description: 'Cursor for the next page, or null when no further pages exist' }),
  })
  .strict()
  .openapi({ description: 'Paginated list of brand-guidelines versions' });

export type BrandGuidelinesVersionsPage = z.infer<typeof brandGuidelinesVersionsPageSchema>;

export const changeNoteQuerySchema = z
  .object({
    changeNote: z.string().trim().max(500, 'changeNote must be 500 characters or fewer').optional()
      .openapi({ description: 'Optional change note attached to the version row created by this mutation' }),
  })
  .strict()
  .openapi({ description: 'Optional ?changeNote=... query parameter shared by every mutating guideline endpoint' });

export type ChangeNoteQuery = z.infer<typeof changeNoteQuerySchema>;
```

Append to `packages/validation/src/index.ts` (APPEND-only):
```ts
export {
  brandGuidelinesSnapshotSchema,
  brandGuidelinesVersionResponseSchema,
  listBrandGuidelinesVersionsQuerySchema,
  brandGuidelinesVersionsPageSchema,
  changeNoteQuerySchema,
} from './schemas/brand-guidelines-version.schema';
export type {
  BrandGuidelinesVersionResponse,
  ListBrandGuidelinesVersionsQuery,
  BrandGuidelinesVersionsPage,
  ChangeNoteQuery,
} from './schemas/brand-guidelines-version.schema';
```

Tests in `packages/validation/src/schemas/__tests__/brand-guidelines-version.schema.test.ts` — valid payload; `take` out of range (0, 101) → 400; cursor empty string → 400; unknown query key under `.strict()` → 400; `changeNote` over 500 chars → 400; snapshot nullable fields accept null.

### Task D-V2 — Response-schema extension carve-out

Append `latestVersionId: z.string().min(1).nullable().openapi({ description: 'Id of the latest BrandGuidelinesVersion row that produced this payload; null until a version exists' })` to:
- `brandVoiceResponseSchema` (Chunk B file `packages/validation/src/schemas/brand-voice.schema.ts`)
- `visualIdentityResponseSchema` (Chunk B file `packages/validation/src/schemas/visual-identity.schema.ts`)
- `brandMetadataResponseSchema` (Chunk C file `packages/validation/src/schemas/brand-guidelines.schema.ts`)
- The dos-and-donts list response envelope (Chunk C — verify name against the barrel)

Each existing response-schema test gets a new assertion `latestVersionId: 'string|null'`.

Acceptance: `pnpm --filter @sfx/validation typecheck && test` green.

---

## 4. Database — Prisma model + migration (Task D-DB1)

### Task D-DB1 — `BrandGuidelinesVersion` model

Append to `packages/database/prisma/schema.prisma`:

```prisma
model BrandGuidelinesVersion {
  id                String   @id @default(cuid())
  brandId           String   @map("brand_id")
  snapshot          Json
  editorUserId      String   @map("editor_user_id")
  editorDisplayName String   @map("editor_display_name")
  changeNote        String?  @map("change_note") @db.Text
  createdAt         DateTime @default(now()) @map("created_at")

  brand             Brand    @relation(fields: [brandId], references: [id], onDelete: Cascade)

  @@index([brandId, createdAt(sort: Desc), id(sort: Desc)], map: "brand_guidelines_version_brand_created_desc_idx")
  @@map("brand_guidelines_version")
}
```

Add ONE back-relation line to the existing `Brand` model (alongside the other back-relations at line 63-66):
```prisma
  versions        BrandGuidelinesVersion[]
```

**Decisions baked in:**
- `onDelete: Cascade` — if a brand is hard-deleted, version rows vacate with it. Per Chunk A, brand delete is *soft* (`deletedAt` + tombstoned slug), so cascade only fires on a future hard-delete sweep. Soft-deleted brand's version rows persist until hard delete; consistent with §5 J7 acceptance.
- Index `(brandId, createdAt DESC, id DESC)` — supports cursor-pagination order in `listVersions`. id tiebreaker keeps cursor stable when two versions share a timestamp.
- `changeNote String? @db.Text` — nullable, free text up to 500 chars (enforced by Zod, not DB).
- `snapshot Json` — typed as `BrandGuidelinesSnapshot` at the domain layer; ISO strings on disk for Date fields; mapper rehydrates them on read.

Run `pnpm db:migrate -- --name add_brand_guidelines_version` per mulch `mx-6d88ea` — trust the panel-bridge, do NOT `pnpm stack:reset`. Verify with `pnpm stack:bridge | tail -50`.

Acceptance: `pnpm typecheck && pnpm probe:smoke`.

---

## 5. Backend — repository, snapshot composer, controllers (Tasks D-B1 … D-B9)

Module placement: the new versions surface + the snapshot composer live in `apps/api/src/modules/brand-guidelines/` (same module that already owns dos-and-donts + metadata + search). The DI token lives in `apps/api/src/modules/brand/data/repositories/brand-guidelines.tokens.ts` so the brand module's controllers can inject the same token without a circular module import.

### Task D-B1 — Token

Append to `apps/api/src/modules/brand/data/repositories/brand-guidelines.tokens.ts`:
```ts
export const BRAND_GUIDELINES_VERSION_REPOSITORY = Symbol.for('BrandGuidelinesVersionRepository');
```

Tests in matching `__tests__/brand-guidelines.tokens.test.ts` — assert symbol is unique and uses `Symbol.for(...)` for cross-module identity.

### Task D-B2 — `composeSnapshotInTx` (transaction-scoped helper)

Create `apps/api/src/modules/brand-guidelines/data/version/snapshot-composer.ts`:

```ts
import type { Prisma } from '@sfx/database';
import type { BrandGuidelinesSnapshot } from '@sfx/domain';
import { toBrandVoice } from '../../../brand/data/mapper/brand-voice.mapper';
import { toVisualIdentity } from '../../../brand/data/mapper/visual-identity.mapper';
import { toDosDontsEntry } from '../mapper/dos-and-donts.mapper';
import { toBrandMetadata } from '../mapper/brand-metadata.mapper';

export async function composeSnapshotInTx(
  tx: Prisma.TransactionClient,
  brandId: string,
): Promise<BrandGuidelinesSnapshot> {
  const [voiceRow, visualRow, dosRows, metadataRow] = await Promise.all([
    tx.brandVoice.findUnique({ where: { brandId } }),
    tx.visualIdentity.findUnique({ where: { brandId } }),
    tx.dosDontsEntry.findMany({ where: { brandId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
    tx.brandMetadata.findUnique({ where: { brandId } }),
  ]);
  return {
    voice: voiceRow ? toBrandVoice(voiceRow) : null,
    visual: visualRow ? toVisualIdentity(visualRow) : null,
    dosAndDonts: dosRows.map(toDosDontsEntry),
    metadata: metadataRow ? toBrandMetadata(metadataRow) : null,
  };
}
```

**Cross-module import note:** the composer imports mappers from `brand/data/mapper/*` (pure functions, no NestJS lifecycle). If the `brand` module barrel does not re-export them, import via concrete file paths.

Tests under `__tests__/snapshot-composer.test.ts` — mock the Prisma transaction client; verify null sub-resources map to null; verify dos-and-donts ordering preserved; verify all four sections present when populated.

### Task D-B3 — `writeBrandGuidelinesVersion` tx-scoped helper

Create `apps/api/src/modules/brand-guidelines/data/version/write-version.ts`:

```ts
import type { Prisma } from '@sfx/database';
import type { BrandGuidelineEditor } from '@sfx/domain';
import { composeSnapshotInTx } from './snapshot-composer';
import { toVersionSnapshotJson } from '../mapper/brand-guidelines-version.mapper';

export async function writeBrandGuidelinesVersion(
  tx: Prisma.TransactionClient,
  brandId: string,
  editor: BrandGuidelineEditor,
  changeNote: string | null,
): Promise<string /* versionId */> {
  const snapshot = await composeSnapshotInTx(tx, brandId);
  const row = await tx.brandGuidelinesVersion.create({
    data: {
      brandId,
      snapshot: toVersionSnapshotJson(snapshot) as Prisma.InputJsonValue,
      editorUserId: editor.editorUserId,
      editorDisplayName: editor.editorDisplayName,
      changeNote: changeNote ?? null,
    },
  });
  return row.id;
}
```

This single line is the entire D-time addition each B/C mutating repository receives (§13).

Tests under `__tests__/write-version.test.ts` — assert returned id is row.id; assert composer is invoked with the same `tx`; assert null + non-null changeNote both round-trip.

### Task D-B4 — `BrandGuidelinesVersion` mapper

Create `apps/api/src/modules/brand-guidelines/data/mapper/brand-guidelines-version.mapper.ts`. Mirror `company-info-version.mapper.ts:1-79`:
- `toVersionSnapshotJson(snapshot: BrandGuidelinesSnapshot): Record<string, unknown>` — serialises Date fields to ISO strings inside each sub-resource.
- `toBrandGuidelinesVersion(row: BrandGuidelinesVersionRow): BrandGuidelinesVersion` — rehydrates top-level `createdAt` and each sub-resource's `createdAt`/`updatedAt`. Delegates to existing mappers (`toBrandVoice`, `toVisualIdentity`, `toDosDontsEntry`, `toBrandMetadata`) by constructing synthetic Prisma rows from the JSONB payload (same pattern as `company-info-version.mapper.ts:49-79`).

Tests under `__tests__/brand-guidelines-version.mapper.test.ts` — round-trip every sub-resource; verify Date fields become Date on read; verify null sub-resources stay null; verify dos-and-donts array preserved with ordering; verify changeNote null + non-null round-trip.

### Task D-B5 — `BrandGuidelinesVersionPrismaRepository`

Create `apps/api/src/modules/brand-guidelines/data/repositories/brand-guidelines-version.repository.ts`. Mirror `company-info.repository.ts:53-93`:

```ts
@Injectable()
export class BrandGuidelinesVersionPrismaRepository implements BrandGuidelinesVersionRepository {
  constructor(
    @Inject(BRAND_GUIDELINES_PRISMA_CLIENT) private readonly prisma: PrismaClient,
  ) {}

  async list(input: ListBrandGuidelinesVersionsInput): Promise<ListBrandGuidelinesVersionsResult> {
    const take = input.take;
    const cursorRow = input.cursor
      ? await this.prisma.brandGuidelinesVersion.findFirst({ where: { id: input.cursor, brandId: input.brandId } })
      : null;
    if (input.cursor && !cursorRow) return { items: [], nextCursor: null };
    const rows = await this.prisma.brandGuidelinesVersion.findMany({
      where: {
        brandId: input.brandId,
        ...(cursorRow ? {
          OR: [
            { createdAt: { lt: cursorRow.createdAt } },
            { createdAt: cursorRow.createdAt, id: { lt: cursorRow.id } },
          ],
        } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
    });
    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;
    return {
      items: page.map(toBrandGuidelinesVersion),
      nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
    };
  }

  async findById(id: string): Promise<BrandGuidelinesVersion | null> {
    const row = await this.prisma.brandGuidelinesVersion.findUnique({ where: { id } });
    return row ? toBrandGuidelinesVersion(row) : null;
  }

  async findLatestForBrand(brandId: string): Promise<BrandGuidelinesVersion | null> {
    const row = await this.prisma.brandGuidelinesVersion.findFirst({
      where: { brandId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return row ? toBrandGuidelinesVersion(row) : null;
  }
}
```

**Note:** `findById` is brand-agnostic by design — the controller verifies brand-scoping (version's `brandId` field must match path's `:brandId`); otherwise `/brands/B1/.../<vid-of-B2>` could leak a foreign-brand snapshot. The controller's existence-check enforces 404 when version exists but belongs to a different brand.

Tests under `__tests__/brand-guidelines-version.repository.test.ts` — mock Prisma client; cover empty list, N+1 fetch trim, unknown cursor → empty (NOT throw), known cursor `OR` filter constructed correctly, `findById` null on miss, `findLatestForBrand` returns most-recent or null.

### Task D-B6 — `ListBrandGuidelinesVersionsQueryPipe`

Create `apps/api/src/modules/brand-guidelines/application/pipes/list-brand-guidelines-versions-query.pipe.ts`. Mirror `list-company-info-versions-query.pipe.ts`:
```ts
@Injectable()
export class ListBrandGuidelinesVersionsQueryPipe extends ZodValidationPipe<ListBrandGuidelinesVersionsQuery> {
  constructor() { super(listBrandGuidelinesVersionsQuerySchema); }
}
```

### Task D-B7 — `ChangeNoteQueryPipe` (shared)

Create `apps/api/src/modules/brand-guidelines/application/pipes/change-note-query.pipe.ts`:
```ts
@Injectable()
export class ChangeNoteQueryPipe extends ZodValidationPipe<ChangeNoteQuery> {
  constructor() { super(changeNoteQuerySchema); }
}
```

Wired on every mutating handler in §5.F.

### Task D-B8 — DTOs

Create `apps/api/src/modules/brand-guidelines/application/dto/brand-guidelines-version.dto.ts`. Mirror `company-info-version.dto.ts`:

```ts
export class BrandGuidelinesSnapshotDto {
  @ApiProperty({ type: BrandVoiceDto, nullable: true, description: 'Brand Voice snapshot' })
  declare voice: BrandVoiceDto | null;
  @ApiProperty({ type: VisualIdentityDto, nullable: true })
  declare visual: VisualIdentityDto | null;
  @ApiProperty({ type: [DosDontsEntryDto], isArray: true })
  declare dosAndDonts: readonly DosDontsEntryDto[];
  @ApiProperty({ type: BrandMetadataDto, nullable: true })
  declare metadata: BrandMetadataDto | null;
}

export class BrandGuidelinesVersionDto {
  @ApiProperty({ type: String, description: 'Version identifier', example: 'clxbgv0001' })
  declare id: string;
  @ApiProperty({ type: String, description: 'Owning brand identifier' })
  declare brandId: string;
  @ApiProperty({ type: BrandGuidelinesSnapshotDto, description: 'Full four-section guideline snapshot' })
  declare snapshot: BrandGuidelinesSnapshotDto;
  @ApiProperty({ type: String, description: 'Auth subject id of the editor' })
  declare editorUserId: string;
  @ApiProperty({ type: String, description: 'Editor display name' })
  declare editorDisplayName: string;
  @ApiProperty({ type: String, nullable: true, description: 'Optional change note' })
  declare changeNote: string | null;
  @ApiProperty({ type: String, format: 'date-time', description: 'Version creation timestamp' })
  declare createdAt: Date;
}

export class BrandGuidelinesVersionsPageDto {
  @ApiProperty({ type: [BrandGuidelinesVersionDto], isArray: true, description: 'Versions newest-first' })
  declare items: readonly BrandGuidelinesVersionDto[];
  @ApiProperty({ type: String, nullable: true, description: 'Cursor for the next page, or null when no further pages exist' })
  declare nextCursor: string | null;
}
```

Hard rule (mulch `mx-cbd785`): every `@ApiProperty` declares `type:` EXPLICITLY (tsx + esbuild does NOT emit reliable `design:type`). Arrays use `type: [DtoClass], isArray: true`; nullables use `nullable: true`. Never infer.

Tests in matching `__tests__/brand-guidelines-version.dto.test.ts` — each DTO instantiates; every Swagger metadata key has `type` defined.

### Task D-B9 — `BrandGuidelinesVersionsController`

Create `apps/api/src/modules/brand-guidelines/application/controllers/brand-guidelines-versions.controller.ts`. Mirrors `company-info.controller.ts:50-151` versions-section, plus existence checks for parent brand and cross-brand version requests:

```ts
const DEFAULT_VERSIONS_PAGE_SIZE = 50;

@ApiTags('brand-guidelines')
@Controller('brands/:brandId/guidelines/versions')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('accessToken')
export class BrandGuidelinesVersionsController {
  constructor(
    @Inject(BRAND_REPOSITORY) private readonly brandRepository: BrandRepository,
    @Inject(BRAND_GUIDELINES_VERSION_REPOSITORY)
    private readonly versionRepository: BrandGuidelinesVersionRepository,
  ) {}

  @Get()
  @AuthRoles(AUTH_ROLE_ADMIN /* AUTH_ROLE_AGENT lands in Chunk E */)
  @ApiOperation({
    summary: 'List brand-guidelines versions newest-first (paginated)',
    description:
      'Returns versions for the given brand ordered by `createdAt DESC, id DESC`. Use `take` (1-100, default 50) and `cursor` (opaque id of the last item on the previous page) to paginate. Unknown cursor returns 200 with an empty page (Linear/GitHub semantics).',
  })
  @ApiExtension('x-cursor-invalid-behavior', 'empty-200')
  @ApiParam({ name: 'brandId', type: String, description: 'Brand identifier' })
  @ApiQuery({ name: 'take', required: false, type: Number, description: 'Page size (1-100, default 50)' })
  @ApiQuery({ name: 'cursor', required: false, type: String, description: 'Opaque cursor (id of the last item on the previous page)' })
  @ApiResponse({ status: 200, description: 'Page of versions', type: ApiEnvelopeDto(BrandGuidelinesVersionsPageDto) })
  @ApiResponse({ status: 400, description: 'Invalid query parameters' })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  @ApiResponse({ status: 403, description: 'Authenticated user lacks the admin role' })
  @ApiResponse({ status: 404, description: 'Brand not found (missing or soft-deleted)' })
  @ResourceCaptures({ fromPath: 'brandId', resource: 'brand', pathParam: 'brandId' })
  async listVersions(
    @Param('brandId') brandId: string,
    @Query(ListBrandGuidelinesVersionsQueryPipe) query: ListBrandGuidelinesVersionsQuery,
  ): Promise<ListBrandGuidelinesVersionsResult> {
    await assertBrandActive(this.brandRepository, brandId);
    return this.versionRepository.list({
      brandId,
      take: query.take ?? DEFAULT_VERSIONS_PAGE_SIZE,
      cursor: query.cursor,
    });
  }

  @Get(':versionId')
  @AuthRoles(AUTH_ROLE_ADMIN)
  @ApiOperation({
    summary: 'Fetch a single brand-guidelines version by id',
    description: 'Returns the version with the given id, scoped to the brand on the path. 404 when the version does not exist or belongs to a different brand.',
  })
  @ApiParam({ name: 'brandId', type: String })
  @ApiParam({ name: 'versionId', type: String, description: 'Version identifier' })
  @ApiResponse({ status: 200, description: 'Version row', type: ApiEnvelopeDto(BrandGuidelinesVersionDto) })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  @ApiResponse({ status: 403, description: 'Authenticated user lacks the admin role' })
  @ApiResponse({ status: 404, description: 'Brand or version not found' })
  @ResourceCaptures({ fromPath: 'brandId', resource: 'brand', pathParam: 'brandId' })
  async findVersionById(
    @Param('brandId') brandId: string,
    @Param('versionId') versionId: string,
  ): Promise<BrandGuidelinesVersion> {
    await assertBrandActive(this.brandRepository, brandId);
    const version = await this.versionRepository.findById(versionId);
    if (!version || version.brandId !== brandId) {
      throw new NotFoundException('Version not found');
    }
    return version;
  }
}
```

Tests in matching `__tests__/brand-guidelines-versions.controller.test.ts` — mock both repositories; cover: missing brand → 404; unknown versionId → 404; cross-brand versionId → 404; happy list; happy single; admin-only role rejection.

### §5.D — Carve-out: snapshot-write inside B + C mutating repos

| Repository file | Method | Current state | D's append |
|---|---|---|---|
| `apps/api/src/modules/brand/data/repositories/brand-voice.repository.ts` | `upsertForBrand` | NOT wrapped in `$transaction`. | Wrap entire body in `prisma.$transaction(async (tx) => { ... })`; perform existing `upsert` against `tx.brandVoice`; APPEND `await writeBrandGuidelinesVersion(tx, brandId, editor, changeNote);` after. |
| `apps/api/src/modules/brand/data/repositories/visual-identity.repository.ts` | `upsertForBrand` | NOT wrapped. | Same wrap-and-append. |
| `apps/api/src/modules/brand-guidelines/data/repositories/dos-and-donts.repository.ts` | `createInBrand`, `updateInBrandById`, `deleteInBrandById` | Already wrapped (Chunk C convention). | INSIDE each existing block, after the primary write, APPEND `await writeBrandGuidelinesVersion(tx, brandId, editor, changeNote);`. |
| `apps/api/src/modules/brand-guidelines/data/repositories/brand-metadata.repository.ts` | `upsertByBrandId` | Already wrapped. | Single-line append inside the block. |

Repository signatures gain an `editor: BrandGuidelineEditor` argument (Voice + Visual already declare it as `_editor` per Chunk B forward-compat — just remove the underscore) and a `changeNote: string | null` argument (new). Controllers pass them in.

For dos-and-donts the existing port `DosDontsRepository` does NOT carry an editor parameter. D extends the port interface with `editor: BrandGuidelineEditor` + `changeNote: string | null` on every mutating method. Non-breaking — only the repository implementation + controllers need updating; both are in D's FILE_SCOPE.

Test extensions for each B/C repo:
- Verify `writeBrandGuidelinesVersion` is invoked exactly once per mutation.
- Verify the composed snapshot reflects post-mutation state.
- Verify `changeNote` round-trips (null + populated).
- Verify a failed primary write does NOT insert a version row (transaction rollback).

### §5.E — Carve-out: standalone Voice list reads (`BrandVoiceController`)

Append three additive `@Get(...)` handlers to the existing `BrandVoiceController` under prefix `brands/:brandId/guidelines/voice`:

```ts
@Get('restricted-vocabulary')
@AuthRoles(AUTH_ROLE_ADMIN)
@ApiOperation({ summary: 'Standalone list — restricted vocabulary for a brand', description: 'Returns the raw string list. Agent-optimised — exempt from the cross-cutting `latestVersionId` envelope per design.' })
@ApiParam({ name: 'brandId', type: String })
@ApiResponse({ status: 200, description: 'Restricted vocabulary list (empty array when no voice row exists)', type: ApiEnvelopeDto(/* string-array envelope */) })
@ApiResponse({ status: 401 }) @ApiResponse({ status: 403 }) @ApiResponse({ status: 404, description: 'Brand not found' })
async getRestrictedVocabulary(@Param('brandId') brandId: string): Promise<readonly string[]> {
  await assertBrandActive(this.brandRepository, brandId);
  const voice = await this.voiceRepository.findByBrandId(brandId);
  return voice?.restrictedVocabulary ?? [];
}

@Get('approved-examples')
// Same pattern — returns voice?.approvedExamples ?? []
// Response type: BrandVoiceApprovedExampleDto[]

@Get('rejected-examples')
// Same pattern — returns voice?.rejectedExamples ?? []
// Response type: BrandVoiceRejectedExampleDto[]
```

Admin-only at D. Chunk E will additively widen role to include `AUTH_ROLE_AGENT`.

Tests appended to existing `brand-voice.controller.test.ts` — three new branches per handler.

### §5.F — Carve-out: `?changeNote=` query-param read on every mutating guideline endpoint

Touched files (each gains `@Query(ChangeNoteQueryPipe) changeNoteQuery: ChangeNoteQuery` parameter; value threaded into repo call as `changeNoteQuery.changeNote ?? null`):
- `brand-voice.controller.ts` `putVoice`
- `visual-identity.controller.ts` (handler name — verify via Chunk B file)
- `dos-and-donts.controller.ts` `createEntry`, `updateEntry`, `deleteEntry`
- `brand-metadata.controller.ts` `upsertMetadata`

Each handler also adds `@ApiQuery({ name: 'changeNote', required: false, type: String, description: 'Optional change note attached to the BrandGuidelinesVersion row created by this mutation' })`.

### §5.G — Carve-out: `latestVersionId` in every guideline GET response

Every guideline-read endpoint adds a top-level `latestVersionId: string | null` field to its response envelope (per product plan §5 cross-cutting openapi). Value from `versionRepository.findLatestForBrand(brandId)?.id ?? null`.

Touched endpoints:
- `BrandVoiceController.getVoice` — response is `{ data: BrandVoice | null, latestVersionId: string | null }`.
- `VisualIdentityController` GET — same.
- `BrandMetadataController` GET — same.
- `DosAndDontsController` list — appends `latestVersionId` at envelope level.
- **Exempt:** standalone Voice list reads (§5.E) — they return raw arrays for agent ingestion; wrapping would balloon wire shape. Exemption documented in OpenAPI `@ApiOperation.description`.

Each touched DTO file gains a `*WithVersionDto` class nesting the existing DTO under `data` + adding `@ApiProperty({ type: String, nullable: true }) latestVersionId`. Keeps B/C DTOs intact (their tests don't break) while threading the new field on the response.

### §5.H — Module wiring (`brand-guidelines.module.ts` + `brand.module.ts`)

Append to `BrandGuidelinesModule`:
```ts
providers: [
  // ... existing entries ...
  ListBrandGuidelinesVersionsQueryPipe,
  ChangeNoteQueryPipe,
  { provide: BRAND_GUIDELINES_VERSION_REPOSITORY, useClass: BrandGuidelinesVersionPrismaRepository },
],
controllers: [
  DosAndDontsController,
  BrandMetadataController,
  GuidelineSearchController,
  BrandGuidelinesVersionsController, // NEW
],
```

Append to `BrandModule` (Chunk A) so the Voice/Visual controllers can inject the version repository + change-note pipe:
```ts
providers: [
  // ... existing entries ...
  { provide: BRAND_GUIDELINES_VERSION_REPOSITORY, useClass: BrandGuidelinesVersionPrismaRepository },
  ChangeNoteQueryPipe,
],
```

Symbol identity via `Symbol.for('BrandGuidelinesVersionRepository')` makes the duplicate-binding safe — the repository is stateless.

Acceptance: `pnpm --filter @sfx/api test && typecheck && lint` green.

---

## 6. Frontend — data layer + presentation (Tasks D-F1 … D-F11)

### Task D-F1 — Constants extension (APPEND-only)

Append to `apps/web/src/features/brand-shell/constants.ts`:

```ts
export const brandGuidelinesVersionsEndpoint = (brandId: string): string =>
  `api/v1/brands/${brandId}/guidelines/versions`;
export const brandGuidelinesVersionEndpoint = (brandId: string, versionId: string): string =>
  `${brandGuidelinesVersionsEndpoint(brandId)}/${versionId}`;

export const voiceRestrictedVocabularyEndpoint = (brandId: string): string =>
  `api/v1/brands/${brandId}/guidelines/voice/restricted-vocabulary`;
export const voiceApprovedExamplesEndpoint = (brandId: string): string =>
  `api/v1/brands/${brandId}/guidelines/voice/approved-examples`;
export const voiceRejectedExamplesEndpoint = (brandId: string): string =>
  `api/v1/brands/${brandId}/guidelines/voice/rejected-examples`;

export const brandGuidelinesVersionsQueryKey = (brandId: string): readonly unknown[] =>
  ['brand-guidelines', 'versions', brandId] as const;
export const brandGuidelinesVersionQueryKey = (brandId: string, versionId: string): readonly unknown[] =>
  ['brand-guidelines', 'versions', brandId, versionId] as const;
```

**Sub-nav decision:** `BRAND_GUIDELINES_SUB_NAV_REGISTRY` array is NOT mutated. History is a per-sub-section `[View history]` link affordance, not a 5th sub-nav tab. Reasons: (a) sub-nav tabs swap content within the same page; history is a routed navigation that exits the workspace; (b) the locked sub-nav shape `{ id, labelKey, slot }` constrains `labelKey` to a 4-string union — appending `'history'` would widen the union (touching Chunk B's sub-nav component); (c) the F5 pattern surfaces history as a corner-link affordance.

Test `__tests__/constants.test.ts` (APPEND-only) — assert new endpoint factories produce path-relative URLs; assert new query keys are array-prefixed.

### Task D-F2 — Data layer: model + mapper

Create:
- `apps/web/src/features/brand-shell/data/model/brand-guidelines-version-data-model.ts` — wire shape (id, brandId, snapshot (sub-resources with ISO-string Date fields), editorUserId, editorDisplayName, changeNote, createdAt ISO string). `BrandGuidelinesVersionsPageDataModel = { items: readonly BrandGuidelinesVersionDataModel[], nextCursor: string | null }`.
- `apps/web/src/features/brand-shell/data/mapper/map-to-brand-guidelines-version.ts` — ISO → Date for top-level `createdAt` and every sub-resource's timestamps; delegates to existing mappers for snapshot sub-resources. Second export `mapToBrandGuidelinesVersionsPage`.

Tests under matching `__tests__/`. Mirror `map-to-company-info-version.test.ts` density.

### Task D-F3 — Data layer: remote

Create:
- `apps/web/src/features/brand-shell/data/remote/fetch-brand-guidelines-versions.ts` — `fetchBrandGuidelinesVersions(brandId, params?: { take?, cursor? }): Promise<BrandGuidelinesVersionsPageDataModel>`. Uses `executeRequest<ApiEnvelope<...>>`. URLSearchParams only when defined.
- `apps/web/src/features/brand-shell/data/remote/fetch-brand-guidelines-version-by-id.ts` — URL-encodes both ids.
- `apps/web/src/features/brand-shell/data/remote/fetch-voice-restricted-vocabulary.ts`, `fetch-voice-approved-examples.ts`, `fetch-voice-rejected-examples.ts` — three thin standalone-list fetchers.

Tests under matching `__tests__/` — mock `executeRequest`; cover happy path + 401 + 403 + 404 + envelope unwrap.

### Task D-F4 — Data layer: repository hooks

Create:
- `apps/web/src/features/brand-shell/data/repositories/use-brand-guidelines-versions-repository.ts` — wraps `useQuery`. `queryKey: [...brandGuidelinesVersionsQueryKey(brandId), take ?? null, cursor ?? null]`. `select: mapToBrandGuidelinesVersionsPage`. `retry: false`. `enabled: brandId.length > 0`.
- `apps/web/src/features/brand-shell/data/repositories/use-brand-guidelines-version-repository.ts` — single-version `useQuery`. `queryKey: brandGuidelinesVersionQueryKey(brandId, versionId)`. `select: mapToBrandGuidelinesVersion`. `retry: false`. `enabled: versionId.length > 0 && brandId.length > 0`.

Tests under matching `__tests__/`. Wrap in `QueryClientProvider` + `renderHook`. Cover loading → success, error propagation, distinct cache keys.

### Task D-F5 — Mutation-hook carve-outs (changeNote + history invalidation)

Each existing mutation hook for B/C resources gets two extensions:

1. Mutation argument gains optional `changeNote?: string`; remote function appends `?changeNote=...` when present.
2. `onSuccess` invalidates `['brand-guidelines', 'versions', brandId]` so history list refreshes after every save.

Files touched (APPEND only):
- `use-brand-voice-repository.ts`
- `use-visual-identity-repository.ts`
- `use-dos-and-donts-repository.ts`
- `use-brand-metadata-repository.ts`

Remote-call helpers (`update-brand-voice.ts`, `update-visual-identity.ts`, `update-brand-metadata.ts`, `create-dos-donts-entry.ts`, `update-dos-donts-entry.ts`, `delete-dos-donts-entry.ts`) gain optional `changeNote?: string` parameter; appended via URLSearchParams when truthy.

Each existing test file is extended with `changeNote provided → URL includes ?changeNote=`; `onSuccess → versions queryKey invalidated`.

### Task D-F6 — Page: `BrandGuidelinesHistoryPage`

Path: `apps/web/src/features/brand-shell/presentation/pages/brand-guidelines-history/`. 4-file pattern:

- `types.ts` — `BrandGuidelinesHistoryStatus = 'loading' | 'empty' | 'ready' | 'denied' | 'not-found' | 'error'`. `BrandGuidelinesHistoryRowUIModel { id, href, savedAtLabel, editorLabel, changeNoteLabel: string | null, ariaLabel }`. `BrandGuidelinesHistoryPageUIModel { status, title, columnHeaders:{savedAt, editor, changeNote}, rows, empty:{title,message}, error:{title,message}, denied, notFound:{title,message}, backToCurrent:{label, href} }`. Props `{ brandId: string }`.
- `use-brand-guidelines-history.ts` — calls `useBrandGuidelinesVersionsRepository(brandId)`; reads `useTranslations('common').adminBrandGuidelines.history!`; `useLanguage()` for locale; derives `isDenied`/`isNotFound`/`isErrored` from RequestError status; builds UIModel via mapper.
- `map-to-brand-guidelines-history-page-ui-model.ts` — Pure mapper. Formats `createdAt` via `new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' })`. Row `href` = `/admin/brand-guidelines/${brandId}/history/${id}`. `changeNoteLabel = row.changeNote?.trim() || null` (null renders as em-dash). `backToCurrent.href = /admin/brand-guidelines/${brandId}`.
- `index.tsx` — `'use client'`. Mirrors `apps/web/src/features/company-info/presentation/pages/company-info-history/index.tsx` structure: skeleton on loading; denied / error / empty / not-found surfaces; ready surface = `<table>` (savedAt + editor + changeNote columns). Header + back-to-current link top-right.

Tests under `__tests__/` — page test asserts each status branch; mapper test asserts deterministic en-US formatting (pin locale); hook test asserts status transitions; row ariaLabel includes editor + timestamp + (optional) change note.

### Task D-F7 — Page: `BrandGuidelinesHistoryDetailPage`

Path: `apps/web/src/features/brand-shell/presentation/pages/brand-guidelines-history-detail/`. 4-file pattern.

- `types.ts` — `BrandGuidelinesHistoryDetailStatus = 'loading' | 'ready' | 'denied' | 'not-found' | 'error'`. `BrandGuidelinesHistoryDetailSectionUIModel = { key: 'voice' | 'visual' | 'dosAndDonts' | 'metadata', title: string, body: ReactNode }`. `BrandGuidelinesHistoryDetailPageUIModel { status, title, banner:{message}, sections, backToCurrent:{label, href}, denied, notFound, error, readOnlyAriaSuffix }`. Props `{ brandId: string; versionId: string }`.
- `use-brand-guidelines-history-detail.ts` — calls `useBrandGuidelinesVersionRepository(brandId, versionId)`; derives status from query state + RequestError; builds UIModel via mapper.
- `map-to-brand-guidelines-history-detail-page-ui-model.ts` — Each section gets a read-only variant rendered as `<input>`/`<textarea>` with `disabled + readOnly + aria-disabled='true'`. Repeatable lists render as `<ul>` with disabled inputs (mirror F5 detail page `apps/web/src/features/company-info/presentation/pages/company-info-history-detail/index.tsx:78-120`). Banner substitutes `{editor}` + `{timestamp}` + `{changeNote}` in `historyDetail.bannerTemplate` (em-dash when changeNote null).
- `index.tsx` — `'use client'`. Skeleton on loading; denied / not-found / error surfaces; ready surface = banner (`role='status'`, `aria-live='polite'`) + four `<fieldset>` blocks + back-to-current link. NO submit button, NO Add/Remove controls.

Tests under `__tests__/`:
- All four sections render.
- Every input/textarea is `disabled` AND `aria-disabled='true'`.
- Banner text contains editor + timestamp + changeNote (or em-dash).
- Not-found branch (404) rendered.
- Denied branch (403) rendered.
- Back link href `/admin/brand-guidelines/${brandId}`.
- No `<button type='submit'>`.

### Task D-F8 — `[View history]` affordance per sub-section

Each sub-section form/list component gains a small `<Link>` (rendered next to or above its Save button) that navigates to `/admin/brand-guidelines/${brandId}/history`. Touched files (additive: one new render line + UIModel field):
- `BrandVoiceForm/index.tsx` + `map-to-brand-voice-form-ui-model.ts` + `types.ts` — add `viewHistory: { label, href }` to UIModel; render `<Link>` next to Save.
- `VisualIdentityForm/*` — same.
- `DosAndDontsList/*` — same; affordance lives at the top of the list panel (per-row CRUD has no single "Save").
- `MetadataForm/*` — same.

Existing tests for these components are extended with `View history link present + href=/admin/brand-guidelines/<brandId>/history`.

### Task D-F9 — Optional `changeNote` input on Save row

Each form's Save-row layout gains an OPTIONAL textarea labeled per locale (`adminBrandGuidelines.history.changeNoteLabel`, placeholder `changeNotePlaceholder`). Value flows into RHF state under field name `changeNote` and is passed to mutation hook as `mutate({ ...input, changeNote })`.

For dos-and-donts (per-row CRUD), the changeNote input lives in the inline row editor's footer + in the delete-confirm dialog. For metadata (single Save), it lives next to Save.

Existing tests are extended; end-to-end coverage at the integration-test layer (§8).

### Task D-F10 — Route wrappers (Next 15 async params)

Create:
- `apps/web/src/app/admin/brand-guidelines/[brandId]/history/page.tsx` — thin wrapper. `/** @routeGuard authenticated */` JSDoc. Awaits `params: Promise<{ brandId: string }>`; renders `<BrandGuidelinesHistoryPage brandId={brandId} />`.
- `apps/web/src/app/admin/brand-guidelines/[brandId]/history/[versionId]/page.tsx` — thin wrapper. Awaits `params: Promise<{ brandId: string; versionId: string }>`; renders detail page.

Tests under matching `__tests__/page.test.tsx` — assert thin-wrapper renders feature page only; assert params forwarded.

### Task D-F11 — Feature barrel exports

Append to `apps/web/src/features/brand-shell/index.ts`:
```ts
export { BrandGuidelinesHistoryPage } from './presentation/pages/brand-guidelines-history';
export { BrandGuidelinesHistoryDetailPage } from './presentation/pages/brand-guidelines-history-detail';
export {
  brandGuidelinesVersionsEndpoint,
  brandGuidelinesVersionEndpoint,
  brandGuidelinesVersionsQueryKey,
  brandGuidelinesVersionQueryKey,
} from './constants';
```

Acceptance: `pnpm --filter @sfx/web typecheck && lint && test:coverage` — 90%+ coverage.

---

## 7. Localization (Task D-L1)

Append to `apps/web/src/features/presentation/localization/types.ts` (additive):

```ts
export interface AdminBrandGuidelinesHistoryColumnHeadersTranslations {
  readonly savedAt: string;
  readonly editor: string;
  readonly changeNote: string;
}

export interface AdminBrandGuidelinesHistoryEmptyStateTranslations {
  readonly title: string;
  readonly message: string;
}

export interface AdminBrandGuidelinesHistoryTranslations {
  readonly pageTitle: string;
  readonly viewHistoryCta: string;
  readonly backToCurrent: string;
  readonly columnHeaders: AdminBrandGuidelinesHistoryColumnHeadersTranslations;
  readonly emptyState: AdminBrandGuidelinesHistoryEmptyStateTranslations;
  readonly loadingLabel: string;
  readonly errorTitle: string;
  readonly errorMessage: string;
  readonly rowAriaLabelTemplate: string; // 'Version saved by {editor} at {timestamp}'
  readonly changeNoteLabel: string;       // 'Change note (optional)'
  readonly changeNotePlaceholder: string; // 'Describe what changed (max 500 chars)'
  readonly changeNotePlaceholderEmpty: string; // em-dash
}

export interface AdminBrandGuidelinesHistoryDetailTranslations {
  readonly pageTitle: string;
  readonly bannerTemplate: string;             // 'Read-only — version saved by {editor} at {timestamp}. Note: {changeNote}'
  readonly bannerChangeNoteEmpty: string;      // em-dash
  readonly backToCurrent: string;
  readonly readOnlyAriaSuffix: string;
  readonly emptyValuePlaceholder: string;
  readonly notFoundTitle: string;
  readonly notFoundMessage: string;
  readonly errorTitle: string;
  readonly errorMessage: string;
  readonly sectionTitles: {
    readonly voice: string;
    readonly visual: string;
    readonly dosAndDonts: string;
    readonly metadata: string;
  };
}
```

Extend `AdminBrandGuidelinesTranslations` (line 434 in current types.ts) with two optional fields:
```ts
readonly history?: AdminBrandGuidelinesHistoryTranslations;
readonly historyDetail?: AdminBrandGuidelinesHistoryDetailTranslations;
```

(Optional matches the existing Chunks B+C pattern at lines 448-453.)

Append matching key trees to `languages/en/common.ts` + `languages/ro/common.ts`. Romanian translations follow Chunks A-C's no-diacritics convention (`Versiune salvata de {editor} la {timestamp}`).

The parity-check test at `__tests__/parity.test.ts` covers the new keys automatically (TS gates compile-time parity).

---

## 8. Integration tests (Tasks D-IT1, D-IT2, D-IT3, D-UI-QA)

### Task D-IT1 — `brand-guidelines-versions.integration-test.ts`

Path: `apps/api/src/modules/brand-guidelines/__integration__/brand-guidelines-versions.integration-test.ts`. Mirror existing brand-guidelines integration harness.

Pattern:
1. Boot `AppModule` test container, override `JwtAuthGuard` with `buildTestAuthGuard`.
2. `beforeEach` cleans `prisma.brandGuidelinesVersion.deleteMany()` + every brand-scoped table + `prisma.brand.deleteMany()`.
3. Setup helper: create active brand via `POST /api/v1/brands` (admin), then perform a Voice + Visual + Metadata + D&D save sequence to seed versions.

Test matrix (~25 cases):
- GET versions admin on missing brand → 404.
- GET versions admin on active brand with zero saves → 200 `{ items: [], nextCursor: null }`.
- GET versions admin after one save → 200 with 1 item; snapshot has the just-saved sub-resource populated, others null.
- GET versions admin after four saves (one per section) → 4 items, newest-first ordering verified.
- GET versions admin `?take=2` → 2 items + nextCursor; subsequent `?cursor=<that>&take=2` returns next 2 + nextCursor=null.
- GET versions admin `?cursor=unknown-id` → 200 with empty page (Linear/GitHub semantics).
- GET versions admin `?take=0` → 400; `?take=101` → 400.
- GET versions admin unknown query key → 400 (Zod `.strict()`).
- GET versions anonymous → 401; viewer → 403.
- GET versions/:id admin happy → returns version with full snapshot.
- GET versions/:id admin unknown id → 404.
- GET versions/:id admin cross-brand id (request to `/brands/B1/.../<vid-of-B2>`) → 404 (NOT 200 leaking foreign data).
- GET versions/:id anonymous → 401; viewer → 403.

### Task D-IT2 — Snapshot-write verification across B + C mutations

Path: `apps/api/src/modules/brand-guidelines/__integration__/snapshot-on-mutate.integration-test.ts`.

For each mutating endpoint, assert:
1. Endpoint succeeds (status code matches B/C contract).
2. `prisma.brandGuidelinesVersion` row count increments by exactly 1.
3. Row's `snapshot` JSONB contains post-mutation state of every section.
4. `editorUserId` + `editorDisplayName` populated from test JWT.
5. `changeNote` round-trips when provided via `?changeNote=...`; null when absent.

Cases:
- PUT voice (create) — version row inserted; snapshot.voice populated; visual/metadata null; dosAndDonts empty.
- PUT voice (update) with changeNote — version row inserted with changeNote.
- PUT visual — version row inserted; snapshot.visual populated; previous voice still present.
- POST dos-and-donts — version row inserted with snapshot.dosAndDonts containing the new entry.
- PATCH dos-and-donts — version row reflects the updated entry.
- DELETE dos-and-donts — version row reflects post-delete state (entry absent).
- PUT metadata — version row inserted with snapshot.metadata populated.
- Failed PUT voice (Zod 400) → no version row inserted (transaction not entered).
- Failed PUT voice on missing brand (404) → no version row inserted.
- Concurrent PUT voice + PUT visual → exactly 2 version rows, snapshots reflect each request's state.

### Task D-IT3 — Standalone Voice list reads

Path: `apps/api/src/modules/brand/__integration__/voice-standalone-reads.integration-test.ts`.

Matrix per endpoint (`restricted-vocabulary`, `approved-examples`, `rejected-examples`):
- Admin on missing brand → 404.
- Admin on active brand with no voice row → 200 with `[]`.
- Admin on active brand with populated voice → 200 with matching list.
- Viewer → 403; anonymous → 401.

### Task D-UI-QA — qa-test full-mode J6 coverage

Invoke `qa-test` skill (standard criteria mode) against the booted stack. Scenarios:

1. **J6 history flow** — admin logs in via Keycloak; navigates to `/admin/brand-guidelines/<brandId>`; opens Brand Voice; populates tone + saves; opens Visual; populates logo + saves; opens D&D; adds one entry; clicks `[View history]` on any sub-section; lands on `/history`; sees ≥3 rows newest-first with timestamp + editor + (empty/em-dash) change note; clicks top row; lands on `/history/<versionId>`; sees banner with editor + timestamp + em-dash; sees all four sections with disabled inputs + D&D entry visible + Voice tone populated + Visual logo populated + Metadata empty; clicks `Back to current`; returns to `/admin/brand-guidelines/<brandId>`.

2. **changeNote round-trip** — admin saves Voice with changeNote `'tone tightening'`; navigates to history list; expects row to show `tone tightening`; opens row's detail; banner reads `... Note: tone tightening`.

3. **Empty history** — admin creates fresh brand profile (no prior saves); navigates to `/history`; sees empty-state copy `No versions yet — save the form to create the first version.`

4. **Not-found version** — admin visits `/history/clxnonexistent000000`; sees not-found surface with back link.

5. **Cross-brand version isolation** — admin saves on brand B1; copies a versionId; navigates to brand B2; visits `/admin/brand-guidelines/B2/history/<B1-versionId>` — expects not-found surface (no foreign-brand leak).

6. **Auth boundaries** — unauth visitor to `/admin/brand-guidelines/<bid>/history` redirects via oauth2-proxy; viewer hits `AdminRouteGate` denied surface.

7. **Console / network clean** — zero JS errors, zero unexpected 4xx/5xx (only intentional 400/404 cases).

qa-test transcript + screenshots in builder's `worker_done` mail under `## ui-evidence`.

Acceptance: `pnpm probe:smoke` zero failures; `pnpm test:integration` includes 3 new files; qa-test report attached.

---

## 9. Runtime acceptance (required spec field)

Per parent product plan §5 J6 + §5 J8 standalone-reads forward-compat + §5 cross-cutting:

**J6 — Per-brand version history**
- An admin can navigate from any sub-section to the per-brand history list via a `View history` affordance rendered next to that sub-section's primary CTA.
- The history list is ordered newest-first and shows timestamp, editor display name, and optional change note for each version.
- Activating any history row navigates to a read-only snapshot of that version with a banner identifying the editor + timestamp + change note (or em-dash if none).
- From the snapshot view, a `Back to current` control returns the admin to the editable view at `/admin/brand-guidelines/<brandId>`.
- The current editable view is always equivalent to the latest snapshot in the history list (within the freshness window).
- An admin can attach an optional change note to any save; the note appears verbatim in the history list's change-note column and in the snapshot banner.
- Visiting `/admin/brand-guidelines/<brandId>/history/<unknown-or-foreign-versionId>` renders a not-found surface with a back link; no foreign-brand snapshot leaks.

**J8 forward-compat — Standalone agent-optimized reads (admin-only at D)**
- `GET /api/v1/brands/:brandId/guidelines/voice/restricted-vocabulary` returns 200 with the brand's restricted-vocab list as a raw array (empty array when no voice row exists).
- Symmetric for `approved-examples` and `rejected-examples`.
- Admin role accepted; anonymous → 401; viewer → 403. Chunk E will additively expand the role list to include `AUTH_ROLE_AGENT`.

**Cross-cutting auth boundaries (every endpoint)**
- Unauthenticated → 401 on every endpoint.
- Authenticated viewer (non-admin) → 403 on every endpoint.
- Authenticated admin → 200/201/204 on success; 400 on invalid body / query; 404 on missing or soft-deleted brand or unknown / cross-brand version.
- Unauthenticated visitor to any `/admin/brand-guidelines/*` page hits inherited `AuthGate` from `/admin/layout.tsx` and is redirected via oauth2-proxy.

**Cross-cutting openapi**
- Every new endpoint appears at `/api/docs` with full `@ApiResponse` set + `@ApiBearerAuth('accessToken')`.
- The paginated versions list carries `@ApiExtension('x-cursor-invalid-behavior', 'empty-200')` so consumers can rely on empty-page-on-unknown-cursor semantics.
- Every guideline GET response carries a top-level `latestVersionId: string | null` field (standalone Voice list reads exempt — they return raw arrays for agent ingestion efficiency, documented in `@ApiOperation.description`).

**Cross-cutting freshness**
- An update to any guideline section becomes visible to a subsequent read without any cache invalidation step from the caller (React-Query `invalidateQueries` on the matching prefix runs on mutation success, including the new `['brand-guidelines', 'versions', brandId]` prefix added by D).
- An update to any guideline section causes the history list to gain exactly one row, with editor + timestamp + (optional) change note populated.

**Cross-cutting versionId**
- Every guideline GET response carries `latestVersionId` matching the most-recent `BrandGuidelinesVersion` row id (null when no version exists yet for the brand).

---

## 10. Guard contract (required spec field)

| Surface | Guard |
|---|---|
| `/admin/brand-guidelines/<brandId>/history` page | `authenticated` + admin role (inherited from `/admin/layout.tsx` `<AuthGate>` + `<AdminRouteGate>`) |
| `/admin/brand-guidelines/<brandId>/history/<versionId>` page | Same |
| `GET /api/v1/brands/:brandId/guidelines/versions` | `@UseGuards(JwtAuthGuard) + @AuthRoles(AUTH_ROLE_ADMIN)` — admin-only at D; Chunk E will additively widen to `AUTH_ROLE_ADMIN, AUTH_ROLE_AGENT` |
| `GET /api/v1/brands/:brandId/guidelines/versions/:versionId` | Same |
| `GET /api/v1/brands/:brandId/guidelines/voice/restricted-vocabulary` | Same |
| `GET /api/v1/brands/:brandId/guidelines/voice/approved-examples` | Same |
| `GET /api/v1/brands/:brandId/guidelines/voice/rejected-examples` | Same |
| Every existing B/C mutating endpoint with new `?changeNote=` query | Unchanged — `@AuthRoles(AUTH_ROLE_ADMIN)` (mutations admin-only forever per parent plan) |
| Unauth → API | 401 (`UnauthorizedException` from `JwtAuthGuard`) |
| Non-admin authed → API | 403 (`ForbiddenException` from `AuthRoles` guard chain) |
| Missing or soft-deleted brand → API | 404 (`NotFoundException` from `assertBrandActive` helper) |
| Unknown or cross-brand version id → API | 404 (`NotFoundException` from controller; `versionRepository.findById` returns null OR version's `brandId` differs from path `brandId`) |

---

## 11. Contract annotations (required spec field)

Files where the builder MUST maintain route-metadata / API-description / validation-schema / auth-guard annotations so the contract compiler can extract them:

1. `apps/api/src/modules/brand-guidelines/application/controllers/brand-guidelines-versions.controller.ts` (NEW)
   - Class-level: `@ApiTags('brand-guidelines') @Controller('brands/:brandId/guidelines/versions') @UseGuards(JwtAuthGuard) @ApiBearerAuth('accessToken')`.
   - List handler: `@AuthRoles(AUTH_ROLE_ADMIN) @ApiOperation @ApiExtension('x-cursor-invalid-behavior', 'empty-200') @ApiParam @ApiQuery × 2 @ApiResponse × 5 @ResourceCaptures`.
   - Single handler: `@AuthRoles(AUTH_ROLE_ADMIN) @ApiOperation @ApiParam × 2 @ApiResponse × 4 @ResourceCaptures`.

2. `apps/api/src/modules/brand-guidelines/application/dto/brand-guidelines-version.dto.ts` (NEW)
   - Every property declares `@ApiProperty({ type: ... })` or `@ApiPropertyOptional({ type: ..., nullable: true })` with EXPLICIT type (mulch `mx-cbd785`).

3. `apps/api/src/modules/brand-guidelines/application/pipes/list-brand-guidelines-versions-query.pipe.ts` (NEW) — bound to Zod via `ZodValidationPipe`.
4. `apps/api/src/modules/brand-guidelines/application/pipes/change-note-query.pipe.ts` (NEW) — same.

5. `packages/validation/src/schemas/brand-guidelines-version.schema.ts` (NEW)
   - Every field calls `.openapi({ description, example })`. `.strict()` on every object schema.

6. `apps/api/src/modules/brand/application/controllers/brand-voice.controller.ts` (CARVE-OUT)
   - Three new `@Get(...)` handlers each carry `@AuthRoles @ApiOperation @ApiParam @ApiResponse × 4`. Existing handlers unchanged except `@ApiQuery({ name: 'changeNote', required: false, type: String })` on PUT. `@Get()` response declared type expands to a `BrandVoiceWithVersionDto`.

7. `apps/api/src/modules/brand/application/controllers/visual-identity.controller.ts` (CARVE-OUT) — `@ApiQuery({ name: 'changeNote', ... })` on PUT; response type updated for `latestVersionId`.

8. `apps/api/src/modules/brand-guidelines/application/controllers/dos-and-donts.controller.ts` + `brand-metadata.controller.ts` (CARVE-OUT) — `@ApiQuery({ name: 'changeNote', ... })` on every mutating handler; response type updated for `latestVersionId`.

9. `apps/api/src/modules/brand/application/controllers/brand.controller.ts` — **mx-3bf156 carve-out** (Chunk A §13) is permitted if the probe emits `RESOURCE_CAPTURE_PATHPARAM_UNDECLARED` for `/brands/:brandId/guidelines/versions/*` routes. Append `{ fromPath: 'id', resource: 'brand', pathParam: 'brandId' }` as an additional tuple to the existing `@ResourceCaptures` decorator on `createBrand`. Single additive edit only.

10. `apps/web/src/app/admin/brand-guidelines/[brandId]/history/page.tsx` + `[versionId]/page.tsx` — JSDoc `/** @routeGuard authenticated */`; mount feature pages without per-page gates (inherited from `/admin/layout.tsx`).

---

## 12. FILE_SCOPE (for builder dispatch)

Worktree-rooted paths. Builder MUST limit edits to this list. The carve-out paths in §13 are explicitly permitted additive edits; everything else outside this list is forbidden.

```
packages/domain/src/entities/brand-guidelines-version.ts
packages/domain/src/entities/__tests__/brand-guidelines-version.test.ts
packages/domain/src/ports/brand-guidelines-version-repository.ts
packages/domain/src/ports/__tests__/brand-guidelines-version-repository.test.ts
packages/domain/src/index.ts                                                            (APPEND-only)

packages/validation/src/schemas/brand-guidelines-version.schema.ts
packages/validation/src/schemas/__tests__/brand-guidelines-version.schema.test.ts
packages/validation/src/schemas/brand-voice.schema.ts                                   (APPEND latestVersionId to response schema)
packages/validation/src/schemas/visual-identity.schema.ts                               (APPEND latestVersionId)
packages/validation/src/schemas/brand-guidelines.schema.ts                              (APPEND latestVersionId to metadata + d&d list response schemas)
packages/validation/src/schemas/__tests__/brand-voice.schema.test.ts                    (extend)
packages/validation/src/schemas/__tests__/visual-identity.schema.test.ts                (extend)
packages/validation/src/schemas/__tests__/brand-guidelines.schema.test.ts               (extend)
packages/validation/src/index.ts                                                        (APPEND-only)
packages/validation/src/__tests__/index.test.ts                                         (APPEND-only)

packages/database/prisma/schema.prisma                                                  (APPEND BrandGuidelinesVersion model + 1-line back-relation on Brand)
packages/database/prisma/migrations/<timestamp>_add_brand_guidelines_version/           (auto-generated)

apps/api/src/modules/brand/data/repositories/brand-guidelines.tokens.ts                 (APPEND BRAND_GUIDELINES_VERSION_REPOSITORY)
apps/api/src/modules/brand/data/repositories/__tests__/brand-guidelines.tokens.test.ts  (extend)
apps/api/src/modules/brand/data/repositories/brand-voice.repository.ts                  (CARVE-OUT §13)
apps/api/src/modules/brand/data/repositories/visual-identity.repository.ts              (CARVE-OUT §13)
apps/api/src/modules/brand/data/repositories/__tests__/brand-voice.repository.test.ts   (extend)
apps/api/src/modules/brand/data/repositories/__tests__/visual-identity.repository.test.ts (extend)
apps/api/src/modules/brand/application/controllers/brand-voice.controller.ts            (CARVE-OUT §5.E + §5.F + §5.G)
apps/api/src/modules/brand/application/controllers/visual-identity.controller.ts        (CARVE-OUT §5.F + §5.G)
apps/api/src/modules/brand/application/controllers/__tests__/brand-voice.controller.test.ts (extend)
apps/api/src/modules/brand/application/controllers/__tests__/visual-identity.controller.test.ts (extend)
apps/api/src/modules/brand/brand.module.ts                                              (APPEND providers)
apps/api/src/modules/brand/__tests__/brand.module.test.ts                               (extend)
apps/api/src/modules/brand/__integration__/voice-standalone-reads.integration-test.ts   (NEW)

apps/api/src/modules/brand-guidelines/data/repositories/brand-guidelines-version.repository.ts
apps/api/src/modules/brand-guidelines/data/repositories/__tests__/brand-guidelines-version.repository.test.ts
apps/api/src/modules/brand-guidelines/data/repositories/dos-and-donts.repository.ts     (CARVE-OUT §13)
apps/api/src/modules/brand-guidelines/data/repositories/brand-metadata.repository.ts    (CARVE-OUT §13)
apps/api/src/modules/brand-guidelines/data/repositories/__tests__/dos-and-donts.repository.test.ts (extend)
apps/api/src/modules/brand-guidelines/data/repositories/__tests__/brand-metadata.repository.test.ts (extend)
apps/api/src/modules/brand-guidelines/data/version/snapshot-composer.ts
apps/api/src/modules/brand-guidelines/data/version/__tests__/snapshot-composer.test.ts
apps/api/src/modules/brand-guidelines/data/version/write-version.ts
apps/api/src/modules/brand-guidelines/data/version/__tests__/write-version.test.ts
apps/api/src/modules/brand-guidelines/data/mapper/brand-guidelines-version.mapper.ts
apps/api/src/modules/brand-guidelines/data/mapper/__tests__/brand-guidelines-version.mapper.test.ts
apps/api/src/modules/brand-guidelines/data/model/brand-guidelines-version-data-model.ts
apps/api/src/modules/brand-guidelines/data/model/__tests__/brand-guidelines-version-data-model.test.ts
apps/api/src/modules/brand-guidelines/application/controllers/brand-guidelines-versions.controller.ts
apps/api/src/modules/brand-guidelines/application/controllers/__tests__/brand-guidelines-versions.controller.test.ts
apps/api/src/modules/brand-guidelines/application/controllers/dos-and-donts.controller.ts    (CARVE-OUT §5.F + §5.G)
apps/api/src/modules/brand-guidelines/application/controllers/brand-metadata.controller.ts   (CARVE-OUT §5.F + §5.G)
apps/api/src/modules/brand-guidelines/application/controllers/__tests__/dos-and-donts.controller.test.ts (extend)
apps/api/src/modules/brand-guidelines/application/controllers/__tests__/brand-metadata.controller.test.ts (extend)
apps/api/src/modules/brand-guidelines/application/dto/brand-guidelines-version.dto.ts
apps/api/src/modules/brand-guidelines/application/dto/__tests__/brand-guidelines-version.dto.test.ts
apps/api/src/modules/brand-guidelines/application/dto/dos-and-donts.dto.ts              (CARVE-OUT §5.G)
apps/api/src/modules/brand-guidelines/application/dto/brand-metadata.dto.ts             (CARVE-OUT §5.G)
apps/api/src/modules/brand-guidelines/application/dto/__tests__/*.test.ts               (extend)
apps/api/src/modules/brand-guidelines/application/pipes/list-brand-guidelines-versions-query.pipe.ts
apps/api/src/modules/brand-guidelines/application/pipes/change-note-query.pipe.ts
apps/api/src/modules/brand-guidelines/application/pipes/__tests__/list-brand-guidelines-versions-query.pipe.test.ts
apps/api/src/modules/brand-guidelines/application/pipes/__tests__/change-note-query.pipe.test.ts
apps/api/src/modules/brand-guidelines/brand-guidelines.module.ts                        (APPEND providers + controllers entries)
apps/api/src/modules/brand-guidelines/__tests__/brand-guidelines.module.test.ts         (extend)
apps/api/src/modules/brand-guidelines/__integration__/brand-guidelines-versions.integration-test.ts
apps/api/src/modules/brand-guidelines/__integration__/snapshot-on-mutate.integration-test.ts
apps/api/src/modules/brand-guidelines/index.ts                                          (APPEND-only)

apps/web/src/features/brand-shell/constants.ts                                          (APPEND endpoint factories + query keys)
apps/web/src/features/brand-shell/__tests__/constants.test.ts                           (extend)
apps/web/src/features/brand-shell/index.ts                                              (APPEND page + helper exports)
apps/web/src/features/brand-shell/data/model/brand-guidelines-version-data-model.ts
apps/web/src/features/brand-shell/data/model/__tests__/brand-guidelines-version-data-model.test.ts
apps/web/src/features/brand-shell/data/mapper/map-to-brand-guidelines-version.ts
apps/web/src/features/brand-shell/data/mapper/__tests__/map-to-brand-guidelines-version.test.ts
apps/web/src/features/brand-shell/data/remote/fetch-brand-guidelines-versions.ts
apps/web/src/features/brand-shell/data/remote/fetch-brand-guidelines-version-by-id.ts
apps/web/src/features/brand-shell/data/remote/fetch-voice-restricted-vocabulary.ts
apps/web/src/features/brand-shell/data/remote/fetch-voice-approved-examples.ts
apps/web/src/features/brand-shell/data/remote/fetch-voice-rejected-examples.ts
apps/web/src/features/brand-shell/data/remote/__tests__/*.test.ts                       (one test per new fetcher)
apps/web/src/features/brand-shell/data/remote/update-brand-voice.ts                     (CARVE-OUT §F5)
apps/web/src/features/brand-shell/data/remote/update-visual-identity.ts                 (CARVE-OUT)
apps/web/src/features/brand-shell/data/remote/update-brand-metadata.ts                  (CARVE-OUT)
apps/web/src/features/brand-shell/data/remote/create-dos-donts-entry.ts                 (CARVE-OUT)
apps/web/src/features/brand-shell/data/remote/update-dos-donts-entry.ts                 (CARVE-OUT)
apps/web/src/features/brand-shell/data/remote/delete-dos-donts-entry.ts                 (CARVE-OUT)
apps/web/src/features/brand-shell/data/remote/__tests__/update-*.test.ts                (extend)
apps/web/src/features/brand-shell/data/repositories/use-brand-guidelines-versions-repository.ts
apps/web/src/features/brand-shell/data/repositories/use-brand-guidelines-version-repository.ts
apps/web/src/features/brand-shell/data/repositories/__tests__/use-brand-guidelines-versions-repository.test.tsx
apps/web/src/features/brand-shell/data/repositories/__tests__/use-brand-guidelines-version-repository.test.tsx
apps/web/src/features/brand-shell/data/repositories/use-brand-voice-repository.ts       (CARVE-OUT §F5)
apps/web/src/features/brand-shell/data/repositories/use-visual-identity-repository.ts   (CARVE-OUT)
apps/web/src/features/brand-shell/data/repositories/use-dos-and-donts-repository.ts     (CARVE-OUT)
apps/web/src/features/brand-shell/data/repositories/use-brand-metadata-repository.ts    (CARVE-OUT)
apps/web/src/features/brand-shell/data/repositories/__tests__/*.test.tsx                (extend)
apps/web/src/features/brand-shell/presentation/components/BrandVoiceForm/               (CARVE-OUT §F8 + §F9)
apps/web/src/features/brand-shell/presentation/components/VisualIdentityForm/           (CARVE-OUT)
apps/web/src/features/brand-shell/presentation/components/DosAndDontsList/              (CARVE-OUT)
apps/web/src/features/brand-shell/presentation/components/DosAndDontsRowEditor/         (CARVE-OUT)
apps/web/src/features/brand-shell/presentation/components/DeleteDosDontsConfirm/        (CARVE-OUT)
apps/web/src/features/brand-shell/presentation/components/MetadataForm/                 (CARVE-OUT)
apps/web/src/features/brand-shell/presentation/pages/brand-guidelines-history/index.tsx
apps/web/src/features/brand-shell/presentation/pages/brand-guidelines-history/types.ts
apps/web/src/features/brand-shell/presentation/pages/brand-guidelines-history/use-brand-guidelines-history.ts
apps/web/src/features/brand-shell/presentation/pages/brand-guidelines-history/map-to-brand-guidelines-history-page-ui-model.ts
apps/web/src/features/brand-shell/presentation/pages/brand-guidelines-history/__tests__/*.test.{ts,tsx}
apps/web/src/features/brand-shell/presentation/pages/brand-guidelines-history-detail/index.tsx
apps/web/src/features/brand-shell/presentation/pages/brand-guidelines-history-detail/types.ts
apps/web/src/features/brand-shell/presentation/pages/brand-guidelines-history-detail/use-brand-guidelines-history-detail.ts
apps/web/src/features/brand-shell/presentation/pages/brand-guidelines-history-detail/map-to-brand-guidelines-history-detail-page-ui-model.ts
apps/web/src/features/brand-shell/presentation/pages/brand-guidelines-history-detail/__tests__/*.test.{ts,tsx}

apps/web/src/app/admin/brand-guidelines/[brandId]/history/page.tsx
apps/web/src/app/admin/brand-guidelines/[brandId]/history/__tests__/page.test.tsx
apps/web/src/app/admin/brand-guidelines/[brandId]/history/[versionId]/page.tsx
apps/web/src/app/admin/brand-guidelines/[brandId]/history/[versionId]/__tests__/page.test.tsx

apps/web/src/features/presentation/localization/types.ts                                (APPEND History + HistoryDetail interfaces + history/historyDetail fields)
apps/web/src/features/presentation/localization/languages/en/common.ts                  (APPEND keys)
apps/web/src/features/presentation/localization/languages/ro/common.ts                  (APPEND keys)
apps/web/src/features/presentation/localization/__tests__/parity.test.ts                (APPEND assertions)
```

**Excluded paths (do NOT modify, hook will block):**
- `apps/api/src/modules/auth/**`, `apps/api/src/common/auth/**`, `apps/api/src/common/guards/**`.
- `apps/web/src/features/auth/**`.
- `apps/api/src/modules/company-info/**`, `apps/web/src/features/company-info/**` (Phase-2 reference, read-only).
- `apps/web/src/features/admin-shell/**` (registry already covers `/admin/brand-guidelines/*`).
- `apps/api/src/modules/brand/application/controllers/brand.controller.ts` — **EXCEPT** the additive `@ResourceCaptures` tuple per mx-3bf156 carve-out (Chunk A §13). Any other edit requires `flow_mismatch` mail to the lead.
- `apps/web/src/features/brand-shell/constants.ts`'s `BRAND_GUIDELINES_SUB_NAV_REGISTRY` array — D does NOT append a 5th entry.
- `.overstory/runtime-contract.flows/sfx-webapp-boilerplate-e614.json` — flow file authored by lead/coordinator; path-boundary hook blocks Write/Edit.

---

## 13. mx-3bf156-analog carve-out (REQUIRED — verbatim)

**Exception:** the single-line additive `await writeBrandGuidelinesVersion(tx, brandId, editor, changeNote);` insertion inside an existing mutating repository method's `prisma.$transaction(...)` block (or wrapping a previously-non-transactional B-era method in `$transaction` for the first time and inserting the call) — same `tx` handle, same brandId, no other behavior change — is permitted and required for the following files:

- `apps/api/src/modules/brand/data/repositories/brand-voice.repository.ts` `upsertForBrand` (B-era; not yet wrapped in `$transaction` — wrap-and-append).
- `apps/api/src/modules/brand/data/repositories/visual-identity.repository.ts` `upsertForBrand` (B-era; same).
- `apps/api/src/modules/brand-guidelines/data/repositories/dos-and-donts.repository.ts` `createInBrand`, `updateInBrandById`, `deleteInBrandById` (C-era; already wrapped — single-line append inside each block).
- `apps/api/src/modules/brand-guidelines/data/repositories/brand-metadata.repository.ts` `upsertByBrandId` (C-era; already wrapped — single-line append).

This carve-out is the direct analog of mx-3bf156 (additive `@ResourceCaptures` tuples on a parent CREATE handler) — same pattern, applied to transaction-internal snapshot inserts. Chunk C's spec line 893 baked the transaction convention verbatim:

> Every D&D POST / PATCH / DELETE + every Metadata PUT must write a `BrandGuidelinesVersion` row in the same transaction once Chunk D ships. C does NOT write that code; C's repository methods MUST be wrapped in `this.prisma.$transaction` so D can append the version write inside the same TX without restructuring. **Concrete builder instruction:** every mutating repository method in C uses `await this.prisma.$transaction(async (tx) => { … })` even when the transaction currently holds a single query. D's builder appends `tx.brandGuidelinesVersion.create({ … })` inside each block.

Chunk B did NOT follow this convention (its `upsertForBrand` methods do not wrap in `$transaction`). D's builder therefore retrofits Voice + Visual via the same carve-out scope — the change is mechanically additive: introduce `$transaction` wrapper, keep existing `upsert` call inside, append the version-write helper. No behavior change to the singleton upsert itself; the version row is the only new effect.

**Builder MUST NOT** restructure any other part of the touched repositories. Mapper exports, dependency injection, parameter names — all preserved. The signature of `upsertForBrand(brandId, input, editor, changeNote)` adds `changeNote: string | null` as a 4th parameter; the `editor` parameter is renamed from `_editor` to `editor` (the underscore prefix was a B-era marker for "unused, reserved for D" — now consumed).

If the runtime probe surfaces `RESOURCE_CAPTURE_PATHPARAM_UNDECLARED` for `/brands/:brandId/guidelines/versions/*` routes, the original mx-3bf156 carve-out on `apps/api/src/modules/brand/application/controllers/brand.controller.ts` (Chunk A §13) is permitted — append a second `@ResourceCaptures` tuple `{ fromPath: 'id', resource: 'brand', pathParam: 'brandId' }` to the `createBrand` handler. Single additive edit only.

Any edit outside this carve-out scope requires a `flow_mismatch` mail to the lead.

---

## 14. Build/test pipeline order (TDD)

For each task above, the builder's loop is:

1. Read the task's referenced existing-code files (paths in §1).
2. Create the test file FIRST under `__tests__/` with red-only assertions for the planned API surface.
3. Run `pnpm --filter <package> test -- <test-path>` and confirm RED with expected error messages.
4. Write the implementation file.
5. Run the test → GREEN.
6. Run `pnpm --filter <package> typecheck && pnpm --filter <package> lint` → green.
7. Move to next task.

After all source tasks:

8. `pnpm typecheck && pnpm lint` at repo root.
9. `pnpm test:coverage` → 90% line/branch coverage across all new files.
10. `pnpm db:generate` (idempotent — confirm `prisma.brandGuidelinesVersion` is in the generated client).
11. `pnpm db:migrate -- --name add_brand_guidelines_version` (per mulch `mx-6d88ea` — trust the bridge, do NOT `pnpm stack:reset`). Verify with `pnpm stack:bridge`.
12. `pnpm test:integration` → all three new integration files pass; existing B/C integration files still pass.
13. `pnpm probe:smoke` → zero failures. If probe emits `RESOURCE_CAPTURE_PATHPARAM_UNDECLARED`, apply mx-3bf156 carve-out (Chunk A §13) and re-run.
14. Invoke `qa-test` skill in standard mode for J6 acceptance per §8 D-UI-QA.
15. Send `worker_done` mail with `## runtime-evidence` (probe summary JSON), `## ui-evidence` (qa-test transcript + screenshots), `## coverage` (test:coverage summary), and the diff stat per file group.

If any step 8-14 fails and root cause is in a flow file, invoke the `flow-failure-response` skill — DO NOT edit the flow file directly (hook will block).

---

## 15. Estimated total diff size

| Layer | Lines source | Lines test | New files | Modified files |
|---|---:|---:|---:|---:|
| Domain | ~80 | ~60 | 4 | 1 |
| Validation | ~150 | ~150 | 2 | 5 |
| Database | ~15 prisma + ~30 SQL | n/a | 0 + migration dir | 1 |
| Backend new | ~700 | ~900 | ~18 | 2 |
| Backend carve-outs | ~250 | ~400 | 0 | 8 |
| Frontend data | ~400 | ~550 | ~14 | 6 |
| Frontend presentation | ~1500 | ~2000 | ~20 | 4 |
| Localization | ~250 | ~50 | 0 | 4 |
| Integration tests | n/a | ~800 | 3 | 0 |
| **Total** | **~3375** | **~4900** | **~61** | **~31** |

Builder dispatch capacity per `.overstory/config.yaml`: 1 builder slot. Estimated wall-clock with TDD discipline: 10-14 hours (slightly larger than B/C due to the cross-chunk carve-out surface).

---

## 16. References

- Parent product plan: `.overstory/specs/sfx-webapp-boilerplate-ba09.md` §3 Chunk D + §5 J6 + §5 J8 forward-compat + §5 cross-cutting.
- Chunk A spec: `.overstory/specs/sfx-webapp-boilerplate-3e6a.md` — mx-3bf156 carve-out, Brand entity, `assertBrandActive`, `BRAND_REPOSITORY`, soft-delete behavior.
- Chunk B spec: `.overstory/specs/sfx-webapp-boilerplate-72fd.md` — BrandVoice + VisualIdentity entities, DTO declaration convention (mx-cbd785), pipe layout, sub-nav registry shape, zodApiBody helper (mx-967e12).
- Chunk C spec: `.overstory/specs/sfx-webapp-boilerplate-e554.md` — DosDontsEntry + BrandMetadata + GuidelineSearch surfaces, BrandGuidelinesModule layout, **§D (Versioning) line 893 codifies the transaction-wrap convention quoted verbatim into §13 above**.
- Phase-2 F4 backend pattern: `apps/api/src/modules/company-info/application/controllers/company-info.controller.ts:105-150` + `apps/api/src/modules/company-info/data/repositories/company-info.repository.ts:30-93` — cursor pagination + `x-cursor-invalid-behavior: empty-200` + `$transaction` version write.
- Phase-2 F5 frontend spec: `.overstory/specs/sfx-webapp-boilerplate-d0fe.md` — list page + read-only detail page pattern; query-key array-prefix convention.
- Mulch records consulted: `mx-cbd785` (declaration-driven DTOs), `mx-967e12` (PATCH/PUT 404 needs `@ApiBody` Zod binding), `mx-d9b182` (form.reset re-render guard), `mx-e7eb2d` (executeRequest error parser), `mx-6d88ea` (trust the bridge for `pnpm db:migrate`), `mx-3bf156` (parent-module additive carve-out), `mx-foundational-protocol` (`x-cursor-invalid-behavior: empty-200`), `mx-a9eaa5` (ADMIN_TAB_REGISTRY active predicate).
- Dispatch mail: `msg-2a7yqoopllsp` (coordinator → scout-bg-chunk-d-v1, 2026-05-17).

---

## 17. Notable findings (for coordinator's mulch ingest)

| # | Finding | Classification |
|---|---|---|
| 1 | **Chunk B did NOT follow the transaction-wrap convention.** `brand-voice.repository.ts` and `visual-identity.repository.ts` call `prisma.brandVoice.upsert(...)` and `prisma.visualIdentity.upsert(...)` directly with no `$transaction` wrapper, despite Chunk C's spec §D (line 893) stating *"every mutating repository method in C uses `await this.prisma.$transaction(async (tx) => { … })` even when the transaction currently holds a single query"*. Chunk C followed the convention; Chunk B did not. D's builder must retrofit Voice + Visual via the §13 carve-out (wrap-and-append). Recommend the project codify this as a mulch convention so future repository scouts catch the gap in code-review. | **foundational** — concrete cross-chunk convention violated; promotion to mulch prevents recurrence. |
| 2 | **The `_editor` underscore-prefix marker in `brand-voice.repository.ts:24` is a forward-compat stub for Chunk D.** The comment at line 24-25 reads *"editor is consumed by Chunk D's snapshot transaction; keep it on the signature so the repository contract is stable across chunks."* D's builder removes the underscore and threads the parameter into `writeBrandGuidelinesVersion`. Second instance of "stub for future chunk" propagation; pattern worth recording so reviewers don't flag the unused-parameter lint. | **tactical** — convention propagation pattern, useful for future scouts. |
| 3 | **`BRAND_GUIDELINES_SUB_NAV_REGISTRY` interface is locked to `{ id, labelKey, slot }` with `labelKey` typed as a 4-string union.** The dispatch mail referenced an extended shape (`sectionToken`, `deepLinkTemplate?`, `bodyComponent?`), but actual code at `apps/web/src/features/brand-shell/constants.ts:14-25` is the simpler 3-field shape. History is NOT a registry entry; it's a per-sub-section `[View history]` link affordance. Don't widen the union — that would push a breaking change across the sub-nav component. | **foundational — interface shape verified against actual code.** |
| 4 | **`AdminBrandGuidelinesTranslations` carries optional sub-sections (B+C convention).** Lines 448-453 of `types.ts` mark `subNav`, `voice`, `visual`, `dosAndDonts`, `metadata`, `search` as optional with the comment *"Marked optional so legacy unit-test mocks (built before these chunks landed) keep type-checking."* D's `history` + `historyDetail` additions follow the same `?:` optional pattern so existing mocks continue to compile. | **foundational — testing convention.** |
| 5 | **Cross-brand version isolation is enforced at the controller layer, not the repository.** `BrandGuidelinesVersionRepository.findById(id)` is brand-agnostic; the controller compares the loaded version's `brandId` against the path `brandId` and throws `NotFoundException` on mismatch. Avoids encoding the brand into the version-id schema (cursor opacity preserved). Test coverage at §8 D-IT1 includes a cross-brand 404 case. | **foundational — security-significant; merits a mulch record after qa-test confirms.** |
| 6 | **Two NestJS modules bind the same `BRAND_GUIDELINES_VERSION_REPOSITORY` symbol** — `BrandModule` (for the version-read carve-out on Voice/Visual GET responses) and `BrandGuidelinesModule` (for the standalone Versions controller + snapshot-write helper). Both bind the same `Symbol.for('BrandGuidelinesVersionRepository')` key; both instantiate `BrandGuidelinesVersionPrismaRepository`. Pragmatic side-effect of avoiding `imports: [BrandGuidelinesModule]` on `BrandModule` (which would create a near-circular dependency). Symbol identity via `Symbol.for` makes the duplicate-binding safe; the repository is stateless. | **tactical — non-obvious DI pattern; document or refactor in follow-up.** |
| 7 | **`changeNote` is a query-param (`?changeNote=...`), not a body field.** Reasons: (a) DELETE has no body in HTTP semantics — query param is uniform across POST/PUT/PATCH/DELETE; (b) avoids touching every existing upsert Zod schema with an optional field (smaller carve-out surface on B+C); (c) body schemas stay `.strict()` without leaks. Trade-off: queries are URL-visible (no large bodies tolerated) — capped at 500 chars by Zod. | **tactical — design decision worth recording.** |
| 8 | **The snapshot composer runs FOUR queries per mutation** (Voice + Visual + DosDonts list + Metadata). Per existing Postgres index design, all four are `findUnique` / `findFirst` on `(brandId)` or `findMany` on `(brandId, createdAt desc, id desc)` — sub-millisecond each. Total transaction overhead ~5-10ms incremental per save. Cost-acceptable for an admin-only surface, but worth flagging if Chunk E adds high-volume agent reads that trigger snapshot recomposition (E does NOT; agent reads are pure reads, never trigger snapshot writes). | **observational — performance flag for future capacity planning.** |
| 9 | **`pnpm db:migrate` panel-bridge auto-applies the new migration directory within ~1.5s** per `mx-6d88ea`. Builder must NOT `pnpm stack:reset` — that wipes the test data accumulated during integration-test development. Use `pnpm stack:bridge | tail -50` to confirm the auto-apply landed. | **foundational** — already recorded as `mx-6d88ea`. |
| 10 | **Standalone Voice list reads (§5.E) are exempt from the cross-cutting `latestVersionId` field** per `@ApiOperation.description`. The product-plan requirement is "every guideline response carries `versionId`" — these endpoints return raw arrays (string[] / phrase-object[]) optimized for agent ingestion; wrapping them in `{ data: [...], latestVersionId: ... }` would balloon the wire shape. Documented exception in OpenAPI prose. | **tactical — design decision; record after qa-test confirms agents tolerate raw-array shape.** |

Classification guidance for coordinator's mulch ingest: findings 1, 3, 4, 5, 9 = **foundational**; findings 2, 6, 7, 10 = **tactical**; finding 8 = **observational** (until measured).
