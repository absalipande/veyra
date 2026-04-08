import {
  createBudget,
  deleteBudget,
  getBudget,
  getBudgetsSummary,
  listBudgets,
  updateBudget,
} from "@/features/budgets/server/service";
import {
  createBudgetSchema,
  deleteBudgetSchema,
  getBudgetSchema,
  updateBudgetSchema,
} from "@/features/budgets/server/schema";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

export const budgetsRouter = createTRPCRouter({
  list: protectedProcedure.query(({ ctx }) => listBudgets(ctx)),
  get: protectedProcedure.input(getBudgetSchema).query(({ ctx, input }) => getBudget(ctx, input)),
  summary: protectedProcedure.query(({ ctx }) => getBudgetsSummary(ctx)),
  create: protectedProcedure.input(createBudgetSchema).mutation(({ ctx, input }) => createBudget(ctx, input)),
  update: protectedProcedure.input(updateBudgetSchema).mutation(({ ctx, input }) => updateBudget(ctx, input)),
  remove: protectedProcedure.input(deleteBudgetSchema).mutation(({ ctx, input }) => deleteBudget(ctx, input)),
});
