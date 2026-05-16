import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../remote/fetch-dos-and-donts', () => ({
  fetchDosAndDonts: vi.fn(),
}));

import { fetchDosAndDonts } from '../../remote/fetch-dos-and-donts';
import { useDosAndDontsRepository } from '../use-dos-and-donts-repository';

function withClient(): (props: { children: ReactNode }) => ReactNode {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }): ReactNode => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('useDosAndDontsRepository', () => {
  it('fetches the list and maps to domain entries', async () => {
    (fetchDosAndDonts as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        id: 'e-1',
        brandId: 'b-1',
        type: 'do',
        category: 'tone',
        title: 't',
        body: 'b',
        suggestedCorrection: null,
        createdAt: '2026-05-15T00:00:00.000Z',
        updatedAt: '2026-05-15T00:00:00.000Z',
      },
    ]);
    const { result } = renderHook(() => useDosAndDontsRepository('b-1'), {
      wrapper: withClient(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0]?.createdAt).toBeInstanceOf(Date);
    expect(fetchDosAndDonts).toHaveBeenCalledWith({ brandId: 'b-1', category: undefined });
  });

  it('disables the query when brandId is null', () => {
    const { result } = renderHook(() => useDosAndDontsRepository(null), {
      wrapper: withClient(),
    });
    expect(result.current.fetchStatus).toBe('idle');
  });
});
