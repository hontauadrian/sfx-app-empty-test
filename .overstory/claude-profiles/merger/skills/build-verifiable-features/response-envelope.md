# Response Envelope

## When to use this pattern

Wrapping every successful response in a uniform envelope (e.g.
`{ success: true, data: <payload> }`) helps:

- Distinguish 2xx success from 4xx/5xx error responses on the client
  without inspecting the status separately.
- Attach metadata (request id, server time, deprecation warnings)
  without polluting the payload schema.
- Maintain forward compatibility — adding sibling fields to the
  envelope doesn't break clients reading `body.data`.

It also has a cost: pagination, GraphQL-style `data` fields, and bare
binary downloads all need to know whether the wrapper applies.

## How to declare it (so the probe verifies it)

The probe's `detectors/response-envelope.js` performs a static AST scan:

1. **NestJS** — finds `app.useGlobalInterceptors(new X())` in
   `apps/api/src/main.ts`, resolves `X`, parses the `.pipe(map(...))`
   body to extract the wrapper key.
2. **Express** — finds global middleware that overrides `res.json`.
3. **Fastify** — finds `addHook('preSerialization', ...)`.
4. **Koa** — finds middleware that wraps `ctx.body`.
5. **OpenAPI consensus** — if no interceptor is found but ≥80% of
   `responses[2xx].schema` declarations share a common wrapper key,
   infers the wrapper statically from the spec.

Result is `matrix.responseEnvelope.successWrapper`: a path array, e.g.
`['data']` or `['payload', 'data']` for N-deep wrappers, or `null` for
bare responses.

The interceptor parser is **brace-balanced**: `.pipe(map((data) => ({
result: { ok: true, payload: { data } } })))` resolves to
`successWrapper: ['result', 'payload', 'data']`. Nested object spreads
and ternary expressions work as long as the runtime shape is
deterministic.

The OpenAPI consensus pass is **`$ref`-recursive**: response schemas
that reference shared components (e.g. `#/components/schemas/Envelope`)
are followed through and the wrapper key is extracted from the
referenced schema. Cycles are detected and broken at depth 10.

The probe then automatically unwraps when matching response bodies.
For example, when a flow asserts `bodyHas: ['accessToken']`, the
probe checks `body.data.accessToken` if `successWrapper === ['data']`.

## Code template — NestJS TransformInterceptor

In `apps/api/src/common/interceptors/transform.interceptor.ts`:

```ts
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable, map } from 'rxjs';

interface SuccessResponse<T> {
  success: true;
  data: T;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, SuccessResponse<T> | T> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<SuccessResponse<T> | T> {
    // Skip wrapping for GraphQL — Apollo handles its own response format.
    // Use context.getType() (not GqlExecutionContext.getInfo()) because
    // normalizeResolverArgs makes getInfo() return Express's `next` for REST.
    if (context.getType<string>() === 'graphql') {
      return next.handle();
    }

    return next.handle().pipe(
      map((data) => ({ success: true, data })),
    );
  }
}
```

In `apps/api/src/main.ts`:

```ts
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalInterceptors(new TransformInterceptor());
  // ...
}
```

The detector will read this and emit:

```
matrix.responseEnvelope = {
  successWrapper: ['data'],
  source: 'apps/api/src/common/interceptors/transform.interceptor.ts',
}
```

## Endpoints that MUST bypass the wrapper

Some response shapes break when wrapped — opt them out:

- **Binary downloads** (`@ApiProduces('application/pdf')` etc.) — use
  `@Res()` and write the buffer directly. The probe's
  `isBinaryDownloadEndpoint(ep)` check skips envelope assertions.
- **SSE** (`@Sse('stream')`) — NestJS's `@Sse` decorator bypasses
  interceptors automatically.
- **GraphQL** — the interceptor must check `context.getType() ===
  'graphql'` and return `next.handle()` unwrapped.
- **Link-header pagination** — when responding with a bare array and
  pagination metadata in headers, set
  `paginationProfile.isBareArray: true` (the detector reads
  `@ApiResponse({ schema: { type: 'array' } })`).

## What the probe will assert (when present)

The envelope itself is not directly asserted with a dedicated flow.
Instead, every other flow's assertions transparently unwrap. For
example:

- A flow that captures `accessToken` from a login response uses
  `$.accessToken` as the path. With `successWrapper: ['data']`, the
  probe captures `$.data.accessToken` automatically.
- A flow that asserts `bodyHas: ['items']` on a list endpoint becomes
  `bodyHas: ['data.items']` automatically.

If your code emits a response that does NOT match the declared
envelope (e.g. controller bypasses the interceptor), the probe's
unwrap finds nothing and the assertion fails — surfacing the drift.

## Anti-patterns the probe will surface as drift

- Manually wrapping in some controllers (`return { success: true,
  data: ... }`) when the global interceptor already wraps — produces
  `{ success: true, data: { success: true, data: actual } }`. The
  probe's unwrap finds `body.data` (an object) where it expects the
  payload (e.g. an array) and the assertion fails.
- Manually setting `@Res()` and writing JSON to bypass the
  interceptor on a route that returns a normal payload — the probe
  expects the envelope but gets the bare body. Either bypass
  intentionally (binary, SSE) or use `@Res({ passthrough: true })`
  to keep the interceptor active.
- Returning different envelope shapes from REST and GraphQL routes
  in the same app, with the interceptor incorrectly wrapping
  GraphQL — Apollo clients break. Use `context.getType() ===
  'graphql'` (see the template above).
- Adding new top-level fields to the envelope (`{ success, data,
  meta }`) without updating the OpenAPI schema response wrapper —
  the static detector still reports `['data']` and assertions silently
  succeed; consider declaring the meta in OpenAPI response schemas.

## Source of truth the probe scans

- `apps/api/src/main.ts` — the `useGlobalInterceptors(new X())` call.
- The interceptor source file — the `.pipe(map(...))` body literal.
- The compiled OpenAPI document — `responses[2xx].schema` properties
  consensus when no interceptor is found.
- `matrix.responseEnvelope.successWrapper` — the extracted path,
  consumed transparently by the probe's HTTP runner.
