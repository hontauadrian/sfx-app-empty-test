# Feature spec — F1 Shared role constant + CompanyInfo domain + Zod schemas

Top-level issue: `sfx-webapp-boilerplate-c33f`. Feature issue: `sfx-webapp-boilerplate-51de`.
Source product-plan: `.overstory/specs/sfx-webapp-boilerplate-c33f.md` (§3 F1, §2 Domain entities + Shared role constant, §5 Sidewide acceptance).
Mode: direct-builder. Library-only feature — no HTTP surface, no page, no Prisma changes, no migration.

F1 is foundational. F2 (backend), F3 (admin shell), F4 (company-info page) all import from the symbols this feature ships. Their dispatch is blocked on F1 closing.

---

## 1. Context (files read)

### `@sfx/shared`
- `packages/shared/package.json` — `main`/`types` point to `src/index.ts`. Deps: `@sfx/domain` (workspace). Test runner: `vitest 2.1.8` + `@vitest/coverage-v8`. Scripts: `test`, `test:coverage`, `typecheck`, `lint`.
- `packages/shared/vitest.config.ts` — `include: ['**/__tests__/**/*.test.ts']`. Coverage thresholds 90/90/90/90 (branches/functions/lines/statements). Env: `node`. Globals: `true`.
- `packages/shared/src/index.ts` — current barrel exports `HttpStatus`, `ErrorCode`, `ApiResponse*` types + `createSuccessResponse`/`createErrorResponse`, and pagination constants.
- `packages/shared/src/constants/index.ts` — pagination + API_VERSION constants. New module-level `auth-roles.ts` lands as a sibling under `src/` (not under `constants/`) per F1's plan and the consumer reference path.
- `packages/shared/src/enums/error-code.enum.ts`, `enums/http-status.enum.ts` — reference enum-export shape.
- `packages/shared/src/types/api-response.type.ts` — reference for typed-helpers + barrel pattern.
- `packages/shared/src/__tests__/constants.test.ts` — vitest pattern: `describe`/`it`/`expect`, imports from `vitest`, asserts every public value.
- `packages/shared/src/__tests__/index.test.ts` — barrel test pattern: `import * as shared` then assert each named export is defined.

### `@sfx/domain`
- `packages/domain/package.json` — zero runtime deps. Same scripts shape as `@sfx/shared`. `types` points to `src/index.ts`.
- `packages/domain/vitest.config.ts` — `include: ['**/__tests__/**/*.test.ts']`, `passWithNoTests: true`, coverage 90/90/90/90.
- `packages/domain/src/index.ts` — currently the empty-scaffold module `export {};`. The placeholder export must be removed once real entities land (test asserts no extra exports today).
- `packages/domain/src/__tests__/index.test.ts` — `expect(Object.keys(domain)).toEqual([]);` — this test must be replaced when real exports land.

### `@sfx/validation`
- `packages/validation/package.json` — deps `@anatine/zod-openapi 2.2.6`, `@sfx/domain` (workspace), `@sfx/shared` (workspace), `openapi3-ts 4.4.0`, `zod 3.24.2`.
- `packages/validation/vitest.config.ts` — `include: ['**/__tests__/**/*.test.ts']`, **alias `@sfx/shared` and `@sfx/domain` to their `src/`** so cross-package types resolve under vitest. Coverage 90/90/90/90.
- `packages/validation/src/index.ts` — barrel pattern: import openapi side-effect first, then re-export each schema and its inferred input type.
- `packages/validation/src/openapi.ts` — `extendZodWithOpenApi(z)` runs as a module-load side-effect. Every schema file uses `import '../openapi';` to ensure `.openapi()` is decorated onto Zod before the schema body runs. `zodToOpenApi(schema, { ref })` registers a named schema for Swagger.
- `packages/validation/src/schemas/common.schema.ts` — reference schema. Pattern: `import '../openapi'` at top, then `z.object({...}).openapi({...})`, then `export type Input = z.infer<typeof schema>`.
- `packages/validation/__tests__/schemas/common.schema.test.ts` — schema test pattern: `safeParse` against valid + every boundary + every required-field-missing + every wrong-type case.
- `packages/validation/src/__tests__/index.test.ts` — barrel test pattern.

