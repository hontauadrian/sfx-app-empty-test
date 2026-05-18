import { describe, expect, it } from 'vitest';
import { mapToBrandGuidelinesSubNavUIModel } from '../map-to-brand-guidelines-sub-nav-ui-model';
import type { AdminBrandGuidelinesSubNavTranslations } from '@/features/presentation/localization/types';

const labels: AdminBrandGuidelinesSubNavTranslations = {
  voice: 'Voice',
  visual: 'Visual',
  dosAndDonts: 'Dos',
  metadata: 'Meta',
  placeholderComingNextChunk: 'Soon',
  unsavedChangesWarning: 'Confirm?',
};

describe('mapToBrandGuidelinesSubNavUIModel', () => {
  it('renders sorted tabs from the registry', () => {
    const ui = mapToBrandGuidelinesSubNavUIModel({
      activeId: 'voice',
      labels,
      renderBody: () => 'body',
      navAriaLabel: 'nav',
    });
    expect(ui.tabs.map((tab) => tab.id)).toEqual([
      'voice',
      'visual',
      'dosAndDonts',
      'metadata',
    ]);
    expect(ui.tabs[0]?.isActive).toBe(true);
    expect(ui.tabs[1]?.isActive).toBe(false);
  });

  it('resolves the active body via the renderBody callback', () => {
    const ui = mapToBrandGuidelinesSubNavUIModel({
      activeId: 'visual',
      labels,
      renderBody: (entry) => `body-for-${entry.id}`,
      navAriaLabel: 'nav',
    });
    expect(ui.activeBody).toBe('body-for-visual');
    expect(ui.activeId).toBe('visual');
  });

  it('falls back to the first entry when the activeId is unknown', () => {
    const ui = mapToBrandGuidelinesSubNavUIModel({
      activeId: 'unknown',
      labels,
      renderBody: (entry) => `body-for-${entry.id}`,
      navAriaLabel: 'nav',
    });
    expect(ui.activeId).toBe('voice');
  });

  it('uses the labels object to resolve tab text', () => {
    const ui = mapToBrandGuidelinesSubNavUIModel({
      activeId: 'voice',
      labels,
      renderBody: () => null,
      navAriaLabel: 'nav',
    });
    expect(ui.tabs.map((tab) => tab.label)).toEqual(['Voice', 'Visual', 'Dos', 'Meta']);
  });
});
