import { describe, expect, it } from 'vitest';
import type { CommonTranslations } from '@/features/presentation/localization';
import { common } from '@/features/presentation/localization/languages/en/common';
import {
  buildDefaultValues,
  mapToEditVisualIdentityPageUIModel,
} from '../map-to-edit-visual-identity-page-ui-model';
import type { VisualIdentity } from '../../../../data/mapper/map-to-visual-identity';

const translations: CommonTranslations = common;

describe('buildDefaultValues', () => {
  it('returns empty defaults when identity is null', () => {
    const values = buildDefaultValues(null);
    expect(values.logoUsageRules).toBeNull();
    expect(values.colourPalette).toEqual([]);
    expect(values.typographyRules).toEqual([]);
  });

  it('returns empty defaults when identity is undefined', () => {
    const values = buildDefaultValues(undefined);
    expect(values.logoUsageRules).toBeNull();
  });

  it('clones a populated identity into form values', () => {
    const identity: VisualIdentity = {
      id: 'vi-1',
      brandId: 'brand-1',
      logoUsageRules: 'Clear space.',
      colourPalette: [{ name: 'Primary', hex: 'xxx', usage: 'Main.' }],
      typographyRules: [
        { role: 'Display', family: 'Inter', weight: '700', size: '48px', notes: null },
      ],
      spacingLayoutGuidance: '8px',
      imageStyleGuidance: null,
      iconographyGuidance: null,
      usageRestrictions: null,
      createdAt: new Date('2026-05-15T00:00:00.000Z'),
      updatedAt: new Date('2026-05-15T00:00:00.000Z'),
    };
    const values = buildDefaultValues(identity);
    expect(values.logoUsageRules).toBe('Clear space.');
    expect(values.colourPalette).toHaveLength(1);
    expect(values.typographyRules[0]?.role).toBe('Display');
  });
});

describe('mapToEditVisualIdentityPageUIModel', () => {
  it('returns the loading-state UI model', () => {
    const ui = mapToEditVisualIdentityPageUIModel({
      translations,
      identity: null,
      isLoading: true,
      notFound: false,
      hasError: false,
      serverError: null,
    });
    expect(ui.isLoading).toBe(true);
    expect(ui.title).toBe(translations.visualIdentityEditPageTitle);
    expect(ui.saveLabel).toBe(translations.save);
    expect(ui.serverErrorLabel).toBeNull();
  });

  it('surfaces the server error message', () => {
    const ui = mapToEditVisualIdentityPageUIModel({
      translations,
      identity: null,
      isLoading: false,
      notFound: false,
      hasError: false,
      serverError: 'boom',
    });
    expect(ui.serverErrorLabel).toBe('boom');
  });

  it('flags notFound and hasError', () => {
    const ui = mapToEditVisualIdentityPageUIModel({
      translations,
      identity: null,
      isLoading: false,
      notFound: true,
      hasError: false,
      serverError: null,
    });
    expect(ui.notFound).toBe(true);
    expect(ui.hasError).toBe(false);
  });
});
