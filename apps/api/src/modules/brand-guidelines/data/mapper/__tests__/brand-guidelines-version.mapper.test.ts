import { describe, expect, it } from 'vitest';
import type { BrandGuidelinesSnapshot } from '@sfx/domain';
import type { BrandGuidelinesVersionRow } from '../../model/brand-guidelines-version-data-model';
import {
  toBrandGuidelinesVersion,
  toVersionSnapshotJson,
} from '../brand-guidelines-version.mapper';

function fullSnapshot(): BrandGuidelinesSnapshot {
  return {
    voice: {
      brandId: 'brand-1',
      tone: 'Bold',
      preferredVocabulary: ['craft'],
      restrictedVocabulary: ['cheap'],
      messagingPillars: [{ title: 'Trust', description: 'We deliver.' }],
      writingStyleRules: 'Short sentences.',
      audienceRules: [{ audience: 'Buyers', rules: 'Lead with value.' }],
      approvedExamples: [{ phrase: 'Partner up.' }],
      rejectedExamples: [{ phrase: 'Cheap deal', reason: 'Negative.' }],
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    },
    visual: {
      brandId: 'brand-1',
      logoUsage: 'Use primary mark',
      colorPalette: [{ name: 'Primary', hex: '#1A2B3C', usageNotes: null }],
      typography: [{ font: 'Inter', weight: '500', usageContext: null }],
      spacingGuidance: '',
      imageStyleGuidance: '',
      iconographyGuidance: '',
      usageRestrictions: '',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    },
    dosAndDonts: [
      {
        id: 'dd-1',
        brandId: 'brand-1',
        type: 'do',
        category: 'tone',
        ruleText: 'Be concise',
        exampleText: null,
        createdAt: new Date('2026-01-03T00:00:00.000Z'),
        updatedAt: new Date('2026-01-03T00:00:00.000Z'),
      },
    ],
    metadata: {
      brandId: 'brand-1',
      ownerUserId: 'user-1',
      lastUpdatedAt: new Date('2026-01-02T00:00:00.000Z'),
      lastUpdatedByUserId: 'user-1',
      tags: ['launch'],
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    },
  };
}

describe('toVersionSnapshotJson', () => {
  it('serializes a populated snapshot with ISO-string Date fields', () => {
    const json = toVersionSnapshotJson(fullSnapshot());
    expect((json.voice as Record<string, unknown>).createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect((json.visual as Record<string, unknown>).updatedAt).toBe('2026-01-02T00:00:00.000Z');
    expect(((json.dosAndDonts as unknown[])[0] as Record<string, unknown>).createdAt).toBe(
      '2026-01-03T00:00:00.000Z',
    );
    expect((json.metadata as Record<string, unknown>).lastUpdatedAt).toBe(
      '2026-01-02T00:00:00.000Z',
    );
  });

  it('serializes a fully null snapshot', () => {
    const json = toVersionSnapshotJson({
      voice: null,
      visual: null,
      dosAndDonts: [],
      metadata: null,
    });
    expect(json.voice).toBeNull();
    expect(json.visual).toBeNull();
    expect(json.dosAndDonts).toEqual([]);
    expect(json.metadata).toBeNull();
  });
});

describe('toBrandGuidelinesVersion', () => {
  it('rehydrates Date fields on every sub-resource', () => {
    const snapshotJson = toVersionSnapshotJson(fullSnapshot());
    const row: BrandGuidelinesVersionRow = {
      id: 'v-1',
      brandId: 'brand-1',
      snapshot: snapshotJson as never,
      editorUserId: 'user-1',
      editorDisplayName: 'Admin One',
      changeNote: 'first save',
      createdAt: new Date('2026-01-04T00:00:00.000Z'),
    };
    const version = toBrandGuidelinesVersion(row);
    expect(version.id).toBe('v-1');
    expect(version.brandId).toBe('brand-1');
    expect(version.changeNote).toBe('first save');
    expect(version.createdAt).toBeInstanceOf(Date);
    expect(version.snapshot.voice?.createdAt).toBeInstanceOf(Date);
    expect(version.snapshot.visual?.updatedAt).toBeInstanceOf(Date);
    expect(version.snapshot.dosAndDonts[0]?.createdAt).toBeInstanceOf(Date);
    expect(version.snapshot.metadata?.lastUpdatedAt).toBeInstanceOf(Date);
    expect(version.snapshot.voice?.tone).toBe('Bold');
    expect(version.snapshot.dosAndDonts.length).toBe(1);
  });

  it('preserves null sub-resources', () => {
    const row: BrandGuidelinesVersionRow = {
      id: 'v-2',
      brandId: 'brand-1',
      snapshot: {
        voice: null,
        visual: null,
        dosAndDonts: [],
        metadata: null,
      } as never,
      editorUserId: 'user-1',
      editorDisplayName: 'Admin One',
      changeNote: null,
      createdAt: new Date(),
    };
    const version = toBrandGuidelinesVersion(row);
    expect(version.snapshot.voice).toBeNull();
    expect(version.snapshot.visual).toBeNull();
    expect(version.snapshot.dosAndDonts.length).toBe(0);
    expect(version.snapshot.metadata).toBeNull();
    expect(version.changeNote).toBeNull();
  });

  it('gracefully handles malformed snapshot JSON', () => {
    const row: BrandGuidelinesVersionRow = {
      id: 'v-3',
      brandId: 'brand-1',
      snapshot: null as never,
      editorUserId: 'user-1',
      editorDisplayName: 'Admin One',
      changeNote: null,
      createdAt: new Date(),
    };
    const version = toBrandGuidelinesVersion(row);
    expect(version.snapshot.voice).toBeNull();
    expect(version.snapshot.dosAndDonts).toEqual([]);
  });
});
