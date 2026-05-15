import { Inject, Injectable } from '@nestjs/common';
import type { BrandProfile as PrismaBrandProfile, PrismaClient } from '@sfx/database';
import {
  type BrandProfile,
  type BrandProfileCreateInput,
  type BrandProfileUpdatePatch,
  type IBrandProfileRepository,
} from '@sfx/domain';
import { PRISMA_CLIENT } from '../../infrastructure/prisma-client.token';

function toDomain(row: PrismaBrandProfile): BrandProfile {
  return {
    id: row.id,
    ownerSubject: row.ownerSubject,
    name: row.name,
    description: row.description,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class BrandProfileRepository implements IBrandProfileRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  async listByOwner(ownerSubject: string): Promise<BrandProfile[]> {
    const rows = await this.prisma.brandProfile.findMany({
      where: { ownerSubject },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map(toDomain);
  }

  async findById(id: string, ownerSubject: string): Promise<BrandProfile | null> {
    const row = await this.prisma.brandProfile.findFirst({
      where: { id, ownerSubject },
    });
    return row ? toDomain(row) : null;
  }

  async create(input: BrandProfileCreateInput): Promise<BrandProfile> {
    const row = await this.prisma.brandProfile.create({
      data: {
        ownerSubject: input.ownerSubject,
        name: input.name,
        description: input.description,
      },
    });
    return toDomain(row);
  }

  async update(
    id: string,
    ownerSubject: string,
    patch: BrandProfileUpdatePatch,
  ): Promise<BrandProfile | null> {
    const result = await this.prisma.brandProfile.updateMany({
      where: { id, ownerSubject },
      data: patch,
    });
    if (result.count === 0) return null;
    const row = await this.prisma.brandProfile.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async delete(id: string, ownerSubject: string): Promise<boolean> {
    const result = await this.prisma.brandProfile.deleteMany({
      where: { id, ownerSubject },
    });
    return result.count > 0;
  }
}
