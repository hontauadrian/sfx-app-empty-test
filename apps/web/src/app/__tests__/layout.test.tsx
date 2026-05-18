import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/features/presentation/theme', () => ({
  getThemeScript: (): string => 'window.__sfx_theme_test = true;',
}));

vi.mock('@/features/admin-shell', () => ({
  Sidebar: (): ReactNode => <aside data-testid="sidebar-mock" />,
}));

vi.mock('@/features/presentation/toast', () => ({
  Toaster: (): ReactNode => <div data-testid="toaster-mock" />,
}));

vi.mock('../providers', () => ({
  Providers: ({ children }: { children: ReactNode }): ReactNode => (
    <div data-testid="providers-mock">{children}</div>
  ),
}));

import RootLayout from '../layout';

describe('RootLayout', () => {
  it('mounts Sidebar inside Providers in a flex container', () => {
    const { getByTestId } = render(
      <RootLayout>
        <div data-testid="route-content">child</div>
      </RootLayout>,
    );

    const providers = getByTestId('providers-mock');
    const sidebar = getByTestId('sidebar-mock');
    const routeContent = getByTestId('route-content');
    const toaster = getByTestId('toaster-mock');

    expect(providers).toContainElement(sidebar);
    expect(providers).toContainElement(routeContent);
    expect(providers).toContainElement(toaster);

    const flexContainer = providers.querySelector('div.flex');
    expect(flexContainer).not.toBeNull();
    expect(flexContainer?.className).toContain('min-h-screen');
    expect(flexContainer).toContainElement(sidebar);
    expect(flexContainer).toContainElement(routeContent);
    expect(flexContainer).not.toContainElement(toaster);
  });

  it('preserves <html lang="en"> on the root element', () => {
    const tree = RootLayout({ children: null });
    expect(tree).toMatchObject({ props: { lang: 'en' } });
  });
});
