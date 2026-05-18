import type { CompanyInfo, CompanyInfoVersion } from '@sfx/domain';
import type { CompanyInfoVersionRow } from '../model/company-info-version-data-model';
import { toCompanyInfo } from './company-info.mapper';

// Build the JSON payload stored in `snapshot` for a freshly-created
// version row. We persist a structurally-identical CompanyInfo with
// ISO strings for `createdAt` / `updatedAt`; the read path
// (`toCompanyInfoVersion`) reverses that.
export function toVersionSnapshotJson(companyInfo: CompanyInfo): Record<string, unknown> {
  return {
    id: companyInfo.id,
    legalName: companyInfo.legalName,
    tradingName: companyInfo.tradingName,
    email: companyInfo.email,
    phone: companyInfo.phone,
    website: companyInfo.website,
    addressLine1: companyInfo.addressLine1,
    addressLine2: companyInfo.addressLine2,
    city: companyInfo.city,
    postalCode: companyInfo.postalCode,
    country: companyInfo.country,
    taxId: companyInfo.taxId,
    registrationNumber: companyInfo.registrationNumber,
    companyName: companyInfo.companyName,
    foundedYear: companyInfo.foundedYear,
    teamSize: companyInfo.teamSize,
    industry: companyInfo.industry,
    missionStatement: companyInfo.missionStatement,
    visionStatement: companyInfo.visionStatement,
    coreValues: [...companyInfo.coreValues],
    certifications: [...companyInfo.certifications],
    createdAt: companyInfo.createdAt.toISOString(),
    updatedAt: companyInfo.updatedAt.toISOString(),
  };
}

export function toCompanyInfoVersion(row: CompanyInfoVersionRow): CompanyInfoVersion {
  const snapshot = row.snapshot as Record<string, unknown>;
  return {
    id: row.id,
    companyInfoId: row.companyInfoId,
    snapshot: snapshotToCompanyInfo(snapshot),
    editorUserId: row.editorUserId,
    editorDisplayName: row.editorDisplayName,
    createdAt: row.createdAt,
  };
}

function snapshotToCompanyInfo(snapshot: Record<string, unknown>): CompanyInfo {
  // The JSONB column round-trips Date as ISO string. Delegate scalar/
  // array shape to `toCompanyInfo` via a synthetic CompanyInfoRow.
  return toCompanyInfo({
    id: String(snapshot.id),
    legalName: String(snapshot.legalName),
    tradingName: (snapshot.tradingName ?? null) as string | null,
    email: (snapshot.email ?? null) as string | null,
    phone: (snapshot.phone ?? null) as string | null,
    website: (snapshot.website ?? null) as string | null,
    addressLine1: (snapshot.addressLine1 ?? null) as string | null,
    addressLine2: (snapshot.addressLine2 ?? null) as string | null,
    city: (snapshot.city ?? null) as string | null,
    postalCode: (snapshot.postalCode ?? null) as string | null,
    country: (snapshot.country ?? null) as string | null,
    taxId: (snapshot.taxId ?? null) as string | null,
    registrationNumber: (snapshot.registrationNumber ?? null) as string | null,
    companyName: (snapshot.companyName ?? null) as string | null,
    foundedYear: (snapshot.foundedYear ?? null) as number | null,
    teamSize: (snapshot.teamSize ?? null) as number | null,
    industry: (snapshot.industry ?? null) as string | null,
    missionStatement: (snapshot.missionStatement ?? null) as string | null,
    visionStatement: (snapshot.visionStatement ?? null) as string | null,
    coreValues: Array.isArray(snapshot.coreValues) ? (snapshot.coreValues as string[]) : [],
    certifications: Array.isArray(snapshot.certifications)
      ? (snapshot.certifications as string[])
      : [],
    createdAt: new Date(String(snapshot.createdAt)),
    updatedAt: new Date(String(snapshot.updatedAt)),
  });
}
