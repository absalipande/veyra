import { TRPCError } from "@trpc/server";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { z } from "zod";

import { accounts, billOccurrences, billSeries, loanInstallments, loans, transactionEvents, userPreferences } from "@/db/schema";
import { getCashflowForecastSchema } from "@/features/forecast/server/schema";
import type { TRPCContext } from "@/server/api/trpc";

type GetCashflowForecastInput = z.infer<typeof getCashflowForecastSchema>;
type BillOccurrenceRow = typeof billOccurrences.$inferSelect;
type LoanInstallmentRow = typeof loanInstallments.$inferSelect;

type ForecastObligation = {
  id: string;
  sourceType: "bill" | "loan_installment";
  name: string;
  dueDate: Date;
  amount: number;
};

type ForecastActivity = {
  amount: number;
  date: Date;
  description: string;
  type: "income" | "expense" | "transfer";
};

type ActivityTotals = {
  income: number;
  spending: number;
  transfer: number;
};

function assertUserId(userId: string | null | undefined): string {
  if (!userId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You need to sign in to continue.",
    });
  }
  return userId;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function endOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function normalizePatternKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function detectRecurringCadence(daysBetweenEvents: number[]) {
  if (daysBetweenEvents.length === 0) return null;

  const averageGap = average(daysBetweenEvents);
  const spread = Math.max(...daysBetweenEvents) - Math.min(...daysBetweenEvents);
  const candidates = [
    { days: 7, tolerance: 2 },
    { days: 14, tolerance: 3 },
    { days: 30, tolerance: 5 },
  ];

  let bestMatch: { days: number; tolerance: number } | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const distance = Math.abs(candidate.days - averageGap);
    if (distance <= candidate.tolerance && distance < bestDistance) {
      bestMatch = candidate;
      bestDistance = distance;
    }
  }

  if (!bestMatch || spread > bestMatch.tolerance * 2) {
    return null;
  }

  return bestMatch.days;
}

function deriveRecurringActivities(
  events: Array<typeof transactionEvents.$inferSelect>,
  obligations: ForecastObligation[],
  horizonStart: Date,
  horizonEnd: Date,
) {
  const obligationNames = new Set(obligations.map((entry) => normalizePatternKey(entry.name)));
  const grouped = new Map<string, Array<typeof transactionEvents.$inferSelect>>();

  for (const event of events) {
    const descriptionKey = normalizePatternKey(event.description);
    if (!descriptionKey) continue;
    const key = `${event.type}:${descriptionKey}`;
    const current = grouped.get(key) ?? [];
    current.push(event);
    grouped.set(key, current);
  }

  const projections: ForecastActivity[] = [];

  for (const [key, group] of grouped.entries()) {
    if (group.length < 2) continue;

    const sorted = [...group].sort(
      (left, right) => left.occurredAt.getTime() - right.occurredAt.getTime(),
    );
    const recent = sorted.slice(-3);
    const gaps: number[] = [];

    for (let index = 1; index < recent.length; index += 1) {
      const previous = startOfDay(recent[index - 1]!.occurredAt).getTime();
      const current = startOfDay(recent[index]!.occurredAt).getTime();
      gaps.push(Math.round((current - previous) / (24 * 60 * 60 * 1000)));
    }

    const cadenceDays = detectRecurringCadence(gaps);
    if (!cadenceDays) continue;

    const latest = recent[recent.length - 1]!;
    const type = latest.type;
    if (type !== "income" && type !== "expense" && type !== "transfer") continue;

    const descriptionKey = key.split(":")[1] ?? "";
    if (type === "expense" && obligationNames.has(descriptionKey)) continue;

    const averageAmount = Math.round(average(recent.map((entry) => entry.amount)));
    if (averageAmount <= 0) continue;

    let nextDate = addDays(startOfDay(latest.occurredAt), cadenceDays);
    while (nextDate < horizonStart) {
      nextDate = addDays(nextDate, cadenceDays);
    }

    while (nextDate <= horizonEnd) {
      projections.push({
        amount: averageAmount,
        date: nextDate,
        description: latest.description,
        type,
      });
      nextDate = addDays(nextDate, cadenceDays);
    }
  }

  return projections.sort((left, right) => left.date.getTime() - right.date.getTime());
}

function determineRiskLevel(startingBalance: number, lowestBalance: number) {
  if (lowestBalance < 0) return "shortfall" as const;
  if (startingBalance <= 0) return "watch" as const;
  if (lowestBalance <= startingBalance * 0.5) return "watch" as const;
  return "safe" as const;
}

