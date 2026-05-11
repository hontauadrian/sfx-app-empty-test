import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadCuratedContract, formatSummary } from '../probe-integration';

function tempProject(): string {
  return mkdtempSync(join(tmpdir(), 'flows-probe-'));
}

test('loadCuratedContract returns absent summary when folder is missing', () => {
  const dir = tempProject();
  try {
    const summary = loadCuratedContract(dir);
    assert.equal(summary.present, false);
    assert.equal(summary.contract, null);
    assert.equal(summary.errors.length, 0);
    assert.equal(summary.counts.files, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadCuratedContract returns absent summary when folder is empty', () => {
  const dir = tempProject();
  try {
    mkdirSync(join(dir, '.overstory', 'runtime-contract.flows'), { recursive: true });
    const summary = loadCuratedContract(dir);
    assert.equal(summary.present, false);
    assert.equal(summary.contract, null);
    assert.equal(summary.counts.files, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadCuratedContract loads and merges valid json files', () => {
  const dir = tempProject();
  try {
    const flowsDir = join(dir, '.overstory', 'runtime-contract.flows');
    mkdirSync(flowsDir, { recursive: true });
    const contract = {
      version: 1,
      task_id: 't',
      owns: [],
      special_flows: [
        {
          id: 't:happy',
          description: 'demo',
          contract: { kind: 'http', source: 'hand', endpoint: 'GET /a' },
          steps: [
            { kind: 'api', transport: 'http', method: 'GET', path: '/a' },
            { kind: 'expect', status: 200 },
          ],
        },
      ],
    };
    writeFileSync(join(flowsDir, 't.json'), JSON.stringify(contract));
    const summary = loadCuratedContract(dir);
    assert.equal(summary.present, true, JSON.stringify(summary.errors));
    assert.equal(summary.counts.files, 1);
    assert.equal(summary.counts.specialFlows, 1);
    assert.ok(summary.contract);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('formatSummary produces an absent-folder message', () => {
  const summary = {
    folder: '/nope',
    present: false,
    errors: [],
    contract: null,
    counts: { files: 0, actors: 0, resources: 0, specialFlows: 0 },
  };
  const out = formatSummary(summary);
  assert.match(out, /empty/);
  assert.match(out, /\/nope/);
});

test('formatSummary produces a populated message', () => {
  const summary = {
    folder: '/x',
    present: true,
    errors: [],
    contract: null,
    counts: { files: 2, actors: 3, resources: 5, specialFlows: 7 },
  };
  const out = formatSummary(summary);
  assert.match(out, /loaded 2 files/);
  assert.match(out, /3 actors/);
  assert.match(out, /5 resources/);
  assert.match(out, /7 special flows/);
});
