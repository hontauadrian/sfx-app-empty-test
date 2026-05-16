import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { ReactNode } from 'react';

vi.mock('../../remote/fetch-visual-identity', () => ({
  fetchVisualIdentity: vi.fn(),
}));

import { fetchVisualIdentity } from '../../remote/fetch-visual-identity';
import { useVisualIdentityRepository } from '../use-visual-identity-repository';

function createWrapper(): (args: { children: ReactNode }) => ReactNode {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }): ReactNode {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe('useVisualIdentityRepository', () => {
  beforeEach(() => {
    (fetchVisualIdentity as unknown as Mock).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the visual-identity mapped to domain shape when populated', async () => {
    (fetchVisualIdentity as unknown as Mock).mockResolvedValueOnce({
      id: 'vi-1',
      brandId: 'brand-1',
      logoUsageRules: 'Clear space.',
      colourPalette: [],
      typographyRules: [],
      spacingLayoutGuidance: null,
      imageStyleGuidance: null,
      iconographyGuidance: null,
      usageRestrictions: null,
      createdAt: '2026-05-15T00:00:00.000Z',
      updatedAt: '2026-05-15T00:00:00.000Z',
    });

    const { result } = renderHook(() => useVisualIdentityRepository('brand-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.brandId).toBe('brand-1');
    expect(result.current.data?.createdAt).toBeInstanceOf(Date);
    expect(fetchVisualIdentity).toHaveBeenCalledWith('brand-1');
  });

  it('returns null when the envelope id is the empty sentinel', async () => {
    (fetchVisualIdentity as unknown as Mock).mockResolvedValueOnce({
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
    });

    const { result } = renderHook(() => useVisualIdentityRepository('brand-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('does not call the remote when the id is null', () => {
    renderHook(() => useVisualIdentityRepository(null), {
      wrapper: createWrapper(),
    });
    expect(fetchVisualIdentity).not.toHaveBeenCalled();
  });
});
