import { Injectable } from '@nestjs/common';
import { listCompanyInfoVersionsQuerySchema } from '@sfx/validation';
import type { ListCompanyInfoVersionsQuery } from '@sfx/validation';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe';

@Injectable()
export class ListCompanyInfoVersionsQueryPipe extends ZodValidationPipe<ListCompanyInfoVersionsQuery> {
  constructor() {
    super(listCompanyInfoVersionsQuerySchema);
  }
}
