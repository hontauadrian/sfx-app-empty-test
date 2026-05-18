<!-- written-by: scout-bg-chunk-c-v1 -->
# Chunk C — Dos & Don'ts + Brand Metadata + Cross-Section Search (TDD spec)

**Task:** `sfx-webapp-boilerplate-e554`
**Parent product plan:** `.overstory/specs/sfx-webapp-boilerplate-ba09.md` §3 Chunk C, §5 J4 + J5 + cross-cutting auth/openapi/freshness
**Sibling chunks (read for shared patterns):**

- `.overstory/specs/sfx-webapp-boilerplate-3e6a.md` — Chunk A (Brand profile foundation; parent resource for every Chunk C endpoint).
- `.overstory/specs/sfx-webapp-boilerplate-72fd.md` — Chunk B (BrandVoice + VisualIdentity). **At time of scout authoring this file is not yet on disk.** Builder C MUST re-read it at gate time and adopt B's `BRAND_GUIDELINES_SUB_NAV_REGISTRY` shape verbatim. C only **appends** entries; C never redefines the registry, the sub-nav component, or the nested-controller import path. If a registry-shape conflict surfaces at gate time, mail the lead — do not unilaterally diverge.

**Authoritative scope (verbatim from ba09 §3 Chunk C, do not expand):**

> **C1**: `DosDontsEntry` domain entity (id, brandId FK, type 'do'|'dont', category text from extensible enum, ruleText text, exampleText nullable text, createdAt, updatedAt) + Prisma model + migration. Multiple rows per brand (CRUD on individual entries).
>
> **C2**: `BrandMetadata` domain entity (singleton per brand: brandId FK, ownerUserId, lastUpdatedAt, lastUpdatedByUserId, tags string[] of free-form content-type/campaign/market/language tags) + Prisma + migration.
>
> **C3**: Backend endpoints `GET/POST/PATCH/DELETE /api/v1/brands/:brandId/guidelines/dos-and-donts` (collection with `?type` + `?category` query filter), `GET/PUT /api/v1/brands/:brandId/guidelines/metadata`, `GET /api/v1/brands/:brandId/guidelines/search?q=` (full-text search across Voice/Visual/D&D/Metadata for that brand, returning categorized matches with section name + matched fragment + deep-link href). Use Postgres `to_tsvector` / `to_tsquery` or `ILIKE` substring scan. All write admin-only; reads admin OR agent. `@ApiResponse` declared. Integration tests + flow file.
>
> **C4**: Frontend — Dos & Don'ts sub-section (filterable list with type + category dropdowns, inline add/edit/delete with confirm), Metadata sub-section (owner display, last-updated display, tag editor with chip-pattern Add/Remove), Search bar at top of `/admin/brand-guidelines/<brandId>` page with grouped results panel that deep-links to source section.

**Agent role caveat (Chunk E, not C):** the parent plan says reads accept admin OR agent. Chunk E (sfx-webapp-boilerplate-XXXX) introduces the `agent` role and rewires every read endpoint to accept either. **Chunk C ships reads as admin-only** (matching A/B) and lists this carve-out under §11 "Forward-compat with Chunk E". C MUST NOT add a placeholder `AUTH_ROLE_AGENT` constant or stub Keycloak role.

---

## 1. Runtime acceptance criteria (verbatim into worker_done evidence)

Probe derives HTTP checks; UI checks come via qa-test full mode at builder close.

### J4 — Dos & Don'ts (parent plan §5 J4)

