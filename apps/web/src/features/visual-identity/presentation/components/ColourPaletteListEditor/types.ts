import type { Control } from 'react-hook-form';
import type { VisualIdentityFormValues } from '../../validators/visual-identity-form';

export interface ColourPaletteListEditorProps {
  readonly control: Control<VisualIdentityFormValues>;
  readonly label: string;
  readonly nameLabel: string;
  readonly hexLabel: string;
  readonly usageLabel: string;
  readonly addLabel: string;
  readonly removeLabel: string;
  readonly emptyPlaceholder: string;
  readonly nameMaxLength: number;
}
