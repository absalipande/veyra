"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import { ArrowLeft, Circle, CircleCheck } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrencyMiliunits } from "@/lib/currencies";
import type { AppRouter } from "@/server/api/root";
import { trpc } from "@/trpc/react";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type LoanItem = RouterOutputs["loans"]["get"];

type PaymentDraft = {
  installmentId: string;
  sourceAccountId: string;
  amount: string;
  paidAt: string;
  notes: string;
};

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
          new Date(installment.dueDate).toISOString().slice(0, 10) ===
            new Date(loan.nextDueDate).toISOString().slice(0, 10)
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
        utils.accounts.list.invalidate(),
        utils.accounts.summary.invalidate(),
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

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Button asChild type="button" variant="outline" className="h-8 rounded-full px-3 text-xs">
          <Link href="/loans">
            <ArrowLeft className="size-3.5" />
            Back to loans
          </Link>
        </Button>
        <p className="text-sm text-muted-foreground">Loan details</p>
      </div>

      <Card className="border-border/70 bg-card/90">
        <CardHeader className="pb-2">
          <CardTitle className="text-xl">{loan.name}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {loan.kind === "institution" ? "Institution" : "Personal"} · {loan.lenderName}
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2.5 sm:grid-cols-3">
            <Card className="border-border/70 bg-card/80">
              <CardContent className="space-y-1.5 p-3.5">
                <p className="text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Remaining
                </p>
                <p className="text-[1.25rem] font-semibold tracking-tight text-foreground sm:text-[1.45rem]">
                  {formatCurrencyMiliunits(loan.outstandingAmount, loan.currency)}
                </p>
              </CardContent>
            </Card>
            <Card className="border-border/70 bg-card/80">
              <CardContent className="space-y-1.5 p-3.5">
                <p className="text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Next due
                </p>
                <p className="text-[1rem] font-semibold tracking-tight text-foreground sm:text-[1.1rem]">
                  {loan.nextDueDate ? formatDate(loan.nextDueDate) : "No due date"}
                </p>
              </CardContent>
            </Card>
            <Card className="border-border/70 bg-card/80">
              <CardContent className="space-y-1.5 p-3.5">
                <p className="text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Progress
                </p>
                <p className="text-[1rem] font-semibold tracking-tight text-foreground sm:text-[1.1rem]">
                  {loan.paidInstallmentCount ?? 0}/{loan.installmentCount ?? timeline.length} paid
                </p>
              </CardContent>
            </Card>
          </div>

          <Card className="border-border/70 bg-card/80">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Repayment plan</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {timeline.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border/70 px-3 py-3 text-[0.82rem] text-muted-foreground sm:px-4 sm:text-[0.9rem]">
                  No repayment schedule yet.
                </p>
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
                              setPaymentDraft({
                                installmentId: entry.id,
                                sourceAccountId: liquidAccounts[0]?.id ?? "",
                                amount: toInputAmount(entry.remainingAmount),
                                paidAt: new Date().toISOString().slice(0, 10),
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
        </CardContent>
      </Card>

      <Dialog open={paymentDraft !== null} onOpenChange={(nextOpen) => !nextOpen && setPaymentDraft(null)}>
        <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-md overflow-y-auto rounded-[1.35rem] border-border/70 bg-background/96 p-0">
          <DialogHeader className="border-b border-border/60 px-4 pb-3.5 pt-[max(0.85rem,env(safe-area-inset-top))] pr-12">
            <DialogTitle className="text-[1.12rem] tracking-tight">Pay installment</DialogTitle>
          </DialogHeader>
          {paymentDraft ? (
            <div className="space-y-3 px-4 py-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Amount</label>
                <Input
                  value={paymentDraft.amount}
                  onChange={(event) =>
                    setPaymentDraft((current) => (current ? { ...current, amount: event.target.value } : current))
                  }
                  inputMode="decimal"
                  className="h-9 rounded-lg"
                />
                <p className="text-[0.72rem] text-muted-foreground">
                  Outstanding: {formatCurrencyMiliunits(loan.outstandingAmount, loan.currency)}
                </p>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Payment account</label>
                <Select
                  value={paymentDraft.sourceAccountId}
                  onValueChange={(value) =>
                    setPaymentDraft((current) => (current ? { ...current, sourceAccountId: value } : current))
                  }
                >
                  <SelectTrigger className="h-9 rounded-lg">
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
                <label className="text-xs font-medium text-muted-foreground">Payment date</label>
                <Input
                  type="date"
                  value={paymentDraft.paidAt}
                  onChange={(event) =>
                    setPaymentDraft((current) => (current ? { ...current, paidAt: event.target.value } : current))
                  }
                  className="h-9 rounded-lg"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Notes</label>
                <Input
                  value={paymentDraft.notes}
                  onChange={(event) =>
                    setPaymentDraft((current) => (current ? { ...current, notes: event.target.value } : current))
                  }
                  className="h-9 rounded-lg"
                />
              </div>
            </div>
          ) : null}
          <DialogFooter className="!mx-0 !-mb-0 flex-row items-center justify-end gap-2 border-t border-border/60 bg-transparent px-4 py-4 [&>button]:w-auto">
            <Button type="button" variant="outline" className="h-9 rounded-lg px-4 text-sm" onClick={() => setPaymentDraft(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="h-9 rounded-lg bg-[#17393c] px-4 text-sm text-white hover:bg-[#1d4a4d]"
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
                  installmentId: paymentDraft.installmentId,
                  sourceAccountId: paymentDraft.sourceAccountId,
                  amount,
                  paidAt: new Date(paymentDraft.paidAt),
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