- An admin on `/admin/brand-guidelines/<brandId>` can open the Dos & Don'ts sub-section and add an entry by specifying a type (`do` | `dont`), a category from the extensible set (`tone` | `vocabulary` | `visuals` | `legal` | `campaign-messaging`), a rule text (required, ≥1 char), and an optional example text.
- Submitting the add form shows a pending state on the submit control (disabled + visible indicator) and produces a visible success notification on persistence. Silent-on-success is forbidden.
- The new entry appears in the list without a manual refresh (React Query cache invalidation on the brand's D&D query key).
- Filtering by Type narrows the list to only matching rows; filtering by Category narrows further; combining Type + Category applies both filters; clearing a filter restores the broader set.
- Editing an existing entry inline opens the row in edit mode, accepts new values, and on Save updates the row in place with a success notification.
- Deleting an entry opens a confirm dialog naming the rule fragment; confirming removes the row from the list with a success notification.
- An empty `ruleText` is rejected client-side before the network call. An unknown category is rejected client-side and server-side.
- Searching for an entry across the active brand (J5) returns the D&D entry under the "Dos & Don'ts" group with its rule text fragment.

### J5 — Search active brand (parent plan §5 J5)

- An admin types a non-empty query in the search bar mounted at the top of `/admin/brand-guidelines/<brandId>` (above the sub-nav body, below the page heading + selector). The response returns matches grouped by source section: `voice`, `visual`, `dos-and-donts`, `metadata`.
- Each match identifies its source section, the matched fragment (≤200 chars, contextual snippet around the hit), and a deep-link `href` that navigates to that section opened to the matched entry. Activating a result deep-links via the sub-nav registry's section href + a fragment / query param identifying the matched row.
- An empty query string returns an empty result set without erroring (200, `{ groups: [] }` or each group with an empty `items`).
- Results are scoped to the active brand only — content from other brands does not appear in any group.
- The search response carries no `versionId` field at this chunk (versioning is Chunk D); if Chunk D has already shipped at integration time, C MUST NOT remove the field — C's controller forwards whatever the snapshot composer returns.

### J7 carve-out — brand switch resets the panel

- Switching active brand via `BrandProfileSelector` (delivered by A) resets the search input to empty, closes the results panel, and reloads the D&D + Metadata sub-section bodies with the new brand's data. Saves on brand B do not mutate brand A's data.

### Cross-cutting auth boundaries (every endpoint inherits — parent plan §5)

- Unauthenticated request to any `/api/v1/brands/:brandId/guidelines/(dos-and-donts|metadata|search)` route → 401.
- Authenticated non-admin (`viewer`) to any route → 403.
- Admin to any route with a valid brandId → 200/201/204 per method semantics.
- Any route against an unknown or soft-deleted `brandId` → 404 (the controller calls `brandRepository.findActiveById(brandId)` first and throws `NotFoundException` on `null`).
- Bad input (Zod) → 400 with per-field envelope error.

### Cross-cutting OpenAPI / discoverability

- Every new endpoint appears at `/api/docs` with full `@ApiResponse` set (`200`/`201`/`204`/`400`/`401`/`403`/`404` per method) and `@ApiBearerAuth('accessToken')`.
- Every Zod schema declares `.openapi({ description, example })` per field.
- Every DTO `@ApiProperty` / `@ApiPropertyOptional` declares explicit `type:` (NestJS+SWC do not emit reliable `design:type` reflection metadata — apps/api `ADR-protected`).
- Every constructor parameter uses `@Inject(TOKEN)` (SWC `design:paramtypes` reliability gap — Chunk A pattern).

### Cross-cutting freshness

- A PUT / POST / PATCH / DELETE on D&D or Metadata becomes visible to a subsequent GET on the same brand without any cache-invalidation step from the caller.
- React Query mutation hooks invalidate the per-brand query keys for `dos-and-donts`, `metadata`, and `guideline-search` so the SearchBar reflects edits immediately.

---

## 2. Guard contract

Every endpoint introduced by C:

- **Public:** none.
- **Authenticated (admin-only):** every endpoint in §C3. Class-level `@UseGuards(JwtAuthGuard)` + `@AuthRoles(AUTH_ROLE_ADMIN)` + `@ApiBearerAuth('accessToken')`. Unauth → 401; non-admin → 403.

Every page introduced by C: none new at the route level. C's sub-sections render inside the existing `/admin/brand-guidelines/<brandId>` page (delivered by A), which inherits AuthGate + AdminRouteGate from `apps/web/src/app/admin/layout.tsx`. Unauthenticated visitor → AuthGate redirect to oauth2-proxy sign-in. Non-admin → AdminRouteGate denied surface. **Agent role is API-only (Chunk E) — no admin page accepts an agent JWT.**

---

## 3. Contract annotations (declaration-driven, mandatory)

Every file builder C touches MUST honor the declarations below. The contract compiler reads these; missing any of them silently under-covers the probe.

| Surface | Declaration |
|---|---|
| Every endpoint | `@ApiTags('brand-guidelines')`, `@ApiOperation({ summary, description })`, `@ApiBearerAuth('accessToken')`, `@ApiResponse({ status: <each one>, … })` for every status the handler can produce (200/201/204/400/401/403/404). |
| Every controller class | `@UseGuards(JwtAuthGuard)` + `@AuthRoles(AUTH_ROLE_ADMIN)`. |
| Every path param | `@ApiParam({ name, type: String, description })`. |
| Every query param | `@ApiQuery({ name, required: boolean, type, description })`. |
| Every POST / PUT / PATCH body | `@ApiBody(zodApiBody(<schema>, '<RefName>'))` from `@sfx/validation` so the OpenAPI dump carries a real schema, NOT an empty object (per mulch `mx-967e12` — without this, generator sends empty body → 400 masks the real 404 path → `ZOD_CONTRACT_UNDETECTED_FOR_STATUS_REACH` diag). |
| Every `@ApiProperty` / `@ApiPropertyOptional` in DTOs | Explicit `type:` (`String`, `Number`, `Boolean`, `[NestedDto]`, `Date`). `nullable: true` for nullable fields. |
| Every Zod field | `.openapi({ description, example })`. Root schema → `.openapi({ description })`. `.strict()` on every object. |
| Every constructor param | `@Inject(TOKEN)` — never bare type-only inference. |
| Every POST handler creating a chainable resource | `@ResourceCaptures({ fromPath: '<jsonPath>', resource: '<resourceName>', pathParam: '<param>' })`. For C: every POST on `dos-and-donts` declares a `dosDontsEntry` capture so downstream chunks can chain PATCH/DELETE flows. |
| Paginated GET (D&D list, see §6) | `@ApiOperation({ extensions: { 'x-cursor-invalid-behavior': 'empty-200' } })` if cursor pagination is used. |

### `mx-3bf156` carve-out (REQUIRED — copy verbatim into FILE_SCOPE clause)

> The parent Brand module at `apps/api/src/modules/brand/application/controllers/brand.controller.ts` is owned by Chunk A. Builder C MUST NOT modify CRUD logic, DTOs, pipes, or repository wiring on the parent. **Exception:** a single additive `@ResourceCaptures` tuple on the parent brand CREATE handler — same `fromPath`, same `resource`, only `pathParam` differs — is permitted and required when the runtime probe emits `RESOURCE_CAPTURE_PATHPARAM_UNDECLARED` for the `brandId` path param consumed by C's `/brands/:brandId/guidelines/*` routes. Append the tuple under the existing decorator; do not rewrite or reorder existing tuples. No other change to that file is permitted.

---

## 4. Module / file layout

C delivers a **new nested module** `apps/api/src/modules/brand-guidelines/`. This sits alongside `brand/` rather than inside it because Chunk B's BrandVoice + VisualIdentity will land the same sibling layout. Naming and structure mirror `apps/api/src/modules/company-info/` (apps/api ADR pattern + Chunk A precedent).

```
apps/api/src/modules/brand-guidelines/
├── brand-guidelines.module.ts                 # NEW
├── index.ts                                   # NEW
├── __tests__/                                 # NEW
│   ├── brand-guidelines.module.test.ts
│   └── index.test.ts
├── __integration__/                           # NEW
│   ├── setup-env.ts                           # copy verbatim from brand/
│   ├── dos-and-donts.integration-test.ts
│   ├── brand-metadata.integration-test.ts
│   └── guideline-search.integration-test.ts
├── application/
│   ├── controllers/
│   │   ├── dos-and-donts.controller.ts
│   │   ├── brand-metadata.controller.ts
│   │   ├── guideline-search.controller.ts
│   │   └── __tests__/{*.controller.test.ts × 3}
│   ├── dto/
│   │   ├── dos-and-donts.dto.ts               # request/response + list page DTO
│   │   ├── brand-metadata.dto.ts
│   │   ├── guideline-search.dto.ts            # search result + group DTOs
│   │   └── __tests__/{*.dto.test.ts × 3}
│   └── pipes/
│       ├── create-dos-donts-entry.pipe.ts
│       ├── update-dos-donts-entry.pipe.ts
│       ├── list-dos-donts-query.pipe.ts
│       ├── upsert-brand-metadata.pipe.ts
│       ├── guideline-search-query.pipe.ts
│       └── __tests__/{*.pipe.test.ts × 5}
└── data/
    ├── repositories/
    │   ├── brand-guidelines.tokens.ts          # 3 symbols: DOS_DONTS_REPOSITORY, BRAND_METADATA_REPOSITORY, GUIDELINE_SEARCH_REPOSITORY (+ shared PRISMA_CLIENT symbol or reuse brand's; see §6.3)
    │   ├── dos-and-donts.repository.ts
    │   ├── brand-metadata.repository.ts
    │   ├── guideline-search.repository.ts
    │   └── __tests__/{*.repository.test.ts × 3, brand-guidelines.tokens.test.ts}
    ├── mapper/
    │   ├── dos-and-donts.mapper.ts
    │   ├── brand-metadata.mapper.ts
    │   └── __tests__/{*.mapper.test.ts × 2}
    └── model/
        ├── dos-and-donts-data-model.ts
        ├── brand-metadata-data-model.ts
        └── __tests__/{*.test.ts × 2}
```

Frontend lives **inside the existing** `apps/web/src/features/brand-shell/` feature (Chunk A scope; A explicitly leaves room for C/D to append). Layout additions:

```
apps/web/src/features/brand-shell/
├── constants.ts                                # MODIFY (append-only): D&D + metadata + search endpoints & query keys; APPEND sub-nav entries
├── data/
│   ├── remote/
│   │   ├── fetch-dos-and-donts.ts              # NEW
│   │   ├── create-dos-donts-entry.ts           # NEW
│   │   ├── update-dos-donts-entry.ts           # NEW
│   │   ├── delete-dos-donts-entry.ts           # NEW
│   │   ├── fetch-brand-metadata.ts             # NEW
│   │   ├── update-brand-metadata.ts            # NEW
│   │   ├── fetch-guideline-search.ts           # NEW
│   │   └── __tests__/{*.test.ts × 7}
│   ├── mapper/
│   │   ├── map-to-dos-donts-entry.ts           # NEW
│   │   ├── map-to-brand-metadata.ts            # NEW
│   │   ├── map-to-guideline-search-result.ts   # NEW
│   │   └── __tests__/{*.test.ts × 3}
│   ├── model/
│   │   ├── dos-donts-entry-data-model.ts       # NEW
│   │   ├── brand-metadata-data-model.ts        # NEW
│   │   ├── guideline-search-data-model.ts      # NEW
│   │   └── __tests__/{*.test.ts × 3}
│   └── repositories/
│       ├── use-dos-and-donts-repository.ts     # NEW
│       ├── use-brand-metadata-repository.ts    # NEW
│       ├── use-guideline-search-repository.ts  # NEW
│       └── __tests__/{*.test.tsx × 3}
└── presentation/
    ├── pages/
    │   └── brand-guidelines-detail/
    │       └── index.tsx                       # MODIFY (append-only): mount SearchBar above sub-nav body, render DosAndDontsList + MetadataForm via sub-nav registry. Defer to B's BRAND_GUIDELINES_SUB_NAV_REGISTRY shape.
    ├── components/
    │   ├── SearchBar/                          # NEW (index.tsx, use-search-bar.ts, map-to-search-bar-ui-model.ts, types.ts, __tests__/)
    │   ├── SearchResultsPanel/                 # NEW (grouped panel with deep-links)
    │   ├── DosAndDontsList/                    # NEW (filterable list + inline add/edit/delete + confirm)
    │   ├── DosAndDontsRowEditor/               # NEW (inline edit form for one row)
    │   ├── DeleteDosDontsConfirm/              # NEW (confirm dialog reusing DeleteBrandConfirm pattern)
    │   └── MetadataForm/                       # NEW (owner display + lastUpdated display + ChipTagInput)
    └── validators/
        ├── upsert-dos-donts-entry.resolver.ts  # NEW (Zod resolver for react-hook-form)
        ├── upsert-brand-metadata.resolver.ts   # NEW
        └── __tests__/{*.test.ts × 2}
```

Localization files (modify-in-place):

```
apps/web/src/features/presentation/localization/languages/en/common.ts   # MODIFY: append adminBrandGuidelines.dosAndDonts.*, .metadata.*, .search.*
apps/web/src/features/presentation/localization/languages/ro/common.ts   # MODIFY: parallel RO additions
apps/web/src/features/presentation/localization/types.ts                 # MODIFY: widen CommonTranslations.adminBrandGuidelines
```

Sub-nav registry (modify-in-place, **APPEND ONLY**):

```
apps/web/src/features/brand-shell/constants.ts   # MODIFY: append { id: 'dosAndDonts', ... } and { id: 'metadata', ... } to BRAND_GUIDELINES_SUB_NAV_REGISTRY (introduced by Chunk B); if B has not landed at gate time, MAIL the lead — do not invent the registry.
```

Per-task flow file (write at gate time):

```
.overstory/runtime-contract.flows/sfx-webapp-boilerplate-e554.json   # NEW (curated by builder; see §13)
```

Prisma schema + migration:

```
packages/database/prisma/schema.prisma                                    # MODIFY: add DosDontsEntry + BrandMetadata models, FK to Brand, indexes
packages/database/prisma/migrations/<timestamp>_add_brand_guidelines/migration.sql   # NEW (generated by `pnpm db:migrate -- --name add_brand_guidelines`)
```

Validation + domain:

```
packages/validation/src/schemas/brand-guidelines.schema.ts                # NEW: dos-and-donts + brand-metadata + guideline-search Zod schemas with .openapi() per field
packages/domain/src/entities/dos-donts-entry.ts                           # NEW
packages/domain/src/entities/brand-metadata.ts                            # NEW
packages/domain/src/ports/dos-donts-repository.ts                         # NEW
packages/domain/src/ports/brand-metadata-repository.ts                    # NEW
packages/domain/src/ports/guideline-search-repository.ts                  # NEW
packages/domain/src/index.ts                                              # MODIFY: re-export new entities + ports
packages/validation/src/index.ts                                          # MODIFY: re-export new schemas + types
```

App module wiring (modify-in-place):

```
apps/api/src/app.module.ts   # MODIFY: import BrandGuidelinesModule
```

---

## 5. FILE_SCOPE (builder C exclusive ownership, with carve-outs)

Builder C may modify only the paths below. Anything else → mail the lead.

```
apps/api/src/modules/brand-guidelines/**                                            (CREATE)
apps/api/src/modules/brand/application/controllers/brand.controller.ts              (APPEND-ONLY additive @ResourceCaptures tuple per mx-3bf156 carve-out; no other change)
apps/api/src/app.module.ts                                                          (APPEND-ONLY import of BrandGuidelinesModule + module entry in `imports: []`)
apps/web/src/features/brand-shell/data/**                                           (CREATE new files; existing brand-shell data/remote untouched)
apps/web/src/features/brand-shell/presentation/components/SearchBar/**              (CREATE)
apps/web/src/features/brand-shell/presentation/components/SearchResultsPanel/**     (CREATE)
apps/web/src/features/brand-shell/presentation/components/DosAndDontsList/**        (CREATE)
apps/web/src/features/brand-shell/presentation/components/DosAndDontsRowEditor/**   (CREATE)
apps/web/src/features/brand-shell/presentation/components/DeleteDosDontsConfirm/**  (CREATE)
apps/web/src/features/brand-shell/presentation/components/MetadataForm/**           (CREATE)
apps/web/src/features/brand-shell/presentation/validators/upsert-dos-donts-entry.resolver.ts          (CREATE)
apps/web/src/features/brand-shell/presentation/validators/upsert-brand-metadata.resolver.ts           (CREATE)
apps/web/src/features/brand-shell/presentation/pages/brand-guidelines-detail/index.tsx                (APPEND-ONLY: mount SearchBar + registry-rendered subsection body; do not refactor existing JSX)
apps/web/src/features/brand-shell/presentation/pages/brand-guidelines-detail/use-brand-guidelines-detail.ts   (APPEND-ONLY: wire active-subsection state if registry needs it; defer to B's shape)
apps/web/src/features/brand-shell/constants.ts                                      (APPEND-ONLY: D&D + Metadata sub-nav entries, endpoint constants, query keys)
apps/web/src/features/brand-shell/index.ts                                          (APPEND-ONLY: re-export new components if Chunk D needs them)
apps/web/src/features/presentation/localization/languages/en/common.ts              (APPEND-ONLY: adminBrandGuidelines.dosAndDonts.*, .metadata.*, .search.*)
apps/web/src/features/presentation/localization/languages/ro/common.ts              (APPEND-ONLY: parallel RO additions)
apps/web/src/features/presentation/localization/types.ts                            (APPEND-ONLY: widen CommonTranslations.adminBrandGuidelines)
packages/database/prisma/schema.prisma                                              (APPEND-ONLY: DosDontsEntry + BrandMetadata models)
packages/database/prisma/migrations/**/add_brand_guidelines/**                      (CREATE — single migration directory)
packages/domain/src/entities/dos-donts-entry.ts                                     (CREATE)
packages/domain/src/entities/brand-metadata.ts                                      (CREATE)
packages/domain/src/ports/dos-donts-repository.ts                                   (CREATE)
packages/domain/src/ports/brand-metadata-repository.ts                              (CREATE)
packages/domain/src/ports/guideline-search-repository.ts                            (CREATE)
packages/domain/src/index.ts                                                        (APPEND-ONLY: re-exports)
packages/validation/src/schemas/brand-guidelines.schema.ts                          (CREATE)
packages/validation/src/index.ts                                                    (APPEND-ONLY: re-exports)
.overstory/runtime-contract.flows/sfx-webapp-boilerplate-e554.json                  (CREATE — see §13)
```

Out of scope (mail lead if change needed):

- `apps/api/src/modules/brand/data/**`, `apps/api/src/modules/brand/application/dto/**`, `apps/api/src/modules/brand/application/pipes/**`, `brand.module.ts` (Chunk A).
- `apps/api/src/modules/company-info/**` (Phase-2).
- `apps/api/src/common/**` (no changes — every helper C needs already exists).
- `apps/api/src/modules/brand-voice/**`, `apps/api/src/modules/visual-identity/**` (Chunk B).
- `apps/web/src/features/admin-shell/**` (Phase-2 + Chunk A).
- Any file modifying Keycloak realm config / oauth2-proxy / RS256 / JWKS (Chunk E only).

---

## 6. Schema, contract & pagination decisions

### 6.1 D&D category — extensible enum, declared in domain + Zod

Per ba09 §3 C1 the category set is "extensible". C ships **5 founding values** (parent plan §1 J4: tone, vocabulary, visuals, legal, campaign messaging) declared in a single source of truth.

```ts
// packages/domain/src/entities/dos-donts-entry.ts
export const DOS_DONTS_CATEGORIES = [
  'tone',
  'vocabulary',
  'visuals',
  'legal',
  'campaign-messaging',
] as const;
export type DosDontsCategory = (typeof DOS_DONTS_CATEGORIES)[number];
```

Zod consumes the const tuple: `z.enum(DOS_DONTS_CATEGORIES)`. Adding a 6th value later requires editing exactly one file (`packages/domain/src/entities/dos-donts-entry.ts`) + adding a translation key in EN + RO common.ts — no DB migration (column is `text`).

### 6.2 D&D type enum

Two values: `do` and `dont`. `'dont'` (no apostrophe) to keep the URL / query-string + JSON shape ASCII-safe. UI translation maps to the localized display ("Don't" / "Nu").

### 6.3 PRISMA_CLIENT token reuse

`brand/data/repositories/brand.tokens.ts` already declares `PRISMA_CLIENT = Symbol('BRAND_PRISMA_CLIENT')`. Per apps/api ADR-006, each module owns its own injection symbol. C declares its own: `BRAND_GUIDELINES_PRISMA_CLIENT = Symbol('BRAND_GUIDELINES_PRISMA_CLIENT')` and provides `prisma` from `@sfx/database` against it. Do **not** import the symbol from `brand/`.

### 6.4 Pagination decision — D&D collection: NOT paginated

**Rationale:** per ba09 §3 C1 D&D rows are per-brand and the parent journey §5 J4 implies hand-curated lists (admin clicks `Add row`, fills, saves). Realistic upper bound is ≤ ~50 entries per brand. Cursor pagination introduces gate-test cost without product benefit at this scale. C's `GET /api/v1/brands/:brandId/guidelines/dos-and-donts` returns the full active set ordered `createdAt DESC, id DESC` (matches Chunk A `listActive` pattern). Filters `?type` + `?category` narrow server-side. The full payload bound is ≤ 50 × (~512 bytes / row) ≈ 25 KB — well under the conservative ~256 KB envelope budget.

If a future product change exceeds ~100 entries per brand, Chunk F migrates to cursor pagination using the F4 pattern with `x-cursor-invalid-behavior: empty-200`. **This decision is documented in the OpenAPI `@ApiOperation.description`** so future readers see the rationale.

### 6.5 Search — Postgres `to_tsvector` vs `ILIKE` choice

C ships **`ILIKE %q%` substring scan** across the active brand's `dos_donts_entry.rule_text`, `dos_donts_entry.example_text`, `brand_metadata.tags::text` (cast jsonb array → text), and the singleton rows in `brand_voice.tone` / `brand_voice.preferred_vocabulary::text` / `brand_voice.restricted_vocabulary::text` / `brand_voice.writing_style_rules` / `visual_identity.logo_usage` / `visual_identity.spacing_guidance` / `visual_identity.image_style_guidance` / `visual_identity.iconography_guidance` / `visual_identity.usage_restrictions` (when those exist after Chunk B lands). **Rationale:**

- `to_tsvector` requires per-column GIN indexes + tsvector cast on every column, multiplying migration weight; the realistic per-brand corpus is small (≤ 50 D&D rows + 2 singletons), so `ILIKE` is O(n) over a tiny n.
- `ILIKE` is locale-independent enough for EN + RO ASCII tokens. The known weakness (diacritic-insensitivity for `ă`/`â`/`î`/`ș`/`ț`) is documented in the OpenAPI description; if it bites in user feedback, Chunk F migrates to `unaccent + to_tsvector`.
- The probe (J5) only asserts grouped-results shape, not ranking — `ILIKE` is sufficient.

**Result envelope:**

```ts
// guideline-search response (admin-only)
{
  query: string,           // echoed back (trimmed)
  brandId: string,
  groups: Array<{
    section: 'voice' | 'visual' | 'dos-and-donts' | 'metadata',
    items: Array<{
      id: string,          // entry id where applicable (D&D row id, or 'brand-metadata' for the singleton)
      sectionTitleKey: string,        // translation key, e.g. 'admin.brandGuidelines.dosAndDonts.title'
      matchedFieldKey: string,        // translation key for the field, e.g. 'admin.brandGuidelines.dosAndDonts.fields.ruleText'
      fragment: string,               // ≤200 chars, contextual snippet containing the match
      href: string,                   // deep-link href, e.g. /admin/brand-guidelines/<brandId>?subsection=dosAndDonts#entry-<id>
    }>,
  }>,
}
```

**Behavior:**

- Empty query (`?q=` absent or empty after trim) → 200 with `{ query: '', brandId, groups: [] }`. No DB hit.
- Query length > 200 chars → 400 (per Zod `.max(200)`).
- Per-brand only: every WHERE filter scopes to `brandId` derived from the path param. Voice + Visual queries gracefully no-op when the per-brand singletons don't exist yet (Chunk B not landed at builder time → empty groups; Chunk D snapshot path not needed for search).
- Per-section guard: the search controller is read-only and never depends on Chunk B/D tables existing. Use `Prisma.dmmf` model lookup or try/catch around the queries so a missing model returns an empty group rather than 500. **Concretely: in `data/repositories/guideline-search.repository.ts`, wrap each per-section query in `if (this.prismaModelExists(table))` where `prismaModelExists` checks `this.prisma._dmmf.modelMap[table]`.** This decouples C from B's ship order.

### 6.6 Metadata payload

```ts
// packages/domain/src/entities/brand-metadata.ts
export interface BrandMetadata {
  readonly brandId: string;
  readonly ownerUserId: string;             // subject id of the brand owner (mirrors Brand.ownerUserId; not editable here, displayed)
  readonly lastUpdatedAt: Date;
  readonly lastUpdatedByUserId: string;     // subject id of the admin that last PUT metadata
  readonly tags: readonly string[];         // free-form, max 64 tags, each ≤80 chars (Zod-enforced)
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
export interface UpsertBrandMetadataInput {
  readonly tags?: readonly string[];        // undefined = keep existing; [] = explicit clear (mirrors company-info `coreValues` policy)
}
```

`tags` follows the Phase-2 `coreValues` policy from `packages/domain/src/entities/company-info.ts` (no null at any layer, `[]` = explicit clear, `undefined` = field omitted). Prisma column: `tags Text[] @default([])`. The metadata controller's PUT is admin-only; on every PUT it sets `lastUpdatedAt = now()` and `lastUpdatedByUserId = req.user.subject`. Reads return the full record (or auto-creates a default empty row on first read so the controller doesn't return `null`).

