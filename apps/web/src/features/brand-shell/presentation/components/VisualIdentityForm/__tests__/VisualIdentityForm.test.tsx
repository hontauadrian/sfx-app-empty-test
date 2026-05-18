import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { LanguageProvider } from '@/features/presentation/localization/language-provider';

vi.mock('../use-visual-identity-form', () => ({
  useVisualIdentityForm: vi.fn(),
}));

import { useVisualIdentityForm } from '../use-visual-identity-form';
import { VisualIdentityForm } from '..';
import type { UpsertVisualIdentityInput } from '@sfx/domain';

function renderWithProviders(node: ReactNode): void {
  render(<LanguageProvider>{node}</LanguageProvider>);
}

const useVisualIdentityFormMock = vi.mocked(useVisualIdentityForm);

function readyUiModel(): ReturnType<typeof useVisualIdentityForm>['uiModel'] {
  return {
    status: 'ready',
    pageTitle: 'Visual Identity',
    sections: {
      logo: 'Logo',
      colorPalette: 'Palette',
      typography: 'Typography',
      spacing: 'Spacing',
      imageStyle: 'Image',
      iconography: 'Icons',
      restrictions: 'Restrictions',
    },
    fields: {
      logoUsage: { label: 'Logo' },
      paletteName: { label: 'Name' },
      paletteHex: { label: 'Hex' },
      paletteUsage: { label: 'Notes' },
      typographyFont: { label: 'Font' },
      typographyWeight: { label: 'Weight' },
      typographyContext: { label: 'Context' },
      spacingGuidance: { label: 'Spacing' },
      imageStyleGuidance: { label: 'Image' },
      iconographyGuidance: { label: 'Icons' },
      usageRestrictions: { label: 'Restrictions' },
    },
    cta: {
      save: 'Save',
      saving: 'Saving',
      addPaletteEntry: '+ Add palette',
      removePaletteEntry: '- Remove palette',
      addTypographyEntry: '+ Add typography',
      removeTypographyEntry: '- Remove typography',
    },
    submitLabel: 'Save',
    isSubmitting: false,
    submitDisabled: false,
    formError: null,
  };
}

function mockReady(overrides?: { status?: 'loading' | 'ready' }): void {
  useVisualIdentityFormMock.mockImplementation((): ReturnType<typeof useVisualIdentityForm> => {
    const form = useForm<UpsertVisualIdentityInput>({
      defaultValues: {
        logoUsage: '',
        colorPalette: [],
        typography: [],
        spacingGuidance: '',
        imageStyleGuidance: '',
        iconographyGuidance: '',
        usageRestrictions: '',
      },
    });
    return {
      uiModel: { ...readyUiModel(), ...overrides },
      form,
      handleSubmit: async (): Promise<void> => {},
    };
  });
}

beforeEach(() => {
  useVisualIdentityFormMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('VisualIdentityForm', () => {
  it('shows the skeleton when status is loading', () => {
    mockReady({ status: 'loading' });
    renderWithProviders(<VisualIdentityForm brandId="clxbrand0001" />);
    expect(screen.getByTestId('visual-identity-form-loading')).toBeInTheDocument();
  });

  it('renders submit CTA when ready', () => {
    mockReady();
    renderWithProviders(<VisualIdentityForm brandId="clxbrand0001" />);
    expect(screen.getByRole('heading', { name: 'Visual Identity' })).toBeInTheDocument();
    expect(screen.getByTestId('visual-identity-submit')).toHaveTextContent('Save');
  });
});
