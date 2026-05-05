# SFX Webapp Boilerplate — Monorepo Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold a production-ready monorepo boilerplate with Next.js frontend, NestJS backend, shared domain/validation/database packages, and Docker containerization.

**Architecture:** Turborepo + pnpm workspaces monorepo. Shared `@sfx/domain` package owns all business entities and interfaces. Frontend follows Clean Architecture per feature (data/presentation). Backend follows Clean Architecture per module (data/application). Both apps are independently Dockerizable via multi-stage builds.

**Tech Stack:** pnpm 9, Turborepo 2, Next.js 15, React 19, NestJS 11, Prisma 6, PostgreSQL 16, Zustand 5, TanStack Query 5, Tailwind CSS 4, Zod 3, Jest 29, Docker

**Spec:** `docs/superpowers/specs/2026-04-06-monorepo-design.md`

---

## File Map

### Root
```
package.json                    — root workspace scripts (dev, build, test, docker)
pnpm-workspace.yaml             — workspace package globs
turbo.json                      — task pipeline (build, dev, test, lint, typecheck)
tsconfig.base.json              — shared TS config (strict, paths)
eslint.config.mjs               — shared ESLint flat config
.prettierrc                     — shared Prettier config
.gitignore                      — node_modules, dist, .next, .turbo, .env, pgdata
.dockerignore                   — same as gitignore + .git
.npmrc                          — save-exact=true, strict-peer-dependencies
docker-compose.yml              — dev: web + api + postgres
docker-compose.prod.yml         — prod overrides
CLAUDE.md                       — monorepo-level orchestrator rules
```

### packages/domain (`@sfx/domain`)
```
package.json, tsconfig.json, jest.config.ts
src/models/user.ts              — User entity
src/repositories/user-repository.interface.ts — IUserRepository
src/use-cases/create-user.use-case.interface.ts — ICreateUserUseCase
src/index.ts                    — barrel export
__tests__/models/user.test.ts   — User entity tests
```

### packages/shared (`@sfx/shared`)
```
package.json, tsconfig.json, jest.config.ts
src/enums/http-status.enum.ts   — HttpStatus enum
src/enums/error-code.enum.ts    — ErrorCode enum
src/types/api-response.type.ts  — ApiResponse<T> type
src/constants/index.ts          — shared constants
src/index.ts                    — barrel export
__tests__/types/api-response.test.ts
```

### packages/validation (`@sfx/validation`)
```
package.json, tsconfig.json, jest.config.ts
src/schemas/user.schema.ts      — createUserSchema, loginSchema
src/schemas/common.schema.ts    — paginationSchema, idParamSchema
src/index.ts                    — barrel export
__tests__/schemas/user.schema.test.ts
__tests__/schemas/common.schema.test.ts
```

### packages/database (`@sfx/database`)
```
package.json, tsconfig.json
prisma/schema.prisma            — User model, PostgreSQL datasource
prisma/seed.ts                  — seed script
src/client.ts                   — PrismaClient singleton
src/index.ts                    — barrel export
```

### apps/web
```
package.json, tsconfig.json, next.config.ts, jest.config.ts
postcss.config.mjs, Dockerfile, .env.example
src/app/layout.tsx              — root layout + theme script
src/app/providers.tsx           — ThemeProvider + LanguageProvider + QueryClientProvider
src/app/globals.css             — @theme directive for Tailwind v4
src/app/page.tsx                — thin wrapper for home
src/features/presentation/theme/colors.ts           — lightColors, darkColors, Colors type
src/features/presentation/theme/theme-provider.tsx   — ThemeProvider component
src/features/presentation/theme/use-theme.ts         — useTheme hook
src/features/presentation/theme/theme-script.ts      — blocking FOUC prevention script
src/features/presentation/theme/types.ts             — AppTheme, ThemeMode, Colors
src/features/presentation/theme/index.ts             — barrel
src/features/presentation/localization/languages/en/common.ts
src/features/presentation/localization/languages/ro/common.ts
src/features/presentation/localization/languages/registry.ts
src/features/presentation/localization/language-provider.tsx
src/features/presentation/localization/use-translations.ts
src/features/presentation/localization/types.ts
src/features/presentation/localization/index.ts
src/features/presentation/networking/execute-request.ts  — API abstraction
src/features/presentation/networking/types.ts
src/features/presentation/networking/index.ts
src/features/home/data/remote/fetch-health.ts
src/features/home/data/repositories/use-health-repository.ts
src/features/home/data/mapper/map-to-health.ts
src/features/home/data/model/health-data-model.ts
src/features/home/presentation/pages/home/use-home.ts
src/features/home/presentation/pages/home/map-to-home-page-ui-model.ts
src/features/home/presentation/pages/home/types.ts
src/features/home/presentation/pages/home/index.tsx
src/features/home/presentation/components/HealthStatus/HealthStatus.tsx
src/features/home/presentation/components/HealthStatus/types.ts
src/features/home/presentation/components/HealthStatus/index.ts
src/features/home/constants.ts
src/features/home/index.ts
src/stores/app-store.ts
src/types/index.ts
```

### apps/api
```
package.json, tsconfig.json, tsconfig.build.json, nest-cli.json, jest.config.ts
Dockerfile, .env.example
src/main.ts                     — bootstrap NestJS app
src/app.module.ts               — root module
src/common/filters/http-exception.filter.ts
src/common/pipes/zod-validation.pipe.ts
src/common/interceptors/transform.interceptor.ts
src/common/decorators/api-response.decorator.ts
src/config/config.module.ts
src/config/config.service.ts
src/config/env.validation.ts
src/modules/health/health.module.ts
src/modules/health/application/controllers/health.controller.ts
src/modules/health/application/controllers/__tests__/health.controller.test.ts
src/modules/user/user.module.ts
src/modules/user/data/repositories/user.repository.ts
src/modules/user/data/mapper/user.mapper.ts
src/modules/user/data/model/user-data.model.ts
src/modules/user/application/controllers/user.controller.ts
src/modules/user/application/dtos/create-user.dto.ts
src/modules/user/application/pipes/create-user-validation.pipe.ts
src/modules/user/application/controllers/__tests__/user.controller.test.ts
src/modules/user/index.ts
test/app.e2e-test.ts
test/jest-e2e.config.ts
```

---

## Task 1: Initialize Monorepo Root

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `.npmrc`
- Create: `.gitignore`
- Create: `.prettierrc`
- Create: `tsconfig.base.json`

- [ ] **Step 1: Create root package.json**

```json
{
  "name": "sfx-webapp-boilerplate",
  "private": true,
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "test": "turbo run test",
    "test:coverage": "turbo run test:coverage",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "clean": "turbo run clean && rm -rf node_modules .turbo",
    "docker:up": "docker compose up --build",
    "docker:down": "docker compose down",
    "docker:prod": "docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build",
    "db:migrate": "pnpm --filter @sfx/database prisma migrate dev",
    "db:migrate:deploy": "pnpm --filter @sfx/database prisma migrate deploy",
    "db:seed": "pnpm --filter @sfx/database prisma db seed",
    "db:studio": "pnpm --filter @sfx/database prisma studio",
    "db:generate": "pnpm --filter @sfx/database prisma generate"
  },
  "devDependencies": {
    "turbo": "2.5.0",
    "typescript": "5.7.3",
    "eslint": "9.18.0",
    "prettier": "3.4.2",
    "@eslint/js": "9.18.0",
    "typescript-eslint": "8.20.0",
    "eslint-config-prettier": "10.0.1"
  },
  "packageManager": "pnpm@9.15.4",
  "engines": {
    "node": ">=22.0.0",
    "pnpm": ">=9.0.0"
  }
}
```

- [ ] **Step 2: Create pnpm-workspace.yaml**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 3: Create .npmrc**

```ini
save-exact=true
strict-peer-dependencies=true
auto-install-peers=true
```

- [ ] **Step 4: Create .gitignore**

```gitignore
# dependencies
node_modules/

# build output
dist/
.next/
.turbo/

# environment
.env
.env.local
.env.*.local

# IDE
.idea/
.vscode/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# test
coverage/

# database
pgdata/

# prisma
packages/database/prisma/*.db
packages/database/prisma/*.db-journal
```

- [ ] **Step 5: Create .prettierrc**

```json
{
  "semi": true,
  "trailingComma": "all",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2
}
```

- [ ] **Step 6: Create tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 7: Create eslint.config.mjs**

```javascript
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    ignores: ['**/dist/**', '**/.next/**', '**/.turbo/**', '**/node_modules/**', '**/coverage/**'],
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
);
```

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-workspace.yaml .npmrc .gitignore .prettierrc tsconfig.base.json eslint.config.mjs
git commit -m "chore: initialize monorepo root with pnpm + turborepo + shared configs"
```

---

## Task 2: Turborepo Configuration

**Files:**
- Create: `turbo.json`

- [ ] **Step 1: Create turbo.json**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**"],
      "env": ["DATABASE_URL", "NEXT_PUBLIC_API_URL"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["^build"],
      "cache": false
    },
    "test:coverage": {
      "dependsOn": ["^build"],
      "cache": false
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "clean": {
      "cache": false
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add turbo.json
git commit -m "chore: add turborepo task pipeline configuration"
```

---

## Task 3: @sfx/domain Package

**Files:**
- Create: `packages/domain/package.json`
- Create: `packages/domain/tsconfig.json`
- Create: `packages/domain/jest.config.ts`
- Create: `packages/domain/src/models/user.ts`
- Create: `packages/domain/src/repositories/user-repository.interface.ts`
- Create: `packages/domain/src/use-cases/create-user.use-case.interface.ts`
- Create: `packages/domain/src/index.ts`
- Test: `packages/domain/__tests__/models/user.test.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@sfx/domain",
  "version": "0.0.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "build": "tsc",
    "test": "jest",
    "test:coverage": "jest --coverage",
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf dist"
  },
  "devDependencies": {
    "typescript": "5.7.3",
    "jest": "29.7.0",
    "ts-jest": "29.2.5",
    "@types/jest": "29.5.14"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "__tests__"]
}
```

- [ ] **Step 3: Create jest.config.ts**

```typescript
import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90,
    },
  },
};

export default config;
```

- [ ] **Step 4: Write the failing test for User entity**

Create `packages/domain/__tests__/models/user.test.ts`:

