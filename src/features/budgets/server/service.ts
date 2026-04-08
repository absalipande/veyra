import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { budgets, transactionEvents } from "@/db/schema";
import { getCurrentBudgetWindow } from "@/features/budgets/lib/period-engine";
import {
  createBudgetSchema,
  deleteBudgetSchema,
  getBudgetSchema,
  updateBudgetSchema,
} from "@/features/budgets/server/schema";
import type { TRPCContext } from "@/server/api/trpc";

type CreateBudgetInput = z.infer<typeof createBudgetSchema>;
type UpdateBudgetInput = z.infer<typeof updateBudgetSchema>;
type DeleteBudgetInput = z.infer<typeof deleteBudgetSchema>;
type GetBudgetInput = z.infer<typeof getBudgetSchema>;

type BudgetRecord = typeof budgets.$inferSelect;

function assertUserId(userId: string | null | undefined): string {
  if (!userId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You need to sign in to continue.",
    });
  }

  return userId;
}

function getPeriodRank(period: BudgetRecord["period"]) {
  switch (period) {
    case "daily":
      return 1;
    case "weekly":
      return 2;
    case "bi-weekly":
      return 3;
    case "monthly":
      return 4;
    default:
      return 0;
  }
}

async function requireBudget(
  ctx: Pick<TRPCContext, "db" | "userId">,
  id: string,
  message = "Budget not found."
) {
  const userId = assertUserId(ctx.userId);

  const budget = await ctx.db.query.budgets.findFirst({
    where: and(eq(budgets.id, id), eq(budgets.clerkUserId, userId)),
  });

  if (!budget) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message,
    });
  }

  return budget;
}

async function validateParentBudget(
  ctx: Pick<TRPCContext, "db" | "userId">,
  input: Pick<CreateBudgetInput, "parentBudgetId" | "period">
) {
  if (!input.parentBudgetId) return null;

  const parent = await requireBudget(ctx, input.parentBudgetId, "Parent budget not found.");

  if (!parent.isActive) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Parent budget must be active.",
    });
  }

  if (getPeriodRank(parent.period) < getPeriodRank(input.period)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Parent budget period must be equal or longer than the child budget period.",
    });
  }

  return parent;
}

async function computeBudgetPerformance(
  ctx: Pick<TRPCContext, "db" | "userId">,
  budget: BudgetRecord,
  allBudgets: BudgetRecord[]
) {
  const childIds = allBudgets.filter((entry) => entry.parentBudgetId === budget.id).map((entry) => entry.id);
  const scopedBudgetIds = [budget.id, ...childIds];

  const { start, end } = getCurrentBudgetWindow({
    period: budget.period,
    startDate: budget.startDate,
    salaryDates: budget.salaryDates ?? undefined,
  });

  const [row] = await ctx.db
    .select({
      totalSpent: sql<number>`coalesce(sum(${transactionEvents.amount}), 0)`,
    })
    .from(transactionEvents)
    .where(
      and(
        eq(transactionEvents.clerkUserId, assertUserId(ctx.userId)),
        inArray(transactionEvents.budgetId, scopedBudgetIds),
        eq(transactionEvents.type, "expense"),
        sql`${transactionEvents.occurredAt} >= ${start}`,
        sql`${transactionEvents.occurredAt} <= ${end}`
      )
    );

  const totalSpent = Number(row?.totalSpent ?? 0);
  const remaining = budget.amount - totalSpent;
  const percentageUsed = budget.amount > 0 ? (totalSpent / budget.amount) * 100 : 0;
  const roundedPercentage = Math.round(percentageUsed * 100) / 100;

  const status: "safe" | "warning" | "danger" | "exceeded" =
    roundedPercentage >= 100
      ? "exceeded"
      : roundedPercentage >= 90
        ? "danger"
        : roundedPercentage >= 75
          ? "warning"
          : "safe";

  return {
    id: budget.id,
    name: budget.name,
    amount: budget.amount,
    period: budget.period,
    salaryDates: budget.salaryDates,
    startDate: budget.startDate,
    isActive: budget.isActive,
    parentBudgetId: budget.parentBudgetId,
    totalSpent,
    remaining,
    percentageUsed: roundedPercentage,
    status,
    periodStart: start,
    periodEnd: end,
  };
}

