'use strict';

// Unit tests for detectors/response-envelope.js.
// Run directly: `node __tests__/response-envelope.test.js`

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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'envelope-test-'));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  return root;
}

// ── extractGlobalInterceptorClassNames ──

test('extractGlobalInterceptorClassNames finds single ctor', () => {
  const src = `app.useGlobalInterceptors(new TransformInterceptor());`;
  assert.deepStrictEqual(extractGlobalInterceptorClassNames(src), ['TransformInterceptor']);
});

test('extractGlobalInterceptorClassNames finds multiple ctors', () => {
  const src = `app.useGlobalInterceptors(new A(), new B(), new C());`;
  assert.deepStrictEqual(extractGlobalInterceptorClassNames(src), ['A', 'B', 'C']);
});

test('extractGlobalInterceptorClassNames returns empty when no call', () => {
  assert.deepStrictEqual(extractGlobalInterceptorClassNames('const x = 1;'), []);
});

// ── splitTopLevelProperties ──

test('splitTopLevelProperties splits flat object', () => {
  assert.deepStrictEqual(
    splitTopLevelProperties('{ success: true, data }').map((p) => p.trim()),
    ['success: true', 'data'],
  );
});

test('splitTopLevelProperties respects nested braces', () => {
  assert.deepStrictEqual(
    splitTopLevelProperties('{ a: { x: 1, y: 2 }, b: 3 }').map((p) => p.trim()),
    ['a: { x: 1, y: 2 }', 'b: 3'],
  );
});

// ── extractWrapperKey (NestJS) — now returns string[] ──

test('extractWrapperKey shorthand pattern returns array', () => {
  const src = `.pipe(map((data) => ({ success: true, data })))`;
  assert.deepStrictEqual(extractWrapperKey(src), ['data']);
});

test('extractWrapperKey explicit key:value pattern returns array', () => {
  const src = `.pipe(map((payload) => ({ success: true, data: payload })))`;
  assert.deepStrictEqual(extractWrapperKey(src), ['data']);
});

test('extractWrapperKey nested returns N-deep path', () => {
  const src = `.pipe(map((x) => ({ result: { data: x } })))`;
  assert.deepStrictEqual(extractWrapperKey(src), ['result', 'data']);
});

test('extractWrapperKey 3-deep nesting', () => {
  const src = `.pipe(map((x) => ({ outer: { inner: { payload: x } } })))`;
  assert.deepStrictEqual(extractWrapperKey(src), ['outer', 'inner', 'payload']);
});

test('extractWrapperKey returns null for no .map', () => {
  const src = `return next.handle();`;
  assert.strictEqual(extractWrapperKey(src), null);
});

// ── extractWrapperPath (shared helper) ──

test('extractWrapperPath finds param at top level', () => {
  assert.deepStrictEqual(extractWrapperPath('{ data: x }', 'x'), ['data']);
});

test('extractWrapperPath finds shorthand at top level', () => {
  assert.deepStrictEqual(extractWrapperPath('{ ok: true, body }', 'body'), ['body']);
});

test('extractWrapperPath finds param nested 2 deep', () => {
  assert.deepStrictEqual(extractWrapperPath('{ a: { b: val } }', 'val'), ['a', 'b']);
});

test('extractWrapperPath returns null when not found', () => {
  assert.strictEqual(extractWrapperPath('{ a: 1, b: 2 }', 'missing'), null);
});

// ── Express detection ──

test('extractExpressWrapper detects res.json override with call pattern', () => {
  const src = `
    const originalJson = res.json;
    res.json = function(body) {
      originalJson.call(this, { data: body });
    };
  `;
  assert.deepStrictEqual(extractExpressWrapper(src), ['data']);
});

test('extractExpressWrapper detects arrow function pattern', () => {
  const src = `
    const _json = res.json;
    res.json = (result) => _json.call(res, { payload: result });
  `;
  assert.deepStrictEqual(extractExpressWrapper(src), ['payload']);
});

test('extractExpressWrapper returns null when no override', () => {
  assert.strictEqual(extractExpressWrapper('app.get("/", (req, res) => res.send("ok"))'), null);
});

// ── Fastify detection ──

test('extractFastifyWrapper detects preSerialization hook', () => {
  const src = `
    fastify.addHook('preSerialization', async (request, reply, payload) => {
      return { success: true, data: payload };
    });
  `;
  assert.deepStrictEqual(extractFastifyWrapper(src), ['data']);
});

