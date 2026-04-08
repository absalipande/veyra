"use client";

import { useMemo } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import { Clock3, CreditCard, Landmark, Layers3, Wallet } from "lucide-react";
import Link from "next/link";

import { formatCurrencyMiliunits } from "@/lib/currencies";
import type { AppRouter } from "@/server/api/root";
import { trpc } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type AccountItem = RouterOutputs["accounts"]["list"][number];

function getAccountTypeLabel(type: AccountItem["type"]) {
  switch (type) {
    case "cash":
      return "Bank";
    case "wallet":
      return "Wallet";
    case "credit":
      return "Credit";
    case "loan":
      return "Loan";
    default:
      return type;
  }
}

function formatActivityDate(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;

  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function getAccountHeadline(account: AccountItem) {
  if (account.type === "credit") {
    const available = Math.max(account.creditLimit - account.balance, 0);
    return `Limit ${formatCurrencyMiliunits(account.creditLimit, account.currency)} · Available ${formatCurrencyMiliunits(available, account.currency)}`;
  }

  if (account.type === "loan") {
    return `${getAccountTypeLabel(account.type)} · ${account.currency}`;
  }

  return `${getAccountTypeLabel(account.type)} · Ready to use`;
}

export function DashboardRecentActivity() {
  const accountsQuery = trpc.accounts.list.useQuery();
  const transactionsQuery = trpc.transactions.list.useQuery();

  const liquidAccounts = useMemo(
    () =>
      (accountsQuery.data ?? [])
        .filter((account) => account.type === "cash" || account.type === "wallet")
        .sort((left, right) => right.balance - left.balance)
        .slice(0, 4),
    [accountsQuery.data],
  );

  const liabilityAccounts = useMemo(
    () =>
      (accountsQuery.data ?? [])
        .filter((account) => account.type === "credit" || account.type === "loan")
        .sort((left, right) => right.balance - left.balance)
        .slice(0, 3),
    [accountsQuery.data],
  );

  const workspaceSignals = useMemo(() => {
    const accounts = accountsQuery.data ?? [];
    const transactions = transactionsQuery.data ?? [];
    const latestEvent = transactions[0] ?? null;
    const currencies = Array.from(new Set(accounts.map((account) => account.currency))).sort();
    const largestLiquid = liquidAccounts[0] ?? null;
    const largestLiability = liabilityAccounts[0] ?? null;

    return [
      {
        icon: Clock3,
        label: "Latest activity",
        value: latestEvent ? formatActivityDate(latestEvent.occurredAt) : "No activity yet",
        detail: latestEvent ? latestEvent.description : "Record your first event in transactions",
      },
      {
        icon: Wallet,
        label: "Largest liquid account",
        value: largestLiquid ? largestLiquid.name : "No liquid account yet",
        detail: largestLiquid
          ? formatCurrencyMiliunits(largestLiquid.balance, largestLiquid.currency)
          : "Add a bank or wallet account",
      },
      {
        icon: CreditCard,
        label: "Largest liability",
        value: largestLiability ? largestLiability.name : "No liability account yet",
        detail: largestLiability
          ? formatCurrencyMiliunits(largestLiability.balance, largestLiability.currency)
          : "Add a credit or loan account if needed",
      },
      {
        icon: Layers3,
        label: "Currencies in use",
        value: currencies.length > 0 ? `${currencies.length}` : "0",
        detail: currencies.length > 0 ? currencies.join(" · ") : "No accounts added yet",
      },
    ];
  }, [accountsQuery.data, transactionsQuery.data, liquidAccounts, liabilityAccounts]);

  if (accountsQuery.isLoading || transactionsQuery.isLoading) {
    return (
      <section className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.08fr)_minmax(320px,0.92fr)]">
        <div className="h-[26rem] animate-pulse rounded-[2rem] border border-border/70 bg-white/78 dark:border-white/8 dark:bg-[#182123]" />
        <div className="h-[26rem] animate-pulse rounded-[2rem] border border-border/70 bg-white/78 dark:border-white/8 dark:bg-[#182123]" />
      </section>
    );
  }

  if (accountsQuery.error || transactionsQuery.error) {
    return (
      <Card className="border-destructive/20 bg-white/78 dark:border-destructive/25 dark:bg-[#182123]">
        <CardHeader>
          <CardTitle className="text-2xl tracking-tight">Couldn’t load dashboard details</CardTitle>
          <CardDescription>
            The latest account positions and workspace signals are not available right now.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <section className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.08fr)_minmax(320px,0.92fr)]">
      <Card className="border-white/75 bg-white/78 shadow-[0_24px_90px_-55px_rgba(10,31,34,0.34)] dark:border-white/8 dark:bg-[#182123] dark:shadow-[0_24px_90px_-55px_rgba(0,0,0,0.62)]">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-2">
            <CardTitle className="text-[1.6rem] tracking-tight">Balances worth checking</CardTitle>
            <CardDescription>
              The accounts carrying the most weight in your workspace right now.
            </CardDescription>
          </div>
          <Button asChild size="sm" variant="outline" className="rounded-full">
            <Link href="/accounts">Open accounts</Link>
          </Button>
        </CardHeader>
        <CardContent className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-[0.95rem] font-medium text-muted-foreground">
              <Landmark className="size-4" />
              Liquid positions
            </div>
            {liquidAccounts.length === 0 ? (
              <div className="rounded-[1.5rem] border border-dashed border-border/70 bg-background/70 px-4 py-5 text-sm text-muted-foreground dark:bg-[#12191b]">
                Add a bank or wallet account to surface available balances here.
              </div>
            ) : (
              liquidAccounts.map((account) => (
                <div
                  key={account.id}
                  className="flex items-center justify-between gap-4 rounded-[1.5rem] border border-border/70 bg-background/72 px-4 py-4 dark:bg-[#12191b]"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-[1.05rem] font-medium tracking-tight">{account.name}</p>
                    <p className="text-sm text-muted-foreground">{getAccountHeadline(account)}</p>
                  </div>
                  <p className="shrink-0 text-[1.05rem] font-semibold tracking-tight">
                    {formatCurrencyMiliunits(account.balance, account.currency)}
                  </p>
                </div>
              ))
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2 text-[0.95rem] font-medium text-muted-foreground">
              <CreditCard className="size-4" />
              Liabilities
            </div>
            {liabilityAccounts.length === 0 ? (
              <div className="rounded-[1.5rem] border border-dashed border-border/70 bg-background/70 px-4 py-5 text-sm text-muted-foreground dark:bg-[#12191b]">
                Add credit or loan accounts to keep liabilities visible here.
              </div>
            ) : (
              liabilityAccounts.map((account) => (
                <div
                  key={account.id}
                  className="flex items-center justify-between gap-4 rounded-[1.5rem] border border-border/70 bg-background/72 px-4 py-4 dark:bg-[#12191b]"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-[1.05rem] font-medium tracking-tight">{account.name}</p>
                    <p className="text-sm text-muted-foreground">{getAccountHeadline(account)}</p>
                  </div>
                  <p className="shrink-0 text-[1.05rem] font-semibold tracking-tight">
                    {formatCurrencyMiliunits(account.balance, account.currency)}
                  </p>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-white/75 bg-white/78 shadow-[0_24px_90px_-55px_rgba(10,31,34,0.34)] dark:border-white/8 dark:bg-[#182123] dark:shadow-[0_24px_90px_-55px_rgba(0,0,0,0.62)]">
        <CardHeader className="space-y-2">
          <CardTitle className="text-[1.6rem] tracking-tight">What stands out</CardTitle>
          <CardDescription>
            A few useful markers from the workspace at this moment.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {workspaceSignals.map((signal) => {
            const Icon = signal.icon;

            return (
              <div
                key={signal.label}
                className="rounded-[1.5rem] border border-border/70 bg-background/72 px-4 py-4 dark:bg-[#12191b]"
              >
                <div className="flex items-center gap-2 text-[0.95rem] font-medium text-muted-foreground">
                  <Icon className="size-4" />
                  {signal.label}
                </div>
                <p className="mt-2 text-[1.05rem] font-semibold tracking-tight">{signal.value}</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{signal.detail}</p>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </section>
  );
}
