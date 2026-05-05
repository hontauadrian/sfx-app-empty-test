'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const {
  emitGraphQLFlows,
  buildSampleVarsForArgs,
  sampleValueForGraphQLType,
  buildQueryString,
  buildSelectionSet,
} = require('../flows-generator');

const {
  parseIntrospectionSchema,
  parseOperation,
  resolveTypeName,
  isNonNull,
  sampleValueForType,
  scanSources,
} = require('../detectors/graphql');

// ---------------------------------------------------------------------------
// detectors/graphql.js — resolveTypeName
// ---------------------------------------------------------------------------

test('resolveTypeName: simple type name', () => {
  assert.strictEqual(resolveTypeName({ name: 'String', kind: 'SCALAR' }), 'String');
});

test('resolveTypeName: NON_NULL wrapper', () => {
  assert.strictEqual(
    resolveTypeName({ kind: 'NON_NULL', ofType: { name: 'String', kind: 'SCALAR' } }),
    'String!',
  );
});

test('resolveTypeName: LIST wrapper', () => {
  assert.strictEqual(
    resolveTypeName({ kind: 'LIST', ofType: { name: 'Int', kind: 'SCALAR' } }),
    '[Int]',
  );
});

test('resolveTypeName: nested NON_NULL + LIST', () => {
  assert.strictEqual(
    resolveTypeName({
      kind: 'NON_NULL',
      ofType: { kind: 'LIST', ofType: { name: 'String', kind: 'SCALAR' } },
    }),
    '[String]!',
  );
});

test('resolveTypeName: null returns Unknown', () => {
  assert.strictEqual(resolveTypeName(null), 'Unknown');
});

test('resolveTypeName: missing name returns Unknown', () => {
  assert.strictEqual(resolveTypeName({ kind: 'SCALAR' }), 'Unknown');
});

// ---------------------------------------------------------------------------
// detectors/graphql.js — isNonNull
// ---------------------------------------------------------------------------

test('isNonNull: true for NON_NULL kind', () => {
  assert.strictEqual(isNonNull({ kind: 'NON_NULL', ofType: { name: 'String' } }), true);
});

test('isNonNull: false for SCALAR kind', () => {
  assert.strictEqual(isNonNull({ kind: 'SCALAR', name: 'String' }), false);
});

test('isNonNull: falsy for null', () => {
  assert.ok(!isNonNull(null));
});

// ---------------------------------------------------------------------------
// detectors/graphql.js — sampleValueForType
// ---------------------------------------------------------------------------

test('sampleValueForType: String -> probe-sample', () => {
  assert.strictEqual(sampleValueForType('String'), 'probe-sample');
});

test('sampleValueForType: Int -> 1', () => {
  assert.strictEqual(sampleValueForType('Int'), 1);
});

test('sampleValueForType: Float -> 1.5', () => {
  assert.strictEqual(sampleValueForType('Float'), 1.5);
});

test('sampleValueForType: Boolean -> true', () => {
  assert.strictEqual(sampleValueForType('Boolean'), true);
});

test('sampleValueForType: ID -> probe-id-1', () => {
  assert.strictEqual(sampleValueForType('ID'), 'probe-id-1');
});

test('sampleValueForType: unknown type -> null', () => {
  assert.strictEqual(sampleValueForType('CustomType'), null);
});

test('sampleValueForType: strips wrappers from type name', () => {
  assert.strictEqual(sampleValueForType('String!'), 'probe-sample');
  assert.strictEqual(sampleValueForType('[Int]'), 1);
});

// ---------------------------------------------------------------------------
// detectors/graphql.js — parseOperation
// ---------------------------------------------------------------------------

test('parseOperation: parses query with required arg', () => {
  const result = parseOperation({
    name: 'getUser',
    args: [
      { name: 'id', type: { kind: 'NON_NULL', ofType: { name: 'ID', kind: 'SCALAR' } } },
    ],
    type: { name: 'User', kind: 'OBJECT' },
  });
  assert.strictEqual(result.name, 'getUser');
  assert.strictEqual(result.args.length, 1);
  assert.strictEqual(result.args[0].name, 'id');
  assert.strictEqual(result.args[0].type, 'ID!');
  assert.strictEqual(result.args[0].required, true);
  assert.strictEqual(result.returnType, 'User');
});

test('parseOperation: parses field with no args', () => {
  const result = parseOperation({
    name: 'currentUser',
    args: [],
    type: { name: 'User', kind: 'OBJECT' },
  });
  assert.strictEqual(result.name, 'currentUser');
  assert.strictEqual(result.args.length, 0);
  assert.strictEqual(result.returnType, 'User');
});

test('parseOperation: optional argument has required=false', () => {
  const result = parseOperation({
    name: 'users',
    args: [
      { name: 'limit', type: { name: 'Int', kind: 'SCALAR' } },
    ],
    type: { kind: 'LIST', ofType: { name: 'User', kind: 'OBJECT' } },
  });
  assert.strictEqual(result.args[0].required, false);
  assert.strictEqual(result.returnType, '[User]');
});

// ---------------------------------------------------------------------------
// detectors/graphql.js — parseIntrospectionSchema
// ---------------------------------------------------------------------------

const sampleSchema = {
  queryType: { name: 'Query' },
  mutationType: { name: 'Mutation' },
  subscriptionType: { name: 'Subscription' },
  types: [
    {
      name: 'Query', kind: 'OBJECT',
      fields: [
        {
          name: 'users',
          args: [{ name: 'limit', type: { name: 'Int', kind: 'SCALAR' } }],
          type: { kind: 'LIST', ofType: { name: 'User', kind: 'OBJECT' } },
        },
        {
          name: 'user',
          args: [{ name: 'id', type: { kind: 'NON_NULL', ofType: { name: 'ID', kind: 'SCALAR' } } }],
          type: { name: 'User', kind: 'OBJECT' },
        },
      ],
    },
    {
      name: 'Mutation', kind: 'OBJECT',
      fields: [
        {
          name: 'createUser',
          args: [
            { name: 'name', type: { kind: 'NON_NULL', ofType: { name: 'String', kind: 'SCALAR' } } },
            { name: 'email', type: { kind: 'NON_NULL', ofType: { name: 'String', kind: 'SCALAR' } } },
          ],
          type: { name: 'User', kind: 'OBJECT' },
        },
      ],
    },
    {
      name: 'Subscription', kind: 'OBJECT',
      fields: [
        { name: 'userCreated', args: [], type: { name: 'User', kind: 'OBJECT' } },
      ],
    },
    {
      name: 'User', kind: 'OBJECT',
      fields: [
        { name: 'id', args: [], type: { name: 'ID', kind: 'SCALAR' } },
        { name: 'name', args: [], type: { name: 'String', kind: 'SCALAR' } },
        { name: 'email', args: [], type: { name: 'String', kind: 'SCALAR' } },
      ],
    },
    { name: 'String', kind: 'SCALAR', fields: null },
    { name: 'Int', kind: 'SCALAR', fields: null },
    { name: '__Schema', kind: 'OBJECT', fields: [] },
    {
      name: 'CreateUserInput', kind: 'INPUT_OBJECT', fields: null,
      inputFields: [
        { name: 'name', type: { kind: 'NON_NULL', ofType: { name: 'String', kind: 'SCALAR' } } },
        { name: 'email', type: { kind: 'NON_NULL', ofType: { name: 'String', kind: 'SCALAR' } } },
      ],
    },
  ],
};

