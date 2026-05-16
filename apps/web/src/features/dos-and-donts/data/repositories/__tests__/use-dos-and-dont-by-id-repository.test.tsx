import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../remote/fetch-dos-and-dont-by-id', () => ({
  fetchDosAndDontById: vi.fn(),
}));

import { fetchDosAndDontById } from '../../remote/fetch-dos-and-dont-by-id';
import { useDosAndDontByIdRepository } from '../use-dos-and-dont-by-id-repository';

function withClient(): (props: { children: ReactNode }) => ReactNode {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }): ReactNode => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('useDosAndDontByIdRepository', () => {
  it('fetches the entry and maps it to a domain object', async () => {
    (fetchDosAndDontById as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
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
    const { result } = renderHook(
      () => useDosAndDontByIdRepository('b-1', 'e-1'),
      { wrapper: withClient() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.id).toBe('e-1');
    expect(result.current.data?.createdAt).toBeInstanceOf(Date);
  });

  it('is disabled when either brandId or entryId is null', () => {
    const { result } = renderHook(() => useDosAndDontByIdRepository('b-1', null), {
      wrapper: withClient(),
    });
    expect(result.current.fetchStatus).toBe('idle');
  });
});