test('extractFastifyWrapper returns null for other hooks', () => {
  const src = `fastify.addHook('onRequest', async (req, reply) => { });`;
  assert.strictEqual(extractFastifyWrapper(src), null);
});

// ── Koa detection ──

test('extractKoaWrapper detects ctx.body reassignment via variable capture', () => {
  const src = `
    await next();
    const body = ctx.body;
    ctx.body = { data: body };
  `;
  assert.deepStrictEqual(extractKoaWrapper(src), ['data']);
});

test('extractKoaWrapper detects direct ctx.body wrapping', () => {
  const src = `
    await next();
    ctx.body = { result: ctx.body };
  `;
  assert.deepStrictEqual(extractKoaWrapper(src), ['result']);
});

test('extractKoaWrapper returns null when no wrapping', () => {
  assert.strictEqual(extractKoaWrapper('ctx.body = "hello"'), null);
});

// ── OpenAPI consensus ──

test('inferOpenApiConsensus: ≥80% consensus returns wrapper', () => {
  const spec = {
    openapi: '3.0.0',
    paths: {
      '/a': { get: { responses: { '200': { content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'object' }, meta: { type: 'string' } } } } } } } } },
      '/b': { post: { responses: { '201': { content: { 'application/json': { schema: { type: 'object', properties: { data: { $ref: '#/components/schemas/X' } } } } } } } } },
      '/c': { get: { responses: { '200': { content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'object' } } } } } } } } },
    },
    components: { schemas: { X: { type: 'object' } } },
  };
  const root = mkTmpProject({ 'apps/api/.openapi.json': JSON.stringify(spec) });
  const result = inferOpenApiConsensus(root, null);
  assert.deepStrictEqual(result.wrapper, ['data']);
});

test('inferOpenApiConsensus: no consensus returns null', () => {
  const spec = {
    openapi: '3.0.0',
    paths: {
      '/a': { get: { responses: { '200': { content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'object' } } } } } } } } },
      '/b': { get: { responses: { '200': { content: { 'application/json': { schema: { type: 'object', properties: { result: { type: 'object' } } } } } } } } },
      '/c': { get: { responses: { '200': { content: { 'application/json': { schema: { type: 'object', properties: { payload: { type: 'object' } } } } } } } } },
    },
  };
  const root = mkTmpProject({ 'apps/api/.openapi.json': JSON.stringify(spec) });
  assert.strictEqual(inferOpenApiConsensus(root, null), null);
});

test('inferOpenApiConsensus: no spec file returns null', () => {
  const root = mkTmpProject({ 'README.md': '# nothing' });
  assert.strictEqual(inferOpenApiConsensus(root, null), null);
});

// ── resolveClassImportPath ──

test('resolveClassImportPath resolves .ts sibling', () => {
  const root = mkTmpProject({
    'src/main.ts': `import { TransformInterceptor } from './common/transform.interceptor';`,
    'src/common/transform.interceptor.ts': `export class TransformInterceptor {}`,
  });
  const mainFile = path.join(root, 'src/main.ts');
  const mainSrc = fs.readFileSync(mainFile, 'utf8');
  const resolved = resolveClassImportPath(mainSrc, mainFile, 'TransformInterceptor');
  assert.strictEqual(resolved, path.join(root, 'src/common/transform.interceptor.ts'));
});

test('resolveClassImportPath returns null for non-relative import', () => {
  const root = mkTmpProject({ 'src/main.ts': `import { Foo } from '@nestjs/common';` });
  const mainFile = path.join(root, 'src/main.ts');
  const mainSrc = fs.readFileSync(mainFile, 'utf8');
  assert.strictEqual(resolveClassImportPath(mainSrc, mainFile, 'Foo'), null);
});

// ── detectResponseEnvelope (end-to-end) ──