### Cross-package consumer references (read-only — do NOT modify in F1)
- `apps/api/src/common/decorators/auth-roles.decorator.ts` — declares `AUTH_ROLES_KEY` + `AuthRoles(...roles: string[])`. F2 will call `@AuthRoles(AUTH_ROLE_ADMIN)` against the symbol F1 ships.
- `apps/api/src/common/guards/jwt-auth.guard.ts` — reads `AUTH_ROLES_KEY` reflector metadata and compares against `user.roles`. Confirms a single string-literal role is sufficient; no role-shape change needed.
- `apps/web/src/features/auth/data/mapper/map-to-auth-session.ts` — `AuthSession.roles: string[]`. F3 will check `session.roles.includes(AUTH_ROLE_ADMIN)` from `@sfx/shared`.
- `packages/validation/src/schemas/common.schema.ts` — confirms `@sfx/validation` already imports from `@sfx/shared`, so the dependency direction is established.

### Product plan
- `.overstory/specs/sfx-webapp-boilerplate-c33f.md` §2 (Domain entities, Shared role constant), §3 F1 (Features within), §5 (Sidewide acceptance bullet on Prisma client compile is **not** in F1 scope — it lives in F2).

---

## 2. Task breakdown

Three file-groups, sequenced inside the feature. Each group ships tests + implementation in the same commit; the Stop hook would block otherwise. Each task lists test cases first, then implementation. Path prefixes are relative to repo root.

### T1 — `@sfx/shared`: AUTH_ROLE_ADMIN constant

**New files**
- `packages/shared/src/auth-roles.ts`
- `packages/shared/src/__tests__/auth-roles.test.ts`

**Modified files**
- `packages/shared/src/index.ts` (add re-export)
- `packages/shared/src/__tests__/index.test.ts` (assert the new export is present on the barrel)

**Test cases (write first)**
1. `AUTH_ROLE_ADMIN` is the exact string literal `'admin'`. Use `expect(AUTH_ROLE_ADMIN).toBe('admin')`.
2. `AUTH_ROLE_ADMIN` is typed as the literal `'admin'`, not widened to `string`. Assert via a type-level check, e.g. `const _check: typeof AUTH_ROLE_ADMIN extends 'admin' ? true : false = true; void _check;` (kept as a compile-time assertion inside the test file).
3. Barrel test: `expect(shared.AUTH_ROLE_ADMIN).toBe('admin')`.

**Implementation steps**
1. Create `packages/shared/src/auth-roles.ts`:
   - Export `AUTH_ROLE_ADMIN` as `'admin' as const`. Single source of truth for the admin Keycloak role name.
2. Update `packages/shared/src/index.ts`:
   - Add `export { AUTH_ROLE_ADMIN } from './auth-roles';` (keep ordering consistent with existing barrel — group named exports by feature, not alphabetically).
3. Update `packages/shared/src/__tests__/index.test.ts`:
   - Add an assertion `expect(shared.AUTH_ROLE_ADMIN).toBe('admin')` to the existing `describe('@sfx/shared barrel')` block. The existing assertions for `HttpStatus`/`ErrorCode`/etc. stay untouched.

**Notes**
- Do NOT introduce an enum or union of roles. The product plan promises one constant, one grep target. A second role would arrive as its own constant.
- File lives at `packages/shared/src/auth-roles.ts` (NOT under `constants/`) so F2/F3 import as `import { AUTH_ROLE_ADMIN } from '@sfx/shared'` and never as `from '@sfx/shared/constants'`. The barrel is the only public surface.

### T2 — `@sfx/domain`: CompanyInfo entity + CompanyInfoRepository interface

**New files**
- `packages/domain/src/entities/company-info.ts`
- `packages/domain/src/repositories/company-info.repository.ts`
- `packages/domain/src/__tests__/entities/company-info.test.ts`
- `packages/domain/src/__tests__/repositories/company-info.repository.test.ts`

**Modified files**
- `packages/domain/src/index.ts` (replace empty-scaffold with real exports)
- `packages/domain/src/__tests__/index.test.ts` (replace the "module loads as empty scaffold" assertion with explicit barrel assertions)

**Test cases (write first)**

