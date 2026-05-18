import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('../../remote/fetch-guideline-search', () => ({ fetchGuidelineSearch: vi.fn() }));

import { fetchGuidelineSearch } from '../../remote/fetch-guideline-search';
import { useGuidelineSearchRepository } from '../use-guideline-search-repository';

const fetchMock = vi.mocked(fetchGuidelineSearch);

function createWrapper(client: QueryClient): (props: { children: ReactNode }) => ReactNode {
  return function Wrapper({ children }: { children: ReactNode }): ReactNode {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function createTestClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

describe('useGuidelineSearchRepository', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('does not fire the request when query is empty', async () => {
    const client = createTestClient();
    const { result } = renderHook(
      () => useGuidelineSearchRepository({ brandId: 'b1', query: '' }),
      { wrapper: createWrapper(client) },
    );
    expect(result.current.searchQuery.fetchStatus).toBe('idle');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fires the request when query is non-empty', async () => {
    fetchMock.mockResolvedValue({ query: 'wordmark', brandId: 'b1', groups: [] });
    const client = createTestClient();
    const { result } = renderHook(
      () => useGuidelineSearchRepository({ brandId: 'b1', query: 'wordmark' }),
      { wrapper: createWrapper(client) },
    );
    await waitFor(() => expect(result.current.searchQuery.isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenCalledWith({ brandId: 'b1', query: 'wordmark' });
  });

  it('trims whitespace from the query', async () => {
    fetchMock.mockResolvedValue({ query: 'wordmark', brandId: 'b1', groups: [] });
    const client = createTestClient();
    renderHook(() => useGuidelineSearchRepository({ brandId: 'b1', query: '  wordmark  ' }), {
      wrapper: createWrapper(client),
    });
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith({ brandId: 'b1', query: 'wordmark' }),
    );
  });
});
