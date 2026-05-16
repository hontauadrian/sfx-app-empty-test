import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VisualIdentityReadView } from '../index';
import type { VisualIdentityReadViewLabels } from '../types';
import type { VisualIdentity } from '../../../../data/mapper/map-to-visual-identity';

const LABELS: VisualIdentityReadViewLabels = {
  logoUsageRulesLabel: 'Logo usage',
  colourPaletteLabel: 'Colour palette',
  typographyRulesLabel: 'Typography rules',
  spacingLayoutGuidanceLabel: 'Spacing',
  imageStyleGuidanceLabel: 'Image style',
  iconographyGuidanceLabel: 'Iconography',
  usageRestrictionsLabel: 'Restrictions',
  colourPaletteNameLabel: 'Name',
  colourPaletteHexLabel: 'Hex',
  colourPaletteUsageLabel: 'Usage',
  typographyRoleLabel: 'Role',
  typographyFamilyLabel: 'Family',
  typographyWeightLabel: 'Weight',
  typographySizeLabel: 'Size',
  typographyNotesLabel: 'Notes',
};

const POPULATED: VisualIdentity = {
  id: 'vi-1',
  brandId: 'brand-1',
  logoUsageRules: 'Clear space.',
  colourPalette: [
    { name: 'Primary', hex: 'xxx', usage: 'Main.' },
  ],
  typographyRules: [
    { role: 'Display', family: 'Inter', weight: '700', size: '48px', notes: null },
  ],
  spacingLayoutGuidance: '8px grid.',
  imageStyleGuidance: null,
  iconographyGuidance: null,
  usageRestrictions: null,
  createdAt: new Date('2026-05-15T00:00:00.000Z'),
  updatedAt: new Date('2026-05-15T00:00:00.000Z'),
};

describe('VisualIdentityReadView', () => {
  it('renders every populated section', () => {
    render(<VisualIdentityReadView identity={POPULATED} labels={LABELS} />);
    expect(screen.getByText('Logo usage')).toBeInTheDocument();
    expect(screen.getByText('Clear space.')).toBeInTheDocument();
    expect(screen.getByText(/Colour palette \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/Typography rules \(1\)/)).toBeInTheDocument();
    expect(screen.getByText('Spacing')).toBeInTheDocument();
    expect(screen.queryByText('Iconography')).not.toBeInTheDocument();
  });

  it('hides text blocks with null body', () => {
    render(
      <VisualIdentityReadView
        identity={{
          ...POPULATED,
          logoUsageRules: null,
          spacingLayoutGuidance: null,
          colourPalette: [],
          typographyRules: [],
        }}
        labels={LABELS}
      />,
    );
    expect(screen.queryByText('Logo usage')).not.toBeInTheDocument();
    expect(screen.queryByText(/Colour palette/)).not.toBeInTheDocument();
  });

  it('truncates long lists with a +N more marker', () => {
    const many = Array.from({ length: 7 }, (_, idx) => ({
      name: `c-${idx}`,
      hex: 'xxx',
      usage: null,
    }));
    render(
      <VisualIdentityReadView
        identity={{ ...POPULATED, colourPalette: many }}
        labels={LABELS}
      />,
    );
    expect(screen.getByText('+2 more')).toBeInTheDocument();
  });
});
