import type { PrismaClient } from '@sfx/database';

export type DosDontsRow = NonNullable<
  Awaited<ReturnType<PrismaClient['dosDontsEntry']['findFirst']>>
>;
