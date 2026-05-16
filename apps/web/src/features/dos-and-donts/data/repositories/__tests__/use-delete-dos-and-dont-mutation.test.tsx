import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../remote/delete-dos-and-dont', () => ({
  deleteDosAndDont: vi.fn(),
}));

import { deleteDosAndDont } from '../../remote/delete-dos-and-dont';
import { useDeleteDosAndDontMutation } from '../use-delete-dos-and-dont-mutation';

function buildHarness(): {
  client: QueryClient;
  invalidateSpy: ReturnType<typeof vi.fn>;
  wrapper: (props: { children: ReactNode }) => ReactNode;
} {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = vi.fn().mockResolvedValue(undefined);
  (client as unknown as { invalidateQueries: ReturnType<typeof vi.fn> }).invalidateQueries =
    invalidateSpy;
  const wrapper = ({ children }: { children: ReactNode }): ReactNode => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, invalidateSpy, wrapper };
}

describe('useDeleteDosAndDontMutation', () => {
  it('invalidates per-brand list and brands list on settle', async () => {
    (deleteDosAndDont as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);
    const { wrapper, invalidateSpy } = buildHarness();
    const { result } = renderHook(() => useDeleteDosAndDontMutation('b-1'), {
      wrapper,
    });
    await result.current.mutateAsync('e-1');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(deleteDosAndDont).toHaveBeenCalledWith({ brandId: 'b-1', entryId: 'e-1' });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['dos-and-donts', 'b-1'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['brands'] });
  });
});
