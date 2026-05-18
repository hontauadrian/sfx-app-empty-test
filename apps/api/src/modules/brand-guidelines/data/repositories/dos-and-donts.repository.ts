import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@sfx/database';
import type {
  BrandGuidelineEditor,
  CreateDosDontsEntryInput,
  DosDontsEntry,
  DosDontsRepository,
  ListDosDontsFilters,
  UpdateDosDontsEntryInput,
} from '@sfx/domain';
import { toDosDontsEntry } from '../mapper/dos-and-donts.mapper';
import { BRAND_GUIDELINES_PRISMA_CLIENT } from './brand-guidelines.tokens';
import { writeBrandGuidelinesVersion } from '../version/write-version';

@Injectable()
export class DosDontsPrismaRepository implements DosDontsRepository {
  constructor(
    @Inject(BRAND_GUIDELINES_PRISMA_CLIENT) private readonly prisma: PrismaClient,
  ) {}

  async listByBrand(
    brandId: string,
    filters: ListDosDontsFilters,
  ): Promise<readonly DosDontsEntry[]> {
    const rows = await this.prisma.dosDontsEntry.findMany({
      where: {
        brandId,
        ...(filters.type ? { type: filters.type } : {}),
        ...(filters.category ? { category: filters.category } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map(toDosDontsEntry);
  }

  async findByIdInBrand(brandId: string, entryId: string): Promise<DosDontsEntry | null> {
    const row = await this.prisma.dosDontsEntry.findFirst({
      where: { id: entryId, brandId },
    });
    return row ? toDosDontsEntry(row) : null;
  }

  async createInBrand(
    brandId: string,
    input: CreateDosDontsEntryInput,
    editor: BrandGuidelineEditor,
    changeNote: string | null,
  ): Promise<DosDontsEntry> {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.dosDontsEntry.create({
        data: {
          brandId,
          type: input.type,
          category: input.category,
          ruleText: input.ruleText,
          exampleText: input.exampleText ?? null,
        },
      });
      await writeBrandGuidelinesVersion(tx, brandId, editor, changeNote);
      return toDosDontsEntry(row);
    });
  }

  async updateInBrandById(
    brandId: string,
    entryId: string,
    input: UpdateDosDontsEntryInput,
    editor: BrandGuidelineEditor,
    changeNote: string | null,
  ): Promise<DosDontsEntry | null> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.dosDontsEntry.findFirst({
        where: { id: entryId, brandId },
      });
      if (!existing) return null;
      const row = await tx.dosDontsEntry.update({
        where: { id: entryId },
        data: {
          ...(input.type !== undefined ? { type: input.type } : {}),
          ...(input.category !== undefined ? { category: input.category } : {}),
          ...(input.ruleText !== undefined ? { ruleText: input.ruleText } : {}),
          ...(input.exampleText !== undefined ? { exampleText: input.exampleText } : {}),
        },
      });
      await writeBrandGuidelinesVersion(tx, brandId, editor, changeNote);
      return toDosDontsEntry(row);
    });
  }

  async deleteInBrandById(
    brandId: string,
    entryId: string,
    editor: BrandGuidelineEditor,
    changeNote: string | null,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.dosDontsEntry.findFirst({
        where: { id: entryId, brandId },
      });
      if (!existing) return false;
      await tx.dosDontsEntry.delete({ where: { id: entryId } });
      await writeBrandGuidelinesVersion(tx, brandId, editor, changeNote);
      return true;
    });
  }
}
