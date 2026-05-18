import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('../../../../data/remote/fetch-brands', () => ({ fetchBrands: vi.fn() }));
vi.mock('../../../../data/remote/create-brand', () => ({ createBrand: vi.fn() }));
vi.mock('../../../../data/remote/rename-brand', () => ({ renameBrand: vi.fn() }));
vi.mock('../../../../data/remote/delete-brand', () => ({ deleteBrand: vi.fn() }));

import { fetchBrands } from '../../../../data/remote/fetch-brands';
import { useBrandGuidelinesDetail } from '../use-brand-guidelines-detail';
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

describe('useBrandGuidelinesDetail', () => {
  it('reports ready + the active brand when the URL id matches', async () => {
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
    const { result } = renderHook(
      () => useBrandGuidelinesDetail({ brandId: 'clxbrand0001' }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.uiModel.status).toBe('ready'));
    expect(result.current.activeBrand?.name).toBe('Acme');
  });

  it('reports not-found when the URL id is not in the list', async () => {
    fetchBrandsMock.mockResolvedValueOnce([]);
    const { result } = renderHook(
      () => useBrandGuidelinesDetail({ brandId: 'missing' }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.uiModel.status).toBe('not-found'));
    expect(result.current.activeBrand).toBeNull();
  });

  it('navigates to a new brand id on handleSelectBrand', async () => {
    fetchBrandsMock.mockResolvedValueOnce([]);
    const { result } = renderHook(
      () => useBrandGuidelinesDetail({ brandId: 'x' }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.uiModel.status).toBe('not-found'));
    act(() => result.current.handleSelectBrand('clxbrand0002'));
    expect(result.current.navigationTarget).toEqual({
      kind: 'detail',
      brandId: 'clxbrand0002',
    });
  });

  it('navigates to a new brand id on handleCreated', async () => {
    fetchBrandsMock.mockResolvedValueOnce([]);
    const { result } = renderHook(
      () => useBrandGuidelinesDetail({ brandId: 'x' }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.uiModel.status).toBe('not-found'));
    act(() =>
      result.current.handleCreated({
        id: 'clxbrand0003',
        name: 'New',
        slug: 'new',
        ownerUserId: 'subject-admin',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      }),
    );
    expect(result.current.navigationTarget).toEqual({
      kind: 'detail',
      brandId: 'clxbrand0003',
    });
  });

  it('navigates to empty when the only brand is deleted', async () => {
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
    const { result } = renderHook(
      () => useBrandGuidelinesDetail({ brandId: 'clxbrand0001' }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.uiModel.status).toBe('ready'));
    act(() => result.current.handleDeleted('clxbrand0001'));
    expect(result.current.navigationTarget).toEqual({ kind: 'empty' });
  });

  it('navigates to the first remaining brand when one of several is deleted', async () => {
    fetchBrandsMock.mockResolvedValueOnce([
      {
        id: 'clxbrand0001',
        name: 'Alpha',
        slug: 'alpha',
        ownerUserId: 'subject-admin',
        createdAt: '2026-05-17T01:00:00.000Z',
        updatedAt: '2026-05-17T01:00:00.000Z',
        deletedAt: null,
      },
      {
        id: 'clxbrand0002',
        name: 'Beta',
        slug: 'beta',
        ownerUserId: 'subject-admin',
        createdAt: '2026-05-17T00:00:00.000Z',
        updatedAt: '2026-05-17T00:00:00.000Z',
        deletedAt: null,
      },
    ]);
    const { result } = renderHook(
      () => useBrandGuidelinesDetail({ brandId: 'clxbrand0001' }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.uiModel.status).toBe('ready'));
    act(() => result.current.handleDeleted('clxbrand0001'));
    expect(result.current.navigationTarget).toEqual({
      kind: 'detail',
      brandId: 'clxbrand0002',
    });
  });

  it('handleRenamed does not navigate', async () => {
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
    const { result } = renderHook(
      () => useBrandGuidelinesDetail({ brandId: 'clxbrand0001' }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.uiModel.status).toBe('ready'));
    act(() =>
      result.current.handleRenamed({
        id: 'clxbrand0001',
        name: 'Renamed',
        slug: 'renamed',
        ownerUserId: 'subject-admin',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      }),
    );
    expect(result.current.navigationTarget).toBeNull();
  });

  it('clearNavigationTarget resets the navigation target', async () => {
    fetchBrandsMock.mockResolvedValueOnce([]);
    const { result } = renderHook(
      () => useBrandGuidelinesDetail({ brandId: 'x' }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.uiModel.status).toBe('not-found'));
    act(() => result.current.handleSelectBrand('clxbrand0099'));
    expect(result.current.navigationTarget).not.toBeNull();
    act(() => result.current.clearNavigationTarget());
    expect(result.current.navigationTarget).toBeNull();
  });
});
