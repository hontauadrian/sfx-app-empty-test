import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('AppModule wiring', () => {
  it('imports BrandProfileModule', () => {
    const source = readFileSync(join(__dirname, '..', 'app.module.ts'), 'utf8');
    expect(source).toContain("from './modules/brand-profile/brand-profile.module'");
    expect(source).toContain('BrandProfileModule');
  });
});