test('parseIntrospectionSchema: extracts queries', () => {
  const result = parseIntrospectionSchema(sampleSchema);
  assert.strictEqual(result.queries.length, 2);
  assert.strictEqual(result.queries[0].name, 'users');
  assert.strictEqual(result.queries[1].name, 'user');
});

test('parseIntrospectionSchema: extracts mutations', () => {
  const result = parseIntrospectionSchema(sampleSchema);
  assert.strictEqual(result.mutations.length, 1);
  assert.strictEqual(result.mutations[0].name, 'createUser');
  assert.strictEqual(result.mutations[0].args.length, 2);
});

test('parseIntrospectionSchema: extracts subscriptions', () => {
  const result = parseIntrospectionSchema(sampleSchema);
  assert.strictEqual(result.subscriptions.length, 1);
  assert.strictEqual(result.subscriptions[0].name, 'userCreated');
});

test('parseIntrospectionSchema: extracts user-defined types (skips introspection + scalars)', () => {
  const result = parseIntrospectionSchema(sampleSchema);
  assert.strictEqual(result.types.length, 2);
  assert.strictEqual(result.types[0].name, 'User');
  assert.strictEqual(result.types[0].fields.length, 3);
});

test('parseIntrospectionSchema: extracts INPUT_OBJECT fields from inputFields', () => {
  const result = parseIntrospectionSchema(sampleSchema);
  const inputType = result.types.find((t) => t.name === 'CreateUserInput');
  assert.ok(inputType);
  assert.strictEqual(inputType.kind, 'INPUT_OBJECT');
  assert.strictEqual(inputType.fields.length, 2);
  assert.strictEqual(inputType.fields[0].name, 'name');
  assert.strictEqual(inputType.fields[0].type, 'String!');
  assert.strictEqual(inputType.fields[1].name, 'email');
  assert.strictEqual(inputType.fields[1].type, 'String!');
});

test('parseIntrospectionSchema: handles null mutation/subscription type', () => {
  const schema = {
    queryType: { name: 'Query' },
    mutationType: null,
    subscriptionType: null,
    types: [
      {
        name: 'Query', kind: 'OBJECT',
        fields: [{ name: 'hello', args: [], type: { name: 'String', kind: 'SCALAR' } }],
      },
    ],
  };
  const result = parseIntrospectionSchema(schema);
  assert.strictEqual(result.queries.length, 1);
  assert.strictEqual(result.mutations.length, 0);
  assert.strictEqual(result.subscriptions.length, 0);
});

test('parseIntrospectionSchema: handles empty types array', () => {
  const result = parseIntrospectionSchema({
    queryType: null, mutationType: null, subscriptionType: null, types: [],
  });
  assert.strictEqual(result.queries.length, 0);
  assert.strictEqual(result.mutations.length, 0);
  assert.strictEqual(result.types.length, 0);
});

// ---------------------------------------------------------------------------
// parseIntrospectionSchema — UNION / INTERFACE handling
// ---------------------------------------------------------------------------

test('parseIntrospectionSchema: parses UNION type with possibleTypes', () => {
  const schema = {
    queryType: { name: 'Query' },
    mutationType: null,
    subscriptionType: null,
    types: [
      {
        name: 'Query', kind: 'OBJECT',
        fields: [{ name: 'search', args: [{ name: 'q', type: { name: 'String', kind: 'SCALAR' } }], type: { name: 'SearchResult', kind: 'UNION' } }],
      },
      {
        name: 'SearchResult', kind: 'UNION',
        possibleTypes: [{ name: 'User' }, { name: 'Post' }],
      },
      {
        name: 'User', kind: 'OBJECT',
        fields: [{ name: 'id', type: { name: 'ID', kind: 'SCALAR' } }],
      },
      {
        name: 'Post', kind: 'OBJECT',
        fields: [{ name: 'id', type: { name: 'ID', kind: 'SCALAR' } }],
      },
    ],
  };
  const result = parseIntrospectionSchema(schema);
  const unionType = result.types.find((t) => t.name === 'SearchResult');
  assert.ok(unionType, 'SearchResult union should be in types');
  assert.strictEqual(unionType.kind, 'UNION');
  assert.deepStrictEqual(unionType.possibleTypes, ['User', 'Post']);
  assert.deepStrictEqual(unionType.fields, []);
});

test('parseIntrospectionSchema: parses INTERFACE type with fields and possibleTypes', () => {
  const schema = {
    queryType: { name: 'Query' },
    mutationType: null,
    subscriptionType: null,
    types: [
      {
        name: 'Query', kind: 'OBJECT',
        fields: [{ name: 'node', args: [{ name: 'id', type: { name: 'ID', kind: 'SCALAR' } }], type: { name: 'Node', kind: 'INTERFACE' } }],
      },
      {
        name: 'Node', kind: 'INTERFACE',
        fields: [{ name: 'id', args: [], type: { name: 'ID', kind: 'SCALAR' } }],
        possibleTypes: [{ name: 'User' }, { name: 'Post' }],
      },
      {
        name: 'User', kind: 'OBJECT',
        fields: [
          { name: 'id', type: { name: 'ID', kind: 'SCALAR' } },
          { name: 'name', type: { name: 'String', kind: 'SCALAR' } },
        ],
        interfaces: [{ name: 'Node' }],
      },
    ],
  };
  const result = parseIntrospectionSchema(schema);
  const ifaceType = result.types.find((t) => t.name === 'Node');
  assert.ok(ifaceType, 'Node interface should be in types');
  assert.strictEqual(ifaceType.kind, 'INTERFACE');
  assert.deepStrictEqual(ifaceType.possibleTypes, ['User', 'Post']);
  assert.strictEqual(ifaceType.fields.length, 1);
  assert.strictEqual(ifaceType.fields[0].name, 'id');

  // OBJECT types should now have interfaces array
  const userType = result.types.find((t) => t.name === 'User');
  assert.ok(userType, 'User object should be in types');
  assert.deepStrictEqual(userType.interfaces, ['Node']);
});

