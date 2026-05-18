import { Injectable } from '@nestjs/common';
import {
  upsertBrandMetadataSchema,
  type UpsertBrandMetadataBody,
} from '@sfx/validation';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe';

@Injectable()
export class UpsertBrandMetadataPipe extends ZodValidationPipe<UpsertBrandMetadataBody> {
  constructor() {
    super(upsertBrandMetadataSchema);
  }
}
