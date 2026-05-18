import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

// See create-brand.resolver.ts for the rationale on inlining.
const renameBrandSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Name is required')
      .max(200, 'Name must be 200 characters or fewer'),
  })
  .strict();

export const renameBrandResolver = zodResolver(renameBrandSchema);
