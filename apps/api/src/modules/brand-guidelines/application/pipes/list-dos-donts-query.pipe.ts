import { Injectable } from '@nestjs/common';
import {
  dosDontsListQuerySchema,
  type DosDontsListQuery,
} from '@sfx/validation';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe';

@Injectable()
export class ListDosDontsQueryPipe extends ZodValidationPipe<DosDontsListQuery> {
  constructor() {
    super(dosDontsListQuerySchema);
  }
}
