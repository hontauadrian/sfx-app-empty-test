# Error Shapes

> See also: `../nestjs-probe-coverage/SKILL.md` for the wider NestJS
> declaration model (operationIds, securitySchemes, `@ApiResponse`
> patterns) the error envelope sits inside.

## When to use this pattern

Every API has an error response shape. The frontend, mobile clients,
and integrations all depend on it being predictable. The probe extracts
your declared shape statically from the global exception filter and then
asserts every error response in every flow matches it.

You don't choose to "use this pattern" — you always have one. This
skill teaches you how to declare it so the probe can verify it.

## How to declare it (so the probe verifies it)

The probe's `detectors/error-envelope.js` performs a static AST scan of
your bootstrap entrypoint:

1. Reads `apps/api/src/main.ts`.
2. Finds `app.useGlobalFilters(new <ClassName>())` calls.
3. Resolves `<ClassName>` to its source file via `import { <ClassName> }
   from '<path>'`.
4. Reads the filter's catch handler.
5. Parses **either** `response.status(...).json({...})` **or**
   `response.status(...).send({...})` literal — both Express response
   methods are recognised. Use whichever idiom your filter uses.
6. Extracts:
   - `wrapper`: array path to unwrap, e.g. `['error']`.
   - `statusField`: numeric-status field name within the unwrapped
     object.
   - `messageField`: error message field name.
   - `errorsArrayField`: optional validation-errors array field name.

Result is stored in `matrix.errorEnvelope`. The
`buildErrorAssertions()` helper in `lib/error-shape.js` consumes this
to assert every error response.

### Semantic field roles — declaration required (v1 strict)

The detector returns the **full set of declared field names** in
`matrix.errorEnvelope.declaredFields` verbatim — there is no built-in
field-name dictionary mapping `statusCode`/`status` → `statusField` or
`message`/`detail` → `messageField`. Earlier versions of the probe used
a hardcoded name list; that was a heuristic and was removed.

To enable semantic-role assertions (assert that the numeric status field
matches the HTTP status code, that the message field is non-empty, that
the validation-errors array is an array), declare each role on the error
response schema via OpenAPI extensions:

```ts
// In your error response DTO or @ApiResponse() decorator:
@ApiResponse({
  status: 400,
  schema: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: false },
      error: {
        type: 'object',
        properties: {
          statusCode: { type: 'number' },
          message: { type: 'string' },
          errors: { type: 'array', items: { /* … */ } },
        },
      },
    },
    'x-error-status-field': 'statusCode',
    'x-error-message-field': 'message',
    'x-error-errors-field': 'errors',
  },
})
```

If you omit any of these extensions:

| DIAG | Effect |
|---|---|
| `ERROR_STATUS_FIELD_UNDECLARED` | Probe carries the field names verbatim but cannot assert `body.<wrapper>.<statusField>` equals the HTTP status. |
| `ERROR_MESSAGE_FIELD_UNDECLARED` | Probe cannot assert message is a non-empty string. |
| (no DIAG; optional) `x-error-errors-field` | Validation-array assertions are skipped. |

Field-name idiomatic conventions like `statusCode` / `message` are still
the recommended **values** for these extensions — but the extension
itself must be present. The probe never assumes it.

The probe also classifies the shape into one of five **families**
(see `lib/error-shape.js`):

- `nest-default` — `{ statusCode, message, error }`.
- `nest-wrapped` — `{ success: false, error: { statusCode, message, ... } }`.
- `problem-json` — RFC 7807 `{ type, title, status, detail }` with
  `Content-Type: application/problem+json`.
- `errors-array` — `{ errors: [{ field, message }] }` for validation.
- `flat-message` — `{ message }` only.

## Code template — the recommended NestJS-wrapped shape

In `apps/api/src/common/filters/global-exception.filter.ts`:

```ts
import { Catch, ExceptionFilter, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { ZodError } from 'zod';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'internal_server_error';
    let errors: Array<{ field: string; message: string }> | undefined;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') message = res;
      else if (typeof res === 'object' && res !== null) {
        message = (res as any).message ?? 'error';
      }
    } else if (exception instanceof ZodError) {
      statusCode = HttpStatus.BAD_REQUEST;
      message = 'validation_error';
      errors = exception.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
    }

    response.status(statusCode).json({
      success: false,
      error: { statusCode, message, ...(errors && { errors }) },
    });
  }
}
```

In `apps/api/src/main.ts`:

```ts
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalFilters(new GlobalExceptionFilter());
  // ...
}
```

The detector will extract:

```
{
  wrapper: ['error'],
  declaredFields: [
    { key: 'statusCode', value: 'statusCode' },
    { key: 'message',    value: 'message' },
    { key: 'errors',     value: '...(errors && { errors })' },
  ],
  spreadFields: ['errors'],
  // Populated only when x-error-*-field extensions are declared:
  statusField: 'statusCode',
  messageField: 'message',
  errorsArrayField: 'errors',
  source: 'apps/api/src/common/filters/global-exception.filter.ts',
}
```

`declaredFields` and `spreadFields` are always populated (verbatim, by
static AST scan). `statusField`/`messageField`/`errorsArrayField` are
populated only from explicit `x-error-*-field` extensions on the
response schema. Missing extensions → probe carries field names but
skips semantic-role assertions and emits the corresponding `*_UNDECLARED`
DIAG.

## What the probe will assert (when present)

For every flow whose `expect` step has a 4xx/5xx status, the probe runs
the appropriate family assertion automatically — you don't add anything
to flow definitions:

- That `body.<wrapper>.<statusField>` equals the HTTP status code.
- That `body.<wrapper>.<messageField>` is a non-empty string.
- For 400 validation errors: that `body.<wrapper>.<errorsArrayField>`
  is an array, AND if the flow specifies `errorFieldMentions: 'fieldX'`,
  that at least one entry's `field` or `message` mentions `fieldX`.

## Anti-patterns the probe will surface as drift

- Mixing two families across endpoints — e.g. one route returns
  `{ statusCode, message }` (nest-default) but another returns
  `{ success: false, error: {...} }` (nest-wrapped). The detector
  picks one (the global filter's), and the deviating endpoint surfaces
  as a drift.
- Manual `@Res()` and `response.json({...})` in a controller that
  bypasses the global filter and uses a different shape — the probe's
  assertion fails on that endpoint specifically.
- Using `@ts-ignore` to suppress a type error from inconsistent error
  shapes — the runtime still differs; the probe still catches it.
- Letting an unhandled `Error` (not `HttpException`) bubble up to a
  500 with a different shape — fix by always wrapping in
  `HttpException` or letting the global filter's catch-all branch
  produce the standard shape.

## Source of truth the probe scans

- `apps/api/src/main.ts` — the `useGlobalFilters(new X())` call.
- The filter source file — `response.status(...).json({...})` literal
  inside the catch handler.
- `matrix.errorEnvelope` — the static extraction result, consumed by
  `lib/error-shape.js`'s `buildErrorAssertions()`.
- `matrix.responseEnvelope` — the success envelope, used to know
  whether to also unwrap the success wrapper before checking the
  error wrapper (e.g. when an interceptor wraps both success and
  error in `{ data }` / `{ error }`).
