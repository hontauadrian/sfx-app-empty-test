import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  parseArgs,
  loadConfig,
  loadOpenApi,
  generateSeedFlows,
  renderFlowFile,
  writeFlowFile,
  isBootstrapGenerated,
  BOOTSTRAP_SOURCE_PREFIX,
} from '../bootstrap';

function tempProject(): string {
  return mkdtempSync(join(tmpdir(), 'flows-bootstrap-'));
}

function writeConfig(dir: string, openapiPath: string) {
  const cfg = {
    openapi: { source: 'file', path: openapiPath },
    apiBaseUrl: 'http://localhost:3001',
    flowsDir: '.overstory/runtime-contract.flows',
  };
  writeFileSync(join(dir, 'flows.config.json'), JSON.stringify(cfg, null, 2));
}

function writeOpenApi(dir: string, name = 'openapi.json') {
  const doc = {
    paths: {
      '/users': {
        get: { summary: 'List users', responses: { '200': {}, '401': {} } },
        post: { summary: 'Create user', responses: { '201': {}, '400': {}, '409': {} } },
      },
      '/users/{id}': {
        get: { summary: 'Get user', responses: { '200': {}, '404': {} } },
        delete: { summary: 'Delete user', responses: { '204': {}, '404': {} } },
      },
    },
  };
  const abs = join(dir, name);
  writeFileSync(abs, JSON.stringify(doc));
  return abs;
}

test('parseArgs requires --task', () => {
  assert.throws(() => parseArgs([]), /Missing required --task/);
});

test('parseArgs rejects invalid task ids', () => {
  assert.throws(() => parseArgs(['--task=has spaces']), /Invalid --task/);
  assert.throws(() => parseArgs(['--task=has/slash']), /Invalid --task/);
});

test('parseArgs accepts dash-separated task id', () => {
  const args = parseArgs(['--task=sfx-webapp-boilerplate-92d9']);
  assert.equal(args.taskId, 'sfx-webapp-boilerplate-92d9');
  assert.equal(args.configPath, 'flows.config.json');
});

