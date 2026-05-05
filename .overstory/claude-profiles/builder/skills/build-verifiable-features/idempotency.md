# Idempotency

## When to use this pattern

Any POST endpoint where the client may retry on network failure and a
duplicate write would cause damage: payment capture, order placement,
sending a notification, creating any unique resource. The client sends
the same `Idempotency-Key` header on both attempts; the server must
return the same response without performing the side effect twice.

## How to declare it (so the probe verifies it)

The probe's nest-openapi detector looks for an `@ApiHeader({ name:
'Idempotency-Key' })` parameter on a POST endpoint. When present, it
populates `matrix.apiEndpoints[i].idempotencyProfile`:

```
{
  headerName: 'Idempotency-Key',
  ttlSeconds: 86400,           // from x-idempotency-ttl, optional
}
```

`flows-generator.js`'s `emitIdempotencyFlow(ep)` then emits flows per
such endpoint. Three flows now:

- `:replay` — same key twice → both 2xx
- `:different-key` — distinct key → distinct resource
- `:no-key` — POST without the key header → expect 400 (only emitted
  if `@ApiHeader` declares `required: true`)

### Vendor extension

| Extension | Purpose | Probe effect |
|---|---|---|
| `x-idempotency-ttl: 86400` | TTL in seconds | Documents replay window; not directly asserted but logged in matrix; future: probe may delay between replays to verify TTL |

Add via `@ApiOperation({ extensions: { 'x-idempotency-ttl': 86400 } })`.

### Replay must succeed even on backend failures

The replay store must serve cached responses for previous successes
even if the underlying service is currently unavailable. The probe
does not simulate that scenario, but the contract is: once a key has
recorded a successful response, every subsequent POST with that key
must return the recorded response, never a 502/503/504 from the
backend the original request hit. Implement the cache lookup BEFORE
forwarding to the backend.

## Code template

```ts
import { Controller, Post, Headers, Body, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiHeader, ApiResponse, ApiBody } from '@nestjs/swagger';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly idempotency: IdempotencyService) {}

  @Post()
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'UUID v4. Replaying with the same key returns the original response.',
  })
  @ApiBody({ type: CreatePaymentDto })
  @ApiResponse({ status: 201, type: PaymentDto })
  @ApiResponse({ status: 400, description: 'Missing or invalid Idempotency-Key' })
  async create(
    @Headers('idempotency-key') key: string,
    @Body() dto: CreatePaymentDto,
  ): Promise<PaymentDto> {
    if (!key) throw new BadRequestException('missing_idempotency_key');

    const cached = await this.idempotency.lookup(key);
    if (cached) return cached;

    const payment = await this.payments.create(dto);
    await this.idempotency.store(key, payment);
    return payment;
  }
}
```

The `IdempotencyService` should:
1. Store `(key → response)` in a TTL-bounded cache (Redis, DB table,
   in-memory for dev).
2. On lookup hit, return the SAME response object (or its serialized
   form) — same `id`, same `status`, same body.
3. Use a request-body hash as a secondary key if you want to reject
   key reuse with a different body (return 422 with
   `idempotency_key_conflict`).

## What the probe will assert (when present)

- `<path-id>:post:idempotency:replay` — POST with key A → expect
  `200`/`201` → capture `firstId` from response → POST same path with
  same key A and same body → expect `200`/`201`. The probe binds
  `${uniqUuid}` as a freshly-generated UUID per flow run, so the same
  value is reused across both POSTs.
- `<path-id>:post:idempotency:different-key` — POST with key A → capture
  `firstResourceId` → POST with key B (`${uniqUuid2}`) → expect
  `200`/`201`. Two different keys must produce two distinct resources.

The probe does not (yet) assert that `firstId === secondId` on replay,
but it does assert both calls succeed without error. If your replay
returns 500, the test fails.

## Anti-patterns the probe will surface as drift

- Allowing the second POST with the same key to create a duplicate
  resource — implementation bug; the `:replay` flow may pass on
  status alone but you'll see two rows in the DB. Strengthen your
  test by asserting `body.id` equality in the unit suite.
- Returning 409 on replay — the probe expects 2xx for valid replays;
  409 is the right answer only for key-with-different-body reuse.
- Returning 500 when key is missing — must throw `BadRequestException`
  for 400.
- Storing the key without TTL — eventually fills the table; not a
  correctness drift but a maintenance one.

## Source of truth the probe scans

- The compiled OpenAPI document — endpoint `parameters[in=header]`
  with name matching `idempotency-key` (case-insensitive).
- `matrix.apiEndpoints[i].idempotencyProfile.headerName` — the exact
  header name to send (preserves case).
- The handler's `@Body()` Zod / class-validator schema — used by
  `buildSampleBody()` to construct the replay payload.
