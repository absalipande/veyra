import { accountsRouter } from "@/server/api/routers/accounts";
import { categoriesRouter } from "@/server/api/routers/categories";
import { budgetsRouter } from "@/server/api/routers/budgets";
import { createTRPCRouter } from "@/server/api/trpc";
import { systemRouter } from "@/server/api/routers/system";
import { transactionsRouter } from "@/server/api/routers/transactions";
import { settingsRouter } from "@/server/api/routers/settings";

export const appRouter = createTRPCRouter({
  accounts: accountsRouter,
  categories: categoriesRouter,
  budgets: budgetsRouter,
  system: systemRouter,
  transactions: transactionsRouter,
  settings: settingsRouter,
});

export type AppRouter = typeof appRouter;
