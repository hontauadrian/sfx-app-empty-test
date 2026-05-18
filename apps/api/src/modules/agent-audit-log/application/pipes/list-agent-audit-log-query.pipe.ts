import { Injectable } from '@nestjs/common';
import type { ZodSchema } from 'zod';
import {
  listAgentAuditLogQuerySchema,
  type ListAgentAuditLogQuery,
} from '@sfx/validation';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe';

@Injectable()
export class ListAgentAuditLogQueryPipe extends ZodValidationPipe<ListAgentAuditLogQuery> {
  constructor() {
    // The schema uses z.preprocess to coerce non-string and unparseable date
    // inputs to `undefined`; ZodSchema<T> is invariant in its IO types so the
    // pipe's generic ListAgentAuditLogQuery (output) does not align with the
    // preprocess-narrowed `unknown` input. The pipe never relies on the input
    // type at runtime — it forwards safeParse output — so casting is safe.
    super(listAgentAuditLogQuerySchema as unknown as ZodSchema<ListAgentAuditLogQuery>);
  }
}
