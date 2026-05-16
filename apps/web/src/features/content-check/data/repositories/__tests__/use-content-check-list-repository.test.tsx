import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { ReactNode } from 'react';

vi.mock('@/features/dos-and-donts', () => ({
  useDosAndDontsRepository: vi.fn(),
}));

import { useDosAndDontsRepository } from '@/features/dos-and-donts';
import { useContentCheckListRepository } from '../use-content-check-list-repository';

function createWrapper(): (args: { children: ReactNode }) => ReactNode {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }): ReactNode {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const baseQuery = {
  data: undefined,
  isLoading: false,
  isError: false,
  error: null as unknown,
};

describe('useContentCheckListRepository', () => {
  beforeEach(() => {
    (useDosAndDontsRepository as unknown as Mock).mockReset();
    (useDosAndDontsRepository as unknown as Mock).mockReturnValue(baseQuery);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the idle empty shape when there is no active brand and never calls the F1 hook with a brand id', () => {
    const { result } = renderHook(
      () => useContentCheckListRepository(null, ''),
      { wrapper: createWrapper() },
    );

    expect(result.current.data).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isError).toBe(false);
    expect(result.current.isBrandNotFound).toBe(false);
    expect(useDosAndDontsRepository).toHaveBeenCalledWith(null, undefined);
  });

  it('calls the F1 hook with undefined when the form category is the All sentinel', () => {
    renderHook(() => useContentCheckListRepository('brand-1', ''), {
      wrapper: createWrapper(),
    });
    expect(useDosAndDontsRepository).toHaveBeenCalledWith('brand-1', undefined);
  });

  it('calls the F1 hook with the selected category when a specific category is chosen', () => {
    renderHook(() => useContentCheckListRepository('brand-1', 'tone'), {
      wrapper: createWrapper(),
    });
    expect(useDosAndDontsRepository).toHaveBeenCalledWith('brand-1', 'tone');
  });

  it('exposes isBrandNotFound when the F1 hook reports a 404 error', () => {
    (useDosAndDontsRepository as unknown as Mock).mockReturnValue({
      ...baseQuery,
      isError: true,
      error: Object.assign(new Error('Not found'), { status: 404 }),
    });
    const { result } = renderHook(
      () => useContentCheckListRepository('brand-1', ''),
      { wrapper: createWrapper() },
    );
    expect(result.current.isBrandNotFound).toBe(true);
    expect(result.current.isError).toBe(false);
  });

  it('exposes isError for any non-404 error and leaves isBrandNotFound false', () => {
    (useDosAndDontsRepository as unknown as Mock).mockReturnValue({
      ...baseQuery,
      isError: true,
      error: Object.assign(new Error('Server error'), { status: 500 }),
    });
    const { result } = renderHook(
      () => useContentCheckListRepository('brand-1', ''),
      { wrapper: createWrapper() },
    );
    expect(result.current.isError).toBe(true);
    expect(result.current.isBrandNotFound).toBe(false);
  });

  it('only reports isLoading once a brand is selected', () => {
    (useDosAndDontsRepository as unknown as Mock).mockReturnValue({
      ...baseQuery,
      isLoading: true,
    });
    const { result: idleResult } = renderHook(
      () => useContentCheckListRepository(null, ''),
      { wrapper: createWrapper() },
    );
    expect(idleResult.current.isLoading).toBe(false);

    const { result: activeResult } = renderHook(
      () => useContentCheckListRepository('brand-1', ''),
      { wrapper: createWrapper() },
    );
    expect(activeResult.current.isLoading).toBe(true);
  });

  it('passes through the loaded data array', () => {
    const fakeEntries = [
      {
        id: '1',
        brandId: 'brand-1',
        type: 'do' as const,
        category: 'tone' as const,
        title: 'Be warm',
        body: 'Use warm phrasing.',
        suggestedCorrection: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    (useDosAndDontsRepository as unknown as Mock).mockReturnValue({
      ...baseQuery,
      data: fakeEntries,
    });
    const { result } = renderHook(
      () => useContentCheckListRepository('brand-1', ''),
      { wrapper: createWrapper() },
    );
    expect(result.current.data).toBe(fakeEntries);
  });
});
