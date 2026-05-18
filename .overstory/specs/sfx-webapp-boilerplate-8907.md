# F1 — Expand CompanyInfo Backend (Phase-2 Chunk A backend slice)

**Task ID:** `sfx-webapp-boilerplate-8907`
**Parent plan:** `.overstory/specs/sfx-webapp-boilerplate-26a0.md` (Phase-2, §3 Chunk A, §5 J1).
**Authored by:** scout-f1-backend (2026-05-17).
**Scope (in):** Backend only — `@sfx/domain` entity, `@sfx/validation` schemas, `packages/database` Prisma schema + migration, `apps/api/src/modules/company-info` (DTO, mapper, repository, controller, integration tests).
**Scope (out):** Frontend (Chunk A frontend slice is a separate F-task). Version history (Chunk C). Admin tab shell (Chunk B). No new endpoints.

**Auth preservation (non-negotiable):** Keycloak + oauth2-proxy + RS256/JWKS stay intact. Do not invent email/password auth, `/login`, `/register`, local JWT cookies, or remove `OAUTH_*` / Keycloak / oauth2-proxy wiring. The existing `JwtAuthGuard` + `AuthRoles(AUTH_ROLE_ADMIN)` chain is reused unchanged on the existing `GET` / `PUT /api/v1/company-info` endpoints.

---

## Expanded field set (canonical)

Mirror this table across the entity, Zod schemas, Prisma model, NestJS DTO, mapper, and tests. Bounds are inclusive unless stated otherwise.

| Field              | TS type (entity)        | TS type (UpsertInput)         | Zod                                                                                              | Prisma                         | DTO swagger              |
|--------------------|-------------------------|--------------------------------|--------------------------------------------------------------------------------------------------|--------------------------------|--------------------------|
| `companyName`      | `string \| null`        | `string \| null \| undefined`  | `z.string().max(200).nullish()`                                                                  | `String?  @map("company_name")`| `type: String, nullable` |
| `foundedYear`      | `number \| null`        | `number \| null \| undefined`  | `z.number().int().min(1800).max(2027).nullish()`                                                 | `Int?     @map("founded_year")`| `type: Number, nullable` |
| `teamSize`         | `number \| null`        | `number \| null \| undefined`  | `z.number().int().min(0).max(1_000_000).nullish()`                                               | `Int?     @map("team_size")`   | `type: Number, nullable` |
| `industry`         | `string \| null`        | `string \| null \| undefined`  | `z.string().max(120).nullish()`                                                                  | `String?`                      | `type: String, nullable` |
| `missionStatement` | `string \| null`        | `string \| null \| undefined`  | `z.string().max(4000).nullish()`                                                                 | `String?  @map("mission_statement") @db.Text` | `type: String, nullable` |
| `visionStatement`  | `string \| null`        | `string \| null \| undefined`  | `z.string().max(4000).nullish()`                                                                 | `String?  @map("vision_statement")  @db.Text` | `type: String, nullable` |
| `coreValues`       | `readonly string[]`     | `readonly string[] \| undefined` (no `null` — empty array is the clear) | `z.array(z.string().min(1).max(200)).max(32).optional()` | `String[] @map("core_values")` (default `[]`) | `type: [String], isArray: true` |
| `certifications`   | `readonly string[]`     | `readonly string[] \| undefined`                              | `z.array(z.string().min(1).max(200)).max(32).optional()` | `String[]` (default `[]`)    | `type: [String], isArray: true` |

**`foundedYear` upper bound rule:** the Zod schema MUST use the literal upper bound `2027` (currentYear `2026` + 1). When the year rolls over, bump the literal in a follow-up. Reading `new Date().getFullYear()` at module load time is forbidden — it makes the schema time-dependent and breaks deterministic tests.

**Array null/undefined policy:** unlike scalar optional fields, arrays do NOT accept `null`. `undefined` ⇒ "field omitted, keep existing"; `[]` ⇒ "explicit clear". The Zod schema enforces this with `.optional()` (not `.nullish()`). Rationale: Postgres `text[]` columns default to `[]`; the null-vs-empty distinction at the API boundary is noise without product value.

**Required field unchanged:** `legalName` stays required (`min(1).max(200)`). Every Phase-1 optional field stays as-is.

---

## §A — Task breakdown (one task per file group)

Each task names exact files (paths relative to worktree root) and the change scope. No "similar to existing".

### A1 — Domain entity + upsert input

**Files (modify):**
- `packages/domain/src/entities/company-info.ts`

