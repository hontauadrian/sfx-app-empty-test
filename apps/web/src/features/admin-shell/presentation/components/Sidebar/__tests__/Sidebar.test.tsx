import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../use-sidebar', () => ({
  useSidebar: vi.fn(),
}));

import { Sidebar } from '../index';
import { useSidebar } from '../use-sidebar';

describe('Sidebar', () => {
  beforeEach(() => {
    vi.mocked(useSidebar).mockReset();
  });

  it('renders nothing when the uiModel is hidden', () => {
    vi.mocked(useSidebar).mockReturnValue({ uiModel: { status: 'hidden' } });
    const { container } = render(<Sidebar />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a skeleton rail when the uiModel is loading', () => {
    vi.mocked(useSidebar).mockReturnValue({ uiModel: { status: 'loading' } });
    render(<Sidebar />);
    const rail = screen.getByRole('complementary');
    expect(rail).toHaveAttribute('aria-busy', 'true');
  });

  it('renders a visible nav with item labels and href values', () => {
    vi.mocked(useSidebar).mockReturnValue({
      uiModel: {
        status: 'visible',
        navAriaLabel: 'SFX App',
        items: [
          { key: 'home', label: 'Home', href: '/', isActive: true },
          { key: 'admin', label: 'Admin', href: '/admin', isActive: false },
        ],
      },
    });

    render(<Sidebar />);

    const nav = screen.getByRole('navigation', { name: 'SFX App' });
    expect(nav).toBeInTheDocument();
    const home = screen.getByRole('link', { name: 'Home' });
    const admin = screen.getByRole('link', { name: 'Admin' });
    expect(home).toHaveAttribute('href', '/');
    expect(admin).toHaveAttribute('href', '/admin');
    expect(home).toHaveAttribute('aria-current', 'page');
    expect(admin).not.toHaveAttribute('aria-current');
  });

  it('applies an active theme token to the active link', () => {
    vi.mocked(useSidebar).mockReturnValue({
      uiModel: {
        status: 'visible',
        navAriaLabel: 'SFX App',
        items: [{ key: 'admin', label: 'Admin', href: '/admin', isActive: true }],
      },
    });

    render(<Sidebar />);

    const admin = screen.getByRole('link', { name: 'Admin' });
    expect(admin.className).toContain('bg-muted');
  });

  it('renders Romanian labels when the uiModel provides them', () => {
    vi.mocked(useSidebar).mockReturnValue({
      uiModel: {
        status: 'visible',
        navAriaLabel: 'SFX App',
        items: [
          { key: 'home', label: 'Acasa', href: '/', isActive: true },
          { key: 'admin', label: 'Administrare', href: '/admin', isActive: false },
        ],
      },
    });

    render(<Sidebar />);
    expect(screen.getByRole('link', { name: 'Acasa' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Administrare' })).toBeInTheDocument();
  });
});
