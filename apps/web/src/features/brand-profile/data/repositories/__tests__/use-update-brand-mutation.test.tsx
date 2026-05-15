import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { ReactNode } from 'react';

vi.mock('../../remote/update-brand', () => ({
  updateBrand: vi.fn(),
}));

import { updateBrand } from '../../remote/update-brand';
import { useUpdateBrandMutation } from '../use-update-brand-mutation';
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

describe('useUpdateBrandMutation', () => {
  beforeEach(() => {
    (updateBrand as unknown as Mock).mockReset();
  });

  it('maps the response and invalidates the brands list query on settle', async () => {
    (updateBrand as unknown as Mock).mockResolvedValueOnce({
      id: 'brand-1',
      ownerSubject: 'sub-1',
      name: 'Renamed',
      description: null,
      createdAt: '2026-05-15T10:00:00.000Z',
      updatedAt: '2026-05-15T11:00:00.000Z',
    });

    const { client, wrapper } = createHarness();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useUpdateBrandMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ id: 'brand-1', name: 'Renamed' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.name).toBe('Renamed');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: BRANDS_QUERY_KEY });
  });
});
