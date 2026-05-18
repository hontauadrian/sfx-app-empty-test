import { Prisma } from '@sfx/database';
import type {
  BrandVoice,
  BrandVoiceAudienceRule,
  BrandVoiceApprovedExample,
  BrandVoiceMessagingPillar,
  BrandVoiceRejectedExample,
  UpsertBrandVoiceInput,
} from '@sfx/domain';
import type { PrismaClient } from '@sfx/database';

export type BrandVoiceRow = NonNullable<
  Awaited<ReturnType<PrismaClient['brandVoice']['findUnique']>>
>;

function toMessagingPillars(value: unknown): readonly BrandVoiceMessagingPillar[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is { title: string; description: string } =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as { title?: unknown }).title === 'string' &&
        typeof (item as { description?: unknown }).description === 'string',
    )
    .map((item) => ({ title: item.title, description: item.description }));
}

function toAudienceRules(value: unknown): readonly BrandVoiceAudienceRule[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is { audience: string; rules: string } =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as { audience?: unknown }).audience === 'string' &&
        typeof (item as { rules?: unknown }).rules === 'string',
    )
    .map((item) => ({ audience: item.audience, rules: item.rules }));
}

function toApprovedExamples(value: unknown): readonly BrandVoiceApprovedExample[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is { phrase: string } =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as { phrase?: unknown }).phrase === 'string',
    )
    .map((item) => ({ phrase: item.phrase }));
}

function toRejectedExamples(value: unknown): readonly BrandVoiceRejectedExample[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is { phrase: string; reason?: string | null } =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as { phrase?: unknown }).phrase === 'string',
    )
    .map((item) => ({
      phrase: item.phrase,
      reason: typeof item.reason === 'string' ? item.reason : null,
    }));
}

export function toBrandVoice(row: BrandVoiceRow): BrandVoice {
  return {
    brandId: row.brandId,
    tone: row.tone,
    preferredVocabulary: row.preferredVocabulary ?? [],
    restrictedVocabulary: row.restrictedVocabulary ?? [],
    messagingPillars: toMessagingPillars(row.messagingPillars),
    writingStyleRules: row.writingStyleRules ?? '',
    audienceRules: toAudienceRules(row.audienceRules),
    approvedExamples: toApprovedExamples(row.approvedExamples),
    rejectedExamples: toRejectedExamples(row.rejectedExamples),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export type BrandVoiceUpsertData = {
  tone: string;
  preferredVocabulary?: string[];
  restrictedVocabulary?: string[];
  messagingPillars?: Prisma.InputJsonValue;
  writingStyleRules?: string;
  audienceRules?: Prisma.InputJsonValue;
  approvedExamples?: Prisma.InputJsonValue;
  rejectedExamples?: Prisma.InputJsonValue;
};

export function toPrismaUpsertData(input: UpsertBrandVoiceInput): BrandVoiceUpsertData {
  const data: BrandVoiceUpsertData = { tone: input.tone };
  if (input.preferredVocabulary !== undefined) {
    data.preferredVocabulary = [...input.preferredVocabulary];
  }
  if (input.restrictedVocabulary !== undefined) {
    data.restrictedVocabulary = [...input.restrictedVocabulary];
  }
  if (input.messagingPillars !== undefined) {
    data.messagingPillars = input.messagingPillars.map((p) => ({
      title: p.title,
      description: p.description,
    })) as unknown as Prisma.InputJsonValue;
  }
  if (input.writingStyleRules !== undefined) {
    data.writingStyleRules = input.writingStyleRules ?? '';
  }
  if (input.audienceRules !== undefined) {
    data.audienceRules = input.audienceRules.map((a) => ({
      audience: a.audience,
      rules: a.rules,
    })) as unknown as Prisma.InputJsonValue;
  }
  if (input.approvedExamples !== undefined) {
    data.approvedExamples = input.approvedExamples.map((e) => ({
      phrase: e.phrase,
    })) as unknown as Prisma.InputJsonValue;
  }
  if (input.rejectedExamples !== undefined) {
    data.rejectedExamples = input.rejectedExamples.map((e) => ({
      phrase: e.phrase,
      reason: e.reason ?? null,
    })) as unknown as Prisma.InputJsonValue;
  }
  return data;
}
