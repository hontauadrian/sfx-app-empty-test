import { z } from 'zod';

export const addressFormSchema = z.object({
  name: z.string().min(1),
  address: z.object({
    street: z.string().min(1),
    zip: z.string().min(5).max(10),
    city: z.string().min(1),
  }),
});
