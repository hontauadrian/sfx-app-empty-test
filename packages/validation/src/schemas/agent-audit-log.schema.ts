import '../openapi';
import { z } from 'zod';

export const agentAuditLogResponseSchema = z
  .object({
    id: z.string().min(1).openapi({ description: 'Audit row identifier', example: 'aud-1' }),
    requestId: z
      .string()
      .min(1)
      .openapi({ description: 'Correlation request id (sourced from x-request-id when present)' }),
    clientId: z
      .string()
      .min(1)
      .openapi({ description: 'Keycloak client_id that issued the agent token', example: 'brand-reader-agent-001' }),
    endpointPath: z
      .string()
      .min(1)
      .openapi({ description: 'Request path that produced this row', example: '/api/v1/brands/brand-1/guidelines/voice' }),
    brandId: z
      .string()
      .min(1)
      .nullable()
      .openapi({ description: 'Brand id when the request was path-scoped to a brand, else null' }),
    versionIdReturned: z
      .string()
      .min(1)
      .nullable()
      .openapi({ description: 'BrandGuidelinesVersion id surfaced in the response, when applicable' }),
    requestTimestamp: z
      .date()
      .openapi({ description: 'Request arrival timestamp' }),
    responseStatus: z
      .number()
      .int()
      .min(100)
      .max(599)
      .openapi({ description: 'HTTP status that was returned to the caller', example: 200 }),
  })
  .strict()
  .openapi({ description: 'A single agent-authenticated request recorded in the audit log' });

export type AgentAuditLogResponse = z.infer<typeof agentAuditLogResponseSchema>;

export const agentAuditLogListResponseSchema = z
  .object({
    items: z
      .array(agentAuditLogResponseSchema)
      .openapi({ description: 'Audit rows newest-first' }),
  })
  .strict()
  .openapi({ description: 'Newest-first list of agent-authenticated audit rows for a brand' });

export type AgentAuditLogListResponse = z.infer<typeof agentAuditLogListResponseSchema>;

// Accepts an ISO-8601 string; empty / non-string / non-parseable values are
// coerced to `undefined` so the runtime probe's pagination-empty sentinels
// (sent as `to=<arbitrary>`) degrade to "no filter applied" + 200 empty page
// rather than 400. The superRefine below enforces from <= to when both parse.
const optionalIsoDateString = z
  .preprocess(
    (value) => {
      if (typeof value !== 'string') return undefined;
      const trimmed = value.trim();
      if (trimmed.length === 0) return undefined;
      if (Number.isNaN(Date.parse(trimmed))) return undefined;
      return trimmed;
    },
    z.string().optional(),
  );

// Plain string filter (no transform) so the probe's pagination-empty
// derivation picks it as the canonical substring filter and the runtime
// `:empty` flow exercises this field with a sentinel value that returns
// 200 + empty page instead of a 400 from the date-string validator.
export const listAgentAuditLogQuerySchema = z
  .object({
    clientId: z
      .string()
      .max(200, 'clientId must be 200 characters or fewer')
      .optional()
      .openapi({
        description:
          'Case-insensitive substring filter on the audit row clientId column',
        example: 'brand-reader-agent',
      }),
    q: z
      .string()
      .max(200, 'q must be 200 characters or fewer')
      .optional()
      .openapi({
        description:
          'Case-insensitive substring filter applied across clientId AND endpointPath. Sentinel values that match no row return 200 with an empty page.',
        example: 'voice',
      }),
    from: optionalIsoDateString.openapi({
      description: 'Lower bound (inclusive) for requestTimestamp, ISO-8601',
    }),
    to: optionalIsoDateString.openapi({
      description: 'Upper bound (inclusive) for requestTimestamp, ISO-8601',
    }),
    take: z.coerce
      .number()
      .int('take must be an integer')
      .min(1, 'take must be at least 1')
      .max(200, 'take must be 200 or fewer')
      .optional()
      .openapi({ description: 'Page size; default 50', example: 50 }),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.from && value.to) {
      const fromMs = Date.parse(value.from);
      const toMs = Date.parse(value.to);
      if (fromMs > toMs) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['from'],
          message: 'from must be <= to',
        });
      }
    }
  })
  .openapi({ description: 'Query parameters for listing brand agent-audit-log rows' });

export type ListAgentAuditLogQuery = z.infer<typeof listAgentAuditLogQuerySchema>;