**Changes:**
1. Add the 8 fields to `CompanyInfo` interface in the order shown in the canonical table, between `registrationNumber` and `createdAt`. Optional scalars are `string | null` / `number | null`. Arrays are `readonly string[]` (always an array, never `null`).
2. Add the same fields to `UpsertCompanyInfoInput`. Optional scalars are `string | null | undefined` / `number | null | undefined`. Arrays are `readonly string[] | undefined`.
3. Keep the existing top-of-file comment about `string | null` semantics; append one paragraph documenting the array policy (`undefined` keeps existing, `[]` clears).

**No new files. No additional exports** (the package barrel `src/index.ts` re-exports the same types).

### A2 — Validation schemas

**Files (modify):**
- `packages/validation/src/schemas/company-info.schema.ts`

**Changes:**
1. Inside `upsertCompanyInfoSchema.object({…})`, append (after `registrationNumber`):
   ```ts
   companyName: optionalStringMax(200, 'Company display name'),
   foundedYear: z
     .number()
     .int('Founded year must be an integer')
     .min(1800, 'Founded year must be 1800 or later')
     .max(2027, 'Founded year must be no later than 2027')
     .nullish()
     .openapi({ description: 'Year the company was founded', example: 1998 }),
   teamSize: z
     .number()
     .int('Team size must be an integer')
     .min(0, 'Team size must be 0 or greater')
     .max(1_000_000, 'Team size must be 1,000,000 or fewer')
     .nullish()
     .openapi({ description: 'Approximate headcount', example: 42 }),
   industry: optionalStringMax(120, 'Industry'),
   missionStatement: optionalStringMax(4000, 'Mission statement'),
   visionStatement: optionalStringMax(4000, 'Vision statement'),
   coreValues: z
     .array(z.string().min(1, 'Core value cannot be empty').max(200, 'Each core value must be 200 characters or fewer'))
     .max(32, 'Core values list cannot exceed 32 items')
     .optional()
     .openapi({ description: 'Repeatable list of core values', example: ['Integrity', 'Craft'] }),
   certifications: z
     .array(z.string().min(1, 'Certification cannot be empty').max(200, 'Each certification must be 200 characters or fewer'))
     .max(32, 'Certifications list cannot exceed 32 items')
     .optional()
     .openapi({ description: 'Repeatable list of certifications', example: ['ISO 9001', 'SOC 2'] }),
   ```
2. The `.strict()` and `.openapi(...)` calls at the end of the object literal stay where they are. The `companyInfoResponseSchema` `.extend({...})` continues to inherit the new fields automatically — no changes required there beyond confirming the new test assertions in §B.A2 pass.
3. `optionalStringMax` already returns `z.string().max(N).nullish()`. Reuse it for every string-bounded optional. Do not introduce new helpers.

**No new files.** No export surface change (the existing inferred `UpsertCompanyInfoInput` / `CompanyInfoResponse` types pick up the new fields automatically).

### A3 — Prisma schema + migration

**Files (modify):**
- `packages/database/prisma/schema.prisma`

**Files (created by `prisma migrate dev`, do NOT hand-author the SQL — let Prisma generate it):**
- `packages/database/prisma/migrations/<timestamp>_expand_company_info_fields/migration.sql`
- updates to `packages/database/prisma/migrations/migration_lock.toml` if Prisma changes it (it should not).

**Changes:**
1. Append the following columns to `model CompanyInfo`, placed after `registrationNumber` and before `createdAt` (preserve the existing two-space alignment used in the file):
   ```prisma
   companyName        String?  @map("company_name")
   foundedYear        Int?     @map("founded_year")
   teamSize           Int?     @map("team_size")
   industry           String?
   missionStatement   String?  @map("mission_statement") @db.Text
   visionStatement    String?  @map("vision_statement")  @db.Text
   coreValues         String[] @default([]) @map("core_values")
   certifications     String[] @default([])
   ```
2. Generate the migration with **`pnpm db:migrate -- --name expand-company-info-fields`** from the worktree root. Per ml record `mx-6d88ea`: trust the per-worker `panel-bridge.mjs` to detect the new migration directory and apply it (no `stack:reset` needed). Do **not** run `prisma migrate dev` directly — go through `pnpm db:migrate`.
3. After the migration is created, run `pnpm db:generate` to refresh the Prisma client types. The `CompanyInfoRow` type alias in `apps/api/.../data/model/company-info-data-model.ts` picks up the new columns automatically.
4. Confirm migration filename matches `<UTC-yyyymmddhhmmss>_expand_company_info_fields` and the SQL inside contains `ADD COLUMN "company_name"`, `ADD COLUMN "founded_year"`, …, `ADD COLUMN "core_values" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]`, `ADD COLUMN "certifications" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]`.

**Pitfall:** `String[]` in Prisma Postgres maps to `text[] NOT NULL DEFAULT '{}'`. The mapper MUST always send arrays (never `null`/`undefined`) when including the key. See A5.

