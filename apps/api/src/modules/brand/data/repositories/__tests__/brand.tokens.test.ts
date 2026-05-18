import { BRAND_REPOSITORY, PRISMA_CLIENT } from '../brand.tokens';

describe('brand DI tokens', () => {
  it('exports symbol tokens with stable descriptions', () => {
    expect(typeof BRAND_REPOSITORY).toBe('symbol');
    expect(typeof PRISMA_CLIENT).toBe('symbol');
    expect(BRAND_REPOSITORY.description).toBe('BRAND_REPOSITORY');
    expect(PRISMA_CLIENT.description).toBe('BRAND_PRISMA_CLIENT');
  });

  it('emits distinct symbols (referentially unique)', () => {
    expect(BRAND_REPOSITORY).not.toBe(PRISMA_CLIENT);
  });
});
