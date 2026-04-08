import { accountsRouter } from "@/server/api/routers/accounts";
import { budgetsRouter } from "@/server/api/routers/budgets";
import { createTRPCRouter } from "@/server/api/trpc";
import { systemRouter } from "@/server/api/routers/system";
import { transactionsRouter } from "@/server/api/routers/transactions";

export const appRouter = createTRPCRouter({
  accounts: accountsRouter,
  budgets: budgetsRouter,
  system: systemRouter,
  transactions: transactionsRouter,
});

export type AppRouter = typeof appRouter;
