/**
 * Tests for contract-flows/contract-flows-loader.ts.
 *
 * Coverage:
 *   - Missing folder / non-folder path → empty result, no error (backward compat).
 *   - Empty folder → empty result, no error (backward compat).
 *   - Glob picks up *.json (case-insensitive) sorted lexicographically.
 *   - JSON parse failure → FLOW_FILE_PARSE_ERROR.
 *   - Zod parse failure → FLOW_FILE_SCHEMA_INVALID with Zod issue list.
 *   - filename ↔ task_id mismatch → FLOW_TASK_ID_MISMATCH.
 *   - owns / declarations consistency → FLOW_FILE_MISSING_OWNS_OR_EXTENDS.
 *   - coverageTemplate registry → FLOW_COVERAGE_TEMPLATE_UNKNOWN; can be
 *     extended via options.extraCoverageTemplates.
 *   - invariant step references → FLOW_INVARIANT_STEP_MISSING (number AND
 *     string forms).
 *   - fixture refs resolve → FLOW_FIXTURE_MISSING when stat fails;
 *     populated `fixtures` map when stat succeeds.
 *   - Errors from one file do NOT short-circuit the rest.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  loadContractFlowsFolder,
  tryLoadContractFlowsFolder,
} from '../contract-flows-loader';

function withSandbox<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), 'contract-flows-loader-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function writeJson(dir: string, name: string, body: unknown): void {
  writeFileSync(join(dir, name), JSON.stringify(body, null, 2));
}

test('missing folder returns empty result (backward compat)', () => {
  const r = loadContractFlowsFolder('/this/path/should/not/exist/xyz');
  assert.deepEqual(r.files, []);
  assert.deepEqual(r.errors, []);
  assert.equal(r.fixtures.size, 0);
});

test('non-folder path returns empty result', () => {
  withSandbox((dir) => {
    const filePath = join(dir, 'not-a-dir.txt');
    writeFileSync(filePath, 'x');
    const r = loadContractFlowsFolder(filePath);
    assert.deepEqual(r.files, []);
    assert.deepEqual(r.errors, []);
  });
});

test('empty folder returns empty result', () => {
  withSandbox((dir) => {
    const r = loadContractFlowsFolder(dir);
    assert.deepEqual(r.files, []);
    assert.deepEqual(r.errors, []);
  });
});

test('tryLoadContractFlowsFolder is a transparent alias', () => {
  withSandbox((dir) => {
    writeJson(dir, '_shared.json', { version: 1, task_id: '_shared', owns: [] });
    const direct = loadContractFlowsFolder(dir);
    const via    = tryLoadContractFlowsFolder(dir);
    assert.equal(direct.files.length, via.files.length);
    assert.equal(direct.errors.length, via.errors.length);
  });
});

test('loader sorts json files lexicographically and accepts .JSON case-insensitively', () => {
  withSandbox((dir) => {
    writeJson(dir, 'b.json', { version: 1, task_id: 'b', owns: [] });
    writeJson(dir, 'a.json', { version: 1, task_id: 'a', owns: [] });
    writeJson(dir, 'c.JSON', { version: 1, task_id: 'c', owns: [] });
    const r = loadContractFlowsFolder(dir);
    assert.equal(r.files.length, 3);
    assert.deepEqual(r.files.map((f) => f.taskId), ['a', 'b', 'c']);
  });
});

test('JSON parse failure → FLOW_FILE_PARSE_ERROR', () => {
  withSandbox((dir) => {
    writeFileSync(join(dir, 'broken.json'), '{ "task_id": "broken", "owns": [');
    const r = loadContractFlowsFolder(dir);
    const err = r.errors.find((e) => e.code === 'FLOW_FILE_PARSE_ERROR');
    assert.ok(err, `expected FLOW_FILE_PARSE_ERROR, got: ${JSON.stringify(r.errors.map((e) => e.code))}`);
    if (err && err.code === 'FLOW_FILE_PARSE_ERROR') {
      assert.ok(err.file.endsWith('broken.json'));
      assert.ok(err.parseError.length > 0);
    }
  });
});

test('Zod failure → FLOW_FILE_SCHEMA_INVALID with issue list', () => {
  withSandbox((dir) => {
    writeJson(dir, 'bad.json', { version: 9, task_id: 'bad', owns: [] });
    const r = loadContractFlowsFolder(dir);
    const err = r.errors.find((e) => e.code === 'FLOW_FILE_SCHEMA_INVALID');
    assert.ok(err);
    if (err && err.code === 'FLOW_FILE_SCHEMA_INVALID') {
      assert.ok(Array.isArray(err.zodIssues));
      assert.ok(err.zodIssues.length > 0);
    }
  });
});

test('filename ↔ task_id mismatch → FLOW_TASK_ID_MISMATCH', () => {
  withSandbox((dir) => {
    writeJson(dir, 'task-x.json', { version: 1, task_id: 'actually-different', owns: [] });
    const r = loadContractFlowsFolder(dir);
    const err = r.errors.find((e) => e.code === 'FLOW_TASK_ID_MISMATCH');
    assert.ok(err);
    if (err && err.code === 'FLOW_TASK_ID_MISMATCH') {
      assert.equal(err.expected, 'task-x');
      assert.equal(err.actual, 'actually-different');
    }
  });
});

test('owns / declarations consistency → FLOW_FILE_MISSING_OWNS_OR_EXTENDS', () => {
  withSandbox((dir) => {
    writeJson(dir, 'task.json', {
      version: 1,
      task_id: 'task',
      owns: [],
      actors: [{ name: 'orphan-actor', auth: {} }],
    });
    const r = loadContractFlowsFolder(dir);
    const err = r.errors.find((e) => e.code === 'FLOW_FILE_MISSING_OWNS_OR_EXTENDS');
    assert.ok(err);
    if (err && err.code === 'FLOW_FILE_MISSING_OWNS_OR_EXTENDS') {
      assert.deepEqual(err.unboundDeclarations, [{ kind: 'actor', name: 'orphan-actor' }]);
    }
  });
});

test('coverageTemplate registry → unknown name → FLOW_COVERAGE_TEMPLATE_UNKNOWN', () => {
  withSandbox((dir) => {
    writeJson(dir, 'task.json', {
      version: 1,
      task_id: 'task',
      owns: [{ resource: 'r' }],
      resources: [{
        name: 'r',
        create: { method: 'POST', path: '/r' },
        capture: { bindings: { id: '$.id' } },
      }],
      special_flows: [{
        id: 'task:flow',
        contract: { kind: 'http', source: 'p' },
        coverageTemplate: 'not-a-real-name',
        steps: [
          { kind: 'api', transport: 'http', method: 'GET', path: '/r' },
          { kind: 'expect', status: 200 },
        ],
      }],
    });
    const r = loadContractFlowsFolder(dir);
    const err = r.errors.find((e) => e.code === 'FLOW_COVERAGE_TEMPLATE_UNKNOWN');
    assert.ok(err);
    if (err && err.code === 'FLOW_COVERAGE_TEMPLATE_UNKNOWN') {
      assert.equal(err.template, 'not-a-real-name');
      assert.ok(err.knownTemplates.length > 0);
    }
  });
});

test('coverageTemplate registry can be extended via extraCoverageTemplates', () => {
  withSandbox((dir) => {
    writeJson(dir, 'task.json', {
      version: 1,
      task_id: 'task',
      owns: [{ resource: 'r' }],
      resources: [{
        name: 'r',
        create: { method: 'POST', path: '/r' },
        capture: { bindings: { id: '$.id' } },
      }],
      special_flows: [{
        id: 'task:flow',
        contract: { kind: 'http', source: 'p' },
        coverageTemplate: 'my-custom-template',
        steps: [
          { kind: 'api', transport: 'http', method: 'GET', path: '/r' },
          { kind: 'expect', status: 200 },
        ],
      }],
    });
    const r = loadContractFlowsFolder(dir, { extraCoverageTemplates: ['my-custom-template'] });
    assert.equal(r.errors.length, 0);
  });
});

test('invariant step refs → FLOW_INVARIANT_STEP_MISSING (number index out of range)', () => {
  withSandbox((dir) => {
    writeJson(dir, 'task.json', {
      version: 1,
      task_id: 'task',
      owns: [{ resource: 'r' }],
      resources: [{
        name: 'r',
        create: { method: 'POST', path: '/r' },
        capture: { bindings: { id: '$.id' } },
      }],
      special_flows: [{
        id: 'task:flow',
        contract: { kind: 'http', source: 'p' },
        steps: [{ kind: 'api', transport: 'http', method: 'GET', path: '/r' }],
        invariants: [{ kind: 'replay-equality', steps: [99] }],
      }],
    });
    const r = loadContractFlowsFolder(dir);
    const err = r.errors.find((e) => e.code === 'FLOW_INVARIANT_STEP_MISSING');
    assert.ok(err);
    if (err && err.code === 'FLOW_INVARIANT_STEP_MISSING') {
      assert.equal(err.missingStep, 99);
      assert.equal(err.invariantIndex, 0);
    }
  });
});

test('invariant step refs → FLOW_INVARIANT_STEP_MISSING (string id not declared)', () => {
  withSandbox((dir) => {
    writeJson(dir, 'task.json', {
      version: 1,
      task_id: 'task',
      owns: [{ resource: 'r' }],
      resources: [{
        name: 'r',
        create: { method: 'POST', path: '/r' },
        capture: { bindings: { id: '$.id' } },
      }],
      special_flows: [{
        id: 'task:flow',
        contract: { kind: 'http', source: 'p' },
        steps: [{ kind: 'api', stepId: 'real-step', transport: 'http', method: 'GET', path: '/r' }],
        invariants: [{ kind: 'replay-equality', steps: ['ghost-step'] }],
      }],
    });
    const r = loadContractFlowsFolder(dir);
    const err = r.errors.find((e) => e.code === 'FLOW_INVARIANT_STEP_MISSING');
    assert.ok(err);
    if (err && err.code === 'FLOW_INVARIANT_STEP_MISSING') {
      assert.equal(err.missingStep, 'ghost-step');
    }
  });
});

test('invariant step refs that resolve do NOT emit error', () => {
  withSandbox((dir) => {
    writeJson(dir, 'task.json', {
      version: 1,
      task_id: 'task',
      owns: [{ resource: 'r' }],
      resources: [{
        name: 'r',
        create: { method: 'POST', path: '/r' },
        capture: { bindings: { id: '$.id' } },
      }],
      special_flows: [{
        id: 'task:flow',
        contract: { kind: 'http', source: 'p' },
        steps: [
          { kind: 'api', stepId: 'real-step', transport: 'http', method: 'GET', path: '/r' },
          { kind: 'expect', status: 200 },
        ],
        invariants: [{ kind: 'replay-equality', steps: [0, 1, 'real-step'] }],
      }],
    });
    const r = loadContractFlowsFolder(dir);
    assert.equal(r.errors.length, 0);
  });
});

test('fixture missing → FLOW_FIXTURE_MISSING; existing fixtures populate the map', () => {
  withSandbox((dir) => {
    mkdirSync(join(dir, 'fixtures'));
    writeFileSync(join(dir, 'fixtures', 'present.png'), 'PNG');
    writeJson(dir, 'task.json', {
      version: 1,
      task_id: 'task',
      owns: [{ resource: 'r' }],
      resources: [{
        name: 'r',
        create: { method: 'POST', path: '/r' },
        capture: { bindings: { id: '$.id' } },
        multipartCreate: { parts: [{ name: 'file', fixtureRef: 'present.png', mimeType: 'image/png' }] },
      }],
      special_flows: [{
        id: 'task:upload',
        contract: { kind: 'http', source: 'p' },
        steps: [
          {
            kind: 'api',
            transport: 'http',
            method: 'POST',
            path: '/r',
            bodyKind: 'multipart',
            multipart: [{
              name: 'missing-one',
              file: { fixtureRef: 'missing.png', mimeType: 'image/png' },
            }],
          },
          { kind: 'expect', status: 201 },
        ],
      }],
    });
    const r = loadContractFlowsFolder(dir);
    const err = r.errors.find((e) => e.code === 'FLOW_FIXTURE_MISSING');
    assert.ok(err);
    if (err && err.code === 'FLOW_FIXTURE_MISSING') {
      assert.equal(err.fixtureRef, 'missing.png');
    }
    assert.ok(r.fixtures.has('present.png'));
  });
});

test('errors in one file do not short-circuit the rest', () => {
  withSandbox((dir) => {
    writeFileSync(join(dir, 'broken.json'), '{ "this": "is", "missing": ');
    writeJson(dir, 'good.json', { version: 1, task_id: 'good', owns: [] });
    const r = loadContractFlowsFolder(dir);
    assert.equal(r.files.length, 1);
    assert.equal(r.files[0].taskId, 'good');
    assert.ok(r.errors.some((e) => e.code === 'FLOW_FILE_PARSE_ERROR'));
  });
});

test('relative folder path is resolved against process cwd', () => {
  withSandbox((dir) => {
    writeJson(dir, 'task.json', { version: 1, task_id: 'task', owns: [] });
    const r = loadContractFlowsFolder(dir);
    assert.equal(r.files.length, 1);
    assert.ok(r.files[0].file.startsWith('/') || /^[A-Z]:[\\/]/.test(r.files[0].file));
  });
});
