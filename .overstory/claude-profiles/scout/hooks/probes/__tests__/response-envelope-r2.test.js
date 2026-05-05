'use strict';

/**
 * R2 edge-case tests for detectors/response-envelope.js
 *
 * Branches 16-20 from the R2 Cluster B matrix:
 *  16. global TransformInterceptor {success, data} (re-verify from R1)
 *  17. stacked interceptors (TransformInterceptor + LoggingInterceptor)
 *  18. interceptor with conditional unwrap (data only on 2xx, not errors)
 *  19. UNDETECTED: project has no global interceptor wired
 *  20. AMBIGUOUS: two interceptors both produce {..,data} shape
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  detectResponseEnvelope,
  extractGlobalInterceptorClassNames,
  resolveClassImportPath,
  extractWrapperKey,
  extractWrapperPath,
  splitTopLevelProperties,
  extractExpressWrapper,
  extractFastifyWrapper,
  extractKoaWrapper,
  inferOpenApiConsensus,
  detectNestEnvelope,
  makeResult,
} = require('../detectors/response-envelope');

function mkTmpProject(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'envelope-r2-'));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  return root;
}

// ===========================================================================
// Branch 16: global TransformInterceptor {success, data} (re-verify)
// ===========================================================================

test('R2-B16: re-verify TransformInterceptor detection matches this projects actual interceptor', () => {
  // Mirrors the actual TransformInterceptor in apps/api/src/common/interceptors/
  const root = mkTmpProject({
    'apps/api/src/main.ts': `
      import { TransformInterceptor } from './common/interceptors/transform.interceptor';
      async function bootstrap(): Promise<void> {
        const app = await NestFactory.create(AppModule);
        app.useGlobalInterceptors(new TransformInterceptor());
      }
    `,
    'apps/api/src/common/interceptors/transform.interceptor.ts': `
      import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
      import { Observable, map } from 'rxjs';

      interface SuccessResponse<T> {
        readonly success: true;
        readonly data: T;
      }

      @Injectable()
      export class TransformInterceptor<T> implements NestInterceptor<T, SuccessResponse<T> | T> {
        intercept(context: ExecutionContext, next: CallHandler<T>): Observable<SuccessResponse<T> | T> {
          const contextType = context.getType<string>();
          if (contextType === 'graphql') {
            return next.handle();
          }
          return next.handle().pipe(
            map((data) => ({
              success: true as const,
              data,
            })),
          );
        }
      }
    `,
  });
  const result = detectResponseEnvelope(root, null);
  assert.deepStrictEqual(result.successWrapper, ['data']);
  assert.strictEqual(result.wrapper, 'data');
  assert.strictEqual(result.errorWrapper, null);
  assert.ok(result.source.includes('transform.interceptor.ts'));
});

// ===========================================================================
// Branch 17: stacked interceptors (TransformInterceptor + LoggingInterceptor)
// ===========================================================================

test('R2-B17: stacked interceptors - picks the one with .pipe(map(...))', () => {
  // TransformInterceptor has .pipe(map(...)), LoggingInterceptor does not
  const root = mkTmpProject({
    'apps/api/src/main.ts': `
      import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
      import { TransformInterceptor } from './common/interceptors/transform.interceptor';
      async function bootstrap() {
        const app = await NestFactory.create(AppModule);
        app.useGlobalInterceptors(new LoggingInterceptor(), new TransformInterceptor());
      }
    `,
    'apps/api/src/common/interceptors/logging.interceptor.ts': `
      import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
      import { Observable, tap } from 'rxjs';

      @Injectable()
      export class LoggingInterceptor implements NestInterceptor {
        intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
          const now = Date.now();
          return next.handle().pipe(
            tap(() => console.log(\`Request took \${Date.now() - now}ms\`)),
          );
        }
      }
    `,
    'apps/api/src/common/interceptors/transform.interceptor.ts': `
      import { map } from 'rxjs';
      export class TransformInterceptor {
        intercept(_ctx, next) {
          return next.handle().pipe(map((data) => ({ success: true, data })));
        }
      }
    `,
  });
  const result = detectResponseEnvelope(root, null);
  assert.deepStrictEqual(result.successWrapper, ['data']);
  assert.ok(result.source.includes('transform.interceptor.ts'));
});

test('R2-B17: stacked interceptors - LoggingInterceptor first (no map) is skipped', () => {
  const root = mkTmpProject({
    'apps/api/src/main.ts': `
      import { TimerInterceptor } from './timer';
      import { WrapInterceptor } from './wrap';
      async function bootstrap() {
        app.useGlobalInterceptors(new TimerInterceptor(), new WrapInterceptor());
      }
    `,
    'apps/api/src/timer.ts': `
      import { tap } from 'rxjs';
      export class TimerInterceptor {
        intercept(_ctx, next) {
          return next.handle().pipe(tap(() => {}));
        }
      }
    `,
    'apps/api/src/wrap.ts': `
      import { map } from 'rxjs';
      export class WrapInterceptor {
        intercept(_ctx, next) {
          return next.handle().pipe(map((payload) => ({ result: payload })));
        }
      }
    `,
  });
  const result = detectResponseEnvelope(root, null);
  assert.deepStrictEqual(result.successWrapper, ['result']);
  assert.ok(result.source.includes('wrap.ts'));
});

test('R2-B17: three stacked interceptors - only middle one wraps', () => {
  const root = mkTmpProject({
    'apps/api/src/main.ts': `
      import { A } from './a';
      import { B } from './b';
      import { C } from './c';
      async function bootstrap() {
        app.useGlobalInterceptors(new A(), new B(), new C());
      }
    `,
    'apps/api/src/a.ts': `
      import { tap } from 'rxjs';
      export class A {
        intercept(_ctx, next) { return next.handle().pipe(tap(() => {})); }
      }
    `,
    'apps/api/src/b.ts': `
      import { map } from 'rxjs';
      export class B {
        intercept(_ctx, next) { return next.handle().pipe(map((x) => ({ envelope: x }))); }
      }
    `,
    'apps/api/src/c.ts': `
      export class C {
        intercept(_ctx, next) { return next.handle(); }
      }
    `,
  });
  const result = detectResponseEnvelope(root, null);
  assert.deepStrictEqual(result.successWrapper, ['envelope']);
  assert.ok(result.source.includes('b.ts'));
});

// ===========================================================================
// Branch 18: interceptor with conditional unwrap (graphql bypass)
// ===========================================================================

test('R2-B18: interceptor with graphql conditional still detects wrapper', () => {
  // The actual project interceptor has a graphql bypass, but the
  // .pipe(map(...)) pattern is still present and should be detected
  const root = mkTmpProject({
    'apps/api/src/main.ts': `
      import { ConditionalInterceptor } from './conditional';
      async function bootstrap() {
        app.useGlobalInterceptors(new ConditionalInterceptor());
      }
    `,
    'apps/api/src/conditional.ts': `
      import { map } from 'rxjs';
      export class ConditionalInterceptor {
        intercept(context, next) {
          if (context.getType() === 'graphql') {
            return next.handle();
          }
          return next.handle().pipe(map((data) => ({ success: true, data })));
        }
      }
    `,
  });
  const result = detectResponseEnvelope(root, null);
  assert.deepStrictEqual(result.successWrapper, ['data']);
});

test('R2-B18: interceptor with ternary conditional still detects wrapper', () => {
  const root = mkTmpProject({
    'apps/api/src/main.ts': `
      import { TernaryWrap } from './ternary-wrap';
      async function bootstrap() {
        app.useGlobalInterceptors(new TernaryWrap());
      }
    `,
    'apps/api/src/ternary-wrap.ts': `
      import { map } from 'rxjs';
      export class TernaryWrap {
        intercept(ctx, next) {
          return ctx.getType() === 'graphql'
            ? next.handle()
            : next.handle().pipe(map((result) => ({ ok: true, payload: result })));
        }
      }
    `,
  });
  const result = detectResponseEnvelope(root, null);
  assert.deepStrictEqual(result.successWrapper, ['payload']);
});

// ===========================================================================
// Branch 19: UNDETECTED: no global interceptor wired
// ===========================================================================

test('R2-B19: no useGlobalInterceptors call returns null envelope', () => {
  const root = mkTmpProject({
    'apps/api/src/main.ts': `
      async function bootstrap() {
        const app = await NestFactory.create(AppModule);
        await app.listen(3001);
      }
    `,
  });
  const result = detectResponseEnvelope(root, null);
  assert.strictEqual(result.successWrapper, null);
  assert.strictEqual(result.wrapper, null);
  assert.strictEqual(result.source, null);
});

test('R2-B19: no bootstrap file at all returns null envelope', () => {
  const root = mkTmpProject({ 'README.md': '# nothing' });
  const result = detectResponseEnvelope(root, null);
  assert.strictEqual(result.successWrapper, null);
  assert.strictEqual(result.source, null);
});

test('R2-B19: useGlobalInterceptors with unresolvable import returns null envelope', () => {
  const root = mkTmpProject({
    'apps/api/src/main.ts': `
      import { MissingInterceptor } from './does-not-exist';
      async function bootstrap() {
        app.useGlobalInterceptors(new MissingInterceptor());
      }
    `,
  });
  const result = detectResponseEnvelope(root, null);
  assert.strictEqual(result.successWrapper, null);
});

test('R2-B19: useGlobalInterceptors with interceptor that has no map() returns null', () => {
  const root = mkTmpProject({
    'apps/api/src/main.ts': `
      import { NoMapInterceptor } from './no-map';
      async function bootstrap() {
        app.useGlobalInterceptors(new NoMapInterceptor());
      }
    `,
    'apps/api/src/no-map.ts': `
      export class NoMapInterceptor {
        intercept(_ctx, next) { return next.handle(); }
      }
    `,
  });
  const result = detectResponseEnvelope(root, null);
  assert.strictEqual(result.successWrapper, null);
});

// ===========================================================================
// Branch 20: AMBIGUOUS: two interceptors both produce {..,data} shape
// ===========================================================================

test('R2-B20: two interceptors with map() - first one wins', () => {
  // The detector iterates classNames in order and returns the first match.
  // When two interceptors both wrap, the first detected one is used.
  const root = mkTmpProject({
    'apps/api/src/main.ts': `
      import { WrapA } from './wrap-a';
      import { WrapB } from './wrap-b';
      async function bootstrap() {
        app.useGlobalInterceptors(new WrapA(), new WrapB());
      }
    `,
    'apps/api/src/wrap-a.ts': `
      import { map } from 'rxjs';
      export class WrapA {
        intercept(_ctx, next) {
          return next.handle().pipe(map((d) => ({ first: d })));
        }
      }
    `,
    'apps/api/src/wrap-b.ts': `
      import { map } from 'rxjs';
      export class WrapB {
        intercept(_ctx, next) {
          return next.handle().pipe(map((d) => ({ second: d })));
        }
      }
    `,
  });
  const result = detectResponseEnvelope(root, null);
  // First interceptor with map() wins
  assert.deepStrictEqual(result.successWrapper, ['first']);
  assert.ok(result.source.includes('wrap-a.ts'));
});

test('R2-B20: two interceptors - first has no map, second has map - second wins', () => {
  const root = mkTmpProject({
    'apps/api/src/main.ts': `
      import { NoWrap } from './no-wrap';
      import { YesWrap } from './yes-wrap';
      async function bootstrap() {
        app.useGlobalInterceptors(new NoWrap(), new YesWrap());
      }
    `,
    'apps/api/src/no-wrap.ts': `
      export class NoWrap {
        intercept(_ctx, next) { return next.handle(); }
      }
    `,
    'apps/api/src/yes-wrap.ts': `
      import { map } from 'rxjs';
      export class YesWrap {
        intercept(_ctx, next) {
          return next.handle().pipe(map((v) => ({ wrapped: v })));
        }
      }
    `,
  });
  const result = detectResponseEnvelope(root, null);
  assert.deepStrictEqual(result.successWrapper, ['wrapped']);
  assert.ok(result.source.includes('yes-wrap.ts'));
});

// ===========================================================================
// Additional edge cases for response-envelope
// ===========================================================================

test('R2-extra: extractWrapperKey with typed parameter (data: T)', () => {
  // Real NestJS interceptors often have typed params
  const src = `.pipe(map((data: T) => ({ success: true, data })))`;
  assert.deepStrictEqual(extractWrapperKey(src), ['data']);
});

test('R2-extra: extractWrapperKey with multiline map', () => {
  const src = `
    .pipe(
      map((data) => ({
        success: true,
        data,
        timestamp: Date.now(),
      })),
    )
  `;
  assert.deepStrictEqual(extractWrapperKey(src), ['data']);
});

test('R2-extra: extractWrapperPath returns null for empty object', () => {
  assert.strictEqual(extractWrapperPath('{}', 'x'), null);
});

test('R2-extra: splitTopLevelProperties handles empty object', () => {
  const result = splitTopLevelProperties('{}');
  assert.strictEqual(result.length, 0);
});

test('R2-extra: splitTopLevelProperties handles deeply nested braces', () => {
  const result = splitTopLevelProperties('{ a: { b: { c: { d: 1 } } }, e: 2 }');
  assert.strictEqual(result.length, 2);
  assert.ok(result[0].trim().startsWith('a:'));
  assert.strictEqual(result[1].trim(), 'e: 2');
});

test('R2-extra: extractGlobalInterceptorClassNames with multiple calls', () => {
  // Two separate useGlobalInterceptors calls
  const src = `
    app.useGlobalInterceptors(new A());
    app.useGlobalInterceptors(new B());
  `;
  assert.deepStrictEqual(extractGlobalInterceptorClassNames(src), ['A', 'B']);
});

test('R2-extra: resolveClassImportPath with index.ts barrel', () => {
  const root = mkTmpProject({
    'src/main.ts': `import { MyInterceptor } from './interceptors';`,
    'src/interceptors/index.ts': `export class MyInterceptor {}`,
  });
  const mainFile = path.join(root, 'src/main.ts');
  const mainSrc = fs.readFileSync(mainFile, 'utf8');
  const resolved = resolveClassImportPath(mainSrc, mainFile, 'MyInterceptor');
  assert.strictEqual(resolved, path.join(root, 'src/interceptors/index.ts'));
});

test('R2-extra: makeResult with empty array wrapper', () => {
  const result = makeResult([], 'file.ts');
  assert.deepStrictEqual(result.successWrapper, []);
  assert.strictEqual(result.wrapper, '');
  assert.strictEqual(result.errorWrapper, null);
});

test('R2-extra: makeResult with null source', () => {
  const result = makeResult(['data'], null);
  assert.deepStrictEqual(result.successWrapper, ['data']);
  assert.strictEqual(result.source, null);
});

// ===========================================================================
// Express edge cases
// ===========================================================================

test('R2-extra: Express wrapper with nested object detected via brace-balanced extraction', () => {
  // FIX 2: extractExpressWrapper now uses extractBalancedObject helper
  // instead of `[^}]*` regex, so nested wrapper objects are detected.
  const src = `
    const orig = res.json;
    res.json = function(body) {
      orig.call(this, { response: { data: body } });
    };
  `;
  // Fixed: correctly detects nested path ['response', 'data']
  assert.deepStrictEqual(extractExpressWrapper(src), ['response', 'data']);
});

test('R2-extra: Express no override returns null', () => {
  const src = `app.use((req, res, next) => { next(); });`;
  assert.strictEqual(extractExpressWrapper(src), null);
});

// ===========================================================================
// Fastify edge cases
// ===========================================================================

test('R2-extra: Fastify hook with function keyword', () => {
  const src = `
    fastify.addHook('preSerialization', async function(request, reply, payload) {
      return { result: payload };
    });
  `;
  assert.deepStrictEqual(extractFastifyWrapper(src), ['result']);
});

test('R2-extra: Fastify non-preSerialization hook returns null', () => {
  const src = `fastify.addHook('onSend', async (req, reply, payload) => { return payload; });`;
  assert.strictEqual(extractFastifyWrapper(src), null);
});

// ===========================================================================
// Koa edge cases
// ===========================================================================

test('R2-extra: Koa wrapper with let instead of const', () => {
  const src = `
    await next();
    let body = ctx.body;
    ctx.body = { payload: body };
  `;
  assert.deepStrictEqual(extractKoaWrapper(src), ['payload']);
});

test('R2-extra: Koa no body reassignment returns null', () => {
  const src = `await next(); console.log(ctx.body);`;
  assert.strictEqual(extractKoaWrapper(src), null);
});

// ===========================================================================
// OpenAPI consensus edge cases
// ===========================================================================

test('R2-extra: OpenAPI consensus with invalid JSON returns null', () => {
  const root = mkTmpProject({ 'apps/api/.openapi.json': 'not-json' });
  assert.strictEqual(inferOpenApiConsensus(root, null), null);
});

test('R2-extra: OpenAPI consensus with no paths returns null', () => {
  const root = mkTmpProject({
    'apps/api/.openapi.json': JSON.stringify({ openapi: '3.0.0' }),
  });
  assert.strictEqual(inferOpenApiConsensus(root, null), null);
});

test('R2-extra: OpenAPI consensus with schemas that have no object wrapper', () => {
  const spec = {
    openapi: '3.0.0',
    paths: {
      '/a': { get: { responses: { '200': { content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' } } } } } } } } },
      '/b': { get: { responses: { '200': { content: { 'application/json': { schema: { type: 'object', properties: { age: { type: 'number' } } } } } } } } },
    },
  };
  const root = mkTmpProject({ 'apps/api/.openapi.json': JSON.stringify(spec) });
  // No wrapper candidate (name/age are scalars, not objects/$refs)
  assert.strictEqual(inferOpenApiConsensus(root, null), null);
});

test('R2-extra: OpenAPI consensus with diag logging', () => {
  const spec = {
    openapi: '3.0.0',
    paths: {
      '/a': { get: { responses: { '200': { content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'object' } } } } } } } } },
      '/b': { get: { responses: { '200': { content: { 'application/json': { schema: { type: 'object', properties: { data: { $ref: '#/x' } } } } } } } } },
    },
  };
  const root = mkTmpProject({ 'apps/api/.openapi.json': JSON.stringify(spec) });
  const messages = [];
  const diag = { info: (msg) => messages.push(msg) };
  const result = inferOpenApiConsensus(root, diag);
  assert.deepStrictEqual(result.wrapper, ['data']);
  assert.ok(messages.some((m) => m.includes('consensus')));
});

// ===========================================================================
// Framework priority: NestJS > Express > Fastify > Koa > OpenAPI
// ===========================================================================

test('R2-extra: NestJS detection takes priority over Express', () => {
  const root = mkTmpProject({
    'apps/api/src/main.ts': `
      import { WrapIt } from './wrap-it';
      async function bootstrap() {
        app.useGlobalInterceptors(new WrapIt());
      }
    `,
    'apps/api/src/wrap-it.ts': `
      import { map } from 'rxjs';
      export class WrapIt {
        intercept(_ctx, next) {
          return next.handle().pipe(map((d) => ({ nestData: d })));
        }
      }
    `,
    'src/app.ts': `
      const orig = res.json;
      res.json = function(body) { orig.call(this, { expressData: body }); };
    `,
  });
  const result = detectResponseEnvelope(root, null);
  assert.deepStrictEqual(result.successWrapper, ['nestData']);
});
