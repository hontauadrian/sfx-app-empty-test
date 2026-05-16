import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DeleteDosAndDontConfirmModal } from '..';

describe('DeleteDosAndDontConfirmModal', () => {
  it('renders title, body, and both buttons', () => {
    render(
      <DeleteDosAndDontConfirmModal
        title="Delete entry"
        body="Are you sure?"
        confirmLabel="Delete"
        cancelLabel="Cancel"
        isSubmitting={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole('dialog', { name: 'Delete entry' })).toBeInTheDocument();
    expect(screen.getByText('Are you sure?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled();
  });

  it('calls onConfirm and onCancel when the buttons are clicked', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <DeleteDosAndDontConfirmModal
        title="Delete"
        body="Confirm"
        confirmLabel="Delete"
        cancelLabel="Cancel"
        isSubmitting={false}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('disables the confirm button while submitting', () => {
    render(
      <DeleteDosAndDontConfirmModal
        title="Delete"
        body="Confirm"
        confirmLabel="Delete"
        cancelLabel="Cancel"
        isSubmitting={true}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });
});
