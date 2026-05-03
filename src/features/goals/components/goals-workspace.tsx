"use client";

import { useMemo, useState } from "react";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { Archive, HandCoins, Loader2, Pause, Play, ShieldCheck, Target, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";

import type { AppRouter } from "@/server/api/root";
import { trpc } from "@/trpc/react";
import { formatCurrencyMiliunits } from "@/lib/currencies";
import {
  formatDateWithPreferences,
  resolveDatePreferences,
} from "@/features/settings/lib/date-format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePickerField } from "@/components/date-picker/date-picker";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type RouterInputs = inferRouterInputs<AppRouter>;
type GoalItem = RouterOutputs["goals"]["list"]["goals"][number];
type GoalDraft = RouterInputs["goals"]["create"];
type GoalContributionDraft = RouterInputs["goals"]["contribute"];
type GoalStatusFilter = "active" | "paused" | "completed";

function getInitialDraft(): GoalDraft {
  return {
    name: "",
    targetAmount: 0,
    currentAmount: 0,
    currency: "PHP",
    targetDate: new Date(),
    linkedBudgetId: undefined,
    notes: "",
    status: "active",
  };
}

function getInitialContributionDraft(goalId = "", sourceAccountId = ""): GoalContributionDraft {
  return {
    goalId,
    sourceAccountId,
    destinationAccountId: undefined,
    amount: 0,
    date: new Date(),
    notes: "",
  };
}

function toDateInputValue(value: unknown) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return value.trim();
  }

  const parsed = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    const now = new Date();
    const yyyy = String(now.getFullYear());
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  const yyyy = String(parsed.getFullYear());
  const mm = String(parsed.getMonth() + 1).padStart(2, "0");
  const dd = String(parsed.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatAmountInput(valueInMiliunits: number | undefined) {
  if (!valueInMiliunits) return "";
  if (valueInMiliunits <= 0) return "";
  const decimalValue = valueInMiliunits / 1000;
  return Number.isInteger(decimalValue)
    ? String(decimalValue)
    : decimalValue.toFixed(2).replace(/\.?0+$/, "");
}

function parseAmountToMiliunits(value: string) {
  const normalized = value.trim().replace(/,/g, "");
  if (!normalized) return 0;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 1000);
}

function monthDiff(from: Date, to: Date) {
  const start = new Date(from.getFullYear(), from.getMonth(), 1);
  const end = new Date(to.getFullYear(), to.getMonth(), 1);
  const years = end.getFullYear() - start.getFullYear();
  const months = end.getMonth() - start.getMonth();
  return years * 12 + months;
}

function getDraftMonthlyPlan(targetAmount: number, currentAmount: number, targetDate: Date) {
  const remainingAmount = Math.max(targetAmount - currentAmount, 0);
  const monthsLeft = Math.max(1, monthDiff(new Date(), targetDate) + 1);
  const monthlyNeeded = remainingAmount > 0 ? Math.ceil(remainingAmount / monthsLeft) : 0;
  return { remainingAmount, monthsLeft, monthlyNeeded };
}

function getSignalTone(signal: GoalItem["affordabilitySignal"]) {
  if (signal === "comfortable") return "text-emerald-700 dark:text-emerald-300";
  if (signal === "stretch") return "text-amber-700 dark:text-amber-300";
  return "text-rose-700 dark:text-rose-300";
}

const goalFieldClassName =
  "h-10 w-full rounded-[0.8rem] border-border/70 bg-white px-3.5 text-[0.88rem] shadow-none transition-colors dark:bg-[#162022] focus-visible:border-[#8db8b3] focus-visible:ring-2 focus-visible:ring-[#8db8b3]/20";

const goalInputClassName =
  "h-10 w-full rounded-[0.8rem] border-border/70 bg-white px-3.5 py-2 text-[0.88rem] leading-none shadow-none transition-colors md:h-9.5 md:px-3 md:py-1.5 md:text-[0.8rem] dark:bg-[#162022] focus-visible:border-[#8db8b3] focus-visible:ring-2 focus-visible:ring-[#8db8b3]/20";

const goalFieldLabelClassName =
  "block text-[0.84rem] font-semibold leading-none tracking-tight text-foreground";

