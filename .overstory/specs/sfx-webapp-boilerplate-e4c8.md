# Feature spec — F2 CompanyInfo backend module (Prisma + Nest)

Top-level issue: `sfx-webapp-boilerplate-c33f`. Feature issue: `sfx-webapp-boilerplate-e4c8`.
Source product-plan: `.overstory/specs/sfx-webapp-boilerplate-c33f.md` (§2 "Domain entities introduced" + "Backend HTTP surface", §3 F2, §5 J3/J4/J5 + Sidewide).
F1 spec: `.overstory/specs/sfx-webapp-boilerplate-51de.md`.
Mode: direct-builder. Backend-only feature — Prisma model + first real migration + one NestJS module under `/api/v1/company-info`.

F2 ships the HTTP surface that F4 consumes. F3 may merge in parallel with F2; F4 is blocked on both.

---

## 1. Context (files read)

### Product + dispatch
- `.overstory/specs/sfx-webapp-boilerplate-c33f.md` §2 (Domain entities introduced, Backend HTTP surface), §3 F2, §5 (J3/J4/J5 + Sidewide).
- `.overstory/specs/sfx-webapp-boilerplate-51de.md` — F1 spec; confirms imported symbol names + shapes (`AUTH_ROLE_ADMIN`, `CompanyInfo`, `CompanyInfoRepository`, `UpsertCompanyInfoInput`, `upsertCompanyInfoSchema`, `companyInfoResponseSchema`).

### Prisma + database
- `packages/database/prisma/schema.prisma` — currently contains `BoilerplatePlaceholder`. Header comment instructs: delete placeholder + flows.config.json entry when first real feature lands. F2 is that feature.
- `packages/database/prisma/seed.ts` — no-op for baseline; not modified.
- `packages/database/src/client.ts` — singleton `prisma` from `globalThis` cache. Repository imports via `@sfx/database`.
- `packages/database/src/index.ts` — barrel exports `prisma` + `PrismaClient`. No new exports needed.
- `packages/database/package.json` — `prisma generate` runs in `build` + `postinstall`; bridge auto-applies new migration directories.
- `flows.config.json` — `resourceGraph.ignoreModels: ["BoilerplatePlaceholder"]`. F2 removes both model and entry in one commit.

### F1 packages (read-only consumers)
- `packages/shared/src/index.ts` — F1 adds `export { AUTH_ROLE_ADMIN } from './auth-roles';`.
- `packages/domain/src/index.ts` — F1 replaces `export {};` with type exports of `CompanyInfo`, `UpsertCompanyInfoInput`, `CompanyInfoRepository`.
- `packages/validation/src/index.ts` — F1 re-exports `upsertCompanyInfoSchema`, `companyInfoResponseSchema`, `UpsertCompanyInfoInput`, `CompanyInfoResponse`.

### NestJS API patterns (templates F2 mirrors)
- `apps/api/src/app.module.ts` — module registration list. F2 appends `CompanyInfoModule`.
- `apps/api/src/main.ts` — global prefix `api/v1`, `helmet`, CORS, `cookieParser`, global `GlobalExceptionFilter`, global `TransformInterceptor`, Swagger `/api/docs`.
- `apps/api/src/swagger.ts` — `addBearerAuth(..., 'accessToken')` registers bearer scheme.
- `apps/api/src/common/dto/envelope.dto.ts` — `ApiEnvelopeDto(DataDto)` factory used on `@ApiResponse({ status: 200, type: ApiEnvelopeDto(...) })`.
- `apps/api/src/common/filters/http-exception.filter.ts` — error envelope `{ success: false, error: { statusCode, message, errors? } }`. F2's 400 uses `BadRequestException({ message, errors })`.
- `apps/api/src/common/interceptors/transform.interceptor.ts` — success envelope `{ success: true, data }`. Controllers return raw data.
- `apps/api/src/common/auth/auth-token.service.ts` — Keycloak JWT verifier; extracts `subject`, `email`, `roles`.
- `apps/api/src/common/guards/jwt-auth.guard.ts` — extracts bearer; reads `AUTH_ROLES_KEY`; throws `ForbiddenException` on missing role. **Single guard** handles 401 + 403.
- `apps/api/src/common/decorators/auth-roles.decorator.ts` — `AuthRoles(...roles: string[])`.
- `apps/api/src/common/decorators/resource-captures.decorator.ts` — declares chainable resource identifiers.
- `apps/api/src/common/pipes/zod-validation.pipe.ts` — `ZodValidationPipe<T>(schema)` throws `BadRequestException({ message: 'Validation failed', errors: [{ field, message }] })`.
- `apps/api/src/modules/auth/**` — pattern for module + controller + DTO + tests. Class-level `@UseGuards` + `@ApiBearerAuth`; `@ApiProperty({ type: ... })` on every field.
- `apps/api/src/modules/health/**` — minimal module shape (controllers-only).

