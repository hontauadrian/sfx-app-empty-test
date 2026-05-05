import { z } from 'zod';

export const idParamSchema = z.object({
  id: z.string().min(1, 'ID is required'),
});

export type IdParamInput = z.infer<typeof idParamSchema>;