```typescript
import { User } from '../../src/models/user';

describe('User', () => {
  it('should create a User entity with all required fields', () => {
    const user: User = {
      id: '123',
      email: 'test@example.com',
      name: 'Test User',
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    };

    expect(user.id).toBe('123');
    expect(user.email).toBe('test@example.com');
    expect(user.name).toBe('Test User');
    expect(user.createdAt).toEqual(new Date('2026-01-01'));
    expect(user.updatedAt).toEqual(new Date('2026-01-01'));
  });

  it('should allow optional fields to be undefined', () => {
    const user: User = {
      id: '123',
      email: 'test@example.com',
      name: 'Test User',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    expect(user.avatarUrl).toBeUndefined();
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `cd packages/domain && npx jest __tests__/models/user.test.ts -v`
Expected: FAIL — cannot find module `../../src/models/user`

- [ ] **Step 6: Implement User entity**

Create `packages/domain/src/models/user.ts`:

```typescript
export interface User {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly avatarUrl?: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
```

- [ ] **Step 7: Implement repository interface**

Create `packages/domain/src/repositories/user-repository.interface.ts`:

```typescript
import { User } from '../models/user';

export interface IUserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findAll(): Promise<User[]>;
  create(data: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<User>;
  update(id: string, data: Partial<Omit<User, 'id' | 'createdAt' | 'updatedAt'>>): Promise<User>;
  delete(id: string): Promise<void>;
}
```

- [ ] **Step 8: Implement use case interface**

Create `packages/domain/src/use-cases/create-user.use-case.interface.ts`:

```typescript
import { User } from '../models/user';

export interface CreateUserInput {
  readonly email: string;
  readonly name: string;
  readonly avatarUrl?: string;
}

export interface ICreateUserUseCase {
  execute(input: CreateUserInput): Promise<User>;
}
```

- [ ] **Step 9: Create barrel export**

Create `packages/domain/src/index.ts`:

```typescript
export type { User } from './models/user';
export type { IUserRepository } from './repositories/user-repository.interface';
export type { ICreateUserUseCase, CreateUserInput } from './use-cases/create-user.use-case.interface';
```

- [ ] **Step 10: Run test to verify it passes**

Run: `cd packages/domain && npx jest __tests__/models/user.test.ts -v`
Expected: PASS (2 tests)

- [ ] **Step 11: Commit**

```bash
git add packages/domain/
git commit -m "feat(domain): add @sfx/domain package with User entity, repository and use-case interfaces"
```

---

## Task 4: @sfx/shared Package

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/jest.config.ts`
- Create: `packages/shared/src/enums/http-status.enum.ts`
- Create: `packages/shared/src/enums/error-code.enum.ts`
- Create: `packages/shared/src/types/api-response.type.ts`
- Create: `packages/shared/src/constants/index.ts`
- Create: `packages/shared/src/index.ts`
- Test: `packages/shared/__tests__/types/api-response.test.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@sfx/shared",
  "version": "0.0.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "build": "tsc",
    "test": "jest",
    "test:coverage": "jest --coverage",
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@sfx/domain": "workspace:*"
  },
  "devDependencies": {
    "typescript": "5.7.3",
    "jest": "29.7.0",
    "ts-jest": "29.2.5",
    "@types/jest": "29.5.14"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "__tests__"]
}
```

- [ ] **Step 3: Create jest.config.ts**

```typescript
import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90,
    },
  },
};

export default config;
```

- [ ] **Step 4: Write the failing test for ApiResponse**

Create `packages/shared/__tests__/types/api-response.test.ts`:

```typescript
import { createSuccessResponse, createErrorResponse } from '../../src/types/api-response.type';
import { HttpStatus } from '../../src/enums/http-status.enum';
import { ErrorCode } from '../../src/enums/error-code.enum';

describe('ApiResponse', () => {
  it('should create a success response', () => {
    const response = createSuccessResponse({ id: '1', name: 'Test' });

    expect(response.success).toBe(true);
    expect(response.data).toEqual({ id: '1', name: 'Test' });
    expect(response.error).toBeUndefined();
  });

  it('should create an error response', () => {
    const response = createErrorResponse(
      HttpStatus.BAD_REQUEST,
      ErrorCode.VALIDATION_ERROR,
      'Invalid input',
    );

    expect(response.success).toBe(false);
    expect(response.data).toBeUndefined();
    expect(response.error).toEqual({
      statusCode: 400,
      code: ErrorCode.VALIDATION_ERROR,
      message: 'Invalid input',
    });
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `cd packages/shared && npx jest __tests__/types/api-response.test.ts -v`
Expected: FAIL — cannot resolve modules

- [ ] **Step 6: Implement HttpStatus enum**

Create `packages/shared/src/enums/http-status.enum.ts`:

```typescript
export enum HttpStatus {
  OK = 200,
  CREATED = 201,
  NO_CONTENT = 204,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  CONFLICT = 409,
  UNPROCESSABLE_ENTITY = 422,
  INTERNAL_SERVER_ERROR = 500,
}
```

- [ ] **Step 7: Implement ErrorCode enum**

Create `packages/shared/src/enums/error-code.enum.ts`:

```typescript
export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR = 'AUTHORIZATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
}
```

- [ ] **Step 8: Implement ApiResponse type and factories**

Create `packages/shared/src/types/api-response.type.ts`:

```typescript
import { HttpStatus } from '../enums/http-status.enum';
import { ErrorCode } from '../enums/error-code.enum';

export interface ApiSuccessResponse<T> {
  readonly success: true;
  readonly data: T;
  readonly error?: undefined;
}

export interface ApiErrorDetail {
  readonly statusCode: HttpStatus;
  readonly code: ErrorCode;
  readonly message: string;
}

export interface ApiErrorResponse {
  readonly success: false;
  readonly data?: undefined;
  readonly error: ApiErrorDetail;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export function createSuccessResponse<T>(data: T): ApiSuccessResponse<T> {
  return { success: true, data };
}

export function createErrorResponse(
  statusCode: HttpStatus,
  code: ErrorCode,
  message: string,
): ApiErrorResponse {
  return {
    success: false,
    error: { statusCode, code, message },
  };
}
```

- [ ] **Step 9: Create constants**

Create `packages/shared/src/constants/index.ts`:

```typescript
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const API_VERSION = 'v1';
```

- [ ] **Step 10: Create barrel export**

Create `packages/shared/src/index.ts`:

```typescript
export { HttpStatus } from './enums/http-status.enum';
export { ErrorCode } from './enums/error-code.enum';
export type {
  ApiResponse,
  ApiSuccessResponse,
  ApiErrorResponse,
  ApiErrorDetail,
} from './types/api-response.type';
export { createSuccessResponse, createErrorResponse } from './types/api-response.type';
export { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, API_VERSION } from './constants/index';
```

- [ ] **Step 11: Run test to verify it passes**

Run: `cd packages/shared && npx jest __tests__/types/api-response.test.ts -v`
Expected: PASS (2 tests)

- [ ] **Step 12: Commit**

```bash
git add packages/shared/
git commit -m "feat(shared): add @sfx/shared package with enums, ApiResponse type, and constants"
```

---

## Task 5: @sfx/validation Package

**Files:**
- Create: `packages/validation/package.json`
- Create: `packages/validation/tsconfig.json`
- Create: `packages/validation/jest.config.ts`
- Create: `packages/validation/src/schemas/user.schema.ts`
- Create: `packages/validation/src/schemas/common.schema.ts`
- Create: `packages/validation/src/index.ts`
- Test: `packages/validation/__tests__/schemas/user.schema.test.ts`
- Test: `packages/validation/__tests__/schemas/common.schema.test.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@sfx/validation",
  "version": "0.0.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "build": "tsc",
    "test": "jest",
    "test:coverage": "jest --coverage",
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@sfx/domain": "workspace:*",
    "zod": "3.24.2"
  },
  "devDependencies": {
    "typescript": "5.7.3",
    "jest": "29.7.0",
    "ts-jest": "29.2.5",
    "@types/jest": "29.5.14"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "__tests__"]
}
```

- [ ] **Step 3: Create jest.config.ts**

```typescript
import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90,
    },
  },
};

export default config;
```

- [ ] **Step 4: Write failing tests for user schemas**

Create `packages/validation/__tests__/schemas/user.schema.test.ts`:

```typescript
import { createUserSchema, loginSchema } from '../../src/schemas/user.schema';

describe('createUserSchema', () => {
  it('should validate a correct create user input', () => {
    const input = { email: 'test@example.com', name: 'Test User' };
    const result = createUserSchema.safeParse(input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('test@example.com');
      expect(result.data.name).toBe('Test User');
    }
  });

  it('should reject invalid email', () => {
    const input = { email: 'not-an-email', name: 'Test User' };
    const result = createUserSchema.safeParse(input);

    expect(result.success).toBe(false);
  });

  it('should reject empty name', () => {
    const input = { email: 'test@example.com', name: '' };
    const result = createUserSchema.safeParse(input);

    expect(result.success).toBe(false);
  });

  it('should accept optional avatarUrl', () => {
    const input = { email: 'test@example.com', name: 'Test', avatarUrl: 'https://img.com/a.png' };
    const result = createUserSchema.safeParse(input);

    expect(result.success).toBe(true);
  });
});

