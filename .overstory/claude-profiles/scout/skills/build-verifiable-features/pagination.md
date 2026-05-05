# Pagination

## When to use this pattern

Any endpoint returning a collection that may grow unbounded: list of
projects, audit log, search results, comment thread. Always paginate
collection endpoints — never return the full table.

## How to declare it (so the probe verifies it)

The probe's `detectors/pagination.js` populates
`matrix.apiEndpoints[i].paginationProfile`:

```
{
  style: 'offset' | 'cursor' | 'link-header',
  paramNames: { page?: 'page', limit?: 'limit', cursor?: 'cursor' },
  responseKeys: { items: 'items', total?: 'total', nextCursor?: 'nextCursor' },
  defaultLimit: 10,
  maxLimit: 100,
  isBareArray: false,    // true when the response is the array itself, not wrapped
}
```

The detector recognises a pagination profile when it sees:

- **Offset style**: query params named `page` + `limit` (or `pageSize`,
  `perPage`, `offset`) declared via `@ApiQuery({ name: 'page' })` etc.
- **Cursor style**: query param named `cursor` (or `after`, `before`)
  with response field `nextCursor`.
- **Link-header style**: response declares an `X-Total-Count` header
  or `Link: <...>; rel="next"` header.

For the `:max-limit` and `:over-max-limit` flows to fire, declare
`@ApiQuery({ name: 'limit', schema: { maximum: 100 } })` so the
detector reads `maxLimit`.

## Code template — offset style with envelope wrapping

```ts
import { Controller, Get, Query, DefaultValuePipe, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiQuery, ApiResponse } from '@nestjs/swagger';

class PaginatedProjectsDto {
  items: ProjectDto[];
  total: number;
  page: number;
  limit: number;
}

@ApiTags('projects')
@Controller('projects')
export class ProjectsController {
  @Get()
  @ApiQuery({ name: 'page', required: false, schema: { type: 'integer', minimum: 1, default: 1 } })
  @ApiQuery({ name: 'limit', required: false, schema: { type: 'integer', minimum: 1, maximum: 100, default: 10 } })
  @ApiQuery({ name: 'title', required: false, schema: { type: 'string' } })
  @ApiResponse({ status: 200, type: PaginatedProjectsDto })
  @ApiResponse({ status: 400, description: 'Limit exceeds 100' })
  async list(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('title') title?: string,
  ): Promise<PaginatedProjectsDto> {
    if (limit > 100) throw new BadRequestException('limit_too_large');

    const filter = title ? { title: { contains: title } } : {};
    const [items, total] = await Promise.all([
      this.projects.findMany({ where: filter, skip: (page - 1) * limit, take: limit }),
      this.projects.count({ where: filter }),
    ]);
    return { items, total, page, limit };
  }
}
```

## Code template — cursor style

```ts
@Get()
@ApiQuery({ name: 'cursor', required: false, schema: { type: 'string' } })
@ApiQuery({ name: 'limit', required: false, schema: { type: 'integer', maximum: 100, default: 20 } })
@ApiResponse({ status: 200, schema: {
  properties: {
    items: { type: 'array' },
    nextCursor: { type: 'string', nullable: true },
  },
}})
@ApiResponse({ status: 400, description: 'Invalid cursor' })
async list(
  @Query('cursor') cursor?: string,
  @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number = 20,
) {
  if (cursor && !this.isValidCursor(cursor)) {
    throw new BadRequestException('invalid_cursor');
  }
  // ...
  return { items, nextCursor };
}
```

## What the probe will assert (when present)

- `<path-id>:get:pagination:first-page` — GET with
  `?page=1&limit=<defaultLimit>` → expect 200 with `items` array.
- `<path-id>:get:pagination:past-end` — GET with `?page=999999`
  (offset/link-header) → expect 200 with empty `items` array.
- `<path-id>:get:pagination:empty` — GET with
  `?title=__never_exists_probe_filter__` → expect 200 with empty
  `items`.
- `<path-id>:get:pagination:max-limit` — GET with `limit=<maxLimit>`
  → expect 200.
- `<path-id>:get:pagination:over-max-limit` — GET with
  `limit=<maxLimit + 1>` → expect 400.
- `<path-id>:get:pagination:invalid-cursor` (cursor only) — GET with
  `cursor=__invalid_cursor_value__` → expect 400.
- `<path-id>:get:pagination:no-next` (link-header only) — GET the
  last page → assert response `Link` header does NOT contain
  `rel="next"`. Documents the boundary contract: at end of stream,
  no next link.

If your responses use the success envelope (e.g.
`{ success: true, data: { items: [...] } }`), the probe automatically
prefixes the items path with the envelope wrapper detected by
`response-envelope.js`.

## Anti-patterns the probe will surface as drift

- Returning a bare array `[ ... ]` instead of `{ items: [...] }` when
  the rest of the API uses the envelope — the probe's `bodyHas:
  ['data.items']` assertion fails. Either set `isBareArray: true` and
  bypass the global interceptor, or stay consistent.
- Returning 200 with empty items for `limit=101` instead of 400 — the
  probe will catch the missing limit validation.
- Returning 500 for an invalid cursor instead of 400 — the probe will
  catch the missing input validation.
- Setting `default: 10` in the OpenAPI but actually defaulting to 20
  in code — the probe sends `?limit=10` and you may return more or
  fewer rows than asserted.
- Filtering by `title` only in some pages — `:empty` flow fails.

## Source of truth the probe scans

- The compiled OpenAPI document — `parameters[in=query]` names and
  schemas for page/limit/cursor/offset, plus `responses[200].schema`
  for the items field name.
- `matrix.apiEndpoints[i].paginationProfile.maxLimit` — pulled from
  `@ApiQuery({ schema: { maximum: N } })`.
- `matrix.responseEnvelope.wrapper` — to wrap the items path when the
  app uses a global success interceptor.
