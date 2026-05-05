/**
 * Shared helpers for all contract-verification probes.
 *
 * These probes are invoked by the Stop hook `verify-full-contract.js`. They
 * auto-discover the project's HTTP surface (routes, Zod schemas, pages, forms)
 * and exercise each one deterministically — no manifests to maintain.
 *
 * Adapts to any project following the sfx-webapp-boilerplate conventions:
 *   - apps/api with NestJS AppModule at apps/api/src/app.module.ts
 *   - apps/web with Next.js app router at apps/web/src/app/
 *   - @sfx/validation workspace package exporting Zod schemas
 *   - @sfx/database workspace package exporting { prisma }
 *
 * Probes skip gracefully when their artifacts aren't present.
 */
import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import Module from 'node:module';

export const API_PREFIX = 'api/v1';
export const SENTINEL_ID = '00000000-0000-0000-0000-000000000001';

export const PROJECT_ROOT = process.env.PROBE_PROJECT_ROOT ?? process.cwd();
export const API_APP_MODULE = join(PROJECT_ROOT, 'apps', 'api', 'src', 'app.module.ts');
export const WEB_APP_DIR = join(PROJECT_ROOT, 'apps', 'web', 'src', 'app');
export const WEB_FEATURES_DIR = join(PROJECT_ROOT, 'apps', 'web', 'src', 'features');

/**
 * Resolve a module ID through apps/api's node_modules. NestJS internals
 * (`@nestjs/core`, `@nestjs/testing`, `@nestjs/common/constants`) live inside
 * the API workspace, not at the repo root — so probes have to resolve them
 * scoped to apps/api, not via regular `import()`.
 */
export async function apiRequire<T = unknown>(moduleId: string): Promise<T> {
  const { createRequire } = await import('node:module');
  const scoped = createRequire(join(PROJECT_ROOT, 'apps/api/package.json'));
  const resolvedPath = scoped.resolve(moduleId);
  return (await import(resolvedPath)) as T;
}

export function hasApi(): boolean {
  return existsSync(API_APP_MODULE);
}

export function hasWeb(): boolean {
  return existsSync(WEB_APP_DIR);
}

/**
 * Install a stateless mock for @sfx/database BEFORE any module that imports it
 * is evaluated. Uses require-cache injection: populates the cache entry for the
 * resolved @sfx/database path so subsequent `require()` calls return the mock
 * instead of loading the real Prisma client. Works for both CJS and ESM-over-CJS
 * under tsx.
 *
 * Callers that need stateful CRUD behavior (Probe 4 — mutation-roundtrip) pass
 * in a custom prismaFactory.
 */
export function mockDatabase(prismaFactory?: () => Record<string, unknown>): void {
  const factory = prismaFactory ?? statelessPrisma;
  const mock = { prisma: factory(), PrismaClient: class MockPrismaClient {} };

  // Resolve the @sfx/database path from the project's node_modules. Wrapped
  // in a try so partial installs don't crash the probe — the probe will
  // detect the absence later and skip.
  let resolvedPath: string | null = null;
  try {
    resolvedPath = require.resolve('@sfx/database', { paths: [PROJECT_ROOT] });
  } catch {
    resolvedPath = null;
  }

  if (resolvedPath) {
    require.cache[resolvedPath] = {
      id: resolvedPath,
      filename: resolvedPath,
      loaded: true,
      exports: mock,
      children: [],
      paths: [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
  }

  // Also intercept Module._load so imports that resolve @sfx/database via a
  // different path (e.g. transpiled-to-dist layouts) pick up the mock. This is
  // belt-and-braces — the require.cache injection above is the primary path.
  const originalLoad = (Module as unknown as { _load: (...args: unknown[]) => unknown })._load;
  (Module as unknown as { _load: (...args: unknown[]) => unknown })._load = function interceptedLoad(
    request: unknown,
    ...rest: unknown[]
  ): unknown {
    if (request === '@sfx/database') return mock;
    return originalLoad.call(this, request as string, ...rest);
  };
}

/**
 * Stateless prisma defaults — findX → empty/null, create/update → echo back.
 * Keeps probes from tripping on uncaught rejections when the real repo hits DB.
 */
export function statelessPrisma(): Record<string, unknown> {
  const model = {
    findUnique: async () => null,
    findFirst: async () => null,
    findMany: async () => [],
    create: async ({ data }: { data: Record<string, unknown> }) => ({
      id: SENTINEL_ID,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      ...data,
    }),
    update: async ({ data }: { data: Record<string, unknown> }) => ({
      id: SENTINEL_ID,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      ...data,
    }),
    delete: async () => ({ id: SENTINEL_ID }),
    count: async () => 0,
  };
  // Proxy so any model name the AppModule reaches for (user / team / task / …)
  // returns the same default shape without maintenance.
  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop === 'string') return model;
        return undefined;
      },
    },
  );
}

