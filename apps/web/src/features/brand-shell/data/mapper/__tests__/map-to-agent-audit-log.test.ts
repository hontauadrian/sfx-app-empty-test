import { describe, expect, it } from 'vitest';

import {
  mapToAgentAuditLog,
  mapToAgentAuditLogList,
} from '../map-to-agent-audit-log';

describe('mapToAgentAuditLog', () => {
  it('parses the requestTimestamp string into a Date', () => {
    const result = mapToAgentAuditLog({
      id: 'aud-1',
      requestId: 'req-1',
      clientId: 'agent-1',
      endpointPath: '/api/v1/brands/brand-1/guidelines/voice',
      brandId: 'brand-1',
      versionIdReturned: 'v-1',
      requestTimestamp: '2026-05-18T10:00:00.000Z',
      responseStatus: 200,
    });
    expect(result.requestTimestamp).toBeInstanceOf(Date);
    expect(result.requestTimestamp.toISOString()).toBe('2026-05-18T10:00:00.000Z');
  });

  it('preserves null brandId + versionIdReturned', () => {
    const result = mapToAgentAuditLog({
      id: 'aud-2',
      requestId: 'req-2',
      clientId: 'agent-2',
      endpointPath: '/api/v1/brands',
      brandId: null,
      versionIdReturned: null,
      requestTimestamp: '2026-05-18T10:00:00.000Z',
      responseStatus: 200,
    });
    expect(result.brandId).toBeNull();
    expect(result.versionIdReturned).toBeNull();
  });

  it('mapToAgentAuditLogList maps every row', () => {
    const result = mapToAgentAuditLogList({
      items: [
        {
          id: 'aud-3',
          requestId: 'req-3',
          clientId: 'agent-3',
          endpointPath: '/api/v1/brands/brand-1/guidelines/visual',
          brandId: 'brand-1',
          versionIdReturned: null,
          requestTimestamp: '2026-05-18T10:00:00.000Z',
          responseStatus: 200,
        },
      ],
    });
    expect(result.items.length).toBe(1);
    expect(result.items[0]?.endpointPath).toBe(
      '/api/v1/brands/brand-1/guidelines/visual',
    );
  });
});
