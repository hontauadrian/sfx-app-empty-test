import { describe, expect, it } from 'vitest';
import {
  VISUAL_IDENTITY_HEX_PATTERN,
  VISUAL_IDENTITY_LIST_ITEM_TEXT_MAX_LENGTH,
  VISUAL_IDENTITY_LIST_MAX_ITEMS,
  VISUAL_IDENTITY_LONG_TEXT_MAX_LENGTH,
  visualIdentityWriteSchema,
} from '../visual-identity.schema';

describe('visualIdentityWriteSchema', () => {
  it('parses an empty body to a fully-defaulted payload', () => {
    const parsed = visualIdentityWriteSchema.parse({});
    expect(parsed.logoUsageRules).toBeNull();
    expect(parsed.colourPalette).toEqual([]);
    expect(parsed.typographyRules).toEqual([]);
    expect(parsed.spacingLayoutGuidance).toBeNull();
    expect(parsed.imageStyleGuidance).toBeNull();
    expect(parsed.iconographyGuidance).toBeNull();
    expect(parsed.usageRestrictions).toBeNull();
  });

  it('parses a populated body and trims long text', () => {
    const parsed = visualIdentityWriteSchema.parse({
      logoUsageRules: '   Clear space   ',
      colourPalette: [
        { name: 'Primary', hex: '#0044ff', usage: 'Main.' },
        { name: 'Accent', hex: '#FF6A00' },
      ],
      typographyRules: [
        { role: 'Display', family: 'Inter', weight: '700', size: '48px', notes: 'Hero' },
        { role: 'Body', family: 'Inter' },
      ],
      spacingLayoutGuidance: '8px grid.',
      imageStyleGuidance: 'Warm.',
      iconographyGuidance: '1.5px stroke.',
      usageRestrictions: 'Never recolour.',
    });
    expect(parsed.logoUsageRules).toBe('Clear space');
    expect(parsed.colourPalette).toHaveLength(2);
    expect(parsed.colourPalette[1].usage).toBeNull();
    expect(parsed.typographyRules[1].weight).toBeNull();
  });

  it('normalises empty / whitespace-only long text to null', () => {
    const parsed = visualIdentityWriteSchema.parse({
      logoUsageRules: '   ',
      spacingLayoutGuidance: '',
    });
    expect(parsed.logoUsageRules).toBeNull();
    expect(parsed.spacingLayoutGuidance).toBeNull();
  });

  it('rejects a colour palette entry with an invalid hex', () => {
    const result = visualIdentityWriteSchema.safeParse({
      colourPalette: [{ name: 'Bad', hex: 'blue' }],
    });
    expect(result.success).toBe(false);
  });

  it('accepts the #RGB short hex form', () => {
    const parsed = visualIdentityWriteSchema.parse({
      colourPalette: [{ name: 'Short', hex: '#abc' }],
    });
    expect(parsed.colourPalette[0].hex).toBe('#abc');
  });

  it('rejects a duplicate colour palette name (case-insensitive)', () => {
    const result = visualIdentityWriteSchema.safeParse({
      colourPalette: [
        { name: 'Primary', hex: '#0044ff' },
        { name: 'PRIMARY', hex: '#ff6a00' },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const dupIssue = result.error.issues.find(
        (issue) => issue.path[2] === 'name' && issue.path[0] === 'colourPalette',
      );
      expect(dupIssue?.message).toMatch(/Duplicate/);
    }
  });

  it('rejects a duplicate typography role (case-insensitive)', () => {
    const result = visualIdentityWriteSchema.safeParse({
      typographyRules: [
        { role: 'Display', family: 'Inter' },
        { role: 'DISPLAY', family: 'Roboto' },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a missing required colour palette name', () => {
    const result = visualIdentityWriteSchema.safeParse({
      colourPalette: [{ name: '', hex: '#0044ff' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects logoUsageRules longer than the max length', () => {
    const result = visualIdentityWriteSchema.safeParse({
      logoUsageRules: 'a'.repeat(VISUAL_IDENTITY_LONG_TEXT_MAX_LENGTH + 1),
    });
    expect(result.success).toBe(false);
  });

  it('rejects colour palette over the max items', () => {
    const items = Array.from({ length: VISUAL_IDENTITY_LIST_MAX_ITEMS + 1 }, (_, idx) => ({
      name: `c-${idx}`,
      hex: '#aabbcc',
    }));
    const result = visualIdentityWriteSchema.safeParse({ colourPalette: items });
    expect(result.success).toBe(false);
  });

  it('rejects a colour palette name above the short text limit', () => {
    const result = visualIdentityWriteSchema.safeParse({
      colourPalette: [
        {
          name: 'x'.repeat(VISUAL_IDENTITY_LIST_ITEM_TEXT_MAX_LENGTH + 1),
          hex: '#aabbcc',
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('exposes the constant hex pattern', () => {
    expect(VISUAL_IDENTITY_HEX_PATTERN.test('#abc')).toBe(true);
    expect(VISUAL_IDENTITY_HEX_PATTERN.test('#AABBCC')).toBe(true);
    expect(VISUAL_IDENTITY_HEX_PATTERN.test('blue')).toBe(false);
  });
});
