import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { ReactNode } from 'react';

vi.mock('../../remote/upsert-visual-identity', () => ({
  upsertVisualIdentity: vi.fn(),
}));

import { upsertVisualIdentity } from '../../remote/upsert-visual-identity';
import { visualIdentityQueryKey } from '../../../constants';
import { useUpsertVisualIdentityMutation } from '../use-upsert-visual-identity-mutation';

function withClient(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }): ReactNode {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const POPULATED_RESPONSE = {
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
};

describe('useUpsertVisualIdentityMutation', () => {
  beforeEach(() => {
    (upsertVisualIdentity as unknown as Mock).mockReset();
  });

  it('invokes the remote with the bound brand id and payload', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    (upsertVisualIdentity as unknown as Mock).mockResolvedValueOnce(POPULATED_RESPONSE);

    const { result } = renderHook(() => useUpsertVisualIdentityMutation('brand-1'), {
      wrapper: withClient(client),
    });

    let returned: { brandId?: string } | null | undefined;
    await act(async () => {
      returned = await result.current.mutateAsync({
        logoUsageRules: 'Clear space.',
      } as never);
    });

    expect(upsertVisualIdentity).toHaveBeenCalledWith({
      brandId: 'brand-1',
      payload: { logoUsageRules: 'Clear space.' },
    });
    expect(returned?.brandId).toBe('brand-1');
  });

  it('invalidates the visual-identity query and the brands list on settle', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const spy = vi.spyOn(client, 'invalidateQueries');
    (upsertVisualIdentity as unknown as Mock).mockResolvedValueOnce(POPULATED_RESPONSE);

    const { result } = renderHook(() => useUpsertVisualIdentityMutation('brand-1'), {
      wrapper: withClient(client),
    });

    await act(async () => {
      await result.current.mutateAsync({} as never);
    });

    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith({
        queryKey: visualIdentityQueryKey('brand-1'),
        exact: true,
      }),
    );
    expect(spy).toHaveBeenCalledWith({ queryKey: ['brands'] });
  });

  it('propagates the upsert error', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    (upsertVisualIdentity as unknown as Mock).mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useUpsertVisualIdentityMutation('brand-1'), {
      wrapper: withClient(client),
    });
    await expect(result.current.mutateAsync({} as never)).rejects.toThrow('boom');
  });
});
