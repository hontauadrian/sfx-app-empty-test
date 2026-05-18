import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('../../remote/fetch-brand-voice', () => ({
  fetchBrandVoice: vi.fn(),
}));
vi.mock('../../remote/update-brand-voice', () => ({
  updateBrandVoice: vi.fn(),
}));

import { fetchBrandVoice } from '../../remote/fetch-brand-voice';
import { updateBrandVoice } from '../../remote/update-brand-voice';
import { useBrandVoiceRepository } from '../use-brand-voice-repository';
import { brandVoiceQueryKey } from '../../../constants';
import type { BrandVoiceDataModel } from '../../model/brand-voice-data-model';

const fetchMock = vi.mocked(fetchBrandVoice);
const updateMock = vi.mocked(updateBrandVoice);

function dto(over: Partial<BrandVoiceDataModel> = {}): BrandVoiceDataModel {
  return {
    brandId: 'clxbrand0001',
    tone: 'Bold',
    preferredVocabulary: [],
    restrictedVocabulary: [],
    messagingPillars: [],
    writingStyleRules: '',
    audienceRules: [],
    approvedExamples: [],
    rejectedExamples: [],
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

describe('useBrandVoiceRepository', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    updateMock.mockReset();
  });
  afterEach(() => vi.restoreAllMocks());

  it('maps fetched dto to domain entity', async () => {
    fetchMock.mockResolvedValueOnce(dto({ tone: 'Confident' }));
    const client = newClient();
    const { result } = renderHook(() => useBrandVoiceRepository('clxbrand0001'), {
      wrapper: wrapperFactory(client),
    });
    await waitFor(() => expect(result.current.voiceQuery.isSuccess).toBe(true));
    expect(result.current.voiceQuery.data?.tone).toBe('Confident');
    expect(result.current.voiceQuery.data?.createdAt).toBeInstanceOf(Date);
  });

  it('exposes null when api returns null', async () => {
    fetchMock.mockResolvedValueOnce(null);
    const client = newClient();
    const { result } = renderHook(() => useBrandVoiceRepository('clxbrand0001'), {
      wrapper: wrapperFactory(client),
    });
    await waitFor(() => expect(result.current.voiceQuery.isSuccess).toBe(true));
    expect(result.current.voiceQuery.data).toBeNull();
  });

  it('exposes error state when api throws', async () => {
    fetchMock.mockRejectedValueOnce(new Error('boom'));
    const client = newClient();
    const { result } = renderHook(() => useBrandVoiceRepository('clxbrand0001'), {
      wrapper: wrapperFactory(client),
    });
    await waitFor(() => expect(result.current.voiceQuery.isError).toBe(true));
  });

  it('mutation updates cache on success', async () => {
    fetchMock.mockResolvedValueOnce(null);
    updateMock.mockResolvedValueOnce(dto({ tone: 'Confident' }));
    const client = newClient();
    const { result } = renderHook(() => useBrandVoiceRepository('clxbrand0001'), {
      wrapper: wrapperFactory(client),
    });
    await waitFor(() => expect(result.current.voiceQuery.isSuccess).toBe(true));
    await act(async () => {
      await result.current.updateMutation.mutateAsync({ tone: 'Confident' });
    });
    const cached = client.getQueryData(brandVoiceQueryKey('clxbrand0001'));
    expect(cached).toBeDefined();
  });
});
