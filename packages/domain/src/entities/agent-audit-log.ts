// Audit-trail row recording every agent-authenticated HTTP read against
// the Brand-Guidelines API surface. Captured by the AgentAuditInterceptor;
// surfaced via GET /api/v1/brands/:brandId/agent-audit-log (admin-only).
//
// Retention is 90 days (documented; actual purge job out of scope).
export interface AgentAuditLog {
  readonly id: string;
  readonly requestId: string;
  readonly clientId: string;
  readonly endpointPath: string;
  readonly brandId: string | null;
  readonly versionIdReturned: string | null;
  readonly requestTimestamp: Date;
  readonly responseStatus: number;
}

export interface CreateAgentAuditLogInput {
  readonly requestId: string;
  readonly clientId: string;
  readonly endpointPath: string;
  readonly brandId: string | null;
  readonly versionIdReturned: string | null;
  readonly requestTimestamp: Date;
  readonly responseStatus: number;
}

// Cursor-less, take-based newest-first pagination scoped to a brand.
// Filterable by clientId substring and request-timestamp range.
export interface ListAgentAuditLogsInput {
  readonly brandId: string;
  readonly clientId?: string;
  readonly q?: string;
  readonly from?: Date;
  readonly to?: Date;
  readonly take: number;
}

export interface ListAgentAuditLogsResult {
  readonly items: readonly AgentAuditLog[];
}
