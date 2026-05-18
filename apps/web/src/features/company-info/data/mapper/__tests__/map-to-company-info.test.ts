import { describe, expect, it } from 'vitest';
import { mapToCompanyInfo, mapToCompanyInfoOrNull } from '../map-to-company-info';
import type { CompanyInfoDataModel } from '../../model/company-info-data-model';

function fullDataModel(): CompanyInfoDataModel {
  return {
    id: 'cid-1',
    legalName: 'Acme Holdings SRL',
    tradingName: 'Acme',
    email: 'contact@acme.test',
    phone: '+40 712 345 678',
    website: 'https://acme.test',
    addressLine1: 'Street 1',
    addressLine2: 'Apt 2',
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
    updatedAt: '2024-06-02T11:30:00.000Z',
  };
}

describe('mapToCompanyInfo', () => {
  it('maps every scalar field verbatim and converts ISO dates to Date instances', () => {
    const data = fullDataModel();
    const result = mapToCompanyInfo(data);

    expect(result).toEqual({
      id: 'cid-1',
      legalName: 'Acme Holdings SRL',
      tradingName: 'Acme',
      email: 'contact@acme.test',
      phone: '+40 712 345 678',
      website: 'https://acme.test',
      addressLine1: 'Street 1',
      addressLine2: 'Apt 2',
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
      createdAt: new Date('2024-06-01T10:00:00.000Z'),
      updatedAt: new Date('2024-06-02T11:30:00.000Z'),
    });
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.updatedAt).toBeInstanceOf(Date);
  });

  it('preserves null on every optional field (does not coerce to undefined)', () => {
    const data: CompanyInfoDataModel = {
      ...fullDataModel(),
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

    const result = mapToCompanyInfo(data);

    expect(result.tradingName).toBeNull();
    expect(result.email).toBeNull();
    expect(result.phone).toBeNull();
    expect(result.website).toBeNull();
    expect(result.addressLine1).toBeNull();
    expect(result.addressLine2).toBeNull();
    expect(result.city).toBeNull();
    expect(result.postalCode).toBeNull();
    expect(result.country).toBeNull();
    expect(result.taxId).toBeNull();
    expect(result.registrationNumber).toBeNull();
  });
});

describe('mapToCompanyInfoOrNull', () => {
  it('returns null when given null', () => {
    expect(mapToCompanyInfoOrNull(null)).toBeNull();
  });

  it('returns null when given undefined', () => {
    expect(mapToCompanyInfoOrNull(undefined)).toBeNull();
  });

  it('delegates to mapToCompanyInfo when given a data model', () => {
    const data = fullDataModel();
    const result = mapToCompanyInfoOrNull(data);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('cid-1');
    expect(result!.createdAt).toBeInstanceOf(Date);
  });
});
