import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

vi.mock('@/features/auth', () => ({
  AuthGate: ({ children }: { children: ReactNode }): ReactNode => (
    <div data-testid="auth-gate">{children}</div>
  ),
}));

vi.mock('@/features/app-shell', () => ({
  AppShell: ({ children }: { children: ReactNode }): ReactNode => (
    <div data-testid="app-shell">{children}</div>
  ),
}));

vi.mock('@/features/content-check', () => ({
  ContentCheckPage: (): ReactNode => (
    <div data-testid="content-check-page">page</div>
  ),
}));

import Page from '../page';

describe('app/content-check/page', () => {
  it('renders ContentCheckPage inside AuthGate and AppShell, in order', () => {
    render(<Page />);
    const authGate = screen.getByTestId('auth-gate');
    const appShell = screen.getByTestId('app-shell');
    const page = screen.getByTestId('content-check-page');
    expect(authGate).toContainElement(appShell);
    expect(appShell).toContainElement(page);
  });
});
