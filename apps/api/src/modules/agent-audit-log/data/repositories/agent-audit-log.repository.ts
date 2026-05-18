import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@sfx/database';
import type {
  AgentAuditLog,
  AgentAuditLogRepository,
  CreateAgentAuditLogInput,
  ListAgentAuditLogsInput,
  ListAgentAuditLogsResult,
} from '@sfx/domain';
import { toAgentAuditLog } from '../mapper/agent-audit-log.mapper';
import { AGENT_AUDIT_LOG_PRISMA_CLIENT } from './agent-audit-log.tokens';

@Injectable()
export class AgentAuditLogPrismaRepository implements AgentAuditLogRepository {
  constructor(
    @Inject(AGENT_AUDIT_LOG_PRISMA_CLIENT) private readonly prisma: PrismaClient,
  ) {}

  async create(input: CreateAgentAuditLogInput): Promise<AgentAuditLog> {
    const row = await this.prisma.agentAuditLog.create({
      data: {
        requestId: input.requestId,
        clientId: input.clientId,
        endpointPath: input.endpointPath,
        brandId: input.brandId,
        versionIdReturned: input.versionIdReturned,
        requestTimestamp: input.requestTimestamp,
        responseStatus: input.responseStatus,
      },
    });
    return toAgentAuditLog(row);
  }

  async list(input: ListAgentAuditLogsInput): Promise<ListAgentAuditLogsResult> {
    const items = await this.prisma.agentAuditLog.findMany({
      where: {
        brandId: input.brandId,
        ...(input.clientId
          ? { clientId: { contains: input.clientId, mode: 'insensitive' } }
          : {}),
        ...(input.q
          ? {
              OR: [
                { clientId: { contains: input.q, mode: 'insensitive' } },
                { endpointPath: { contains: input.q, mode: 'insensitive' } },
              ],
            }
          : {}),
        ...(input.from || input.to
          ? {
              requestTimestamp: {
                ...(input.from ? { gte: input.from } : {}),
                ...(input.to ? { lte: input.to } : {}),
              },
            }
          : {}),
      },
      orderBy: [{ requestTimestamp: 'desc' }, { id: 'desc' }],
      take: input.take,
    });
    return { items: items.map(toAgentAuditLog) };
  }
}
