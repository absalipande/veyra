import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { budgets, goals } from "@/db/schema";
import { getCashflowForecast } from "@/features/forecast/server/service";
import { logAuditEvent } from "@/features/trust/server/audit";
import { createGoalSchema, deleteGoalSchema, updateGoalSchema } from "@/features/goals/server/schema";
import type { TRPCContext } from "@/server/api/trpc";

type CreateGoalInput = z.infer<typeof createGoalSchema>;
type UpdateGoalInput = z.infer<typeof updateGoalSchema>;
type DeleteGoalInput = z.infer<typeof deleteGoalSchema>;

function assertUserId(userId: string | null | undefined): string {
  if (!userId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You need to sign in to continue.",
    });
  }

  return userId;
}

async function requireBudgetForUser(
  ctx: Pick<TRPCContext, "db" | "userId">,
  budgetId: string
) {
  const userId = assertUserId(ctx.userId);
  const budget = await ctx.db.query.budgets.findFirst({
    where: and(eq(budgets.id, budgetId), eq(budgets.clerkUserId, userId), eq(budgets.isActive, true)),
  });

  if (!budget) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Linked budget was not found.",
    });
  }

  return budget;
}

function monthDiff(from: Date, to: Date) {
  const start = new Date(from.getFullYear(), from.getMonth(), 1);
  const end = new Date(to.getFullYear(), to.getMonth(), 1);
  const years = end.getFullYear() - start.getFullYear();
  const months = end.getMonth() - start.getMonth();
  return years * 12 + months;
}

export async function listGoals(ctx: Pick<TRPCContext, "db" | "userId">) {
  const userId = assertUserId(ctx.userId);

  const [goalRows, forecast] = await Promise.all([
    ctx.db.query.goals.findMany({
      where: eq(goals.clerkUserId, userId),
      orderBy: (fields, { asc, desc }) => [asc(fields.status), asc(fields.targetDate), desc(fields.createdAt)],
    }),
    getCashflowForecast(ctx, { days: 30 }),
  ]);

  const budgetIds = Array.from(
    new Set(goalRows.map((goal) => goal.linkedBudgetId).filter((id): id is string => Boolean(id)))
  );
  const budgetRows =
    budgetIds.length === 0
      ? []
      : await ctx.db.query.budgets.findMany({
          where: and(eq(budgets.clerkUserId, userId)),
          columns: { id: true, name: true, amount: true, period: true },
        });
  const budgetMap = new Map(budgetRows.map((budget) => [budget.id, budget]));

  const now = new Date();
  const goalsWithPlanning = goalRows.map((goal) => {
    const remainingAmount = Math.max(goal.targetAmount - goal.currentAmount, 0);
    const monthsLeft = Math.max(1, monthDiff(now, goal.targetDate) + 1);
    const recommendedMonthly = remainingAmount > 0 ? Math.ceil(remainingAmount / monthsLeft) : 0;
    const linkedBudget = goal.linkedBudgetId ? budgetMap.get(goal.linkedBudgetId) ?? null : null;

    const affordabilitySignal =
      recommendedMonthly <= Math.max(0, Math.floor(forecast.projectedEndingBalance * 0.2))
        ? "comfortable"
        : recommendedMonthly <= Math.max(0, Math.floor(forecast.projectedEndingBalance * 0.4))
          ? "stretch"
          : "tight";

    return {
      ...goal,
      linkedBudget,
      remainingAmount,
      monthsLeft,
      recommendedMonthly,
      affordabilitySignal,
    };
  });

  return {
    goals: goalsWithPlanning,
    cashflowPreview: {
      currency: forecast.currency,
      projectedEndingBalance: forecast.projectedEndingBalance,
      riskLevel: forecast.riskLevel,
      obligationsTotal: forecast.obligationsTotal,
    },
  };
}

export async function createGoal(
  ctx: Pick<TRPCContext, "db" | "userId">,
  input: CreateGoalInput
) {
  const userId = assertUserId(ctx.userId);
  if (input.linkedBudgetId) {
    await requireBudgetForUser(ctx, input.linkedBudgetId);
  }

  const [created] = await ctx.db
    .insert(goals)
    .values({
      id: crypto.randomUUID(),
      clerkUserId: userId,
      name: input.name,
      targetAmount: input.targetAmount,
      currentAmount: input.currentAmount,
      currency: input.currency.toUpperCase(),
      targetDate: input.targetDate,
      linkedBudgetId: input.linkedBudgetId ?? null,
      notes: input.notes || null,
      status: input.status,
    })
    .returning();

  if (!created) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Could not create goal.",
    });
  }

  await logAuditEvent(ctx, {
    action: "goal.create",
    entityType: "goal",
    entityId: created.id,
    summary: `Created goal "${created.name}"`,
    metadata: { targetAmount: created.targetAmount, targetDate: created.targetDate.toISOString() },
  });

  return created;
}

export async function updateGoal(
  ctx: Pick<TRPCContext, "db" | "userId">,
  input: UpdateGoalInput
) {
  const userId = assertUserId(ctx.userId);
  if (input.linkedBudgetId) {
    await requireBudgetForUser(ctx, input.linkedBudgetId);
  }

  const [updated] = await ctx.db
    .update(goals)
    .set({
      name: input.name,
      targetAmount: input.targetAmount,
      currentAmount: input.currentAmount,
      currency: input.currency.toUpperCase(),
      targetDate: input.targetDate,
      linkedBudgetId: input.linkedBudgetId ?? null,
      notes: input.notes || null,
      status: input.status,
      updatedAt: new Date(),
    })
    .where(and(eq(goals.id, input.id), eq(goals.clerkUserId, userId)))
    .returning();

  if (!updated) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Goal not found.",
    });
  }

  await logAuditEvent(ctx, {
    action: "goal.update",
    entityType: "goal",
    entityId: updated.id,
    summary: `Updated goal "${updated.name}"`,
  });

  return updated;
}

export async function removeGoal(
  ctx: Pick<TRPCContext, "db" | "userId">,
  input: DeleteGoalInput
) {
  const userId = assertUserId(ctx.userId);

  const [removed] = await ctx.db
    .delete(goals)
    .where(and(eq(goals.id, input.id), eq(goals.clerkUserId, userId)))
    .returning({ id: goals.id, name: goals.name });

  if (!removed) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Goal not found.",
    });
  }

  await logAuditEvent(ctx, {
    action: "goal.delete",
    entityType: "goal",
    entityId: removed.id,
    summary: `Deleted goal "${removed.name}"`,
  });

  return { success: true };
}
