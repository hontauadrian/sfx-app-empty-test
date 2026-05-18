import type {
  BrandGuidelinesSnapshot,
  BrandGuidelinesVersion,
  BrandMetadata,
  BrandVoice,
  DosDontsCategory,
  DosDontsEntry,
  DosDontsType,
  VisualIdentity,
} from '@sfx/domain';
import type { BrandGuidelinesVersionRow } from '../model/brand-guidelines-version-data-model';
import { toBrandVoice, type BrandVoiceRow } from '../../../brand/data/mapper/brand-voice.mapper';
import {
  toVisualIdentity,
  type VisualIdentityRow,
} from '../../../brand/data/mapper/visual-identity.mapper';
import { toDosDontsEntry } from './dos-and-donts.mapper';
import { toBrandMetadata } from './brand-metadata.mapper';
import type { DosDontsRow } from '../model/dos-and-donts-data-model';
import type { BrandMetadataRow } from '../model/brand-metadata-data-model';

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseIsoDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'string') return new Date(value);
  return new Date(0);
}

function rehydrateVoice(value: unknown): BrandVoice | null {
  if (!isRecord(value)) return null;
  const synthetic: BrandVoiceRow = {
    brandId: typeof value.brandId === 'string' ? value.brandId : '',
    tone: typeof value.tone === 'string' ? value.tone : '',
    preferredVocabulary: Array.isArray(value.preferredVocabulary)
      ? (value.preferredVocabulary as string[])
      : [],
    restrictedVocabulary: Array.isArray(value.restrictedVocabulary)
      ? (value.restrictedVocabulary as string[])
      : [],
    messagingPillars: (value.messagingPillars ?? []) as never,
    writingStyleRules: typeof value.writingStyleRules === 'string' ? value.writingStyleRules : '',
    audienceRules: (value.audienceRules ?? []) as never,
    approvedExamples: (value.approvedExamples ?? []) as never,
    rejectedExamples: (value.rejectedExamples ?? []) as never,
    createdAt: parseIsoDate(value.createdAt),
    updatedAt: parseIsoDate(value.updatedAt),
  };
  return toBrandVoice(synthetic);
}

function rehydrateVisual(value: unknown): VisualIdentity | null {
  if (!isRecord(value)) return null;
  const synthetic: VisualIdentityRow = {
    brandId: typeof value.brandId === 'string' ? value.brandId : '',
    logoUsage: typeof value.logoUsage === 'string' ? value.logoUsage : '',
    colorPalette: (value.colorPalette ?? []) as never,
    typography: (value.typography ?? []) as never,
    spacingGuidance: typeof value.spacingGuidance === 'string' ? value.spacingGuidance : '',
    imageStyleGuidance:
      typeof value.imageStyleGuidance === 'string' ? value.imageStyleGuidance : '',
    iconographyGuidance:
      typeof value.iconographyGuidance === 'string' ? value.iconographyGuidance : '',
    usageRestrictions: typeof value.usageRestrictions === 'string' ? value.usageRestrictions : '',
    createdAt: parseIsoDate(value.createdAt),
    updatedAt: parseIsoDate(value.updatedAt),
  };
  return toVisualIdentity(synthetic);
}

function rehydrateDosDontsArray(value: unknown): readonly DosDontsEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((item) => {
      const synthetic: DosDontsRow = {
        id: typeof item.id === 'string' ? item.id : '',
        brandId: typeof item.brandId === 'string' ? item.brandId : '',
        type: typeof item.type === 'string' ? (item.type as DosDontsType) : ('do' as DosDontsType),
        category:
          typeof item.category === 'string'
            ? (item.category as DosDontsCategory)
            : ('tone' as DosDontsCategory),
        ruleText: typeof item.ruleText === 'string' ? item.ruleText : '',
        exampleText: typeof item.exampleText === 'string' ? item.exampleText : null,
        createdAt: parseIsoDate(item.createdAt),
        updatedAt: parseIsoDate(item.updatedAt),
      };
      return toDosDontsEntry(synthetic);
    });
}

function rehydrateMetadata(value: unknown): BrandMetadata | null {
  if (!isRecord(value)) return null;
  const synthetic: BrandMetadataRow = {
    brandId: typeof value.brandId === 'string' ? value.brandId : '',
    ownerUserId: typeof value.ownerUserId === 'string' ? value.ownerUserId : '',
    lastUpdatedAt: parseIsoDate(value.lastUpdatedAt),
    lastUpdatedByUserId:
      typeof value.lastUpdatedByUserId === 'string' ? value.lastUpdatedByUserId : '',
    tags: Array.isArray(value.tags) ? (value.tags as string[]) : [],
    createdAt: parseIsoDate(value.createdAt),
    updatedAt: parseIsoDate(value.updatedAt),
  };
  return toBrandMetadata(synthetic);
}

export function toVersionSnapshotJson(snapshot: BrandGuidelinesSnapshot): JsonRecord {
  const voiceJson = snapshot.voice
    ? {
        ...snapshot.voice,
        createdAt: snapshot.voice.createdAt.toISOString(),
        updatedAt: snapshot.voice.updatedAt.toISOString(),
        messagingPillars: snapshot.voice.messagingPillars.map((p) => ({ ...p })),
        audienceRules: snapshot.voice.audienceRules.map((a) => ({ ...a })),
        approvedExamples: snapshot.voice.approvedExamples.map((e) => ({ ...e })),
        rejectedExamples: snapshot.voice.rejectedExamples.map((e) => ({ ...e })),
        preferredVocabulary: [...snapshot.voice.preferredVocabulary],
        restrictedVocabulary: [...snapshot.voice.restrictedVocabulary],
      }
    : null;
  const visualJson = snapshot.visual
    ? {
        ...snapshot.visual,
        createdAt: snapshot.visual.createdAt.toISOString(),
        updatedAt: snapshot.visual.updatedAt.toISOString(),
        colorPalette: snapshot.visual.colorPalette.map((p) => ({ ...p })),
        typography: snapshot.visual.typography.map((t) => ({ ...t })),
      }
    : null;
  const dosAndDontsJson = snapshot.dosAndDonts.map((entry) => ({
    ...entry,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  }));
  const metadataJson = snapshot.metadata
    ? {
        ...snapshot.metadata,
        lastUpdatedAt: snapshot.metadata.lastUpdatedAt.toISOString(),
        createdAt: snapshot.metadata.createdAt.toISOString(),
        updatedAt: snapshot.metadata.updatedAt.toISOString(),
        tags: [...snapshot.metadata.tags],
      }
    : null;
  return {
    voice: voiceJson,
    visual: visualJson,
    dosAndDonts: dosAndDontsJson,
    metadata: metadataJson,
  };
}

export function toBrandGuidelinesVersion(
  row: BrandGuidelinesVersionRow,
): BrandGuidelinesVersion {
  const snapshotRaw = isRecord(row.snapshot) ? row.snapshot : {};
  const snapshot: BrandGuidelinesSnapshot = {
    voice: rehydrateVoice(snapshotRaw.voice),
    visual: rehydrateVisual(snapshotRaw.visual),
    dosAndDonts: rehydrateDosDontsArray(snapshotRaw.dosAndDonts),
    metadata: rehydrateMetadata(snapshotRaw.metadata),
  };
  return {
    id: row.id,
    brandId: row.brandId,
    snapshot,
    editorUserId: row.editorUserId,
    editorDisplayName: row.editorDisplayName,
    changeNote: row.changeNote,
    createdAt: row.createdAt,
  };
}
