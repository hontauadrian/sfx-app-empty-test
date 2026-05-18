import { Injectable } from '@nestjs/common';
import type { UpsertBrandVoiceInput } from '@sfx/domain';
import { upsertBrandVoiceSchema } from '@sfx/validation';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe';

@Injectable()
export class UpsertBrandVoicePipe extends ZodValidationPipe<UpsertBrandVoiceInput> {
  constructor() {
    super(upsertBrandVoiceSchema);
  }
}
