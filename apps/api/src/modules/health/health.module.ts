import { Module } from '@nestjs/common';
import { HealthController } from './application/controllers/health.controller';

@Module({
  controllers: [HealthController],
})
export class HealthModule {}
