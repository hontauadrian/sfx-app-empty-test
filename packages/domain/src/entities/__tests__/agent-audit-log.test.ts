import { describe, expect, it } from 'vitest';

import * as domain from '../../index';
import type {
  AgentAuditLog,
  CreateAgentAuditLogInput,
  ListAgentAuditLogsInput,
  ListAgentAuditLogsResult,
} from '../agent-audit-log';

describe('AgentAuditLog', () => {
  it('is a type-only export with no runtime value on the barrel', () => {
    expect((domain as Record<string, unknown>).AgentAuditLog).toBeUndefined();
  });

  it('compiles a fully populated audit row', () => {
    const row: AgentAuditLog = {
      id: 'aud-1',
      requestId: 'req-abc',
      clientId: 'brand-reader-agent-001',
      endpointPath: '/api/v1/brands/brand-1/guidelines/voice',
      brandId: 'brand-1',
      versionIdReturned: 'v-1',
      requestTimestamp: new Date('2026-05-18T10:00:00.000Z'),
      responseStatus: 200,
    };
    expect(row.responseStatus).toBe(200);
    expect(row.brandId).toBe('brand-1');
    expect(row.versionIdReturned).toBe('v-1');
  });

  it('permits null brandId + versionIdReturned (e.g. /brands list)', () => {
    const row: AgentAuditLog = {
      id: 'aud-2',
      requestId: 'req-xyz',
      clientId: 'agent-2',
      endpointPath: '/api/v1/brands',
      brandId: null,
      versionIdReturned: null,
      requestTimestamp: new Date(),
      responseStatus: 200,
    };
    expect(row.brandId).toBeNull();
    expect(row.versionIdReturned).toBeNull();
  });

  it('CreateAgentAuditLogInput omits id (server-assigned cuid)', () => {
    const input: CreateAgentAuditLogInput = {
      requestId: 'req-1',
      clientId: 'agent-1',
      endpointPath: '/api/v1/brands',
      brandId: null,
      versionIdReturned: null,
      requestTimestamp: new Date('2026-05-18T10:00:00.000Z'),
      responseStatus: 200,
    };
    expect(input.requestId).toBe('req-1');
    // @ts-expect-error id is not part of CreateAgentAuditLogInput
    void input.id;
  });

  it('ListAgentAuditLogsInput accepts clientId + date range filter', () => {
    const input: ListAgentAuditLogsInput = {
      brandId: 'brand-1',
      clientId: 'agent-001',
      from: new Date('2026-05-01T00:00:00.000Z'),
      to: new Date('2026-05-18T23:59:59.999Z'),
      take: 50,
    };
    expect(input.brandId).toBe('brand-1');
    expect(input.take).toBe(50);
  });

  it('ListAgentAuditLogsInput optional filters omitted is valid', () => {
    const input: ListAgentAuditLogsInput = { brandId: 'brand-1', take: 25 };
    expect(input.clientId).toBeUndefined();
    expect(input.from).toBeUndefined();
    expect(input.to).toBeUndefined();
  });

  it('ListAgentAuditLogsResult holds an items array', () => {
    const result: ListAgentAuditLogsResult = { items: [] };
    expect(result.items.length).toBe(0);
  });
});
