import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement, ReactNode } from 'react';

vi.mock('../../remote/fetch-agent-audit-log', () => ({
  fetchAgentAuditLog: vi.fn(),
}));

import { fetchAgentAuditLog } from '../../remote/fetch-agent-audit-log';
import { useAgentAuditLogRepository } from '../use-agent-audit-log-repository';

const fetchMock = vi.mocked(fetchAgentAuditLog);

function makeWrapper(): {
  wrapper: ({ children }: { children: ReactNode }) => ReactElement;
  client: QueryClient;
} {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }): ReactElement => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { wrapper, client };
}

afterEach(() => {
  fetchMock.mockReset();
});

describe('useAgentAuditLogRepository', () => {
  it('returns mapped items on success', async () => {
    fetchMock.mockResolvedValueOnce({
      items: [
        {
          id: 'aud-1',
          requestId: 'req-1',
          clientId: 'agent-1',
          endpointPath: '/api/v1/brands/b-1/guidelines/voice',
          brandId: 'b-1',
          versionIdReturned: 'v-1',
          requestTimestamp: '2026-05-18T10:00:00.000Z',
          responseStatus: 200,
        },
      ],
    });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useAgentAuditLogRepository('b-1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.items.length).toBe(1);
    expect(result.current.data?.items[0]?.requestTimestamp).toBeInstanceOf(Date);
  });

  it('forwards clientId + from + to + take to fetchAgentAuditLog', async () => {
    fetchMock.mockResolvedValueOnce({ items: [] });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(
      () =>
        useAgentAuditLogRepository('b-1', {
          clientId: 'agent-001',
          from: '2026-05-01T00:00:00.000Z',
          to: '2026-05-18T23:59:59.999Z',
          take: 50,
        }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenCalledWith('b-1', {
      clientId: 'agent-001',
      from: '2026-05-01T00:00:00.000Z',
      to: '2026-05-18T23:59:59.999Z',
      take: 50,
    });
  });

  it('skips fetching when brandId is empty', () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useAgentAuditLogRepository(''), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
