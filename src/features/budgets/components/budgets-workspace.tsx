"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  PiggyBank,
  Search,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { formatCurrencyMiliunits } from "@/lib/currencies";
import {
  formatDateWithPreferences,
  resolveDatePreferences,
} from "@/features/settings/lib/date-format";
import type { AppRouter } from "@/server/api/root";
import { trpc } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type BudgetSummaryItem = RouterOutputs["budgets"]["summary"]["budgets"][number];
type BudgetRecord = RouterOutputs["budgets"]["list"][number];
type BudgetPeriod = BudgetRecord["period"];
type BudgetStatus = BudgetSummaryItem["status"];

type BudgetDraft = {
  amount: string;
  isActive: boolean;
  name: string;
  parentBudgetId: string;
  period: BudgetPeriod;
  salaryDatePrimary: string;
  salaryDateSecondary: string;
  startDate: string;
};

type DeleteTarget = {
  id: string;
  name: string;
} | null;

const emptyBudgets: BudgetRecord[] = [];
const emptyBudgetSummaries: BudgetSummaryItem[] = [];
const budgetCurrency = "PHP";

function formatBudgetMoney(value: number) {
  return formatCurrencyMiliunits(value, budgetCurrency);
}

const periodOptions: Array<{ value: BudgetPeriod; label: string; description: string }> = [
  {
    value: "monthly",
    label: "Monthly",
    description: "Best for rent, subscriptions, and broad household allocations.",
  },
  {
    value: "bi-weekly",
    label: "Bi-weekly",
    description: "Tracks salary-cycle budgets using two payday anchors each month.",
  },
  {
    value: "weekly",
    label: "Weekly",
    description: "Useful for groceries, transport, and short operating budgets.",
  },
  {
    value: "daily",
    label: "Daily",
    description: "A strict daily cap for highly controlled categories.",
  },
];

const initialDraft: BudgetDraft = {
  amount: "",
  isActive: true,
  name: "",
  parentBudgetId: "none",
  period: "monthly",
  salaryDatePrimary: "",
  salaryDateSecondary: "",
  startDate: new Date().toISOString().slice(0, 10),
};

function parseMoneyToMiliunits(value: string) {
  const normalized = value.trim().replace(/,/g, "");
  if (!normalized) return null;

  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  return Math.round(amount * 1000);
}

function formatMoneyInput(miliunits: number) {
  return String(miliunits / 1000);
}

function getStatusTone(status: BudgetStatus) {
  switch (status) {
    case "safe":
      return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300";
    case "warning":
      return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-300";
    case "danger":
      return "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/70 dark:bg-orange-950/40 dark:text-orange-300";
    case "exceeded":
      return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-300";
    default:
      return "border-border bg-muted text-foreground";
  }
}

function getStatusLabel(status: BudgetStatus) {
  switch (status) {
    case "safe":
      return "On track";
    case "warning":
      return "Watch";
    case "danger":
      return "Tight";
    case "exceeded":
      return "Exceeded";
    default:
      return status;
  }
}

function getStatusIcon(status: BudgetStatus) {
  switch (status) {
    case "safe":
      return CheckCircle2;
    case "warning":
      return CalendarClock;
    case "danger":
      return AlertTriangle;
    case "exceeded":
      return ShieldAlert;
    default:
      return PiggyBank;
  }
}

function getPeriodLabel(period: BudgetPeriod) {
  return periodOptions.find((option) => option.value === period)?.label ?? period;
}

function getProgressWidth(percentageUsed: number) {
  return `${Math.min(100, Math.max(0, percentageUsed))}%`;
}

function findBudgetSummary(summaries: BudgetSummaryItem[], id: string | null | undefined) {
  if (!id) return null;
  return summaries.find((budget) => budget.id === id) ?? null;
}

