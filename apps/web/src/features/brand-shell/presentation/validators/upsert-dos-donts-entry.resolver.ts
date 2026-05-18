import { DOS_DONTS_CATEGORIES, DOS_DONTS_TYPES } from '../../data/dos-donts-enums';
import type { DosDontsCategory, DosDontsType } from '@sfx/domain';

export interface UpsertDosDontsEntryFormValues {
  readonly type: DosDontsType | '';
  readonly category: DosDontsCategory | '';
  readonly ruleText: string;
  readonly exampleText: string;
}

export interface UpsertDosDontsEntryErrors {
  readonly type?: string;
  readonly category?: string;
  readonly ruleText?: string;
  readonly exampleText?: string;
}

export interface UpsertDosDontsValidationMessages {
  readonly typeRequired: string;
  readonly categoryRequired: string;
  readonly categoryUnknown: string;
  readonly ruleTextRequired: string;
  readonly ruleTextTooLong: string;
  readonly exampleTextTooLong: string;
}

export function validateUpsertDosDontsEntry(
  values: UpsertDosDontsEntryFormValues,
  messages: UpsertDosDontsValidationMessages,
): UpsertDosDontsEntryErrors {
  const errors: { -readonly [K in keyof UpsertDosDontsEntryErrors]: string } = {};
  if (!values.type) {
    errors.type = messages.typeRequired;
  } else if (!DOS_DONTS_TYPES.includes(values.type)) {
    errors.type = messages.typeRequired;
  }
  if (!values.category) {
    errors.category = messages.categoryRequired;
  } else if (!DOS_DONTS_CATEGORIES.includes(values.category)) {
    errors.category = messages.categoryUnknown;
  }
  const ruleText = values.ruleText.trim();
  if (!ruleText) {
    errors.ruleText = messages.ruleTextRequired;
  } else if (ruleText.length > 4000) {
    errors.ruleText = messages.ruleTextTooLong;
  }
  if (values.exampleText.length > 4000) {
    errors.exampleText = messages.exampleTextTooLong;
  }
  return errors;
}
