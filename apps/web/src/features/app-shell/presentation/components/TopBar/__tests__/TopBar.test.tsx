import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TopBar } from '..';

describe('TopBar', () => {
  it('renders the brand mark, active-brand selector and user menu side-by-side', () => {
    render(
      <TopBar
        brandMarkLabel="Brand Guidelines"
        brandMarkHref="/"
        selectBrandLabel="Select brand"
        currentBrandName="Acme"
        brandOptions={[{ id: 'brand-1', name: 'Acme' }]}
        createBrandLabel="+ Create brand"
        signOutLabel="Sign out"
        signOutHref="/oauth2/sign_out"
        email="user@example.com"
        onSelectBrand={vi.fn()}
        onCreateBrand={vi.fn()}
      />,
    );

    expect(screen.getByRole('link', { name: 'Brand Guidelines' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('button', { name: 'Select brand' })).toHaveTextContent('Acme');
    expect(screen.getByRole('button', { name: 'Sign out' })).toHaveTextContent('user@example.com');
  });
});
