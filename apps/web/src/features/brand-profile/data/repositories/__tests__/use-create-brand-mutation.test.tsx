import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { ReactNode } from 'react';

vi.mock('../../remote/create-brand', () => ({
  createBrand: vi.fn(),
}));

import { createBrand } from '../../remote/create-brand';
import { useCreateBrandMutation } from '../use-create-brand-mutation';
import { BRANDS_QUERY_KEY } from '../../../constants';

function createHarness(): { client: QueryClient; wrapper: (args: { children: ReactNode }) => ReactNode } {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    client,
    wrapper: function Wrapper({ children }: { children: ReactNode }): ReactNode {
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    },
  };
}

describe('useCreateBrandMutation', () => {
  beforeEach(() => {
    (createBrand as unknown as Mock).mockReset();
  });

  it('maps the response and invalidates the brands list query on settle', async () => {
    (createBrand as unknown as Mock).mockResolvedValueOnce({
      id: 'brand-1',
      ownerSubject: 'sub-1',
      name: 'Acme',
      description: null,
      createdAt: '2026-05-15T10:00:00.000Z',
      updatedAt: '2026-05-15T10:00:00.000Z',
    });

    const { client, wrapper } = createHarness();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useCreateBrandMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ name: 'Acme' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.id).toBe('brand-1');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: BRANDS_QUERY_KEY });
  });
});
