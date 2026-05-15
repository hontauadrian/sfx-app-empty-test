import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RenameBrandModal } from '..';

function renderModal(
  overrides: Partial<Parameters<typeof RenameBrandModal>[0]> = {},
): { props: Parameters<typeof RenameBrandModal>[0] } & ReturnType<typeof render> {
  const props = {
    title: 'Rename brand',
    nameLabel: 'Brand name',
    initialName: 'Acme',
    submitLabel: 'Save',
    cancelLabel: 'Cancel',
    nameRequiredError: 'Brand name is required',
    nameTooLongError: 'Brand name must be at most 120 characters',
    isSubmitting: false,
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  } satisfies Parameters<typeof RenameBrandModal>[0];
  return { props, ...render(<RenameBrandModal {...props} />) };
}

describe('RenameBrandModal', () => {
  it('shows the initial name and submits the trimmed value', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderModal({ onSubmit });

    const input = screen.getByLabelText('Brand name');
    await user.clear(input);
    await user.type(input, '  Renamed Brand  ');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSubmit).toHaveBeenCalledWith('Renamed Brand');
  });

  it('blocks submit when the name is empty after trim and displays the required error', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderModal({ onSubmit, initialName: '' });

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Brand name is required')).toBeInTheDocument();
  });

  it('invokes onCancel when cancel is clicked', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    renderModal({ onCancel });
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('disables submit while a save is in flight', () => {
    renderModal({ isSubmitting: true });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });
});
