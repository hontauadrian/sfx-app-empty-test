import { z } from 'zod';

export const profileUpdateSchema = z.object({
  displayName: z.string().min(1).max(100),
  bio: z.string().max(500).optional(),
  website: z.string().url().nullable(),
});
