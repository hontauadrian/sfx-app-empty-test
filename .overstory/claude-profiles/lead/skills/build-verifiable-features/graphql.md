# GraphQL

## When to use this pattern

You're building a typed query layer with selective field fetching,
nested traversal, or a single endpoint serving many client variants.
Use GraphQL when REST resource shapes get fan-out-y or when the client
team needs schema-driven type generation.

## How to declare it (so the probe verifies it)

The probe's `detectors/graphql.js` uses **introspection against the live
endpoint** — it boots the API and POSTs a standard
`__schema { queryType, mutationType, types { ... } }` query to
`/graphql` (or whatever endpoint you declare).

That means: as long as your schema is reachable and introspection is
enabled (the default in dev), the probe automatically discovers every
query and mutation.

The detector emits `matrix.graphql`:

```
{
  endpoint: '/graphql',
  queries: [
    { name: 'me', args: [], returnType: 'User' },
    { name: 'project', args: [{ name: 'id', type: 'ID!', required: true }], returnType: 'Project' },
  ],
  mutations: [
    { name: 'createProject', args: [{ name: 'input', type: 'CreateProjectInput!', required: true }], returnType: 'Project' },
  ],
  types: [
    { name: 'CreateProjectInput', fields: [{ name: 'name', type: 'String!' }] },
  ],
}
```

## Code template (NestJS code-first)

```ts
import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';

@Resolver(() => Project)
export class ProjectResolver {
  constructor(private readonly projects: ProjectService) {}

  @Query(() => Project, { nullable: true })
  project(@Args('id', { type: () => ID }) id: string) {
    return this.projects.findById(id);
  }

  @Mutation(() => Project)
  createProject(@Args('input') input: CreateProjectInput) {
    return this.projects.create(input);
  }
}

@InputType()
export class CreateProjectInput {
  @Field()
  name: string;

  @Field({ nullable: true })
  description?: string;
}
```

Configure the module so `/graphql` serves and introspection is enabled
in dev:

```ts
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  autoSchemaFile: 'schema.gql',
  introspection: true,
  playground: false,
});
```

If your API also has REST endpoints, ensure the success-response
interceptor (`TransformInterceptor`) checks
`context.getType<string>() === 'graphql'` and skips wrapping for
GraphQL — Apollo formats its own `{ data, errors }` response.

## What the probe will assert (when present)

Per query:

- `graphql:query:<name>:happy` — POST to `/graphql` with a fully-formed
  query and sample variables → expect `200` with `body.data` present.
- `graphql:query:<name>:missing-required-var:<varName>` — omit one
  required variable → expect `400` with `body.errors` present and
  `errors[0].message` mentioning the omitted var name.

Per mutation:

- `graphql:mutation:<name>:happy` — same as query (with auth bootstrap
  applied if the API has detected auth).
- `graphql:mutation:<name>:missing-required-var:<varName>` — same.
- `graphql:mutation:<name>:unauthorized` (only if auth detected) —
  send the mutation without auth header → expect `200` with `errors`
  populated (GraphQL convention is 200 + errors array, not 401).

Sample variables are generated automatically:
- `String` → `'probe-sample'`, `Int` → `1`, `Float` → `1.5`,
  `Boolean` → `true`, `ID` → `'probe-id-1'`.
- `INPUT_OBJECT` types are recursively built from their declared
  fields (deep nesting supported, depth-bounded by introspection).
- `ENUM` types → first enum value (probe reads `enumValues[0].name`).
- Custom `SCALAR` types → `'probe-sample'` unless declared otherwise.
  Declare with NestJS `@Scalar('DateTime')` and the probe will
  recognise the scalar via introspection.

### Selection-set rules — enum / union / interface

The probe's GraphQL query builder follows the **GraphQL spec**:

- **ENUM return types** — emitted WITHOUT a selection set
  (`{ status }` not `{ status { name } }`). A selection set on an
  enum field causes a parse error.
- **UNION return types** — emitted as `{ __typename ...on TypeA {
  ... } ...on TypeB { ... } }`. The probe expands every member type
  via introspection.
