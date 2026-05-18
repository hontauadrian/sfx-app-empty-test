import type { CompanyInfo } from './company-info';

// Immutable snapshot of a CompanyInfo row at save time, plus editor
// attribution. The JSONB column round-trips Date as ISO string; the
// repository mapper re-hydrates `createdAt` / `updatedAt` on the
// snapshot to `Date` so the domain invariant (`snapshot: CompanyInfo`)
// holds at every consumer.
export interface CompanyInfoVersion {
  readonly id: string;
  readonly companyInfoId: string;
  readonly snapshot: CompanyInfo;
  readonly editorUserId: string;
  readonly editorDisplayName: string;
  readonly createdAt: Date;
}

// Cursor-style newest-first pagination. `cursor` is the id of the last
// version returned in the previous page; the repository returns rows
// strictly older than that cursor (compared by createdAt DESC, id DESC).
// `take` is clamped to [1, 100] at the controller via Zod (default 50).
export interface ListCompanyInfoVersionsInput {
  readonly take: number;
  readonly cursor?: string;
}

// `nextCursor` is the id of the oldest row in the current page when a
// next page may exist (repository fetched `take + 1` and a tail row
// existed); otherwise `null`.
export interface ListCompanyInfoVersionsResult {
  readonly items: readonly CompanyInfoVersion[];
  readonly nextCursor: string | null;
}
