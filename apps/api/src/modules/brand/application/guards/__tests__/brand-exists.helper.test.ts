import { NotFoundException } from '@nestjs/common';
import type { Brand, BrandRepository } from '@sfx/domain';
import { describe, expect, it } from 'vitest';
import { assertBrandActive } from '../brand-exists.helper';

const sample: Brand = {
  id: 'clxbrand0001',
  name: 'Acme',
  slug: 'acme',
  ownerUserId: 'subject-admin',
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

function makeRepo(present: boolean): BrandRepository {
  return {
    async listActive(): Promise<readonly Brand[]> {
      return present ? [sample] : [];
    },
    async findActiveById(id: string): Promise<Brand | null> {
      return present && id === sample.id ? sample : null;
    },
    async create(): Promise<Brand> {
      throw new Error('unused');
    },
    async renameById(): Promise<Brand | null> {
      throw new Error('unused');
    },
    async softDeleteById(): Promise<boolean> {
      throw new Error('unused');
    },
  };
}

describe('assertBrandActive', () => {
  it('resolves silently when the brand is present and active', async () => {
    await expect(assertBrandActive(makeRepo(true), sample.id)).resolves.toBeUndefined();
  });

  it('throws NotFoundException when the brand is missing', async () => {
    await expect(assertBrandActive(makeRepo(false), 'absent')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("uses the documented message 'Brand not found'", async () => {
    try {
      await assertBrandActive(makeRepo(false), 'absent');
      throw new Error('expected throw');
    } catch (error) {
      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as NotFoundException).message).toBe('Brand not found');
    }
  });
});
