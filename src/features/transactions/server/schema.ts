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

export const createTransactionEventSchema = z.discriminatedUnion("type", [
  baseEventSchema.extend({
    type: z.literal("income"),
    accountId: z.string().uuid(),
    amount: amountSchema,
  }),
  baseEventSchema.extend({
    type: z.literal("expense"),
    accountId: z.string().uuid(),
    amount: amountSchema,
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

export const deleteTransactionEventSchema = z.object({
  id: z.string().uuid(),
});
