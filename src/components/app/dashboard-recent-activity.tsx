"use client";

import { useMemo } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRightLeft,
  ArrowUpRight,
  Clock3,
  CreditCard,
  Landmark,
  Sparkles,
} from "lucide-react";
import Link from "next/link";

import { formatCurrencyMiliunits } from "@/lib/currencies";
import { getInstitutionDisplay } from "@/features/accounts/lib/institutions";
import {
  formatDateWithPreferences,
  resolveDatePreferences,
} from "@/features/settings/lib/date-format";
import { trpc } from "@/trpc/react";
import { CashflowProjectionChart } from "@/components/app/cashflow-projection-chart";
import { InstitutionAvatar } from "@/components/app/institution-avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AppRouter } from "@/server/api/root";

type MoneyPosture = "stable" | "watch" | "lean";
type RouterOutputs = inferRouterOutputs<AppRouter>;
type LoanListItem = RouterOutputs["loans"]["list"]["items"][number];

type CurrencyTotals = {
  currency: string;
  total: number;
};

type AccountType = "cash" | "wallet" | "credit" | "loan";

function getAccountTypeMetaLabel(type: AccountType) {
  if (type === "cash") return "Bank";
  if (type === "wallet") return "Wallet";
  if (type === "credit") return "Credit";
  return "Loan";
}

function getAccountTypeTone(type: AccountType) {
  if (type === "cash") {
    return {
      badge: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200",
      dot: "bg-emerald-500",
    };
  }

  if (type === "wallet") {
    return {
      badge: "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-200",
      dot: "bg-sky-500",
    };
  }

  if (type === "credit") {
    return {
      badge: "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200",
      dot: "bg-rose-500",
    };
  }

  return {
    badge: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200",
    dot: "bg-amber-500",
  };
}

function getMovementTypeLabel(
  type: "income" | "expense" | "transfer" | "credit_payment" | "loan_disbursement",
) {
  if (type === "credit_payment") return "Payment";
  if (type === "loan_disbursement") return "Loan";
  return type[0]?.toUpperCase() + type.slice(1).replace("_", " ");
}

function getMovementSignedAmount(
  type: "income" | "expense" | "transfer" | "credit_payment" | "loan_disbursement",
  amount: number,
) {
  if (type === "income" || type === "loan_disbursement") return amount;
  return -amount;
}

function getMoneyPosture(assets: number, liabilities: number): MoneyPosture {
  if (assets >= liabilities * 1.08) return "stable";
  if (assets >= liabilities) return "watch";
  return "lean";
}

function getPostureCopy(posture: MoneyPosture) {
  if (posture === "stable") {
    return {
      headline: "You're in a stable position",
      body: "Assets are ahead of liabilities. Debt is still worth monitoring.",
      tone: "text-emerald-700 dark:text-emerald-300",
      dot: "bg-emerald-500",
    };
  }

  if (posture === "watch") {
    return {
      headline: "You're in a close position",
      body: "Assets are still ahead, though liabilities are close enough to watch this week.",
      tone: "text-amber-700 dark:text-amber-300",
      dot: "bg-amber-500",
    };
  }

  return {
    headline: "You're in a pressured position",
    body: "Liabilities are ahead of assets. A payment-focused week can reduce pressure.",
    tone: "text-rose-700 dark:text-rose-300",
    dot: "bg-rose-500",
  };
}

function sumByCurrency(items: Array<{ balance: number; currency: string }>): CurrencyTotals[] {
  const map = new Map<string, number>();

  items.forEach((item) => {
    map.set(item.currency, (map.get(item.currency) ?? 0) + item.balance);
  });

  return Array.from(map.entries()).map(([currency, total]) => ({ currency, total }));
}

function formatPrimaryTotal(totals: CurrencyTotals[]) {
  if (totals.length === 0) return "No accounts";
  if (totals.length === 1) {
    const only = totals[0];
    return formatCurrencyMiliunits(only?.total ?? 0, only?.currency ?? "PHP");
  }

  const sorted = [...totals].sort((a, b) => b.total - a.total);
  const primary = sorted[0];
  if (!primary) return "No accounts";

  return `${formatCurrencyMiliunits(primary.total, primary.currency)} +${totals.length - 1} currency`;
}

function getForecastRiskMeta(risk: "safe" | "watch" | "shortfall") {
  if (risk === "shortfall") {
    return {
      label: "Shortfall risk",
      tone: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-200",
      dot: "bg-rose-500",
    };
  }

  if (risk === "watch") {
    return {
      label: "Watch",
      tone: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200",
      dot: "bg-amber-500",
    };
  }

  return {
    label: "Safe",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-200",
    dot: "bg-emerald-500",
  };
}

