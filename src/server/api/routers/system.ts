import { createTRPCRouter, protectedProcedure, publicProcedure } from "@/server/api/trpc";

export const systemRouter = createTRPCRouter({
  status: publicProcedure.query(() => {
    return {
      app: "veyra",
      auth: "ready",
      shell: "ready",
      dataLayer: "configured",
      timestamp: new Date(),
    };
  }),
  viewer: protectedProcedure.query(({ ctx }) => {
    return {
      userId: ctx.userId,
      sessionId: ctx.sessionId,
    };
  }),
});
