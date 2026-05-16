import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/features/presentation/localization';

const fetchByIdMock = vi.fn();
const updateMock = vi.fn();

vi.mock('@/features/dos-and-donts/data/remote/fetch-dos-and-dont-by-id', () => ({
  fetchDosAndDontById: (input: unknown): unknown => fetchByIdMock(input),
}));
vi.mock('@/features/dos-and-donts/data/remote/update-dos-and-dont', () => ({
  updateDosAndDont: (input: unknown): unknown => updateMock(input),
}));

import { useEditDosAndDont } from '../use-edit-dos-and-dont';

function withProviders({ children }: { children: ReactNode }): ReactNode {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <LanguageProvider>{children}</LanguageProvider>
    </QueryClientProvider>
  );
}

describe('useEditDosAndDont', () => {
  it('pre-populates default values from the by-id query', async () => {
    fetchByIdMock.mockResolvedValueOnce({
      id: 'e-1',
      brandId: 'b-1',
      type: 'dont',
      category: 'visuals',
      title: 'No logos',
      body: 'No tints',
      suggestedCorrection: null,
      createdAt: '2026-05-15T00:00:00.000Z',
      updatedAt: '2026-05-15T00:00:00.000Z',
    });
    const { result } = renderHook(() => useEditDosAndDont('b-1', 'e-1'), {
      wrapper: withProviders,
    });
    await waitFor(() =>
      expect(result.current.uiModel.defaultValues.title).toBe('No logos'),
    );
    expect(result.current.uiModel.defaultValues.category).toBe('visuals');
  });

  it('emits saved navigation on a successful update', async () => {
    fetchByIdMock.mockResolvedValueOnce({
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
    updateMock.mockResolvedValueOnce({
      id: 'e-1',
      brandId: 'b-1',
      type: 'do',
      category: 'tone',
      title: 'new',
      body: 'b',
      suggestedCorrection: null,
      createdAt: '2026-05-15T00:00:00.000Z',
      updatedAt: '2026-05-15T01:00:00.000Z',
    });
    const { result } = renderHook(() => useEditDosAndDont('b-1', 'e-1'), {
      wrapper: withProviders,
    });
    await waitFor(() => expect(result.current.uiModel.isLoading).toBe(false));
    await act(async () => {
      await result.current.handleSubmit({
        type: 'do',
        category: 'tone',
        title: 'new',
        body: 'b',
      });
    });
    expect(result.current.navigationTarget).toBe('saved');
  });

  it('flags notFound when the by-id query rejects with a 404-ish error', async () => {
    const error: Error & { status?: number } = new Error('404');
    error.status = 404;
    fetchByIdMock.mockRejectedValueOnce(error);
    const { result } = renderHook(() => useEditDosAndDont('b-1', 'e-1'), {
      wrapper: withProviders,
    });
    await waitFor(() => expect(result.current.uiModel.notFound).toBe(true));
  });
});
