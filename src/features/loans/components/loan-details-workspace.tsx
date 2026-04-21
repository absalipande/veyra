"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import { Circle, CircleCheck, HandCoins } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DatePickerField } from "@/components/date-picker/date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrencyMiliunits } from "@/lib/currencies";
import type { AppRouter } from "@/server/api/root";
import { trpc } from "@/trpc/react";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type LoanItem = RouterOutputs["loans"]["get"];

type PaymentDraft = {
  installmentId?: string;
  sourceAccountId: string;
  amount: string;
  paidAt: string;
  notes: string;
};

const paymentFieldClassName =
  "!h-8 w-full !rounded-[0.75rem] px-2.5 text-[0.74rem] sm:!h-9 sm:!rounded-[0.85rem] sm:px-3 sm:text-[0.84rem]";
const paymentLabelClassName = "text-[0.88rem] font-semibold text-foreground/75 sm:text-[0.82rem]";

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "No due date";
  return new Intl.DateTimeFormat("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function toInputAmount(value: number) {
  return String(value / 1000);
}

function parseMoneyToMiliunits(value: string) {
  const normalized = value.trim().replace(/,/g, "");
  if (!normalized) return null;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 1000);
}

function toDateInputUTC(value: Date | string | null | undefined) {
  if (!value) return "";
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "";
  const year = parsed.getUTCFullYear();
  const month = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  const day = String(parsed.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toDateInputLocal(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateOnlyToUTC(value: string) {
  const raw = value.trim();
  if (!raw) return null;

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    return new Date(Date.UTC(year, month - 1, day));
  }

  const fallback = new Date(raw);
  if (!Number.isFinite(fallback.getTime())) return null;
  return new Date(
    Date.UTC(fallback.getFullYear(), fallback.getMonth(), fallback.getDate())
  );
}

function buildRepaymentTimeline(loan: LoanItem) {
  const installments = [...(loan.installments ?? [])].sort(
    (left, right) => new Date(left.dueDate).getTime() - new Date(right.dueDate).getTime()
  );
  if (installments.length === 0) return [];
  return installments.map((installment, index) => {
    const isPaid = installment.status === "paid";
    const status: "paid" | "current" | "upcoming" = isPaid
      ? "paid"
      : loan.nextDueDate &&
          toDateInputUTC(installment.dueDate) === toDateInputUTC(loan.nextDueDate)
        ? "current"
        : "upcoming";

    return {
      ...installment,
      index: index + 1,
      total: installments.length,
      status,
      remainingAmount:
        typeof installment.remainingAmount === "number"
          ? installment.remainingAmount
          : Math.max(installment.amount - (installment.paidAmount ?? 0), 0),
    };
  });
}

function InstallmentStatusChip({ status }: { status: "paid" | "current" | "upcoming" }) {
  const label = status === "paid" ? "Paid" : status === "current" ? "Due now" : "Upcoming";
  const className =
    status === "paid"
      ? "border-emerald-600/30 bg-emerald-600/12 text-emerald-700 dark:text-emerald-300"
      : status === "current"
        ? "border-primary/35 bg-primary/12 text-primary"
        : "border-border/70 bg-muted/45 text-muted-foreground";

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] ${className}`}>
      {label}
    </span>
  );
}

export function LoanDetailsWorkspace({ loanId }: { loanId: string }) {
  const utils = trpc.useUtils();
  const [paymentDraft, setPaymentDraft] = useState<PaymentDraft | null>(null);
  const loanQuery = trpc.loans.get.useQuery({ id: loanId });
  const accountsQuery = trpc.accounts.list.useQuery();

  const recordPayment = trpc.loans.recordPayment.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.loans.get.invalidate({ id: loanId }),
        utils.loans.list.invalidate(),
        utils.loans.summary.invalidate(),
        utils.ai.loansInsight.invalidate(),
        utils.ai.dashboardInsight.invalidate(),
        utils.ai.accountsInsight.invalidate(),
        utils.ai.transactionsInsight.invalidate(),
        utils.accounts.list.invalidate(),
        utils.accounts.summary.invalidate(),
        utils.transactions.list.invalidate(),
        utils.transactions.summary.invalidate(),
      ]);
      toast.success("Loan payment recorded.");
      setPaymentDraft(null);
    },
    onError: (error) => toast.error(error.message || "Failed to record payment."),
  });

  const loan = loanQuery.data;
  const liquidAccounts = useMemo(
    () => (accountsQuery.data ?? []).filter((account) => account.type === "cash" || account.type === "wallet"),
    [accountsQuery.data]
  );
  if (loanQuery.isLoading) {
    return <p className="rounded-xl border border-dashed border-border/70 px-4 py-5 text-sm text-muted-foreground">Loading loan details...</p>;
  }

  if (!loan) {
    return <p className="rounded-xl border border-dashed border-border/70 px-4 py-5 text-sm text-muted-foreground">Loan not found.</p>;
  }

  const timeline = buildRepaymentTimeline(loan);
  const paidAmountTotal = (loan.payments ?? []).reduce((sum, payment) => sum + payment.amount, 0);
  const hasRepaymentSchedule = timeline.length > 0;
  const paymentCount = loan.payments?.length ?? 0;
  const lastPayment = loan.payments?.[0];

  const openPaymentDialog = (preset?: {
    installmentId?: string;
    amount?: string;
    notes?: string;
  }) => {
    setPaymentDraft({
      installmentId: preset?.installmentId,
      sourceAccountId: liquidAccounts[0]?.id ?? "",
      amount: preset?.amount ?? "",
      paidAt: toDateInputLocal(new Date()),
      notes: preset?.notes ?? "",
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <Link
            href="/loans"
            className="font-medium text-foreground/85 transition-colors hover:text-foreground"
          >
            Loans
          </Link>
          <span className="text-muted-foreground/60">/</span>
          <p className="text-muted-foreground">Loan details</p>
        </div>
        <Button
          type="button"
          className="h-8 rounded-full bg-[#17393c] px-3.5 text-xs text-white hover:bg-[#1d4a4d]"
          onClick={() =>
            openPaymentDialog({
              notes: "Manual payment entry",
            })
          }
          disabled={loan.status !== "active"}
        >
          <HandCoins className="mr-1.5 size-3.5" />
          Record payment
        </Button>
      </div>

      <Card className="border-border/70 bg-card/90">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-[1.35rem] tracking-tight">{loan.name}</CardTitle>
            <span
              className={`inline-flex rounded-full border px-2.5 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.14em] ${
                loan.status === "active"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300"
                  : "border-border bg-muted text-muted-foreground"
              }`}
            >
              {loan.status}
            </span>
          </div>
          <p className="text-[0.9rem] text-muted-foreground">
            {loan.kind === "institution" ? "Institution" : "Personal"} · {loan.lenderName}
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="border-border/70 bg-card/80">
              <CardContent className="space-y-1.5 p-3.5">
                <p className="text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Remaining
                </p>
                <p className="text-[1.08rem] font-semibold tracking-tight text-foreground sm:text-[1.18rem]">
                  {formatCurrencyMiliunits(loan.outstandingAmount, loan.currency)}
                </p>
              </CardContent>
            </Card>
            <Card className="border-border/70 bg-card/80">
              <CardContent className="space-y-1.5 p-3.5">
                <p className="text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Paid to date
                </p>
                <p className="text-[0.96rem] font-semibold tracking-tight text-foreground sm:text-[1.02rem]">
                  {formatCurrencyMiliunits(paidAmountTotal, loan.currency)}
                </p>
              </CardContent>
            </Card>
            {hasRepaymentSchedule ? (
              <>
                <Card className="border-border/70 bg-card/80">
                  <CardContent className="space-y-1.5 p-3.5">
                    <p className="text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      Next due
                    </p>
                    <p className="text-[0.96rem] font-semibold tracking-tight text-foreground sm:text-[1.02rem]">
                      {loan.nextDueDate ? formatDate(loan.nextDueDate) : "No due date"}
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-border/70 bg-card/80">
                  <CardContent className="space-y-1.5 p-3.5">
                    <p className="text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      Progress
                    </p>
                    <p className="text-[0.96rem] font-semibold tracking-tight text-foreground sm:text-[1.02rem]">
                      {loan.paidInstallmentCount ?? 0}/{loan.installmentCount ?? timeline.length} paid
                    </p>
                  </CardContent>
                </Card>
              </>
            ) : (
              <>
                <Card className="border-border/70 bg-card/80">
                  <CardContent className="space-y-1.5 p-3.5">
                    <p className="text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      Last payment
                    </p>
                    <p className="text-[0.96rem] font-semibold tracking-tight text-foreground sm:text-[1.02rem]">
                      {lastPayment ? formatDate(lastPayment.paidAt) : "No payments yet"}
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-border/70 bg-card/80">
                  <CardContent className="space-y-1.5 p-3.5">
                    <p className="text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      Payment count
                    </p>
                    <p className="text-[0.96rem] font-semibold tracking-tight text-foreground sm:text-[1.02rem]">
                      {paymentCount} logged
                    </p>
                  </CardContent>
                </Card>
              </>
            )}
          </div>

          <Card className="border-border/70 bg-card/80">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Repayment plan</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {!hasRepaymentSchedule ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-border/70 px-3 py-3 text-[0.82rem] text-muted-foreground sm:px-4 sm:text-[0.9rem]">
                  <p>No repayment schedule yet. You can still record payments manually.</p>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-8 rounded-full px-3 text-xs"
                    onClick={() =>
                      openPaymentDialog({
                        notes: "Manual payment entry",
                      })
                    }
                    disabled={loan.status !== "active"}
                  >
                    Record payment
                  </Button>
                </div>
              ) : (
                <div className="relative space-y-2.5">
                  <div className="absolute bottom-4 left-[0.82rem] top-4 w-px bg-border/60 sm:hidden" />
                  {timeline.map((entry) => (
                    <div
                      key={entry.id}
                      className={`relative rounded-xl border bg-background/70 px-3 py-3 pl-7 sm:px-4 sm:py-3.5 sm:pl-4 ${
                        entry.status === "current" ? "border-primary/35 bg-primary/8" : "border-border/70"
                      }`}
                    >
                      <span
                        className={`absolute left-[0.63rem] top-4 z-[1] size-3 rounded-full border sm:hidden ${
                          entry.status === "paid"
                            ? "border-emerald-600 bg-emerald-600"
                            : entry.status === "current"
                              ? "border-primary bg-primary"
                              : "border-muted-foreground/50 bg-background"
                        }`}
                      />
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2.5">
                            {entry.status === "paid" ? (
                              <CircleCheck className="hidden size-4 text-emerald-600 sm:block" />
                            ) : entry.status === "current" ? (
                              <Circle className="hidden size-4 fill-primary text-primary sm:block" />
                            ) : (
                              <Circle className="hidden size-4 text-muted-foreground/70 sm:block" />
                            )}
                            <p className="text-[0.96rem] font-semibold text-foreground sm:text-[1.02rem]">
                              {formatDate(entry.dueDate)}
                            </p>
                          </div>
                          <p
                            className={`text-[0.78rem] sm:text-[0.84rem] ${
                              entry.status === "paid"
                                ? "text-emerald-600"
                                : entry.status === "current"
                                  ? "text-primary"
                                  : "text-muted-foreground"
                            }`}
                          >
                            {entry.index}/{entry.total}{" "}
                            {entry.status === "paid"
                              ? "paid"
                              : entry.status === "current"
                                ? "to pay now"
                                : "to pay"}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <InstallmentStatusChip status={entry.status} />
                          <p className="text-[1rem] font-semibold text-foreground sm:text-[1.06rem]">
                            {formatCurrencyMiliunits(entry.amount, loan.currency)}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 flex justify-end">
                        {entry.status !== "paid" && loan.status === "active" ? (
                          <Button
                            type="button"
                            variant="outline"
                            className="h-8 rounded-full px-3.5 text-xs"
                            onClick={() =>
                              openPaymentDialog({
                                installmentId: entry.id,
                                amount: toInputAmount(entry.remainingAmount),
                                notes: `Installment ${entry.index}/${entry.total} - ${formatDate(entry.dueDate)}`,
                              })
                            }
                          >
                            Pay loan
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/80">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Payment history</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {(loan.payments?.length ?? 0) === 0 ? (
                <p className="rounded-xl border border-dashed border-border/70 px-3 py-3 text-[0.82rem] text-muted-foreground sm:px-4 sm:text-[0.9rem]">
                  No payment records yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {loan.payments.slice(0, 8).map((payment) => (
                    <div
                      key={payment.id}
                      className="flex items-center justify-between rounded-xl border border-border/70 bg-background/70 px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="text-[0.85rem] font-medium text-foreground">
                          {formatDate(payment.paidAt)}
                        </p>
                        <p className="truncate text-[0.74rem] text-muted-foreground">
                          {payment.notes?.trim() || "Loan payment"}
                        </p>
                      </div>
                      <p className="text-[0.9rem] font-semibold text-foreground">
                        {formatCurrencyMiliunits(payment.amount, loan.currency)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </CardContent>
      </Card>

      <Dialog open={paymentDraft !== null} onOpenChange={(nextOpen) => !nextOpen && setPaymentDraft(null)}>
        <DialogContent
          mobileBehavior="adaptive"
          className="min-h-0 w-full max-w-none overflow-hidden rounded-none border-border/70 bg-background/96 p-0 md:max-w-[27rem]"
        >
          <DialogHeader className="shrink-0 border-b border-border/60 px-5 pb-4 pt-[max(0.95rem,env(safe-area-inset-top))] pr-12 sm:px-6 sm:pb-4.5">
            <DialogTitle className="text-[1.3rem] tracking-tight">
              {paymentDraft?.installmentId ? "Pay installment" : "Record loan payment"}
            </DialogTitle>
          </DialogHeader>
          {paymentDraft ? (
            <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto px-5 py-5 sm:px-6 sm:py-5.5">
              <div className="space-y-1.5">
                <label className={paymentLabelClassName}>Amount</label>
                <Input
                  value={paymentDraft.amount}
                  onChange={(event) =>
                    setPaymentDraft((current) => (current ? { ...current, amount: event.target.value } : current))
                  }
                  inputMode="decimal"
                  className={paymentFieldClassName}
                />
                <p className="text-[0.74rem] text-muted-foreground">
                  Outstanding: {formatCurrencyMiliunits(loan.outstandingAmount, loan.currency)}
                </p>
              </div>
              <div className="space-y-1.5">
                <label className={paymentLabelClassName}>Payment account</label>
                <Select
                  value={paymentDraft.sourceAccountId}
                  onValueChange={(value) =>
                    setPaymentDraft((current) => (current ? { ...current, sourceAccountId: value } : current))
                  }
                >
                  <SelectTrigger className={paymentFieldClassName}>
                    <SelectValue placeholder="Select account" />
                  </SelectTrigger>
                  <SelectContent>
                    {liquidAccounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name} · {account.currency}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className={paymentLabelClassName}>Payment date</label>
                <DatePickerField
                  value={paymentDraft.paidAt}
                  onChange={(value) =>
                    setPaymentDraft((current) => (current ? { ...current, paidAt: value } : current))
                  }
                  className={paymentFieldClassName}
                />
              </div>
              <div className="space-y-1.5">
                <label className={paymentLabelClassName}>Notes</label>
                <Input
                  value={paymentDraft.notes}
                  onChange={(event) =>
                    setPaymentDraft((current) => (current ? { ...current, notes: event.target.value } : current))
                  }
                  className={paymentFieldClassName}
                />
              </div>
            </div>
          ) : null}
          <DialogFooter className="sticky bottom-0 z-10 !mx-0 !-mb-0 flex-row items-center justify-end gap-2 border-t border-border/60 bg-background/90 px-5 pb-[max(0.8rem,env(safe-area-inset-bottom))] pt-3.5 sm:px-6 [&>button]:w-auto">
            <Button type="button" variant="outline" className="h-10 rounded-full px-5 text-base" onClick={() => setPaymentDraft(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="h-10 rounded-full bg-[#17393c] px-5 text-base text-white hover:bg-[#1d4a4d]"
              disabled={recordPayment.isPending}
              onClick={() => {
                if (!paymentDraft) return;
                const amount = parseMoneyToMiliunits(paymentDraft.amount);
                if (!amount || amount <= 0) {
                  toast.error("Enter a valid payment amount.");
                  return;
                }
                if (!paymentDraft.sourceAccountId) {
                  toast.error("Choose a payment account.");
                  return;
                }
                recordPayment.mutate({
                  loanId,
                  installmentId: paymentDraft.installmentId || undefined,
                  sourceAccountId: paymentDraft.sourceAccountId,
                  amount,
                  paidAt: parseDateOnlyToUTC(paymentDraft.paidAt) ?? new Date(paymentDraft.paidAt),
                  notes: paymentDraft.notes.trim() || undefined,
                });
              }}
            >
              {recordPayment.isPending ? "Saving..." : "Confirm payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
