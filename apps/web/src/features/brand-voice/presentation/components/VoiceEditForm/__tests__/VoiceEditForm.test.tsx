import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { common as enCommon } from '@/features/presentation/localization/languages/en/common';
import { VoiceEditForm } from '../index';
import type { BrandVoiceFormValues } from '../../../validators/brand-voice-form';

function emptyDefaults(): BrandVoiceFormValues {
  return {
    toneOfVoice: null,
    preferredVocabulary: [],
    restrictedVocabulary: [],
    messagingPillars: [],
    writingStyleRules: [],
    audienceRules: [],
    approvedExamplePhrases: [],
    rejectedExamplePhrases: [],
  } as BrandVoiceFormValues;
}

describe('VoiceEditForm', () => {
  it('renders all eight field sections', () => {
    render(
      <VoiceEditForm
        defaultValues={emptyDefaults()}
        translations={enCommon}
        isSubmitting={false}
        serverError={null}
        saveLabel="Save"
        cancelLabel="Cancel"
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText(enCommon.brandVoiceToneOfVoiceLabel)).toBeInTheDocument();
    expect(
      screen.getByText(enCommon.brandVoicePreferredVocabularyLabel),
    ).toBeInTheDocument();
    expect(
      screen.getByText(enCommon.brandVoiceRestrictedVocabularyLabel),
    ).toBeInTheDocument();
    expect(
      screen.getByText(enCommon.brandVoiceMessagingPillarsLabel),
    ).toBeInTheDocument();
    expect(
      screen.getByText(enCommon.brandVoiceWritingStyleRulesLabel),
    ).toBeInTheDocument();
    expect(screen.getByText(enCommon.brandVoiceAudienceRulesLabel)).toBeInTheDocument();
    expect(
      screen.getByText(enCommon.brandVoiceApprovedPhrasesLabel),
    ).toBeInTheDocument();
    expect(
      screen.getByText(enCommon.brandVoiceRejectedPhrasesLabel),
    ).toBeInTheDocument();
  });

  it('invokes onSubmit when the form is valid', async () => {
    const onSubmit = vi.fn();
    render(
      <VoiceEditForm
        defaultValues={emptyDefaults()}
        translations={enCommon}
        isSubmitting={false}
        serverError={null}
        saveLabel="Save"
        cancelLabel="Cancel"
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  });

  it('invokes onCancel when the cancel button is clicked', () => {
    const onCancel = vi.fn();
    render(
      <VoiceEditForm
        defaultValues={emptyDefaults()}
        translations={enCommon}
        isSubmitting={false}
        serverError={null}
        saveLabel="Save"
        cancelLabel="Cancel"
        onSubmit={vi.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('renders the server error message', () => {
    render(
      <VoiceEditForm
        defaultValues={emptyDefaults()}
        translations={enCommon}
        isSubmitting={false}
        serverError="boom"
        saveLabel="Save"
        cancelLabel="Cancel"
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText('boom')).toBeInTheDocument();
  });

  it('disables the save button while submitting', () => {
    render(
      <VoiceEditForm
        defaultValues={emptyDefaults()}
        translations={enCommon}
        isSubmitting
        serverError={null}
        saveLabel="Save"
        cancelLabel="Cancel"
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });
});
