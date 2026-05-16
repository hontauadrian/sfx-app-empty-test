import { Inject, Injectable } from '@nestjs/common';
import type {
  BrandVoice as PrismaBrandVoice,
  Prisma,
  PrismaClient,
} from '@sfx/database';
import {
  BRAND_PROFILE_REPOSITORY,
  type AudienceRule,
  type BrandVoice,
  type BrandVoiceUpsertInput,
  type IBrandProfileRepository,
  type IBrandVoiceRepository,
} from '@sfx/domain';
import { PRISMA_CLIENT } from '../../infrastructure/prisma-client.token';

function toStringArray(value: Prisma.JsonValue | null): readonly string[] {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  for (const entry of value) {
    if (typeof entry === 'string') result.push(entry);
  }
  return result;
}

function toAudienceRules(value: Prisma.JsonValue | null): readonly AudienceRule[] {
  if (!Array.isArray(value)) return [];
  const result: AudienceRule[] = [];
  for (const entry of value) {
    if (
      entry !== null &&
      typeof entry === 'object' &&
      !Array.isArray(entry) &&
      typeof (entry as { audience?: unknown }).audience === 'string' &&
      typeof (entry as { rule?: unknown }).rule === 'string'
    ) {
      const candidate = entry as { audience: string; rule: string };
      result.push({ audience: candidate.audience, rule: candidate.rule });
    }
  }
  return result;
}

function toDomain(row: PrismaBrandVoice): BrandVoice {
  return {
    id: row.id,
    brandProfileId: row.brandProfileId,
    toneOfVoice: row.toneOfVoice,
    preferredVocabulary: toStringArray(row.preferredVocabulary),
    restrictedVocabulary: toStringArray(row.restrictedVocabulary),
    messagingPillars: toStringArray(row.messagingPillars),
    writingStyleRules: toStringArray(row.writingStyleRules),
    audienceRules: toAudienceRules(row.audienceRules),
    approvedExamplePhrases: toStringArray(row.approvedExamplePhrases),
    rejectedExamplePhrases: toStringArray(row.rejectedExamplePhrases),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function payloadToData(payload: BrandVoiceUpsertInput): {
  toneOfVoice: string | null;
  preferredVocabulary: Prisma.InputJsonValue;
  restrictedVocabulary: Prisma.InputJsonValue;
  messagingPillars: Prisma.InputJsonValue;
  writingStyleRules: Prisma.InputJsonValue;
  audienceRules: Prisma.InputJsonValue;
  approvedExamplePhrases: Prisma.InputJsonValue;
  rejectedExamplePhrases: Prisma.InputJsonValue;
} {
  return {
    toneOfVoice: payload.toneOfVoice,
    preferredVocabulary: [...payload.preferredVocabulary],
    restrictedVocabulary: [...payload.restrictedVocabulary],
    messagingPillars: [...payload.messagingPillars],
    writingStyleRules: [...payload.writingStyleRules],
    audienceRules: payload.audienceRules.map((entry) => ({
      audience: entry.audience,
      rule: entry.rule,
    })),
    approvedExamplePhrases: [...payload.approvedExamplePhrases],
    rejectedExamplePhrases: [...payload.rejectedExamplePhrases],
  };
}

@Injectable()
export class BrandVoiceRepository implements IBrandVoiceRepository {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    @Inject(BRAND_PROFILE_REPOSITORY)
    private readonly brandProfileRepository: IBrandProfileRepository,
  ) {}

  async findByBrand(
    brandProfileId: string,
    ownerSubject: string,
  ): Promise<BrandVoice | null> {
    const brand = await this.brandProfileRepository.findById(
      brandProfileId,
      ownerSubject,
    );
    if (!brand) return null;
    const row = await this.prisma.brandVoice.findUnique({
      where: { brandProfileId },
    });
    return row ? toDomain(row) : null;
  }

  async upsertForBrand(
    brandProfileId: string,
    ownerSubject: string,
    payload: BrandVoiceUpsertInput,
  ): Promise<BrandVoice | null> {
    const brand = await this.brandProfileRepository.findById(
      brandProfileId,
      ownerSubject,
    );
    if (!brand) return null;
    const data = payloadToData(payload);
    const row = await this.prisma.brandVoice.upsert({
      where: { brandProfileId },
      create: { brandProfileId, ...data },
      update: data,
    });
    return toDomain(row);
  }
}
