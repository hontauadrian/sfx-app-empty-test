import { z } from 'zod';

export const codeInputSchema = z.object({
  code: z.string().regex(/^[A-Z]{3}-\d{4}$/),
  label: z.string().min(1).max(100),
});
