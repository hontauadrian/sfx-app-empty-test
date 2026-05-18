import { describe, expect, it } from 'vitest';
import type { CompanyInfoDataModel } from '../company-info-data-model';

describe('CompanyInfoDataModel', () => {
  it('describes every wire field including ISO date strings', () => {
    const example: CompanyInfoDataModel = {
      id: 'cid-1',
      legalName: 'Acme Holdings SRL',
      tradingName: 'Acme',
      email: 'contact@acme.test',
      phone: '+40 712 345 678',
      website: 'https://acme.test',
      addressLine1: 'Street 1',
      addressLine2: null,
      city: 'Bucharest',
      postalCode: '010101',
      country: 'Romania',
      taxId: 'RO123',
      registrationNumber: 'J40/123/2024',
      companyName: null,
      foundedYear: null,
      teamSize: null,
      industry: null,
      missionStatement: null,
      visionStatement: null,
      coreValues: [],
      certifications: [],
      createdAt: '2024-06-01T10:00:00.000Z',
      updatedAt: '2024-06-02T10:00:00.000Z',
    };

    expect(example.id).toBe('cid-1');
    expect(typeof example.createdAt).toBe('string');
    expect(example.addressLine2).toBeNull();
  });
});
