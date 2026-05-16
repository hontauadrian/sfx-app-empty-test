import { describe, expect, it } from 'vitest';
import * as barrel from '../index';

describe('@/features/brand-voice barrel', () => {
  it('exports BrandVoiceCard and VoiceEditPage', () => {
    expect(typeof barrel.BrandVoiceCard).toBe('function');
    expect(typeof barrel.VoiceEditPage).toBe('function');
  });

  it('exports the route + query-key helpers', () => {
    expect(barrel.brandVoiceEndpoint('b')).toBe('api/v1/brands/b/voice');
    expect(barrel.voiceEditRoute('b')).toBe('/brands/b/voice/edit');
    expect(barrel.brandVoiceQueryKey('b')).toEqual(['brand-voice', 'b']);
  });
});
