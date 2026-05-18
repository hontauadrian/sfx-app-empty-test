import { describe, expect, it } from 'vitest';
import { upsertVisualIdentityResolver } from '../upsert-visual-identity.resolver';

describe('upsertVisualIdentityResolver', () => {
  it('accepts a minimal valid payload', async () => {
    const result = await upsertVisualIdentityResolver(
      { logoUsage: 'Default' },
      undefined,
      { shouldUseNativeValidation: false, fields: {} },
    );
    expect(result.errors).toEqual({});
  });

  it('emits an error for empty logoUsage', async () => {
    const result = await upsertVisualIdentityResolver({ logoUsage: '' }, undefined, {
      shouldUseNativeValidation: false,
      fields: {},
    });
    expect(
      (result.errors as { logoUsage?: { message: string } }).logoUsage?.message,
    ).toBe('Logo usage guidance is required');
  });

  it('emits an error for invalid hex value in colorPalette', async () => {
    const result = await upsertVisualIdentityResolver(
      {
        logoUsage: 'Default',
        colorPalette: [{ name: 'P', hex: 'red', usageNotes: null }],
      },
      undefined,
      { shouldUseNativeValidation: false, fields: {} },
    );
    const errors = result.errors as Record<string, unknown>;
    expect(JSON.stringify(errors)).toContain('Invalid hex color');
  });
});
