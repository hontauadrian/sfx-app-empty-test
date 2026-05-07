# ADR: Generated App OAuth Baseline with Keycloak and oauth2-proxy

**Date:** 2026-05-07  
**Status:** Proposed  
**Scope:** SFX apps boilerplate, generated webapps

## Context

Every application generated from the SFX apps boilerplate must be protected with OAuth 2.0 / OIDC in
running dev, test, preprod, and production instances. SFX Panel will generate app-specific auth
configuration during development. Future SFX Foreman will apply promoted auth manifests for
preprod/prod deployments.

The cross-system identity architecture uses Keycloak as the OIDC provider and `oauth2-proxy` as the
browser-facing authentication proxy. This ADR defines what the boilerplate must provide so every
generated app starts with the same extensible auth baseline.

## Decision

The boilerplate ships with a complete, extensible auth baseline. Generated apps inherit the baseline
and may extend roles/permissions through a versioned auth manifest, but they must not replace the
core auth plumbing.

The browser-facing frontend is protected by `oauth2-proxy`. The backend API validates JWTs
independently using Keycloak JWKS and enforces endpoint roles from the configured API client.

`oauth2-proxy` is an edge/session gate, not the only security boundary.

## Keycloak Client Model

Each generated app environment uses separate Keycloak clients:

- A confidential proxy client for `oauth2-proxy`.
- An API/audience client for backend authorization roles and token audience checks.

Example for an app with slug `inventory`:

```text
inventory-dev-proxy
inventory-dev-api
inventory-preprod-proxy
inventory-preprod-api
inventory-prod-proxy
inventory-prod-api
```

Generated app authorization roles live on the API/audience client. Role names are simple inside each
client, for example:

```text
viewer
editor
admin
```

Custom app roles are allowed, but protected baseline roles cannot be renamed, removed, or overridden
by generated app customization.

## Token and Role Validation

The API reads authorization roles from:

```text
resource_access[API_CLIENT_ID].roles
```

The API must not use realm roles for generated app authorization.

The API validates:

- JWT signature using Keycloak JWKS.
- Issuer.
- Audience/client expectations.
- Expiration.
- Required endpoint roles.

Frontend role checks are for user experience only. Backend role checks are authoritative.

## oauth2-proxy Baseline

The boilerplate includes a non-secret `oauth2-proxy` configuration template.

The template supports:

- OIDC provider configuration.
- Keycloak issuer URL.
- Proxy client ID.
- Redirect URL/callback path.
- Upstream app URL.
- Cookie domain.
- Required scopes.
- Forwarding the access token upstream as `Authorization: Bearer ...`.
- Cookie-only session storage.

Secrets do not live in the repository. Generated/deployed environments provide:

- `oauth2-proxy` client secret.
- `oauth2-proxy` cookie secret.

The generated frontend app must not read `oauth2-proxy` cookies directly.

## Auth Manifest

Each generated app repository contains a versioned auth manifest. The manifest is the non-secret
contract consumed by SFX Panel during dev generation and future SFX Foreman during preprod/prod
promotion.

The manifest describes:

- App slug.
- Supported environments.
- Proxy client requirements.
- API/audience client requirements.
- Required baseline roles.
- Custom app roles.
- Token claim expectations.
- Non-secret `oauth2-proxy` config requirements.
- Redirect URI placeholders or patterns.
- Cookie domain requirements.
- Destructive reconciliation policy.

SFX Panel merges boilerplate baseline roles with app-specific roles and writes a final manifest into
the generated app repository.

## Required Boilerplate Files and Capabilities

The boilerplate should provide these auth building blocks:

- Auth manifest schema and example.
- Non-secret `oauth2-proxy` config template.
- Env examples for web, API, and proxy configuration.
- Startup config validation that fails fast when mandatory auth config is missing.
- NestJS JWT/JWKS validation service or guard.
- API role decorator/metadata support.
- Typed role constants.
- `/auth/me` endpoint.
- Frontend session repository/hook that calls `/auth/me`.
- Pending-access UI state for authenticated users with no app roles.
- Tests for config validation, token validation, role parsing, role enforcement, and pending access.

## Frontend Behavior

The generated frontend assumes `oauth2-proxy` has already authenticated browser requests that reach
the app shell.

The frontend learns auth state by calling the backend:

```text
GET /auth/me
```

The frontend does not parse JWTs or proxy cookies. `/auth/me` returns a minimal session model, such
as:

```json
{
  "isAuthenticated": true,
  "subject": "user-id",
  "email": "user@example.com",
  "roles": ["viewer"]
}
```

