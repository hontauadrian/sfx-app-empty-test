import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { ReactNode } from 'react';

vi.mock('../../remote/upsert-brand-voice', () => ({
  upsertBrandVoice: vi.fn(),
}));

import { upsertBrandVoice } from '../../remote/upsert-brand-voice';
import { brandVoiceQueryKey } from '../../../constants';
import { useUpsertBrandVoiceMutation } from '../use-upsert-brand-voice-mutation';

function withClient(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }): ReactNode {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe('useUpsertBrandVoiceMutation', () => {
  beforeEach(() => {
    (upsertBrandVoice as unknown as Mock).mockReset();
  });

  it('invokes the remote with the bound brand id and the payload', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    (upsertBrandVoice as unknown as Mock).mockResolvedValueOnce({
      brandProfileId: 'brand-1',
      toneOfVoice: 'Warm.',
      preferredVocabulary: [],
      restrictedVocabulary: [],
      messagingPillars: [],
      writingStyleRules: [],
      audienceRules: [],
      approvedExamplePhrases: [],
      rejectedExamplePhrases: [],
      createdAt: null,
      updatedAt: null,
    });

    const { result } = renderHook(() => useUpsertBrandVoiceMutation('brand-1'), {
      wrapper: withClient(client),
    });

    let returned: { brandProfileId?: string } | undefined;
    await act(async () => {
      returned = await result.current.mutateAsync({ toneOfVoice: 'Warm.' } as never);
    });

    expect(upsertBrandVoice).toHaveBeenCalledWith({
      brandId: 'brand-1',
      payload: { toneOfVoice: 'Warm.' },
    });
    expect(returned?.brandProfileId).toBe('brand-1');
  });

  it('invalidates the brand-voice query exactly on settle', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const spy = vi.spyOn(client, 'invalidateQueries');
    (upsertBrandVoice as unknown as Mock).mockResolvedValueOnce({
      brandProfileId: 'brand-1',
      toneOfVoice: null,
      preferredVocabulary: [],
      restrictedVocabulary: [],
      messagingPillars: [],
      writingStyleRules: [],
      audienceRules: [],
      approvedExamplePhrases: [],
      rejectedExamplePhrases: [],
      createdAt: null,
      updatedAt: null,
    });

    const { result } = renderHook(() => useUpsertBrandVoiceMutation('brand-1'), {
      wrapper: withClient(client),
    });

    await act(async () => {
      await result.current.mutateAsync({} as never);
    });

    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith({
        queryKey: brandVoiceQueryKey('brand-1'),
        exact: true,
      }),
    );
  });

  it('propagates the upsert error', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    (upsertBrandVoice as unknown as Mock).mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useUpsertBrandVoiceMutation('brand-1'), {
      wrapper: withClient(client),
    });
    await expect(result.current.mutateAsync({} as never)).rejects.toThrow('boom');
  });
});