describe('loginSchema', () => {
  it('should validate correct login input', () => {
    const input = { email: 'test@example.com', password: 'securePass123' };
    const result = loginSchema.safeParse(input);

    expect(result.success).toBe(true);
  });

  it('should reject short password', () => {
    const input = { email: 'test@example.com', password: '123' };
    const result = loginSchema.safeParse(input);

    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 5: Write failing tests for common schemas**

Create `packages/validation/__tests__/schemas/common.schema.test.ts`:

```typescript
import { paginationSchema, idParamSchema } from '../../src/schemas/common.schema';

describe('paginationSchema', () => {
  it('should use defaults when no input provided', () => {
    const result = paginationSchema.safeParse({});

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
    }
  });

  it('should reject page less than 1', () => {
    const result = paginationSchema.safeParse({ page: 0 });

    expect(result.success).toBe(false);
  });

  it('should reject limit greater than 100', () => {
    const result = paginationSchema.safeParse({ limit: 101 });

    expect(result.success).toBe(false);
  });
});

describe('idParamSchema', () => {
  it('should validate a non-empty string id', () => {
    const result = idParamSchema.safeParse({ id: '123' });

    expect(result.success).toBe(true);
  });

  it('should reject empty id', () => {
    const result = idParamSchema.safeParse({ id: '' });

    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `cd packages/validation && npx jest -v`
Expected: FAIL — cannot resolve modules

- [ ] **Step 7: Implement user schemas**

Create `packages/validation/src/schemas/user.schema.ts`:

```typescript
import { z } from 'zod';

export const createUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  name: z.string().min(1, 'Name is required').max(255, 'Name is too long'),
  avatarUrl: z.string().url('Invalid URL').optional(),
});

export type CreateUserSchemaInput = z.infer<typeof createUserSchema>;

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export type LoginSchemaInput = z.infer<typeof loginSchema>;
```

- [ ] **Step 8: Implement common schemas**

Create `packages/validation/src/schemas/common.schema.ts`:

```typescript
import { z } from 'zod';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@sfx/shared';

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export type PaginationInput = z.infer<typeof paginationSchema>;

export const idParamSchema = z.object({
  id: z.string().min(1, 'ID is required'),
});

export type IdParamInput = z.infer<typeof idParamSchema>;
```

- [ ] **Step 9: Create barrel export**

Create `packages/validation/src/index.ts`:

```typescript
export { createUserSchema } from './schemas/user.schema';
export type { CreateUserSchemaInput } from './schemas/user.schema';
export { loginSchema } from './schemas/user.schema';
export type { LoginSchemaInput } from './schemas/user.schema';
export { paginationSchema } from './schemas/common.schema';
export type { PaginationInput } from './schemas/common.schema';
export { idParamSchema } from './schemas/common.schema';
export type { IdParamInput } from './schemas/common.schema';
```

- [ ] **Step 10: Run tests to verify they pass**

Run: `cd packages/validation && npx jest -v`
Expected: PASS (7 tests)

- [ ] **Step 11: Commit**

```bash
git add packages/validation/
git commit -m "feat(validation): add @sfx/validation package with user and common Zod schemas"
```

---

## Task 6: @sfx/database Package

**Files:**
- Create: `packages/database/package.json`
- Create: `packages/database/tsconfig.json`
- Create: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/seed.ts`
- Create: `packages/database/src/client.ts`
- Create: `packages/database/src/index.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@sfx/database",
  "version": "0.0.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf dist",
    "prisma": "prisma"
  },
  "dependencies": {
    "@prisma/client": "6.3.0",
    "@sfx/domain": "workspace:*"
  },
  "devDependencies": {
    "prisma": "6.3.0",
    "typescript": "5.7.3",
    "tsx": "4.19.2"
  },
  "prisma": {
    "schema": "prisma/schema.prisma",
    "seed": "tsx prisma/seed.ts"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create Prisma schema**

Create `packages/database/prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String
  avatarUrl String?  @map("avatar_url")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@map("users")
}
```

- [ ] **Step 4: Create PrismaClient singleton**

Create `packages/database/src/client.ts`:

```typescript
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
```

- [ ] **Step 5: Create barrel export**

Create `packages/database/src/index.ts`:

```typescript
export { prisma } from './client';
export { PrismaClient } from '@prisma/client';
```

- [ ] **Step 6: Create seed script**

Create `packages/database/prisma/seed.ts`:

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.warn('Seeding database...');

  await prisma.user.upsert({
    where: { email: 'admin@sfx.dev' },
    update: {},
    create: {
      email: 'admin@sfx.dev',
      name: 'Admin User',
    },
  });

  console.warn('Seed complete.');
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [ ] **Step 7: Commit**

```bash
git add packages/database/
git commit -m "feat(database): add @sfx/database package with Prisma schema, client singleton, and seed"
```

---

## Task 7: Install Dependencies & Verify Packages

- [ ] **Step 1: Install all dependencies**

Run: `cd /Users/mako/Documents/GitHub/sfx-webapp-boilerplate && pnpm install`
Expected: Clean install with no peer dependency errors

- [ ] **Step 2: Verify domain package tests pass**

Run: `pnpm --filter @sfx/domain test`
Expected: PASS (2 tests)

- [ ] **Step 3: Verify shared package tests pass**

Run: `pnpm --filter @sfx/shared test`
Expected: PASS (2 tests)

- [ ] **Step 4: Verify validation package tests pass**

Run: `pnpm --filter @sfx/validation test`
Expected: PASS (7 tests)

- [ ] **Step 5: Verify typecheck passes across packages**

Run: `pnpm --filter @sfx/domain typecheck && pnpm --filter @sfx/shared typecheck && pnpm --filter @sfx/validation typecheck`
Expected: No type errors

- [ ] **Step 6: Commit lockfile**

```bash
git add pnpm-lock.yaml
git commit -m "chore: add pnpm lockfile after initial dependency install"
```

---

## Task 8: Initialize Next.js App — Config Files

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/next.config.ts`
- Create: `apps/web/postcss.config.mjs`
- Create: `apps/web/jest.config.ts`
- Create: `apps/web/.env.example`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@sfx/web",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev --port 3000",
    "build": "next build",
    "start": "next start",
    "test": "jest",
    "test:coverage": "jest --coverage",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf .next dist"
  },
  "dependencies": {
    "@sfx/domain": "workspace:*",
    "@sfx/shared": "workspace:*",
    "@sfx/validation": "workspace:*",
    "next": "15.5.7",
    "react": "19.0.1",
    "react-dom": "19.0.1",
    "zustand": "5.0.3",
    "@tanstack/react-query": "5.66.0",
    "react-hook-form": "7.54.2",
    "@hookform/resolvers": "3.9.1",
    "zod": "3.24.2",
    "dompurify": "3.2.4",
    "lucide-react": "0.469.0",
    "clsx": "2.1.1",
    "tailwind-merge": "3.0.1"
  },
  "devDependencies": {
    "@types/react": "19.0.8",
    "@types/react-dom": "19.0.3",
    "@types/dompurify": "3.2.0",
    "typescript": "5.7.3",
    "@tailwindcss/postcss": "4.0.14",
    "tailwindcss": "4.0.14",
    "jest": "29.7.0",
    "ts-jest": "29.2.5",
    "@types/jest": "29.5.14",
    "@testing-library/react": "16.1.0",
    "@testing-library/jest-dom": "6.6.3",
    "@testing-library/user-event": "14.5.2",
    "jest-environment-jsdom": "29.7.0",
    "eslint": "9.18.0",
    "eslint-config-next": "15.5.7"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "ES2017"],
    "jsx": "preserve",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowJs": true,
    "noEmit": true,
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create next.config.ts**

```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
```

- [ ] **Step 4: Create postcss.config.mjs**

```javascript
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
```

- [ ] **Step 5: Create jest.config.ts**

```typescript
import type { Config } from 'jest';
import nextJest from 'next/jest';

const createJestConfig = nextJest({ dir: './' });

const config: Config = {
  testEnvironment: 'jsdom',
  setupFilesAfterSetup: ['<rootDir>/jest.setup.ts'],
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90,
    },
  },
  coveragePathIgnorePatterns: [
    '/node_modules/',
    'page\\.tsx$',
    'layout\\.tsx$',
    'providers\\.tsx$',
  ],
};

export default createJestConfig(config);
```

- [ ] **Step 6: Create jest.setup.ts**

Create `apps/web/jest.setup.ts`:

```typescript
import '@testing-library/jest-dom';
```

- [ ] **Step 7: Create .env.example**

```bash
NEXT_PUBLIC_API_URL=http://localhost:3001
```

- [ ] **Step 8: Commit**

```bash
git add apps/web/package.json apps/web/tsconfig.json apps/web/next.config.ts apps/web/postcss.config.mjs apps/web/jest.config.ts apps/web/jest.setup.ts apps/web/.env.example
git commit -m "feat(web): initialize Next.js app with config files"
```

---

## Task 9: Next.js App — Theme System

**Files:**
- Create: `apps/web/src/features/presentation/theme/colors.ts`
- Create: `apps/web/src/features/presentation/theme/types.ts`
- Create: `apps/web/src/features/presentation/theme/theme-script.ts`
- Create: `apps/web/src/features/presentation/theme/theme-provider.tsx`
- Create: `apps/web/src/features/presentation/theme/use-theme.ts`
- Create: `apps/web/src/features/presentation/theme/index.ts`
- Create: `apps/web/src/app/globals.css`

- [ ] **Step 1: Create theme types**

Create `apps/web/src/features/presentation/theme/types.ts`:

```typescript
export type ThemeMode = 'light' | 'dark';

export interface Colors {
  readonly background: string;
  readonly foreground: string;
  readonly card: string;
  readonly cardForeground: string;
  readonly primary: string;
  readonly primaryForeground: string;
  readonly secondary: string;
  readonly secondaryForeground: string;
  readonly muted: string;
  readonly mutedForeground: string;
  readonly accent: string;
  readonly accentForeground: string;
  readonly destructive: string;
  readonly destructiveForeground: string;
  readonly border: string;
  readonly input: string;
  readonly ring: string;
}

export interface AppTheme {
  readonly mode: ThemeMode;
  readonly colors: Colors;
  readonly toggleTheme: () => void;
}
```

- [ ] **Step 2: Create colors.ts**

Create `apps/web/src/features/presentation/theme/colors.ts`:

```typescript
import type { Colors } from './types';

export const lightColors: Colors = {
  background: 'hsl(0 0% 100%)',
  foreground: 'hsl(222 47% 11%)',
  card: 'hsl(0 0% 100%)',
  cardForeground: 'hsl(222 47% 11%)',
  primary: 'hsl(221 83% 53%)',
  primaryForeground: 'hsl(210 40% 98%)',
  secondary: 'hsl(210 40% 96%)',
  secondaryForeground: 'hsl(222 47% 11%)',
  muted: 'hsl(210 40% 96%)',
  mutedForeground: 'hsl(215 16% 47%)',
  accent: 'hsl(210 40% 96%)',
  accentForeground: 'hsl(222 47% 11%)',
  destructive: 'hsl(0 84% 60%)',
  destructiveForeground: 'hsl(210 40% 98%)',
  border: 'hsl(214 32% 91%)',
  input: 'hsl(214 32% 91%)',
  ring: 'hsl(221 83% 53%)',
};

export const darkColors: Colors = {
  background: 'hsl(222 47% 11%)',
  foreground: 'hsl(210 40% 98%)',
  card: 'hsl(222 47% 15%)',
  cardForeground: 'hsl(210 40% 98%)',
  primary: 'hsl(217 91% 60%)',
  primaryForeground: 'hsl(222 47% 11%)',
  secondary: 'hsl(217 33% 17%)',
  secondaryForeground: 'hsl(210 40% 98%)',
  muted: 'hsl(217 33% 17%)',
  mutedForeground: 'hsl(215 20% 65%)',
  accent: 'hsl(217 33% 17%)',
  accentForeground: 'hsl(210 40% 98%)',
  destructive: 'hsl(0 62% 30%)',
  destructiveForeground: 'hsl(210 40% 98%)',
  border: 'hsl(217 33% 17%)',
  input: 'hsl(217 33% 17%)',
  ring: 'hsl(224 76% 48%)',
};

export const CSS_VAR_MAP: Record<keyof Colors, string> = {
  background: 'background',
  foreground: 'foreground',
  card: 'card',
  cardForeground: 'card-foreground',
  primary: 'primary',
  primaryForeground: 'primary-foreground',
  secondary: 'secondary',
  secondaryForeground: 'secondary-foreground',
  muted: 'muted',
  mutedForeground: 'muted-foreground',
  accent: 'accent',
  accentForeground: 'accent-foreground',
  destructive: 'destructive',
  destructiveForeground: 'destructive-foreground',
  border: 'border',
  input: 'input',
  ring: 'ring',
};
```