### Logical contract + flow surface (informational; F2 does NOT edit)
- `.runtime-contract.overlay.json` / `.runtime-contract.logical.json` — not edited.
- `.overstory/runtime-contract.flows/` — per-task flow file for F2 authored by lead (= coordinator in direct-builder mode) BEFORE builder spawns. Builder may not edit.

---

## 2. Task breakdown

Four file-groups, sequenced. Each group ships tests + implementation in the same commit.

### T1 — Prisma schema swap + first migration

**Modified files**
- `packages/database/prisma/schema.prisma` (delete `BoilerplatePlaceholder`, add `CompanyInfo`, drop placeholder header comments)
- `flows.config.json` (remove `"BoilerplatePlaceholder"` from `resourceGraph.ignoreModels`; leave `[]`)

**Generated files** (via `pnpm db:migrate -- --name company_info`)
- `packages/database/prisma/migrations/<timestamp>_company_info/migration.sql`
- `packages/database/prisma/migrations/migration_lock.toml` (if not present)

**Test cases**
None for the schema itself. Coverage via T3 repository tests + T4 controller tests + `pnpm probe:smoke`.

**Implementation steps**
1. Edit `packages/database/prisma/schema.prisma`:
   - Remove `model BoilerplatePlaceholder { ... }` block + placeholder header docblock paragraphs.
   - Add:
     ```prisma
     model CompanyInfo {
       id                 String   @id @default(cuid())
       legalName          String   @map("legal_name")
       tradingName        String?  @map("trading_name")
       email              String?
       phone              String?
       website            String?
       addressLine1       String?  @map("address_line1")
       addressLine2       String?  @map("address_line2")
       city               String?
       postalCode         String?  @map("postal_code")
       country            String?
       taxId              String?  @map("tax_id")
       registrationNumber String?  @map("registration_number")
       createdAt          DateTime @default(now()) @map("created_at")
       updatedAt          DateTime @updatedAt        @map("updated_at")

       @@map("company_info")
     }
     ```
2. Edit `flows.config.json`: remove `"BoilerplatePlaceholder"` from `resourceGraph.ignoreModels`. Result: `"ignoreModels": []`.
3. Run `pnpm db:migrate -- --name company_info` from worktree root. Bridge auto-applies. Commit `migrations/` directory.
4. Run `pnpm db:generate` (idempotent after migrate).
5. DO NOT edit `packages/database/prisma/seed.ts` — F2's demo state starts empty.

**Notes**
- Singleton is **application-enforced**, not DB-enforced. No unique index. Repository's `findFirst → update OR create` inside `$transaction` handles it.
- `cuid()` matches existing precedent + `companyInfoResponseSchema` example.
- `@updatedAt` auto-bumps on every `update`. `create` path receives initial `updatedAt = now()`.

### T2 — Domain → Prisma mapper

**New files**
- `apps/api/src/modules/company-info/data/mapper/company-info.mapper.ts`
- `apps/api/src/modules/company-info/data/mapper/__tests__/company-info.mapper.test.ts`
- `apps/api/src/modules/company-info/data/model/company-info-data-model.ts` — type alias re-exporting Prisma's `CompanyInfo` as `CompanyInfoRow`.

