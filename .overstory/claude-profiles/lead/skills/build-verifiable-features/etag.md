# ETag / Conditional Requests

## When to use this pattern

Use ETag-based conditional requests when:

- A client polls a resource and you want to skip re-sending an unchanged
  body (`If-None-Match` → `304 Not Modified`).
- Multiple clients update the same resource and you need optimistic
  concurrency (`If-Match` → `412 Precondition Failed` if stale).

Conditional requests reduce bandwidth and prevent lost-update bugs.

## How to declare it (so the probe verifies it)

The probe's `detectors/conditional.js` populates
`matrix.apiEndpoints[i].conditionalProfile`:

```
{
  supportsETag: true,
  patterns: ['if-none-match', 'if-match'],   // any subset
}
```

A profile is created when the detector finds:

- A `@ApiHeader({ name: 'If-None-Match' })` or
  `@ApiHeader({ name: 'If-Match' })` on the endpoint, OR
- An `@ApiResponse({ status: 304, ... })` or
  `@ApiResponse({ status: 412, ... })` declaration, OR
- A response that includes an `ETag` header in the OpenAPI spec.

### Vendor extensions

| Extension | Purpose | Probe effect |
|---|---|---|
| `x-etag-type: 'weak'` | Server emits `W/"..."` weak ETags | `:etag-304` accepts both forms; `:if-match-stale` sends weak form |
| `x-etag-type: 'strong'` | Server emits strong `"..."` ETags only | `:etag-304` rejects weak ETags |
| `x-vary: ['Accept-Encoding']` | Vary header values | `:etag-304` validates GET sets these `Vary` entries; required to verify caching correctness across encodings |
| `x-conditional-combined: true` | Server supports both ETag AND `Last-Modified` (paired) | `:etag-304-paired` flow: send `If-None-Match` AND `If-Modified-Since` together; expect 304 only when both stale |

Set them via `@ApiOperation({ extensions: { 'x-etag-type': 'weak' } })`.

## Code template — GET with ETag (304 support)

```ts
import { Controller, Get, Param, Headers, Res } from '@nestjs/common';
import { ApiTags, ApiHeader, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';

@ApiTags('projects')
@Controller('projects')
export class ProjectsController {
  @Get(':id')
  @ApiHeader({ name: 'If-None-Match', required: false })
  @ApiResponse({ status: 200, type: ProjectDto, headers: { ETag: { schema: { type: 'string' } } } })
  @ApiResponse({ status: 304, description: 'Resource unchanged' })
  async findOne(
    @Param('id') id: string,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ProjectDto | undefined> {
    const project = await this.projects.findById(id);
    const etag = `"${project.version}-${project.updatedAt.getTime()}"`;
    res.setHeader('ETag', etag);

    if (ifNoneMatch === etag) {
      res.status(304);
      return undefined;
    }
    return project;
  }
}
```

## Code template — PUT/PATCH with If-Match (optimistic concurrency)

```ts
@Put(':id')
@ApiHeader({ name: 'If-Match', required: true })
@ApiResponse({ status: 200, type: ProjectDto })
@ApiResponse({ status: 412, description: 'ETag stale, refetch and retry' })
async update(
  @Param('id') id: string,
  @Headers('if-match') ifMatch: string,
  @Body() dto: UpdateProjectDto,
  @Res({ passthrough: true }) res: Response,
): Promise<ProjectDto> {
  const current = await this.projects.findById(id);
  const currentEtag = `"${current.version}-${current.updatedAt.getTime()}"`;

  if (ifMatch !== currentEtag) {
    throw new PreconditionFailedException('etag_stale');
  }

  const updated = await this.projects.update(id, dto);
  res.setHeader('ETag', `"${updated.version}-${updated.updatedAt.getTime()}"`);
  return updated;
}
```

## What the probe will assert (when present)

For GET with `supportsETag` and `patterns` includes `if-none-match`:

- `<path-id>:get:conditional:etag-304` — GET → expect 200 → capture
  `etag` header → GET again with `If-None-Match: ${capturedETag}` →
  expect `304`.

For PUT/PATCH with `patterns` includes `if-match`:

- `<path-id>:put:conditional:if-match-stale` — PUT with
  `If-Match: "stale-etag-probe-00000"` → expect `412`.
- `<path-id>:put:conditional:if-match-valid` (only if a sibling GET
  on the same path also has `supportsETag`) — GET → capture etag →
  PUT with `If-Match: ${capturedETag}` → expect `200` or `204`.

## Anti-patterns the probe will surface as drift

- Setting an ETag that changes on every request (e.g. includes a
  random nonce) — the `:etag-304` flow always fails because the
  follow-up GET sees a different ETag.
- Returning 200 (with body) when `If-None-Match` matches — must be
  304 with no body.
- Returning 200 when `If-Match` is stale — must be 412. A silent
  overwrite is a lost-update bug.
- Forgetting to set the `ETag` response header on the GET — the probe
  cannot capture and the flow fails at the capture step.
- Inconsistent ETag format between GET and PUT (e.g. weak `W/"..."` on
  GET, strong `"..."` on PUT) — comparison fails.

## Source of truth the probe scans

- The compiled OpenAPI document — `parameters[in=header]` for
  `If-None-Match` / `If-Match` and `responses[304]` / `responses[412]`.
- `matrix.apiEndpoints[i].conditionalProfile.patterns` — the list of
  patterns the endpoint claims to support.
- The endpoint's body Zod / class-validator contract — used by
  `buildSampleBody()` to construct the PUT payload.
