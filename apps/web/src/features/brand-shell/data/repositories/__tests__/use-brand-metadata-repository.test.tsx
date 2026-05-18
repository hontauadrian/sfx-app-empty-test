import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('../../remote/fetch-brand-metadata', () => ({ fetchBrandMetadata: vi.fn() }));
vi.mock('../../remote/update-brand-metadata', () => ({ updateBrandMetadata: vi.fn() }));

import { fetchBrandMetadata } from '../../remote/fetch-brand-metadata';
import { updateBrandMetadata } from '../../remote/update-brand-metadata';
import { useBrandMetadataRepository } from '../use-brand-metadata-repository';
import type { BrandMetadataDataModel } from '../../model/brand-metadata-data-model';

const fetchMock = vi.mocked(fetchBrandMetadata);
const updateMock = vi.mocked(updateBrandMetadata);

function dto(over: Partial<BrandMetadataDataModel> = {}): BrandMetadataDataModel {
  return {
    brandId: 'b1',
    ownerUserId: 'subject-owner',
    lastUpdatedAt: '2026-05-17T00:00:00.000Z',
    lastUpdatedByUserId: 'subject-admin',
    tags: [],
    createdAt: '2026-05-17T00:00:00.000Z',
    updatedAt: '2026-05-17T00:00:00.000Z',
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

describe('useBrandMetadataRepository', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    updateMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('fetches and maps metadata', async () => {
    fetchMock.mockResolvedValue(dto({ tags: ['en'] }));
    const client = createTestClient();
    const { result } = renderHook(() => useBrandMetadataRepository({ brandId: 'b1' }), {
      wrapper: createWrapper(client),
    });
    await waitFor(() => expect(result.current.metadataQuery.data?.tags).toEqual(['en']));
    expect(result.current.metadataQuery.data?.lastUpdatedAt).toBeInstanceOf(Date);
  });

  it('invalidates the cache after update', async () => {
    fetchMock.mockResolvedValue(dto());
    updateMock.mockResolvedValue(dto({ tags: ['en', 'spring'] }));
    const client = createTestClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useBrandMetadataRepository({ brandId: 'b1' }), {
      wrapper: createWrapper(client),
    });
    await waitFor(() => expect(result.current.metadataQuery.isSuccess).toBe(true));
    await act(async () => {
      await result.current.updateMutation.mutateAsync({ tags: ['en', 'spring'] });
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['brand-guidelines', 'metadata', 'b1'],
    });
  });
});
