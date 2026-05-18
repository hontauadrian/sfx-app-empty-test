import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { LanguageProvider } from '@/features/presentation/localization';
import { DeleteDosDontsConfirm } from '../index';

const baseProps = {
  open: true,
  ruleFragment: 'Use wordmark',
  isSubmitting: false,
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
};

describe('DeleteDosDontsConfirm', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <LanguageProvider>
        <DeleteDosDontsConfirm {...baseProps} open={false} />
      </LanguageProvider>,
    );
    expect(container.textContent).toBe('');
  });

  it('renders title + body with rule fragment interpolated', () => {
    render(
      <LanguageProvider>
        <DeleteDosDontsConfirm {...baseProps} />
      </LanguageProvider>,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/Use wordmark/)).toBeInTheDocument();
  });

  it('fires onConfirm and onCancel', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <LanguageProvider>
        <DeleteDosDontsConfirm {...baseProps} onConfirm={onConfirm} onCancel={onCancel} />
      </LanguageProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onConfirm).toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
  });

  it('shows the "Deleting…" label and disables the confirm button when submitting', () => {
    render(
      <LanguageProvider>
        <DeleteDosDontsConfirm {...baseProps} isSubmitting />
      </LanguageProvider>,
    );
    const confirm = screen.getByRole('button', { name: 'Deleting…' });
    expect(confirm).toBeDisabled();
  });
});
