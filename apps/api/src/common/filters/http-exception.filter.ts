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
    }

    response.status(status).json({
      success: false,
      error: {
        statusCode: status,
        message,
        ...(errors ? { errors } : {}),
      },
    });
  }
}