test('parseIntrospectionSchema: OBJECT without interfaces has empty array', () => {
  const schema = {
    queryType: { name: 'Query' },
    mutationType: null,
    subscriptionType: null,
    types: [
      {
        name: 'Query', kind: 'OBJECT',
        fields: [{ name: 'hello', args: [], type: { name: 'String', kind: 'SCALAR' } }],
      },
      {
        name: 'Standalone', kind: 'OBJECT',
        fields: [{ name: 'id', type: { name: 'ID', kind: 'SCALAR' } }],
      },
    ],
  };
  const result = parseIntrospectionSchema(schema);
  const standalone = result.types.find((t) => t.name === 'Standalone');
  assert.ok(standalone);
  assert.deepStrictEqual(standalone.interfaces, []);
});

// ---------------------------------------------------------------------------
// detectors/graphql.js — scanSources
// ---------------------------------------------------------------------------

test('scanSources: returns not detected for non-existent directory', () => {
  const result = scanSources('/tmp/nonexistent-graphql-test-dir-' + Date.now());
  assert.strictEqual(result.detected, false);
  assert.strictEqual(result.resolverFiles.length, 0);
  assert.strictEqual(result.source, null);
});

// ---------------------------------------------------------------------------
// flows-generator.js — sampleValueForGraphQLType
// ---------------------------------------------------------------------------

test('sampleValueForGraphQLType: String -> probe-sample', () => {
  assert.strictEqual(sampleValueForGraphQLType('String'), 'probe-sample');
});

test('sampleValueForGraphQLType: Int -> 1', () => {
  assert.strictEqual(sampleValueForGraphQLType('Int'), 1);
});

test('sampleValueForGraphQLType: Float -> 1.5', () => {
  assert.strictEqual(sampleValueForGraphQLType('Float'), 1.5);
});

test('sampleValueForGraphQLType: Boolean -> true', () => {
  assert.strictEqual(sampleValueForGraphQLType('Boolean'), true);
});

test('sampleValueForGraphQLType: ID -> probe-id-1', () => {
  assert.strictEqual(sampleValueForGraphQLType('ID'), 'probe-id-1');
});

test('sampleValueForGraphQLType: custom type -> null without types array', () => {
  assert.strictEqual(sampleValueForGraphQLType('User'), null);
});

test('sampleValueForGraphQLType: INPUT_OBJECT type with fields builds sample object', () => {
  const types = [
    { name: 'CreateUserInput', kind: 'INPUT_OBJECT', fields: [
      { name: 'name', type: 'String!' },
      { name: 'email', type: 'String!' },
    ]},
  ];
  const result = sampleValueForGraphQLType('CreateUserInput!', types);
  assert.deepStrictEqual(result, { name: 'probe-sample', email: 'probe-sample' });
});

test('sampleValueForGraphQLType: INPUT_OBJECT with no fields returns empty object', () => {
  const types = [
    { name: 'EmptyInput', kind: 'INPUT_OBJECT', fields: [] },
  ];
  const result = sampleValueForGraphQLType('EmptyInput!', types);
  assert.deepStrictEqual(result, {});
});

test('sampleValueForGraphQLType: list type wraps value in array', () => {
  assert.deepStrictEqual(sampleValueForGraphQLType('[String]'), ['probe-sample']);
  assert.deepStrictEqual(sampleValueForGraphQLType('[Int!]!'), [1]);
});

test('sampleValueForGraphQLType: list of INPUT_OBJECT wraps sample object in array', () => {
  const types = [
    { name: 'ItemInput', kind: 'INPUT_OBJECT', fields: [
      { name: 'title', type: 'String!' },
    ]},
  ];
  const result = sampleValueForGraphQLType('[ItemInput!]!', types);
  assert.deepStrictEqual(result, [{ title: 'probe-sample' }]);
});

// ---------------------------------------------------------------------------
// flows-generator.js — buildSampleVarsForArgs
// ---------------------------------------------------------------------------

test('buildSampleVarsForArgs: builds sample variables from args', () => {
  const args = [
    { name: 'id', type: 'ID!', required: true },
    { name: 'name', type: 'String!', required: true },
    { name: 'count', type: 'Int', required: false },
  ];
  const result = buildSampleVarsForArgs(args);
  assert.deepStrictEqual(result, { id: 'probe-id-1', name: 'probe-sample', count: 1 });
});

test('buildSampleVarsForArgs: skips args with unknown types when no types provided', () => {
  const args = [{ name: 'input', type: 'CreateUserInput!', required: true }];
  const result = buildSampleVarsForArgs(args);
  assert.deepStrictEqual(result, {});
});

test('buildSampleVarsForArgs: builds INPUT_OBJECT sample when types provided', () => {
  const types = [
    { name: 'CreateUserInput', kind: 'INPUT_OBJECT', fields: [
      { name: 'name', type: 'String!' },
      { name: 'email', type: 'String!' },
    ]},
  ];
  const args = [{ name: 'input', type: 'CreateUserInput!', required: true }];
  const result = buildSampleVarsForArgs(args, types);
  assert.deepStrictEqual(result, { input: { name: 'probe-sample', email: 'probe-sample' } });
});

test('buildSampleVarsForArgs: handles empty args', () => {
  assert.deepStrictEqual(buildSampleVarsForArgs([]), {});
});

test('buildSampleVarsForArgs: handles null/undefined args', () => {
  assert.deepStrictEqual(buildSampleVarsForArgs(null), {});
  assert.deepStrictEqual(buildSampleVarsForArgs(undefined), {});
});

// ---------------------------------------------------------------------------
// flows-generator.js — buildQueryString
// ---------------------------------------------------------------------------

test('buildQueryString: query with args', () => {
  const op = {
    name: 'user',
    args: [{ name: 'id', type: 'ID!', required: true }],
    returnType: 'User',
  };
  assert.strictEqual(
    buildQueryString(op, 'query'),
    'query user($id: ID!) { user(id: $id) { __typename } }',
  );
});

