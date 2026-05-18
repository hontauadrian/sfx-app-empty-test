import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement, ReactNode } from 'react';
import { LanguageProvider } from '@/features/presentation/localization/language-provider';

vi.mock('../../../../data/remote/fetch-agent-audit-log', () => ({
  fetchAgentAuditLog: vi.fn(),
}));

import { fetchAgentAuditLog } from '../../../../data/remote/fetch-agent-audit-log';
import { useBrandGuidelinesAuditLog } from '../use-brand-guidelines-audit-log';

const fetchMock = vi.mocked(fetchAgentAuditLog);

function makeWrapper(): ({ children }: { children: ReactNode }) => ReactElement {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }): ReactElement => (
    <QueryClientProvider client={client}>
      <LanguageProvider>{children}</LanguageProvider>
    </QueryClientProvider>
  );
}

afterEach(() => {
  fetchMock.mockReset();
});

describe('useBrandGuidelinesAuditLog', () => {
  it('returns loading status before query resolves', async () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useBrandGuidelinesAuditLog('brand-1'), {
      wrapper: makeWrapper(),
    });
    expect(result.current.uiModel.status).toBe('loading');
  });

  it('returns empty status with no items', async () => {
    fetchMock.mockResolvedValue({ items: [] });
    const { result } = renderHook(() => useBrandGuidelinesAuditLog('brand-1'), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.uiModel.status).toBe('empty'));
  });

  it('returns ready status with mapped rows', async () => {
    fetchMock.mockResolvedValue({
      items: [
        {
          id: 'aud-1',
          requestId: 'req-1',
          clientId: 'agent-1',
          endpointPath: '/api/v1/brands/brand-1/guidelines/voice',
          brandId: 'brand-1',
          versionIdReturned: 'v-1',
          requestTimestamp: '2026-05-18T10:00:00.000Z',
          responseStatus: 200,
        },
      ],
    });
    const { result } = renderHook(() => useBrandGuidelinesAuditLog('brand-1'), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.uiModel.status).toBe('ready'));
    expect(result.current.uiModel.rows.length).toBe(1);
  });

  it('applies filters to the query when applyFilters fires', async () => {
    fetchMock.mockResolvedValue({ items: [] });
    const { result } = renderHook(() => useBrandGuidelinesAuditLog('brand-1'), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    act(() => {
      result.current.setDraftField('clientId', 'agent-001');
    });
    act(() => {
      result.current.applyFilters();
    });
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('brand-1', {
        clientId: 'agent-001',
        from: undefined,
        to: undefined,
        take: undefined,
      }),
    );
  });

  it('clears both draft and applied state on clearFilters', async () => {
    fetchMock.mockResolvedValue({ items: [] });
    const { result } = renderHook(() => useBrandGuidelinesAuditLog('brand-1'), {
      wrapper: makeWrapper(),
    });
    act(() => {
      result.current.setDraftField('clientId', 'agent-001');
      result.current.applyFilters();
    });
    act(() => {
      result.current.clearFilters();
    });
    expect(result.current.draft.clientId).toBe('');
    expect(result.current.applied.clientId).toBe('');
  });
});
