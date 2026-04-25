"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  Loader2,
  Pencil,
  ShieldAlert,
  ReceiptText,
  Search,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import type { AppRouter } from "@/server/api/root";
import { trpc } from "@/trpc/react";
import { formatCurrencyMiliunits, isSupportedCurrency } from "@/lib/currencies";
import { CashflowProjectionChart } from "@/components/app/cashflow-projection-chart";
import {
  type LoanPaymentPreset,
  RecordLoanPaymentDialog,
} from "@/features/loans/components/record-loan-payment-dialog";
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
import { DatePickerField } from "@/components/date-picker/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type BillItem = RouterOutputs["bills"]["list"]["items"][number];
type BillStatusFilter = "all" | "pending" | "paid" | "overdue";
type BillCadence = "one_time" | "weekly" | "monthly" | "yearly";

type BillDraft = {
  name: string;
  amount: string;
  cadence: BillCadence;
  intervalCount: string;
  startsAt: string;
  nextDueDate: string;
  endsAfterOccurrences: string;
  accountId: string;
  notes: string;
  isActive: boolean;
};

type BillsWorkspaceProps = {
  initialQuery?: string;
};

function formatDateLabel(value: Date | string | null | undefined) {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getStatusLabel(bill: BillItem) {
  if (bill.status === "paid") return "Paid";
  if (bill.status === "overdue") return "Overdue";
  return "Pending";
}

function getStatusTone(bill: BillItem) {
  if (bill.status === "paid") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (bill.status === "overdue") return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function toDateInputValue(value: Date | string | null | undefined) {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toDateOrUndefined(value: string) {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return undefined;
  return date;
}

function getInitialDraft(): BillDraft {
  const today = toDateInputValue(new Date());
  return {
    name: "",
    amount: "",
    cadence: "monthly",
    intervalCount: "1",
    startsAt: today,
    nextDueDate: today,
    endsAfterOccurrences: "",
    accountId: "none",
    notes: "",
    isActive: true,
  };
}

const billDialogContentClassName =
  "h-[100dvh] overflow-hidden border border-border/70 bg-white px-0 py-0 dark:border-white/8 dark:bg-[linear-gradient(180deg,rgba(24,33,35,0.98),rgba(18,27,29,0.98))] [&_[data-slot='dialog-close']]:right-4 [&_[data-slot='dialog-close']]:top-4 [&_[data-slot='dialog-close']]:h-10 [&_[data-slot='dialog-close']]:w-10 [&_[data-slot='dialog-close']]:rounded-full [&_[data-slot='dialog-close']]:border [&_[data-slot='dialog-close']]:border-border/70 [&_[data-slot='dialog-close']]:bg-background/92 [&_[data-slot='dialog-close']]:shadow-sm";

const billDialogHeaderClassName =
  "sticky top-0 z-10 shrink-0 border-b border-border/70 bg-white px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] pr-14 sm:px-6 sm:pb-4 sm:pt-5.5 sm:pr-16 dark:bg-[#1a2325]";

const billDialogBodyClassName =
  "min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-3 sm:px-6 sm:py-4";

const billDialogFooterClassName =
  "sticky bottom-0 z-10 shrink-0 border-t border-border/70 bg-white px-4 pb-[max(0.8rem,env(safe-area-inset-bottom))] pt-2.5 sm:px-6 sm:py-3 dark:bg-[#1a2325]";

function buildDraftFromBill(bill: BillItem): BillDraft {
  return {
    name: bill.name,
    amount: (bill.amount / 1000).toFixed(2),
    cadence: bill.cadence,
    intervalCount: String(bill.intervalCount),
    startsAt: toDateInputValue(bill.startsAt),
    nextDueDate: toDateInputValue(bill.nextDueDate),
    endsAfterOccurrences:
      typeof bill.endsAfterOccurrences === "number" ? String(bill.endsAfterOccurrences) : "",
    accountId: bill.accountId ?? "none",
    notes: bill.notes ?? "",
    isActive: bill.isActive,
  };
}

export function BillsWorkspace({ initialQuery = "" }: BillsWorkspaceProps) {
  const utils = trpc.useUtils();
  const accountsQuery = trpc.accounts.list.useQuery();

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingBill, setEditingBill] = useState<BillItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BillItem | null>(null);
  const [draft, setDraft] = useState<BillDraft>(getInitialDraft());
  const [query, setQuery] = useState(initialQuery);
  const [loanPaymentPreset, setLoanPaymentPreset] = useState<LoanPaymentPreset | null>(null);
  const [status, setStatus] = useState<BillStatusFilter>("all");
  const [page, setPage] = useState(1);
  const deferredQuery = useDeferredValue(query);

  const listQuery = trpc.bills.list.useQuery({
    page,
    pageSize: 20,
    search: deferredQuery,
    status,
    includeInactive: false,
  });
  const summaryQuery = trpc.bills.summary.useQuery();
  const recentBillsQuery = trpc.bills.list.useQuery({
    page: 1,
    pageSize: 80,
    search: "",
    status: "all",
    includeInactive: true,
  });
  const forecastQuery = trpc.forecast.summary.useQuery({
    days: 30,
  });

  const invalidateBillsSurfaces = async () => {
    await Promise.all([
      utils.bills.list.invalidate(),
      utils.bills.summary.invalidate(),
      utils.bills.get.invalidate(),
      utils.loans.list.invalidate(),
      utils.loans.summary.invalidate(),
      utils.loans.get.invalidate(),
      utils.transactions.list.invalidate(),
      utils.transactions.summary.invalidate(),
      utils.accounts.list.invalidate(),
      utils.accounts.summary.invalidate(),
      utils.budgets.list.invalidate(),
      utils.budgets.summary.invalidate(),
      utils.forecast.summary.invalidate(),
      utils.ai.dashboardInsight.invalidate(),
      utils.ai.accountsInsight.invalidate(),
      utils.ai.loansInsight.invalidate(),
      utils.ai.transactionsInsight.invalidate(),
      utils.ai.budgetsInsight.invalidate(),
    ]);
  };

  const createBill = trpc.bills.create.useMutation({
    onSuccess: async () => {
      await invalidateBillsSurfaces();
      setEditorOpen(false);
      setEditingBill(null);
      setDraft(getInitialDraft());
      toast.success("Bill created", {
        description: "Your new bill is now tracked in the workspace.",
      });
    },
    onError: (error) => {
      toast.error("Could not create bill", {
        description: error.message,
      });
    },
  });

  const updateBill = trpc.bills.update.useMutation({
    onSuccess: async () => {
      await invalidateBillsSurfaces();
      setEditorOpen(false);
      setEditingBill(null);
      setDraft(getInitialDraft());
      toast.success("Bill updated", {
        description: "Bill details were updated.",
      });
    },
    onError: (error) => {
      toast.error("Could not update bill", {
        description: error.message,
      });
    },
  });

  const deleteBill = trpc.bills.remove.useMutation({
    onSuccess: async () => {
      const removedName = deleteTarget?.name ?? "Bill";
      await invalidateBillsSurfaces();
      setDeleteTarget(null);
      toast.success("Bill deleted", {
        description: `${removedName} was removed.`,
      });
    },
    onError: (error) => {
      toast.error("Could not delete bill", {
        description: error.message,
      });
    },
  });

  const markPaid = trpc.bills.markPaid.useMutation({
    onSuccess: async () => {
      await invalidateBillsSurfaces();
      toast.success("Bill marked as paid", {
        description: "Payment was posted and the next bill due date was refreshed.",
      });
    },
    onError: (error) => {
      toast.error("Could not mark bill as paid", {
        description: error.message,
      });
    },
  });

  const completeBill = trpc.bills.complete.useMutation({
    onSuccess: async () => {
      await invalidateBillsSurfaces();
      toast.success("Bill completed", {
        description: "This bill is now closed and no future dues will be generated.",
      });
    },
    onError: (error) => {
      toast.error("Could not complete bill", {
        description: error.message,
      });
    },
  });

  const bills = listQuery.data?.items ?? [];
  const recentBillPayments = useMemo(
    () =>
      (recentBillsQuery.data?.items ?? [])
        .filter((bill) => bill.latestPaidOccurrence?.paidAt)
        .map((bill) => ({
          amount: bill.latestPaidOccurrence?.amount ?? 0,
          billId: bill.id,
          billName: bill.name,
          currency: bill.currency,
          isLoanLinked: bill.obligationType === "loan_repayment",
          paidAt: bill.latestPaidOccurrence?.paidAt ?? null,
        }))
        .filter((item) => item.paidAt instanceof Date)
        .sort(
          (left, right) =>
            (right.paidAt?.getTime() ?? 0) - (left.paidAt?.getTime() ?? 0),
        )
        .slice(0, 6),
    [recentBillsQuery.data?.items],
  );
  const accountMap = useMemo(
    () => new Map((accountsQuery.data ?? []).map((account) => [account.id, account])),
    [accountsQuery.data],
  );
  const defaultLiquidPaymentAccountId = useMemo(
    () =>
      (accountsQuery.data ?? []).find(
        (account) => account.type === "cash" || account.type === "wallet",
      )?.id,
    [accountsQuery.data],
  );
  const isSavingBill = createBill.isPending || updateBill.isPending;
  const isRecurringBill = draft.cadence !== "one_time";
  const forecastRiskTone =
    forecastQuery.data?.riskLevel === "shortfall"
      ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-200"
      : forecastQuery.data?.riskLevel === "watch"
        ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200"
        : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-200";
  const forecastRiskLabel =
    forecastQuery.data?.riskLevel === "shortfall"
      ? "Shortfall risk"
      : forecastQuery.data?.riskLevel === "watch"
        ? "Watch"
        : "Safe";
  const forecastTrendDirection =
    forecastQuery.data && forecastQuery.data.projectedEndingBalance >= forecastQuery.data.startingBalance
      ? "up"
      : "down";

  const openCreateDialog = () => {
    setEditingBill(null);
    setDraft(getInitialDraft());
    setEditorOpen(true);
  };

  const openEditDialog = (bill: BillItem) => {
    setEditingBill(bill);
    setDraft(buildDraftFromBill(bill));
    setEditorOpen(true);
  };

  const setRecurringBill = (nextRecurring: boolean) => {
    setDraft((current) => {
      if (nextRecurring) {
        return {
          ...current,
          cadence: current.cadence === "one_time" ? "monthly" : current.cadence,
          intervalCount: current.intervalCount || "1",
        };
      }

      return {
        ...current,
        cadence: "one_time",
        intervalCount: "1",
        endsAfterOccurrences: "",
      };
    });
  };

  const submitBill = () => {
    const amount = Math.round(Number(draft.amount) * 1000);
    if (!draft.name.trim()) {
      toast.error("Bill name is required.");
      return;
    }
    if (Number.isNaN(amount) || amount <= 0) {
      toast.error("Enter a valid bill amount.");
      return;
    }

    const intervalCount =
      draft.cadence === "one_time"
        ? 1
        : Math.max(1, Number.parseInt(draft.intervalCount || "1", 10));
    const startsAt = toDateOrUndefined(draft.startsAt || draft.nextDueDate);
    if (!startsAt) {
      toast.error("Start date is required.");
      return;
    }

    const nextDueDate = toDateOrUndefined(draft.nextDueDate);
    const endsAfterOccurrencesValue = draft.endsAfterOccurrences.trim();
    const endsAfterOccurrences =
      endsAfterOccurrencesValue.length > 0
        ? Math.max(1, Number.parseInt(endsAfterOccurrencesValue, 10))
        : undefined;
    const accountId = draft.accountId !== "none" ? draft.accountId : undefined;

    if (editingBill) {
      updateBill.mutate({
        id: editingBill.id,
        name: draft.name.trim(),
        amount,
        currency: isSupportedCurrency(editingBill.currency) ? editingBill.currency : "PHP",
        cadence: draft.cadence,
        intervalCount,
        startsAt,
        nextDueDate,
        endsAfterOccurrences,
        remainingOccurrences: editingBill.remainingOccurrences ?? undefined,
        accountId,
        notes: draft.notes.trim(),
        isActive: draft.isActive,
      });
      return;
    }

    createBill.mutate({
      name: draft.name.trim(),
      amount,
      currency: "PHP",
      cadence: draft.cadence,
      intervalCount,
      startsAt,
      firstDueDate: nextDueDate,
      endsAfterOccurrences,
      accountId,
      notes: draft.notes.trim(),
      isActive: draft.isActive,
    });
  };

  return (
    <div className="space-y-6 lg:space-y-7">
      <Dialog
        open={editorOpen}
        onOpenChange={(open) => {
          if (!open && isSavingBill) return;
          setEditorOpen(open);
          if (!open) {
            setEditingBill(null);
            setDraft(getInitialDraft());
          }
        }}
      >
        <DialogContent mobileBehavior="adaptive" className={billDialogContentClassName}>
          <DialogHeader className={billDialogHeaderClassName}>
            <div className="inline-flex w-fit rounded-full border border-[#17393c]/10 bg-white px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-[#17393c] dark:border-white/8 dark:bg-white/6 dark:text-primary">
              Bills setup
            </div>
            <DialogTitle className="pt-1 text-[1.1rem] tracking-tight sm:pt-1.5 sm:text-[1.35rem]">
              {editingBill ? "Edit bill" : "Create bill"}
            </DialogTitle>
            <DialogDescription className="hidden text-[0.9rem] leading-6 text-muted-foreground sm:block">
              {editingBill
                ? "Update bill details, cadence, and linked account."
                : "Add a bill with recurring schedule rules and due-date tracking."}
            </DialogDescription>
          </DialogHeader>

          <div className={billDialogBodyClassName}>
            <div className="space-y-3.5 sm:space-y-4">
              <section className="space-y-2.5 border-b border-border/50 pb-3.5">
                <div className="space-y-1">
                  <h3 className="text-[1rem] font-semibold tracking-tight text-foreground">
                    Bill basics
                  </h3>
                  <p className="text-[0.82rem] leading-5.5 text-muted-foreground">
                    Start with name, amount, and billing style.
                  </p>
                </div>

                <div className="grid gap-3">
                  <Input
                    value={draft.name}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, name: event.target.value }))
                    }
                    placeholder="Bill name"
                    className="h-9 rounded-[0.75rem]"
                  />
                  <Input
                    value={draft.amount}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, amount: event.target.value }))
                    }
                    placeholder="Amount (e.g. 2500.00)"
                    className="h-9 rounded-[0.75rem]"
                  />

                  <div className="space-y-2">
                    <label className="block text-[0.84rem] font-semibold leading-none tracking-tight text-foreground">
                      Recurring bill
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: "Yes", value: true },
                        { label: "No", value: false },
                      ].map((option) => (
                        <button
                          key={option.label}
                          type="button"
                          onClick={() => setRecurringBill(option.value)}
                          className={`h-9 rounded-[0.8rem] border px-3 text-[0.86rem] font-medium transition ${
                            isRecurringBill === option.value
                              ? "border-[#17393c] bg-[#17393c] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                              : "border-border/80 bg-background text-foreground hover:bg-muted/70"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {isRecurringBill ? (
                    <>
                      <div className="space-y-2">
                        <label className="block text-[0.84rem] font-semibold leading-none tracking-tight text-foreground">
                          Cadence
                        </label>
                        <Select
                          value={draft.cadence}
                          onValueChange={(value) =>
                            setDraft((current) => ({
                              ...current,
                              cadence: value as BillCadence,
                            }))
                          }
                        >
                          <SelectTrigger className="h-9 rounded-[0.75rem]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="weekly">Weekly</SelectItem>
                            <SelectItem value="monthly">Monthly</SelectItem>
                            <SelectItem value="yearly">Yearly</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <label className="block text-[0.84rem] font-semibold leading-none tracking-tight text-foreground">
                          Repeat every
                        </label>
                        <Input
                          value={draft.intervalCount}
                          onChange={(event) =>
                            setDraft((current) => ({ ...current, intervalCount: event.target.value }))
                          }
                          placeholder="1"
                          className="h-9 rounded-[0.75rem]"
                        />
                        <p className="text-[0.78rem] leading-5.5 text-muted-foreground">
                          Example: 2 with monthly means every 2 months.
                        </p>
                      </div>
                    </>
                  ) : null}
                </div>
              </section>

              <section className="space-y-2.5 border-b border-border/50 pb-3.5">
                <div className="space-y-1">
                  <h3 className="text-[1rem] font-semibold tracking-tight text-foreground">
                    Schedule
                  </h3>
                  <p className="text-[0.82rem] leading-5.5 text-muted-foreground">Set the due date.</p>
                </div>

                <div className="grid gap-3">
                  <DatePickerField
                    value={draft.nextDueDate}
                    onChange={(value) =>
                      setDraft((current) => ({
                        ...current,
                        nextDueDate: value,
                        startsAt: current.startsAt || value,
                      }))
                    }
                    size="compact"
                    displayFormat="MM/dd/yyyy"
                    placeholder="Due date"
                  />

                  {isRecurringBill ? (
                    <div className="space-y-2">
                      <label className="block text-[0.84rem] font-semibold leading-none tracking-tight text-foreground">
                        Stop after (optional)
                      </label>
                      <Input
                        value={draft.endsAfterOccurrences}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            endsAfterOccurrences: event.target.value,
                          }))
                        }
                        placeholder="# of payments (e.g. 12)"
                        className="h-9 rounded-[0.75rem]"
                      />
                    </div>
                  ) : null}
                </div>
              </section>

              <section className="space-y-2.5">
                <div className="space-y-1">
                  <h3 className="text-[1rem] font-semibold tracking-tight text-foreground">
                    Link and notes
                  </h3>
                  <p className="text-[0.82rem] leading-5.5 text-muted-foreground">
                    Optionally map this bill to an account and add context.
                  </p>
                </div>

                <div className="grid gap-3">
                  <Select
                    value={draft.accountId}
                    onValueChange={(value) =>
                      setDraft((current) => ({ ...current, accountId: value }))
                    }
                  >
                    <SelectTrigger className="h-9 rounded-[0.75rem]">
                      <SelectValue placeholder="Linked account" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No linked account</SelectItem>
                      {(accountsQuery.data ?? []).map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Input
                    value={draft.notes}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, notes: event.target.value }))
                    }
                    placeholder="Notes (optional)"
                    className="h-9 rounded-[0.75rem]"
                  />

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={draft.isActive}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, isActive: event.target.checked }))
                      }
                      className="size-4 rounded border border-border/70 accent-primary"
                    />
                    <p className="text-[0.84rem] text-muted-foreground">Keep this bill active</p>
                  </div>
                </div>
              </section>
            </div>
          </div>

          <div className={billDialogFooterClassName}>
            <DialogFooter className="!mx-0 !my-0 flex-row items-center justify-end gap-2.5 [&>button]:w-auto">
              <Button
                type="button"
                variant="ghost"
                className="h-9.5 rounded-full px-4 text-[0.88rem] text-foreground/80 hover:bg-muted"
                onClick={() => {
                  if (isSavingBill) return;
                  setEditorOpen(false);
                  setEditingBill(null);
                  setDraft(getInitialDraft());
                }}
                disabled={isSavingBill}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="h-10 w-full rounded-[0.95rem] bg-[#17393c] px-6 text-[0.9rem] font-medium text-white hover:bg-[#1d4a4d] disabled:text-white/85 sm:min-w-44 sm:w-auto"
                onClick={submitBill}
                disabled={isSavingBill}
              >
                {isSavingBill ? (
                  <>
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                    Saving...
                  </>
                ) : editingBill ? (
                  "Save changes"
                ) : (
                  "Create bill"
                )}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !deleteBill.isPending) {
            setDeleteTarget(null);
          }
        }}
      >
        <DialogContent
          mobileBehavior="modal"
          className="max-h-[calc(86dvh-env(safe-area-inset-top))] w-[calc(100vw-1rem)] overflow-x-hidden overflow-y-auto rounded-[1.2rem] border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,255,255,0.98))] px-0 py-0 dark:border-white/8 dark:bg-[linear-gradient(180deg,rgba(24,33,35,0.98),rgba(18,27,29,0.98))] [&>button[data-slot='dialog-close']]:right-3 [&>button[data-slot='dialog-close']]:top-3 sm:w-auto sm:max-w-[30rem] sm:rounded-[1.35rem] sm:[&>button[data-slot='dialog-close']]:right-4 sm:[&>button[data-slot='dialog-close']]:top-4"
        >
          <DialogHeader className="border-b border-border/70 px-5 pb-3.5 pt-[max(1rem,env(safe-area-inset-top))] pr-14 sm:px-6 sm:pb-4 sm:pt-5 sm:pr-16">
            <div className="inline-flex w-fit rounded-full border border-destructive/15 bg-destructive/5 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-destructive">
              Confirm delete
            </div>
            <DialogTitle className="pt-1.5 text-[1.1rem] tracking-tight text-[#10292B] dark:text-foreground sm:pt-2.5 sm:text-[1.4rem]">
              Delete bill?
            </DialogTitle>
            <DialogDescription className="max-w-md text-[0.8rem] leading-5.5 sm:text-[0.9rem] sm:leading-6.5">
              {deleteTarget
                ? `Delete "${deleteTarget.name}" and its occurrences from your workspace? This action cannot be undone.`
                : "Delete this bill and its occurrences from your workspace? This action cannot be undone."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-2.5 px-5 pb-[max(0.8rem,env(safe-area-inset-bottom))] pt-3 sm:flex sm:justify-end sm:px-6 sm:py-4">
            <Button
              type="button"
              variant="outline"
              className="h-9.5 w-full rounded-full px-4.5 sm:h-10 sm:w-auto"
              onClick={() => setDeleteTarget(null)}
              disabled={deleteBill.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="h-9.5 w-full rounded-full bg-destructive px-4.5 text-white hover:bg-destructive/90 sm:h-10 sm:w-auto"
              disabled={!deleteTarget || deleteBill.isPending}
              onClick={() => {
                if (!deleteTarget) return;
                deleteBill.mutate({ id: deleteTarget.id });
              }}
            >
              {deleteBill.isPending ? "Deleting..." : "Delete bill"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <RecordLoanPaymentDialog
        key={
          loanPaymentPreset
            ? `${loanPaymentPreset.loanId}:${loanPaymentPreset.installmentId ?? "manual"}:${loanPaymentPreset.amountMiliunits ?? "na"}:${String(loanPaymentPreset.paidAt ?? "")}`
            : "loan-payment-dialog-from-bills"
        }
        open={loanPaymentPreset !== null}
        preset={loanPaymentPreset}
        title="Record linked loan payment"
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setLoanPaymentPreset(null);
        }}
      />

      <section>
        <Card className="relative overflow-hidden rounded-[1.5rem] border-white/10 bg-[linear-gradient(145deg,rgba(16,41,43,0.98),rgba(29,78,77,0.94))] text-white shadow-[0_26px_80px_-52px_rgba(10,31,34,0.62)]">
          <div className="pointer-events-none absolute inset-0 opacity-70">
            <div className="absolute inset-y-0 left-0 w-[58%] bg-[radial-gradient(circle_at_20%_26%,rgba(6,17,18,0.28),transparent_42%)]" />
            <div className="absolute inset-y-0 right-0 hidden w-[44%] bg-[radial-gradient(circle_at_72%_28%,rgba(80,255,214,0.13),transparent_30%),radial-gradient(circle_at_84%_72%,rgba(80,255,214,0.08),transparent_22%)] lg:block" />
          </div>

          <CardContent className="relative space-y-4 p-4 sm:p-5 md:space-y-4 md:p-6 lg:p-7.5">
            <div className="flex items-start justify-between gap-4">
              <p className="text-[0.84rem] font-medium tracking-[0.01em] text-white/72 md:text-[0.88rem]">
                Bills posture
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="hidden h-8 rounded-full border-white/24 bg-white/[0.08] px-3 text-[0.76rem] font-medium text-white shadow-none hover:bg-white/[0.13] hover:text-white sm:inline-flex md:h-8 md:px-3.5 md:text-[0.79rem]"
                onClick={openCreateDialog}
              >
                Create bill
              </Button>
            </div>

            <div className="grid gap-4 border-border/70 md:min-h-[7.7rem] md:grid-cols-[minmax(0,1.5fr)_minmax(0,1.02fr)_minmax(0,0.92fr)] md:gap-0">
              <div className="space-y-2.5 md:space-y-3 md:pr-7">
                <h2 className="text-[0.98rem] font-semibold tracking-tight text-white/95 md:text-[1.08rem] lg:text-[1.16rem]">
                  Bills posture
                </h2>
                <div className="flex items-center gap-2 text-[1.06rem] font-semibold leading-none tracking-tight text-white md:text-[1.34rem] lg:text-[1.48rem]">
                  <span className="size-2.5 rounded-full bg-emerald-400 md:size-3" />
                  Keep every due date in one clear line of sight
                </div>
                <p className="max-w-[30ch] text-[0.9rem] leading-6 text-white/74 md:max-w-[34ch] md:text-[0.93rem] md:leading-7">
                  Track upcoming bills, mark payments once, and let recurring schedules roll forward
                  without manual duplication.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-0 border-t border-white/15 pt-3.5 md:border-0 md:border-l md:border-white/15 md:pl-7 md:pt-0">
                <div className="space-y-2.5 pr-4 md:pr-5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[0.82rem] text-white/70 md:text-[0.88rem]">Due soon</p>
                    <span className="flex size-8.5 items-center justify-center rounded-full bg-emerald-100/95 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200 md:size-9">
                      <CalendarClock className="size-3.5 md:size-[0.95rem]" />
                    </span>
                  </div>
                  <p className="text-[0.96rem] font-semibold tracking-tight text-white md:text-[1.18rem] lg:text-[1.28rem]">
                    {summaryQuery.data?.dueSoonCount ?? 0}
                  </p>
                  <p className="text-[0.78rem] leading-5.5 text-white/64 md:text-[0.82rem] md:leading-6">
                    {summaryQuery.data?.activeBillCount ?? 0} active bills tracked
                  </p>
                </div>

                <div className="space-y-2.5 border-l border-white/15 pl-4 pr-4 md:pr-5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[0.82rem] text-white/70 md:text-[0.88rem]">Overdue</p>
                    <span className="flex size-8.5 items-center justify-center rounded-full bg-sky-100/95 text-sky-700 dark:bg-sky-500/20 dark:text-sky-200 md:size-9">
                      <TriangleAlert className="size-3.5 md:size-[0.95rem]" />
                    </span>
                  </div>
                  <p className="text-[0.96rem] font-semibold tracking-tight text-white md:text-[1.18rem] lg:text-[1.28rem]">
                    {summaryQuery.data?.overdueCount ?? 0}
                  </p>
                  <p className="text-[0.78rem] leading-5.5 text-white/64 md:text-[0.82rem] md:leading-6">
                    Needs payment attention
                  </p>
                </div>
              </div>

              <div className="hidden space-y-2 border-t border-white/15 pt-4 md:block md:border-0 md:border-l md:border-white/15 md:pl-7 md:pt-0">
                <div className="flex items-center gap-2 text-[0.82rem] text-white/70">
                  <ReceiptText className="size-4" />
                  This month impact
                </div>
                <p className="line-clamp-2 text-[0.95rem] font-semibold tracking-tight text-white lg:text-[0.99rem]">
                  Due {formatCurrencyMiliunits(summaryQuery.data?.dueThisMonthAmount ?? 0, "PHP")}
                </p>
                <p className="text-[0.82rem] leading-6 text-white/70">
                  Paid {formatCurrencyMiliunits(summaryQuery.data?.paidThisMonthAmount ?? 0, "PHP")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section>
        <Card className="rounded-[1.4rem] border-white/80 bg-white/84 shadow-[0_24px_70px_-55px_rgba(10,31,34,0.28)] dark:border-white/8 dark:bg-[#182123] dark:shadow-[0_28px_80px_-55px_rgba(0,0,0,0.62)]">
          <CardContent className="space-y-4 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="flex size-8 items-center justify-center rounded-full bg-[#eef6f7] text-[#14656B] dark:bg-[#203032] dark:text-primary">
                    <ShieldAlert className="size-4" />
                  </span>
                  <p className="text-[0.98rem] font-semibold tracking-tight text-[#10292B] dark:text-foreground">
                    30-day cashflow lookahead
                  </p>
                </div>
                <p className="text-[0.8rem] text-muted-foreground">
                  Based on active bills, unpaid loan installments, and liquid accounts.
                </p>
              </div>
              {forecastQuery.data ? (
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.08em] ${forecastRiskTone}`}
                >
                  {forecastRiskLabel}
                </span>
              ) : null}
            </div>

            {forecastQuery.isLoading ? (
              <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-background px-3 py-3 text-[0.86rem] text-muted-foreground dark:bg-[#141d1f]">
                <Loader2 className="size-4 animate-spin" />
                Forecasting cashflow...
              </div>
            ) : forecastQuery.data ? (
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
                <div className="space-y-3">
                  <div className="grid gap-2.5 sm:grid-cols-3">
                    <div className="rounded-xl border border-border/70 bg-background px-3 py-2.5 dark:bg-[#141d1f]">
                      <p className="text-[0.68rem] uppercase tracking-[0.1em] text-muted-foreground">
                        Lowest point
                      </p>
                      <p className="mt-0.5 text-[1rem] font-semibold tracking-tight text-foreground">
                        {formatCurrencyMiliunits(
                          forecastQuery.data.lowestBalance,
                          forecastQuery.data.currency,
                        )}
                      </p>
                      <p className="text-[0.76rem] text-muted-foreground">
                        {formatDateLabel(forecastQuery.data.lowestBalanceDate)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border/70 bg-background px-3 py-2.5 dark:bg-[#141d1f]">
                      <p className="text-[0.68rem] uppercase tracking-[0.1em] text-muted-foreground">
                        Due in 7 days
                      </p>
                      <p className="mt-0.5 text-[1rem] font-semibold tracking-tight text-foreground">
                        {forecastQuery.data.dueSoonCount} obligations
                      </p>
                      <p className="text-[0.76rem] text-muted-foreground">
                        {formatCurrencyMiliunits(
                          forecastQuery.data.dueSoonAmount,
                          forecastQuery.data.currency,
                        )}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border/70 bg-background px-3 py-2.5 dark:bg-[#141d1f]">
                      <p className="text-[0.68rem] uppercase tracking-[0.1em] text-muted-foreground">
                        30-day outflow
                      </p>
                      <p className="mt-0.5 text-[1rem] font-semibold tracking-tight text-foreground">
                        {formatCurrencyMiliunits(
                          forecastQuery.data.obligationsTotal,
                          forecastQuery.data.currency,
                        )}
                      </p>
                      <p className="text-[0.76rem] text-muted-foreground">
                        End balance{" "}
                        {formatCurrencyMiliunits(
                          forecastQuery.data.projectedEndingBalance,
                          forecastQuery.data.currency,
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border/70 bg-background p-3 dark:bg-[#141d1f]">
                    <div className="mb-2 flex items-center justify-between text-[0.75rem] text-muted-foreground">
                      <span>Projected liquid balance</span>
                      <span className="inline-flex items-center gap-1">
                        {forecastTrendDirection === "up" ? (
                          <ArrowUpRight className="size-3.5 text-emerald-600 dark:text-emerald-300" />
                        ) : (
                          <ArrowDownRight className="size-3.5 text-rose-600 dark:text-rose-300" />
                        )}
                        {forecastQuery.data.days} days
                      </span>
                    </div>
                    <div className="h-[6.4rem] w-full max-w-[44rem]">
                      <CashflowProjectionChart
                        points={forecastQuery.data.dailyProjection}
                        height={56}
                        currency={forecastQuery.data.currency}
                        scaleMode="fill"
                      />
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.68rem] text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="size-2 rounded-full border border-[#14656b] bg-[#e9f6f5] dark:border-[#6bd0c2] dark:bg-[#203032]" />
                        Due-date outflow marker
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="size-2 rounded-full border border-rose-500 bg-rose-100 dark:border-rose-300 dark:bg-rose-500/20" />
                        Lowest projected balance
                      </span>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-border/70 bg-background p-3 dark:bg-[#141d1f]">
                  <p className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    Upcoming obligations
                  </p>
                  {forecastQuery.data.topObligations.length > 0 ? (
                    <div className="mt-2 space-y-1.5">
                      {forecastQuery.data.topObligations.slice(0, 4).map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between gap-3 rounded-lg border border-border/65 bg-white/70 px-2.5 py-2 dark:bg-[#111a1c]"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-[0.86rem] font-medium text-foreground">{item.name}</p>
                            <p className="text-[0.75rem] text-muted-foreground">
                              {formatDateLabel(item.dueDate)} ·{" "}
                              {item.sourceType === "bill" ? "Bill" : "Loan installment"}
                            </p>
                          </div>
                          <p className="shrink-0 text-[0.88rem] font-semibold text-foreground">
                            {formatCurrencyMiliunits(item.amount, forecastQuery.data.currency)}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-2 rounded-lg border border-dashed border-border/70 px-3 py-3 text-[0.82rem] text-muted-foreground">
                      No scheduled obligations in the current 30-day window.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border/80 bg-background px-3 py-3 text-[0.86rem] text-muted-foreground dark:bg-[#141d1f]">
                Forecast data is not available yet.
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section>
        <Card className="rounded-[1.4rem] border-white/80 bg-white/84 shadow-[0_24px_70px_-55px_rgba(10,31,34,0.28)] dark:border-white/8 dark:bg-[#182123] dark:shadow-[0_28px_80px_-55px_rgba(0,0,0,0.62)]">
          <CardContent className="space-y-3 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[1rem] font-semibold tracking-tight text-[#10292B] dark:text-foreground">
                Recent bill payments
              </p>
              <p className="text-[0.78rem] text-muted-foreground">
                Last {recentBillPayments.length} activity
              </p>
            </div>
            {recentBillPayments.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/70 px-3 py-3 text-[0.84rem] text-muted-foreground">
                No bill payments yet.
              </div>
            ) : (
              <div className="space-y-1.5">
                {recentBillPayments.map((payment) => (
                  <div
                    key={`${payment.billId}:${payment.paidAt?.toISOString() ?? "unknown"}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border/65 bg-background/80 px-3 py-2.5 dark:bg-[#141d1f]"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[0.86rem] font-medium text-foreground">
                        {payment.billName}
                      </p>
                      <p className="text-[0.75rem] text-muted-foreground">
                        {formatDateLabel(payment.paidAt)} ·{" "}
                        {payment.isLoanLinked ? "Loan-linked repayment" : "Bill payment"}
                      </p>
                    </div>
                    <p className="shrink-0 text-[0.88rem] font-semibold text-foreground">
                      {formatCurrencyMiliunits(payment.amount, payment.currency)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section>
        <Card className="border-white/75 bg-white/84 shadow-[0_24px_70px_-55px_rgba(10,31,34,0.28)] dark:border-white/8 dark:bg-[#182123] dark:shadow-[0_28px_80px_-55px_rgba(0,0,0,0.62)]">
          <CardHeader className="gap-4 px-5 py-5 sm:px-6 sm:py-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-1.5">
                <CardTitle className="text-[1.28rem] tracking-tight text-[#10292B] dark:text-foreground sm:text-[1.4rem]">
                  Upcoming bills
                </CardTitle>
                <CardDescription className="max-w-2xl text-[0.9rem] leading-6 sm:text-[0.94rem] sm:leading-7">
                  Keep recurring obligations visible and mark each payment as it happens so ledger
                  balances stay accurate.
                </CardDescription>
              </div>
              <Button type="button" className="rounded-full" onClick={openCreateDialog}>
                Create bill
              </Button>
            </div>

            <div className="grid gap-2.5 md:grid-cols-[minmax(0,1fr)_180px]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setPage(1);
                  }}
                  placeholder="Search bills..."
                  className="h-10 rounded-full border-border/70 bg-white pl-9 dark:bg-[#162022]"
                />
              </div>
              <Select
                value={status}
                onValueChange={(value) => {
                  setStatus(value as BillStatusFilter);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-10 rounded-full border-border/70 bg-white dark:bg-[#162022]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>

          <CardContent className="space-y-3 px-5 pb-5 sm:px-6 sm:pb-6">
            {listQuery.isLoading ? (
              <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-background px-4 py-4 text-[0.9rem] text-muted-foreground dark:bg-[#141d1f]">
                <Loader2 className="size-4 animate-spin" />
                Loading bills...
              </div>
            ) : bills.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/80 bg-background px-4 py-5 dark:bg-[#141d1f]">
                <p className="text-[0.92rem] font-medium text-foreground">No bills yet.</p>
                <p className="mt-1 text-[0.84rem] text-muted-foreground">
                  Bills UI creation flows are next. The backend contract is ready for create, mark
                  paid, and recurring roll-forward.
                </p>
              </div>
            ) : (
              bills.map((bill) => {
                const linkedAccount = bill.accountId ? accountMap.get(bill.accountId) : null;
                const isLoanLinked = bill.obligationType === "loan_repayment" && Boolean(bill.loanId);
                const isMarkingPaid = markPaid.isPending && markPaid.variables?.billId === bill.id;
                const isCompletingBill =
                  completeBill.isPending && completeBill.variables?.id === bill.id;
                return (
                  <div
                    key={bill.id}
                    className="rounded-[1rem] border border-border/70 bg-background px-3.5 py-3.5 dark:bg-[#141d1f] md:px-4"
                  >
                    <div className="flex flex-col gap-2.5 md:grid md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center md:gap-4">
                      <div className="space-y-1.25">
                        <div className="flex items-center gap-2.5">
                          <span className="flex size-8 items-center justify-center rounded-full bg-[#eef6f7] text-[#14656B] dark:bg-[#203032] dark:text-primary">
                            <ReceiptText className="size-4" />
                          </span>
                          <p className="text-[0.92rem] font-semibold text-foreground">
                            {bill.name}
                          </p>
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.69rem] font-medium ${getStatusTone(
                              bill,
                            )}`}
                          >
                            {getStatusLabel(bill)}
                          </span>
                          {bill.obligationType === "loan_repayment" ? (
                            <span className="inline-flex items-center rounded-full border border-sky-300/60 bg-sky-100/65 px-2 py-0.5 text-[0.69rem] font-medium text-sky-800 dark:border-sky-800/70 dark:bg-sky-950/30 dark:text-sky-300">
                              Linked loan repayment
                            </span>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-[0.79rem] text-muted-foreground">
                          <span className="inline-flex items-center gap-1.5">
                            <CalendarClock className="size-3.5" />
                            Next due {formatDateLabel(bill.nextDueDate)}
                          </span>
                          {linkedAccount ? (
                            <span>Linked account: {linkedAccount.name}</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
                              <TriangleAlert className="size-3.5" />
                              No linked account
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-start gap-1.5 md:justify-end md:text-right">
                        <p className="text-[0.7rem] uppercase tracking-[0.14em] text-muted-foreground">
                          Amount
                        </p>
                        <p className="text-[0.9rem] font-medium tracking-tight text-foreground/90">
                          {formatCurrencyMiliunits(bill.amount, bill.currency)}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 rounded-full px-3 text-[0.8rem]"
                          disabled={isCompletingBill || isMarkingPaid || isLoanLinked}
                          onClick={() => completeBill.mutate({ id: bill.id })}
                        >
                          {isCompletingBill ? (
                            <>
                              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                              Completing...
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="mr-1.5 size-3.5" />
                              Complete
                            </>
                          )}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          className="h-8 rounded-full px-3 text-[0.8rem]"
                          disabled={isMarkingPaid || isCompletingBill || bill.status === "paid"}
                          onClick={() => {
                            if (isLoanLinked && bill.loanId) {
                              setLoanPaymentPreset({
                                loanId: bill.loanId,
                                installmentId: bill.loanInstallmentId ?? undefined,
                                amountMiliunits: bill.nextPendingOccurrence?.amount ?? bill.amount,
                                paidAt: bill.nextPendingOccurrence?.dueDate ?? bill.nextDueDate ?? new Date(),
                                notes: `Loan-linked payment from Bills · ${bill.name}`,
                                sourceAccountId:
                                  linkedAccount?.type === "cash" || linkedAccount?.type === "wallet"
                                    ? linkedAccount.id
                                    : defaultLiquidPaymentAccountId,
                              });
                              return;
                            }

                            markPaid.mutate({
                              billId: bill.id,
                              settleOnly: false,
                              paymentAccountId:
                                linkedAccount?.type === "credit"
                                  ? defaultLiquidPaymentAccountId
                                  : undefined,
                            });
                          }}
                        >
                          {isMarkingPaid ? (
                            <>
                              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                              Posting...
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="mr-1.5 size-3.5" />
                              Mark paid
                            </>
                          )}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          className="h-8 w-8 rounded-full"
                          onClick={() => openEditDialog(bill)}
                          disabled={isCompletingBill || isLoanLinked}
                          aria-label={`Edit ${bill.name}`}
                          title={`Edit ${bill.name}`}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          className="h-8 w-8 rounded-full text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(bill)}
                          disabled={isCompletingBill || isLoanLinked}
                          aria-label={`Delete ${bill.name}`}
                          title={`Delete ${bill.name}`}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                        {isLoanLinked ? (
                          <Button
                            asChild
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 rounded-full px-3 text-[0.8rem]"
                          >
                            <Link href={`/loans/${bill.loanId}`}>View loan</Link>
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })
            )}

            {listQuery.data && listQuery.data.totalPages > 1 ? (
              <div className="flex items-center justify-between pt-1">
                <p className="text-[0.8rem] text-muted-foreground">
                  Page {listQuery.data.page} of {listQuery.data.totalPages}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    disabled={page <= 1}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    disabled={page >= listQuery.data.totalPages}
                    onClick={() =>
                      setPage((current) => Math.min(listQuery.data.totalPages, current + 1))
                    }
                  >
                    Next
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