test('buildQueryString: mutation with multiple args', () => {
  const op = {
    name: 'createUser',
    args: [
      { name: 'name', type: 'String!', required: true },
      { name: 'email', type: 'String!', required: true },
    ],
    returnType: 'User',
  };
  assert.strictEqual(
    buildQueryString(op, 'mutation'),
    'mutation createUser($name: String!, $email: String!) { createUser(name: $name, email: $email) { __typename } }',
  );
});

test('buildQueryString: query with no args', () => {
  const op = { name: 'currentUser', args: [], returnType: 'User' };
  assert.strictEqual(
    buildQueryString(op, 'query'),
    'query currentUser { currentUser { __typename } }',
  );
});

test('buildQueryString: omits selection set for scalar return types', () => {
  const op = { name: 'serverTime', args: [], returnType: 'String' };
  assert.strictEqual(buildQueryString(op, 'query'), 'query serverTime { serverTime }');
});

test('buildQueryString: omits selection set for ID return type', () => {
  const op = { name: 'nextId', args: [], returnType: 'ID' };
  assert.strictEqual(buildQueryString(op, 'query'), 'query nextId { nextId }');
});

test('buildQueryString: omits selection set for Boolean return type', () => {
  const op = { name: 'isReady', args: [], returnType: 'Boolean' };
  assert.strictEqual(buildQueryString(op, 'query'), 'query isReady { isReady }');
});

// ---------------------------------------------------------------------------
// flows-generator.js — emitGraphQLFlows (null guards)
// ---------------------------------------------------------------------------

test('emitGraphQLFlows: returns [] when graphql is null', () => {
  const flows = emitGraphQLFlows({ graphql: null });
  assert.deepStrictEqual(flows, []);
});

test('emitGraphQLFlows: returns [] when graphql is undefined', () => {
  const flows = emitGraphQLFlows({});
  assert.deepStrictEqual(flows, []);
});

test('emitGraphQLFlows: returns [] when no queries or mutations', () => {
  const flows = emitGraphQLFlows({ graphql: { queries: null, mutations: null } });
  assert.deepStrictEqual(flows, []);
});

// ---------------------------------------------------------------------------
// flows-generator.js — emitGraphQLFlows (queries)
// ---------------------------------------------------------------------------

const queryMatrix = {
  graphql: {
    endpoint: '/graphql',
    source: 'introspection',
    queries: [
      { name: 'users', args: [{ name: 'limit', type: 'Int', required: false }], returnType: '[User]' },
      { name: 'user', args: [{ name: 'id', type: 'ID!', required: true }], returnType: 'User' },
    ],
    mutations: [],
    subscriptions: [],
    types: [],
  },
};

test('emitGraphQLFlows: emits :happy flow for each query', () => {
  const flows = emitGraphQLFlows(queryMatrix);
  const happyFlows = flows.filter((f) => f.id.endsWith(':happy'));
  assert.strictEqual(happyFlows.length, 2);
});

test('emitGraphQLFlows: uses api-graphql step kind', () => {
  const flows = emitGraphQLFlows(queryMatrix);
  const usersHappy = flows.find((f) => f.id === 'graphql:query:users:happy');
  assert.ok(usersHappy);
  const gqlStep = usersHappy.steps.find((s) => s.kind === 'api-graphql');
  assert.ok(gqlStep);
  assert.strictEqual(gqlStep.endpoint, '/graphql');
  assert.ok(gqlStep.query.includes('query users'));
  assert.strictEqual(gqlStep.operationName, 'users');
});

test('emitGraphQLFlows: includes sample variables', () => {
  const flows = emitGraphQLFlows(queryMatrix);
  const userHappy = flows.find((f) => f.id === 'graphql:query:user:happy');
  const gqlStep = userHappy.steps.find((s) => s.kind === 'api-graphql');
  assert.deepStrictEqual(gqlStep.variables, { id: 'probe-id-1' });
});

test('emitGraphQLFlows: expect step asserts data non-null', () => {
  const flows = emitGraphQLFlows(queryMatrix);
  const usersHappy = flows.find((f) => f.id === 'graphql:query:users:happy');
  const expectStep = usersHappy.steps.find((s) => s.kind === 'expect');
  assert.strictEqual(expectStep.status, 200);
  assert.ok(expectStep.bodyHas.includes('data'));
});

test('emitGraphQLFlows: emits :missing-required-var for queries with required args', () => {
  const flows = emitGraphQLFlows(queryMatrix);
  const missingVarFlow = flows.find((f) => f.id === 'graphql:query:user:missing-required-var:id');
  assert.ok(missingVarFlow);
  assert.strictEqual(missingVarFlow.steps.length, 2);
});

test('emitGraphQLFlows: omits required var in :missing-required-var flow', () => {
  const flows = emitGraphQLFlows(queryMatrix);
  const missingVarFlow = flows.find((f) => f.id === 'graphql:query:user:missing-required-var:id');
  const gqlStep = missingVarFlow.steps.find((s) => s.kind === 'api-graphql');
  assert.strictEqual(gqlStep.variables.id, undefined);
});

test('emitGraphQLFlows: :missing-required-var expect asserts errors mention var name', () => {
  const flows = emitGraphQLFlows(queryMatrix);
  const missingVarFlow = flows.find((f) => f.id === 'graphql:query:user:missing-required-var:id');
  const expectStep = missingVarFlow.steps.find((s) => s.kind === 'expect');
  assert.ok(expectStep.bodyHas.includes('errors'));
  assert.strictEqual(expectStep.errorFieldMentions, 'id');
});

test('emitGraphQLFlows: :missing-required-var expects status 400', () => {
  const flows = emitGraphQLFlows(queryMatrix);
  const missingVarFlow = flows.find((f) => f.id === 'graphql:query:user:missing-required-var:id');
  const expectStep = missingVarFlow.steps.find((s) => s.kind === 'expect');
  assert.strictEqual(expectStep.status, 400);
});

test('emitGraphQLFlows: no :missing-required-var for optional-only args', () => {
  const flows = emitGraphQLFlows(queryMatrix);
  const usersFlows = flows.filter((f) => f.id.startsWith('graphql:query:users'));
  assert.strictEqual(usersFlows.length, 1); // only :happy
});

test('emitGraphQLFlows: correct contract fields on query flow', () => {
  const flows = emitGraphQLFlows(queryMatrix);
  const flow = flows.find((f) => f.id === 'graphql:query:user:happy');
  assert.strictEqual(flow.contract.endpoint, 'QUERY user');
  assert.strictEqual(flow.contract.kind, 'graphql-query-happy');
  assert.strictEqual(flow.contract.source, '/graphql (introspection)');
});

// ---------------------------------------------------------------------------
// flows-generator.js — emitGraphQLFlows (mutations)
// ---------------------------------------------------------------------------

