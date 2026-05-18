import type { CompanyInfo, UpsertCompanyInfoInput } from '@sfx/domain';
import type { CompanyInfoRow } from '../model/company-info-data-model';

const OPTIONAL_KEYS = [
  'tradingName',
  'email',
  'phone',
  'website',
  'addressLine1',
  'addressLine2',
  'city',
  'postalCode',
  'country',
  'taxId',
  'registrationNumber',
  'companyName',
  'foundedYear',
  'teamSize',
  'industry',
  'missionStatement',
  'visionStatement',
] as const satisfies ReadonlyArray<keyof UpsertCompanyInfoInput>;

export function toCompanyInfo(row: CompanyInfoRow): CompanyInfo {
  return {
    id: row.id,
    legalName: row.legalName,
    tradingName: row.tradingName,
    email: row.email,
    phone: row.phone,
    website: row.website,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    city: row.city,
    postalCode: row.postalCode,
    country: row.country,
    taxId: row.taxId,
    registrationNumber: row.registrationNumber,
    companyName: row.companyName,
    foundedYear: row.foundedYear,
    teamSize: row.teamSize,
    industry: row.industry,
    missionStatement: row.missionStatement,
    visionStatement: row.visionStatement,
    coreValues: row.coreValues ?? [],
    certifications: row.certifications ?? [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export type CompanyInfoUpsertData = {
  legalName: string;
  tradingName?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  postalCode?: string | null;
  country?: string | null;
  taxId?: string | null;
  registrationNumber?: string | null;
  companyName?: string | null;
  foundedYear?: number | null;
  teamSize?: number | null;
  industry?: string | null;
  missionStatement?: string | null;
  visionStatement?: string | null;
  coreValues?: string[];
  certifications?: string[];
};

export function toPrismaUpsertData(input: UpsertCompanyInfoInput): CompanyInfoUpsertData {
  const result: Record<string, string | number | string[] | null | undefined> = {
    legalName: input.legalName,
  };
  for (const key of OPTIONAL_KEYS) {
    const value = input[key];
    if (value !== undefined) {
      result[key] = value;
    }
  }
  if (input.coreValues !== undefined) {
    result.coreValues = [...input.coreValues];
  }
  if (input.certifications !== undefined) {
    result.certifications = [...input.certifications];
  }
  return result as CompanyInfoUpsertData;
}
