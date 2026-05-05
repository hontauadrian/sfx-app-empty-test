'use strict';

// Fixture-driven tests for detectors/nest-openapi.js.
// Run directly: `node __tests__/nest-openapi.test.js`

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  detectNestOpenApi,
  deriveEndpointsFromSpec,
  openApiSchemaToZodContract,
  normalizeOpenApiPath,
  securityRequiresBearer,
  extractSecuritySchemes,
  buildSecurityRequirement,
  extractHeaderParameters,
  extractVendorExtensions,
  extractMultipartFields,
} = require('../detectors/nest-openapi');

const FIXTURE_ROOT = path.resolve(__dirname, 'fixtures', 'nest-openapi');

// Ensure no stale fixtures from previous regex detector are consulted.
const silentDiag = { info() {}, recordDetectorError() {}, error() {} };

test('normalizeOpenApiPath replaces {param} with :param', () => {
  assert.strictEqual(normalizeOpenApiPath('/users/{id}'), '/users/:id');
  assert.strictEqual(normalizeOpenApiPath('/a/{x}/b/{y}'), '/a/:x/b/:y');
  assert.strictEqual(normalizeOpenApiPath('/plain'), '/plain');
});

test('securityRequiresBearer detects bearer scheme by reference', () => {
  const spec = {
    components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } } },
  };
  assert.strictEqual(securityRequiresBearer([{ bearer: [] }], spec), true);
  assert.strictEqual(securityRequiresBearer([], spec), false);
  assert.strictEqual(securityRequiresBearer(null, spec), false);
});

test('securityRequiresBearer ignores non-bearer schemes', () => {
  const spec = {
    components: { securitySchemes: { api: { type: 'apiKey', in: 'header', name: 'X' } } },
  };
  assert.strictEqual(securityRequiresBearer([{ api: [] }], spec), false);
});

test('openApiSchemaToZodContract maps required/properties/samples', () => {
  const schema = {
    type: 'object',
    required: ['email'],
    properties: {
      email: { type: 'string', format: 'email' },
      age: { type: 'integer', minimum: 0 },
      nick: { type: 'string' },
    },
  };
  const contract = openApiSchemaToZodContract(schema, 'Foo');
  assert.strictEqual(contract.schemaRef, 'Foo');
  const emailField = contract.fields.find((f) => f.name === 'email');
  assert.strictEqual(emailField.required, true);
  assert.strictEqual(emailField.type, 'string');
  assert.strictEqual(emailField.constraints.format, 'email');
  const ageField = contract.fields.find((f) => f.name === 'age');
  assert.strictEqual(ageField.type, 'number');
  assert.strictEqual(ageField.constraints.min, 0);
});

test('pickSample emits format-valid sample for format: email', () => {
  const schema = {
    type: 'object',
    required: ['email'],
    properties: { email: { type: 'string', format: 'email' } },
  };
  const contract = openApiSchemaToZodContract(schema, 'EmailSchema');
  assert.strictEqual(contract.sampleValid.email, 'valid@example.com');
  const f = contract.fields.find((x) => x.name === 'email');
  // 'missing' (required) + 'wrong-format' (email)
  const kinds = f.samples.invalidators.map((i) => i.kind);
  assert.ok(kinds.includes('wrong-format'));
  const wf = f.samples.invalidators.find((i) => i.kind === 'wrong-format');
  assert.strictEqual(wf.value, 'not-an-email');
});

test('pickSample emits format-valid sample for format: uri', () => {
  const schema = {
    type: 'object',
    required: ['homepage'],
    properties: { homepage: { type: 'string', format: 'uri' } },
  };
  const contract = openApiSchemaToZodContract(schema, 'UriSchema');
  assert.strictEqual(contract.sampleValid.homepage, 'https://example.com');
  const f = contract.fields.find((x) => x.name === 'homepage');
  const wf = f.samples.invalidators.find((i) => i.kind === 'wrong-format');
  assert.ok(wf, 'wrong-format invalidator must be present for uri');
  assert.strictEqual(wf.value, 'not-a-url');
});