const mutationMatrix = {
  graphql: {
    endpoint: '/graphql',
    source: 'introspection',
    queries: [],
    mutations: [
      {
        name: 'createUser',
        args: [
          { name: 'name', type: 'String!', required: true },
          { name: 'email', type: 'String!', required: true },
        ],
        returnType: 'User',
      },
      {
        name: 'deleteUser',
        args: [{ name: 'id', type: 'ID!', required: true }],
        returnType: 'Boolean',
      },
    ],
    subscriptions: [],
    types: [],
  },
};

test('emitGraphQLFlows: emits :happy flow for each mutation', () => {
  const flows = emitGraphQLFlows(mutationMatrix);
  const happyFlows = flows.filter((f) => f.id.endsWith(':happy'));
  assert.strictEqual(happyFlows.length, 2);
});

test('emitGraphQLFlows: emits :missing-required-var for mutations', () => {
  const flows = emitGraphQLFlows(mutationMatrix);
  const missingFlows = flows.filter((f) => f.id.includes(':missing-required-var'));
  assert.strictEqual(missingFlows.length, 2); // one per mutation
});

test('emitGraphQLFlows: emits :unauthorized when authBootstrapAvailable', () => {
  const flows = emitGraphQLFlows(mutationMatrix, { authBootstrapAvailable: true });
  const unauthFlows = flows.filter((f) => f.id.endsWith(':unauthorized'));
  assert.strictEqual(unauthFlows.length, 2);
});

test('emitGraphQLFlows: no :unauthorized when no auth', () => {
  const flows = emitGraphQLFlows(mutationMatrix, { authBootstrapAvailable: false });
  const unauthFlows = flows.filter((f) => f.id.endsWith(':unauthorized'));
  assert.strictEqual(unauthFlows.length, 0);
});

test('emitGraphQLFlows: prepends setAuth step when auth available', () => {
  const flows = emitGraphQLFlows(mutationMatrix, { authBootstrapAvailable: true });
  const happy = flows.find((f) => f.id === 'graphql:mutation:createUser:happy');
  assert.strictEqual(happy.steps[0].kind, 'setAuth');
  assert.strictEqual(happy.steps[0].binding, 'accessToken');
  assert.ok(happy.dependsOn.includes('chain:auth-bootstrap'));
});

test('emitGraphQLFlows: no setAuth when no auth', () => {
  const flows = emitGraphQLFlows(mutationMatrix);
  const happy = flows.find((f) => f.id === 'graphql:mutation:createUser:happy');
  assert.strictEqual(happy.steps[0].kind, 'api-graphql');
  assert.deepStrictEqual(happy.dependsOn, []);
});

test('emitGraphQLFlows: mutation query string uses mutation keyword', () => {
  const flows = emitGraphQLFlows(mutationMatrix);
  const happy = flows.find((f) => f.id === 'graphql:mutation:createUser:happy');
  const gqlStep = happy.steps.find((s) => s.kind === 'api-graphql');
  assert.ok(gqlStep.query.includes('mutation createUser'));
});

test('emitGraphQLFlows: scalar return type omits __typename', () => {
  const flows = emitGraphQLFlows(mutationMatrix);
  const happy = flows.find((f) => f.id === 'graphql:mutation:deleteUser:happy');
  const gqlStep = happy.steps.find((s) => s.kind === 'api-graphql');
  assert.ok(!gqlStep.query.includes('__typename'));
});

test('emitGraphQLFlows: :unauthorized contract has correct kind', () => {
  const flows = emitGraphQLFlows(mutationMatrix, { authBootstrapAvailable: true });
  const unauth = flows.find((f) => f.id === 'graphql:mutation:createUser:unauthorized');
  assert.strictEqual(unauth.contract.kind, 'graphql-mutation-unauthorized');
  assert.strictEqual(unauth.contract.endpoint, 'MUTATION createUser');
});

// ---------------------------------------------------------------------------
// flows-generator.js — emitGraphQLFlows (custom endpoint)
// ---------------------------------------------------------------------------

test('emitGraphQLFlows: uses custom endpoint', () => {
  const matrix = {
    graphql: {
      endpoint: '/api/graphql',
      source: 'introspection',
      queries: [{ name: 'hello', args: [], returnType: 'String' }],
      mutations: [],
    },
  };
  const flows = emitGraphQLFlows(matrix);
  const gqlStep = flows[0].steps.find((s) => s.kind === 'api-graphql');
  assert.strictEqual(gqlStep.endpoint, '/api/graphql');
});

test('emitGraphQLFlows: defaults to /graphql when endpoint missing', () => {
  const matrix = {
    graphql: {
      source: 'source-scan',
      queries: [{ name: 'hello', args: [], returnType: 'String' }],
      mutations: [],
    },
  };
  const flows = emitGraphQLFlows(matrix);
  const gqlStep = flows[0].steps.find((s) => s.kind === 'api-graphql');
  assert.strictEqual(gqlStep.endpoint, '/graphql');
});

// ---------------------------------------------------------------------------
// flows-generator.js — emitGraphQLFlows (mixed)
// ---------------------------------------------------------------------------

test('emitGraphQLFlows: emits flows for both queries and mutations', () => {
  const matrix = {
    graphql: {
      endpoint: '/graphql',
      source: 'introspection',
      queries: [{ name: 'users', args: [], returnType: '[User]' }],
      mutations: [{ name: 'createUser', args: [{ name: 'name', type: 'String!', required: true }], returnType: 'User' }],
    },
  };
  const flows = emitGraphQLFlows(matrix);
  const queryFlows = flows.filter((f) => f.id.startsWith('graphql:query:'));
  const mutationFlows = flows.filter((f) => f.id.startsWith('graphql:mutation:'));
  assert.ok(queryFlows.length > 0);
  assert.ok(mutationFlows.length > 0);
});

// ---------------------------------------------------------------------------
// flows-generator.js — emitGraphQLFlows (mutation missing-required-var status)
// ---------------------------------------------------------------------------

test('emitGraphQLFlows: mutation :missing-required-var expects status 400', () => {
  const flows = emitGraphQLFlows(mutationMatrix);
  const missingFlow = flows.find((f) => f.id.includes(':missing-required-var'));
  const expectStep = missingFlow.steps.find((s) => s.kind === 'expect');
  assert.strictEqual(expectStep.status, 400);
});

// ---------------------------------------------------------------------------
// flows-generator.js — emitGraphQLFlows (INPUT_OBJECT variable handling)
// ---------------------------------------------------------------------------