`entities/company-info.test.ts`
1. `CompanyInfo` is exported as a type only — it is a pure interface. Assert by reading the export at runtime: `expect((domain as Record<string, unknown>).CompanyInfo).toBeUndefined()` (a type re-export has no runtime value). This also documents the contract that consumers may not instantiate `CompanyInfo` directly.
2. A literal value typed as `CompanyInfo` compiles with: required `id: string`, required `legalName: string`, optional `tradingName | email | phone | website | addressLine1 | addressLine2 | city | postalCode | country | taxId | registrationNumber: string | null`, required `createdAt: Date`, `updatedAt: Date`. Write a "happens to compile" test: declare a `const sample: CompanyInfo = {...}` inside `describe` block — TypeScript surfaces any drift as a typecheck error and fails CI.
3. Optional fields use `string | null` (not `string | undefined`) — this matches the Prisma model's nullable-column semantics and keeps the GET-singleton response shape stable when fields are absent. Document with a sample literal that explicitly sets `tradingName: null`.

`repositories/company-info.repository.test.ts`
1. `CompanyInfoRepository` is exported as a type. Same "no runtime value" assertion as `CompanyInfo`.
2. Compile-test: an object with `findSingleton(): Promise<CompanyInfo | null>` and `upsertSingleton(payload: UpsertCompanyInfoInput): Promise<CompanyInfo>` satisfies `CompanyInfoRepository`.
3. Compile-test: an object missing `upsertSingleton` does NOT satisfy the interface. Use `// @ts-expect-error` and assert the line is rejected by the compiler. Wrap in a no-op runtime expect so vitest counts it.
4. The `UpsertCompanyInfoInput` type is exported alongside the interface and matches the shape declared in T3 (`legalName: string` required; every other field `string | null | undefined`). Compile-test only.

`__tests__/index.test.ts`
1. `import * as domain from '../index'` exposes type-only names — runtime keys should be `[]` (since both `CompanyInfo` and `CompanyInfoRepository` are interfaces erased at compile time). Update the existing test to `expect(Object.keys(domain)).toEqual([])` and add a paragraph comment explaining the test still passes because exports are type-only.
2. Compile-test: importing `CompanyInfo` from the barrel works. Inside the test file write `import type { CompanyInfo, CompanyInfoRepository, UpsertCompanyInfoInput } from '../index';` and reference each in a typed `const` literal.

**Implementation steps**
1. `packages/domain/src/entities/company-info.ts`:
   - Export `interface CompanyInfo` with the field list from §2 of the product plan (`id`, `legalName`, optional fields as `string | null`, `createdAt: Date`, `updatedAt: Date`).
   - Mark every property `readonly`. Domain entities are immutable from the consumer's perspective.
   - Export `interface UpsertCompanyInfoInput` — same field set but **without** `id`, `createdAt`, `updatedAt`. `legalName: string` is required; every other field is `string | null | undefined` (callers may omit a field — undefined — or explicitly clear it — null).
2. `packages/domain/src/repositories/company-info.repository.ts`:
   - `import type { CompanyInfo, UpsertCompanyInfoInput } from '../entities/company-info';`
   - Export `interface CompanyInfoRepository` with two methods: `findSingleton(): Promise<CompanyInfo | null>`, `upsertSingleton(input: UpsertCompanyInfoInput): Promise<CompanyInfo>`.
3. `packages/domain/src/index.ts`:
   - Replace `export {};` with two `export type` re-exports:
     - `export type { CompanyInfo, UpsertCompanyInfoInput } from './entities/company-info';`
     - `export type { CompanyInfoRepository } from './repositories/company-info.repository';`
   - The barrel ships only type-level symbols (no runtime emission). This keeps `@sfx/domain` true to its zero-runtime-deps invariant.

**Notes**
- The interface deliberately does NOT include a repository **token** (`Symbol`). F2 declares the Nest DI symbol inside the backend module (e.g. `COMPANY_INFO_REPOSITORY` in `apps/api/src/modules/company-info/`). Putting the token in `@sfx/domain` would couple domain to the Nest container's lifecycle convention, which the architecture rules forbid.
- The interface uses `Promise<…>` rather than a generic async marker so it composes cleanly with both Prisma's async API and the web data layer's expected hook return type.

### T3 — `@sfx/validation`: upsertCompanyInfoSchema + companyInfoResponseSchema

