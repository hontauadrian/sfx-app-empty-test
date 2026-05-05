import { initTRPC } from '@trpc/server';
import { z } from 'zod';

const trpc = initTRPC.create();
const router = trpc.router;
const publicProcedure = trpc.procedure;

export const appRouter = router({
  auth: router({
    register: publicProcedure
      .input(z.object({ email: z.string().email() }))
      .mutation(async () => ({ ok: true })),
    session: publicProcedure.query(async () => ({ session: null })),
  }),
});
