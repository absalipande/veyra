"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import {
  CalendarClock,
  HandCoins,
  Landmark,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  formatCurrencyMiliunits,
  isSupportedCurrency,
  supportedCurrencies,
} from "@/lib/currencies";
import type { AppRouter } from "@/server/api/root";
import { trpc } from "@/trpc/react";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type LoanItem = RouterOutputs["loans"]["list"]["items"][number];
type AccountItem = RouterOutputs["accounts"]["list"][number];

type LoanKind = LoanItem["kind"];
type LoanStatus = LoanItem["status"];
type LoanCadence = NonNullable<LoanItem["cadence"]>;
type RepaymentMode = "auto" | "manual";
type InstallmentDraft = {
  id: string;
  dueDate: string;
  amount: string;
  principalAmount: string;
  interestAmount: string;
};

type LoanDraft = {
  id: string | null;
  kind: LoanKind;
  name: string;
  lenderName: string;
  currency: (typeof supportedCurrencies)[number];
  principalAmount: string;
  outstandingAmount: string;
  disbursedAt: string;
  status: LoanStatus;
  destinationAccountId: string;
  underlyingLoanAccountId: string;
  cadence: LoanCadence | "none";
  notes: string;
  metadata: string;
  autoCreateUnderlyingAccount: boolean;
  createOpeningDisbursement: boolean;
  openingDisbursementAmount: string;
  repaymentMode: RepaymentMode;
  autoMonthlyPayment: string;
  autoInstallmentCount: string;
  autoFirstDueDate: string;
  autoMonthlyRate: string;
  autoTotalPayable: string;
  repaymentPlan: InstallmentDraft[];
};

type DeleteTarget = {
  id: string;
  name: string;
} | null;

const initialDraft: LoanDraft = {
  id: null,
  kind: "institution",
  name: "",
  lenderName: "",
  currency: "PHP",
  principalAmount: "",
  outstandingAmount: "",
  disbursedAt: new Date().toISOString().slice(0, 10),
  status: "active",
  destinationAccountId: "",
  underlyingLoanAccountId: "auto",
  cadence: "none",
  notes: "",
  metadata: "",
  autoCreateUnderlyingAccount: true,
  createOpeningDisbursement: false,
  openingDisbursementAmount: "",
  repaymentMode: "auto",
  autoMonthlyPayment: "",
  autoInstallmentCount: "",
  autoFirstDueDate: "",
  autoMonthlyRate: "",
  autoTotalPayable: "",
  repaymentPlan: [],
};

const loanFieldClassName = "h-9 w-full rounded-lg px-3 text-sm sm:h-11 sm:rounded-xl sm:px-4 sm:text-[0.98rem]";
const loanLabelClassName = "text-[0.84rem] font-medium text-foreground sm:text-[0.92rem]";

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "No due date";

  return new Intl.DateTimeFormat("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function parseMoneyToMiliunits(value: string) {
  const normalized = value.trim().replace(/,/g, "");
  if (!normalized) return null;

  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) {
    return null;
  }

  return Math.round(amount * 1000);
}

function toInputAmount(value: number) {
  return String(value / 1000);
}

function createInstallmentDraft(): InstallmentDraft {
  return {
    id: crypto.randomUUID(),
    dueDate: "",
    amount: "",
    principalAmount: "",
    interestAmount: "",
  };
}

function addMonths(input: Date, monthsToAdd: number) {
  const copy = new Date(input);
  copy.setMonth(copy.getMonth() + monthsToAdd);
  return copy;
}

function toMoneyInput(value: number) {
  return (value / 1000).toFixed(2);
}

function simulateScheduleByRate(input: {
  principalAmount: number;
  monthlyPayment: number;
  installmentCount: number;
  monthlyRate: number;
}) {
  let balance = input.principalAmount;
  let totalPaid = 0;
  const rows: Array<{ amount: number; principal: number; interest: number; balanceAfter: number }> = [];

  for (let index = 0; index < input.installmentCount; index += 1) {
    const interest = Math.max(Math.round(balance * input.monthlyRate), 0);
    const isLast = index === input.installmentCount - 1;
    const amount = isLast ? balance + interest : Math.min(input.monthlyPayment, balance + interest);
    const principal = Math.max(Math.min(amount - interest, balance), 0);
    balance = Math.max(balance - principal, 0);
    totalPaid += amount;
    rows.push({ amount, principal, interest: Math.max(amount - principal, 0), balanceAfter: balance });
  }

  return {
    totalPaid,
    rows,
  };
}

