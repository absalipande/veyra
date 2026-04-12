import { z } from "zod";

const amountSchema = z.number().int().positive();

const baseEventSchema = z.object({
  date: z.coerce.date(),
  description: z.string().trim().min(2).max(120),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});

export const transactionEventTypes = [
  "income",
  "expense",
  "transfer",
  "credit_payment",
  "loan_disbursement",
] as const;

export const listTransactionEventsSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional().or(z.literal("")).default(""),
  type: z.enum(["all", ...transactionEventTypes]).default("all"),
});

export const createTransactionEventSchema = z.discriminatedUnion("type", [
  baseEventSchema.extend({
    type: z.literal("income"),
    accountId: z.string().uuid(),
    amount: amountSchema,
    categoryId: z.string().uuid().optional(),
  }),
  baseEventSchema.extend({
    type: z.literal("expense"),
    accountId: z.string().uuid(),
    amount: amountSchema,
    budgetId: z.string().uuid().optional(),
    categoryId: z.string().uuid().optional(),
  }),
  baseEventSchema.extend({
    type: z.literal("transfer"),
    sourceAccountId: z.string().uuid(),
    destinationAccountId: z.string().uuid(),
    amount: amountSchema,
    feeAmount: z.number().int().nonnegative().default(0),
  }),
  baseEventSchema.extend({
    type: z.literal("credit_payment"),
    sourceAccountId: z.string().uuid(),
    creditAccountId: z.string().uuid(),
    amount: amountSchema,
    feeAmount: z.number().int().nonnegative().default(0),
  }),
  baseEventSchema.extend({
    type: z.literal("loan_disbursement"),
    loanAccountId: z.string().uuid(),
    destinationAccountId: z.string().uuid(),
    amount: amountSchema,
  }),
]);

export const updateTransactionEventSchema = z.discriminatedUnion("type", [
  baseEventSchema.extend({
    id: z.string().uuid(),
    type: z.literal("income"),
    accountId: z.string().uuid(),
    amount: amountSchema,
    categoryId: z.string().uuid().optional(),
  }),
  baseEventSchema.extend({
    id: z.string().uuid(),
    type: z.literal("expense"),
    accountId: z.string().uuid(),
    amount: amountSchema,
    budgetId: z.string().uuid().optional(),
    categoryId: z.string().uuid().optional(),
  }),
  baseEventSchema.extend({
    id: z.string().uuid(),
    type: z.literal("transfer"),
    sourceAccountId: z.string().uuid(),
    destinationAccountId: z.string().uuid(),
    amount: amountSchema,
    feeAmount: z.number().int().nonnegative().default(0),
  }),
  baseEventSchema.extend({
    id: z.string().uuid(),
    type: z.literal("credit_payment"),
    sourceAccountId: z.string().uuid(),
    creditAccountId: z.string().uuid(),
    amount: amountSchema,
    feeAmount: z.number().int().nonnegative().default(0),
  }),
  baseEventSchema.extend({
    id: z.string().uuid(),
    type: z.literal("loan_disbursement"),
    loanAccountId: z.string().uuid(),
    destinationAccountId: z.string().uuid(),
    amount: amountSchema,
  }),
]);

export const deleteTransactionEventSchema = z.object({
  id: z.string().uuid(),
});
