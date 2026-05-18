import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('../../remote/fetch-brand-guidelines-versions', () => ({
  fetchBrandGuidelinesVersions: vi.fn(),
}));

import { fetchBrandGuidelinesVersions } from '../../remote/fetch-brand-guidelines-versions';
import { useBrandGuidelinesVersionsRepository } from '../use-brand-guidelines-versions-repository';
import type { BrandGuidelinesVersionsPageDataModel } from '../../model/brand-guidelines-version-data-model';

const fetchMock = vi.mocked(fetchBrandGuidelinesVersions);

function wrapperFactory(client: QueryClient): (props: { children: ReactNode }) => ReactNode {
  return function Wrapper({ children }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function emptyPage(): BrandGuidelinesVersionsPageDataModel {
  return { items: [], nextCursor: null };
}

afterEach(() => {
  fetchMock.mockReset();
});

describe('useBrandGuidelinesVersionsRepository', () => {
  it('returns mapped page on successful fetch', async () => {
    fetchMock.mockResolvedValueOnce(emptyPage());
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(
      () => useBrandGuidelinesVersionsRepository('b-1'),
      { wrapper: wrapperFactory(client) },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.items).toHaveLength(0);
    expect(result.current.data?.nextCursor).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith('b-1', {});
  });

  it('threads take + cursor through to fetcher and includes them in the cache key', async () => {
    fetchMock.mockResolvedValue(emptyPage());
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(
      () => useBrandGuidelinesVersionsRepository('b-1', { take: 10, cursor: 'v-5' }),
      { wrapper: wrapperFactory(client) },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenCalledWith('b-1', { take: 10, cursor: 'v-5' });
  });

  it('propagates error state', async () => {
    fetchMock.mockRejectedValueOnce(new Error('boom'));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(
      () => useBrandGuidelinesVersionsRepository('b-1'),
      { wrapper: wrapperFactory(client) },
    );
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toBe('boom');
  });

  it('skips fetching when brandId is empty', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(
      () => useBrandGuidelinesVersionsRepository(''),
      { wrapper: wrapperFactory(client) },
    );
    expect(result.current.fetchStatus).toBe('idle');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
