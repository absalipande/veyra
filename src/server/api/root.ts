import { accountsRouter } from "@/server/api/routers/accounts";
import { createTRPCRouter } from "@/server/api/trpc";
import { systemRouter } from "@/server/api/routers/system";

export const appRouter = createTRPCRouter({
  accounts: accountsRouter,
  system: systemRouter,
});

export type AppRouter = typeof appRouter;
