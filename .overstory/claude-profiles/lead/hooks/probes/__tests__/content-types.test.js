'use strict';

// Tests for content-type support: multipart uploads, binary downloads, SSE streaming.
// Run directly: `node --test __tests__/content-types.test.js`

const { describe, it } = require('node:test');
const assert = require('node:assert');

// ---------------------------------------------------------------------------
// lib/multipart.js
// ---------------------------------------------------------------------------

const {
  MAGIC_BYTES,
  generateSampleFile,
  buildFormData,
  buildOversizedFormData,
  buildWrongMimeFormData,
  mimeToExtension,
} = require('../lib/multipart');

describe('lib/multipart', () => {
  describe('generateSampleFile', () => {
    it('should generate PNG file with correct magic bytes', () => {
      const file = generateSampleFile('image/png', 128);
      assert.strictEqual(file.buffer.length, 128);
      assert.strictEqual(file.mimeType, 'image/png');
      assert.strictEqual(file.filename, 'probe-sample.png');
      assert.strictEqual(file.buffer[0], 0x89);
      assert.strictEqual(file.buffer[1], 0x50);
      assert.strictEqual(file.buffer[2], 0x4e);
      assert.strictEqual(file.buffer[3], 0x47);
    });

    it('should generate PDF file with correct magic bytes', () => {
      const file = generateSampleFile('application/pdf', 64);
      assert.strictEqual(file.buffer.length, 64);
      assert.strictEqual(file.mimeType, 'application/pdf');
      assert.strictEqual(file.filename, 'probe-sample.pdf');
      assert.strictEqual(file.buffer.slice(0, 5).toString(), '%PDF-');
    });

    it('should use PROBE magic for unknown MIME types', () => {
      const file = generateSampleFile('application/x-unknown', 32);
      assert.strictEqual(file.buffer.slice(0, 5).toString(), 'PROBE');
      assert.strictEqual(file.filename, 'probe-sample.bin');
    });

    it('should pad to exact requested size', () => {
      const file = generateSampleFile('image/png', 256);
      assert.strictEqual(file.buffer.length, 256);
    });

    it('should handle size smaller than magic bytes gracefully', () => {
      const file = generateSampleFile('image/png', 4);
      // Buffer.concat doesn't truncate; padLen clamps to 0, so magic length wins
      assert.strictEqual(file.buffer.length, 8);
    });
  });

  describe('buildFormData', () => {
    it('should create FormData with file field', () => {
      const file = generateSampleFile('image/png', 128);
      const form = buildFormData('avatar', file);
      assert.ok(form instanceof FormData);
      assert.ok(form.has('avatar'));
    });

    it('should include extra text fields', () => {
      const file = generateSampleFile('image/png', 64);
      const form = buildFormData('file', file, { description: 'test upload' });
      assert.strictEqual(form.get('description'), 'test upload');
    });
  });

  describe('buildOversizedFormData', () => {
    it('should create FormData with oversized file', () => {
      const form = buildOversizedFormData('file', 'image/png', 1024);
      assert.ok(form instanceof FormData);
      assert.ok(form.has('file'));
    });
  });

  describe('buildWrongMimeFormData', () => {
    it('should create FormData with specified MIME type', () => {
      const form = buildWrongMimeFormData('file', 'application/x-shockwave-flash');
      assert.ok(form instanceof FormData);
    });
  });

  describe('mimeToExtension', () => {
    it('should map known MIME types to extensions', () => {
      assert.strictEqual(mimeToExtension('image/png'), '.png');
      assert.strictEqual(mimeToExtension('image/jpeg'), '.jpg');
      assert.strictEqual(mimeToExtension('application/pdf'), '.pdf');
      assert.strictEqual(mimeToExtension('application/zip'), '.zip');
    });

    it('should return .bin for unknown MIME types', () => {
      assert.strictEqual(mimeToExtension('application/x-custom'), '.bin');
    });
  });

  describe('MAGIC_BYTES', () => {
    it('should have entries for common binary types', () => {
      assert.ok(MAGIC_BYTES['image/png']);
      assert.ok(MAGIC_BYTES['application/pdf']);
      assert.ok(MAGIC_BYTES['image/jpeg']);
      assert.ok(MAGIC_BYTES['application/zip']);
    });
  });
});

// ---------------------------------------------------------------------------
// lib/sse.js
// ---------------------------------------------------------------------------

const { parseSSEText, validateSSEEvent } = require('../lib/sse');