test('loadConfig errors on missing file', () => {
  const dir = tempProject();
  try {
    assert.throws(() => loadConfig('flows.config.json', dir), /not found/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadConfig validates required fields', () => {
  const dir = tempProject();
  try {
    writeFileSync(join(dir, 'flows.config.json'), JSON.stringify({}));
    assert.throws(() => loadConfig('flows.config.json', dir), /missing/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadOpenApi reads file source', () => {
  const dir = tempProject();
  try {
    writeOpenApi(dir);
    writeConfig(dir, 'openapi.json');
    const cfg = loadConfig('flows.config.json', dir);
    const doc = loadOpenApi(cfg, dir);
    assert.ok(doc.paths);
    assert.ok(doc.paths!['/users']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadOpenApi errors when file missing', () => {
  const dir = tempProject();
  try {
    writeConfig(dir, 'missing.json');
    const cfg = loadConfig('flows.config.json', dir);
    assert.throws(() => loadOpenApi(cfg, dir), /not found/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadOpenApi rejects http source (no live server in bootstrap)', () => {
  const dir = tempProject();
  try {
    writeFileSync(
      join(dir, 'flows.config.json'),
      JSON.stringify({
        openapi: { source: 'http', url: 'http://x' },
        apiBaseUrl: 'http://localhost:3001',
        flowsDir: '.overstory/runtime-contract.flows',
      }),
    );
    const cfg = loadConfig('flows.config.json', dir);
    assert.throws(() => loadOpenApi(cfg, dir), /not supported/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('generateSeedFlows emits one happy + one per declared 4xx/5xx', () => {
  const doc = {
    paths: {
      '/users': {
        get: { responses: { '200': {}, '401': {} } },
        post: { responses: { '201': {}, '400': {}, '409': {} } },
      },
    },
  };
  const seeds = generateSeedFlows(doc, 'task1');
  // GET /users: 1 happy + 1 status (401) = 2
  // POST /users: 1 happy + 2 status (400, 409) = 3
  assert.equal(seeds.length, 5);
  const ids = seeds.map((s) => s.id);
  assert.ok(ids.includes('task1:get:-users:happy'));
  assert.ok(ids.includes('task1:get:-users:status-401'));
  assert.ok(ids.includes('task1:post:-users:happy'));
  assert.ok(ids.includes('task1:post:-users:status-400'));
  assert.ok(ids.includes('task1:post:-users:status-409'));
  for (const seed of seeds) {
    assert.ok(seed.contract.source.startsWith(BOOTSTRAP_SOURCE_PREFIX));
    assert.ok(isBootstrapGenerated(seed));
  }
});

test('generateSeedFlows skips success codes (<400)', () => {
  const doc = {
    paths: {
      '/x': { get: { responses: { '200': {}, '204': {}, '301': {} } } },
    },
  };
  const seeds = generateSeedFlows(doc, 't');
  assert.equal(seeds.length, 1); // only happy
  assert.match(seeds[0].id, /:happy$/);
});

test('generateSeedFlows handles operations with no declared responses', () => {
  const doc = { paths: { '/y': { get: {} } } };
  const seeds = generateSeedFlows(doc, 't');
  assert.equal(seeds.length, 1);
  assert.match(seeds[0].id, /:happy$/);
});

test('generated seeds emit api + expect step pair with transport: http', () => {
  const doc = { paths: { '/z': { post: { responses: { '201': {}, '400': {} } } } } };
  const seeds = generateSeedFlows(doc, 't');
  const happy = seeds.find((s) => s.id === 't:post:-z:happy')!;
  assert.equal(happy.steps.length, 2);
  const apiStep = happy.steps[0] as { kind: string; transport?: string; method?: string; path?: string };
  const expectStep = happy.steps[1] as { kind: string; status?: number };
  assert.equal(apiStep.kind, 'api');
  assert.equal(apiStep.transport, 'http');
  assert.equal(apiStep.method, 'POST');
  assert.equal(apiStep.path, '/z');
  assert.equal(expectStep.kind, 'expect');
  assert.equal(expectStep.status, 201);
});

test('isBootstrapGenerated returns false for curated entries', () => {
  assert.equal(isBootstrapGenerated({ contract: { source: 'plan-task-001 §1' } }), false);
  assert.equal(isBootstrapGenerated({ contract: { source: 'hand' } }), false);
  assert.equal(isBootstrapGenerated({ contract: { source: undefined } }), false);
  assert.equal(isBootstrapGenerated({ contract: undefined }), false);
});

test('isBootstrapGenerated returns true for bootstrap-prefix entries', () => {
  assert.equal(
    isBootstrapGenerated({ contract: { source: `${BOOTSTRAP_SOURCE_PREFIX}happy` } }),
    true,
  );
  assert.equal(
    isBootstrapGenerated({ contract: { source: `${BOOTSTRAP_SOURCE_PREFIX}status-401` } }),
    true,
  );
});

test('renderFlowFile preserves curated entries on re-run', () => {
  const existing = {
    version: 1 as const,
    task_id: 't',
    owns: [],
    special_flows: [
      {
        id: 't:keep',
        description: 'curated',
        contract: { kind: 'business', source: 'plan-t §2', endpoint: 'GET /keep' },
        steps: [],
      },
    ],
  };
  const seeds = [
    {
      id: 't:fresh',
      description: 'fresh',
      contract: {
        kind: 'happy',
        source: `${BOOTSTRAP_SOURCE_PREFIX}happy`,
        endpoint: 'GET /fresh',
      },
      steps: [],
    },
  ];
  const out = renderFlowFile('t', existing, seeds);
  assert.equal(out.preserved, 1);
  assert.equal(out.added, 1);
  const ids = out.content.special_flows!.map((f) => f.id);
  assert.deepEqual(ids, ['t:keep', 't:fresh']);
});

test('renderFlowFile drops generated seed colliding with curated id', () => {
  const existing = {
    version: 1 as const,
    task_id: 't',
    owns: [],
    special_flows: [
      {
        id: 't:happy',
        description: 'curated wins',
        contract: { kind: 'business', source: 'hand', endpoint: 'GET /a' },
        steps: [],
      },
    ],
  };
  const seeds = [
    {
      id: 't:happy',
      description: 'should be skipped',
      contract: { kind: 'happy', source: `${BOOTSTRAP_SOURCE_PREFIX}happy`, endpoint: 'GET /a' },
      steps: [],
    },
    {
      id: 't:other',
      description: 'fresh',
      contract: { kind: 'happy', source: `${BOOTSTRAP_SOURCE_PREFIX}happy`, endpoint: 'GET /b' },
      steps: [],
    },
  ];
  const out = renderFlowFile('t', existing, seeds);
  assert.equal(out.preserved, 1);
  assert.equal(out.added, 1);
  const ids = out.content.special_flows!.map((f) => f.id);
  assert.equal(ids.filter((i) => i === 't:happy').length, 1);
  // curated entry's source survives
  const happyEntry = out.content.special_flows!.find((f) => f.id === 't:happy')!;
  assert.equal(happyEntry.contract.source, 'hand');
});

test('renderFlowFile counts refreshed vs added correctly', () => {
  const existing = {
    version: 1 as const,
    task_id: 't',
    owns: [],
    special_flows: [
      {
        id: 't:was-generated',
        description: 'old',
        contract: { kind: 'happy', source: `${BOOTSTRAP_SOURCE_PREFIX}happy`, endpoint: 'GET /a' },
        steps: [],
      },
    ],
  };
  const seeds = [
    {
      id: 't:was-generated',
      description: 'refreshed',
      contract: { kind: 'happy', source: `${BOOTSTRAP_SOURCE_PREFIX}happy`, endpoint: 'GET /a' },
      steps: [],
    },
    {
      id: 't:new',
      description: 'added',
      contract: { kind: 'happy', source: `${BOOTSTRAP_SOURCE_PREFIX}happy`, endpoint: 'GET /b' },
      steps: [],
    },
  ];
  const out = renderFlowFile('t', existing, seeds);
  assert.equal(out.preserved, 0);
  assert.equal(out.refreshed, 1);
  assert.equal(out.added, 1);
});

test('writeFlowFile creates a new <task-id>.json with seeds', () => {
  const dir = tempProject();
  try {
    const seeds = [
      {
        id: 'task:get-users:happy',
        description: 'h',
        contract: { kind: 'happy', source: `${BOOTSTRAP_SOURCE_PREFIX}happy`, endpoint: 'GET /users' },
        steps: [
          { kind: 'api' as const, transport: 'http', method: 'GET', path: '/users' },
          { kind: 'expect' as const, status: 200 },
        ],
      },
    ];
    const flowsDir = '.overstory/runtime-contract.flows';
    const result = writeFlowFile('task', flowsDir, dir, seeds);
    assert.equal(result.reason, 'created');
    assert.equal(result.preserved, 0);
    assert.equal(result.added, 1);
    const written = JSON.parse(readFileSync(join(dir, flowsDir, 'task.json'), 'utf8'));
    assert.equal(written.version, 1);
    assert.equal(written.task_id, 'task');
    assert.deepEqual(written.owns, []);
    assert.equal(written.special_flows.length, 1);
    assert.equal(written.special_flows[0].id, 'task:get-users:happy');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('writeFlowFile updates existing file preserving curated entries', () => {
  const dir = tempProject();
  try {
    const flowsDir = '.overstory/runtime-contract.flows';
    const flowsAbs = join(dir, flowsDir);
    mkdirSync(flowsAbs, { recursive: true });
    const initial = {
      version: 1,
      task_id: 't',
      owns: [{ resource: 'parent' }],
      extends: [{ actor: 'admin' }],
      special_flows: [
        {
          id: 't:hand-flow',
          description: 'lead-authored',
          contract: { kind: 'business', source: 'plan-t §1', endpoint: 'GET /custom' },
          steps: [],
        },
        {
          id: 't:old-gen',
          description: 'old generated',
          contract: { kind: 'happy', source: `${BOOTSTRAP_SOURCE_PREFIX}happy`, endpoint: 'GET /old' },
          steps: [],
        },
      ],
    };
    writeFileSync(join(flowsAbs, 't.json'), JSON.stringify(initial, null, 2));
    const seeds = [
      {
        id: 't:new-gen',
        description: 'new gen',
        contract: { kind: 'happy', source: `${BOOTSTRAP_SOURCE_PREFIX}happy`, endpoint: 'GET /new' },
        steps: [],
      },
    ];
    const result = writeFlowFile('t', flowsDir, dir, seeds);
    assert.equal(result.reason, 'updated');
    assert.equal(result.preserved, 1);
    assert.equal(result.added, 1);
    const written = JSON.parse(readFileSync(join(flowsAbs, 't.json'), 'utf8'));
    const ids = written.special_flows.map((f: { id: string }) => f.id);
    assert.ok(ids.includes('t:hand-flow'));
    assert.ok(ids.includes('t:new-gen'));
    assert.ok(!ids.includes('t:old-gen')); // old generated removed
    // Curated metadata (owns / extends) preserved
    assert.deepEqual(written.owns, [{ resource: 'parent' }]);
    assert.deepEqual(written.extends, [{ actor: 'admin' }]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
