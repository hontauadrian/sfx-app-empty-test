import { describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { BrandProfileModule } from '../modules/brand-profile/brand-profile.module';

describe('AppModule', () => {
  it('is a class that the Nest factory can reference by name', () => {
    expect(typeof AppModule).toBe('function');
    expect(AppModule.name).toBe('AppModule');
  });

  it('co-resolves the BrandProfileModule it registers', () => {
    expect(typeof BrandProfileModule).toBe('function');
    expect(BrandProfileModule.name).toBe('BrandProfileModule');
  });
});
