import type { Control } from 'react-hook-form';
import type { VisualIdentityFormValues } from '../../validators/visual-identity-form';

export interface TypographyRulesListEditorProps {
  readonly control: Control<VisualIdentityFormValues>;
  readonly label: string;
  readonly roleLabel: string;
  readonly familyLabel: string;
  readonly weightLabel: string;
  readonly sizeLabel: string;
  readonly notesLabel: string;
  readonly addLabel: string;
  readonly removeLabel: string;
  readonly emptyPlaceholder: string;
  readonly shortMaxLength: number;
}
