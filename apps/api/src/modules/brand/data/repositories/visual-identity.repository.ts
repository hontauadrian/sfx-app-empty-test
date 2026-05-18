import { Inject, Injectable } from '@nestjs/common';
import type {
  BrandGuidelineEditor,
  UpsertVisualIdentityInput,
  VisualIdentity,
  VisualIdentityRepository,
} from '@sfx/domain';
import type { PrismaClient } from '@sfx/database';
import { toPrismaUpsertData, toVisualIdentity } from '../mapper/visual-identity.mapper';
import { PRISMA_CLIENT } from './brand.tokens';
import { writeBrandGuidelinesVersion } from '../../../brand-guidelines/data/version/write-version';

@Injectable()
export class VisualIdentityPrismaRepository implements VisualIdentityRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  async findByBrandId(brandId: string): Promise<VisualIdentity | null> {
    const row = await this.prisma.visualIdentity.findUnique({ where: { brandId } });
    return row ? toVisualIdentity(row) : null;
  }

  async upsertForBrand(
    brandId: string,
    input: UpsertVisualIdentityInput,
    editor: BrandGuidelineEditor,
    changeNote: string | null,
  ): Promise<VisualIdentity> {
    const data = toPrismaUpsertData(input);
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.visualIdentity.upsert({
        where: { brandId },
        create: { brandId, ...data },
        update: data,
      });
      await writeBrandGuidelinesVersion(tx, brandId, editor, changeNote);
      return toVisualIdentity(row);
    });
  }
}
