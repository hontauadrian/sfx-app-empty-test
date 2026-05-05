import { z } from 'zod';

export const tagListSchema = z.object({
  tags: z.array(z.string()).min(1).max(10),
  title: z.string().min(3).max(50),
});
