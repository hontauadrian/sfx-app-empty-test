import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';

interface ExceptionBody {
  readonly message?: string;
  readonly errors?: unknown[];
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errors: unknown[] | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else {
        const typedBody = body as ExceptionBody;
        message = typedBody.message ?? message;
        errors = typedBody.errors;
      }
    } else if (exception instanceof Error) {
      // Non-HttpException = unhandled runtime fault. In any environment other
      // than production, the response carries the standard ECMAScript `Error`
      // fields (`name`, `message`, `stack`) so the probe runner — which already
      // captures every failed response body via `responseEcho` — surfaces the
      // exact throw site in `.http-smoke.md` without needing docker logs or a
      // separate file. The `Error.prototype` properties are spec-defined; this
      // filter just forwards them, no new contract introduced.
      message = exception.message ?? message;
    }

    const includeUnhandledTrace =
      !(exception instanceof HttpException) &&
      exception instanceof Error &&
      process.env.NODE_ENV !== 'production';

    response.status(status).json({
      success: false,
      error: {
        statusCode: status,
        message,
        ...(errors ? { errors } : {}),
        ...(includeUnhandledTrace
          ? {
              name: (exception as Error).name,
              stack: (exception as Error).stack,
            }
          : {}),
      },
    });
  }
}
