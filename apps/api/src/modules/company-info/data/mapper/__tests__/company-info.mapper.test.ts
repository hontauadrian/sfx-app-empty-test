import type { UpsertCompanyInfoInput } from '@sfx/domain';
import type { CompanyInfoRow } from '../../model/company-info-data-model';
import { toCompanyInfo, toPrismaUpsertData } from '../company-info.mapper';

describe('toCompanyInfo', () => {
  const now = new Date('2026-01-02T03:04:05.000Z');

  it('returns a domain entity when every field is populated', () => {
    const row: CompanyInfoRow = {
      id: 'cuid-1',
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
      companyName: 'Acme',
      foundedYear: 1998,
      teamSize: 42,
      industry: 'Manufacturing',
      missionStatement: 'M',
      visionStatement: 'V',
      coreValues: ['A', 'B'],
      certifications: ['ISO 9001'],
      createdAt: now,
      updatedAt: now,
    };

    expect(toCompanyInfo(row)).toEqual({ ...row });
  });

  it('preserves null optionals (does not coerce to undefined)', () => {
    const row: CompanyInfoRow = {
      id: 'cuid-2',
      legalName: 'Bare Minimum LLC',
      tradingName: null,
      email: null,
      phone: null,
      website: null,
      addressLine1: null,
      addressLine2: null,
      city: null,
      postalCode: null,
      country: null,
      taxId: null,
      registrationNumber: null,
      companyName: null,
      foundedYear: null,
      teamSize: null,
      industry: null,
      missionStatement: null,
      visionStatement: null,
      coreValues: [],
      certifications: [],
      createdAt: now,
      updatedAt: now,
    };

    const entity = toCompanyInfo(row);
    expect(entity.tradingName).toBeNull();
    expect(entity.email).toBeNull();
    expect(entity.phone).toBeNull();
    expect(entity.website).toBeNull();
    expect(entity.addressLine1).toBeNull();
    expect(entity.addressLine2).toBeNull();
    expect(entity.city).toBeNull();
    expect(entity.postalCode).toBeNull();
    expect(entity.country).toBeNull();
    expect(entity.taxId).toBeNull();
    expect(entity.registrationNumber).toBeNull();
    expect(entity.companyName).toBeNull();
    expect(entity.foundedYear).toBeNull();
    expect(entity.teamSize).toBeNull();
    expect(entity.industry).toBeNull();
    expect(entity.missionStatement).toBeNull();
    expect(entity.visionStatement).toBeNull();
    expect(entity.coreValues).toEqual([]);
    expect(entity.certifications).toEqual([]);
  });

  it('surfaces every new scalar from the row', () => {
    const row: CompanyInfoRow = {
      id: 'cuid-3',
      legalName: 'Co',
      tradingName: null,
      email: null,
      phone: null,
      website: null,
      addressLine1: null,
      addressLine2: null,
      city: null,
      postalCode: null,
      country: null,
      taxId: null,
      registrationNumber: null,
      companyName: 'Acme Display',
      foundedYear: 1998,
      teamSize: 42,
      industry: 'Manufacturing',
      missionStatement: 'M',
      visionStatement: 'V',
      coreValues: [],
      certifications: [],
      createdAt: now,
      updatedAt: now,
    };

    const entity = toCompanyInfo(row);
    expect(entity.companyName).toBe('Acme Display');
    expect(entity.foundedYear).toBe(1998);
    expect(entity.teamSize).toBe(42);
    expect(entity.industry).toBe('Manufacturing');
    expect(entity.missionStatement).toBe('M');
    expect(entity.visionStatement).toBe('V');
  });

  it("surfaces coreValues and certifications as the row's array verbatim", () => {
    const row: CompanyInfoRow = {
      id: 'cuid-4',
      legalName: 'Co',
      tradingName: null,
      email: null,
      phone: null,
      website: null,
      addressLine1: null,
      addressLine2: null,
      city: null,
      postalCode: null,
      country: null,
      taxId: null,
      registrationNumber: null,
      companyName: null,
      foundedYear: null,
      teamSize: null,
      industry: null,
      missionStatement: null,
      visionStatement: null,
      coreValues: ['A', 'B'],
      certifications: ['ISO 9001'],
      createdAt: now,
      updatedAt: now,
    };

    const entity = toCompanyInfo(row);
    expect(entity.coreValues).toEqual(['A', 'B']);
    expect(entity.certifications).toEqual(['ISO 9001']);
  });

  it('coerces a null array column to [] (defensive)', () => {
    const row = {
      id: 'cuid-5',
      legalName: 'Co',
      tradingName: null,
      email: null,
      phone: null,
      website: null,
      addressLine1: null,
      addressLine2: null,
      city: null,
      postalCode: null,
      country: null,
      taxId: null,
      registrationNumber: null,
      companyName: null,
      foundedYear: null,
      teamSize: null,
      industry: null,
      missionStatement: null,
      visionStatement: null,
      coreValues: null as unknown as string[],
      certifications: null as unknown as string[],
      createdAt: now,
      updatedAt: now,
    } as CompanyInfoRow;

    const entity = toCompanyInfo(row);
    expect(entity.coreValues).toEqual([]);
    expect(entity.certifications).toEqual([]);
  });
});

