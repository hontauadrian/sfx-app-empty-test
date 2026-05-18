import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type {
  AgentAuditLog,
  AgentAuditLogRepository,
  Brand,
  BrandRepository,
} from '@sfx/domain';

import { AgentAuditLogController } from '../agent-audit-log.controller';

function makeBrandRepoMock(
  findActiveById: BrandRepository['findActiveById'],
): BrandRepository {
  return {
    findActiveById,
    listActive: vi.fn(),
    create: vi.fn(),
    renameById: vi.fn(),
    softDeleteById: vi.fn(),
  } as unknown as BrandRepository;
}

function makeAgentRepoMock(
  list: AgentAuditLogRepository['list'],
): AgentAuditLogRepository {
  return {
    list,
    create: vi.fn(),
  };
}

const activeBrand: Brand = {
  id: 'brand-1',
  name: 'Brand One',
  slug: 'brand-one',
  ownerUserId: 'user-1',
  createdAt: new Date('2026-05-01T00:00:00.000Z'),
  updatedAt: new Date('2026-05-01T00:00:00.000Z'),
  deletedAt: null,
};

const row: AgentAuditLog = {
  id: 'aud-1',
  requestId: 'req-1',
  clientId: 'agent-1',
  endpointPath: '/api/v1/brands/brand-1/guidelines/voice',
  brandId: 'brand-1',
  versionIdReturned: 'v-1',
  requestTimestamp: new Date('2026-05-18T10:00:00.000Z'),
  responseStatus: 200,
};

describe('AgentAuditLogController.listAuditLog', () => {
  it('returns the repository items envelope when brand exists', async () => {
    const list = vi.fn().mockResolvedValue({ items: [row] });
    const controller = new AgentAuditLogController(
      makeBrandRepoMock(async () => activeBrand),
      makeAgentRepoMock(list),
    );
    const result = await controller.listAuditLog('brand-1', {});
    expect(result.items.length).toBe(1);
    expect(result.items[0]?.id).toBe('aud-1');
    expect(list).toHaveBeenCalledWith({
      brandId: 'brand-1',
      clientId: undefined,
      from: undefined,
      to: undefined,
      take: 50,
    });
  });

  it('applies default take=50 when query.take omitted', async () => {
    const list = vi.fn().mockResolvedValue({ items: [] });
    const controller = new AgentAuditLogController(
      makeBrandRepoMock(async () => activeBrand),
      makeAgentRepoMock(list),
    );
    await controller.listAuditLog('brand-1', {});
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ take: 50 }));
  });

  it('forwards clientId + parsed from/to + take to the repository', async () => {
    const list = vi.fn().mockResolvedValue({ items: [] });
    const controller = new AgentAuditLogController(
      makeBrandRepoMock(async () => activeBrand),
      makeAgentRepoMock(list),
    );
    await controller.listAuditLog('brand-1', {
      clientId: 'agent-',
      from: '2026-05-01T00:00:00.000Z',
      to: '2026-05-18T23:59:59.999Z',
      take: 25,
    });
    expect(list).toHaveBeenCalledWith({
      brandId: 'brand-1',
      clientId: 'agent-',
      from: new Date('2026-05-01T00:00:00.000Z'),
      to: new Date('2026-05-18T23:59:59.999Z'),
      take: 25,
    });
  });

  it('throws NotFoundException when brand does not exist', async () => {
    const controller = new AgentAuditLogController(
      makeBrandRepoMock(async () => null),
      makeAgentRepoMock(vi.fn()),
    );
    await expect(controller.listAuditLog('missing', {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
