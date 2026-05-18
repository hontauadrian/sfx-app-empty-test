import { Injectable } from '@nestjs/common';
import type { UpsertVisualIdentityInput } from '@sfx/domain';
import { upsertVisualIdentitySchema } from '@sfx/validation';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe';

@Injectable()
export class UpsertVisualIdentityPipe extends ZodValidationPipe<UpsertVisualIdentityInput> {
  constructor() {
    super(upsertVisualIdentitySchema);
  }
}
