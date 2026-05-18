import type { DosDontsCategory, DosDontsType } from '@sfx/domain';

export interface DosDontsRowEditorValues {
  readonly type: DosDontsType | '';
  readonly category: DosDontsCategory | '';
  readonly ruleText: string;
  readonly exampleText: string;
}

export interface DosDontsRowEditorErrors {
  readonly type?: string;
  readonly category?: string;
  readonly ruleText?: string;
  readonly exampleText?: string;
}

export interface DosDontsRowEditorProps {
  readonly initialValues: DosDontsRowEditorValues;
  readonly isSubmitting: boolean;
  readonly onSubmit: (values: DosDontsRowEditorValues) => void;
  readonly onCancel: () => void;
}
