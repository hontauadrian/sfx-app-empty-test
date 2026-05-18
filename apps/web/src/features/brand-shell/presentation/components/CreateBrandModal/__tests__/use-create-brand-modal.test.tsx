import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('../../../../data/remote/create-brand', () => ({ createBrand: vi.fn() }));
vi.mock('../../../../data/remote/fetch-brands', () => ({ fetchBrands: vi.fn() }));
vi.mock('../../../../data/remote/rename-brand', () => ({ renameBrand: vi.fn() }));
vi.mock('../../../../data/remote/delete-brand', () => ({ deleteBrand: vi.fn() }));

const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();
vi.mock('@/features/presentation/toast', () => ({
  useToast: (): { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn>; dismiss: ReturnType<typeof vi.fn> } => ({ success: toastSuccessMock, error: toastErrorMock, dismiss: vi.fn() }),
}));

import { createBrand } from '../../../../data/remote/create-brand';
import { fetchBrands } from '../../../../data/remote/fetch-brands';
import { useCreateBrandModal } from '../use-create-brand-modal';
import { LanguageProvider } from '@/features/presentation/localization';

const createBrandMock = vi.mocked(createBrand);
const fetchBrandsMock = vi.mocked(fetchBrands);

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
  createBrandMock.mockReset();
  fetchBrandsMock.mockResolvedValue([]);
  toastSuccessMock.mockReset();
  toastErrorMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useCreateBrandModal', () => {
  it('exposes the idle labels and an empty name value', () => {
    const onClose = vi.fn();
    const onCreated = vi.fn();
    const { result } = renderHook(
      () => useCreateBrandModal({ open: true, onClose, onCreated }),
      { wrapper: makeWrapper() },
    );
    expect(result.current.uiModel.title).toBe('Create brand profile');
    expect(result.current.uiModel.submitLabel).toBe('Create');
    expect(result.current.nameValue).toBe('');
  });

  it('updates name value via handleNameChange', () => {
    const { result } = renderHook(
      () => useCreateBrandModal({ open: true, onClose: vi.fn(), onCreated: vi.fn() }),
      { wrapper: makeWrapper() },
    );
    act(() => {
      result.current.handleNameChange('Acme');
    });
    expect(result.current.nameValue).toBe('Acme');
  });

  it('calls onCreated + onClose + success toast on successful submit', async () => {
    createBrandMock.mockResolvedValueOnce({
      id: 'clxbrand0001',
      name: 'Acme',
      slug: 'acme',
      ownerUserId: 'subject-admin',
      createdAt: '2026-05-17T00:00:00.000Z',
      updatedAt: '2026-05-17T00:00:00.000Z',
      deletedAt: null,
    });
    const onClose = vi.fn();
    const onCreated = vi.fn();
    const { result } = renderHook(
      () => useCreateBrandModal({ open: true, onClose, onCreated }),
      { wrapper: makeWrapper() },
    );
    act(() => result.current.handleNameChange('Acme'));
    await act(async () => {
      await result.current.handleSubmit();
    });
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
    expect(toastSuccessMock).toHaveBeenCalledWith('Brand created');
  });

  it('toasts auth error on 401', async () => {
    createBrandMock.mockRejectedValueOnce({ status: 401 });
    const { result } = renderHook(
      () => useCreateBrandModal({ open: true, onClose: vi.fn(), onCreated: vi.fn() }),
      { wrapper: makeWrapper() },
    );
    act(() => result.current.handleNameChange('Acme'));
    await act(async () => {
      await result.current.handleSubmit();
    });
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
  });

  it('handleCancel invokes onClose', () => {
    const onClose = vi.fn();
    const { result } = renderHook(
      () => useCreateBrandModal({ open: true, onClose, onCreated: vi.fn() }),
      { wrapper: makeWrapper() },
    );
    act(() => result.current.handleCancel());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not submit when the name is empty (validation error)', async () => {
    const onCreated = vi.fn();
    const { result } = renderHook(
      () => useCreateBrandModal({ open: true, onClose: vi.fn(), onCreated }),
      { wrapper: makeWrapper() },
    );
    await act(async () => {
      await result.current.handleSubmit();
    });
    expect(createBrandMock).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
    expect(result.current.uiModel.nameError).not.toBeNull();
  });
});