test('pickSample emits format-valid sample for format: url (alias of uri)', () => {
  const schema = {
    type: 'object',
    required: ['link'],
    properties: { link: { type: 'string', format: 'url' } },
  };
  const contract = openApiSchemaToZodContract(schema, 'UrlSchema');
  assert.strictEqual(contract.sampleValid.link, 'https://example.com');
  const f = contract.fields.find((x) => x.name === 'link');
  const wf = f.samples.invalidators.find((i) => i.kind === 'wrong-format');
  assert.ok(wf, 'wrong-format invalidator must be present for url');
  assert.strictEqual(wf.value, 'not-a-url');
});

test('pickSample emits format-valid sample for format: uuid', () => {
  const schema = {
    type: 'object',
    required: ['id'],
    properties: { id: { type: 'string', format: 'uuid' } },
  };
  const contract = openApiSchemaToZodContract(schema, 'UuidSchema');
  assert.strictEqual(contract.sampleValid.id, '00000000-0000-4000-8000-000000000000');
  const f = contract.fields.find((x) => x.name === 'id');
  const wf = f.samples.invalidators.find((i) => i.kind === 'wrong-format');
  assert.ok(wf, 'wrong-format invalidator must be present for uuid');
  assert.strictEqual(wf.value, 'not-a-uuid');
});

test('pickSample emits format-valid sample for format: date (YYYY-MM-DD)', () => {
  const schema = {
    type: 'object',
    required: ['birthday'],
    properties: { birthday: { type: 'string', format: 'date' } },
  };
  const contract = openApiSchemaToZodContract(schema, 'DateSchema');
  assert.strictEqual(contract.sampleValid.birthday, '2024-01-15');
  const f = contract.fields.find((x) => x.name === 'birthday');
  const wf = f.samples.invalidators.find((i) => i.kind === 'wrong-format');
  assert.ok(wf, 'wrong-format invalidator must be present for date');
  assert.strictEqual(wf.value, 'not-a-date');
});

test('pickSample emits format-valid sample for format: date-time (ISO 8601)', () => {
  const schema = {
    type: 'object',
    required: ['createdAt'],
    properties: { createdAt: { type: 'string', format: 'date-time' } },
  };
  const contract = openApiSchemaToZodContract(schema, 'DateTimeSchema');
  assert.strictEqual(contract.sampleValid.createdAt, '2024-01-15T10:30:00.000Z');
  const f = contract.fields.find((x) => x.name === 'createdAt');
  const wf = f.samples.invalidators.find((i) => i.kind === 'wrong-format');
  assert.ok(wf, 'wrong-format invalidator must be present for date-time');
  assert.strictEqual(wf.value, 'not-a-datetime');
});

test('pickSample default branch (no format) yields padded x string', () => {
  // Unbounded string with no format — current contract: 'x'.repeat(max(min, 3)).
  // Confirms no regression when format is absent.
  const schema = {
    type: 'object',
    required: ['nick'],
    properties: { nick: { type: 'string' } },
  };
  const contract = openApiSchemaToZodContract(schema, 'NoFormatSchema');
  assert.strictEqual(contract.sampleValid.nick, 'xxx');
  const f = contract.fields.find((x) => x.name === 'nick');
  // Should have only 'missing' invalidator (no format → no wrong-format)
  const kinds = f.samples.invalidators.map((i) => i.kind);
  assert.ok(!kinds.includes('wrong-format'));
});

test('deriveEndpointsFromSpec: minimal 3.0 spec with 2 ops', () => {
  const spec = {
    openapi: '3.0.0',
    paths: {
      '/health': {
        get: {
          tags: ['health'],
          responses: { '200': { description: 'OK' } },
        },
      },
      '/users/{id}': {
        get: {
          security: [{ bearer: [] }],
          responses: {
            '200': { description: 'OK' },
            '404': { description: 'Missing' },
          },
        },
      },
    },
    components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } } },
  };
  const result = deriveEndpointsFromSpec(spec);
  const endpoints = result.endpoints;
  assert.strictEqual(endpoints.length, 2);
  const health = endpoints.find((e) => e.path === '/health');
  assert.strictEqual(health.method, 'GET');
  assert.strictEqual(health.guard, 'public');
  assert.strictEqual(health.authDecorators.authRequired, false);
  assert.deepStrictEqual(health.swaggerDeclared.statuses, [200]);

  const user = endpoints.find((e) => e.path === '/users/:id');
  assert.strictEqual(user.guard, 'authenticated');
  assert.strictEqual(user.authDecorators.bearerAuth, true);
  assert.deepStrictEqual(user.swaggerDeclared.statuses.sort(), [200, 404]);

  // securitySchemes extracted at top level
  assert.ok(result.securitySchemes);
  assert.strictEqual(result.securitySchemes.bearer.type, 'http');
  assert.strictEqual(result.securitySchemes.bearer.scheme, 'bearer');

  // per-endpoint securityRequirement
  assert.deepStrictEqual(health.securityRequirement, []);
  assert.deepStrictEqual(user.securityRequirement, [{ bearer: [] }]);
});

