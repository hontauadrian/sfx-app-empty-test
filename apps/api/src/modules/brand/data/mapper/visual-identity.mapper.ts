import { Prisma } from '@sfx/database';
import type {
  UpsertVisualIdentityInput,
  VisualIdentity,
  VisualIdentityColorPaletteEntry,
  VisualIdentityTypographyEntry,
} from '@sfx/domain';
import type { PrismaClient } from '@sfx/database';

export type VisualIdentityRow = NonNullable<
  Awaited<ReturnType<PrismaClient['visualIdentity']['findUnique']>>
>;

function toColorPalette(value: unknown): readonly VisualIdentityColorPaletteEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is { name: string; hex: string; usageNotes?: string | null } =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as { name?: unknown }).name === 'string' &&
        typeof (item as { hex?: unknown }).hex === 'string',
    )
    .map((item) => ({
      name: item.name,
      hex: item.hex,
      usageNotes: typeof item.usageNotes === 'string' ? item.usageNotes : null,
    }));
}

function toTypography(value: unknown): readonly VisualIdentityTypographyEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is { font: string; weight: string; usageContext?: string | null } =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as { font?: unknown }).font === 'string' &&
        typeof (item as { weight?: unknown }).weight === 'string',
    )
    .map((item) => ({
      font: item.font,
      weight: item.weight,
      usageContext: typeof item.usageContext === 'string' ? item.usageContext : null,
    }));
}

export function toVisualIdentity(row: VisualIdentityRow): VisualIdentity {
  return {
    brandId: row.brandId,
    logoUsage: row.logoUsage,
    colorPalette: toColorPalette(row.colorPalette),
    typography: toTypography(row.typography),
    spacingGuidance: row.spacingGuidance ?? '',
    imageStyleGuidance: row.imageStyleGuidance ?? '',
    iconographyGuidance: row.iconographyGuidance ?? '',
    usageRestrictions: row.usageRestrictions ?? '',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export type VisualIdentityUpsertData = {
  logoUsage: string;
  colorPalette?: Prisma.InputJsonValue;
  typography?: Prisma.InputJsonValue;
  spacingGuidance?: string;
  imageStyleGuidance?: string;
  iconographyGuidance?: string;
  usageRestrictions?: string;
};

export function toPrismaUpsertData(
  input: UpsertVisualIdentityInput,
): VisualIdentityUpsertData {
  const data: VisualIdentityUpsertData = { logoUsage: input.logoUsage };
  if (input.colorPalette !== undefined) {
    data.colorPalette = input.colorPalette.map((p) => ({
      name: p.name,
      hex: p.hex,
      usageNotes: p.usageNotes ?? null,
    })) as unknown as Prisma.InputJsonValue;
  }
  if (input.typography !== undefined) {
    data.typography = input.typography.map((t) => ({
      font: t.font,
      weight: t.weight,
      usageContext: t.usageContext ?? null,
    })) as unknown as Prisma.InputJsonValue;
  }
  if (input.spacingGuidance !== undefined) {
    data.spacingGuidance = input.spacingGuidance ?? '';
  }
  if (input.imageStyleGuidance !== undefined) {
    data.imageStyleGuidance = input.imageStyleGuidance ?? '';
  }
  if (input.iconographyGuidance !== undefined) {
    data.iconographyGuidance = input.iconographyGuidance ?? '';
  }
  if (input.usageRestrictions !== undefined) {
    data.usageRestrictions = input.usageRestrictions ?? '';
  }
  return data;
}