**Test cases**
1. `toCompanyInfo(row)` with every field populated → returns `CompanyInfo` deep-equal (dates as `Date`).
2. `toCompanyInfo(row)` with null optionals → returns `CompanyInfo` with null optionals (not undefined).
3. `toPrismaUpsertData(input)` with `legalName` only → keys with `undefined` value **omitted**.
4. `toPrismaUpsertData(input)` with every optional set to non-null string → record with every key passed through.
5. `toPrismaUpsertData(input)` with explicit `null` on every optional → record with each optional set to `null`.
6. `toPrismaUpsertData(input)` does NOT include `id`, `createdAt`, `updatedAt`.

**Implementation steps**
1. `data/model/company-info-data-model.ts`:
   ```ts
   import type { CompanyInfo as PrismaCompanyInfo } from '@prisma/client';
   export type CompanyInfoRow = PrismaCompanyInfo;
   ```
2. `data/mapper/company-info.mapper.ts`:
   - `toCompanyInfo(row: CompanyInfoRow): CompanyInfo` — passthrough.
   - `toPrismaUpsertData(input: UpsertCompanyInfoInput)`:
     ```ts
     const result: Record<string, unknown> = { legalName: input.legalName };
     const optionalKeys = ['tradingName','email','phone','website','addressLine1','addressLine2','city','postalCode','country','taxId','registrationNumber'] as const;
     for (const key of optionalKeys) {
       const value = input[key];
       if (value !== undefined) result[key] = value;
     }
     return result;
     ```

### T3 — Repository implementation

**New files**
- `apps/api/src/modules/company-info/data/repositories/company-info.repository.ts`
- `apps/api/src/modules/company-info/data/repositories/__tests__/company-info.repository.test.ts`
- `apps/api/src/modules/company-info/data/repositories/company-info.tokens.ts` — exports `COMPANY_INFO_REPOSITORY = Symbol(...)` and `PRISMA_CLIENT = Symbol(...)`.

**Test cases** (mock Prisma shim, no real DB)

`findSingleton`
1. `findFirst` returns a row → returns mapped `CompanyInfo`. One call to `findFirst`, no `where`.
2. `findFirst` returns `null` → returns `null`. No `create` or `update`.
3. `findFirst` rejects with unknown error → propagates.

`upsertSingleton`
4. `findFirst` returns `null` → calls `prisma.companyInfo.create({ data: mapped })` once. Mapped data excludes `id`/`createdAt`/`updatedAt`. Returns mapped result.
5. `findFirst` returns row with `id: 'cuid-1'` → calls `prisma.companyInfo.update({ where: { id: 'cuid-1' }, data: mapped })` once. Returns mapped result.
6. The find + write pair runs inside `prisma.$transaction(async (tx) => …)`. Assert via spy on `$transaction`.
7. Input with `tradingName: null` → Prisma write receives `tradingName: null`.
8. Input missing `tradingName` (undefined) → Prisma write OMITS `tradingName`.
9. Inner `update` rejects → propagates.

**Implementation**
```ts
@Injectable()
export class CompanyInfoPrismaRepository implements CompanyInfoRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  async findSingleton(): Promise<CompanyInfo | null> {
    const row = await this.prisma.companyInfo.findFirst();
    return row ? toCompanyInfo(row) : null;
  }

  async upsertSingleton(input: UpsertCompanyInfoInput): Promise<CompanyInfo> {
    const data = toPrismaUpsertData(input);
    const row = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.companyInfo.findFirst();
      return existing
        ? tx.companyInfo.update({ where: { id: existing.id }, data })
        : tx.companyInfo.create({ data });
    });
    return toCompanyInfo(row);
  }
}
```

**Notes**
- `findFirst` (no order clause) is sufficient — application enforces singleton-ness.
- `$transaction` mandatory to avoid concurrent first-upsert duplicate-row race.
- Repository depends on `PRISMA_CLIENT` token, not direct import — enables test substitution.

