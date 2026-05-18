import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/features/auth', () => ({
  AuthGate: ({ children }: { children: ReactNode }): ReactNode => (
    <div data-testid="auth-gate">{children}</div>
  ),
}));

vi.mock('@/features/admin-shell', () => ({
  AdminRouteGate: ({ children }: { children: ReactNode }): ReactNode => (
    <div data-testid="admin-route-gate">{children}</div>
  ),
  AdminTabBar: (): ReactNode => <div data-testid="admin-tab-bar" />,
}));

import AdminLayout from '../layout';

describe('AdminLayout', () => {
  it('wraps children in AuthGate > AdminRouteGate', () => {
    render(
      <AdminLayout>
        <div data-testid="child" />
      </AdminLayout>,
    );
    const authGate = screen.getByTestId('auth-gate');
    const routeGate = screen.getByTestId('admin-route-gate');
    const child = screen.getByTestId('child');
    expect(authGate).toContainElement(routeGate);
    expect(routeGate).toContainElement(child);
  });

  it('mounts AdminTabBar inside the AdminRouteGate alongside children', () => {
    render(
      <AdminLayout>
        <div data-testid="child" />
      </AdminLayout>,
    );
    const routeGate = screen.getByTestId('admin-route-gate');
    const tabBar = screen.getByTestId('admin-tab-bar');
    const child = screen.getByTestId('child');
    expect(routeGate).toContainElement(tabBar);
    expect(routeGate).toContainElement(child);
  });
});
