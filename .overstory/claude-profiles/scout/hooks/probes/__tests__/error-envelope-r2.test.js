'use strict';

/**
 * R2 edge-case tests for detectors/error-envelope.js
 *
 * Branches 28-32 from the R2 Cluster B matrix:
 *  28. exception filter wraps in response.json({error:{...}})
 *  29. exception filter wraps in response.send({result:{...}})
 *  30. exception filter passes through unmodified
 *  31. UNDETECTED: no global filter wired
 *  32. multiple filters stacked (which one wins?)
 */

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const {
  detectErrorEnvelope,
  extractGlobalFilterClassNames,
  resolveClassImportPath,
  extractJsonCallBody,
  analyzeErrorShape,
  parseFieldAssignments,
  splitTopLevelProperties,
} = require('../detectors/error-envelope');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTempProject(mainTs, filterTs, filterRelPath) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'error-envelope-r2-'));
  const apiSrcDir = path.join(tmpDir, 'apps', 'api', 'src');
  const filterDir = path.dirname(path.join(apiSrcDir, filterRelPath));

  fs.mkdirSync(apiSrcDir, { recursive: true });
  fs.mkdirSync(filterDir, { recursive: true });

  fs.writeFileSync(path.join(apiSrcDir, 'main.ts'), mainTs);
  fs.writeFileSync(path.join(apiSrcDir, filterRelPath), filterTs);

  return tmpDir;
}

function createTempProjectMultiFilter(mainTs, filters) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'error-envelope-r2-'));
  const apiSrcDir = path.join(tmpDir, 'apps', 'api', 'src');
  fs.mkdirSync(apiSrcDir, { recursive: true });
  fs.writeFileSync(path.join(apiSrcDir, 'main.ts'), mainTs);

  for (const [relPath, content] of Object.entries(filters)) {
    const abs = path.join(apiSrcDir, relPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }

  return tmpDir;
}

