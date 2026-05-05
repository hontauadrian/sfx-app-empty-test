'use strict';

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
// splitTopLevelProperties
// ---------------------------------------------------------------------------

test('splitTopLevelProperties splits simple key-value pairs', () => {
  const result = splitTopLevelProperties('{ a: 1, b: 2, c: 3 }');
  assert.deepStrictEqual(result.map((s) => s.trim()), ['a: 1', 'b: 2', 'c: 3']);
});

test('splitTopLevelProperties handles nested objects without splitting', () => {
  const result = splitTopLevelProperties('{ a: { x: 1, y: 2 }, b: 3 }');
  assert.strictEqual(result.length, 2);
  assert.ok(result[0].trim().startsWith('a:'));
  assert.strictEqual(result[1].trim(), 'b: 3');
});

test('splitTopLevelProperties handles spread expressions', () => {
  const result = splitTopLevelProperties('{ a: 1, ...(x ? { b: 2 } : {}) }');
  assert.strictEqual(result.length, 2);
  assert.strictEqual(result[0].trim(), 'a: 1');
  assert.ok(result[1].trim().startsWith('...'));
});

// ---------------------------------------------------------------------------
// extractGlobalFilterClassNames
// ---------------------------------------------------------------------------

test('extractGlobalFilterClassNames finds single filter', () => {
  const source = `
    import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
    app.useGlobalFilters(new GlobalExceptionFilter());
  `;
  assert.deepStrictEqual(extractGlobalFilterClassNames(source), ['GlobalExceptionFilter']);
});

test('extractGlobalFilterClassNames finds multiple filters', () => {
  const source = `
    app.useGlobalFilters(new FilterA(), new FilterB());
  `;
  assert.deepStrictEqual(extractGlobalFilterClassNames(source), ['FilterA', 'FilterB']);
});

test('extractGlobalFilterClassNames returns empty when no call', () => {
  assert.deepStrictEqual(extractGlobalFilterClassNames('app.useGlobalInterceptors(new X())'), []);
});

test('extractGlobalFilterClassNames handles whitespace', () => {
  const source = `app.useGlobalFilters  (  new  MyFilter  ()  )`;
  assert.deepStrictEqual(extractGlobalFilterClassNames(source), ['MyFilter']);
});

// ---------------------------------------------------------------------------
// extractJsonCallBody
// ---------------------------------------------------------------------------

test('extractJsonCallBody extracts object from response.status(...).json({...})', () => {
  const source = `
    response.status(status).json({
      success: false,
      error: {
        statusCode: status,
        message,
      },
    });
  `;
  const result = extractJsonCallBody(source);
  assert.ok(result);
  assert.ok(result.startsWith('{'));
  assert.ok(result.endsWith('}'));
  assert.ok(result.includes('success: false'));
  assert.ok(result.includes('statusCode: status'));
});

test('extractJsonCallBody returns null when no .json() call', () => {
  assert.strictEqual(extractJsonCallBody('response.send("hello")'), null);
});

test('extractJsonCallBody skips non-object .json() arguments', () => {
  // .json("string") should be skipped, .json({...}) should be found
  const source = `
    response.json("not an object");
    response.json({ statusCode: 400, message: "bad" });
  `;
  const result = extractJsonCallBody(source);
  assert.ok(result);
  assert.ok(result.includes('statusCode'));
});

// ---------------------------------------------------------------------------
// parseFieldAssignments — returns all fields verbatim, no name-based heuristics
// ---------------------------------------------------------------------------

test('parseFieldAssignments returns all declared fields without semantic classification', () => {
  const result = parseFieldAssignments('{ statusCode: status, message }');
  // Semantic fields are null without extensions
  assert.strictEqual(result.statusField, null);
  assert.strictEqual(result.messageField, null);
  assert.strictEqual(result.errorsArrayField, null);
  // All fields returned verbatim
  assert.strictEqual(result.declaredFields.length, 2);
  assert.strictEqual(result.declaredFields[0].key, 'statusCode');
  assert.strictEqual(result.declaredFields[0].value, 'status');
  assert.strictEqual(result.declaredFields[1].key, 'message');
  assert.strictEqual(result.declaredFields[1].value, 'message');
});

test('parseFieldAssignments returns Problem+JSON fields without semantic classification', () => {
  const result = parseFieldAssignments('{ type: url, title: t, status: code, detail: msg }');
  assert.strictEqual(result.statusField, null);
  assert.strictEqual(result.messageField, null);
  assert.strictEqual(result.declaredFields.length, 4);
  assert.strictEqual(result.declaredFields[0].key, 'type');
  assert.strictEqual(result.declaredFields[2].key, 'status');
  assert.strictEqual(result.declaredFields[3].key, 'detail');
});

