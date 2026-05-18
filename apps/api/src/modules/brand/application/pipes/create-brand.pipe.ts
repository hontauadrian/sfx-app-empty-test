import { Injectable } from '@nestjs/common';
import { createBrandSchema, type CreateBrandInput } from '@sfx/validation';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe';

@Injectable()
export class CreateBrandPipe extends ZodValidationPipe<CreateBrandInput> {
  constructor() {
    super(createBrandSchema);
  }
}
