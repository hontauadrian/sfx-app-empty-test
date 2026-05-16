import { describe, expect, it } from 'vitest';
import { common } from '../common';

describe('ro common translations', () => {
  it('declares brand-voice keys translated to Romanian', () => {
    expect(common.brandVoiceEditPageTitle).toBe('Editeaza vocea brandului');
    expect(common.brandVoiceToneOfVoiceLabel).toBe('Tonul vocii');
  });

  it('preserves the F1 brandVoice section title and edit CTA', () => {
    expect(common.brandVoiceSectionTitle).toBe('Vocea brandului');
    expect(common.editBrandVoice).toBe('+ Editeaza vocea brandului');
  });
});
