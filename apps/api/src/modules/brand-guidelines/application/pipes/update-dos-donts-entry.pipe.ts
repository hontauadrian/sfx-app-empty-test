import { Injectable } from '@nestjs/common';
import {
  updateDosDontsEntrySchema,
  type UpdateDosDontsEntryBody,
} from '@sfx/validation';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe';

@Injectable()
export class UpdateDosDontsEntryPipe extends ZodValidationPipe<UpdateDosDontsEntryBody> {
  constructor() {
    super(updateDosDontsEntrySchema);
  }
}
