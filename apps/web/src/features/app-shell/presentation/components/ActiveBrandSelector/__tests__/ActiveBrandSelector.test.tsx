import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ActiveBrandSelector } from '..';

function renderSelector(
  overrides: Partial<Parameters<typeof ActiveBrandSelector>[0]> = {},
): { props: Parameters<typeof ActiveBrandSelector>[0] } & ReturnType<typeof render> {
  const props = {
    selectLabel: 'Select brand',
    currentBrandName: 'Acme',
    options: [
      { id: 'brand-1', name: 'Acme' },
      { id: 'brand-2', name: 'Beta' },
    ],
    createBrandLabel: '+ Create brand',
    onSelect: vi.fn(),
    onCreate: vi.fn(),
    ...overrides,
  } satisfies Parameters<typeof ActiveBrandSelector>[0];
  return { props, ...render(<ActiveBrandSelector {...props} />) };
}

describe('ActiveBrandSelector', () => {
  it('renders the current brand name on the toggle when one is active', () => {
    renderSelector();
    expect(screen.getByRole('button', { name: 'Select brand' })).toHaveTextContent('Acme');
  });

  it('falls back to the select label when no brand is active', () => {
    renderSelector({ currentBrandName: null });
    expect(screen.getByRole('button', { name: 'Select brand' })).toHaveTextContent('Select brand');
  });

  it('lists every brand and the create-brand action when open', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onCreate = vi.fn();
    renderSelector({ onSelect, onCreate });

    await user.click(screen.getByRole('button', { name: 'Select brand' }));
    expect(screen.getAllByRole('option')).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'Beta' }));
    expect(onSelect).toHaveBeenCalledWith('brand-2');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Select brand' }));
    await user.click(screen.getByRole('button', { name: '+ Create brand' }));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });
});
