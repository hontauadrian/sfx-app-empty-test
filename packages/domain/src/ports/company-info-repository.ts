import type { CompanyInfo, UpsertCompanyInfoInput } from '../entities/company-info';
import type {
  CompanyInfoVersion,
  ListCompanyInfoVersionsInput,
  ListCompanyInfoVersionsResult,
} from '../entities/company-info-version';

// Editor attribution captured on every singleton upsert. The values flow
// from the authenticated request user into the version row written in
// the same Prisma `$transaction` as the singleton write.
export interface CompanyInfoEditor {
  readonly editorUserId: string;
  readonly editorDisplayName: string;
}

// Port (in the Clean Architecture sense): the contract every data-layer
// implementation of CompanyInfo persistence must satisfy. The NestJS DI
// token that binds this interface to its concrete adapter lives in the
// backend module (apps/api/src/modules/company-info/), preserving the
// zero-runtime-deps invariant of @sfx/domain.
export interface CompanyInfoRepository {
  findSingleton(): Promise<CompanyInfo | null>;
  upsertSingleton(
    input: UpsertCompanyInfoInput,
    editor: CompanyInfoEditor,
  ): Promise<CompanyInfo>;
  listVersions(
    input: ListCompanyInfoVersionsInput,
  ): Promise<ListCompanyInfoVersionsResult>;
  findVersionById(id: string): Promise<CompanyInfoVersion | null>;
}
