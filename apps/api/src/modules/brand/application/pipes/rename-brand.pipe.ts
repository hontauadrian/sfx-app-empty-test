import { Injectable } from '@nestjs/common';
import { renameBrandSchema, type RenameBrandInput } from '@sfx/validation';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe';

@Injectable()
export class RenameBrandPipe extends ZodValidationPipe<RenameBrandInput> {
  constructor() {
    super(renameBrandSchema);
  }
}