### A4 — NestJS response DTO (`@ApiProperty` with explicit `type:`)

**Files (modify):**
- `apps/api/src/modules/company-info/application/dto/company-info.dto.ts`

**Changes:**
1. Inside `class CompanyInfoDto`, append the 8 new fields between `registrationNumber` and `createdAt`:
   ```ts
   @ApiPropertyOptional({ type: String, nullable: true, description: 'Company display name', example: 'Acme' })
   declare companyName: string | null;

   @ApiPropertyOptional({ type: Number, nullable: true, description: 'Year the company was founded', example: 1998 })
   declare foundedYear: number | null;

   @ApiPropertyOptional({ type: Number, nullable: true, description: 'Approximate headcount', example: 42 })
   declare teamSize: number | null;

   @ApiPropertyOptional({ type: String, nullable: true, description: 'Industry', example: 'Manufacturing' })
   declare industry: string | null;

   @ApiPropertyOptional({ type: String, nullable: true, description: 'Mission statement', example: 'To delight customers.' })
   declare missionStatement: string | null;

   @ApiPropertyOptional({ type: String, nullable: true, description: 'Vision statement', example: 'To be the most trusted brand.' })
   declare visionStatement: string | null;

   @ApiProperty({ type: [String], isArray: true, description: 'Repeatable list of core values', example: ['Integrity', 'Craft'] })
   declare coreValues: readonly string[];

   @ApiProperty({ type: [String], isArray: true, description: 'Repeatable list of certifications', example: ['ISO 9001', 'SOC 2'] })
   declare certifications: readonly string[];
   ```
2. Every `@ApiProperty(...)` / `@ApiPropertyOptional(...)` MUST declare `type:` explicitly — per CLAUDE.md hard rule (tsx + esbuild do not emit reliable `design:type`). Arrays MUST use `type: [String]` AND `isArray: true`. Do not rely on TS inference.

**No new files.**

### A5 — Data layer mapper + Prisma upsert payload

**Files (modify):**
- `apps/api/src/modules/company-info/data/mapper/company-info.mapper.ts`

**Changes:**
1. Append the 6 new optional **scalar** keys (`companyName`, `foundedYear`, `teamSize`, `industry`, `missionStatement`, `visionStatement`) to `OPTIONAL_KEYS`. Order: place them after `registrationNumber`.
2. Extend `CompanyInfoUpsertData` to carry every new field. Arrays appear as `coreValues?: readonly string[]` / `certifications?: readonly string[]` — **no `null` member**.
3. Extend `toCompanyInfo(row)` to spread the 6 scalar fields + the 2 arrays. Arrays are surfaced as `row.coreValues ?? []` / `row.certifications ?? []` to defensively coerce any unexpected null (Prisma will return `[]` per the schema default, but the coercion makes the entity invariant explicit).
4. Inside `toPrismaUpsertData`, after the existing `OPTIONAL_KEYS` loop, append explicit array handling:
   ```ts
   if (input.coreValues !== undefined) {
     (result as Record<string, readonly string[]>).coreValues = input.coreValues;
   }
   if (input.certifications !== undefined) {
     (result as Record<string, readonly string[]>).certifications = input.certifications;
   }
   ```
   Arrays are passed through verbatim — `[]` reaches Prisma as an explicit clear; `undefined` is omitted from the upsert payload.

**No new files.**

### A6 — Controller `@ApiResponse` shapes + (no new endpoints)

**Files (touched only to re-verify, NOT modify):**
- `apps/api/src/modules/company-info/application/controllers/company-info.controller.ts`

**Changes:**
- None to the controller logic. The existing `GET` and `PUT /api/v1/company-info` endpoints, `@ApiBearerAuth('accessToken')`, `JwtAuthGuard`, `AuthRoles(AUTH_ROLE_ADMIN)`, `@ResourceCaptures(...)`, and the `ApiEnvelopeDto(CompanyInfoDto)` response type pull in the new DTO fields automatically once A4 lands.
- **Verify** (do not change) that every `@ApiResponse` (`200`, `400`, `401`, `403`) is still declared on both handlers per CLAUDE.md's contract-status rule. Per ml record `mx-7e4cf7`: singleton + `@ResourceCaptures` pattern stays.

### A7 — Repository (no changes)

**Files (touched only to re-verify, NOT modify):**
- `apps/api/src/modules/company-info/data/repositories/company-info.repository.ts`
- `apps/api/src/modules/company-info/data/repositories/company-info.tokens.ts`

**Changes:**
- None. `CompanyInfoPrismaRepository.upsertSingleton(input)` already routes `input` through `toPrismaUpsertData`. Adding fields in the mapper is sufficient; the `$transaction` body, `findFirst` / `update` / `create` calls all remain. Per ml record `mx-322b8e`: `PrismaClient` continues to be imported from `@sfx/database` (not `@prisma/client`) in the data model.