export function BudgetsWorkspace({ initialQuery = "" }: { initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [open, setOpen] = useState(false);
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [draft, setDraft] = useState<BudgetDraft>(initialDraft);
  const [formError, setFormError] = useState<string | null>(null);
  const summaryScrollerRef = useRef<HTMLDivElement | null>(null);
  const [activeSummaryIndex, setActiveSummaryIndex] = useState(0);

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  const utils = trpc.useUtils();
  const budgetsQuery = trpc.budgets.list.useQuery();
  const summaryQuery = trpc.budgets.summary.useQuery();
  const settingsQuery = trpc.settings.get.useQuery();
  const datePreferences = resolveDatePreferences(settingsQuery.data);
  const formatDate = (value: Date | string) =>
    formatDateWithPreferences(value, datePreferences, "date");

  const budgets = budgetsQuery.data ?? emptyBudgets;
  const summary = summaryQuery.data;
  const summaryBudgets = summary?.budgets ?? emptyBudgetSummaries;
  const budgetSummary = summary?.summary;

  const parentBudgetOptions = useMemo(
    () =>
      budgets
        .filter((budget) => budget.id !== editingBudgetId)
        .map((budget) => ({
          id: budget.id,
          name: budget.name,
        })),
    [budgets, editingBudgetId],
  );

  const filteredBudgets = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return summaryBudgets;

    return summaryBudgets.filter((budget) => {
      const parent = findBudgetSummary(summaryBudgets, budget.parentBudgetId);

      return [budget.name, getPeriodLabel(budget.period), parent?.name ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(normalized);
    });
  }, [query, summaryBudgets]);

  const activeRootBudgets = useMemo(
    () => filteredBudgets.filter((budget) => !budget.parentBudgetId && budget.isActive),
    [filteredBudgets],
  );

  const createBudget = trpc.budgets.create.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.budgets.list.invalidate(), utils.budgets.summary.invalidate()]);
      toast.success("Budget created.");
      setOpen(false);
      setDraft(initialDraft);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create budget.");
    },
  });

  const updateBudget = trpc.budgets.update.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.budgets.list.invalidate(), utils.budgets.summary.invalidate()]);
      toast.success("Budget updated.");
      setOpen(false);
      setEditingBudgetId(null);
      setDraft(initialDraft);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update budget.");
    },
  });

  const removeBudget = trpc.budgets.remove.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.budgets.list.invalidate(), utils.budgets.summary.invalidate()]);
      toast.success("Budget deleted.");
      setDeleteTarget(null);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete budget.");
    },
  });

  function resetDialog() {
    setOpen(false);
    setEditingBudgetId(null);
    setDraft(initialDraft);
    setFormError(null);
  }

  function startCreate() {
    setEditingBudgetId(null);
    setDraft(initialDraft);
    setFormError(null);
    setOpen(true);
  }

  function startEdit(budget: BudgetRecord) {
    setEditingBudgetId(budget.id);
    setDraft({
      amount: formatMoneyInput(budget.amount),
      isActive: budget.isActive,
      name: budget.name,
      parentBudgetId: budget.parentBudgetId ?? "none",
      period: budget.period,
      salaryDatePrimary: budget.salaryDates?.[0] ?? "",
      salaryDateSecondary: budget.salaryDates?.[1] ?? "",
      startDate: new Date(budget.startDate).toISOString().slice(0, 10),
    });
    setFormError(null);
    setOpen(true);
  }

  function submitBudget() {
    const trimmedName = draft.name.trim();
    const amount = parseMoneyToMiliunits(draft.amount);
    if (trimmedName.length < 2) {
      const message = "Enter a budget name with at least 2 characters.";
      setFormError(message);
      toast.error(message);
      return;
    }

    if (!amount) {
      const message = "Enter a valid budget amount.";
      setFormError(message);
      toast.error(message);
      return;
    }

    if (draft.period === "bi-weekly") {
      const first = draft.salaryDatePrimary.trim();
      const second = draft.salaryDateSecondary.trim();

      if (!/^\d{1,2}$/.test(first) || !/^\d{1,2}$/.test(second)) {
        const message = "Bi-weekly budgets need two valid salary dates.";
        setFormError(message);
        toast.error(message);
        return;
      }
    }

    setFormError(null);

    const selectedParent =
      draft.parentBudgetId === "none"
        ? null
        : (budgets.find((budget) => budget.id === draft.parentBudgetId) ?? null);

    if (selectedParent) {
      toast.message(`This will be created under "${selectedParent.name}".`);
    }

    const payload = {
      amount,
      isActive: draft.isActive,
      name: trimmedName,
      parentBudgetId: draft.parentBudgetId === "none" ? undefined : draft.parentBudgetId,
      period: draft.period,
      salaryDates:
        draft.period === "bi-weekly"
          ? [draft.salaryDatePrimary.trim(), draft.salaryDateSecondary.trim()]
          : undefined,
      startDate: draft.startDate,
    } as const;

    if (editingBudgetId) {
      updateBudget.mutate({
        id: editingBudgetId,
        ...payload,
      });
      return;
    }

    createBudget.mutate(payload);
  }

  const isSubmitting = createBudget.isPending || updateBudget.isPending;
  const totalTracked = budgetSummary?.totalBudgets ?? 0;
  const totalRemaining = budgetSummary?.totalRemaining ?? 0;
  const totalSpent = budgetSummary?.totalSpentAmount ?? 0;
  const totalBudgetAmount = budgetSummary?.totalBudgetAmount ?? 0;
  const attentionCount =
    (budgetSummary?.warningBudgets ?? 0) +
    (budgetSummary?.dangerBudgets ?? 0) +
    (budgetSummary?.exceededBudgets ?? 0);
  const summaryCards = [
    {
      label: "Active budgets",
      value: String(totalTracked),
      detail: "Budget windows currently live in your workspace.",
    },
    {
      label: "Remaining to use",
      value: formatBudgetMoney(totalRemaining),
      detail: "Remaining across parent budget windows this cycle.",
    },
    {
      label: "Spent this cycle",
      value: formatBudgetMoney(totalSpent),
      detail: "Tracked from expense events already tied to budgets.",
    },
    {
      label: "Needs attention",
      value: String(attentionCount),
      detail: "Budgets currently in warning, danger, or exceeded territory.",
    },
  ];

  useEffect(() => {
    if (!summaryScrollerRef.current) return;

    const handleScroll = () => {
      const scroller = summaryScrollerRef.current;
      if (!scroller) return;

      const cards = Array.from(scroller.querySelectorAll<HTMLElement>("[data-summary-slide]"));
      if (cards.length === 0) return;

      const scrollerCenter = scroller.scrollLeft + scroller.clientWidth / 2;
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

      setActiveSummaryIndex(closestIndex);
    };

    handleScroll();
    const scroller = summaryScrollerRef.current;
    if (!scroller) return;
    scroller.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      scroller.removeEventListener("scroll", handleScroll);
    };
  }, [summaryCards.length]);

  const scrollSummaryCards = (index: number) => {
    const scroller = summaryScrollerRef.current;
    if (!scroller) return;

    const cards = Array.from(scroller.querySelectorAll<HTMLElement>("[data-summary-slide]"));
    const nextCard = cards[index];
    if (!nextCard) return;

    nextCard.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  };

  return (
    <div className="space-y-6">
      <section>
        <Card className="rounded-[1.5rem] border-white/10 bg-[linear-gradient(145deg,rgba(16,41,43,0.98),rgba(29,78,77,0.94))] text-white shadow-[0_26px_80px_-52px_rgba(10,31,34,0.62)]">
          <CardContent className="space-y-4 p-4 sm:p-5 md:space-y-4 md:p-6 lg:p-7.5">
            <div className="flex items-start justify-between gap-4">
              <p className="text-[0.84rem] font-medium tracking-[0.01em] text-white/72 md:text-[0.88rem]">
                Today · {formatDateWithPreferences(new Date(), datePreferences, "date")}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-full border-white/24 bg-white/[0.08] px-3 text-[0.76rem] font-medium text-white shadow-none hover:bg-white/[0.13] hover:text-white md:h-8 md:px-3.5 md:text-[0.79rem]"
                onClick={startCreate}
              >
                Create budget
              </Button>
            </div>

            <div className="grid gap-4 border-border/70 md:min-h-[7.7rem] md:grid-cols-[minmax(0,1.5fr)_minmax(0,1.02fr)_minmax(0,0.92fr)] md:gap-0">
              <div className="space-y-2.5 md:space-y-3 md:pr-7">
                <h2 className="text-[0.98rem] font-semibold tracking-tight text-white/95 md:text-[1.08rem] lg:text-[1.16rem]">
                  Budget posture
                </h2>
                <div className="flex items-center gap-2 text-[1.06rem] font-semibold leading-none tracking-tight text-white md:text-[1.34rem] lg:text-[1.48rem]">
                  <span
                    className={`size-2.5 rounded-full md:size-3 ${
                      attentionCount > 0
                        ? totalRemaining < 0
                          ? "bg-rose-400"
                          : "bg-amber-400"
                        : totalTracked > 0
                          ? "bg-emerald-400"
                          : "bg-white"
                    }`}
                  />
                  {attentionCount > 0
                    ? totalRemaining < 0
                      ? "Budget pressure rising"
                      : "Needs review this cycle"
                    : totalTracked > 0
                      ? "Budget posture at a glance"
                      : "No budgets yet"}
                </div>
                <p className="max-w-[30ch] text-[0.9rem] leading-6 text-white/74 md:max-w-[34ch] md:text-[0.93rem] md:leading-7">
                  {attentionCount > 0
                    ? "Review active budget windows, remaining room, and pressure points before the current cycle closes."
                    : totalTracked > 0
                      ? "Keep each cycle readable, track remaining room, and spot tight budget windows before they slip."
                      : "Create your first budget to start tracking cycle-based limits, remaining room, and parent-child rollups."}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-0 border-t border-white/15 pt-3.5 md:border-0 md:border-l md:border-white/15 md:pl-7 md:pt-0">
                <div className="space-y-2.5 pr-4 md:pr-5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[0.82rem] text-white/70 md:text-[0.88rem]">Budgeted</p>
                    <span className="flex size-8.5 items-center justify-center rounded-full bg-emerald-100/95 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200 md:size-9">
                      <PiggyBank className="size-3.5 md:size-[0.95rem]" />
                    </span>
                  </div>
                  <p className="text-[0.96rem] font-semibold tracking-tight text-white md:text-[1.18rem] lg:text-[1.28rem]">
                    {formatBudgetMoney(totalBudgetAmount)}
                  </p>
                </div>

                <div className="space-y-2.5 border-l border-white/15 pl-4 pr-4 md:pr-5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[0.82rem] text-white/70 md:text-[0.88rem]">Remaining</p>
                    <span className="flex size-8.5 items-center justify-center rounded-full bg-rose-100/95 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200 md:size-9">
                      <CalendarClock className="size-3.5 md:size-[0.95rem]" />
                    </span>
                  </div>
                  <p className="text-[0.96rem] font-semibold tracking-tight text-white md:text-[1.18rem] lg:text-[1.28rem]">
                    {formatBudgetMoney(totalRemaining)}
                  </p>
                </div>
              </div>

              <div className="hidden space-y-2 border-t border-white/15 pt-4 md:block md:border-0 md:border-l md:border-white/15 md:pl-7 md:pt-0">
                <div className="flex items-center gap-2 text-[0.82rem] text-white/70">
                  <AlertTriangle className="size-4" />
                  Needs attention
                </div>
                <p className="line-clamp-2 text-[0.95rem] font-semibold tracking-tight text-white lg:text-[0.99rem]">
                  {attentionCount > 0
                    ? `${attentionCount} budget${attentionCount === 1 ? "" : "s"} need attention`
                    : totalTracked > 0
                      ? "All active budgets are currently readable"
                      : "Start with your first active budget"}
                </p>
                <p className="text-[0.82rem] leading-6 text-white/70">
                  {totalTracked > 0
                    ? `${String(totalTracked)} active · ${formatBudgetMoney(totalSpent)} spent this cycle`
                    : "Create a monthly or bi-weekly budget to begin"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <div
          ref={summaryScrollerRef}
          className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-1 md:hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {summaryCards.map((card) => (
            <div
              key={card.label}
              data-summary-slide
              className="min-w-0 shrink-0 basis-full snap-center"
            >
              <Card className="rounded-[1.5rem] border-white/75 bg-white dark:border-white/8 dark:bg-[#182123]">
                <CardHeader className="px-5 pb-2 pt-5">
                  <CardDescription className="text-xs uppercase tracking-[0.32em]">
                    {card.label}
                  </CardDescription>
                  <CardTitle className="text-[1.35rem] font-semibold tracking-tight">
                    {card.value}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-5 pb-5 text-sm leading-7 text-muted-foreground">
                  {card.detail}
                </CardContent>
              </Card>
            </div>
          ))}
        </div>

        {summaryCards.length > 1 ? (
          <div className="flex items-center justify-between md:hidden">
            <div className="flex items-center gap-2">
              {summaryCards.map((card, index) => (
                <button
                  key={card.label}
                  type="button"
                  aria-label={`Go to ${card.label}`}
                  aria-pressed={activeSummaryIndex === index}
                  className={`h-2.5 rounded-full transition-all ${
                    activeSummaryIndex === index ? "w-6 bg-primary" : "w-2.5 bg-border"
                  }`}
                  onClick={() => scrollSummaryCards(index)}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className="rounded-full"
                onClick={() => scrollSummaryCards(Math.max(0, activeSummaryIndex - 1))}
                disabled={activeSummaryIndex === 0}
              >
                <span aria-hidden="true">‹</span>
                <span className="sr-only">Previous summary card</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className="rounded-full"
                onClick={() =>
                  scrollSummaryCards(Math.min(summaryCards.length - 1, activeSummaryIndex + 1))
                }
                disabled={activeSummaryIndex === summaryCards.length - 1}
              >
                <span aria-hidden="true">›</span>
                <span className="sr-only">Next summary card</span>
              </Button>
            </div>
          </div>
        ) : null}

        <div className="hidden gap-4 md:grid md:grid-cols-[repeat(3,minmax(0,1fr))_minmax(320px,1.05fr)] xl:grid-cols-[repeat(4,minmax(0,1fr))]">
          {summaryCards.map((card) => {
            const icon =
              card.label === "Active budgets"
                ? CalendarClock
                : card.label === "Remaining to use"
                  ? PiggyBank
                  : card.label === "Spent this cycle"
                    ? Search
                    : AlertTriangle;
            const Icon = icon;
            const iconTone =
              card.label === "Needs attention"
                ? "bg-amber-100 text-amber-700"
                : card.label === "Spent this cycle"
                  ? "bg-emerald-100 text-emerald-700"
                  : card.label === "Remaining to use"
                    ? "bg-slate-100 text-slate-700"
                    : "bg-emerald-100 text-emerald-700";

            return (
              <Card
                key={card.label}
                className="rounded-[1.45rem] border-white/75 bg-white dark:border-white/8 dark:bg-[#182123]"
              >
                <CardHeader className="px-5 pb-2 pt-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardDescription className="text-xs uppercase tracking-[0.32em]">
                        {card.label}
                      </CardDescription>
                      <CardTitle className="mt-2 text-[1.3rem] font-semibold tracking-tight">
                        {card.value}
                      </CardTitle>
                    </div>
                    <span
                      className={`flex size-10 items-center justify-center rounded-full ${iconTone}`}
                    >
                      <Icon className="size-4.5" />
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="px-5 pb-5 text-sm leading-7 text-muted-foreground">
                  {card.detail}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.78fr)]">
        <Card className="rounded-[2rem] border-white/75 bg-white dark:border-white/8 dark:bg-[#182123]">
          <CardHeader className="space-y-4 border-b border-border/60 px-5 py-5 sm:px-7 sm:py-6">
            <div className="flex flex-col gap-5 2xl:grid 2xl:grid-cols-[minmax(360px,1fr)_auto] 2xl:items-start">
              <div className="min-w-0 max-w-[34rem] space-y-2">
                <CardTitle className="text-[1.45rem] tracking-tight">Active budgets</CardTitle>
                <CardDescription className="max-w-[30rem] text-[0.95rem] leading-7">
                  Keep the list focused on active budget windows first. Child budgets roll upward;
                  the workspace helps you spot pressure before the cycle closes.
                </CardDescription>
              </div>

              <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center 2xl:w-auto 2xl:justify-end">
                <div className="relative min-w-0 flex-1 sm:min-w-[260px] 2xl:w-[380px] 2xl:flex-none">
                  <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Filter budgets..."
                    className="h-12 w-full rounded-full border-border/70 bg-white pl-11"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>View</span>
                    <Select value="all" onValueChange={() => undefined}>
                      <SelectTrigger className="h-12 w-[90px] rounded-2xl border-border/70 bg-white">
                        <SelectValue placeholder="All" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Button type="button" onClick={startCreate} className="h-12 rounded-2xl px-5">
                    Create budget
                  </Button>
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent className="px-0 py-0">
            {budgetsQuery.isLoading || summaryQuery.isLoading ? (
              <div className="px-6 py-10 text-sm text-muted-foreground sm:px-8">
                Loading budget windows...
              </div>
            ) : activeRootBudgets.length === 0 ? (
              <div className="px-6 py-8 sm:px-8 sm:py-10">
                <div className="rounded-[1.6rem] border border-border/70 bg-white px-6 py-10 text-center">
                  <div className="mx-auto mb-5 flex size-24 items-center justify-center rounded-full bg-muted/60 text-foreground">
                    <CalendarClock className="size-10" />
                  </div>
                  <p className="text-[1.9rem] font-medium tracking-tight">No active budgets yet</p>
                  <p className="mx-auto mt-3 max-w-2xl text-[0.98rem] leading-8 text-muted-foreground">
                    Start with one monthly or bi-weekly budget. Once transactions are assigned in
                    the ledger flow, this workspace will begin reading real spend against each
                    window.
                  </p>
                  <Button type="button" onClick={startCreate} className="mt-7 rounded-2xl px-5">
                    Create your first budget
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-5 px-6 py-6 sm:px-8 sm:py-7">
                <div className="hidden grid-cols-[minmax(0,1.45fr)_110px_minmax(0,1fr)_120px] items-center gap-4 border-b border-border/60 px-4 pb-4 text-[0.72rem] font-medium uppercase tracking-[0.2em] text-muted-foreground lg:grid">
                  <span>Budget window</span>
                  <span>Period</span>
                  <span>Progress</span>
                  <span>Remaining</span>
                </div>

                {activeRootBudgets.map((budget) => {
                  const Icon = getStatusIcon(budget.status);
                  const tone = getStatusTone(budget.status);
                  const childBudgets = filteredBudgets.filter(
                    (entry) => entry.parentBudgetId === budget.id,
                  );

                  return (
                    <div
                      key={budget.id}
                      className="rounded-[1.55rem] border border-border/70 bg-white px-4 py-4 shadow-[0_18px_38px_-34px_rgba(15,23,42,0.12)] dark:bg-[#12191b] sm:px-5 sm:py-5"
                    >
                      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1.45fr)_110px_minmax(0,1fr)_120px] lg:items-start lg:gap-4">
                        <div className="min-w-0 space-y-2.5 pr-1">
                          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                            <h3 className="text-[1.22rem] font-semibold tracking-tight sm:text-[1.35rem]">
                              {budget.name}
                            </h3>
                            <span
                              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${tone}`}
                            >
                              <Icon className="size-3.5" />
                              {getStatusLabel(budget.status)}
                            </span>
                            <span className="rounded-full border border-border/70 px-3 py-1 text-xs uppercase tracking-[0.18em] text-muted-foreground lg:hidden">
                              {getPeriodLabel(budget.period)}
                            </span>
                          </div>

                          <div className="space-y-1.5">
                            <p className="text-[0.9rem] leading-7 text-muted-foreground lg:max-w-[32ch]">
                              Window {formatDate(budget.periodStart)} to{" "}
                              {formatDate(budget.periodEnd)}
                            </p>
                            {childBudgets.length > 0 ? (
                              <p className="text-[0.8rem] leading-6 text-muted-foreground">
                                {childBudgets.length} child budget
                                {childBudgets.length === 1 ? "" : "s"} included
                              </p>
                            ) : null}
                          </div>

                          <div className="grid grid-cols-3 gap-4 rounded-[1.15rem] bg-muted/25 px-4 py-3.5 lg:hidden">
                            <div>
                              <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
                                Budgeted
                              </p>
                              <p className="mt-1.5 text-[1.02rem] font-semibold tracking-tight">
                                {formatBudgetMoney(budget.amount)}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
                                Spent
                              </p>
                              <p className="mt-1.5 text-[1.02rem] font-semibold tracking-tight">
                                {formatBudgetMoney(budget.totalSpent)}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
                                Remaining
                              </p>
                              <p className="mt-1.5 text-[1.02rem] font-semibold tracking-tight">
                                {formatBudgetMoney(budget.remaining)}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="hidden min-w-0 pt-1 lg:block">
                          <p className="text-[0.84rem] font-medium uppercase tracking-[0.18em] text-foreground/80">
                            {getPeriodLabel(budget.period)}
                          </p>
                          <p className="mt-1 text-[0.78rem] text-muted-foreground">
                            Current window
                          </p>
                        </div>

                        <div className="min-w-0 max-w-full space-y-2 pt-1">
                          <div className="flex items-center justify-between gap-3 text-[0.82rem] text-muted-foreground">
                            <span>{budget.percentageUsed.toFixed(2)}% used</span>
                            <span className="lg:hidden">
                              {formatBudgetMoney(budget.totalSpent)} of{" "}
                              {formatBudgetMoney(budget.amount)}
                            </span>
                          </div>

                          <div className="h-3 overflow-hidden rounded-full bg-muted/70">
                            <div
                              className={`h-full rounded-full ${
                                budget.status === "safe"
                                  ? "bg-emerald-500"
                                  : budget.status === "warning"
                                    ? "bg-amber-500"
                                    : budget.status === "danger"
                                      ? "bg-orange-500"
                                      : "bg-rose-500"
                              }`}
                              style={{ width: getProgressWidth(budget.percentageUsed) }}
                            />
                          </div>

                          <p className="hidden max-w-[18ch] text-[0.78rem] leading-6 text-muted-foreground lg:block">
                            {formatBudgetMoney(budget.totalSpent)} of{" "}
                            {formatBudgetMoney(budget.amount)}
                          </p>
                        </div>

                        <div className="min-w-0 pt-1 text-left lg:text-right">
                          <p className="truncate text-[0.98rem] font-semibold tracking-tight text-foreground">
                            {formatBudgetMoney(budget.remaining)}
                          </p>
                          <p className="mt-1 text-[0.8rem] text-muted-foreground">Available</p>
                        </div>
                      </div>

                      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/60 pt-4">
                        <p className="text-[0.82rem] leading-6 text-muted-foreground">
                          {budget.status === "safe"
                            ? "Cycle is currently healthy."
                            : budget.status === "warning"
                              ? "Approaching your limit."
                              : budget.status === "danger"
                                ? "Window is under pressure."
                                : "Budget has been exceeded."}
                        </p>
                        <div className="flex items-center gap-1.5">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 bg-white rounded-full px-3 text-[0.78rem]"
                            onClick={() => {
                              const record = budgets.find((entry) => entry.id === budget.id);
                              if (record) startEdit(record);
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="size-8 rounded-full text-rose-600 hover:text-rose-700"
                            onClick={() => setDeleteTarget({ id: budget.id, name: budget.name })}
                          >
                            <Trash2 className="size-4" />
                            <span className="sr-only">Delete budget</span>
                          </Button>
                        </div>
                      </div>

                      {childBudgets.length > 0 ? (
                        <div className="mt-5 rounded-[1.2rem] border border-border/60 bg-card/70 px-3.5 py-3.5 sm:px-4 sm:py-4">
                          <div className="flex items-center justify-between gap-4">
                            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                              Child budgets
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {childBudgets.length} linked
                            </p>
                          </div>

                          <div className="mt-3 space-y-2">
                            {childBudgets.map((child) => {
                              const ChildIcon = getStatusIcon(child.status);
                              const childTone = getStatusTone(child.status);

                              return (
                                <div
                                  key={child.id}
                                  className="rounded-[1rem] border border-border/70 bg-white px-3 py-3"
                                >
                                  <div className="flex flex-col gap-3">
                                    <div className="min-w-0 space-y-1">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <p className="truncate text-[0.92rem] font-medium tracking-tight sm:text-[0.95rem]">
                                          {child.name}
                                        </p>
                                        <span
                                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.7rem] font-medium ${childTone}`}
                                        >
                                          <ChildIcon className="size-3" />
                                          {getStatusLabel(child.status)}
                                        </span>
                                        <span className="rounded-full border border-border/70 px-2.5 py-1 text-[0.68rem] uppercase tracking-[0.16em] text-muted-foreground">
                                          {getPeriodLabel(child.period)}
                                        </span>
                                      </div>
                                      <p className="text-[0.78rem] leading-6 text-muted-foreground sm:text-[0.8rem]">
                                        Window {formatDate(child.periodStart)} to{" "}
                                        {formatDate(child.periodEnd)}
                                      </p>
                                    </div>

                                    <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-left sm:grid-cols-3 sm:text-right">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <p className="text-[0.65rem] uppercase tracking-[0.16em] text-muted-foreground">
                                          Budgeted
                                        </p>
                                        <p className="mt-1 text-[0.9rem] font-semibold tracking-tight">
                                          {formatBudgetMoney(child.amount)}
                                        </p>
                                      </div>
                                      <div>
                                        <p className="text-[0.65rem] uppercase tracking-[0.16em] text-muted-foreground">
                                          Spent
                                        </p>
                                        <p className="mt-1 text-[0.9rem] font-semibold tracking-tight">
                                          {formatBudgetMoney(child.totalSpent)}
                                        </p>
                                      </div>
                                      <div className="col-span-2 sm:col-span-1">
                                        <p className="text-[0.65rem] uppercase tracking-[0.16em] text-muted-foreground">
                                          Remaining
                                        </p>
                                        <p className="mt-1 text-[0.9rem] font-semibold tracking-tight">
                                          {formatBudgetMoney(child.remaining)}
                                        </p>
                                      </div>
                                    </div>

                                    <div className="flex items-center justify-end gap-2 pt-1">
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        className="rounded-full"
                                        onClick={() => {
                                          const record = budgets.find(
                                            (entry) => entry.id === child.id,
                                          );
                                          if (record) startEdit(record);
                                        }}
                                      >
                                        Edit
                                      </Button>
                                      <Button
                                        type="button"
                                        size="icon-sm"
                                        variant="ghost"
                                        className="rounded-full text-rose-600 hover:text-rose-700"
                                        onClick={() =>
                                          setDeleteTarget({ id: child.id, name: child.name })
                                        }
                                      >
                                        <Trash2 className="size-4" />
                                        <span className="sr-only">Delete child budget</span>
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="rounded-[1.7rem] border-white/75 bg-white dark:border-white/8 dark:bg-[#151f21]">
            <CardHeader className="px-6 pb-4 pt-6">
              <CardTitle className="text-[1.32rem] tracking-tight">
                What this workspace helps you see
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 px-6 pb-6">
              {[
                {
                  icon: PiggyBank,
                  tone:
                    "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/18 dark:text-emerald-200",
                  copy: "Pick the right cadence first so the budget window matches how money actually arrives and gets spent.",
                },
                {
                  icon: ShieldAlert,
                  tone: "bg-sky-100 text-sky-700 dark:bg-sky-500/18 dark:text-sky-200",
                  copy: "Use parent budgets for broader control and child budgets when one cycle needs finer operating detail.",
                },
                {
                  icon: AlertTriangle,
                  tone:
                    "bg-amber-100 text-amber-700 dark:bg-amber-500/18 dark:text-amber-200",
                  copy: "Watch the status and remaining amount to catch pressure before a budget slips over the line.",
                },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.copy}
                    className="flex items-start gap-4 rounded-[1.2rem] border border-border/70 bg-white px-4 py-4 dark:border-white/10 dark:bg-[#11191b]"
                  >
                    <span
                      className={`flex size-11 shrink-0 items-center justify-center rounded-full ${item.tone}`}
                    >
                      <Icon className="size-4.5" />
                    </span>
                    <p className="text-sm leading-7 text-muted-foreground dark:text-slate-300">
                      {item.copy}
                    </p>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card className="rounded-[1.7rem] border-white/75 bg-[linear-gradient(135deg,#17393c_0%,#204a4d_100%)] text-white shadow-[0_24px_55px_-42px_rgba(23,57,60,0.75)]">
            <CardHeader className="px-6 pb-3 pt-6">
              <CardDescription className="text-xs uppercase tracking-[0.28em] text-white/70">
                Budget posture
              </CardDescription>
              <CardTitle className="text-[1.78rem] font-semibold tracking-tight text-white">
                Keep the cycle readable without turning the page into a control tower.
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 px-6 pb-6 text-sm leading-7 text-white/78">
              <p className="max-w-[34rem]">
                The key numbers should tell you whether the current budget window is healthy, tight,
                or already exceeded at a glance.
              </p>
              <div className="rounded-[1.2rem] border border-white/15  px-4 py-4 text-sm leading-7">
                Total budgeted {formatBudgetMoney(totalBudgetAmount)} · Remaining{" "}
                {formatBudgetMoney(totalRemaining)}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <Dialog open={open} onOpenChange={(nextOpen) => (!nextOpen ? resetDialog() : setOpen(true))}>
        <DialogContent className="max-h-[calc(86dvh-env(safe-area-inset-top))] w-[calc(100vw-1rem)] max-w-[980px] overflow-x-hidden overflow-y-auto rounded-[1.45rem] border-border/70 bg-white p-0 shadow-[0_40px_90px_-50px_rgba(15,23,42,0.5)] backdrop-blur sm:max-h-[92vh] sm:w-[calc(100vw-3rem)] sm:rounded-[2rem]">
          <div className="border-b border-border/60 px-4 py-4 sm:px-7 sm:py-5">
            <div className="inline-flex rounded-lg border border-border/70 bg-white px-3 py-1 text-[0.62rem] uppercase tracking-[0.2em] text-muted-foreground sm:rounded-full sm:px-4 sm:text-xs sm:tracking-[0.28em]">
              Budget setup
            </div>
            <DialogHeader className="mt-3 space-y-2 sm:mt-3.5 sm:space-y-2">
              <DialogTitle className="text-[1.2rem] font-semibold tracking-tight sm:text-[2rem]">
                {editingBudgetId ? "Edit budget" : "Create a budget"}
              </DialogTitle>
              <DialogDescription className="max-w-[42rem] text-[0.82rem] leading-6 sm:text-[0.92rem] sm:leading-6.5">
                Define the amount, cadence, and optional roll-up parent first. Budget assignment
                inside transactions can come next once the structure is in place.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="space-y-4 px-3.5 py-3.5 sm:space-y-4 sm:px-6 sm:py-4">
            {formError ? (
              <div className="rounded-[1.25rem] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
                {formError}
              </div>
            ) : null}

            <div className="rounded-[1.35rem] border border-border/70 bg-white px-3.5 py-3 shadow-[0_10px_24px_-22px_rgba(15,23,42,0.12)] sm:px-4 sm:py-4">
            <div className="mb-3 inline-flex rounded-full border border-border/70 bg-white px-2.5 py-1 text-[0.66rem] uppercase tracking-[0.24em] text-muted-foreground">
              Primary details
            </div>

            <div className="space-y-3">
              <div className="space-y-2">
                <label className="text-[0.86rem] font-medium text-foreground sm:text-sm">
                  Budget name
                </label>
                <Input
                  value={draft.name}
                  onChange={(event) => {
                    setFormError(null);
                    setDraft((current) => ({ ...current, name: event.target.value }));
                  }}
                  placeholder="e.g. Household operating budget"
                  className="h-9 rounded-lg border-border/70 bg-white text-sm sm:h-11 sm:rounded-xl sm:text-base"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-[0.86rem] font-medium text-foreground sm:text-sm">
                    Budget amount
                  </label>
                  <Input
                    value={draft.amount}
                    onChange={(event) => {
                      setFormError(null);
                      setDraft((current) => ({ ...current, amount: event.target.value }));
                    }}
                    placeholder="0.00"
                    inputMode="decimal"
                    className="h-9 rounded-lg border-border/70 bg-white text-sm sm:h-11 sm:rounded-xl sm:text-base"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[0.86rem] font-medium text-foreground sm:text-sm">
                    Budget window starts
                  </label>
                  <Input
                    type="date"
                    value={draft.startDate}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, startDate: event.target.value }))
                    }
                    className="h-9 rounded-lg border-border/70 bg-white text-sm sm:h-11 sm:rounded-xl sm:text-base"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[1.35rem] border border-border/70 bg-white px-3.5 py-3 shadow-[0_10px_24px_-22px_rgba(15,23,42,0.12)] sm:px-4 sm:py-4">
            <div className="mb-3 inline-flex rounded-full border border-border/70 bg-white px-2.5 py-1 text-[0.66rem] uppercase tracking-[0.24em] text-muted-foreground">
              Budget cadence
            </div>

            <div className="space-y-3">
              <label className="text-[0.86rem] font-medium text-foreground sm:text-sm">
                Period
              </label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {periodOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setFormError(null);
                      setDraft((current) => ({ ...current, period: option.value }));
                    }}
                    className={`min-h-[76px] rounded-lg border px-3 py-3 text-left transition sm:min-h-[90px] sm:rounded-[1.2rem] sm:px-4 sm:py-4 ${
                      draft.period === option.value
                        ? "border-[#17393c] bg-[#17393c] text-white shadow-[0_18px_40px_-30px_rgba(23,57,60,0.7)]"
                        : "border-border/70 bg-white text-foreground hover:bg-muted/50"
                    }`}
                  >
                    <div className="text-[0.9rem] font-medium sm:text-[0.98rem]">
                      {option.label}
                    </div>
                    <div
                      className={`mt-1.5 text-[0.78rem] leading-5 sm:mt-2 sm:text-[0.86rem] sm:leading-6 ${draft.period === option.value ? "text-white/78" : "text-muted-foreground"}`}
                    >
                      {option.description}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {draft.period === "bi-weekly" ? (
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-[0.86rem] font-medium text-foreground sm:text-sm">
                    Salary date 1
                  </label>
                  <Input
                    value={draft.salaryDatePrimary}
                    onChange={(event) => {
                      setFormError(null);
                      setDraft((current) => ({
                        ...current,
                        salaryDatePrimary: event.target.value,
                      }));
                    }}
                    placeholder="e.g. 15"
                    className="h-9 rounded-lg border-border/70 bg-white text-sm sm:h-11 sm:rounded-xl sm:text-base"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[0.86rem] font-medium text-foreground sm:text-sm">
                    Salary date 2
                  </label>
                  <Input
                    value={draft.salaryDateSecondary}
                    onChange={(event) => {
                      setFormError(null);
                      setDraft((current) => ({
                        ...current,
                        salaryDateSecondary: event.target.value,
                      }));
                    }}
                    placeholder="e.g. 30"
                    className="h-9 rounded-lg border-border/70 bg-white text-sm sm:h-11 sm:rounded-xl sm:text-base"
                  />
                </div>
              </div>
            ) : null}
          </div>

          <div className="rounded-[1.35rem] border border-border/70 bg-white px-3.5 py-3 shadow-[0_10px_24px_-22px_rgba(15,23,42,0.12)] sm:px-4 sm:py-4">
            <div className="mb-3 inline-flex rounded-full border border-border/70 bg-white px-2.5 py-1 text-[0.66rem] uppercase tracking-[0.24em] text-muted-foreground">
              Optional structure
            </div>

            <div className="grid gap-4 sm:grid-cols-2 sm:items-start">
              <div className="grid content-start gap-2">
                <label className="text-[0.86rem] font-medium text-foreground sm:text-sm">
                  Parent budget
                </label>
                <Select
                  value={draft.parentBudgetId}
                  onValueChange={(value) => {
                    setFormError(null);
                    setDraft((current) => ({ ...current, parentBudgetId: value }));
                  }}
                >
                  <SelectTrigger className="h-9 w-full rounded-lg border-border/70 bg-white text-sm sm:h-11 sm:rounded-xl sm:text-base">
                    <SelectValue placeholder="No parent budget" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No parent budget</SelectItem>
                    {parentBudgetOptions.map((budget) => (
                      <SelectItem key={budget.id} value={budget.id}>
                        {budget.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="min-h-[3.5rem] max-w-[34ch] text-[0.76rem] leading-5.5 text-muted-foreground sm:text-[0.82rem] sm:leading-5.5">
                  Selecting a parent creates a child budget inside that parent budget.
                </p>
              </div>

              <div className="grid content-start gap-2">
                <label className="text-[0.86rem] font-medium text-foreground sm:text-sm">
                  Status
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setDraft((current) => ({ ...current, isActive: !current.isActive }))
                  }
                  className={`flex h-9 w-full items-center justify-between rounded-lg border px-3 text-left text-sm font-medium transition sm:h-11 sm:rounded-xl sm:px-4 ${
                    draft.isActive
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      : "border-border/70 bg-white text-muted-foreground"
                  }`}
                >
                  <span className="leading-none">{draft.isActive ? "Active" : "Inactive"}</span>
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                      draft.isActive ? "bg-emerald-500" : "bg-slate-400"
                    }`}
                  />
                </button>
                <p className="min-h-[3.5rem] max-w-[34ch] text-[0.76rem] leading-5.5 text-muted-foreground sm:text-[0.82rem] sm:leading-5.5">
                  Inactive budgets are hidden from the active workspace until reactivated.
                </p>
              </div>
            </div>
          </div>

          </div>

          <DialogFooter className="!-mx-0 !-mb-0 flex-row items-center justify-end gap-2 rounded-b-[1.45rem] border-t border-border/60 bg-white px-4 py-3.5 sm:rounded-b-[2rem] sm:px-6 sm:py-3.5 [&>button]:w-auto">
            <Button
              type="button"
              variant="outline"
              className="h-9 rounded-lg bg-white px-4 text-sm sm:h-10 sm:rounded-full sm:px-5 sm:text-[0.95rem]"
              onClick={resetDialog}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="h-9 rounded-lg px-4 text-sm sm:h-10 sm:rounded-full sm:px-5 sm:text-[0.95rem]"
              onClick={submitBudget}
              disabled={isSubmitting}
            >
              {editingBudgetId ? "Save changes" : "Create budget"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(nextOpen) => (!nextOpen ? setDeleteTarget(null) : null)}
      >
        <DialogContent
          mobileBehavior="modal"
          className="max-h-[calc(86dvh-env(safe-area-inset-top))] w-[calc(100vw-1rem)] max-w-md overflow-x-hidden overflow-y-auto rounded-[1.35rem] border-border/70 bg-white p-0 sm:max-h-[92vh] sm:max-w-lg sm:rounded-[1.75rem]"
        >
          <div className="px-4 py-4 sm:px-7 sm:py-7">
            <DialogHeader className="space-y-3">
              <DialogTitle className="text-[1.15rem] font-semibold tracking-tight sm:text-3xl">
                Delete budget?
              </DialogTitle>
              <DialogDescription className="text-[0.82rem] leading-6 sm:text-base">
                Remove {deleteTarget?.name ? `"${deleteTarget.name}"` : "this budget"} from your
                workspace? This does not remove existing transactions, but it does remove the budget
                structure and roll-up.
              </DialogDescription>
            </DialogHeader>
          </div>
          <DialogFooter className="border-t border-border/60 bg-transparent px-4 py-4 sm:px-7 sm:py-6">
            <div className="flex w-full justify-end gap-3">
              <Button
                type="button"
                className="h-9 rounded-lg bg-rose-600 px-4 text-sm text-white hover:bg-rose-700 sm:h-10 sm:min-w-32 sm:rounded-full sm:px-5 sm:text-[0.95rem]"
                onClick={() => deleteTarget && removeBudget.mutate({ id: deleteTarget.id })}
                disabled={removeBudget.isPending}
              >
                Delete
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-9 bg-white rounded-lg px-4 text-sm sm:h-10 sm:min-w-32 sm:rounded-full sm:px-5 sm:text-[0.95rem]"
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
