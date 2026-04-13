import { z } from "zod";

import {
  settingsCurrencyOptions,
  settingsDateFormatOptions,
  settingsLocaleOptions,
  settingsTimezoneOptions,
  settingsWeekStartOptions,
} from "@/features/settings/lib/options";

export const updateSettingsSchema = z.object({
  defaultCurrency: z.enum(settingsCurrencyOptions),
  locale: z.enum(settingsLocaleOptions),
  weekStartsOn: z.enum(settingsWeekStartOptions),
  dateFormat: z.enum(settingsDateFormatOptions),
  timezone: z.enum(settingsTimezoneOptions),
});

export const clearWorkspaceSchema = z.object({
  confirmation: z.literal("DELETE WORKSPACE DATA"),
});
