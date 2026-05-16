import { describe, expect, it } from 'vitest';
import { PRISMA_CLIENT } from '../prisma-client.token';

describe('PRISMA_CLIENT token (brand-voice)', () => {
  it('is a Symbol with a descriptive label', () => {
    expect(typeof PRISMA_CLIENT).toBe('symbol');
    expect(PRISMA_CLIENT.toString()).toContain('PRISMA_CLIENT');
  });
});
