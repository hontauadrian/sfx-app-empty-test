---
name: generated-app-role-management
description: Maintain generated app authorization roles across the auth manifest, Keycloak provisioning contract, API guards, frontend role-based UI, and tests. Use when adding, renaming, removing, or assigning generated app roles such as viewer, admin, app-user, or custom Keycloak client roles.
---

# Generated App Role Management

Use this skill whenever a generated app needs a new authorization role or a role changes behavior.

## Role Contract

Generated app roles are Keycloak client roles on the API client, not realm roles.

```text
resource_access[OAUTH_API_CLIENT_ID].roles
```

The generated app must never self-create roles at runtime. SFX Panel owns dev provisioning. SFX Foreman or controlled infra owns preprod/prod provisioning.

## Workflow

1. Update the role contract:
   - Add the role to `auth/auth.manifest.example.json` or the generated app's concrete auth manifest.
   - Keep protected baseline roles stable; do not rename or delete them casually.
   - Use simple role names inside the API client, for example `viewer`, `admin`, `finance-approver`.

2. Update API authorization:
   - Add typed role constants if the app has them.
   - Use `@AuthRoles(...)` on protected endpoints that require the role.
   - Keep `/auth/me` minimal: authenticated flag, subject, email, roles.
   - Do not read roles from realm roles, groups, frontend state, or cookies.

3. Update frontend behavior:
   - Fetch roles from `/api/v1/auth/me`.
   - Put role-to-UI decisions in hooks/mappers, not inline JSX conditionals.
   - Show a clear pending/no-access state when the user is authenticated but has no app role.

4. Update dev provisioning:
   - Ensure SFX Panel creates the role on the generated app API client.
   - Assign the role to deterministic dev/test users only when the test scenario needs it.
   - Do not commit Keycloak client secrets or user passwords beyond documented local-dev fixtures.

5. Test the full contract:
   - API rejects missing token with `401`.
   - API rejects valid token without the required role with `403`.
   - API allows valid token with the required role.
   - `/auth/me` exposes the role.
   - Frontend renders the role-specific UI.
   - Browser flow works through oauth2-proxy and real Keycloak in dev.

## Do Not

- Do not hardcode arbitrary role strings in page components.
- Do not grant roles from the generated app itself.
- Do not use realm roles for generated app authorization.
- Do not fake role access in frontend state to make tests pass.
- Do not edit production Keycloak directly from generated app code.
