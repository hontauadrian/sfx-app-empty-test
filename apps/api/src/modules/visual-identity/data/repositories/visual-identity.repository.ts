import { Inject, Injectable } from '@nestjs/common';
import type {
  Prisma,
  PrismaClient,
  VisualIdentity as PrismaVisualIdentity,
} from '@sfx/database';
import {
  BRAND_PROFILE_REPOSITORY,
  type IBrandProfileRepository,
  type IVisualIdentityRepository,
  type VisualIdentity,
  type VisualIdentityColourPaletteEntry,
  type VisualIdentityTypographyRule,
  type VisualIdentityWritePayload,
} from '@sfx/domain';
import { PRISMA_CLIENT } from '../../infrastructure/prisma-client.token';

function toColourPalette(
  value: Prisma.JsonValue | null,
): readonly VisualIdentityColourPaletteEntry[] {
  if (!Array.isArray(value)) return [];
  const result: VisualIdentityColourPaletteEntry[] = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const candidate = entry as Record<string, unknown>;
    if (typeof candidate.name !== 'string' || typeof candidate.hex !== 'string') continue;
    const usage =
      candidate.usage === undefined || candidate.usage === null
        ? null
        : typeof candidate.usage === 'string'
          ? candidate.usage
          : null;
    result.push({ name: candidate.name, hex: candidate.hex, usage });
  }
  return result;
}

function toTypographyRules(
  value: Prisma.JsonValue | null,
): readonly VisualIdentityTypographyRule[] {
  if (!Array.isArray(value)) return [];
  const result: VisualIdentityTypographyRule[] = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const candidate = entry as Record<string, unknown>;
    if (typeof candidate.role !== 'string' || typeof candidate.family !== 'string')
      continue;
    const optional = (key: string): string | null => {
      const raw = candidate[key];
      if (raw === undefined || raw === null) return null;
      return typeof raw === 'string' ? raw : null;
    };
    result.push({
      role: candidate.role,
      family: candidate.family,
      weight: optional('weight'),
      size: optional('size'),
      notes: optional('notes'),
    });
  }
  return result;
}

function toDomain(row: PrismaVisualIdentity): VisualIdentity {
  return {
    id: row.id,
    brandId: row.brandId,
    logoUsageRules: row.logoUsageRules,
    colourPalette: toColourPalette(row.colourPalette),
    typographyRules: toTypographyRules(row.typographyRules),
    spacingLayoutGuidance: row.spacingLayoutGuidance,
    imageStyleGuidance: row.imageStyleGuidance,
    iconographyGuidance: row.iconographyGuidance,
    usageRestrictions: row.usageRestrictions,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function payloadToData(payload: VisualIdentityWritePayload): {
  logoUsageRules: string | null;
  colourPalette: Prisma.InputJsonValue;
  typographyRules: Prisma.InputJsonValue;
  spacingLayoutGuidance: string | null;
  imageStyleGuidance: string | null;
  iconographyGuidance: string | null;
  usageRestrictions: string | null;
} {
  return {
    logoUsageRules: payload.logoUsageRules,
    colourPalette: payload.colourPalette.map((entry) => ({
      name: entry.name,
      hex: entry.hex,
      usage: entry.usage,
    })),
    typographyRules: payload.typographyRules.map((entry) => ({
      role: entry.role,
      family: entry.family,
      weight: entry.weight,
      size: entry.size,
      notes: entry.notes,
    })),
    spacingLayoutGuidance: payload.spacingLayoutGuidance,
    imageStyleGuidance: payload.imageStyleGuidance,
    iconographyGuidance: payload.iconographyGuidance,
    usageRestrictions: payload.usageRestrictions,
  };
}

@Injectable()
export class VisualIdentityRepository implements IVisualIdentityRepository {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    @Inject(BRAND_PROFILE_REPOSITORY)
    private readonly brandProfileRepository: IBrandProfileRepository,
  ) {}

  async findByBrand(
    brandId: string,
    ownerSubject: string,
  ): Promise<VisualIdentity | null> {
    const brand = await this.brandProfileRepository.findById(brandId, ownerSubject);
    if (!brand) return null;
    const row = await this.prisma.visualIdentity.findUnique({ where: { brandId } });
    return row ? toDomain(row) : null;
  }

  async upsertForBrand(
    brandId: string,
    ownerSubject: string,
    payload: VisualIdentityWritePayload,
  ): Promise<VisualIdentity | null> {
    const brand = await this.brandProfileRepository.findById(brandId, ownerSubject);
    if (!brand) return null;
    const data = payloadToData(payload);
    const row = await this.prisma.visualIdentity.upsert({
      where: { brandId },
      create: { brandId, ...data },
      update: data,
    });
    return toDomain(row);
  }
}
