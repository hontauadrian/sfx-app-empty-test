import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@sfx/database';
import { AgentAuditLogPrismaRepository } from '../agent-audit-log.repository';

function makePrismaMock(): {
  prisma: PrismaClient;
  create: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
} {
  const create = vi.fn();
  const findMany = vi.fn();
  const prisma = {
    agentAuditLog: { create, findMany },
  } as unknown as PrismaClient;
  return { prisma, create, findMany };
}

describe('AgentAuditLogPrismaRepository.create', () => {
  it('passes payload through and maps the persisted row', async () => {
    const { prisma, create } = makePrismaMock();
    create.mockResolvedValue({
      id: 'aud-1',
      requestId: 'req-1',
      clientId: 'agent-1',
      endpointPath: '/api/v1/brands',
      brandId: null,
      versionIdReturned: null,
      requestTimestamp: new Date('2026-05-18T10:00:00.000Z'),
      responseStatus: 200,
    });
    const repo = new AgentAuditLogPrismaRepository(prisma);
    const result = await repo.create({
      requestId: 'req-1',
      clientId: 'agent-1',
      endpointPath: '/api/v1/brands',
      brandId: null,
      versionIdReturned: null,
      requestTimestamp: new Date('2026-05-18T10:00:00.000Z'),
      responseStatus: 200,
    });
    expect(create).toHaveBeenCalledWith({
      data: {
        requestId: 'req-1',
        clientId: 'agent-1',
        endpointPath: '/api/v1/brands',
        brandId: null,
        versionIdReturned: null,
        requestTimestamp: new Date('2026-05-18T10:00:00.000Z'),
        responseStatus: 200,
      },
    });
    expect(result.id).toBe('aud-1');
  });
});

describe('AgentAuditLogPrismaRepository.list', () => {
  it('queries by brandId only when no filters supplied', async () => {
    const { prisma, findMany } = makePrismaMock();
    findMany.mockResolvedValue([]);
    const repo = new AgentAuditLogPrismaRepository(prisma);

    const result = await repo.list({ brandId: 'brand-1', take: 50 });
    expect(findMany).toHaveBeenCalledWith({
      where: { brandId: 'brand-1' },
      orderBy: [{ requestTimestamp: 'desc' }, { id: 'desc' }],
      take: 50,
    });
    expect(result.items.length).toBe(0);
  });

  it('adds case-insensitive clientId contains filter when provided', async () => {
    const { prisma, findMany } = makePrismaMock();
    findMany.mockResolvedValue([]);
    const repo = new AgentAuditLogPrismaRepository(prisma);

    await repo.list({ brandId: 'brand-1', clientId: 'agent-001', take: 25 });
    expect(findMany).toHaveBeenCalledWith({
      where: {
        brandId: 'brand-1',
        clientId: { contains: 'agent-001', mode: 'insensitive' },
      },
      orderBy: [{ requestTimestamp: 'desc' }, { id: 'desc' }],
      take: 25,
    });
  });

  it('adds gte/lte timestamp filters when from + to supplied', async () => {
    const { prisma, findMany } = makePrismaMock();
    findMany.mockResolvedValue([]);
    const repo = new AgentAuditLogPrismaRepository(prisma);

    await repo.list({
      brandId: 'brand-1',
      from: new Date('2026-05-01T00:00:00.000Z'),
      to: new Date('2026-05-18T23:59:59.999Z'),
      take: 50,
    });
    expect(findMany).toHaveBeenCalledWith({
      where: {
        brandId: 'brand-1',
        requestTimestamp: {
          gte: new Date('2026-05-01T00:00:00.000Z'),
          lte: new Date('2026-05-18T23:59:59.999Z'),
        },
      },
      orderBy: [{ requestTimestamp: 'desc' }, { id: 'desc' }],
      take: 50,
    });
  });

  it('adds only gte when from is supplied without to', async () => {
    const { prisma, findMany } = makePrismaMock();
    findMany.mockResolvedValue([]);
    const repo = new AgentAuditLogPrismaRepository(prisma);

    await repo.list({
      brandId: 'brand-1',
      from: new Date('2026-05-01T00:00:00.000Z'),
      take: 10,
    });
    expect(findMany).toHaveBeenCalledWith({
      where: {
        brandId: 'brand-1',
        requestTimestamp: { gte: new Date('2026-05-01T00:00:00.000Z') },
      },
      orderBy: [{ requestTimestamp: 'desc' }, { id: 'desc' }],
      take: 10,
    });
  });

  it('maps every returned row through toAgentAuditLog', async () => {
    const { prisma, findMany } = makePrismaMock();
    findMany.mockResolvedValue([
      {
        id: 'aud-2',
        requestId: 'req-2',
        clientId: 'agent-2',
        endpointPath: '/api/v1/brands/brand-1/guidelines/visual',
        brandId: 'brand-1',
        versionIdReturned: null,
        requestTimestamp: new Date('2026-05-18T10:00:00.000Z'),
        responseStatus: 200,
      },
    ]);
    const repo = new AgentAuditLogPrismaRepository(prisma);
    const result = await repo.list({ brandId: 'brand-1', take: 50 });
    expect(result.items.length).toBe(1);
    expect(result.items[0]?.endpointPath).toBe(
      '/api/v1/brands/brand-1/guidelines/visual',
    );
  });
});
