import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../remote/update-dos-and-dont', () => ({
  updateDosAndDont: vi.fn(),
}));

import { updateDosAndDont } from '../../remote/update-dos-and-dont';
import { useUpdateDosAndDontMutation } from '../use-update-dos-and-dont-mutation';

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

describe('useUpdateDosAndDontMutation', () => {
  it('invalidates list, entry, and brands keys on settle', async () => {
    (updateDosAndDont as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'e-1',
      brandId: 'b-1',
      type: 'do',
      category: 'tone',
      title: 't',
      body: 'b',
      suggestedCorrection: null,
      createdAt: '2026-05-15T00:00:00.000Z',
      updatedAt: '2026-05-15T01:00:00.000Z',
    });
    const { wrapper, invalidateSpy } = buildHarness();
    const { result } = renderHook(() => useUpdateDosAndDontMutation('b-1'), {
      wrapper,
    });
    await result.current.mutateAsync({
      entryId: 'e-1',
      payload: { type: 'do', category: 'tone', title: 't', body: 'b' },
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['dos-and-donts', 'b-1'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['dos-and-donts', 'b-1', 'entry', 'e-1'],
      exact: true,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['brands'] });
  });
});