const goalDialogContentClassName =
  "h-[100dvh] overflow-hidden border border-border/70 bg-white px-0 py-0 dark:border-white/8 dark:bg-[linear-gradient(180deg,rgba(24,33,35,0.98),rgba(18,27,29,0.98))] [&_[data-slot='dialog-close']]:right-4 [&_[data-slot='dialog-close']]:top-4 [&_[data-slot='dialog-close']]:h-10 [&_[data-slot='dialog-close']]:w-10 [&_[data-slot='dialog-close']]:rounded-full [&_[data-slot='dialog-close']]:border [&_[data-slot='dialog-close']]:border-border/70 [&_[data-slot='dialog-close']]:bg-background/92 [&_[data-slot='dialog-close']]:shadow-sm";

const goalDialogHeaderClassName =
  "sticky top-0 z-10 shrink-0 border-b border-border/70 bg-white px-4 pb-2.5 pt-[max(1rem,env(safe-area-inset-top))] pr-14 sm:px-6 sm:pb-3 sm:pt-5.5 sm:pr-16 dark:bg-[#1a2325]";

const goalDialogBodyClassName =
  "min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-2.5 sm:px-6 sm:py-3";

const goalDialogFooterClassName =
  "sticky bottom-0 z-10 shrink-0 border-t border-border/70 bg-white px-4 pb-[max(0.8rem,env(safe-area-inset-bottom))] pt-2.5 sm:px-6 sm:py-3 dark:bg-[#1a2325]";

