import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { ReactNode } from 'react';

const pushSpy = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: (): { push: Mock } => ({ push: pushSpy }),
}));

vi.mock('../../../../data/remote/fetch-brand-by-id', () => ({
  fetchBrandById: vi.fn(),
}));

vi.mock('../../../../data/remote/update-brand', () => ({
  updateBrand: vi.fn(),
}));

vi.mock('../../../../data/remote/delete-brand', () => ({
  deleteBrand: vi.fn(),
}));

import { fetchBrandById } from '../../../../data/remote/fetch-brand-by-id';
import { updateBrand } from '../../../../data/remote/update-brand';
import { deleteBrand } from '../../../../data/remote/delete-brand';
import { useActiveBrandStore } from '@/stores/active-brand-store';
import { LanguageProvider } from '@/features/presentation/localization';
import { useBrandOverview } from '../use-brand-overview';

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

describe('useBrandOverview', () => {
  beforeEach(() => {
    pushSpy.mockReset();
    (fetchBrandById as unknown as Mock).mockReset();
    (updateBrand as unknown as Mock).mockReset();
    (deleteBrand as unknown as Mock).mockReset();
  });

  afterEach(() => {
    useActiveBrandStore.setState(initialStore, true);
  });

  it('renames the brand and closes the rename modal on success', async () => {
    (fetchBrandById as unknown as Mock).mockResolvedValue({
      id: 'brand-1',
      ownerSubject: 'sub-1',
      name: 'Acme',
      description: null,
      createdAt: '2026-05-15T10:00:00.000Z',
      updatedAt: '2026-05-15T10:00:00.000Z',
    });
    (updateBrand as unknown as Mock).mockResolvedValue({
      id: 'brand-1',
      ownerSubject: 'sub-1',
      name: 'Renamed',
      description: null,
      createdAt: '2026-05-15T10:00:00.000Z',
      updatedAt: '2026-05-15T11:00:00.000Z',
    });

    const { result } = renderHook(() => useBrandOverview('brand-1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.initialName).toBe('Acme'));

    act(() => result.current.openRename());
    expect(result.current.isRenameOpen).toBe(true);

    await act(async () => {
      await result.current.handleRenameSubmit('Renamed');
    });

    expect(updateBrand).toHaveBeenCalledWith({ id: 'brand-1', name: 'Renamed' });
    expect(result.current.isRenameOpen).toBe(false);
  });

  it('deletes the brand and redirects to the dashboard when the deleted brand was active', async () => {
    useActiveBrandStore.setState({ activeBrandId: 'brand-1' });
    (fetchBrandById as unknown as Mock).mockResolvedValue({
      id: 'brand-1',
      ownerSubject: 'sub-1',
      name: 'Acme',
      description: null,
      createdAt: '2026-05-15T10:00:00.000Z',
      updatedAt: '2026-05-15T10:00:00.000Z',
    });
    (deleteBrand as unknown as Mock).mockResolvedValue(undefined);

    const { result } = renderHook(() => useBrandOverview('brand-1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.initialName).toBe('Acme'));

    await act(async () => {
      await result.current.handleDeleteConfirm();
    });

    expect(deleteBrand).toHaveBeenCalledWith('brand-1');
    expect(useActiveBrandStore.getState().activeBrandId).toBeNull();
    expect(pushSpy).toHaveBeenCalledWith('/');
  });
});
