import { describe, expect, it } from 'vitest';
import {
  brandVoiceEndpoint,
  brandVoiceQueryKey,
  voiceEditRoute,
  BRAND_VOICE_TONE_MAX_LENGTH,
  BRAND_VOICE_VOCAB_MAX_ITEMS,
} from '../constants';

describe('brand-voice constants', () => {
  it('builds the endpoint url', () => {
    expect(brandVoiceEndpoint('abc')).toBe('api/v1/brands/abc/voice');
  });

  it('builds a query key tuple', () => {
    expect(brandVoiceQueryKey('abc')).toEqual(['brand-voice', 'abc']);
  });

  it('builds the voice edit route', () => {
    expect(voiceEditRoute('abc')).toBe('/brands/abc/voice/edit');
  });

  it('re-exports validation constants', () => {
    expect(BRAND_VOICE_TONE_MAX_LENGTH).toBe(4000);
    expect(BRAND_VOICE_VOCAB_MAX_ITEMS).toBe(200);
  });
});
