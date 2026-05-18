import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Toaster } from '../Toaster';
import { useToastStore } from '../use-toast-store';

function resetStore(): void {
  useToastStore.setState({ toasts: [] });
}

describe('Toaster', () => {
  beforeEach(() => {
    resetStore();
  });

  afterEach(() => {
    resetStore();
  });

  it('renders an empty polite live region when there are no toasts', () => {
    render(<Toaster />);
    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveAttribute('aria-atomic', 'false');
    expect(screen.queryAllByRole('listitem')).toEqual([]);
  });

  it('renders a list item per toast with variant data and message', () => {
    render(<Toaster />);
    act(() => {
      useToastStore.getState().pushToast('success', 'Saved');
      useToastStore.getState().pushToast('error', 'Boom');
    });
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveAttribute('data-variant', 'success');
    expect(items[0]).toHaveTextContent('Saved');
    expect(items[1]).toHaveAttribute('data-variant', 'error');
    expect(items[1]).toHaveTextContent('Boom');
  });

  it('exposes an accessible dismiss button that clears its toast', async () => {
    const user = userEvent.setup();
    render(<Toaster />);
    act(() => {
      useToastStore.getState().pushToast('success', 'Saved');
    });
    const dismissButton = screen.getByRole('button', { name: 'Dismiss notification' });
    await user.click(dismissButton);
    expect(useToastStore.getState().toasts).toEqual([]);
    expect(screen.queryAllByRole('listitem')).toEqual([]);
  });
});
