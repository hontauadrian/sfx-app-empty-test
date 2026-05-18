import { describe, expect, it } from 'vitest';
import type {
  BrandGuidelinesSnapshotDataModel,
  BrandGuidelinesVersionDataModel,
  BrandGuidelinesVersionsPageDataModel,
} from '../brand-guidelines-version-data-model';

describe('BrandGuidelinesVersionDataModel', () => {
  it('accepts a fully populated version with null sub-resources', () => {
    const snapshot: BrandGuidelinesSnapshotDataModel = {
      voice: null,
      visual: null,
      dosAndDonts: [],
      metadata: null,
    };
    const version: BrandGuidelinesVersionDataModel = {
      id: 'v-1',
      brandId: 'b-1',
      snapshot,
      editorUserId: 'u-1',
      editorDisplayName: 'Admin',
      changeNote: null,
      createdAt: '2026-05-17T00:00:00.000Z',
    };
    expect(version.changeNote).toBeNull();
    expect(version.snapshot.dosAndDonts).toEqual([]);
  });

  it('page model accepts empty + populated items', () => {
    const empty: BrandGuidelinesVersionsPageDataModel = { items: [], nextCursor: null };
    expect(empty.items).toHaveLength(0);
    expect(empty.nextCursor).toBeNull();
  });
});
