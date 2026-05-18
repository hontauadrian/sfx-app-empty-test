import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { LanguageProvider } from '@/features/presentation/localization';
import { DosAndDontsRowEditor } from '../index';

const baseProps = {
  initialValues: { type: '' as const, category: '' as const, ruleText: '', exampleText: '' },
  isSubmitting: false,
  onSubmit: vi.fn(),
  onCancel: vi.fn(),
};

describe('DosAndDontsRowEditor', () => {
  it('renders type, category, rule, example fields', () => {
    render(
      <LanguageProvider>
        <DosAndDontsRowEditor {...baseProps} />
      </LanguageProvider>,
    );
    expect(screen.getByText('Type')).toBeInTheDocument();
    expect(screen.getByText('Category')).toBeInTheDocument();
    expect(screen.getByText('Rule')).toBeInTheDocument();
  });

  it('blocks submit when fields invalid and surfaces errors', () => {
    const onSubmit = vi.fn();
    render(
      <LanguageProvider>
        <DosAndDontsRowEditor {...baseProps} onSubmit={onSubmit} />
      </LanguageProvider>,
    );
    fireEvent.submit(screen.getByTestId('dos-donts-row-editor'));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Type is required')).toBeInTheDocument();
    expect(screen.getByText('Rule text is required')).toBeInTheDocument();
  });

  it('submits valid values', () => {
    const onSubmit = vi.fn();
    render(
      <LanguageProvider>
        <DosAndDontsRowEditor
          {...baseProps}
          initialValues={{
            type: 'do',
            category: 'tone',
            ruleText: 'Use wordmark',
            exampleText: '',
          }}
          onSubmit={onSubmit}
        />
      </LanguageProvider>,
    );
    fireEvent.submit(screen.getByTestId('dos-donts-row-editor'));
    expect(onSubmit).toHaveBeenCalledWith({
      type: 'do',
      category: 'tone',
      ruleText: 'Use wordmark',
      exampleText: '',
    });
  });

  it('uses the "Saving…" label and disables submit when pending', () => {
    render(
      <LanguageProvider>
        <DosAndDontsRowEditor {...baseProps} isSubmitting />
      </LanguageProvider>,
    );
    const submit = screen.getByRole('button', { name: 'Saving…' });
    expect(submit).toBeDisabled();
  });

  it('fires onCancel when cancel button clicked', () => {
    const onCancel = vi.fn();
    render(
      <LanguageProvider>
        <DosAndDontsRowEditor {...baseProps} onCancel={onCancel} />
      </LanguageProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });
});
