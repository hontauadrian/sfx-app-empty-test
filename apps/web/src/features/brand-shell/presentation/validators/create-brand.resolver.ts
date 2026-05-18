import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

// Inline definition (mirrors packages/validation/src/schemas/brand.schema.ts).
// The @sfx/validation CJS dist export does not surface the schema reliably
// to the Next.js dev bundle (zodResolver receives undefined). Inlining the
// schema for the resolver bypasses that resolution path while keeping the
// validation contract identical to the API-side schema.
const createBrandSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Name is required')
      .max(200, 'Name must be 200 characters or fewer'),
  })
  .strict();

export const createBrandResolver = zodResolver(createBrandSchema);
