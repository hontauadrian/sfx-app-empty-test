import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/features/presentation/localization', () => ({
  useTranslations: vi.fn(),
}));
vi.mock('@/features/presentation/toast/use-toast', () => ({
  useToast: vi.fn(),
}));
vi.mock('../../../../data/remote/fetch-visual-identity', () => ({
  fetchVisualIdentity: vi.fn(),
}));
vi.mock('../../../../data/remote/update-visual-identity', () => ({
  updateVisualIdentity: vi.fn(),
}));

import { useTranslations } from '@/features/presentation/localization';
import { useToast } from '@/features/presentation/toast/use-toast';
import { fetchVisualIdentity } from '../../../../data/remote/fetch-visual-identity';
import { VisualIdentityForm } from '..';

const useTranslationsMock = vi.mocked(useTranslations);
const useToastMock = vi.mocked(useToast);
const fetchMock = vi.mocked(fetchVisualIdentity);

const visualTranslations = {
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
    addPaletteEntry: '+P',
    removePaletteEntry: '-P',
    addTypographyEntry: '+T',
    removeTypographyEntry: '-T',
  },
  toast: { success: 'Visual saved', error: 'Visual failed' },
};

function newClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
}

function Wrapper({ children }: { children: ReactNode }): ReactNode {
  return <QueryClientProvider client={newClient()}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  useTranslationsMock.mockReturnValue({
    adminBrandGuidelines: { visual: visualTranslations },
  } as unknown as ReturnType<typeof useTranslations>);
  useToastMock.mockReturnValue({
    success: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn(),
  } as unknown as ReturnType<typeof useToast>);
  fetchMock.mockReset();
});

afterEach(() => vi.restoreAllMocks());

describe('VisualIdentityForm fields', () => {
  it('renders the full form fieldset hierarchy when ready', async () => {
    fetchMock.mockResolvedValueOnce(null);
    render(<VisualIdentityForm brandId="clxbrand0001" />, { wrapper: Wrapper });
    await waitFor(() =>
      expect(screen.getByTestId('visual-identity-form')).toBeInTheDocument(),
    );
    expect(screen.getAllByText('Logo').length).toBeGreaterThan(0);
    expect(screen.getByText('Palette')).toBeInTheDocument();
    expect(screen.getByText('Typography')).toBeInTheDocument();
    expect(screen.getAllByText('Spacing').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Image').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Icons').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Restrictions').length).toBeGreaterThan(0);
  });

  it('add palette entry adds three input cells; remove deletes', async () => {
    fetchMock.mockResolvedValueOnce(null);
    render(<VisualIdentityForm brandId="clxbrand0001" />, { wrapper: Wrapper });
    await waitFor(() =>
      expect(screen.getByTestId('visual-identity-form')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: '+P' }));
    expect(screen.getByLabelText('Name 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Hex 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Notes 1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '-P 1' }));
    await waitFor(() =>
      expect(screen.queryByLabelText('Name 1')).not.toBeInTheDocument(),
    );
  });

  it('add typography entry adds three input cells; remove deletes', async () => {
    fetchMock.mockResolvedValueOnce(null);
    render(<VisualIdentityForm brandId="clxbrand0001" />, { wrapper: Wrapper });
    await waitFor(() =>
      expect(screen.getByTestId('visual-identity-form')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: '+T' }));
    expect(screen.getByLabelText('Font 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Weight 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Context 1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '-T 1' }));
    await waitFor(() =>
      expect(screen.queryByLabelText('Font 1')).not.toBeInTheDocument(),
    );
  });

  it('hydrates the form when a persisted visual identity is fetched', async () => {
    fetchMock.mockResolvedValueOnce({
      brandId: 'clxbrand0001',
      logoUsage: 'Default usage',
      colorPalette: [{ name: 'Primary', hex: '#abcdef', usageNotes: 'CTA' }],
      typography: [{ font: 'Inter', weight: '500', usageContext: 'Body' }],
      spacingGuidance: '8px grid',
      imageStyleGuidance: 'Documentary',
      iconographyGuidance: 'Outlined',
      usageRestrictions: 'No shadow',
      createdAt: '2026-05-17T00:00:00.000Z',
      updatedAt: '2026-05-17T00:00:00.000Z',
    });
    render(<VisualIdentityForm brandId="clxbrand0001" />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByDisplayValue('Default usage')).toBeInTheDocument());
    expect(screen.getByDisplayValue('Primary')).toBeInTheDocument();
    expect(screen.getByDisplayValue('#abcdef')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Inter')).toBeInTheDocument();
    expect(screen.getByDisplayValue('500')).toBeInTheDocument();
    expect(screen.getByDisplayValue('8px grid')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Documentary')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Outlined')).toBeInTheDocument();
    expect(screen.getByDisplayValue('No shadow')).toBeInTheDocument();
  });
});
