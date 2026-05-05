# CSRF Protection

## When to use this pattern

You need CSRF protection whenever your API accepts state-changing requests
(POST / PUT / PATCH / DELETE) from a browser using cookie-based session
auth. CSRF protection is unnecessary for pure bearer-token APIs (no
ambient credentials), but mandatory whenever cookies carry the session.

## How to declare it (so the probe verifies it)

**V1 strict — no path-regex.** The detector does NOT scan paths for
`/csrf-token` or similar. You MUST declare the issuer endpoint via
ONE of these explicit signals:

1. **`operationId: 'csrfToken'`** on the issuer GET (preferred —
   simplest, no extra metadata).
2. `SetMetadata('csrf:issuer', true)` decorator on the issuer method.
3. OpenAPI `x-csrf-issues-token: true` vendor extension on the issuer
   `@ApiOperation({ extensions: { 'x-csrf-issues-token': true } })`.

Without ONE of these signals, the detector emits
`CSRF_TOKEN_ENDPOINT_UNDETECTED` and the probe blocks until you
declare it.

The protected POST/PUT/PATCH/DELETE endpoints are recognised via:

- An `@ApiHeader({ name: 'x-csrf-token' })` (or whichever header name
  your middleware uses) on the method, **OR**
- An OpenAPI `securityScheme` of type `apiKey`, `in: header`, used
  via `@ApiSecurity('csrf-token')`.

The token field name on the issuer response and the header name on
protected endpoints are read **verbatim** from the declarations. The
probe does not guess. If you declare the issuer schema returns
`{ csrfToken: string }`, the probe captures `body.csrfToken`. If you
declare the protected endpoint reads header `x-xsrf-token`, the probe
sends `x-xsrf-token`. The two MUST stay aligned with the actual
middleware behaviour.

If two endpoints declare CSRF issuance signals (e.g. `operationId:
'csrfToken'` on two routes), the detector emits
`CSRF_ISSUER_AMBIGUOUS`.

## Code template

Step 1 — declare the security scheme in `apps/api/src/swagger.ts`:

```ts
import { DocumentBuilder } from '@nestjs/swagger';

export function buildSwagger(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('SFX API')
    .addApiKey(
      { type: 'apiKey', in: 'header', name: 'x-csrf-token' },
      'csrf-token',
    )
    .build();
  // ...
}
```

Step 2 — install the middleware in `apps/api/src/main.ts`:

```ts
import * as csurf from 'csurf';
// ...
app.use(csurf({ cookie: true }));
```

Step 3 — issue the token from a controller. **Set `operationId:
'csrfToken'` so the V1 strict detector can find it without
path-regex:**

```ts
import { Controller, Get, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Request } from 'express';

@ApiTags('csrf')
@Controller('csrf-token')
export class CsrfTokenController {
  @Get()
  @ApiOperation({ operationId: 'csrfToken' })
  @ApiResponse({ status: 200, schema: { properties: { token: { type: 'string' } } } })
  getToken(@Req() req: Request) {
    return { token: req.csrfToken() };
  }
}
```

Step 4 — protect a state-changing endpoint:

```ts
import { Controller, Post, Body } from '@nestjs/common';
import { ApiSecurity, ApiHeader, ApiResponse } from '@nestjs/swagger';

@ApiTags('comments')
@Controller('comments')
export class CommentsController {
  @Post()
  @ApiSecurity('csrf-token')
  @ApiHeader({ name: 'x-csrf-token', required: true })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 403, description: 'Missing or invalid CSRF token' })
  create(@Body() dto: CreateCommentDto) {
    // ...
  }
}
```

## What the probe will assert (when present)

- `csrf:with-token:happy` — `GET /csrf-token` → capture `token` →
  `POST <protected>` with `x-csrf-token` header → expect status `not 403`.
- `csrf:without-token:rejected` — `POST <protected>` without header →
  expect status `403`.

## Anti-patterns the probe will surface as drift

- Skipping `@ApiSecurity('csrf-token')` on the protected endpoint —
  the probe cannot find the protected POST and emits no flows.
- Returning 200 when CSRF token is missing — the probe expects 403.
- Skipping the `operationId: 'csrfToken'` (or equivalent extension)
  on the issuer — detector emits `CSRF_TOKEN_ENDPOINT_UNDETECTED`.
- Two endpoints both declaring `operationId: 'csrfToken'` — detector
  emits `CSRF_ISSUER_AMBIGUOUS`.
- Using `@Res()` and writing the response manually — the response shape
  no longer matches `@ApiResponse({ schema: ... })` and the probe
  reports drift.

## Source of truth the probe scans

- The compiled OpenAPI document — `operationId`, per-operation
  `extensions['x-csrf-issues-token']`, `components.securitySchemes`
  (apiKey-in-header), per-endpoint `parameters[in=header]`, and
  `security[]`.
- The `csrf:issuer` SetMetadata decorator (read via NestJS reflection
  during contract compile).
- `ep.swaggerDeclared.extensions[key]` — generic accessor for any
  vendor extension on an endpoint, used by the detector.
- `matrix.apiEndpoints[i].securityRequirement` — populated from
  `@ApiSecurity('csrf-token')`.