function cleanupTempDir(tmpDir) {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

// ===========================================================================
// Branch 28: filter wraps in response.json({error:{...}})
// ===========================================================================

test('R2-B28: filter with response.status(s).json({error:{statusCode,message}}) wrapper', () => {
  const mainTs = `
import { ErrorWrapFilter } from './filters/error-wrap.filter';
async function bootstrap() {
  app.useGlobalFilters(new ErrorWrapFilter());
}`;
  const filterTs = `
export class ErrorWrapFilter {
  catch(exception, host) {
    const response = host.switchToHttp().getResponse();
    const status = exception.getStatus ? exception.getStatus() : 500;
    const message = exception.message || 'Internal server error';
    response.status(status).json({
      success: false,
      error: {
        statusCode: status,
        message,
      },
    });
  }
}`;
  const tmpDir = createTempProject(mainTs, filterTs, 'filters/error-wrap.filter.ts');
  try {
    const result = detectErrorEnvelope(tmpDir);
    assert.ok(result, 'should detect error envelope');
    assert.deepStrictEqual(result.wrapper, ['error']);
    // Semantic roles null without x-error-* extensions (heuristic removed)
    assert.strictEqual(result.statusField, null);
    assert.strictEqual(result.messageField, null);
    assert.strictEqual(result.errorsArrayField, null);
    // declaredFields carries the actual field names
    assert.ok(result.declaredFields.length >= 2);
    assert.strictEqual(result.declaredFields[0].key, 'statusCode');
    assert.strictEqual(result.declaredFields[1].key, 'message');
  } finally {
    cleanupTempDir(tmpDir);
  }
});

test('R2-B28: filter with nested error wrapper and errors spread', () => {
  // Mirrors the actual project filter shape
  const mainTs = `
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
async function bootstrap() {
  app.useGlobalFilters(new GlobalExceptionFilter());
}`;
  const filterTs = `
export class GlobalExceptionFilter {
  catch(exception, host) {
    const response = host.switchToHttp().getResponse();
    response.status(status).json({
      success: false,
      error: {
        statusCode: status,
        message,
        ...(errors ? { errors } : {}),
      },
    });
  }
}`;
  const tmpDir = createTempProject(mainTs, filterTs, 'common/filters/http-exception.filter.ts');
  try {
    const result = detectErrorEnvelope(tmpDir);
    assert.ok(result);
    assert.deepStrictEqual(result.wrapper, ['error']);
    assert.strictEqual(result.statusField, null);
    assert.strictEqual(result.messageField, null);
    assert.strictEqual(result.errorsArrayField, null);
    assert.ok(result.declaredFields.length >= 2);
    assert.ok(result.spreadFields.includes('errors'));
  } finally {
    cleanupTempDir(tmpDir);
  }
});

test('R2-B28: filter with response.json({...}) without .status() chain', () => {
  const mainTs = `
import { DirectJsonFilter } from './filters/direct.filter';
async function bootstrap() {
  app.useGlobalFilters(new DirectJsonFilter());
}`;
  const filterTs = `
export class DirectJsonFilter {
  catch(exception, host) {
    const response = host.switchToHttp().getResponse();
    response.json({
      error: {
        statusCode: 500,
        message: exception.message,
      },
    });
  }
}`;
  const tmpDir = createTempProject(mainTs, filterTs, 'filters/direct.filter.ts');
  try {
    const result = detectErrorEnvelope(tmpDir);
    assert.ok(result);
    assert.deepStrictEqual(result.wrapper, ['error']);
    assert.strictEqual(result.statusField, null); // no x-error-* extension
    assert.strictEqual(result.messageField, null); // no x-error-* extension
  } finally {
    cleanupTempDir(tmpDir);
  }
});

// ===========================================================================
// Branch 29: filter wraps in response.send({result:{...}})
// ===========================================================================

test('R2-B29: extractJsonCallBody matches .send() with object argument', () => {
  // FIX 3: The detector now matches both .json() and .send() calls.
  const filterSource = `
    response.status(status).send({
      result: {
        statusCode: status,
        message: msg,
      },
    });
  `;
  const body = extractJsonCallBody(filterSource);
  assert.ok(body, '.send() with object arg is now detected');
  assert.ok(body.includes('result'));
  assert.ok(body.includes('statusCode'));
});

test('R2-B29: filter using .send() IS detected — envelope returns shape', () => {
  const mainTs = `
import { SendFilter } from './filters/send.filter';
async function bootstrap() {
  app.useGlobalFilters(new SendFilter());
}`;
  const filterTs = `
export class SendFilter {
  catch(exception, host) {
    const response = host.switchToHttp().getResponse();
    response.status(500).send({
      result: {
        statusCode: 500,
        message: exception.message,
      },
    });
  }
}`;
  const tmpDir = createTempProject(mainTs, filterTs, 'filters/send.filter.ts');
  try {
    const result = detectErrorEnvelope(tmpDir);
    // FIX 3: .send() is now detected
    assert.ok(result, '.send() filter is now detected');
    assert.deepStrictEqual(result.wrapper, ['result']);
    assert.strictEqual(result.statusField, null); // no x-error-* extension
    assert.strictEqual(result.messageField, null); // no x-error-* extension
  } finally {
    cleanupTempDir(tmpDir);
  }
});

test('R2-B29: filter with both .send() and .json() — first match wins (.send() appears first)', () => {
  const mainTs = `
import { DualFilter } from './filters/dual.filter';
async function bootstrap() {
  app.useGlobalFilters(new DualFilter());
}`;
  const filterTs = `
export class DualFilter {
  catch(exception, host) {
    const response = host.switchToHttp().getResponse();
    // Some path uses send with object
    if (false) { response.send({ alt: { statusCode: 400, message: "bad" } }); }
    // Main path uses json
    response.status(500).json({
      statusCode: 500,
      message: exception.message,
    });
  }
}`;
  const tmpDir = createTempProject(mainTs, filterTs, 'filters/dual.filter.ts');
  try {
    const result = detectErrorEnvelope(tmpDir);
    assert.ok(result);
    // First .send()/.json() with object body wins — the .send() has alt wrapper
    assert.deepStrictEqual(result.wrapper, ['alt']);
    assert.strictEqual(result.statusField, null); // no x-error-* extension
    assert.strictEqual(result.messageField, null); // no x-error-* extension
  } finally {
    cleanupTempDir(tmpDir);
  }
});

test('R2-B29: filter with .send("string") is skipped (no object arg)', () => {
  const filterSource = `response.send("plain text");`;
  const body = extractJsonCallBody(filterSource);
  assert.strictEqual(body, null, '.send() with string arg is skipped');
});

// ===========================================================================
// Branch 30: filter passes through unmodified
// ===========================================================================

test('R2-B30: filter that just re-throws has no .json() — returns null', () => {
  const mainTs = `
import { PassthroughFilter } from './filters/passthrough.filter';
async function bootstrap() {
  app.useGlobalFilters(new PassthroughFilter());
}`;
  const filterTs = `
export class PassthroughFilter {
  catch(exception, host) {
    // Logs and re-throws, no .json() call
    console.error(exception);
    throw exception;
  }
}`;
  const tmpDir = createTempProject(mainTs, filterTs, 'filters/passthrough.filter.ts');
  try {
    const result = detectErrorEnvelope(tmpDir);
    assert.strictEqual(result, null);
  } finally {
    cleanupTempDir(tmpDir);
  }
});

test('R2-B30: filter that calls .json() with non-object arg — skipped', () => {
  const filterSource = `
    response.status(500).json("Internal Server Error");
  `;
  const body = extractJsonCallBody(filterSource);
  // .json("string") — the regex skips non-object arguments (no opening brace)
  assert.strictEqual(body, null);
});

test('R2-B30: filter that calls .json() with unknown shape — no status/message', () => {
  const mainTs = `
import { WeirdFilter } from './filters/weird.filter';
async function bootstrap() {
  app.useGlobalFilters(new WeirdFilter());
}`;
  const filterTs = `
export class WeirdFilter {
  catch(exception, host) {
    const response = host.switchToHttp().getResponse();
    response.json({
      outcome: 'failure',
      reason: exception.message,
    });
  }
}`;
  const tmpDir = createTempProject(mainTs, filterTs, 'filters/weird.filter.ts');
  try {
    const result = detectErrorEnvelope(tmpDir);
    // Has .json({...}) with declared fields — returned with null semantic roles
    assert.ok(result, 'should return envelope with declaredFields');
    assert.deepStrictEqual(result.wrapper, []);
    assert.strictEqual(result.statusField, null);
    assert.strictEqual(result.messageField, null);
    assert.strictEqual(result.declaredFields.length, 2);
    assert.strictEqual(result.declaredFields[0].key, 'outcome');
    assert.strictEqual(result.declaredFields[1].key, 'reason');
  } finally {
    cleanupTempDir(tmpDir);
  }
});

// ===========================================================================
// Branch 31: UNDETECTED: no global filter wired
// ===========================================================================

test('R2-B31: no useGlobalFilters call returns null', () => {
  const mainTs = `
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalInterceptors(new TransformInterceptor());
  await app.listen(3001);
}`;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'error-envelope-r2-'));
  const apiSrcDir = path.join(tmpDir, 'apps', 'api', 'src');
  fs.mkdirSync(apiSrcDir, { recursive: true });
  fs.writeFileSync(path.join(apiSrcDir, 'main.ts'), mainTs);

  try {
    const result = detectErrorEnvelope(tmpDir);
    assert.strictEqual(result, null);
  } finally {
    cleanupTempDir(tmpDir);
  }
});

