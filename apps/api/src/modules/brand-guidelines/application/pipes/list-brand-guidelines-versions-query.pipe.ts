import { Injectable } from '@nestjs/common';
import {
  listBrandGuidelinesVersionsQuerySchema,
  type ListBrandGuidelinesVersionsQuery,
} from '@sfx/validation';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe';

@Injectable()
export class ListBrandGuidelinesVersionsQueryPipe extends ZodValidationPipe<ListBrandGuidelinesVersionsQuery> {
  constructor() {
    super(listBrandGuidelinesVersionsQuerySchema);
  }
}
