# OAuth2

## When to use this pattern

You're integrating with an external identity provider (Google, GitHub,
Microsoft, generic OIDC) and need standard OAuth2 authorization-code or
client-credentials flows. Build this whenever a user logs in via "Sign
in with X" or your service authenticates outbound to a third-party API.

## How to declare it (so the probe verifies it)

**V1 strict — no path-regex.** The detector does NOT scan paths for
`/oauth/authorize`, `/oauth/token`, `/oauth/callback`, etc. Each
endpoint must be tagged with its OAuth role via ONE of three
declarative signals (per-role):

1. OpenAPI `securitySchemes[*]` of type `oauth2` with
   `flows.<flowType>.{authorizationUrl,tokenUrl,refreshUrl}` — the
   detector resolves which endpoint serves each role by exact URL
   match against `matrix.apiEndpoints[i].fullPath`.
2. **`operationId: 'oauthAuthorize'`** / `'oauthToken'` /
   `'oauthCallback'` / `'oauthRefresh'` on the corresponding
   controller method (alternative signal when you'd rather not
   declare full URLs in `securitySchemes`).
3. OpenAPI vendor extension `x-oauth-role: 'authorize' |
   'token' | 'callback' | 'refresh'` on the operation.

If two endpoints declare the same role (e.g. two operations both
have `x-oauth-role: 'token'`), the detector emits
`OAUTH_ROLE_AMBIGUOUS`. If a `securitySchemes.oauth2` is declared
but no endpoint claims a given role, the detector emits
`OAUTH_ROLE_UNDETECTED:<role>`. Path appearance is **not** a signal.

For probe coverage to be useful, expose the three endpoints (authorize,
token, callback) as concrete routes with the role declarations above —
don't bury them inside a passport strategy that NestJS handles invisibly.

## Code template

Step 1 — declare the security scheme in `apps/api/src/swagger.ts`:

```ts
import { DocumentBuilder } from '@nestjs/swagger';

const config = new DocumentBuilder()
  .setTitle('SFX API')
  .addOAuth2(
    {
      type: 'oauth2',
      flows: {
        authorizationCode: {
          authorizationUrl: '/oauth/authorize',
          tokenUrl: '/oauth/token',
          refreshUrl: '/oauth/refresh',
          scopes: { read: 'Read access', write: 'Write access' },
        },
      },
    },
    'oauth2',
  )
  .build();
```

Step 2 — implement the three endpoints as a controller:

```ts
import { Controller, Get, Post, Query, Body, Res } from '@nestjs/common';
import { ApiTags, ApiResponse, ApiOperation } from '@nestjs/swagger';

@ApiTags('oauth')
@Controller('oauth')
export class OAuthController {
  @Get('authorize')
  @ApiOperation({ operationId: 'oauthAuthorize', summary: 'OAuth2 authorize endpoint' })
  @ApiResponse({ status: 302, description: 'Redirect to consent' })
  authorize(@Query('client_id') clientId: string, @Res() res: Response) {
    // 302 to the IdP consent page or your local consent screen
    res.redirect(`/consent?client_id=${clientId}`);
  }

  @Post('token')
  @ApiOperation({ operationId: 'oauthToken', summary: 'OAuth2 token exchange' })
  @ApiResponse({ status: 200, schema: { properties: { access_token: { type: 'string' } } } })
  @ApiResponse({ status: 400, description: 'Invalid grant' })
  @ApiResponse({ status: 401, description: 'Invalid client credentials' })
  token(@Body() dto: TokenRequestDto) {
    if (dto.code === 'invalid-probe-code') {
      throw new BadRequestException('invalid_grant');
    }
    return { access_token: '...', token_type: 'Bearer' };
  }

  @Get('callback')
  @ApiOperation({ operationId: 'oauthCallback', summary: 'OAuth2 callback handler' })
  @ApiResponse({ status: 302, description: 'Redirect to app on success' })
  @ApiResponse({ status: 400, description: 'Missing code parameter' })
  callback(@Query('code') code: string) {
    if (!code) throw new BadRequestException('missing_code');
    // ... exchange and redirect
  }
}
```

## What the probe will assert (when present)

- `oauth:authorize:reachable` — `GET <authorizeUrl>` (no follow-redirects)
  → expect `200`, `302`, or `303`.
- `oauth:token:invalid-grant` — `POST <tokenUrl>` with `grant_type:
  authorization_code, code: invalid-probe-code` → expect `400` or `401`
  (must NOT be 500 — the IdP must reject invalid grants gracefully).
- `oauth:callback:no-code` — `GET <callbackUrl>` with no `code` query
  → expect `400`, `401`, or `302` (must NOT be 500).

## Anti-patterns the probe will surface as drift

- Returning 500 on invalid grant — the probe will mark this as a contract
  violation. OAuth errors must use 4xx with a JSON body per RFC 6749.
- Implementing the flows entirely inside a passport strategy with no
  visible routes — the probe cannot detect them and emits no flows.
- Letting the callback throw an unhandled exception when `code` is
  missing — must throw `BadRequestException` or redirect to an error
  page (302).
- Declaring `oauth2` securityScheme in swagger but no endpoint claims
  any role — `OAUTH_ROLE_UNDETECTED:authorize`,
  `OAUTH_ROLE_UNDETECTED:token`, etc. fire one per missing role.
- Two endpoints both declaring `x-oauth-role: 'token'` (or both
  `operationId: 'oauthToken'`) — `OAUTH_ROLE_AMBIGUOUS` fires.
- Mounting the flow at non-canonical paths and relying on the prior
  path-regex behaviour — the V1 strict detector ignores paths.

## Source of truth the probe scans

- The compiled OpenAPI document — `components.securitySchemes[*].type ===
  'oauth2'` with nested `flows.<flowType>.{authorizationUrl,tokenUrl,
  refreshUrl}` URLs (matched against endpoint `fullPath`).
- Per-operation `operationId` — values `oauthAuthorize`, `oauthToken`,
  `oauthCallback`, `oauthRefresh`.
- Per-operation `extensions['x-oauth-role']` — values `authorize`,
  `token`, `callback`, `refresh`.
- `ep.swaggerDeclared.extensions[key]` — generic accessor for any
  vendor extension on an endpoint.