---

## 7. Prisma migration

```prisma
// packages/database/prisma/schema.prisma — APPEND-ONLY at end of file

model DosDontsEntry {
  id          String   @id @default(cuid())
  brandId     String   @map("brand_id")
  type        String                                   // 'do' | 'dont' — Zod enforces; column is text for forward-compat
  category    String                                   // extensible enum from DOS_DONTS_CATEGORIES — column is text
  ruleText    String   @map("rule_text") @db.Text
  exampleText String?  @map("example_text") @db.Text
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  brand       Brand    @relation(fields: [brandId], references: [id], onDelete: Cascade)

  @@index([brandId, createdAt(sort: Desc), id(sort: Desc)], map: "dos_donts_brand_created_desc_idx")
  @@index([brandId, type, category], map: "dos_donts_brand_type_category_idx")
  @@map("dos_donts_entry")
}

model BrandMetadata {
  brandId             String   @id @map("brand_id")                  // PK = brandId enforces singleton-per-brand
  ownerUserId         String   @map("owner_user_id")
  lastUpdatedAt       DateTime @default(now()) @map("last_updated_at")
  lastUpdatedByUserId String   @map("last_updated_by_user_id")
  tags                String[] @default([])
  createdAt           DateTime @default(now()) @map("created_at")
  updatedAt           DateTime @updatedAt @map("updated_at")

  brand               Brand    @relation(fields: [brandId], references: [id], onDelete: Cascade)

  @@map("brand_metadata")
}

// In existing Brand model, add the inverse-relation arrays (additive — no migration impact beyond Prisma client regen):
// dosDontsEntries DosDontsEntry[]
// metadata        BrandMetadata?
```

