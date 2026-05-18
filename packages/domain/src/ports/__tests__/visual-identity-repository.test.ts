import { describe, expect, it } from 'vitest';
import type {
  UpsertVisualIdentityInput,
  VisualIdentity,
} from '../../entities/visual-identity';
import type { BrandGuidelineEditor } from '../brand-voice-repository';
import type { VisualIdentityRepository } from '../visual-identity-repository';

describe('VisualIdentityRepository port', () => {
  const editor: BrandGuidelineEditor = {
    editorUserId: 'subject-admin',
    editorDisplayName: 'admin@example.test',
  };

  const sample: VisualIdentity = {
    brandId: 'clxbrand0001',
    logoUsage: 'Default usage',
    colorPalette: [],
    typography: [],
    spacingGuidance: '',
    imageStyleGuidance: '',
    iconographyGuidance: '',
    usageRestrictions: '',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const repo: VisualIdentityRepository = {
    async findByBrandId(brandId) {
      return brandId === sample.brandId ? sample : null;
    },
    async upsertForBrand(brandId, input, ed) {
      expect(ed.editorUserId).toBe(editor.editorUserId);
      return { ...sample, brandId, logoUsage: input.logoUsage };
    },
  };

  it('findByBrandId returns the row when present', async () => {
    const row = await repo.findByBrandId('clxbrand0001');
    expect(row?.logoUsage).toBe('Default usage');
  });

  it('findByBrandId returns null when missing', async () => {
    expect(await repo.findByBrandId('unknown')).toBeNull();
  });

  it('upsertForBrand returns the persisted entity', async () => {
    const input: UpsertVisualIdentityInput = { logoUsage: 'Mono only' };
    const row = await repo.upsertForBrand('clxbrand0001', input, editor);
    expect(row.logoUsage).toBe('Mono only');
    expect(row.brandId).toBe('clxbrand0001');
  });
});
