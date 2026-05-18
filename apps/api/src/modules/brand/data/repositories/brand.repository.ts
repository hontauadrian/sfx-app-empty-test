import { Inject, Injectable } from '@nestjs/common';
import type {
  Brand,
  BrandRepository,
  CreateBrandInput,
  RenameBrandInput,
} from '@sfx/domain';
import type { PrismaClient } from '@sfx/database';
import { toBrand } from '../mapper/brand.mapper';
import { deriveUniqueSlug } from './derive-unique-slug';
import { PRISMA_CLIENT } from './brand.tokens';

@Injectable()
export class BrandPrismaRepository implements BrandRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  async listActive(): Promise<readonly Brand[]> {
    const rows = await this.prisma.brand.findMany({
      where: { deletedAt: null },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map(toBrand);
  }

  async findActiveById(id: string): Promise<Brand | null> {
    const row = await this.prisma.brand.findFirst({
      where: { id, deletedAt: null },
    });
    return row ? toBrand(row) : null;
  }

  async create(input: CreateBrandInput, ownerUserId: string): Promise<Brand> {
    const slug = await deriveUniqueSlug(input.name, async (candidate) => {
      const count = await this.prisma.brand.count({
        where: { slug: candidate, deletedAt: null },
      });
      return count > 0;
    });
    const row = await this.prisma.brand.create({
      data: { name: input.name, slug, ownerUserId },
    });
    return toBrand(row);
  }

  async renameById(
    id: string,
    input: RenameBrandInput,
  ): Promise<Brand | null> {
    const existing = await this.prisma.brand.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) return null;
    const slug = await deriveUniqueSlug(input.name, async (candidate) => {
      const count = await this.prisma.brand.count({
        where: { slug: candidate, deletedAt: null, NOT: { id } },
      });
      return count > 0;
    });
    const row = await this.prisma.brand.update({
      where: { id },
      data: { name: input.name, slug },
    });
    return toBrand(row);
  }

  async softDeleteById(id: string): Promise<boolean> {
    const existing = await this.prisma.brand.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) return false;
    // Tombstone the slug so the active-set unique constraint is freed for
    // a future POST with the same name. The DB unique index is
    // unconditional (covers deleted rows); the suffix uses the row's own
    // cuid so collisions are impossible.
    const tombstoneSlug = `${existing.slug}-d-${existing.id}`.toLowerCase();
    await this.prisma.brand.update({
      where: { id },
      data: { deletedAt: new Date(), slug: tombstoneSlug },
    });
    return true;
  }
}