test('deriveEndpointsFromSpec: requestBody $ref resolves to zodContract', () => {
  const spec = {
    openapi: '3.0.0',
    paths: {
      '/users': {
        post: {
          requestBody: {
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CreateUser' },
              },
            },
          },
          responses: { '201': { description: 'Created' }, '400': { description: 'Bad' } },
        },
      },
    },
    components: {
      schemas: {
        CreateUser: {
          type: 'object',
          required: ['email'],
          properties: { email: { type: 'string', format: 'email' } },
        },
      },
    },
  };
  const [endpoint] = deriveEndpointsFromSpec(spec).endpoints;
  assert.strictEqual(endpoint.method, 'POST');
  assert.strictEqual(endpoint.inputSchemaRef, 'CreateUser');
  assert.ok(endpoint.zodContract);
  assert.strictEqual(endpoint.zodContract.schemaRef, 'CreateUser');
  assert.ok(endpoint.zodContract.fields.find((f) => f.name === 'email' && f.required));
});

test('detectNestOpenApi: returns null when no live stack and no static dump', async () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-openapi-empty-'));
  try {
    const result = await detectNestOpenApi(empty, silentDiag);
    assert.strictEqual(result, null);
  } finally {
    fs.rmSync(empty, { recursive: true, force: true });
  }
});

test('detectNestOpenApi: loads apps/api/.openapi.json when present', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-openapi-static-'));
  try {
    fs.mkdirSync(path.join(tmp, 'apps', 'api'), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, 'apps', 'api', '.openapi.json'),
      JSON.stringify({
        openapi: '3.0.0',
        paths: {
          '/ping': { get: { responses: { '200': { description: 'OK' } } } },
        },
      }),
    );
    const result = await detectNestOpenApi(tmp, silentDiag);
    assert.ok(result);
    assert.strictEqual(result.source, 'openapi-static');
    assert.strictEqual(result.endpoints.length, 1);
    assert.strictEqual(result.endpoints[0].path, '/ping');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('fixture: minimal spec round-trips through detectNestOpenApi', async () => {
  const result = await detectNestOpenApi(path.join(FIXTURE_ROOT, 'minimal'), silentDiag);
  assert.ok(result);
  assert.strictEqual(result.endpoints.length, 2);
});

test('extractSecuritySchemes: extracts all scheme types', () => {
  const spec = {
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        apiKey: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
        cookieAuth: { type: 'apiKey', in: 'cookie', name: 'session' },
        oauth2: { type: 'oauth2', flows: { implicit: { authorizationUrl: 'https://x.com/auth', scopes: {} } } },
        openId: { type: 'openIdConnect', openIdConnectUrl: 'https://x.com/.well-known' },
      },
    },
  };
  const schemes = extractSecuritySchemes(spec);
  assert.strictEqual(Object.keys(schemes).length, 5);
  assert.strictEqual(schemes.bearerAuth.type, 'http');
  assert.strictEqual(schemes.bearerAuth.scheme, 'bearer');
  assert.strictEqual(schemes.bearerAuth.bearerFormat, 'JWT');
  assert.strictEqual(schemes.apiKey.type, 'apiKey');
  assert.strictEqual(schemes.apiKey.in, 'header');
  assert.strictEqual(schemes.apiKey.name, 'X-API-Key');
  assert.strictEqual(schemes.cookieAuth.in, 'cookie');
  assert.strictEqual(schemes.oauth2.type, 'oauth2');
  assert.ok(schemes.oauth2.flows);
  assert.strictEqual(schemes.openId.type, 'openIdConnect');
  assert.ok(schemes.openId.openIdConnectUrl);
});