export function DashboardRecentActivity() {
  const accountsQuery = trpc.accounts.list.useQuery();
  const loansForDashboardQuery = trpc.loans.list.useQuery({
    page: 1,
    pageSize: 200,
    search: "",
    status: "all",
  });
  const transactionsQuery = trpc.transactions.list.useQuery({
    page: 1,
    pageSize: 30,
    search: "",
    type: "all",
  });
  const budgetsSummaryQuery = trpc.budgets.summary.useQuery();
  const forecastQuery = trpc.forecast.summary.useQuery({
    days: 30,
  });
  const aiDashboardInsightQuery = trpc.ai.dashboardInsight.useQuery(undefined, {
    staleTime: 60_000,
  });
  const settingsQuery = trpc.settings.get.useQuery();

  const datePreferences = useMemo(
    () => resolveDatePreferences(settingsQuery.data),
    [settingsQuery.data],
  );

  const accounts = useMemo(() => accountsQuery.data ?? [], [accountsQuery.data]);
  const loanOutstandingByUnderlyingAccountId = useMemo(() => {
    const map = new Map<string, number>();
    const items: LoanListItem[] = loansForDashboardQuery.data?.items ?? [];

    for (const loan of items) {
      if (!loan.underlyingLoanAccountId) continue;
      const current = map.get(loan.underlyingLoanAccountId) ?? 0;
      map.set(loan.underlyingLoanAccountId, current + Math.max(loan.outstandingAmount, 0));
    }

    return map;
  }, [loansForDashboardQuery.data?.items]);
  const accountsForDisplay = useMemo(
    () =>
      accounts.map((account) => {
        if (account.type !== "loan") return account;
        const linkedOutstanding = loanOutstandingByUnderlyingAccountId.get(account.id);
        if (linkedOutstanding === undefined) return account;

        return {
          ...account,
          balance: linkedOutstanding,
        };
      }),
    [accounts, loanOutstandingByUnderlyingAccountId],
  );
  const transactions = useMemo(
    () => transactionsQuery.data?.items ?? [],
    [transactionsQuery.data?.items],
  );
  const budgetsSummary = budgetsSummaryQuery.data;

  const liquidAccounts = useMemo(
    () => accountsForDisplay.filter((account) => account.type === "cash" || account.type === "wallet"),
    [accountsForDisplay],
  );

  const liabilityAccounts = useMemo(
    () => accountsForDisplay.filter((account) => account.type === "credit" || account.type === "loan"),
    [accountsForDisplay],
  );

  const importantAccounts = useMemo(() => {
    const top = [...accountsForDisplay]
      .sort((left, right) => Math.abs(right.balance) - Math.abs(left.balance))
      .slice(0, 4);

    const largestLiquid = [...liquidAccounts].sort((a, b) => b.balance - a.balance)[0] ?? null;
    const largestLiability =
      [...liabilityAccounts].sort((a, b) => b.balance - a.balance)[0] ?? null;
    const dailyUse =
      [...liquidAccounts]
        .filter((account) => account.id !== largestLiquid?.id)
        .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance))[0] ?? null;

    const totalLiability = liabilityAccounts.reduce(
      (sum, account) => sum + Math.abs(account.balance),
      0,
    );

    return top.map((account) => {
      const typeTone = getAccountTypeTone(account.type);
      const typeLabel = getAccountTypeMetaLabel(account.type);

      let note = "Active";
      let noteTone = "text-muted-foreground";
      let noteBadgeClass = "bg-muted text-muted-foreground";
      let amountMeta = typeLabel;
      let amountMetaTone = "text-muted-foreground";
      let amountMetaDot = "bg-muted-foreground/40";

      if (account.id === largestLiquid?.id) {
        note = "Main account";
        noteTone = "text-emerald-700 dark:text-emerald-300";
        noteBadgeClass =
          "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200";
        amountMeta = "Highest balance";
        amountMetaTone = "text-emerald-700 dark:text-emerald-300";
        amountMetaDot = "bg-emerald-500";
      } else if (account.id === largestLiability?.id) {
        note = "Highest debt";
        noteTone = "text-rose-700 dark:text-rose-300";
        noteBadgeClass = "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200";
        const share =
          totalLiability > 0 ? Math.round((Math.abs(account.balance) / totalLiability) * 100) : 0;
        amountMeta = `${share}% of total debt`;
        amountMetaTone = "text-rose-700 dark:text-rose-300";
        amountMetaDot = "bg-rose-500";
      } else if (account.id === dailyUse?.id) {
        note = "Daily use";
        noteTone = "text-sky-700 dark:text-sky-300";
        noteBadgeClass = "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-200";
        amountMeta = "Liquid";
        amountMetaTone = "text-emerald-700 dark:text-emerald-300";
        amountMetaDot = "bg-emerald-500";
      } else if (account.type === "cash" || account.type === "wallet") {
        note = "Liquid";
        noteTone = "text-teal-700 dark:text-teal-300";
        noteBadgeClass = "bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-200";
        amountMeta = "Liquid";
        amountMetaTone = "text-emerald-700 dark:text-emerald-300";
        amountMetaDot = "bg-emerald-500";
      }

      return {
        ...account,
        note,
        noteTone,
        noteBadgeClass,
        amountMeta,
        amountMetaTone,
        amountMetaDot,
        typeLabel,
        typeTone,
      };
    });
  }, [accountsForDisplay, liquidAccounts, liabilityAccounts]);

  const latestEvent = transactions[0] ?? null;

  const assetsTotals = useMemo(
    () =>
      sumByCurrency(
        liquidAccounts.map((account) => ({ balance: account.balance, currency: account.currency })),
      ),
    [liquidAccounts],
  );
  const liabilitiesTotals = useMemo(
    () =>
      sumByCurrency(
        liabilityAccounts.map((account) => ({
          balance: account.balance,
          currency: account.currency,
        })),
      ),
    [liabilityAccounts],
  );

  const primaryComparable = useMemo(() => {
    const shared = new Set(assetsTotals.map((item) => item.currency));
    const matchedLiability = liabilitiesTotals.filter((item) => shared.has(item.currency));

    if (shared.size === 0 || matchedLiability.length === 0) {
      return {
        assets: assetsTotals.reduce((sum, item) => sum + item.total, 0),
        liabilities: liabilitiesTotals.reduce((sum, item) => sum + item.total, 0),
      };
    }

    const assets = assetsTotals
      .filter((item) => shared.has(item.currency))
      .reduce((sum, item) => sum + item.total, 0);
    const liabilities = matchedLiability.reduce((sum, item) => sum + item.total, 0);

    return { assets, liabilities };
  }, [assetsTotals, liabilitiesTotals]);

  const posture = getMoneyPosture(primaryComparable.assets, primaryComparable.liabilities);
  const postureCopy = getPostureCopy(posture);

  const budgetSummary = budgetsSummary?.summary;

  const fallbackWatchNextInsight = useMemo(() => {
    const total = budgetSummary?.totalBudgets ?? 0;
    const warning = budgetSummary?.warningBudgets ?? 0;
    const danger = budgetSummary?.dangerBudgets ?? 0;
    const exceeded = budgetSummary?.exceededBudgets ?? 0;
    const atRisk = warning + danger + exceeded;
    const onTrack = Math.max(0, total - atRisk);
    const hasRecentMovement = transactions.length > 0;
    const totalRemaining = budgetSummary?.totalRemaining ?? 0;

    if (total === 0) {
      return {
        statement: hasRecentMovement
          ? "AI Insights is ready. Add your first budget to unlock next-step guidance."
          : "AI Insights is ready. Record activity and add a budget to unlock next-step guidance.",
        projectedImpact: "No budget projection yet",
        confidence: "Initial estimate",
        window: "Next 7 days",
        nextActionLabel: "Set your first budget",
        nextActionHref: "/budgets",
        budgetStatusSummary: "No active budgets yet",
        totalBudgets: total,
        atRisk,
        onTrack,
        warning,
        danger,
        exceeded,
        totalRemaining,
      };
    }

    if (atRisk > 0) {
      return {
        statement: `${atRisk} budget${atRisk === 1 ? "" : "s"} may tighten your buffer this cycle.`,
        projectedImpact: "Buffer tightening likely",
        confidence: "Medium confidence",
        window: "This cycle",
        nextActionLabel: "Review budgets",
        nextActionHref: "/budgets",
        budgetStatusSummary: `${onTrack} on track · ${atRisk} at risk`,
        totalBudgets: total,
        atRisk,
        onTrack,
        warning,
        danger,
        exceeded,
        totalRemaining,
      };
    }

    return {
      statement: "Your budgets are holding steady. Keep this pace to preserve your monthly buffer.",
      projectedImpact: "Stable budget runway",
      confidence: "Medium confidence",
      window: "Next 7 days",
      nextActionLabel: "Review budgets",
      nextActionHref: "/budgets",
      budgetStatusSummary: `${onTrack} on track · 0 at risk`,
      totalBudgets: total,
      atRisk,
      onTrack,
      warning,
      danger,
      exceeded,
      totalRemaining,
    };
  }, [budgetSummary, transactions.length]);

  const watchNextInsight = aiDashboardInsightQuery.data ?? fallbackWatchNextInsight;
  const forecastRiskMeta = forecastQuery.data
    ? getForecastRiskMeta(forecastQuery.data.riskLevel)
    : getForecastRiskMeta("safe");
  const trendMetrics = useMemo(() => {
    const latestReferenceTime =
      transactions.length > 0
        ? Math.max(...transactions.map((event) => new Date(event.occurredAt).getTime()))
        : 0;
    const dayMs = 24 * 60 * 60 * 1000;
    const currentWindowStart = latestReferenceTime - 7 * dayMs;
    const previousWindowStart = latestReferenceTime - 14 * dayMs;

    let currentNet = 0;
    let previousNet = 0;
    let currentCount = 0;

    for (const event of transactions) {
      const occurredAt = new Date(event.occurredAt).getTime();
      const signedAmount = getMovementSignedAmount(event.type, event.amount);

      if (occurredAt >= currentWindowStart) {
        currentNet += signedAmount;
        currentCount += 1;
        continue;
      }

      if (occurredAt >= previousWindowStart) {
        previousNet += signedAmount;
      }
    }

    const delta = currentNet - previousNet;
    let trendLabel = "Flat vs prior 7d";
    let trendTone = "text-white/72";

    if (delta > 0) {
      trendLabel = "Up vs prior 7d";
      trendTone = "text-emerald-300";
    } else if (delta < 0) {
      trendLabel = "Down vs prior 7d";
      trendTone = "text-rose-300";
    }

    let deltaDisplay = "No baseline";
    if (previousNet !== 0) {
      const percentage = (delta / Math.abs(previousNet)) * 100;
      deltaDisplay = `${percentage >= 0 ? "+" : "-"}${Math.abs(percentage).toFixed(1)}%`;
    } else if (delta !== 0) {
      deltaDisplay = delta > 0 ? "Improving" : "Softening";
    }

    return {
      currentNet,
      currentCount,
      trendLabel,
      trendTone,
      deltaDisplay,
    };
  }, [transactions]);

  if (accountsQuery.isLoading || transactionsQuery.isLoading || budgetsSummaryQuery.isLoading) {
    return (
      <section className="space-y-4 md:space-y-6">
        <div className="h-44 animate-pulse rounded-[1.5rem] border border-border/70 bg-white/78 dark:border-white/8 dark:bg-[#182123] md:h-64" />
        <div className="grid gap-4 md:grid-cols-2 md:gap-6">
          <div className="h-[19rem] animate-pulse rounded-[1.5rem] border border-border/70 bg-white/78 dark:border-white/8 dark:bg-[#182123]" />
          <div className="h-[19rem] animate-pulse rounded-[1.5rem] border border-border/70 bg-white/78 dark:border-white/8 dark:bg-[#182123]" />
        </div>
        <div className="h-36 animate-pulse rounded-[1.5rem] border border-border/70 bg-white/78 dark:border-white/8 dark:bg-[#182123]" />
      </section>
    );
  }

  if (accountsQuery.error || transactionsQuery.error || budgetsSummaryQuery.error) {
    return (
      <Card className="border-destructive/20 bg-white/80 dark:border-destructive/25 dark:bg-[#182123]">
        <CardHeader>
          <CardTitle className="text-xl tracking-tight">Could not load dashboard data</CardTitle>
        </CardHeader>
      </Card>
    );
  }

  return (
    <section className="flex flex-col gap-5 pb-4 md:gap-6 md:pb-0">
      <Card className="rounded-[1.5rem] border-white/10 bg-[linear-gradient(145deg,rgba(16,41,43,0.98),rgba(29,78,77,0.94))]  text-white shadow-[0_26px_80px_-52px_rgba(10,31,34,0.62)]">
        <CardContent className="space-y-4 p-4 sm:p-5 md:space-y-4 md:p-6 lg:p-7.5">
          <div className="flex items-start justify-between gap-4">
            <p className="text-[0.84rem] font-medium tracking-[0.01em] text-white/72 md:text-[0.88rem]">
              Today · {formatDateWithPreferences(new Date(), datePreferences, "date")}
            </p>
            <Button
              asChild
              variant="outline"
              size="sm"
              className="h-8 rounded-full border-white/24 bg-white/[0.08] px-3 text-[0.76rem] font-medium text-white shadow-none hover:bg-white/[0.13] hover:text-white md:h-8 md:px-3.5 md:text-[0.79rem]"
            >
              <Link href="/transactions">View details</Link>
            </Button>
          </div>

          <div className="grid gap-4 border-border/70 md:min-h-[7.7rem] md:grid-cols-[minmax(0,1.5fr)_minmax(0,1.02fr)_minmax(0,0.92fr)] md:gap-0">
            <div className="space-y-2.5 md:space-y-3 md:pr-7">
              <p className="text-[0.72rem] uppercase tracking-[0.12em] text-white/65">Overview</p>
              <div className="flex items-center gap-2 text-[1.06rem] font-semibold leading-none tracking-tight text-white md:text-[1.34rem] lg:text-[1.48rem]">
                <span className={`size-2.5 rounded-full ${postureCopy.dot} md:size-3`} />
                {postureCopy.headline}
              </div>
              <p className="max-w-[30ch] text-[0.9rem] leading-6 text-white/74 md:max-w-[34ch] md:text-[0.93rem] md:leading-7">
                {postureCopy.body}
              </p>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.05] px-3 py-1.5">
                <span className="text-[0.78rem] text-white/72">7d trend</span>
                <span className={`text-[0.8rem] font-semibold ${trendMetrics.trendTone}`}>
                  {trendMetrics.deltaDisplay}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-0 border-t border-white/15 pt-3.5 md:border-0 md:border-l md:border-white/15 md:pl-7 md:pt-0">
              <div className="space-y-2.5 pr-4 md:pr-5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[0.82rem] text-white/70 md:text-[0.88rem]">Assets</p>
                  <span className="flex size-8.5 items-center justify-center rounded-full bg-emerald-100/95 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200 md:size-9">
                    <Landmark className="size-3.5 md:size-[0.95rem]" />
                  </span>
                </div>
                <p className="text-[0.96rem] font-semibold tracking-tight text-white md:text-[1.18rem] lg:text-[1.28rem]">
                  {formatPrimaryTotal(assetsTotals)}
                </p>
              </div>

              <div className="space-y-2.5 border-l border-white/15 pl-4 pr-4 md:pr-5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[0.82rem] text-white/70 md:text-[0.88rem]">Liabilities</p>
                  <span className="flex size-8.5 items-center justify-center rounded-full bg-rose-100/95 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200 md:size-9">
                    <CreditCard className="size-3.5 md:size-[0.95rem]" />
                  </span>
                </div>
                <p className="text-[0.96rem] font-semibold tracking-tight text-white md:text-[1.18rem] lg:text-[1.28rem]">
                  {formatPrimaryTotal(liabilitiesTotals)}
                </p>
              </div>
            </div>

            <div className="hidden space-y-2 border-t border-white/15 pt-4 md:block md:border-0 md:border-l md:border-white/15 md:pl-7 md:pt-0">
              <div className="flex items-center gap-2 text-[0.82rem] text-white/70">
                <Clock3 className="size-4" />
                Latest activity
              </div>
              <p className="line-clamp-2 text-[0.95rem] font-semibold tracking-tight text-white lg:text-[0.99rem]">
                {latestEvent?.description ?? "No activity yet"}
              </p>
              <p className="text-[0.82rem] leading-6 text-white/70">
                {latestEvent
                  ? formatDateWithPreferences(latestEvent.occurredAt, datePreferences, "date")
                  : "Record your first event in transactions"}
              </p>
            </div>
          </div>

          <div className="border-t border-white/15 pt-3.5">
            <div className="grid grid-cols-3 overflow-hidden rounded-xl border border-white/12 bg-white/[0.05] sm:hidden">
              <div className="px-2.5 py-2.5">
                <p className="text-[0.62rem] uppercase tracking-[0.09em] text-white/62">7d net</p>
                <p className="mt-1 truncate text-[0.83rem] font-semibold text-white">
                  {formatCurrencyMiliunits(trendMetrics.currentNet, "PHP")}
                </p>
              </div>
              <div className="border-x border-white/12 px-2.5 py-2.5">
                <p className="text-[0.62rem] uppercase tracking-[0.09em] text-white/62">Trend</p>
                <p className={`mt-1 truncate text-[0.83rem] font-semibold ${trendMetrics.trendTone}`}>
                  {trendMetrics.trendLabel}
                </p>
              </div>
              <div className="px-2.5 py-2.5">
                <p className="text-[0.62rem] uppercase tracking-[0.09em] text-white/62">Events</p>
                <p className="mt-1 text-[0.83rem] font-semibold text-white">
                  {trendMetrics.currentCount}
                </p>
              </div>
            </div>

            <div className="hidden gap-2.5 sm:grid sm:grid-cols-3">
              <div className="rounded-xl border border-white/12 bg-white/[0.05] px-3.5 py-2.5">
                <p className="text-[0.72rem] uppercase tracking-[0.09em] text-white/62">
                  7d net movement
                </p>
                <p className="mt-1 text-[0.9rem] font-semibold text-white">
                  {formatCurrencyMiliunits(trendMetrics.currentNet, "PHP")}
                </p>
              </div>
              <div className="rounded-xl border border-white/12 bg-white/[0.05] px-3.5 py-2.5">
                <p className="text-[0.72rem] uppercase tracking-[0.09em] text-white/62">Trend</p>
                <p className={`mt-1 text-[0.9rem] font-semibold ${trendMetrics.trendTone}`}>
                  {trendMetrics.trendLabel}
                </p>
              </div>
              <div className="rounded-xl border border-white/12 bg-white/[0.05] px-3.5 py-2.5">
                <p className="text-[0.72rem] uppercase tracking-[0.09em] text-white/62">
                  Events (7d)
                </p>
                <p className="mt-1 text-[0.9rem] font-semibold text-white">
                  {trendMetrics.currentCount}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] md:gap-6">
      <Card className="rounded-[1.5rem] border-white/80 bg-white/84 shadow-[0_26px_80px_-60px_rgba(10,31,34,0.35)] dark:border-white/8 dark:bg-[#182123] dark:shadow-[0_28px_90px_-60px_rgba(0,0,0,0.6)] md:order-1">
        <CardContent className="p-4 sm:p-5 md:p-6 lg:p-7">
          <div className="mb-4 flex flex-col gap-2.5 md:mb-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-[1.14rem] font-semibold tracking-tight text-[#10292B] dark:text-foreground md:text-[1.16rem] lg:text-[1.22rem]">
                What to watch next
              </h3>
              <span className="inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full border border-violet-200/90 bg-violet-50/85 px-2.5 text-[0.64rem] font-semibold uppercase tracking-[0.09em] leading-none text-violet-700 dark:border-violet-500/25 dark:bg-violet-500/12 dark:text-violet-200">
                <Sparkles className="size-3" />
                Veyra insight
              </span>
            </div>
            <div className="hidden text-[0.75rem] uppercase tracking-[0.1em] text-muted-foreground md:block">
              Forward-looking guidance
            </div>
          </div>

          <div className="grid gap-4 rounded-[1.1rem] border border-border/70 bg-white p-4 md:min-h-[11.5rem] md:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)] md:items-stretch md:gap-5 md:p-5.5 dark:bg-[#141d1f]">
            <div className="space-y-3.5">
              <div className="flex items-start gap-3.5">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-[0.95rem] bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-200 md:size-11 md:rounded-[0.95rem]">
                  <Sparkles className="size-5 md:size-5" />
                </div>
                <div>
                  <p className="text-[0.98rem] font-semibold tracking-tight text-[#10292B] dark:text-foreground md:text-[0.96rem]">
                    {watchNextInsight.statement}
                  </p>
                  <p className="mt-1 text-[0.88rem] leading-6 text-muted-foreground md:text-[0.86rem]">
                    {watchNextInsight.budgetStatusSummary}
                  </p>
                </div>
              </div>

              <div className="rounded-[0.9rem] border border-border/70 bg-white p-2.5 dark:bg-[#192325]">
                <div className="space-y-0 sm:hidden">
                  <div className="flex items-center justify-between gap-3 px-2 py-2">
                    <p className="text-[0.7rem] uppercase tracking-[0.1em] text-muted-foreground">
                      Projected impact
                    </p>
                    <p className="text-right text-[0.83rem] font-medium text-foreground">
                      {watchNextInsight.projectedImpact}
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t border-border/70 px-2 py-2">
                    <p className="text-[0.7rem] uppercase tracking-[0.1em] text-muted-foreground">
                      Confidence
                    </p>
                    <p className="text-right text-[0.83rem] font-medium text-foreground">
                      {watchNextInsight.confidence}
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t border-border/70 px-2 py-2">
                    <p className="text-[0.7rem] uppercase tracking-[0.1em] text-muted-foreground">
                      Time window
                    </p>
                    <p className="text-right text-[0.83rem] font-medium text-foreground">
                      {watchNextInsight.window}
                    </p>
                  </div>
                </div>

                <div className="hidden grid-cols-3 gap-2.5 sm:grid">
                  <div className="space-y-1">
                    <p className="text-[0.72rem] uppercase tracking-[0.1em] text-muted-foreground">
                      Projected impact
                    </p>
                    <p className="text-[0.84rem] font-medium text-foreground">
                      {watchNextInsight.projectedImpact}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[0.72rem] uppercase tracking-[0.1em] text-muted-foreground">
                      Confidence
                    </p>
                    <p className="text-[0.84rem] font-medium text-foreground">
                      {watchNextInsight.confidence}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[0.72rem] uppercase tracking-[0.1em] text-muted-foreground">
                      Time window
                    </p>
                    <p className="text-[0.84rem] font-medium text-foreground">
                      {watchNextInsight.window}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-start gap-3 rounded-[0.9rem] border border-border/70 bg-white/70 px-3 py-3 dark:bg-[#111a1c] sm:flex-row sm:items-center sm:justify-between sm:py-2.5">
                <div>
                  <p className="text-[0.68rem] uppercase tracking-[0.1em] text-muted-foreground">
                    Recommended next step
                  </p>
                  <p className="mt-0.5 hidden text-[0.86rem] font-medium text-foreground sm:block">
                    {watchNextInsight.nextActionLabel}
                  </p>
                </div>
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="h-9 w-full justify-center rounded-full bg-[#17393c] px-3 text-[0.8rem] font-medium text-white shadow-none hover:bg-[#1d4a4d] hover:text-white dark:bg-[#20474a] dark:text-white dark:hover:bg-[#28595c] dark:hover:text-white sm:h-8 sm:w-auto sm:text-[0.76rem]"
                >
                  <Link href={watchNextInsight.nextActionHref}>{watchNextInsight.nextActionLabel}</Link>
                </Button>
              </div>
            </div>

            <div className="rounded-[0.95rem] border border-border/70 bg-white p-3.5 dark:bg-[#192325]">
              <p className="text-[0.72rem] uppercase tracking-[0.1em] text-muted-foreground">
                Budget status
              </p>
              <div className="mt-3 space-y-2.5 text-[0.84rem]">
                <div className="flex items-center justify-between rounded-lg border border-border/70 bg-white/70 px-3 py-2 dark:bg-[#111a1c]">
                  <span className="inline-flex items-center gap-2 text-muted-foreground">
                    <span className="size-1.5 rounded-full bg-muted-foreground/60" />
                    Total budgets
                  </span>
                  <span className="font-semibold text-foreground">
                    {watchNextInsight.totalBudgets}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border/70 bg-white/70 px-3 py-2 dark:bg-[#111a1c]">
                  <span className="inline-flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                    <span className="size-1.5 rounded-full bg-emerald-500" />
                    On track
                  </span>
                  <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                    {watchNextInsight.onTrack}
                  </span>
                </div>
                <div
                  className={`flex items-center justify-between rounded-lg border px-3 py-2 dark:bg-[#111a1c] ${
                    watchNextInsight.atRisk > 0
                      ? "border-amber-300/60 bg-amber-50/60 dark:border-amber-500/25 dark:bg-amber-500/10"
                      : "border-border/70 bg-white/70"
                  }`}
                >
                  <span className="inline-flex items-center gap-2 text-amber-700 dark:text-amber-300">
                    <span className="size-1.5 rounded-full bg-amber-500" />
                    At risk
                  </span>
                  <span className="font-semibold text-amber-700 dark:text-amber-300">
                    {watchNextInsight.atRisk}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border/70 bg-white/70 px-3 py-2 dark:bg-[#111a1c]">
                  <span className="inline-flex items-center gap-2 text-muted-foreground">
                    <span className="size-1.5 rounded-full bg-sky-500/80" />
                    Remaining
                  </span>
                  <span className="font-semibold text-foreground">
                    {watchNextInsight.totalBudgets > 0
                      ? formatCurrencyMiliunits(watchNextInsight.totalRemaining, "PHP")
                      : "—"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

        <Card className="rounded-[1.5rem] border-white/80 bg-white/84 shadow-[0_26px_80px_-60px_rgba(10,31,34,0.35)] dark:border-white/8 dark:bg-[#182123] dark:shadow-[0_28px_90px_-60px_rgba(0,0,0,0.6)] md:order-3">
          <CardContent className="p-4 sm:p-5 md:p-6 lg:p-7">
            <div className="mb-4 flex items-center justify-between gap-3 md:mb-5">
              <h3 className="text-[1.02rem] font-semibold leading-snug tracking-tight text-[#10292B] dark:text-foreground md:text-[1.16rem] lg:text-[1.22rem]">
                Accounts shaping your position
              </h3>
              <Button
                asChild
                variant="outline"
                size="sm"
                className="h-9 rounded-full bg-[#17393c] px-3.5 text-[0.8rem] font-medium text-white shadow-none hover:bg-[#1d4a4d] hover:text-white dark:bg-[#20474a] dark:text-white dark:hover:bg-[#28595c] dark:hover:text-white md:h-8 md:px-3.5 md:text-[0.79rem]"
              >
                <Link href="/accounts">View all</Link>
              </Button>
            </div>

            <div className="overflow-hidden rounded-[1.05rem] border border-border/70 md:rounded-[1.15rem]">
              <div className="divide-y divide-border/70">
                {importantAccounts.length === 0 ? (
                  <div className="px-4 py-7 text-sm text-muted-foreground">
                    No accounts yet. Add your first bank or wallet account.
                  </div>
                ) : (
                  importantAccounts.map((account) => {
                    const institution = getInstitutionDisplay(account.institution || account.name);
                    return (
                      <div
                        key={account.id}
                        className="flex items-center gap-3 px-4 py-3 md:gap-3 md:px-5 md:py-3.5"
                      >
                        <InstitutionAvatar
                          key={`${institution.label}:${institution.logoPaths.join("|")}`}
                          display={institution}
                          sizeClassName="size-9 md:size-10"
                          containerClassName=""
                          imageClassName="size-full rounded-full object-cover"
                          initialsClassName="text-[0.76rem] font-semibold md:text-[0.75rem]"
                          logoContainerClassName="border border-border/70 bg-white/90 p-0 dark:border-white/10 dark:bg-[#141d1f]"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[0.82rem] font-semibold tracking-tight text-[#10292B] dark:text-foreground md:text-[0.88rem]">
                            {account.name}
                          </p>
                          <div className="mt-1 flex items-center gap-1.5 text-[0.62rem] leading-none md:text-[0.68rem]">
                            {account.note !== "Active" ? (
                              <span
                                className={`inline-flex rounded-full px-1.5 py-0.5 font-medium md:px-1.5 md:py-0.5 ${account.noteBadgeClass}`}
                              >
                                {account.note}
                              </span>
                            ) : null}
                            <span className="text-muted-foreground">{account.typeLabel}</span>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-[0.82rem] font-semibold tracking-tight text-[#10292B] dark:text-foreground md:text-[0.86rem]">
                            {formatCurrencyMiliunits(account.balance, account.currency)}
                          </p>
                          <div
                            className={`mt-1 flex items-center justify-end gap-1 text-[0.6rem] ${account.amountMetaTone} md:gap-1.5 md:text-[0.66rem]`}
                          >
                            <span className={`size-1 rounded-full md:size-1.5 ${account.amountMetaDot}`} />
                            <span>{account.amountMeta}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
        </CardContent>
      </Card>

      <Card className="rounded-[1.5rem] border-white/80 bg-white/84 shadow-[0_26px_80px_-60px_rgba(10,31,34,0.35)] dark:border-white/8 dark:bg-[#182123] dark:shadow-[0_28px_90px_-60px_rgba(0,0,0,0.6)] md:order-2">
        <CardContent className="space-y-4 p-4 sm:p-5 md:p-6 lg:p-7">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="flex size-9 items-center justify-center rounded-full bg-[#eef6f7] text-[#14656B] dark:bg-[#203032] dark:text-primary">
                  <Clock3 className="size-4.5" />
                </span>
                <h3 className="text-[1.12rem] font-semibold tracking-tight text-[#10292B] dark:text-foreground">
                  30-day cashflow forecast
                </h3>
              </div>
              <p className="text-[0.8rem] text-muted-foreground">
                Uses liquid accounts, pending bills, and unpaid loan installments.
              </p>
            </div>
            {forecastQuery.data ? (
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.08em] ${forecastRiskMeta.tone}`}
              >
                {forecastRiskMeta.label}
              </span>
            ) : null}
          </div>

          {forecastQuery.isLoading ? (
            <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-background px-4 py-4 text-[0.9rem] text-muted-foreground dark:bg-[#141d1f]">
              <Clock3 className="size-4 animate-pulse" />
              Building cashflow projection...
            </div>
          ) : forecastQuery.data ? (
            <div className="space-y-3">
              <div className="grid gap-2.5 sm:grid-cols-3">
                <div className="rounded-xl border border-border/70 bg-background px-3 py-2.5 dark:bg-[#141d1f]">
                  <p className="text-[0.66rem] uppercase tracking-[0.1em] text-muted-foreground">
                    Lowest point
                  </p>
                  <p className="mt-0.5 text-[0.98rem] font-semibold tracking-tight text-foreground">
                    {formatCurrencyMiliunits(
                      forecastQuery.data.lowestBalance,
                      forecastQuery.data.currency,
                    )}
                  </p>
                  <p className="text-[0.76rem] text-muted-foreground">
                    {formatDateWithPreferences(
                      forecastQuery.data.lowestBalanceDate,
                      datePreferences,
                      "date",
                    )}
                  </p>
                </div>
                <div className="rounded-xl border border-border/70 bg-background px-3 py-2.5 dark:bg-[#141d1f]">
                  <p className="text-[0.66rem] uppercase tracking-[0.1em] text-muted-foreground">
                    Due in 7 days
                  </p>
                  <p className="mt-0.5 text-[0.98rem] font-semibold tracking-tight text-foreground">
                    {forecastQuery.data.dueSoonCount} items
                  </p>
                  <p className="text-[0.76rem] text-muted-foreground">
                    {formatCurrencyMiliunits(
                      forecastQuery.data.dueSoonAmount,
                      forecastQuery.data.currency,
                    )}
                  </p>
                </div>
                <div className="rounded-xl border border-border/70 bg-background px-3 py-2.5 dark:bg-[#141d1f]">
                  <p className="text-[0.66rem] uppercase tracking-[0.1em] text-muted-foreground">
                    Ending balance
                  </p>
                  <p className="mt-0.5 text-[0.98rem] font-semibold tracking-tight text-foreground">
                    {formatCurrencyMiliunits(
                      forecastQuery.data.projectedEndingBalance,
                      forecastQuery.data.currency,
                    )}
                  </p>
                  <p className="text-[0.76rem] text-muted-foreground">
                    Outflow{" "}
                    {formatCurrencyMiliunits(
                      forecastQuery.data.obligationsTotal,
                      forecastQuery.data.currency,
                    )}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-border/70 bg-background px-3 py-3 dark:bg-[#141d1f]">
                <div className="mb-2 flex items-center justify-between text-[0.76rem] text-muted-foreground">
                  <span>Projected liquid balance</span>
                  <span>
                    Upcoming obligations{" "}
                    <span className="font-semibold text-foreground">
                      {forecastQuery.data.topObligations.length}
                    </span>
                  </span>
                </div>
                <div className="h-16 w-full">
                  <CashflowProjectionChart
                    points={forecastQuery.data.dailyProjection}
                    height={56}
                    currency={forecastQuery.data.currency}
                    scaleMode="fit"
                  />
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.68rem] text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2 rounded-full border border-[#14656b] bg-[#e9f6f5] dark:border-[#6bd0c2] dark:bg-[#203032]" />
                    Due-date outflow marker
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2 rounded-full border border-rose-500 bg-rose-100 dark:border-rose-300 dark:bg-rose-500/20" />
                    Lowest projected balance
                  </span>
                </div>
              </div>

              {forecastQuery.data.riskLevel === "shortfall" ? (
                <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[0.8rem] text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-200">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    Projected balance dips below zero. Prioritize upcoming obligations or move funds.
                  </span>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border/80 bg-background px-4 py-4 text-[0.9rem] text-muted-foreground dark:bg-[#141d1f]">
              Forecast data is unavailable right now.
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-[1.5rem] border-white/80 bg-white/84 shadow-[0_26px_80px_-60px_rgba(10,31,34,0.35)] dark:border-white/8 dark:bg-[#182123] dark:shadow-[0_28px_90px_-60px_rgba(0,0,0,0.6)] md:order-4">
          <CardContent className="p-4 sm:p-5 md:p-6 lg:p-7">
            <div className="mb-4 flex items-center justify-between gap-3 md:mb-5">
              <h3 className="text-[1.02rem] font-semibold leading-snug tracking-tight text-[#10292B] dark:text-foreground md:text-[1.16rem] lg:text-[1.22rem]">
                Recent changes affecting your balance
              </h3>
              <Button
                asChild
                variant="outline"
                size="sm"
                className="h-9 rounded-full bg-[#17393c] px-3.5 text-[0.8rem] font-medium text-white shadow-none hover:bg-[#1d4a4d] hover:text-white dark:bg-[#20474a] dark:text-white dark:hover:bg-[#28595c] dark:hover:text-white md:h-8 md:px-3.5 md:text-[0.79rem]"
              >
                <Link href="/transactions">View all</Link>
              </Button>
            </div>

            <div className="overflow-hidden rounded-[1.05rem] border border-border/70 md:rounded-[1.15rem]">
              <div className="divide-y divide-border/70">
                {transactions.slice(0, 5).length === 0 ? (
                  <div className="px-4 py-7 text-sm text-muted-foreground">
                    No movement yet. Record an income or expense event.
                  </div>
                ) : (
                  transactions.slice(0, 5).map((event) => {
                    const signedAmount = getMovementSignedAmount(event.type, event.amount);
                    const amountPositive = signedAmount >= 0;
                    const iconTone = amountPositive
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200"
                      : "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200";

                    return (
                      <div
                        key={event.id}
                        className="flex items-center gap-3 px-4 py-3 md:gap-3 md:px-5 md:py-3.5"
                      >
                        <div
                          className={`flex size-9 shrink-0 items-center justify-center rounded-full ${iconTone} md:size-10`}
                        >
                          {event.type === "transfer" ? (
                            <ArrowRightLeft className="size-3.5 md:size-4" />
                          ) : amountPositive ? (
                            <ArrowUpRight className="size-3.5 md:size-4" />
                          ) : (
                            <ArrowDownRight className="size-3.5 md:size-4" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[0.82rem] font-semibold tracking-tight text-[#10292B] dark:text-foreground md:text-[0.88rem]">
                            {event.description}
                          </p>
                          <p className="mt-0.5 text-[0.64rem] text-muted-foreground md:text-[0.7rem]">
                            {getMovementTypeLabel(event.type)}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p
                            className={`text-[0.82rem] font-semibold tracking-tight ${amountPositive ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"} md:text-[0.88rem]`}
                          >
                            {amountPositive ? "+" : "-"}
                            {formatCurrencyMiliunits(Math.abs(signedAmount), event.currency)}
                          </p>
                          <p className="mt-0.5 text-[0.64rem] text-muted-foreground md:text-[0.7rem]">
                            {formatDateWithPreferences(event.occurredAt, datePreferences, "date")}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

    </section>
  );
}
