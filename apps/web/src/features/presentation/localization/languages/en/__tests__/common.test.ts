import { describe, expect, it } from 'vitest';
import { common } from '../common';

describe('en common translations', () => {
  it('declares brand-voice keys', () => {
    expect(common.brandVoiceEditPageTitle).toBe('Edit brand voice');
    expect(common.brandVoiceToneOfVoiceLabel).toBe('Tone of voice');
    expect(common.brandVoiceAddRow).toBe('+ Add');
  });

  it('preserves the F1 brandVoice section title and edit CTA', () => {
    expect(common.brandVoiceSectionTitle).toBe('Brand voice');
    expect(common.editBrandVoice).toBe('+ Edit brand voice');
  });
});
