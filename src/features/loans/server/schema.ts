import { z } from "zod";

import { supportedCurrencies } from "@/lib/currencies";

export const loanKinds = ["institution", "personal"] as const;
export const loanStatuses = ["active", "closed"] as const;
export const loanCadences = ["weekly", "bi-weekly", "monthly"] as const;
export const loanInstallmentSchema = z.object({
  dueDate: z.coerce.date(),
  amount: z.number().int().positive(),
  principalAmount: z.number().int().nonnegative().optional(),
  interestAmount: z.number().int().nonnegative().optional(),
});

export const listLoansSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional().or(z.literal("")).default(""),
  status: z.enum(["all", ...loanStatuses]).default("all"),
});

export const getLoanSchema = z.object({
  id: z.string().uuid(),
});

export const createLoanSchema = z
  .object({
    kind: z.enum(loanKinds),
    name: z.string().trim().min(2).max(120),
    lenderName: z.string().trim().min(2).max(120),
    currency: z.enum(supportedCurrencies),
    principalAmount: z.number().int().positive(),
    outstandingAmount: z.number().int().nonnegative(),
    disbursedAt: z.coerce.date(),
    status: z.enum(loanStatuses).default("active"),
    destinationAccountId: z.string().uuid(),
    underlyingLoanAccountId: z.string().uuid().optional(),
    cadence: z.enum(loanCadences).optional(),
    nextDueDate: z.coerce.date().optional(),
    notes: z.string().trim().max(500).optional().or(z.literal("")),
    metadata: z.string().trim().max(5000).optional().or(z.literal("")),
    autoCreateUnderlyingAccount: z.boolean().default(true),
    createOpeningDisbursement: z.boolean().default(false),
    openingDisbursementAmount: z.number().int().positive().optional(),
    repaymentPlan: z.array(loanInstallmentSchema).max(120).default([]),
  })
  .superRefine((value, ctx) => {
    if (!value.underlyingLoanAccountId && !value.autoCreateUnderlyingAccount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["underlyingLoanAccountId"],
        message: "Choose an underlying loan account or allow auto-creation.",
      });
    }

    if (value.createOpeningDisbursement && !value.disbursedAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["disbursedAt"],
        message: "Disbursement date is required when recording opening disbursement.",
      });
    }
  });

export const updateLoanSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(loanKinds),
  name: z.string().trim().min(2).max(120),
  lenderName: z.string().trim().min(2).max(120),
  currency: z.enum(supportedCurrencies),
  principalAmount: z.number().int().positive(),
  outstandingAmount: z.number().int().nonnegative(),
  disbursedAt: z.coerce.date(),
  status: z.enum(loanStatuses),
  destinationAccountId: z.string().uuid(),
  underlyingLoanAccountId: z.string().uuid().optional(),
  cadence: z.enum(loanCadences).optional(),
  nextDueDate: z.coerce.date().optional(),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
  metadata: z.string().trim().max(5000).optional().or(z.literal("")),
  repaymentPlan: z.array(loanInstallmentSchema).max(120).default([]),
});

export const deleteLoanSchema = z.object({
  id: z.string().uuid(),
});

export const recordLoanPaymentSchema = z.object({
  loanId: z.string().uuid(),
  installmentId: z.string().uuid().optional(),
  sourceAccountId: z.string().uuid(),
  amount: z.number().int().positive(),
  paidAt: z.coerce.date(),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});
