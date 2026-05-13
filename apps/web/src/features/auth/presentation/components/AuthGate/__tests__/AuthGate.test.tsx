import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../use-auth-gate', () => ({
  useAuthGate: vi.fn(),
}));

import { AuthGate } from '../index';
import { useAuthGate } from '../use-auth-gate';

describe('AuthGate', () => {
  beforeEach(() => {
    vi.mocked(useAuthGate).mockReturnValue({
      uiModel: {
        shouldRenderChildren: false,
        isLoading: false,
        title: 'Access pending',
        message: 'Ask an administrator for access.',
        logoutLabel: 'Logout',
        logoutHref: '/oauth2/sign_out?rd=/',
      },
    });
  });

  it('renders children when access is available', () => {
    vi.mocked(useAuthGate).mockReturnValue({
      uiModel: {
        shouldRenderChildren: true,
        isLoading: false,
        title: 'Access pending',
        message: 'Ask an administrator for access.',
        logoutLabel: 'Logout',
        logoutHref: '/oauth2/sign_out?rd=/',
      },
    });

    render(<AuthGate>Protected app</AuthGate>);

    expect(screen.getByText('Protected app')).toBeInTheDocument();
  });

  it('renders a logout link when access is pending', () => {
    render(<AuthGate>{'Protected app' as ReactNode}</AuthGate>);

    expect(screen.getByRole('heading', { name: 'Access pending' })).toBeInTheDocument();
    expect(screen.getByText('Ask an administrator for access.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Logout' })).toHaveAttribute(
      'href',
      '/oauth2/sign_out?rd=/',
    );
  });
});
