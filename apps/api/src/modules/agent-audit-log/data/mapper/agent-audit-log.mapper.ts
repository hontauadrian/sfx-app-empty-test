import type { AgentAuditLog } from '@sfx/domain';

export interface AgentAuditLogRow {
  readonly id: string;
  readonly requestId: string;
  readonly clientId: string;
  readonly endpointPath: string;
  readonly brandId: string | null;
  readonly versionIdReturned: string | null;
  readonly requestTimestamp: Date;
  readonly responseStatus: number;
}

export function toAgentAuditLog(row: AgentAuditLogRow): AgentAuditLog {
  return {
    id: row.id,
    requestId: row.requestId,
    clientId: row.clientId,
    endpointPath: row.endpointPath,
    brandId: row.brandId,
    versionIdReturned: row.versionIdReturned,
    requestTimestamp: row.requestTimestamp,
    responseStatus: row.responseStatus,
  };
}
