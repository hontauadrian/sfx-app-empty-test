# File Upload / Binary Download / SSE

## When to use this pattern

- **Multipart upload** — accepting user files (avatars, documents,
  attachments).
- **Binary download** — serving generated PDFs, exported CSVs, signed
  URLs that proxy to S3, image variants.
- **SSE (Server-Sent Events)** — one-way push from server to browser:
  notifications, build-progress, log tail. (For two-way, see
  `websocket.md`.)

## How to declare it (so the probe verifies it)

The probe inspects each endpoint's declared content types:

- `isMultipartEndpoint(ep)` — true when
  `ep.requestContentTypes` includes `multipart/form-data`.
- `isBinaryUploadEndpoint(ep)` — true when
  `ep.requestContentTypes` includes `application/octet-stream`.
- `isBinaryDownloadEndpoint(ep)` — true when
  `ep.responseContentTypes` includes any of `image/*`,
  `application/pdf`, `application/octet-stream`, `application/zip`.
- `isSSEEndpoint(ep)` — true when
  `ep.responseContentTypes` includes `text/event-stream`.

So your job is to declare those content types via `@ApiConsumes()` and
`@ApiProduces()` decorators (or via the generated OpenAPI for
`@UploadedFile()` interceptor usage).

### V2 strict (multipart) — fieldName must come from the schema

There is **no `'file'` fallback**. The probe reads file field names
verbatim from the `@ApiBody` multipart schema; if the schema does not
declare a binary file field, the probe emits `[]` flows for that
endpoint and surfaces `MULTIPART_FIELD_UNDECLARED`.

Required declarations on a multipart endpoint:

1. `@ApiConsumes('multipart/form-data')`
2. `@ApiBody({ schema: { type: 'object', properties: { <fieldName>:
   { type: 'string', format: 'binary' } } } })` — `<fieldName>` MUST
   match the string passed to `FileInterceptor('<fieldName>')` /
   `FilesInterceptor('<fieldName>')`. The probe reads the schema, NOT
   the interceptor argument.
3. The matching NestJS interceptor — `FileInterceptor`,
   `FilesInterceptor`, or `FileFieldsInterceptor`. If the endpoint
   declares multipart but no interceptor is found, the probe emits
   `MULTIPART_NO_INTERCEPTOR`.

Multi-file uploads (`FilesInterceptor`) — declare an array schema:

```ts
@ApiBody({
  schema: {
    type: 'object',
    properties: {
      attachments: {
        type: 'array',
        items: { type: 'string', format: 'binary' },
      },
    },
  },
})
```

Mixed file + text fields — declare both binary and non-binary keys:

```ts
@ApiBody({
  schema: {
    type: 'object',
    properties: {
      file:        { type: 'string', format: 'binary' },
      description: { type: 'string' },
      visibility:  { type: 'string', enum: ['public', 'private'] },
    },
    required: ['file', 'visibility'],
  },
})
```

The probe will populate text fields with `'probe-text-<field>'` (or the
first enum value, if declared) when running `:upload-happy`.

### V2 strict (SSE) — declare event names and stream policy

Plain `@Sse('stream')` makes the probe wait for ANY event up to a
timeout. To verify specific server behavior, declare via vendor
extensions in `@ApiOperation`:

| Extension | Purpose | Probe effect |
|---|---|---|
| `x-sse-event-names: ['tick','complete']` | Named event types the server emits | `:sse-stream` waits for at least one of these names |
| `x-sse-retry: 3000` | Reconnection delay (ms) | Asserts `retry: 3000` line in stream |
| `x-sse-id-required: true` | Server emits `id:` lines for resume | Asserts at least one event has an `id:` line; `:sse-resume` flow added (sends `Last-Event-ID` header → expects continuation) |
| `x-sse-heartbeat: 15000` | Heartbeat interval in ms | Asserts at least one heartbeat (comment-line `:` or named `heartbeat` event) within `2 * heartbeat` ms |

If `text/event-stream` is declared on a method but no `@Sse(...)`
decorator is present, the probe emits `SSE_NO_DECORATOR`.

### V2 strict (binary download) — declare disposition pattern

To assert the server returns a download filename header, add
`x-content-disposition: 'attachment; filename="<pattern>"'` to
`@ApiOperation`. The pattern accepts these placeholders:

- `<pattern>` `*.pdf` / `*-{id}.csv` / `report-{date}.zip` — `*`
  matches one path segment, `{name}` matches any safe filename token.

The probe asserts the response `Content-Disposition` header against
the declared pattern. Without this extension, the probe only asserts
the body is binary (magic-byte check) and skips disposition.

## Code template — multipart upload

