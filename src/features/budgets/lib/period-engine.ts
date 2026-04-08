export type BudgetPeriod = "daily" | "weekly" | "bi-weekly" | "monthly";

export type PeriodWindow = {
  start: Date;
  end: Date;
};

export type PeriodInput = {
  period: BudgetPeriod;
  startDate: Date;
  salaryDates?: string | string[];
  weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  now?: Date;
};

export function getCurrentBudgetWindow(input: PeriodInput): PeriodWindow {
  const { period, startDate, salaryDates, weekStartsOn = 1, now = new Date() } = input;

  const startOfDay = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  const endOfDay = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
  const addDays = (date: Date, days: number) => {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  };
  const startOfWeek = (date: Date, weekStart: number) => {
    const base = startOfDay(date);
    const diff = (base.getDay() - weekStart + 7) % 7;
    return addDays(base, -diff);
  };
  const endOfWeek = (date: Date, weekStart: number) => endOfDay(addDays(startOfWeek(date, weekStart), 6));

  const startOfMonth = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
  const endOfMonth = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
  const lastDayNumberOfMonth = (year: number, month: number) =>
    new Date(year, month + 1, 0).getDate();

  if (period === "daily") {
    return {
      start: startOfDay(now),
      end: endOfDay(now),
    };
  }

  if (period === "weekly") {
    return {
      start: startOfWeek(now, weekStartsOn),
      end: endOfWeek(now, weekStartsOn),
    };
  }

  if (period === "monthly") {
    return {
      start: startOfMonth(now),
      end: endOfMonth(now),
    };
  }

  const parsedSalaryDates = normalizeSalaryDates(salaryDates);

  if (parsedSalaryDates) {
    const [firstDate, secondDate] = parsedSalaryDates;
    const year = now.getFullYear();
    const month = now.getMonth();
    const day = now.getDate();

    const lastDayThisMonth = lastDayNumberOfMonth(year, month);
    const firstCurrent = Math.min(firstDate, lastDayThisMonth);
    const secondCurrent = Math.min(secondDate, lastDayThisMonth);

    let start: Date;
    let end: Date;

    if (day < firstCurrent) {
      const previousMonth = month === 0 ? 11 : month - 1;
      const previousYear = month === 0 ? year - 1 : year;
      const lastDayPreviousMonth = lastDayNumberOfMonth(previousYear, previousMonth);
      const secondPrevious = Math.min(secondDate, lastDayPreviousMonth);

      start = new Date(previousYear, previousMonth, secondPrevious, 0, 0, 0, 0);
      end = new Date(year, month, Math.max(firstCurrent - 1, 1), 23, 59, 59, 999);
    } else if (day < secondCurrent) {
      start = new Date(year, month, firstCurrent, 0, 0, 0, 0);
      end = new Date(year, month, Math.max(secondCurrent - 1, 1), 23, 59, 59, 999);
    } else {
      const nextMonth = month === 11 ? 0 : month + 1;
      const nextYear = month === 11 ? year + 1 : year;
      const lastDayNextMonth = lastDayNumberOfMonth(nextYear, nextMonth);
      const firstNext = Math.min(firstDate, lastDayNextMonth);

      start = new Date(year, month, secondCurrent, 0, 0, 0, 0);
      end = new Date(nextYear, nextMonth, Math.max(firstNext - 1, 1), 23, 59, 59, 999);
    }

    const proposedStart = startOfDay(start);
    const proposedEnd = endOfDay(end);
    const budgetStart = startOfDay(startDate);

    return {
      start: budgetStart < proposedStart ? budgetStart : proposedStart,
      end: proposedEnd,
    };
  }

  const anchor = startOfDay(startDate);
  const diffDays = Math.floor(
    (startOfDay(now).getTime() - anchor.getTime()) / (1000 * 60 * 60 * 24)
  );
  const periodIndex = Math.max(0, Math.floor(diffDays / 14));
  const start = addDays(anchor, periodIndex * 14);
  const end = addDays(start, 13);

  return {
    start: startOfDay(start),
    end: endOfDay(end),
  };
}

function normalizeSalaryDates(salaryDates?: string | string[]): [number, number] | null {
  if (!salaryDates) return null;

  try {
    let raw: unknown = salaryDates;

    if (typeof salaryDates === "string") {
      raw = JSON.parse(salaryDates);
    }

    if (!Array.isArray(raw) || raw.length < 2) return null;

    const first = parseInt(String(raw[0]), 10);
    const second = parseInt(String(raw[1]), 10);

    if (Number.isNaN(first) || Number.isNaN(second)) return null;

    return [Math.min(first, second), Math.max(first, second)];
  } catch {
    return null;
  }
}
