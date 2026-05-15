'use strict';

// Unit tests for resource-graph.js — focused on the
// `flows.config.json` -> `resourceGraph.ignoreModels` mechanism that
// suppresses `RESOURCE_GRAPH_NO_CREATE_ENDPOINT` for Prisma models that
// intentionally have no controller (e.g. the boilerplate's
// `BoilerplatePlaceholder`).
//
// Run directly: `node --test __tests__/resource-graph.test.js`

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { buildResourceGraph, loadIgnoredModels } = require('../resource-graph');

function mkTmpProject(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'resource-graph-test-'));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  return root;
}

test('loadIgnoredModels: returns [] when flows.config.json is missing', () => {
  const root = mkTmpProject({ 'README.md': '# nothing' });
  assert.deepStrictEqual(loadIgnoredModels(root), []);
});

test('loadIgnoredModels: returns the configured list', () => {
  const root = mkTmpProject({
    'flows.config.json': JSON.stringify({
      resourceGraph: { ignoreModels: ['BoilerplatePlaceholder', 'AuditLog'] },
    }),
  });
  assert.deepStrictEqual(loadIgnoredModels(root).sort(), ['AuditLog', 'BoilerplatePlaceholder']);
});

test('loadIgnoredModels: tolerates missing resourceGraph block', () => {
  const root = mkTmpProject({
    'flows.config.json': JSON.stringify({ apiBaseUrl: 'http://localhost:3001' }),
  });
  assert.deepStrictEqual(loadIgnoredModels(root), []);
});

test('loadIgnoredModels: drops non-string entries silently', () => {
  const root = mkTmpProject({
    'flows.config.json': JSON.stringify({
      resourceGraph: { ignoreModels: ['Real', 42, null, { foo: 'bar' }] },
    }),
  });
  assert.deepStrictEqual(loadIgnoredModels(root), ['Real']);
});

test('loadIgnoredModels: returns [] on malformed JSON', () => {
  const root = mkTmpProject({ 'flows.config.json': '{not valid json' });
  assert.deepStrictEqual(loadIgnoredModels(root), []);
});

test('buildResourceGraph: ignored model does NOT emit RESOURCE_GRAPH_NO_CREATE_ENDPOINT', () => {
  const root = mkTmpProject({
    'flows.config.json': JSON.stringify({
      resourceGraph: { ignoreModels: ['BoilerplatePlaceholder'] },
    }),
  });
  const matrix = {
    projectDir: root,
    prismaModels: {
      models: {
        BoilerplatePlaceholder: {
          idField: 'id',
          fieldTypes: { id: 'String' },
          uniqueFields: [],
          compositeUniques: [],
          relations: [],
        },
      },
    },
    apiEndpoints: [],
  };
  const diagnostics = [];
  buildResourceGraph(matrix, diagnostics);
  const noCreateDiagnostics = diagnostics.filter(
    (diag) => diag.code === 'RESOURCE_GRAPH_NO_CREATE_ENDPOINT'
  );
  assert.deepStrictEqual(
    noCreateDiagnostics,
    [],
    'BoilerplatePlaceholder is in ignoreModels — diagnostic must be suppressed',
  );
});

test('buildResourceGraph: non-ignored model still emits RESOURCE_GRAPH_NO_CREATE_ENDPOINT', () => {
  const root = mkTmpProject({
    'flows.config.json': JSON.stringify({
      resourceGraph: { ignoreModels: ['BoilerplatePlaceholder'] },
    }),
  });
  const matrix = {
    projectDir: root,
    prismaModels: {
      models: {
        Brand: {
          idField: 'id',
          fieldTypes: { id: 'String' },
          uniqueFields: [],
          compositeUniques: [],
          relations: [],
        },
      },
    },
    apiEndpoints: [],
  };
  const diagnostics = [];
  buildResourceGraph(matrix, diagnostics);
  const noCreateDiagnostics = diagnostics.filter(
    (diag) => diag.code === 'RESOURCE_GRAPH_NO_CREATE_ENDPOINT' && diag.model === 'Brand'
  );
  assert.strictEqual(
    noCreateDiagnostics.length,
    1,
    'real model with no @ResourceCaptures POST must still surface the diagnostic',
  );
});
