import { describe, expect, it } from 'vitest';
import { BrandProfileModule } from '../brand-profile.module';
import { BrandProfileController } from '../application/controllers/brand-profile.controller';
import { BrandProfileRepository } from '../data/repositories/brand-profile.repository';

describe('BrandProfileModule', () => {
  it('is a class that can be referenced by name', () => {
    expect(typeof BrandProfileModule).toBe('function');
    expect(BrandProfileModule.name).toBe('BrandProfileModule');
  });

  it('co-located controller and repository classes are exported and importable', () => {
    expect(typeof BrandProfileController).toBe('function');
    expect(typeof BrandProfileRepository).toBe('function');
  });
});
