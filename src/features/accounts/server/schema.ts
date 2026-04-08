import { z } from "zod";

import { supportedCurrencies } from "@/lib/currencies";

export const createAccountSchema = z.object({
  name: z.string().trim().min(2).max(80),
  currency: z.enum(supportedCurrencies),
  institution: z.string().trim().max(80).optional().or(z.literal("")),
  type: z.enum(["cash", "credit", "loan", "wallet"]),
  balance: z.number().int(),
  creditLimit: z.number().int().nonnegative().default(0),
});

export const updateAccountSchema = createAccountSchema.extend({
  id: z.string().uuid(),
});

export const deleteAccountSchema = z.object({
  id: z.string().uuid(),
});