/**
 * Stateful in-memory prisma for the mutation-roundtrip probe.
 * Each "model" is a Map<id, entity>. Supports create/findUnique/findFirst/
 * findMany/update/delete.
 */
export function statefulPrisma(): Record<string, unknown> {
  const stores = new Map<string, Map<string, Record<string, unknown>>>();

  function storeFor(modelName: string): Map<string, Record<string, unknown>> {
    let store = stores.get(modelName);
    if (!store) {
      store = new Map();
      stores.set(modelName, store);
    }
    return store;
  }

  function makeModel(modelName: string): Record<string, unknown> {
    const store = storeFor(modelName);
    return {
      findUnique: async ({ where }: { where: Record<string, unknown> }) => {
        for (const entity of store.values()) {
          if (matchesWhere(entity, where)) return { ...entity };
        }
        return null;
      },
      findFirst: async ({ where }: { where?: Record<string, unknown> } = {}) => {
        if (!where) return store.values().next().value ?? null;
        for (const entity of store.values()) {
          if (matchesWhere(entity, where)) return { ...entity };
        }
        return null;
      },
      findMany: async () => Array.from(store.values()).map((entity) => ({ ...entity })),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const id = (data.id as string | undefined) ?? generateUuid();
        const entity = {
          id,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        store.set(id, entity);
        return { ...entity };
      },
      update: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        for (const [id, entity] of store.entries()) {
          if (matchesWhere(entity, where)) {
            const updated = { ...entity, ...data, updatedAt: new Date() };
            store.set(id, updated);
            return { ...updated };
          }
        }
        throw new Error(`statefulPrisma.${modelName}.update: record not found`);
      },
      delete: async ({ where }: { where: Record<string, unknown> }) => {
        for (const [id, entity] of store.entries()) {
          if (matchesWhere(entity, where)) {
            store.delete(id);
            return { ...entity };
          }
        }
        throw new Error(`statefulPrisma.${modelName}.delete: record not found`);
      },
      count: async () => store.size,
    };
  }

  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop === 'string') return makeModel(prop);
        return undefined;
      },
    },
  );
}

function matchesWhere(entity: Record<string, unknown>, where: Record<string, unknown>): boolean {
  for (const [key, value] of Object.entries(where)) {
    if (entity[key] !== value) return false;
  }
  return true;
}

function generateUuid(): string {
  // Deterministic-ish but unique enough for probe roundtrips.
  const hex = 'abcdef0123456789';
  let uuid = '';
  for (let i = 0; i < 32; i++) {
    uuid += hex[Math.floor(Math.random() * hex.length)];
    if (i === 7 || i === 11 || i === 15 || i === 19) uuid += '-';
  }
  return uuid;
}

/**
 * Matrix-driven envelope guards.
 *
 * These predicates validate response bodies against the envelope shapes
 * declared by the static detectors (response-envelope.js, error-envelope.js)
 * and surfaced on the matrix at `matrix.responseEnvelope` and
 * `matrix.errorEnvelope`. They never hardcode field names or structure —
 * the declared shape IS the truth.
 *
 * Tri-state return:
 *   true  — body matches declared shape
 *   false — body does NOT match declared shape (contract drift)
 *   null  — no declared shape available (caller should emit DIAG)
 */

export interface DeclaredSuccessEnvelope {
  successWrapper: string[] | null;
}

export interface DeclaredErrorEnvelope {
  wrapper: string[];
  statusField: string | null;
  messageField: string | null;
}

/**
 * Check whether `body` matches the declared success envelope shape.
 *
 * When `declared` is null or `successWrapper` is null, returns null (undeclared).
 * Otherwise walks the declared wrapper path and confirms the nested key exists.
 */
export function isSuccessEnvelope(body: unknown, declared: DeclaredSuccessEnvelope | null): boolean | null {
  if (!declared || !declared.successWrapper) return null;

  if (typeof body !== 'object' || body === null) return false;

  let current: unknown = body;
  for (const key of declared.successWrapper) {
    if (typeof current !== 'object' || current === null) return false;
    const record = current as Record<string, unknown>;
    if (!(key in record)) return false;
    current = record[key];
  }
  return true;
}

/**
 * Check whether `body` matches the declared error envelope shape.
 *
 * When `declared` is null, returns null (undeclared).
 * Otherwise walks the declared wrapper path and checks that statusField
 * and messageField exist at the expected depth.
 */