**New files**
- `packages/validation/src/schemas/company-info.schema.ts`
- `packages/validation/__tests__/schemas/company-info.schema.test.ts`

**Modified files**
- `packages/validation/src/index.ts` (add re-exports)
- `packages/validation/src/__tests__/index.test.ts` (assert the new exports)

**Test cases (write first)** — file: `__tests__/schemas/company-info.schema.test.ts`. Use `safeParse` throughout. Group tests under one `describe('upsertCompanyInfoSchema')` and one `describe('companyInfoResponseSchema')`.

`upsertCompanyInfoSchema` — happy
1. Minimal valid input: `{ legalName: 'Acme Holdings SRL' }` parses; result has `legalName === 'Acme Holdings SRL'` and every other field absent.
2. Full valid input: all 12 fields present with realistic values; parse succeeds; output deep-equals input.
3. Optional field set to `null` explicitly (e.g. `{ legalName: 'Acme', tradingName: null }`): parse succeeds; output preserves `null`.
4. Optional field as empty string for `website` only: `{ legalName: 'Acme', website: '' }` parses (per product plan §2: "URL or empty"). Output preserves `''`.

`upsertCompanyInfoSchema` — `legalName` (required, 1–200)
5. Missing `legalName` → `safeParse({}).success === false`; the issue path includes `'legalName'`.
6. `legalName: ''` (length 0) → fail.
7. `legalName` length 1 → success (boundary).
8. `legalName` length 200 → success (boundary).
9. `legalName` length 201 → fail.
10. `legalName` wrong type (number) → fail.

`upsertCompanyInfoSchema` — `tradingName` (optional, ≤200)
11. Length 200 → success.
12. Length 201 → fail.
13. Wrong type (number) → fail.

`upsertCompanyInfoSchema` — `email` (optional, RFC email)
14. Valid RFC email → success.
15. Plainly invalid (`'not-an-email'`) → fail; issue path includes `'email'`.
16. Empty string (`''`) → fail (empty string is NOT a valid email; callers should omit the key or send `null` instead).

`upsertCompanyInfoSchema` — `phone` (optional, ≤40)
17. Length 40 → success.
18. Length 41 → fail.

`upsertCompanyInfoSchema` — `website` (optional, URL **or** empty)
19. Valid `https://example.com` → success.
20. Bare hostname `example.com` → fail (Zod `.url()` semantics — no protocol = invalid).
21. Empty string `''` → success (explicit exception per §2).
22. Non-URL non-empty `'not a url'` → fail.

`upsertCompanyInfoSchema` — address group (`addressLine1`, `addressLine2` ≤200; `city` ≤100; `postalCode` ≤40; `country` ≤56)
23. Each at boundary (200/200/100/40/56) → success.
24. Each at boundary+1 → fail; issue path identifies the offending field.

`upsertCompanyInfoSchema` — registration group (`taxId`, `registrationNumber` ≤64)
25. Each at length 64 → success.
26. Each at length 65 → fail.

`upsertCompanyInfoSchema` — strict / unknown-key rejection
27. `{ legalName: 'Acme', notAField: 'value' }` → fail; issue includes `unrecognized_keys` for `'notAField'`. (The schema MUST be `.strict()`.)
28. Multiple unknown keys → fail with all of them named.

`upsertCompanyInfoSchema` — cross-field invariants
29. Currently no cross-field rules are mandated by the product plan beyond per-field constraints. The test file documents this with one explicit `it.skip('reserved for future cross-field constraints', ...)` so a future invariant has a parking spot. Do NOT mark this as a "future invariant" with a passing assertion — `it.skip` keeps coverage honest.