- [ ] **Step 3: Create theme-script.ts**

Create `apps/web/src/features/presentation/theme/theme-script.ts`:

```typescript
import { lightColors, darkColors, CSS_VAR_MAP } from './colors';
import type { Colors } from './types';

function generateCssVarString(colors: Colors): string {
  return Object.entries(CSS_VAR_MAP)
    .map(([key, varName]) => `--${varName}:${colors[key as keyof Colors]}`)
    .join(';');
}

export function getThemeScript(): string {
  const lightVars = generateCssVarString(lightColors);
  const darkVars = generateCssVarString(darkColors);

  return `
    (function() {
      try {
        var mode = localStorage.getItem('theme-mode') || 'light';
        var html = document.documentElement;
        if (mode === 'dark') {
          html.classList.add('dark');
          html.setAttribute('style', '${darkVars}');
        } else {
          html.classList.remove('dark');
          html.setAttribute('style', '${lightVars}');
        }
      } catch (e) {}
    })();
  `.trim();
}
```

- [ ] **Step 4: Create ThemeProvider**

Create `apps/web/src/features/presentation/theme/theme-provider.tsx`:

```tsx
'use client';

import { createContext, useCallback, useEffect, useState, type ReactNode } from 'react';
import { lightColors, darkColors, CSS_VAR_MAP } from './colors';
import type { AppTheme, Colors, ThemeMode } from './types';

export const ThemeContext = createContext<AppTheme | null>(null);

function applyColorsToElement(element: HTMLElement, colors: Colors): void {
  Object.entries(CSS_VAR_MAP).forEach(([key, varName]) => {
    element.style.setProperty(`--${varName}`, colors[key as keyof Colors]);
  });
}

interface ThemeProviderProps {
  readonly children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps): ReactNode {
  const [mode, setMode] = useState<ThemeMode>('light');

  useEffect(() => {
    const stored = localStorage.getItem('theme-mode') as ThemeMode | null;
    if (stored === 'light' || stored === 'dark') {
      setMode(stored);
    }
  }, []);

  useEffect(() => {
    const html = document.documentElement;
    const colors = mode === 'dark' ? darkColors : lightColors;
    applyColorsToElement(html, colors);
    if (mode === 'dark') {
      html.classList.add('dark');
    } else {
      html.classList.remove('dark');
    }
    localStorage.setItem('theme-mode', mode);
  }, [mode]);

  const toggleTheme = useCallback((): void => {
    setMode((previous) => (previous === 'light' ? 'dark' : 'light'));
  }, []);

  const colors = mode === 'dark' ? darkColors : lightColors;
  const theme: AppTheme = { mode, colors, toggleTheme };

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}
```

- [ ] **Step 5: Create useTheme hook**

Create `apps/web/src/features/presentation/theme/use-theme.ts`:

```typescript
'use client';

import { useContext } from 'react';
import { ThemeContext } from './theme-provider';
import type { AppTheme } from './types';

export function useTheme(): AppTheme {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
```

- [ ] **Step 6: Create barrel export**

Create `apps/web/src/features/presentation/theme/index.ts`:

```typescript
export { ThemeProvider } from './theme-provider';
export { useTheme } from './use-theme';
export { getThemeScript } from './theme-script';
export { lightColors, darkColors } from './colors';
export type { AppTheme, Colors, ThemeMode } from './types';
```

- [ ] **Step 7: Create globals.css**

Create `apps/web/src/app/globals.css`:

```css
@import 'tailwindcss';

@theme {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
}

*,
*::before,
*::after {
  border-color: var(--border);
}

body {
  background-color: var(--background);
  color: var(--foreground);
}
```

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/features/presentation/theme/ apps/web/src/app/globals.css
git commit -m "feat(web): add theme system with colors, ThemeProvider, useTheme, and FOUC prevention"
```

---

## Task 10: Next.js App — Localization System

**Files:**
- Create: `apps/web/src/features/presentation/localization/types.ts`
- Create: `apps/web/src/features/presentation/localization/languages/en/common.ts`
- Create: `apps/web/src/features/presentation/localization/languages/ro/common.ts`
- Create: `apps/web/src/features/presentation/localization/languages/registry.ts`
- Create: `apps/web/src/features/presentation/localization/language-provider.tsx`
- Create: `apps/web/src/features/presentation/localization/use-translations.ts`
- Create: `apps/web/src/features/presentation/localization/index.ts`

- [ ] **Step 1: Create localization types**

Create `apps/web/src/features/presentation/localization/types.ts`:

```typescript
export type LanguageCode = 'en' | 'ro';

export interface CommonTranslations {
  readonly appName: string;
  readonly loading: string;
  readonly error: string;
  readonly retry: string;
  readonly save: string;
  readonly cancel: string;
  readonly delete: string;
  readonly confirm: string;
  readonly search: string;
  readonly noResults: string;
  readonly healthStatus: string;
  readonly connected: string;
  readonly disconnected: string;
}

export interface TranslationNamespaces {
  readonly common: CommonTranslations;
}

export type TranslationNamespace = keyof TranslationNamespaces;
```

- [ ] **Step 2: Create English translations**

Create `apps/web/src/features/presentation/localization/languages/en/common.ts`:

```typescript
import type { CommonTranslations } from '../../types';

export const common: CommonTranslations = {
  appName: 'SFX App',
  loading: 'Loading...',
  error: 'An error occurred',
  retry: 'Retry',
  save: 'Save',
  cancel: 'Cancel',
  delete: 'Delete',
  confirm: 'Confirm',
  search: 'Search',
  noResults: 'No results found',
  healthStatus: 'Health Status',
  connected: 'Connected',
  disconnected: 'Disconnected',
};
```

- [ ] **Step 3: Create Romanian translations**

Create `apps/web/src/features/presentation/localization/languages/ro/common.ts`:

```typescript
import type { CommonTranslations } from '../../types';

export const common: CommonTranslations = {
  appName: 'SFX App',
  loading: 'Se incarca...',
  error: 'A aparut o eroare',
  retry: 'Reincearca',
  save: 'Salveaza',
  cancel: 'Anuleaza',
  delete: 'Sterge',
  confirm: 'Confirma',
  search: 'Cauta',
  noResults: 'Niciun rezultat gasit',
  healthStatus: 'Stare de Sanatate',
  connected: 'Conectat',
  disconnected: 'Deconectat',
};
```

- [ ] **Step 4: Create registry**

Create `apps/web/src/features/presentation/localization/languages/registry.ts`:

```typescript
import type { LanguageCode, TranslationNamespaces } from '../types';
import { common as enCommon } from './en/common';
import { common as roCommon } from './ro/common';

export const LANGUAGE_DISPLAY_NAMES: Record<LanguageCode, string> = {
  en: 'English',
  ro: 'Romana',
};

export const translations: Record<LanguageCode, TranslationNamespaces> = {
  en: { common: enCommon },
  ro: { common: roCommon },
};
```

- [ ] **Step 5: Create LanguageProvider**

Create `apps/web/src/features/presentation/localization/language-provider.tsx`:

```tsx
'use client';

import { createContext, useCallback, useState, type ReactNode } from 'react';
import type { LanguageCode } from './types';

interface LanguageContextValue {
  readonly language: LanguageCode;
  readonly setLanguage: (language: LanguageCode) => void;
}

export const LanguageContext = createContext<LanguageContextValue | null>(null);

interface LanguageProviderProps {
  readonly children: ReactNode;
  readonly defaultLanguage?: LanguageCode;
}

export function LanguageProvider({
  children,
  defaultLanguage = 'en',
}: LanguageProviderProps): ReactNode {
  const [language, setLanguageState] = useState<LanguageCode>(defaultLanguage);

  const setLanguage = useCallback((newLanguage: LanguageCode): void => {
    setLanguageState(newLanguage);
    localStorage.setItem('language', newLanguage);
  }, []);

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}
```

- [ ] **Step 6: Create useTranslations hook**

Create `apps/web/src/features/presentation/localization/use-translations.ts`:

```typescript
'use client';

import { useContext } from 'react';
import { LanguageContext } from './language-provider';
import { translations } from './languages/registry';
import type { TranslationNamespace, TranslationNamespaces } from './types';

export function useTranslations<T extends TranslationNamespace>(
  namespace: T,
): TranslationNamespaces[T] {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useTranslations must be used within a LanguageProvider');
  }
  return translations[context.language][namespace];
}
```

- [ ] **Step 7: Create barrel export**

Create `apps/web/src/features/presentation/localization/index.ts`:

```typescript
export { LanguageProvider } from './language-provider';
export { useTranslations } from './use-translations';
export { LANGUAGE_DISPLAY_NAMES } from './languages/registry';
export type { LanguageCode, TranslationNamespace, CommonTranslations } from './types';
```

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/features/presentation/localization/
git commit -m "feat(web): add localization system with en/ro translations and useTranslations hook"
```

---

## Task 11: Next.js App — Networking & Stores

**Files:**
- Create: `apps/web/src/features/presentation/networking/types.ts`
- Create: `apps/web/src/features/presentation/networking/execute-request.ts`
- Create: `apps/web/src/features/presentation/networking/index.ts`
- Create: `apps/web/src/stores/app-store.ts`
- Create: `apps/web/src/types/index.ts`

- [ ] **Step 1: Create networking types**

Create `apps/web/src/features/presentation/networking/types.ts`:

```typescript
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestConfig {
  readonly path: string;
  readonly method?: HttpMethod;
  readonly body?: unknown;
  readonly headers?: Record<string, string>;
}

export interface RequestResponse<T> {
  readonly data: T;
  readonly status: number;
}

export interface RequestError {
  readonly message: string;
  readonly status: number;
  readonly code?: string;
}
```

- [ ] **Step 2: Create executeRequest**

Create `apps/web/src/features/presentation/networking/execute-request.ts`:

```typescript
import type { RequestConfig, RequestResponse, RequestError } from './types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export async function executeRequest<T>(config: RequestConfig): Promise<RequestResponse<T>> {
  const { path, method = 'GET', body, headers = {} } = config;

  const url = `${API_BASE_URL}/${path}`;

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers,
  };

  const response = await fetch(url, {
    method,
    headers: requestHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const error: RequestError = {
      message: (errorBody as Record<string, unknown>).message as string ?? 'Request failed',
      status: response.status,
      code: (errorBody as Record<string, unknown>).code as string | undefined,
    };
    throw error;
  }

  const data = (await response.json()) as T;
  return { data, status: response.status };
}
```

- [ ] **Step 3: Create networking barrel**

Create `apps/web/src/features/presentation/networking/index.ts`:

```typescript
export { executeRequest } from './execute-request';
export type { RequestConfig, RequestResponse, RequestError, HttpMethod } from './types';
```

- [ ] **Step 4: Create app store**

Create `apps/web/src/stores/app-store.ts`:

```typescript
import { create } from 'zustand';

interface AppState {
  readonly isSidebarOpen: boolean;
  readonly toggleSidebar: () => void;
  readonly setSidebarOpen: (isOpen: boolean) => void;
}

export const useAppStore = create<AppState>()((set) => ({
  isSidebarOpen: true,
  toggleSidebar: (): void => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  setSidebarOpen: (isOpen: boolean): void => set({ isSidebarOpen: isOpen }),
}));
```

- [ ] **Step 5: Create shared types barrel**

Create `apps/web/src/types/index.ts`:

```typescript
export type { User } from '@sfx/domain';
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/presentation/networking/ apps/web/src/stores/ apps/web/src/types/
git commit -m "feat(web): add executeRequest networking abstraction, Zustand app store, and shared types"
```

---

## Task 12: Next.js App — Layout, Providers & Home Feature

**Files:**
- Create: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/app/providers.tsx`
- Create: `apps/web/src/app/page.tsx`
- Create: `apps/web/src/features/home/constants.ts`
- Create: `apps/web/src/features/home/index.ts`
- Create: `apps/web/src/features/home/data/model/health-data-model.ts`
- Create: `apps/web/src/features/home/data/mapper/map-to-health.ts`
- Create: `apps/web/src/features/home/data/remote/fetch-health.ts`
- Create: `apps/web/src/features/home/data/repositories/use-health-repository.ts`
- Create: `apps/web/src/features/home/presentation/pages/home/types.ts`
- Create: `apps/web/src/features/home/presentation/pages/home/map-to-home-page-ui-model.ts`
- Create: `apps/web/src/features/home/presentation/pages/home/use-home.ts`
- Create: `apps/web/src/features/home/presentation/pages/home/index.tsx`
- Create: `apps/web/src/features/home/presentation/components/HealthStatus/types.ts`
- Create: `apps/web/src/features/home/presentation/components/HealthStatus/HealthStatus.tsx`
- Create: `apps/web/src/features/home/presentation/components/HealthStatus/index.ts`

- [ ] **Step 1: Create providers.tsx**

Create `apps/web/src/app/providers.tsx`:

```tsx
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { ThemeProvider } from '@/features/presentation/theme';
import { LanguageProvider } from '@/features/presentation/localization';

interface ProvidersProps {
  readonly children: ReactNode;
}

export function Providers({ children }: ProvidersProps): ReactNode {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <LanguageProvider>{children}</LanguageProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 2: Create layout.tsx**

Create `apps/web/src/app/layout.tsx`:

```tsx
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getThemeScript } from '@/features/presentation/theme';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'SFX App',
  description: 'SFX Webapp Boilerplate',
};

interface RootLayoutProps {
  readonly children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps): ReactNode {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: getThemeScript() }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Create home feature data layer**

Create `apps/web/src/features/home/constants.ts`:

```typescript
export const HEALTH_QUERY_KEY = ['health'] as const;
export const HEALTH_ENDPOINT = 'api/v1/health';
```

Create `apps/web/src/features/home/data/model/health-data-model.ts`:

```typescript
export interface HealthDataModel {
  readonly status: string;
  readonly timestamp: string;
  readonly database: string;
}
```

Create `apps/web/src/features/home/data/mapper/map-to-health.ts`:

```typescript
import type { HealthDataModel } from '../model/health-data-model';

export interface HealthStatus {
  readonly isHealthy: boolean;
  readonly databaseConnected: boolean;
  readonly checkedAt: Date;
}

export function mapToHealth(data: HealthDataModel): HealthStatus {
  return {
    isHealthy: data.status === 'ok',
    databaseConnected: data.database === 'connected',
    checkedAt: new Date(data.timestamp),
  };
}
```

Create `apps/web/src/features/home/data/remote/fetch-health.ts`:

```typescript
import { executeRequest } from '@/features/presentation/networking';
import { HEALTH_ENDPOINT } from '../../constants';
import type { HealthDataModel } from '../model/health-data-model';

export async function fetchHealth(): Promise<HealthDataModel> {
  const response = await executeRequest<HealthDataModel>({ path: HEALTH_ENDPOINT });
  return response.data;
}
```

Create `apps/web/src/features/home/data/repositories/use-health-repository.ts`:

```typescript
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { HEALTH_QUERY_KEY } from '../../constants';
import { fetchHealth } from '../remote/fetch-health';
import { mapToHealth, type HealthStatus } from '../mapper/map-to-health';
import type { HealthDataModel } from '../model/health-data-model';

export function useHealthRepository(): UseQueryResult<HealthStatus> {
  return useQuery({
    queryKey: HEALTH_QUERY_KEY,
    queryFn: fetchHealth,
    select: (data: HealthDataModel) => mapToHealth(data),
    refetchInterval: 30000,
  });
}
```

- [ ] **Step 4: Create home feature presentation layer**

Create `apps/web/src/features/home/presentation/pages/home/types.ts`:

```typescript
export interface HomePageUIModel {
  readonly title: string;
  readonly healthLabel: string;
  readonly statusText: string;
  readonly isLoading: boolean;
  readonly isHealthy: boolean;
  readonly isError: boolean;
}

export interface UseHomeReturn {
  readonly uiModel: HomePageUIModel;
}
```

Create `apps/web/src/features/home/presentation/pages/home/map-to-home-page-ui-model.ts`:

```typescript
import type { CommonTranslations } from '@/features/presentation/localization';
import type { HealthStatus } from '@/features/home/data/mapper/map-to-health';
import type { HomePageUIModel } from './types';

interface MapToHomePageUIModelInput {
  readonly translations: CommonTranslations;
  readonly health: HealthStatus | undefined;
  readonly isLoading: boolean;
  readonly isError: boolean;
}

export function mapToHomePageUIModel(input: MapToHomePageUIModelInput): HomePageUIModel {
  const { translations, health, isLoading, isError } = input;

  let statusText = translations.loading;
  if (!isLoading && health) {
    statusText = health.isHealthy ? translations.connected : translations.disconnected;
  }
  if (isError) {
    statusText = translations.disconnected;
  }

  return {
    title: translations.appName,
    healthLabel: translations.healthStatus,
    statusText,
    isLoading,
    isHealthy: health?.isHealthy ?? false,
    isError,
  };
}
```

Create `apps/web/src/features/home/presentation/pages/home/use-home.ts`:

```typescript
'use client';

import { useTranslations } from '@/features/presentation/localization';
import { useHealthRepository } from '@/features/home/data/repositories/use-health-repository';
import { mapToHomePageUIModel } from './map-to-home-page-ui-model';
import type { UseHomeReturn } from './types';

export function useHome(): UseHomeReturn {
  const translations = useTranslations('common');
  const { data: health, isLoading, isError } = useHealthRepository();

  const uiModel = mapToHomePageUIModel({
    translations,
    health,
    isLoading,
    isError,
  });

  return { uiModel };
}
```

Create `apps/web/src/features/home/presentation/components/HealthStatus/types.ts`:

```typescript
export interface HealthStatusProps {
  readonly label: string;
  readonly statusText: string;
  readonly isHealthy: boolean;
  readonly isLoading: boolean;
}
```

Create `apps/web/src/features/home/presentation/components/HealthStatus/HealthStatus.tsx`:

```tsx
import type { ReactNode } from 'react';
import type { HealthStatusProps } from './types';

export function HealthStatus({
  label,
  statusText,
  isHealthy,
  isLoading,
}: HealthStatusProps): ReactNode {
  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="h-4 w-32 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-6 w-24 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${isHealthy ? 'text-green-500' : 'text-destructive'}`}>
        {statusText}
      </p>
    </div>
  );
}
```

Create `apps/web/src/features/home/presentation/components/HealthStatus/index.ts`:

```typescript
export { HealthStatus } from './HealthStatus';
export type { HealthStatusProps } from './types';
```

Create `apps/web/src/features/home/presentation/pages/home/index.tsx`:

```tsx
'use client';

import type { ReactNode } from 'react';
import { useHome } from './use-home';
import { HealthStatus } from '../../components/HealthStatus';

export function HomePage(): ReactNode {
  const { uiModel } = useHome();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-8">
      <h1 className="mb-8 text-4xl font-bold text-foreground">{uiModel.title}</h1>
      <HealthStatus
        label={uiModel.healthLabel}
        statusText={uiModel.statusText}
        isHealthy={uiModel.isHealthy}
        isLoading={uiModel.isLoading}
      />
    </main>
  );
}
```

- [ ] **Step 5: Create barrel exports and page wrapper**

Create `apps/web/src/features/home/index.ts`:

```typescript
export { HomePage } from './presentation/pages/home';
```

Create `apps/web/src/app/page.tsx`:

```tsx
import type { ReactNode } from 'react';
import { HomePage } from '@/features/home';

export default function Page(): ReactNode {
  return <HomePage />;
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/
git commit -m "feat(web): add layout, providers, theme/localization integration, and home feature with health check"
```

---

## Task 13: Initialize NestJS App — Config Files

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/tsconfig.build.json`
- Create: `apps/api/nest-cli.json`
- Create: `apps/api/jest.config.ts`
- Create: `apps/api/.env.example`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@sfx/api",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "nest start --watch",
    "build": "nest build",
    "start": "node dist/main.js",
    "start:prod": "node dist/main.js",
    "test": "jest",
    "test:coverage": "jest --coverage",
    "test:e2e": "jest --config test/jest-e2e.config.ts",
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@sfx/domain": "workspace:*",
    "@sfx/shared": "workspace:*",
    "@sfx/validation": "workspace:*",
    "@sfx/database": "workspace:*",
    "@nestjs/common": "11.0.0",
    "@nestjs/core": "11.0.0",
    "@nestjs/platform-express": "11.0.0",
    "@nestjs/config": "4.0.0",
    "@nestjs/throttler": "6.4.0",
    "helmet": "8.0.0",
    "class-transformer": "0.5.1",
    "reflect-metadata": "0.2.2",
    "rxjs": "7.8.1",
    "zod": "3.24.2"
  },
  "devDependencies": {
    "@nestjs/cli": "11.0.0",
    "@nestjs/schematics": "11.0.0",
    "@nestjs/testing": "11.0.0",
    "@types/express": "5.0.0",
    "@types/jest": "29.5.14",
    "typescript": "5.7.3",
    "jest": "29.7.0",
    "ts-jest": "29.2.5",
    "ts-loader": "9.5.1",
    "source-map-support": "0.5.21"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2021",
    "module": "commonjs",
    "moduleResolution": "node",
    "outDir": "./dist",
    "rootDir": "./src",
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "declaration": false,
    "declarationMap": false,
    "sourceMap": true,
    "incremental": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "test"]
}
```

- [ ] **Step 3: Create tsconfig.build.json**

```json
{
  "extends": "./tsconfig.json",
  "exclude": ["node_modules", "dist", "test", "**/*.test.ts", "**/__tests__/**"]
}
```

- [ ] **Step 4: Create nest-cli.json**

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "deleteOutDir": true,
    "tsConfigPath": "tsconfig.build.json"
  }
}
```