### T4 — Application layer + module wiring

**New files**
- `apps/api/src/modules/company-info/application/dto/company-info.dto.ts`
- `apps/api/src/modules/company-info/application/pipes/upsert-company-info.pipe.ts`
- `apps/api/src/modules/company-info/application/controllers/company-info.controller.ts`
- `apps/api/src/modules/company-info/application/controllers/__tests__/company-info.controller.test.ts`
- `apps/api/src/modules/company-info/application/pipes/__tests__/upsert-company-info.pipe.test.ts`
- `apps/api/src/modules/company-info/company-info.module.ts`
- `apps/api/src/modules/company-info/index.ts` — barrel exporting `CompanyInfoModule` only.

**Modified files**
- `apps/api/src/app.module.ts` (append `CompanyInfoModule` to imports)

**Test cases**

`upsert-company-info.pipe.test.ts`
1. Valid input → returns parsed value typed `UpsertCompanyInfoInput`.
2. Missing `legalName` → throws `BadRequestException` with body `{ message: 'Validation failed', errors: [{ field: 'legalName', message: <zod> }] }`.
3. `website` non-URL non-empty → throws; error path includes `'website'`.
4. Unknown key → throws (schema is `.strict()`).

`company-info.controller.test.ts`
5. `getCompanyInfo`: repo resolves `null` → returns `null`.
6. `getCompanyInfo`: repo resolves persisted record → returns it.
7. `getCompanyInfo`: repo rejects → propagates.
8. `upsertCompanyInfo`: calls `repo.upsertSingleton(input)` once with same payload; returns repo's resolved value.
9. `upsertCompanyInfo`: repo rejects → propagates.
10. Source-string asserts: controller file contains `@ApiBearerAuth('accessToken')`, `@UseGuards(JwtAuthGuard)`, `@AuthRoles(AUTH_ROLE_ADMIN)`.
11. Source-string asserts: controller file contains `@ApiResponse({ status: 200 })`, `400`, `401`, `403` for both endpoints.
12. Source-string asserts: PUT contains `@ResourceCaptures(` with `fromPath` + `resource: 'companyInfo'`.

**Implementation**

`dto/company-info.dto.ts` — class with every `@ApiProperty({ type: String, ... })` (nullable: true for optional). Every field declares explicit `type:`.

`pipes/upsert-company-info.pipe.ts`:
```ts
@Injectable()
export class UpsertCompanyInfoPipe extends ZodValidationPipe<UpsertCompanyInfoInput> {
  constructor() { super(upsertCompanyInfoSchema); }
}
```

`controllers/company-info.controller.ts`:
```ts
@ApiTags('company-info')
@Controller('company-info')
@UseGuards(JwtAuthGuard)
@AuthRoles(AUTH_ROLE_ADMIN)
@ApiBearerAuth('accessToken')
export class CompanyInfoController {
  constructor(
    @Inject(COMPANY_INFO_REPOSITORY)
    private readonly repository: CompanyInfoRepository,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get the singleton company info record (or null if not yet created)' })
  @ApiResponse({ status: 200, description: 'Singleton record or null', type: ApiEnvelopeDto(CompanyInfoDto) })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  @ApiResponse({ status: 403, description: 'Authenticated user lacks the admin role' })
  async getCompanyInfo(): Promise<CompanyInfo | null> {
    return this.repository.findSingleton();
  }

  @Put()
  @ApiOperation({ summary: 'Upsert the singleton company info record' })
  @ApiResponse({ status: 200, description: 'Persisted record after upsert', type: ApiEnvelopeDto(CompanyInfoDto) })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  @ApiResponse({ status: 403, description: 'Authenticated user lacks the admin role' })
  @ResourceCaptures({ fromPath: 'id', resource: 'companyInfo', pathParam: 'id' })
  async upsertCompanyInfo(
    @Body(UpsertCompanyInfoPipe) input: UpsertCompanyInfoInput,
  ): Promise<CompanyInfo> {
    return this.repository.upsertSingleton(input);
  }
}
```