describe('lib/sse', () => {
  describe('parseSSEText', () => {
    it('should parse a single event', () => {
      const events = parseSSEText('data: hello\n\n');
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].data, 'hello');
    });

    it('should parse multiple events', () => {
      const events = parseSSEText('data: first\n\ndata: second\n\n');
      assert.strictEqual(events.length, 2);
      assert.strictEqual(events[0].data, 'first');
      assert.strictEqual(events[1].data, 'second');
    });

    it('should parse event with type and id', () => {
      const events = parseSSEText('event: update\nid: 42\ndata: payload\n\n');
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].event, 'update');
      assert.strictEqual(events[0].id, '42');
      assert.strictEqual(events[0].data, 'payload');
    });

    it('should handle multi-line data', () => {
      const events = parseSSEText('data: line1\ndata: line2\ndata: line3\n\n');
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].data, 'line1\nline2\nline3');
    });

    it('should ignore comment lines', () => {
      const events = parseSSEText(': this is a comment\ndata: hello\n\n');
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].data, 'hello');
    });

    it('should parse retry field', () => {
      const events = parseSSEText('retry: 5000\ndata: reconnect\n\n');
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].retry, 5000);
    });

    it('should handle trailing event without final blank line', () => {
      const events = parseSSEText('data: trailing');
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].data, 'trailing');
    });

    it('should return empty array for null/empty input', () => {
      assert.deepStrictEqual(parseSSEText(null), []);
      assert.deepStrictEqual(parseSSEText(''), []);
      assert.deepStrictEqual(parseSSEText(undefined), []);
    });

    it('should handle field with no value (no colon)', () => {
      const events = parseSSEText('data\n\n');
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].data, '');
    });

    it('should strip single leading space after colon', () => {
      const events = parseSSEText('data:  two spaces\n\n');
      assert.strictEqual(events[0].data, ' two spaces');
    });

    it('should ignore events without data field', () => {
      const events = parseSSEText('event: ping\n\ndata: real\n\n');
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].data, 'real');
    });

    it('should parse JSON data payloads', () => {
      const events = parseSSEText('data: {"count":1,"name":"test"}\n\n');
      assert.strictEqual(events.length, 1);
      const parsed = JSON.parse(events[0].data);
      assert.strictEqual(parsed.count, 1);
    });
  });

  describe('validateSSEEvent', () => {
    it('should validate a proper event', () => {
      const result = validateSSEEvent({ data: 'hello' });
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.issues.length, 0);
    });

    it('should flag missing data field', () => {
      const result = validateSSEEvent({});
      assert.strictEqual(result.valid, false);
      assert.ok(result.issues.length > 0);
    });

    it('should flag non-string data', () => {
      const result = validateSSEEvent({ data: 123 });
      assert.strictEqual(result.valid, false);
      assert.ok(result.issues.includes('data field is number, expected string'));
    });
  });
});

// ---------------------------------------------------------------------------
// detectors/nest-openapi.js — content type extraction
// ---------------------------------------------------------------------------

const { deriveEndpointsFromSpec, extractResponseContentTypes } = require('../detectors/nest-openapi');

