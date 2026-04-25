import { z } from "zod";

import { supportedCurrencies } from "@/lib/currencies";

export const billCadences = ["one_time", "weekly", "monthly", "yearly"] as const;
export const billStatuses = ["pending", "paid", "overdue"] as const;
export const billObligationTypes = ["general", "loan_repayment"] as const;

export const listBillsSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional().or(z.literal("")).default(""),
  status: z.enum(["all", ...billStatuses]).default("all"),
  accountId: z.string().uuid().optional(),
  includeInactive: z.boolean().default(false),
});

export const getBillSchema = z.object({
  id: z.string().uuid(),
});

export const createBillSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    amount: z.number().int().positive(),
    currency: z.enum(supportedCurrencies).default("PHP"),
    cadence: z.enum(billCadences).default("monthly"),
    intervalCount: z.number().int().min(1).max(60).default(1),
    startsAt: z.coerce.date(),
    firstDueDate: z.coerce.date().optional(),
    endsAfterOccurrences: z.number().int().min(1).max(600).optional(),
    accountId: z.string().uuid().optional(),
    notes: z.string().trim().max(500).optional().or(z.literal("")),
    isActive: z.boolean().default(true),
  })
  .superRefine((value, ctx) => {
    if (value.cadence === "one_time" && value.endsAfterOccurrences && value.endsAfterOccurrences !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endsAfterOccurrences"],
        message: "One-time bills can only have one occurrence.",
      });
    }
  });

export const updateBillSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  amount: z.number().int().positive(),
  currency: z.enum(supportedCurrencies),
  cadence: z.enum(billCadences),
  intervalCount: z.number().int().min(1).max(60),
  startsAt: z.coerce.date(),
  nextDueDate: z.coerce.date().optional(),
  endsAfterOccurrences: z.number().int().min(1).max(600).optional(),
  remainingOccurrences: z.number().int().min(0).max(600).optional(),
  accountId: z.string().uuid().optional(),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
  isActive: z.boolean(),
});

export const markBillPaidSchema = z.object({
  billId: z.string().uuid(),
  occurrenceId: z.string().uuid().optional(),
  paidAt: z.coerce.date().optional(),
  paymentAccountId: z.string().uuid().optional(),
  settleOnly: z.boolean().default(false),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});

export const deleteBillSchema = z.object({
  id: z.string().uuid(),
});

export const completeBillSchema = z.object({
  id: z.string().uuid(),
});