test('extractSecuritySchemes: returns empty object when no schemes', () => {
  assert.deepStrictEqual(extractSecuritySchemes({}), {});
  assert.deepStrictEqual(extractSecuritySchemes({ components: {} }), {});
});

test('buildSecurityRequirement: passes through security array', () => {
  const security = [{ bearerAuth: [] }, { apiKey: ['read'] }];
  const result = buildSecurityRequirement(security);
  assert.deepStrictEqual(result, [{ bearerAuth: [] }, { apiKey: ['read'] }]);
});

test('buildSecurityRequirement: returns empty array for absent security', () => {
  assert.deepStrictEqual(buildSecurityRequirement(null), []);
  assert.deepStrictEqual(buildSecurityRequirement([]), []);
  assert.deepStrictEqual(buildSecurityRequirement(undefined), []);
});

test('deriveEndpointsFromSpec: securitySchemes returned at top level', () => {
  const spec = {
    openapi: '3.0.0',
    paths: { '/x': { get: { responses: { '200': {} } } } },
    components: {
      securitySchemes: {
        apiKey: { type: 'apiKey', in: 'query', name: 'key' },
      },
    },
  };
  const result = deriveEndpointsFromSpec(spec);
  assert.ok(result.securitySchemes);
  assert.strictEqual(result.securitySchemes.apiKey.in, 'query');
});

