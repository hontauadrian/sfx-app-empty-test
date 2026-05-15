import { describe, expect, it } from 'vitest';
import { PRISMA_CLIENT } from '../prisma-client.token';

describe('PRISMA_CLIENT token', () => {
  it('is a unique symbol so the DI container cannot collide with other providers', () => {
    expect(typeof PRISMA_CLIENT).toBe('symbol');
    expect(PRISMA_CLIENT.toString()).toContain('PRISMA_CLIENT');
  });
});
