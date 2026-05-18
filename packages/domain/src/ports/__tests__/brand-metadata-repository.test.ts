import type { BrandMetadata } from '../../entities/brand-metadata';
import type {
  BrandMetadataEditor,
  BrandMetadataRepository,
} from '../brand-metadata-repository';

function buildMetadata(overrides: Partial<BrandMetadata> = {}): BrandMetadata {
  return {
    brandId: 'brand-1',
    ownerUserId: 'subject-owner',
    lastUpdatedAt: new Date('2026-05-10T00:00:00.000Z'),
    lastUpdatedByUserId: 'subject-admin',
    tags: [],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-05-10T00:00:00.000Z'),
    ...overrides,
  };
}

describe('BrandMetadataRepository port', () => {
  it('shape: findByBrandId returns metadata or null', async () => {
    const repo: BrandMetadataRepository = {
      async findByBrandId(brandId) {
        return brandId === 'brand-1' ? buildMetadata() : null;
      },
      async upsertByBrandId(brandId, input, editor) {
        return buildMetadata({
          brandId,
          ownerUserId: editor.ownerUserId,
          lastUpdatedByUserId: editor.editorUserId,
          tags: input.tags ?? [],
        });
      },
    };

    expect(await repo.findByBrandId('brand-1')).not.toBeNull();
    expect(await repo.findByBrandId('missing')).toBeNull();
  });

  it('upsertByBrandId carries editor identity through to lastUpdatedByUserId', async () => {
    const editor: BrandMetadataEditor = {
      editorUserId: 'subject-admin',
      ownerUserId: 'subject-owner',
    };
    const repo: BrandMetadataRepository = {
      async findByBrandId() {
        return null;
      },
      async upsertByBrandId(brandId, input, ed) {
        return buildMetadata({
          brandId,
          ownerUserId: ed.ownerUserId,
          lastUpdatedByUserId: ed.editorUserId,
          tags: input.tags ?? ['unchanged'],
        });
      },
    };
    const result = await repo.upsertByBrandId('brand-1', { tags: ['x', 'y'] }, editor);
    expect(result.lastUpdatedByUserId).toBe('subject-admin');
    expect(result.ownerUserId).toBe('subject-owner');
    expect(result.tags).toEqual(['x', 'y']);

    const omitted = await repo.upsertByBrandId('brand-1', {}, editor);
    expect(omitted.tags).toEqual(['unchanged']);
  });
});
