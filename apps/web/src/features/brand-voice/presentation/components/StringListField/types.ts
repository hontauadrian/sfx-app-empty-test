import type { Control, FieldPath } from 'react-hook-form';
import type { BrandVoiceFormValues } from '../../validators/brand-voice-form';

export type StringListFieldName = Extract<
  FieldPath<BrandVoiceFormValues>,
  | 'preferredVocabulary'
  | 'restrictedVocabulary'
  | 'messagingPillars'
  | 'writingStyleRules'
  | 'approvedExamplePhrases'
  | 'rejectedExamplePhrases'
>;

export interface StringListFieldProps {
  readonly control: Control<BrandVoiceFormValues>;
  readonly name: StringListFieldName;
  readonly label: string;
  readonly addLabel: string;
  readonly removeLabel: string;
  readonly emptyPlaceholder: string;
  readonly itemMaxLength: number;
  readonly testId?: string;
}
