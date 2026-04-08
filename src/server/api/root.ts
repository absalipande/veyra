import { createTRPCRouter } from "@/server/api/trpc";
import { systemRouter } from "@/server/api/routers/system";

export const appRouter = createTRPCRouter({
  system: systemRouter,
});

export type AppRouter = typeof appRouter;
