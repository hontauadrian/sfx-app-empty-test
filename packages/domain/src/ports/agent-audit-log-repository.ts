import type {
  AgentAuditLog,
  CreateAgentAuditLogInput,
  ListAgentAuditLogsInput,
  ListAgentAuditLogsResult,
} from '../entities/agent-audit-log';

export interface AgentAuditLogRepository {
  create(input: CreateAgentAuditLogInput): Promise<AgentAuditLog>;
  list(input: ListAgentAuditLogsInput): Promise<ListAgentAuditLogsResult>;
}
