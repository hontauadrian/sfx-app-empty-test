import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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
import { BrandVoiceForm } from '..';

const useTranslationsMock = vi.mocked(useTranslations);
const useToastMock = vi.mocked(useToast);
const fetchMock = vi.mocked(fetchBrandVoice);

const voiceTranslations = {
  pageTitle: 'Brand Voice',
  sections: {
    tone: 'Tone',
    preferredVocabulary: 'Preferred',
    restrictedVocabulary: 'Restricted',
    messagingPillars: 'Pillars',
    writingStyle: 'Style',
    audienceRules: 'Audience',
    approvedExamples: 'Approved',
    rejectedExamples: 'Rejected',
  },
  fields: {
    tone: { label: 'Tone' },
    preferredVocabulary: { label: 'Preferred term' },
    restrictedVocabulary: { label: 'Restricted term' },
    messagingPillarTitle: { label: 'Pillar title' },
    messagingPillarDescription: { label: 'Pillar description' },
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

function newClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
}

function Wrapper({ children }: { children: ReactNode }): ReactNode {
  return <QueryClientProvider client={newClient()}>{children}</QueryClientProvider>;
}

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
});

afterEach(() => vi.restoreAllMocks());

describe('BrandVoiceForm fields', () => {
  it('renders the full form fieldset hierarchy when ready', async () => {
    fetchMock.mockResolvedValueOnce(null);
    render(<BrandVoiceForm brandId="clxbrand0001" />, { wrapper: Wrapper });
    await waitFor(() =>
      expect(screen.getByTestId('brand-voice-form')).toBeInTheDocument(),
    );
    expect(screen.getByRole('heading', { name: 'Brand Voice' })).toBeInTheDocument();
    expect(screen.getAllByText('Tone').length).toBeGreaterThan(0);
    expect(screen.getByText('Preferred')).toBeInTheDocument();
    expect(screen.getByText('Pillars')).toBeInTheDocument();
    expect(screen.getAllByText('Audience').length).toBeGreaterThan(0);
    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(screen.getByText('Rejected')).toBeInTheDocument();
  });

  it('add/remove on preferred vocabulary adds and removes input rows', async () => {
    fetchMock.mockResolvedValueOnce(null);
    render(<BrandVoiceForm brandId="clxbrand0001" />, { wrapper: Wrapper });
    await waitFor(() =>
      expect(screen.getByTestId('brand-voice-form')).toBeInTheDocument(),
    );
    const addButton = screen.getByRole('button', { name: '+P' });
    fireEvent.click(addButton);
    fireEvent.click(addButton);
    expect(screen.getByLabelText('Preferred term 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Preferred term 2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '-P 2' }));
    await waitFor(() =>
      expect(screen.queryByLabelText('Preferred term 2')).not.toBeInTheDocument(),
    );
  });

  it('add pillar produces title + description inputs and remove deletes the row', async () => {
    fetchMock.mockResolvedValueOnce(null);
    render(<BrandVoiceForm brandId="clxbrand0001" />, { wrapper: Wrapper });
    await waitFor(() =>
      expect(screen.getByTestId('brand-voice-form')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: '+Pi' }));
    expect(screen.getByLabelText('Pillar title 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Pillar description 1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '-Pi 1' }));
    await waitFor(() =>
      expect(screen.queryByLabelText('Pillar title 1')).not.toBeInTheDocument(),
    );
  });

  it('add audience rule produces audience + rules inputs', async () => {
    fetchMock.mockResolvedValueOnce(null);
    render(<BrandVoiceForm brandId="clxbrand0001" />, { wrapper: Wrapper });
    await waitFor(() =>
      expect(screen.getByTestId('brand-voice-form')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: '+A' }));
    expect(screen.getByLabelText('Audience 1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '-A 1' }));
    await waitFor(() =>
      expect(screen.queryByLabelText('Audience 1')).not.toBeInTheDocument(),
    );
  });

  it('add approved/rejected example produces phrase inputs and removes them', async () => {
    fetchMock.mockResolvedValueOnce(null);
    render(<BrandVoiceForm brandId="clxbrand0001" />, { wrapper: Wrapper });
    await waitFor(() =>
      expect(screen.getByTestId('brand-voice-form')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: '+Ap' }));
    fireEvent.click(screen.getByRole('button', { name: '+Rj' }));
    expect(within(screen.getByText('Approved').parentElement as HTMLElement).getByLabelText('Phrase 1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '-Ap 1' }));
    fireEvent.click(screen.getByRole('button', { name: '-Rj 1' }));
  });

  it('hydrates the form when a persisted voice is fetched', async () => {
    fetchMock.mockResolvedValueOnce({
      brandId: 'clxbrand0001',
      tone: 'Bold',
      preferredVocabulary: ['craft'],
      restrictedVocabulary: ['cheap'],
      messagingPillars: [{ title: 'Trust', description: 'We deliver.' }],
      writingStyleRules: 'Short.',
      audienceRules: [{ audience: 'Buyers', rules: 'Lead with value.' }],
      approvedExamples: [{ phrase: 'Partner.' }],
      rejectedExamples: [{ phrase: 'No.', reason: 'Negative.' }],
      createdAt: '2026-05-17T00:00:00.000Z',
      updatedAt: '2026-05-17T00:00:00.000Z',
    });
    render(<BrandVoiceForm brandId="clxbrand0001" />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByDisplayValue('Bold')).toBeInTheDocument());
    expect(screen.getByDisplayValue('craft')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Trust')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Buyers')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Partner.')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Negative.')).toBeInTheDocument();
  });
});