function inferMonthlyRateFromTargetTotal(input: {
  principalAmount: number;
  monthlyPayment: number;
  installmentCount: number;
  targetTotalPayable: number;
}) {
  if (input.installmentCount <= 0 || input.monthlyPayment <= 0 || input.targetTotalPayable <= 0) {
    return null;
  }

  let low = 0;
  let high = 0.2;
  let highSimulation = simulateScheduleByRate({
    principalAmount: input.principalAmount,
    monthlyPayment: input.monthlyPayment,
    installmentCount: input.installmentCount,
    monthlyRate: high,
  });

  while (highSimulation.totalPaid < input.targetTotalPayable && high < 1) {
    high *= 1.6;
    highSimulation = simulateScheduleByRate({
      principalAmount: input.principalAmount,
      monthlyPayment: input.monthlyPayment,
      installmentCount: input.installmentCount,
      monthlyRate: high,
    });
  }

  for (let step = 0; step < 50; step += 1) {
    const mid = (low + high) / 2;
    const simulation = simulateScheduleByRate({
      principalAmount: input.principalAmount,
      monthlyPayment: input.monthlyPayment,
      installmentCount: input.installmentCount,
      monthlyRate: mid,
    });
    if (simulation.totalPaid < input.targetTotalPayable) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return (low + high) / 2;
}

function buildAutoRepaymentPlan(input: {
  principalAmount: number;
  monthlyPayment: number;
  installmentCount: number;
  firstDueDate: string;
  monthlyRatePercent?: number;
  totalPayable?: number;
}) {
  const firstDueDate = new Date(input.firstDueDate);
  if (
    !Number.isFinite(firstDueDate.getTime()) ||
    input.monthlyPayment <= 0 ||
    input.installmentCount <= 0
  ) {
    return [] as InstallmentDraft[];
  }

  const plan: InstallmentDraft[] = [];
  const monthlyRate = input.monthlyRatePercent && input.monthlyRatePercent > 0
    ? input.monthlyRatePercent / 100
    : input.totalPayable && input.totalPayable > 0
      ? inferMonthlyRateFromTargetTotal({
          principalAmount: input.principalAmount,
          monthlyPayment: input.monthlyPayment,
          installmentCount: input.installmentCount,
          targetTotalPayable: input.totalPayable,
        })
      : null;

  if (monthlyRate) {
    const simulation = simulateScheduleByRate({
      principalAmount: input.principalAmount,
      monthlyPayment: input.monthlyPayment,
      installmentCount: input.installmentCount,
      monthlyRate,
    });
    for (let index = 0; index < simulation.rows.length; index += 1) {
      const dueDate = addMonths(firstDueDate, index);
      const row = simulation.rows[index];
      plan.push({
        id: crypto.randomUUID(),
        dueDate: dueDate.toISOString().slice(0, 10),
        amount: toMoneyInput(row.amount),
        principalAmount: toMoneyInput(row.principal),
        interestAmount: toMoneyInput(row.interest),
      });
    }
    return plan;
  }

  const targetTotalPayable =
    input.totalPayable && input.totalPayable > 0
      ? input.totalPayable
      : input.monthlyPayment * input.installmentCount;
  const financeCharge = Math.max(targetTotalPayable - input.principalAmount, 0);
  let assignedFinance = 0;

  for (let index = 0; index < input.installmentCount; index += 1) {
    const dueDate = addMonths(firstDueDate, index);
    const isLast = index === input.installmentCount - 1;
    const amount = isLast
      ? Math.max(targetTotalPayable - input.monthlyPayment * (input.installmentCount - 1), 0)
      : input.monthlyPayment;
    const interest = isLast
      ? Math.max(financeCharge - assignedFinance, 0)
      : Math.round(financeCharge * (amount / Math.max(targetTotalPayable, 1)));
    assignedFinance += interest;
    const principal = Math.max(amount - interest, 0);

    plan.push({
      id: crypto.randomUUID(),
      dueDate: dueDate.toISOString().slice(0, 10),
      amount: toMoneyInput(amount),
      principalAmount: toMoneyInput(principal),
      interestAmount: toMoneyInput(Math.max(amount - principal, 0)),
    });
  }

  return plan;
}

function getAccountTypeLabel(type: AccountItem["type"]) {
  switch (type) {
    case "cash":
      return "Bank";
    case "wallet":
      return "Wallet";
    case "credit":
      return "Credit";
    case "loan":
      return "Loan";
    default:
      return type;
  }
}

export function LoansWorkspace({ initialQuery = "" }: { initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [open, setOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [draft, setDraft] = useState<LoanDraft>(initialDraft);
  const [formError, setFormError] = useState<string | null>(null);
  const summaryScrollerRef = useRef<HTMLDivElement | null>(null);
  const [activeSummaryIndex, setActiveSummaryIndex] = useState(0);

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  const utils = trpc.useUtils();

  const loansQuery = trpc.loans.list.useQuery({
    page: 1,
    pageSize: 20,
    search: query,
    status: "all",
  });
  const summaryQuery = trpc.loans.summary.useQuery();
  const accountsQuery = trpc.accounts.list.useQuery();

  const createLoan = trpc.loans.create.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.loans.list.invalidate(),
        utils.loans.summary.invalidate(),
        utils.accounts.list.invalidate(),
        utils.accounts.summary.invalidate(),
        utils.transactions.list.invalidate(),
        utils.transactions.summary.invalidate(),
      ]);
      toast.success("Loan created.");
      resetDialog();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create loan.");
    },
  });

  const updateLoan = trpc.loans.update.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.loans.list.invalidate(),
        utils.loans.summary.invalidate(),
      ]);
      toast.success("Loan updated.");
      resetDialog();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update loan.");
    },
  });

  const removeLoan = trpc.loans.remove.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.loans.list.invalidate(),
        utils.loans.summary.invalidate(),
        utils.accounts.list.invalidate(),
        utils.accounts.summary.invalidate(),
        utils.transactions.list.invalidate(),
        utils.transactions.summary.invalidate(),
      ]);
      toast.success("Loan deleted.");
      setDeleteTarget(null);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete loan.");
    },
  });

  const loans = loansQuery.data?.items ?? [];
  const summary = summaryQuery.data;
  const accounts = accountsQuery.data ?? [];
  const liquidAccounts = accounts.filter((account) => account.type === "cash" || account.type === "wallet");
  const loanAccounts = accounts.filter((account) => account.type === "loan");

  const activeLoans = loans.filter((loan) => loan.status === "active");
  const closedLoans = loans.filter((loan) => loan.status === "closed");
  const mobileHeroStats = [
    {
      label: "Active loans",
      value: String(summary?.activeLoans ?? 0),
    },
    {
      label: "Due soon",
      value: String(summary?.dueSoonCount ?? 0),
    },
  ];
  const summaryCards = [
    {
      label: "Loans tracked",
      value: String(summary?.totalLoans ?? 0),
      detail: "Borrowing records currently connected to Veyra.",
    },
    {
      label: "Active loans",
      value: String(summary?.activeLoans ?? 0),
      detail: "Open loans that still need repayment tracking.",
    },
    {
      label: "Due soon",
      value: String(summary?.dueSoonCount ?? 0),
      detail: "Active loans with due date in the next 7 days.",
    },
    {
      label: "Outstanding",
      value: summary?.totalOutstanding
        ? formatCurrencyMiliunits(summary.totalOutstanding, summary.nextDueLoan?.currency ?? "PHP")
        : formatCurrencyMiliunits(0, "PHP"),
      detail: "Current outstanding across active loan records.",
    },
  ];
  const principalPreview = parseMoneyToMiliunits(draft.principalAmount) ?? 0;
  const autoMonthlyPayment = parseMoneyToMiliunits(draft.autoMonthlyPayment) ?? 0;
  const autoInstallmentCount = Number.parseInt(draft.autoInstallmentCount, 10);
  const autoMonthlyRate = Number.parseFloat(draft.autoMonthlyRate);
  const autoTotalPayable = parseMoneyToMiliunits(draft.autoTotalPayable);
  const autoGeneratedPlan = buildAutoRepaymentPlan({
    principalAmount: principalPreview,
    monthlyPayment: autoMonthlyPayment,
    installmentCount: Number.isFinite(autoInstallmentCount) ? autoInstallmentCount : 0,
    firstDueDate: draft.autoFirstDueDate,
    monthlyRatePercent:
      Number.isFinite(autoMonthlyRate) && autoMonthlyRate > 0 ? autoMonthlyRate : undefined,
    totalPayable: autoTotalPayable ?? undefined,
  });
  const planForPreview = draft.repaymentMode === "auto" ? autoGeneratedPlan : draft.repaymentPlan;
  const repaymentPlanTotal = planForPreview.reduce((sum, installment) => {
    const amount = parseMoneyToMiliunits(installment.amount);
    return sum + (amount ?? 0);
  }, 0);
  const financeChargePreview = Math.max(repaymentPlanTotal - principalPreview, 0);

  const isSaving = createLoan.isPending || updateLoan.isPending;

  useEffect(() => {
    const scroller = summaryScrollerRef.current;
    if (!scroller) return;

    const onScroll = () => {
      const cards = Array.from(scroller.querySelectorAll<HTMLElement>("[data-summary-slide]"));
      if (cards.length === 0) return;

      const scrollerCenter = scroller.scrollLeft + scroller.clientWidth / 2;
      let closestIndex = 0;
      let closestDistance = Number.POSITIVE_INFINITY;

      cards.forEach((card, index) => {
        const cardCenter = card.offsetLeft + card.clientWidth / 2;
        const distance = Math.abs(cardCenter - scrollerCenter);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestIndex = index;
        }
      });

      setActiveSummaryIndex(closestIndex);
    };

    scroller.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    return () => {
      scroller.removeEventListener("scroll", onScroll);
    };
  }, [summaryCards.length]);

  function scrollSummaryCards(index: number) {
    const scroller = summaryScrollerRef.current;
    if (!scroller) return;

    const nextIndex = Math.max(0, Math.min(index, summaryCards.length - 1));
    const cards = Array.from(scroller.querySelectorAll<HTMLElement>("[data-summary-slide]"));
    const nextCard = cards[nextIndex];
    if (!nextCard) return;

    nextCard.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });

    setActiveSummaryIndex(nextIndex);
  }

  function resetDialog() {
    setOpen(false);
    setDraft(initialDraft);
    setFormError(null);
  }

  function openCreateDialog() {
    setDraft(initialDraft);
    setFormError(null);
    setOpen(true);
  }

  function openEditDialog(loan: LoanItem) {
    setDraft({
      id: loan.id,
      kind: loan.kind,
      name: loan.name,
      lenderName: loan.lenderName,
      currency: isSupportedCurrency(loan.currency) ? loan.currency : "PHP",
      principalAmount: toInputAmount(loan.principalAmount),
      outstandingAmount: toInputAmount(loan.outstandingAmount),
      disbursedAt: new Date(loan.disbursedAt).toISOString().slice(0, 10),
      status: loan.status,
      destinationAccountId: loan.destinationAccountId,
      underlyingLoanAccountId: loan.underlyingLoanAccountId ?? "none",
      cadence: loan.cadence ?? "none",
      notes: loan.notes ?? "",
      metadata: loan.metadata ?? "",
      autoCreateUnderlyingAccount: false,
      createOpeningDisbursement: false,
      openingDisbursementAmount: "",
      repaymentMode: "manual",
      autoMonthlyPayment:
        loan.installments?.[0] ? toMoneyInput(loan.installments[0].amount) : "",
      autoInstallmentCount: loan.installments?.length ? String(loan.installments.length) : "",
      autoFirstDueDate: loan.installments?.[0]
        ? new Date(loan.installments[0].dueDate).toISOString().slice(0, 10)
        : "",
      autoMonthlyRate: "",
      autoTotalPayable: loan.totalPayable ? toMoneyInput(loan.totalPayable) : "",
      repaymentPlan:
        loan.installments?.map((installment) => ({
          id: installment.id,
          dueDate: new Date(installment.dueDate).toISOString().slice(0, 10),
          amount: toInputAmount(installment.amount),
          principalAmount: toInputAmount(installment.principalAmount ?? 0),
          interestAmount: toInputAmount(installment.interestAmount ?? 0),
        })) ?? [],
    });
    setFormError(null);
    setOpen(true);
  }

  function submitLoan() {
    const name = draft.name.trim();
    const lenderName = draft.lenderName.trim();
    const principalAmount = parseMoneyToMiliunits(draft.principalAmount);
    const outstandingAmount = parseMoneyToMiliunits(draft.outstandingAmount);

    if (name.length < 2) {
      setFormError("Enter a loan name with at least 2 characters.");
      return;
    }

    if (lenderName.length < 2) {
      setFormError("Enter a lender name with at least 2 characters.");
      return;
    }

    if (principalAmount === null || principalAmount <= 0) {
      setFormError("Enter a valid principal amount.");
      return;
    }

    if (outstandingAmount === null || outstandingAmount < 0) {
      setFormError("Enter a valid outstanding amount.");
      return;
    }

    if (!draft.destinationAccountId) {
      setFormError("Select a destination account.");
      return;
    }

    if (!draft.disbursedAt) {
      setFormError("Choose a disbursement date.");
      return;
    }

    if (draft.status === "closed" && outstandingAmount > 0) {
      setFormError("Closed loans must have zero outstanding amount.");
      return;
    }

    let sourceRepaymentPlan = draft.repaymentPlan;
    if (draft.repaymentMode === "auto") {
      if (!draft.autoFirstDueDate) {
        setFormError("Choose the first due date for auto plan.");
        return;
      }

      if (!Number.isFinite(autoInstallmentCount) || autoInstallmentCount <= 0) {
        setFormError("Enter a valid number of installments.");
        return;
      }

      if (autoMonthlyPayment <= 0) {
        setFormError("Enter a valid monthly installment amount.");
        return;
      }

      sourceRepaymentPlan = autoGeneratedPlan;
      if (sourceRepaymentPlan.length === 0) {
        setFormError("Unable to generate plan. Check auto plan inputs.");
        return;
      }
    }

    const normalizedRepaymentPlan = sourceRepaymentPlan
      .map((installment) => ({
        dueDate: installment.dueDate,
        amount: parseMoneyToMiliunits(installment.amount),
        principalAmount: parseMoneyToMiliunits(installment.principalAmount),
        interestAmount: parseMoneyToMiliunits(installment.interestAmount),
      }))
      .sort((left, right) => left.dueDate.localeCompare(right.dueDate));

    const repaymentPlan = normalizedRepaymentPlan
      .filter((installment) => installment.dueDate || installment.amount !== null)
      .map((installment) => ({
        dueDate: installment.dueDate,
        amount: installment.amount,
        principalAmount: installment.principalAmount,
        interestAmount: installment.interestAmount,
      }));

    for (const installment of repaymentPlan) {
      if (!installment.dueDate) {
        setFormError("Each repayment row needs a due date.");
        return;
      }

      if (installment.amount === null || installment.amount <= 0) {
        setFormError("Each repayment row needs a valid amount.");
        return;
      }
    }

    const cadence = draft.cadence === "none" ? undefined : draft.cadence;
    const nextDueDate = repaymentPlan[0]?.dueDate
      ? new Date(repaymentPlan[0].dueDate)
      : undefined;

    if (draft.id) {
      updateLoan.mutate({
        id: draft.id,
        kind: draft.kind,
        name,
        lenderName,
        currency: draft.currency,
        principalAmount,
        outstandingAmount,
        disbursedAt: new Date(draft.disbursedAt),
        status: draft.status,
        destinationAccountId: draft.destinationAccountId,
        underlyingLoanAccountId:
          draft.underlyingLoanAccountId === "none" ? undefined : draft.underlyingLoanAccountId,
        cadence,
        nextDueDate,
        notes: draft.notes.trim() || undefined,
        metadata: draft.metadata.trim() || undefined,
        repaymentPlan: repaymentPlan.map((installment) => ({
          dueDate: new Date(installment.dueDate),
          amount: installment.amount ?? 0,
          principalAmount: installment.principalAmount ?? undefined,
          interestAmount: installment.interestAmount ?? undefined,
        })),
      });

      return;
    }

    const openingDisbursementAmount = draft.openingDisbursementAmount
      ? parseMoneyToMiliunits(draft.openingDisbursementAmount)
      : null;

    if (
      draft.createOpeningDisbursement &&
      openingDisbursementAmount !== null &&
      openingDisbursementAmount <= 0
    ) {
      setFormError("Opening disbursement amount must be greater than zero.");
      return;
    }

    const selectedUnderlyingAccountId =
      draft.underlyingLoanAccountId === "auto" || draft.underlyingLoanAccountId === "none"
        ? undefined
        : draft.underlyingLoanAccountId;

    createLoan.mutate({
      kind: draft.kind,
      name,
      lenderName,
      currency: draft.currency,
      principalAmount,
      outstandingAmount,
      disbursedAt: new Date(draft.disbursedAt),
      status: draft.status,
      destinationAccountId: draft.destinationAccountId,
      underlyingLoanAccountId: selectedUnderlyingAccountId,
      cadence,
      nextDueDate,
      notes: draft.notes.trim() || undefined,
      metadata: draft.metadata.trim() || undefined,
      repaymentPlan: repaymentPlan.map((installment) => ({
        dueDate: new Date(installment.dueDate),
        amount: installment.amount ?? 0,
        principalAmount: installment.principalAmount ?? undefined,
        interestAmount: installment.interestAmount ?? undefined,
      })),
      autoCreateUnderlyingAccount: draft.underlyingLoanAccountId === "auto",
      createOpeningDisbursement: draft.createOpeningDisbursement,
      openingDisbursementAmount: openingDisbursementAmount ?? undefined,
    });
  }

  return (
    <div className="space-y-6 lg:space-y-7">
      <section className="space-y-4">
        <div className="overflow-hidden rounded-[1.8rem] border border-white/80 bg-[linear-gradient(145deg,rgba(16,41,43,0.98),rgba(29,78,77,0.94))] text-white shadow-[0_28px_95px_-72px_rgba(10,31,34,0.82)]">
          <div className="grid gap-4 px-4 py-4 sm:px-6 sm:py-5 xl:grid-cols-[minmax(0,1fr)_300px] xl:items-center">
            <div className="max-w-3xl">
              <div className="inline-flex rounded-full border border-white/15 bg-white/10 px-2.5 py-0.5 text-[0.64rem] font-medium uppercase tracking-[0.22em] text-white/78">
                Loans workspace
              </div>
              <h1 className="mt-2.5 max-w-[21ch] text-[1.55rem] font-semibold leading-[1.08] tracking-tight text-white sm:mt-3 sm:text-[2.2rem] sm:leading-[1.02]">
                Track borrowing with clean liability context.
              </h1>
              <p className="mt-2 max-w-[34rem] text-[0.9rem] leading-6 text-white/72 sm:mt-2.5 sm:text-[0.95rem] sm:leading-7">
                Keep lender context, outstanding balances, and destination mapping visible without
                adding clutter.
              </p>
            </div>

            <div className="hidden space-y-2.5 xl:block">
              <div className="rounded-[1.25rem] border border-white/12 bg-white/10 px-4 py-3 backdrop-blur">
                <p className="text-[0.64rem] font-medium uppercase tracking-[0.22em] text-white/60">
                  Active loans
                </p>
                <p className="mt-1.5 text-[1.75rem] font-semibold tracking-tight">{summary?.activeLoans ?? 0}</p>
              </div>
              <div className="rounded-[1.25rem] border border-white/12 bg-white/10 px-4 py-3 backdrop-blur">
                <p className="text-[0.64rem] font-medium uppercase tracking-[0.22em] text-white/60">
                  Due soon
                </p>
                <p className="mt-1.5 text-[1.75rem] font-semibold tracking-tight">{summary?.dueSoonCount ?? 0}</p>
              </div>
            </div>
          </div>

          <div className="px-4 pb-4 xl:hidden sm:px-6 sm:pb-5">
            <div className="grid grid-cols-2 gap-2">
              {mobileHeroStats.map((item) => (
                <div
                  key={item.label}
                  className="rounded-[1.05rem] border border-white/12 bg-white/10 px-3 py-2.5 backdrop-blur"
                >
                  <p className="text-[0.6rem] font-medium uppercase tracking-[0.2em] text-white/58">
                    {item.label}
                  </p>
                  <p className="mt-1 text-[1.1rem] font-semibold tracking-tight text-white">
                    {item.value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

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
              <Card className="border-white/75 bg-white/84 shadow-[0_20px_60px_-52px_rgba(10,31,34,0.28)] dark:border-white/8 dark:bg-[#182123] dark:shadow-[0_24px_60px_-45px_rgba(0,0,0,0.62)]">
                <CardContent className="p-5">
                  <p className="text-[0.66rem] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                    {card.label}
                  </p>
                  <p className="mt-2.5 text-[1.65rem] font-semibold tracking-tight text-[#10292B] dark:text-foreground">
                    {card.value}
                  </p>
                  <p className="mt-1.5 text-[0.9rem] leading-6 text-muted-foreground">{card.detail}</p>
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
                onClick={() => scrollSummaryCards(activeSummaryIndex - 1)}
                disabled={activeSummaryIndex <= 0}
              >
                <span className="text-base leading-none">‹</span>
                <span className="sr-only">Previous summary</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className="rounded-full"
                onClick={() => scrollSummaryCards(activeSummaryIndex + 1)}
                disabled={activeSummaryIndex >= summaryCards.length - 1}
              >
                <span className="text-base leading-none">›</span>
                <span className="sr-only">Next summary</span>
              </Button>
            </div>
          </div>
        ) : null}

        <div className="hidden gap-4 md:grid md:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((card) => (
            <Card
              key={card.label}
              className="border-white/75 bg-white/84 shadow-[0_20px_60px_-52px_rgba(10,31,34,0.28)] dark:border-white/8 dark:bg-[#182123] dark:shadow-[0_24px_60px_-45px_rgba(0,0,0,0.62)]"
            >
              <CardContent className="p-5">
                <p className="text-[0.66rem] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                  {card.label}
                </p>
                <p className="mt-2.5 text-[1.65rem] font-semibold tracking-tight text-[#10292B] dark:text-foreground">
                  {card.value}
                </p>
                <p className="mt-1.5 text-[0.9rem] leading-6 text-muted-foreground">{card.detail}</p>
              </CardContent>
            </Card>
          ))}
        </div>

      </section>

      <Card className="border-border/70 bg-card/90">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-lg">Loan Records</CardTitle>
            <div className="flex w-full flex-col gap-1.5 sm:w-auto sm:flex-row sm:items-center sm:justify-end sm:gap-2">
              <Button
                type="button"
                onClick={openCreateDialog}
                className="order-1 h-9 w-auto self-start rounded-full bg-[#17393c] px-4 text-[0.95rem] text-white hover:bg-[#1d4a4d] sm:order-2 sm:h-9"
              >
                <Plus className="size-4" />
                Add loan
              </Button>
              <div className="relative order-2 w-full sm:order-1 sm:w-80">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search by loan name or lender"
                  className="h-9 pl-9 text-[0.95rem] sm:h-9"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {loansQuery.isLoading ? (
            <p className="rounded-xl border border-dashed border-border/70 px-4 py-5 text-sm text-muted-foreground">
              Loading loans...
            </p>
          ) : null}

          {!loansQuery.isLoading && loans.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border/70 px-4 py-5 text-sm text-muted-foreground">
              No loans yet. Add your first loan to start tracking outstanding balances and due dates.
            </p>
          ) : null}

          {activeLoans.map((loan) => (
            <LoanRow
              key={loan.id}
              loan={loan}
              onEdit={openEditDialog}
              onDelete={setDeleteTarget}
            />
          ))}

          {closedLoans.length > 0 ? (
            <div className="pt-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Closed Loans
              </p>
              <div className="space-y-3">
                {closedLoans.map((loan) => (
                  <LoanRow
                    key={loan.id}
                    loan={loan}
                    onEdit={openEditDialog}
                    onDelete={setDeleteTarget}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !isSaving) {
            resetDialog();
            return;
          }

          setOpen(nextOpen);
        }}
      >
        <DialogContent className="max-h-[calc(86dvh-env(safe-area-inset-top))] w-[calc(100vw-1rem)] overflow-x-hidden overflow-y-auto rounded-[1.45rem] border-border/70 bg-background/96 p-0 shadow-[0_40px_90px_-50px_rgba(15,23,42,0.5)] backdrop-blur sm:max-h-[92vh] sm:w-[calc(100vw-3rem)] sm:max-w-3xl sm:rounded-[2rem]">
          <div className="border-b border-border/60 px-4 pb-3.5 pt-[max(0.85rem,env(safe-area-inset-top))] sm:px-8 sm:py-6">
            <DialogHeader className="space-y-2">
              <div className="inline-flex w-fit rounded-lg border border-border/70 bg-background/80 px-2.5 py-1 text-[0.62rem] uppercase tracking-[0.2em] text-muted-foreground sm:rounded-full sm:px-3 sm:text-xs sm:tracking-[0.22em]">
                Loan setup
              </div>
              <DialogTitle className="text-[1.2rem] tracking-tight sm:text-[2.15rem]">
                {draft.id ? "Edit loan" : "Create loan"}
              </DialogTitle>
              <DialogDescription className="max-w-2xl text-[0.82rem] leading-6 sm:text-[0.95rem] sm:leading-7">
                Keep this practical: identify the lender, set principal and outstanding amounts,
                and map where proceeds landed.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="space-y-3 px-4 py-3.5 sm:space-y-5 sm:px-8 sm:py-6">
            {formError ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
                {formError}
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className={loanLabelClassName}>Loan name</label>
                <Input
                  value={draft.name}
                  onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                  placeholder="e.g. Atome Cash Loan"
                  className={loanFieldClassName}
                />
              </div>
              <div className="space-y-2">
                <label className={loanLabelClassName}>Lender</label>
                <Input
                  value={draft.lenderName}
                  onChange={(event) => setDraft((current) => ({ ...current, lenderName: event.target.value }))}
                  placeholder="e.g. Atome"
                  className={loanFieldClassName}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 sm:gap-4">
              <div className="space-y-2">
                <label className={loanLabelClassName}>Kind</label>
                <Select
                  value={draft.kind}
                  onValueChange={(value) => setDraft((current) => ({ ...current, kind: value as LoanKind }))}
                >
                  <SelectTrigger className="h-9 w-full rounded-lg text-sm sm:h-11 sm:rounded-xl sm:text-[0.95rem]">
                    <SelectValue placeholder="Loan kind" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="institution">Institution</SelectItem>
                    <SelectItem value="personal">Personal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className={loanLabelClassName}>Status</label>
                <Select
                  value={draft.status}
                  onValueChange={(value) => setDraft((current) => ({ ...current, status: value as LoanStatus }))}
                >
                  <SelectTrigger className="h-9 w-full rounded-lg text-sm sm:h-11 sm:rounded-xl sm:text-[0.95rem]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className={loanLabelClassName}>Currency</label>
                <Select
                  value={draft.currency}
                  onValueChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      currency: value as LoanDraft["currency"],
                    }))
                  }
                >
                  <SelectTrigger className="h-9 w-full rounded-lg text-sm sm:h-11 sm:rounded-xl sm:text-[0.95rem]">
                    <SelectValue placeholder="Currency" />
                  </SelectTrigger>
                  <SelectContent>
                    {supportedCurrencies.map((currency) => (
                      <SelectItem key={currency} value={currency}>
                        {currency}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-3 space-y-2 sm:col-span-1">
                <label className={loanLabelClassName}>Disbursed at</label>
                <Input
                  type="date"
                  value={draft.disbursedAt}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      disbursedAt: event.target.value,
                    }))
                  }
                  className={loanFieldClassName}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className={loanLabelClassName}>Principal amount</label>
                <Input
                  value={draft.principalAmount}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, principalAmount: event.target.value }))
                  }
                  inputMode="decimal"
                  placeholder="0.00"
                  className={loanFieldClassName}
                />
              </div>
              <div className="space-y-2">
                <label className={loanLabelClassName}>Outstanding amount</label>
                <Input
                  value={draft.outstandingAmount}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, outstandingAmount: event.target.value }))
                  }
                  inputMode="decimal"
                  placeholder="0.00"
                  className={loanFieldClassName}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className={loanLabelClassName}>Destination account</label>
                <Select
                  value={draft.destinationAccountId}
                  onValueChange={(value) =>
                    setDraft((current) => ({ ...current, destinationAccountId: value }))
                  }
                >
                  <SelectTrigger className="h-9 w-full rounded-lg text-sm sm:h-11 sm:rounded-xl sm:text-[0.95rem]">
                    <SelectValue placeholder="Where proceeds were received" />
                  </SelectTrigger>
                  <SelectContent>
                    {liquidAccounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name} · {getAccountTypeLabel(account.type)} · {account.currency}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className={loanLabelClassName}>Underlying loan account</label>
                <Select
                  value={draft.underlyingLoanAccountId}
                  onValueChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      underlyingLoanAccountId: value,
                      autoCreateUnderlyingAccount: value === "auto",
                    }))
                  }
                >
                  <SelectTrigger className="h-9 w-full rounded-lg text-sm sm:h-11 sm:rounded-xl sm:text-[0.95rem]">
                    <SelectValue placeholder="Loan liability account" />
                  </SelectTrigger>
                  <SelectContent>
                    {!draft.id ? <SelectItem value="auto">Auto-create from loan name</SelectItem> : null}
                    <SelectItem value="none">None</SelectItem>
                    {loanAccounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name} · {account.currency}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className={loanLabelClassName}>Cadence</label>
                <Select
                  value={draft.cadence}
                  onValueChange={(value) =>
                    setDraft((current) => ({ ...current, cadence: value as LoanDraft["cadence"] }))
                  }
                >
                  <SelectTrigger className="h-9 w-full rounded-lg text-sm sm:h-11 sm:rounded-xl sm:text-[0.95rem]">
                    <SelectValue placeholder="Optional" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="bi-weekly">Bi-weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className={loanLabelClassName}>Derived finance view</label>
                <div className="rounded-xl border border-border/70 bg-muted/30 px-3 py-2.5 text-[0.86rem] leading-6 text-muted-foreground sm:px-4 sm:py-3 sm:text-[0.92rem]">
                  <p>
                    Total payable:{" "}
                    <span className="font-semibold text-foreground">
                      {formatCurrencyMiliunits(repaymentPlanTotal, draft.currency)}
                    </span>
                  </p>
                  <p>
                    Finance charge:{" "}
                    <span className="font-semibold text-foreground">
                      {formatCurrencyMiliunits(financeChargePreview, draft.currency)}
                    </span>
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className={loanLabelClassName}>Repayment plan</label>
                <div className="inline-flex rounded-full border border-border/70 bg-muted/35 p-1">
                  <Button
                    type="button"
                    variant={draft.repaymentMode === "auto" ? "default" : "ghost"}
                    size="sm"
                    className="h-7 rounded-full px-3 text-xs"
                    onClick={() => setDraft((current) => ({ ...current, repaymentMode: "auto" }))}
                  >
                    Auto
                  </Button>
                  <Button
                    type="button"
                    variant={draft.repaymentMode === "manual" ? "default" : "ghost"}
                    size="sm"
                    className="h-7 rounded-full px-3 text-xs"
                    onClick={() => setDraft((current) => ({ ...current, repaymentMode: "manual" }))}
                  >
                    Manual
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                {draft.repaymentMode === "auto" ? (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <div className="space-y-1.5">
                        <label className="text-[0.74rem] font-medium text-muted-foreground sm:text-[0.8rem]">
                          Monthly installment
                        </label>
                        <Input
                          inputMode="decimal"
                          value={draft.autoMonthlyPayment}
                          onChange={(event) =>
                            setDraft((current) => ({ ...current, autoMonthlyPayment: event.target.value }))
                          }
                          placeholder="0.00"
                          className={loanFieldClassName}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[0.74rem] font-medium text-muted-foreground sm:text-[0.8rem]">
                          No. of installments
                        </label>
                        <Input
                          inputMode="numeric"
                          value={draft.autoInstallmentCount}
                          onChange={(event) =>
                            setDraft((current) => ({ ...current, autoInstallmentCount: event.target.value }))
                          }
                          placeholder="e.g. 18"
                          className={loanFieldClassName}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[0.74rem] font-medium text-muted-foreground sm:text-[0.8rem]">
                          First due date
                        </label>
                        <Input
                          type="date"
                          value={draft.autoFirstDueDate}
                          onChange={(event) =>
                            setDraft((current) => ({ ...current, autoFirstDueDate: event.target.value }))
                          }
                          className={loanFieldClassName}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[0.74rem] font-medium text-muted-foreground sm:text-[0.8rem]">
                          Monthly rate % (optional)
                        </label>
                        <Input
                          inputMode="decimal"
                          value={draft.autoMonthlyRate}
                          onChange={(event) =>
                            setDraft((current) => ({ ...current, autoMonthlyRate: event.target.value }))
                          }
                          placeholder="e.g. 2.5"
                          className={loanFieldClassName}
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[0.74rem] font-medium text-muted-foreground sm:text-[0.8rem]">
                        Total payable override (optional)
                      </label>
                      <Input
                        inputMode="decimal"
                        value={draft.autoTotalPayable}
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, autoTotalPayable: event.target.value }))
                        }
                        placeholder="Leave blank to use monthly installment x number of installments"
                        className={loanFieldClassName}
                      />
                      <p className="text-[0.72rem] text-muted-foreground">
                        If monthly rate is empty, Veyra infers an effective rate from this total to
                        produce declining interest and a realistic final payment.
                      </p>
                    </div>
                    {autoGeneratedPlan.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-border/70 px-3 py-3 text-[0.86rem] text-muted-foreground sm:px-4 sm:text-[0.9rem]">
                        Enter monthly installment, number of installments, and first due date to auto-build repayment plan.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {autoGeneratedPlan.map((installment, index) => (
                          <div
                            key={installment.id}
                            className="grid items-end gap-2 rounded-xl border border-border/70 bg-background/70 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] sm:p-4"
                          >
                            <div className="space-y-1">
                              <p className="text-[0.74rem] font-medium text-muted-foreground">Due #{index + 1}</p>
                              <p className="text-sm font-medium text-foreground">{installment.dueDate}</p>
                            </div>
                            <div className="space-y-1">
                              <p className="text-[0.74rem] font-medium text-muted-foreground">Amount</p>
                              <p className="text-sm font-medium text-foreground">{installment.amount}</p>
                            </div>
                            <div className="space-y-1">
                              <p className="text-[0.74rem] font-medium text-muted-foreground">Principal / Interest</p>
                              <p className="text-sm font-medium text-foreground">
                                {installment.principalAmount} / {installment.interestAmount}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : draft.repaymentPlan.length === 0 ? (
                  <div className="space-y-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-full"
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          repaymentPlan: [...current.repaymentPlan, createInstallmentDraft()],
                        }))
                      }
                    >
                      Add due
                    </Button>
                    <div className="rounded-xl border border-dashed border-border/70 px-3 py-3 text-[0.86rem] text-muted-foreground sm:px-4 sm:text-[0.9rem]">
                      No repayment rows yet. Add due dates and amounts to compute total payable and
                      finance charge automatically.
                    </div>
                  </div>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-full"
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          repaymentPlan: [...current.repaymentPlan, createInstallmentDraft()],
                        }))
                      }
                    >
                      Add due
                    </Button>
                    {draft.repaymentPlan.map((installment, index) => (
                      <div
                        key={installment.id}
                        className="grid items-end gap-2 rounded-xl border border-border/70 bg-background/70 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:p-4"
                      >
                        <div className="space-y-1.5">
                          <label className="text-[0.74rem] font-medium text-muted-foreground sm:text-[0.8rem]">
                            Due #{index + 1}
                          </label>
                          <Input
                            type="date"
                            value={installment.dueDate}
                            onChange={(event) =>
                              setDraft((current) => ({
                                ...current,
                                repaymentPlan: current.repaymentPlan.map((entry) =>
                                  entry.id === installment.id
                                    ? { ...entry, dueDate: event.target.value }
                                    : entry
                                ),
                              }))
                            }
                            className={loanFieldClassName}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[0.74rem] font-medium text-muted-foreground sm:text-[0.8rem]">
                            Amount
                          </label>
                          <Input
                            inputMode="decimal"
                            value={installment.amount}
                            onChange={(event) =>
                              setDraft((current) => ({
                                ...current,
                                repaymentPlan: current.repaymentPlan.map((entry) =>
                                  entry.id === installment.id
                                    ? { ...entry, amount: event.target.value }
                                    : entry
                                ),
                              }))
                            }
                            placeholder="0.00"
                            className={loanFieldClassName}
                          />
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          className="rounded-lg text-destructive hover:text-destructive sm:rounded-full"
                          onClick={() =>
                            setDraft((current) => ({
                              ...current,
                              repaymentPlan: current.repaymentPlan.filter(
                                (entry) => entry.id !== installment.id
                              ),
                            }))
                          }
                        >
                          <Trash2 className="size-4" />
                          <span className="sr-only">Remove due item</span>
                        </Button>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>

            {!draft.id ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className={loanLabelClassName}>Opening disbursement</label>
                  <Select
                    value={draft.createOpeningDisbursement ? "yes" : "no"}
                    onValueChange={(value) =>
                      setDraft((current) => ({
                        ...current,
                        createOpeningDisbursement: value === "yes",
                      }))
                    }
                  >
                    <SelectTrigger className="h-9 w-full rounded-lg text-sm sm:h-12 sm:rounded-2xl sm:text-[0.95rem]">
                      <SelectValue placeholder="Record disbursement event" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="no">No</SelectItem>
                      <SelectItem value="yes">Yes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className={loanLabelClassName}>Opening amount</label>
                  <Input
                    value={draft.openingDisbursementAmount}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        openingDisbursementAmount: event.target.value,
                      }))
                    }
                    inputMode="decimal"
                    placeholder="Defaults to principal"
                    className={loanFieldClassName}
                    disabled={!draft.createOpeningDisbursement}
                  />
                </div>
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className={loanLabelClassName}>Notes</label>
                <Input
                  value={draft.notes}
                  onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
                  placeholder="Optional"
                  className={loanFieldClassName}
                />
              </div>
              <div className="space-y-2">
                <label className={loanLabelClassName}>Metadata</label>
                <Input
                  value={draft.metadata}
                  onChange={(event) => setDraft((current) => ({ ...current, metadata: event.target.value }))}
                  placeholder="Optional raw detail"
                  className={loanFieldClassName}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="!mx-0 !mb-0 flex-row items-center justify-end gap-2 rounded-b-[1.45rem] border-t border-border/60 bg-background/85 px-4 pb-[max(0.7rem,env(safe-area-inset-bottom))] pt-2.5 sm:rounded-b-[2rem] sm:px-8 sm:py-5 [&>button]:w-auto">
            <Button
              type="button"
              variant="outline"
              className="h-9 rounded-lg text-sm sm:h-11 sm:rounded-full sm:text-[0.95rem]"
              onClick={resetDialog}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="h-9 rounded-lg bg-[#17393c] text-sm hover:bg-[#1d4a4d] sm:h-11 sm:rounded-full sm:text-[0.95rem]"
              onClick={submitLoan}
              disabled={isSaving || liquidAccounts.length === 0}
            >
              {isSaving ? "Saving..." : draft.id ? "Save changes" : "Create loan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !removeLoan.isPending) {
            setDeleteTarget(null);
          }
        }}
      >
        <DialogContent className="max-h-[calc(86dvh-env(safe-area-inset-top))] w-[calc(100vw-1rem)] max-w-md overflow-x-hidden overflow-y-auto rounded-[1.35rem] border-border/70 bg-background/96 p-0 sm:max-h-[92vh] sm:max-w-lg sm:rounded-[1.75rem]">
          <DialogHeader className="border-b border-border/60 px-4 pb-3.5 pt-[max(0.85rem,env(safe-area-inset-top))] pr-12 sm:px-7 sm:pb-4 sm:pt-7 sm:pr-16">
            <DialogTitle className="text-[1.12rem] tracking-tight sm:text-[1.45rem]">Delete loan?</DialogTitle>
            <DialogDescription className="pt-1 text-[0.82rem] leading-6 sm:text-[0.93rem] sm:leading-7">
              {deleteTarget
                ? `Remove "${deleteTarget.name}" from Loans? This only removes the loan record and does not delete underlying account or transaction history.`
                : "Remove this loan from Loans? This only removes the loan record and does not delete underlying account or transaction history."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="!mx-0 !-mb-0 flex-row items-center justify-end gap-2 border-t border-border/60 bg-transparent px-4 py-4 sm:px-7 sm:py-6 [&>button]:w-auto">
            <Button
              type="button"
              variant="outline"
              className="h-9 rounded-lg px-4 text-sm sm:h-11 sm:rounded-full sm:px-5 sm:text-base"
              onClick={() => setDeleteTarget(null)}
              disabled={removeLoan.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="h-9 rounded-lg bg-destructive px-4 text-sm text-white hover:bg-destructive/90 sm:h-11 sm:rounded-full sm:px-5 sm:text-base"
              onClick={() => deleteTarget && removeLoan.mutate({ id: deleteTarget.id })}
              disabled={removeLoan.isPending}
            >
              {removeLoan.isPending ? "Deleting..." : "Delete loan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LoanRow({
  loan,
  onEdit,
  onDelete,
}: {
  loan: LoanItem;
  onEdit: (loan: LoanItem) => void;
  onDelete: (target: DeleteTarget) => void;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">{loan.name}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {loan.kind === "institution" ? "Institution" : "Personal"} · {loan.lenderName}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button asChild type="button" variant="outline" className="h-8 rounded-full px-3 text-xs">
            <Link href={`/loans/${loan.id}`}>View details</Link>
          </Button>
          <span
            className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] ${
              loan.status === "active"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300"
                : "border-border bg-muted text-muted-foreground"
            }`}
          >
            {loan.status}
          </span>

          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            className="rounded-full"
            onClick={() => onEdit(loan)}
          >
            <Pencil className="size-4" />
            <span className="sr-only">Edit loan</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            className="rounded-full text-destructive hover:text-destructive"
            onClick={() => onDelete({ id: loan.id, name: loan.name })}
          >
            <Trash2 className="size-4" />
            <span className="sr-only">Delete loan</span>
          </Button>
        </div>
      </div>

      <div className="mt-3 grid gap-3 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex items-center gap-2">
          <HandCoins className="size-3.5" />
          <span>
            Outstanding: {formatCurrencyMiliunits(loan.outstandingAmount, loan.currency)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Landmark className="size-3.5" />
          <span>Principal: {formatCurrencyMiliunits(loan.principalAmount, loan.currency)}</span>
        </div>
        <div className="flex items-center gap-2">
          <Landmark className="size-3.5" />
          <span>Total payable: {formatCurrencyMiliunits(loan.totalPayable, loan.currency)}</span>
        </div>
        <div className="flex items-center gap-2">
          <CalendarClock className="size-3.5" />
          <span>
            Finance: {formatCurrencyMiliunits(loan.financeCharge, loan.currency)} · Next due:{" "}
            {formatDate(loan.nextDueDate)}
          </span>
        </div>
      </div>
    </div>
  );
}
