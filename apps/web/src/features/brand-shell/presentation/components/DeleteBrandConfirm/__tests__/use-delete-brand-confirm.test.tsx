import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { Brand } from '@sfx/domain';

vi.mock('../../../../data/remote/delete-brand', () => ({ deleteBrand: vi.fn() }));
vi.mock('../../../../data/remote/fetch-brands', () => ({ fetchBrands: vi.fn() }));
vi.mock('../../../../data/remote/create-brand', () => ({ createBrand: vi.fn() }));
vi.mock('../../../../data/remote/rename-brand', () => ({ renameBrand: vi.fn() }));

const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();
vi.mock('@/features/presentation/toast', () => ({
  useToast: (): { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn>; dismiss: ReturnType<typeof vi.fn> } => ({ success: toastSuccessMock, error: toastErrorMock, dismiss: vi.fn() }),
}));

import { deleteBrand } from '../../../../data/remote/delete-brand';
import { fetchBrands } from '../../../../data/remote/fetch-brands';
import { useDeleteBrandConfirm } from '../use-delete-brand-confirm';
import { LanguageProvider } from '@/features/presentation/localization';

const deleteBrandMock = vi.mocked(deleteBrand);
const fetchBrandsMock = vi.mocked(fetchBrands);

const brand: Brand = {
  id: 'clxbrand0001',
  name: 'Acme',
  slug: 'acme',
  ownerUserId: 'subject-admin',
  createdAt: new Date('2026-05-17T00:00:00.000Z'),
  updatedAt: new Date('2026-05-17T00:00:00.000Z'),
  deletedAt: null,
};

function makeWrapper(): (props: { children: ReactNode }) => ReactNode {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }): ReactNode {
    return (
      <QueryClientProvider client={client}>
        <LanguageProvider>{children}</LanguageProvider>
      </QueryClientProvider>
    );
  };
}

beforeEach(() => {
  deleteBrandMock.mockReset();
  fetchBrandsMock.mockResolvedValue([]);
  toastSuccessMock.mockReset();
  toastErrorMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useDeleteBrandConfirm', () => {
  it('returns the interpolated body message', () => {
    const { result } = renderHook(
      () => useDeleteBrandConfirm({ open: true, brand, onClose: vi.fn(), onDeleted: vi.fn() }),
      { wrapper: makeWrapper() },
    );
    expect(result.current.uiModel.bodyMessage).toBe('Acme will be removed and cannot be undone.');
  });

  it('calls onDeleted + onClose + success toast on successful confirm', async () => {
    deleteBrandMock.mockResolvedValueOnce(undefined as unknown as void);
    const onDeleted = vi.fn();
    const onClose = vi.fn();
    const { result } = renderHook(
      () => useDeleteBrandConfirm({ open: true, brand, onClose, onDeleted }),
      { wrapper: makeWrapper() },
    );
    await act(async () => {
      await result.current.handleConfirm();
    });
    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith('clxbrand0001'));
    expect(onClose).toHaveBeenCalled();
    expect(toastSuccessMock).toHaveBeenCalledWith('Brand deleted');
  });

  it('treats 404 as already-deleted (idempotent) and fires onDeleted', async () => {
    deleteBrandMock.mockRejectedValueOnce({ status: 404 });
    const onDeleted = vi.fn();
    const { result } = renderHook(
      () => useDeleteBrandConfirm({ open: true, brand, onClose: vi.fn(), onDeleted }),
      { wrapper: makeWrapper() },
    );
    await act(async () => {
      await result.current.handleConfirm();
    });
    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith('clxbrand0001'));
  });

  it('shows auth error toast on 401', async () => {
    deleteBrandMock.mockRejectedValueOnce({ status: 401 });
    const { result } = renderHook(
      () => useDeleteBrandConfirm({ open: true, brand, onClose: vi.fn(), onDeleted: vi.fn() }),
      { wrapper: makeWrapper() },
    );
    await act(async () => {
      await result.current.handleConfirm();
    });
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
  });

  it('shows generic error toast on 500', async () => {
    deleteBrandMock.mockRejectedValueOnce({ status: 500 });
    const { result } = renderHook(
      () => useDeleteBrandConfirm({ open: true, brand, onClose: vi.fn(), onDeleted: vi.fn() }),
      { wrapper: makeWrapper() },
    );
    await act(async () => {
      await result.current.handleConfirm();
    });
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
  });

  it('handleCancel invokes onClose', () => {
    const onClose = vi.fn();
    const { result } = renderHook(
      () => useDeleteBrandConfirm({ open: true, brand, onClose, onDeleted: vi.fn() }),
      { wrapper: makeWrapper() },
    );
    act(() => result.current.handleCancel());
    expect(onClose).toHaveBeenCalled();
  });

  it('no-ops confirm when no brand is provided', async () => {
    const { result } = renderHook(
      () =>
        useDeleteBrandConfirm({ open: true, brand: null, onClose: vi.fn(), onDeleted: vi.fn() }),
      { wrapper: makeWrapper() },
    );
    await act(async () => {
      await result.current.handleConfirm();
    });
    expect(deleteBrandMock).not.toHaveBeenCalled();
  });
});
