# Multi-Tenancy

## When to use this pattern

Your API serves multiple isolated tenants (organisations / workspaces /
accounts) and a request from tenant A must never read or modify data
belonging to tenant B. This is one of the most common security failures
in SaaS APIs — the probe verifies the boundary holds at runtime.

## How to declare it (so the probe verifies it)

**V1 strict — no path-regex.** Path appearance of `:tenantId`,
`/tenants/`, `/orgs/`, etc. is **NOT** a detection signal. Those are
"path-lures" — names that look like tenancy but tell the probe
nothing about the actual scope. You MUST declare scope via ONE of:

1. **`@ApiHeader({ name: 'X-Tenant-ID', required: true })`** on the
   endpoint or controller (preferred — simplest, integrates with the
   middleware that reads the header).
2. OpenAPI vendor extension `x-multi-tenant: true` (or
   `'x-multi-tenant': { header: 'X-Org-Id' }` for an explicit header
   name) on the operation.
3. A custom `@TenantId()` parameter decorator that the contract
   compiler emits as a vendor extension.

Across endpoints, all multi-tenant declarations should agree on the
same header name. If endpoint A declares `X-Tenant-ID` and endpoint B
declares `X-Org-Id`, the detector emits `TENANCY_SCOPE_AMBIGUOUS`.
Pick one header name and use it consistently.

The probe ALSO needs auth on the endpoint (a `@UseGuards`-protected
route or a `security[]` requirement) — tenancy isolation is verified
under an authenticated session, not anonymous.

## Code template — header strategy

```ts
import { Controller, Get, Headers } from '@nestjs/common';
import { ApiTags, ApiHeader, ApiResponse } from '@nestjs/swagger';

@ApiTags('projects')
@Controller('projects')
@ApiHeader({ name: 'x-tenant-id', required: true })
export class ProjectsController {
  @Get()
  @ApiResponse({ status: 200, type: [ProjectDto] })
  @ApiResponse({ status: 400, description: 'Missing x-tenant-id header' })
  @ApiResponse({ status: 403, description: 'Tenant access denied' })
  list(@Headers('x-tenant-id') tenantId: string) {
    if (!tenantId) throw new BadRequestException('missing_tenant_header');
    return this.projects.findByTenant(tenantId);
  }
}
```

## Code template — path-param strategy (still the same header signal)

A path with `:tenantId` is fine for ergonomics, BUT the path itself
does not signal tenancy to the probe. You still declare the header:

```ts
import { Controller, Get, Param, Headers, UseGuards } from '@nestjs/common';
import { ApiTags, ApiHeader, ApiResponse, ApiParam } from '@nestjs/swagger';

@ApiTags('projects')
@Controller('tenants/:tenantId/projects')
@ApiHeader({ name: 'x-tenant-id', required: true })
@UseGuards(TenantGuard)
export class ProjectsController {
  @Get()
  @ApiParam({ name: 'tenantId', required: true })
  @ApiResponse({ status: 200, type: [ProjectDto] })
  @ApiResponse({ status: 403, description: 'Header tenant does not match path tenant' })
  @ApiResponse({ status: 404, description: 'Tenant does not exist' })
  list(@Param('tenantId') tenantId: string) {
    return this.projects.findByTenant(tenantId);
  }
}
```

`TenantGuard` MUST validate that `x-tenant-id` matches `:tenantId` and
that the authenticated user belongs to that tenant. The probe sends a
mismatched header to verify the cross-tenant rejection.

## Prisma model template

```prisma
model Project {
  id        String  @id @default(cuid())
  tenantId  String
  name      String

  @@index([tenantId])
}
```

## What the probe will assert (when present)

For header strategy (`tenant.strategy === 'header'`), against the first
authenticated GET endpoint:

- `tenant-isolation:header:tenant-a:access` — request with
  `x-tenant-id: tenant-probe-a` → expect `200` or `401`.
- `tenant-isolation:header:cross-tenant:rejected` — same endpoint with
  `x-tenant-id: tenant-probe-b` → expect `403`, `404`, or `401`.
- `tenant-isolation:header:missing:rejected` — no tenant header → expect
  `400`, `403`, or `401`.

For path-param strategy (`tenant.strategy === 'path-param'`):

- `tenant-isolation:path:happy` — request to
  `/tenants/probe-tenant-a/...` with matching tenant header → expect
  `200`/`201`.
- `tenant-isolation:path:cross-tenant:rejected` — request to
  `/tenants/wrong-tenant-probe-id/...` with `probe-tenant-a` header →
  expect `403`, `404`, or `401`.
- `tenant-isolation:path:missing-header:rejected` — path has tenant ID
  but no header → expect `400`, `403`, or `401`.

## Anti-patterns the probe will surface as drift

- Returning 200 to a request with the wrong tenant ID — this is a
  data-leak bug; the probe will block.
- Returning 500 when the tenant header is missing — must be 400/403.
- Storing `tenantId` on the model but not filtering queries by it —
  the cross-tenant probe will succeed (200) and surface the leak.
- Reading `tenantId` from a JWT claim only without validating it
  against path/header — vulnerable to token-replay across tenants;
  the probe's cross-tenant request fakes a different tenant header.

## Source of truth the probe scans

- `matrix.apiEndpoints[i].swaggerDeclared.parameters` — for explicit
  `in: header` parameters declared via `@ApiHeader`. The header NAME
  is read verbatim (no regex match).
- `matrix.apiEndpoints[i].swaggerDeclared.extensions['x-multi-tenant']`
  — vendor extension form.
- `ep.swaggerDeclared.extensions[key]` — generic accessor for any
  vendor extension on an endpoint.
- The endpoint's `security[]` / `@UseGuards` — gating on
  authenticated routes.

Path patterns, package deps, Prisma model fields, and tenant
class-name regex are NOT detection signals in V1 strict.
