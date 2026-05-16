<!-- written-by: scout-content-check -->
# F2 content-check — feature spec

**Task:** `sfx-webapp-boilerplate-a051` (feature 2 of 2, parent plan `sfx-webapp-boilerplate-bc83` — brand-guidelines part 2/3).
**Sibling feature:** F1 `dos-and-donts` (`sfx-webapp-boilerplate-34c3`). F2 is the read-only downstream of F1's `GET /api/v1/brands/:brandId/dos-and-donts?category=<enum?>`. F2 builds AFTER F1 merges; this spec is authored against F1's spec (`.overstory/specs/sfx-webapp-boilerplate-34c3.md`), NOT against F1 code (which does not exist on master yet).
**Part-1 predecessors (merged to master):** F1-part1 brand-profile (`sfx-webapp-boilerplate-b859`), F2-part1 brand-voice (`sfx-webapp-boilerplate-6fba`), F3-part1 visual-identity (`sfx-webapp-boilerplate-cfeb`). Active-brand store + selector ship from part 1 (`apps/web/src/stores/active-brand-store.ts`, `apps/web/src/features/app-shell/presentation/components/ActiveBrandSelector/`).
**Scope of THIS spec:** F2 only — `/content-check` page + form + result list, new `Content check` global left-nav entry, new `contentCheckFormSchema` Zod validator in `@sfx/validation`, thin page wrapper at `apps/web/src/app/content-check/page.tsx`, additive edit to `AppShell` UIModel mapper to register the global nav entry.
**Out of scope:** ANY new API endpoint (F2 is frontend-only — no NestJS module, no controller, no repository, no Prisma model, no migration). AI / scoring / content matching (part 3). Cross-category search, full-text, version history, agent retrieval API (part 3). Modifying F1's wire shape, the F1 `?category=` filter behaviour, or the F1 enum values. F1 territory `apps/api/src/modules/dos-and-donts/**` and `apps/web/src/features/dos-and-donts/**` are CONSUMED ONLY (F2 imports F1's hooks + constants + types).

**Auth (binding, verbatim from operator dispatch):** Keycloak + oauth2-proxy + RS256/JWKS is the ONLY auth mechanism. Builder MUST NOT modify `apps/api/src/modules/auth/**`, `apps/api/src/common/auth/**`, `apps/api/src/common/guards/jwt-auth.guard.ts`, `apps/api/src/common/decorators/auth-roles.decorator.ts`, or `apps/web/src/features/auth/**`. No `/login`, `/register`, email+password, or HS256 cookie auth. No `OAUTH_*` env var removed, renamed, or added.

**Dependency on F1 dos-and-donts:** F2 imports the following from `@/features/dos-and-donts` (published by F1 — F2 MUST NOT redeclare any of them):
- `useDosAndDontsRepository(brandId, category?)` — React Query hook returning the mapped list (F1 spec §6 "data/repositories"). Category arg is part of the query key so F2's filtered call shares cache with any F1-side fetch.
- `dosAndDontsListQueryKey(brandId, category?)` — for cross-feature invalidation parity (F2 does not mutate; this is read-only insurance).
- `DOS_AND_DONT_CATEGORY_VALUES` + type `DosAndDontCategory` — re-exported from `@sfx/validation` via the F1 feature barrel.
- `DosAndDontEntry` domain type from `@sfx/domain` (the mapped UI-side entity).
- F1's grouping helper `group-entries.ts` (F1 spec §6 "presentation/components/DosAndDontsCard/group-entries.ts") IF F1 exports it from the feature barrel. If F1 keeps it as a private co-located helper, F2 authors its own grouping helper under `apps/web/src/features/content-check/presentation/helpers/group-entries.ts` — same shape, separate copy is acceptable (this is the only permitted duplication, and ONLY if F1's helper is not exported).

**Dependency on active-brand store:** F2 reads `useActiveBrandStore((state) => state.activeBrandId)` from `apps/web/src/stores/active-brand-store.ts` (part-1). F2 MUST NOT mutate the store, MUST NOT add new keys to it, MUST NOT introduce a new persistence shape. Selector-style reads only.

---

## 1. User-visible behaviour (what the probe will assert)

### Pages (URLs are exact)

