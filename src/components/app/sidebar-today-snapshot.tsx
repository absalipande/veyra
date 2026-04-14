"use client";

import { AlertTriangle, Landmark, ReceiptText } from "lucide-react";

import { trpc } from "@/trpc/react";

export function SidebarTodaySnapshot() {
  const accountsSummaryQuery = trpc.accounts.summary.useQuery();
  const transactionsSummaryQuery = trpc.transactions.summary.useQuery();
  const budgetsSummaryQuery = trpc.budgets.summary.useQuery();

  const loading =
    accountsSummaryQuery.isLoading ||
    transactionsSummaryQuery.isLoading ||
    budgetsSummaryQuery.isLoading;

  const budgetsAtRisk =
    (budgetsSummaryQuery.data?.summary.warningBudgets ?? 0) +
    (budgetsSummaryQuery.data?.summary.dangerBudgets ?? 0) +
    (budgetsSummaryQuery.data?.summary.exceededBudgets ?? 0);

  const rows = [
    {
      icon: Landmark,
      label: "Liquid accounts",
      value: accountsSummaryQuery.data?.liquidAccounts ?? 0,
      tone: "neutral",
    },
    {
      icon: ReceiptText,
      label: "Events logged",
      value: transactionsSummaryQuery.data?.totalEvents ?? 0,
      tone: "neutral",
    },
    {
      icon: AlertTriangle,
      label: "Budgets at risk",
      value: budgetsAtRisk,
      tone: "danger",
    },
  ];

  return (
    <div className="mt-auto rounded-[1.5rem] bg-[linear-gradient(150deg,rgba(16,46,49,0.96),rgba(25,66,69,0.94))] p-5 text-white shadow-[0_20px_70px_-58px_rgba(10,31,34,0.72)]">
      <p className="text-xs tracking-[0.18em] text-white/60">Today snapshot</p>

      <div className="mt-4 space-y-3">
        {rows.map((row) => {
          const Icon = row.icon;
          const isDanger = row.tone === "danger";

          return (
            <div
              key={row.label}
              className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2.5"
            >
              <div className="flex items-center gap-2">
                <Icon className={`size-4 ${isDanger ? "text-amber-300" : "text-white/70"}`} />
                <p className="text-sm text-white/60">{row.label}</p>
              </div>

              <p
                className={`text-lg font-semibold tracking-tight ${
                  isDanger ? "text-amber-200" : "text-white"
                }`}
              >
                {loading ? "…" : row.value}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
