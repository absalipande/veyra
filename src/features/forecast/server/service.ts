import { TRPCError } from "@trpc/server";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { z } from "zod";

import { accounts, billOccurrences, billSeries, loanInstallments, loans, userPreferences } from "@/db/schema";
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

  const obligationsByDate = new Map<string, ForecastObligation[]>();
  for (const obligation of obligations) {
    const dateKey = toDateKey(obligation.dueDate);
    const existing = obligationsByDate.get(dateKey) ?? [];
    existing.push(obligation);
    obligationsByDate.set(dateKey, existing);
  }

  let runningBalance = startingBalance;
  const dailyProjection = Array.from({ length: input.days }, (_, index) => {
    const date = addDays(horizonStart, index);
    const key = toDateKey(date);
    const dayObligations = obligationsByDate.get(key) ?? [];
    const outflow = dayObligations.reduce((sum, obligation) => sum + obligation.amount, 0);
    runningBalance -= outflow;

    return {
      date,
      balance: runningBalance,
      outflow,
      dueCount: dayObligations.length,
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
      "Unscheduled spend and future income are not included.",
    ],
  };
}
