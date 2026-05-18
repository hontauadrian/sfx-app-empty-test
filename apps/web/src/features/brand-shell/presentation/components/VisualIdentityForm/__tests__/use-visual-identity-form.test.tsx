import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

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
import { updateVisualIdentity } from '../../../../data/remote/update-visual-identity';
import { useVisualIdentityForm } from '../use-visual-identity-form';

const useTranslationsMock = vi.mocked(useTranslations);
const useToastMock = vi.mocked(useToast);
const fetchMock = vi.mocked(fetchVisualIdentity);
const updateMock = vi.mocked(updateVisualIdentity);

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
  updateMock.mockReset();
});

afterEach(() => vi.restoreAllMocks());

function newClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
}

function makeWrapper(client: QueryClient): (props: { children: ReactNode }) => ReactNode {
  return function Wrapper({ children }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe('useVisualIdentityForm', () => {
  it('rejects empty logoUsage client-side before calling update', async () => {
    fetchMock.mockResolvedValueOnce(null);
    const client = newClient();
    const { result } = renderHook(() => useVisualIdentityForm('clxbrand0001'), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() => expect(result.current.uiModel.status).toBe('ready'));
    await act(async () => {
      await result.current.handleSubmit();
    });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('rejects invalid hex client-side before calling update', async () => {
    fetchMock.mockResolvedValueOnce(null);
    const client = newClient();
    const { result } = renderHook(() => useVisualIdentityForm('clxbrand0001'), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() => expect(result.current.uiModel.status).toBe('ready'));
    act(() => {
      result.current.form.setValue('logoUsage', 'Default');
      result.current.form.setValue('colorPalette', [
        { name: 'Primary', hex: 'red', usageNotes: null },
      ]);
    });
    await act(async () => {
      await result.current.handleSubmit();
    });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('saves successfully on valid payload', async () => {
    fetchMock.mockResolvedValueOnce(null);
    updateMock.mockResolvedValueOnce({
      brandId: 'clxbrand0001',
      logoUsage: 'Default',
      colorPalette: [],
      typography: [],
      spacingGuidance: '',
      imageStyleGuidance: '',
      iconographyGuidance: '',
      usageRestrictions: '',
      createdAt: '2026-05-17T00:00:00.000Z',
      updatedAt: '2026-05-17T01:00:00.000Z',
    });
    const successFn = vi.fn();
    useToastMock.mockReturnValue({
      success: successFn,
      error: vi.fn(),
      dismiss: vi.fn(),
    } as unknown as ReturnType<typeof useToast>);
    const client = newClient();
    const { result } = renderHook(() => useVisualIdentityForm('clxbrand0001'), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() => expect(result.current.uiModel.status).toBe('ready'));
    act(() => result.current.form.setValue('logoUsage', 'Default'));
    await act(async () => {
      await result.current.handleSubmit();
    });
    expect(updateMock).toHaveBeenCalled();
    expect(successFn).toHaveBeenCalledWith('Visual saved');
  });
});
