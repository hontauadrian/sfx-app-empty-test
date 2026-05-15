import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DeleteBrandConfirmModal } from '..';

function renderModal(
  overrides: Partial<Parameters<typeof DeleteBrandConfirmModal>[0]> = {},
): { props: Parameters<typeof DeleteBrandConfirmModal>[0] } & ReturnType<typeof render> {
  const props = {
    title: 'Delete brand',
    body: 'Are you sure?',
    confirmLabel: 'Delete',
    cancelLabel: 'Cancel',
    isSubmitting: false,
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  } satisfies Parameters<typeof DeleteBrandConfirmModal>[0];
  return { props, ...render(<DeleteBrandConfirmModal {...props} />) };
}

describe('DeleteBrandConfirmModal', () => {
  it('renders the title and body copy', () => {
    renderModal();
    expect(screen.getByRole('heading', { name: 'Delete brand' })).toBeInTheDocument();
    expect(screen.getByText('Are you sure?')).toBeInTheDocument();
  });

  it('invokes the confirm and cancel handlers from their buttons', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    renderModal({ onConfirm, onCancel });

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('disables confirm while the delete is in flight', () => {
    renderModal({ isSubmitting: true });
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });
});
