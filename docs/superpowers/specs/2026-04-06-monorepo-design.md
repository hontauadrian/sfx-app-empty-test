# SFX Webapp Boilerplate — Monorepo Design Spec

## Purpose

A reusable monorepo boilerplate/starter kit for SFX projects. Contains a Next.js frontend, NestJS backend, PostgreSQL database (via Prisma), and Docker containerization. Designed to be spun up by the sfx-team-panel orchestrator, with subagents working in isolated app directories via git worktrees.

No infrastructure (Terraform) folder — compute decisions are per-project.

---

## Monorepo Tooling

- **pnpm 9.x** — package manager, strict workspace orchestration
- **Turborepo 2.x** — build caching, task pipeline, Docker pruning
- **pnpm-workspace.yaml** defines workspace packages

---

## Project Structure

```
sfx-webapp-boilerplate/
├── apps/
│   ├── web/                              # Next.js 15 (App Router)
│   │   ├── src/
│   │   │   ├── app/                      # THIN WRAPPERS ONLY
│   │   │   │   ├── layout.tsx
│   │   │   │   ├── providers.tsx
│   │   │   │   └── [route]/page.tsx
│   │   │   ├── features/
│   │   │   │   ├── [feature]/
│   │   │   │   │   ├── data/
│   │   │   │   │   │   ├── remote/       # API calls via executeRequest()
│   │   │   │   │   │   ├── repositories/ # React hooks wrapping remote
│   │   │   │   │   │   ├── mapper/       # API response → domain model
│   │   │   │   │   │   └── model/        # Data transport types (DTOs)
│   │   │   │   │   ├── presentation/
│   │   │   │   │   │   ├── pages/        # Page hooks, UIModel mappers
│   │   │   │   │   │   ├── components/   # Feature-specific UI
│   │   │   │   │   │   └── validators/   # Zod form schemas
│   │   │   │   │   ├── constants.ts
│   │   │   │   │   └── index.ts
│   │   │   │   └── presentation/         # SHARED across features
│   │   │   │       ├── theme/            # colors.ts, ThemeProvider, useTheme
│   │   │   │       ├── localization/     # languages/, registry, useTranslations
│   │   │   │       ├── components/       # Shared UI components
│   │   │   │       └── networking/       # executeRequest, SSE hooks
│   │   │   ├── stores/                   # Zustand client state
│   │   │   ├── lib/                      # Config, logger utilities
│   │   │   └── types/                    # Frontend-specific types
│   │   ├── Dockerfile
│   │   ├── next.config.ts
│   │   ├── jest.config.ts
│   │   ├── tsconfig.json
│   │   ├── CLAUDE.md                     # Frontend-specific rules
│   │   └── package.json
│   │
│   └── api/                              # NestJS
│       ├── src/
│       │   ├── modules/
│       │   │   └── [module]/
│       │   │       ├── data/
│       │   │       │   ├── repositories/  # IUserRepository impl (Prisma)
│       │   │       │   ├── mapper/        # Prisma model → domain entity
│       │   │       │   └── model/         # Data models (Prisma DTOs)
│       │   │       ├── application/
│       │   │       │   ├── controllers/   # HTTP endpoints
│       │   │       │   ├── dtos/          # Request/Response DTOs
│       │   │       │   ├── guards/        # Auth, role guards
│       │   │       │   └── pipes/         # Zod validation pipes
│       │   │       ├── [module].module.ts
│       │   │       └── index.ts
│       │   ├── common/
│       │   │   ├── guards/               # Shared guards (JWT, etc.)
│       │   │   ├── interceptors/         # Logging, transform interceptors
│       │   │   ├── filters/              # Exception filters
│       │   │   ├── pipes/                # Global validation pipes
│       │   │   └── decorators/           # Custom decorators
│       │   ├── config/                   # NestJS config module
│       │   ├── app.module.ts
│       │   └── main.ts
│       ├── test/                         # E2E tests
│       ├── Dockerfile
│       ├── jest.config.ts
│       ├── tsconfig.json
│       ├── CLAUDE.md                     # Backend-specific rules
│       └── package.json
│
├── packages/
│   ├── domain/                           # THE shared domain layer
│   │   ├── models/                       # User.ts, Product.ts (entities)
│   │   ├── use-cases/                    # Interface contracts (ICreateUserUseCase)
│   │   ├── repositories/                 # Repository interfaces (IUserRepository)
│   │   ├── value-objects/                # Email.ts, Money.ts (immutable types)
│   │   ├── index.ts
│   │   ├── tsconfig.json
│   │   └── package.json                  # @sfx/domain
│   │
│   ├── validation/                       # Shared Zod schemas
│   │   ├── schemas/                      # createUserSchema, loginSchema
│   │   ├── index.ts
│   │   ├── tsconfig.json
│   │   └── package.json                  # @sfx/validation
│   │
│   ├── shared/                           # Constants, enums, utility types
│   │   ├── constants/
│   │   ├── enums/
│   │   ├── utils/
│   │   ├── index.ts
│   │   ├── tsconfig.json
│   │   └── package.json                  # @sfx/shared
│   │
│   └── database/                         # Prisma
│       ├── prisma/
│       │   ├── schema.prisma
│       │   ├── migrations/
│       │   └── seed.ts
│       ├── src/
│       │   └── client.ts                 # PrismaClient singleton export
│       ├── tsconfig.json
│       └── package.json                  # @sfx/database
│
├── docker-compose.yml                    # Dev: web + api + postgres
├── docker-compose.prod.yml               # Prod overrides
├── .dockerignore
├── turbo.json                            # Build orchestration
├── pnpm-workspace.yaml                   # Workspace definition
├── package.json                          # Root scripts
├── tsconfig.base.json                    # Shared TS config
├── eslint.config.mjs                     # Shared ESLint config (flat config)
├── .prettierrc                           # Shared Prettier config
├── CLAUDE.md                             # Monorepo-level rules
└── .gitignore
```

