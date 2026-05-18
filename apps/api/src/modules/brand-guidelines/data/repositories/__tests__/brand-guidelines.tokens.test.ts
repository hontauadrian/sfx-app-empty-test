import { describe, expect, it } from 'vitest';
import {
  BRAND_GUIDELINES_PRISMA_CLIENT,
  BRAND_METADATA_REPOSITORY,
  DOS_DONTS_REPOSITORY,
  GUIDELINE_SEARCH_REPOSITORY,
} from '../brand-guidelines.tokens';

describe('brand-guidelines.tokens', () => {
  it('exports unique symbols per injection slot', () => {
    const set = new Set([
      BRAND_GUIDELINES_PRISMA_CLIENT,
      DOS_DONTS_REPOSITORY,
      BRAND_METADATA_REPOSITORY,
      GUIDELINE_SEARCH_REPOSITORY,
    ]);
    expect(set.size).toBe(4);
    expect(typeof BRAND_GUIDELINES_PRISMA_CLIENT).toBe('symbol');
  });

  it('declares the module-owned PRISMA_CLIENT symbol (ADR-006: each module owns its own)', () => {
    expect(BRAND_GUIDELINES_PRISMA_CLIENT.description).toBe('BRAND_GUIDELINES_PRISMA_CLIENT');
  });
});
