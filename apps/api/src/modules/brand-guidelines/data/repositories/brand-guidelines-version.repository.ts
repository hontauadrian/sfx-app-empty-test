import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@sfx/database';
import type {
  BrandGuidelinesVersion,
  BrandGuidelinesVersionRepository,
  ListBrandGuidelinesVersionsInput,
  ListBrandGuidelinesVersionsResult,
} from '@sfx/domain';
import { toBrandGuidelinesVersion } from '../mapper/brand-guidelines-version.mapper';
import { BRAND_GUIDELINES_PRISMA_CLIENT } from './brand-guidelines.tokens';

@Injectable()
export class BrandGuidelinesVersionPrismaRepository
  implements BrandGuidelinesVersionRepository
{
  constructor(
    @Inject(BRAND_GUIDELINES_PRISMA_CLIENT) private readonly prisma: PrismaClient,
  ) {}

  async list(
    input: ListBrandGuidelinesVersionsInput,
  ): Promise<ListBrandGuidelinesVersionsResult> {
    const take = input.take;
    const cursorRow = input.cursor
      ? await this.prisma.brandGuidelinesVersion.findFirst({
          where: { id: input.cursor, brandId: input.brandId },
        })
      : null;
    if (input.cursor && !cursorRow) return { items: [], nextCursor: null };
    const trimmedQ = input.q?.trim();
    const qFilter =
      trimmedQ && trimmedQ.length > 0
        ? {
            OR: [
              { editorDisplayName: { contains: trimmedQ, mode: 'insensitive' as const } },
              { changeNote: { contains: trimmedQ, mode: 'insensitive' as const } },
            ],
          }
        : null;
    const rows = await this.prisma.brandGuidelinesVersion.findMany({
      where: {
        brandId: input.brandId,
        ...(cursorRow
          ? {
              OR: [
                { createdAt: { lt: cursorRow.createdAt } },
                { createdAt: cursorRow.createdAt, id: { lt: cursorRow.id } },
              ],
            }
          : {}),
        ...(qFilter ?? {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
    });
    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;
    return {
      items: page.map(toBrandGuidelinesVersion),
      nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
    };
  }

  async findById(id: string): Promise<BrandGuidelinesVersion | null> {
    const row = await this.prisma.brandGuidelinesVersion.findUnique({ where: { id } });
    return row ? toBrandGuidelinesVersion(row) : null;
  }

  async findLatestForBrand(brandId: string): Promise<BrandGuidelinesVersion | null> {
    const row = await this.prisma.brandGuidelinesVersion.findFirst({
      where: { brandId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return row ? toBrandGuidelinesVersion(row) : null;
  }
}
