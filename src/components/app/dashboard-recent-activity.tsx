"use client";

import { useMemo } from "react";
import {
  ArrowDownRight,
  ArrowRightLeft,
  ArrowUpRight,
  Clock3,
  CreditCard,
  Landmark,
  PiggyBank,
  Plus,
  Wallet,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { formatCurrencyMiliunits } from "@/lib/currencies";
import { getInstitutionDisplay } from "@/features/accounts/lib/institutions";
import {
  formatDateWithPreferences,
  resolveDatePreferences,
} from "@/features/settings/lib/date-format";
import { trpc } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type MoneyPosture = "stable" | "watch" | "lean";

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
      title: "Stable this week",
      body: "Assets are ahead of liabilities, but debt remains meaningful.",
      tone: "text-emerald-700 dark:text-emerald-300",
      dot: "bg-emerald-500",
    };
  }

  if (posture === "watch") {
    return {
      title: "Close balance this week",
      body: "You are still ahead, though liabilities are close enough to watch.",
      tone: "text-amber-700 dark:text-amber-300",
      dot: "bg-amber-500",
    };
  }

  return {
    title: "Liabilities leading",
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

export function DashboardRecentActivity() {
  const accountsQuery = trpc.accounts.list.useQuery();
  const transactionsQuery = trpc.transactions.list.useQuery({
    page: 1,
    pageSize: 8,
    search: "",
    type: "all",
  });
  const budgetsSummaryQuery = trpc.budgets.summary.useQuery();
  const settingsQuery = trpc.settings.get.useQuery();

  const datePreferences = useMemo(
    () => resolveDatePreferences(settingsQuery.data),
    [settingsQuery.data],
  );

  const accounts = useMemo(() => accountsQuery.data ?? [], [accountsQuery.data]);
  const transactions = useMemo(
    () => transactionsQuery.data?.items ?? [],
    [transactionsQuery.data?.items],
  );
  const budgetsSummary = budgetsSummaryQuery.data;

  const liquidAccounts = useMemo(
    () => accounts.filter((account) => account.type === "cash" || account.type === "wallet"),
    [accounts],
  );

  const liabilityAccounts = useMemo(
    () => accounts.filter((account) => account.type === "credit" || account.type === "loan"),
    [accounts],
  );

  const importantAccounts = useMemo(() => {
    const top = [...accounts]
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
  }, [accounts, liquidAccounts, liabilityAccounts]);

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
  const budgetPosture = useMemo(() => {
    const total = budgetSummary?.totalBudgets ?? 0;
    const warning = budgetSummary?.warningBudgets ?? 0;
    const danger = budgetSummary?.dangerBudgets ?? 0;
    const exceeded = budgetSummary?.exceededBudgets ?? 0;
    const needsAttention = warning + danger + exceeded;

    if (total === 0) {
      return {
        title: "No active budgets yet",
        body: "Set a monthly or weekly budget to track your spending with confidence.",
        action: "Create budget",
      };
    }

    if (needsAttention > 0) {
      return {
        title: `${needsAttention} budget${needsAttention === 1 ? "" : "s"} need review`,
        body: `${formatCurrencyMiliunits(budgetSummary?.totalRemaining ?? 0, "PHP")} remains across active parent budgets.`,
        action: "Manage budget",
      };
    }

    return {
      title: "Budgets are on track",
      body: `${formatCurrencyMiliunits(budgetSummary?.totalRemaining ?? 0, "PHP")} remains across active parent budgets.`,
      action: "Manage budget",
    };
  }, [budgetSummary]);

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
    <section className="space-y-5 pb-24 md:space-y-6 md:pb-0">
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
              <h2 className="text-[0.98rem] font-semibold tracking-tight text-white/95 md:text-[1.08rem] lg:text-[1.16rem]">
                Money posture
              </h2>
              <div className="flex items-center gap-2 text-[1.06rem] font-semibold leading-none tracking-tight text-white md:text-[1.34rem] lg:text-[1.48rem]">
                <span className={`size-2.5 rounded-full ${postureCopy.dot} md:size-3`} />
                {postureCopy.title}
              </div>
              <p className="max-w-[30ch] text-[0.9rem] leading-6 text-white/74 md:max-w-[34ch] md:text-[0.93rem] md:leading-7">
                {postureCopy.body}
              </p>
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
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 md:gap-6">
        <Card className="rounded-[1.5rem] border-white/80 bg-white/84 shadow-[0_26px_80px_-60px_rgba(10,31,34,0.35)] dark:border-white/8 dark:bg-[#182123] dark:shadow-[0_28px_90px_-60px_rgba(0,0,0,0.6)]">
          <CardContent className="p-4 sm:p-5 md:p-6 lg:p-7">
            <div className="mb-4 flex items-center justify-between gap-3 md:mb-5">
              <h3 className="text-[1.14rem] font-semibold tracking-tight text-[#10292B] dark:text-foreground md:text-[1.16rem] lg:text-[1.22rem]">
                Important accounts
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
                        <div
                          className={`flex size-10 shrink-0 items-center justify-center rounded-full md:size-10 ${
                            institution.logoPath
                              ? "border border-border/70 bg-white/90 p-1.5 dark:border-white/10 dark:bg-[#141d1f]"
                              : `text-[0.76rem] font-semibold md:text-[0.75rem] ${institution.tone}`
                          }`}
                        >
                          {institution.logoPath ? (
                            <Image
                              src={institution.logoPath}
                              alt={`${institution.label} logo`}
                              width={30}
                              height={30}
                              className="size-full object-contain"
                            />
                          ) : (
                            institution.initials
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[0.98rem] font-semibold tracking-tight text-[#10292B] dark:text-foreground md:text-[0.96rem]">
                            {account.name}
                          </p>
                          <div className="mt-1 flex items-center gap-2 text-[0.77rem] leading-none md:text-[0.82rem]">
                            {account.note !== "Active" ? (
                              <span
                                className={`inline-flex rounded-full px-2 py-1 font-medium ${account.noteBadgeClass}`}
                              >
                                {account.note}
                              </span>
                            ) : null}
                            <span className="text-muted-foreground">{account.typeLabel}</span>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-[0.96rem] font-semibold tracking-tight text-[#10292B] dark:text-foreground md:text-[0.94rem]">
                            {formatCurrencyMiliunits(account.balance, account.currency)}
                          </p>
                          <div
                            className={`mt-1 flex items-center justify-end gap-1.5 text-[0.74rem] ${account.amountMetaTone} md:text-[0.76rem]`}
                          >
                            <span className={`size-1.5 rounded-full ${account.amountMetaDot}`} />
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

        <Card className="rounded-[1.5rem] border-white/80 bg-white/84 shadow-[0_26px_80px_-60px_rgba(10,31,34,0.35)] dark:border-white/8 dark:bg-[#182123] dark:shadow-[0_28px_90px_-60px_rgba(0,0,0,0.6)]">
          <CardContent className="p-4 sm:p-5 md:p-6 lg:p-7">
            <div className="mb-4 flex items-center justify-between gap-3 md:mb-5">
              <h3 className="text-[1.14rem] font-semibold tracking-tight text-[#10292B] dark:text-foreground md:text-[1.16rem] lg:text-[1.22rem]">
                Recent movement
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
                          className={`flex size-10 shrink-0 items-center justify-center rounded-full ${iconTone} md:size-10`}
                        >
                          {event.type === "transfer" ? (
                            <ArrowRightLeft className="size-4" />
                          ) : amountPositive ? (
                            <ArrowUpRight className="size-4" />
                          ) : (
                            <ArrowDownRight className="size-4" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[0.98rem] font-semibold tracking-tight text-[#10292B] dark:text-foreground md:text-[0.96rem]">
                            {event.description}
                          </p>
                          <p className="mt-0.5 text-[0.78rem] text-muted-foreground md:text-[0.78rem]">
                            {getMovementTypeLabel(event.type)}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p
                            className={`text-[0.98rem] font-semibold tracking-tight ${amountPositive ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"} md:text-[0.96rem]`}
                          >
                            {amountPositive ? "+" : "-"}
                            {formatCurrencyMiliunits(Math.abs(signedAmount), event.currency)}
                          </p>
                          <p className="mt-0.5 text-[0.78rem] text-muted-foreground md:text-[0.78rem]">
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

      <Card className="rounded-[1.5rem] border-white/80 bg-white/84 shadow-[0_26px_80px_-60px_rgba(10,31,34,0.35)] dark:border-white/8 dark:bg-[#182123] dark:shadow-[0_28px_90px_-60px_rgba(0,0,0,0.6)]">
        <CardContent className="p-4 sm:p-5 md:p-6 lg:p-7">
          <div className="mb-4 flex items-center justify-between gap-3 md:mb-5">
            <h3 className="text-[1.14rem] font-semibold tracking-tight text-[#10292B] dark:text-foreground md:text-[1.16rem] lg:text-[1.22rem]">
              Budget posture
            </h3>
            <Button
              asChild
              variant="outline"
              size="sm"
              className="h-9 rounded-full bg-[#17393c] px-3.5 text-[0.8rem] font-medium text-white shadow-none hover:bg-[#1d4a4d] hover:text-white dark:bg-[#20474a] dark:text-white dark:hover:bg-[#28595c] dark:hover:text-white md:h-8 md:px-3.5 md:text-[0.79rem]"
            >
              <Link href="/budgets">{budgetPosture.action}</Link>
            </Button>
          </div>

          <div className="rounded-[1.1rem] border border-border/70 bg-background/70 p-4 md:flex md:items-center md:justify-between md:gap-4 md:p-5.5 dark:bg-[#141d1f]">
            <div className="flex items-center gap-3.5">
              <div className="flex size-11 items-center justify-center rounded-[0.95rem] bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200 md:size-11 md:rounded-[0.95rem]">
                <PiggyBank className="size-6 md:size-6" />
              </div>
              <div>
                <p className="text-[0.98rem] font-semibold tracking-tight text-[#10292B] dark:text-foreground md:text-[0.96rem]">
                  {budgetPosture.title}
                </p>
                <p className="mt-1 text-[0.88rem] leading-6 text-muted-foreground md:text-[0.86rem]">
                  {budgetPosture.body}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="fixed inset-x-4 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 md:hidden">
        <div className="grid grid-cols-3 gap-2 rounded-[1.75rem] border border-border/70 bg-white/94 p-2 shadow-[0_24px_50px_-38px_rgba(10,31,34,0.48)] backdrop-blur dark:bg-[#182123]/96">
          <Button
            asChild
            variant="ghost"
            className="h-12 flex-col gap-0.5 rounded-full border border-border/70 bg-background px-2 text-[0.72rem] font-medium shadow-none"
          >
            <Link href="/transactions">
              <Plus className="size-4" />
              Add transaction
            </Link>
          </Button>
          <Button
            asChild
            variant="ghost"
            className="h-12 flex-col gap-0.5 rounded-full border border-border/70 bg-background px-2 text-[0.72rem] font-medium shadow-none"
          >
            <Link href="/transactions">
              <ArrowRightLeft className="size-4" />
              Transfer
            </Link>
          </Button>
          <Button
            asChild
            variant="ghost"
            className="h-12 flex-col gap-0.5 rounded-full border border-border/70 bg-background px-2 text-[0.72rem] font-medium shadow-none"
          >
            <Link href="/budgets">
              <Wallet className="size-4" />
              Create budget
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
