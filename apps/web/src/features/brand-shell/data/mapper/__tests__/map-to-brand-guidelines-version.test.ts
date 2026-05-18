import { describe, expect, it } from 'vitest';
import type {
  BrandGuidelinesVersionDataModel,
  BrandGuidelinesVersionsPageDataModel,
} from '../../model/brand-guidelines-version-data-model';
import {
  mapToBrandGuidelinesVersion,
  mapToBrandGuidelinesVersionsPage,
} from '../map-to-brand-guidelines-version';

function makeData(): BrandGuidelinesVersionDataModel {
  return {
    id: 'v-1',
    brandId: 'b-1',
    snapshot: {
      voice: {
        brandId: 'b-1',
        tone: 'Bold',
        preferredVocabulary: [],
        restrictedVocabulary: [],
        messagingPillars: [],
        writingStyleRules: '',
        audienceRules: [],
        approvedExamples: [],
        rejectedExamples: [],
        createdAt: '2026-05-17T00:00:00.000Z',
        updatedAt: '2026-05-17T00:00:00.000Z',
      },
      visual: {
        brandId: 'b-1',
        logoUsage: 'Default',
        colorPalette: [],
        typography: [],
        spacingGuidance: '',
        imageStyleGuidance: '',
        iconographyGuidance: '',
        usageRestrictions: '',
        createdAt: '2026-05-17T00:00:00.000Z',
        updatedAt: '2026-05-17T00:00:00.000Z',
      },
      dosAndDonts: [
        {
          id: 'dd-1',
          brandId: 'b-1',
          type: 'do',
          category: 'tone',
          ruleText: 'Be concise',
          exampleText: null,
          createdAt: '2026-05-17T01:00:00.000Z',
          updatedAt: '2026-05-17T01:00:00.000Z',
        },
      ],
      metadata: {
        brandId: 'b-1',
        ownerUserId: 'u-1',
        lastUpdatedAt: '2026-05-17T02:00:00.000Z',
        lastUpdatedByUserId: 'u-1',
        tags: ['launch'],
        createdAt: '2026-05-17T00:00:00.000Z',
        updatedAt: '2026-05-17T02:00:00.000Z',
      },
    },
    editorUserId: 'u-1',
    editorDisplayName: 'admin@example.com',
    changeNote: 'first save',
    createdAt: '2026-05-17T03:00:00.000Z',
  };
}

describe('mapToBrandGuidelinesVersion', () => {
  it('rehydrates Date fields and preserves the four sub-resources', () => {
    const version = mapToBrandGuidelinesVersion(makeData());
    expect(version.id).toBe('v-1');
    expect(version.createdAt).toBeInstanceOf(Date);
    expect(version.snapshot.voice?.tone).toBe('Bold');
    expect(version.snapshot.visual?.logoUsage).toBe('Default');
    expect(version.snapshot.dosAndDonts).toHaveLength(1);
    expect(version.snapshot.dosAndDonts[0]?.createdAt).toBeInstanceOf(Date);
    expect(version.snapshot.metadata?.tags).toEqual(['launch']);
  });

  it('preserves null sub-resources', () => {
    const empty: BrandGuidelinesVersionDataModel = {
      ...makeData(),
      snapshot: { voice: null, visual: null, dosAndDonts: [], metadata: null },
    };
    const version = mapToBrandGuidelinesVersion(empty);
    expect(version.snapshot.voice).toBeNull();
    expect(version.snapshot.metadata).toBeNull();
    expect(version.snapshot.dosAndDonts).toEqual([]);
  });

  it('preserves null changeNote', () => {
    const data: BrandGuidelinesVersionDataModel = { ...makeData(), changeNote: null };
    expect(mapToBrandGuidelinesVersion(data).changeNote).toBeNull();
  });
});

describe('mapToBrandGuidelinesVersionsPage', () => {
  it('maps each item and preserves nextCursor', () => {
    const page: BrandGuidelinesVersionsPageDataModel = {
      items: [makeData()],
      nextCursor: 'v-1',
    };
    const result = mapToBrandGuidelinesVersionsPage(page);
    expect(result.items[0]?.id).toBe('v-1');
    expect(result.nextCursor).toBe('v-1');
  });

  it('preserves empty page with null nextCursor', () => {
    const page: BrandGuidelinesVersionsPageDataModel = { items: [], nextCursor: null };
    const result = mapToBrandGuidelinesVersionsPage(page);
    expect(result.items).toHaveLength(0);
    expect(result.nextCursor).toBeNull();
  });
});
