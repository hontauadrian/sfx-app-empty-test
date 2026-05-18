import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TOAST_AUTO_DISMISS_MS, useToastStore } from '../use-toast-store';

function resetStore(): void {
  useToastStore.setState({ toasts: [] });
}

describe('useToastStore', () => {
  beforeEach(() => {
    resetStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    resetStore();
  });

  it('starts with an empty toast list', () => {
    expect(useToastStore.getState().toasts).toEqual([]);
  });

  it('pushToast appends a toast and returns its id', () => {
    const id = useToastStore.getState().pushToast('success', 'Saved');
    expect(typeof id).toBe('string');
    expect(useToastStore.getState().toasts).toHaveLength(1);
    expect(useToastStore.getState().toasts[0]).toMatchObject({ id, variant: 'success', message: 'Saved' });
  });

  it('produces unique ids across successive pushes', () => {
    const idA = useToastStore.getState().pushToast('success', 'A');
    const idB = useToastStore.getState().pushToast('error', 'B');
    expect(idA).not.toBe(idB);
    expect(useToastStore.getState().toasts.map((toast) => toast.id)).toEqual([idA, idB]);
  });

  it('dismissToast removes the toast with the matching id only', () => {
    const idA = useToastStore.getState().pushToast('success', 'A');
    const idB = useToastStore.getState().pushToast('error', 'B');
    useToastStore.getState().dismissToast(idA);
    const remaining = useToastStore.getState().toasts.map((toast) => toast.id);
    expect(remaining).toEqual([idB]);
  });

  it('dismissToast is a no-op for a missing id', () => {
    const idA = useToastStore.getState().pushToast('success', 'A');
    useToastStore.getState().dismissToast('missing-id');
    expect(useToastStore.getState().toasts.map((toast) => toast.id)).toEqual([idA]);
  });

  it('clear removes every toast', () => {
    useToastStore.getState().pushToast('success', 'A');
    useToastStore.getState().pushToast('error', 'B');
    useToastStore.getState().clear();
    expect(useToastStore.getState().toasts).toEqual([]);
  });

  it('auto-dismisses a toast after TOAST_AUTO_DISMISS_MS', () => {
    const id = useToastStore.getState().pushToast('success', 'Auto');
    expect(useToastStore.getState().toasts.map((toast) => toast.id)).toEqual([id]);
    vi.advanceTimersByTime(TOAST_AUTO_DISMISS_MS - 1);
    expect(useToastStore.getState().toasts).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(useToastStore.getState().toasts).toEqual([]);
  });

  it('auto-dismiss does not remove unrelated toasts', () => {
    const idA = useToastStore.getState().pushToast('success', 'A');
    vi.advanceTimersByTime(2000);
    const idB = useToastStore.getState().pushToast('error', 'B');
    vi.advanceTimersByTime(TOAST_AUTO_DISMISS_MS - 2000);
    expect(useToastStore.getState().toasts.map((toast) => toast.id)).toEqual([idB]);
    vi.advanceTimersByTime(2000);
    expect(useToastStore.getState().toasts).toEqual([]);
    expect(idA).not.toBe(idB);
  });

  it('auto-dismiss timeout is a no-op when toast was already manually dismissed', () => {
    const id = useToastStore.getState().pushToast('success', 'Manual');
    useToastStore.getState().dismissToast(id);
    vi.advanceTimersByTime(TOAST_AUTO_DISMISS_MS);
    expect(useToastStore.getState().toasts).toEqual([]);
  });
});
