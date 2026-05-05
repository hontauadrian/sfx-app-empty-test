import { z } from 'zod';

export const statusUpdateSchema = z.object({
  status: z.enum(['active', 'inactive', 'pending']),
  reason: z.string().min(1).max(500),
});
