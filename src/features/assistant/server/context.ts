import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import {
  accounts,
  billOccurrences,
  billSeries,
  categories,
  loanInstallments,
  loans,
  transactionEvents,
  userPreferences,
} from "@/db/schema";
import { formatCurrencyMiliunits } from "@/lib/currencies";
import { getBudgetsSummary } from "@/features/budgets/server/service";
import type { AssistantIntent } from "@/features/assistant/server/safety";
import type { TRPCContext } from "@/server/api/trpc";

function assertUserId(userId: string | null | undefined): string {
  if (!userId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You need to sign in to continue.",
    });
  }

  return userId;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function normalizeNumber(value: unknown) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatMoney(value: number, currency: string) {
  return formatCurrencyMiliunits(value, currency);
}

export async function buildAssistantContext(
  ctx: Pick<TRPCContext, "db" | "userId">,
  question: string,
  intent: AssistantIntent = "general"
) {
  const userId = assertUserId(ctx.userId);
  const now = new Date();
  const today = startOfDay(now);
  const thirtyDaysAgo = addDays(today, -29);
  const priorThirtyDaysStart = addDays(today, -59);
  const nextFourteenDays = addDays(today, 14);

  const preferences = await ctx.db.query.userPreferences.findFirst({
    where: eq(userPreferences.clerkUserId, userId),
    columns: {
      defaultCurrency: true,
      locale: true,
      timezone: true,
      allowAiCoaching: true,
    },
  });
  const currency = preferences?.defaultCurrency ?? "PHP";

  const [
    accountRows,
    budgetSummary,
    categoryRows,
    currentCategoryRows,
    previousCategoryRows,
    recentExpenses,
    billRows,
    loanInstallmentRows,
    loanRows,
  ] = await Promise.all([
    ctx.db.query.accounts.findMany({
      where: eq(accounts.clerkUserId, userId),
      columns: {
        id: true,
        name: true,
        type: true,
        balance: true,
        creditLimit: true,
        currency: true,
      },
      orderBy: [desc(accounts.createdAt)],
    }),
    getBudgetsSummary(ctx),
    ctx.db.query.categories.findMany({
      where: and(eq(categories.clerkUserId, userId), eq(categories.isArchived, false)),
      columns: { id: true, name: true, kind: true },
    }),
    ctx.db
      .select({
        categoryId: transactionEvents.categoryId,
        amount: sql<number>`coalesce(sum(${transactionEvents.amount}), 0)`,
        count: sql<number>`count(*)`,
      })
      .from(transactionEvents)
      .where(
        and(
          eq(transactionEvents.clerkUserId, userId),
          eq(transactionEvents.type, "expense"),
          gte(transactionEvents.occurredAt, thirtyDaysAgo),
          lte(transactionEvents.occurredAt, now)
        )
      )
      .groupBy(transactionEvents.categoryId),
    ctx.db
      .select({
        categoryId: transactionEvents.categoryId,
        amount: sql<number>`coalesce(sum(${transactionEvents.amount}), 0)`,
      })
      .from(transactionEvents)
      .where(
        and(
          eq(transactionEvents.clerkUserId, userId),
          eq(transactionEvents.type, "expense"),
          gte(transactionEvents.occurredAt, priorThirtyDaysStart),
          lte(transactionEvents.occurredAt, thirtyDaysAgo)
        )
      )
      .groupBy(transactionEvents.categoryId),
    ctx.db.query.transactionEvents.findMany({
      where: and(
        eq(transactionEvents.clerkUserId, userId),
        eq(transactionEvents.type, "expense"),
        gte(transactionEvents.occurredAt, thirtyDaysAgo),
        lte(transactionEvents.occurredAt, now)
      ),
      columns: {
        description: true,
        amount: true,
        categoryId: true,
        occurredAt: true,
      },
      orderBy: [desc(transactionEvents.occurredAt)],
      limit: 8,
    }),
    ctx.db
      .select({
        id: billOccurrences.id,
        name: billSeries.name,
        dueDate: billOccurrences.dueDate,
        amount: billOccurrences.amount,
        currency: billSeries.currency,
        obligationType: billSeries.obligationType,
      })
      .from(billOccurrences)
      .innerJoin(billSeries, eq(billOccurrences.billId, billSeries.id))
      .where(
        and(
          eq(billOccurrences.clerkUserId, userId),
          eq(billOccurrences.status, "pending"),
          eq(billSeries.isActive, true),
          gte(billOccurrences.dueDate, today),
          lte(billOccurrences.dueDate, nextFourteenDays)
        )
      )
      .orderBy(billOccurrences.dueDate)
      .limit(8),
    ctx.db.query.loanInstallments.findMany({
      where: and(
        eq(loanInstallments.clerkUserId, userId),
        eq(loanInstallments.status, "pending"),
        gte(loanInstallments.dueDate, today),
        lte(loanInstallments.dueDate, nextFourteenDays)
      ),
      columns: {
        id: true,
        loanId: true,
        dueDate: true,
        amount: true,
        paidAmount: true,
      },
      orderBy: [loanInstallments.dueDate],
      limit: 8,
    }),
    ctx.db.query.loans.findMany({
      where: and(eq(loans.clerkUserId, userId), eq(loans.status, "active")),
      columns: {
        id: true,
        name: true,
        lenderName: true,
        outstandingAmount: true,
        currency: true,
      },
    }),
  ]);

  const categoryNameById = new Map(categoryRows.map((category) => [category.id, category.name]));
  const previousAmountByCategoryId = new Map(
    previousCategoryRows.map((row) => [row.categoryId ?? "uncategorized", normalizeNumber(row.amount)])
  );
  const loanById = new Map(loanRows.map((loan) => [loan.id, loan]));

  const liquidBalance = accountRows
    .filter((account) => account.type === "cash" || account.type === "wallet")
    .reduce((sum, account) => sum + account.balance, 0);
  const creditBalance = accountRows
    .filter((account) => account.type === "credit")
    .reduce((sum, account) => sum + account.balance, 0);
  const creditLimit = accountRows
    .filter((account) => account.type === "credit")
    .reduce((sum, account) => sum + account.creditLimit, 0);
  const loanBalance = accountRows
    .filter((account) => account.type === "loan")
    .reduce((sum, account) => sum + account.balance, 0);

  const topCategories = currentCategoryRows
    .map((row) => {
      const key = row.categoryId ?? "uncategorized";
      const amount = normalizeNumber(row.amount);
      const previousAmount = previousAmountByCategoryId.get(key) ?? 0;
      return {
        name: row.categoryId ? (categoryNameById.get(row.categoryId) ?? "Uncategorized") : "Uncategorized",
        amount,
        amountLabel: formatMoney(amount, currency),
        count: normalizeNumber(row.count),
        changeVsPrior30DaysLabel: formatMoney(amount - previousAmount, currency),
      };
    })
    .filter((category) => category.amount > 0)
    .sort((left, right) => right.amount - left.amount)
    .slice(0, 5);

  const atRiskBudgetCount =
    budgetSummary.summary.warningBudgets +
    budgetSummary.summary.dangerBudgets +
    budgetSummary.summary.exceededBudgets;
  const topBudgets = budgetSummary.budgets
    .filter((budget) => !budget.parentBudgetId)
    .sort((left, right) => right.percentageUsed - left.percentageUsed)
    .slice(0, 5)
    .map((budget) => ({
      name: budget.name,
      period: budget.period,
      status: budget.status,
      amountLabel: formatMoney(budget.amount, currency),
      spentLabel: formatMoney(budget.totalSpent, currency),
      remainingLabel: formatMoney(budget.remaining, currency),
      percentageUsed: budget.percentageUsed,
    }));

  const upcomingLoanInstallments = loanInstallmentRows.map((installment) => {
    const loan = loanById.get(installment.loanId);
    const remaining = Math.max(installment.amount - installment.paidAmount, 0);
    return {
      loanName: loan?.name ?? "Loan",
      lenderName: loan?.lenderName ?? null,
      dueDate: formatDate(installment.dueDate),
      remainingAmountLabel: formatMoney(remaining, loan?.currency ?? currency),
    };
  });

  const contextPacket = {
    generatedAt: now.toISOString(),
    question,
    intent,
    preferences: {
      currency,
      locale: preferences?.locale ?? "en-PH",
      timezone: preferences?.timezone ?? "Asia/Manila",
    },
    accounts: {
      totalAccounts: accountRows.length,
      liquidBalanceLabel: formatMoney(liquidBalance, currency),
      creditBalanceLabel: formatMoney(creditBalance, currency),
      creditLimitLabel: formatMoney(creditLimit, currency),
      creditUtilizationPct: creditLimit > 0 ? Math.round((creditBalance / creditLimit) * 100) : 0,
      loanAccountBalanceLabel: formatMoney(loanBalance, currency),
      accountMix: accountRows.slice(0, intent === "accounts" || intent === "general" ? 12 : 5).map((account) => ({
        name: account.name,
        type: account.type,
        balanceLabel: formatMoney(account.balance, account.currency),
      })),
    },
    spending: {
      window: `${formatDate(thirtyDaysAgo)} to ${formatDate(now)}`,
      topCategories,
      recentExpenses: recentExpenses.slice(0, intent === "spending" || intent === "general" ? 8 : 4).map((expense) => ({
        date: formatDate(expense.occurredAt),
        description: expense.description,
        amountLabel: formatMoney(expense.amount, currency),
        category: expense.categoryId ? (categoryNameById.get(expense.categoryId) ?? "Uncategorized") : "Uncategorized",
      })),
    },
    budgets: {
      totalBudgets: budgetSummary.summary.totalBudgets,
      onTrackBudgets: budgetSummary.summary.onTrackBudgets,
      atRiskBudgetCount,
      totalBudgetAmountLabel: formatMoney(budgetSummary.summary.totalBudgetAmount, currency),
      totalSpentAmountLabel: formatMoney(budgetSummary.summary.totalSpentAmount, currency),
      totalRemainingLabel: formatMoney(budgetSummary.summary.totalRemaining, currency),
      topBudgets: topBudgets.slice(0, intent === "budgets" || intent === "general" ? 5 : 3),
    },
    obligations: {
      upcomingBills: billRows.slice(0, intent === "bills" || intent === "cashflow" || intent === "general" ? 8 : 4).map((bill) => ({
        name: bill.name,
        dueDate: formatDate(bill.dueDate),
        amountLabel: formatMoney(bill.amount, bill.currency),
        type: bill.obligationType,
      })),
      upcomingLoanInstallments: upcomingLoanInstallments.slice(
        0,
        intent === "loans" || intent === "cashflow" || intent === "general" ? 8 : 4
      ),
    },
    loans: {
      activeLoans: loanRows.length,
      totalOutstandingLabel: formatMoney(
        loanRows.reduce((sum, loan) => sum + loan.outstandingAmount, 0),
        currency
      ),
      loans: loanRows.slice(0, intent === "loans" || intent === "general" ? 5 : 3).map((loan) => ({
        name: loan.name,
        lenderName: loan.lenderName,
        outstandingLabel: formatMoney(loan.outstandingAmount, loan.currency),
      })),
    },
  };

  return contextPacket;
}
