import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiEnvelopeDto } from '../../../../common/dto/envelope.dto';
import { HealthDataDto } from '../dto/health-response.dto';

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Liveness probe' })
  @ApiResponse({
    status: 200,
    description: 'Service is alive and the database is reachable',
    type: ApiEnvelopeDto(HealthDataDto),
  })
  check(): HealthDataDto {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: 'connected',
    };
  }
}
