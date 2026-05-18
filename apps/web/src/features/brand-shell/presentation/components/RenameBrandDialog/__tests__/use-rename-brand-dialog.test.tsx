import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { Brand } from '@sfx/domain';

vi.mock('../../../../data/remote/rename-brand', () => ({ renameBrand: vi.fn() }));
vi.mock('../../../../data/remote/fetch-brands', () => ({ fetchBrands: vi.fn() }));
vi.mock('../../../../data/remote/create-brand', () => ({ createBrand: vi.fn() }));
vi.mock('../../../../data/remote/delete-brand', () => ({ deleteBrand: vi.fn() }));

const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();
vi.mock('@/features/presentation/toast', () => ({
  useToast: (): { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn>; dismiss: ReturnType<typeof vi.fn> } => ({ success: toastSuccessMock, error: toastErrorMock, dismiss: vi.fn() }),
}));

import { renameBrand } from '../../../../data/remote/rename-brand';
import { fetchBrands } from '../../../../data/remote/fetch-brands';
import { useRenameBrandDialog } from '../use-rename-brand-dialog';
import { LanguageProvider } from '@/features/presentation/localization';

const renameBrandMock = vi.mocked(renameBrand);
const fetchBrandsMock = vi.mocked(fetchBrands);

const brand: Brand = {
  id: 'clxbrand0001',
  name: 'Old',
  slug: 'old',
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
  renameBrandMock.mockReset();
  fetchBrandsMock.mockResolvedValue([]);
  toastSuccessMock.mockReset();
  toastErrorMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useRenameBrandDialog', () => {
  it('exposes idle labels and prefilled name when open', async () => {
    const { result } = renderHook(
      () => useRenameBrandDialog({ open: true, brand, onClose: vi.fn(), onRenamed: vi.fn() }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.nameValue).toBe('Old'));
    expect(result.current.uiModel.title).toBe('Rename brand');
    expect(result.current.uiModel.submitLabel).toBe('Save');
  });

  it('calls onRenamed + onClose + success toast on a successful rename', async () => {
    renameBrandMock.mockResolvedValueOnce({
      id: 'clxbrand0001',
      name: 'New',
      slug: 'new',
      ownerUserId: 'subject-admin',
      createdAt: '2026-05-17T00:00:00.000Z',
      updatedAt: '2026-05-17T00:00:00.000Z',
      deletedAt: null,
    });
    const onRenamed = vi.fn();
    const onClose = vi.fn();
    const { result } = renderHook(
      () => useRenameBrandDialog({ open: true, brand, onClose, onRenamed }),
      { wrapper: makeWrapper() },
    );
    act(() => result.current.handleNameChange('New'));
    await act(async () => {
      await result.current.handleSubmit();
    });
    await waitFor(() => expect(onRenamed).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
    expect(toastSuccessMock).toHaveBeenCalledWith('Brand renamed');
  });

  it('treats 404 as auto-close + unexpected toast', async () => {
    renameBrandMock.mockRejectedValueOnce({ status: 404 });
    const onClose = vi.fn();
    const { result } = renderHook(
      () => useRenameBrandDialog({ open: true, brand, onClose, onRenamed: vi.fn() }),
      { wrapper: makeWrapper() },
    );
    act(() => result.current.handleNameChange('New'));
    await act(async () => {
      await result.current.handleSubmit();
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(toastErrorMock).toHaveBeenCalled();
  });

  it('shows the auth error toast on 401', async () => {
    renameBrandMock.mockRejectedValueOnce({ status: 401 });
    const { result } = renderHook(
      () => useRenameBrandDialog({ open: true, brand, onClose: vi.fn(), onRenamed: vi.fn() }),
      { wrapper: makeWrapper() },
    );
    act(() => result.current.handleNameChange('New'));
    await act(async () => {
      await result.current.handleSubmit();
    });
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
  });

  it('handleCancel invokes onClose', () => {
    const onClose = vi.fn();
    const { result } = renderHook(
      () => useRenameBrandDialog({ open: true, brand, onClose, onRenamed: vi.fn() }),
      { wrapper: makeWrapper() },
    );
    act(() => result.current.handleCancel());
    expect(onClose).toHaveBeenCalled();
  });

  it('no-ops handleSubmit when no brand is provided', async () => {
    const { result } = renderHook(
      () => useRenameBrandDialog({ open: true, brand: null, onClose: vi.fn(), onRenamed: vi.fn() }),
      { wrapper: makeWrapper() },
    );
    await act(async () => {
      await result.current.handleSubmit();
    });
    expect(renameBrandMock).not.toHaveBeenCalled();
  });
});
