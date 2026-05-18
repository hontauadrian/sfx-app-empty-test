import type { PrismaClient } from '@sfx/database';

export type BrandRow = NonNullable<
  Awaited<ReturnType<PrismaClient['brand']['findFirst']>>
>;
