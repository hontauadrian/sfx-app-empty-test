import { Injectable } from '@nestjs/common';
import {
  createDosDontsEntrySchema,
  type CreateDosDontsEntryBody,
} from '@sfx/validation';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe';

@Injectable()
export class CreateDosDontsEntryPipe extends ZodValidationPipe<CreateDosDontsEntryBody> {
  constructor() {
    super(createDosDontsEntrySchema);
  }
}