---

## Tech Stack & Versions

### Monorepo Tooling
- pnpm 9.x
- Turborepo 2.x

### Frontend (`apps/web`)
- Next.js 15.5.7+ (App Router, `output: 'standalone'`)
- React 19.0.1+
- TypeScript 5.7+ (strict mode)
- Zustand 5.x (client UI state)
- TanStack Query 5.x (server state)
- Tailwind CSS 4.x (`@theme` directive, NOT `@config`)
- React Hook Form 7.x + Zod 3.x
- Radix UI (headless primitives)
- DOMPurify (sanitization)
- lucide-react (icons)
- Jest 29 + React Testing Library 16
- ESLint 9 (flat config) + Prettier

### Backend (`apps/api`)
- NestJS 11.x
- TypeScript 5.7+ (strict mode)
- Prisma 6.x (ORM, migrations, seeding)
- Passport + @nestjs/jwt (authentication)
- class-transformer (DTO serialization)
- Zod 3.x (via custom NestJS pipes, shared from @sfx/validation)
- helmet (security headers)
- @nestjs/throttler (rate limiting)
- Jest 29 (unit + e2e)
- ESLint 9 + Prettier

### Shared Packages
- `@sfx/domain` — pure TypeScript, zero dependencies
- `@sfx/validation` — Zod 3.x only
- `@sfx/shared` — pure TypeScript, zero dependencies
- `@sfx/database` — Prisma 6.x, @prisma/client

### Docker & Database
- PostgreSQL 16 (Docker in dev, managed in prod)
- Docker multi-stage builds (Node 22 Alpine)
- docker-compose for local orchestration

**All dependencies pinned — no `^` or `~`.**

---

## Clean Architecture — Dependency Rules

```
┌─────────────────────────────────────────────────┐
│                @sfx/domain                       │
│  (entities, use-case interfaces, repo interfaces)│
│  ZERO dependencies — never imports from any app  │
└──────────────────────┬──────────────────────────┘
                       │ imported by
          ┌────────────┴────────────┐
          ▼                         ▼
┌──────────────────┐     ┌──────────────────┐
│   apps/web       │     │   apps/api       │
│                  │     │                  │
│  data/           │     │  data/           │
│   ├── remote/    │     │   ├── repositories/
│   ├── repos/     │     │   ├── mapper/
│   ├── mapper/    │     │   └── model/
│   └── model/     │     │                  │
│                  │     │  application/     │
│  presentation/   │     │   ├── controllers/
│   ├── pages/     │     │   ├── dtos/
│   ├── components/│     │   ├── guards/
│   └── validators/│     │   └── pipes/
└──────────────────┘     └──────────────────┘
```

### Import Rules

| Source | Can import from |
|--------|----------------|
| `@sfx/domain` | Nothing (pure, zero deps) |
| `@sfx/validation` | `@sfx/domain` only |
| `@sfx/database` | `@sfx/domain` only |
| `@sfx/shared` | `@sfx/domain` only |
| `apps/web` data layer | `@sfx/domain`, `@sfx/validation`, `@sfx/shared` |
| `apps/web` presentation layer | own data layer, `@sfx/domain` |
| `apps/api` data layer | `@sfx/domain`, `@sfx/database` |
| `apps/api` application layer | own data layer, `@sfx/domain`, `@sfx/validation` |

### Frontend Rules (from sfx-team-panel)
- Pages/components are dumb — no `useState`, `useQuery` in page files
- UIModels live in `presentation/pages/` — not in domain
- All API calls through `executeRequest()`
- Labels resolved via `useTranslations()` in mapper, never in JSX
- `useCallback` on all returned hook functions
- NavigationHandler pattern — no `router.push()` in hooks
- Skeleton screens for loading — never spinners
- Zustand for client state, TanStack Query for server state
- Tailwind classes for colors mapped from `colors.ts`

### Backend Rules
- Controllers are thin — delegate to use cases
- Use cases orchestrate domain logic, call repository interfaces
- Repository implementations (Prisma) live in `data/`, injected via NestJS DI
- DTOs are separate from domain entities — mapped at application boundary
- Zod pipes validate incoming requests using `@sfx/validation` schemas
- Exception filters handle error responses — not try/catch in controllers

