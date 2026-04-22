import { z } from "zod";

import { supportedCurrencies } from "@/lib/currencies";

export const getCashflowForecastSchema = z.object({
  days: z.number().int().min(7).max(90).default(30),
  currency: z.enum(supportedCurrencies).optional(),
});
