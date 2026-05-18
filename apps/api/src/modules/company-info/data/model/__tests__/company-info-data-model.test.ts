import type { CompanyInfoRow } from '../company-info-data-model';

describe('CompanyInfoRow', () => {
  it('describes the Prisma-generated CompanyInfo shape', () => {
    const row: CompanyInfoRow = {
      id: 'cuid-1',
      legalName: 'Acme',
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
      createdAt: new Date('2026-01-02T03:04:05.000Z'),
      updatedAt: new Date('2026-01-02T03:04:05.000Z'),
    };

    expect(row.id).toBe('cuid-1');
    expect(row.legalName).toBe('Acme');
  });
});
