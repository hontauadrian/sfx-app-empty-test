import type { PrismaClient } from '@sfx/database';

export type BrandMetadataRow = NonNullable<
  Awaited<ReturnType<PrismaClient['brandMetadata']['findUnique']>>
>;
