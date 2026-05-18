import type { CompanyInfo } from '@sfx/domain';
import type { CompanyInfoDataModel } from '../model/company-info-data-model';

export function mapToCompanyInfo(data: CompanyInfoDataModel): CompanyInfo {
  return {
    id: data.id,
    legalName: data.legalName,
    tradingName: data.tradingName,
    email: data.email,
    phone: data.phone,
    website: data.website,
    addressLine1: data.addressLine1,
    addressLine2: data.addressLine2,
    city: data.city,
    postalCode: data.postalCode,
    country: data.country,
    taxId: data.taxId,
    registrationNumber: data.registrationNumber,
    companyName: data.companyName,
    foundedYear: data.foundedYear,
    teamSize: data.teamSize,
    industry: data.industry,
    missionStatement: data.missionStatement,
    visionStatement: data.visionStatement,
    coreValues: data.coreValues,
    certifications: data.certifications,
    createdAt: new Date(data.createdAt),
    updatedAt: new Date(data.updatedAt),
  };
}

export function mapToCompanyInfoOrNull(data: CompanyInfoDataModel | null | undefined): CompanyInfo | null {
  if (data === null || data === undefined) return null;
  return mapToCompanyInfo(data);
}
