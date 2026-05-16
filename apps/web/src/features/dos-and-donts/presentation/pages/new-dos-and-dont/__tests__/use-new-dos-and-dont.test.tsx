import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/features/presentation/localization';

const createMock = vi.fn();
vi.mock('@/features/dos-and-donts/data/remote/create-dos-and-dont', () => ({
  createDosAndDont: (input: unknown): unknown => createMock(input),
}));

import { useNewDosAndDont } from '../use-new-dos-and-dont';

function withProviders({ children }: { children: ReactNode }): ReactNode {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <LanguageProvider>{children}</LanguageProvider>
    </QueryClientProvider>
  );
}

describe('useNewDosAndDont', () => {
  it('emits the saved navigation target on a successful submit', async () => {
    createMock.mockResolvedValueOnce({
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
    const { result } = renderHook(() => useNewDosAndDont('b-1'), {
      wrapper: withProviders,
    });
    await act(async () => {
      await result.current.handleSubmit({
        type: 'do',
        category: 'tone',
        title: 't',
        body: 'b',
      });
    });
    await waitFor(() => expect(result.current.navigationTarget).toBe('saved'));
  });

  it('records a server error and stays on the page when the mutation rejects', async () => {
    createMock.mockRejectedValueOnce(new Error('server angry'));
    const { result } = renderHook(() => useNewDosAndDont('b-1'), {
      wrapper: withProviders,
    });
    await act(async () => {
      await result.current.handleSubmit({
        type: 'do',
        category: 'tone',
        title: 't',
        body: 'b',
      });
    });
    expect(result.current.navigationTarget).toBeNull();
    expect(result.current.uiModel.serverErrorLabel).toBe('server angry');
  });

  it('emits cancel navigation when handleCancel is called', () => {
    const { result } = renderHook(() => useNewDosAndDont('b-1'), {
      wrapper: withProviders,
    });
    act(() => {
      result.current.handleCancel();
    });
    expect(result.current.navigationTarget).toBe('cancel');
  });
});
