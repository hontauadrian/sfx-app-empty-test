import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const replaceMock = vi.fn();
const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: (): { replace: ReturnType<typeof vi.fn>; push: ReturnType<typeof vi.fn> } => ({ replace: replaceMock, push: pushMock }),
}));

import { useBrandGuidelinesEmptyNavigationHandler } from '../use-brand-guidelines-empty-navigation-handler';

beforeEach(() => {
  replaceMock.mockReset();
  pushMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useBrandGuidelinesEmptyNavigationHandler', () => {
  it('does nothing for a null target', () => {
    const onNavigated = vi.fn();
    renderHook(() => useBrandGuidelinesEmptyNavigationHandler(null, onNavigated));
    expect(replaceMock).not.toHaveBeenCalled();
    expect(onNavigated).not.toHaveBeenCalled();
  });

  it('replaces the URL with the brand detail and calls onNavigated', () => {
    const onNavigated = vi.fn();
    renderHook(() =>
      useBrandGuidelinesEmptyNavigationHandler(
        { kind: 'detail', brandId: 'clxbrand0001' },
        onNavigated,
      ),
    );
    expect(replaceMock).toHaveBeenCalledWith('/admin/brand-guidelines/clxbrand0001');
    expect(onNavigated).toHaveBeenCalled();
  });
});
