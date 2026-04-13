import { supportedCurrencies } from "@/lib/currencies";

export const settingsCurrencyOptions = supportedCurrencies;
export const settingsLocaleOptions = ["en-PH", "en-US"] as const;
export const settingsWeekStartOptions = ["monday", "sunday"] as const;
export const settingsDateFormatOptions = [
  "month-day-year",
  "day-month-year",
  "year-month-day",
] as const;
export const settingsTimezoneOptions = [
  "Asia/Manila",
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Asia/Singapore",
  "Asia/Tokyo",
] as const;

export const settingsLocaleLabels: Record<(typeof settingsLocaleOptions)[number], string> = {
  "en-PH": "English (Philippines)",
  "en-US": "English (United States)",
};

export const settingsWeekStartLabels: Record<(typeof settingsWeekStartOptions)[number], string> = {
  monday: "Monday",
  sunday: "Sunday",
};

export const settingsDateFormatLabels: Record<(typeof settingsDateFormatOptions)[number], string> = {
  "month-day-year": "MM/DD/YYYY",
  "day-month-year": "DD/MM/YYYY",
  "year-month-day": "YYYY-MM-DD",
};

export const settingsTimezoneLabels: Record<(typeof settingsTimezoneOptions)[number], string> = {
  "Asia/Manila": "Asia/Manila (GMT+8)",
  UTC: "UTC (GMT+0)",
  "America/New_York": "America/New_York (Eastern)",
  "America/Chicago": "America/Chicago (Central)",
  "America/Denver": "America/Denver (Mountain)",
  "America/Los_Angeles": "America/Los_Angeles (Pacific)",
  "Europe/London": "Europe/London (UK)",
  "Asia/Singapore": "Asia/Singapore (GMT+8)",
  "Asia/Tokyo": "Asia/Tokyo (GMT+9)",
};