### A8 — Integration test additions (supertest)

**Files (modify):**
- `apps/api/src/modules/company-info/__integration__/company-info.integration-test.ts`

**Changes:**
1. Reuse the existing `TestAuthGuard` override pattern (ml record `mx-31967f`).
2. Append the new describe blocks listed in §B.A8 (one per acceptance bullet from §C). Do not refactor existing tests.
3. **No** `prisma.companyInfoVersion.deleteMany()` cleanup — version history is Chunk C, out of scope.

### A9 — Unit test files (per-source-file colocated)

Per CLAUDE.md test colocation requirement and ml record `mx-5900ce`, every modified source file must have its `__tests__/<name>.test.(ts|tsx)` updated. Files (already exist; extend in place):

- `packages/domain/src/entities/__tests__/company-info.test.ts`
- `packages/validation/src/schemas/__tests__/company-info.schema.test.ts`
- `apps/api/src/modules/company-info/application/dto/__tests__/company-info.dto.test.ts`
- `apps/api/src/modules/company-info/data/mapper/__tests__/company-info.mapper.test.ts`

(Repository, controller, module, pipe, and integration test files already exist — see §B for the specific cases to add inside each.)

---

## §B — TDD plan per task (failing test first, then implementation)

Coverage gate: 90%+ statements/branches/functions/lines per `pnpm test:coverage`. Every new optional field MUST have at least: (a) accepted-at-upper-bound, (b) rejected-above-upper-bound, (c) accepted-as-null/omitted, (d) `legalName + this field only` round-trip in mapper. Integers also need a non-integer (decimal) rejection case; arrays also need a per-item bound case and a count-bound case.

### B.A1 — Domain entity tests

**File:** `packages/domain/src/entities/__tests__/company-info.test.ts`

Add the following `it(...)` cases to the existing `describe("CompanyInfo", ...)` block.

1. `it("compiles with the expanded scalar + array field set")` — extend the `sample` literal with every new field populated (`companyName: 'Acme Display'`, `foundedYear: 1998`, `teamSize: 42`, `industry: 'Manufacturing'`, `missionStatement: 'M'`, `visionStatement: 'V'`, `coreValues: ['Integrity', 'Craft']`, `certifications: ['ISO 9001']`). Assert each.
2. `it("permits scalar optionals as null while arrays default to empty")` — `companyName: null`, `foundedYear: null`, `teamSize: null`, `industry: null`, `missionStatement: null`, `visionStatement: null`, `coreValues: []`, `certifications: []`. Assert `sample.coreValues.length === 0` and scalars are `null`.
3. `it("type-only check: TS rejects null for an array field")` — `// @ts-expect-error` line assigning `null` to `coreValues` in a typed literal. Asserts the type-system invariant.

**Implementation step:** Edit `company-info.ts` per §A.A1.

### B.A2 — Validation schema tests

**File:** `packages/validation/src/schemas/__tests__/company-info.schema.test.ts`

Replace the `fullInput` literal with an extended version that includes every new field. Append the following `describe` blocks at the end of the file:

1. `describe("upsertCompanyInfoSchema — companyName (optional, ≤200)")`
   - `it("accepts length 200")`
   - `it("rejects length 201")`
   - `it("accepts null")`
   - `it("accepts undefined")`

2. `describe("upsertCompanyInfoSchema — foundedYear (integer 1800-2027)")`
   - `it("accepts 1998")`
   - `it("accepts 1800 (lower boundary)")`
   - `it("accepts 2027 (upper boundary)")`
   - `it("rejects 1799 with a foundedYear path issue")`
   - `it("rejects 2028 with a foundedYear path issue")`
   - `it("rejects 1998.5 (non-integer)")`
   - `it("rejects 'nineteen-ninety-eight' (string)")`
   - `it("accepts null")`

3. `describe("upsertCompanyInfoSchema — teamSize (integer 0-1_000_000)")`
   - `it("accepts 0 (lower boundary)")`
   - `it("accepts 1_000_000 (upper boundary)")`
   - `it("rejects -1 with a teamSize path issue")`
   - `it("rejects 1_000_001")`
   - `it("rejects 1.5 (non-integer)")`
   - `it("accepts null")`

4. `describe("upsertCompanyInfoSchema — industry (optional, ≤120)")`
   - `it("accepts length 120")`
   - `it("rejects length 121")`
   - `it("accepts null")`

5. `describe("upsertCompanyInfoSchema — missionStatement / visionStatement (optional, ≤4000)")`
   - For each field: `it("accepts length 4000")`, `it("rejects length 4001 and names the field in the issue path")`, `it("accepts null")`.