**Migration generation:**

```bash
pnpm db:migrate -- --name add_brand_guidelines
```

Per mulch `mx-6d88ea`, do **not** run `prisma migrate dev` manually; the panel-bridge auto-applies the new migration directory within ~1.5s of `pnpm db:migrate -- --name`. Trust the bridge.

**Inverse relations on Brand:** the `dosDontsEntries` + `metadata` back-references are required by Prisma. Add them inside the existing `Brand { ... }` block as APPEND-ONLY edits to `schema.prisma`. Do not reorder existing fields.

**Cascade semantics:** `onDelete: Cascade` means when an admin soft-deletes a Brand row (Chunk A sets `deletedAt`, does NOT hard-delete), the FK rows persist. Hard delete of the brand row would cascade, but A's repository never issues a hard delete. This is correct behavior — soft-deleted brands' D&D + metadata stay queryable for audit but are filtered by C's controllers (`where: { brand: { deletedAt: null } }` is implicit via the 404-on-unknown-brand check at the controller entry).

---

## 8. Backend tasks (TDD breakdown, one file-group per task)

Each task: write tests FIRST against `__tests__/` (mocks at boundaries; unit tests use mock repositories, integration tests use real Postgres via the existing `__integration__/setup-env.ts` pattern), implement, run `pnpm --filter @sfx/api test:coverage` scoped, then move on. Mulch records `mx-322b8e` (PrismaClient via `@sfx/database`), `mx-4c1538` (AppConfigModule env validation in module tests), `mx-967e12` (zodApiBody for 404-status-reach protection), `mx-c5fb1a` (soft-delete slug tombstone applies if D&D ever supports soft-delete — N/A at this chunk, hard CRUD only).

### C-T1 — Domain: `DosDontsEntry` entity + `DosDontsRepository` port

**Files:**

- `packages/domain/src/entities/dos-donts-entry.ts` (entity + `DOS_DONTS_CATEGORIES` const + `DOS_DONTS_TYPES` const + input types)
- `packages/domain/src/ports/dos-donts-repository.ts` (CRUD signature; methods `listByBrand({ brandId, type?, category? })`, `findByIdInBrand`, `createInBrand`, `updateInBrandById`, `deleteInBrandById`. Every method that may miss returns `null` / `false` so the controller throws 404.)
- `packages/domain/src/entities/__tests__/dos-donts-entry.test.ts` (validates the const tuples, type narrowing)
- `packages/domain/src/ports/__tests__/dos-donts-repository.test.ts` (validates port shape via type-only test mirroring Chunk A `brand-repository.test.ts`)
- `packages/domain/src/index.ts` (re-export — APPEND-ONLY)

### C-T2 — Domain: `BrandMetadata` entity + `BrandMetadataRepository` port

**Files:** parallel to C-T1.

- `packages/domain/src/entities/brand-metadata.ts`
- `packages/domain/src/ports/brand-metadata-repository.ts` (methods `findByBrandId`, `upsertByBrandId(input, brandId, editor: { editorUserId, ownerUserId })`)
- tests
- `packages/domain/src/index.ts` re-export

### C-T3 — Domain: `GuidelineSearchRepository` port + result types

**Files:**

- `packages/domain/src/ports/guideline-search-repository.ts` (one method: `searchByBrand({ brandId, query }): Promise<GuidelineSearchResult>`. Result type is the §6.5 envelope.)
- tests

### C-T4 — Validation: Zod schemas for D&D + Metadata + Search

**File:** `packages/validation/src/schemas/brand-guidelines.schema.ts`

Schemas (every field carries `.openapi({ description, example })`, every object is `.strict()`):

- `dosDontsTypeSchema = z.enum(DOS_DONTS_TYPES)`
- `dosDontsCategorySchema = z.enum(DOS_DONTS_CATEGORIES)`
- `createDosDontsEntrySchema` — `{ type, category, ruleText (min 1, max 4000), exampleText (max 4000, nullish) }`
- `updateDosDontsEntrySchema` — same fields as create, all `.optional()` (PATCH semantics)
- `dosDontsEntryResponseSchema` — `{ id, brandId, type, category, ruleText, exampleText (nullable), createdAt, updatedAt }`
- `dosDontsListQuerySchema` — `{ type?: dosDontsTypeSchema, category?: dosDontsCategorySchema }` (`.strict()` rejects unknown query keys)
- `dosDontsListResponseSchema` — `{ items: dosDontsEntryResponseSchema[] }`
- `upsertBrandMetadataSchema` — `{ tags?: z.array(z.string().min(1).max(80)).max(64).optional() }`
- `brandMetadataResponseSchema` — `{ brandId, ownerUserId, lastUpdatedAt, lastUpdatedByUserId, tags: string[], createdAt, updatedAt }`
- `guidelineSearchQuerySchema` — `{ q: z.string().max(200).optional() }` (`.strict()`; empty / absent → empty groups)
- `guidelineSearchSectionSchema = z.enum(['voice', 'visual', 'dos-and-donts', 'metadata'])`
- `guidelineSearchItemSchema` — `{ id, sectionTitleKey, matchedFieldKey, fragment (max 200), href }`
- `guidelineSearchGroupSchema` — `{ section, items: guidelineSearchItemSchema[] }`
- `guidelineSearchResponseSchema` — `{ query, brandId, groups: guidelineSearchGroupSchema[] }`

