"use client";

import { useMemo, useState } from "react";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { Flag, Loader2, ShieldCheck, Target, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";

import type { AppRouter } from "@/server/api/root";
import { trpc } from "@/trpc/react";
import { formatCurrencyMiliunits } from "@/lib/currencies";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type RouterInputs = inferRouterInputs<AppRouter>;
type GoalItem = RouterOutputs["goals"]["list"]["goals"][number];
type GoalDraft = RouterInputs["goals"]["create"];

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

function toDateInputValue(value: unknown) {
  const parsed = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  return parsed.toISOString().slice(0, 10);
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
  const budgetsQuery = trpc.budgets.list.useQuery();
  const [isOpen, setIsOpen] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [draft, setDraft] = useState<GoalDraft>(getInitialDraft());

  const goalRows = goalsQuery.data?.goals ?? [];
  const totalTarget = goalRows.reduce((acc, goal) => acc + goal.targetAmount, 0);
  const totalCurrent = goalRows.reduce((acc, goal) => acc + goal.currentAmount, 0);
  const completionPct = totalTarget > 0 ? Math.min(100, Math.round((totalCurrent / totalTarget) * 100)) : 0;
  const activeGoals = goalRows.filter((goal) => goal.status === "active").length;
  const activeBudgets = useMemo(
    () => (budgetsQuery.data ?? []).filter((budget) => budget.isActive),
    [budgetsQuery.data]
  );

  const invalidateGoals = async () => {
    await Promise.all([
      utils.goals.list.invalidate(),
      utils.ai.dashboardInsight.invalidate(),
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

  const onSubmit = () => {
    if (!draft.name.trim() || draft.targetAmount <= 0) return;
    if (editingGoalId) {
      updateGoal.mutate({ ...draft, id: editingGoalId });
    } else {
      createGoal.mutate(draft);
    }
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
                Goal planning
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="hidden h-8 rounded-full border-white/24 bg-white/[0.08] px-3 text-[0.76rem] font-medium text-white shadow-none hover:bg-white/[0.13] hover:text-white sm:inline-flex md:h-8 md:px-3.5 md:text-[0.79rem]"
                onClick={openCreate}
              >
                Add goal
              </Button>
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
                  Plan upcoming goals, link them to active budgets, and track progress in one
                  place.
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
                <p className="line-clamp-2 text-[0.95rem] font-semibold tracking-tight text-white lg:text-[0.99rem]">
                  {goalsQuery.data
                    ? formatCurrencyMiliunits(
                        goalsQuery.data.cashflowPreview.projectedEndingBalance,
                        goalsQuery.data.cashflowPreview.currency
                      )
                    : "Loading..."}
                </p>
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
          <CardTitle className="text-[1.2rem]">Active goals</CardTitle>
          <CardDescription>
            Cashflow preview:{" "}
            {goalsQuery.data
              ? formatCurrencyMiliunits(
                  goalsQuery.data.cashflowPreview.projectedEndingBalance,
                  goalsQuery.data.cashflowPreview.currency
                )
              : "Loading..."}{" "}
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
            <div className="rounded-lg border border-dashed border-border/70 px-3 py-3 text-sm text-muted-foreground">
              No goals yet. Add your first one to start planning.
            </div>
          ) : (
            goalRows.map((goal) => {
              const progressPct =
                goal.targetAmount > 0
                  ? Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100))
                  : 0;
              return (
                <div key={goal.id} className="rounded-xl border border-border/70 bg-background px-4 py-3 dark:bg-[#141d1f]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[0.95rem] font-semibold">{goal.name}</p>
                      <p className="text-[0.8rem] text-muted-foreground">
                        {formatCurrencyMiliunits(goal.currentAmount, goal.currency)} /{" "}
                        {formatCurrencyMiliunits(goal.targetAmount, goal.currency)} · Due{" "}
                        {goal.targetDate.toLocaleDateString()}
                      </p>
                      <p className={`mt-1 text-[0.76rem] ${getSignalTone(goal.affordabilitySignal)}`}>
                        Suggested monthly: {formatCurrencyMiliunits(goal.recommendedMonthly, goal.currency)} · {goal.affordabilitySignal}
                      </p>
                      {goal.linkedBudget ? (
                        <p className="text-[0.75rem] text-muted-foreground">
                          Linked budget: {goal.linkedBudget.name}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => openEdit(goal)}>
                        <Target className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => removeGoal.mutate({ id: goal.id })}
                        disabled={removeGoal.isPending}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
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
                      <label className={goalFieldLabelClassName}>Target amount (milliunits)</label>
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        value={draft.targetAmount || ""}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            targetAmount: Math.max(0, Number(event.target.value) || 0),
                          }))
                        }
                        placeholder="0"
                        className={goalInputClassName}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className={goalFieldLabelClassName}>Current amount (milliunits)</label>
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        value={draft.currentAmount || ""}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            currentAmount: Math.max(0, Number(event.target.value) || 0),
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
                  <h3 className="text-[1rem] font-semibold tracking-tight text-foreground">Schedule and linkage</h3>
                  <p className="text-[0.82rem] leading-5.5 text-muted-foreground">
                    Add a target date and optionally connect this goal to one active budget.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className={goalFieldLabelClassName}>Target date</label>
                    <Input
                      type="date"
                      value={toDateInputValue(draft.targetDate)}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          targetDate: new Date(`${event.target.value}T00:00:00`),
                        }))
                      }
                      className={goalInputClassName}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className={goalFieldLabelClassName}>Linked budget</label>
                    <Select
                      value={draft.linkedBudgetId ?? "none"}
                      onValueChange={(value) =>
                        setDraft((current) => ({
                          ...current,
                          linkedBudgetId: value === "none" ? undefined : value,
                        }))
                      }
                    >
                      <SelectTrigger className={goalFieldClassName}>
                        <SelectValue placeholder="No linked budget" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No linked budget</SelectItem>
                        {activeBudgets.map((budget) => (
                          <SelectItem key={budget.id} value={budget.id}>
                            <div className="flex items-center gap-2">
                              <Flag className="size-3.5" />
                              <span>{budget.name}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
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
