import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppConfigModule } from './config/config.module';
import { AuthModule } from './modules/auth/auth.module';
import { BrandModule } from './modules/brand/brand.module';
import { BrandGuidelinesModule } from './modules/brand-guidelines/brand-guidelines.module';
import { CompanyInfoModule } from './modules/company-info/company-info.module';
import { HealthModule } from './modules/health/health.module';
import { AgentAuditLogModule } from './modules/agent-audit-log/agent-audit-log.module';

@Module({
  imports: [
    AppConfigModule,
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),
    AuthModule,
    HealthModule,
    CompanyInfoModule,
    BrandModule,
    BrandGuidelinesModule,
    AgentAuditLogModule,
  ],
})
export class AppModule {}
