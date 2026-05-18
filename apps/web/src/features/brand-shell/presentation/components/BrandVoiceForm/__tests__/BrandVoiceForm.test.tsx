import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { LanguageProvider } from '@/features/presentation/localization/language-provider';

vi.mock('../use-brand-voice-form', () => ({
  useBrandVoiceForm: vi.fn(),
}));

import { useBrandVoiceForm } from '../use-brand-voice-form';
import { BrandVoiceForm } from '..';
import type { UpsertBrandVoiceInput } from '@sfx/domain';

function renderWithProviders(node: ReactNode): void {
  render(<LanguageProvider>{node}</LanguageProvider>);
}

const useBrandVoiceFormMock = vi.mocked(useBrandVoiceForm);

function readyUiModel(): ReturnType<typeof useBrandVoiceForm>['uiModel'] {
  return {
    status: 'ready',
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
      addPreferred: '+ Add preferred',
      removePreferred: '- Remove',
      addRestricted: '+ Add restricted',
      removeRestricted: '- Remove',
      addPillar: '+ Add pillar',
      removePillar: '- Remove pillar',
      addAudienceRule: '+ Add audience',
      removeAudienceRule: '- Remove audience',
      addApprovedExample: '+ Add approved',
      removeApprovedExample: '- Remove approved',
      addRejectedExample: '+ Add rejected',
      removeRejectedExample: '- Remove rejected',
    },
    submitLabel: 'Save',
    isSubmitting: false,
    submitDisabled: false,
    formError: null,
  };
}

function mockReady(overrides?: { formError?: string | null; status?: 'loading' | 'ready' }): void {
  useBrandVoiceFormMock.mockImplementation((): ReturnType<typeof useBrandVoiceForm> => {
    const form = useForm<UpsertBrandVoiceInput>({
      defaultValues: {
        tone: '',
        preferredVocabulary: [],
        restrictedVocabulary: [],
        messagingPillars: [],
        writingStyleRules: '',
        audienceRules: [],
        approvedExamples: [],
        rejectedExamples: [],
      },
    });
    return {
      uiModel: { ...readyUiModel(), ...overrides },
      form,
      handleSubmit: async (): Promise<void> => {},
    };
  });
}

beforeEach(() => {
  useBrandVoiceFormMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('BrandVoiceForm', () => {
  it('shows the skeleton when status is loading', () => {
    mockReady({ status: 'loading' });
    renderWithProviders(<BrandVoiceForm brandId="clxbrand0001" />);
    expect(screen.getByTestId('brand-voice-form-loading')).toBeInTheDocument();
  });

  it('renders the form with submit CTA when ready', () => {
    mockReady();
    renderWithProviders(<BrandVoiceForm brandId="clxbrand0001" />);
    expect(screen.getByRole('heading', { name: 'Brand Voice' })).toBeInTheDocument();
    expect(screen.getByTestId('brand-voice-submit')).toHaveTextContent('Save');
  });

  it('renders the formError alert when supplied', () => {
    mockReady({ formError: 'broken' });
    renderWithProviders(<BrandVoiceForm brandId="clxbrand0001" />);
    expect(screen.getByRole('alert')).toHaveTextContent('broken');
  });
});