test('parseFieldAssignments extracts spread field identifiers', () => {
  const result = parseFieldAssignments('{ statusCode: status, message, ...(errors ? { errors } : {}) }');
  assert.strictEqual(result.declaredFields.length, 2);
  assert.ok(result.spreadFields.includes('errors'));
});

test('parseFieldAssignments with extensions provides semantic classification', () => {
  const extensions = {
    'x-error-status-field': 'statusCode',
    'x-error-message-field': 'message',
    'x-error-errors-field': 'errors',
  };
  const result = parseFieldAssignments('{ statusCode: status, message, errors: validationErrors }', extensions);
  assert.strictEqual(result.statusField, 'statusCode');
  assert.strictEqual(result.messageField, 'message');
  assert.strictEqual(result.errorsArrayField, 'errors');
});

test('parseFieldAssignments with partial extensions', () => {
  const extensions = { 'x-error-status-field': 'code' };
  const result = parseFieldAssignments('{ code: 400, msg: "bad" }', extensions);
  assert.strictEqual(result.statusField, 'code');
  assert.strictEqual(result.messageField, null);
});

// ---------------------------------------------------------------------------
// analyzeErrorShape — wrapper detection + field extraction
// ---------------------------------------------------------------------------

test('analyzeErrorShape detects NestJS wrapped envelope, returns declaredFields', () => {
  const objLiteral = `{
    success: false,
    error: {
      statusCode: status,
      message,
      ...(errors ? { errors } : {}),
    },
  }`;
  const result = analyzeErrorShape(objLiteral);
  assert.deepStrictEqual(result.wrapper, ['error']);
  // No semantic classification without extensions
  assert.strictEqual(result.statusField, null);
  assert.strictEqual(result.messageField, null);
  assert.strictEqual(result.errorsArrayField, null);
  // declaredFields from the inner object
  assert.strictEqual(result.declaredFields.length, 2);
  assert.strictEqual(result.declaredFields[0].key, 'statusCode');
  assert.strictEqual(result.declaredFields[1].key, 'message');
  assert.ok(result.spreadFields.includes('errors'));
});

test('analyzeErrorShape detects flat shape (no wrapper)', () => {
  const objLiteral = `{ statusCode: status, message, error: errorLabel }`;
  const result = analyzeErrorShape(objLiteral);
  assert.deepStrictEqual(result.wrapper, []);
  assert.strictEqual(result.statusField, null);
  assert.strictEqual(result.messageField, null);
  // All 3 top-level fields in declaredFields
  assert.strictEqual(result.declaredFields.length, 3);
});

test('analyzeErrorShape detects Problem+JSON flat shape, no semantic classification', () => {
  const objLiteral = `{
    type: 'about:blank',
    title: httpError,
    status: statusCode,
    detail: message,
    instance: request.url,
  }`;
  const result = analyzeErrorShape(objLiteral);
  assert.deepStrictEqual(result.wrapper, []);
  assert.strictEqual(result.statusField, null);
  assert.strictEqual(result.messageField, null);
  assert.strictEqual(result.declaredFields.length, 5);
});

test('analyzeErrorShape with extensions classifies semantic roles', () => {
  const objLiteral = `{
    success: false,
    error: {
      statusCode: status,
      message,
    },
  }`;
  const extensions = {
    'x-error-status-field': 'statusCode',
    'x-error-message-field': 'message',
  };
  const result = analyzeErrorShape(objLiteral, extensions);
  assert.deepStrictEqual(result.wrapper, ['error']);
  assert.strictEqual(result.statusField, 'statusCode');
  assert.strictEqual(result.messageField, 'message');
});

// ---------------------------------------------------------------------------
// detectErrorEnvelope — integration with temp fixtures
// ---------------------------------------------------------------------------

function createTempProject(mainTs, filterTs, filterRelPath) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'error-envelope-test-'));
  const apiSrcDir = path.join(tmpDir, 'apps', 'api', 'src');
  const filterDir = path.dirname(path.join(apiSrcDir, filterRelPath));

  fs.mkdirSync(apiSrcDir, { recursive: true });
  fs.mkdirSync(filterDir, { recursive: true });

  fs.writeFileSync(path.join(apiSrcDir, 'main.ts'), mainTs);
  fs.writeFileSync(path.join(apiSrcDir, filterRelPath), filterTs);

  return tmpDir;
}

