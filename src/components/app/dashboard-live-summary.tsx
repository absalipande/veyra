"use client";

import { ArrowRightLeft, CreditCard, Globe2, Landmark, ReceiptText } from "lucide-react";

import { trpc } from "@/trpc/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const summaryConfig = [
  {
    key: "liquidAccounts",
    label: "Liquid accounts",
    helper: "Bank and wallet balances kept ready for day-to-day cash flow",
    icon: Landmark,
  },
  {
    key: "liabilityAccounts",
    label: "Liabilities",
    helper: "Credit cards and loans being monitored in the workspace",
    icon: CreditCard,
  },
  {
    key: "totalEvents",
    label: "Events logged",
    helper: "Money movements recorded across income, spending, transfers, and payments",
    icon: ReceiptText,
  },
  {
    key: "internalMovement",
    label: "Internal movement",
    helper: "Transfers and credit payments already flowing through the ledger",
    icon: ArrowRightLeft,
  },
  {
    key: "activeCurrencies",
    label: "Currencies in use",
    helper: "Balances stay native to each account currency without forced rollups",
    icon: Globe2,
  },
] as const;

export function DashboardLiveSummary() {
  const accountsSummaryQuery = trpc.accounts.summary.useQuery();
  const transactionsSummaryQuery = trpc.transactions.summary.useQuery();

  if (accountsSummaryQuery.isLoading || transactionsSummaryQuery.isLoading) {
    return (
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="h-32 animate-pulse rounded-[1.7rem] border border-border/70 bg-white/78 dark:border-white/8 dark:bg-[#182123]"
          />
        ))}
      </section>
    );
  }

  if (
    accountsSummaryQuery.error ||
    transactionsSummaryQuery.error ||
    !accountsSummaryQuery.data ||
    !transactionsSummaryQuery.data
  ) {
    return (
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card className="border-destructive/20 bg-white/78 dark:bg-[#182123] md:col-span-2 xl:col-span-5">
          <CardHeader>
            <CardTitle className="text-xl tracking-tight">Couldn’t load live summary</CardTitle>
            <CardDescription>
              The dashboard is connected to live procedures, but this summary strip could not read
              the latest data yet.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>
    );
  }

  const summary = {
    liquidAccounts: accountsSummaryQuery.data.liquidAccounts,
    liabilityAccounts: accountsSummaryQuery.data.liabilityAccounts,
    totalEvents: transactionsSummaryQuery.data.totalEvents,
    internalMovement:
      transactionsSummaryQuery.data.transferEvents + transactionsSummaryQuery.data.creditPaymentEvents,
    activeCurrencies: accountsSummaryQuery.data.activeCurrencies,
  };

  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      {summaryConfig.map((card) => {
        const Icon = card.icon;
        const displayValue = String(summary[card.key]);

        return (
          <Card
            key={card.key}
            className="border-white/75 bg-white/78 shadow-[0_20px_70px_-55px_rgba(10,31,34,0.35)] dark:border-white/8 dark:bg-[#182123] dark:shadow-[0_24px_70px_-50px_rgba(0,0,0,0.6)]"
          >
            <CardHeader className="flex flex-row items-start justify-between gap-4 pb-2">
              <div className="space-y-1">
                <CardDescription className="text-[0.72rem] uppercase tracking-[0.28em]">
                  {card.label}
                </CardDescription>
                <CardTitle className="text-[2rem] tracking-tight">{displayValue}</CardTitle>
              </div>
              <div className="flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Icon className="size-4.5" />
              </div>
            </CardHeader>
            <CardContent className="pt-0 text-sm leading-6 text-muted-foreground">
              {card.helper}
            </CardContent>
          </Card>
        );
      })}
    </section>
  );
}