test('R2-B31: no bootstrap entrypoint at all returns null', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'error-envelope-r2-'));
  try {
    const result = detectErrorEnvelope(tmpDir);
    assert.strictEqual(result, null);
  } finally {
    cleanupTempDir(tmpDir);
  }
});

test('R2-B31: entrypoint exists but is empty returns null', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'error-envelope-r2-'));
  const apiSrcDir = path.join(tmpDir, 'apps', 'api', 'src');
  fs.mkdirSync(apiSrcDir, { recursive: true });
  fs.writeFileSync(path.join(apiSrcDir, 'main.ts'), '');

  try {
    const result = detectErrorEnvelope(tmpDir);
    assert.strictEqual(result, null);
  } finally {
    cleanupTempDir(tmpDir);
  }
});

test('R2-B31: useGlobalFilters with unresolvable import path returns null', () => {
  const mainTs = `
import { MissingFilter } from './does-not-exist';
async function bootstrap() {
  app.useGlobalFilters(new MissingFilter());
}`;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'error-envelope-r2-'));
  const apiSrcDir = path.join(tmpDir, 'apps', 'api', 'src');
  fs.mkdirSync(apiSrcDir, { recursive: true });
  fs.writeFileSync(path.join(apiSrcDir, 'main.ts'), mainTs);

  try {
    const result = detectErrorEnvelope(tmpDir);
    assert.strictEqual(result, null);
  } finally {
    cleanupTempDir(tmpDir);
  }
});

