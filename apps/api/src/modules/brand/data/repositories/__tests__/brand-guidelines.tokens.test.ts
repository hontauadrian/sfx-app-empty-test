import { describe, expect, it } from 'vitest';
import {
  BRAND_GUIDELINES_VERSION_REPOSITORY,
  BRAND_VOICE_REPOSITORY,
  VISUAL_IDENTITY_REPOSITORY,
} from '../brand-guidelines.tokens';

describe('brand-guidelines DI tokens', () => {
  it('BRAND_VOICE_REPOSITORY is a symbol', () => {
    expect(typeof BRAND_VOICE_REPOSITORY).toBe('symbol');
    expect(BRAND_VOICE_REPOSITORY.toString()).toContain('BRAND_VOICE_REPOSITORY');
  });

  it('VISUAL_IDENTITY_REPOSITORY is a symbol', () => {
    expect(typeof VISUAL_IDENTITY_REPOSITORY).toBe('symbol');
    expect(VISUAL_IDENTITY_REPOSITORY.toString()).toContain('VISUAL_IDENTITY_REPOSITORY');
  });

  it('BRAND_GUIDELINES_VERSION_REPOSITORY is a Symbol.for token (shared across modules)', () => {
    expect(typeof BRAND_GUIDELINES_VERSION_REPOSITORY).toBe('symbol');
    expect(BRAND_GUIDELINES_VERSION_REPOSITORY).toBe(
      Symbol.for('BrandGuidelinesVersionRepository'),
    );
  });

  it('tokens are pairwise distinct', () => {
    expect(BRAND_VOICE_REPOSITORY).not.toBe(VISUAL_IDENTITY_REPOSITORY);
    expect(BRAND_VOICE_REPOSITORY).not.toBe(BRAND_GUIDELINES_VERSION_REPOSITORY);
    expect(VISUAL_IDENTITY_REPOSITORY).not.toBe(BRAND_GUIDELINES_VERSION_REPOSITORY);
  });
});
