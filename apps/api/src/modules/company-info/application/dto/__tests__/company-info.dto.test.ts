import 'reflect-metadata';
import { CompanyInfoDto } from '../company-info.dto';

describe('CompanyInfoDto', () => {
  it('can be instantiated and assigned the domain shape', () => {
    const dto = new CompanyInfoDto();
    dto.id = 'cuid-1';
    dto.legalName = 'Acme';
    dto.tradingName = null;
    dto.email = null;
    dto.phone = null;
    dto.website = null;
    dto.addressLine1 = null;
    dto.addressLine2 = null;
    dto.city = null;
    dto.postalCode = null;
    dto.country = null;
    dto.taxId = null;
    dto.registrationNumber = null;
    dto.companyName = null;
    dto.foundedYear = null;
    dto.teamSize = null;
    dto.industry = null;
    dto.missionStatement = null;
    dto.visionStatement = null;
    dto.coreValues = [];
    dto.certifications = [];
    dto.createdAt = new Date('2026-01-02T03:04:05.000Z');
    dto.updatedAt = new Date('2026-01-02T03:04:05.000Z');

    expect(dto.id).toBe('cuid-1');
    expect(dto.legalName).toBe('Acme');
    expect(dto.tradingName).toBeNull();
    expect(dto.createdAt).toBeInstanceOf(Date);
  });

  it('can be assigned every new scalar and array field', () => {
    const dto = new CompanyInfoDto();
    dto.id = 'cuid-2';
    dto.legalName = 'Co';
    dto.tradingName = null;
    dto.email = null;
    dto.phone = null;
    dto.website = null;
    dto.addressLine1 = null;
    dto.addressLine2 = null;
    dto.city = null;
    dto.postalCode = null;
    dto.country = null;
    dto.taxId = null;
    dto.registrationNumber = null;
    dto.companyName = 'Acme Display';
    dto.foundedYear = 1998;
    dto.teamSize = 42;
    dto.industry = 'Manufacturing';
    dto.missionStatement = 'M';
    dto.visionStatement = 'V';
    dto.coreValues = ['A', 'B'];
    dto.certifications = ['ISO 9001'];
    dto.createdAt = new Date();
    dto.updatedAt = new Date();

    expect(dto.companyName).toBe('Acme Display');
    expect(dto.foundedYear).toBe(1998);
    expect(dto.teamSize).toBe(42);
    expect(dto.industry).toBe('Manufacturing');
    expect(dto.missionStatement).toBe('M');
    expect(dto.visionStatement).toBe('V');
    expect(dto.coreValues).toEqual(['A', 'B']);
    expect(dto.certifications).toEqual(['ISO 9001']);
  });

  it('accepts null for every optional scalar', () => {
    const dto = new CompanyInfoDto();
    dto.companyName = null;
    dto.foundedYear = null;
    dto.teamSize = null;
    dto.industry = null;
    dto.missionStatement = null;
    dto.visionStatement = null;

    expect(dto.companyName).toBeNull();
    expect(dto.foundedYear).toBeNull();
    expect(dto.teamSize).toBeNull();
    expect(dto.industry).toBeNull();
    expect(dto.missionStatement).toBeNull();
    expect(dto.visionStatement).toBeNull();
  });

  it('accepts empty arrays for coreValues and certifications', () => {
    const dto = new CompanyInfoDto();
    dto.coreValues = [];
    dto.certifications = [];

    expect(dto.coreValues.length).toBe(0);
    expect(dto.certifications.length).toBe(0);
  });
});
