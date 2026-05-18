import { describe, expect, it } from 'vitest';
import { createBrandResolver } from '../create-brand.resolver';

describe('createBrandResolver', () => {
  it('accepts a valid name', async () => {
    const result = await createBrandResolver({ name: 'Acme' }, undefined, {
      fields: {},
      shouldUseNativeValidation: false,
    });
    expect(result.errors).toEqual({});
    expect(result.values).toEqual({ name: 'Acme' });
  });

  it('rejects an empty name with a field-level error', async () => {
    const result = await createBrandResolver({ name: '' }, undefined, {
      fields: {},
      shouldUseNativeValidation: false,
    });
    expect((result.errors as Record<string, unknown>).name).toBeDefined();
  });

  it('rejects a 201-char name', async () => {
    const result = await createBrandResolver({ name: 'x'.repeat(201) }, undefined, {
      fields: {},
      shouldUseNativeValidation: false,
    });
    expect((result.errors as Record<string, unknown>).name).toBeDefined();
  });
});
