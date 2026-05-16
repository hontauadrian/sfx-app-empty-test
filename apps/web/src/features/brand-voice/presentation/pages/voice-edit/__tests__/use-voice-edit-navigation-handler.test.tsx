import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}));

import { useRouter } from 'next/navigation';
import { useVoiceEditNavigationHandler } from '../use-voice-edit-navigation-handler';

describe('useVoiceEditNavigationHandler', () => {
  beforeEach(() => {
    (useRouter as unknown as Mock).mockReset();
  });

  it('navigates to brandRoute when target is "saved" and clears', () => {
    const push = vi.fn();
    (useRouter as unknown as Mock).mockReturnValue({ push });
    const onNavigated = vi.fn();
    renderHook(() => useVoiceEditNavigationHandler('brand-1', 'saved', onNavigated));
    expect(push).toHaveBeenCalledWith('/brands/brand-1');
    expect(onNavigated).toHaveBeenCalledTimes(1);
  });

  it('navigates when target is "cancel"', () => {
    const push = vi.fn();
    (useRouter as unknown as Mock).mockReturnValue({ push });
    const onNavigated = vi.fn();
    renderHook(() => useVoiceEditNavigationHandler('brand-2', 'cancel', onNavigated));
    expect(push).toHaveBeenCalledWith('/brands/brand-2');
    expect(onNavigated).toHaveBeenCalledTimes(1);
  });

  it('does nothing when target is null', () => {
    const push = vi.fn();
    (useRouter as unknown as Mock).mockReturnValue({ push });
    const onNavigated = vi.fn();
    renderHook(() => useVoiceEditNavigationHandler('brand-3', null, onNavigated));
    expect(push).not.toHaveBeenCalled();
    expect(onNavigated).not.toHaveBeenCalled();
  });
});