test('emitGraphQLFlows: mutation with INPUT_OBJECT arg populates variable from types', () => {
  const matrix = {
    graphql: {
      endpoint: '/graphql',
      source: 'introspection',
      queries: [],
      mutations: [
        {
          name: 'createItem',
          args: [{ name: 'input', type: 'CreateItemInput!', required: true }],
          returnType: 'Item',
        },
      ],
      types: [
        { name: 'CreateItemInput', kind: 'INPUT_OBJECT', fields: [
          { name: 'title', type: 'String!' },
          { name: 'count', type: 'Int' },
        ]},
        { name: 'Item', kind: 'OBJECT', fields: [
          { name: 'id', type: 'ID!' },
        ]},
      ],
    },
  };
  const flows = emitGraphQLFlows(matrix);
  const happy = flows.find((f) => f.id === 'graphql:mutation:createItem:happy');
  const gqlStep = happy.steps.find((s) => s.kind === 'api-graphql');
  assert.deepStrictEqual(gqlStep.variables, { input: { title: 'probe-sample', count: 1 } });
});

// ---------------------------------------------------------------------------
// BUG #6: resolveTypeName — deep NON_NULL(LIST(NON_NULL(OBJECT))) chains
// ---------------------------------------------------------------------------

test('resolveTypeName: NON_NULL(LIST(NON_NULL(OBJECT))) = [User!]!', () => {
  assert.strictEqual(
    resolveTypeName({
      kind: 'NON_NULL',
      ofType: {
        kind: 'LIST',
        ofType: {
          kind: 'NON_NULL',
          ofType: { name: 'User', kind: 'OBJECT' },
        },
      },
    }),
    '[User!]!',
  );
});

test('resolveTypeName: LIST(NON_NULL(SCALAR)) = [String!]', () => {
  assert.strictEqual(
    resolveTypeName({
      kind: 'LIST',
      ofType: {
        kind: 'NON_NULL',
        ofType: { name: 'String', kind: 'SCALAR' },
      },
    }),
    '[String!]',
  );
});

// ---------------------------------------------------------------------------
// BUG #7: ENUM type handling in parseIntrospectionSchema
// ---------------------------------------------------------------------------

test('parseIntrospectionSchema: extracts ENUM types with enumValues', () => {
  const schema = {
    queryType: { name: 'Query' },
    mutationType: null,
    subscriptionType: null,
    types: [
      {
        name: 'Query', kind: 'OBJECT',
        fields: [{ name: 'hello', args: [], type: { name: 'String', kind: 'SCALAR' } }],
      },
      {
        name: 'Role', kind: 'ENUM',
        enumValues: [{ name: 'ADMIN' }, { name: 'USER' }, { name: 'GUEST' }],
        fields: null,
      },
    ],
  };
  const result = parseIntrospectionSchema(schema);
  const enumType = result.types.find((t) => t.name === 'Role');
  assert.ok(enumType);
  assert.strictEqual(enumType.kind, 'ENUM');
  assert.deepStrictEqual(enumType.enumValues, ['ADMIN', 'USER', 'GUEST']);
  assert.deepStrictEqual(enumType.fields, []);
});

test('parseIntrospectionSchema: ENUM with no enumValues produces empty array', () => {
  const schema = {
    queryType: null, mutationType: null, subscriptionType: null,
    types: [
      { name: 'EmptyEnum', kind: 'ENUM', enumValues: null, fields: null },
    ],
  };
  const result = parseIntrospectionSchema(schema);
  const enumType = result.types.find((t) => t.name === 'EmptyEnum');
  assert.ok(enumType);
  assert.deepStrictEqual(enumType.enumValues, []);
});

// ---------------------------------------------------------------------------
// BUG #3: Custom scalar handling — detectors/graphql.js sampleValueForType
// ---------------------------------------------------------------------------

test('sampleValueForType: DateTime -> ISO date string', () => {
  assert.strictEqual(sampleValueForType('DateTime'), '2024-01-01T00:00:00.000Z');
  assert.strictEqual(sampleValueForType('DateTime!'), '2024-01-01T00:00:00.000Z');
});

test('sampleValueForType: Date -> ISO date string', () => {
  assert.strictEqual(sampleValueForType('Date'), '2024-01-01T00:00:00.000Z');
});

test('sampleValueForType: JSON -> empty object', () => {
  assert.deepStrictEqual(sampleValueForType('JSON'), {});
  assert.deepStrictEqual(sampleValueForType('JSONObject!'), {});
});

test('sampleValueForType: UUID -> zero UUID', () => {
  assert.strictEqual(sampleValueForType('UUID'), '00000000-0000-0000-0000-000000000001');
});

test('sampleValueForType: Email -> probe email', () => {
  assert.strictEqual(sampleValueForType('Email'), 'probe@example.com');
  assert.strictEqual(sampleValueForType('EmailAddress'), 'probe@example.com');
});

test('sampleValueForType: URL -> example URL', () => {
  assert.strictEqual(sampleValueForType('URL'), 'https://example.com');
});

test('sampleValueForType: BigInt -> 1', () => {
  assert.strictEqual(sampleValueForType('BigInt'), 1);
});

test('sampleValueForType: Decimal -> 1.00 string', () => {
  assert.strictEqual(sampleValueForType('Decimal'), '1.00');
});

test('sampleValueForType: Upload -> null (needs special handling)', () => {
  assert.strictEqual(sampleValueForType('Upload'), null);
});

// ---------------------------------------------------------------------------
// BUG #3: Custom scalar handling — flows-generator sampleValueForGraphQLType
// ---------------------------------------------------------------------------

test('sampleValueForGraphQLType: DateTime -> ISO date string', () => {
  assert.strictEqual(sampleValueForGraphQLType('DateTime!'), '2024-01-01T00:00:00.000Z');
});

test('sampleValueForGraphQLType: JSON -> empty object', () => {
  assert.deepStrictEqual(sampleValueForGraphQLType('JSON'), {});
});

test('sampleValueForGraphQLType: UUID -> zero UUID', () => {
  assert.strictEqual(sampleValueForGraphQLType('UUID!'), '00000000-0000-0000-0000-000000000001');
});

test('sampleValueForGraphQLType: Email -> probe email', () => {
  assert.strictEqual(sampleValueForGraphQLType('EmailAddress'), 'probe@example.com');
});

test('sampleValueForGraphQLType: [DateTime!]! wraps in array', () => {
  assert.deepStrictEqual(sampleValueForGraphQLType('[DateTime!]!'), ['2024-01-01T00:00:00.000Z']);
});

