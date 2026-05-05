import { HttpStatus } from '../enums/http-status.enum';
import { ErrorCode } from '../enums/error-code.enum';

export interface ApiSuccessResponse<T> {
  readonly success: true;
  readonly data: T;
  readonly error?: undefined;
}

export interface ApiErrorDetail {
  readonly statusCode: HttpStatus;
  readonly code: ErrorCode;
  readonly message: string;
}

export interface ApiErrorResponse {
  readonly success: false;
  readonly data?: undefined;
  readonly error: ApiErrorDetail;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export function createSuccessResponse<T>(data: T): ApiSuccessResponse<T> {
  return { success: true, data };
}

export function createErrorResponse(
  statusCode: HttpStatus,
  code: ErrorCode,
  message: string,
): ApiErrorResponse {
  return {
    success: false,
    error: { statusCode, code, message },
  };
}