`company-info.module.ts`:
```ts
@Module({
  imports: [ConfigModule],
  controllers: [CompanyInfoController],
  providers: [
    AuthTokenService,
    JwtAuthGuard,
    UpsertCompanyInfoPipe,
    { provide: PRISMA_CLIENT, useValue: prisma },
    { provide: COMPANY_INFO_REPOSITORY, useClass: CompanyInfoPrismaRepository },
  ],
})
export class CompanyInfoModule {}
```

Register in `app.module.ts`.

**Notes**
- `@ResourceCaptures({ fromPath: 'id', ... })` reads the unwrapped response (TransformInterceptor wraps after capture).
- GET returns `null` (not 404) on empty table — simplifies frontend load path.
- Class-level decorators apply to all methods via `Reflector.getAllAndOverride([handler, class])`.

---

## 3. Acceptance

### From product-plan §3 F2 (Features within)
All bullets from feature plan §3 F2 covered by T1–T4 above.

### Demo state at end (product plan)
- `curl /api/v1/company-info` without bearer → 401.
- `curl /api/v1/company-info` with non-admin bearer → 403.
- `curl /api/v1/company-info` with admin bearer on empty DB → 200 `{ success: true, data: null }`.
- `PUT /api/v1/company-info` with admin bearer + valid body → 200 with persisted record.
- Subsequent `GET` → 200 with persisted record (not null).

### Runtime acceptance (binds journeys)
**J3** (admin edits and saves) — backend slice:
- Valid PUT returns 200 with persisted record.
- Invalid PUT returns 400 with per-field errors.
- Missing/bad bearer → 401.
- Authed non-admin → 403.

**J4** (non-admin attempts admin URL) — backend slice:
- Any singleton-endpoint call from non-admin returns 403 (defense in depth).

**J5** (unauthenticated visitor) — backend slice:
- Singleton-endpoint calls from unauthenticated session → 401.

### Sidewide acceptance from product-plan §5
- Backend endpoints under `/api/v1/company-info` return auth-denied for unauth, auth-denied for authed-non-admin, success for authed admin.
- Prisma client compiles after `BoilerplatePlaceholder` removed and `CompanyInfo` added; api boots.
- `pnpm probe:smoke` passes.

### Close-gate compatibility
- `pnpm typecheck` — green across monorepo (F2 imports F1; F1 merged first).
- `pnpm lint` — zero errors.
- `pnpm test:coverage` — ≥90% per file for new module.
- `pnpm probe:smoke` — green against booted stack.

---

## 4. Guard contract

Two HTTP surfaces, both under `/api/v1/company-info`. Both **authenticated AND role-restricted to `AUTH_ROLE_ADMIN`** (Keycloak role `admin`).

| Method | Path | Surface | Unauth | Authed non-admin | Authed admin |
|---|---|---|---|---|---|
| GET | `/api/v1/company-info` | authenticated + role-restricted | 401 | 403 (`"Missing required role"`) | 200 `{ success: true, data: CompanyInfo \| null }` |
| PUT | `/api/v1/company-info` | authenticated + role-restricted | 401 | 403 | 200 valid body; 400 invalid body |

Auth scheme: bearer (`@ApiBearerAuth('accessToken')`) via existing Keycloak `OAUTH_*` env vars. `JwtAuthGuard` also accepts `x-forwarded-access-token`. No public, optional-auth, or cookie-roled endpoints.

### Contract annotations
- `apps/api/src/modules/company-info/application/controllers/company-info.controller.ts` — `@ApiTags`, `@ApiBearerAuth('accessToken')`, `@ApiOperation`, `@ApiResponse` (200/400/401/403), `@UseGuards(JwtAuthGuard)`, `@AuthRoles(AUTH_ROLE_ADMIN)`, `@ResourceCaptures(...)` on PUT.
- `apps/api/src/modules/company-info/application/dto/company-info.dto.ts` — every `@ApiProperty({ type: ... })` explicit.
- `packages/validation/src/schemas/company-info.schema.ts` (owned by F1) — Zod source of truth.
- `flows.config.json` — `BoilerplatePlaceholder` removed from `resourceGraph.ignoreModels`.
- `.overstory/runtime-contract.flows/<F2-task-id>.json` — authored by lead, NOT builder.

