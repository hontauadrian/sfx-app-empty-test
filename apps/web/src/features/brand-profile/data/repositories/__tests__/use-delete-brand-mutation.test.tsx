import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { ReactNode } from 'react';

vi.mock('../../remote/delete-brand', () => ({
  deleteBrand: vi.fn(),
}));

import { deleteBrand } from '../../remote/delete-brand';
import { useDeleteBrandMutation } from '../use-delete-brand-mutation';
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

describe('useDeleteBrandMutation', () => {
  beforeEach(() => {
    (deleteBrand as unknown as Mock).mockReset();
  });

  it('invokes the delete remote and invalidates only the brands list query on settle', async () => {
    (deleteBrand as unknown as Mock).mockResolvedValueOnce(undefined);

    const { client, wrapper } = createHarness();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useDeleteBrandMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync('brand-1');
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(deleteBrand).toHaveBeenCalledWith('brand-1');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: BRANDS_QUERY_KEY, exact: true });
  });
});
