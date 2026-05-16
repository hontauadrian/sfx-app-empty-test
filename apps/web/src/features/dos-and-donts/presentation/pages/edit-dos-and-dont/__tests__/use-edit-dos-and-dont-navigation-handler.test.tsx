import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: (): { push: typeof pushMock } => ({ push: pushMock }),
}));

import { useEditDosAndDontNavigationHandler } from '../use-edit-dos-and-dont-navigation-handler';

describe('useEditDosAndDontNavigationHandler', () => {
  it('navigates and clears on saved', () => {
    pushMock.mockClear();
    const onNavigated = vi.fn();
    renderHook(() => useEditDosAndDontNavigationHandler('b-1', 'saved', onNavigated));
    expect(pushMock).toHaveBeenCalledWith('/brands/b-1');
    expect(onNavigated).toHaveBeenCalled();
  });

  it('does nothing on null', () => {
    pushMock.mockClear();
    const onNavigated = vi.fn();
    renderHook(() => useEditDosAndDontNavigationHandler('b-1', null, onNavigated));
    expect(pushMock).not.toHaveBeenCalled();
  });
});
