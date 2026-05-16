import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { common as enCommon } from '@/features/presentation/localization/languages/en/common';
import { VoiceEditForm } from '../index';
import type { BrandVoiceFormValues } from '../../../validators/brand-voice-form';

function buildDefaults(): BrandVoiceFormValues {
  return {
    toneOfVoice: 'a'.repeat(5000),
    preferredVocabulary: [],
    restrictedVocabulary: [],
    messagingPillars: [],
    writingStyleRules: [],
    audienceRules: [],
    approvedExamplePhrases: [],
    rejectedExamplePhrases: [],
  } as BrandVoiceFormValues;
}

describe('VoiceEditForm — validation branch', () => {
  it('shows the tone-of-voice error when submit fails validation', async () => {
    const onSubmit = vi.fn();
    render(
      <VoiceEditForm
        defaultValues={buildDefaults()}
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
    await waitFor(() => expect(onSubmit).not.toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByText(/Tone of voice must be at most/i)).toBeInTheDocument(),
    );
  });
});