**File:** `packages/validation/src/index.ts` — APPEND-ONLY re-exports.

**Tests:** `packages/validation/src/schemas/__tests__/brand-guidelines.schema.test.ts` — every field min/max/missing/unknown-key/whitespace boundary mirrors Chunk A `brand.schema.test.ts`. Cover `.strict()` rejection of every schema.

### C-T5 — Database: Prisma models + migration

Files per §7. Tests live in `packages/database/__tests__/` if any (Prisma schema unit-test pattern — match what already exists for CompanyInfo / Brand).

Migration smoke: `pnpm db:migrate -- --name add_brand_guidelines` from inside the worktree. Bridge applies automatically. Verify with `pnpm stack:debug`.

### C-T6 — Backend module skeleton

**Files:**

- `apps/api/src/modules/brand-guidelines/brand-guidelines.module.ts` — declares all three controllers + repositories + pipes + tokens
- `apps/api/src/modules/brand-guidelines/index.ts` — barrel
- module test (mirror `brand.module.test.ts` — verify provider tokens resolve)

**Wiring:** `BrandGuidelinesModule` imports `AuthTokenService` + `JwtAuthGuard` providers locally (same shape as `BrandModule`). Provides `BRAND_GUIDELINES_PRISMA_CLIENT` → `prisma` from `@sfx/database`. Provides `DOS_DONTS_REPOSITORY` → `DosDontsPrismaRepository`, `BRAND_METADATA_REPOSITORY` → `BrandMetadataPrismaRepository`, `GUIDELINE_SEARCH_REPOSITORY` → `GuidelineSearchPrismaRepository`. Registers all three controllers + all five pipes.

**`apps/api/src/app.module.ts`** — APPEND-ONLY import + `imports: [..., BrandGuidelinesModule]`.

### C-T7 — Backend: `DosAndDontsController`

**Controller path:** `/api/v1/brands/:brandId/guidelines/dos-and-donts` (mounted under nested controller path `brands/:brandId/guidelines/dos-and-donts`; global prefix `api/v1` is set in `main.ts`).

**Endpoints:**

| Method | Path | Status (success) | Notes |
|---|---|---|---|
| GET | `/` | 200 | list filtered by `?type` + `?category` |
| POST | `/` | 201 | create one entry; `@ResourceCaptures({ fromPath: 'id', resource: 'dosDontsEntry', pathParam: 'entryId' })` |
| PATCH | `/:entryId` | 200 | partial update; 404 if missing in this brand |
| DELETE | `/:entryId` | 204 | hard delete (no soft-delete on D&D — rationale: rows are admin-managed editorial content, not user data; deletion intent is explicit) |

**Brand existence check:** every method calls `BrandRepository.findActiveById(brandId)` first and throws `NotFoundException('Brand not found')` on `null`. **Injection:** `@Inject(BRAND_REPOSITORY)` from `@sfx/api`'s brand module token — exported from `apps/api/src/modules/brand/data/repositories/brand.tokens.ts`. This is a cross-module read-only dependency (allowed by Clean Architecture; controllers may consume sibling repository ports through their own injection tokens). If the brand-tokens file does not export the symbol publicly yet, the appropriate action is to mail the lead — DO NOT add an export to `brand.tokens.ts`. (Tokens file currently exports `BRAND_REPOSITORY` already — confirmed.)

Alternative: inject the `BrandRepository` through a sub-class adapter inside `brand-guidelines.module.ts` (Provider with `useExisting`). Builder picks based on what the gate accepts.

**Declaration checklist per endpoint:**

- `@UseGuards(JwtAuthGuard)` + `@AuthRoles(AUTH_ROLE_ADMIN)` at class level.
- `@ApiBearerAuth('accessToken')` at class level.
- `@ApiTags('brand-guidelines')` at class level.
- `@ApiOperation({ summary, description })` per method (description for GET notes the no-pagination rationale).
- `@ApiParam({ name: 'brandId', type: String, description: 'Brand identifier' })` + `@ApiParam({ name: 'entryId', type: String, description: 'D&D entry identifier' })` where applicable.
- `@ApiQuery({ name: 'type', required: false, type: String, description, enum: [...] })` + `@ApiQuery({ name: 'category', required: false, type: String, description, enum: [...] })`.
- `@ApiResponse` set per endpoint: GET → 200/400/401/403/404; POST → 201/400/401/403/404; PATCH → 200/400/401/403/404; DELETE → 204/401/403/404.
- `@ApiBody(zodApiBody(createDosDontsEntrySchema, 'CreateDosDontsEntryInput'))` on POST; `@ApiBody(zodApiBody(updateDosDontsEntrySchema, 'UpdateDosDontsEntryInput'))` on PATCH.
- POST: `@ResourceCaptures({ fromPath: 'id', resource: 'dosDontsEntry', pathParam: 'entryId' })`.

**Tests:** unit (controller with mocked repo + brand repo) + integration (against real PG, mirror `brand.integration-test.ts` structure with `buildTestAuthGuard`).

### C-T8 — Backend: `BrandMetadataController`

**Controller path:** `/api/v1/brands/:brandId/guidelines/metadata`

**Endpoints:**

| Method | Path | Status | Notes |
|---|---|---|---|
| GET | `/` | 200 | returns the singleton, auto-creating an empty row on first read (no separate POST) |
| PUT | `/` | 200 | upsert tags; sets `lastUpdatedByUserId = req.user.subject`, `lastUpdatedAt = now()`; preserves `ownerUserId` from the parent brand |

**Brand existence check:** same as C-T7.

**Auto-create semantics:** GET upserts an empty row if missing. PUT also upserts. The repository performs both inside a single transaction; the controller is thin. The auto-created `ownerUserId` is read from `BrandRepository.findActiveById(brandId).ownerUserId` (which is the brand creator from Chunk A).

**Declarations:** parallel to C-T7. PUT body: `@ApiBody(zodApiBody(upsertBrandMetadataSchema, 'UpsertBrandMetadataInput'))`. PUT response set: 200/400/401/403/404.

### C-T9 — Backend: `GuidelineSearchController`

**Controller path:** `/api/v1/brands/:brandId/guidelines/search`

**Endpoint:**

| Method | Path | Status | Notes |
|---|---|---|---|
| GET | `/?q=<query>` | 200 | echoes query, returns grouped results scoped to brandId |

**Brand existence check:** same as C-T7.

**Empty query:** `q` absent or empty after trim → 200 with `{ query: '', brandId, groups: [] }` — no DB hits.

**Search algorithm:** `GuidelineSearchPrismaRepository.searchByBrand` runs four parallel queries (only the ones whose Prisma model exists per §6.5 graceful no-op):

1. `dos_donts_entry` → `ILIKE` on `rule_text` OR `example_text` scoped to `brandId`, build items with `section: 'dos-and-donts'` + href `?subsection=dosAndDonts#entry-<id>`.
2. `brand_metadata` → check if `tags` array contains any element matching `ILIKE %q%` (Postgres `EXISTS (SELECT 1 FROM unnest(tags) AS t WHERE t ILIKE $1)`). Single item, href `?subsection=metadata`.
3. `brand_voice` (if model exists — Chunk B) → `ILIKE` on `tone` OR `writing_style_rules`. href `?subsection=brandVoice`.
4. `visual_identity` (if model exists — Chunk B) → `ILIKE` on `logo_usage` OR `spacing_guidance` OR `image_style_guidance` OR `iconography_guidance` OR `usage_restrictions`. href `?subsection=visualIdentity`.

`fragment` is built by truncating the matched column to ±100 chars around the first hit index. If the column is shorter than 200 chars, return the whole column trimmed.

**Declarations:** `@ApiQuery({ name: 'q', required: false, type: String, description: 'Search query (max 200 chars)' })`. Response set: 200/400/401/403/404.

**Tests:** unit (mocked Prisma client returning fake rows) + integration (real PG, seeded D&D + Metadata rows; verify scoping to brandId; verify cross-brand isolation; verify empty-query returns empty groups; verify ILIKE matches `Don't` and `Do` correctly).

### C-T10 — `mx-3bf156` carve-out execution

Builder writes the per-task flow file (§13) which triggers the probe. If the probe emits `RESOURCE_CAPTURE_PATHPARAM_UNDECLARED` for `brandId`, append a tuple to `brand.controller.ts`'s existing `@ResourceCaptures` on `createBrand`:

```ts
// BEFORE
@ResourceCaptures({ fromPath: 'id', resource: 'brand', pathParam: 'id' })

// AFTER (append-only — both tuples stay)
@ResourceCaptures(
  { fromPath: 'id', resource: 'brand', pathParam: 'id' },
  { fromPath: 'id', resource: 'brand', pathParam: 'brandId' },
)
```

**No other change to `brand.controller.ts`.** If the diagnostic does not appear, leave the file untouched.

---

## 9. Frontend tasks (TDD breakdown)

### C-T11 — Data layer: D&D remote calls + repository hook

