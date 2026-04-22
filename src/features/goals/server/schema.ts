import { z } from "zod";

export const goalStatusSchema = z.enum(["active", "completed", "paused"]);

export const createGoalSchema = z.object({
  name: z.string().trim().min(2).max(120),
  targetAmount: z.number().int().positive(),
  currentAmount: z.number().int().nonnegative().default(0),
  currency: z.string().trim().min(3).max(8).default("PHP"),
  targetDate: z.coerce.date(),
  linkedBudgetId: z.string().uuid().optional(),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
  status: goalStatusSchema.default("active"),
});

export const updateGoalSchema = createGoalSchema.extend({
  id: z.string().uuid(),
});

export const deleteGoalSchema = z.object({
  id: z.string().uuid(),
});

export const contributeGoalSchema = z.object({
  goalId: z.string().uuid(),
  sourceAccountId: z.string().uuid(),
  destinationAccountId: z.string().uuid().optional(),
  amount: z.number().int().positive(),
  date: z.coerce.date(),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});
