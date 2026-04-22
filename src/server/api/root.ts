import { aiRouter } from "@/server/api/routers/ai";
import { accountsRouter } from "@/server/api/routers/accounts";
import { billsRouter } from "@/server/api/routers/bills";
import { categoriesRouter } from "@/server/api/routers/categories";
import { budgetsRouter } from "@/server/api/routers/budgets";
import { createTRPCRouter } from "@/server/api/trpc";
import { loansRouter } from "@/server/api/routers/loans";
import { systemRouter } from "@/server/api/routers/system";
import { transactionsRouter } from "@/server/api/routers/transactions";
import { settingsRouter } from "@/server/api/routers/settings";

export const appRouter = createTRPCRouter({
  ai: aiRouter,
  accounts: accountsRouter,
  bills: billsRouter,
  categories: categoriesRouter,
  budgets: budgetsRouter,
  loans: loansRouter,
  system: systemRouter,
  transactions: transactionsRouter,
  settings: settingsRouter,
});

export type AppRouter = typeof appRouter;
