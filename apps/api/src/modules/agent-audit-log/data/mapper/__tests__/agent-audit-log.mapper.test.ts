import { describe, expect, it } from 'vitest';

import { toAgentAuditLog, type AgentAuditLogRow } from '../agent-audit-log.mapper';

describe('toAgentAuditLog', () => {
  const baseRow: AgentAuditLogRow = {
    id: 'aud-1',
    requestId: 'req-abc',
    clientId: 'brand-reader-agent-001',
    endpointPath: '/api/v1/brands/brand-1/guidelines/voice',
    brandId: 'brand-1',
    versionIdReturned: 'v-1',
    requestTimestamp: new Date('2026-05-18T10:00:00.000Z'),
    responseStatus: 200,
  };

  it('maps a fully populated row to the domain entity 1:1', () => {
    const mapped = toAgentAuditLog(baseRow);
    expect(mapped).toEqual(baseRow);
  });

  it('preserves null brandId + versionIdReturned (e.g. /brands listing)', () => {
    const mapped = toAgentAuditLog({
      ...baseRow,
      brandId: null,
      versionIdReturned: null,
      endpointPath: '/api/v1/brands',
    });
    expect(mapped.brandId).toBeNull();
    expect(mapped.versionIdReturned).toBeNull();
    expect(mapped.endpointPath).toBe('/api/v1/brands');
  });

  it('preserves non-200 response statuses (403/404/etc.)', () => {
    const mapped = toAgentAuditLog({ ...baseRow, responseStatus: 403 });
    expect(mapped.responseStatus).toBe(403);
  });

  it('preserves the requestTimestamp as a Date instance', () => {
    const mapped = toAgentAuditLog(baseRow);
    expect(mapped.requestTimestamp).toBeInstanceOf(Date);
    expect(mapped.requestTimestamp.toISOString()).toBe('2026-05-18T10:00:00.000Z');
  });
});
