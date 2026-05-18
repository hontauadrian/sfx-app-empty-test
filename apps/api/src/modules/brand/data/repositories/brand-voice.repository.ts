import { Inject, Injectable } from '@nestjs/common';
import type {
  BrandGuidelineEditor,
  BrandVoice,
  BrandVoiceRepository,
  UpsertBrandVoiceInput,
} from '@sfx/domain';
import type { PrismaClient } from '@sfx/database';
import { toBrandVoice, toPrismaUpsertData } from '../mapper/brand-voice.mapper';
import { PRISMA_CLIENT } from './brand.tokens';
import { writeBrandGuidelinesVersion } from '../../../brand-guidelines/data/version/write-version';

@Injectable()
export class BrandVoicePrismaRepository implements BrandVoiceRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  async findByBrandId(brandId: string): Promise<BrandVoice | null> {
    const row = await this.prisma.brandVoice.findUnique({ where: { brandId } });
    return row ? toBrandVoice(row) : null;
  }

  async upsertForBrand(
    brandId: string,
    input: UpsertBrandVoiceInput,
    editor: BrandGuidelineEditor,
    changeNote: string | null,
  ): Promise<BrandVoice> {
    const data = toPrismaUpsertData(input);
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.brandVoice.upsert({
        where: { brandId },
        create: { brandId, ...data },
        update: data,
      });
      await writeBrandGuidelinesVersion(tx, brandId, editor, changeNote);
      return toBrandVoice(row);
    });
  }
}
