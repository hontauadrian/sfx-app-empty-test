import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useForm, FormProvider } from 'react-hook-form';
import type { ReactNode } from 'react';
import { TypographyRulesListEditor } from '../index';
import type { VisualIdentityFormValues } from '../../../validators/visual-identity-form';

const LABELS = {
  label: 'Typography rules',
  roleLabel: 'Role',
  familyLabel: 'Family',
  weightLabel: 'Weight',
  sizeLabel: 'Size',
  notesLabel: 'Notes',
  addLabel: '+ Add',
  removeLabel: 'Remove',
  emptyPlaceholder: 'No rules yet',
  shortMaxLength: 120,
} as const;

function Harness({
  defaultValues,
  children,
}: {
  defaultValues?: Partial<VisualIdentityFormValues>;
  children: (control: ReturnType<typeof useForm<VisualIdentityFormValues>>) => ReactNode;
}): ReactNode {
  const methods = useForm<VisualIdentityFormValues>({
    defaultValues: {
      logoUsageRules: null,
      colourPalette: [],
      typographyRules: [],
      spacingLayoutGuidance: null,
      imageStyleGuidance: null,
      iconographyGuidance: null,
      usageRestrictions: null,
      ...defaultValues,
    } as VisualIdentityFormValues,
  });
  return <FormProvider {...methods}>{children(methods)}</FormProvider>;
}

describe('TypographyRulesListEditor', () => {
  it('renders the empty-state placeholder when there are no rules', () => {
    render(
      <Harness>
        {(methods) => (
          <TypographyRulesListEditor control={methods.control} {...LABELS} />
        )}
      </Harness>,
    );
    expect(screen.getByText('No rules yet')).toBeInTheDocument();
  });

  it('appends a fresh row and accepts typed values', () => {
    render(
      <Harness>
        {(methods) => (
          <TypographyRulesListEditor control={methods.control} {...LABELS} />
        )}
      </Harness>,
    );
    fireEvent.click(screen.getByRole('button', { name: '+ Add' }));
    fireEvent.change(screen.getByLabelText('Role 1'), { target: { value: 'Display' } });
    fireEvent.change(screen.getByLabelText('Family 1'), { target: { value: 'Inter' } });
    fireEvent.change(screen.getByLabelText('Weight 1'), { target: { value: '700' } });
    expect((screen.getByLabelText('Role 1') as HTMLInputElement).value).toBe('Display');
    expect((screen.getByLabelText('Weight 1') as HTMLInputElement).value).toBe('700');
  });

  it('removes a row when the remove button is pressed', () => {
    render(
      <Harness
        defaultValues={{
          typographyRules: [
            { role: 'Display', family: 'Inter', weight: '700', size: '48px', notes: null },
          ],
        }}
      >
        {(methods) => (
          <TypographyRulesListEditor control={methods.control} {...LABELS} />
        )}
      </Harness>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.getByText('No rules yet')).toBeInTheDocument();
  });
});
