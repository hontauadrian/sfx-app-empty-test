import { NotFoundException } from '@nestjs/common';
import type { BrandRepository } from '@sfx/domain';

// Handler-internal helper (NOT a NestJS guard). Asserts the brand
// referenced by `:brandId` is active. Used by the nested-singleton
// controllers so the pipe-then-existence ordering rule holds: Zod
// runs first on the body (PUT), the existence check runs after.
export async function assertBrandActive(
  brandRepository: BrandRepository,
  brandId: string,
): Promise<void> {
  const brand = await brandRepository.findActiveById(brandId);
  if (!brand) {
    throw new NotFoundException('Brand not found');
  }
}
