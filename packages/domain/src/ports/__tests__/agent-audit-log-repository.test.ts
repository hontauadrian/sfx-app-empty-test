import { describe, expect, it } from 'vitest';

import type {
  AgentAuditLog,
  CreateAgentAuditLogInput,
  ListAgentAuditLogsInput,
  ListAgentAuditLogsResult,
} from '../../entities/agent-audit-log';
import type { AgentAuditLogRepository } from '../agent-audit-log-repository';

describe('AgentAuditLogRepository', () => {
  it('compiles a minimal in-memory implementation', async () => {
    const store: AgentAuditLog[] = [];
    const repo: AgentAuditLogRepository = {
      async create(input: CreateAgentAuditLogInput): Promise<AgentAuditLog> {
        const row: AgentAuditLog = { id: `aud-${store.length + 1}`, ...input };
        store.push(row);
        return row;
      },
      async list(input: ListAgentAuditLogsInput): Promise<ListAgentAuditLogsResult> {
        return { items: store.filter((row) => row.brandId === input.brandId) };
      },
    };

    const created = await repo.create({
      requestId: 'req-1',
      clientId: 'agent-1',
      endpointPath: '/api/v1/brands/brand-1/guidelines/voice',
      brandId: 'brand-1',
      versionIdReturned: 'v-1',
      requestTimestamp: new Date('2026-05-18T10:00:00.000Z'),
      responseStatus: 200,
    });
    expect(created.id).toBe('aud-1');
    expect(created.brandId).toBe('brand-1');

    const listed = await repo.list({ brandId: 'brand-1', take: 50 });
    expect(listed.items.length).toBe(1);
    expect(listed.items[0]?.versionIdReturned).toBe('v-1');
  });

  it('list returns empty items when no rows match the brandId', async () => {
    const repo: AgentAuditLogRepository = {
      async create() {
        throw new Error('not used');
      },
      async list(): Promise<ListAgentAuditLogsResult> {
        return { items: [] };
      },
    };
    const result = await repo.list({ brandId: 'missing', take: 10 });
    expect(result.items.length).toBe(0);
  });
});
