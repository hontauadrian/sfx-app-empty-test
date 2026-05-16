import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: (): { push: typeof pushMock } => ({ push: pushMock }),
}));

import { useNewDosAndDontNavigationHandler } from '../use-new-dos-and-dont-navigation-handler';

describe('useNewDosAndDontNavigationHandler', () => {
  it('does not navigate when target is null', () => {
    pushMock.mockClear();
    const onNavigated = vi.fn();
    renderHook(() => useNewDosAndDontNavigationHandler('b-1', null, onNavigated));
    expect(pushMock).not.toHaveBeenCalled();
    expect(onNavigated).not.toHaveBeenCalled();
  });

  it('navigates back to the brand route on saved and clears the target', () => {
    pushMock.mockClear();
    const onNavigated = vi.fn();
    renderHook(() => useNewDosAndDontNavigationHandler('b-1', 'saved', onNavigated));
    expect(pushMock).toHaveBeenCalledWith('/brands/b-1');
    expect(onNavigated).toHaveBeenCalledTimes(1);
  });

  it('navigates back to the brand route on cancel and clears the target', () => {
    pushMock.mockClear();
    const onNavigated = vi.fn();
    renderHook(() => useNewDosAndDontNavigationHandler('b-1', 'cancel', onNavigated));
    expect(pushMock).toHaveBeenCalledWith('/brands/b-1');
    expect(onNavigated).toHaveBeenCalledTimes(1);
  });
});
