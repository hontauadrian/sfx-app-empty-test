import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('../../remote/fetch-brand-guidelines-version-by-id', () => ({
  fetchBrandGuidelinesVersionById: vi.fn(),
}));

import { fetchBrandGuidelinesVersionById } from '../../remote/fetch-brand-guidelines-version-by-id';
import { useBrandGuidelinesVersionRepository } from '../use-brand-guidelines-version-repository';
import type { BrandGuidelinesVersionDataModel } from '../../model/brand-guidelines-version-data-model';

const fetchMock = vi.mocked(fetchBrandGuidelinesVersionById);

function wrapperFactory(client: QueryClient): (props: { children: ReactNode }) => ReactNode {
  return function Wrapper({ children }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function sample(): BrandGuidelinesVersionDataModel {
  return {
    id: 'v-1',
    brandId: 'b-1',
    snapshot: { voice: null, visual: null, dosAndDonts: [], metadata: null },
    editorUserId: 'u-1',
    editorDisplayName: 'Admin',
    changeNote: null,
    createdAt: '2026-05-17T00:00:00.000Z',
  };
}

afterEach(() => fetchMock.mockReset());

describe('useBrandGuidelinesVersionRepository', () => {
  it('returns the mapped version on success', async () => {
    fetchMock.mockResolvedValueOnce(sample());
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(
      () => useBrandGuidelinesVersionRepository('b-1', 'v-1'),
      { wrapper: wrapperFactory(client) },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.id).toBe('v-1');
    expect(result.current.data?.createdAt).toBeInstanceOf(Date);
    expect(fetchMock).toHaveBeenCalledWith('b-1', 'v-1');
  });

  it('propagates error state', async () => {
    fetchMock.mockRejectedValueOnce(new Error('404'));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(
      () => useBrandGuidelinesVersionRepository('b-1', 'v-x'),
      { wrapper: wrapperFactory(client) },
    );
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('skips fetching when ids are empty', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(
      () => useBrandGuidelinesVersionRepository('b-1', ''),
      { wrapper: wrapperFactory(client) },
    );
    expect(result.current.fetchStatus).toBe('idle');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
