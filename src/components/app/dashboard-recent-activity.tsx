"use client";

import { useMemo } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import { ArrowRightLeft, CreditCard, Landmark, Wallet } from "lucide-react";
import Link from "next/link";

import { formatCurrencyMiliunits } from "@/lib/currencies";
import type { AppRouter } from "@/server/api/root";
import { trpc } from "@/trpc/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type AccountItem = RouterOutputs["accounts"]["list"][number];
type TransactionItem = RouterOutputs["transactions"]["list"][number];

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

function getEventTypeLabel(type: TransactionItem["type"]) {
  switch (type) {
    case "income":
      return "Income";
    case "expense":
      return "Expense";
    case "transfer":
      return "Transfer";
    case "credit_payment":
      return "Credit payment";
    case "loan_disbursement":
      return "Loan disbursement";
    default:
      return type;
  }
}

function getEventBadgeClass(type: TransactionItem["type"]) {
  switch (type) {
    case "income":
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    case "expense":
      return "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-300";
    case "transfer":
      return "border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300";
    case "credit_payment":
      return "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300";
    case "loan_disbursement":
      return "border-violet-500/20 bg-violet-500/10 text-violet-700 dark:text-violet-300";
    default:
      return "border-border/70 bg-muted/70 text-foreground";
  }
}

