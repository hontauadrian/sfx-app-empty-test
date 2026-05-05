import 'reflect-metadata';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of, toArray } from 'rxjs';
import { TransformInterceptor } from '../transform.interceptor';

const SSE_METADATA_KEY = '__sse__';

function makeContext(opts: {
  type?: string;
  handler?: () => void;
}): ExecutionContext {
  const handler = opts.handler ?? ((): void => undefined);
  return {
    getType: <T>() => (opts.type ?? 'http') as unknown as T,
    getHandler: () => handler,
    getClass: () => class Stub {},
    getArgs: () => [] as unknown as never[],
    getArgByIndex: () => undefined as unknown,
    switchToHttp: () => ({} as never),
    switchToRpc: () => ({} as never),
    switchToWs: () => ({} as never),
  } as unknown as ExecutionContext;
}

function makeCallHandler<T>(value: T): CallHandler<T> {
  return { handle: () => of(value) };
}

describe('TransformInterceptor', () => {
  let interceptor: TransformInterceptor<unknown>;

  beforeEach(() => {
    interceptor = new TransformInterceptor();
  });

  it('wraps REST responses in {success, data}', async () => {
    const ctx = makeContext({ type: 'http' });
    const handler = makeCallHandler({ id: '42', name: 'foo' });

    const result = await lastValueFrom(interceptor.intercept(ctx, handler));

    expect(result).toEqual({
      success: true,
      data: { id: '42', name: 'foo' },
    });
  });

  it('passes GraphQL responses through untouched (Apollo handles its own envelope)', async () => {
    const ctx = makeContext({ type: 'graphql' });
    const handler = makeCallHandler({ user: { id: '1' } });

    const result = await lastValueFrom(interceptor.intercept(ctx, handler));

    expect(result).toEqual({ user: { id: '1' } });
  });

  it('passes SSE handler emissions through untouched so SseStream sees raw MessageEvents', async () => {
    const sseHandler = function sseRoute(): void { /* marker */ };
    Reflect.defineMetadata(SSE_METADATA_KEY, true, sseHandler);

    const ctx = makeContext({ type: 'http', handler: sseHandler });
    const handler = makeCallHandler({
      type: 'progress',
      id: 'evt-1',
      retry: 3000,
      data: '{"step":1}',
    });

    const result = await lastValueFrom(interceptor.intercept(ctx, handler));

    expect(result).toEqual({
      type: 'progress',
      id: 'evt-1',
      retry: 3000,
      data: '{"step":1}',
    });
  });

  it('still wraps non-SSE handlers that lack the SSE metadata key', async () => {
    const plainHandler = function plainRoute(): void { /* marker */ };
    // explicitly assert no SSE metadata
    expect(Reflect.getMetadata(SSE_METADATA_KEY, plainHandler)).toBeUndefined();

    const ctx = makeContext({ type: 'http', handler: plainHandler });
    const handler = makeCallHandler({ ok: true });

    const result = await lastValueFrom(interceptor.intercept(ctx, handler));

    expect(result).toEqual({ success: true, data: { ok: true } });
  });

  it('does not wrap handlers whose SSE metadata is set to a falsy value', async () => {
    // Defensive: only `=== true` skips wrapping. A handler that somehow gets
    // `false` set should still be wrapped — confirms we are not using truthy
    // checks that could misfire on unrelated metadata shapes.
    const falseSseHandler = function notReallySse(): void { /* marker */ };
    Reflect.defineMetadata(SSE_METADATA_KEY, false, falseSseHandler);

    const ctx = makeContext({ type: 'http', handler: falseSseHandler });
    const handler = makeCallHandler({ x: 1 });

    const result = await lastValueFrom(interceptor.intercept(ctx, handler));

    expect(result).toEqual({ success: true, data: { x: 1 } });
  });

  it('preserves multiple emissions from a streaming handler when SSE metadata is set', async () => {
    const sseHandler = function streamRoute(): void { /* marker */ };
    Reflect.defineMetadata(SSE_METADATA_KEY, true, sseHandler);

    const ctx = makeContext({ type: 'http', handler: sseHandler });
    const events = [
      { type: 'progress', data: '{"step":0}' },
      { type: 'progress', data: '{"step":1}' },
      { type: 'complete', data: '{"step":2}' },
    ];
    const handler: CallHandler<unknown> = { handle: () => of(...events) };

    const result = await lastValueFrom(
      interceptor.intercept(ctx, handler).pipe(toArray()),
    );

    expect(result).toEqual(events);
  });
});