**Files:**

- `data/remote/fetch-dos-and-donts.ts` (GET, accepts `{ brandId, type?, category? }`)
- `data/remote/create-dos-donts-entry.ts` (POST)
- `data/remote/update-dos-donts-entry.ts` (PATCH)
- `data/remote/delete-dos-donts-entry.ts` (DELETE)
- `data/model/dos-donts-entry-data-model.ts` (mirror server envelope)
- `data/mapper/map-to-dos-donts-entry.ts` (data-model → domain entity)
- `data/repositories/use-dos-and-donts-repository.ts` (React Query — `useQuery` for list with `{ brandId, type, category }` cache key, three mutations + `invalidateQueries({ queryKey: DOS_DONTS_QUERY_KEY(brandId) })` after each)
- tests for every file (90%+)

Use `executeRequest()` from the existing networking layer (ADR-002). Query key in `constants.ts`:

```ts
export const DOS_DONTS_QUERY_KEY = (brandId: string): readonly unknown[] => ['brand-guidelines', 'dos-and-donts', brandId] as const;
```

### C-T12 — Data layer: Metadata remote calls + repository hook

Parallel to C-T11 — `fetch-brand-metadata.ts`, `update-brand-metadata.ts` (PUT). Query key `(brandId) => ['brand-guidelines', 'metadata', brandId]`.

### C-T13 — Data layer: Search remote call + repository hook

`fetch-guideline-search.ts` (GET). Query key `(brandId, q) => ['brand-guidelines', 'search', brandId, q]`. Hook keeps results until the brand or query changes. Empty query short-circuits to `{ groups: [] }` without firing the request (saves a round-trip).

### C-T14 — `SearchBar` + `SearchResultsPanel`

**SearchBar:**

- Controlled input + debounced (300ms) `onChange` that updates `searchQuery` state in `use-brand-guidelines-detail.ts`.
- Clears on brand-switch (effect on `props.brandId` change).
- Localization key: `admin.brandGuidelines.search.placeholder`.

**SearchResultsPanel:**

- Renders only when `searchQuery !== ''`.
- Receives `uiModel: { isLoading, error, groups }` from the page hook via the existing UIModel pattern.
- Loading state: skeleton (4 grouped section skeletons).
- Error state: inline error card.
- Empty state (`groups.every(g => g.items.length === 0)` and not loading): translation key `admin.brandGuidelines.search.empty`.
- Each group renders its section title + a list of items. Each item is a `<Link>` (Next.js) whose `href` is `item.href`. Clicking navigates within `/admin/brand-guidelines/<brandId>` with the appropriate query string + hash. The brand-guidelines-detail page reads `useSearchParams().get('subsection')` and `window.location.hash` to scroll/highlight the matched entry.

**Deep-link contract:** `href` shape is `/admin/brand-guidelines/<brandId>?subsection=<subsectionId>#entry-<entryId>`. The page hook surfaces these as `activeSubsectionId` + `focusEntryId`, which the registry-rendered subsection components consume to scroll/highlight.

### C-T15 — `DosAndDontsList` component

Renders a header bar with two dropdowns (`Type` + `Category`) + a `+ Add entry` button. Below: list of entries, each with read mode (rule + example + meta) + an inline `Edit` / `Delete` affordance. Edit mode renders `DosAndDontsRowEditor`. Delete opens `DeleteDosDontsConfirm`.

**Filter state** is local component state; the parent page hook re-fetches via the repository whenever the filter changes (`useDosAndDontsRepository({ brandId, type, category })`).

**Empty state:** the existing translation pattern (`admin.brandGuidelines.dosAndDonts.emptyState.{ title, message }`) + the `+ Add entry` CTA.

**Add flow:** clicking `+ Add entry` opens an inline row at the top in edit mode with empty fields. Submit → POST + invalidate + close.

**Edit flow:** clicking `Edit` swaps that row to `DosAndDontsRowEditor`. Submit → PATCH + invalidate + close.

**Delete flow:** confirm dialog with the rule text excerpt. Confirm → DELETE + invalidate + close.

All three mutations fire success / failure toasts via the existing toast pattern. Pending state disables the trigger control and shows the existing loading indicator (saving / deleting label per Chunk A `RenameBrandDialog`).

### C-T16 — `MetadataForm` component

Renders:

- Owner display (read-only, from `metadata.ownerUserId`, label key `admin.brandGuidelines.metadata.owner`).
- Last-updated display (from `metadata.lastUpdatedAt` + `metadata.lastUpdatedByUserId`, formatted with the existing date locale helper).
- `ChipTagInput` — a chip-pattern editor: existing chips render as `<button>`-removable pills; an inline `<input>` accepts a new tag, `Enter` adds, `Backspace` on empty removes the last, click on chip's `×` removes. Max 64 tags (UI rejects further input + shows the validation message from `admin.brandGuidelines.metadata.validation.tooManyTags`). Tag length capped at 80 chars.
- `Save` button — disabled while pending. On Save: PUT `{ tags }` + invalidate + success toast.

`ChipTagInput` is the new primitive; implement it inside `MetadataForm/` directory (do not extract to a global shared component this chunk — premature abstraction).

### C-T17 — Sub-nav registry append

**File:** `apps/web/src/features/brand-shell/constants.ts` (APPEND-ONLY).

**Defer to B's shape.** B introduces `BRAND_GUIDELINES_SUB_NAV_REGISTRY` (type, `BrandGuidelinesSubNavId` union, `isActive` predicate). At C builder time, **if B has NOT landed**, builder MUST mail the lead with `--type question` describing the conflict and PAUSE before continuing. Do NOT invent the registry shape.

Assuming B's shape is the precedent set by Chunk A's `ADMIN_TAB_REGISTRY` (see `apps/web/src/features/admin-shell/constants.ts`), C's appends look like:

```ts
// hypothetical — confirm against B's actual shape at gate time
{
  id: 'dosAndDonts',
  labelKey: 'dosAndDonts',
  isActive: (subsectionParam) => subsectionParam === 'dosAndDonts',
},
{
  id: 'metadata',
  labelKey: 'metadata',
  isActive: (subsectionParam) => subsectionParam === 'metadata',
},
```

C also widens any type union (`BrandGuidelinesSubNavId` etc.) introduced by B to include `'dosAndDonts'` and `'metadata'`.

### C-T18 — `brand-guidelines-detail/index.tsx` integration

APPEND-ONLY changes:

- Mount `<SearchBar />` directly under the page heading + `<BrandProfileSelector />`, **above** the sub-nav body.
- Mount `<SearchResultsPanel />` between `<SearchBar />` and the registry-driven sub-nav body. Conditional: only renders when `searchQuery !== ''`.
- The registry-driven sub-nav body (mounted by B) maps `activeSubsectionId === 'dosAndDonts'` → render `<DosAndDontsList />`, `'metadata'` → render `<MetadataForm />`. C provides the components; B owns the switch / router. If B's router does not accept additional cases additively, mail the lead.

**`use-brand-guidelines-detail.ts`** gets APPEND-ONLY additions:

- `searchQuery` state + `setSearchQuery` setter (returned to the page).
- `useGuidelineSearchRepository({ brandId, q: searchQuery })` call (lazy on non-empty query).
- `focusEntryId` derived from `useSearchParams().get('focusEntry')` (optional; allows deep-link to scroll).

### C-T19 — Localization

Append keys to `apps/web/src/features/presentation/localization/languages/en/common.ts` and the matching `ro/common.ts`. Update `types.ts` to widen `CommonTranslations.adminBrandGuidelines`.

**Required EN keys (RO mirrors):**

```ts
adminBrandGuidelines: {
  // ... existing A keys ...
  dosAndDonts: {
    sectionTitle: "Dos & Don'ts",
    emptyState: {
      title: "No rules yet",
      message: "Add the first Do or Don't to begin defining brand rules.",
    },
    addCta: "+ Add entry",
    addingCta: "Adding…",
    columnHeaders: {
      type: "Type",
      category: "Category",
      ruleText: "Rule",
      exampleText: "Example",
    },
    typeOptions: { do: "Do", dont: "Don't" },
    categoryOptions: {
      tone: "Tone",
      vocabulary: "Vocabulary",
      visuals: "Visuals",
      legal: "Legal",
      'campaign-messaging': "Campaign messaging",
    },
    filters: {
      typeLabel: "Type",
      categoryLabel: "Category",
      allTypes: "All types",
      allCategories: "All categories",
    },
    fields: {
      type: { label: "Type" },
      category: { label: "Category" },
      ruleText: { label: "Rule", placeholder: "Always use the official wordmark in marketing." },
      exampleText: { label: "Example (optional)", placeholder: "e.g. social header banners" },
    },
    validation: {
      typeRequired: "Type is required",
      categoryRequired: "Category is required",
      categoryUnknown: "Unknown category",
      ruleTextRequired: "Rule text is required",
      ruleTextTooLong: "Rule text must be 4000 characters or fewer",
      exampleTextTooLong: "Example must be 4000 characters or fewer",
    },
    cta: {
      save: "Save",
      saving: "Saving…",
      cancel: "Cancel",
      edit: "Edit",
      delete: "Delete",
    },
    deleteConfirm: {
      title: "Delete entry?",
      bodyTemplate: "“{ruleFragment}” will be removed permanently.",
      confirmCta: "Delete",
      confirmingCta: "Deleting…",
      cancelCta: "Cancel",
    },
    toast: {
      addSuccess: "Entry added",
      updateSuccess: "Entry updated",
      deleteSuccess: "Entry deleted",
      unexpectedError: "Could not save changes. Try again.",
    },
  },
  metadata: {
    sectionTitle: "Metadata",
    owner: "Owner",
    lastUpdatedTemplate: "Last updated by {editor} on {date}",
    tagsLabel: "Tags",
    addTagPlaceholder: "Add a tag and press Enter",
    removeTagAriaTemplate: "Remove tag {tag}",
    validation: {
      tagTooLong: "Tags must be 80 characters or fewer",
      tooManyTags: "At most 64 tags",
    },
    cta: {
      save: "Save",
      saving: "Saving…",
    },
    toast: {
      saveSuccess: "Metadata saved",
      unexpectedError: "Could not save metadata. Try again.",
    },
  },
  search: {
    placeholder: "Search this brand…",
    empty: "No matches",
    sectionTitles: {
      voice: "Brand Voice",
      visual: "Visual Identity",
      'dos-and-donts': "Dos & Don'ts",
      metadata: "Metadata",
    },
    loadingAriaLabel: "Searching…",
    resultAriaTemplate: "{section}: {fragment}",
  },
},
```

