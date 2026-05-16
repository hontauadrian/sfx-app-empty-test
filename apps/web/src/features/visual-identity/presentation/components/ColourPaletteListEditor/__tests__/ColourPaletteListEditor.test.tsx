import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useForm, FormProvider } from 'react-hook-form';
import type { ReactNode } from 'react';
import { ColourPaletteListEditor } from '../index';
import type { VisualIdentityFormValues } from '../../../validators/visual-identity-form';

const LABELS = {
  label: 'Colour palette',
  nameLabel: 'Name',
  hexLabel: 'Hex',
  usageLabel: 'Usage',
  addLabel: '+ Add',
  removeLabel: 'Remove',
  emptyPlaceholder: 'No entries yet',
  nameMaxLength: 120,
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

describe('ColourPaletteListEditor', () => {
  it('renders the empty-state placeholder when there are no rows', () => {
    render(
      <Harness>
        {(methods) => (
          <ColourPaletteListEditor control={methods.control} {...LABELS} />
        )}
      </Harness>,
    );
    expect(screen.getByText('No entries yet')).toBeInTheDocument();
  });

  it('appends a fresh row when the add button is pressed', () => {
    render(
      <Harness>
        {(methods) => (
          <ColourPaletteListEditor control={methods.control} {...LABELS} />
        )}
      </Harness>,
    );
    fireEvent.click(screen.getByRole('button', { name: '+ Add' }));
    expect(screen.getByLabelText('Name 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Hex 1')).toBeInTheDocument();
  });

  it('writes typed values into the form state and removes rows', () => {
    render(
      <Harness>
        {(methods) => (
          <ColourPaletteListEditor control={methods.control} {...LABELS} />
        )}
      </Harness>,
    );
    fireEvent.click(screen.getByRole('button', { name: '+ Add' }));
    fireEvent.change(screen.getByLabelText('Name 1'), { target: { value: 'Primary' } });
    expect((screen.getByLabelText('Name 1') as HTMLInputElement).value).toBe('Primary');
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.getByText('No entries yet')).toBeInTheDocument();
  });

  it('renders an initial populated row with the provided default values', () => {
    render(
      <Harness
        defaultValues={{
          colourPalette: [{ name: 'Primary', hex: 'xxx', usage: 'Main.' }],
        }}
      >
        {(methods) => (
          <ColourPaletteListEditor control={methods.control} {...LABELS} />
        )}
      </Harness>,
    );
    expect((screen.getByLabelText('Name 1') as HTMLInputElement).value).toBe('Primary');
    expect((screen.getByLabelText('Usage 1') as HTMLInputElement).value).toBe('Main.');
  });
});
