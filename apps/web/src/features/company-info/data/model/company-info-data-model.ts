export interface CompanyInfoDataModel {
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
  readonly createdAt: string;
  readonly updatedAt: string;
}