test('R2-B31: diag logs when no useGlobalFilters found', () => {
  const mainTs = `async function bootstrap() { await app.listen(3001); }`;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'error-envelope-r2-'));
  const apiSrcDir = path.join(tmpDir, 'apps', 'api', 'src');
  fs.mkdirSync(apiSrcDir, { recursive: true });
  fs.writeFileSync(path.join(apiSrcDir, 'main.ts'), mainTs);

  const messages = [];
  const diag = { info: (msg) => messages.push(msg) };

  try {
    detectErrorEnvelope(tmpDir, diag);
    assert.ok(messages.some((m) => m.includes('no useGlobalFilters call')));
  } finally {
    cleanupTempDir(tmpDir);
  }
});

test('R2-B31: diag logs when no entrypoint found', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'error-envelope-r2-'));
  const messages = [];
  const diag = { info: (msg) => messages.push(msg) };

  try {
    detectErrorEnvelope(tmpDir, diag);
    assert.ok(messages.some((m) => m.includes('no bootstrap entrypoint')));
  } finally {
    cleanupTempDir(tmpDir);
  }
});

// ===========================================================================
// Branch 32: multiple filters stacked (which one wins?)
// ===========================================================================

test('R2-B32: two filters stacked — first with .json() wins', () => {
  const mainTs = `
import { FilterA } from './filters/a.filter';
import { FilterB } from './filters/b.filter';
async function bootstrap() {
  app.useGlobalFilters(new FilterA(), new FilterB());
}`;
  const filters = {
    'filters/a.filter.ts': `
export class FilterA {
  catch(exception, host) {
    const response = host.switchToHttp().getResponse();
    response.status(500).json({
      error: {
        statusCode: 500,
        message: exception.message,
      },
    });
  }
}`,
    'filters/b.filter.ts': `
export class FilterB {
  catch(exception, host) {
    const response = host.switchToHttp().getResponse();
    response.status(500).json({
      statusCode: 500,
      message: exception.message,
    });
  }
}`,
  };
  const tmpDir = createTempProjectMultiFilter(mainTs, filters);
  try {
    const result = detectErrorEnvelope(tmpDir);
    assert.ok(result);
    // First filter (FilterA) has wrapper ['error'], so it wins
    assert.deepStrictEqual(result.wrapper, ['error']);
    assert.ok(result.source.includes('a.filter.ts'));
  } finally {
    cleanupTempDir(tmpDir);
  }
});

test('R2-B32: first filter has no .json(), second filter has .json() — second wins', () => {
  const mainTs = `
import { LogFilter } from './filters/log.filter';
import { JsonFilter } from './filters/json.filter';
async function bootstrap() {
  app.useGlobalFilters(new LogFilter(), new JsonFilter());
}`;
  const filters = {
    'filters/log.filter.ts': `
export class LogFilter {
  catch(exception, host) {
    console.error(exception);
    throw exception;
  }
}`,
    'filters/json.filter.ts': `
export class JsonFilter {
  catch(exception, host) {
    const response = host.switchToHttp().getResponse();
    response.json({
      statusCode: 500,
      detail: exception.message,
    });
  }
}`,
  };
  const tmpDir = createTempProjectMultiFilter(mainTs, filters);
  try {
    const result = detectErrorEnvelope(tmpDir);
    assert.ok(result);
    // First filter has no .json(), second has flat shape
    assert.deepStrictEqual(result.wrapper, []);
    assert.strictEqual(result.statusField, null); // no x-error-* extension
    assert.strictEqual(result.messageField, null); // no x-error-* extension
    assert.ok(result.source.includes('json.filter.ts'));
  } finally {
    cleanupTempDir(tmpDir);
  }
});

