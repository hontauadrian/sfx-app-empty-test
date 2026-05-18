import { Injectable } from '@nestjs/common';
import {
  guidelineSearchQuerySchema,
  type GuidelineSearchQuery,
} from '@sfx/validation';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe';

@Injectable()
export class GuidelineSearchQueryPipe extends ZodValidationPipe<GuidelineSearchQuery> {
  constructor() {
    super(guidelineSearchQuerySchema);
  }
}
