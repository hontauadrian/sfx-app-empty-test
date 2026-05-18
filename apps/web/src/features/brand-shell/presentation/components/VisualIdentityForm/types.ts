import type { UseFormReturn } from 'react-hook-form';
import type { UpsertVisualIdentityInput } from '@sfx/domain';

export interface VisualIdentityFormProps {
  readonly brandId: string;
  readonly onDirtyChange?: (dirty: boolean) => void;
}

export interface VisualIdentitySectionsCopy {
  readonly logo: string;
  readonly colorPalette: string;
  readonly typography: string;
  readonly spacing: string;
  readonly imageStyle: string;
  readonly iconography: string;
  readonly restrictions: string;
}

export interface VisualIdentityFieldCopy {
  readonly label: string;
  readonly placeholder?: string;
}

export interface VisualIdentityFieldsCopy {
  readonly logoUsage: VisualIdentityFieldCopy;
  readonly paletteName: VisualIdentityFieldCopy;
  readonly paletteHex: VisualIdentityFieldCopy;
  readonly paletteUsage: VisualIdentityFieldCopy;
  readonly typographyFont: VisualIdentityFieldCopy;
  readonly typographyWeight: VisualIdentityFieldCopy;
  readonly typographyContext: VisualIdentityFieldCopy;
  readonly spacingGuidance: VisualIdentityFieldCopy;
  readonly imageStyleGuidance: VisualIdentityFieldCopy;
  readonly iconographyGuidance: VisualIdentityFieldCopy;
  readonly usageRestrictions: VisualIdentityFieldCopy;
}

export interface VisualIdentityCtaCopy {
  readonly save: string;
  readonly saving: string;
  readonly addPaletteEntry: string;
  readonly removePaletteEntry: string;
  readonly addTypographyEntry: string;
  readonly removeTypographyEntry: string;
}

export interface VisualIdentityFormUIModel {
  readonly status: 'loading' | 'ready';
  readonly pageTitle: string;
  readonly sections: VisualIdentitySectionsCopy;
  readonly fields: VisualIdentityFieldsCopy;
  readonly cta: VisualIdentityCtaCopy;
  readonly submitLabel: string;
  readonly isSubmitting: boolean;
  readonly submitDisabled: boolean;
  readonly formError: string | null;
}

export interface UseVisualIdentityFormReturn {
  readonly uiModel: VisualIdentityFormUIModel;
  readonly form: UseFormReturn<UpsertVisualIdentityInput>;
  readonly handleSubmit: (event?: React.BaseSyntheticEvent) => Promise<void>;
}
