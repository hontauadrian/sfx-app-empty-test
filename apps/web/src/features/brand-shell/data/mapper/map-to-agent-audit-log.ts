import type { AgentAuditLog } from '@sfx/domain';
import type {
  AgentAuditLogDataModel,
  AgentAuditLogListDataModel,
} from '../model/agent-audit-log-data-model';

export function mapToAgentAuditLog(data: AgentAuditLogDataModel): AgentAuditLog {
  return {
    id: data.id,
    requestId: data.requestId,
    clientId: data.clientId,
    endpointPath: data.endpointPath,
    brandId: data.brandId,
    versionIdReturned: data.versionIdReturned,
    requestTimestamp: new Date(data.requestTimestamp),
    responseStatus: data.responseStatus,
  };
}

export function mapToAgentAuditLogList(
  data: AgentAuditLogListDataModel,
): { readonly items: readonly AgentAuditLog[] } {
  return { items: data.items.map(mapToAgentAuditLog) };
}
