import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";

import { db } from "@/db";

export const createTRPCContext = async (opts?: {
  sessionId?: string | null;
  userId?: string | null;
}) => {
  return {
    db,
    userId: opts?.userId ?? null,
    sessionId: opts?.sessionId ?? null,
  };
};

export type TRPCContext = Awaited<ReturnType<typeof createTRPCContext>>;

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
});

export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;

const requireAuth = t.middleware(({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
    });
  }

  return next({
    ctx: {
      ...ctx,
      userId: ctx.userId,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireAuth);
