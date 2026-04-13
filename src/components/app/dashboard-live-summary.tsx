"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRightLeft, CreditCard, Landmark, PiggyBank, ReceiptText } from "lucide-react";

import { trpc } from "@/trpc/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const summaryConfig = [
  {
    key: "liquidAccounts",
    label: "Liquid accounts",
    helper: "Bank and wallet accounts currently available for day-to-day use",
    icon: Landmark,
  },
  {
    key: "liabilityAccounts",
    label: "Liabilities",
    helper: "Credit and loan accounts that should stay visible in regular review",
    icon: CreditCard,
  },
  {
    key: "totalEvents",
    label: "Events recorded",
    helper: "Income, spending, transfers, payments, and disbursements in the ledger",
    icon: ReceiptText,
  },
  {
    key: "internalMovement",
    label: "Internal movement",
    helper: "Transfers and card payments moving value between your own accounts",
    icon: ArrowRightLeft,
  },
  {
    key: "budgetsNeedingAttention",
    label: "Budgets needing review",
    helper: "Active parent budgets currently in warning, danger, or exceeded territory",
    icon: PiggyBank,
  },
] as const;

export function DashboardLiveSummary() {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const accountsSummaryQuery = trpc.accounts.summary.useQuery();
  const transactionsSummaryQuery = trpc.transactions.summary.useQuery();
  const budgetsSummaryQuery = trpc.budgets.summary.useQuery();

  useEffect(() => {
    if (!scrollerRef.current) return;

    function handleScroll() {
      const node = scrollerRef.current;
      if (!node) return;

      const cards = Array.from(node.querySelectorAll<HTMLElement>("[data-summary-slide]"));
      if (cards.length === 0) return;

      const scrollerCenter = node.scrollLeft + node.clientWidth / 2;
      let closestIndex = 0;
      let closestDistance = Number.POSITIVE_INFINITY;

      cards.forEach((card, index) => {
        const cardCenter = card.offsetLeft + card.offsetWidth / 2;
        const distance = Math.abs(cardCenter - scrollerCenter);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestIndex = index;
        }
      });

      setActiveIndex(closestIndex);
    }

    handleScroll();
    const node = scrollerRef.current;
    if (!node) return;
    node.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      node.removeEventListener("scroll", handleScroll);
    };
  }, []);

  if (accountsSummaryQuery.isLoading || transactionsSummaryQuery.isLoading || budgetsSummaryQuery.isLoading) {
    return (
      <>
        <section className="md:hidden">
          <div className="h-40 animate-pulse rounded-[1.7rem] border border-border/70 bg-white/78 dark:border-white/8 dark:bg-[#182123]" />
        </section>
        <section className="hidden gap-4 md:grid md:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className="h-32 animate-pulse rounded-[1.7rem] border border-border/70 bg-white/78 dark:border-white/8 dark:bg-[#182123]"
            />
          ))}
        </section>
      </>
    );
  }

  if (
    accountsSummaryQuery.error ||
    transactionsSummaryQuery.error ||
    budgetsSummaryQuery.error ||
    !accountsSummaryQuery.data ||
    !transactionsSummaryQuery.data ||
    !budgetsSummaryQuery.data
  ) {
    return (
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card className="border-destructive/20 bg-white/78 dark:bg-[#182123] md:col-span-2 xl:col-span-5">
          <CardHeader>
            <CardTitle className="text-xl tracking-tight">Couldn’t load live summary</CardTitle>
            <CardDescription>
              The latest account and transaction totals are not available right now.
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
    budgetsNeedingAttention:
      budgetsSummaryQuery.data.summary.warningBudgets +
      budgetsSummaryQuery.data.summary.dangerBudgets +
      budgetsSummaryQuery.data.summary.exceededBudgets,
  };

  function scrollToCard(index: number) {
    const node = scrollerRef.current;
    if (!node) return;

    const nextIndex = Math.max(0, Math.min(index, summaryConfig.length - 1));
    const cards = Array.from(node.querySelectorAll<HTMLElement>("[data-summary-slide]"));
    const nextCard = cards[nextIndex];
    if (!nextCard) return;

    nextCard.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
    setActiveIndex(nextIndex);
  }

  function renderSummaryCard(card: (typeof summaryConfig)[number]) {
    const Icon = card.icon;
    const displayValue = String(summary[card.key]);

    return (
      <Card
        key={card.key}
        className="h-full border-white/75 bg-white/80 shadow-[0_20px_70px_-55px_rgba(10,31,34,0.35)] dark:border-white/8 dark:bg-[#182123] dark:shadow-[0_24px_70px_-50px_rgba(0,0,0,0.6)]"
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
  }

  return (
    <>
      <section className="space-y-3 md:hidden">
        <div
          ref={scrollerRef}
          className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {summaryConfig.map((card) => (
            <div key={card.key} data-summary-slide className="min-w-0 shrink-0 basis-full snap-center">
              {renderSummaryCard(card)}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {summaryConfig.map((card, index) => (
              <button
                key={card.key}
                type="button"
                aria-label={`Show ${card.label}`}
                onClick={() => scrollToCard(index)}
                className={[
                  "h-2.5 rounded-full transition-all",
                  index === activeIndex ? "w-6 bg-primary" : "w-2.5 bg-border",
                ].join(" ")}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Previous summary"
              onClick={() => scrollToCard(activeIndex - 1)}
              className="flex size-9 items-center justify-center rounded-full border border-border bg-white text-foreground shadow-sm dark:bg-[#182123]"
            >
              <span className="text-lg leading-none">‹</span>
            </button>
            <button
              type="button"
              aria-label="Next summary"
              onClick={() => scrollToCard(activeIndex + 1)}
              className="flex size-9 items-center justify-center rounded-full border border-border bg-white text-foreground shadow-sm dark:bg-[#182123]"
            >
              <span className="text-lg leading-none">›</span>
            </button>
          </div>
        </div>
      </section>

      <section className="hidden gap-4 md:grid md:grid-cols-2 xl:grid-cols-5">
        {summaryConfig.map((card) => renderSummaryCard(card))}
      </section>
    </>
  );
}
