import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../remote/create-dos-and-dont', () => ({
  createDosAndDont: vi.fn(),
}));

import { createDosAndDont } from '../../remote/create-dos-and-dont';
import { useCreateDosAndDontMutation } from '../use-create-dos-and-dont-mutation';

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

describe('useCreateDosAndDontMutation', () => {
  it('invalidates the per-brand list and the brands list on settle', async () => {
    (createDosAndDont as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'e-1',
      brandId: 'b-1',
      type: 'do',
      category: 'tone',
      title: 't',
      body: 'b',
      suggestedCorrection: null,
      createdAt: '2026-05-15T00:00:00.000Z',
      updatedAt: '2026-05-15T00:00:00.000Z',
    });
    const { wrapper, invalidateSpy } = buildHarness();
    const { result } = renderHook(() => useCreateDosAndDontMutation('b-1'), {
      wrapper,
    });
    await result.current.mutateAsync({
      type: 'do',
      category: 'tone',
      title: 't',
      body: 'b',
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['dos-and-donts', 'b-1'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['brands'] });
  });
});
