import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { prisma } from '@sfx/database';
import { AuthTokenService } from '../../common/auth/auth-token.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { BrandPrismaRepository } from '../brand/data/repositories/brand.repository';
import { BRAND_REPOSITORY } from '../brand/data/repositories/brand.tokens';
import { AgentAuditLogController } from './application/controllers/agent-audit-log.controller';
import { AgentAuditMiddleware } from './application/middleware/agent-audit.middleware';
import { ListAgentAuditLogQueryPipe } from './application/pipes/list-agent-audit-log-query.pipe';
import { AgentAuditLogPrismaRepository } from './data/repositories/agent-audit-log.repository';
import {
  AGENT_AUDIT_LOG_PRISMA_CLIENT,
  AGENT_AUDIT_LOG_REPOSITORY,
} from './data/repositories/agent-audit-log.tokens';

@Module({
  controllers: [AgentAuditLogController],
  providers: [
    AuthTokenService,
    JwtAuthGuard,
    ListAgentAuditLogQueryPipe,
    AgentAuditMiddleware,
    { provide: AGENT_AUDIT_LOG_PRISMA_CLIENT, useValue: prisma },
    {
      provide: BRAND_REPOSITORY,
      useFactory: (): BrandPrismaRepository => new BrandPrismaRepository(prisma),
    },
    { provide: AGENT_AUDIT_LOG_REPOSITORY, useClass: AgentAuditLogPrismaRepository },
  ],
  exports: [AGENT_AUDIT_LOG_REPOSITORY, AgentAuditMiddleware],
})
export class AgentAuditLogModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AgentAuditMiddleware).forRoutes('*');
  }
}