test('R2-B32: three filters — first two have no .json(), third has .json()', () => {
  const mainTs = `
import { A } from './filters/a';
import { B } from './filters/b';
import { C } from './filters/c';
async function bootstrap() {
  app.useGlobalFilters(new A(), new B(), new C());
}`;
  const filters = {
    'filters/a.ts': `
export class A {
  catch(e, host) { throw e; }
}`,
    'filters/b.ts': `
export class B {
  catch(e, host) { console.log(e); throw e; }
}`,
    'filters/c.ts': `
export class C {
  catch(e, host) {
    const res = host.switchToHttp().getResponse();
    res.status(500).json({
      status: 500,
      message: e.message,
    });
  }
}`,
  };
  const tmpDir = createTempProjectMultiFilter(mainTs, filters);
  try {
    const result = detectErrorEnvelope(tmpDir);
    assert.ok(result);
    assert.deepStrictEqual(result.wrapper, []);
    assert.strictEqual(result.statusField, null); // no x-error-* extension
    assert.strictEqual(result.messageField, null); // no x-error-* extension
    assert.ok(result.source.includes('c.ts'));
  } finally {
    cleanupTempDir(tmpDir);
  }
});

test('R2-B32: all stacked filters have no .json() — returns null', () => {
  const mainTs = `
import { A } from './filters/a';
import { B } from './filters/b';
async function bootstrap() {
  app.useGlobalFilters(new A(), new B());
}`;
  const filters = {
    'filters/a.ts': `
export class A {
  catch(e, host) { throw e; }
}`,
    'filters/b.ts': `
export class B {
  catch(e, host) { throw e; }
}`,
  };
  const tmpDir = createTempProjectMultiFilter(mainTs, filters);
  try {
    const result = detectErrorEnvelope(tmpDir);
    assert.strictEqual(result, null);
  } finally {
    cleanupTempDir(tmpDir);
  }
});

test('R2-B32: diag logs when filters present but no .json() pattern matched', () => {
  const mainTs = `
import { NoJson } from './filters/no-json';
async function bootstrap() {
  app.useGlobalFilters(new NoJson());
}`;
  const filters = {
    'filters/no-json.ts': `
export class NoJson {
  catch(e, host) { throw e; }
}`,
  };
  const tmpDir = createTempProjectMultiFilter(mainTs, filters);
  const messages = [];
  const diag = { info: (msg) => messages.push(msg) };

  try {
    detectErrorEnvelope(tmpDir, diag);
    assert.ok(messages.some((m) => m.includes('no .json()/.send() pattern matched')));
  } finally {
    cleanupTempDir(tmpDir);
  }
});

// ===========================================================================
// Additional edge cases for analyzeErrorShape
// ===========================================================================

test('R2-extra: analyzeErrorShape with shorthand properties', () => {
  const result = analyzeErrorShape('{ statusCode, message, errors }');
  assert.deepStrictEqual(result.wrapper, []);
  assert.strictEqual(result.statusField, null); // no x-error-* extension
  assert.strictEqual(result.messageField, null); // no x-error-* extension
  assert.strictEqual(result.errorsArrayField, null); // no x-error-* extension
});

test('R2-extra: analyzeErrorShape with multiple spread expressions', () => {
  const result = analyzeErrorShape('{ statusCode: s, message: m, ...(a ? { errors: a } : {}), ...(b ? { trace: b } : {}) }');
  assert.strictEqual(result.statusField, null); // no x-error-* extension
  assert.strictEqual(result.messageField, null); // no x-error-* extension
  assert.strictEqual(result.errorsArrayField, null); // no x-error-* extension
});

test('R2-extra: analyzeErrorShape with quoted keys', () => {
  const result = analyzeErrorShape("{ 'statusCode': s, 'message': m }");
  assert.strictEqual(result.statusField, null); // no x-error-* extension
  assert.strictEqual(result.messageField, null); // no x-error-* extension
});