6. `describe("upsertCompanyInfoSchema — coreValues (optional string[], ≤32 items, each ≤200)")`
   - `it("accepts an empty array (explicit clear)")`
   - `it("accepts a 32-item array")`
   - `it("rejects a 33-item array with a coreValues path issue")`
   - `it("rejects an array containing a 201-char item with a coreValues.<idx> path issue")`
   - `it("rejects an array containing an empty-string item with a coreValues.<idx> path issue")`
   - `it("rejects null (arrays are .optional(), not .nullish())")`
   - `it("rejects an array containing a non-string element with a coreValues.<idx> path issue")`

7. `describe("upsertCompanyInfoSchema — certifications (optional string[], ≤32 items, each ≤200)")`
   - Mirror the `coreValues` cases (5 must-have + null-rejection + non-string-rejection).

8. Extend `describe("companyInfoResponseSchema", ...)`:
   - `it("parses a response with every new scalar and array populated")`
   - `it("accepts coreValues: [] and certifications: []")`
   - `it("rejects coreValues: null in a response (response shape mirrors the upsert shape)")`

**Implementation step:** Edit `company-info.schema.ts` per §A.A2.

### B.A3 — Prisma migration test (snapshot via type check)

There is no Vitest file for the migration SQL. The verification step is:

1. Run `pnpm db:migrate -- --name expand-company-info-fields` once locally — the bridge applies it. Confirm `pnpm stack:bridge | tail -50` shows the apply.
2. Run `pnpm db:generate` to refresh the client.
3. `pnpm --filter @sfx/api typecheck` MUST stay green — proves `PrismaClient['companyInfo']` exposes the new fields and `CompanyInfoRow` is correctly inferred.
4. Run `pnpm db:studio` once manually and confirm the new columns exist (operator check; not gated, but useful smoke).

**No new test file.** The integration tests in B.A8 are the runtime proof that the migration applied.

### B.A4 — DTO unit test

**File:** `apps/api/src/modules/company-info/application/dto/__tests__/company-info.dto.test.ts`

Append to the existing `describe("CompanyInfoDto", ...)`:

1. `it("can be assigned every new scalar and array field")` — extend the existing test by also assigning `companyName`, `foundedYear`, `teamSize`, `industry`, `missionStatement`, `visionStatement`, `coreValues: ['A', 'B']`, `certifications: ['ISO 9001']`. Assert each value round-trips.
2. `it("accepts null for every optional scalar")` — assign each new scalar as `null`. Assert each is `null`.
3. `it("accepts empty arrays for coreValues and certifications")` — assign `[]` to each. Assert `.length === 0`.

**Implementation step:** Edit `company-info.dto.ts` per §A.A4.

### B.A5 — Mapper unit tests

**File:** `apps/api/src/modules/company-info/data/mapper/__tests__/company-info.mapper.test.ts`

#### `describe("toCompanyInfo", ...)` — append:

1. `it("surfaces every new scalar from the row")` — pass a row with `companyName`, `foundedYear`, `teamSize`, `industry`, `missionStatement`, `visionStatement` populated. Assert each.
2. `it("surfaces coreValues and certifications as the row's array verbatim")` — `row.coreValues = ['A','B']`, `row.certifications = ['ISO 9001']`. Assert deep equality.
3. `it("coerces a null array column to [] (defensive)")` — manually cast a row with `coreValues: null as unknown as string[]`; assert `entity.coreValues` equals `[]`. Same for `certifications`.

#### `describe("toPrismaUpsertData", ...)` — append:

1. `it("includes coreValues when defined")` — `input.coreValues = ['A']`. `expect(data.coreValues).toEqual(['A'])`.
2. `it("includes coreValues: [] (explicit clear)")` — `input.coreValues = []`. `expect('coreValues' in data).toBe(true)` and `expect(data.coreValues).toEqual([])`.
3. `it("omits coreValues when undefined")` — input without the key. `expect('coreValues' in data).toBe(false)`.
4. Repeat the same 3 cases for `certifications`.
5. `it("passes every new scalar through unchanged when defined")` — set each of the 6 scalars to a sample value. Assert each appears in `data`.
6. `it("omits a scalar that is undefined while keeping defined ones")` — input with `foundedYear: 1998` only; assert `'companyName' in data === false`, `data.foundedYear === 1998`.
7. `it("passes null for every new optional scalar through unchanged")` — every new scalar `null`. Assert each `null` is preserved.

**Implementation step:** Edit `company-info.mapper.ts` per §A.A5.

### B.A6 — Controller unit test (verify no regression)

**File:** `apps/api/src/modules/company-info/application/controllers/__tests__/company-info.controller.test.ts`