**RO keys:** translator-equivalent (script-free Romanian, matching the existing convention of unaccented characters in `ro/common.ts` for ASCII safety).

**Sub-nav labels:** `admin.brandGuidelines.subnav.dosAndDonts` + `.metadata` — confirm B's actual key name at gate time. C writes both translations for whichever key shape B uses.

---

## 10. Backend integration tests (C-T20)

**Files:**

- `apps/api/src/modules/brand-guidelines/__integration__/setup-env.ts` (copy from `brand/__integration__/setup-env.ts`)
- `apps/api/src/modules/brand-guidelines/__integration__/dos-and-donts.integration-test.ts`
- `apps/api/src/modules/brand-guidelines/__integration__/brand-metadata.integration-test.ts`
- `apps/api/src/modules/brand-guidelines/__integration__/guideline-search.integration-test.ts`

**Test shape:** mirror `apps/api/src/modules/brand/__integration__/brand.integration-test.ts`. Use the same `buildTestAuthGuard` reflector pattern (x-test-role header) to drive admin / viewer / anonymous. Reset relevant tables in `beforeEach`. Use the brand `POST /api/v1/brands` flow to create a brand for each test rather than seeding raw rows (mirrors A pattern, ensures `ownerUserId` is set).

**Coverage targets:**

- **D&D:** every method × (401 unauth, 403 viewer, 404 unknown brandId, 400 bad body, happy path). For PATCH/DELETE also 404 unknown entryId. For GET also: filter by type narrows, filter by category narrows, combined narrows, no filter returns all.
- **Metadata:** GET (404 unknown brand, 200 happy = auto-created empty), PUT (401, 403, 404, 400 unknown body key, 200 happy, `lastUpdatedByUserId` set correctly), tags `[]` clears.
- **Search:** GET (401, 403, 404 unknown brand, 200 with q='' → empty groups, 200 with q='legal' returns D&D group containing a seeded `category:'legal'` entry, 200 cross-brand isolation = brand B's entry does NOT appear when searching brand A, 200 with q matching tag in metadata returns metadata group).

---

## 11. Frontend integration tests + qa-test (C-T21, C-T22)

### C-T21 — Frontend integration tests

**Files:**

- `apps/web/src/features/brand-shell/__integration__/dos-and-donts.integration-test.tsx`
- `apps/web/src/features/brand-shell/__integration__/brand-metadata.integration-test.tsx`
- `apps/web/src/features/brand-shell/__integration__/guideline-search.integration-test.tsx`

Use MSW to intercept REST calls against the per-test base URL. Render the `BrandGuidelinesDetailPage` in a test harness (existing Chunk A `brand-shell.integration-test.tsx` shows the pattern). Cover:

- D&D — add a row, see it appear; edit a row, see updated text; delete confirms and removes; filters narrow.
- Metadata — type a tag + Enter, chip appears; remove a chip, chip disappears; Save fires PUT + success toast.
- Search — type a query, see grouped results render; click an item, navigation handler fires with the expected href (per `NavigationHandler` pattern, assert `navigationTarget` state); empty query closes the panel; switching brand resets the query.

### C-T22 — qa-test full mode

Per the existing project gate (qa-test full mode at builder close), exercise the four golden paths in browser:

1. Add a Do entry with category vocabulary, restricted tone, see it persist on reload.
2. Add a Don't entry, then filter `Type=Don't` + `Category=vocabulary`, see only matching rows.
3. Edit then delete a row; both produce success toasts and update the list.
4. Search `voice`, see grouped results; click a D&D result; verify navigation to the D&D subsection with the entry scrolled into view.
5. Edit metadata: add 3 tags + Save, refresh, see all 3 persisted.
6. Switch brand profile mid-search; verify the search input clears and the new brand's bodies load.

---

## 12. Forward-compat with Chunk D + Chunk E

### D (Versioning)

Every D&D POST / PATCH / DELETE + every Metadata PUT must write a `BrandGuidelinesVersion` row in the same transaction once Chunk D ships. C does NOT write that code; C's repository methods MUST be wrapped in `this.prisma.$transaction` so D can append the version write inside the same TX without restructuring. **Concrete builder instruction:** every mutating repository method in C uses `await this.prisma.$transaction(async (tx) => { … })` even when the transaction currently holds a single query. D's builder appends `tx.brandGuidelinesVersion.create({ … })` inside each block.

### E (Agent role + audit log)

C ships every read endpoint with `@AuthRoles(AUTH_ROLE_ADMIN)` only. Chunk E rewires every read endpoint to accept `@AuthRoles(AUTH_ROLE_ADMIN, AUTH_ROLE_AGENT)`. C MUST NOT pre-add a placeholder agent role nor any audit-log interceptor. C MUST keep the response envelope shape compatible with Chunk E's `versionId` field addition — i.e. C does not enforce `.strict()` on the response envelope at the controller serialization layer (Zod `.strict()` is on the request schemas; response goes through the `TransformInterceptor` envelope and does not validate the inner data shape).

---

## 13. Per-task flow file

**File:** `.overstory/runtime-contract.flows/sfx-webapp-boilerplate-e554.json`

`owns`: `dosDontsEntry` and `brandMetadata` resources. `extends`: `anonymous`, `admin`, `viewer`, `brand` (Chunk A).

**Resource declarations:**

```json
"resources": [
  { "name": "dosDontsEntry", "kind": "crud",
    "create": {
      "method": "POST",
      "path": "/brands/${brandId}/guidelines/dos-and-donts",
      "body": { "type": "do", "category": "vocabulary", "ruleText": "Probe Rule" },
      "requires": ["brand"]
    },
    "capture": { "bindings": { "entryId": "$.data.id" } }
  },
  { "name": "brandMetadata", "kind": "endpoint" },
  { "name": "guidelineSearch", "kind": "endpoint" }
]
```

**Special flows to author (curated, not bootstrap):**

- `e554:dos-donts-list-unauth-rejected` — GET no bearer → 401
- `e554:dos-donts-list-non-admin-forbidden` — GET viewer → 403
- `e554:dos-donts-list-admin-empty-ok` — GET admin on empty → 200 `{ items: [] }`
- `e554:dos-donts-list-unknown-brand-404`
- `e554:dos-donts-create-unauth-rejected` / `-non-admin-forbidden` / `-bad-body-400` / `-unknown-category-400` / `-unknown-brand-404` / `-admin-ok`
- `e554:dos-donts-patch-unauth` / `-non-admin` / `-unknown-brand-404` / `-unknown-entry-404` / `-admin-ok`
- `e554:dos-donts-delete-unauth` / `-non-admin` / `-unknown-brand-404` / `-unknown-entry-404` / `-admin-ok-204`
- `e554:dos-donts-filter-by-type` (create do + dont, list with `?type=dont`, expect only the dont)
- `e554:dos-donts-filter-by-category` (parallel)
- `e554:dos-donts-filter-combined`
- `e554:metadata-get-unauth-rejected` / `-non-admin` / `-unknown-brand-404` / `-admin-auto-creates-200`
- `e554:metadata-put-unauth` / `-non-admin` / `-unknown-brand-404` / `-admin-tags-set-200` / `-admin-tags-clear-200` / `-admin-bad-body-400` / `-admin-unknown-key-400`
- `e554:search-get-unauth` / `-non-admin` / `-unknown-brand-404` / `-empty-query-200-empty-groups` / `-admin-finds-d-and-d-200` / `-admin-finds-metadata-tag-200` / `-cross-brand-isolation-200`

**Pattern reference:** mirror `.overstory/runtime-contract.flows/sfx-webapp-boilerplate-3e6a.json` (Chunk A) for step shape. Use `chain:resource-setup` for flows that need a brand + a D&D entry pre-seeded.

**No `bootstrap:openapi:*` sources.** Every flow's `contract.source` references this spec (`spec-e554 §1 J4` / `§1 J5` / `§5 cross-cutting`) — curated, not bootstrapped.

---

## 14. Self-check (verified by scout before publish)

1. Every C1-C4 sub-feature from parent ba09 §3 has at least one corresponding task above. ✓
2. Every J4 + J5 acceptance statement from ba09 §5 is in §1 Runtime acceptance. ✓
3. mx-3bf156 carve-out wording verbatim in §3 + §5. ✓
4. Sub-nav registry append-only; B's shape deferred to with mail-the-lead fallback. ✓
5. Auth preserved — no Keycloak/oauth2-proxy/RS256 change. Chunk E carve-out documented. ✓
6. Pagination decision documented (D&D = no pagination, justified). ✓
7. ILIKE vs to_tsvector decision documented with rationale + future-migration trigger. ✓
8. Every endpoint declares the full `@ApiResponse` set + `@ApiBearerAuth` + `@UseGuards` + `@AuthRoles`. ✓
9. Every Zod field declares `.openapi()`; every `@ApiProperty` declares `type:`; every constructor param has `@Inject(TOKEN)`. ✓
10. POST handler declares `@ResourceCaptures` for downstream chunks. ✓
11. PATCH 404 path protected via `@ApiBody(zodApiBody(...))` per mulch mx-967e12. ✓
12. Forward-compat with Chunk D (every mutation in `$transaction`) + Chunk E (no premature agent-role wiring) documented. ✓
13. Localization keys EN + RO match, parallel structure. ✓
14. Flow file enumerates every status branch for every endpoint. ✓
15. No layer-named chunks; every task is a user-capability slice. ✓

---

## 16. Chunk B coordination — confirmed at publish time (READ FIRST AT GATE)

Chunk B's spec `.overstory/specs/sfx-webapp-boilerplate-72fd.md` published before this file. Below is the **exact** shape Chunk C must append to. If B's builder lands the same shape, the §9 / §17 references resolve. If B diverges (e.g. renames the registry, adds required fields), mail the lead — **do not** rewrite C's spec to match a phantom registry.

**Registry interface (from B §B-F1):**

```ts
// apps/web/src/features/brand-shell/constants.ts (B ships this)
export interface BrandGuidelinesSubNavEntry {
  readonly id: string;
  readonly labelKey: 'voice' | 'visual' | 'dosAndDonts' | 'metadata';
  readonly slot: number;
}

export const BRAND_GUIDELINES_SUB_NAV_REGISTRY: readonly BrandGuidelinesSubNavEntry[] = [
  { id: 'voice', labelKey: 'voice', slot: 10 },
  { id: 'visual', labelKey: 'visual', slot: 20 },
] as const;
```

**C's append (slot ≥ 30 per B's contract):**

```ts
// APPEND-ONLY in apps/web/src/features/brand-shell/constants.ts
export const BRAND_GUIDELINES_SUB_NAV_REGISTRY: readonly BrandGuidelinesSubNavEntry[] = [
  { id: 'voice', labelKey: 'voice', slot: 10 },
  { id: 'visual', labelKey: 'visual', slot: 20 },
  { id: 'dosAndDonts', labelKey: 'dosAndDonts', slot: 30 },   // C
  { id: 'metadata', labelKey: 'metadata', slot: 40 },         // C
] as const;
```

**Builder C MUST NOT:**

- Modify the `BrandGuidelinesSubNavEntry` interface.
- Modify the existing two entries.
- Change slot ordering.
- Introduce additional slots between 30 / 40.

**URL section-state convention (from B §B-F6):** B's `BrandGuidelinesSubNav` reads `useSearchParams().get('section')`. C's deep-link `href` shape — adjust §1 J5 + §9 C-T14 to use `?section=` (not `?subsection=`). Concrete pattern:

```
/admin/brand-guidelines/<brandId>?section=dosAndDonts#entry-<entryId>
/admin/brand-guidelines/<brandId>?section=metadata
```

**Subsection body render (from B §B-F6):** B's `map-to-brand-guidelines-sub-nav-ui-model.ts` iterates the registry sorted by `slot` and selects the body component by `entry.id`. B's mapper renders placeholders `<section>{labels.placeholderComingNextChunk}</section>` for `dosAndDonts` + `metadata` until C lands. C replaces those placeholders by extending the mapper's switch:

- `id === 'dosAndDonts'` → render `<DosAndDontsList brandId={activeBrandId} focusEntryId={focusEntryId} />`
- `id === 'metadata'` → render `<MetadataForm brandId={activeBrandId} />`

This requires C to add a switch case to `map-to-brand-guidelines-sub-nav-ui-model.ts`. **That file is in B's FILE_SCOPE per its §1080-1081 register**, not C's. C must mail the lead with `--type flow_update` if the file can't be modified additively, OR — preferred — coordinate by passing the body components into the sub-nav via props (B's component accepts a `bodyOverrides?: Record<entryId, ReactNode>` prop wired at the page level). Concretely:

> **Builder C action at gate time:** Read `apps/web/src/features/brand-shell/presentation/components/BrandGuidelinesSubNav/map-to-brand-guidelines-sub-nav-ui-model.ts`. If B's mapper has a `bodyOverrides` slot or accepts injected body components, use that. If not, mail the lead with `--type flow_mismatch` quoting the file path and the two body components C needs to mount — do NOT edit the mapper.

**Localization sub-nav keys (from B §B-F1 sibling sections — confirm at gate time):** B uses `common.adminBrandGuidelines.subNav.<labelKey>`. C MUST append `dosAndDonts` and `metadata` keys under `subNav`. Update §9 C-T19 EN snippet to include:

```ts
adminBrandGuidelines: {
  // ... existing A + B keys ...
  subNav: {
    // existing voice + visual from B
    dosAndDonts: "Dos & Don'ts",
    metadata: "Metadata",
  },
  // ... rest of C's keys ...
}
```

(C also keeps the `dosAndDonts.sectionTitle` + `metadata.sectionTitle` keys from §9 C-T19 — those are body-internal headings, separate from sub-nav labels.)

**Endpoint constants pattern (from B §B-F1):** B uses factory functions for path-bound brandIds, e.g. `brandGuidelinesVoiceEndpoint(brandId)`. C MUST follow the same pattern:

```ts
export const dosAndDontsEndpoint = (brandId: string): string =>
  `api/v1/brands/${brandId}/guidelines/dos-and-donts`;
export const dosAndDontsEntryEndpoint = (brandId: string, entryId: string): string =>
  `${dosAndDontsEndpoint(brandId)}/${entryId}`;
export const brandMetadataEndpoint = (brandId: string): string =>
  `api/v1/brands/${brandId}/guidelines/metadata`;
export const guidelineSearchEndpoint = (brandId: string): string =>
  `api/v1/brands/${brandId}/guidelines/search`;
```

Query-key factories (parallel to B's `brandVoiceQueryKey(brandId)`):

```ts
export const dosAndDontsQueryKey = (brandId: string, filters?: { type?: string; category?: string }) =>
  ['brand-guidelines', 'dos-and-donts', brandId, filters?.type ?? null, filters?.category ?? null] as const;
export const brandMetadataQueryKey = (brandId: string) =>
  ['brand-guidelines', 'metadata', brandId] as const;
export const guidelineSearchQueryKey = (brandId: string, query: string) =>
  ['brand-guidelines', 'search', brandId, query] as const;
```

This supersedes the placeholder query-key shape in §9 C-T11 + C-T12 + C-T13.

---

## 17. References

- `.overstory/specs/sfx-webapp-boilerplate-ba09.md` — parent product plan (§3 Chunk C, §5 J4 + J5, §5 cross-cutting).
- `.overstory/specs/sfx-webapp-boilerplate-3e6a.md` — Chunk A reference (file conventions, integration-test pattern, declaration-driven contract).
- `.overstory/specs/sfx-webapp-boilerplate-72fd.md` — Chunk B (read at builder gate time for `BRAND_GUIDELINES_SUB_NAV_REGISTRY` shape).
- `apps/api/src/modules/brand/` — Chunk A code (controller / DTO / pipe / repository / integration test patterns).
- `apps/api/src/modules/company-info/` — Phase-2 reference for transactional upsert + cursor pagination (the latter NOT used by C per §6.4).
- `apps/web/src/features/brand-shell/` — Chunk A frontend feature; C extends in place.
- `packages/database/prisma/schema.prisma` — Chunk A's `Brand` model is the FK target.
- `packages/validation/src/openapi.ts` — `zodApiBody` + `zodToOpenApi` helpers (use, do not modify).
- Mulch records: `mx-322b8e` (PrismaClient via `@sfx/database`), `mx-4c1538` (AppConfigModule env in module tests), `mx-967e12` (zodApiBody for 404 reach), `mx-c5fb1a` (tombstone slug — N/A here), `mx-6d88ea` (trust the bridge for migrations), `mx-3bf156` (parent-controller carve-out), `mx-foundational-protocol` (`x-cursor-invalid-behavior: empty-200` — N/A here per §6.4).