function selectForecastCurrency(
  inputCurrency: string | undefined,
  preferredCurrency: string | undefined,
  liquidAccounts: Array<{ currency: string; balance: number }>
) {
  if (inputCurrency) return inputCurrency;
  if (preferredCurrency && liquidAccounts.some((account) => account.currency === preferredCurrency)) {
    return preferredCurrency;
  }
  if (liquidAccounts.length === 0) return preferredCurrency ?? "PHP";

  const totals = new Map<string, number>();
  for (const account of liquidAccounts) {
    totals.set(account.currency, (totals.get(account.currency) ?? 0) + account.balance);
  }

  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] ?? preferredCurrency ?? "PHP";
}

function deriveBillsObligations(
  occurrences: BillOccurrenceRow[],
  seriesMap: Map<string, typeof billSeries.$inferSelect>,
  currency: string
) {
  const obligations: ForecastObligation[] = [];

  for (const occurrence of occurrences) {
    const series = seriesMap.get(occurrence.billId);
    if (
      !series ||
      !series.isActive ||
      series.currency !== currency ||
      series.obligationType === "loan_repayment"
    ) {
      continue;
    }

    obligations.push({
      id: occurrence.id,
      sourceType: "bill",
      name: series.name,
      dueDate: occurrence.dueDate,
      amount: occurrence.amount,
    });
  }

  return obligations;
}

function deriveLoanObligations(
  installments: LoanInstallmentRow[],
  loanMap: Map<string, typeof loans.$inferSelect>,
  currency: string
) {
  const obligations: ForecastObligation[] = [];

  for (const installment of installments) {
    const loan = loanMap.get(installment.loanId);
    if (!loan || loan.currency !== currency || loan.status !== "active") {
      continue;
    }

    const remainingAmount = Math.max(installment.amount - installment.paidAmount, 0);
    if (remainingAmount <= 0) {
      continue;
    }

    obligations.push({
      id: installment.id,
      sourceType: "loan_installment",
      name: loan.name,
      dueDate: installment.dueDate,
      amount: remainingAmount,
    });
  }

  return obligations;
}