- [ ] **Step 5: Create jest.config.ts**

```typescript
import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.test\\.ts$',
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: ['**/*.ts', '!**/index.ts', '!main.ts'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90,
    },
  },
};

export default config;
```

- [ ] **Step 6: Create e2e jest config**

Create `apps/api/test/jest-e2e.config.ts`:

```typescript
import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.e2e-test.ts$',
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  testEnvironment: 'node',
};

export default config;
```

- [ ] **Step 7: Create .env.example**

```bash
DATABASE_URL=postgresql://sfx:sfx@localhost:5432/sfx_db
JWT_SECRET=change-this-in-production
PORT=3001
NODE_ENV=development
```

- [ ] **Step 8: Commit**

```bash
git add apps/api/package.json apps/api/tsconfig.json apps/api/tsconfig.build.json apps/api/nest-cli.json apps/api/jest.config.ts apps/api/test/ apps/api/.env.example
git commit -m "feat(api): initialize NestJS app with config files"
```

---

## Task 14: NestJS App — Common Module & Bootstrap

**Files:**
- Create: `apps/api/src/main.ts`
- Create: `apps/api/src/app.module.ts`
- Create: `apps/api/src/common/filters/http-exception.filter.ts`
- Create: `apps/api/src/common/pipes/zod-validation.pipe.ts`
- Create: `apps/api/src/common/interceptors/transform.interceptor.ts`
- Create: `apps/api/src/config/env.validation.ts`
- Create: `apps/api/src/config/config.module.ts`

- [ ] **Step 1: Create Zod validation pipe**

Create `apps/api/src/common/pipes/zod-validation.pipe.ts`:

```typescript
import { PipeTransform, BadRequestException } from '@nestjs/common';
import type { ZodSchema, ZodError } from 'zod';

export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const errors = (result.error as ZodError).errors.map((error) => ({
        field: error.path.join('.'),
        message: error.message,
      }));
      throw new BadRequestException({ message: 'Validation failed', errors });
    }
    return result.data;
  }
}
```

- [ ] **Step 2: Create HTTP exception filter**

Create `apps/api/src/common/filters/http-exception.filter.ts`:

```typescript
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';

interface ExceptionBody {
  readonly message?: string;
  readonly errors?: unknown[];
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errors: unknown[] | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else {
        const typedBody = body as ExceptionBody;
        message = typedBody.message ?? message;
        errors = typedBody.errors;
      }
    }

    response.status(status).json({
      success: false,
      error: {
        statusCode: status,
        message,
        ...(errors ? { errors } : {}),
      },
    });
  }
}
```

- [ ] **Step 3: Create transform interceptor**

Create `apps/api/src/common/interceptors/transform.interceptor.ts`:

```typescript
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable, map } from 'rxjs';

interface SuccessResponse<T> {
  readonly success: true;
  readonly data: T;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, SuccessResponse<T>> {
  intercept(_context: ExecutionContext, next: CallHandler<T>): Observable<SuccessResponse<T>> {
    return next.handle().pipe(
      map((data) => ({
        success: true as const,
        data,
      })),
    );
  }
}
```

- [ ] **Step 4: Create env validation**

Create `apps/api/src/config/env.validation.ts`:

```typescript
import { z } from 'zod';

export const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(16),
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const formatted = result.error.errors
      .map((error) => `  ${error.path.join('.')}: ${error.message}`)
      .join('\n');
    throw new Error(`Environment validation failed:\n${formatted}`);
  }
  return result.data;
}
```

- [ ] **Step 5: Create config module**

Create `apps/api/src/config/config.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { validateEnv } from './env.validation';

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
  ],
})
export class AppConfigModule {}
```

- [ ] **Step 6: Create app.module.ts**

Create `apps/api/src/app.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppConfigModule } from './config/config.module';

@Module({
  imports: [
    AppConfigModule,
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),
  ],
})
export class AppModule {}
```

- [ ] **Step 7: Create main.ts**

Create `apps/api/src/main.ts`:

```typescript
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3001);

  app.use(helmet());
  app.enableCors({
    origin: process.env.NODE_ENV === 'production' ? false : true,
    credentials: true,
  });
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  await app.listen(port);
  console.warn(`API running on port ${port}`);
}

bootstrap();
```

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/
git commit -m "feat(api): add bootstrap, common filters/pipes/interceptors, and config module"
```

---

## Task 15: NestJS App — Health & User Modules

**Files:**
- Create: `apps/api/src/modules/health/health.module.ts`
- Create: `apps/api/src/modules/health/application/controllers/health.controller.ts`
- Create: `apps/api/src/modules/user/user.module.ts`
- Create: `apps/api/src/modules/user/data/repositories/user.repository.ts`
- Create: `apps/api/src/modules/user/data/mapper/user.mapper.ts`
- Create: `apps/api/src/modules/user/application/controllers/user.controller.ts`
- Create: `apps/api/src/modules/user/application/dtos/create-user.dto.ts`
- Create: `apps/api/src/modules/user/application/pipes/create-user-validation.pipe.ts`
- Create: `apps/api/src/modules/user/index.ts`
- Test: `apps/api/src/modules/health/application/controllers/__tests__/health.controller.test.ts`
- Test: `apps/api/src/modules/user/application/controllers/__tests__/user.controller.test.ts`

- [ ] **Step 1: Write failing test for health controller**

Create `apps/api/src/modules/health/application/controllers/__tests__/health.controller.test.ts`:

```typescript
import { HealthController } from '../health.controller';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(() => {
    controller = new HealthController();
  });

  it('should return health status with ok status', () => {
    const result = controller.check();

    expect(result.status).toBe('ok');
    expect(result.database).toBe('connected');
    expect(result.timestamp).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest src/modules/health/application/controllers/__tests__/health.controller.test.ts -v`
Expected: FAIL — cannot resolve module

- [ ] **Step 3: Implement health controller**

Create `apps/api/src/modules/health/application/controllers/health.controller.ts`:

```typescript
import { Controller, Get } from '@nestjs/common';

interface HealthResponse {
  readonly status: string;
  readonly timestamp: string;
  readonly database: string;
}

@Controller('health')
export class HealthController {
  @Get()
  check(): HealthResponse {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: 'connected',
    };
  }
}
```

Create `apps/api/src/modules/health/health.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { HealthController } from './application/controllers/health.controller';

@Module({
  controllers: [HealthController],
})
export class HealthModule {}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest src/modules/health/application/controllers/__tests__/health.controller.test.ts -v`
Expected: PASS (1 test)

- [ ] **Step 5: Write failing test for user controller**

Create `apps/api/src/modules/user/application/controllers/__tests__/user.controller.test.ts`:

```typescript
import { UserController } from '../user.controller';
import type { IUserRepository, User } from '@sfx/domain';

const mockUser: User = {
  id: 'cuid123',
  email: 'test@example.com',
  name: 'Test User',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

const mockUserRepository: IUserRepository = {
  findById: jest.fn().mockResolvedValue(mockUser),
  findByEmail: jest.fn().mockResolvedValue(null),
  findAll: jest.fn().mockResolvedValue([mockUser]),
  create: jest.fn().mockResolvedValue(mockUser),
  update: jest.fn().mockResolvedValue(mockUser),
  delete: jest.fn().mockResolvedValue(undefined),
};

describe('UserController', () => {
  let controller: UserController;

  beforeEach(() => {
    controller = new UserController(mockUserRepository);
    jest.clearAllMocks();
  });

  it('should return all users', async () => {
    const result = await controller.findAll();

    expect(result).toEqual([mockUser]);
    expect(mockUserRepository.findAll).toHaveBeenCalledTimes(1);
  });

  it('should create a user', async () => {
    const input = { email: 'new@example.com', name: 'New User' };
    await controller.create(input);

    expect(mockUserRepository.create).toHaveBeenCalledWith(input);
  });

  it('should find a user by id', async () => {
    const result = await controller.findById('cuid123');

    expect(result).toEqual(mockUser);
    expect(mockUserRepository.findById).toHaveBeenCalledWith('cuid123');
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd apps/api && npx jest src/modules/user/application/controllers/__tests__/user.controller.test.ts -v`
Expected: FAIL — cannot resolve module

- [ ] **Step 7: Implement user module data layer**

Create `apps/api/src/modules/user/data/mapper/user.mapper.ts`:

```typescript
import type { User } from '@sfx/domain';

interface PrismaUser {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly avatarUrl: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export function mapPrismaUserToDomain(prismaUser: PrismaUser): User {
  return {
    id: prismaUser.id,
    email: prismaUser.email,
    name: prismaUser.name,
    avatarUrl: prismaUser.avatarUrl ?? undefined,
    createdAt: prismaUser.createdAt,
    updatedAt: prismaUser.updatedAt,
  };
}
```

Create `apps/api/src/modules/user/data/repositories/user.repository.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import type { IUserRepository, User } from '@sfx/domain';
import { prisma } from '@sfx/database';
import { mapPrismaUserToDomain } from '../mapper/user.mapper';

@Injectable()
export class UserRepository implements IUserRepository {
  async findById(id: string): Promise<User | null> {
    const user = await prisma.user.findUnique({ where: { id } });
    return user ? mapPrismaUserToDomain(user) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const user = await prisma.user.findUnique({ where: { email } });
    return user ? mapPrismaUserToDomain(user) : null;
  }

  async findAll(): Promise<User[]> {
    const users = await prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
    return users.map(mapPrismaUserToDomain);
  }

  async create(data: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<User> {
    const user = await prisma.user.create({ data });
    return mapPrismaUserToDomain(user);
  }

  async update(
    id: string,
    data: Partial<Omit<User, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Promise<User> {
    const user = await prisma.user.update({ where: { id }, data });
    return mapPrismaUserToDomain(user);
  }

  async delete(id: string): Promise<void> {
    await prisma.user.delete({ where: { id } });
  }
}
```

- [ ] **Step 8: Implement user module application layer**

Create `apps/api/src/modules/user/application/dtos/create-user.dto.ts`:

```typescript
import type { CreateUserSchemaInput } from '@sfx/validation';

export type CreateUserDto = CreateUserSchemaInput;
```

Create `apps/api/src/modules/user/application/pipes/create-user-validation.pipe.ts`:

```typescript
import { createUserSchema } from '@sfx/validation';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe';
import type { CreateUserDto } from '../dtos/create-user.dto';

export class CreateUserValidationPipe extends ZodValidationPipe<CreateUserDto> {
  constructor() {
    super(createUserSchema);
  }
}
```

Create `apps/api/src/modules/user/application/controllers/user.controller.ts`:

```typescript
import { Controller, Get, Post, Param, Body, Inject, NotFoundException, UsePipes } from '@nestjs/common';
import type { IUserRepository, User } from '@sfx/domain';
import { CreateUserValidationPipe } from '../pipes/create-user-validation.pipe';
import type { CreateUserDto } from '../dtos/create-user.dto';

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

@Controller('users')
export class UserController {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository,
  ) {}

  @Get()
  async findAll(): Promise<User[]> {
    return this.userRepository.findAll();
  }

  @Get(':id')
  async findById(@Param('id') id: string): Promise<User> {
    const user = await this.userRepository.findById(id);
    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }
    return user;
  }

  @Post()
  @UsePipes(new CreateUserValidationPipe())
  async create(@Body() createUserDto: CreateUserDto): Promise<User> {
    return this.userRepository.create(createUserDto);
  }
}
```

- [ ] **Step 9: Create user module and barrel export**

Create `apps/api/src/modules/user/user.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { UserController, USER_REPOSITORY } from './application/controllers/user.controller';
import { UserRepository } from './data/repositories/user.repository';

@Module({
  controllers: [UserController],
  providers: [
    {
      provide: USER_REPOSITORY,
      useClass: UserRepository,
    },
  ],
  exports: [USER_REPOSITORY],
})
export class UserModule {}
```

Create `apps/api/src/modules/user/index.ts`:

```typescript
export { UserModule } from './user.module';
```

- [ ] **Step 10: Register modules in AppModule**

Update `apps/api/src/app.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppConfigModule } from './config/config.module';
import { HealthModule } from './modules/health/health.module';
import { UserModule } from './modules/user';

@Module({
  imports: [
    AppConfigModule,
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),
    HealthModule,
    UserModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 11: Run tests to verify they pass**

Run: `cd apps/api && npx jest -v`
Expected: PASS (4 tests — 1 health + 3 user)

- [ ] **Step 12: Create e2e test**

Create `apps/api/test/app.e2e-test.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('App (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/api/v1/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect((response) => {
        expect(response.body.status).toBe('ok');
      });
  });
});
```

- [ ] **Step 13: Commit**

```bash
git add apps/api/src/ apps/api/test/
git commit -m "feat(api): add health and user modules with Clean Architecture, Zod validation, and tests"
```

---

## Task 16: Docker Setup

**Files:**
- Create: `apps/web/Dockerfile`
- Create: `apps/api/Dockerfile`
- Create: `docker-compose.yml`
- Create: `docker-compose.prod.yml`
- Create: `.dockerignore`

- [ ] **Step 1: Create .dockerignore**

```dockerignore
node_modules
.next
dist
.turbo
.git
coverage
*.md
!README.md
.env
.env.*
pgdata
```

- [ ] **Step 2: Create Next.js Dockerfile**

Create `apps/web/Dockerfile`:

```dockerfile
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

# --- Dependencies ---
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY packages/domain/package.json packages/domain/
COPY packages/shared/package.json packages/shared/
COPY packages/validation/package.json packages/validation/
RUN pnpm install --frozen-lockfile

# --- Development ---
FROM deps AS development
COPY . .
WORKDIR /app/apps/web
CMD ["pnpm", "dev"]

# --- Build ---
FROM deps AS build
COPY . .
RUN pnpm --filter @sfx/web build

# --- Production ---
FROM node:22-alpine AS production
WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/web/server.js"]
```

- [ ] **Step 3: Create NestJS Dockerfile**

Create `apps/api/Dockerfile`:

```dockerfile
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

# --- Dependencies ---
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY packages/domain/package.json packages/domain/
COPY packages/shared/package.json packages/shared/
COPY packages/validation/package.json packages/validation/
COPY packages/database/package.json packages/database/
COPY packages/database/prisma/schema.prisma packages/database/prisma/
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @sfx/database prisma generate

# --- Development ---
FROM deps AS development
COPY . .
WORKDIR /app/apps/api
CMD ["pnpm", "dev"]

# --- Build ---
FROM deps AS build
COPY . .
RUN pnpm --filter @sfx/api build

# --- Production ---
FROM node:22-alpine AS production
WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/database/prisma ./prisma

EXPOSE 3001
CMD ["sh", "-c", "npx prisma migrate deploy --schema ./prisma/schema.prisma && node dist/main.js"]
```

- [ ] **Step 4: Create docker-compose.yml**

```yaml
services:
  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
      target: development
    ports:
      - "3000:3000"
    volumes:
      - ./apps/web/src:/app/apps/web/src
      - ./packages/domain/src:/app/packages/domain/src
      - ./packages/shared/src:/app/packages/shared/src
      - ./packages/validation/src:/app/packages/validation/src
    environment:
      - NEXT_PUBLIC_API_URL=http://localhost:3001
    depends_on:
      - api

  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
      target: development
    ports:
      - "3001:3001"
    volumes:
      - ./apps/api/src:/app/apps/api/src
      - ./packages/domain/src:/app/packages/domain/src
      - ./packages/shared/src:/app/packages/shared/src
      - ./packages/validation/src:/app/packages/validation/src
      - ./packages/database/src:/app/packages/database/src
      - ./packages/database/prisma:/app/packages/database/prisma
    environment:
      - DATABASE_URL=postgresql://sfx:sfx@postgres:5432/sfx_db
      - JWT_SECRET=dev-secret-minimum-16-chars
      - PORT=3001
      - NODE_ENV=development
    depends_on:
      postgres:
        condition: service_healthy

  postgres:
    image: postgres:16-alpine
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: sfx
      POSTGRES_PASSWORD: sfx
      POSTGRES_DB: sfx_db
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U sfx"]
      interval: 5s
      timeout: 3s
      retries: 5

volumes:
  pgdata:
```

- [ ] **Step 5: Create docker-compose.prod.yml**

```yaml
services:
  web:
    build:
      target: production
    volumes: []
    environment:
      - NEXT_PUBLIC_API_URL=http://api:3001

  api:
    build:
      target: production
    volumes: []
    environment:
      - DATABASE_URL=postgresql://sfx:sfx@postgres:5432/sfx_db
      - JWT_SECRET=${JWT_SECRET}
      - PORT=3001
      - NODE_ENV=production
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/Dockerfile apps/api/Dockerfile docker-compose.yml docker-compose.prod.yml .dockerignore
git commit -m "feat(docker): add multi-stage Dockerfiles and docker-compose for dev/prod"
```

---

## Task 17: Root CLAUDE.md

**Files:**
- Create: `CLAUDE.md`

- [ ] **Step 1: Write root CLAUDE.md**

Create `CLAUDE.md` with full monorepo rules. This is the orchestrator-facing document. Contents:

```markdown
# SFX Webapp Boilerplate — Monorepo Development Guide

You are an expert senior engineer working in a Turborepo + pnpm monorepo containing a Next.js frontend, NestJS backend, and shared packages. You follow Clean Architecture with a shared domain layer. You write tests before implementation (90%+ coverage), never ship code without type-checking and linting passing, and produce working code — not explanations.

## Commands

### Root (run from monorepo root)
```bash
pnpm dev                   # Start web + api in parallel
pnpm build                 # Build all packages + apps in dependency order
pnpm test                  # Run all tests
pnpm test:coverage         # Tests with 90%+ coverage enforcement
pnpm lint                  # Lint all packages + apps
pnpm typecheck             # Type check all packages + apps
pnpm clean                 # Remove node_modules, dist, .next, .turbo
```

### Docker
```bash
pnpm docker:up             # Dev: web (3000) + api (3001) + postgres (5432)
pnpm docker:down           # Stop all containers
pnpm docker:prod           # Production build + run
```

### Database
```bash
pnpm db:migrate            # Run Prisma migrations (dev)
pnpm db:migrate:deploy     # Run Prisma migrations (prod)
pnpm db:seed               # Seed database
pnpm db:studio             # Open Prisma Studio
pnpm db:generate           # Regenerate Prisma client
```

### Per-App
```bash
pnpm --filter @sfx/web dev       # Start frontend only
pnpm --filter @sfx/api dev       # Start backend only
pnpm --filter @sfx/web test      # Test frontend only
pnpm --filter @sfx/api test      # Test backend only
```

## Agent Routing

- **Frontend work** → spawn subagent in `apps/web/`
- **Backend work** → spawn subagent in `apps/api/`
- **Shared domain/validation/types** → work at root in `packages/`
- **Docker/infra changes** → work at root

## Monorepo Structure

```
apps/web/       → Next.js 15 frontend (@sfx/web)
apps/api/       → NestJS 11 backend (@sfx/api)
packages/domain/     → Shared domain entities + interfaces (@sfx/domain)
packages/shared/     → Constants, enums, utility types (@sfx/shared)
packages/validation/ → Shared Zod schemas (@sfx/validation)
packages/database/   → Prisma schema + client (@sfx/database)
```

## Clean Architecture — Dependency Rules

```
@sfx/domain (ZERO deps) ← @sfx/validation, @sfx/shared, @sfx/database
                         ← apps/web (data + presentation layers)
                         ← apps/api (data + application layers)
```

| Source | Can import from |
|--------|----------------|
| `@sfx/domain` | Nothing (pure, zero deps) |
| `@sfx/validation` | `@sfx/domain` only |
| `@sfx/database` | `@sfx/domain` only |
| `@sfx/shared` | `@sfx/domain` only |
| Frontend data layer | `@sfx/domain`, `@sfx/validation`, `@sfx/shared` |
| Frontend presentation | own data layer, `@sfx/domain` |
| Backend data layer | `@sfx/domain`, `@sfx/database` |
| Backend application | own data layer, `@sfx/domain`, `@sfx/validation` |

**NEVER** import from `apps/` in `packages/`. **NEVER** import domain from data. **NEVER** import data from presentation/application.

## Boundaries

### Always do
- Write tests for every new file (90%+ coverage)
- Use Zod schemas from `@sfx/validation` for both frontend forms and backend validation
- Use domain entities from `@sfx/domain` — never redefine them in apps
- Pin dependency versions — no `^` or `~`
- Conventional commits: `type(scope): description`
- Think before acting. Read existing files before writing code.

### Never do
- Duplicate domain models between frontend and backend
- Import from `apps/` inside `packages/`
- Import from `@sfx/database` in the frontend
- Use raw `fetch()` in frontend features — use `executeRequest()`
- Skip tests or ship code below 90% coverage
- Hardcode secrets or credentials
- Use single-letter variable names

## Naming Conventions

| Type | Case | Example |
|------|------|---------|
| Packages | @sfx/kebab-case | `@sfx/domain`, `@sfx/validation` |
| Components, Types | PascalCase | `UserProfile`, `UserProfileProps` |
| Directories, files | kebab-case | `user-profile/`, `user-profile.tsx` |
| Variables, functions, hooks | camelCase | `handleSubmit`, `isLoading` |
| Environment variables, constants | UPPERCASE | `API_BASE_URL`, `MAX_RETRY_COUNT` |
| NestJS modules | kebab-case folder | `modules/user-management/` |
| Domain entities | PascalCase.ts | `User.ts`, `Product.ts` |

## SOLID Principles

- **S**: Pages render. Hooks manage state. Mappers derive UI. Controllers handle HTTP. Repositories access data.
- **O**: New features = new modules; never modify unrelated modules.
- **L**: All implementations respect interface semantics.
- **I**: Small, focused interfaces (`IUserReader` + `IUserWriter`, not `IUserRepository` with 20 methods).
- **D**: Depend on abstractions (`@sfx/domain` interfaces), not implementations (Prisma, fetch).

## Git Workflow

- Conventional commits: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`
- Format: `type(scope): description` — scope is package/app name
- Examples: `feat(domain): add Product entity`, `fix(api): handle null user in find`
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add root CLAUDE.md with monorepo orchestrator rules"
```

---

## Task 18: Frontend CLAUDE.md

**Files:**
- Create: `apps/web/CLAUDE.md`

- [ ] **Step 1: Write frontend CLAUDE.md**

Create `apps/web/CLAUDE.md` with all frontend rules adapted from sfx-team-panel. Contents:

```markdown
# Next.js Frontend Development Guide

You are an expert senior frontend engineer specializing in Next.js 15, React 19, and TypeScript. You follow Clean Architecture with feature-scoped `data/` and `presentation/` layers (domain is shared in `@sfx/domain`). You write tests before implementation (90%+ coverage), never ship code without type-checking and linting passing.

## Commands

```bash
pnpm --filter @sfx/web dev           # Start dev server (port 3000)
pnpm --filter @sfx/web build         # Build for production
pnpm --filter @sfx/web test          # Run tests
pnpm --filter @sfx/web test:coverage # Tests with 90%+ coverage
pnpm --filter @sfx/web lint          # Lint
pnpm --filter @sfx/web typecheck     # Type check
```

## Architecture Decisions (Do NOT re-suggest)

- **ADR-001**: Zustand for client state, TanStack Query for server state — NOT Redux, NOT MobX
- **ADR-002**: `executeRequest` abstraction — NEVER raw fetch/axios in features
- **ADR-003**: UIModel mapper pattern — NEVER inline logic in JSX
- **ADR-004**: NavigationHandler pattern — NEVER `router.push()` in hooks
- **ADR-005**: Zod for validation via `@sfx/validation` — NOT Yup, NOT joi
- **ADR-006**: Skeleton screens for loading — NEVER generic spinners
- **ADR-007**: Language folder system with `useTranslations()` — NEVER hardcoded strings
- **ADR-008**: Clean Architecture layers per feature — NEVER flat file structures

## Project Structure

Route files in `app/` are **thin wrappers** — they import from `features/`.

```
src/
├── app/                              # THIN WRAPPERS ONLY
├── features/
│   ├── [feature]/
│   │   ├── data/remote/, repositories/, model/, mapper/
│   │   ├── presentation/pages/, components/, validators/
│   │   ├── constants.ts
│   │   └── index.ts
│   └── presentation/                 # SHARED
│       ├── theme/
│       ├── localization/
│       ├── components/
│       └── networking/
├── stores/
├── lib/
└── types/
```

No `domain/` folder in features — all domain types come from `@sfx/domain`.

## Boundaries

### Always do
- Write tests for every new file (90%+ coverage)
- Use `useCallback` for all returned handlers
- Resolve dependencies at call site (`useTheme()`, `useRouter()`, `useQueryClient()`)
- Use Tailwind classes mapped from `colors.ts` for all color values
- Resolve labels via `useTranslations(namespace)` in mapper, never in JSX
- Use `executeRequest()` for all API calls
- Use semantic HTML (`<main>`, `<nav>`, `<section>`)
- Use `next/image` for all images

### Never do
- Duplicate code — extract to shared
- Call `router.push()` inside a custom hook
- Hardcode hex colors, strings, or magic numbers
- Put logic in page/component files
- Import from `@sfx/database` (backend only)
- Use `^` or `~` in dependency versions
- Use single-letter variable names
- Use raw `fetch()`/`axios` in feature files

## Trigger-Action Rules

### New Page or Component Scaffold
**Trigger:** Creating a new page, screen, or component.
**Action:** Create the full file set: `index.tsx`, `use[Feature].ts`, `types.ts`, `mapTo[Feature]PageUIModel.ts`. Read existing home feature for the template.

### Test Coverage Gate
**Trigger:** Creating or modifying any source file.
**Action:** Verify a corresponding test file exists in `__tests__/`. Run `pnpm --filter @sfx/web test:coverage`. Verify 90%+.

### Dependency Resolution Check
**Trigger:** Writing a function/hook that accepts `theme`, `router`, `queryClient`, `translate` as a parameter.
**Action:** STOP. Remove the parameter. Call `useTheme()`, `useRouter()`, etc. inside the function body.

### Hook Return Audit
**Trigger:** Writing a `return` statement inside a custom hook.
**Action:** Check every function in the return: (1) Wrapped in `useCallback`? (2) Return type in `types.ts`? (3) No `router.push()`?

### New Feature Architecture
**Trigger:** Creating a new feature folder under `features/`.
**Action:** Create: `data/remote/`, `data/repositories/`, `data/model/`, `data/mapper/`, `presentation/pages/`, `presentation/components/`, `constants.ts`, `index.ts`.

## Theming & Colors
- `colors.ts` is the single source of truth — `lightColors`, `darkColors`, `Colors` type
- `ThemeProvider` wraps app at root. Blocking script prevents FOUC.
- Use Tailwind classes: `bg-primary`, `text-foreground`, `border-border`
- `useTheme()` only for dynamic/computed styles
- **NEVER** hardcode hex values. **NEVER** branch on `isDark` in JSX.
- `@theme` directive in `globals.css` — NOT `@config`.

## Localization
- Language folders in `localization/languages/[code]/`
- Labels resolved in mapper via `useTranslations(namespace)`
- Adding a language: create folder + add to `registry.ts`

## Naming Conventions

| Type | Case | Example |
|------|------|---------|
| Components, Types | PascalCase | `UserProfile`, `UserProfileProps` |
| Directories, files | kebab-case | `user-profile.tsx` |
| Variables, functions, hooks | camelCase | `handleSubmit`, `useLogin` |
| Constants | UPPER_SNAKE_CASE | `USER_QUERY_KEY` |
| Page hook | `use[Feature].ts` | `useLogin.ts` |
| Hook return type | `Use[Name]Return` | `UseLoginReturn` |
| UIModel | `[Feature]PageUIModel` | `LoginPageUIModel` |
| Mapper | `mapTo[Feature]PageUIModel` | `mapToLoginPageUIModel` |
| Feature folder | camelCase | `features/auth/` |
| Component folder | PascalCase | `components/HeaderButtons/` |

## Gotchas
- **Tailwind v4 `@config` silently fails** — use `@theme` in globals.css
- **Server Components can call databases directly** — avoid unnecessary API routes
- **GET Route Handlers cache at build time** — use `dynamic = 'force-dynamic'`
- **`next/image` without `sizes` defaults to 100vw** — always provide `sizes`
- **Zustand selectors returning new objects → infinite re-renders** — use `useShallow`
- **React Query `invalidateQueries` uses array prefix matching** — structure as nested arrays
- **Never rely solely on middleware for auth** — validate in Route Handlers independently

## Security
- Next.js >=15.5.7, React >=19.0.1
- Security headers in next.config.ts (X-Content-Type-Options, X-Frame-Options, X-XSS-Protection)
- DOMPurify for any user-generated HTML
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/CLAUDE.md
git commit -m "docs(web): add frontend CLAUDE.md with Clean Architecture rules and conventions"
```

---

## Task 19: Backend CLAUDE.md

**Files:**
- Create: `apps/api/CLAUDE.md`

- [ ] **Step 1: Write backend CLAUDE.md**

Create `apps/api/CLAUDE.md`:

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/CLAUDE.md
git commit -m "docs(api): add backend CLAUDE.md with Clean Architecture rules and NestJS conventions"
```

---

## Task 20: Install All Dependencies & Verify Full Build

- [ ] **Step 1: Install all dependencies**

Run: `cd /Users/mako/Documents/GitHub/sfx-webapp-boilerplate && pnpm install`
Expected: Clean install

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: No type errors across all packages and apps

- [ ] **Step 3: Verify all tests pass**

Run: `pnpm test`
Expected: All unit tests pass in domain, shared, validation, web, api

- [ ] **Step 4: Verify build passes**

Run: `pnpm build`
Expected: All packages and apps build successfully

- [ ] **Step 5: Verify Docker compose starts**

Run: `pnpm docker:up` (then Ctrl+C after services are healthy)
Expected: web (3000), api (3001), postgres (5432) all start and api reports healthy

- [ ] **Step 6: Final commit with lockfile updates**

```bash
git add pnpm-lock.yaml
git commit -m "chore: update lockfile after full dependency installation and verification"
```

---

## Summary

| Task | What it produces |
|------|-----------------|
| 1 | Root monorepo configs (package.json, pnpm, tsconfig, eslint, prettier, gitignore) |
| 2 | Turborepo pipeline (turbo.json) |
| 3 | `@sfx/domain` — User entity, repository + use-case interfaces |
| 4 | `@sfx/shared` — HttpStatus, ErrorCode, ApiResponse types |
| 5 | `@sfx/validation` — Zod schemas (user, common) |
| 6 | `@sfx/database` — Prisma schema, client singleton, seed |
| 7 | Dependency install + package verification |
| 8 | Next.js app config files |
| 9 | Theme system (colors, ThemeProvider, useTheme, FOUC script) |
| 10 | Localization system (en/ro, LanguageProvider, useTranslations) |
| 11 | Networking (executeRequest) + Zustand store + types |
| 12 | Layout, providers, home feature with full Clean Architecture |
| 13 | NestJS app config files |
| 14 | NestJS common module (filters, pipes, interceptors) + bootstrap |
| 15 | Health + User modules with Clean Architecture + tests |
| 16 | Docker (Dockerfiles, docker-compose dev/prod) |
| 17 | Root CLAUDE.md |
| 18 | Frontend CLAUDE.md |
| 19 | Backend CLAUDE.md |
| 20 | Full build verification |
