import {
  settingsDateFormatOptions,
  settingsLocaleOptions,
  settingsTimezoneOptions,
} from "@/features/settings/lib/options";

export type DatePreferences = {
  dateFormat: (typeof settingsDateFormatOptions)[number];
  locale: (typeof settingsLocaleOptions)[number];
  timezone: (typeof settingsTimezoneOptions)[number];
};

export type DateFormatVariant = "date" | "date-no-year";

const defaultDatePreferences: DatePreferences = {
  dateFormat: "month-day-year",
  locale: "en-PH",
  timezone: "Asia/Manila",
};

function normalizeDate(value: Date | string): Date {
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [year, month, day] = value.split("-").map(Number);
      return new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1, 12, 0, 0));
    }

    return new Date(value);
  }

  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 12, 0, 0));
}

function getDateParts(value: Date | string, preferences: DatePreferences) {
  const formatter = new Intl.DateTimeFormat(preferences.locale, {
    timeZone: preferences.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(normalizeDate(value));
  const byType = new Map(parts.map((part) => [part.type, part.value]));

  return {
    year: byType.get("year") ?? "0000",
    month: byType.get("month") ?? "01",
    day: byType.get("day") ?? "01",
  };
}

type RawDatePreferences = {
  dateFormat?: string | null;
  locale?: string | null;
  timezone?: string | null;
};

function isSupportedLocale(value: string): value is DatePreferences["locale"] {
  return settingsLocaleOptions.includes(value as DatePreferences["locale"]);
}

function isSupportedDateFormat(value: string): value is DatePreferences["dateFormat"] {
  return settingsDateFormatOptions.includes(value as DatePreferences["dateFormat"]);
}

function isSupportedTimezone(value: string): value is DatePreferences["timezone"] {
  return settingsTimezoneOptions.includes(value as DatePreferences["timezone"]);
}

export function resolveDatePreferences(settings?: RawDatePreferences | null): DatePreferences {
  const locale = settings?.locale ?? "";
  const dateFormat = settings?.dateFormat ?? "";
  const timezone = settings?.timezone ?? "";

  return {
    dateFormat: isSupportedDateFormat(dateFormat)
      ? dateFormat
      : defaultDatePreferences.dateFormat,
    locale: isSupportedLocale(locale) ? locale : defaultDatePreferences.locale,
    timezone: isSupportedTimezone(timezone) ? timezone : defaultDatePreferences.timezone,
  };
}

export function formatDateWithPreferences(
  value: Date | string,
  preferences?: Partial<DatePreferences> | null,
  variant: DateFormatVariant = "date"
) {
  const resolved = resolveDatePreferences(preferences);
  const { day, month, year } = getDateParts(value, resolved);

  if (variant === "date-no-year") {
    if (resolved.dateFormat === "day-month-year") {
      return `${day}/${month}`;
    }

    return `${month}/${day}`;
  }

  switch (resolved.dateFormat) {
    case "day-month-year":
      return `${day}/${month}/${year}`;
    case "year-month-day":
      return `${year}-${month}-${day}`;
    case "month-day-year":
    default:
      return `${month}/${day}/${year}`;
  }
}
