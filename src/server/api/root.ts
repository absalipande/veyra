import { accountsRouter } from "@/server/api/routers/accounts";
import { createTRPCRouter } from "@/server/api/trpc";
import { systemRouter } from "@/server/api/routers/system";
import { transactionsRouter } from "@/server/api/routers/transactions";

export const appRouter = createTRPCRouter({
  accounts: accountsRouter,
  system: systemRouter,
  transactions: transactionsRouter,
});

export type AppRouter = typeof appRouter;
