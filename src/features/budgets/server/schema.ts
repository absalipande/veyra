import { z } from "zod";

export const budgetPeriods = ["daily", "weekly", "bi-weekly", "monthly"] as const;

const salaryDatesSchema = z
  .array(z.string().regex(/^\d{1,2}$/))
  .length(2)
  .optional();

export const createBudgetSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    amount: z.number().int().positive(),
    period: z.enum(budgetPeriods),
    startDate: z.coerce.date(),
    salaryDates: salaryDatesSchema,
    parentBudgetId: z.string().uuid().optional(),
    isActive: z.boolean().default(true),
  })
  .superRefine((value, ctx) => {
    if (value.period === "bi-weekly" && (!value.salaryDates || value.salaryDates.length !== 2)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["salaryDates"],
        message: "Bi-weekly budgets require exactly two salary dates.",
      });
    }
  });

export const updateBudgetSchema = createBudgetSchema.extend({
  id: z.string().uuid(),
});

export const deleteBudgetSchema = z.object({
  id: z.string().uuid(),
});

export const getBudgetSchema = z.object({
  id: z.string().uuid(),
});
