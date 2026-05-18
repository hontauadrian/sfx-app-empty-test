import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { LanguageProvider } from '@/features/presentation/localization';

vi.mock('../../../../data/remote/fetch-brand-guidelines-versions', () => ({
  fetchBrandGuidelinesVersions: vi.fn(),
}));

import { fetchBrandGuidelinesVersions } from '../../../../data/remote/fetch-brand-guidelines-versions';
import { useBrandGuidelinesHistory } from '../use-brand-guidelines-history';

const fetchMock = vi.mocked(fetchBrandGuidelinesVersions);

function wrapperFactory(client: QueryClient): (props: { children: ReactNode }) => ReactNode {
  return function Wrapper({ children }) {
    return (
      <LanguageProvider defaultLanguage="en">
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </LanguageProvider>
    );
  };
}

afterEach(() => fetchMock.mockReset());

describe('useBrandGuidelinesHistory', () => {
  it('returns ready uiModel with row when a version exists', async () => {
    fetchMock.mockResolvedValueOnce({
      items: [
        {
          id: 'v-1',
          brandId: 'b-1',
          snapshot: { voice: null, visual: null, dosAndDonts: [], metadata: null },
          editorUserId: 'u-1',
          editorDisplayName: 'admin@example.com',
          changeNote: null,
          createdAt: '2026-05-17T10:30:00.000Z',
        },
      ],
      nextCursor: null,
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useBrandGuidelinesHistory('b-1'), {
      wrapper: wrapperFactory(client),
    });
    await waitFor(() => expect(result.current.uiModel.status).toBe('ready'));
    expect(result.current.uiModel.rows).toHaveLength(1);
    expect(result.current.uiModel.rows[0]?.id).toBe('v-1');
  });

  it('returns empty uiModel when versions array is empty', async () => {
    fetchMock.mockResolvedValueOnce({ items: [], nextCursor: null });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useBrandGuidelinesHistory('b-1'), {
      wrapper: wrapperFactory(client),
    });
    await waitFor(() => expect(result.current.uiModel.status).toBe('empty'));
  });

  it('returns error uiModel on fetch failure', async () => {
    fetchMock.mockRejectedValueOnce(new Error('boom'));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useBrandGuidelinesHistory('b-1'), {
      wrapper: wrapperFactory(client),
    });
    await waitFor(() => expect(result.current.uiModel.status).toBe('error'));
  });

  it('maps 403 errors to denied status', async () => {
    fetchMock.mockRejectedValueOnce(Object.assign(new Error('forbidden'), { status: 403 }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useBrandGuidelinesHistory('b-1'), {
      wrapper: wrapperFactory(client),
    });
    await waitFor(() => expect(result.current.uiModel.status).toBe('denied'));
  });

  it('maps 404 errors to not-found status', async () => {
    fetchMock.mockRejectedValueOnce(Object.assign(new Error('missing'), { status: 404 }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useBrandGuidelinesHistory('b-1'), {
      wrapper: wrapperFactory(client),
    });
    await waitFor(() => expect(result.current.uiModel.status).toBe('not-found'));
  });
});
