import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useToast } from '../use-toast';
import { useToastStore } from '../use-toast-store';

function resetStore(): void {
  useToastStore.setState({ toasts: [] });
}

describe('useToast', () => {
  beforeEach(() => {
    resetStore();
  });

  afterEach(() => {
    resetStore();
  });

  it('success pushes a success toast and returns its id', () => {
    const { result } = renderHook(() => useToast());
    let id = '';
    act(() => {
      id = result.current.success('Saved');
    });
    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0]).toMatchObject({ id, variant: 'success', message: 'Saved' });
  });

  it('error pushes an error toast and returns its id', () => {
    const { result } = renderHook(() => useToast());
    let id = '';
    act(() => {
      id = result.current.error('Bad');
    });
    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0]).toMatchObject({ id, variant: 'error', message: 'Bad' });
  });

  it('dismiss removes the toast with the given id', () => {
    const { result } = renderHook(() => useToast());
    let id = '';
    act(() => {
      id = result.current.success('Saved');
    });
    expect(useToastStore.getState().toasts).toHaveLength(1);
    act(() => {
      result.current.dismiss(id);
    });
    expect(useToastStore.getState().toasts).toEqual([]);
  });
});
