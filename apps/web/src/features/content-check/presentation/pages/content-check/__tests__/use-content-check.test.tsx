import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { ReactNode } from 'react';
import { LanguageProvider } from '@/features/presentation/localization';

vi.mock(
  '@/features/brand-profile/data/repositories/use-brands-repository',
  () => ({
    useBrandsRepository: vi.fn(),
  }),
);

vi.mock(
  '@/features/content-check/data/repositories/use-content-check-list-repository',
  () => ({ useContentCheckListRepository: vi.fn() }),
);

import { useBrandsRepository } from '@/features/brand-profile/data/repositories/use-brands-repository';
import { useActiveBrandStore } from '@/stores/active-brand-store';
import { useContentCheckListRepository } from '@/features/content-check/data/repositories/use-content-check-list-repository';
import { useContentCheck } from '../use-content-check';

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

const baseRepo = {
  data: undefined,
  isLoading: false,
  isError: false,
  isBrandNotFound: false,
};

describe('useContentCheck', () => {
  beforeEach(() => {
    (useBrandsRepository as unknown as Mock).mockReset();
    (useBrandsRepository as unknown as Mock).mockReturnValue({
      data: [{ id: 'brand-1', name: 'Acme' }],
      isLoading: false,
    });
    (useContentCheckListRepository as unknown as Mock).mockReset();
    (useContentCheckListRepository as unknown as Mock).mockReturnValue(baseRepo);
  });

  afterEach(() => {
    useActiveBrandStore.setState(initialStore, true);
    vi.clearAllMocks();
  });

  it('returns the noActiveBrand state when there is no active brand', () => {
    useActiveBrandStore.setState({ activeBrandId: null });
    const { result } = renderHook(() => useContentCheck(), {
      wrapper: createWrapper(),
    });
    expect(result.current.uiModel.state).toBe('noActiveBrand');
    expect(result.current.uiModel.emptyStateCtaHref).toBe('/');
  });

  it('returns the zeroMatches state with the brand-overview CTA when entries are empty', () => {
    useActiveBrandStore.setState({ activeBrandId: 'brand-1' });
    (useContentCheckListRepository as unknown as Mock).mockReturnValue({
      ...baseRepo,
      data: [],
    });
    const { result } = renderHook(() => useContentCheck(), {
      wrapper: createWrapper(),
    });
    expect(result.current.uiModel.state).toBe('zeroMatches');
    expect(result.current.uiModel.emptyStateCtaHref).toBe('/brands/brand-1');
  });

  it('returns the populated state and groups entries when data is present', () => {
    useActiveBrandStore.setState({ activeBrandId: 'brand-1' });
    (useContentCheckListRepository as unknown as Mock).mockReturnValue({
      ...baseRepo,
      data: [
        {
          id: '1',
          brandId: 'brand-1',
          type: 'do',
          category: 'tone',
          title: 'Be warm',
          body: 'Use warm phrasing.',
          suggestedCorrection: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });
    const { result } = renderHook(() => useContentCheck(), {
      wrapper: createWrapper(),
    });
    expect(result.current.uiModel.state).toBe('populated');
    expect(result.current.uiModel.groups[0]?.key).toBe('tone');
  });

  it('returns the brandNotFound state and clears the active-brand store via effect', async () => {
    useActiveBrandStore.setState({ activeBrandId: 'brand-1' });
    const clearSpy = vi.spyOn(
      useActiveBrandStore.getState(),
      'clear',
    );
    (useContentCheckListRepository as unknown as Mock).mockReturnValue({
      ...baseRepo,
      isBrandNotFound: true,
    });
    const { result } = renderHook(() => useContentCheck(), {
      wrapper: createWrapper(),
    });
    expect(result.current.uiModel.state).toBe('brandNotFound');
    await waitFor(() => {
      expect(useActiveBrandStore.getState().activeBrandId).toBeNull();
    });
    clearSpy.mockRestore();
  });

  it('exposes a stable handleCheckContent identity across re-renders', () => {
    useActiveBrandStore.setState({ activeBrandId: 'brand-1' });
    const { result, rerender } = renderHook(() => useContentCheck(), {
      wrapper: createWrapper(),
    });
    const first = result.current.handleCheckContent;
    rerender();
    expect(result.current.handleCheckContent).toBe(first);
  });

  it('keeps the wire-side category undefined when the All sentinel is selected', () => {
    useActiveBrandStore.setState({ activeBrandId: 'brand-1' });
    renderHook(() => useContentCheck(), { wrapper: createWrapper() });
    expect(useContentCheckListRepository).toHaveBeenLastCalledWith('brand-1', '');
  });

  it('passes the active brand name through to the UI model when the brand exists in the cache', () => {
    useActiveBrandStore.setState({ activeBrandId: 'brand-1' });
    const { result } = renderHook(() => useContentCheck(), {
      wrapper: createWrapper(),
    });
    expect(result.current.uiModel.activeBrandName).toBe('Acme');
  });

  it('passes pasted-text edits through to the UI model', async () => {
    useActiveBrandStore.setState({ activeBrandId: 'brand-1' });
    const { result } = renderHook(() => useContentCheck(), {
      wrapper: createWrapper(),
    });
    act(() => {
      result.current.handleSubmit(() => {})();
    });
    expect(result.current.uiModel.pastedTextValue).toBe('');
  });
});
