import { describe, expect, it } from 'vitest';
import { PRISMA_CLIENT } from '../prisma-client.token';

describe('PRISMA_CLIENT token', () => {
  it('is a unique symbol with the expected description', () => {
    expect(typeof PRISMA_CLIENT).toBe('symbol');
    expect(PRISMA_CLIENT.description).toBe('PRISMA_CLIENT');
  });
});
