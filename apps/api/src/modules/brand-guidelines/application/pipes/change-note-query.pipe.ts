import { Injectable } from '@nestjs/common';
import { changeNoteQuerySchema, type ChangeNoteQuery } from '@sfx/validation';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe';

@Injectable()
export class ChangeNoteQueryPipe extends ZodValidationPipe<ChangeNoteQuery> {
  constructor() {
    super(changeNoteQuerySchema);
  }
}
