import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { ReactNode } from 'react';

vi.mock('../../remote/fetch-brand-by-id', () => ({
  fetchBrandById: vi.fn(),
}));

import { fetchBrandById } from '../../remote/fetch-brand-by-id';
import { useBrandByIdRepository } from '../use-brand-by-id-repository';

function createWrapper(): (args: { children: ReactNode }) => ReactNode {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }): ReactNode {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe('useBrandByIdRepository', () => {
  beforeEach(() => {
    (fetchBrandById as unknown as Mock).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the brand when the id is provided', async () => {
    (fetchBrandById as unknown as Mock).mockResolvedValueOnce({
      id: 'brand-1',
      ownerSubject: 'sub-1',
      name: 'Acme',
      description: null,
      createdAt: '2026-05-15T10:00:00.000Z',
      updatedAt: '2026-05-15T10:00:00.000Z',
    });

    const { result } = renderHook(() => useBrandByIdRepository('brand-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.id).toBe('brand-1');
    expect(fetchBrandById).toHaveBeenCalledWith('brand-1');
  });

  it('does not call the remote when the id is null', () => {
    renderHook(() => useBrandByIdRepository(null), {
      wrapper: createWrapper(),
    });

    expect(fetchBrandById).not.toHaveBeenCalled();
  });
});
