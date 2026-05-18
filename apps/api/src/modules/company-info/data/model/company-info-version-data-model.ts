import type { PrismaClient } from '@sfx/database';

export type CompanyInfoVersionRow = NonNullable<
  Awaited<ReturnType<PrismaClient['companyInfoVersion']['findFirst']>>
>;
