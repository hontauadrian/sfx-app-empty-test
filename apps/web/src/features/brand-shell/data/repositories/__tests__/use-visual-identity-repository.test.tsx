import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('../../remote/fetch-visual-identity', () => ({
  fetchVisualIdentity: vi.fn(),
}));
vi.mock('../../remote/update-visual-identity', () => ({
  updateVisualIdentity: vi.fn(),
}));

import { fetchVisualIdentity } from '../../remote/fetch-visual-identity';
import { updateVisualIdentity } from '../../remote/update-visual-identity';
import { useVisualIdentityRepository } from '../use-visual-identity-repository';
import { visualIdentityQueryKey } from '../../../constants';
import type { VisualIdentityDataModel } from '../../model/visual-identity-data-model';

const fetchMock = vi.mocked(fetchVisualIdentity);
const updateMock = vi.mocked(updateVisualIdentity);

function dto(over: Partial<VisualIdentityDataModel> = {}): VisualIdentityDataModel {
  return {
    brandId: 'clxbrand0001',
    logoUsage: 'Default',
    colorPalette: [],
    typography: [],
    spacingGuidance: '',
    imageStyleGuidance: '',
    iconographyGuidance: '',
    usageRestrictions: '',
    createdAt: '2026-05-17T00:00:00.000Z',
    updatedAt: '2026-05-17T00:00:00.000Z',
    ...over,
  };
}

function wrapperFactory(client: QueryClient): (props: { children: ReactNode }) => ReactNode {
  return function Wrapper({ children }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function newClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
}

describe('useVisualIdentityRepository', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    updateMock.mockReset();
  });
  afterEach(() => vi.restoreAllMocks());

  it('maps fetched dto to domain entity', async () => {
    fetchMock.mockResolvedValueOnce(dto({ logoUsage: 'Mono' }));
    const client = newClient();
    const { result } = renderHook(() => useVisualIdentityRepository('clxbrand0001'), {
      wrapper: wrapperFactory(client),
    });
    await waitFor(() => expect(result.current.visualQuery.isSuccess).toBe(true));
    expect(result.current.visualQuery.data?.logoUsage).toBe('Mono');
    expect(result.current.visualQuery.data?.createdAt).toBeInstanceOf(Date);
  });

  it('exposes null when api returns null', async () => {
    fetchMock.mockResolvedValueOnce(null);
    const client = newClient();
    const { result } = renderHook(() => useVisualIdentityRepository('clxbrand0001'), {
      wrapper: wrapperFactory(client),
    });
    await waitFor(() => expect(result.current.visualQuery.isSuccess).toBe(true));
    expect(result.current.visualQuery.data).toBeNull();
  });

  it('mutation updates cache on success', async () => {
    fetchMock.mockResolvedValueOnce(null);
    updateMock.mockResolvedValueOnce(dto());
    const client = newClient();
    const { result } = renderHook(() => useVisualIdentityRepository('clxbrand0001'), {
      wrapper: wrapperFactory(client),
    });
    await waitFor(() => expect(result.current.visualQuery.isSuccess).toBe(true));
    await act(async () => {
      await result.current.updateMutation.mutateAsync({ logoUsage: 'Default' });
    });
    expect(client.getQueryData(visualIdentityQueryKey('clxbrand0001'))).toBeDefined();
  });
});
