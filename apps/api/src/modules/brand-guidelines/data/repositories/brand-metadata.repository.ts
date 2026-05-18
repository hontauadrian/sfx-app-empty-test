import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@sfx/database';
import type {
  BrandMetadata,
  BrandMetadataEditor,
  BrandMetadataRepository,
  UpsertBrandMetadataInput,
} from '@sfx/domain';
import { toBrandMetadata } from '../mapper/brand-metadata.mapper';
import { BRAND_GUIDELINES_PRISMA_CLIENT } from './brand-guidelines.tokens';
import { writeBrandGuidelinesVersion } from '../version/write-version';

@Injectable()
export class BrandMetadataPrismaRepository implements BrandMetadataRepository {
  constructor(
    @Inject(BRAND_GUIDELINES_PRISMA_CLIENT) private readonly prisma: PrismaClient,
  ) {}

  async findByBrandId(brandId: string): Promise<BrandMetadata | null> {
    const row = await this.prisma.brandMetadata.findUnique({ where: { brandId } });
    return row ? toBrandMetadata(row) : null;
  }

  async upsertByBrandId(
    brandId: string,
    input: UpsertBrandMetadataInput,
    editor: BrandMetadataEditor,
    changeNote: string | null,
  ): Promise<BrandMetadata> {
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const tagsArg = input.tags;
      const row = await tx.brandMetadata.upsert({
        where: { brandId },
        update: {
          lastUpdatedAt: now,
          lastUpdatedByUserId: editor.editorUserId,
          ...(tagsArg !== undefined ? { tags: [...tagsArg] } : {}),
        },
        create: {
          brandId,
          ownerUserId: editor.ownerUserId,
          lastUpdatedAt: now,
          lastUpdatedByUserId: editor.editorUserId,
          tags: tagsArg !== undefined ? [...tagsArg] : [],
        },
      });
      await writeBrandGuidelinesVersion(
        tx,
        brandId,
        { editorUserId: editor.editorUserId, editorDisplayName: editor.editorUserId },
        changeNote,
      );
      return toBrandMetadata(row);
    });
  }
}
