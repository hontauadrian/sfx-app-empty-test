import { describe, expect, it } from 'vitest';
import { createBrandProfileFormSchema } from '../brand-profile-form';
import { BRAND_NAME_MAX_LENGTH } from '../../../constants';

const labels = {
  nameRequired: 'Required',
  nameTooLong: 'Too long',
  descriptionTooLong: 'Description too long',
};

describe('createBrandProfileFormSchema', () => {
  it('accepts a minimal valid form payload', () => {
    const schema = createBrandProfileFormSchema(labels);
    const result = schema.safeParse({ name: 'Acme' });
    expect(result.success).toBe(true);
  });

  it('reports the documented localized error when the name is empty after trim', () => {
    const schema = createBrandProfileFormSchema(labels);
    const result = schema.safeParse({ name: '   ' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0]?.message).toBe('Required');
    }
  });

  it(`rejects names longer than ${BRAND_NAME_MAX_LENGTH} characters`, () => {
    const schema = createBrandProfileFormSchema(labels);
    const result = schema.safeParse({ name: 'a'.repeat(BRAND_NAME_MAX_LENGTH + 1) });
    expect(result.success).toBe(false);
  });

  it('accepts a null description', () => {
    const schema = createBrandProfileFormSchema(labels);
    const result = schema.safeParse({ name: 'Acme', description: null });
    expect(result.success).toBe(true);
  });
});