If the user is authenticated but has no generated app role, the frontend shows a pending-access /
contact-admin state instead of a generic error.

## API Behavior

The generated API owns authorization.

Required behavior:

- Missing bearer token returns `401`.
- Invalid, expired, wrong-issuer, or wrong-audience token returns `401`.
- Valid token without a required endpoint role returns `403`.
- Valid token with a required endpoint role may access the endpoint.
- `/auth/me` returns only the minimal user/session model needed by the frontend.

Endpoint role requirements should be declared in code with decorators or metadata so tests and probe
generation can detect protected routes.

## Configuration

OAuth configuration is mandatory for running app instances.

Missing mandatory auth env must fail startup with a clear validation error. The app must not silently
run unprotected when auth config is absent.

Expected non-secret values include:

- Keycloak issuer URL.
- Realm name or issuer-derived realm.
- Proxy client ID.
- API client ID.
- JWKS URL or issuer from which JWKS can be discovered.
- Expected audience/client.
- Public app URL.
- OAuth callback path.

Expected secret values include:

- Proxy client secret.
- Proxy cookie secret.

Secret values are injected through deployment secrets/env and are not committed.

## Extension Rules

Generated apps may extend:

- Custom roles.
- Endpoint role requirements.
- Feature-specific permission mapping.
- UI behavior for pending/no-access states.

Generated apps must not replace:

- `oauth2-proxy` edge protection.
- API JWT/JWKS validation.
- `/auth/me` as the frontend session source.
- Protected baseline roles.
- Startup fail-fast auth config validation.

## Local and Test Instances

Running local/dev/test instances use real Keycloak/OIDC rather than mocked auth.

Unit tests may mock auth dependencies. Running app stacks should exercise:

- Keycloak login.
- `oauth2-proxy` redirect/session flow.
- Bearer token forwarding.
- API JWT validation.
- API role enforcement.

Local bootstrap may provision deterministic dev users and roles, but those users are dev-only and
must not appear in production manifests.

## Reconciliation and Promotion

SFX Panel applies auth configuration for dev.

Future SFX Foreman applies the auth manifest for preprod/prod. Foreman resolves deployment-specific
URLs, redirect URIs, client secrets, and cookie secrets.

Manifest changes are applied as migrations:

- Additive role changes are safe.
- Existing role assignments are preserved where role names remain.
- Protected baseline roles are preserved.
- Production destructive changes require explicit approval.

## Consequences

Benefits:

- Generated apps share one auth architecture.
- Frontend auth stays simple because `oauth2-proxy` handles browser login.
- APIs remain secure for direct calls because they validate JWTs independently.
- Role customization is supported without fragmenting auth plumbing.
- Future Foreman can provision preprod/prod from a repo-owned manifest.

Costs:

- The boilerplate needs auth infrastructure before generated apps can be considered production-ready.
- Running local/test stacks need Keycloak and `oauth2-proxy`.
- Cookie-only `oauth2-proxy` sessions require small tokens and cookie-size testing.
- The auth manifest schema becomes a stable contract and must be versioned carefully.

## Implementation Plan

### Phase 1: Manifest and Configuration

1. Add auth manifest schema and example.
2. Add env examples for web, API, and proxy settings.
3. Add startup config validation for required auth values.
4. Add tests proving missing mandatory auth values fail startup.

### Phase 2: API JWT and Role Enforcement

1. Add JWKS-based JWT validation.
2. Add role parsing from `resource_access[API_CLIENT_ID].roles`.
3. Add role decorator/metadata support.
4. Add `/auth/me`.
5. Add unit and integration tests for `401`, `403`, and allowed access paths.

### Phase 3: Web Session and Pending Access

1. Add frontend auth repository/hook that calls `/auth/me`.
2. Add pending-access UI state.
3. Gate protected UI affordances based on roles from `/auth/me`.
4. Add tests for authenticated, role-less, and role-bearing states.

### Phase 4: oauth2-proxy Template

1. Add non-secret `oauth2-proxy` config template.
2. Add generated env placeholders for proxy client and callback settings.
3. Document how Panel/Foreman inject secrets and concrete URLs.
4. Add local stack documentation for Keycloak + `oauth2-proxy`.

### Phase 5: Generation Contract

1. Document how SFX Panel merges baseline roles with app-specific roles.
2. Document protected role validation.
3. Document how Foreman applies manifests for preprod/prod.
4. Add fixture manifests for generator and provisioning tests.

