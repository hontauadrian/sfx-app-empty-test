import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/presentation/networking', () => ({
  executeRequest: vi.fn(),
}));

import { executeRequest } from '@/features/presentation/networking';
import { fetchAgentAuditLog } from '../fetch-agent-audit-log';

const executeRequestMock = vi.mocked(executeRequest);

afterEach(() => {
  executeRequestMock.mockReset();
});

const emptyPage = { items: [] };

describe('fetchAgentAuditLog', () => {
  it('hits the agent-audit-log endpoint with no params', async () => {
    executeRequestMock.mockResolvedValueOnce({ data: { success: true, data: emptyPage } } as never);
    const page = await fetchAgentAuditLog('b-1');
    expect(page).toEqual(emptyPage);
    expect(executeRequestMock).toHaveBeenCalledWith({
      path: 'api/v1/brands/b-1/agent-audit-log',
    });
  });

  it('appends clientId + from + to + take when supplied', async () => {
    executeRequestMock.mockResolvedValueOnce({ data: { success: true, data: emptyPage } } as never);
    await fetchAgentAuditLog('b-1', {
      clientId: 'agent-001',
      from: '2026-05-01T00:00:00.000Z',
      to: '2026-05-18T23:59:59.999Z',
      take: 25,
    });
    expect(executeRequestMock.mock.calls[0]?.[0]?.path).toBe(
      'api/v1/brands/b-1/agent-audit-log?clientId=agent-001&from=2026-05-01T00%3A00%3A00.000Z&to=2026-05-18T23%3A59%3A59.999Z&take=25',
    );
  });

  it('omits empty-string filters from the query string', async () => {
    executeRequestMock.mockResolvedValueOnce({ data: { success: true, data: emptyPage } } as never);
    await fetchAgentAuditLog('b-1', { clientId: '', from: '', to: '' });
    expect(executeRequestMock.mock.calls[0]?.[0]?.path).toBe(
      'api/v1/brands/b-1/agent-audit-log',
    );
  });
});