describe('detectors/nest-openapi content types', () => {
  describe('extractResponseContentTypes', () => {
    it('should extract content types from 2xx responses', () => {
      const responses = {
        '200': { content: { 'application/json': {}, 'text/html': {} } },
        '400': { content: { 'application/json': {} } },
      };
      const types = extractResponseContentTypes(responses);
      assert.ok(types.includes('application/json'));
      assert.ok(types.includes('text/html'));
      assert.strictEqual(types.length, 2);
    });

    it('should ignore non-2xx responses', () => {
      const responses = {
        '400': { content: { 'application/json': {} } },
        '500': { content: { 'text/plain': {} } },
      };
      const types = extractResponseContentTypes(responses);
      assert.strictEqual(types.length, 0);
    });

    it('should return empty array for no content types', () => {
      const types = extractResponseContentTypes({ '200': { description: 'No content' } });
      assert.strictEqual(types.length, 0);
    });

    it('should deduplicate across multiple 2xx statuses', () => {
      const responses = {
        '200': { content: { 'application/json': {} } },
        '201': { content: { 'application/json': {} } },
      };
      const types = extractResponseContentTypes(responses);
      assert.strictEqual(types.length, 1);
      assert.strictEqual(types[0], 'application/json');
    });
  });

  describe('deriveEndpointsFromSpec with content types', () => {
    it('should detect multipart/form-data in requestContentTypes', () => {
      const spec = {
        paths: {
          '/upload': {
            post: {
              requestBody: { content: { 'multipart/form-data': { schema: { type: 'object' } } } },
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      };
      const result = deriveEndpointsFromSpec(spec);
      assert.ok(result.endpoints[0].requestContentTypes.includes('multipart/form-data'));
    });

    it('should detect binary response content types', () => {
      const spec = {
        paths: {
          '/download': {
            get: {
              responses: {
                '200': { content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } } },
              },
            },
          },
        },
      };
      const result = deriveEndpointsFromSpec(spec);
      assert.ok(result.endpoints[0].responseContentTypes.includes('application/pdf'));
    });

    it('should detect SSE content type in response', () => {
      const spec = {
        paths: {
          '/events': {
            get: {
              responses: {
                '200': { content: { 'text/event-stream': { schema: { type: 'string' } } } },
              },
            },
          },
        },
      };
      const result = deriveEndpointsFromSpec(spec);
      assert.ok(result.endpoints[0].responseContentTypes.includes('text/event-stream'));
    });

    it('should not set requestContentTypes when no requestBody', () => {
      const spec = {
        paths: { '/simple': { get: { responses: { '200': { description: 'OK' } } } } },
      };
      const result = deriveEndpointsFromSpec(spec);
      assert.strictEqual(result.endpoints[0].requestContentTypes, undefined);
    });

    it('should detect multiple request content types', () => {
      const spec = {
        paths: {
          '/multi': {
            post: {
              requestBody: {
                content: {
                  'application/json': { schema: { type: 'object' } },
                  'multipart/form-data': { schema: { type: 'object' } },
                },
              },
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      };
      const result = deriveEndpointsFromSpec(spec);
      const ct = result.endpoints[0].requestContentTypes;
      assert.ok(ct.includes('application/json'));
      assert.ok(ct.includes('multipart/form-data'));
      assert.strictEqual(ct.length, 2);
    });
  });
});

// ---------------------------------------------------------------------------
// flows-generator.js — content-type flow emitters
// ---------------------------------------------------------------------------

const {
  emitUploadFlows,
  emitHappyFlow,
  emitInvalidatorFlows,
  emitDownloadFlows,
  emitStreamingFlows,
  emitContentTypeFlows,
  isMultipartEndpoint,
  isBinaryUploadEndpoint,
  isBinaryDownloadEndpoint,
  isSSEEndpoint,
  emitContentTypeDiagnostics,
  emitWsDiagnostics,
} = require('../flows-generator');

describe('flows-generator content-type detection helpers', () => {
  it('isMultipartEndpoint returns true for multipart/form-data', () => {
    assert.strictEqual(isMultipartEndpoint({ requestContentTypes: ['multipart/form-data'] }), true);
    assert.strictEqual(isMultipartEndpoint({ requestContentTypes: ['application/json'] }), false);
    assert.strictEqual(isMultipartEndpoint({}), false);
  });

  it('isBinaryUploadEndpoint returns true for application/octet-stream', () => {
    assert.strictEqual(isBinaryUploadEndpoint({ requestContentTypes: ['application/octet-stream'] }), true);
    assert.strictEqual(isBinaryUploadEndpoint({ requestContentTypes: ['application/json'] }), false);
  });

  it('isBinaryDownloadEndpoint returns true for binary response types', () => {
    assert.strictEqual(isBinaryDownloadEndpoint({ responseContentTypes: ['application/pdf'] }), true);
    assert.strictEqual(isBinaryDownloadEndpoint({ responseContentTypes: ['image/png'] }), true);
    assert.strictEqual(isBinaryDownloadEndpoint({ responseContentTypes: ['application/octet-stream'] }), true);
    assert.strictEqual(isBinaryDownloadEndpoint({ responseContentTypes: ['application/json'] }), false);
    assert.strictEqual(isBinaryDownloadEndpoint({}), false);
  });

  it('isSSEEndpoint returns true for text/event-stream', () => {
    assert.strictEqual(isSSEEndpoint({ responseContentTypes: ['text/event-stream'] }), true);
    assert.strictEqual(isSSEEndpoint({ responseContentTypes: ['application/json'] }), false);
    assert.strictEqual(isSSEEndpoint({}), false);
  });
});

describe('flows-generator emitUploadFlows', () => {
  const baseEp = {
    method: 'POST',
    path: '/api/upload',
    file: 'upload.controller.ts',
    requestContentTypes: ['multipart/form-data'],
    authDecorators: { authRequired: false },
    swaggerDeclared: { statuses: [201, 413, 415] },
    multipartFields: {
      fileFields: [{ name: 'file', array: false }],
      textFields: [],
    },
  };

  it('should emit happy upload flow for multipart endpoint', () => {
    const flows = emitUploadFlows(baseEp);
    const happy = flows.find((f) => f.id.includes('upload-happy'));
    assert.ok(happy);
    assert.strictEqual(happy.contract.kind, 'upload-happy');
    const uploadStep = happy.steps.find((s) => s.kind === 'api-upload');
    assert.strictEqual(uploadStep.uploadType, 'multipart');
    assert.strictEqual(uploadStep.mimeType, 'image/png');
  });

  it('should emit oversize flow when 413 is declared', () => {
    const flows = emitUploadFlows(baseEp);
    const oversize = flows.find((f) => f.id.includes('upload-oversize'));
    assert.ok(oversize);
    assert.strictEqual(oversize.contract.kind, 'upload-oversize');
    const expectStep = oversize.steps.find((s) => s.kind === 'expect');
    assert.strictEqual(expectStep.status, 413);
  });

  it('should emit wrong-mime flow when 415 is declared', () => {
    const flows = emitUploadFlows(baseEp);
    const wrongMime = flows.find((f) => f.id.includes('upload-wrong-mime'));
    assert.ok(wrongMime);
    const expectStep = wrongMime.steps.find((s) => s.kind === 'expect');
    assert.strictEqual(expectStep.status, 415);
  });

  it('should skip oversize/wrong-mime when statuses not declared', () => {
    const ep = { ...baseEp, swaggerDeclared: { statuses: [201] } };
    const flows = emitUploadFlows(ep);
    assert.strictEqual(flows.length, 1);
    assert.ok(flows[0].id.includes('upload-happy'));
  });

  it('should return empty for non-multipart endpoint', () => {
    const ep = { ...baseEp, requestContentTypes: ['application/json'] };
    assert.deepStrictEqual(emitUploadFlows(ep), []);
  });

  it('should emit binary upload for octet-stream', () => {
    const ep = { ...baseEp, requestContentTypes: ['application/octet-stream'] };
    const flows = emitUploadFlows(ep);
    const happy = flows.find((f) => f.id.includes('upload-happy'));
    const uploadStep = happy.steps.find((s) => s.kind === 'api-upload');
    assert.strictEqual(uploadStep.uploadType, 'binary');
  });

  it('should prepend setAuth for authenticated endpoints', () => {
    const ep = { ...baseEp, authDecorators: { authRequired: true } };
    const flows = emitUploadFlows(ep, { authBootstrapAvailable: true });
    const happy = flows.find((f) => f.id.includes('upload-happy'));
    assert.strictEqual(happy.steps[0].kind, 'setAuth');
    assert.ok(happy.dependsOn.includes('chain:auth-bootstrap'));
  });
});

describe('flows-generator emitDownloadFlows', () => {
  const baseEp = {
    method: 'GET',
    path: '/api/download/pdf',
    file: 'download.controller.ts',
    responseContentTypes: ['application/pdf'],
    authDecorators: { authRequired: false },
    swaggerDeclared: { statuses: [200] },
  };

  it('should emit download flow for binary endpoint', () => {
    const flows = emitDownloadFlows(baseEp);
    assert.strictEqual(flows.length, 1);
    assert.strictEqual(flows[0].contract.kind, 'download-binary');
    const downloadStep = flows[0].steps.find((s) => s.kind === 'api-download');
    assert.strictEqual(downloadStep.expectedContentType, 'application/pdf');
  });

  it('should emit expect step with expectBinary', () => {
    const flows = emitDownloadFlows(baseEp);
    const expectStep = flows[0].steps.find((s) => s.kind === 'expect');
    assert.strictEqual(expectStep.expectBinary, true);
    assert.strictEqual(expectStep.expectedContentType, 'application/pdf');
  });

  it('should return empty for non-binary endpoint', () => {
    const ep = { ...baseEp, responseContentTypes: ['application/json'] };
    assert.deepStrictEqual(emitDownloadFlows(ep), []);
  });

  it('should detect image/* endpoints', () => {
    const ep = { ...baseEp, responseContentTypes: ['image/png'] };
    const flows = emitDownloadFlows(ep);
    assert.strictEqual(flows.length, 1);
    const dl = flows[0].steps.find((s) => s.kind === 'api-download');
    assert.strictEqual(dl.expectedContentType, 'image/png');
  });
});

describe('flows-generator emitStreamingFlows', () => {
  const baseEp = {
    method: 'GET',
    path: '/api/events/stream',
    file: 'events.controller.ts',
    responseContentTypes: ['text/event-stream'],
    authDecorators: { authRequired: false },
    swaggerDeclared: { statuses: [200] },
  };

  it('should emit SSE stream flow', () => {
    const flows = emitStreamingFlows(baseEp);
    assert.strictEqual(flows.length, 1);
    assert.strictEqual(flows[0].contract.kind, 'sse-stream');
    const streamStep = flows[0].steps.find((s) => s.kind === 'api-stream');
    assert.strictEqual(streamStep.maxEvents, 3);
    assert.strictEqual(streamStep.timeoutMs, 5000);
  });

  // maxEvents must scale with the count of declared event names. Otherwise
  // an endpoint declaring N named events (e.g. ['progress','complete'])
  // could be sampled with maxEvents=3 and miss any name that arrives later
  // in the stream. Derivation is declaration-driven (length of the
  // x-sse-event-names extension), not a heuristic.
  it('scales maxEvents with declared event-name count (2 names → 10)', () => {
    const ep = {
      ...baseEp,
      swaggerDeclared: {
        statuses: [200],
        extensions: { 'x-sse-event-names': ['progress', 'complete'] },
      },
    };
    const flows = emitStreamingFlows(ep);
    const streamStep = flows[0].steps.find((s) => s.kind === 'api-stream');
    // max(3, 2 * 5) = 10
    assert.strictEqual(streamStep.maxEvents, 10);
  });

  it('scales maxEvents for 3 declared names (3 → 15)', () => {
    const ep = {
      ...baseEp,
      swaggerDeclared: {
        statuses: [200],
        extensions: { 'x-sse-event-names': ['a', 'b', 'c'] },
      },
    };
    const flows = emitStreamingFlows(ep);
    const streamStep = flows[0].steps.find((s) => s.kind === 'api-stream');
    // max(3, 3 * 5) = 15
    assert.strictEqual(streamStep.maxEvents, 15);
  });

  it('keeps maxEvents floor of 3 when no event names declared', () => {
    // No x-sse-event-names extension → declaredNamesCount = 0 →
    // sampleCount = 3 (floor preserves prior behavior).
    const flows = emitStreamingFlows(baseEp);
    const streamStep = flows[0].steps.find((s) => s.kind === 'api-stream');
    assert.strictEqual(streamStep.maxEvents, 3);
  });

  it('keeps floor of 3 when only 1 name declared (1 * 5 = 5 > 3, but covers single-event case)', () => {
    const ep = {
      ...baseEp,
      swaggerDeclared: {
        statuses: [200],
        extensions: { 'x-sse-event-names': ['ping'] },
      },
    };
    const flows = emitStreamingFlows(ep);
    const streamStep = flows[0].steps.find((s) => s.kind === 'api-stream');
    // max(3, 1 * 5) = 5
    assert.strictEqual(streamStep.maxEvents, 5);
  });

  it('should emit expect step with expectSSE', () => {
    const flows = emitStreamingFlows(baseEp);
    const expectStep = flows[0].steps.find((s) => s.kind === 'expect');
    assert.strictEqual(expectStep.expectSSE, true);
    assert.strictEqual(expectStep.minEvents, 1);
  });

  it('should return empty for non-SSE endpoint', () => {
    const ep = { ...baseEp, responseContentTypes: ['application/json'] };
    assert.deepStrictEqual(emitStreamingFlows(ep), []);
  });
});

describe('flows-generator emitContentTypeFlows', () => {
  it('should aggregate flows from all content-type emitters', () => {
    const endpoints = [
      {
        method: 'POST', path: '/upload', file: 'a.ts',
        requestContentTypes: ['multipart/form-data'],
        authDecorators: { authRequired: false },
        swaggerDeclared: { statuses: [201] },
        multipartFields: { fileFields: [{ name: 'file', array: false }], textFields: [] },
      },
      {
        method: 'GET', path: '/download', file: 'b.ts',
        responseContentTypes: ['application/pdf'],
        authDecorators: { authRequired: false },
        swaggerDeclared: { statuses: [200] },
      },
      {
        method: 'GET', path: '/events', file: 'c.ts',
        responseContentTypes: ['text/event-stream'],
        authDecorators: { authRequired: false },
        swaggerDeclared: { statuses: [200] },
      },
    ];
    const flows = emitContentTypeFlows(endpoints);
    assert.strictEqual(flows.length, 3);
    const kinds = flows.map((f) => f.contract.kind);
    assert.ok(kinds.includes('upload-happy'));
    assert.ok(kinds.includes('download-binary'));
    assert.ok(kinds.includes('sse-stream'));
  });

  it('should return empty for JSON-only endpoints', () => {
    const endpoints = [{
      method: 'GET', path: '/api/items', file: 'd.ts',
      authDecorators: { authRequired: false },
      swaggerDeclared: { statuses: [200] },
    }];
    assert.deepStrictEqual(emitContentTypeFlows(endpoints), []);
  });
});

describe('emitHappyFlow multipart guard', () => {
  it('should return null for multipart-only endpoints', () => {
    const ep = {
      method: 'POST', path: '/api/upload-image', file: 'upload.controller.ts',
      requestContentTypes: ['multipart/form-data'],
      authDecorators: { authRequired: false },
      swaggerDeclared: { statuses: [201, 413, 415] },
    };
    const result = emitHappyFlow(ep);
    assert.strictEqual(result, null, 'emitHappyFlow should skip multipart-only endpoints');
  });

  it('should return null for octet-stream-only endpoints', () => {
    const ep = {
      method: 'POST', path: '/api/upload-octet', file: 'upload.controller.ts',
      requestContentTypes: ['application/octet-stream'],
      authDecorators: { authRequired: false },
      swaggerDeclared: { statuses: [201] },
    };
    const result = emitHappyFlow(ep);
    assert.strictEqual(result, null, 'emitHappyFlow should skip octet-stream-only endpoints');
  });

  it('should still emit happy flow for endpoints that also accept JSON', () => {
    const ep = {
      method: 'POST', path: '/api/upload-mixed', file: 'upload.controller.ts',
      requestContentTypes: ['multipart/form-data', 'application/json'],
      authDecorators: { authRequired: false },
      swaggerDeclared: { statuses: [201] },
    };
    const result = emitHappyFlow(ep);
    assert.ok(result, 'emitHappyFlow should emit for endpoints that also accept JSON');
  });
});

describe('emitInvalidatorFlows multipart guard', () => {
  it('should return empty for multipart-only endpoints even with zodContract', () => {
    const ep = {
      method: 'POST', path: '/api/upload-image', file: 'upload.controller.ts',
      requestContentTypes: ['multipart/form-data'],
      authDecorators: { authRequired: false },
      swaggerDeclared: { statuses: [201, 413, 415] },
      zodContract: { fields: [{ name: 'file', type: 'string', constraints: {} }] },
    };
    const result = emitInvalidatorFlows(ep);
    assert.deepStrictEqual(result, [], 'emitInvalidatorFlows should skip multipart-only endpoints');
  });

  it('should still emit invalidator flows for JSON endpoints', () => {
    const ep = {
      method: 'POST', path: '/api/items', file: 'items.controller.ts',
      requestContentTypes: ['application/json'],
      authDecorators: { authRequired: false },
      swaggerDeclared: { statuses: [201, 400] },
      zodContract: { fields: [{ name: 'title', type: 'string', constraints: { minLength: 1 } }] },
    };
    const result = emitInvalidatorFlows(ep);
    assert.ok(result.length > 0, 'emitInvalidatorFlows should emit for JSON endpoints');
  });
});

describe('emitUploadFlows wrong-mime step', () => {
  it('should use kind api with text/plain header for wrong-mime flow', () => {
    const ep = {
      method: 'POST', path: '/api/upload-image', file: 'upload.controller.ts',
      requestContentTypes: ['multipart/form-data'],
      authDecorators: { authRequired: false },
      swaggerDeclared: { statuses: [201, 413, 415] },
      multipartFields: { fileFields: [{ name: 'image', array: false }], textFields: [] },
    };
    const flows = emitUploadFlows(ep);
    const wrongMime = flows.find((f) => f.id.includes('upload-wrong-mime'));
    assert.ok(wrongMime, 'wrong-mime flow should exist');
    const apiStep = wrongMime.steps.find((s) => s.kind === 'api');
    assert.ok(apiStep, 'wrong-mime step should use kind api (not api-upload)');
    assert.strictEqual(apiStep.headers['content-type'], 'text/plain');
    assert.strictEqual(apiStep.body, 'wrong-mime-probe-payload');
    assert.strictEqual(apiStep.rawBody, undefined, 'should not have rawBody field');
  });
});

// --- emitUploadFlows multipartFields tests ---

describe('emitUploadFlows multipartFields', () => {
  it('should use fieldName from multipartFields when available', () => {
    const ep = {
      method: 'POST',
      path: '/api/avatar',
      file: 'src/avatar.ts',
      requestContentTypes: ['multipart/form-data'],
      authDecorators: { authRequired: false },
      swaggerDeclared: { statuses: [201] },
      multipartFields: {
        fileFields: [{ name: 'avatar', array: false }],
        textFields: [],
      },
    };
    const flows = emitUploadFlows(ep);
    const happy = flows.find((f) => f.id.includes('upload-happy'));
    assert.ok(happy);
    const uploadStep = happy.steps.find((s) => s.kind === 'api-upload');
    assert.strictEqual(uploadStep.fieldName, 'avatar');
  });

  it('should return empty flows when multipart but no schema declares file fields', () => {
    const ep = {
      method: 'POST',
      path: '/api/upload',
      file: 'src/upload.ts',
      requestContentTypes: ['multipart/form-data'],
      authDecorators: { authRequired: false },
      swaggerDeclared: { statuses: [201] },
    };
    const flows = emitUploadFlows(ep);
    assert.strictEqual(flows.length, 0, 'must not emit upload flows without declared file fields — DIAG covers this');
  });

  it('should return empty flows when multipartFields has zero fileFields', () => {
    const ep = {
      method: 'POST',
      path: '/api/upload',
      file: 'src/upload.ts',
      requestContentTypes: ['multipart/form-data'],
      authDecorators: { authRequired: false },
      swaggerDeclared: { statuses: [201] },
      multipartFields: { fileFields: [], textFields: ['description'] },
    };
    const flows = emitUploadFlows(ep);
    assert.strictEqual(flows.length, 0, 'must not emit upload flows when no binary file fields declared');
  });

  it('should set fileCount for array file fields', () => {
    const ep = {
      method: 'POST',
      path: '/api/multi',
      file: 'src/multi.ts',
      requestContentTypes: ['multipart/form-data'],
      authDecorators: { authRequired: false },
      swaggerDeclared: { statuses: [201] },
      multipartFields: {
        fileFields: [{ name: 'files', array: true }],
        textFields: [],
      },
    };
    const flows = emitUploadFlows(ep);
    const happy = flows.find((f) => f.id.includes('upload-happy'));
    const uploadStep = happy.steps.find((s) => s.kind === 'api-upload');
    assert.strictEqual(uploadStep.fieldName, 'files');
    assert.strictEqual(uploadStep.fileCount, 2);
  });

  it('should include additionalFileFields for multi-field uploads', () => {
    const ep = {
      method: 'POST',
      path: '/api/docs',
      file: 'src/docs.ts',
      requestContentTypes: ['multipart/form-data'],
      authDecorators: { authRequired: false },
      swaggerDeclared: { statuses: [201] },
      multipartFields: {
        fileFields: [
          { name: 'avatar', array: false },
          { name: 'document', array: false },
        ],
        textFields: [],
      },
    };
    const flows = emitUploadFlows(ep);
    const happy = flows.find((f) => f.id.includes('upload-happy'));
    const uploadStep = happy.steps.find((s) => s.kind === 'api-upload');
    assert.strictEqual(uploadStep.fieldName, 'avatar');
    assert.ok(Array.isArray(uploadStep.additionalFileFields));
    assert.strictEqual(uploadStep.additionalFileFields.length, 1);
    assert.strictEqual(uploadStep.additionalFileFields[0].name, 'document');
  });

  it('should include extraFields for text metadata fields', () => {
    const ep = {
      method: 'POST',
      path: '/api/mixed',
      file: 'src/mixed.ts',
      requestContentTypes: ['multipart/form-data'],
      authDecorators: { authRequired: false },
      swaggerDeclared: { statuses: [201] },
      multipartFields: {
        fileFields: [{ name: 'file', array: false }],
        textFields: ['title', 'description'],
      },
    };
    const flows = emitUploadFlows(ep);
    const happy = flows.find((f) => f.id.includes('upload-happy'));
    const uploadStep = happy.steps.find((s) => s.kind === 'api-upload');
    assert.strictEqual(uploadStep.fieldName, 'file');
    assert.deepStrictEqual(uploadStep.extraFields, {
      title: 'probe-title',
      description: 'probe-description',
    });
  });

  it('should use correct fieldName in 413 oversize flow', () => {
    const ep = {
      method: 'POST',
      path: '/api/sized',
      file: 'src/sized.ts',
      requestContentTypes: ['multipart/form-data'],
      authDecorators: { authRequired: false },
      swaggerDeclared: { statuses: [201, 413] },
      multipartFields: {
        fileFields: [{ name: 'avatar', array: false }],
        textFields: [],
      },
    };
    const flows = emitUploadFlows(ep);
    const oversize = flows.find((f) => f.id.includes('upload-oversize'));
    assert.ok(oversize);
    const uploadStep = oversize.steps.find((s) => s.kind === 'api-upload');
    assert.strictEqual(uploadStep.fieldName, 'avatar');
  });
});

// --- emitStreamingFlows SSE extension tests ---

describe('emitStreamingFlows SSE extensions', () => {
  it('should include expectEventNames from x-sse-event-names', () => {
    const ep = {
      method: 'GET',
      path: '/api/events',
      file: 'src/events.ts',
      responseContentTypes: ['text/event-stream'],
      authDecorators: { authRequired: false },
      swaggerDeclared: {
        statuses: [200],
        extensions: { 'x-sse-event-names': ['progress', 'complete'] },
      },
    };
    const flows = emitStreamingFlows(ep);
    const expectStep = flows[0].steps.find((s) => s.kind === 'expect');
    assert.deepStrictEqual(expectStep.expectEventNames, ['progress', 'complete']);
  });

  it('should include expectRetry from x-sse-retry', () => {
    const ep = {
      method: 'GET',
      path: '/api/retry',
      file: 'src/retry.ts',
      responseContentTypes: ['text/event-stream'],
      authDecorators: { authRequired: false },
      swaggerDeclared: {
        statuses: [200],
        extensions: { 'x-sse-retry': 3000 },
      },
    };
    const flows = emitStreamingFlows(ep);
    const expectStep = flows[0].steps.find((s) => s.kind === 'expect');
    assert.strictEqual(expectStep.expectRetry, 3000);
  });

  it('should include expectId from x-sse-id-required', () => {
    const ep = {
      method: 'GET',
      path: '/api/ids',
      file: 'src/ids.ts',
      responseContentTypes: ['text/event-stream'],
      authDecorators: { authRequired: false },
      swaggerDeclared: {
        statuses: [200],
        extensions: { 'x-sse-id-required': true },
      },
    };
    const flows = emitStreamingFlows(ep);
    const expectStep = flows[0].steps.find((s) => s.kind === 'expect');
    assert.strictEqual(expectStep.expectId, true);
  });

  it('should include expectHeartbeat from x-sse-heartbeat', () => {
    const ep = {
      method: 'GET',
      path: '/api/hb',
      file: 'src/hb.ts',
      responseContentTypes: ['text/event-stream'],
      authDecorators: { authRequired: false },
      swaggerDeclared: {
        statuses: [200],
        extensions: { 'x-sse-heartbeat': true },
      },
    };
    const flows = emitStreamingFlows(ep);
    const expectStep = flows[0].steps.find((s) => s.kind === 'expect');
    assert.strictEqual(expectStep.expectHeartbeat, true);
  });

  it('should not include SSE extensions when none declared', () => {
    const ep = {
      method: 'GET',
      path: '/api/plain-sse',
      file: 'src/plain.ts',
      responseContentTypes: ['text/event-stream'],
      authDecorators: { authRequired: false },
      swaggerDeclared: { statuses: [200], extensions: {} },
    };
    const flows = emitStreamingFlows(ep);
    const expectStep = flows[0].steps.find((s) => s.kind === 'expect');
    assert.strictEqual(expectStep.expectEventNames, undefined);
    assert.strictEqual(expectStep.expectRetry, undefined);
    assert.strictEqual(expectStep.expectId, undefined);
    assert.strictEqual(expectStep.expectHeartbeat, undefined);
  });
});

// --- emitDownloadFlows Content-Disposition tests ---

describe('emitDownloadFlows Content-Disposition', () => {
  it('should include expectContentDisposition from x-content-disposition', () => {
    const ep = {
      method: 'GET',
      path: '/api/dl',
      file: 'src/dl.ts',
      responseContentTypes: ['application/pdf'],
      authDecorators: { authRequired: false },
      swaggerDeclared: {
        statuses: [200],
        extensions: { 'x-content-disposition': 'attachment; filename="report.pdf"' },
      },
    };
    const flows = emitDownloadFlows(ep);
    const expectStep = flows[0].steps.find((s) => s.kind === 'expect');
    assert.strictEqual(expectStep.expectContentDisposition, 'attachment; filename="report.pdf"');
  });

  it('should not include expectContentDisposition when not declared', () => {
    const ep = {
      method: 'GET',
      path: '/api/dl2',
      file: 'src/dl2.ts',
      responseContentTypes: ['application/pdf'],
      authDecorators: { authRequired: false },
      swaggerDeclared: { statuses: [200], extensions: {} },
    };
    const flows = emitDownloadFlows(ep);
    const expectStep = flows[0].steps.find((s) => s.kind === 'expect');
    assert.strictEqual(expectStep.expectContentDisposition, undefined);
  });
});

// --- emitContentTypeDiagnostics tests ---

describe('emitContentTypeDiagnostics', () => {
  it('should emit MULTIPART_NO_INTERCEPTOR when multipart but no file fields', () => {
    const endpoints = [{
      method: 'POST',
      path: '/api/upload',
      requestContentTypes: ['multipart/form-data'],
      multipartFields: null,
      swaggerDeclared: { statuses: [201], extensions: {} },
    }];
    const diags = emitContentTypeDiagnostics(endpoints);
    assert.strictEqual(diags.length, 1);
    assert.strictEqual(diags[0].code, 'MULTIPART_NO_INTERCEPTOR');
  });

  it('should emit MULTIPART_NO_INTERCEPTOR when multipart but only text fields', () => {
    const endpoints = [{
      method: 'POST',
      path: '/api/upload',
      requestContentTypes: ['multipart/form-data'],
      multipartFields: { fileFields: [], textFields: ['name'] },
      swaggerDeclared: { statuses: [201], extensions: {} },
    }];
    const diags = emitContentTypeDiagnostics(endpoints);
    assert.strictEqual(diags.length, 1);
    assert.strictEqual(diags[0].code, 'MULTIPART_NO_INTERCEPTOR');
  });

  it('should not emit MULTIPART_NO_INTERCEPTOR when file fields present', () => {
    const endpoints = [{
      method: 'POST',
      path: '/api/upload',
      requestContentTypes: ['multipart/form-data'],
      multipartFields: { fileFields: [{ name: 'file', array: false }], textFields: [] },
      swaggerDeclared: { statuses: [201], extensions: {} },
    }];
    const diags = emitContentTypeDiagnostics(endpoints);
    assert.strictEqual(diags.filter((d) => d.code === 'MULTIPART_NO_INTERCEPTOR').length, 0);
  });

  it('should emit SSE_NO_DECORATOR when SSE without x-sse-* extensions', () => {
    const endpoints = [{
      method: 'GET',
      path: '/api/stream',
      responseContentTypes: ['text/event-stream'],
      swaggerDeclared: { statuses: [200], extensions: {} },
    }];
    const diags = emitContentTypeDiagnostics(endpoints);
    assert.strictEqual(diags.length, 1);
    assert.strictEqual(diags[0].code, 'SSE_NO_DECORATOR');
  });

  it('should not emit SSE_NO_DECORATOR when x-sse-event-names present', () => {
    const endpoints = [{
      method: 'GET',
      path: '/api/stream',
      responseContentTypes: ['text/event-stream'],
      swaggerDeclared: { statuses: [200], extensions: { 'x-sse-event-names': ['msg'] } },
    }];
    const diags = emitContentTypeDiagnostics(endpoints);
    assert.strictEqual(diags.filter((d) => d.code === 'SSE_NO_DECORATOR').length, 0);
  });

  it('should not emit SSE_NO_DECORATOR when x-sse-multiline present', () => {
    const endpoints = [{
      method: 'GET',
      path: '/api/stream/multiline',
      responseContentTypes: ['text/event-stream'],
      swaggerDeclared: { statuses: [200], extensions: { 'x-sse-multiline': true } },
    }];
    const diags = emitContentTypeDiagnostics(endpoints);
    assert.strictEqual(diags.filter((d) => d.code === 'SSE_NO_DECORATOR').length, 0);
  });

  it('should return empty for non-multipart non-SSE endpoints', () => {
    const endpoints = [{
      method: 'GET',
      path: '/api/json',
      requestContentTypes: ['application/json'],
      responseContentTypes: ['application/json'],
      swaggerDeclared: { statuses: [200], extensions: {} },
    }];
    const diags = emitContentTypeDiagnostics(endpoints);
    assert.strictEqual(diags.length, 0);
  });
});

// --- emitWsDiagnostics tests ---

describe('emitWsDiagnostics', () => {
  it('should emit WS_NAMESPACE_AMBIGUOUS for duplicate paths', () => {
    const gateways = [
      { path: '/ws', file: 'a.ts', events: [] },
      { path: '/ws', file: 'b.ts', events: [] },
    ];
    const diags = emitWsDiagnostics(gateways);
    assert.strictEqual(diags.length, 1);
    assert.strictEqual(diags[0].code, 'WS_NAMESPACE_AMBIGUOUS');
    assert.ok(diags[0].message.includes('2 gateways'));
  });

  it('should not emit for unique paths', () => {
    const gateways = [
      { path: '/ws', file: 'a.ts', events: [] },
      { path: '/chat', file: 'b.ts', events: [] },
    ];
    const diags = emitWsDiagnostics(gateways);
    assert.strictEqual(diags.length, 0);
  });

  it('should handle empty gateway list', () => {
    assert.strictEqual(emitWsDiagnostics([]).length, 0);
  });
});
