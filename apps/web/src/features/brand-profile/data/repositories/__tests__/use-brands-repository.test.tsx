import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { ReactNode } from 'react';

vi.mock('../../remote/fetch-brands', () => ({
  fetchBrands: vi.fn(),
}));

import { fetchBrands } from '../../remote/fetch-brands';
import { useBrandsRepository } from '../use-brands-repository';

function createWrapper(): (args: { children: ReactNode }) => ReactNode {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }): ReactNode {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe('useBrandsRepository', () => {
  beforeEach(() => {
    (fetchBrands as unknown as Mock).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('maps the fetched data into BrandProfile entries with Date timestamps', async () => {
    (fetchBrands as unknown as Mock).mockResolvedValueOnce([
      {
        id: 'brand-1',
        ownerSubject: 'sub-1',
        name: 'Acme',
        description: null,
        createdAt: '2026-05-15T10:00:00.000Z',
        updatedAt: '2026-05-15T10:00:00.000Z',
      },
    ]);

    const { result } = renderHook(() => useBrandsRepository(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const first = result.current.data?.[0];
    expect(first?.createdAt).toBeInstanceOf(Date);
    expect(first?.name).toBe('Acme');
  });

  it('surfaces fetch errors as query errors', async () => {
    (fetchBrands as unknown as Mock).mockRejectedValueOnce(new Error('boom'));

    const { result } = renderHook(() => useBrandsRepository(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
