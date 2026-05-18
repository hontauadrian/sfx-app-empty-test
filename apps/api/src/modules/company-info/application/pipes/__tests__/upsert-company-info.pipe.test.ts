import { BadRequestException } from '@nestjs/common';
import { UpsertCompanyInfoPipe } from '../upsert-company-info.pipe';

describe('UpsertCompanyInfoPipe', () => {
  const pipe = new UpsertCompanyInfoPipe();

  it('returns the parsed payload for a valid minimal input', () => {
    const result = pipe.transform({ legalName: 'Acme Holdings SRL' });
    expect(result).toEqual({ legalName: 'Acme Holdings SRL' });
  });

  it('returns the parsed payload for a fully populated input', () => {
    const input = {
      legalName: 'Acme Holdings SRL',
      tradingName: 'Acme',
      email: 'hello@acme.example',
      phone: '+40 21 555 0000',
      website: 'https://acme.example',
      addressLine1: '12 High St',
      addressLine2: 'Suite 4',
      city: 'Bucharest',
      postalCode: '010101',
      country: 'Romania',
      taxId: 'RO12345678',
      registrationNumber: 'J40/1234/2020',
    };
    expect(pipe.transform(input)).toEqual(input);
  });

  it('rejects missing legalName with BadRequestException citing the field', () => {
    let captured: unknown;
    try {
      pipe.transform({});
    } catch (error) {
      captured = error;
    }
    expect(captured).toBeInstanceOf(BadRequestException);
    const response = (captured as BadRequestException).getResponse() as {
      message: string;
      errors: { field: string; message: string }[];
    };
    expect(response.message).toBe('Validation failed');
    expect(response.errors.some((entry) => entry.field === 'legalName')).toBe(true);
  });

  it('rejects empty legalName', () => {
    expect(() => pipe.transform({ legalName: '' })).toThrow(BadRequestException);
  });

  it('rejects a non-URL non-empty website value', () => {
    let captured: unknown;
    try {
      pipe.transform({ legalName: 'Acme', website: 'not a url' });
    } catch (error) {
      captured = error;
    }
    expect(captured).toBeInstanceOf(BadRequestException);
    const response = (captured as BadRequestException).getResponse() as {
      errors: { field: string; message: string }[];
    };
    expect(response.errors.some((entry) => entry.field === 'website')).toBe(true);
  });

  it('rejects a malformed email value', () => {
    let captured: unknown;
    try {
      pipe.transform({ legalName: 'Acme', email: 'not-an-email' });
    } catch (error) {
      captured = error;
    }
    expect(captured).toBeInstanceOf(BadRequestException);
    const response = (captured as BadRequestException).getResponse() as {
      errors: { field: string; message: string }[];
    };
    expect(response.errors.some((entry) => entry.field === 'email')).toBe(true);
  });

  it('rejects unknown keys (strict schema)', () => {
    expect(() => pipe.transform({ legalName: 'Acme', unknownKey: 'x' })).toThrow(BadRequestException);
  });
});
