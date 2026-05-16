import { Inject, Injectable } from '@nestjs/common';
import type {
  DosAndDontEntry as PrismaDosAndDontEntry,
  PrismaClient,
} from '@sfx/database';
import {
  type DosAndDontCategory,
  type DosAndDontCreateInput,
  type DosAndDontEntry,
  type DosAndDontListFilter,
  type DosAndDontType,
  type DosAndDontUpdatePatch,
  type IDosAndDontRepository,
} from '@sfx/domain';
import { PRISMA_CLIENT } from '../../infrastructure/prisma-client.token';

function toDomain(row: PrismaDosAndDontEntry): DosAndDontEntry {
  return {
    id: row.id,
    brandId: row.brandId,
    type: row.type as DosAndDontType,
    category: row.category as DosAndDontCategory,
    title: row.title,
    body: row.body,
    suggestedCorrection: row.suggestedCorrection,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class DosAndDontRepository implements IDosAndDontRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  async listByBrand(
    brandId: string,
    filter?: DosAndDontListFilter,
  ): Promise<DosAndDontEntry[]> {
    const rows = await this.prisma.dosAndDontEntry.findMany({
      where: {
        brandId,
        ...(filter?.category ? { category: filter.category } : {}),
      },
      orderBy: [
        { category: 'asc' },
        { type: 'asc' },
        { createdAt: 'desc' },
      ],
    });
    return rows.map(toDomain);
  }

  async findById(brandId: string, entryId: string): Promise<DosAndDontEntry | null> {
    const row = await this.prisma.dosAndDontEntry.findFirst({
      where: { id: entryId, brandId },
    });
    return row ? toDomain(row) : null;
  }

  async create(input: DosAndDontCreateInput): Promise<DosAndDontEntry> {
    const [row] = await this.prisma.$transaction([
      this.prisma.dosAndDontEntry.create({
        data: {
          brandId: input.brandId,
          type: input.type,
          category: input.category,
          title: input.title,
          body: input.body,
          suggestedCorrection: input.suggestedCorrection,
        },
      }),
      this.prisma.brandProfile.update({
        where: { id: input.brandId },
        data: {},
      }),
    ]);
    return toDomain(row);
  }

  async update(
    brandId: string,
    entryId: string,
    patch: DosAndDontUpdatePatch,
  ): Promise<DosAndDontEntry | null> {
    const existing = await this.prisma.dosAndDontEntry.findFirst({
      where: { id: entryId, brandId },
      select: { id: true },
    });
    if (!existing) return null;
    const [row] = await this.prisma.$transaction([
      this.prisma.dosAndDontEntry.update({
        where: { id: entryId },
        data: {
          type: patch.type,
          category: patch.category,
          title: patch.title,
          body: patch.body,
          suggestedCorrection: patch.suggestedCorrection,
        },
      }),
      this.prisma.brandProfile.update({
        where: { id: brandId },
        data: {},
      }),
    ]);
    return toDomain(row);
  }

  async delete(brandId: string, entryId: string): Promise<boolean> {
    const existing = await this.prisma.dosAndDontEntry.findFirst({
      where: { id: entryId, brandId },
      select: { id: true },
    });
    if (!existing) return false;
    await this.prisma.$transaction([
      this.prisma.dosAndDontEntry.delete({ where: { id: entryId } }),
      this.prisma.brandProfile.update({ where: { id: brandId }, data: {} }),
    ]);
    return true;
  }
}