---

## 5. Out of scope

- **No F1 changes.** Mail coordinator if F1 symbols seem wrong.
- **No web changes.** Nothing under `apps/web/`.
- **No translation key edits.**
- **No new `/login`, `/register`, local-JWT, or Keycloak/oauth2-proxy/`OAUTH_*` removal.**
- **No edits to `apps/api/src/main.ts`, `apps/api/src/swagger.ts`, `apps/api/src/common/**`.**
- **No edits to `.overstory/runtime-contract.flows/`** (hook-blocked for builder).
- **No edits to `.runtime-contract.overlay.json` or `.runtime-contract.logical.json`.**
- **No seed edits.**
- **No DB-level uniqueness constraint** on `company_info` (application-enforced).
- **No additional endpoints** (no DELETE, no POST, no `/:id`).
- **No package additions or version bumps.**
- **No `@nestjs/passport`, `class-validator`, `class-transformer` adoption.**

---

## 6. Dependencies + handoff

**Depends on:** F1 (`sfx-webapp-boilerplate-51de`) merged. Imports `AUTH_ROLE_ADMIN`, `CompanyInfo`, `CompanyInfoRepository`, `UpsertCompanyInfoInput`, `upsertCompanyInfoSchema`.

**Unblocks:** F4 (`sfx-webapp-boilerplate-63de`).

**Builder handoff:**
- Capability: `builder` direct, one slot.
- File scope: `packages/database/prisma/**`, `apps/api/src/modules/company-info/**`, `apps/api/src/app.module.ts`, `flows.config.json`.
- Migration via `pnpm db:migrate -- --name company_info`; bridge auto-applies. Do NOT hand-edit SQL.
- Close-gate from worktree root: `pnpm typecheck && pnpm lint && pnpm test:coverage && pnpm probe:smoke`.
- WORKER_DONE mail must include `## runtime-evidence` block with probe JSON summary.

---

## 7. Notable findings (classification)

- **foundational** — Every `@ApiProperty()` MUST declare `type:` explicitly (tsx + esbuild reflect-metadata gotcha). Same root cause as explicit `@Inject(SYMBOL)`.
- **foundational** — `JwtAuthGuard` is a SINGLE guard handling both 401 + 403 via `@AuthRoles(...)`. No separate `RolesGuard`.
- **foundational** — Success envelope by `TransformInterceptor` global; error envelope by `GlobalExceptionFilter` global. Controllers return RAW data.
- **foundational** — `extractBearerToken` accepts BOTH `Authorization: Bearer <jwt>` AND `x-forwarded-access-token: <jwt>`.
- **tactical** — Singleton application-enforced (no unique index). `findFirst → update OR create` MUST run inside `prisma.$transaction`.
- **tactical** — `BoilerplatePlaceholder` removal + `flows.config.json` `ignoreModels` entry removal are in the SAME diff as `CompanyInfo` add.
- **tactical** — Prisma `@map` / `@@map` mandatory for snake_case DB column / table names.
- **tactical** — `ZodValidationPipe<T>` already shapes per-field errors `{ field, message }[]`. Wrapper just calls `super(upsertCompanyInfoSchema)`.
- **tactical** — `@ResourceCaptures` `fromPath: 'id'` (unwrapped) — NOT `'data.id'`. TransformInterceptor wraps after capture.
- **observational** — Auth controller test reads its own source to verify decorator strings. F2 mirrors this for `@UseGuards`, `@AuthRoles`, `@ApiResponse(401/403)`.
- **observational** — `pnpm db:migrate -- --name company_info` runs against per-worker bridge DB; ~1.5s apply.
- **observational** — api boots via SWC (`nest start -b swc --watch`); explicit `@Inject(SYMBOL)` + `@ApiProperty({ type: ... })` mandatory.

End of spec.
