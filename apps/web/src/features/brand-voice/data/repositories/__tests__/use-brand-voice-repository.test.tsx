import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { ReactNode } from 'react';

vi.mock('../../remote/fetch-brand-voice', () => ({
  fetchBrandVoice: vi.fn(),
}));

import { fetchBrandVoice } from '../../remote/fetch-brand-voice';
import { useBrandVoiceRepository } from '../use-brand-voice-repository';

function createWrapper(): (args: { children: ReactNode }) => ReactNode {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }): ReactNode {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe('useBrandVoiceRepository', () => {
  beforeEach(() => {
    (fetchBrandVoice as unknown as Mock).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the voice mapped to domain shape when the id is provided', async () => {
    (fetchBrandVoice as unknown as Mock).mockResolvedValueOnce({
      brandProfileId: 'brand-1',
      toneOfVoice: 'Warm.',
      preferredVocabulary: ['craft'],
      restrictedVocabulary: [],
      messagingPillars: [],
      writingStyleRules: [],
      audienceRules: [{ audience: 'Gen Z', rule: 'Peer.' }],
      approvedExamplePhrases: [],
      rejectedExamplePhrases: [],
      createdAt: '2026-05-15T00:00:00.000Z',
      updatedAt: '2026-05-15T00:00:00.000Z',
    });

    const { result } = renderHook(() => useBrandVoiceRepository('brand-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.brandProfileId).toBe('brand-1');
    expect(result.current.data?.createdAt).toBeInstanceOf(Date);
    expect(fetchBrandVoice).toHaveBeenCalledWith('brand-1');
  });

  it('does not call the remote when the id is null', () => {
    renderHook(() => useBrandVoiceRepository(null), {
      wrapper: createWrapper(),
    });
    expect(fetchBrandVoice).not.toHaveBeenCalled();
  });
});