Verify (no change required if already passing) that the controller test passes with the expanded DTO. If the existing happy-path test pins to a specific `CompanyInfoDto` shape, extend the `mockReturnValue` to include the new fields.

### B.A7 — Repository unit test (verify no regression)

**File:** `apps/api/src/modules/company-info/data/repositories/__tests__/company-info.repository.test.ts`

Add **one** new test:
- `it("forwards every expanded field through toPrismaUpsertData into the upsert payload")` — mock `prisma.$transaction` to call its callback with a `tx` whose `companyInfo.findFirst` returns `null`. Invoke `repo.upsertSingleton({ legalName: 'Co', companyName: 'D', foundedYear: 1998, teamSize: 5, industry: 'X', missionStatement: 'M', visionStatement: 'V', coreValues: ['A'], certifications: ['B'] })`. Assert `tx.companyInfo.create` was called with `data` containing every field. Behavior — not implementation — is the assertion.

### B.A8 — Integration test additions (supertest, real Prisma)

**File:** `apps/api/src/modules/company-info/__integration__/company-info.integration-test.ts`

Inside the existing `describe("PUT /api/v1/company-info", ...)` block, append:

1. `it("creates the singleton with every expanded field on first PUT")` —
   PUT body includes every required + new optional field with valid values. Expect `200`. Assert `res.body.data` has every field echoed. Then `prisma.companyInfo.findFirst()` and assert the row has each new column populated.

2. `it("returns 400 with a foundedYear path issue when foundedYear is non-integer")` — body `{ legalName: 'Acme', foundedYear: 1998.5 }`. Expect `400` with `error.errors[].field === 'foundedYear'`.

3. `it("returns 400 with a teamSize path issue when teamSize is negative")` — body `{ legalName: 'Acme', teamSize: -1 }`. Expect `400` with `error.errors[].field === 'teamSize'`.

4. `it("returns 400 with a coreValues path issue when coreValues has > 32 items")` — body `{ legalName: 'Acme', coreValues: Array.from({length:33}, (_,i) => 'v'+i) }`. Expect `400` with `error.errors[].field === 'coreValues'`.

5. `it("returns 400 with a coreValues.<idx> path issue when an item exceeds 200 chars")` — body `{ legalName: 'Acme', coreValues: ['ok', 'x'.repeat(201)] }`. Expect `400` with an error whose `field` starts with `coreValues`.

6. `it("returns 400 when coreValues contains a non-string element")` — body `{ legalName: 'Acme', coreValues: ['ok', 12345] }`. Expect `400`.

7. `it("returns 400 when missionStatement exceeds 4000 characters")` — body `{ legalName: 'Acme', missionStatement: 'x'.repeat(4001) }`. Expect `400` with `error.errors[].field === 'missionStatement'`.

8. `it("treats coreValues: [] as an explicit clear on a subsequent PUT")` — first PUT writes `coreValues: ['A','B']`. Second PUT body `{ legalName: 'Acme', coreValues: [] }`. Expect `200` and `res.body.data.coreValues` is `[]`.

9. `it("treats coreValues omitted as unchanged on a subsequent PUT")` — first PUT writes `coreValues: ['A','B']`. Second PUT body `{ legalName: 'Acme', companyName: 'Renamed' }` (no `coreValues` key). Expect `200` and `res.body.data.coreValues` is `['A','B']`.

10. `it("treats every new optional scalar's null as an explicit clear")` — seed with all fields populated. PUT with each new scalar set to `null`. Expect `200`; each `res.body.data.<field>` is `null`.

Auth-boundary tests already exist for the `GET` / `PUT` endpoints; no new auth tests are required since F1 adds no new endpoints. (See `task-e4c8:put-unauth-rejected`, `task-e4c8:put-non-admin-forbidden`, `task-e4c8:get-unauth-rejected`, `task-e4c8:get-non-admin-forbidden` in the Phase-1 flow file `.overstory/runtime-contract.flows/sfx-webapp-boilerplate-e4c8.json`.)

### B.A9 — Schema module barrel + openapi generation

Verify `packages/validation/src/openapi.ts` continues to emit a valid OpenAPI document for the expanded schema. Run `pnpm --filter @sfx/validation test`. If the package's existing `__tests__/openapi.test.ts` snapshots the generated spec, accept the snapshot update — it is expected to change. Inspect the diff for: every new property present, `nullable: true` set on every `.nullish()` scalar, `type: integer` for `foundedYear` and `teamSize`, `type: array` for `coreValues` / `certifications`.

---

## §C — Runtime acceptance (backend-side, from product-plan §5 J1)

Copied verbatim and pruned to F1-backend-only bullets:

