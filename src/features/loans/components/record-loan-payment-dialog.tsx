"use client";

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { DatePickerField } from "@/components/date-picker/date-picker";
import { Button } from "@/components/ui/button";
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
import { trpc } from "@/trpc/react";

export type LoanPaymentPreset = {
  amountMiliunits?: number;
  installmentId?: string;
  loanId: string;
  notes?: string;
  paidAt?: Date | string;
  sourceAccountId?: string;
};

type PaymentDraft = {
  amount: string;
  installmentId?: string;
  notes: string;
  paidAt: string;
  sourceAccountId: string;
};

const paymentFieldClassName =
  "!h-8 w-full !rounded-[0.75rem] px-2.5 text-[0.74rem] sm:!h-9 sm:!rounded-[0.85rem] sm:px-3 sm:text-[0.84rem]";
const paymentLabelClassName = "text-[0.88rem] font-semibold text-foreground/75 sm:text-[0.82rem]";

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

function toDateInputLocal(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
    Date.UTC(fallback.getFullYear(), fallback.getMonth(), fallback.getDate()),
  );
}

function getInitialDraft(preset: LoanPaymentPreset): PaymentDraft {
  return {
    installmentId: preset.installmentId,
    sourceAccountId: preset.sourceAccountId ?? "",
    amount: typeof preset.amountMiliunits === "number" ? toInputAmount(preset.amountMiliunits) : "",
    paidAt: toDateInputUTC(preset.paidAt) || toDateInputLocal(new Date()),
    notes: preset.notes ?? "",
  };
}

export function RecordLoanPaymentDialog({
  onOpenChange,
  onSuccess,
  open,
  preset,
  title = "Record loan payment",
}: {
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void | Promise<void>;
  open: boolean;
  preset: LoanPaymentPreset | null;
  title?: string;
}) {
  const utils = trpc.useUtils();
  const accountsQuery = trpc.accounts.list.useQuery(undefined, {
    enabled: open,
  });
  const loanQuery = trpc.loans.get.useQuery(
    { id: preset?.loanId ?? "" },
    {
      enabled: open && Boolean(preset?.loanId),
    },
  );
  const [draft, setDraft] = useState<PaymentDraft>(() =>
    preset ? getInitialDraft(preset) : getInitialDraft({ loanId: "" }),
  );

  const liquidAccounts = useMemo(
    () => (accountsQuery.data ?? []).filter((account) => account.type === "cash" || account.type === "wallet"),
    [accountsQuery.data],
  );
  const loan = loanQuery.data;
  const effectiveSourceAccountId = draft.sourceAccountId || liquidAccounts[0]?.id || "";

  const recordPayment = trpc.loans.recordPayment.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.loans.list.invalidate(),
        preset?.loanId ? utils.loans.get.invalidate({ id: preset.loanId }) : Promise.resolve(),
        utils.loans.summary.invalidate(),
        utils.bills.list.invalidate(),
        utils.bills.summary.invalidate(),
        utils.bills.get.invalidate(),
        utils.forecast.summary.invalidate(),
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
      onOpenChange(false);
      await onSuccess?.();
    },
    onError: (error) => toast.error(error.message || "Failed to record payment."),
  });

  if (!preset) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        mobileBehavior="adaptive"
        className="min-h-0 w-full max-w-none overflow-hidden rounded-none border-border/70 bg-background/96 p-0 md:max-w-[27rem]"
      >
        <DialogHeader className="shrink-0 border-b border-border/60 px-5 pb-4 pt-[max(0.95rem,env(safe-area-inset-top))] pr-12 sm:px-6 sm:pb-4.5">
          <DialogTitle className="text-[1.3rem] tracking-tight">
            {draft.installmentId ? "Pay installment" : title}
          </DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto px-5 py-5 sm:px-6 sm:py-5.5">
          <div className="space-y-1.5">
            <label className={paymentLabelClassName}>Amount</label>
            <Input
              value={draft.amount}
              onChange={(event) => setDraft((current) => ({ ...current, amount: event.target.value }))}
              inputMode="decimal"
              className={paymentFieldClassName}
            />
            {loan ? (
              <p className="text-[0.74rem] text-muted-foreground">
                Outstanding: {formatCurrencyMiliunits(loan.outstandingAmount, loan.currency)}
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <label className={paymentLabelClassName}>Payment account</label>
            <Select
              value={effectiveSourceAccountId}
              onValueChange={(value) => setDraft((current) => ({ ...current, sourceAccountId: value }))}
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
              value={draft.paidAt}
              onChange={(value) => setDraft((current) => ({ ...current, paidAt: value }))}
              className={paymentFieldClassName}
            />
          </div>
          <div className="space-y-1.5">
            <label className={paymentLabelClassName}>Notes</label>
            <Input
              value={draft.notes}
              onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
              className={paymentFieldClassName}
            />
          </div>
        </div>
        <DialogFooter className="sticky bottom-0 z-10 !mx-0 !-mb-0 flex-row items-center justify-end gap-2 border-t border-border/60 bg-background/90 px-5 pb-[max(0.8rem,env(safe-area-inset-bottom))] pt-3.5 sm:px-6 [&>button]:w-auto">
          <Button type="button" variant="outline" className="h-10 rounded-full px-5 text-base" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            className="h-10 rounded-full bg-[#17393c] px-5 text-base text-white hover:bg-[#1d4a4d]"
            disabled={recordPayment.isPending || loanQuery.isLoading}
            onClick={() => {
              const amount = parseMoneyToMiliunits(draft.amount);
              if (!amount || amount <= 0) {
                toast.error("Enter a valid payment amount.");
                return;
              }
              if (!effectiveSourceAccountId) {
                toast.error("Choose a payment account.");
                return;
              }
              recordPayment.mutate({
                loanId: preset.loanId,
                installmentId: draft.installmentId || undefined,
                sourceAccountId: effectiveSourceAccountId,
                amount,
                paidAt: parseDateOnlyToUTC(draft.paidAt) ?? new Date(draft.paidAt),
                notes: draft.notes.trim() || undefined,
              });
            }}
          >
            {recordPayment.isPending ? (
              <>
                <Loader2 className="mr-1.5 size-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Confirm payment"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
