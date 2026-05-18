import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/features/presentation/localization', () => ({
  useTranslations: vi.fn(),
}));
vi.mock('@/features/presentation/toast/use-toast', () => ({
  useToast: vi.fn(),
}));
vi.mock('../../../../data/remote/fetch-brand-voice', () => ({
  fetchBrandVoice: vi.fn(),
}));
vi.mock('../../../../data/remote/update-brand-voice', () => ({
  updateBrandVoice: vi.fn(),
}));

import { useTranslations } from '@/features/presentation/localization';
import { useToast } from '@/features/presentation/toast/use-toast';
import { fetchBrandVoice } from '../../../../data/remote/fetch-brand-voice';
import { updateBrandVoice } from '../../../../data/remote/update-brand-voice';
import { useBrandVoiceForm } from '../use-brand-voice-form';

const useTranslationsMock = vi.mocked(useTranslations);
const useToastMock = vi.mocked(useToast);
const fetchMock = vi.mocked(fetchBrandVoice);
const updateMock = vi.mocked(updateBrandVoice);

const voiceTranslations = {
  pageTitle: 'Brand Voice',
  sections: {
    tone: 'Tone',
    preferredVocabulary: 'Pref',
    restrictedVocabulary: 'Rest',
    messagingPillars: 'Pillars',
    writingStyle: 'Style',
    audienceRules: 'Audience',
    approvedExamples: 'Approved',
    rejectedExamples: 'Rejected',
  },
  fields: {
    tone: { label: 'Tone' },
    preferredVocabulary: { label: 'Pref' },
    restrictedVocabulary: { label: 'Rest' },
    messagingPillarTitle: { label: 'Title' },
    messagingPillarDescription: { label: 'Description' },
    writingStyleRules: { label: 'Rules' },
    audienceRulesAudience: { label: 'Audience' },
    audienceRulesRules: { label: 'Rules' },
    approvedExamplePhrase: { label: 'Phrase' },
    rejectedExamplePhrase: { label: 'Phrase' },
    rejectedExampleReason: { label: 'Reason' },
  },
  cta: {
    save: 'Save',
    saving: 'Saving',
    addPreferred: '+P',
    removePreferred: '-P',
    addRestricted: '+R',
    removeRestricted: '-R',
    addPillar: '+Pi',
    removePillar: '-Pi',
    addAudienceRule: '+A',
    removeAudienceRule: '-A',
    addApprovedExample: '+Ap',
    removeApprovedExample: '-Ap',
    addRejectedExample: '+Rj',
    removeRejectedExample: '-Rj',
  },
  toast: { success: 'Voice saved', error: 'Voice failed' },
};

beforeEach(() => {
  useTranslationsMock.mockReturnValue({
    adminBrandGuidelines: { voice: voiceTranslations },
  } as unknown as ReturnType<typeof useTranslations>);
  useToastMock.mockReturnValue({
    success: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn(),
  } as unknown as ReturnType<typeof useToast>);
  fetchMock.mockReset();
  updateMock.mockReset();
});

afterEach(() => vi.restoreAllMocks());

function newClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
}

function makeWrapper(client: QueryClient): (props: { children: ReactNode }) => ReactNode {
  return function Wrapper({ children }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe('useBrandVoiceForm', () => {
  it('starts in loading status while the query is in flight', () => {
    fetchMock.mockImplementation(() => new Promise(() => undefined));
    const client = newClient();
    const { result } = renderHook(() => useBrandVoiceForm('clxbrand0001'), {
      wrapper: makeWrapper(client),
    });
    expect(result.current.uiModel.status).toBe('loading');
    expect(result.current.uiModel.submitDisabled).toBe(true);
  });

  it('resets the form to the persisted voice when the query resolves', async () => {
    fetchMock.mockResolvedValueOnce({
      brandId: 'clxbrand0001',
      tone: 'Bold',
      preferredVocabulary: ['craft'],
      restrictedVocabulary: [],
      messagingPillars: [],
      writingStyleRules: '',
      audienceRules: [],
      approvedExamples: [],
      rejectedExamples: [],
      createdAt: '2026-05-17T00:00:00.000Z',
      updatedAt: '2026-05-17T00:00:00.000Z',
    });
    const client = newClient();
    const { result } = renderHook(() => useBrandVoiceForm('clxbrand0001'), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() =>
      expect(result.current.form.getValues('tone')).toBe('Bold'),
    );
  });

  it('rejects empty tone client-side before calling update', async () => {
    fetchMock.mockResolvedValueOnce(null);
    const client = newClient();
    const { result } = renderHook(() => useBrandVoiceForm('clxbrand0001'), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() => expect(result.current.uiModel.status).toBe('ready'));
    await act(async () => {
      await result.current.handleSubmit();
    });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('calls update + emits success toast when submit succeeds', async () => {
    fetchMock.mockResolvedValueOnce(null);
    updateMock.mockResolvedValueOnce({
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
      updatedAt: '2026-05-17T01:00:00.000Z',
    });
    const successFn = vi.fn();
    useToastMock.mockReturnValue({
      success: successFn,
      error: vi.fn(),
      dismiss: vi.fn(),
    } as unknown as ReturnType<typeof useToast>);
    const client = newClient();
    const { result } = renderHook(() => useBrandVoiceForm('clxbrand0001'), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() => expect(result.current.uiModel.status).toBe('ready'));
    act(() => {
      result.current.form.setValue('tone', 'Bold');
    });
    await act(async () => {
      await result.current.handleSubmit();
    });
    expect(updateMock).toHaveBeenCalled();
    expect(successFn).toHaveBeenCalledWith('Voice saved');
  });

  it('surfaces a generic form error on unrecognised update failure', async () => {
    fetchMock.mockResolvedValueOnce(null);
    updateMock.mockRejectedValueOnce(new Error('boom'));
    const client = newClient();
    const { result } = renderHook(() => useBrandVoiceForm('clxbrand0001'), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() => expect(result.current.uiModel.status).toBe('ready'));
    act(() => result.current.form.setValue('tone', 'Bold'));
    await act(async () => {
      await result.current.handleSubmit();
    });
    expect(result.current.uiModel.formError).toBe('Voice failed');
  });
});
