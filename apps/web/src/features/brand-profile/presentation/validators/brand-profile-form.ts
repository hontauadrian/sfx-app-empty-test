import { z } from 'zod';

import {
  BRAND_DESCRIPTION_MAX_LENGTH,
  BRAND_NAME_MAX_LENGTH,
} from '../../constants';

export interface BrandProfileFormLabels {
  readonly nameRequired: string;
  readonly nameTooLong: string;
  readonly descriptionTooLong: string;
}

export function createBrandProfileFormSchema(labels: BrandProfileFormLabels): z.ZodSchema<{
  name: string;
  description?: string | null;
}> {
  return z.object({
    name: z
      .string()
      .trim()
      .min(1, labels.nameRequired)
      .max(BRAND_NAME_MAX_LENGTH, labels.nameTooLong),
    description: z
      .string()
      .trim()
      .max(BRAND_DESCRIPTION_MAX_LENGTH, labels.descriptionTooLong)
      .nullable()
      .optional(),
  });
}

export type BrandProfileFormValues = {
  name: string;
  description?: string | null;
};
