import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { UserMenu } from '..';

describe('UserMenu', () => {
  it('renders the email on the toggle when available', () => {
    render(<UserMenu email="user@example.com" signOutLabel="Sign out" signOutHref="/logout" />);
    expect(screen.getByRole('button', { name: 'Sign out' })).toHaveTextContent('user@example.com');
  });

  it('falls back to the sign-out label when email is null', () => {
    render(<UserMenu email={null} signOutLabel="Sign out" signOutHref="/logout" />);
    expect(screen.getByRole('button', { name: 'Sign out' })).toHaveTextContent('Sign out');
  });

  it('exposes the sign-out link in the menu with the documented href', async () => {
    const user = userEvent.setup();
    render(<UserMenu email="user@example.com" signOutLabel="Sign out" signOutHref="/oauth2/sign_out" />);
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    const link = screen.getByRole('menuitem', { name: 'Sign out' });
    expect(link).toHaveAttribute('href', '/oauth2/sign_out');
  });
});
