import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { ReactNode } from 'react';

const replaceSpy = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: (): { replace: Mock } => ({ replace: replaceSpy }),
}));

vi.mock('../../../../data/remote/fetch-brands', () => ({
  fetchBrands: vi.fn(),
}));

import { fetchBrands } from '../../../../data/remote/fetch-brands';
import { useActiveBrandStore } from '@/stores/active-brand-store';
import { LanguageProvider } from '@/features/presentation/localization';
import { useDashboard } from '../use-dashboard';

const initialStore = useActiveBrandStore.getState();

function createWrapper(): (args: { children: ReactNode }) => ReactNode {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }): ReactNode {
    return (
      <QueryClientProvider client={client}>
        <LanguageProvider>{children}</LanguageProvider>
      </QueryClientProvider>
    );
  };
}

describe('useDashboard', () => {
  beforeEach(() => {
    replaceSpy.mockReset();
    (fetchBrands as unknown as Mock).mockReset();
    useActiveBrandStore.setState({ activeBrandId: null });
  });

  afterEach(() => {
    useActiveBrandStore.setState(initialStore, true);
  });

  it('redirects to the most-recently-updated brand and stores its id when none is stored', async () => {
    (fetchBrands as unknown as Mock).mockResolvedValueOnce([
      {
        id: 'a',
        ownerSubject: 'sub-1',
        name: 'A',
        description: null,
        createdAt: '2026-05-10T00:00:00.000Z',
        updatedAt: '2026-05-10T00:00:00.000Z',
      },
      {
        id: 'b',
        ownerSubject: 'sub-1',
        name: 'B',
        description: null,
        createdAt: '2026-05-14T00:00:00.000Z',
        updatedAt: '2026-05-14T00:00:00.000Z',
      },
    ]);

    renderHook(() => useDashboard(), { wrapper: createWrapper() });

    await waitFor(() => expect(replaceSpy).toHaveBeenCalledWith('/brands/b'));
    expect(useActiveBrandStore.getState().activeBrandId).toBe('b');
  });

  it('clears the store when the stored active brand no longer exists', async () => {
    useActiveBrandStore.setState({ activeBrandId: 'gone' });
    (fetchBrands as unknown as Mock).mockResolvedValueOnce([]);

    renderHook(() => useDashboard(), { wrapper: createWrapper() });

    await waitFor(() => expect(useActiveBrandStore.getState().activeBrandId).toBeNull());
    expect(replaceSpy).not.toHaveBeenCalled();
  });
});
