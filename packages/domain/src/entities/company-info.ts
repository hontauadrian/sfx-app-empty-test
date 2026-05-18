// Singleton CompanyInfo record persisted by the API and rendered on the
// admin company-info page. Optional fields are `string | null` to mirror
// Prisma's nullable-column semantics: a present-but-null value means
// "explicitly cleared" rather than "field absent".
//
// Array fields (`coreValues`, `certifications`) follow a different policy
// from scalar optionals: they are ALWAYS an array — `undefined` on an
// upsert means "field omitted, keep existing", `[]` means "explicit clear",
// and `null` is not a valid value at any layer (TS, Zod, Prisma, mapper).
// Rationale: Postgres `text[]` columns default to `[]`; the null-vs-empty
// distinction at the API boundary is noise without product value.
export interface CompanyInfo {
  readonly id: string;
  readonly legalName: string;
  readonly tradingName: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly website: string | null;
  readonly addressLine1: string | null;
  readonly addressLine2: string | null;
  readonly city: string | null;
  readonly postalCode: string | null;
  readonly country: string | null;
  readonly taxId: string | null;
  readonly registrationNumber: string | null;
  readonly companyName: string | null;
  readonly foundedYear: number | null;
  readonly teamSize: number | null;
  readonly industry: string | null;
  readonly missionStatement: string | null;
  readonly visionStatement: string | null;
  readonly coreValues: readonly string[];
  readonly certifications: readonly string[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// Upsert payload. `legalName` is required. Every other scalar field accepts
// `string`/`number`, `null` (explicit clear), or `undefined` (field omitted).
// Array fields accept `readonly string[]` or `undefined` ONLY — `null` is
// rejected at every layer; `[]` is the explicit clear.
export interface UpsertCompanyInfoInput {
  readonly legalName: string;
  readonly tradingName?: string | null;
  readonly email?: string | null;
  readonly phone?: string | null;
  readonly website?: string | null;
  readonly addressLine1?: string | null;
  readonly addressLine2?: string | null;
  readonly city?: string | null;
  readonly postalCode?: string | null;
  readonly country?: string | null;
  readonly taxId?: string | null;
  readonly registrationNumber?: string | null;
  readonly companyName?: string | null;
  readonly foundedYear?: number | null;
  readonly teamSize?: number | null;
  readonly industry?: string | null;
  readonly missionStatement?: string | null;
  readonly visionStatement?: string | null;
  readonly coreValues?: readonly string[];
  readonly certifications?: readonly string[];
}
