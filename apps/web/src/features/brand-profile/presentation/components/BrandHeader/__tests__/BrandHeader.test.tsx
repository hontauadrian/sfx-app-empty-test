import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BrandHeader } from '..';

function renderHeader(
  overrides: Partial<Parameters<typeof BrandHeader>[0]> = {},
): { props: Parameters<typeof BrandHeader>[0] } & ReturnType<typeof render> {
  const props = {
    brandName: 'Acme',
    settingsLabel: 'Brand settings',
    renameLabel: 'Rename',
    deleteLabel: 'Delete brand',
    onRename: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  } satisfies Parameters<typeof BrandHeader>[0];
  return { props, ...render(<BrandHeader {...props} />) };
}

describe('BrandHeader', () => {
  it('renders the brand name and a collapsed settings menu by default', () => {
    renderHeader();
    expect(screen.getByRole('heading', { name: 'Acme' })).toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('opens the menu when settings is clicked and closes it on rename', async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();
    renderHeader({ onRename });
    await user.click(screen.getByRole('button', { name: 'Brand settings' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }));
    expect(onRename).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('invokes the delete handler from the menu and closes it', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    renderHeader({ onDelete });
    await user.click(screen.getByRole('button', { name: 'Brand settings' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete brand' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
