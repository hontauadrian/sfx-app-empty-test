# NestJS Backend Development Guide

You are an expert senior backend engineer specializing in NestJS 11, TypeScript, and PostgreSQL. You follow Clean Architecture with module-scoped `data/` and `application/` layers (domain is shared in `@sfx/domain`). You write tests before implementation (90%+ coverage), never ship code without type-checking and linting passing.

## Commands

```bash
pnpm --filter @sfx/api dev           # Start dev server (port 3001, watch mode)
pnpm --filter @sfx/api build         # Build for production
pnpm --filter @sfx/api test          # Run unit tests
pnpm --filter @sfx/api test:coverage # Tests with 90%+ coverage
pnpm --filter @sfx/api test:e2e      # Run e2e tests
pnpm --filter @sfx/api lint          # Lint
pnpm --filter @sfx/api typecheck     # Type check
```

## Architecture Decisions (Do NOT re-suggest)

- **ADR-001**: Prisma for ORM — NOT TypeORM, NOT Sequelize
- **ADR-002**: Zod pipes for validation via `@sfx/validation` — NOT class-validator
- **ADR-003**: Passport + JWT for auth — when implemented
- **ADR-004**: Repository pattern — controllers NEVER touch Prisma directly
- **ADR-005**: Exception filters for error responses — NOT try/catch in controllers
- **ADR-006**: NestJS DI for dependency injection — repository interfaces from `@sfx/domain`

## Module Structure

```
src/modules/[module]/
├── data/
│   ├── repositories/      # IRepository implementation (Prisma)
│   ├── mapper/            # Prisma model → domain entity
│   └── model/             # Data models (Prisma DTOs)
├── application/
│   ├── controllers/       # HTTP endpoints (thin)
│   ├── dtos/              # Request/Response DTOs
│   ├── guards/            # Module-specific guards
│   └── pipes/             # Zod validation pipes
├── [module].module.ts
└── index.ts
```

No `domain/` folder in modules — all domain types come from `@sfx/domain`.

## Clean Architecture Rules

| Layer | Responsibility | Can import |
|-------|---------------|------------|
| application/ (controllers, pipes, guards) | HTTP surface, validation, routing | own data layer, `@sfx/domain`, `@sfx/validation` |
| data/ (repositories, mappers) | Database access, external services | `@sfx/domain`, `@sfx/database` |
| @sfx/domain | Business entities, interfaces | Nothing |

- Controllers are **thin** — validate input, delegate to repository/use-case, return result
- Repositories implement interfaces from `@sfx/domain`
- Mappers convert Prisma models to domain entities at the data boundary
- DTOs are separate from domain entities

## Boundaries

### Always do
- Write tests for every new file (90%+ coverage)
- Inject repository interfaces via NestJS DI (use `@Inject(SYMBOL)`)
- Validate all input with Zod pipes using schemas from `@sfx/validation`
- Use global exception filter for error responses
- Use global transform interceptor for success responses
- Map Prisma models to domain entities in data/mapper

### Never do
- Call Prisma directly in controllers
- Use class-validator decorators — Zod only
- Use try/catch in controllers — let exception filters handle it
- Import from `apps/web`
- Import from `@sfx/database` in application layer (only in data layer)
- Hardcode secrets — use ConfigService

## Trigger-Action Rules

### New Module Scaffold
**Trigger:** Creating a new module.
**Action:** Create full structure: `data/repositories/`, `data/mapper/`, `data/model/`, `application/controllers/`, `application/dtos/`, `application/pipes/`, `[module].module.ts`, `index.ts`. Register in `app.module.ts`.

### New Endpoint
**Trigger:** Adding a new endpoint.
**Action:** Create DTO + Zod validation pipe + unit test BEFORE implementation. Wire Zod schema from `@sfx/validation` or create new one there.

### Repository Implementation
**Trigger:** Creating a new repository.
**Action:** Must implement interface from `@sfx/domain`. Register as provider in module with Symbol token. Inject via `@Inject(TOKEN)`.

### Error Classification
**Trigger:** Handling errors.
**Action:** Classify: validation (400, BadRequestException) / auth (401/403, UnauthorizedException/ForbiddenException) / not found (404, NotFoundException) / conflict (409, ConflictException) / unrecoverable (500, let global filter handle).

## Naming Conventions

| Type | Case | Example |
|------|------|---------|
| Module folder | kebab-case | `user-management/` |
| Controller | `[module].controller.ts` | `user.controller.ts` |
| Repository impl | `[entity].repository.ts` | `user.repository.ts` |
| Mapper | `[entity].mapper.ts` | `user.mapper.ts` |
| DTO | `[verb]-[entity].dto.ts` | `create-user.dto.ts` |
| Pipe | `[schema]-validation.pipe.ts` | `create-user-validation.pipe.ts` |
| Module file | `[module].module.ts` | `user.module.ts` |
| DI token | UPPER_SNAKE_CASE Symbol | `USER_REPOSITORY` |
| e2e test | `[feature].e2e-test.ts` | `app.e2e-test.ts` |

## Gotchas
- **Prisma connection pooling** — use singleton client from `@sfx/database`, not new PrismaClient() per request
- **NestJS circular dependencies** — use `forwardRef()` when two modules depend on each other. Better: restructure to avoid.
- **Guard execution order** — global guards run before route guards. `ThrottlerGuard` before `JwtAuthGuard`.
- **Exception filter catches ALL exceptions** — the `GlobalExceptionFilter` catches non-HTTP errors too. It converts them to 500s.
- **`@nestjs/config` validates at startup** — missing env vars crash the app immediately. Use `.env.example` as reference.
- **Prisma `@map` and `@@map`** — model field names are camelCase in TS, snake_case in DB. Always use `@map` for column names and `@@map` for table names.
- **`@UsePipes` applies to route, not method body** — the pipe transforms `@Body()` before the method runs. Don't re-validate inside.

## Security
- helmet for security headers
- @nestjs/throttler for rate limiting (100 req/min default)
- CORS configured in main.ts (permissive in dev, restrictive in prod)
- Environment validation at startup via Zod
- Never trust client input — validate everything at the controller boundary
