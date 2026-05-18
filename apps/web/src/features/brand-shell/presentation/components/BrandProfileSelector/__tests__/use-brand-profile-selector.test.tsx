import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { Brand } from '@sfx/domain';
import { useBrandProfileSelector } from '../use-brand-profile-selector';
import { LanguageProvider } from '@/features/presentation/localization';
import { CREATE_NEW_OPTION_VALUE } from '../map-to-brand-profile-selector-ui-model';

function makeWrapper(): (props: { children: ReactNode }) => ReactNode {
  return function Wrapper({ children }: { children: ReactNode }): ReactNode {
    return <LanguageProvider>{children}</LanguageProvider>;
  };
}

const brand = (over: Partial<Brand>): Brand => ({
  id: 'clxbrand0001',
  name: 'Acme',
  slug: 'acme',
  ownerUserId: 'subject-admin',
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  ...over,
});

beforeEach(() => {});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('useBrandProfileSelector', () => {
  it('opens the create modal when CREATE_NEW_OPTION_VALUE is selected', () => {
    const { result } = renderHook(
      () =>
        useBrandProfileSelector({
          brands: [],
          activeBrandId: null,
          onSelectBrand: vi.fn(),
          onCreated: vi.fn(),
          onRenamed: vi.fn(),
          onDeleted: vi.fn(),
        }),
      { wrapper: makeWrapper() },
    );
    act(() => result.current.handleSelectChange(CREATE_NEW_OPTION_VALUE));
    expect(result.current.createOpen).toBe(true);
  });

  it('fires onSelectBrand for a non-active brand id', () => {
    const onSelectBrand = vi.fn();
    const { result } = renderHook(
      () =>
        useBrandProfileSelector({
          brands: [brand({ id: 'a' }), brand({ id: 'b', name: 'Beta' })],
          activeBrandId: 'a',
          onSelectBrand,
          onCreated: vi.fn(),
          onRenamed: vi.fn(),
          onDeleted: vi.fn(),
        }),
      { wrapper: makeWrapper() },
    );
    act(() => result.current.handleSelectChange('b'));
    expect(onSelectBrand).toHaveBeenCalledWith('b');
  });

  it('does not fire onSelectBrand when re-selecting the active brand', () => {
    const onSelectBrand = vi.fn();
    const { result } = renderHook(
      () =>
        useBrandProfileSelector({
          brands: [brand({ id: 'a' })],
          activeBrandId: 'a',
          onSelectBrand,
          onCreated: vi.fn(),
          onRenamed: vi.fn(),
          onDeleted: vi.fn(),
        }),
      { wrapper: makeWrapper() },
    );
    act(() => result.current.handleSelectChange('a'));
    expect(onSelectBrand).not.toHaveBeenCalled();
  });

  it('opens rename only when an active brand exists', () => {
    const noActive = renderHook(
      () =>
        useBrandProfileSelector({
          brands: [brand({ id: 'a' })],
          activeBrandId: null,
          onSelectBrand: vi.fn(),
          onCreated: vi.fn(),
          onRenamed: vi.fn(),
          onDeleted: vi.fn(),
        }),
      { wrapper: makeWrapper() },
    );
    act(() => noActive.result.current.handleOpenRename());
    expect(noActive.result.current.renameOpen).toBe(false);

    const withActive = renderHook(
      () =>
        useBrandProfileSelector({
          brands: [brand({ id: 'a' })],
          activeBrandId: 'a',
          onSelectBrand: vi.fn(),
          onCreated: vi.fn(),
          onRenamed: vi.fn(),
          onDeleted: vi.fn(),
        }),
      { wrapper: makeWrapper() },
    );
    act(() => withActive.result.current.handleOpenRename());
    expect(withActive.result.current.renameOpen).toBe(true);
  });

  it('opens delete only when an active brand exists', () => {
    const { result } = renderHook(
      () =>
        useBrandProfileSelector({
          brands: [brand({ id: 'a' })],
          activeBrandId: 'a',
          onSelectBrand: vi.fn(),
          onCreated: vi.fn(),
          onRenamed: vi.fn(),
          onDeleted: vi.fn(),
        }),
      { wrapper: makeWrapper() },
    );
    act(() => result.current.handleOpenDelete());
    expect(result.current.deleteOpen).toBe(true);
  });

  it('forwards onCreated / onRenamed / onDeleted to props', () => {
    const onCreated = vi.fn();
    const onRenamed = vi.fn();
    const onDeleted = vi.fn();
    const sample = brand({ id: 'a' });
    const { result } = renderHook(
      () =>
        useBrandProfileSelector({
          brands: [sample],
          activeBrandId: 'a',
          onSelectBrand: vi.fn(),
          onCreated,
          onRenamed,
          onDeleted,
        }),
      { wrapper: makeWrapper() },
    );
    act(() => result.current.handleCreated(sample));
    act(() => result.current.handleRenamed(sample));
    act(() => result.current.handleDeleted('a'));
    expect(onCreated).toHaveBeenCalledWith(sample);
    expect(onRenamed).toHaveBeenCalledWith(sample);
    expect(onDeleted).toHaveBeenCalledWith('a');
  });

  it('handlers close the respective modals', () => {
    const { result } = renderHook(
      () =>
        useBrandProfileSelector({
          brands: [brand({ id: 'a' })],
          activeBrandId: 'a',
          onSelectBrand: vi.fn(),
          onCreated: vi.fn(),
          onRenamed: vi.fn(),
          onDeleted: vi.fn(),
        }),
      { wrapper: makeWrapper() },
    );
    act(() => result.current.handleOpenRename());
    expect(result.current.renameOpen).toBe(true);
    act(() => result.current.handleCloseRename());
    expect(result.current.renameOpen).toBe(false);
    act(() => result.current.handleOpenDelete());
    expect(result.current.deleteOpen).toBe(true);
    act(() => result.current.handleCloseDelete());
    expect(result.current.deleteOpen).toBe(false);
    act(() => result.current.handleSelectChange(CREATE_NEW_OPTION_VALUE));
    expect(result.current.createOpen).toBe(true);
    act(() => result.current.handleCloseCreate());
    expect(result.current.createOpen).toBe(false);
  });
});