---

## Docker Strategy

### Local Development (`docker-compose.yml`)

Three services running together:
- **web** (Next.js) on port 3000 — dev mode with hot reload via volume mounts
- **api** (NestJS) on port 3001 — dev mode with hot reload via volume mounts
- **postgres** on port 5432 — PostgreSQL 16 Alpine with healthcheck

Volume mounts for `src/` and `packages/` enable hot reload without rebuilding containers. PostgreSQL data persisted in a named volume.

API depends on postgres (with healthcheck condition). Web depends on API.

### Production (`docker-compose.prod.yml`)

Same 3 services but:
- No volume mounts
- Build target: `production` (multi-stage, ~150MB images)
- Next.js standalone output
- NestJS compiled to `dist/`
- Prisma migrations run at API startup (`prisma migrate deploy`)

### Multi-Stage Dockerfile Pattern (both apps)

```
Stage 1 (deps):     Install dependencies only (pnpm --frozen-lockfile)
Stage 2 (dev):      Copy source, run dev server (for docker-compose dev)
Stage 3 (build):    Copy source, build, prune prod deps
Stage 4 (prod):     Minimal image — only compiled output + prod node_modules
```

Build context is always monorepo root (`.`) so Dockerfiles can access `packages/`.

---

## CLAUDE.md Strategy

Three cascading files for the Overstory orchestrator model:

### Root `CLAUDE.md` (orchestrator sees this)
- Full monorepo structure overview
- All commands (dev, build, test, docker, prisma)
- Shared Clean Architecture dependency rules
- Package import rules (`@sfx/domain`, `@sfx/validation`, etc.)
- Naming conventions (consistent across apps)
- Git workflow (conventional commits)
- Pinned dependencies — no `^` or `~`
- SOLID principles
- Docker commands
- Agent routing: "frontend work → spawn in `apps/web/`, backend work → spawn in `apps/api/`, shared domain → work at root in `packages/`"

### `apps/web/CLAUDE.md` (frontend subagent sees root + this)
- Trigger-action rules: scaffold, test coverage gate, dependency resolution, hook return audit, feature architecture, error classification
- ADRs: Zustand, executeRequest, UIModel mapper, NavigationHandler, Zod, skeleton screens, language folders, Clean Architecture
- Theming: colors.ts single source of truth, `@theme` directive, no hardcoded hex
- Localization: useTranslations in mapper, language folders
- Component patterns: dumb pages, useCallback, no router.push in hooks
- Frontend naming conventions
- Gotchas: Tailwind v4 @config, Zustand selectors, React Query keys, next/image sizes, middleware auth bypass, Zod v4 transform, etc.
- Security: Next.js >=15.5.7, React >=19.0.1

### `apps/api/CLAUDE.md` (backend subagent sees root + this)
- Trigger-action rules: module scaffold, endpoint creation, repository implementation, error classification
- ADRs: Prisma (not TypeORM), Zod pipes (not class-validator), Passport + JWT, repository pattern, exception filters
- Backend naming: module folders (kebab-case), controllers, use cases, repos, DTOs, pipes
- Gotchas: Prisma connection pooling, NestJS circular deps, guard execution order
- Security: helmet, throttler, CORS, input sanitization

---

## Turborepo Pipeline

### Task Dependencies

```
build:     packages/domain → packages/validation → packages/shared → packages/database → apps/web + apps/api
dev:       all parallel
test:      all parallel
lint:      all parallel
typecheck: same order as build
```

### Root Scripts

| Command | Action |
|---------|--------|
| `pnpm dev` | Start web + api via Turborepo parallel |
| `pnpm build` | Build all in dependency order |
| `pnpm test` | Run all Jest tests |
| `pnpm test:coverage` | Tests with 90%+ coverage enforcement |
| `pnpm lint` | ESLint all packages + apps |
| `pnpm typecheck` | `tsc --noEmit` all packages + apps |
| `pnpm docker:up` | `docker compose up --build` (dev) |
| `pnpm docker:down` | `docker compose down` |
| `pnpm docker:prod` | Production compose build + up |
| `pnpm db:migrate` | `prisma migrate dev` |
| `pnpm db:seed` | `prisma db seed` |
| `pnpm db:studio` | Prisma Studio |
| `pnpm clean` | Remove node_modules, dist, .next, .turbo |

### Environment Variables

```
# apps/web/.env.local
NEXT_PUBLIC_API_URL=http://localhost:3001

# apps/api/.env
DATABASE_URL=postgresql://sfx:sfx@localhost:5432/sfx_db
JWT_SECRET=dev-secret-change-in-prod
PORT=3001
```

`.env` files gitignored. `.env.example` in each app documents required variables.

---

## Testing Strategy

- **Frontend**: Jest 29 + React Testing Library, 90%+ coverage, tests in `__tests__/` colocated with source, page/layout/provider files exempt
- **Backend**: Jest 29, 90%+ coverage, unit tests colocated, e2e tests in `apps/api/test/`
- **Shared packages**: Jest 29, 90%+ coverage
- Coverage enforced per-workspace via jest.config.ts thresholds
