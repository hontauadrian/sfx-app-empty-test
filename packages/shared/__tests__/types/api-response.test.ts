import { createSuccessResponse, createErrorResponse } from '../../src/types/api-response.type';
import { HttpStatus } from '../../src/enums/http-status.enum';
import { ErrorCode } from '../../src/enums/error-code.enum';

describe('ApiResponse', () => {
  it('should create a success response', () => {
    const response = createSuccessResponse({ id: '1', name: 'Test' });

    expect(response.success).toBe(true);
    expect(response.data).toEqual({ id: '1', name: 'Test' });
    expect(response.error).toBeUndefined();
  });

  it('should create an error response', () => {
    const response = createErrorResponse(
      HttpStatus.BAD_REQUEST,
      ErrorCode.VALIDATION_ERROR,
      'Invalid input',
    );

    expect(response.success).toBe(false);
    expect(response.data).toBeUndefined();
    expect(response.error).toEqual({
      statusCode: 400,
      code: ErrorCode.VALIDATION_ERROR,
      message: 'Invalid input',
    });
  });
});
