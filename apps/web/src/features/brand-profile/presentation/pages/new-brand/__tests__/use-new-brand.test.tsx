import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { ReactNode } from 'react';

const pushSpy = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: (): { push: Mock } => ({ push: pushSpy }),
}));

vi.mock('../../../../data/remote/create-brand', () => ({
  createBrand: vi.fn(),
}));

import { createBrand } from '../../../../data/remote/create-brand';
import { useActiveBrandStore } from '@/stores/active-brand-store';
import { LanguageProvider } from '@/features/presentation/localization';
import { useNewBrand } from '../use-new-brand';

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

describe('useNewBrand', () => {
  beforeEach(() => {
    pushSpy.mockReset();
    (createBrand as unknown as Mock).mockReset();
    useActiveBrandStore.setState({ activeBrandId: null });
  });

  afterEach(() => {
    useActiveBrandStore.setState(initialStore, true);
  });

  it('sets the new brand as active and pushes to its overview on success', async () => {
    (createBrand as unknown as Mock).mockResolvedValueOnce({
      id: 'brand-1',
      ownerSubject: 'sub-1',
      name: 'Acme',
      description: null,
      createdAt: '2026-05-15T10:00:00.000Z',
      updatedAt: '2026-05-15T10:00:00.000Z',
    });

    const { result } = renderHook(() => useNewBrand(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.handleSubmit({ name: 'Acme' });
    });

    await waitFor(() => expect(pushSpy).toHaveBeenCalledWith('/brands/brand-1'));
    expect(useActiveBrandStore.getState().activeBrandId).toBe('brand-1');
  });

  it('surfaces the server error message on failure', async () => {
    (createBrand as unknown as Mock).mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useNewBrand(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.handleSubmit({ name: 'Acme' });
    });

    await waitFor(() => expect(result.current.uiModel.serverErrorLabel).toBe('boom'));
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it('pushes back to the dashboard on cancel', () => {
    const { result } = renderHook(() => useNewBrand(), { wrapper: createWrapper() });
    result.current.handleCancel();
    expect(pushSpy).toHaveBeenCalledWith('/');
  });
});