export function isErrorEnvelope(body: unknown, declared: DeclaredErrorEnvelope | null): boolean | null {
  if (!declared) return null;

  if (typeof body !== 'object' || body === null) return false;

  // Walk wrapper path to reach the inner error object.
  let current: unknown = body;
  for (const key of declared.wrapper) {
    if (typeof current !== 'object' || current === null) return false;
    const record = current as Record<string, unknown>;
    if (!(key in record)) return false;
    current = record[key];
  }

  // If wrapper is empty (flat shape), current is still body.
  // Validate declared fields exist on the unwrapped object.
  if (typeof current !== 'object' || current === null) return false;
  const unwrapped = current as Record<string, unknown>;

  if (declared.statusField && !(declared.statusField in unwrapped)) return false;
  if (declared.messageField && !(declared.messageField in unwrapped)) return false;

  return true;
}

export interface ProbeRoute {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** Express path with params as-declared, e.g. '/api/v1/users/:id'. */
  path: string;
  /** Same path with sentinels substituted — ready for HTTP. */
  concretePath: string;
}

/**
 * Enumerate every HTTP route Nest registered by walking the underlying Express
 * router stack. Returns routes with params substituted to sentinels so callers
 * can feed them directly into supertest.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function enumerateRoutes(app: any): ProbeRoute[] {
  const adapter = app.getHttpAdapter().getInstance();
  // Express 4 exposes `_router`, Express 5 renamed to `router`. Fastify has a
  // completely different shape (handled below).
  const stack: any[] = adapter?._router?.stack ?? adapter?.router?.stack ?? [];
  const routes: ProbeRoute[] = [];

  for (const layer of stack) {
    if (!layer.route) continue;
    const path = layer.route.path as string;
    const methods = layer.route.methods as Record<string, boolean>;
    for (const method of Object.keys(methods)) {
      if (!methods[method]) continue;
      const upper = method.toUpperCase();
      if (!['GET', 'POST', 'PATCH', 'PUT', 'DELETE'].includes(upper)) continue;
      routes.push({
        method: upper as ProbeRoute['method'],
        path,
        concretePath: substituteParams(path),
      });
    }
  }
  return routes;
}

export function substituteParams(path: string): string {
  return path.replace(/:[a-zA-Z_][a-zA-Z0-9_]*/g, (param) => {
    const name = param.slice(1).toLowerCase();
    if (name === 'id' || name.endsWith('id')) return SENTINEL_ID;
    return `probe-${name}`;
  });
}

/**
 * Boot AppModule with main.ts-equivalent globals applied. Assumes the caller
 * has already invoked mockDatabase() so @sfx/database resolves to a stub.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function bootApp(): Promise<any> {
  // `@nestjs/testing` is a devDep of apps/api, not the repo root.
  const { Test } = await apiRequire<any>('@nestjs/testing');
  // DiscoveryModule exposes DiscoveryService + MetadataScanner as providers
  // the probes can resolve via `app.get()`. Without it, `app.get(DiscoveryService)`
  // throws "provider does not exist in the current context".
  const { DiscoveryModule } = await apiRequire<any>('@nestjs/core');

  const appModulePath = join(PROJECT_ROOT, 'apps/api/src/app.module');
  const exceptionFilterPath = join(PROJECT_ROOT, 'apps/api/src/common/filters/http-exception.filter');
  const transformInterceptorPath = join(PROJECT_ROOT, 'apps/api/src/common/interceptors/transform.interceptor');

  const { AppModule } = await import(appModulePath);
  const { GlobalExceptionFilter } = await import(exceptionFilterPath);
  const { TransformInterceptor } = await import(transformInterceptorPath);

  const moduleRef = await Test.createTestingModule({ imports: [AppModule, DiscoveryModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());
  await app.init();
  return app;
}

/**
 * Pretty console table.
 */
export function formatTable(rows: Array<{ name: string; status: 'pass' | 'fail' | 'skip'; note?: string }>): string {
  const width = Math.max(...rows.map((r) => r.name.length), 4);
  const lines = rows.map((row) => {
    const glyph = row.status === 'pass' ? '✓' : row.status === 'fail' ? '✗' : '·';
    const note = row.note ? `  ${row.note}` : '';
    return `  ${glyph}  ${row.name.padEnd(width)}${note}`;
  });
  return lines.join('\n');
}

export interface ProbeResult {
  name: string;
  status: 'pass' | 'fail' | 'skip';
  note?: string;
  details?: string;
}

/**
 * Read .stack.json when present. Used by boot-orchestrator for reuse detection.
 * Declared in shared.ts so any probe can cheaply inspect stack ownership.
 */
export interface StackFile {
  pg_port?: number;
  api_port?: number;
  web_port?: number;
  db_url?: string;
  is_worktree?: boolean;
  pid?: number;
  started_at?: string;
  [key: string]: unknown;
}

export function readStackFile(): StackFile | null {
  const path = join(PROJECT_ROOT, '.stack.json');
  if (!existsSync(path)) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('node:fs') as typeof import('node:fs');
    return JSON.parse(fs.readFileSync(path, 'utf8')) as StackFile;
  } catch {
    return null;
  }
}