// ---------------------------------------------------------------------------
// BUG #7 in flows-generator: ENUM type sample value
// ---------------------------------------------------------------------------

test('sampleValueForGraphQLType: ENUM type uses first enumValue', () => {
  const types = [
    { name: 'Status', kind: 'ENUM', enumValues: ['ACTIVE', 'INACTIVE', 'PENDING'], fields: [] },
  ];
  assert.strictEqual(sampleValueForGraphQLType('Status!', types), 'ACTIVE');
});

test('sampleValueForGraphQLType: ENUM with no enumValues returns empty object', () => {
  const types = [
    { name: 'EmptyEnum', kind: 'ENUM', enumValues: [], fields: [] },
  ];
  assert.deepStrictEqual(sampleValueForGraphQLType('EmptyEnum', types), {});
});

test('sampleValueForGraphQLType: [Status!] wraps enum value in array', () => {
  const types = [
    { name: 'Status', kind: 'ENUM', enumValues: ['OPEN', 'CLOSED'], fields: [] },
  ];
  assert.deepStrictEqual(sampleValueForGraphQLType('[Status!]', types), ['OPEN']);
});

test('buildSampleVarsForArgs: ENUM arg resolved when types provided', () => {
  const types = [
    { name: 'Priority', kind: 'ENUM', enumValues: ['LOW', 'MEDIUM', 'HIGH'], fields: [] },
  ];
  const args = [{ name: 'priority', type: 'Priority!', required: true }];
  const result = buildSampleVarsForArgs(args, types);
  assert.deepStrictEqual(result, { priority: 'LOW' });
});

// ---------------------------------------------------------------------------
// BUG #1: Subscription flow emission
// ---------------------------------------------------------------------------

const subscriptionMatrix = {
  graphql: {
    endpoint: '/graphql',
    source: 'introspection',
    queries: [],
    mutations: [],
    subscriptions: [
      { name: 'onUserCreated', args: [], returnType: 'User' },
      { name: 'onMessage', args: [{ name: 'channelId', type: 'ID!', required: true }], returnType: 'Message' },
    ],
    types: [],
  },
};

test('emitGraphQLFlows: emits :http-post flow for each subscription', () => {
  const flows = emitGraphQLFlows(subscriptionMatrix);
  const subFlows = flows.filter((f) => f.id.startsWith('graphql:subscription:'));
  assert.strictEqual(subFlows.length, 2);
});

test('emitGraphQLFlows: subscription :http-post uses subscription keyword in query', () => {
  const flows = emitGraphQLFlows(subscriptionMatrix);
  const flow = flows.find((f) => f.id === 'graphql:subscription:onUserCreated:http-post');
  assert.ok(flow);
  const gqlStep = flow.steps.find((s) => s.kind === 'api-graphql');
  assert.ok(gqlStep.query.includes('subscription onUserCreated'));
});

test('emitGraphQLFlows: subscription :http-post expects errors in body', () => {
  const flows = emitGraphQLFlows(subscriptionMatrix);
  const flow = flows.find((f) => f.id === 'graphql:subscription:onUserCreated:http-post');
  const expectStep = flow.steps.find((s) => s.kind === 'expect');
  assert.strictEqual(expectStep.status, 200);
  assert.ok(expectStep.bodyHas.includes('errors'));
});

test('emitGraphQLFlows: subscription with args includes sample variables', () => {
  const flows = emitGraphQLFlows(subscriptionMatrix);
  const flow = flows.find((f) => f.id === 'graphql:subscription:onMessage:http-post');
  const gqlStep = flow.steps.find((s) => s.kind === 'api-graphql');
  assert.deepStrictEqual(gqlStep.variables, { channelId: 'probe-id-1' });
});

test('emitGraphQLFlows: subscription contract has correct kind', () => {
  const flows = emitGraphQLFlows(subscriptionMatrix);
  const flow = flows.find((f) => f.id === 'graphql:subscription:onMessage:http-post');
  assert.strictEqual(flow.contract.kind, 'graphql-subscription-http-post');
  assert.strictEqual(flow.contract.endpoint, 'SUBSCRIPTION onMessage');
});

test('emitGraphQLFlows: returns [] when only subscriptions and they are null/undefined', () => {
  const flows = emitGraphQLFlows({ graphql: { queries: null, mutations: null, subscriptions: null } });
  assert.deepStrictEqual(flows, []);
});

test('emitGraphQLFlows: emits flows when only subscriptions present (no queries/mutations)', () => {
  const matrix = {
    graphql: {
      endpoint: '/graphql',
      source: 'introspection',
      subscriptions: [{ name: 'tick', args: [], returnType: 'Int' }],
    },
  };
  const flows = emitGraphQLFlows(matrix);
  assert.strictEqual(flows.length, 1);
  assert.strictEqual(flows[0].id, 'graphql:subscription:tick:http-post');
});

// ---------------------------------------------------------------------------
// BUG #4: buildSelectionSet — nested selection sets for OBJECT return types
// ---------------------------------------------------------------------------

test('buildSelectionSet: returns { __typename } when no types provided', () => {
  assert.strictEqual(buildSelectionSet('User', [], 0), '{ __typename }');
});

test('buildSelectionSet: returns { __typename } when type not found', () => {
  const types = [{ name: 'Other', kind: 'OBJECT', fields: [{ name: 'id', type: 'ID!' }] }];
  assert.strictEqual(buildSelectionSet('User', types, 0), '{ __typename }');
});

test('buildSelectionSet: builds scalar fields for known type', () => {
  const types = [
    { name: 'User', kind: 'OBJECT', fields: [
      { name: 'id', type: 'ID!' },
      { name: 'name', type: 'String!' },
      { name: 'age', type: 'Int' },
    ]},
  ];
  const result = buildSelectionSet('User', types, 0);
  assert.ok(result.includes('__typename'));
  assert.ok(result.includes('id'));
  assert.ok(result.includes('name'));
  assert.ok(result.includes('age'));
});

test('buildSelectionSet: recurses into nested OBJECT types', () => {
  const types = [
    { name: 'Post', kind: 'OBJECT', fields: [
      { name: 'id', type: 'ID!' },
      { name: 'author', type: 'User!' },
    ]},
    { name: 'User', kind: 'OBJECT', fields: [
      { name: 'id', type: 'ID!' },
      { name: 'name', type: 'String' },
    ]},
  ];
  const result = buildSelectionSet('Post', types, 0);
  assert.ok(result.includes('author'));
  assert.ok(result.includes('name'));
});

