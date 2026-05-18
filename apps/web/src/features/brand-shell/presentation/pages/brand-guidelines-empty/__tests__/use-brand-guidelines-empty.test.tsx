import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('../../../../data/remote/fetch-brands', () => ({ fetchBrands: vi.fn() }));
vi.mock('../../../../data/remote/create-brand', () => ({ createBrand: vi.fn() }));
vi.mock('../../../../data/remote/rename-brand', () => ({ renameBrand: vi.fn() }));
vi.mock('../../../../data/remote/delete-brand', () => ({ deleteBrand: vi.fn() }));

import { fetchBrands } from '../../../../data/remote/fetch-brands';
import { useBrandGuidelinesEmpty } from '../use-brand-guidelines-empty';
import { LanguageProvider } from '@/features/presentation/localization';

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
  fetchBrandsMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useBrandGuidelinesEmpty', () => {
  it('starts in loading state until the query resolves', async () => {
    fetchBrandsMock.mockResolvedValueOnce([]);
    const { result } = renderHook(() => useBrandGuidelinesEmpty(), {
      wrapper: makeWrapper(),
    });
    expect(result.current.uiModel.status).toBe('loading');
    await waitFor(() => expect(result.current.uiModel.status).toBe('ready'));
    expect(result.current.navigationTarget).toBeNull();
  });

  it('sets navigationTarget when the brand list arrives non-empty', async () => {
    fetchBrandsMock.mockResolvedValueOnce([
      {
        id: 'clxbrand0001',
        name: 'Acme',
        slug: 'acme',
        ownerUserId: 'subject-admin',
        createdAt: '2026-05-17T00:00:00.000Z',
        updatedAt: '2026-05-17T00:00:00.000Z',
        deletedAt: null,
      },
    ]);
    const { result } = renderHook(() => useBrandGuidelinesEmpty(), {
      wrapper: makeWrapper(),
    });
    await waitFor(() =>
      expect(result.current.navigationTarget).toEqual({
        kind: 'detail',
        brandId: 'clxbrand0001',
      }),
    );
  });

  it('opens and closes the create modal', () => {
    fetchBrandsMock.mockResolvedValueOnce([]);
    const { result } = renderHook(() => useBrandGuidelinesEmpty(), {
      wrapper: makeWrapper(),
    });
    act(() => result.current.handleOpenCreate());
    expect(result.current.createOpen).toBe(true);
    act(() => result.current.handleCloseCreate());
    expect(result.current.createOpen).toBe(false);
  });

  it('handleCreated sets a detail navigation target', () => {
    fetchBrandsMock.mockResolvedValueOnce([]);
    const { result } = renderHook(() => useBrandGuidelinesEmpty(), {
      wrapper: makeWrapper(),
    });
    act(() => result.current.handleCreated('clxbrand0002'));
    expect(result.current.navigationTarget).toEqual({
      kind: 'detail',
      brandId: 'clxbrand0002',
    });
  });

  it('clearNavigationTarget resets the target', async () => {
    fetchBrandsMock.mockResolvedValueOnce([]);
    const { result } = renderHook(() => useBrandGuidelinesEmpty(), {
      wrapper: makeWrapper(),
    });
    act(() => result.current.handleCreated('clxbrand0003'));
    expect(result.current.navigationTarget).not.toBeNull();
    act(() => result.current.clearNavigationTarget());
    expect(result.current.navigationTarget).toBeNull();
  });
});
