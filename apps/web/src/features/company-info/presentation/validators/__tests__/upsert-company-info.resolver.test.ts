import { describe, expect, it } from 'vitest';
import { upsertCompanyInfoResolver } from '../upsert-company-info.resolver';

const context = {} as Parameters<typeof upsertCompanyInfoResolver>[1];
const options = { fields: {}, criteriaMode: 'all' as const, shouldUseNativeValidation: false };

async function resolve(values: Record<string, unknown>): Promise<{ values: Record<string, unknown>; errors: Record<string, { message?: string }> }> {
  const result = await upsertCompanyInfoResolver(values, context, options);
  return result as { values: Record<string, unknown>; errors: Record<string, { message?: string }> };
}

describe('upsertCompanyInfoResolver', () => {
  it('accepts a valid input shape with required legalName only', async () => {
    const { errors, values } = await resolve({ legalName: 'Acme Holdings SRL' });
    expect(errors).toEqual({});
    expect(values).toMatchObject({ legalName: 'Acme Holdings SRL' });
  });

  it('rejects an empty legalName with the schema message', async () => {
    const { errors } = await resolve({ legalName: '' });
    expect(errors.legalName?.message?.length).toBeGreaterThan(0);
  });

  it('rejects an invalid email payload', async () => {
    const { errors } = await resolve({ legalName: 'Acme', email: 'not-an-email' });
    expect(errors.email?.message?.length).toBeGreaterThan(0);
  });

  it('produces RHF-shaped errors (per-field message)', async () => {
    const { errors } = await resolve({ legalName: '', email: 'bad' });
    expect(errors.legalName).toBeDefined();
    expect(typeof errors.legalName?.message).toBe('string');
  });

  it('accepts a full payload with all 8 new fields', async () => {
    const { errors } = await resolve({
      legalName: 'Acme Holdings SRL',
      companyName: 'Acme',
      industry: 'Manufacturing',
      foundedYear: 1998,
      teamSize: 42,
      missionStatement: 'Build great things',
      visionStatement: 'A world where great things exist',
      coreValues: ['Integrity', 'Craft'],
      certifications: ['ISO 9001'],
    });
    expect(errors).toEqual({});
  });
});
