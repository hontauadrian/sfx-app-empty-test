import { ApiProperty } from '@nestjs/swagger';

export class HealthDataDto {
  @ApiProperty({ type: String, example: 'ok' })
  declare status: string;

  @ApiProperty({ type: String, format: 'date-time' })
  declare timestamp: string;

  @ApiProperty({ type: String, example: 'connected' })
  declare database: string;
}