test('detectResponseEnvelope end-to-end on NestJS-shaped project', () => {
  const root = mkTmpProject({
    'apps/api/src/main.ts': `
      import { TransformInterceptor } from './common/interceptors/transform.interceptor';
      async function bootstrap(): Promise<void> {
        const app = await NestFactory.create(AppModule);
        app.useGlobalInterceptors(new TransformInterceptor());
      }
    `,
    'apps/api/src/common/interceptors/transform.interceptor.ts': `
      import { Observable, map } from 'rxjs';
      @Injectable()
      export class TransformInterceptor<T> {
        intercept(_ctx: ExecutionContext, next: CallHandler<T>): Observable<any> {
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
  // Back-compat
  assert.strictEqual(result.wrapper, 'data');
  assert.strictEqual(result.source, 'apps/api/src/common/interceptors/transform.interceptor.ts');
  assert.strictEqual(result.errorWrapper, null);
});

test('detectResponseEnvelope returns null fields when no interceptor', () => {
  const root = mkTmpProject({
    'apps/api/src/main.ts': `async function bootstrap() { await app.listen(3001); }`,
  });
  const result = detectResponseEnvelope(root, null);
  assert.strictEqual(result.successWrapper, null);
  assert.strictEqual(result.wrapper, null);
  assert.strictEqual(result.source, null);
});

test('detectResponseEnvelope returns null fields when no bootstrap file', () => {
  const root = mkTmpProject({ 'README.md': '# nothing' });
  const result = detectResponseEnvelope(root, null);
  assert.strictEqual(result.successWrapper, null);
  assert.strictEqual(result.source, null);
});

test('detectResponseEnvelope handles explicit-key interceptor', () => {
  const root = mkTmpProject({
    'apps/api/src/main.ts': `
      import { Wrap } from './wrap';
      async function bootstrap() { app.useGlobalInterceptors(new Wrap()); }
    `,
    'apps/api/src/wrap.ts': `
      import { map } from 'rxjs';
      export class Wrap {
        intercept(_c, next) {
          return next.handle().pipe(map((payload) => ({ ok: true, body: payload })));
        }
      }
    `,
  });
  const result = detectResponseEnvelope(root, null);
  assert.deepStrictEqual(result.successWrapper, ['body']);
  assert.strictEqual(result.wrapper, 'body');
});

test('detectResponseEnvelope N-deep NestJS interceptor', () => {
  const root = mkTmpProject({
    'apps/api/src/main.ts': `
      import { DeepWrap } from './deep';
      async function bootstrap() { app.useGlobalInterceptors(new DeepWrap()); }
    `,
    'apps/api/src/deep.ts': `
      import { map } from 'rxjs';
      export class DeepWrap {
        intercept(_c, next) {
          return next.handle().pipe(map((x) => ({ response: { payload: { data: x } } })));
        }
      }
    `,
  });
  const result = detectResponseEnvelope(root, null);
  assert.deepStrictEqual(result.successWrapper, ['response', 'payload', 'data']);
  assert.strictEqual(result.wrapper, 'response.payload.data');
});

test('detectResponseEnvelope Express fallback', () => {
  const root = mkTmpProject({
    'src/app.ts': `
      app.use((req, res, next) => {
        const originalJson = res.json;
        res.json = function(body) {
          originalJson.call(this, { data: body });
        };
        next();
      });
    `,
  });
  const result = detectResponseEnvelope(root, null);
  assert.deepStrictEqual(result.successWrapper, ['data']);
});

test('detectResponseEnvelope Fastify fallback', () => {
  const root = mkTmpProject({
    'src/server.ts': `
      const fastify = require('fastify')();
      fastify.addHook('preSerialization', async (request, reply, payload) => {
        return { success: true, data: payload };
      });
    `,
  });
  const result = detectResponseEnvelope(root, null);
  assert.deepStrictEqual(result.successWrapper, ['data']);
});

test('detectResponseEnvelope Koa fallback', () => {
  const root = mkTmpProject({
    'src/app.ts': `
      app.use(async (ctx, next) => {
        await next();
        const body = ctx.body;
        ctx.body = { result: body };
      });
    `,
  });
  const result = detectResponseEnvelope(root, null);
  assert.deepStrictEqual(result.successWrapper, ['result']);
});

test('detectResponseEnvelope OpenAPI consensus fallback', () => {
  const spec = {
    openapi: '3.0.0',
    paths: {
      '/users': { get: { responses: { '200': { content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'object' }, count: { type: 'number' } } } } } } } } },
      '/teams': { get: { responses: { '200': { content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: { type: 'object' } } } } } } } } } },
    },
  };
  const root = mkTmpProject({ 'apps/api/.openapi.json': JSON.stringify(spec) });
  const result = detectResponseEnvelope(root, null);
  assert.deepStrictEqual(result.successWrapper, ['data']);
});

// ── makeResult ──

test('makeResult creates correct shape', () => {
  const result = makeResult(['a', 'b'], 'file.ts');
  assert.deepStrictEqual(result.successWrapper, ['a', 'b']);
  assert.strictEqual(result.errorWrapper, null);
  assert.strictEqual(result.wrapper, 'a.b');
  assert.strictEqual(result.source, 'file.ts');
});

test('makeResult with single-element wrapper', () => {
  const result = makeResult(['data'], 'file.ts');
  assert.strictEqual(result.wrapper, 'data');
});