test('buildSelectionSet: stops recursion at depth 3', () => {
  const types = [
    { name: 'A', kind: 'OBJECT', fields: [{ name: 'b', type: 'B!' }] },
    { name: 'B', kind: 'OBJECT', fields: [{ name: 'c', type: 'C!' }] },
    { name: 'C', kind: 'OBJECT', fields: [{ name: 'd', type: 'D!' }] },
    { name: 'D', kind: 'OBJECT', fields: [{ name: 'id', type: 'ID!' }] },
  ];
  // At depth 0 -> A, depth 1 -> B, depth 2 -> C, depth 3 -> __typename fallback
  const result = buildSelectionSet('A', types, 0);
  assert.ok(result.includes('__typename'));
  // D's fields should NOT be expanded (depth exceeded)
  assert.ok(!result.includes(' id'));
});

// ---------------------------------------------------------------------------
// BUG #5: Relay connection pattern detection
// ---------------------------------------------------------------------------

test('buildSelectionSet: handles Relay connection pattern with edges/node/pageInfo', () => {
  const types = [
    { name: 'UserConnection', kind: 'OBJECT', fields: [
      { name: 'edges', type: '[UserEdge!]!' },
      { name: 'pageInfo', type: 'PageInfo!' },
      { name: 'totalCount', type: 'Int!' },
    ]},
    { name: 'UserEdge', kind: 'OBJECT', fields: [
      { name: 'node', type: 'User!' },
      { name: 'cursor', type: 'String!' },
    ]},
    { name: 'User', kind: 'OBJECT', fields: [
      { name: 'id', type: 'ID!' },
      { name: 'name', type: 'String!' },
    ]},
    { name: 'PageInfo', kind: 'OBJECT', fields: [
      { name: 'hasNextPage', type: 'Boolean!' },
      { name: 'hasPreviousPage', type: 'Boolean!' },
      { name: 'startCursor', type: 'String' },
      { name: 'endCursor', type: 'String' },
    ]},
  ];
  const result = buildSelectionSet('UserConnection', types, 0);
  // Should have edges with nested node and cursor
  assert.ok(result.includes('edges'));
  assert.ok(result.includes('node'));
  assert.ok(result.includes('cursor'));
  // Should have pageInfo with its fields
  assert.ok(result.includes('pageInfo'));
  assert.ok(result.includes('hasNextPage'));
  assert.ok(result.includes('endCursor'));
  // Should have totalCount
  assert.ok(result.includes('totalCount'));
});

// ---------------------------------------------------------------------------
// buildQueryString with types — selection set integration
// ---------------------------------------------------------------------------

test('buildQueryString: uses field-level selection set when types provided', () => {
  const types = [
    { name: 'User', kind: 'OBJECT', fields: [
      { name: 'id', type: 'ID!' },
      { name: 'name', type: 'String!' },
    ]},
  ];
  const op = { name: 'user', args: [{ name: 'id', type: 'ID!', required: true }], returnType: 'User' };
  const result = buildQueryString(op, 'query', types);
  assert.ok(result.includes('id'));
  assert.ok(result.includes('name'));
  assert.ok(!result.includes('{ __typename }'));
});

test('buildQueryString: falls back to __typename for unknown return type even with types', () => {
  const types = [
    { name: 'Other', kind: 'OBJECT', fields: [{ name: 'x', type: 'String' }] },
  ];
  const op = { name: 'getUnknown', args: [], returnType: 'Unknown' };
  const result = buildQueryString(op, 'query', types);
  assert.ok(result.includes('__typename'));
});

test('buildQueryString: still omits selection set for custom scalar return types', () => {
  const op = { name: 'serverTime', args: [], returnType: 'DateTime' };
  const result = buildQueryString(op, 'query', []);
  assert.strictEqual(result, 'query serverTime { serverTime }');
});

test('buildQueryString: without types arg, uses __typename fallback', () => {
  const op = { name: 'user', args: [], returnType: 'User' };
  const result = buildQueryString(op, 'query');
  assert.ok(result.includes('__typename'));
});

// ---------------------------------------------------------------------------
// Enum handling in buildQueryString + buildSelectionSet (Bug fix)
// ---------------------------------------------------------------------------

test('buildQueryString: ENUM return type omits selection set', () => {
  const types = [
    { name: 'Status', kind: 'ENUM', enumValues: ['OPEN', 'DONE'], fields: [] },
  ];
  const op = { name: 'getStatuses', args: [], returnType: '[Status!]!' };
  const result = buildQueryString(op, 'query', types);
  assert.strictEqual(result, 'query getStatuses { getStatuses }');
});

test('buildQueryString: ENUM return type (non-list) omits selection set', () => {
  const types = [
    { name: 'Role', kind: 'ENUM', enumValues: ['ADMIN', 'USER'], fields: [] },
  ];
  const op = { name: 'getRole', args: [], returnType: 'Role!' };
  const result = buildQueryString(op, 'query', types);
  assert.strictEqual(result, 'query getRole { getRole }');
});

test('buildSelectionSet: ENUM fields are treated as scalars (no sub-selection)', () => {
  const types = [
    { name: 'User', kind: 'OBJECT', fields: [
      { name: 'id', type: 'ID!' },
      { name: 'role', type: 'Role!' },
    ]},
    { name: 'Role', kind: 'ENUM', enumValues: ['ADMIN', 'USER'], fields: [] },
  ];
  const result = buildSelectionSet('User', types, 0);
  assert.ok(result.includes('role'), 'should include role field');
  assert.ok(!result.includes('role {'), 'role should not have a selection set');
  assert.ok(!result.includes('role { __typename }'), 'role should not have __typename');
});

test('buildSelectionSet: mixed OBJECT + ENUM fields', () => {
  const types = [
    { name: 'Task', kind: 'OBJECT', fields: [
      { name: 'id', type: 'ID!' },
      { name: 'status', type: 'TaskStatus!' },
      { name: 'assignee', type: 'User!' },
    ]},
    { name: 'TaskStatus', kind: 'ENUM', enumValues: ['OPEN', 'DONE'], fields: [] },
    { name: 'User', kind: 'OBJECT', fields: [
      { name: 'id', type: 'ID!' },
      { name: 'name', type: 'String!' },
    ]},
  ];
  const result = buildSelectionSet('Task', types, 0);
  // status should be plain (enum), assignee should recurse (object)
  assert.ok(result.includes('status'), 'should include status');
  assert.ok(!result.includes('status {'), 'status should not have selection set');
  assert.ok(result.includes('assignee {'), 'assignee should have selection set');
});