export async function getCashflowForecast(
  ctx: Pick<TRPCContext, "db" | "userId">,
  input: GetCashflowForecastInput,
  options?: { now?: Date }
) {
  const userId = assertUserId(ctx.userId);
  const now = options?.now ?? new Date();
  const horizonStart = startOfDay(now);
  const horizonEnd = endOfDay(addDays(horizonStart, input.days - 1));

  const preferences = await ctx.db.query.userPreferences.findFirst({
    where: eq(userPreferences.clerkUserId, userId),
    columns: { defaultCurrency: true },
  });
  const allLiquidAccounts = await ctx.db.query.accounts.findMany({
    where: and(
      eq(accounts.clerkUserId, userId),
      inArray(accounts.type, ["cash", "wallet"])
    ),
  });
  const currency = selectForecastCurrency(input.currency, preferences?.defaultCurrency, allLiquidAccounts);
  const liquidAccounts = allLiquidAccounts.filter((account) => account.currency === currency);
  const startingBalance = liquidAccounts.reduce((sum, account) => sum + account.balance, 0);

  const pendingOccurrences = await ctx.db.query.billOccurrences.findMany({
    where: and(
      eq(billOccurrences.clerkUserId, userId),
      eq(billOccurrences.status, "pending"),
      gte(billOccurrences.dueDate, horizonStart),
      lte(billOccurrences.dueDate, horizonEnd)
    ),
  });
  const billIds = Array.from(new Set(pendingOccurrences.map((entry) => entry.billId)));
  const billRows =
    billIds.length === 0
      ? []
      : await ctx.db.query.billSeries.findMany({
          where: and(eq(billSeries.clerkUserId, userId), inArray(billSeries.id, billIds)),
        });
  const billMap = new Map(billRows.map((row) => [row.id, row]));

  const dueInstallments = await ctx.db.query.loanInstallments.findMany({
    where: and(
      eq(loanInstallments.clerkUserId, userId),
      gte(loanInstallments.dueDate, horizonStart),
      lte(loanInstallments.dueDate, horizonEnd)
    ),
  });
  const loanIds = Array.from(new Set(dueInstallments.map((entry) => entry.loanId)));
  const loanRows =
    loanIds.length === 0
      ? []
      : await ctx.db.query.loans.findMany({
          where: and(eq(loans.clerkUserId, userId), inArray(loans.id, loanIds)),
        });
  const loanMap = new Map(loanRows.map((row) => [row.id, row]));

  const historicalEvents = await ctx.db.query.transactionEvents.findMany({
    where: and(
      eq(transactionEvents.clerkUserId, userId),
      inArray(transactionEvents.type, ["income", "expense", "transfer"]),
      eq(transactionEvents.currency, currency),
      gte(transactionEvents.occurredAt, startOfDay(addDays(horizonStart, -90))),
      lte(transactionEvents.occurredAt, endOfDay(addDays(horizonStart, -1))),
    ),
  });

  const obligations = [
    ...deriveBillsObligations(pendingOccurrences, billMap, currency),
    ...deriveLoanObligations(dueInstallments, loanMap, currency),
  ].sort((left, right) => {
    const byDate = left.dueDate.getTime() - right.dueDate.getTime();
    if (byDate !== 0) return byDate;
    const byAmount = right.amount - left.amount;
    if (byAmount !== 0) return byAmount;
    return left.name.localeCompare(right.name);
  });

  const recurringActivities = deriveRecurringActivities(
    historicalEvents,
    obligations,
    horizonStart,
    horizonEnd,
  );

  const obligationsByDate = new Map<string, ForecastObligation[]>();
  for (const obligation of obligations) {
    const dateKey = toDateKey(obligation.dueDate);
    const existing = obligationsByDate.get(dateKey) ?? [];
    existing.push(obligation);
    obligationsByDate.set(dateKey, existing);
  }

  const activitiesByDate = new Map<string, ActivityTotals>();
  for (const activity of recurringActivities) {
    const dateKey = toDateKey(activity.date);
    const current = activitiesByDate.get(dateKey) ?? { income: 0, spending: 0, transfer: 0 };
    if (activity.type === "income") {
      current.income += activity.amount;
    } else if (activity.type === "expense") {
      current.spending += activity.amount;
    } else if (activity.type === "transfer") {
      current.transfer += activity.amount;
    }
    activitiesByDate.set(dateKey, current);
  }

  let runningBalance = startingBalance;
  const dailyProjection = Array.from({ length: input.days }, (_, index) => {
    const date = addDays(horizonStart, index);
    const key = toDateKey(date);
    const dayObligations = obligationsByDate.get(key) ?? [];
    const dayActivity = activitiesByDate.get(key) ?? { income: 0, spending: 0, transfer: 0 };
    const outflow =
      dayObligations.reduce((sum, obligation) => sum + obligation.amount, 0) + dayActivity.spending;
    runningBalance += dayActivity.income;
    runningBalance -= outflow;

    return {
      date,
      balance: runningBalance,
      outflow,
      dueCount: dayObligations.length,
      income: dayActivity.income,
      spending: dayActivity.spending,
      transfer: dayActivity.transfer,
    };
  });

  const lowestPoint =
    dailyProjection.reduce(
      (lowest, day) => (day.balance < lowest.balance ? day : lowest),
      dailyProjection[0] ?? { date: horizonStart, balance: startingBalance, outflow: 0, dueCount: 0 }
    ) ?? { date: horizonStart, balance: startingBalance, outflow: 0, dueCount: 0 };

  const dueSoonEnd = addDays(horizonStart, 6);
  const dueSoonCount = obligations.filter((entry) => entry.dueDate <= endOfDay(dueSoonEnd)).length;
  const dueSoonAmount = obligations
    .filter((entry) => entry.dueDate <= endOfDay(dueSoonEnd))
    .reduce((sum, entry) => sum + entry.amount, 0);
  const obligationsTotal = obligations.reduce((sum, entry) => sum + entry.amount, 0);
  const riskLevel = determineRiskLevel(startingBalance, lowestPoint.balance);

  return {
    currency,
    days: input.days,
    startingBalance,
    projectedEndingBalance: dailyProjection[dailyProjection.length - 1]?.balance ?? startingBalance,
    lowestBalance: lowestPoint.balance,
    lowestBalanceDate: lowestPoint.date,
    riskLevel,
    obligationsTotal,
    dueSoonCount,
    dueSoonAmount,
    dailyProjection,
    topObligations: obligations.slice(0, 6),
    assumptions: [
      "Forecast includes cash and wallet accounts only.",
      "Scheduled outflows include pending bills and unpaid loan installments.",
      "Repeated recent income, expense, and transfer patterns are projected as soft future spikes.",
    ],
  };
}