test('detectNestOpenApi: result includes securitySchemes', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-openapi-security-'));
  try {
    fs.mkdirSync(path.join(tmp, 'apps', 'api'), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, 'apps', 'api', '.openapi.json'),
      JSON.stringify({
        openapi: '3.0.0',
        paths: {
          '/test': { get: { security: [{ myAuth: [] }], responses: { '200': {} } } },
        },
        components: {
          securitySchemes: { myAuth: { type: 'http', scheme: 'bearer' } },
        },
      }),
    );
    const result = await detectNestOpenApi(tmp, silentDiag);
    assert.ok(result);
    assert.ok(result.securitySchemes);
    assert.strictEqual(result.securitySchemes.myAuth.type, 'http');
    assert.strictEqual(result.securitySchemes.myAuth.scheme, 'bearer');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Idempotency-Key header parameter detection
// ---------------------------------------------------------------------------

test('deriveEndpointsFromSpec: detects Idempotency-Key header parameter as idempotencyProfile', () => {
  const spec = {
    openapi: '3.0.0',
    paths: {
      '/orders': {
        post: {
          operationId: 'createOrder',
          parameters: [
            { name: 'Idempotency-Key', in: 'header', schema: { type: 'string' } },
          ],
          responses: { '201': {} },
        },
      },
    },
  };
  const { endpoints } = deriveEndpointsFromSpec(spec, 'test.ts');
  const ep = endpoints.find((e) => e.path === '/orders' && e.method === 'POST');
  assert.ok(ep);
  assert.ok(ep.idempotencyProfile);
  assert.strictEqual(ep.idempotencyProfile.headerName, 'Idempotency-Key');
  assert.strictEqual(ep.idempotencyProfile.source, 'openapi-parameter');
});

test('deriveEndpointsFromSpec: idempotencyProfile null when no such parameter', () => {
  const spec = {
    openapi: '3.0.0',
    paths: {
      '/orders': {
        post: {
          operationId: 'createOrder',
          parameters: [
            { name: 'X-Request-Id', in: 'header', schema: { type: 'string' } },
          ],
          responses: { '201': {} },
        },
      },
    },
  };
  const { endpoints } = deriveEndpointsFromSpec(spec, 'test.ts');
  const ep = endpoints.find((e) => e.path === '/orders' && e.method === 'POST');
  assert.ok(ep);
  assert.strictEqual(ep.idempotencyProfile, null);
});

test('deriveEndpointsFromSpec: idempotencyProfile null when no parameters at all', () => {
  const spec = {
    openapi: '3.0.0',
    paths: {
      '/orders': {
        post: {
          operationId: 'createOrder',
          responses: { '201': {} },
        },
      },
    },
  };
  const { endpoints } = deriveEndpointsFromSpec(spec, 'test.ts');
  const ep = endpoints.find((e) => e.path === '/orders' && e.method === 'POST');
  assert.ok(ep);
  assert.strictEqual(ep.idempotencyProfile, null);
});

test('deriveEndpointsFromSpec: idempotencyProfile case-insensitive match preserves original name', () => {
  const spec = {
    openapi: '3.0.0',
    paths: {
      '/payments': {
        post: {
          operationId: 'createPayment',
          parameters: [
            { name: 'idempotency_key', in: 'header', schema: { type: 'string' } },
          ],
          responses: { '201': {} },
        },
      },
    },
  };
  const { endpoints } = deriveEndpointsFromSpec(spec, 'test.ts');
  const ep = endpoints.find((e) => e.path === '/payments' && e.method === 'POST');
  assert.ok(ep);
  assert.ok(ep.idempotencyProfile);
  assert.strictEqual(ep.idempotencyProfile.headerName, 'idempotency_key');
});

test('deriveEndpointsFromSpec: idempotencyProfile null for query parameters with same name', () => {
  const spec = {
    openapi: '3.0.0',
    paths: {
      '/orders': {
        post: {
          operationId: 'createOrder',
          parameters: [
            { name: 'Idempotency-Key', in: 'query', schema: { type: 'string' } },
          ],
          responses: { '201': {} },
        },
      },
    },
  };
  const { endpoints } = deriveEndpointsFromSpec(spec, 'test.ts');
  const ep = endpoints.find((e) => e.path === '/orders' && e.method === 'POST');
  assert.ok(ep);
  assert.strictEqual(ep.idempotencyProfile, null);
});

// ---------------------------------------------------------------------------
// swaggerDeclared.parameters: header parameter propagation (csrf, multi-tenant)
// ---------------------------------------------------------------------------

test('extractHeaderParameters: filters parameters to in:"header" only', () => {
  const op = {
    parameters: [
      { name: 'X-Tenant-ID', in: 'header', required: true },
      { name: 'X-CSRF-Token', in: 'header' },
      { name: 'cursor', in: 'query', required: false },
      { name: 'id', in: 'path', required: true },
    ],
  };
  const result = extractHeaderParameters(op);
  assert.deepStrictEqual(result, [
    { name: 'X-Tenant-ID', in: 'header', required: true },
    { name: 'X-CSRF-Token', in: 'header', required: false },
  ]);
});

test('extractHeaderParameters: returns empty array when op missing or parameters absent', () => {
  assert.deepStrictEqual(extractHeaderParameters(null), []);
  assert.deepStrictEqual(extractHeaderParameters({}), []);
  assert.deepStrictEqual(extractHeaderParameters({ parameters: null }), []);
  assert.deepStrictEqual(extractHeaderParameters({ parameters: 'not-array' }), []);
});

test('extractHeaderParameters: skips malformed entries', () => {
  const op = {
    parameters: [
      null,
      'string-not-object',
      { in: 'header' }, // missing name
      { name: '', in: 'header' }, // empty name
      { name: 'X-Valid', in: 'header' },
    ],
  };
  const result = extractHeaderParameters(op);
  assert.deepStrictEqual(result, [{ name: 'X-Valid', in: 'header', required: false }]);
});

test('deriveEndpointsFromSpec: swaggerDeclared.parameters carries declared header (X-Tenant-ID)', () => {
  const spec = {
    openapi: '3.0.0',
    paths: {
      '/orgs': {
        get: {
          operationId: 'listOrgs',
          parameters: [
            { name: 'X-Tenant-ID', in: 'header', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': {} },
        },
      },
    },
  };
  const { endpoints } = deriveEndpointsFromSpec(spec);
  const ep = endpoints.find((e) => e.path === '/orgs' && e.method === 'GET');
  assert.ok(ep);
  assert.ok(Array.isArray(ep.swaggerDeclared.parameters));
  assert.strictEqual(ep.swaggerDeclared.parameters.length, 1);
  assert.deepStrictEqual(ep.swaggerDeclared.parameters[0], {
    name: 'X-Tenant-ID', in: 'header', required: true,
  });
});

test('deriveEndpointsFromSpec: swaggerDeclared.parameters empty array when no headers declared', () => {
  const spec = {
    openapi: '3.0.0',
    paths: {
      '/ping': {
        get: {
          parameters: [
            { name: 'verbose', in: 'query', schema: { type: 'boolean' } },
          ],
          responses: { '200': {} },
        },
      },
    },
  };
  const { endpoints } = deriveEndpointsFromSpec(spec);
  const ep = endpoints[0];
  assert.deepStrictEqual(ep.swaggerDeclared.parameters, []);
});

// ---------------------------------------------------------------------------
// swaggerDeclared.extensions: vendor extension propagation (csrf, oauth, mt)
// ---------------------------------------------------------------------------

test('extractVendorExtensions: collects all x-* keys verbatim', () => {
  const op = {
    operationId: 'foo',
    tags: ['t'],
    'x-csrf-issues-token': true,
    'x-oauth-role': 'authorize',
    'x-multi-tenant': true,
    'x-custom-vendor': { nested: { value: 42 } },
    'not-extension': 'ignored',
  };
  const result = extractVendorExtensions(op);
  assert.deepStrictEqual(result, {
    'x-csrf-issues-token': true,
    'x-oauth-role': 'authorize',
    'x-multi-tenant': true,
    'x-custom-vendor': { nested: { value: 42 } },
  });
});

test('extractVendorExtensions: returns empty object when op missing or has no x-* keys', () => {
  assert.deepStrictEqual(extractVendorExtensions(null), {});
  assert.deepStrictEqual(extractVendorExtensions(undefined), {});
  assert.deepStrictEqual(extractVendorExtensions({}), {});
  assert.deepStrictEqual(extractVendorExtensions({ tags: ['x'], operationId: 'y' }), {});
});

test('deriveEndpointsFromSpec: swaggerDeclared.extensions carries x-csrf-issues-token', () => {
  const spec = {
    openapi: '3.0.0',
    paths: {
      '/auth/csrf': {
        get: {
          operationId: 'csrfToken',
          'x-csrf-issues-token': true,
          responses: { '200': {} },
        },
      },
    },
  };
  const { endpoints } = deriveEndpointsFromSpec(spec);
  const ep = endpoints.find((e) => e.path === '/auth/csrf');
  assert.ok(ep);
  assert.strictEqual(ep.swaggerDeclared.extensions['x-csrf-issues-token'], true);
});

test('deriveEndpointsFromSpec: swaggerDeclared.extensions carries x-oauth-role and x-multi-tenant', () => {
  const spec = {
    openapi: '3.0.0',
    paths: {
      '/oauth/authorize': {
        get: {
          'x-oauth-role': 'authorize',
          responses: { '302': {} },
        },
      },
      '/orgs/:id': {
        get: {
          'x-multi-tenant': true,
          responses: { '200': {} },
        },
      },
    },
  };
  const { endpoints } = deriveEndpointsFromSpec(spec);
  const oauthEp = endpoints.find((e) => e.path === '/oauth/authorize');
  assert.strictEqual(oauthEp.swaggerDeclared.extensions['x-oauth-role'], 'authorize');
  const tenantEp = endpoints.find((e) => e.path === '/orgs/:id');
  assert.strictEqual(tenantEp.swaggerDeclared.extensions['x-multi-tenant'], true);
});

test('deriveEndpointsFromSpec: swaggerDeclared.extensions is empty object when no x-* keys', () => {
  const spec = {
    openapi: '3.0.0',
    paths: {
      '/plain': {
        get: { tags: ['p'], responses: { '200': {} } },
      },
    },
  };
  const { endpoints } = deriveEndpointsFromSpec(spec);
  assert.deepStrictEqual(endpoints[0].swaggerDeclared.extensions, {});
});

// --- extractMultipartFields tests ---

test('extractMultipartFields: single binary file field', () => {
  const schema = {
    type: 'object',
    properties: {
      file: { type: 'string', format: 'binary' },
    },
  };
  const result = extractMultipartFields(schema);
  assert.deepStrictEqual(result, {
    fileFields: [{ name: 'file', array: false }],
    textFields: [],
  });
});

test('extractMultipartFields: array of binary files', () => {
  const schema = {
    type: 'object',
    properties: {
      files: { type: 'array', items: { type: 'string', format: 'binary' } },
    },
  };
  const result = extractMultipartFields(schema);
  assert.deepStrictEqual(result, {
    fileFields: [{ name: 'files', array: true }],
    textFields: [],
  });
});

test('extractMultipartFields: mixed file and text fields', () => {
  const schema = {
    type: 'object',
    properties: {
      file: { type: 'string', format: 'binary' },
      title: { type: 'string' },
      description: { type: 'string' },
    },
  };
  const result = extractMultipartFields(schema);
  assert.deepStrictEqual(result, {
    fileFields: [{ name: 'file', array: false }],
    textFields: ['title', 'description'],
  });
});

test('extractMultipartFields: multiple file fields (avatar + document)', () => {
  const schema = {
    type: 'object',
    properties: {
      avatar: { type: 'string', format: 'binary' },
      document: { type: 'string', format: 'binary' },
    },
  };
  const result = extractMultipartFields(schema);
  assert.deepStrictEqual(result, {
    fileFields: [
      { name: 'avatar', array: false },
      { name: 'document', array: false },
    ],
    textFields: [],
  });
});

test('extractMultipartFields: returns null for null/undefined/empty schema', () => {
  assert.strictEqual(extractMultipartFields(null), null);
  assert.strictEqual(extractMultipartFields(undefined), null);
  assert.strictEqual(extractMultipartFields({}), null);
  assert.strictEqual(extractMultipartFields({ properties: {} }), null);
});

test('extractMultipartFields: text-only schema returns only textFields', () => {
  const schema = {
    type: 'object',
    properties: {
      name: { type: 'string' },
      count: { type: 'integer' },
    },
  };
  const result = extractMultipartFields(schema);
  assert.deepStrictEqual(result, {
    fileFields: [],
    textFields: ['name', 'count'],
  });
});

test('deriveEndpointsFromSpec: multipartFields extracted from multipart/form-data schema', () => {
  const spec = {
    openapi: '3.0.0',
    paths: {
      '/upload': {
        post: {
          tags: ['files'],
          responses: { '201': {} },
          requestBody: {
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  properties: {
                    avatar: { type: 'string', format: 'binary' },
                    document: { type: 'string', format: 'binary' },
                    title: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
  };
  const { endpoints } = deriveEndpointsFromSpec(spec);
  assert.deepStrictEqual(endpoints[0].multipartFields, {
    fileFields: [
      { name: 'avatar', array: false },
      { name: 'document', array: false },
    ],
    textFields: ['title'],
  });
});

test('deriveEndpointsFromSpec: multipartFields undefined for JSON-only endpoint', () => {
  const spec = {
    openapi: '3.0.0',
    paths: {
      '/users': {
        post: {
          tags: ['users'],
          responses: { '201': {} },
          requestBody: {
            content: {
              'application/json': {
                schema: { type: 'object', properties: { name: { type: 'string' } } },
              },
            },
          },
        },
      },
    },
  };
  const { endpoints } = deriveEndpointsFromSpec(spec);
  assert.strictEqual(endpoints[0].multipartFields, undefined);
});

test('deriveEndpointsFromSpec: multipartFields resolves $ref schemas', () => {
  const spec = {
    openapi: '3.0.0',
    components: {
      schemas: {
        UploadDto: {
          type: 'object',
          properties: {
            file: { type: 'string', format: 'binary' },
            description: { type: 'string' },
          },
        },
      },
    },
    paths: {
      '/upload-ref': {
        post: {
          tags: ['files'],
          responses: { '201': {} },
          requestBody: {
            content: {
              'multipart/form-data': {
                schema: { $ref: '#/components/schemas/UploadDto' },
              },
            },
          },
        },
      },
    },
  };
  const { endpoints } = deriveEndpointsFromSpec(spec);
  assert.deepStrictEqual(endpoints[0].multipartFields, {
    fileFields: [{ name: 'file', array: false }],
    textFields: ['description'],
  });
});
