import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const replaceMock = vi.fn();
const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: (): { replace: ReturnType<typeof vi.fn>; push: ReturnType<typeof vi.fn> } => ({ replace: replaceMock, push: pushMock }),
}));

import { useBrandGuidelinesDetailNavigationHandler } from '../use-brand-guidelines-detail-navigation-handler';

beforeEach(() => {
  replaceMock.mockReset();
  pushMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useBrandGuidelinesDetailNavigationHandler', () => {
  it('does nothing on null', () => {
    const onNavigated = vi.fn();
    renderHook(() => useBrandGuidelinesDetailNavigationHandler(null, onNavigated));
    expect(pushMock).not.toHaveBeenCalled();
    expect(onNavigated).not.toHaveBeenCalled();
  });

  it('pushes the brand detail route for detail target', () => {
    const onNavigated = vi.fn();
    renderHook(() =>
      useBrandGuidelinesDetailNavigationHandler(
        { kind: 'detail', brandId: 'clxbrand0001' },
        onNavigated,
      ),
    );
    expect(pushMock).toHaveBeenCalledWith('/admin/brand-guidelines/clxbrand0001');
    expect(onNavigated).toHaveBeenCalled();
  });

  it('pushes the list route for empty target', () => {
    const onNavigated = vi.fn();
    renderHook(() =>
      useBrandGuidelinesDetailNavigationHandler({ kind: 'empty' }, onNavigated),
    );
    expect(pushMock).toHaveBeenCalledWith('/admin/brand-guidelines');
    expect(onNavigated).toHaveBeenCalled();
  });
});