test('R2-extra: analyzeErrorShape wrapper key is always the first nested object', () => {
  const result = analyzeErrorShape('{ success: false, error: { statusCode: s, message: m } }');
  assert.deepStrictEqual(result.wrapper, ['error']);
  assert.strictEqual(result.statusField, null); // no x-error-* extension
  assert.strictEqual(result.messageField, null); // no x-error-* extension
});

test('R2-extra: analyzeErrorShape with detail field (Problem+JSON-like in filter)', () => {
  const result = analyzeErrorShape('{ status: code, detail: msg }');
  assert.deepStrictEqual(result.wrapper, []);
  assert.strictEqual(result.statusField, null); // no x-error-* extension
  assert.strictEqual(result.messageField, null); // no x-error-* extension
});

test('R2-extra: extractJsonCallBody handles multiple .json() calls (picks first)', () => {
  const source = `
    if (isHttp) {
      response.json({ statusCode: 400, message: "bad" });
    } else {
      response.json({ code: 500, detail: "error" });
    }
  `;
  const body = extractJsonCallBody(source);
  assert.ok(body);
  assert.ok(body.includes('statusCode'));
});

test('R2-extra: extractJsonCallBody with deeply nested object', () => {
  const source = `
    response.json({
      outer: {
        inner: {
          deep: {
            statusCode: 500,
            message: "error",
          },
        },
      },
    });
  `;
  const body = extractJsonCallBody(source);
  assert.ok(body);
  assert.ok(body.includes('outer'));
  assert.ok(body.includes('deep'));
});

test('R2-extra: parseFieldAssignments with var keyword', () => {
  const result = parseFieldAssignments('{ statusCode: s, message: m }');
  assert.strictEqual(result.statusField, null); // no x-error-* extension
  assert.strictEqual(result.messageField, null); // no x-error-* extension
});

test('R2-extra: parseFieldAssignments with no recognized fields', () => {
  const result = parseFieldAssignments('{ foo: bar, baz: qux }');
  assert.strictEqual(result.statusField, null);
  assert.strictEqual(result.messageField, null);
  assert.strictEqual(result.errorsArrayField, null);
});

test('R2-extra: splitTopLevelProperties with single property', () => {
  const result = splitTopLevelProperties('{ statusCode: 500 }');
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].trim(), 'statusCode: 500');
});

test('R2-extra: splitTopLevelProperties with empty braces', () => {
  const result = splitTopLevelProperties('{}');
  assert.strictEqual(result.length, 0);
});

test('R2-extra: extractGlobalFilterClassNames handles whitespace variations', () => {
  const src = `app.useGlobalFilters  (  new  MyFilter  (  )  )`;
  assert.deepStrictEqual(extractGlobalFilterClassNames(src), ['MyFilter']);
});

test('R2-extra: extractGlobalFilterClassNames with no opening paren', () => {
  const src = `app.useGlobalFilters;`;
  assert.deepStrictEqual(extractGlobalFilterClassNames(src), []);
});

test('R2-extra: resolveClassImportPath with non-relative import returns null', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'error-envelope-r2-'));
  const mainFile = path.join(tmpDir, 'main.ts');
  fs.writeFileSync(mainFile, `import { Filter } from '@nestjs/common';`);
  const mainSrc = fs.readFileSync(mainFile, 'utf8');

  try {
    assert.strictEqual(resolveClassImportPath(mainSrc, mainFile, 'Filter'), null);
  } finally {
    cleanupTempDir(tmpDir);
  }
});

test('R2-extra: resolveClassImportPath with missing class name returns null', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'error-envelope-r2-'));
  const mainFile = path.join(tmpDir, 'main.ts');
  fs.writeFileSync(mainFile, `import { OtherClass } from './other';`);
  const mainSrc = fs.readFileSync(mainFile, 'utf8');

  try {
    assert.strictEqual(resolveClassImportPath(mainSrc, mainFile, 'NotImported'), null);
  } finally {
    cleanupTempDir(tmpDir);
  }
});
