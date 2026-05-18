import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('../../remote/fetch-brands', () => ({ fetchBrands: vi.fn() }));
vi.mock('../../remote/create-brand', () => ({ createBrand: vi.fn() }));
vi.mock('../../remote/rename-brand', () => ({ renameBrand: vi.fn() }));
vi.mock('../../remote/delete-brand', () => ({ deleteBrand: vi.fn() }));

import { fetchBrands } from '../../remote/fetch-brands';
import { createBrand } from '../../remote/create-brand';
import { renameBrand } from '../../remote/rename-brand';
import { deleteBrand } from '../../remote/delete-brand';
import { useBrandsRepository } from '../use-brands-repository';
import { BRANDS_QUERY_KEY } from '../../../constants';
import type { BrandDataModel } from '../../model/brand-data-model';

const fetchBrandsMock = vi.mocked(fetchBrands);
const createBrandMock = vi.mocked(createBrand);
const renameBrandMock = vi.mocked(renameBrand);
const deleteBrandMock = vi.mocked(deleteBrand);

function dto(over: Partial<BrandDataModel> = {}): BrandDataModel {
  return {
    id: 'clxbrand0001',
    name: 'Acme',
    slug: 'acme',
    ownerUserId: 'subject-admin',
    createdAt: '2026-05-17T00:00:00.000Z',
    updatedAt: '2026-05-17T00:00:00.000Z',
    deletedAt: null,
    ...over,
  };
}

function createWrapper(client: QueryClient): (props: { children: ReactNode }) => ReactNode {
  return function Wrapper({ children }: { children: ReactNode }): ReactNode {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function createTestClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

describe('useBrandsRepository', () => {
  beforeEach(() => {
    fetchBrandsMock.mockReset();
    createBrandMock.mockReset();
    renameBrandMock.mockReset();
    deleteBrandMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exposes the mapped list when the API returns brands', async () => {
    fetchBrandsMock.mockResolvedValueOnce([dto(), dto({ id: 'clxbrand0002', name: 'Beta' })]);
    const client = createTestClient();
    const { result } = renderHook(() => useBrandsRepository(), {
      wrapper: createWrapper(client),
    });
    await waitFor(() => expect(result.current.brandsQuery.isSuccess).toBe(true));
    expect(result.current.brandsQuery.data).toHaveLength(2);
    expect(result.current.brandsQuery.data?.[0]?.createdAt).toBeInstanceOf(Date);
  });

  it('handles an empty list', async () => {
    fetchBrandsMock.mockResolvedValueOnce([]);
    const client = createTestClient();
    const { result } = renderHook(() => useBrandsRepository(), {
      wrapper: createWrapper(client),
    });
    await waitFor(() => expect(result.current.brandsQuery.isSuccess).toBe(true));
    expect(result.current.brandsQuery.data).toEqual([]);
  });

  it('surfaces a query error and skips retries', async () => {
    fetchBrandsMock.mockRejectedValueOnce(new Error('network'));
    const client = createTestClient();
    const { result } = renderHook(() => useBrandsRepository(), {
      wrapper: createWrapper(client),
    });
    await waitFor(() => expect(result.current.brandsQuery.isError).toBe(true));
    expect(fetchBrandsMock).toHaveBeenCalledTimes(1);
  });

  it('prepends the new brand to the cache on createMutation success', async () => {
    const client = createTestClient();
    client.setQueryData<readonly BrandDataModel[]>(BRANDS_QUERY_KEY, [
      dto({ id: 'clxbrand0099', name: 'Existing' }),
    ]);
    createBrandMock.mockResolvedValueOnce(dto({ id: 'clxbrand0100', name: 'New' }));
    const { result } = renderHook(() => useBrandsRepository(), {
      wrapper: createWrapper(client),
    });
    await act(async () => {
      await result.current.createMutation.mutateAsync({ name: 'New' });
    });
    const cache = client.getQueryData<readonly BrandDataModel[]>(BRANDS_QUERY_KEY);
    expect(cache?.[0]?.id).toBe('clxbrand0100');
    expect(cache?.[1]?.id).toBe('clxbrand0099');
  });

  it('updates the cached brand in-place on renameMutation success', async () => {
    const client = createTestClient();
    client.setQueryData<readonly BrandDataModel[]>(BRANDS_QUERY_KEY, [
      dto({ id: 'clxbrand0001', name: 'Old' }),
    ]);
    renameBrandMock.mockResolvedValueOnce(dto({ id: 'clxbrand0001', name: 'Renamed' }));
    const { result } = renderHook(() => useBrandsRepository(), {
      wrapper: createWrapper(client),
    });
    await act(async () => {
      await result.current.renameMutation.mutateAsync({ id: 'clxbrand0001', name: 'Renamed' });
    });
    const cache = client.getQueryData<readonly BrandDataModel[]>(BRANDS_QUERY_KEY);
    expect(cache?.[0]?.name).toBe('Renamed');
  });

  it('removes the cached brand on deleteMutation success', async () => {
    const client = createTestClient();
    client.setQueryData<readonly BrandDataModel[]>(BRANDS_QUERY_KEY, [
      dto({ id: 'clxbrand0001' }),
      dto({ id: 'clxbrand0002', name: 'Survivor' }),
    ]);
    deleteBrandMock.mockResolvedValueOnce(undefined as unknown as void);
    const { result } = renderHook(() => useBrandsRepository(), {
      wrapper: createWrapper(client),
    });
    await act(async () => {
      await result.current.deleteMutation.mutateAsync({ id: 'clxbrand0001' });
    });
    const cache = client.getQueryData<readonly BrandDataModel[]>(BRANDS_QUERY_KEY);
    expect(cache).toHaveLength(1);
    expect(cache?.[0]?.id).toBe('clxbrand0002');
  });

  it('propagates network errors through createMutation', async () => {
    createBrandMock.mockRejectedValueOnce(new Error('boom'));
    const client = createTestClient();
    const { result } = renderHook(() => useBrandsRepository(), {
      wrapper: createWrapper(client),
    });
    await act(async () => {
      try {
        await result.current.createMutation.mutateAsync({ name: 'X' });
      } catch {
        /* expected */
      }
    });
    await waitFor(() => expect(result.current.createMutation.isError).toBe(true));
  });
});
