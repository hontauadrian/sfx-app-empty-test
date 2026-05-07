import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable, map } from 'rxjs';

interface SuccessResponse<T> {
  readonly success: true;
  readonly data: T;
}

// NestJS @Sse() decorator metadata key. Re-declared here to avoid pulling in
// @nestjs/common/constants (not part of the public surface). Value matches
// SSE_METADATA in @nestjs/common@11.x.
const SSE_METADATA_KEY = '__sse__';

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, SuccessResponse<T> | T> {
  static readonly ENVELOPE = {
    successWrapper: ['data'] as const,
    errorPath: 'error' as const,
  };

  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<SuccessResponse<T> | T> {
    // Skip wrapping for GraphQL — Apollo handles its own response format.
    // We check `context.getType()` instead of relying on GqlExecutionContext.getInfo()
    // because normalizeResolverArgs maps REST 3-arg arrays so getInfo() returns
    // the Express `next` function (truthy), incorrectly skipping the wrapper.
    const contextType = context.getType<string>();
    if (contextType === 'graphql') {
      return next.handle();
    }

    // Skip wrapping for SSE handlers. Each emission from an Observable<MessageEvent>
    // must reach NestJS SseStream as a plain MessageEvent so its `type`, `id`,
    // `retry`, and `data` fields are written as separate SSE wire fields. Wrapping
    // each emission in {success, data} would collapse all metadata into a JSON-
    // stringified `data:` line and drop the `event:`/`retry:` lines entirely.
    const handler = context.getHandler();
    if (handler && Reflect.getMetadata(SSE_METADATA_KEY, handler) === true) {
      return next.handle();
    }

    return next.handle().pipe(
      map((data) => ({
        success: true as const,
        data,
      })),
    );
  }
}
