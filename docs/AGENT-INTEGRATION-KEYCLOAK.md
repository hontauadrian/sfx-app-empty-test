# Agent API integration — Keycloak + Brand Guidelines

This guide explains how to register a content-generation agent against the
Brand Guidelines API, exchange a Keycloak `client_credentials` grant for a
short-lived JWT, and call every read endpoint with a bearer token.

The `agent` role is **read-only**. Every guideline read endpoint accepts
either an `admin` user or an `agent` client. Every write endpoint
(POST/PUT/PATCH/DELETE) rejects the agent role with HTTP 403. The shared
auth scaffold (Keycloak realm, oauth2-proxy, RS256 JWKS) is unchanged.

## 1. Realm provisioning

The agent role is declared in the realm manifest at
`infra/keycloak/manifest.json`:

```json
"api": {
  "clientId": "${repoName}-dev-api",
  "audience": "${repoName}-dev-api",
  "roles": ["viewer", "editor", "admin", "agent"]
}
```

### Local dev

Re-import the realm config so the new role appears in the realm:

```bash
pnpm stack:reset
pnpm stack:up
```

The dev seed at `infra/keycloak/dev-seed.json` includes an
`agent@example.com` user assigned the `agent` client role for password-
grant testing. To exercise the production-style client-credentials grant
locally, provision a confidential client (next section) and reuse the
existing JWKS exposed by the dev Keycloak.

### Staging / production

Use `kcadm.sh` from the operator workstation:

```bash
kcadm.sh config credentials \
  --server https://<keycloak-host> \
  --realm master \
  --user <admin-user> \
  --password <admin-password>

# 1. Add the agent role on the API client (idempotent).
kcadm.sh create clients/<api-client-uuid>/roles -r <realm> \
  -s name=agent -s description='Read-only content-generation agent'

# 2. Create a confidential client for the agent application.
kcadm.sh create clients -r <realm> \
  -s clientId=brand-reader-agent-001 \
  -s protocol=openid-connect \
  -s publicClient=false \
  -s standardFlowEnabled=false \
  -s directAccessGrantsEnabled=false \
  -s serviceAccountsEnabled=true

# 3. Bind the agent role to the new client's service account.
kcadm.sh add-roles \
  -r <realm> \
  --uusername service-account-brand-reader-agent-001 \
  --cclientid <repoName>-dev-api \
  --rolename agent

# 4. Retrieve the client_secret for distribution.
kcadm.sh get clients/<new-client-uuid>/client-secret -r <realm>
```

The client_secret rotates on demand; treat it as a credential and store
it in your secret manager.

## 2. OAuth2 client_credentials grant

```bash
curl -s -X POST \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'grant_type=client_credentials' \
  -d 'client_id=brand-reader-agent-001' \
  -d 'client_secret=<secret>' \
  https://<keycloak-host>/realms/<realm>/protocol/openid-connect/token
```

Response:

```json
{
  "access_token": "eyJ...",
  "expires_in": 300,
  "token_type": "Bearer"
}
```

Cache the access token for `expires_in - 30s` and refresh by re-running
the grant. The API validates RS256 + JWKS + audience claims server-side.

## 3. Calling read endpoints

Every example below assumes:

```bash
export TOKEN=$(...curl above... | jq -r .access_token)
export API=https://<api-host>/api/v1
```

### List brand profiles

```bash
curl -s -H "Authorization: Bearer $TOKEN" "$API/brands"
```

Sample 200 response:

```json
{
  "success": true,
  "data": {
    "brands": [
      {
        "id": "clxbrand0001",
        "name": "Acme Holdings",
        "slug": "acme-holdings",
        "ownerUserId": "auth-user-abc",
        "createdAt": "2026-05-17T12:34:56.000Z",
        "updatedAt": "2026-05-17T12:34:56.000Z",
        "deletedAt": null
      }
    ]
  }
}
```

### Full guideline payload (per section)

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "$API/brands/clxbrand0001/guidelines/voice"
curl -s -H "Authorization: Bearer $TOKEN" \
  "$API/brands/clxbrand0001/guidelines/visual"
curl -s -H "Authorization: Bearer $TOKEN" \
  "$API/brands/clxbrand0001/guidelines/dos-and-donts?type=do&category=tone"
curl -s -H "Authorization: Bearer $TOKEN" \
  "$API/brands/clxbrand0001/guidelines/metadata"
```

Every response carries `latestVersionId` so the agent can attach the
sourcing version to generated content.

### Standalone agent-optimised lists

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "$API/brands/clxbrand0001/guidelines/voice/restricted-vocabulary"
curl -s -H "Authorization: Bearer $TOKEN" \
  "$API/brands/clxbrand0001/guidelines/voice/approved-examples"
curl -s -H "Authorization: Bearer $TOKEN" \
  "$API/brands/clxbrand0001/guidelines/voice/rejected-examples"
```

### Version history

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "$API/brands/clxbrand0001/guidelines/versions?take=50"
curl -s -H "Authorization: Bearer $TOKEN" \
  "$API/brands/clxbrand0001/guidelines/versions/clxbgv0001"
```

Unknown cursors return HTTP 200 with an empty page (Linear/GitHub
semantics).

### Search

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  --data-urlencode 'q=launch tone' \
  -G "$API/brands/clxbrand0001/guidelines/search"
```

## 4. Write rejection

Every mutating verb on the same path families returns HTTP 403 when the
caller carries only the agent role:

```bash
curl -i -X PUT -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"tone":"Friendly"}' \
  "$API/brands/clxbrand0001/guidelines/voice"
```

Sample 403 response:

```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "Missing required role"
  }
}
```

`POST /api/v1/brands`, `PATCH /api/v1/brands/:id`, and
`DELETE /api/v1/brands/:id` behave the same way: admin only.

## 5. Audit log

Every agent-authenticated request — both 2xx and 4xx — is recorded to the
`agent_audit_log` table by the global `AgentAuditInterceptor`. An admin
operator can review the trail per brand at:

```
GET /api/v1/brands/:brandId/agent-audit-log
```

The admin-only UI for the same data lives at:

```
/admin/brand-guidelines/:brandId/audit-log
```

Filters: `clientId` substring + ISO `from` / `to` date range + `take`.

### Retention

The audit log retains entries for **90 days**. The purge job that prunes
older rows is out of scope for this release; operators should configure
an external cron once the table has produced ~30 days of data so the
retention SLO can be measured.

### Recommended caller headers

The interceptor records the request's `x-client-id` header when present
and falls back to `email` / `subject` from the bearer token otherwise.
Setting `x-client-id` to the same string used for the Keycloak
`clientId` keeps audit rows aligned with operator-facing IDs even when
the JWT email field is omitted. The `x-request-id` header is recorded as
the `requestId` column for cross-system tracing; if your gateway already
emits one (`traceparent`, `x-correlation-id`, etc.), forward it as
`x-request-id` on the outbound call to the API.

## 6. Swagger / OpenAPI

The full OpenAPI surface — including every endpoint described above
with `@ApiBearerAuth('accessToken')` and the `agent` role declared on
each read operation — is served at:

```
GET /api/docs
```

The audit-log endpoint is tagged under `brand-guidelines` so it appears
alongside the per-brand reads.
