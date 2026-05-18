import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../use-admin-tab-bar', () => ({
  useAdminTabBar: vi.fn(),
}));

import { AdminTabBar } from '../index';
import { useAdminTabBar } from '../use-admin-tab-bar';

describe('AdminTabBar', () => {
  beforeEach(() => {
    vi.mocked(useAdminTabBar).mockReset();
  });

  it('renders a navigation landmark with the supplied aria-label', () => {
    vi.mocked(useAdminTabBar).mockReturnValue({
      uiModel: {
        navAriaLabel: 'SFX App',
        items: [
          { key: 'companyInfo', label: 'Company Info', href: '/admin/company-info', isActive: true },
        ],
      },
    });
    render(<AdminTabBar />);
    const nav = screen.getByRole('navigation', { name: 'SFX App' });
    expect(nav).toBeInTheDocument();
  });

  it('renders one link per uiModel item with the right href and label', () => {
    vi.mocked(useAdminTabBar).mockReturnValue({
      uiModel: {
        navAriaLabel: 'SFX App',
        items: [
          { key: 'companyInfo', label: 'Company Info', href: '/admin/company-info', isActive: true },
          { key: 'users', label: 'Users', href: '/admin/users', isActive: false },
        ],
      },
    });
    render(<AdminTabBar />);
    const companyInfo = screen.getByRole('link', { name: 'Company Info' });
    const users = screen.getByRole('link', { name: 'Users' });
    expect(companyInfo).toHaveAttribute('href', '/admin/company-info');
    expect(users).toHaveAttribute('href', '/admin/users');
  });

  it('marks only the active item with aria-current=page', () => {
    vi.mocked(useAdminTabBar).mockReturnValue({
      uiModel: {
        navAriaLabel: 'SFX App',
        items: [
          { key: 'companyInfo', label: 'Company Info', href: '/admin/company-info', isActive: true },
          { key: 'users', label: 'Users', href: '/admin/users', isActive: false },
        ],
      },
    });
    render(<AdminTabBar />);
    const companyInfo = screen.getByRole('link', { name: 'Company Info' });
    const users = screen.getByRole('link', { name: 'Users' });
    expect(companyInfo).toHaveAttribute('aria-current', 'page');
    expect(users).not.toHaveAttribute('aria-current');
  });

  it('applies an active theme token class to the active link', () => {
    vi.mocked(useAdminTabBar).mockReturnValue({
      uiModel: {
        navAriaLabel: 'SFX App',
        items: [
          { key: 'companyInfo', label: 'Company Info', href: '/admin/company-info', isActive: true },
        ],
      },
    });
    render(<AdminTabBar />);
    const active = screen.getByRole('link', { name: 'Company Info' });
    expect(active.className).toContain('bg-muted');
  });

  it('renders exactly one link in a single-tab fixture', () => {
    vi.mocked(useAdminTabBar).mockReturnValue({
      uiModel: {
        navAriaLabel: 'SFX App',
        items: [
          { key: 'companyInfo', label: 'Company Info', href: '/admin/company-info', isActive: true },
        ],
      },
    });
    render(<AdminTabBar />);
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('renders Romanian labels when the uiModel provides them', () => {
    vi.mocked(useAdminTabBar).mockReturnValue({
      uiModel: {
        navAriaLabel: 'SFX App',
        items: [
          { key: 'companyInfo', label: 'Informatii companie', href: '/admin/company-info', isActive: true },
        ],
      },
    });
    render(<AdminTabBar />);
    expect(screen.getByRole('link', { name: 'Informatii companie' })).toBeInTheDocument();
  });
});
