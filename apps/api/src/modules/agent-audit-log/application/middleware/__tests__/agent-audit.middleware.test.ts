import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { AgentAuditLog, AgentAuditLogRepository } from '@sfx/domain';

import { AgentAuditMiddleware } from '../agent-audit.middleware';

interface FakeRequest {
  readonly headers: Record<string, string | string[] | undefined>;
  readonly user?: { subject: string; email: string | null; roles: string[] };
  readonly originalUrl?: string;
  readonly url?: string;
  readonly params?: Record<string, string>;
}

class FakeResponse extends EventEmitter {
  public statusCode: number = 200;
  public jsonReceived: unknown = undefined;
  json(body: unknown): this {
    this.jsonReceived = body;
    return this;
  }
}

function makeRepo(): {
  repo: AgentAuditLogRepository;
  create: ReturnType<typeof vi.fn>;
} {
  const create = vi.fn().mockImplementation(async (input) => ({
    id: 'aud-x',
    ...input,
  } as AgentAuditLog));
  return {
    repo: { create, list: vi.fn() } as unknown as AgentAuditLogRepository,
    create,
  };
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

describe('AgentAuditMiddleware', () => {
  it('skips recording when there is no authenticated user', async () => {
    const { repo, create } = makeRepo();
    const middleware = new AgentAuditMiddleware(repo);
    const req: FakeRequest = { headers: {} };
    const res = new FakeResponse();
    const next = vi.fn();
    middleware.use(req as never, res as never, next);
    expect(next).toHaveBeenCalledTimes(1);
    res.emit('finish');
    await flush();
    expect(create).not.toHaveBeenCalled();
  });

  it('skips recording when the user lacks the agent role', async () => {
    const { repo, create } = makeRepo();
    const middleware = new AgentAuditMiddleware(repo);
    const req: FakeRequest = {
      headers: {},
      user: { subject: 'sub-1', email: 'admin@example.com', roles: ['admin'] },
    };
    const res = new FakeResponse();
    middleware.use(req as never, res as never, () => undefined);
    res.emit('finish');
    await flush();
    expect(create).not.toHaveBeenCalled();
  });

  it('records an audit row when the user has the agent role on success', async () => {
    const { repo, create } = makeRepo();
    const middleware = new AgentAuditMiddleware(repo);
    const req: FakeRequest = {
      headers: { 'x-request-id': 'req-abc', 'x-client-id': 'brand-reader-agent-001' },
      user: { subject: 'sub-1', email: 'agent@example.com', roles: ['agent'] },
      originalUrl: '/api/v1/brands/brand-1/guidelines/voice',
      params: { brandId: 'brand-1' },
    };
    const res = new FakeResponse();
    middleware.use(req as never, res as never, () => undefined);
    (res as unknown as { json: (body: unknown) => unknown }).json({
      success: true,
      data: { latestVersionId: 'clxbgv0001' },
    });
    res.statusCode = 200;
    res.emit('finish');
    await flush();
    expect(create).toHaveBeenCalledTimes(1);
    const payload = create.mock.calls[0]?.[0];
    expect(payload.requestId).toBe('req-abc');
    expect(payload.clientId).toBe('brand-reader-agent-001');
    expect(payload.endpointPath).toBe('/api/v1/brands/brand-1/guidelines/voice');
    expect(payload.brandId).toBe('brand-1');
    expect(payload.versionIdReturned).toBe('clxbgv0001');
    expect(payload.responseStatus).toBe(200);
  });

  it('records 403 when the response status is rejection', async () => {
    const { repo, create } = makeRepo();
    const middleware = new AgentAuditMiddleware(repo);
    const req: FakeRequest = {
      headers: {},
      user: { subject: 'sub-1', email: 'agent@example.com', roles: ['agent'] },
      originalUrl: '/api/v1/brands/brand-1/guidelines/voice',
      params: { brandId: 'brand-1' },
    };
    const res = new FakeResponse();
    middleware.use(req as never, res as never, () => undefined);
    res.statusCode = 403;
    res.emit('finish');
    await flush();
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]?.[0].responseStatus).toBe(403);
  });

  it('parses brandId from the URL when route params are not populated', async () => {
    const { repo, create } = makeRepo();
    const middleware = new AgentAuditMiddleware(repo);
    const req: FakeRequest = {
      headers: {},
      user: { subject: 'sub-1', email: 'agent@example.com', roles: ['agent'] },
      originalUrl: '/api/v1/brands/parsed-brand/guidelines/voice',
    };
    const res = new FakeResponse();
    middleware.use(req as never, res as never, () => undefined);
    res.emit('finish');
    await flush();
    expect(create.mock.calls[0]?.[0].brandId).toBe('parsed-brand');
  });

  it('falls back to subject when no headers + no email', async () => {
    const { repo, create } = makeRepo();
    const middleware = new AgentAuditMiddleware(repo);
    const req: FakeRequest = {
      headers: {},
      user: { subject: 'sub-1', email: null, roles: ['agent'] },
      originalUrl: '/api/v1/brands',
    };
    const res = new FakeResponse();
    middleware.use(req as never, res as never, () => undefined);
    res.emit('finish');
    await flush();
    expect(create.mock.calls[0]?.[0].clientId).toBe('sub-1');
    expect(create.mock.calls[0]?.[0].brandId).toBeNull();
  });

  it('does not propagate repository write failures', async () => {
    const create = vi.fn().mockRejectedValue(new Error('db down'));
    const repo = { create, list: vi.fn() } as unknown as AgentAuditLogRepository;
    const middleware = new AgentAuditMiddleware(repo);
    const req: FakeRequest = {
      headers: {},
      user: { subject: 'sub-1', email: 'agent@example.com', roles: ['agent'] },
      originalUrl: '/api/v1/brands',
    };
    const res = new FakeResponse();
    expect(() => {
      middleware.use(req as never, res as never, () => undefined);
      res.emit('finish');
    }).not.toThrow();
    await flush();
    expect(create).toHaveBeenCalledTimes(1);
  });
});