export async function listBudgets(ctx: Pick<TRPCContext, "db" | "userId">) {
  const userId = assertUserId(ctx.userId);

  return ctx.db.query.budgets.findMany({
    where: eq(budgets.clerkUserId, userId),
    orderBy: [desc(budgets.createdAt)],
  });
}

export async function getBudget(ctx: Pick<TRPCContext, "db" | "userId">, input: GetBudgetInput) {
  return requireBudget(ctx, input.id);
}

export async function getBudgetsSummary(ctx: Pick<TRPCContext, "db" | "userId">) {
  const userId = assertUserId(ctx.userId);

  const activeBudgets = await ctx.db.query.budgets.findMany({
    where: and(eq(budgets.clerkUserId, userId), eq(budgets.isActive, true)),
    orderBy: [desc(budgets.createdAt)],
  });

  const budgetSummaries = await Promise.all(
    activeBudgets.map((budget) => computeBudgetPerformance(ctx, budget, activeBudgets))
  );

  const parentSummaries = budgetSummaries.filter((budget) => {
    const source = activeBudgets.find((entry) => entry.id === budget.id);
    return !source?.parentBudgetId;
  });

  const totalBudgets = parentSummaries.length;
  const onTrackBudgets = parentSummaries.filter((budget) => budget.status === "safe").length;
  const warningBudgets = parentSummaries.filter((budget) => budget.status === "warning").length;
  const dangerBudgets = parentSummaries.filter((budget) => budget.status === "danger").length;
  const exceededBudgets = parentSummaries.filter((budget) => budget.status === "exceeded").length;
  const totalBudgetAmount = parentSummaries.reduce((sum, budget) => sum + budget.amount, 0);
  const totalSpentAmount = parentSummaries.reduce((sum, budget) => sum + budget.totalSpent, 0);

  return {
    budgets: budgetSummaries,
    summary: {
      totalBudgets,
      onTrackBudgets,
      warningBudgets,
      dangerBudgets,
      exceededBudgets,
      totalBudgetAmount,
      totalSpentAmount,
      totalRemaining: totalBudgetAmount - totalSpentAmount,
    },
  };
}

export async function createBudget(
  ctx: Pick<TRPCContext, "db" | "userId">,
  input: CreateBudgetInput
) {
  const userId = assertUserId(ctx.userId);

  await validateParentBudget(ctx, input);

  const [created] = await ctx.db
    .insert(budgets)
    .values({
      id: crypto.randomUUID(),
      clerkUserId: userId,
      name: input.name,
      amount: input.amount,
      period: input.period,
      startDate: input.startDate,
      salaryDates: input.period === "bi-weekly" ? JSON.stringify(input.salaryDates ?? []) : null,
      parentBudgetId: input.parentBudgetId ?? null,
      isActive: input.isActive,
    })
    .returning();

  if (!created) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to create budget.",
    });
  }

  return { budget: created };
}

export async function updateBudget(
  ctx: Pick<TRPCContext, "db" | "userId">,
  input: UpdateBudgetInput
) {
  const existing = await requireBudget(ctx, input.id);

  if (input.parentBudgetId && input.parentBudgetId === input.id) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "A budget cannot be its own parent.",
    });
  }

  await validateParentBudget(ctx, input);

  const [updated] = await ctx.db
    .update(budgets)
    .set({
      name: input.name,
      amount: input.amount,
      period: input.period,
      startDate: input.startDate,
      salaryDates: input.period === "bi-weekly" ? JSON.stringify(input.salaryDates ?? []) : null,
      parentBudgetId: input.parentBudgetId ?? null,
      isActive: input.isActive,
      updatedAt: new Date(),
    })
    .where(and(eq(budgets.id, existing.id), eq(budgets.clerkUserId, assertUserId(ctx.userId))))
    .returning();

  if (!updated) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to update budget.",
    });
  }

  return { budget: updated };
}

export async function deleteBudget(
  ctx: Pick<TRPCContext, "db" | "userId">,
  input: DeleteBudgetInput
) {
  const existing = await requireBudget(ctx, input.id);
  const userId = assertUserId(ctx.userId);

  const child = await ctx.db.query.budgets.findFirst({
    where: and(eq(budgets.parentBudgetId, existing.id), eq(budgets.clerkUserId, userId)),
    columns: { id: true },
  });

  if (child) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Remove or reassign child budgets before deleting this budget.",
    });
  }

  await ctx.db.delete(budgets).where(and(eq(budgets.id, existing.id), eq(budgets.clerkUserId, userId)));

  return { success: true };
}