describe('toPrismaUpsertData', () => {
  it('omits keys with undefined value when only legalName is present', () => {
    const input: UpsertCompanyInfoInput = { legalName: 'Solo' };
    const data = toPrismaUpsertData(input);

    expect(data).toEqual({ legalName: 'Solo' });
    expect(Object.keys(data)).toEqual(['legalName']);
  });

  it('passes every non-null optional through unchanged', () => {
    const input: UpsertCompanyInfoInput = {
      legalName: 'Full Co',
      tradingName: 'Full',
      email: 'full@example.com',
      phone: '+1-555-0100',
      website: 'https://full.example',
      addressLine1: '1 Main',
      addressLine2: 'Apt 2',
      city: 'NYC',
      postalCode: '10001',
      country: 'USA',
      taxId: 'TX-1',
      registrationNumber: 'RN-1',
    };

    expect(toPrismaUpsertData(input)).toEqual(input);
  });

  it('passes explicit null on every optional through unchanged', () => {
    const input: UpsertCompanyInfoInput = {
      legalName: 'Clear All',
      tradingName: null,
      email: null,
      phone: null,
      website: null,
      addressLine1: null,
      addressLine2: null,
      city: null,
      postalCode: null,
      country: null,
      taxId: null,
      registrationNumber: null,
    };

    expect(toPrismaUpsertData(input)).toEqual(input);
  });

  it('omits a single undefined optional while keeping defined ones', () => {
    const input: UpsertCompanyInfoInput = {
      legalName: 'Mixed',
      tradingName: 'M',
      email: null,
    };

    const data = toPrismaUpsertData(input);
    expect(data).toEqual({ legalName: 'Mixed', tradingName: 'M', email: null });
    expect('phone' in data).toBe(false);
    expect('website' in data).toBe(false);
  });

  it('never includes id, createdAt, or updatedAt', () => {
    const input: UpsertCompanyInfoInput = { legalName: 'No Internals' };
    const data = toPrismaUpsertData(input) as Record<string, unknown>;

    expect('id' in data).toBe(false);
    expect('createdAt' in data).toBe(false);
    expect('updatedAt' in data).toBe(false);
  });

  it('includes coreValues when defined', () => {
    const data = toPrismaUpsertData({ legalName: 'A', coreValues: ['A'] }) as Record<string, unknown>;
    expect(data.coreValues).toEqual(['A']);
  });

  it('includes coreValues: [] (explicit clear)', () => {
    const data = toPrismaUpsertData({ legalName: 'A', coreValues: [] }) as Record<string, unknown>;
    expect('coreValues' in data).toBe(true);
    expect(data.coreValues).toEqual([]);
  });

  it('omits coreValues when undefined', () => {
    const data = toPrismaUpsertData({ legalName: 'A' }) as Record<string, unknown>;
    expect('coreValues' in data).toBe(false);
  });

  it('includes certifications when defined', () => {
    const data = toPrismaUpsertData({
      legalName: 'A',
      certifications: ['ISO 9001'],
    }) as Record<string, unknown>;
    expect(data.certifications).toEqual(['ISO 9001']);
  });

  it('includes certifications: [] (explicit clear)', () => {
    const data = toPrismaUpsertData({
      legalName: 'A',
      certifications: [],
    }) as Record<string, unknown>;
    expect('certifications' in data).toBe(true);
    expect(data.certifications).toEqual([]);
  });

  it('omits certifications when undefined', () => {
    const data = toPrismaUpsertData({ legalName: 'A' }) as Record<string, unknown>;
    expect('certifications' in data).toBe(false);
  });

  it('passes every new scalar through unchanged when defined', () => {
    const input: UpsertCompanyInfoInput = {
      legalName: 'Co',
      companyName: 'Acme',
      foundedYear: 1998,
      teamSize: 42,
      industry: 'Manufacturing',
      missionStatement: 'M',
      visionStatement: 'V',
    };
    const data = toPrismaUpsertData(input) as Record<string, unknown>;
    expect(data.companyName).toBe('Acme');
    expect(data.foundedYear).toBe(1998);
    expect(data.teamSize).toBe(42);
    expect(data.industry).toBe('Manufacturing');
    expect(data.missionStatement).toBe('M');
    expect(data.visionStatement).toBe('V');
  });

  it('omits a scalar that is undefined while keeping defined ones', () => {
    const data = toPrismaUpsertData({
      legalName: 'Co',
      foundedYear: 1998,
    }) as Record<string, unknown>;
    expect(data.foundedYear).toBe(1998);
    expect('companyName' in data).toBe(false);
    expect('teamSize' in data).toBe(false);
  });

  it('passes null for every new optional scalar through unchanged', () => {
    const input: UpsertCompanyInfoInput = {
      legalName: 'Co',
      companyName: null,
      foundedYear: null,
      teamSize: null,
      industry: null,
      missionStatement: null,
      visionStatement: null,
    };
    const data = toPrismaUpsertData(input) as Record<string, unknown>;
    expect(data.companyName).toBeNull();
    expect(data.foundedYear).toBeNull();
    expect(data.teamSize).toBeNull();
    expect(data.industry).toBeNull();
    expect(data.missionStatement).toBeNull();
    expect(data.visionStatement).toBeNull();
  });
});
