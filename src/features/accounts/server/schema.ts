import { z } from "zod";

import { supportedCurrencies } from "@/lib/currencies";

export const createAccountSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    currency: z.enum(supportedCurrencies),
    institution: z.string().trim().max(80).optional().or(z.literal("")),
    type: z.enum(["cash", "credit", "loan", "wallet"]),
    balance: z.number().int(),
    creditLimit: z.number().int().nonnegative().default(0),
  })
  .superRefine((input, ctx) => {
    if ((input.type === "cash" || input.type === "wallet") && input.balance < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["balance"],
        message: "Bank and wallet accounts cannot start with a negative balance.",
      });
    }

    if (input.type === "loan" && input.balance < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["balance"],
        message: "Loan balances must be zero or greater.",
      });
    }

    if (input.type === "credit") {
      if (input.balance < 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["balance"],
          message: "Credit card balances must be zero or greater.",
        });
      }

      if (input.balance > input.creditLimit) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["balance"],
          message: "Credit card balance cannot be higher than the credit limit.",
        });
      }
    }
  });

export const updateAccountSchema = createAccountSchema.extend({
  id: z.string().uuid(),
});

export const deleteAccountSchema = z.object({
  id: z.string().uuid(),
});
