import type { PrismaClient } from '@sfx/database';

export type CompanyInfoRow = NonNullable<
  Awaited<ReturnType<PrismaClient['companyInfo']['findFirst']>>
>;