function formatEventDate(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function getPrimaryAmount(event: TransactionItem) {
  switch (event.type) {
    case "income":
      return event.entries.find((entry) => entry.role === "primary")?.amountDelta ?? 0;
    case "expense":
      return Math.abs(event.entries.find((entry) => entry.role === "primary")?.amountDelta ?? 0);
    case "transfer":
      return Math.abs(event.entries.find((entry) => entry.role === "source")?.amountDelta ?? 0);
    case "credit_payment":
      return Math.abs(
        event.entries.find((entry) => entry.role === "payment_account")?.amountDelta ?? 0,
      );
    case "loan_disbursement":
      return Math.abs(
        event.entries.find((entry) => entry.role === "disbursement_account")?.amountDelta ?? 0,
      );
    default:
      return 0;
  }
}

function getEventAccountsSummary(event: TransactionItem) {
  switch (event.type) {
    case "income":
    case "expense": {
      const account = event.entries[0]?.account;
      return account ? `${account.name} · ${getAccountTypeLabel(account.type)}` : "Account missing";
    }
    case "transfer": {
      const source = event.entries.find((entry) => entry.role === "source")?.account;
      const destination = event.entries.find((entry) => entry.role === "destination")?.account;
      return source && destination ? `${source.name} → ${destination.name}` : "Transfer accounts missing";
    }
    case "credit_payment": {
      const source = event.entries.find((entry) => entry.role === "payment_account")?.account;
      const credit = event.entries.find((entry) => entry.role === "liability_account")?.account;
      return source && credit ? `${source.name} → ${credit.name}` : "Payment accounts missing";
    }
    case "loan_disbursement": {
      const loan = event.entries.find((entry) => entry.role === "loan_account")?.account;
      const destination = event.entries.find((entry) => entry.role === "disbursement_account")?.account;
      return loan && destination ? `${loan.name} → ${destination.name}` : "Disbursement accounts missing";
    }
    default:
      return "";
  }
}

function getAccountHeadline(account: AccountItem) {
  if (account.type === "credit") {
    const available = Math.max(account.creditLimit - account.balance, 0);
    return `Limit ${formatCurrencyMiliunits(account.creditLimit, account.currency)} · Avail ${formatCurrencyMiliunits(available, account.currency)}`;
  }

  if (account.type === "loan") {
    return "Borrowing tracked in the workspace";
  }

  return `${getAccountTypeLabel(account.type)} · ${account.currency}`;
}

export function DashboardRecentActivity() {
  const accountsQuery = trpc.accounts.list.useQuery();
  const transactionsQuery = trpc.transactions.list.useQuery();

  const recentEvents = useMemo(
    () => (transactionsQuery.data ?? []).slice(0, 3),
    [transactionsQuery.data],
  );

  const liquidAccounts = useMemo(
    () =>
      (accountsQuery.data ?? [])
        .filter((account) => account.type === "cash" || account.type === "wallet")
        .sort((left, right) => right.balance - left.balance)
        .slice(0, 3),
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

  if (accountsQuery.isLoading || transactionsQuery.isLoading) {
    return (
      <section className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
        <div className="h-[28rem] animate-pulse rounded-[2rem] border border-border/70 bg-white/78 dark:border-white/8 dark:bg-[#182123]" />
        <div className="h-[28rem] animate-pulse rounded-[2rem] border border-border/70 bg-white/78 dark:border-white/8 dark:bg-[#182123]" />
      </section>
    );
  }

  if (accountsQuery.error || transactionsQuery.error) {
    return (
      <Card className="border-destructive/20 bg-white/78 dark:border-destructive/25 dark:bg-[#182123]">
        <CardHeader>
          <CardTitle className="text-2xl tracking-tight">Couldn’t load dashboard activity</CardTitle>
          <CardDescription>
            The overview is connected, but the recent activity block could not read the latest
            accounts and transactions yet.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <section className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
      <Card className="self-start border-white/75 bg-white/78 shadow-[0_24px_90px_-55px_rgba(10,31,34,0.34)] dark:border-white/8 dark:bg-[#182123] dark:shadow-[0_24px_90px_-55px_rgba(0,0,0,0.62)]">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-2">
            <CardTitle className="text-2xl tracking-tight">Recent movement</CardTitle>
            <CardDescription>
              The last few events across income, spending, transfers, and payments.
            </CardDescription>
          </div>
          <Button asChild variant="outline" className="rounded-full">
            <Link href="/transactions">Open ledger</Link>
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {recentEvents.length === 0 ? (
            <div className="rounded-[1.7rem] border border-dashed border-border/70 bg-background/70 px-6 py-10 text-sm leading-7 text-muted-foreground dark:bg-[#12191b]">
              No money events have been recorded yet. Start with one income, expense, or transfer
              and the dashboard will begin to reflect your real activity.
            </div>
          ) : (
            recentEvents.map((event) => (
              <div
                key={event.id}
                className="flex flex-col gap-4 rounded-[1.7rem] border border-border/70 bg-background/72 px-5 py-4 dark:bg-[#12191b] sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-lg font-semibold tracking-tight">{event.description}</p>
                    <Badge className={`rounded-full border px-2.5 py-0.5 text-xs ${getEventBadgeClass(event.type)}`}>
                      {getEventTypeLabel(event.type)}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{getEventAccountsSummary(event)}</p>
                  <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground/80">
                    {formatEventDate(event.occurredAt)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-semibold tracking-tight">
                    {formatCurrencyMiliunits(getPrimaryAmount(event), event.currency)}
                  </p>
                  {event.feeAmount > 0 ? (
                    <p className="mt-1 text-sm text-muted-foreground">
                      Fee {formatCurrencyMiliunits(event.feeAmount, event.currency)}
                    </p>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6">
        <Card className="border-white/75 bg-white/78 shadow-[0_24px_90px_-55px_rgba(10,31,34,0.34)] dark:border-white/8 dark:bg-[#182123] dark:shadow-[0_24px_90px_-55px_rgba(0,0,0,0.62)]">
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div className="space-y-2">
              <CardTitle className="text-2xl tracking-tight">Accounts worth checking</CardTitle>
              <CardDescription>
                The balances carrying the most weight in your workspace right now.
              </CardDescription>
            </div>
            <Button asChild variant="outline" className="rounded-full">
              <Link href="/accounts">Open accounts</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Landmark className="size-4" />
                Liquid positions
              </div>
              {liquidAccounts.length === 0 ? (
                <div className="rounded-[1.5rem] border border-dashed border-border/70 bg-background/70 px-4 py-5 text-sm text-muted-foreground dark:bg-[#12191b]">
                  Add a bank or wallet account to start seeing liquid balances here.
                </div>
              ) : (
                liquidAccounts.map((account) => (
                  <div
                    key={account.id}
                    className="flex items-center justify-between rounded-[1.5rem] border border-border/70 bg-background/72 px-4 py-4 dark:bg-[#12191b]"
                  >
                    <div className="space-y-1">
                      <p className="font-medium tracking-tight">{account.name}</p>
                      <p className="text-sm text-muted-foreground">{getAccountHeadline(account)}</p>
                    </div>
                    <p className="text-lg font-semibold tracking-tight">
                      {formatCurrencyMiliunits(account.balance, account.currency)}
                    </p>
                  </div>
                ))
              )}
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <CreditCard className="size-4" />
                Liabilities
              </div>
              {liabilityAccounts.length === 0 ? (
                <div className="rounded-[1.5rem] border border-dashed border-border/70 bg-background/70 px-4 py-5 text-sm text-muted-foreground dark:bg-[#12191b]">
                  Add credit or loan accounts to keep debt positions visible here.
                </div>
              ) : (
                liabilityAccounts.map((account) => (
                  <div
                    key={account.id}
                    className="flex items-center justify-between rounded-[1.5rem] border border-border/70 bg-background/72 px-4 py-4 dark:bg-[#12191b]"
                  >
                    <div className="space-y-1">
                      <p className="font-medium tracking-tight">{account.name}</p>
                      <p className="text-sm text-muted-foreground">{getAccountHeadline(account)}</p>
                    </div>
                    <p className="text-lg font-semibold tracking-tight">
                      {formatCurrencyMiliunits(account.balance, account.currency)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-white/75 bg-[linear-gradient(145deg,rgba(18,50,52,0.98),rgba(27,73,76,0.95))] text-white shadow-[0_32px_90px_-65px_rgba(10,31,34,0.85)]">
          <CardHeader className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-white/72">
              <Wallet className="size-4" />
              Calm posture
            </div>
            <CardTitle className="text-2xl tracking-tight">
              Keep the dashboard quiet. Let the ledger do the talking.
            </CardTitle>
            <CardDescription className="text-sm leading-7 text-white/72">
              Veyra’s home screen is meant to orient you quickly, then get out of the way. The
              deeper accounting detail lives inside Accounts and Transactions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3">
              {[
                "Recent movement is visible without turning the page into a market terminal.",
                "The most material accounts stay close so cash and liabilities are easy to scan.",
                "Cross-currency totals stay avoided until we can model them more truthfully.",
              ].map((item) => (
                <div
                  key={item}
                  className="rounded-2xl border border-white/12 bg-white/6 px-4 py-3 text-sm leading-6 text-white/78"
                >
                  {item}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
