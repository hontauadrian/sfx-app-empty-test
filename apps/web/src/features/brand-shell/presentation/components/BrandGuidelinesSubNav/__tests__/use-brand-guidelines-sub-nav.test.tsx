import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/presentation/localization', () => ({
  useTranslations: vi.fn(),
}));

import { useTranslations } from '@/features/presentation/localization';
import { useBrandGuidelinesSubNav } from '../use-brand-guidelines-sub-nav';

const useTranslationsMock = vi.mocked(useTranslations);

const labels = {
  voice: 'Voice',
  visual: 'Visual',
  dosAndDonts: 'Dos',
  metadata: 'Meta',
  placeholderComingNextChunk: 'Soon',
  unsavedChangesWarning: 'Discard changes?',
};

beforeEach(() => {
  useTranslationsMock.mockReturnValue({
    adminBrandGuidelines: {
      pageTitle: 'Brand Guidelines',
      subNav: labels,
    },
  } as unknown as ReturnType<typeof useTranslations>);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useBrandGuidelinesSubNav', () => {
  it('defaults to the first registered tab as active', () => {
    const { result } = renderHook(() =>
      useBrandGuidelinesSubNav({ renderBody: () => 'body' }),
    );
    expect(result.current.uiModel.activeId).toBe('voice');
  });

  it('switches the active tab when no dirty edits exist', () => {
    const { result } = renderHook(() =>
      useBrandGuidelinesSubNav({ renderBody: (entry) => `body-${entry.id}` }),
    );
    act(() => result.current.handleSelectTab('visual'));
    expect(result.current.uiModel.activeId).toBe('visual');
  });

  it('blocks tab switch when dirty and user cancels the confirm', () => {
    const confirmFn = vi.fn().mockReturnValue(false);
    const { result } = renderHook(() =>
      useBrandGuidelinesSubNav({
        renderBody: (entry) => `body-${entry.id}`,
        confirmFn,
      }),
    );
    act(() => result.current.handleDirtyChange('voice', true));
    act(() => result.current.handleSelectTab('visual'));
    expect(confirmFn).toHaveBeenCalledWith('Discard changes?');
    expect(result.current.uiModel.activeId).toBe('voice');
  });

  it('allows tab switch when dirty and user accepts the confirm', () => {
    const confirmFn = vi.fn().mockReturnValue(true);
    const { result } = renderHook(() =>
      useBrandGuidelinesSubNav({
        renderBody: (entry) => `body-${entry.id}`,
        confirmFn,
      }),
    );
    act(() => result.current.handleDirtyChange('voice', true));
    act(() => result.current.handleSelectTab('visual'));
    expect(result.current.uiModel.activeId).toBe('visual');
  });

  it('no-ops when re-selecting the active tab', () => {
    const confirmFn = vi.fn().mockReturnValue(false);
    const { result } = renderHook(() =>
      useBrandGuidelinesSubNav({
        renderBody: (entry) => `body-${entry.id}`,
        confirmFn,
      }),
    );
    act(() => result.current.handleDirtyChange('voice', true));
    act(() => result.current.handleSelectTab('voice'));
    expect(confirmFn).not.toHaveBeenCalled();
    expect(result.current.uiModel.activeId).toBe('voice');
  });
});
