import type { PrismaClient } from '@sfx/database';

export type BrandGuidelinesVersionRow = NonNullable<
  Awaited<ReturnType<PrismaClient['brandGuidelinesVersion']['findUnique']>>
>;