export function GoalsWorkspace() {
  const utils = trpc.useUtils();
  const goalsQuery = trpc.goals.list.useQuery();
  const accountsQuery = trpc.accounts.list.useQuery();
  const settingsQuery = trpc.settings.get.useQuery();
  const datePreferences = resolveDatePreferences(settingsQuery.data);
  const [isOpen, setIsOpen] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [draft, setDraft] = useState<GoalDraft>(getInitialDraft());
  const [isContributeOpen, setIsContributeOpen] = useState(false);
  const [contributionGoal, setContributionGoal] = useState<GoalItem | null>(null);
  const [contributionDraft, setContributionDraft] = useState<GoalContributionDraft>(
    getInitialContributionDraft()
  );
  const [statusFilter, setStatusFilter] = useState<GoalStatusFilter>("active");

  const goalRows = goalsQuery.data?.goals ?? [];
  const filteredGoalRows = goalRows.filter((goal) => goal.status === statusFilter);
  const totalTarget = goalRows.reduce((acc, goal) => acc + goal.targetAmount, 0);
  const totalCurrent = goalRows.reduce((acc, goal) => acc + goal.currentAmount, 0);
  const completionPct = totalTarget > 0 ? Math.min(100, Math.round((totalCurrent / totalTarget) * 100)) : 0;
  const activeGoals = goalRows.filter((goal) => goal.status === "active").length;
  const pausedGoals = goalRows.filter((goal) => goal.status === "paused").length;
  const completedGoals = goalRows.filter((goal) => goal.status === "completed").length;
  const liquidAccounts = useMemo(
    () =>
      (accountsQuery.data ?? []).filter(
        (account) => account.type === "cash" || account.type === "wallet"
      ),
    [accountsQuery.data]
  );
  const defaultSourceAccountId = liquidAccounts[0]?.id ?? "";
  const draftMonthlyPlan = useMemo(
    () =>
      getDraftMonthlyPlan(
        draft.targetAmount ?? 0,
        draft.currentAmount ?? 0,
        draft.targetDate instanceof Date ? draft.targetDate : new Date()
      ),
    [draft.currentAmount, draft.targetAmount, draft.targetDate]
  );

  const invalidateGoals = async () => {
    await Promise.all([
      utils.goals.list.invalidate(),
      utils.accounts.list.invalidate(),
      utils.accounts.summary.invalidate(),
      utils.transactions.list.invalidate(),
      utils.transactions.summary.invalidate(),
      utils.forecast.summary.invalidate(),
      utils.ai.dashboardInsight.invalidate(),
      utils.ai.accountsInsight.invalidate(),
      utils.ai.transactionsInsight.invalidate(),
      utils.ai.budgetsInsight.invalidate(),
      utils.settings.auditLog.invalidate(),
    ]);
  };

  const createGoal = trpc.goals.create.useMutation({
    onSuccess: async () => {
      await invalidateGoals();
      setIsOpen(false);
      setDraft(getInitialDraft());
      toast.success("Goal added");
    },
    onError: (error) => toast.error("Could not create goal", { description: error.message }),
  });

  const updateGoal = trpc.goals.update.useMutation({
    onSuccess: async () => {
      await invalidateGoals();
      setIsOpen(false);
      setEditingGoalId(null);
      setDraft(getInitialDraft());
      toast.success("Goal updated");
    },
    onError: (error) => toast.error("Could not update goal", { description: error.message }),
  });

  const removeGoal = trpc.goals.remove.useMutation({
    onSuccess: async () => {
      await invalidateGoals();
      toast.success("Goal deleted");
    },
    onError: (error) => toast.error("Could not delete goal", { description: error.message }),
  });

  const contributeGoal = trpc.goals.contribute.useMutation({
    onSuccess: async () => {
      await invalidateGoals();
      setIsContributeOpen(false);
      setContributionGoal(null);
      setContributionDraft(getInitialContributionDraft("", defaultSourceAccountId));
      toast.success("Contribution recorded");
    },
    onError: (error) => toast.error("Could not record contribution", { description: error.message }),
  });

  const openCreate = () => {
    setEditingGoalId(null);
    setDraft(getInitialDraft());
    setIsOpen(true);
  };

  const openEdit = (goal: GoalItem) => {
    setEditingGoalId(goal.id);
    setDraft({
      name: goal.name,
      targetAmount: goal.targetAmount,
      currentAmount: goal.currentAmount,
      currency: goal.currency,
      targetDate: goal.targetDate,
      linkedBudgetId: goal.linkedBudgetId ?? undefined,
      notes: goal.notes ?? "",
      status: goal.status,
    });
    setIsOpen(true);
  };

  const openContribute = (goal: GoalItem) => {
    setContributionGoal(goal);
    setContributionDraft(getInitialContributionDraft(goal.id, defaultSourceAccountId));
    setIsContributeOpen(true);
  };

  const onSubmit = () => {
    if (!draft.name.trim() || draft.targetAmount <= 0) return;
    if (editingGoalId) {
      updateGoal.mutate({ ...draft, id: editingGoalId });
    } else {
      createGoal.mutate(draft);
    }
  };

  const onContributeSubmit = () => {
    if (!contributionGoal) return;
    if (!contributionDraft.sourceAccountId || contributionDraft.amount <= 0) return;
    contributeGoal.mutate({
      ...contributionDraft,
      goalId: contributionGoal.id,
      destinationAccountId: contributionDraft.destinationAccountId || undefined,
      notes: contributionDraft.notes || "",
    });
  };

  const onStatusChange = (goal: GoalItem, status: GoalDraft["status"]) => {
    updateGoal.mutate({
      id: goal.id,
      name: goal.name,
      targetAmount: goal.targetAmount,
      currentAmount: goal.currentAmount,
      currency: goal.currency,
      targetDate: goal.targetDate,
      linkedBudgetId: goal.linkedBudgetId ?? undefined,
      notes: goal.notes ?? "",
      status,
    });
  };

  return (
    <div className="space-y-6">
      <section>
        <Card className="relative overflow-hidden rounded-[1.5rem] border-white/10 bg-[linear-gradient(145deg,rgba(16,41,43,0.98),rgba(29,78,77,0.94))] text-white shadow-[0_26px_80px_-52px_rgba(10,31,34,0.62)]">
          <div className="pointer-events-none absolute inset-0 opacity-70">
            <div className="absolute inset-y-0 left-0 w-[58%] bg-[radial-gradient(circle_at_20%_26%,rgba(6,17,18,0.28),transparent_42%)]" />
            <div className="absolute inset-y-0 right-0 hidden w-[44%] bg-[radial-gradient(circle_at_72%_28%,rgba(80,255,214,0.13),transparent_30%),radial-gradient(circle_at_84%_72%,rgba(80,255,214,0.08),transparent_22%)] lg:block" />
          </div>

          <CardContent className="relative space-y-4 p-4 sm:p-5 md:space-y-4 md:p-6 lg:p-7.5">
            <div className="flex items-start justify-between gap-4">
              <p className="text-[0.84rem] font-medium tracking-[0.01em] text-white/72 md:text-[0.88rem]">
                Today · {formatDateWithPreferences(new Date(), datePreferences, "date")}
              </p>
            </div>

            <div className="grid gap-4 border-border/70 md:min-h-[7.7rem] md:grid-cols-[minmax(0,1.5fr)_minmax(0,1.02fr)_minmax(0,0.92fr)] md:gap-0">
              <div className="space-y-2.5 md:space-y-3 md:pr-7">
                <h2 className="text-[0.98rem] font-semibold tracking-tight text-white/95 md:text-[1.08rem] lg:text-[1.16rem]">
                  Build your savings runway
                </h2>
                <div className="flex items-center gap-2 text-[1.06rem] font-semibold leading-none tracking-tight text-white md:text-[1.34rem] lg:text-[1.48rem]">
                  <span className="size-2.5 rounded-full bg-emerald-400 md:size-3" />
                  Keep every target tied to real cashflow
                </div>
                <p className="max-w-[30ch] text-[0.9rem] leading-6 text-white/74 md:max-w-[34ch] md:text-[0.93rem] md:leading-7">
                  Plan upcoming goals and track progress in one place.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-0 border-t border-white/15 pt-3.5 md:border-0 md:border-l md:border-white/15 md:pl-7 md:pt-0">
                <div className="space-y-2.5 pr-4 md:pr-5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[0.82rem] text-white/70 md:text-[0.88rem]">Active goals</p>
                    <span className="flex size-8.5 items-center justify-center rounded-full bg-emerald-100/95 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200 md:size-9">
                      <Target className="size-3.5 md:size-[0.95rem]" />
                    </span>
                  </div>
                  <p className="text-[0.96rem] font-semibold tracking-tight text-white md:text-[1.18rem] lg:text-[1.28rem]">
                    {activeGoals}
                  </p>
                  <p className="text-[0.78rem] leading-5.5 text-white/64 md:text-[0.82rem] md:leading-6">
                    {formatCurrencyMiliunits(totalTarget, "PHP")} target value
                  </p>
                </div>

                <div className="space-y-2.5 border-l border-white/15 pl-4 pr-4 md:pr-5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[0.82rem] text-white/70 md:text-[0.88rem]">Funded</p>
                    <span className="flex size-8.5 items-center justify-center rounded-full bg-sky-100/95 text-sky-700 dark:bg-sky-500/20 dark:text-sky-200 md:size-9">
                      <Wallet className="size-3.5 md:size-[0.95rem]" />
                    </span>
                  </div>
                  <p className="text-[0.96rem] font-semibold tracking-tight text-white md:text-[1.18rem] lg:text-[1.28rem]">
                    {completionPct}%
                  </p>
                  <p className="text-[0.78rem] leading-5.5 text-white/64 md:text-[0.82rem] md:leading-6">
                    {formatCurrencyMiliunits(totalCurrent, "PHP")} saved
                  </p>
                </div>
              </div>

              <div className="hidden space-y-2 border-t border-white/15 pt-4 md:block md:border-0 md:border-l md:border-white/15 md:pl-7 md:pt-0">
                <div className="flex items-center gap-2 text-[0.82rem] text-white/70">
                  <ShieldCheck className="size-4" />
                  Projection
                </div>
                <div className="line-clamp-2 min-h-[1.5rem] text-[0.95rem] font-semibold tracking-tight text-white lg:text-[0.99rem]">
                  {goalsQuery.data
                    ? formatCurrencyMiliunits(
                        goalsQuery.data.cashflowPreview.projectedEndingBalance,
                        goalsQuery.data.cashflowPreview.currency
                      )
                    : <Loader2 className="size-4 animate-spin text-white/70" />}
                </div>
                <p className="text-[0.82rem] leading-6 text-white/70">
                  Projected liquid balance in 30 days
                </p>
              </div>
            </div>

            <div className="sm:hidden">
              <Button
                type="button"
                className="h-9.5 w-full rounded-[0.9rem] bg-white/12 text-white hover:bg-white/18"
                onClick={openCreate}
              >
                Add goal
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      <Card className="border-white/75 bg-white/84 dark:border-white/8 dark:bg-[#182123]">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-[1.2rem]">Goals</CardTitle>
            <div className="inline-flex rounded-[0.8rem] border border-border/70 bg-background/70 p-1">
              <button
                type="button"
                onClick={() => setStatusFilter("active")}
                className={`rounded-[0.65rem] px-2.5 py-1 text-[0.76rem] font-medium ${
                  statusFilter === "active" ? "bg-[#17393c] text-white" : "text-muted-foreground"
                }`}
              >
                Active ({activeGoals})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("paused")}
                className={`rounded-[0.65rem] px-2.5 py-1 text-[0.76rem] font-medium ${
                  statusFilter === "paused" ? "bg-[#17393c] text-white" : "text-muted-foreground"
                }`}
              >
                Paused ({pausedGoals})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("completed")}
                className={`rounded-[0.65rem] px-2.5 py-1 text-[0.76rem] font-medium ${
                  statusFilter === "completed" ? "bg-[#17393c] text-white" : "text-muted-foreground"
                }`}
              >
                Archived ({completedGoals})
              </button>
            </div>
          </div>
          <CardDescription>
            Cashflow preview:{" "}
            {goalsQuery.data
              ? formatCurrencyMiliunits(
                  goalsQuery.data.cashflowPreview.projectedEndingBalance,
                  goalsQuery.data.cashflowPreview.currency
                )
              : (
                  <span className="inline-flex items-center align-middle">
                    <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                  </span>
                )}{" "}
            projected in 30 days
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {goalsQuery.isLoading ? (
            <div className="flex items-center gap-2 rounded-lg border border-border/70 px-3 py-3 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading goals...
            </div>
          ) : goalRows.length === 0 ? (
            <div className="space-y-3 rounded-lg border border-dashed border-border/70 px-4 py-4">
              <p className="text-sm font-medium text-foreground">No goals yet</p>
              <p className="text-sm text-muted-foreground">
                Start with one clear target so savings progress is visible and trackable.
              </p>
              <Button type="button" size="sm" className="h-8.5 rounded-[0.75rem] px-3.5" onClick={openCreate}>
                Add first goal
              </Button>
            </div>
          ) : filteredGoalRows.length === 0 ? (
            <div className="space-y-2 rounded-lg border border-dashed border-border/70 px-4 py-4">
              <p className="text-sm font-medium text-foreground">No {statusFilter} goals</p>
              <p className="text-sm text-muted-foreground">
                {statusFilter === "active"
                  ? "All goals are paused or archived right now."
                  : statusFilter === "paused"
                    ? "You have no paused goals at the moment."
                    : "You have no archived goals yet."}
              </p>
            </div>
          ) : (
            filteredGoalRows.map((goal) => {
              const progressPct =
                goal.targetAmount > 0
                  ? Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100))
                  : 0;
              const statusLabel =
                goal.status === "active" ? "Active" : goal.status === "paused" ? "Paused" : "Archived";
              return (
                <div key={goal.id} className="rounded-xl border border-border/70 bg-background px-4 py-3 dark:bg-[#141d1f]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-[0.95rem] font-semibold">{goal.name}</p>
                        <span className="rounded-full border border-border/80 px-2 py-0.5 text-[0.66rem] uppercase tracking-[0.14em] text-muted-foreground">
                          {statusLabel}
                        </span>
                      </div>
                      <p className="mt-1 text-[0.8rem] text-muted-foreground">
                        Due {goal.targetDate.toLocaleDateString()} ·{" "}
                        {formatCurrencyMiliunits(goal.currentAmount, goal.currency)} saved of{" "}
                        {formatCurrencyMiliunits(goal.targetAmount, goal.currency)}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[0.7rem] font-medium text-emerald-700 dark:text-emerald-300">
                          {progressPct}% funded
                        </span>
                        <span className="rounded-full border border-border/80 bg-muted/50 px-2 py-0.5 text-[0.7rem] font-medium text-muted-foreground">
                          {formatCurrencyMiliunits(goal.remainingAmount, goal.currency)} remaining
                        </span>
                      </div>
                      <p className={`mt-1 text-[0.76rem] ${getSignalTone(goal.affordabilitySignal)}`}>
                        Suggested monthly: {formatCurrencyMiliunits(goal.recommendedMonthly, goal.currency)} ·{" "}
                        {goal.affordabilitySignal}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => openContribute(goal)}
                        disabled={liquidAccounts.length === 0 || goal.status !== "active"}
                      >
                        <HandCoins className="mr-1 size-3.5" />
                        Contribute
                      </Button>
                      {goal.status === "active" ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => onStatusChange(goal, "paused")}
                              disabled={updateGoal.isPending}
                              aria-label="Pause goal"
                            >
                              <Pause className="size-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Pause goal</TooltipContent>
                        </Tooltip>
                      ) : (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => onStatusChange(goal, "active")}
                              disabled={updateGoal.isPending}
                              aria-label="Resume goal"
                            >
                              <Play className="size-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Resume goal</TooltipContent>
                        </Tooltip>
                      )}
                      {goal.status !== "completed" && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => onStatusChange(goal, "completed")}
                              disabled={updateGoal.isPending}
                              aria-label="Archive goal"
                            >
                              <Archive className="size-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Archive goal</TooltipContent>
                        </Tooltip>
                      )}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => openEdit(goal)}
                            aria-label="Edit goal"
                          >
                            <Target className="size-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Edit goal</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => removeGoal.mutate({ id: goal.id })}
                            disabled={removeGoal.isPending}
                            aria-label="Delete goal"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Delete goal</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-muted">
                    <div className="h-2 rounded-full bg-[#14656B]" style={{ width: `${progressPct}%` }} />
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Dialog
        open={isContributeOpen}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setIsContributeOpen(false);
            setContributionGoal(null);
            setContributionDraft(getInitialContributionDraft("", defaultSourceAccountId));
            return;
          }
          setIsContributeOpen(true);
        }}
      >
        <DialogContent mobileBehavior="adaptive" className={goalDialogContentClassName}>
          <DialogHeader className={goalDialogHeaderClassName + " relative"}>
            <div className="inline-flex w-fit rounded-full border border-[#17393c]/10 bg-white px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-[#17393c] dark:border-white/8 dark:bg-white/6 dark:text-primary">
              Goal contribution
            </div>
            <DialogTitle className="pt-0.5 text-[1.1rem] tracking-tight sm:pt-1 sm:text-[1.48rem]">
              Contribute to {contributionGoal?.name ?? "goal"}
            </DialogTitle>
            <p className="hidden max-w-lg text-[0.9rem] leading-6 text-muted-foreground sm:block">
              Move funds from a source account and apply them to this goal. You can leave destination
              blank to record this as a set-aside contribution.
            </p>
          </DialogHeader>

          <div className={goalDialogBodyClassName}>
            <div className="space-y-3.5 sm:space-y-4">
              <section className="space-y-2.5 border-b border-border/50 pb-3.5">
                <div className="space-y-1">
                  <h3 className="text-[1rem] font-semibold tracking-tight text-foreground">Contribution details</h3>
                  <p className="text-[0.82rem] leading-5.5 text-muted-foreground">
                    Source account is required. Enter amount in normal currency.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className={goalFieldLabelClassName}>From account</label>
                    <Select
                      value={contributionDraft.sourceAccountId}
                      onValueChange={(value) =>
                        setContributionDraft((current) => ({ ...current, sourceAccountId: value }))
                      }
                    >
                      <SelectTrigger className={goalFieldClassName}>
                        <SelectValue placeholder="Select source account" />
                      </SelectTrigger>
                      <SelectContent>
                        {liquidAccounts.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className={goalFieldLabelClassName}>Destination account (optional)</label>
                    <Select
                      value={contributionDraft.destinationAccountId ?? "none"}
                      onValueChange={(value) =>
                        setContributionDraft((current) => ({
                          ...current,
                          destinationAccountId: value === "none" ? undefined : value,
                        }))
                      }
                    >
                      <SelectTrigger className={goalFieldClassName}>
                        <SelectValue placeholder="No destination account" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No destination account</SelectItem>
                        {liquidAccounts.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className={goalFieldLabelClassName}>Amount (PHP)</label>
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      value={formatAmountInput(contributionDraft.amount)}
                      onChange={(event) =>
                        setContributionDraft((current) => ({
                          ...current,
                          amount: parseAmountToMiliunits(event.target.value),
                        }))
                      }
                      placeholder="0"
                      className={goalInputClassName}
                    />
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {[500, 1000, 2500].map((amount) => {
                        const amountMiliunits = amount * 1000;
                        const isActiveAmount = contributionDraft.amount === amountMiliunits;
                        return (
                          <button
                            key={amount}
                            type="button"
                            onClick={() =>
                              setContributionDraft((current) => ({ ...current, amount: amountMiliunits }))
                            }
                            className={`rounded-full border px-2.5 py-1 text-[0.72rem] font-medium transition ${
                              isActiveAmount
                                ? "border-[#17393c] bg-[#17393c] text-white"
                                : "border-border/80 bg-background text-muted-foreground hover:bg-muted/70"
                            }`}
                          >
                            +{formatCurrencyMiliunits(amountMiliunits, contributionGoal?.currency ?? "PHP")}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className={goalFieldLabelClassName}>Date</label>
                    <DatePickerField
                      value={toDateInputValue(contributionDraft.date)}
                      onChange={(value) =>
                        setContributionDraft((current) => ({
                          ...current,
                          date: value ? new Date(`${value}T00:00:00`) : current.date,
                        }))
                      }
                      className={goalInputClassName + " justify-between"}
                      size="compact"
                      displayFormat="MM/dd/yyyy"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className={goalFieldLabelClassName}>Notes</label>
                  <Input
                    value={contributionDraft.notes ?? ""}
                    onChange={(event) =>
                      setContributionDraft((current) => ({ ...current, notes: event.target.value }))
                    }
                    placeholder="Optional contribution note"
                    className={goalInputClassName}
                  />
                </div>
              </section>

              <div className="rounded-[0.95rem] border border-dashed border-border/70 bg-white px-3.5 py-2.5 text-[0.78rem] leading-5.5 text-muted-foreground dark:bg-[#162022]">
                This contribution will deduct from your selected source account and add to goal
                progress.
                {contributionDraft.destinationAccountId
                  ? " Destination account balance will also increase."
                  : " No destination account selected: this will be recorded as set aside."}
              </div>
            </div>
          </div>

          <DialogFooter className={goalDialogFooterClassName + " !flex-row items-center justify-end gap-2.5"}>
            <Button
              type="button"
              variant="ghost"
              className="h-9.5 rounded-full px-4 text-[0.88rem] text-foreground/80 hover:bg-muted"
              onClick={() => setIsContributeOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={onContributeSubmit}
              disabled={
                contributeGoal.isPending ||
                !contributionGoal ||
                !contributionDraft.sourceAccountId ||
                contributionDraft.amount <= 0
              }
              className="h-10 min-w-44 rounded-[0.95rem] bg-[#17393c] px-6 text-[0.9rem] font-medium text-white hover:bg-[#1d4a4d] disabled:text-white/85"
            >
              {contributeGoal.isPending ? (
                <>
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  Recording
                </>
              ) : (
                "Record contribution"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isOpen}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setIsOpen(false);
            setEditingGoalId(null);
            setDraft(getInitialDraft());
            return;
          }
          setIsOpen(true);
        }}
      >
        <DialogContent mobileBehavior="adaptive" className={goalDialogContentClassName}>
          <DialogHeader className={goalDialogHeaderClassName + " relative"}>
            <div className="inline-flex w-fit rounded-full border border-[#17393c]/10 bg-white px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-[#17393c] dark:border-white/8 dark:bg-white/6 dark:text-primary">
              Goal setup
            </div>
            <DialogTitle className="pt-0.5 text-[1.1rem] tracking-tight sm:pt-1 sm:text-[1.48rem]">
              {editingGoalId ? "Edit goal" : "Create goal"}
            </DialogTitle>
            <p className="hidden max-w-lg text-[0.9rem] leading-6 text-muted-foreground sm:block">
              Set your target, current progress, and expected date to keep this goal aligned with
              your monthly budget plan.
            </p>
          </DialogHeader>

          <div className={goalDialogBodyClassName}>
            <div className="space-y-3.5 sm:space-y-4">
              <section className="space-y-2.5 border-b border-border/50 pb-3.5">
                <div className="space-y-1">
                  <h3 className="text-[1rem] font-semibold tracking-tight text-foreground">Goal basics</h3>
                  <p className="text-[0.82rem] leading-5.5 text-muted-foreground">
                    Give this goal a clear name and baseline amounts.
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="space-y-2">
                    <label className={goalFieldLabelClassName}>Goal name</label>
                    <Input
                      value={draft.name}
                      onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                      placeholder="e.g. Emergency fund"
                      className={goalInputClassName}
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label className={goalFieldLabelClassName}>Goal target (PHP)</label>
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        value={formatAmountInput(draft.targetAmount)}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            targetAmount: parseAmountToMiliunits(event.target.value),
                          }))
                        }
                        placeholder="0"
                        className={goalInputClassName}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className={goalFieldLabelClassName}>Saved so far (PHP)</label>
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        value={formatAmountInput(draft.currentAmount)}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            currentAmount: parseAmountToMiliunits(event.target.value),
                          }))
                        }
                        placeholder="0"
                        className={goalInputClassName}
                      />
                    </div>
                  </div>
                </div>
              </section>

              <section className="space-y-2.5 border-b border-border/50 pb-3.5">
                <div className="space-y-1">
                  <h3 className="text-[1rem] font-semibold tracking-tight text-foreground">Schedule</h3>
                  <p className="text-[0.82rem] leading-5.5 text-muted-foreground">
                    Add a target date to estimate the monthly savings pace needed for this goal.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className={goalFieldLabelClassName}>Target date</label>
                  <DatePickerField
                    value={toDateInputValue(draft.targetDate)}
                    onChange={(value) =>
                      setDraft((current) => ({
                        ...current,
                        targetDate: value ? new Date(`${value}T00:00:00`) : current.targetDate,
                      }))
                    }
                    className={goalInputClassName + " justify-between"}
                    size="compact"
                    displayFormat="MM/dd/yyyy"
                  />
                </div>
                <div className="rounded-[0.82rem] border border-border/70 bg-muted/30 px-3 py-2.5 text-[0.79rem] text-muted-foreground">
                  {draftMonthlyPlan.remainingAmount > 0 ? (
                    <div className="space-y-0.5">
                      <p>
                        Remaining to target:{" "}
                        <span className="font-semibold text-foreground">
                          {formatCurrencyMiliunits(
                            draftMonthlyPlan.remainingAmount,
                            draft.currency ?? "PHP"
                          )}
                        </span>
                      </p>
                      <p>
                        Needed pace:{" "}
                        <span className="font-semibold text-foreground">
                          {formatCurrencyMiliunits(
                            draftMonthlyPlan.monthlyNeeded,
                            draft.currency ?? "PHP"
                          )}
                        </span>{" "}
                        per month for the next {draftMonthlyPlan.monthsLeft} month
                        {draftMonthlyPlan.monthsLeft > 1 ? "s" : ""}.
                      </p>
                    </div>
                  ) : (
                    <span className="font-medium text-emerald-700 dark:text-emerald-300">
                      Goal target already reached.
                    </span>
                  )}
                </div>
              </section>

              <section className="space-y-2.5">
                <div className="space-y-1">
                  <h3 className="text-[1rem] font-semibold tracking-tight text-foreground">Status and notes</h3>
                  <p className="text-[0.82rem] leading-5.5 text-muted-foreground">
                    Keep the goal state accurate so AI guidance remains reliable.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className={goalFieldLabelClassName}>Status</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(["active", "paused", "completed"] as const).map((status) => (
                      <button
                        key={status}
                        type="button"
                        onClick={() => setDraft((current) => ({ ...current, status }))}
                        className={`h-9.5 rounded-[0.8rem] border px-3 text-[0.82rem] font-medium transition ${
                          draft.status === status
                            ? "border-[#17393c] bg-[#17393c] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                            : "border-border/80 bg-background text-foreground hover:bg-muted/70"
                        }`}
                      >
                        {status === "active" ? "Active" : status === "paused" ? "Paused" : "Completed"}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className={goalFieldLabelClassName}>Notes</label>
                  <Input
                    value={draft.notes ?? ""}
                    onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
                    placeholder="Optional context for this goal"
                    className={goalInputClassName}
                  />
                </div>
              </section>
            </div>
          </div>

          <DialogFooter className={goalDialogFooterClassName + " !flex-row items-center justify-end gap-2.5"}>
            <Button
              type="button"
              variant="ghost"
              className="h-9.5 rounded-full px-4 text-[0.88rem] text-foreground/80 hover:bg-muted"
              onClick={() => setIsOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={onSubmit}
              disabled={createGoal.isPending || updateGoal.isPending}
              className="h-10 min-w-44 rounded-[0.95rem] bg-[#17393c] px-6 text-[0.9rem] font-medium text-white hover:bg-[#1d4a4d] disabled:text-white/85"
            >
              {editingGoalId ? "Save goal" : "Create goal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
