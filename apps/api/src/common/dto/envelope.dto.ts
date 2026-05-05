import { ApiProperty } from '@nestjs/swagger';

/**
 * Factory for the standard success-envelope Swagger DTO.
 *
 * Every endpoint wrapped by `TransformInterceptor` returns:
 *   { success: true, data: <T> }
 *
 * Declaring this shape on `@ApiResponse({ type: ApiEnvelopeDto(MyDataDto) })`
 * keeps the OpenAPI spec aligned with the runtime response so the
 * route-contract probe in `verify-full-contract.js` validates body
 * structure end-to-end. Without a typed envelope on `@ApiResponse`, the
 * probe sees the declared shape (raw data) diverge from the actual
 * shape (wrapped envelope), and builders historically reached for
 * `@ApiExcludeEndpoint` to bypass — which hides the route from public
 * Swagger docs and breaks human discoverability. Use this helper
 * instead.
 *
 * Usage:
 *   class HealthDataDto { @ApiProperty({type:String}) status: string; ... }
 *   @ApiResponse({ status: 200, type: ApiEnvelopeDto(HealthDataDto) })
 *   check(): HealthDataDto { return { ... }; }
 */
export function ApiEnvelopeDto<T>(DataDto: new () => T): new () => {
  success: true;
  data: T;
} {
  class EnvelopeDto {
    @ApiProperty({ type: Boolean, default: true })
    declare success: true;

    @ApiProperty({ type: DataDto })
    declare data: T;
  }
  Object.defineProperty(EnvelopeDto, 'name', {
    value: `Envelope<${DataDto.name}>`,
  });
  return EnvelopeDto as new () => { success: true; data: T };
}
