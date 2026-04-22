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
  allowAiCoaching: z.boolean().default(true),
  allowUsageAnalytics: z.boolean().default(false),
});

export const clearWorkspaceSchema = z.object({
  confirmation: z.literal("DELETE WORKSPACE DATA"),
});

export const listAuditLogSchema = z.object({
  limit: z.number().int().min(1).max(100).default(30),
});