| URL | Purpose | Empty-state / branch |
|---|---|---|
| `/content-check` | Manual content-check screen (J4) inside `<AuthGate><AppShell>`. Renders: (a) a read-only header naming the active brand; (b) a multi-line `Paste content to check` textarea (LOCAL component state — never sent to the server); (c) a category single-select with the five `DOS_AND_DONT_CATEGORY_VALUES` plus an `All categories` option (empty-string sentinel `''`); (d) a `[Check content]` CTA; (e) a result block below the form. | When unauthenticated: `AuthGate` redirects to oauth2-proxy login (existing chain — no new redirect logic in F2). When authenticated but `useActiveBrandStore().activeBrandId === null`: render the **no-active-brand** empty state with section title `Content check`, copy `Pick a brand to start checking your content against its dos and don'ts.`, and a `[Pick a brand]` CTA → `/`. When `activeBrandId` is present but F1's `GET /api/v1/brands/<activeBrandId>/dos-and-donts?category=<sel?>` returns `data: []`: render the **zero-matches** empty state with copy `No dos or don'ts match this category yet — go to <brand-name> to add one.` and a `[+ Add do/don't]` CTA → `/brands/<activeBrandId>` (so the user lands on the F1 brand-overview card). When F1 returns 404 (active brand was deleted out-of-band): render the **brand-not-found** branch with copy `Active brand is no longer available.` and a `[Pick a brand]` CTA → `/`, plus a `useEffect` that calls `useActiveBrandStore().clear()` to drop the stale id. |

The page is intentionally NOT scoped under `/brands/<id>/...` — it reads the active brand from the store so users can switch via the existing top-bar `ActiveBrandSelector` without leaving the page. Switching brands re-fires F1's `useDosAndDontsRepository` because `brandId` is part of the React Query key.

### Global nav addition

A new top-level left-nav entry `Content check` linking to `/content-check`. Visible whenever the user is authenticated, regardless of route — i.e. NOT gated on `pathBrandId`. Implementation: extend `apps/web/src/features/app-shell/presentation/components/AppShell/map-to-app-shell-ui-model.ts` so `leftNavItems` is ALWAYS populated with the `content-check` entry as item 0, and the existing per-brand entries (`overview`, `brand-voice`, `visual-identity`) are appended ONLY when `pathBrandId !== null` (preserves current behaviour). `<AppShell>` already renders `LeftNav` whenever `leftNavItems` is non-null (`index.tsx` L28-30); the render path needs no change beyond the mapper. The TopBar / brand selector / sign-out chain is UNCHANGED.

### J4 — manual content check (verbatim from bc83.md §1)

1. Authenticated brand manager with an active brand selected (the part-1 selector set it).
2. Click the global **Content check** nav item → routes to `/content-check`.
3. Page renders the active-brand header, `Paste content to check` textarea, category select (five values + `All categories`), `[Check content]` CTA.
4. User pastes any text (LOCAL state only, never sent), picks a category (or `All`), clicks `[Check content]`.
5. F2 calls `useDosAndDontsRepository(activeBrandId, mappedCategory)` where `mappedCategory = formCategory === '' ? undefined : formCategory`. `GET /api/v1/brands/<activeBrandId>/dos-and-donts?category=<enum?>` returns 200 + `{ success: true, data: DosAndDontEntry[] }` per F1 spec §2.
6. Result list renders below the form, grouped first by `category` then by `type` (Do / Don't) — same shape F1's `DosAndDontsCard` uses, so the user sees the same layout they see on the brand page. Each row: `title` + `body` (preserve newlines via `whitespace-pre-wrap`) + `suggestedCorrection` (when non-null, rendered under a `Suggested correction` sub-label).
7. The pasted text is echoed back as a read-only `Reference text` block ABOVE the result list — preserves the visual reminder of what the user is checking, but is purely client-side decoration. It is NOT analysed, NOT scored, NOT labelled. Part 3 lands the AI scoring.

### Authentication boundary (mirrors bc83.md §5)

- Unauthenticated visitor hitting `/content-check` is redirected by the existing `AuthGate` to oauth2-proxy login. F2 adds NO new redirect path, NO new `/login` / `/register` route, NO new env var.
- A logged-in user who refreshes `/content-check` stays logged in. Session persistence is unchanged from part-1.
- A logged-in user who logs out via the TopBar sign-out and then revisits `/content-check` is redirected by `AuthGate` (existing chain).

### Cross-cutting (mirrors bc83.md §5)

- F2 mutates NOTHING. There are NO React Query invalidations in F2.
- F1 / F2-part1 / F3-part1 / F1-dos-and-donts endpoints continue to pass their existing flow files. F2's diff is frontend-only and additive.

---

## 2. Runtime acceptance criteria

These are the behaviours the runtime probe will assert. F2 has NO new API surface, so all probe assertions are page-level + the F1 GET wire-shape consumption.

### Page-level (probe via Logical App Contract — overlay page tokens optional)

| Actor state | URL | Expected outcome |
|---|---|---|
| unauthenticated | `/content-check` | 3xx redirect to login (existing `AuthGate` chain). |
| authenticated + no active brand | `/content-check` | 2xx render with the **no-active-brand** empty state visible; `[Pick a brand]` link points to `/`. No network call to `/api/v1/brands/:brandId/dos-and-donts`. |
| authenticated + active brand exists + brand has zero entries | `/content-check` | 2xx render; F2 issues `GET /api/v1/brands/<activeBrandId>/dos-and-donts` (no `?category=` when select left at `All categories`); F1 returns 200 + `data: []`; F2 renders the **zero-matches** empty state with `[+ Add do/don't]` CTA → `/brands/<activeBrandId>`. |
| authenticated + active brand exists + brand has entries + category=All | `/content-check` after click | F2 GET → 200 + `data: DosAndDontEntry[]` covering all five categories; F2 renders grouped list. |
| authenticated + active brand exists + category=tone | `/content-check` after picking `tone` + click | F2 GET with `?category=tone` → 200 + filtered `data`; F2 renders grouped list (single category group, two sub-groups when both Do + Don't present). |
| authenticated + active brand deleted out-of-band | `/content-check` after F1 GET returns 404 | F2 renders the **brand-not-found** branch with `[Pick a brand]` CTA → `/`; F2's effect calls `useActiveBrandStore().clear()` so the next visit lands on the no-active-brand branch. |
| authenticated + active brand owned by another user (synthetic — should not happen from UI but possible if the user manually edits localStorage) | `/content-check` | F1 returns 404; F2 renders the **brand-not-found** branch (same as out-of-band delete). NEVER renders raw 403; NEVER leaks brand existence — this is F1's 404-not-403 boundary, F2 must NOT translate 404 into "you don't own this" copy. |
| authenticated + auth boundary state — F1 GET returns 401 (token expired) | `/content-check` | `executeRequest` interceptor fires `auth:loginRequired`; existing `AuthGate` redirects. F2 adds NO new redirect path. |

### Wire-level (restated from F1 spec §2 — F2 is the consumer)

F2 reads ONLY this F1 endpoint:

| # | Endpoint | Method | Path | Happy |
|---|---|---|---|---|
| 1 | List dos-and-donts (optional category filter) | GET | `/api/v1/brands/:brandId/dos-and-donts?category=<enum?>` | 200 |

Response envelope (per F1 spec §2): `{ success: true, data: DosAndDontEntry[] }`. Order: `category ASC, type ASC, createdAt DESC` (F1-side). Empty array `data: []` is the well-formed empty state — F2 MUST handle it as the **zero-matches** branch, NEVER as an error.

Status set (per F1 spec §2 — F2 consumes, does NOT extend): 200 (happy), 400 (unknown `?category` enum — F2 prevents this via the form schema below, so it should not surface from the UI), 404 (brand not found OR not owned), 401 (unauthenticated). F2 does NOT issue cross-tenant requests; F2 does NOT trigger 400 because the form enum is constrained.

### Wire-level handling — `?category=` mapping

- Form field stores `'' | DosAndDontCategory`. `''` is the `All categories` sentinel.
- Before the GET, F2's data hook maps the form value: `const mappedCategory = formCategory === '' ? undefined : formCategory;` then calls `useDosAndDontsRepository(activeBrandId, mappedCategory)`. The F1 hook reads `category` and either appends `?category=<enum>` or omits it.
- F1's `dosAndDontListQuerySchema` (F1 spec §2 "Schemas to export") preprocesses `''` to `undefined` before the enum check, so an accidental empty-string on the wire ALSO normalises server-side — but F2 emits `undefined` (omitted) for cleanliness.
- F2 MUST NOT extend the wire with cross-section filters, full-text search, or pasted-text submission. Part 3 owns those extensions.

### Validation (Zod — `@sfx/validation/schemas/content-check.schema.ts`)

`contentCheckFormSchema` is a CLIENT-SIDE form schema (RHF resolver). It is NOT used by any server route. Author it in `packages/validation/src/schemas/content-check.schema.ts` and re-export from `packages/validation/src/index.ts`. Every field carries `.openapi({ description, example })` for consistency with the rest of `@sfx/validation` even though no NestJS endpoint reads it.

**MUST reuse F1's enum — NEVER redeclare:**

```
import { DOS_AND_DONT_CATEGORY_VALUES } from './dos-and-donts.schema';
```

`DOS_AND_DONT_CATEGORY_VALUES` is the `['tone', 'vocabulary', 'visuals', 'legal', 'campaign-messaging'] as const` published by F1 (F1 spec §2 "Constants exported"). F2 imports it; F2 schema file MUST contain ZERO category-literal duplication.

**Constants exported by F2 (numeric only — enum is F1's):**

```
CONTENT_CHECK_PASTED_TEXT_MAX_LENGTH = 10000
CONTENT_CHECK_CATEGORY_ALL_VALUE     = '' as const
```

**Field constraints:**

| Field | Type | Rule |
|---|---|---|
| `pastedText` | `z.string().max(CONTENT_CHECK_PASTED_TEXT_MAX_LENGTH)` | Required field, default `''`. Whitespace permitted. Empty string allowed — `[Check content]` is enabled with empty text (the user may want to browse dos/don'ts without pasting anything). Max length is a defensive cap so the textarea cannot be DOS-ed via paste. |
| `category` | `z.enum([CONTENT_CHECK_CATEGORY_ALL_VALUE, ...DOS_AND_DONT_CATEGORY_VALUES])` | Six values total: the empty-string sentinel + the five F1 categories. Default `''` (= All categories). Unknown value → 400 (only reachable via DevTools tampering — the `<select>` cannot emit any other value). |

**Schemas to export:**

- `contentCheckFormSchema` — RHF resolver source. Top-level `.openapi({ description: 'Client-side schema for the /content-check form' })`.

**Inferred TypeScript types** (re-exported from `@sfx/validation`):

- `ContentCheckFormInput = z.infer<typeof contentCheckFormSchema>`
- `ContentCheckCategoryValue = '' | DosAndDontCategory` (= `(typeof CONTENT_CHECK_CATEGORY_ALL_VALUE) | DosAndDontCategory`).

**Mapping helper exported alongside the schema:**

```
export function mapFormCategoryToWireCategory(
  formValue: ContentCheckCategoryValue,
): DosAndDontCategory | undefined {
  return formValue === '' ? undefined : formValue;
}
```

This co-locates the empty-string-to-undefined mapping with the schema definition. Unit-test it explicitly: empty string → `undefined`, every enum value → itself.

**Zod gotchas (per `apps/web/CLAUDE.md` + project mulch):**

- Apply `.refine()` AFTER final shape assembly. No `.merge()` / `.extend()` on a refined schema (silent drop).
- F2's schema is so small that `.refine()` is unlikely — keep it that way.

### Active-brand handling

- F2's page hook reads `activeBrandId = useActiveBrandStore((state) => state.activeBrandId)`. Reading via individual selector (NOT an object-returning selector) avoids the infinite-re-render trap in `apps/web/CLAUDE.md` Gotchas.
- When `activeBrandId === null`: F2 short-circuits — NO call to `useDosAndDontsRepository`. The repo hook is invoked with `enabled: activeBrandId !== null` (mirrors F1-part1 `use-brand-by-id-repository.ts`).
- When `activeBrandId` is set: F2 fetches once on mount AND on every category-select change. F2 does NOT debounce the textarea (the textarea content is NOT a wire input — no debouncing needed).
- The `[Check content]` CTA is purely visual — the actual fetch is driven by the category select (`useQuery` runs on key change). Clicking `[Check content]` does NOT re-issue a fetch when the form values are unchanged (React Query cache hit) — it simply re-renders the result block. This matches J4's mental model ("press the button to see results") without burning a network request.
- Picking a different brand via the top-bar `ActiveBrandSelector` mutates `activeBrandId` in the store; F2's `useDosAndDontsRepository(newBrandId, category)` re-fires automatically (different query key). NO extra glue is required.

### Shell-level

- `/content-check` renders inside `<AuthGate><AppShell>` exactly like every other authenticated route (mirror `apps/web/src/app/brands/[id]/visual-identity/edit/page.tsx`).
- The new `Content check` left-nav entry is registered via `map-to-app-shell-ui-model.ts` (described above). When the user is on `/content-check`, the per-brand sub-items (overview / brand-voice / visual-identity) are NOT visible because there is no `pathBrandId` — only the global `Content check` entry is in the rail. When the user is on `/brands/<id>`, BOTH the global `Content check` entry AND the per-brand entries are visible.
- The active-brand `ActiveBrandSelector` in the TopBar is unchanged by F2. F2 reads its store output; F2 does NOT modify the selector component.

### Auth-boundary

- Diff does NOT touch `apps/api/src/modules/auth/**`, `apps/api/src/common/auth/**`, `apps/web/src/features/auth/**`, `jwt-auth.guard.ts`, or `auth-roles.decorator.ts`.
- F2 has NO new env var, NO `OAUTH_*` edit, NO new server-side surface.
- `executeRequest` interceptor chain is unchanged — F2 piggybacks on F1's data hook which already uses `executeRequest`.

---

## 3. Guard contract

| Surface | Auth | Unauth behaviour |
|---|---|---|
| Web `/content-check` | authenticated | `AuthGate` redirects unauth users to oauth2-proxy login. No new redirect path. |

NO new API endpoint. NO new server-side guard. F2 does NOT add any row to the Logical App Contract beyond `/content-check → authenticated`.

---

## 4. Contract annotations the builder MUST maintain

F2 is frontend-only. There are NO NestJS Swagger decorators, NO `@ApiResponse`, NO `@ResourceCaptures`, NO `@UseGuards`, NO new envelope DTOs. The ONLY contract annotation F2 maintains is the Zod schema below.

### Zod schemas — `packages/validation/src/`

- `schemas/content-check.schema.ts` — `contentCheckFormSchema`, `CONTENT_CHECK_PASTED_TEXT_MAX_LENGTH`, `CONTENT_CHECK_CATEGORY_ALL_VALUE`, `ContentCheckFormInput`, `ContentCheckCategoryValue`, `mapFormCategoryToWireCategory`. MUST `import '../openapi';` for side-effect (mirror F1 / brand-profile / visual-identity schema files).
- `index.ts` — re-export every new symbol.

**Hard rule:** the schema file imports `DOS_AND_DONT_CATEGORY_VALUES` from `./dos-and-donts.schema` and uses it directly in `z.enum([...])`. NEVER write the five category literals inline. A grep of `packages/validation/src/schemas/content-check.schema.ts` for `'tone'`, `'vocabulary'`, `'visuals'`, `'legal'`, or `'campaign-messaging'` MUST return zero matches (other than via the imported constant).

### Runtime contract overlay (`.runtime-contract.overlay.json`)

The builder MAY add visible-page tokens (Logical App Contract hints) for `/content-check`. Do NOT add `overlay.flows` (retired) or `overlay.ignore[]` entries — both rejected by the contract compiler.

### Flow file (owned by lead — builder MUST NOT edit)

`.overstory/runtime-contract.flows/sfx-webapp-boilerplate-a051.json` — lead authors via the `task-flow-authoring` skill. F2 has NO new API endpoints, so the curated flow set is focused on page-level Logical App Contract assertions and the consumed F1 GET shape. At minimum:

- unauthenticated GET `/content-check` → 3xx redirect (Logical App Contract row "unauthenticated + protected page").
- authenticated GET `/content-check` with no active brand → 2xx page render + no F1 GET issued.
- authenticated GET `/content-check` with active brand having entries + `category=All` → 2xx page render + F1 GET 200 + `data.length >= 1`.
- authenticated GET `/content-check` with active brand having entries + `category=tone` → 2xx page render + F1 GET 200 + every returned entry's `category === 'tone'`.
- authenticated GET `/content-check` with active brand having zero entries → F1 GET 200 + `data: []` + page renders zero-matches empty state.
- authenticated GET `/content-check` with stale active-brand id (brand deleted) → F1 GET 404 + page renders brand-not-found branch + store cleared.

Builder responds to flow-file failures via the `flow-failure-response` skill — NEVER edits the JSON. `flows-path-boundary` hook blocks any edit attempt and emits `FLOW_OWNERSHIP_VIOLATION`.

---

## 5. Frontend feature layout — `apps/web/src/features/content-check/`

Mirror the part-1 brand-voice / visual-identity / brand-profile feature shape for clean-architecture skeleton (`data/repositories/`, `presentation/pages/`, `presentation/components/`, `presentation/validators/`, `constants.ts`, `index.ts`). NO `data/remote/`, NO `data/mapper/`, NO `data/model/` — F2 consumes F1's `useDosAndDontsRepository` directly, which already does fetch + envelope-unwrap + mapping.

### `data/` layer

F2 has NO `data/remote/`, NO `data/mapper/`, NO `data/model/`. F2's `data/` is effectively pass-through:

- `data/repositories/use-content-check-list-repository.ts` — thin wrapper around F1's `useDosAndDontsRepository(activeBrandId, mappedCategory)`. Reasons to wrap rather than call directly from the page hook: (a) gives F2 a single seam for tests to mock at; (b) co-locates the `enabled: activeBrandId !== null` guard so the page hook does not have to repeat it; (c) maps the form-side category (`'' | DosAndDontCategory`) to the wire-side (`DosAndDontCategory | undefined`) via `mapFormCategoryToWireCategory`. Signature:

```
export function useContentCheckListRepository(
  activeBrandId: string | null,
  formCategory: ContentCheckCategoryValue,
): {
  readonly data: readonly DosAndDontEntry[] | undefined;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly isBrandNotFound: boolean;
};
```

`isBrandNotFound` derives from the underlying React Query error shape. F1's `useDosAndDontsRepository` returns an error whose `status === 404` for the brand-not-found case; F2's wrapper exposes a boolean so the page hook does not branch on raw query state in JSX (per ADR-003 / `apps/web/CLAUDE.md`).

### `presentation/` layer

- `presentation/pages/content-check/`:
  - `types.ts` — `ContentCheckPageUIModel` + `UseContentCheckReturn`.
  - `use-content-check.ts` — page hook. Reads `useActiveBrandStore((state) => state.activeBrandId)`, reads `useActiveBrandStore((state) => state.clear)` for the stale-id cleanup effect. Holds form state via RHF + `zodResolver(contentCheckFormSchema)` (default values `{ pastedText: '', category: '' }`). Calls `useContentCheckListRepository(activeBrandId, formCategory)` where `formCategory` is the live RHF-watched value (drives query-key changes when the select changes). Returns `{ uiModel, register, handleSubmit, formState, handleCheckContent }`. `handleCheckContent` is a no-op submit handler — it exists to satisfy the form contract (clicking `[Check content]` calls `preventDefault` and re-renders); the actual data fetch is driven by the watched `category` value. `useCallback`-wrap everything per Hook Return Audit. NEVER call `router.push` inside this hook — only branch via UIModel CTA `href` fields.
  - `map-to-content-check-page-ui-model.ts` — derives the UIModel from `{ translations, activeBrandId, activeBrandName, isLoading, isError, isBrandNotFound, entries, formCategory, pastedText }`. Branch order: `isBrandNotFound → notFound branch` → `activeBrandId === null → noActiveBrand branch` → `isError → error branch` → `isLoading → loading branch` → `entries.length === 0 → zeroMatches branch` → `entries.length >= 1 → populated branch with grouped result`. Group entries by category then by type using either F1's exported `group-entries.ts` helper OR a local copy (see "Dependency on F1" header). All labels via `useTranslations('common')` — NEVER hard-code strings.
  - `index.tsx` — page component. Renders the form (textarea + select + submit), the `Reference text` block (echoes `pastedText`), and the result block. NO `useState` / `useReducer` / `useMemo` / `useQuery` in this file — it consumes UIModel + handlers from the hook.
- `presentation/components/ContentCheckResultList/` — grouped result list. Props: `groups: readonly ContentCheckCategoryGroup[]` (UIModel-derived; each group has a label + array of Do entries + array of Don't entries). Renders heading per category, two sub-headings per type, each row showing `title` + `body` (`whitespace-pre-wrap`) + optional `Suggested correction`. Co-located `__tests__/`.
- `presentation/components/ContentCheckForm/` — extracted form sub-component (optional — builder MAY inline into the page index if the form is small enough; about 80 LOC inline is acceptable). Renders the textarea + category select + submit button. Receives `register`, `handleSubmit`, `handleCheckContent`, `pastedTextLabel`, `categoryLabel`, `categoryOptions`, `submitLabel` props from the UIModel mapper.
- `presentation/components/ContentCheckEmptyStates/` (optional) — three small components (`NoActiveBrandEmptyState`, `ZeroMatchesEmptyState`, `BrandNotFoundEmptyState`). Each takes its CTA label + href as props. Builder MAY inline these into the page index if they total under 50 LOC; otherwise extract.
- `presentation/validators/content-check-form.ts` — `zodResolver(contentCheckFormSchema)` re-export (mirror F1 / brand-voice form validators).

### `constants.ts`

```
export const CONTENT_CHECK_ROUTE = '/content-check';
export const PICK_BRAND_ROUTE = '/';
export const addDosAndDontCtaHref = (brandId: string): string =>
  `/brands/${brandId}`;
export {
  CONTENT_CHECK_PASTED_TEXT_MAX_LENGTH,
  CONTENT_CHECK_CATEGORY_ALL_VALUE,
} from '@sfx/validation';
export {
  DOS_AND_DONT_CATEGORY_VALUES,
  type DosAndDontCategory,
} from '@sfx/validation';
```

NO React Query key builder — F2 has no mutations, no invalidations, and re-uses F1's `dosAndDontsListQueryKey`.

### `index.ts`

Barrel exporting `ContentCheckPage`, `CONTENT_CHECK_ROUTE`. NOTHING else needs to be public from this feature.

### App-shell additive edit

Only ONE file under `app-shell` is structurally edited, plus its sibling files for type / render parity:

- `apps/web/src/features/app-shell/presentation/components/AppShell/map-to-app-shell-ui-model.ts` — modify `mapToAppShellUIModel` so the returned `leftNavItems` is constructed as `[contentCheckEntry, ...perBrandEntries]` where:
  - `contentCheckEntry: LeftNavItem = { key: 'content-check', label: translations.contentCheck, href: CONTENT_CHECK_ROUTE }` (the `CONTENT_CHECK_ROUTE` constant is imported from `@/features/content-check`, OR — to avoid a presentation-layer dependency on the F2 feature — duplicated inline as `/content-check` with a comment pointing at the feature constant; recommended: import from the feature for single-source-of-truth).
  - `perBrandEntries` is the existing three-item array, computed ONLY when `pathBrandId !== null` (mirror current logic).
  - The function now ALWAYS returns a non-null `leftNavItems` (no longer the `pathBrandId !== null ? [...] : null` ternary). Update `AppShellUIModel.leftNavItems` type from `readonly LeftNavItem[] | null` to `readonly LeftNavItem[]` and update `<AppShell>` `index.tsx` L28-30 to drop the null-check: `<LeftNav items={uiModel.leftNavItems} ariaLabel={uiModel.leftNavLabel} />` rendered unconditionally.
  - Existing `__tests__/map-to-app-shell-ui-model.test.ts` extended with: (a) returns the `content-check` item alone when `pathBrandId` is null; (b) returns `content-check` followed by the three per-brand items when `pathBrandId` is set.

The `<TopBar>` is UNCHANGED. The `<LeftNav>` component is UNCHANGED (it just renders whatever items it gets). The `<ActiveBrandSelector>` is UNCHANGED.

### Page wrapper

`apps/web/src/app/content-check/page.tsx`:

```
import type { ReactNode } from 'react';
import { AuthGate } from '@/features/auth';
import { AppShell } from '@/features/app-shell';
import { ContentCheckPage } from '@/features/content-check';

export default function Page(): ReactNode {
  return (
    <AuthGate>
      <AppShell>
        <ContentCheckPage />
      </AppShell>
    </AuthGate>
  );
}
```

`ContentCheckPage` takes NO props — it reads `activeBrandId` from the store.

### Localisation

Both `apps/web/src/features/presentation/localization/languages/en/common.ts` AND `.../ro/common.ts` — add keys. `CommonTranslations` in `apps/web/src/features/presentation/localization/types.ts` enforces parity. At minimum:

- Nav: `contentCheck` (EN `Content check`, RO `Verificare conținut`).
- Page chrome: `contentCheckPageTitle`, `contentCheckActiveBrandLabel`, `contentCheckPastedTextLabel`, `contentCheckPastedTextPlaceholder`, `contentCheckCategoryLabel`, `contentCheckCategoryAllOption`, `contentCheckSubmitLabel`, `contentCheckReferenceTextLabel`.
- Empty states: `contentCheckNoActiveBrandTitle`, `contentCheckNoActiveBrandBody`, `contentCheckNoActiveBrandCta` (`Pick a brand`), `contentCheckZeroMatchesTitle`, `contentCheckZeroMatchesBody`, `contentCheckZeroMatchesCta` (`+ Add do/don't`), `contentCheckBrandNotFoundTitle`, `contentCheckBrandNotFoundBody`, `contentCheckBrandNotFoundCta` (= `contentCheckNoActiveBrandCta`).
- Result list: `contentCheckResultsTitle`, `contentCheckSuggestedCorrectionLabel` (reuse F1's `dosAndDontSuggestedCorrectionLabel` if F1 exports it — verify; if not present, add a new key under content-check namespace).
- Category labels: reuse F1's `dosAndDontCategoryToneLabel` / `VocabularyLabel` / `VisualsLabel` / `LegalLabel` / `CampaignMessagingLabel` directly (F1 spec §6 "Localisation" guarantees them).
- Type labels: reuse F1's `dosAndDontTypeDoLabel` (`Do`) + `dosAndDontTypeDontLabel` (`Don't`).
- Errors: `contentCheckLoadError` (generic), `contentCheckPastedTextTooLongError` (only reachable on extreme paste).

`apps/web/src/features/presentation/localization/types.ts` — extend `CommonTranslations` with the new keys so both language files compile.

### Tests (every new file)

- Every new source file MUST have a co-located test (under `__tests__/` OR sibling `.test.ts(x)`). 90%+ coverage. Stop-hook coverage gate blocks close otherwise.
- `packages/validation/src/schemas/__tests__/content-check.schema.test.ts`:
  - `contentCheckFormSchema` parses `{ pastedText: '', category: '' }` (default valid).
  - Parses each of the five category values + the empty-string sentinel.
  - Rejects unknown category → ZodError.
  - Rejects `pastedText` over `CONTENT_CHECK_PASTED_TEXT_MAX_LENGTH` → ZodError.
  - `mapFormCategoryToWireCategory('')` → `undefined`.
  - `mapFormCategoryToWireCategory('tone')` → `'tone'` (parametrised over all five).
  - GREP: the file MUST NOT contain any of the five category literal strings (other than imported from F1).
- `apps/web/src/features/content-check/data/repositories/__tests__/use-content-check-list-repository.test.ts`:
  - When `activeBrandId === null`: hook returns `data: undefined, isLoading: false, isError: false, isBrandNotFound: false`; F1's `useDosAndDontsRepository` is NOT called.
  - When `activeBrandId` is set and `formCategory === ''`: F1 hook called with `(activeBrandId, undefined)`.
  - When `formCategory === 'tone'`: F1 hook called with `(activeBrandId, 'tone')`.
  - When F1 hook reports 404: `isBrandNotFound === true`.
  - When F1 hook reports any other error: `isError === true`, `isBrandNotFound === false`.
- `apps/web/src/features/content-check/presentation/pages/content-check/__tests__/use-content-check.test.ts`:
  - No active brand → uiModel `state === 'noActiveBrand'`; pickBrand CTA href `/`.
  - Active brand + zero entries → uiModel `state === 'zeroMatches'`; CTA href `/brands/<activeBrandId>`.
  - Active brand + populated → uiModel `state === 'populated'`; `groups.length >= 1`.
  - Active brand + 404 → uiModel `state === 'brandNotFound'`; effect calls `useActiveBrandStore.clear`.
  - Picking a category re-renders with new query key (mocked F1 hook).
  - `handleCheckContent` is `useCallback`-stable across re-renders.
- `apps/web/src/features/content-check/presentation/pages/content-check/__tests__/map-to-content-check-page-ui-model.test.ts`:
  - Each branch produces the expected UIModel shape.
  - Branch precedence: `isBrandNotFound` > `noActiveBrand` > `isError` > `isLoading` > `zeroMatches` > `populated`.
  - Grouping helper produces the expected category × type ordering for a sample input.
- `apps/web/src/features/content-check/presentation/components/ContentCheckResultList/__tests__/index.test.tsx`:
  - Renders category headings in the order of `DOS_AND_DONT_CATEGORY_VALUES`.
  - Renders Do sub-group before Don't sub-group.
  - Renders `Suggested correction` only when entry has non-null `suggestedCorrection`.
  - Preserves newlines in `body` (via `whitespace-pre-wrap` class assertion).
- `apps/web/src/features/content-check/presentation/pages/content-check/__tests__/index.test.tsx`:
  - Smoke-render with each of the four major branches via mocked hook return.
  - Form interaction: typing in the textarea updates the reference-text echo block; selecting `tone` re-renders the result block with `tone` results.
  - Pasted text never appears in any mocked network call (audit by asserting the mocked F1 hook's `category` arg is the only thing that changes between fetches).
- `apps/web/src/app/content-check/__tests__/page.test.tsx`:
  - Renders `<AuthGate><AppShell><ContentCheckPage/></AppShell></AuthGate>` (mock all three; assert order).
- `apps/web/src/features/app-shell/presentation/components/AppShell/__tests__/map-to-app-shell-ui-model.test.ts` (extend existing):
  - `leftNavItems[0]` always equals `{ key: 'content-check', label: <contentCheck-string>, href: '/content-check' }`.
  - When `pathname === '/'`: `leftNavItems.length === 1` (only `content-check`).
  - When `pathname === '/brands/<id>'`: `leftNavItems.length === 4` and items[1..3] are `overview` / `brand-voice` / `visual-identity` in that order.
  - When `pathname === '/content-check'`: `leftNavItems.length === 1`.

---

## 6. Files in F2 builder's scope

In scope (new tree):
- `packages/validation/src/schemas/content-check.schema.ts` (new) + `__tests__/content-check.schema.test.ts`
- `apps/web/src/features/content-check/**` (new tree) — `data/repositories/`, `presentation/pages/content-check/`, `presentation/components/ContentCheckResultList/` (+ optional `ContentCheckForm/`, `ContentCheckEmptyStates/`), `presentation/validators/`, `constants.ts`, `index.ts`, plus co-located tests for every file.
- `apps/web/src/app/content-check/page.tsx` (new thin wrapper) + co-located test.

In scope (additive modifications only):
- `packages/validation/src/index.ts` (re-export `contentCheckFormSchema`, the two new constants, `ContentCheckFormInput`, `ContentCheckCategoryValue`, `mapFormCategoryToWireCategory`).
- `apps/web/src/features/app-shell/presentation/components/AppShell/map-to-app-shell-ui-model.ts` (always populate `leftNavItems` with the `content-check` global entry; conditionally append per-brand entries).
- `apps/web/src/features/app-shell/presentation/components/AppShell/types.ts` (change `leftNavItems` from `readonly LeftNavItem[] | null` to `readonly LeftNavItem[]`).
- `apps/web/src/features/app-shell/presentation/components/AppShell/index.tsx` (drop the `uiModel.leftNavItems ? ... : null` ternary — render `LeftNav` unconditionally).
- `apps/web/src/features/app-shell/presentation/components/AppShell/__tests__/map-to-app-shell-ui-model.test.ts` (extend assertions as listed in §5 Tests).
- `apps/web/src/features/app-shell/presentation/components/AppShell/__tests__/AppShell.test.tsx` (if it asserted on the null-leftNav branch, update to assert on the always-rendered LeftNav).
- `apps/web/src/features/presentation/localization/languages/en/common.ts` (add keys).
- `apps/web/src/features/presentation/localization/languages/ro/common.ts` (add keys — identical key set).
- `apps/web/src/features/presentation/localization/types.ts` (extend `CommonTranslations`).
- `.runtime-contract.overlay.json` (page tokens only — NEVER `flows` / `ignore`).

OFF LIMITS (cite in any mail to the lead):
- `apps/api/**` (F2 has NO server-side surface; touching the API is a scope violation).
- `apps/api/src/modules/auth/**`, `apps/api/src/common/auth/**`, `jwt-auth.guard.ts`, `auth-roles.decorator.ts`.
- `apps/web/src/features/auth/**`.
- `apps/web/src/features/dos-and-donts/**` (F1 territory — consume the feature barrel only; do NOT edit any file under this tree).
- `apps/web/src/features/brand-profile/**` (part-1).
- `apps/web/src/features/brand-voice/**`, `apps/web/src/features/visual-identity/**` (part-1 territories).
- `apps/web/src/features/app-shell/**` EXCEPT the four files listed under "in scope (additive modifications only)" above.
- `apps/web/src/stores/active-brand-store.ts` (read-only — selector reads only; no API surface mutation).
- `packages/validation/src/schemas/dos-and-donts.schema.ts` (F1 territory — IMPORT from it, never modify).
- `packages/database/**` (no migration, no schema change).
- `packages/domain/**` (no new entity, no new contract — F2 consumes F1's `DosAndDontEntry`).
- `.overstory/runtime-contract.flows/**` (lead-owned; hook-blocked).
- `.flows.generated.json`, `.matrix.json`, `.runtime-contract.logical.json` (hook-blocked).
- F1 territory: `apps/api/src/modules/dos-and-donts/**`.
- Anything outside the worktree.

---

## 7. Implementation notes the builder MUST read before writing code

- F1 dos-and-donts MUST be merged to master BEFORE F2 begins. The coordinator's sequence (`bc83.md` §4) is "F1 first, F2 after F1 is merged" — no parallel builders. If F1 is not on master at builder-spawn time, F2 builder MUST mail the coordinator and pause.
- F2 imports F1's `useDosAndDontsRepository` + `dosAndDontsListQueryKey` + `DOS_AND_DONT_CATEGORY_VALUES` + `DosAndDontEntry` from the F1 feature barrel (`@/features/dos-and-donts`). If F1 forgot to export any of these from its `index.ts`, mail the F1 author rather than deep-importing into F1's internal tree.
- Active-brand store selector reads MUST be single-field: `useActiveBrandStore((state) => state.activeBrandId)` and `useActiveBrandStore((state) => state.clear)` — separate `useActiveBrandStore` calls per field. NEVER use an object-returning selector (Zustand infinite re-render trap; `apps/web/CLAUDE.md` Gotchas).
- The pasted text is LOCAL component state — never sent to the server, never persisted, never logged. Verify in tests that no `executeRequest` mock receives the pasted text in any form.
- The category select drives the API call; `[Check content]` CTA is decorative. Do NOT bind the CTA to imperative `refetch()` — React Query already re-fires on key change. Clicking the CTA on unchanged form values is a no-op (cache hit) and that is correct.
- The empty-string-to-undefined mapping lives in `mapFormCategoryToWireCategory`. Tests MUST cover every value; this is the load-bearing line that keeps the wire-level `?category=` omitted when "All categories" is selected. Per F1 spec §2, `dosAndDontListQuerySchema.preprocess` accepts either an empty string or omitted `category`, but emitting `undefined` is cleaner (and easier to debug from network tab).
- React Query keys are nested arrays. F2 does NOT mutate, so there are NO `invalidateQueries` calls in F2. The F1 hook's key is `dosAndDontsListQueryKey(activeBrandId, category?)` — F2 inherits its cache. If F1 mutates dos-and-donts elsewhere in the app, F1's mutation invalidates the prefix `['dos-and-donts', brandId]` and F2's result re-fetches automatically.
- 404 from F1 GET maps to F2's brand-not-found branch. The mapping is in `use-content-check-list-repository.ts` (extract `error.status === 404` once, expose `isBrandNotFound: boolean`). The page hook MUST NOT branch on raw HTTP status — only on the boolean (per ADR-003).
- All frontend strings via `useTranslations('common')` — no inline JSX strings, no hard-coded English. Both `en/common.ts` and `ro/common.ts` MUST stay in sync; TypeScript enforces parity via `CommonTranslations`.
- All API calls via `executeRequest()` — but F2 does NOT call `executeRequest` directly. F2 calls F1's `useDosAndDontsRepository`, which calls `executeRequest` for F2.
- `useCallback` every returned hook function. NEVER call `router.push()` inside this hook — the page has only outbound links (CTAs as `href` strings on `<Link>` or `<a>`), no programmatic navigation.
- Theme tokens via Tailwind classes (`bg-card`, `text-foreground`, `border-border`) — no hex literals.
- The pasted-text `<textarea>` MUST cap input at `CONTENT_CHECK_PASTED_TEXT_MAX_LENGTH` via the `maxLength` HTML attribute AND the Zod schema (defence in depth — the HTML cap blocks paste, Zod blocks DevTools tampering).
- Before close gate, run `pnpm probe:smoke`. Failure routing per parent `CLAUDE.md` "Probe failure → skill routing":
  - F2 has no NestJS surface, so `CONTRACT_STATUS_UNREACHABLE_UNGENERATABLE` / `RESOURCE_CAPTURE_*` SHOULD NOT fire from F2's diff. If they do, the failure is either in F1's territory (F1 author owns the fix) or in `app-shell` (F2 author owns the fix). Mail the lead before touching either.
  - `FLOW_STEP_FAILED` referencing `sfx-webapp-boilerplate-a051:*` → `flow-failure-response` + mail the lead. NEVER edit the JSON.
  - `FLOW_NEW_ENDPOINT_UNCOVERED` → impossible for F2 (no new endpoint). If it surfaces, the diff is leaking outside F2 scope — audit before doing anything else.
- `worker_done` evidence MUST include:
  - `## runtime-evidence` — full `pnpm probe:smoke` JSON, EXIT 0, every curated flow PASS for `sfx-webapp-boilerplate-a051`. F1's curated flows MUST also stay green (no regression).
  - `## qa-test-evidence` — report path under `.claude/hook-reports/qa-test-<task>-<hash>.md`, mode=full, covering J4 + the unauth redirect + every branch in §1 (no-active-brand, zero-matches, populated, brand-not-found), final FAILED=0 CRITICAL=0 HIGH=0.
- Recorded conventions / failures to read before touching:
  - `mulch mx-1d0874` (React Query `onSettled` + array-prefix invalidation) — F2 has NO mutations so the failure mode does not surface directly, but the prefix-match semantics matter when F1 mutations trigger F2 refetches (no action needed — just be aware).
  - `mulch mx-27187a` (RHF primitive-array list field via `useWatch`+`setValue`) — F2's form has a single primitive string + a single enum, so `useFieldArray` is NOT used here. No action needed.
  - `mulch mx-cd88c5` / `mx-e2ad2d` (probe contract-coverage tuple mismatch) — F2 has no API surface, so this failure mode does NOT apply to F2's diff. F1's endpoints have path-params, so the r5/r6 `apiPrefix`-prefix tuple fix landed on master (`975f936`) should cover them. If `CONTRACT_STATUS_UNREACHABLE` fires on a `/api/v1/brands/:brandId/dos-and-donts` tuple after F2 merges, the regression is environmental — mail the lead.
  - `mulch mx-0c69bf` (Next.js dev web container bakes the validation package compiled output) — `pnpm stack:up` with the rebuild flag rebuilds the web image with the fresh compiled output baked in. F2 ships a new schema in `@sfx/validation`, so the builder MUST run `pnpm stack:up` after editing the schema. Verify the schema is visible to the running web container by checking the `Content check` page renders the category select before declaring done.

---

## 8. Definition of done

- `/content-check` route renders inside `<AuthGate><AppShell>` for an authenticated user without console errors.
- Global `Content check` left-nav entry is visible to every authenticated user on every route (top item in the rail).
- When `activeBrandId === null`: page renders the **no-active-brand** empty state with the `[Pick a brand]` CTA → `/`; NO `GET /api/v1/brands/:brandId/dos-and-donts` is issued.
- When `activeBrandId` is set + brand has zero entries (or zero in the selected category): page renders the **zero-matches** empty state with `[+ Add do/don't]` CTA → `/brands/<activeBrandId>`.
- When `activeBrandId` is set + brand has entries: page renders the grouped result list (category → Do/Don't) with `title` + `body` + optional `Suggested correction` per row.
- Switching the category select changes the result list (verified by the underlying F1 GET re-firing with the new `?category=` value or no `?category=` for `All categories`).
- Switching the active brand via the top-bar selector changes the result list (verified by F1 GET re-firing with the new `:brandId`).
- The pasted text never appears in any network request (audit by recording every `executeRequest` call during a manual content-check flow and asserting the URL/body never contains the pasted text).
- Unauthenticated visitor to `/content-check` is redirected to oauth2-proxy login by `AuthGate`.
- Stale `activeBrandId` (brand deleted out-of-band): page renders the **brand-not-found** branch and the active-brand store is cleared.
- `pnpm typecheck`, `pnpm lint`, `pnpm test:coverage` (90%+), `pnpm test:integration`, `pnpm probe:smoke` all pass — EXIT 0 on the probe.
- `worker_done` mail to lead carries probe JSON summary as `## runtime-evidence` block AND QA-test report path as `## qa-test-evidence` block.
- No diff in OFF-LIMITS paths.
- F1 dos-and-donts / F1-part1 brand-profile / F2-part1 brand-voice / F3-part1 visual-identity endpoints continue to pass their existing flow files. F2's diff is frontend-only and additive.
- The `Content check` global nav item is the SOLE new nav addition; the per-brand sub-items behave exactly as they do on master.