- **INTERFACE return types** — same inline-fragment expansion as
  unions; the resolver MUST implement `resolveType` (see below) or
  Apollo throws at runtime even though the query is valid.

### Code template — UNION + INTERFACE + Subscription

```ts
import { Resolver, Query, Subscription, ObjectType, Field, ID,
         InterfaceType, createUnionType } from '@nestjs/graphql';

@InterfaceType({
  resolveType: (value) => (value.kind === 'image' ? 'ImageNode' : 'TextNode'),
})
export abstract class Node {
  @Field(() => ID) id: string;
}

@ObjectType({ implements: () => Node })
export class TextNode implements Node {
  @Field(() => ID) id: string;
  @Field() body: string;
}

@ObjectType({ implements: () => Node })
export class ImageNode implements Node {
  @Field(() => ID) id: string;
  @Field() url: string;
}

export const SearchResult = createUnionType({
  name: 'SearchResult',
  types: () => [TextNode, ImageNode] as const,
  resolveType: (value) => (value.url ? 'ImageNode' : 'TextNode'),
});

@Resolver()
export class FeedResolver {
  @Query(() => [SearchResult])
  search(@Args('q') q: string) { /* ... */ }

  @Query(() => Node, { nullable: true })
  node(@Args('id', { type: () => ID }) id: string) { /* ... */ }

  @Subscription(() => TextNode, { name: 'textCreated' })
  textCreated() { /* return AsyncIterator */ }
}
```

`resolveType` is REQUIRED on every interface and union.
The probe's `:happy` query will run, but Apollo throws at execution
time without it. The probe surfaces that as a `:happy` failure with
`errors[0].message: "Abstract type ... must resolve to an Object type"`.

### Subscriptions

Subscriptions are introspected as `subscriptionType.fields`. The probe
emits `graphql:subscription:<name>:happy` — opens a WebSocket to
`/graphql` with the `graphql-ws` protocol, sends the subscribe
message with sample variables, expects at least one event within 5 s
or a `complete` ack.

### Relay-style connections

If a query returns a type matching the `Connection` pattern (i.e.
fields `edges: [TypeEdge]` + `pageInfo: PageInfo` with
`hasNextPage` / `endCursor`), the probe additionally emits
`graphql:query:<name>:cursor` — runs with `first: 1`, captures
`endCursor`, runs again with `after: $endCursor`, asserts
`pageInfo.hasNextPage` toggles correctly.

## Anti-patterns the probe will surface as drift

- Disabling introspection in dev — the probe cannot discover the schema
  and emits zero flows.
- Returning REST-style `200 + envelope wrapper` from your GraphQL
  endpoint instead of `{ data, errors }` — Apollo clients break and the
  probe's `bodyHas: ['data']` assertion fails.
- Returning a `400` for a valid query because of an unrelated
  middleware (e.g. CSRF on the `/graphql` route) — the probe's
  `:happy` flow fails.
- Required arg validation that returns 200 with no error — the probe
  will catch the missing rejection.
- Declaring a UNION/INTERFACE return without `resolveType` — Apollo
  throws at runtime; `:happy` flow records `errors` populated with
  "must resolve to an Object type". Either implement `resolveType`
  on the union/interface, or change the field to a concrete type.
- Returning an enum field with a selection set in the resolver schema
  — query builder will produce `{ status }`, server returns
  `{"status":"ACTIVE"}`. If you incorrectly typed the enum as an
  ObjectType the probe's query parser fails. Fix by registering as
  `@registerEnumType`.
- Subscription resolver missing `AsyncIterator` return — `:happy`
  WebSocket times out. Use `pubSub.asyncIterator('eventName')`.

## Source of truth the probe scans

- The live `/graphql` endpoint — standard `__schema` introspection
  query, executed AFTER the stack boots.
- `matrix.graphql.endpoint` — defaults to `/graphql`, override via the
  detector's `endpoint` argument.
- `matrix.graphql.types` — used to expand `INPUT_OBJECT` arg types
  recursively when building sample variables.
