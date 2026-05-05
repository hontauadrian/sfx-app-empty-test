import { z } from 'zod';

export const flexInputSchema = z.object({
  value: z.union([z.string(), z.number()]),
  label: z.string().min(1),
});
