import { Injectable } from '@nestjs/common';
import type { UpsertCompanyInfoInput } from '@sfx/domain';
import { upsertCompanyInfoSchema } from '@sfx/validation';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe';

@Injectable()
export class UpsertCompanyInfoPipe extends ZodValidationPipe<UpsertCompanyInfoInput> {
  constructor() {
    super(upsertCompanyInfoSchema);
  }
}
