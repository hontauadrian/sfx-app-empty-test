import { describe, expect, it } from 'vitest';
import { PRISMA_CLIENT } from '../prisma-client.token';

describe('dos-and-donts PRISMA_CLIENT token', () => {
  it('is a unique symbol with a descriptive label', () => {
    expect(typeof PRISMA_CLIENT).toBe('symbol');
    expect(PRISMA_CLIENT.description).toBe('PRISMA_CLIENT');
    expect(PRISMA_CLIENT).not.toBe(Symbol('PRISMA_CLIENT'));
  });
});
