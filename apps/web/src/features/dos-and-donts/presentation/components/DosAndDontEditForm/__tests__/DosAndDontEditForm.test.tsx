import type { ReactElement } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LanguageProvider, useTranslations } from '@/features/presentation/localization';
import type { CommonTranslations } from '@/features/presentation/localization';
import { DosAndDontEditForm } from '..';

function Harness({
  onSubmit,
  onCancel = vi.fn(),
  defaultValues = {
    type: 'do' as const,
    category: 'tone' as const,
    title: '',
    body: '',
  },
}: {
  onSubmit: (values: unknown) => void;
  onCancel?: () => void;
  defaultValues?: {
    type: 'do' | 'dont';
    category:
      | 'tone'
      | 'vocabulary'
      | 'visuals'
      | 'legal'
      | 'campaign-messaging';
    title: string;
    body: string;
    suggestedCorrection?: string | null;
  };
}): ReactElement {
  const translations = useTranslations('common') as CommonTranslations;
  return (
    <DosAndDontEditForm
      defaultValues={defaultValues}
      translations={translations}
      isSubmitting={false}
      serverError={null}
      submitLabel="Save"
      cancelLabel="Cancel"
      onSubmit={onSubmit}
      onCancel={onCancel}
    />
  );
}

describe('DosAndDontEditForm', () => {
  it('renders type radio group and a category select with all five categories', () => {
    render(
      <LanguageProvider>
        <Harness onSubmit={vi.fn()} />
      </LanguageProvider>,
    );
    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(5);
  });

  it('submits trimmed values when the title and body are populated', async () => {
    const onSubmit = vi.fn();
    render(
      <LanguageProvider>
        <Harness onSubmit={onSubmit} />
      </LanguageProvider>,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Title'), 'Use active voice');
    await user.type(screen.getByLabelText('Body'), 'Prefer active.');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'do',
          category: 'tone',
          title: 'Use active voice',
          body: 'Prefer active.',
        }),
      ),
    );
  });

  it('does not call onSubmit when the title is empty (whitespace)', async () => {
    const onSubmit = vi.fn();
    render(
      <LanguageProvider>
        <Harness onSubmit={onSubmit} />
      </LanguageProvider>,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Body'), 'body present');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  it('calls onCancel when the cancel button is clicked', async () => {
    const onCancel = vi.fn();
    render(
      <LanguageProvider>
        <Harness onSubmit={vi.fn()} onCancel={onCancel} />
      </LanguageProvider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