function cleanupTempDir(tmpDir) {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

test('detectErrorEnvelope extracts envelope with declaredFields (no semantic without extensions)', () => {
  const mainTs = `
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());
  await app.listen(3001);
}
`;
  const filterTs = `
import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';

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
        message = body.message ?? message;
        errors = body.errors;
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
`;

  const tmpDir = createTempProject(mainTs, filterTs, 'common/filters/http-exception.filter.ts');
  try {
    const result = detectErrorEnvelope(tmpDir);
    assert.ok(result, 'should detect error envelope');
    assert.deepStrictEqual(result.wrapper, ['error']);
    // Semantic roles are null without x-error-* extensions
    assert.strictEqual(result.statusField, null);
    assert.strictEqual(result.messageField, null);
    assert.strictEqual(result.errorsArrayField, null);
    // declaredFields carries actual field names
    assert.ok(result.declaredFields.length >= 2);
    assert.strictEqual(result.declaredFields[0].key, 'statusCode');
    assert.strictEqual(result.declaredFields[1].key, 'message');
    assert.ok(result.spreadFields.includes('errors'));
    assert.ok(result.source.includes('http-exception.filter.ts'));
  } finally {
    cleanupTempDir(tmpDir);
  }
});

test('detectErrorEnvelope returns null when no useGlobalFilters call', () => {
  const mainTs = `
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalInterceptors(new TransformInterceptor());
  await app.listen(3001);
}
`;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'error-envelope-test-'));
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

test('detectErrorEnvelope handles flat filter (returns declaredFields, no semantic)', () => {
  const mainTs = `
import { SimpleFilter } from './filters/simple.filter';
async function bootstrap() {
  app.useGlobalFilters(new SimpleFilter());
}
`;
  const filterTs = `
export class SimpleFilter {
  catch(exception, host) {
    const response = host.switchToHttp().getResponse();
    response.status(400).json({
      statusCode: 400,
      message: exception.message,
    });
  }
}
`;

  const tmpDir = createTempProject(mainTs, filterTs, 'filters/simple.filter.ts');
  try {
    const result = detectErrorEnvelope(tmpDir);
    assert.ok(result, 'should detect flat error envelope');
    assert.deepStrictEqual(result.wrapper, []);
    assert.strictEqual(result.statusField, null);
    assert.strictEqual(result.messageField, null);
    assert.ok(result.declaredFields.length >= 2);
    assert.strictEqual(result.declaredFields[0].key, 'statusCode');
    assert.strictEqual(result.declaredFields[1].key, 'message');
  } finally {
    cleanupTempDir(tmpDir);
  }
});

test('detectErrorEnvelope handles Problem+JSON filter (returns declaredFields)', () => {
  const mainTs = `
import { ProblemJsonFilter } from './filters/problem-json.filter';
async function bootstrap() {
  app.useGlobalFilters(new ProblemJsonFilter());
}
`;
  const filterTs = `
export class ProblemJsonFilter {
  catch(exception, host) {
    const response = host.switchToHttp().getResponse();
    response.status(statusCode).json({
      type: 'about:blank',
      title: httpError,
      status: statusCode,
      detail: message,
      instance: request.url,
    });
  }
}
`;

  const tmpDir = createTempProject(mainTs, filterTs, 'filters/problem-json.filter.ts');
  try {
    const result = detectErrorEnvelope(tmpDir);
    assert.ok(result, 'should detect problem-json envelope');
    assert.deepStrictEqual(result.wrapper, []);
    assert.strictEqual(result.statusField, null);
    assert.strictEqual(result.messageField, null);
    assert.strictEqual(result.declaredFields.length, 5);
  } finally {
    cleanupTempDir(tmpDir);
  }
});

test('detectErrorEnvelope returns null for no bootstrap entrypoint', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'error-envelope-test-'));
  try {
    const result = detectErrorEnvelope(tmpDir);
    assert.strictEqual(result, null);
  } finally {
    cleanupTempDir(tmpDir);
  }
});

test('detectErrorEnvelope emits ERROR_STATUS_FIELD_UNDECLARED diag', () => {
  const mainTs = `
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
async function bootstrap() {
  app.useGlobalFilters(new GlobalExceptionFilter());
}
`;
  const filterTs = `
export class GlobalExceptionFilter {
  catch(exception, host) {
    const response = host.switchToHttp().getResponse();
    response.status(status).json({
      success: false,
      error: {
        statusCode: status,
        message,
      },
    });
  }
}
`;

  const tmpDir = createTempProject(mainTs, filterTs, 'common/filters/http-exception.filter.ts');
  const messages = [];
  const diag = { info: (msg) => messages.push(msg) };

  try {
    const result = detectErrorEnvelope(tmpDir, diag);
    assert.ok(result);
    assert.ok(messages.length > 0, 'should have logged diagnostic messages');
    const undeclared = messages.find((m) => m.includes('ERROR_STATUS_FIELD_UNDECLARED'));
    assert.ok(undeclared, 'Expected ERROR_STATUS_FIELD_UNDECLARED diag');
    assert.ok(undeclared.includes('x-error-status-field'));
  } finally {
    cleanupTempDir(tmpDir);
  }
});