```ts
import { Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiConsumes, ApiBody, ApiResponse } from '@nestjs/swagger';

@ApiTags('files')
@Controller('files')
export class FilesController {
  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({ status: 201, schema: { properties: { url: { type: 'string' } } } })
  @ApiResponse({ status: 413, description: 'File exceeds 5 MB' })
  @ApiResponse({ status: 415, description: 'Wrong content type' })
  upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('missing_file');
    // ... store and return URL
    return { url: 'https://cdn.example.com/...' };
  }
}
```

## Code template — binary download

```ts
import { Controller, Get, Param, Res } from '@nestjs/common';
import { ApiTags, ApiProduces, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';

@ApiTags('exports')
@Controller('exports')
export class ExportsController {
  @Get(':id/pdf')
  @ApiProduces('application/pdf')
  @ApiResponse({
    status: 200,
    content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } },
  })
  async downloadPdf(@Param('id') id: string, @Res() res: Response) {
    const buf = await this.exports.renderPdf(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="export-${id}.pdf"`);
    res.send(buf);
  }
}
```

## Code template — SSE

```ts
import { Controller, Sse, MessageEvent } from '@nestjs/common';
import { Observable, interval, map } from 'rxjs';
import { ApiTags, ApiProduces, ApiResponse } from '@nestjs/swagger';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  @Sse('stream')
  @ApiProduces('text/event-stream')
  @ApiResponse({
    status: 200,
    content: { 'text/event-stream': { schema: { type: 'string' } } },
  })
  stream(): Observable<MessageEvent> {
    return interval(1000).pipe(
      map((n) => ({ data: { tick: n, at: Date.now() } })),
    );
  }
}
```

## What the probe will assert (when present)

For each multipart/binary upload endpoint:

- `<path-id>:<method>:upload-happy` — POST a 128-byte payload with the
  declared content type → expect the declared 2xx success status (or
  the method's default).
- `<path-id>:<method>:upload-oversize` (only if `413` is in
  `swaggerDeclared.statuses`) — POST a 50 MB payload → expect `413`.
- `<path-id>:<method>:upload-wrong-mime` (only if `415` is in
  `swaggerDeclared.statuses`) — POST `text/plain` body to a
  multipart-only endpoint → expect `415`.

For each binary-download endpoint:

- `<path-id>:<method>:download` — GET → expect declared 2xx, content
  type matches, body is binary (asserts magic bytes for known formats:
  PNG, PDF, ZIP).

For each SSE endpoint:

- `<path-id>:<method>:sse-stream` — GET with `Accept: text/event-stream`
  → read up to 3 events with 5 s timeout → expect at least 1 event.

## Anti-patterns the probe will surface as drift

- Declaring `@ApiResponse({ status: 415 })` but never validating the
  content type in code — `:upload-wrong-mime` returns 200 and the
  probe blocks.
- Setting `Content-Type: application/json` on a binary download — the
  probe's content-type assertion fails.
- Returning JSON metadata from an `@Sse()` handler instead of
  `MessageEvent` objects — Apollo / EventSource clients break.
- Letting Multer use the default 1 MB limit while declaring
  `fileSize: 5 * 1024 * 1024` in `@ApiBody` — `:upload-happy` may
  fail at boundary sizes; the probe sends 128 bytes so this hides
  itself, but oversize testing exposes it.
- Buffering the entire upload in memory before validating — denial of
  service. (Not detected by probe but noted as a hard rule.)
- `FileInterceptor('upload')` while `@ApiBody` schema declares
  `properties: { file: ... }` — fieldName mismatch. The probe sends
  `file` per the schema, Multer expects `upload`, multipart parse
  fails. Keep them identical.
- Multipart endpoint without `FileInterceptor` / `FilesInterceptor`
  registered — probe emits `MULTIPART_NO_INTERCEPTOR`. Add the
  interceptor or remove `@ApiConsumes('multipart/form-data')`.
- `@ApiProduces('text/event-stream')` on a regular `@Get()` instead
  of `@Sse(...)` — probe emits `SSE_NO_DECORATOR`. SSE requires
  `@Sse('path')` so NestJS sets the streaming response.
- Declaring `x-sse-event-names: ['done']` but server emits unnamed
  events — `:sse-stream` times out waiting for the named event.
- Declaring `x-content-disposition: 'attachment; filename="*.pdf"'`
  but writing inline bytes without `Content-Disposition` header —
  download flow's disposition assertion fails.

## Source of truth the probe scans

- The compiled OpenAPI document — `requestBody.content` keys for
  upload content types and `responses[*].content` keys for downloads
  / SSE.
- `matrix.apiEndpoints[i].requestContentTypes` and
  `responseContentTypes` — populated by `nest-openapi.js`.
- `matrix.apiEndpoints[i].swaggerDeclared.statuses` — the declared
  response status list, which gates whether 413 / 415 flows are
  emitted.
