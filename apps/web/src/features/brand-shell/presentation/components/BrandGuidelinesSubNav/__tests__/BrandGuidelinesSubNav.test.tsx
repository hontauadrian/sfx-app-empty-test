import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('@/features/presentation/localization', () => ({
  useTranslations: vi.fn(),
}));
vi.mock('../../BrandVoiceForm', () => ({
  BrandVoiceForm: function MockVoice(): ReactElement {
    return <div data-testid="mock-voice-form" />;
  },
}));
vi.mock('../../VisualIdentityForm', () => ({
  VisualIdentityForm: function MockVisual(): ReactElement {
    return <div data-testid="mock-visual-form" />;
  },
}));

import { useTranslations } from '@/features/presentation/localization';
import { BrandGuidelinesSubNav } from '..';

const useTranslationsMock = vi.mocked(useTranslations);

beforeEach(() => {
  useTranslationsMock.mockReturnValue({
    adminBrandGuidelines: {
      pageTitle: 'Brand Guidelines',
      subNav: {
        voice: 'Voice',
        visual: 'Visual',
        dosAndDonts: 'Dos',
        metadata: 'Meta',
        placeholderComingNextChunk: 'Soon',
        unsavedChangesWarning: 'Discard?',
      },
    },
  } as unknown as ReturnType<typeof useTranslations>);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('BrandGuidelinesSubNav', () => {
  it('renders both tabs and mounts the voice form by default', () => {
    render(<BrandGuidelinesSubNav activeBrandId="clxbrand0001" />);
    expect(screen.getByTestId('brand-guidelines-sub-nav-tab-voice')).toBeInTheDocument();
    expect(screen.getByTestId('brand-guidelines-sub-nav-tab-visual')).toBeInTheDocument();
    expect(screen.getByTestId('mock-voice-form')).toBeInTheDocument();
  });

  it('switches to the visual identity body when the visual tab is clicked', () => {
    render(<BrandGuidelinesSubNav activeBrandId="clxbrand0001" />);
    fireEvent.click(screen.getByTestId('brand-guidelines-sub-nav-tab-visual'));
    expect(screen.getByTestId('mock-visual-form')).toBeInTheDocument();
  });

  it('marks the active tab with aria-current="page"', () => {
    render(<BrandGuidelinesSubNav activeBrandId="clxbrand0001" />);
    expect(screen.getByTestId('brand-guidelines-sub-nav-tab-voice')).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});
