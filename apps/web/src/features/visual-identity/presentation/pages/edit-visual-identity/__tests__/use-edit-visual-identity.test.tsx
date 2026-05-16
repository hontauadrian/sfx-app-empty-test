import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { ReactNode } from 'react';

vi.mock('../../../../data/remote/fetch-visual-identity', () => ({
  fetchVisualIdentity: vi.fn(),
}));
vi.mock('../../../../data/remote/upsert-visual-identity', () => ({
  upsertVisualIdentity: vi.fn(),
}));

import { fetchVisualIdentity } from '../../../../data/remote/fetch-visual-identity';
import { upsertVisualIdentity } from '../../../../data/remote/upsert-visual-identity';
import { LanguageProvider } from '@/features/presentation/localization';
import { useEditVisualIdentity } from '../use-edit-visual-identity';

function withClient(): (args: { children: ReactNode }) => ReactNode {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }): ReactNode {
    return (
      <QueryClientProvider client={client}>
        <LanguageProvider>{children}</LanguageProvider>
      </QueryClientProvider>
    );
  };
}

const EMPTY_PAYLOAD = {
  id: '',
  brandId: 'brand-1',
  logoUsageRules: null,
  colourPalette: [],
  typographyRules: [],
  spacingLayoutGuidance: null,
  imageStyleGuidance: null,
  iconographyGuidance: null,
  usageRestrictions: null,
  createdAt: '2026-05-15T00:00:00.000Z',
  updatedAt: '2026-05-15T00:00:00.000Z',
};

describe('useEditVisualIdentity', () => {
  beforeEach(() => {
    (fetchVisualIdentity as unknown as Mock).mockReset();
    (upsertVisualIdentity as unknown as Mock).mockReset();
  });

  it('exposes loading state until the query settles', async () => {
    (fetchVisualIdentity as unknown as Mock).mockResolvedValueOnce(EMPTY_PAYLOAD);
    const { result } = renderHook(() => useEditVisualIdentity('brand-1'), {
      wrapper: withClient(),
    });
    expect(result.current.uiModel.isLoading).toBe(true);
    await waitFor(() => expect(result.current.uiModel.isLoading).toBe(false));
    expect(result.current.uiModel.notFound).toBe(false);
  });

  it('sets navigationTarget=saved after a successful submit', async () => {
    (fetchVisualIdentity as unknown as Mock).mockResolvedValueOnce(EMPTY_PAYLOAD);
    (upsertVisualIdentity as unknown as Mock).mockResolvedValueOnce(EMPTY_PAYLOAD);
    const { result } = renderHook(() => useEditVisualIdentity('brand-1'), {
      wrapper: withClient(),
    });
    await waitFor(() => expect(result.current.uiModel.isLoading).toBe(false));

    await act(async () => {
      await result.current.handleSubmit({ logoUsageRules: 'Clear.' } as never);
    });

    expect(result.current.navigationTarget).toBe('saved');
    expect(result.current.uiModel.serverErrorLabel).toBeNull();
  });

  it('surfaces a server error and does not navigate on submit failure', async () => {
    (fetchVisualIdentity as unknown as Mock).mockResolvedValueOnce(EMPTY_PAYLOAD);
    (upsertVisualIdentity as unknown as Mock).mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useEditVisualIdentity('brand-1'), {
      wrapper: withClient(),
    });
    await waitFor(() => expect(result.current.uiModel.isLoading).toBe(false));

    await act(async () => {
      await result.current.handleSubmit({} as never);
    });

    expect(result.current.navigationTarget).toBeNull();
    expect(result.current.uiModel.serverErrorLabel).toBe('boom');
  });

  it('handleCancel sets navigationTarget=cancel and clear resets', async () => {
    (fetchVisualIdentity as unknown as Mock).mockResolvedValueOnce(EMPTY_PAYLOAD);
    const { result } = renderHook(() => useEditVisualIdentity('brand-1'), {
      wrapper: withClient(),
    });
    await waitFor(() => expect(result.current.uiModel.isLoading).toBe(false));

    act(() => result.current.handleCancel());
    expect(result.current.navigationTarget).toBe('cancel');
    act(() => result.current.clearNavigationTarget());
    expect(result.current.navigationTarget).toBeNull();
  });

  it('reports notFound when the fetch returns a 404-shaped error', async () => {
    const error = Object.assign(new Error('not found'), { status: 404 });
    (fetchVisualIdentity as unknown as Mock).mockRejectedValueOnce(error);
    const { result } = renderHook(() => useEditVisualIdentity('brand-1'), {
      wrapper: withClient(),
    });
    await waitFor(() => expect(result.current.uiModel.notFound).toBe(true));
    expect(result.current.uiModel.hasError).toBe(false);
  });

  it('reports hasError on non-404 failures', async () => {
    (fetchVisualIdentity as unknown as Mock).mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useEditVisualIdentity('brand-1'), {
      wrapper: withClient(),
    });
    await waitFor(() => expect(result.current.uiModel.hasError).toBe(true));
    expect(result.current.uiModel.notFound).toBe(false);
  });
});
