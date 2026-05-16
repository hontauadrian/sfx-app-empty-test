import { describe, expect, it } from 'vitest';
import {
  DOS_AND_DONT_BODY_MAX_LENGTH,
  DOS_AND_DONT_CATEGORY_VALUES,
  DOS_AND_DONT_TITLE_MAX_LENGTH,
  DOS_AND_DONT_TYPE_VALUES,
  dosAndDontListQuerySchema,
  dosAndDontSchema,
  dosAndDontWriteSchema,
} from '../dos-and-donts.schema';

describe('dos-and-donts validation schemas', () => {
  describe('dosAndDontWriteSchema', () => {
    it('accepts a fully populated valid payload', () => {
      const result = dosAndDontWriteSchema.safeParse({
        type: 'do',
        category: 'tone',
        title: 'Use active voice',
        body: 'Prefer active.',
        suggestedCorrection: 'Rewrite passive verbs as active.',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe('Use active voice');
        expect(result.data.suggestedCorrection).toBe(
          'Rewrite passive verbs as active.',
        );
      }
    });

    it('omits suggestedCorrection when absent', () => {
      const result = dosAndDontWriteSchema.safeParse({
        type: 'dont',
        category: 'visuals',
        title: 'No recoloured logos',
        body: 'Keep brand mark intact.',
      });
      expect(result.success).toBe(true);
    });

    it('normalises an empty suggestedCorrection string to null', () => {
      const result = dosAndDontWriteSchema.safeParse({
        type: 'do',
        category: 'tone',
        title: 't',
        body: 'b',
        suggestedCorrection: '   ',
      });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.suggestedCorrection).toBeNull();
    });

    it('rejects empty title after trim', () => {
      const result = dosAndDontWriteSchema.safeParse({
        type: 'do',
        category: 'tone',
        title: '   ',
        body: 'b',
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty body after trim', () => {
      const result = dosAndDontWriteSchema.safeParse({
        type: 'do',
        category: 'tone',
        title: 'ok',
        body: '   ',
      });
      expect(result.success).toBe(false);
    });

    it('rejects unknown type enum', () => {
      const result = dosAndDontWriteSchema.safeParse({
        type: 'maybe',
        category: 'tone',
        title: 't',
        body: 'b',
      });
      expect(result.success).toBe(false);
    });

    it('rejects unknown category enum', () => {
      const result = dosAndDontWriteSchema.safeParse({
        type: 'do',
        category: 'marketing',
        title: 't',
        body: 'b',
      });
      expect(result.success).toBe(false);
    });

    it('rejects oversize title', () => {
      const oversize = 'a'.repeat(DOS_AND_DONT_TITLE_MAX_LENGTH + 1);
      const result = dosAndDontWriteSchema.safeParse({
        type: 'do',
        category: 'tone',
        title: oversize,
        body: 'b',
      });
      expect(result.success).toBe(false);
    });

    it('rejects oversize body', () => {
      const oversize = 'a'.repeat(DOS_AND_DONT_BODY_MAX_LENGTH + 1);
      const result = dosAndDontWriteSchema.safeParse({
        type: 'do',
        category: 'tone',
        title: 't',
        body: oversize,
      });
      expect(result.success).toBe(false);
    });

    it('rejects oversize suggestedCorrection', () => {
      const oversize = 'a'.repeat(DOS_AND_DONT_BODY_MAX_LENGTH + 1);
      const result = dosAndDontWriteSchema.safeParse({
        type: 'do',
        category: 'tone',
        title: 't',
        body: 'b',
        suggestedCorrection: oversize,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('dosAndDontListQuerySchema', () => {
    it('accepts a known category', () => {
      const result = dosAndDontListQuerySchema.safeParse({ category: 'tone' });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.category).toBe('tone');
    });

    it('treats empty string as no filter', () => {
      const result = dosAndDontListQuerySchema.safeParse({ category: '' });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.category).toBeUndefined();
    });

    it('rejects unknown category', () => {
      const result = dosAndDontListQuerySchema.safeParse({ category: 'invalid-cat' });
      expect(result.success).toBe(false);
    });

    it('accepts no category at all', () => {
      const result = dosAndDontListQuerySchema.safeParse({});
      expect(result.success).toBe(true);
    });
  });

  describe('dosAndDontSchema (response)', () => {
    it('accepts a full response shape', () => {
      const result = dosAndDontSchema.safeParse({
        id: 'e-1',
        brandId: 'b-1',
        type: 'do',
        category: 'tone',
        title: 't',
        body: 'b',
        suggestedCorrection: null,
        createdAt: '2026-05-15T00:00:00.000Z',
        updatedAt: '2026-05-15T00:00:00.000Z',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('constants', () => {
    it('exposes type and category value arrays', () => {
      expect(DOS_AND_DONT_TYPE_VALUES).toEqual(['do', 'dont']);
      expect(DOS_AND_DONT_CATEGORY_VALUES).toEqual([
        'tone',
        'vocabulary',
        'visuals',
        'legal',
        'campaign-messaging',
      ]);
    });
  });
});
