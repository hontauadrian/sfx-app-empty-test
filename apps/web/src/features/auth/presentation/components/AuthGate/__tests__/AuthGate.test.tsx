import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../use-auth-gate', () => ({
  useAuthGate: vi.fn(),
}));

import { AuthGate } from '../index';
import { useAuthGate } from '../use-auth-gate';

const EXPECTED_LOGOUT_HREF =
  '/oauth2/sign_out?rd=http%3A%2F%2Fkeycloak.localtest.me%3A9080%2Frealms%2Fsfx-webapp-boilerplate%2Fprotocol%2Fopenid-connect%2Flogout%3Fclient_id%3Dsfx-webapp-boilerplate-dev-proxy%26post_logout_redirect_uri%3Dhttp%253A%252F%252Fapp.localtest.me%253A4181%252F';

describe('AuthGate', () => {
  beforeEach(() => {
    vi.mocked(useAuthGate).mockReturnValue({
      uiModel: {
        shouldRenderChildren: false,
        isLoading: false,
        title: 'Access pending',
        message: 'Ask an administrator for access.',
        logoutLabel: 'Logout',
        logoutHref: EXPECTED_LOGOUT_HREF,
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
        logoutHref: EXPECTED_LOGOUT_HREF,
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
      EXPECTED_LOGOUT_HREF,
    );
  });
});