- **PUT `/api/v1/company-info`** with a valid payload containing every new field (`companyName`, `foundedYear`, `teamSize`, `industry`, `missionStatement`, `visionStatement`, `coreValues: ['a','b','c']`, `certifications: ['x','y']`) returns `200` with a body matching `companyInfoResponseSchema` and every new field echoed.
- The same payload is observable via **GET `/api/v1/company-info`** immediately after.
- **PUT** with `legalName` missing or empty returns `400` and the envelope `{ success:false, error:{ statusCode:400, message:'Validation failed', errors:[{ field:'legalName', message:'Legal name is required' }] } }`.
- **PUT** with `foundedYear: 'not-a-number'` returns `400` with a `foundedYear` field error.
- **PUT** with `foundedYear: 1998.5` returns `400` with a `foundedYear` field error (non-integer).
- **PUT** with `teamSize: -1` returns `400` with a `teamSize` field error.
- **PUT** with `website: 'not-a-url'` returns `400` with a `website` field error (Phase-1 behavior; verified preserved).
- **PUT** with `coreValues: ['ok', 12345]` (mixed types) returns `400` with a `coreValues` field error.
- **PUT** with `coreValues` containing 33 items returns `400`.
- **PUT** with `missionStatement` longer than 4000 chars returns `400`.
- After two successful **PUT**s with different values, **GET** returns the latest values (singleton update semantics from Phase-1 hold for the expanded fields).

Frontend-only acceptance (pending toast, submit-button transitions, hard-refresh persistence) is **NOT** in F1. It is covered by the frontend slice of Chunk A.

---

## §D — Guard contract per endpoint

No new endpoints. The two existing routes carry the unchanged guard chain.

| Route                              | Visibility   | Unauth response | Non-admin response | Notes                                                                                                                                                                                  |
|------------------------------------|--------------|-----------------|--------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `GET /api/v1/company-info`         | authenticated, admin-only | `401` | `403`             | `@UseGuards(JwtAuthGuard)` + `@AuthRoles(AUTH_ROLE_ADMIN)` on the controller class. Body is `{ success:true, data: CompanyInfoDto \| null }`.                                          |
| `PUT /api/v1/company-info`         | authenticated, admin-only | `401` | `403`             | Same guard chain. Body is `{ success:true, data: CompanyInfoDto }`. `@ResourceCaptures({ fromPath: 'id', resource: 'companyInfo', pathParam: 'id' })` stays on the handler.            |

The `JwtAuthGuard` continues to validate the RS256 / JWKS bearer issued by Keycloak via oauth2-proxy. The `AuthRoles` decorator continues to assert `AUTH_ROLE_ADMIN` from `@sfx/shared`.

**Probe coverage:** the existing Phase-1 flow file under `.overstory/runtime-contract.flows/` (task `e4c8`, owning the `company-info` resource) already covers the auth boundaries for both endpoints. F1's Zod schema changes auto-extend the validation flows generated by the flows-generator (see CLAUDE.md "Runtime flow coverage"). The builder MUST NOT edit the generated flows file and MUST NOT add new flow files under `.overstory/runtime-contract.flows/` — F1 ownership is read-only on that folder. If the probe disagrees with the new code, mail the lead per the `flow-failure-response` skill.

---

## Contract annotations to maintain (per project rule)

These are the files the builder must keep up-to-date so the runtime-contract compiler and flows-generator stay accurate on every commit:

- **Zod schemas with `.openapi(...)`**: `packages/validation/src/schemas/company-info.schema.ts` — every new field must carry a `description` and `example`. Empty arrays in `example: []` are acceptable; provide a representative two-element example where possible.
- **NestJS Swagger decorators**: `apps/api/src/modules/company-info/application/dto/company-info.dto.ts` — every `@ApiProperty` / `@ApiPropertyOptional` MUST declare `type:` explicitly (CLAUDE.md hard rule).
- **NestJS guards / role decorators**: `apps/api/src/modules/company-info/application/controllers/company-info.controller.ts` — `@UseGuards(JwtAuthGuard)`, `@AuthRoles(AUTH_ROLE_ADMIN)`, `@ApiBearerAuth('accessToken')` stay attached at the controller class. Each handler keeps its full `@ApiResponse` set (`200`, `400` for PUT, `401`, `403`).
- **Auth-roles constant**: `packages/shared/src/auth-roles.ts` — unchanged. `AUTH_ROLE_ADMIN` re-exported from `@sfx/shared`.
- **Logical contract**: unchanged. No new logical rows. The existing `protected-api` row covers both endpoints.
- **Runtime overlay**: `.runtime-contract.overlay.json` — unchanged. F1 introduces no new visible page tokens.

**Do NOT touch:** the generated flows file (write-locked), the logical contract file (no new rows needed), or the Phase-1 flow file `sfx-webapp-boilerplate-e4c8.json` under `.overstory/runtime-contract.flows/`. F1 does not author a new flow file — the flows-generator picks up the schema changes.

