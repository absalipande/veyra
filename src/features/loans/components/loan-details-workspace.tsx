"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import { CalendarClock, ChevronRight, HandCoins, Landmark } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrencyMiliunits } from "@/lib/currencies";
import type { AppRouter } from "@/server/api/root";
import { trpc } from "@/trpc/react";
import {
  type LoanPaymentPreset,
  RecordLoanPaymentDialog,
} from "@/features/loans/components/record-loan-payment-dialog";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type LoanItem = RouterOutputs["loans"]["get"];

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "No due date";
  return new Intl.DateTimeFormat("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function formatDaysUntil(value: Date | string | null | undefined) {
  if (!value) return "No due date";
  const due = new Date(value);
  const now = new Date();
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.ceil((dueDay.getTime() - nowDay.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays > 0) return `In ${diffDays} days`;
  if (diffDays === 0) return "Due today";
  return `Overdue by ${Math.abs(diffDays)} days`;
}

function toInputAmount(value: number) {
  return String(value / 1000);
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
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[0.66rem] font-semibold uppercase tracking-[0.1em] ${className}`}
    >
      {label}
    </span>
  );
}

function ProgressRing({ progressPercent }: { progressPercent: number }) {
  const safePercent = Math.max(Math.min(progressPercent, 100), 0);
  return (
    <div className="relative h-14 w-14 shrink-0">
      <svg className="h-14 w-14 -rotate-90" viewBox="0 0 48 48" aria-hidden="true">
        <circle
          cx="24"
          cy="24"
          r="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="5"
          className="text-muted"
        />
        <circle
          cx="24"
          cy="24"
          r="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="5"
          strokeLinecap="round"
          className="text-primary"
          strokeDasharray={`${(safePercent / 100) * 113.1} 113.1`}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-[0.84rem] font-semibold text-foreground">
        {safePercent}%
      </div>
    </div>
  );
}

export function LoanDetailsWorkspace({ loanId }: { loanId: string }) {
  const [paymentPreset, setPaymentPreset] = useState<LoanPaymentPreset | null>(null);
  const [isDesktop, setIsDesktop] = useState(false);
  const loanQuery = trpc.loans.get.useQuery({ id: loanId });
  const accountsQuery = trpc.accounts.list.useQuery();

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const sync = () => setIsDesktop(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  const loan = loanQuery.data;
  const liquidAccounts = useMemo(
    () => (accountsQuery.data ?? []).filter((account) => account.type === "cash" || account.type === "wallet"),
    [accountsQuery.data]
  );

  if (loanQuery.isLoading) {
    return (
      <p className="rounded-xl border border-dashed border-border/70 px-4 py-5 text-sm text-muted-foreground">
        Loading loan details...
      </p>
    );
  }

  if (!loan) {
    return (
      <p className="rounded-xl border border-dashed border-border/70 px-4 py-5 text-sm text-muted-foreground">
        Loan not found.
      </p>
    );
  }

  const timeline = buildRepaymentTimeline(loan);
  const paidAmountTotal = (loan.payments ?? []).reduce((sum, payment) => sum + payment.amount, 0);
  const hasRepaymentSchedule = timeline.length > 0;
  const totalInstallments = loan.installmentCount ?? timeline.length;
  const paidInstallments =
    loan.paidInstallmentCount ?? timeline.filter((entry) => entry.status === "paid").length;
  const progressPercent =
    totalInstallments > 0 ? Math.round((paidInstallments / totalInstallments) * 100) : 0;
  const nextPendingInstallment = timeline.find((entry) => entry.status !== "paid") ?? null;
  const currentDueInstallment = timeline.find((entry) => entry.status === "current") ?? null;

  const loanAmount = loan.principalAmount;
  const remainingPayableAmount =
    timeline.length > 0
      ? timeline.reduce((sum, entry) => sum + Math.max(entry.remainingAmount, 0), 0)
      : Math.max(loan.outstandingAmount, 0);
  const maturityDate =
    timeline.length > 0 ? timeline[timeline.length - 1]?.dueDate : loan.nextDueDate ?? null;

  const openPaymentDialog = (preset?: {
    installmentId?: string;
    amount?: string;
    notes?: string;
    paidAt?: Date | string;
  }) => {
    const parsedAmount =
      typeof preset?.amount === "string" && preset.amount.trim().length > 0
        ? Math.round(Number(preset.amount) * 1000)
        : undefined;

    setPaymentPreset({
      loanId,
      installmentId: preset?.installmentId,
      sourceAccountId: liquidAccounts[0]?.id,
      amountMiliunits: Number.isFinite(parsedAmount) ? parsedAmount : undefined,
      paidAt: preset?.paidAt ?? new Date(),
      notes: preset?.notes ?? "",
    });
  };

  return (
    <div className="space-y-5 pb-24 lg:pb-0">
      <div className="flex items-center gap-2 text-sm">
        <Link href="/loans" className="font-medium text-foreground/85 transition-colors hover:text-foreground">
          Loans
        </Link>
        <span className="text-muted-foreground/60">/</span>
        <p className="text-muted-foreground">Loan details</p>
      </div>

      <div className="rounded-[1.5rem] border border-border/70 bg-card/90 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex size-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
              <Landmark className="size-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-[1.28rem] font-semibold tracking-tight text-foreground sm:text-[1.55rem]">
                  {loan.name}
                </h1>
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
              <p className="mt-1 text-[0.9rem] text-muted-foreground">
                {loan.kind === "institution" ? "Institution" : "Personal"} • {loan.lenderName}
              </p>
            </div>
          </div>
          <Button
            type="button"
            className="h-10 rounded-full bg-[#17393c] px-4 text-[0.9rem] text-white hover:bg-[#1d4a4d]"
            onClick={() => openPaymentDialog({ notes: "Manual payment entry" })}
            disabled={loan.status !== "active"}
          >
            <HandCoins className="mr-1.5 size-4" />
            Record payment
          </Button>
        </div>

        {isDesktop ? (
          <div className="mt-5 overflow-hidden rounded-[1.2rem] border border-border/70 bg-background/80">
            <div className="grid divide-x divide-border/70" style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}>
              <div className="p-4">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Remaining payable
                </p>
                <p className="mt-2 text-[1.05rem] font-semibold tracking-tight text-foreground">
                  {formatCurrencyMiliunits(remainingPayableAmount, loan.currency)}
                </p>
                <p className="mt-1 text-[0.8rem] text-muted-foreground">
                  of {formatCurrencyMiliunits(loan.totalPayable, loan.currency)}
                </p>
              </div>
              <div className="p-4">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Progress
                </p>
                <div className="mt-2 flex items-center gap-3">
                  <ProgressRing progressPercent={progressPercent} />
                  <p className="text-[0.8rem] leading-tight text-muted-foreground">
                    {paidInstallments} of {totalInstallments} payments made
                  </p>
                </div>
              </div>
              <div className="p-4">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Paid to date
                </p>
                <p className="mt-2 text-[1.05rem] font-semibold tracking-tight text-foreground">
                  {formatCurrencyMiliunits(paidAmountTotal, loan.currency)}
                </p>
              </div>
              <div className="p-4">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Next due
                </p>
                <p className="mt-2 text-[1.05rem] font-semibold tracking-tight text-foreground">
                  {formatDate(loan.nextDueDate)}
                </p>
                <p className="mt-1 text-[0.8rem] text-amber-600">{formatDaysUntil(loan.nextDueDate)}</p>
                {nextPendingInstallment ? (
                  <p className="mt-1 text-[0.88rem] font-semibold text-foreground">
                    {formatCurrencyMiliunits(nextPendingInstallment.remainingAmount, loan.currency)}
                  </p>
                ) : null}
              </div>
              <div className="p-4">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Maturity date
                </p>
                <p className="mt-2 text-[1.05rem] font-semibold tracking-tight text-foreground">
                  {formatDate(maturityDate)}
                </p>
                <p className="mt-1 text-[0.8rem] text-muted-foreground">Payments</p>
                <p className="text-[0.9rem] font-semibold text-foreground">
                  {paidInstallments} of {totalInstallments}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-5 overflow-hidden rounded-[1.2rem] border border-border/70 bg-background/80 p-4">
            <div className="grid grid-cols-2 divide-x divide-border/70 rounded-xl border border-border/60">
              <div className="p-3">
                <p className="text-[0.75rem] text-muted-foreground">Remaining payable</p>
                <p className="mt-1 text-[1.8rem] leading-none font-semibold tracking-tight text-foreground">
                  {formatCurrencyMiliunits(remainingPayableAmount, loan.currency)}
                </p>
                <p className="mt-1 text-[0.86rem] text-muted-foreground">
                  of {formatCurrencyMiliunits(loan.totalPayable, loan.currency)}
                </p>
              </div>
              <div className="p-3">
                <p className="text-[0.75rem] text-muted-foreground">Progress</p>
                <div className="mt-2 flex items-center gap-2.5">
                  <ProgressRing progressPercent={progressPercent} />
                  <p className="text-[0.86rem] leading-tight text-muted-foreground">
                    {paidInstallments} of {totalInstallments} payments made
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-3 space-y-2 border-t border-border/70 pt-3 text-[0.95rem]">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Paid to date</span>
                <span className="font-semibold text-foreground">
                  {formatCurrencyMiliunits(paidAmountTotal, loan.currency)}
                </span>
              </div>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-muted-foreground">Next due</p>
                  <p className="font-semibold text-foreground">{formatDate(loan.nextDueDate)}</p>
                  <p className="text-[0.82rem] text-amber-600">{formatDaysUntil(loan.nextDueDate)}</p>
                </div>
                {nextPendingInstallment ? (
                  <span className="pt-6 font-semibold text-foreground">
                    {formatCurrencyMiliunits(nextPendingInstallment.remainingAmount, loan.currency)}
                  </span>
                ) : null}
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Maturity date</span>
                <div className="text-right">
                  <p className="font-semibold text-foreground">{formatDate(maturityDate)}</p>
                  <p className="text-[0.84rem] text-muted-foreground">
                    {paidInstallments} of {totalInstallments}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: isDesktop ? "minmax(0, 1fr) 320px" : "1fr" }}>
        <Card className="border-border/70 bg-card/90">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-[1.1rem] tracking-tight">Repayment schedule</CardTitle>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-[0.86rem] font-medium text-emerald-700 hover:text-emerald-600 dark:text-emerald-300"
              >
                <CalendarClock className="size-4" />
                View full schedule
              </button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {!hasRepaymentSchedule ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-border/70 px-3 py-3 text-[0.82rem] text-muted-foreground sm:px-4 sm:text-[0.9rem]">
                <p>No repayment schedule yet. You can still record payments manually.</p>
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 rounded-full px-3 text-xs"
                  onClick={() => openPaymentDialog({ notes: "Manual payment entry" })}
                  disabled={loan.status !== "active"}
                >
                  Record payment
                </Button>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-border/70 bg-background/70">
                <div className="max-h-[30rem] overflow-y-auto">
                  {timeline.map((entry) =>
                    isDesktop ? (
                      <div
                        key={entry.id}
                        className="grid items-center gap-x-3 gap-y-2 border-b border-border/50 px-4 py-3 text-[0.85rem] last:border-b-0"
                        style={{ gridTemplateColumns: "22px minmax(0, 1fr) 120px 110px 72px" }}
                      >
                        <span
                          className={`size-3 rounded-full border ${
                            entry.status === "paid"
                              ? "border-emerald-600 bg-emerald-600"
                              : entry.status === "current"
                                ? "border-primary bg-primary"
                                : "border-muted-foreground/40 bg-transparent"
                          }`}
                        />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-foreground">{formatDate(entry.dueDate)}</p>
                          <p className="text-[0.78rem] text-muted-foreground">
                            Payment {entry.index} of {entry.total}
                          </p>
                        </div>
                        <p className="text-right font-semibold tabular-nums text-foreground">
                          {formatCurrencyMiliunits(entry.amount, loan.currency)}
                        </p>
                        <div className="flex justify-end">
                          <InstallmentStatusChip status={entry.status} />
                        </div>
                        <div className="flex justify-end">
                          {entry.status !== "paid" && loan.status === "active" ? (
                            <Button
                              type="button"
                              variant="outline"
                              className="h-7 rounded-full px-3 text-[0.76rem]"
                              onClick={() =>
                                openPaymentDialog({
                                  installmentId: entry.id,
                                  amount: toInputAmount(entry.remainingAmount),
                                  paidAt: entry.dueDate,
                                  notes: `Installment ${entry.index}/${entry.total} - ${formatDate(entry.dueDate)}`,
                                })
                              }
                            >
                              Pay
                            </Button>
                          ) : (
                            <span className="text-[0.72rem] text-muted-foreground">—</span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <button
                        key={entry.id}
                        type="button"
                        className="grid w-full grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-3 border-b border-border/50 px-4 py-3 text-left last:border-b-0"
                        onClick={() => {
                          if (entry.status === "paid" || loan.status !== "active") return;
                          openPaymentDialog({
                            installmentId: entry.id,
                            amount: toInputAmount(entry.remainingAmount),
                            paidAt: entry.dueDate,
                            notes: `Installment ${entry.index}/${entry.total} - ${formatDate(entry.dueDate)}`,
                          });
                        }}
                      >
                        <span
                          className={`size-3 rounded-full border ${
                            entry.status === "paid"
                              ? "border-emerald-600 bg-emerald-600"
                              : entry.status === "current"
                                ? "border-primary bg-primary"
                                : "border-muted-foreground/40 bg-transparent"
                          }`}
                        />
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground">{formatDate(entry.dueDate)}</p>
                          <p className="text-[0.78rem] text-muted-foreground">
                            Payment {entry.index} of {entry.total}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            <p className="text-[0.88rem] font-semibold tabular-nums text-foreground">
                              {formatCurrencyMiliunits(entry.amount, loan.currency)}
                            </p>
                            <div className="mt-1 flex justify-end">
                              <InstallmentStatusChip status={entry.status} />
                            </div>
                          </div>
                          <ChevronRight className="size-4 text-muted-foreground/80" />
                        </div>
                      </button>
                    )
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-border/70 bg-card/90">
            <CardHeader className="pb-2">
              <CardTitle className="text-[1.1rem] tracking-tight">Loan details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-[0.9rem]">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Loan amount</span>
                <span className="font-semibold text-foreground">
                  {formatCurrencyMiliunits(loanAmount, loan.currency)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Total payable</span>
                <span className="font-semibold text-foreground">
                  {formatCurrencyMiliunits(loan.totalPayable, loan.currency)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Finance charge</span>
                <span className="font-semibold text-foreground">
                  {formatCurrencyMiliunits(loan.financeCharge, loan.currency)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Payment frequency</span>
                <span className="font-semibold text-foreground">{loan.cadence ?? "Monthly"}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Start date</span>
                <span className="font-semibold text-foreground">{formatDate(loan.disbursedAt)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Maturity date</span>
                <span className="font-semibold text-foreground">{formatDate(maturityDate)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Loan kind</span>
                <span className="font-semibold text-foreground">
                  {loan.kind === "institution" ? "Institution" : "Personal"}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/90">
            <CardHeader className="pb-2">
              <CardTitle className="text-[1.1rem] tracking-tight">Recent payments</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {(loan.payments?.length ?? 0) === 0 ? (
                <p className="rounded-xl border border-dashed border-border/70 px-3 py-3 text-[0.82rem] text-muted-foreground sm:px-4 sm:text-[0.9rem]">
                  No payment records yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {loan.payments.slice(0, 4).map((payment) => (
                    <div
                      key={payment.id}
                      className="flex items-center justify-between rounded-xl border border-border/70 bg-background/70 px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="text-[0.84rem] font-medium text-foreground">{formatDate(payment.paidAt)}</p>
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
        </div>
      </div>

      {!isDesktop && currentDueInstallment && loan.status === "active" ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border/70 bg-background/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
          <Button
            type="button"
            className="h-10 w-full rounded-full bg-[#17393c] text-[0.9rem] text-white hover:bg-[#1d4a4d]"
            onClick={() =>
              openPaymentDialog({
                installmentId: currentDueInstallment.id,
                amount: toInputAmount(currentDueInstallment.remainingAmount),
                paidAt: currentDueInstallment.dueDate,
                notes: `Installment ${currentDueInstallment.index}/${currentDueInstallment.total} - ${formatDate(currentDueInstallment.dueDate)}`,
              })
            }
          >
            Pay {formatCurrencyMiliunits(currentDueInstallment.remainingAmount, loan.currency)} due now
          </Button>
        </div>
      ) : null}

      <RecordLoanPaymentDialog
        key={
          paymentPreset
            ? `${paymentPreset.loanId}:${paymentPreset.installmentId ?? "manual"}:${paymentPreset.amountMiliunits ?? "na"}:${String(paymentPreset.paidAt ?? "")}`
            : "loan-payment-dialog"
        }
        open={paymentPreset !== null}
        preset={paymentPreset}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setPaymentPreset(null);
        }}
      />
    </div>
  );
}
