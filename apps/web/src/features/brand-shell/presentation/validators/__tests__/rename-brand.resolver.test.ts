import { describe, expect, it } from 'vitest';
import { renameBrandResolver } from '../rename-brand.resolver';

describe('renameBrandResolver', () => {
  it('accepts a valid name', async () => {
    const result = await renameBrandResolver({ name: 'Renamed' }, undefined, {
      fields: {},
      shouldUseNativeValidation: false,
    });
    expect(result.errors).toEqual({});
    expect(result.values).toEqual({ name: 'Renamed' });
  });

  it('rejects an empty name', async () => {
    const result = await renameBrandResolver({ name: '' }, undefined, {
      fields: {},
      shouldUseNativeValidation: false,
    });
    expect((result.errors as Record<string, unknown>).name).toBeDefined();
  });

  it('rejects a whitespace-only name', async () => {
    const result = await renameBrandResolver({ name: '   ' }, undefined, {
      fields: {},
      shouldUseNativeValidation: false,
    });
    expect((result.errors as Record<string, unknown>).name).toBeDefined();
  });
});
