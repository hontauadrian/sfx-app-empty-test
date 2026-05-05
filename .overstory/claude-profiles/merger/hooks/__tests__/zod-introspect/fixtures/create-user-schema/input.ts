import { z } from 'zod';

export const createUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  name: z.string().min(1, 'Name is required').max(255, 'Name is too long'),
  avatarUrl: z.string().url('Invalid URL').optional(),
});

export type CreateUserSchemaInput = z.infer<typeof createUserSchema>;
