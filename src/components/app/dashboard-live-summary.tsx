"use client";

import { CreditCard, Globe2, Landmark } from "lucide-react";

import { trpc } from "@/trpc/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const summaryConfig = [
  {
    key: "totalAccounts",
    label: "Accounts tracked",
    helper: "Live count from your Veyra workspace",
    icon: Landmark,
  },
  {
    key: "liabilityAccounts",
    label: "Liabilities",
    helper: "Credit cards and loans currently tracked",
    icon: CreditCard,
  },
  {
    key: "activeCurrencies",
    label: "Currencies in use",
    helper: "Balances stay native to each account currency",
    icon: Globe2,
  },
] as const;

export function DashboardLiveSummary() {
  const summaryQuery = trpc.accounts.summary.useQuery();

  if (summaryQuery.isLoading) {
    return (
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="h-36 animate-pulse rounded-[1.7rem] border border-border/70 bg-white/78 dark:bg-[#182123]"
          />
        ))}
      </section>
    );
  }

  if (summaryQuery.error || !summaryQuery.data) {
    return (
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card className="border-destructive/20 bg-white/78 dark:bg-[#182123] md:col-span-2 xl:col-span-3">
          <CardHeader>
            <CardTitle className="text-xl tracking-tight">Couldn’t load live summary</CardTitle>
            <CardDescription>
              The accounts summary procedure is wired, but this dashboard section could not read it yet.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>
    );
  }

  const summary = summaryQuery.data;

  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {summaryConfig.map((card) => {
        const Icon = card.icon;
        const displayValue = String(summary[card.key]);

        return (
          <Card
            key={card.key}
            className="border-white/75 bg-white/78 shadow-[0_20px_70px_-55px_rgba(10,31,34,0.35)] dark:border-white/8 dark:bg-[#182123] dark:shadow-[0_24px_70px_-50px_rgba(0,0,0,0.6)]"
          >
            <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
              <div className="space-y-1">
                <CardDescription>{card.label}</CardDescription>
                <CardTitle className="text-3xl tracking-tight">{displayValue}</CardTitle>
              </div>
              <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Icon className="size-5" />
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
