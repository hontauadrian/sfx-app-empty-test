import { describe, expect, it } from 'vitest';

import {
  agentAuditLogResponseSchema,
  agentAuditLogListResponseSchema,
  listAgentAuditLogQuerySchema,
} from '../agent-audit-log.schema';

describe('agentAuditLogResponseSchema', () => {
  it('accepts a fully populated row', () => {
    const result = agentAuditLogResponseSchema.safeParse({
      id: 'aud-1',
      requestId: 'req-1',
      clientId: 'brand-reader-agent-001',
      endpointPath: '/api/v1/brands/brand-1/guidelines/voice',
      brandId: 'brand-1',
      versionIdReturned: 'v-1',
      requestTimestamp: new Date('2026-05-18T10:00:00.000Z'),
      responseStatus: 200,
    });
    expect(result.success).toBe(true);
  });

  it('accepts null brandId + versionIdReturned (e.g. /brands listing)', () => {
    const result = agentAuditLogResponseSchema.safeParse({
      id: 'aud-2',
      requestId: 'req-2',
      clientId: 'agent-2',
      endpointPath: '/api/v1/brands',
      brandId: null,
      versionIdReturned: null,
      requestTimestamp: new Date('2026-05-18T10:00:00.000Z'),
      responseStatus: 200,
    });
    expect(result.success).toBe(true);
  });

  it('rejects responseStatus outside the HTTP range', () => {
    const result = agentAuditLogResponseSchema.safeParse({
      id: 'aud-3',
      requestId: 'req-3',
      clientId: 'agent-3',
      endpointPath: '/api/v1/brands',
      brandId: null,
      versionIdReturned: null,
      requestTimestamp: new Date(),
      responseStatus: 99,
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown fields (strict)', () => {
    const result = agentAuditLogResponseSchema.safeParse({
      id: 'aud-4',
      requestId: 'req-4',
      clientId: 'agent-4',
      endpointPath: '/api/v1/brands',
      brandId: null,
      versionIdReturned: null,
      requestTimestamp: new Date(),
      responseStatus: 200,
      extra: 'nope',
    });
    expect(result.success).toBe(false);
  });
});

describe('agentAuditLogListResponseSchema', () => {
  it('accepts an empty items array', () => {
    expect(agentAuditLogListResponseSchema.safeParse({ items: [] }).success).toBe(true);
  });
});

describe('listAgentAuditLogQuerySchema', () => {
  it('accepts an empty query (all filters optional)', () => {
    expect(listAgentAuditLogQuerySchema.safeParse({}).success).toBe(true);
  });

  it('accepts a clientId substring + date range + take', () => {
    const result = listAgentAuditLogQuerySchema.safeParse({
      clientId: 'brand-reader-agent',
      from: '2026-05-01T00:00:00.000Z',
      to: '2026-05-18T23:59:59.999Z',
      take: '50',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.take).toBe(50);
    }
  });

  it('rejects when from > to', () => {
    const result = listAgentAuditLogQuerySchema.safeParse({
      from: '2026-05-18T00:00:00.000Z',
      to: '2026-05-01T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('from must be <= to');
    }
  });

  it('coerces invalid date strings to undefined (probe-empty-sentinel safe)', () => {
    const result = listAgentAuditLogQuerySchema.safeParse({ from: 'not-a-date' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.from).toBeUndefined();
    }
  });

  it('rejects unknown query params (strict)', () => {
    const result = listAgentAuditLogQuerySchema.safeParse({ extra: 'x' });
    expect(result.success).toBe(false);
  });

  it('rejects take above the upper bound', () => {
    const result = listAgentAuditLogQuerySchema.safeParse({ take: '999' });
    expect(result.success).toBe(false);
  });
});
