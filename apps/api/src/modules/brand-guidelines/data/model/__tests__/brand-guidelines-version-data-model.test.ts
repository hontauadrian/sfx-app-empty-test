import { describe, expect, it } from 'vitest';
import type { BrandGuidelinesVersionRow } from '../brand-guidelines-version-data-model';

describe('BrandGuidelinesVersionRow', () => {
  it('compiles a literal that satisfies the structural shape', () => {
    const row: BrandGuidelinesVersionRow = {
      id: 'v-1',
      brandId: 'brand-1',
      snapshot: { voice: null, visual: null, dosAndDonts: [], metadata: null },
      editorUserId: 'u-1',
      editorDisplayName: 'Admin',
      changeNote: null,
      createdAt: new Date(),
    };
    expect(row.id).toBe('v-1');
    expect(row.changeNote).toBeNull();
  });

  it('accepts a populated changeNote', () => {
    const row: BrandGuidelinesVersionRow = {
      id: 'v-2',
      brandId: 'brand-1',
      snapshot: { voice: null, visual: null, dosAndDonts: [], metadata: null },
      editorUserId: 'u-1',
      editorDisplayName: 'Admin',
      changeNote: 'first save',
      createdAt: new Date(),
    };
    expect(row.changeNote).toBe('first save');
  });
});
