export interface AgentAuditLogDataModel {
  readonly id: string;
  readonly requestId: string;
  readonly clientId: string;
  readonly endpointPath: string;
  readonly brandId: string | null;
  readonly versionIdReturned: string | null;
  readonly requestTimestamp: string;
  readonly responseStatus: number;
}

export interface AgentAuditLogListDataModel {
  readonly items: readonly AgentAuditLogDataModel[];
}