`companyInfoResponseSchema` — shape
30. Valid response with all fields present, `id` non-empty, `createdAt`/`updatedAt` as `Date` instances → success.
31. `id` empty string → fail.
32. `id` missing → fail.
33. `createdAt` as a string (not Date) → fail (the response schema is for outgoing API DTOs after the controller has produced JS Date objects; if the team needs an ISO-string variant, that's a separate schema in F2 and out of scope here). The schema validates the Date variant; ISO-string parsing belongs in mapping code.
34. Optional fields nullable (each optional field accepts `null` and accepts the value omitted; verify both for at least `tradingName`).
35. `companyInfoResponseSchema` rejects unknown keys (`.strict()`).
36. `data: null` envelope shape is NOT part of `companyInfoResponseSchema` — that union belongs to F2's controller DTO. This schema describes the record only.

`@sfx/validation` barrel
37. `__tests__/index.test.ts`: assert `validation.upsertCompanyInfoSchema` and `validation.companyInfoResponseSchema` are defined. Assert the schemas are Zod schemas (`expect(validation.upsertCompanyInfoSchema.parse).toBeInstanceOf(Function)`).

**Implementation steps** — file: `packages/validation/src/schemas/company-info.schema.ts`
1. First line of the file: `import '../openapi';` — establishes the `.openapi()` decoration before any schema body runs (matches the convention in `common.schema.ts`).
2. `import { z } from 'zod';`
3. Define a private helper to centralize the "optional string ≤N" shape:
   ```ts
   const optionalStringMax = (max: number, description: string) =>
     z.string().max(max).nullish().openapi({ description, example: '' });
   ```
   Use `.nullish()` (= `.nullable().optional()`) so both omitted-key and explicit-null pass.
4. Export `upsertCompanyInfoSchema`:
   ```ts
   export const upsertCompanyInfoSchema = z
     .object({
       legalName: z.string().min(1, 'Legal name is required').max(200, 'Legal name must be 200 characters or fewer'),
       tradingName: optionalStringMax(200, 'Trading name'),
       email: z.string().email('Invalid email address').nullish(),
       phone: optionalStringMax(40, 'Contact phone number'),
       website: z.union([z.string().url('Invalid website URL'), z.literal('')]).nullish(),
       addressLine1: optionalStringMax(200, 'Address line 1'),
       addressLine2: optionalStringMax(200, 'Address line 2'),
       city: optionalStringMax(100, 'City'),
       postalCode: optionalStringMax(40, 'Postal code'),
       country: optionalStringMax(56, 'Country (ISO 3166 country name)'),
       taxId: optionalStringMax(64, 'Tax identifier'),
       registrationNumber: optionalStringMax(64, 'Company registration number'),
     })
     .strict()
     .openapi({ description: 'Payload for upserting the singleton company info record' });
   ```
   `.strict()` is mandatory — the dispatch's constraint list calls it out explicitly and test 27/28 enforce it.
5. `export type UpsertCompanyInfoInput = z.infer<typeof upsertCompanyInfoSchema>;`
6. Export `companyInfoResponseSchema`:
   ```ts
   export const companyInfoResponseSchema = upsertCompanyInfoSchema
     .extend({
       id: z.string().min(1).openapi({ description: 'Unique company info record identifier', example: 'clxyz1234567890' }),
       createdAt: z.date().openapi({ description: 'Record creation timestamp' }),
       updatedAt: z.date().openapi({ description: 'Record last-update timestamp' }),
     })
     .strict()
     .openapi({ description: 'Persisted company info record' });
   ```
   `extend` re-applies the original strictness — verify behavior in test 35.
7. `export type CompanyInfoResponse = z.infer<typeof companyInfoResponseSchema>;`
8. **CRITICAL — `.refine()` lost on `.extend()`**: the project's `apps/web/CLAUDE.md` gotcha list documents that Zod silently drops `.refine()` / `.transform()` chained before a `.merge()` / `.extend()`. `upsertCompanyInfoSchema` currently has none — fine. If a future change adds a `.refine()` to `upsertCompanyInfoSchema`, the response schema must re-declare it. Add a one-line comment on the `.extend` call documenting this trap.

**Implementation steps** — barrel
9. `packages/validation/src/index.ts`: append:
   ```ts
   export { upsertCompanyInfoSchema, companyInfoResponseSchema } from './schemas/company-info.schema';
   export type { UpsertCompanyInfoInput, CompanyInfoResponse } from './schemas/company-info.schema';
   ```
10. `packages/validation/src/__tests__/index.test.ts`: extend the existing `describe('@sfx/validation barrel')` with the assertions from test 37.

**Notes**
- The schema lives at `packages/validation/src/schemas/company-info.schema.ts`, matching the singular-filename convention used by `common.schema.ts`. Do NOT pluralize.
- The `UpsertCompanyInfoInput` exported here is the same type the F1 plan asks `@sfx/domain` to expose. Make `@sfx/domain`'s `UpsertCompanyInfoInput` identical structurally — but **do not** import the Zod-inferred type from `@sfx/validation` into `@sfx/domain` (would break the dependency rule: `@sfx/domain` has zero deps). Hand-author the interface in `@sfx/domain` and let a vitest-level compile-test assert structural compatibility (test 4 in T2).
- The `email` field uses Zod's built-in `.email()`. Zod follows the RFC-5321 mailbox-spec subset — sufficient for the product-plan requirement.

---

## 3. Acceptance

### From product-plan §3 F1
- Add `AUTH_ROLE_ADMIN` to `@sfx/shared` with barrel export. ✓ T1.
- Add `CompanyInfo` entity type + `CompanyInfoRepository` interface to `@sfx/domain`. ✓ T2.
- Add `upsertCompanyInfoSchema` (input validation for both the controller pipe and the React Hook Form resolver) and `companyInfoResponseSchema` to `@sfx/validation` under `packages/validation/src/schemas/company-info.schema.ts`. ✓ T3.
- Tests at 90%+ for every package touched. ✓ T1/T2/T3 each include a test file per implementation file; the vitest config in each package enforces 90/90/90/90 globally.

### Demo state at end (product plan)
- `pnpm typecheck` is green for `@sfx/shared`, `@sfx/domain`, `@sfx/validation`, `@sfx/api`, `@sfx/web` — all packages compile against the new exports even though no consumer in `apps/` references them yet.
- `pnpm test:coverage` is green for `@sfx/shared`, `@sfx/domain`, `@sfx/validation` with ≥90% coverage in each.
- `pnpm lint` clean.
- The merge of this feature unblocks F2, F3, F4 (seeds dependency edges: `51de blocks {e4c8, 641b, 63de}`).

### Sidewide acceptance from product plan §5 — applicable items
- "The Prisma client compiles after `BoilerplatePlaceholder` is removed and the new `CompanyInfo` model is added" — **NOT in F1 scope.** F2 owns the Prisma changes.
- "Every nav item named in §2 navigates without runtime error" — not in F1 scope.
- "Backend endpoints under `/api/v1/company-info` return auth-denied / success per role" — not in F1 scope (F2).
- "`pnpm probe:smoke` passes" — F1 is library-only with no HTTP surface, so `pnpm probe:smoke` is expected to pass without invoking any new flow.

### Runtime acceptance (library-only)
F1 introduces no user-visible behavior, no HTTP surface, no page. Runtime probe coverage for the symbols this feature ships is provided by F2 and F4 when they consume the schemas / role constant / interface against real endpoints and pages. F1's verification is bounded by:
- vitest unit suites at the package level (T1/T2/T3 test cases),
- `pnpm typecheck` and `pnpm lint` across the monorepo at the close-gate,
- `pnpm probe:smoke` running clean on the unchanged HTTP surface (no new endpoints introduced).

---

## 4. Guard contract

**N/A.** F1 introduces no HTTP endpoints, no web pages, no middleware matchers, no auth boundaries. The `AUTH_ROLE_ADMIN` constant is the *string value* a Keycloak role bears — guards that consume it land in F2/F3, not F1. The Logical App Contract table is unchanged by this feature.

---

## 5. Out of scope

The builder for F1 MUST NOT touch any of the following. Discovering a need will mean the feature decomposition was wrong, which should bounce to coordinator via `ov mail send --type question`.

- No Prisma schema edits. The `CompanyInfo` model + `BoilerplatePlaceholder` removal + migration is F2.
- No `apps/api/src/modules/company-info/` directory. No NestJS controller, module, repository implementation, pipe, DTO, mapper. F2.
- No `apps/web/src/features/admin-shell/` or `apps/web/src/features/company-info/` directory. No sidebar component, no admin landing page, no route gate, no admin sub-nav. F3/F4.
- No edits to `apps/api/src/app.module.ts`, `apps/api/src/main.ts`, `apps/api/src/swagger.ts`. F2.
- No edits to `apps/web/src/app/layout.tsx`, `apps/web/src/app/admin/**`. F3/F4.
- No new translation keys in `apps/web/src/features/presentation/localization/languages/en/common.ts` or `ro/common.ts`. F3/F4 own the keys that surface user-visible strings; F1's package-level validation error messages stay in English in the Zod schemas because they are developer-facing (forwarded to the controller pipe — F4 maps them to localized form errors via the resolver).
- No edits to `.overstory/runtime-contract.flows/` — F1 is library-only and authors no flow file (per product-plan §4 dispatch plan). The drift-check hook will not flag this feature because no new controller endpoint is introduced.
- No edits to `.runtime-contract.overlay.json` or `.runtime-contract.logical.json`. The Logical App Contract is unchanged.
- No new `/login`, `/register`, local-JWT cookie code, or any removal of Keycloak / oauth2-proxy / `OAUTH_*` env vars. The auth scaffold remains untouched (auth-preservation invariant from §2 of the product plan).
- No introduction of an "all roles" enum or role union. F1 ships exactly one role constant (`AUTH_ROLE_ADMIN`); a second role arrives as its own constant when its feature lands.
- No additional cross-field refinements on `upsertCompanyInfoSchema` beyond what the product plan specifies. If a refinement is wanted, raise it via `ov mail --type question` and let the coordinator decide whether to extend F1 or open a follow-up issue.
- No package additions or version bumps. The schemas use Zod features already present in the pinned `zod 3.24.2`.

---

## 6. Dependencies + handoff

**Depends on:** nothing in-tree. F1 is the root of the feature dependency graph.

**Unblocks:**
- F2 (`sfx-webapp-boilerplate-e4c8`) — backend module imports `AUTH_ROLE_ADMIN`, `CompanyInfo`, `CompanyInfoRepository`, `upsertCompanyInfoSchema`, `companyInfoResponseSchema`, `UpsertCompanyInfoInput`.
- F3 (`sfx-webapp-boilerplate-641b`) — admin shell imports `AUTH_ROLE_ADMIN`.
- F4 (`sfx-webapp-boilerplate-63de`) — company-info page imports `upsertCompanyInfoSchema`, `CompanyInfo`, `UpsertCompanyInfoInput`.

**Builder handoff:**
- Capability suggested: `builder` (direct). One slot. No sub-workers needed.
- File scope: `packages/shared/**`, `packages/domain/**`, `packages/validation/**`. Nothing under `apps/`.
- Close-gate: `pnpm typecheck && pnpm lint && pnpm test:coverage` from the repo root. The Stop hook will enforce 90%+ coverage and the missing-test debt tracker will warn on every unpaired source file. Authoring tests in the same commit as the implementation is mandatory.

---

## 7. Notable findings (classification: tactical)

Findings the F1 builder needs but that are not load-bearing for other features.

- **tactical** — `@sfx/domain` currently ships an empty `export {};` plus a barrel test asserting `Object.keys(domain) === []`. Both must be updated together when real type-only exports land; otherwise the empty-scaffold test fails. The replacement assertion stays `[]` because all new exports are type-only (erased at runtime).
- **tactical** — `@sfx/validation` test runner aliases `@sfx/shared` and `@sfx/domain` to their `src/` directories (see `packages/validation/vitest.config.ts`). When the builder imports `AUTH_ROLE_ADMIN` from `@sfx/shared` inside a validation test, no path massaging is required.
- **tactical** — `packages/validation/src/openapi.ts` runs `extendZodWithOpenApi(z)` as a module-load side-effect. Every schema file in the package starts with `import '../openapi';` to guarantee `.openapi()` is decorated before the schema body runs. The company-info schema must follow the same convention or the `.openapi({...})` call inside the schema body will be a runtime TypeError under vitest.
- **observational** — Zod v3.24 honors `.strict()` after `.extend()`; the `companyInfoResponseSchema` test for unknown-key rejection (test 35) will catch a regression if a future Zod bump changes this behavior.
- **observational** — `apps/web/CLAUDE.md` documents a project-wide gotcha: `.refine()` / `.transform()` are silently dropped by `.merge()` / `.extend()`. `upsertCompanyInfoSchema` has none today, but the inline comment on the F3-spec `.extend(...)` call (per implementation step 8) is the cheapest safeguard against a future refinement being lost on the response schema.

End of spec.
