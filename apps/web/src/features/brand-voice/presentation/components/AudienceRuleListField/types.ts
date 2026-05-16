import type { Control } from 'react-hook-form';
import type { BrandVoiceFormValues } from '../../validators/brand-voice-form';

export interface AudienceRuleListFieldProps {
  readonly control: Control<BrandVoiceFormValues>;
  readonly label: string;
  readonly audienceLabel: string;
  readonly ruleLabel: string;
  readonly addLabel: string;
  readonly removeLabel: string;
  readonly emptyPlaceholder: string;
  readonly audienceMaxLength: number;
  readonly ruleMaxLength: number;
}
