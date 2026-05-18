import { describe, expect, it } from 'vitest';
import {
  upsertVisualIdentitySchema,
  visualIdentityResponseSchema,
} from '../visual-identity.schema';

describe('upsertVisualIdentitySchema', () => {
  it('accepts minimal payload with only logoUsage', () => {
    const r = upsertVisualIdentitySchema.safeParse({ logoUsage: 'Default usage' });
    expect(r.success).toBe(true);
  });

  it('rejects missing logoUsage', () => {
    const r = upsertVisualIdentitySchema.safeParse({});
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path[0] === 'logoUsage')).toBe(true);
    }
  });

  it('rejects empty-string logoUsage with documented message', () => {
    const r = upsertVisualIdentitySchema.safeParse({ logoUsage: '' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(
        r.error.issues.some((i) => i.message === 'Logo usage guidance is required'),
      ).toBe(true);
    }
  });

  it('rejects whitespace-only logoUsage', () => {
    const r = upsertVisualIdentitySchema.safeParse({ logoUsage: '   ' });
    expect(r.success).toBe(false);
  });

  it('rejects unknown body keys under .strict()', () => {
    const r = upsertVisualIdentitySchema.safeParse({
      logoUsage: 'Default',
      extra: 'x',
    });
    expect(r.success).toBe(false);
  });

  it('accepts valid 6-char hex in colorPalette', () => {
    const r = upsertVisualIdentitySchema.safeParse({
      logoUsage: 'Default',
      colorPalette: [{ name: 'Primary', hex: '#1A2B3C', usageNotes: null }],
    });
    expect(r.success).toBe(true);
  });

  it('accepts valid 3-char hex in colorPalette', () => {
    const r = upsertVisualIdentitySchema.safeParse({
      logoUsage: 'Default',
      colorPalette: [{ name: 'Accent', hex: '#fff', usageNotes: null }],
    });
    expect(r.success).toBe(true);
  });

  it("rejects hex 'red' with the documented message", () => {
    const r = upsertVisualIdentitySchema.safeParse({
      logoUsage: 'Default',
      colorPalette: [{ name: 'Primary', hex: 'red', usageNotes: null }],
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(
        r.error.issues.some((i) => i.message === 'Invalid hex color (e.g. #1A2B3C)'),
      ).toBe(true);
    }
  });

  it("rejects hex '#12'", () => {
    const r = upsertVisualIdentitySchema.safeParse({
      logoUsage: 'Default',
      colorPalette: [{ name: 'Primary', hex: '#12', usageNotes: null }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects hex '#GGGGGG'", () => {
    const r = upsertVisualIdentitySchema.safeParse({
      logoUsage: 'Default',
      colorPalette: [{ name: 'Primary', hex: '#GGGGGG', usageNotes: null }],
    });
    expect(r.success).toBe(false);
  });

  it('rejects colorPalette beyond max items', () => {
    const overflow = Array.from({ length: 65 }, (_, i) => ({
      name: `c-${i}`,
      hex: '#fff',
      usageNotes: null,
    }));
    const r = upsertVisualIdentitySchema.safeParse({
      logoUsage: 'Default',
      colorPalette: overflow,
    });
    expect(r.success).toBe(false);
  });

  it('rejects empty palette name', () => {
    const r = upsertVisualIdentitySchema.safeParse({
      logoUsage: 'Default',
      colorPalette: [{ name: '', hex: '#fff', usageNotes: null }],
    });
    expect(r.success).toBe(false);
  });

  it('accepts populated typography', () => {
    const r = upsertVisualIdentitySchema.safeParse({
      logoUsage: 'Default',
      typography: [{ font: 'Inter', weight: '500', usageContext: 'Body' }],
    });
    expect(r.success).toBe(true);
  });

  it('rejects typography with empty font', () => {
    const r = upsertVisualIdentitySchema.safeParse({
      logoUsage: 'Default',
      typography: [{ font: '', weight: '500', usageContext: null }],
    });
    expect(r.success).toBe(false);
  });

  it('rejects typography with empty weight', () => {
    const r = upsertVisualIdentitySchema.safeParse({
      logoUsage: 'Default',
      typography: [{ font: 'Inter', weight: '', usageContext: null }],
    });
    expect(r.success).toBe(false);
  });

  it('accepts nullable text-only fields as null or empty string', () => {
    const r = upsertVisualIdentitySchema.safeParse({
      logoUsage: 'Default',
      spacingGuidance: null,
      imageStyleGuidance: '',
      iconographyGuidance: 'Outlined',
      usageRestrictions: null,
    });
    expect(r.success).toBe(true);
  });
});

describe('visualIdentityResponseSchema', () => {
  it('accepts a fully populated response', () => {
    const r = visualIdentityResponseSchema.safeParse({
      brandId: 'clxbrand0001',
      logoUsage: 'Default',
      colorPalette: [{ name: 'Primary', hex: '#1A2B3C', usageNotes: 'CTA' }],
      typography: [{ font: 'Inter', weight: '500', usageContext: 'Body' }],
      spacingGuidance: '8px grid',
      imageStyleGuidance: 'Documentary',
      iconographyGuidance: 'Outlined',
      usageRestrictions: 'No shadow',
      createdAt: new Date(),
      updatedAt: new Date(),
      latestVersionId: 'clxbgv0001',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.latestVersionId).toBe('clxbgv0001');
  });

  it('accepts latestVersionId null', () => {
    const r = visualIdentityResponseSchema.safeParse({
      brandId: 'clxbrand0001',
      logoUsage: 'Default',
      createdAt: new Date(),
      updatedAt: new Date(),
      latestVersionId: null,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.latestVersionId).toBeNull();
  });

  it('rejects response without brandId', () => {
    const r = visualIdentityResponseSchema.safeParse({
      logoUsage: 'Default',
      createdAt: new Date(),
      updatedAt: new Date(),
      latestVersionId: null,
    });
    expect(r.success).toBe(false);
  });

  it('rejects response without latestVersionId', () => {
    const r = visualIdentityResponseSchema.safeParse({
      brandId: 'clxbrand0001',
      logoUsage: 'Default',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(r.success).toBe(false);
  });
});