---

## File scope (exclusive ownership for the F1 builder)

The builder may modify **only** the following files (paths relative to worktree root):

- `packages/domain/src/entities/company-info.ts`
- `packages/domain/src/entities/__tests__/company-info.test.ts`
- `packages/validation/src/schemas/company-info.schema.ts`
- `packages/validation/src/schemas/__tests__/company-info.schema.test.ts`
- `packages/database/prisma/schema.prisma`
- `packages/database/prisma/migrations/<timestamp>_expand_company_info_fields/` (created by `pnpm db:migrate`)
- `apps/api/src/modules/company-info/application/dto/company-info.dto.ts`
- `apps/api/src/modules/company-info/application/dto/__tests__/company-info.dto.test.ts`
- `apps/api/src/modules/company-info/data/mapper/company-info.mapper.ts`
- `apps/api/src/modules/company-info/data/mapper/__tests__/company-info.mapper.test.ts`
- `apps/api/src/modules/company-info/data/repositories/__tests__/company-info.repository.test.ts` (extend only — see B.A7)
- `apps/api/src/modules/company-info/application/controllers/__tests__/company-info.controller.test.ts` (extend only if existing mock data needs the new fields)
- `apps/api/src/modules/company-info/__integration__/company-info.integration-test.ts`

For changes anywhere else, the builder mails the lead.

---

## Recommended `ml prime` / skill invocations for the builder

- `ml prime --files apps/api/src/modules/company-info/**/*.ts packages/validation/src/schemas/company-info.schema.ts packages/database/prisma/schema.prisma` — loads relevant records before the first edit.
- Skills to invoke before authoring the matching artifact:
  - `build-verifiable-features` — `@ResourceCaptures`, `@Inject(TOKEN)`, `@ApiProperty(type:)` patterns (tsx + esbuild meta-principle (B)).
  - `nestjs-probe-coverage` — `@ApiResponse` set, cookie / bearer-auth declarations, contract status reachability.
  - `clean-architecture` — module layer boundaries.
  - `env-resolution` — no env additions for F1, but invoke if `.env.example` or `apps/api/.env` would otherwise be touched (it should not be).

---

## Notable findings surfaced during scout (suggested classification)

1. **(foundational)** Mulch already records the singleton + `@ResourceCaptures` pattern (`mx-7e4cf7`) and the `@sfx/database` import rule (`mx-322b8e`). The expanded F1 work re-applies both; no new convention is being introduced.
2. **(foundational)** `optionalStringMax(max, description)` helper in `company-info.schema.ts` already factors the `.string().max().nullish().openapi(...)` pattern. Builder reuses it for every new string scalar — do not introduce a new helper.
3. **(tactical)** The existing `OPTIONAL_KEYS` array in `company-info.mapper.ts` is a `ReadonlyArray<keyof UpsertCompanyInfoInput>` typed against the canonical union. Adding scalar keys to it is structurally safe; arrays MUST stay out of that loop because their semantics differ (`undefined` vs `[]` — no `null` member).
4. **(observational)** `mx-6d88ea` (panel-bridge auto-applies new migration dirs) is freshly recorded; trust it and avoid `stack:reset`.
5. **(observational)** Phase-1 flow file `sfx-webapp-boilerplate-e4c8.json` `owns` the `company-info` resource. F1 inherits that ownership for probe purposes — no F1-specific flow file is needed because no new endpoints are introduced. The flows-generator extends the validation flow set automatically from the new Zod schema.
6. **(tactical)** `foundedYear` upper bound is hard-coded to `2027` (= currentYear `2026` + 1, per dispatch). Reading `new Date().getFullYear()` at module load is forbidden — it breaks deterministic tests and makes the schema time-dependent. The bound is updated by hand in a follow-up when the calendar rolls.

---

## Acceptance checklist (builder runs at close-gate)

- [ ] `pnpm typecheck` green (root).
- [ ] `pnpm lint` green (root).
- [ ] `pnpm test:coverage` green at ≥ 90% statements/branches/functions/lines for every touched file.
- [ ] `pnpm test:integration` green (company-info module).
- [ ] `pnpm db:migrate -- --name expand-company-info-fields` produced exactly one new migration directory; `pnpm stack:bridge | tail -50` shows the apply.
- [ ] `pnpm db:generate` ran; `apps/api/typecheck` still passes against the regenerated client.
- [ ] `pnpm probe:smoke` green on the F1 branch. Include the JSON summary as the `## runtime-evidence` block in `worker_done` mail.
- [ ] No new files outside the file scope above. No edits to the generated flows file, the logical contract file, or any file under `.overstory/runtime-contract.flows/**`.
