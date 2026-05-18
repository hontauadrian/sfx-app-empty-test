import { describe, expect, it } from 'vitest';

import type {
  AgentAuditLogDataModel,
  AgentAuditLogListDataModel,
} from '../agent-audit-log-data-model';

describe('AgentAuditLogDataModel shape', () => {
  it('compiles a populated row (timestamps are strings on the wire)', () => {
    const row: AgentAuditLogDataModel = {
      id: 'aud-1',
      requestId: 'req-1',
      clientId: 'agent-1',
      endpointPath: '/api/v1/brands/brand-1/guidelines/voice',
      brandId: 'brand-1',
      versionIdReturned: 'v-1',
      requestTimestamp: '2026-05-18T10:00:00.000Z',
      responseStatus: 200,
    };
    expect(row.requestTimestamp).toBe('2026-05-18T10:00:00.000Z');
  });

  it('allows null brandId + versionIdReturned', () => {
    const row: AgentAuditLogDataModel = {
      id: 'aud-2',
      requestId: 'req-2',
      clientId: 'agent-2',
      endpointPath: '/api/v1/brands',
      brandId: null,
      versionIdReturned: null,
      requestTimestamp: '2026-05-18T10:00:00.000Z',
      responseStatus: 200,
    };
    expect(row.brandId).toBeNull();
    expect(row.versionIdReturned).toBeNull();
  });

  it('AgentAuditLogListDataModel holds an items array', () => {
    const page: AgentAuditLogListDataModel = { items: [] };
    expect(page.items.length).toBe(0);
  });
});
