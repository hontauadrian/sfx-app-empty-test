import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { ReactNode } from 'react';

vi.mock('../../../../data/remote/fetch-brand-voice', () => ({
  fetchBrandVoice: vi.fn(),
}));
vi.mock('../../../../data/remote/upsert-brand-voice', () => ({
  upsertBrandVoice: vi.fn(),
}));

import { fetchBrandVoice } from '../../../../data/remote/fetch-brand-voice';
import { upsertBrandVoice } from '../../../../data/remote/upsert-brand-voice';
import { LanguageProvider } from '@/features/presentation/localization';
import { useVoiceEdit } from '../use-voice-edit';

function withClient(): (args: { children: ReactNode }) => ReactNode {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }): ReactNode {
    return (
      <QueryClientProvider client={client}>
        <LanguageProvider>{children}</LanguageProvider>
      </QueryClientProvider>
    );
  };
}

const emptyVoicePayload = {
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
};

describe('useVoiceEdit', () => {
  beforeEach(() => {
    (fetchBrandVoice as unknown as Mock).mockReset();
    (upsertBrandVoice as unknown as Mock).mockReset();
  });

  it('exposes loading state until the query settles', async () => {
    (fetchBrandVoice as unknown as Mock).mockResolvedValueOnce(emptyVoicePayload);
    const { result } = renderHook(() => useVoiceEdit('brand-1'), {
      wrapper: withClient(),
    });
    expect(result.current.uiModel.isLoading).toBe(true);
    await waitFor(() => expect(result.current.uiModel.isLoading).toBe(false));
    expect(result.current.uiModel.notFound).toBe(false);
  });

  it('sets navigationTarget=saved after a successful submit', async () => {
    (fetchBrandVoice as unknown as Mock).mockResolvedValueOnce(emptyVoicePayload);
    (upsertBrandVoice as unknown as Mock).mockResolvedValueOnce(emptyVoicePayload);
    const { result } = renderHook(() => useVoiceEdit('brand-1'), {
      wrapper: withClient(),
    });
    await waitFor(() => expect(result.current.uiModel.isLoading).toBe(false));

    await act(async () => {
      await result.current.handleSubmit({ toneOfVoice: 'Warm.' } as never);
    });

    expect(result.current.navigationTarget).toBe('saved');
    expect(result.current.uiModel.serverErrorLabel).toBeNull();
  });

  it('surfaces a server error and does not navigate on submit failure', async () => {
    (fetchBrandVoice as unknown as Mock).mockResolvedValueOnce(emptyVoicePayload);
    (upsertBrandVoice as unknown as Mock).mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useVoiceEdit('brand-1'), {
      wrapper: withClient(),
    });
    await waitFor(() => expect(result.current.uiModel.isLoading).toBe(false));

    await act(async () => {
      await result.current.handleSubmit({} as never);
    });

    expect(result.current.navigationTarget).toBeNull();
    expect(result.current.uiModel.serverErrorLabel).toBe('boom');
  });

  it('handleCancel sets navigationTarget=cancel', async () => {
    (fetchBrandVoice as unknown as Mock).mockResolvedValueOnce(emptyVoicePayload);
    const { result } = renderHook(() => useVoiceEdit('brand-1'), {
      wrapper: withClient(),
    });
    await waitFor(() => expect(result.current.uiModel.isLoading).toBe(false));

    act(() => result.current.handleCancel());
    expect(result.current.navigationTarget).toBe('cancel');
  });

  it('clearNavigationTarget resets the target to null', async () => {
    (fetchBrandVoice as unknown as Mock).mockResolvedValueOnce(emptyVoicePayload);
    const { result } = renderHook(() => useVoiceEdit('brand-1'), {
      wrapper: withClient(),
    });
    await waitFor(() => expect(result.current.uiModel.isLoading).toBe(false));

    act(() => result.current.handleCancel());
    expect(result.current.navigationTarget).toBe('cancel');
    act(() => result.current.clearNavigationTarget());
    expect(result.current.navigationTarget).toBeNull();
  });

  it('reports notFound when the fetch returns a 404-shaped error', async () => {
    const error = Object.assign(new Error('not found'), { status: 404 });
    (fetchBrandVoice as unknown as Mock).mockRejectedValueOnce(error);
    const { result } = renderHook(() => useVoiceEdit('brand-1'), {
      wrapper: withClient(),
    });
    await waitFor(() => expect(result.current.uiModel.notFound).toBe(true));
    expect(result.current.uiModel.hasError).toBe(false);
  });

  it('reports hasError when the fetch fails with a non-404 error', async () => {
    (fetchBrandVoice as unknown as Mock).mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useVoiceEdit('brand-1'), {
      wrapper: withClient(),
    });
    await waitFor(() => expect(result.current.uiModel.hasError).toBe(true));
    expect(result.current.uiModel.notFound).toBe(false);
  });
});
