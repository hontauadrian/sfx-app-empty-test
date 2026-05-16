import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { common as enCommon } from '@/features/presentation/localization/languages/en/common';
import { VisualIdentityEditForm } from '../index';
import type { VisualIdentityFormValues } from '../../../validators/visual-identity-form';

function emptyDefaults(): VisualIdentityFormValues {
  return {
    logoUsageRules: null,
    colourPalette: [],
    typographyRules: [],
    spacingLayoutGuidance: null,
    imageStyleGuidance: null,
    iconographyGuidance: null,
    usageRestrictions: null,
  } as VisualIdentityFormValues;
}

describe('VisualIdentityEditForm', () => {
  it('renders every field section + the two list editors', () => {
    render(
      <VisualIdentityEditForm
        defaultValues={emptyDefaults()}
        translations={enCommon}
        isSubmitting={false}
        serverError={null}
        saveLabel="Save"
        cancelLabel="Cancel"
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(
      screen.getByText(enCommon.visualIdentityLogoUsageRulesLabel),
    ).toBeInTheDocument();
    expect(
      screen.getByText(enCommon.visualIdentityColourPaletteLabel),
    ).toBeInTheDocument();
    expect(
      screen.getByText(enCommon.visualIdentityTypographyRulesLabel),
    ).toBeInTheDocument();
    expect(
      screen.getByText(enCommon.visualIdentitySpacingLayoutGuidanceLabel),
    ).toBeInTheDocument();
    expect(
      screen.getByText(enCommon.visualIdentityImageStyleGuidanceLabel),
    ).toBeInTheDocument();
    expect(
      screen.getByText(enCommon.visualIdentityIconographyGuidanceLabel),
    ).toBeInTheDocument();
    expect(
      screen.getByText(enCommon.visualIdentityUsageRestrictionsLabel),
    ).toBeInTheDocument();
  });

  it('invokes onSubmit when the form is valid', async () => {
    const onSubmit = vi.fn();
    render(
      <VisualIdentityEditForm
        defaultValues={emptyDefaults()}
        translations={enCommon}
        isSubmitting={false}
        serverError={null}
        saveLabel="Save"
        cancelLabel="Cancel"
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  });

  it('invokes onCancel when the cancel button is clicked', () => {
    const onCancel = vi.fn();
    render(
      <VisualIdentityEditForm
        defaultValues={emptyDefaults()}
        translations={enCommon}
        isSubmitting={false}
        serverError={null}
        saveLabel="Save"
        cancelLabel="Cancel"
        onSubmit={vi.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('renders the server error when provided', () => {
    render(
      <VisualIdentityEditForm
        defaultValues={emptyDefaults()}
        translations={enCommon}
        isSubmitting={false}
        serverError="Save failed"
        saveLabel="Save"
        cancelLabel="Cancel"
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText('Save failed')).toBeInTheDocument();
  });

  it('disables the submit button while submitting', () => {
    render(
      <VisualIdentityEditForm
        defaultValues={emptyDefaults()}
        translations={enCommon}
        isSubmitting={true}
        serverError={null}
        saveLabel="Save"
        cancelLabel="Cancel"
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });
});
