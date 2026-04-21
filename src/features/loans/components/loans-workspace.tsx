"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import {
  CalendarClock,
  Check,
  HandCoins,
  Landmark,
  Pencil,
  Search,
  Sparkles,
  Trash2,
  UserRound,
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
import { DatePickerField } from "@/components/date-picker/date-picker";
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
type LoanSetupPath = "personal_flexible" | "institution_app";
type PersonalScheduleStyle = "flexible" | "scheduled";
type InstallmentDraft = {
  id: string;
  dueDate: string;
  amount: string;
  principalAmount: string;
  interestAmount: string;
};

type LoanDraft = {
  id: string | null;
  setupPath: LoanSetupPath;
  personalScheduleStyle: PersonalScheduleStyle;
  kind: LoanKind;
  name: string;
  lenderName: string;
  applicationId: string;
  processingFees: string;
  interestRatePercent: string;
  durationMonths: string;
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
  setupPath: "personal_flexible",
  personalScheduleStyle: "scheduled",
  kind: "personal",
  name: "",
  lenderName: "",
  applicationId: "",
  processingFees: "",
  interestRatePercent: "",
  durationMonths: "",
  currency: "PHP",
  principalAmount: "",
  outstandingAmount: "",
  disbursedAt: toDateInputLocal(new Date()),
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

const loanFieldClassName =
  "!h-8 w-full !rounded-[0.75rem] px-2.5 text-[0.74rem] sm:!h-9 sm:!rounded-[0.85rem] sm:px-3 sm:text-[0.84rem]";
const loanLabelClassName = "text-[0.88rem] font-semibold text-foreground sm:text-[0.82rem]";

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

function addDays(input: Date, daysToAdd: number) {
  const copy = new Date(input);
  copy.setDate(copy.getDate() + daysToAdd);
  return copy;
}

function toMoneyInput(value: number) {
  return (value / 1000).toFixed(2);
}

function parseFlexibleDateInput(value: string) {
  const raw = value.trim();
  if (!raw) return null;

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    const date = new Date(year, month - 1, day);
    if (
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day
    ) {
      return date;
    }
  }

  const slashMatch = raw.match(/^(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})$/);
  if (slashMatch) {
    const month = Number(slashMatch[1]);
    const day = Number(slashMatch[2]);
    const year = Number(slashMatch[3]);
    const date = new Date(year, month - 1, day);
    if (
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day
    ) {
      return date;
    }
  }

  const fallback = new Date(raw);
  if (!Number.isFinite(fallback.getTime())) return null;
  return fallback;
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

  const slashMatch = raw.match(/^(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})$/);
  if (slashMatch) {
    const month = Number(slashMatch[1]);
    const day = Number(slashMatch[2]);
    const year = Number(slashMatch[3]);
    return new Date(Date.UTC(year, month - 1, day));
  }

  const parsed = parseFlexibleDateInput(raw);
  if (!parsed) return null;
  return new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()));
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
  const firstDueDate = parseFlexibleDateInput(input.firstDueDate);
  if (
    !firstDueDate ||
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
        dueDate: toDateInputLocal(dueDate),
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
      dueDate: toDateInputLocal(dueDate),
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
  const [loanTypeStepComplete, setLoanTypeStepComplete] = useState(false);
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
  const aiInsightQuery = trpc.ai.loansInsight.useQuery(undefined, {
    staleTime: 60_000,
  });
  const accountsQuery = trpc.accounts.list.useQuery();

  const createLoan = trpc.loans.create.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.loans.list.invalidate(),
        utils.loans.summary.invalidate(),
        utils.ai.loansInsight.invalidate(),
        utils.ai.dashboardInsight.invalidate(),
        utils.ai.accountsInsight.invalidate(),
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
        utils.ai.loansInsight.invalidate(),
        utils.ai.dashboardInsight.invalidate(),
        utils.ai.accountsInsight.invalidate(),
        utils.accounts.list.invalidate(),
        utils.accounts.summary.invalidate(),
        utils.transactions.list.invalidate(),
        utils.transactions.summary.invalidate(),
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
        utils.ai.loansInsight.invalidate(),
        utils.ai.dashboardInsight.invalidate(),
        utils.ai.accountsInsight.invalidate(),
        utils.accounts.list.invalidate(),
        utils.accounts.summary.invalidate(),
        utils.transactions.list.invalidate(),
        utils.transactions.summary.invalidate(),
      ]);
      await Promise.all([
        utils.accounts.list.refetch(),
        utils.accounts.summary.refetch(),
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

  const activeLoans = loans.filter((loan) => loan.status === "active");
  const closedLoans = loans.filter((loan) => loan.status === "closed");
  const topLenderPosture = useMemo(() => {
    if (activeLoans.length === 0) return null;
    const byLender = new Map<string, number>();
    for (const loan of activeLoans) {
      byLender.set(loan.lenderName, (byLender.get(loan.lenderName) ?? 0) + loan.outstandingAmount);
    }
    const [lenderName, amount] =
      [...byLender.entries()].sort((left, right) => right[1] - left[1])[0] ?? [];
    if (!lenderName || typeof amount !== "number") return null;
    return { lenderName, amount };
  }, [activeLoans]);
  const summaryCards = [
    {
      label: "Loans tracked",
      value: String(summary?.totalLoans ?? 0),
      detail: "Borrowing records connected",
    },
    {
      label: "Active loans",
      value: String(summary?.activeLoans ?? 0),
      detail: "Open and repayable",
    },
    {
      label: "Due soon",
      value: String(summary?.dueSoonCount ?? 0),
      detail: "Due within 7 days",
    },
    {
      label: "Outstanding",
      value: summary?.totalOutstanding
        ? formatCurrencyMiliunits(summary.totalOutstanding, summary.nextDueLoan?.currency ?? "PHP")
        : formatCurrencyMiliunits(0, "PHP"),
      detail: "Current active balance",
    },
  ];
  const principalPreview = parseMoneyToMiliunits(draft.principalAmount) ?? 0;
  const processingFeesPreview = parseMoneyToMiliunits(draft.processingFees) ?? 0;
  const autoMonthlyPayment = parseMoneyToMiliunits(draft.autoMonthlyPayment) ?? 0;
  const autoInstallmentCount = Number.parseInt(draft.autoInstallmentCount, 10);
  const autoMonthlyRate = Number.parseFloat(draft.autoMonthlyRate);
  const autoTotalPayable = parseMoneyToMiliunits(draft.autoTotalPayable);
  const durationMonths = Number.parseInt(draft.durationMonths, 10);
  const amountReceivedPreview = Math.max(principalPreview - processingFeesPreview, 0);
  const totalPayablePreview =
    autoTotalPayable ?? (autoMonthlyPayment > 0 && Number.isFinite(durationMonths) && durationMonths > 0
      ? autoMonthlyPayment * durationMonths
      : 0);
  const interestAndFeesPreview = Math.max(totalPayablePreview - principalPreview, 0);
  const maturityDatePreview = useMemo(() => {
    if (!draft.autoFirstDueDate) return null;
    if (!Number.isFinite(durationMonths) || durationMonths <= 0) return null;
    const firstDue = parseFlexibleDateInput(draft.autoFirstDueDate);
    if (!firstDue) return null;
    return addMonths(firstDue, durationMonths - 1);
  }, [draft.autoFirstDueDate, durationMonths]);
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
  const personalScheduledPreviewTotal =
    autoMonthlyPayment > 0 && Number.isFinite(autoInstallmentCount) && autoInstallmentCount > 0
      ? autoMonthlyPayment * autoInstallmentCount
      : 0;
  const personalPreviewTotalPayable =
    draft.id === null && draft.setupPath === "personal_flexible"
      ? draft.personalScheduleStyle === "scheduled"
        ? personalScheduledPreviewTotal
        : principalPreview
      : repaymentPlanTotal;
  const personalPreviewInterestAndFees =
    draft.id === null && draft.setupPath === "personal_flexible"
      ? draft.personalScheduleStyle === "scheduled"
        ? Math.max(personalScheduledPreviewTotal - principalPreview, 0)
        : 0
      : financeChargePreview;
  const personalPreviewMaturityDate = useMemo(() => {
    if (!(draft.id === null && draft.setupPath === "personal_flexible" && draft.personalScheduleStyle === "scheduled")) return null;
    if (!draft.autoFirstDueDate) return null;
    if (!Number.isFinite(autoInstallmentCount) || autoInstallmentCount <= 0) return null;
    const firstDue = parseFlexibleDateInput(draft.autoFirstDueDate);
    if (!firstDue) return null;
    const cadenceForPreview =
      draft.cadence === "none" ? ("monthly" as const) : draft.cadence;
    if (cadenceForPreview === "daily") return addDays(firstDue, autoInstallmentCount - 1);
    if (cadenceForPreview === "weekly") return addDays(firstDue, (autoInstallmentCount - 1) * 7);
    if (cadenceForPreview === "bi-weekly") {
      return addDays(firstDue, (autoInstallmentCount - 1) * 14);
    }
    return addMonths(firstDue, autoInstallmentCount - 1);
  }, [
    autoInstallmentCount,
    draft.autoFirstDueDate,
    draft.cadence,
    draft.personalScheduleStyle,
    draft.id,
    draft.setupPath,
  ]);

  const isSaving = createLoan.isPending || updateLoan.isPending;
  const isCreateMode = draft.id === null;
  const isChoosingLoanType = isCreateMode && !loanTypeStepComplete;
  const isPersonalFlow = isCreateMode
    ? draft.setupPath === "personal_flexible"
    : draft.kind === "personal";
  const isInstitutionFlow = !isPersonalFlow;

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
    setLoanTypeStepComplete(false);
    setFormError(null);
  }

  function openCreateDialog() {
    setDraft(initialDraft);
    setLoanTypeStepComplete(false);
    setFormError(null);
    setOpen(true);
  }

  function openEditDialog(loan: LoanItem) {
    const existingMetadata = loan.metadata?.trim() ?? "";
    let applicationId = "";
    let processingFees = "";
    let interestRatePercent = "";
    if (existingMetadata.startsWith("{")) {
      try {
        const parsed = JSON.parse(existingMetadata) as {
          applicationId?: string;
          processingFees?: number;
          interestRatePercent?: number;
        };
        applicationId = parsed.applicationId ?? "";
        processingFees =
          typeof parsed.processingFees === "number" ? toMoneyInput(parsed.processingFees) : "";
        interestRatePercent =
          typeof parsed.interestRatePercent === "number" ? String(parsed.interestRatePercent) : "";
      } catch {
        // Preserve backward compatibility with free-form metadata text.
      }
    }

    setDraft({
      id: loan.id,
      setupPath: loan.kind === "institution" ? "institution_app" : "personal_flexible",
      personalScheduleStyle:
        loan.installments && loan.installments.length > 0 ? "scheduled" : "flexible",
      kind: loan.kind,
      name: loan.name,
      lenderName: loan.lenderName,
      applicationId,
      processingFees,
      interestRatePercent,
      durationMonths: loan.installments?.length ? String(loan.installments.length) : "",
      currency: isSupportedCurrency(loan.currency) ? loan.currency : "PHP",
      principalAmount: toInputAmount(loan.principalAmount),
      outstandingAmount: toInputAmount(loan.outstandingAmount),
      disbursedAt: toDateInputUTC(loan.disbursedAt),
      status: loan.status,
      destinationAccountId: loan.destinationAccountId,
      underlyingLoanAccountId: loan.underlyingLoanAccountId ?? "none",
      cadence: loan.cadence ?? "none",
      notes: loan.notes ?? "",
      metadata: existingMetadata.startsWith("{") ? "" : existingMetadata,
      autoCreateUnderlyingAccount: false,
      createOpeningDisbursement: false,
      openingDisbursementAmount: "",
      repaymentMode: "manual",
      autoMonthlyPayment:
        loan.installments?.[0] ? toMoneyInput(loan.installments[0].amount) : "",
      autoInstallmentCount: loan.installments?.length ? String(loan.installments.length) : "",
      autoFirstDueDate: loan.installments?.[0]
        ? toDateInputUTC(loan.installments[0].dueDate)
        : "",
      autoMonthlyRate: "",
      autoTotalPayable: loan.totalPayable ? toMoneyInput(loan.totalPayable) : "",
      repaymentPlan:
        loan.installments?.map((installment) => ({
          id: installment.id,
          dueDate: toDateInputUTC(installment.dueDate),
          amount: toInputAmount(installment.amount),
          principalAmount: toInputAmount(installment.principalAmount ?? 0),
          interestAmount: toInputAmount(installment.interestAmount ?? 0),
        })) ?? [],
    });
    setLoanTypeStepComplete(true);
    setFormError(null);
    setOpen(true);
  }

  function submitLoan() {
    const name = draft.name.trim();
    const lenderName = draft.lenderName.trim();
    const principalAmount = parseMoneyToMiliunits(draft.principalAmount);
    const parsedOutstandingAmount = parseMoneyToMiliunits(draft.outstandingAmount);
    const isCreate = !draft.id;
    const isPersonalCreate = isCreate && draft.setupPath === "personal_flexible";
    const isInstitutionCreate = isCreate && draft.setupPath === "institution_app";
    const outstandingAmount =
      (isPersonalCreate && principalAmount !== null ? principalAmount : parsedOutstandingAmount) ??
      principalAmount;
    const metadataPayload = {
      applicationId: draft.applicationId.trim() || undefined,
      processingFees: parseMoneyToMiliunits(draft.processingFees) ?? 0,
      interestRatePercent:
        Number.isFinite(Number.parseFloat(draft.interestRatePercent)) && draft.interestRatePercent.trim()
          ? Number.parseFloat(draft.interestRatePercent)
          : undefined,
      amountReceived: amountReceivedPreview,
      totalPayable: totalPayablePreview,
      interestAndFees: interestAndFeesPreview,
      maturityDate: maturityDatePreview ? toDateInputLocal(maturityDatePreview) : undefined,
      setupPath: draft.setupPath,
      personalScheduleStyle: draft.personalScheduleStyle,
    };

    if (isPersonalCreate && name.length === 0) {
      // Personal path allows empty loan name.
    } else if (name.length < 2) {
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

    const resolvedDestinationAccountId = draft.destinationAccountId || liquidAccounts[0]?.id || "";
    if (!resolvedDestinationAccountId) {
      setFormError("Select a destination account.");
      return;
    }
    if (isInstitutionCreate && !draft.destinationAccountId) {
      setFormError("Institution loans need a disbursement account.");
      return;
    }

    if (!draft.disbursedAt) {
      setFormError("Choose a disbursement date.");
      return;
    }
    const parsedDisbursedAt = parseDateOnlyToUTC(draft.disbursedAt);
    if (!parsedDisbursedAt) {
      setFormError("Enter a valid disbursement date.");
      return;
    }

    if (draft.status === "closed" && outstandingAmount > 0) {
      setFormError("Closed loans must have zero outstanding amount.");
      return;
    }

    const effectiveRepaymentMode: RepaymentMode =
      isPersonalCreate && draft.personalScheduleStyle === "flexible"
        ? "manual"
        : draft.repaymentMode;
    let sourceRepaymentPlan = draft.repaymentPlan;

    if (isPersonalCreate && draft.personalScheduleStyle === "scheduled") {
      if (!draft.autoFirstDueDate) {
        setFormError("Choose the first payment due date.");
        return;
      }

      if (!Number.isFinite(autoInstallmentCount) || autoInstallmentCount <= 0) {
        setFormError("Enter a valid duration.");
        return;
      }

      if (autoMonthlyPayment <= 0) {
        setFormError("Enter a valid installment amount.");
        return;
      }

      const firstDueDate = parseFlexibleDateInput(draft.autoFirstDueDate);
      if (!firstDueDate) {
        setFormError("Enter a valid first payment due date.");
        return;
      }

      const cadenceForPlan =
        draft.cadence === "none" ? ("monthly" as const) : draft.cadence;
      if (autoMonthlyPayment * autoInstallmentCount < (principalAmount ?? 0)) {
        setFormError("Installment amount and duration must cover the full loan amount.");
        return;
      }
      let remainingAmount = principalAmount ?? 0;
      sourceRepaymentPlan = Array.from({ length: autoInstallmentCount }).map((_, index) => {
        const isLast = index === autoInstallmentCount - 1;
        const amount = isLast ? remainingAmount : Math.min(autoMonthlyPayment, remainingAmount);
        remainingAmount = Math.max(remainingAmount - amount, 0);

        const dueDate =
          cadenceForPlan === "daily"
            ? addDays(firstDueDate, index)
            : cadenceForPlan === "weekly"
            ? addDays(firstDueDate, index * 7)
            : cadenceForPlan === "bi-weekly"
            ? addDays(firstDueDate, index * 14)
            : addMonths(firstDueDate, index);

        return {
          id: crypto.randomUUID(),
          dueDate: toDateInputLocal(dueDate),
          amount: toMoneyInput(amount),
          principalAmount: toMoneyInput(amount),
          interestAmount: "0.00",
        };
      });
    }

    if (effectiveRepaymentMode === "auto") {
      if (!isPersonalCreate && !draft.autoFirstDueDate) {
        setFormError("Choose the first due date for auto plan.");
        return;
      }

      if (!isPersonalCreate && (!Number.isFinite(autoInstallmentCount) || autoInstallmentCount <= 0)) {
        setFormError("Enter a valid number of installments.");
        return;
      }

      if (!isPersonalCreate && autoMonthlyPayment <= 0) {
        setFormError("Enter a valid monthly installment amount.");
        return;
      }

      if (!isPersonalCreate) {
        sourceRepaymentPlan = autoGeneratedPlan;
      }
      if (sourceRepaymentPlan.length === 0) {
        setFormError("Unable to generate plan. Check auto plan inputs.");
        return;
      }
    }

    const normalizedRepaymentPlan = sourceRepaymentPlan
      .map((installment) => {
        const parsedDueDate = parseDateOnlyToUTC(installment.dueDate);
        return {
        dueDate: parsedDueDate ? toDateInputUTC(parsedDueDate) : "",
        amount: parseMoneyToMiliunits(installment.amount),
        principalAmount: parseMoneyToMiliunits(installment.principalAmount),
        interestAmount: parseMoneyToMiliunits(installment.interestAmount),
      };
      })
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

    let cadence = draft.cadence === "none" ? undefined : draft.cadence;
    if (isInstitutionCreate) cadence = "monthly";
    if (isPersonalCreate && draft.personalScheduleStyle === "scheduled" && !cadence) cadence = "monthly";
    const nextDueDate = repaymentPlan[0]?.dueDate
      ? new Date(repaymentPlan[0].dueDate)
      : undefined;
    const notesValue = draft.notes.trim() || undefined;
    const metadataValue = JSON.stringify(metadataPayload);

    if (draft.id) {
      updateLoan.mutate({
        id: draft.id,
        kind: draft.kind,
        name,
        lenderName,
        currency: draft.currency,
        principalAmount,
        outstandingAmount,
        disbursedAt: parsedDisbursedAt,
        status: draft.status,
        destinationAccountId: resolvedDestinationAccountId,
        underlyingLoanAccountId:
          draft.underlyingLoanAccountId === "none" ? undefined : draft.underlyingLoanAccountId,
        cadence,
        nextDueDate,
        notes: notesValue,
        metadata: metadataValue,
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
      kind: isInstitutionCreate ? "institution" : "personal",
      name: name || `${lenderName} loan`,
      lenderName,
      currency: draft.currency,
      principalAmount,
      outstandingAmount,
      disbursedAt: parsedDisbursedAt,
      status: draft.status,
      destinationAccountId: resolvedDestinationAccountId,
      underlyingLoanAccountId: selectedUnderlyingAccountId,
      cadence,
      nextDueDate,
      notes: notesValue,
      metadata: metadataValue,
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
        <Card className="relative overflow-hidden rounded-[1.5rem] border-white/10 bg-[linear-gradient(145deg,rgba(16,41,43,0.98),rgba(29,78,77,0.94))] text-white shadow-[0_26px_80px_-52px_rgba(10,31,34,0.62)]">
          <div className="pointer-events-none absolute inset-0 opacity-70">
            <div className="absolute inset-y-0 left-0 w-[58%] bg-[radial-gradient(circle_at_20%_26%,rgba(6,17,18,0.28),transparent_42%)]" />
            <div className="absolute inset-y-0 right-0 hidden w-[44%] bg-[radial-gradient(circle_at_72%_28%,rgba(80,255,214,0.13),transparent_30%),radial-gradient(circle_at_84%_72%,rgba(80,255,214,0.08),transparent_22%)] lg:block" />
          </div>

          <CardContent className="relative space-y-4 p-4 sm:p-5 md:space-y-4 md:p-6 lg:p-7.5">
            <div className="flex items-start justify-between gap-4">
              <p className="text-[0.84rem] font-medium tracking-[0.01em] text-white/72 md:text-[0.88rem]">
                Loan posture
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="hidden h-8 rounded-full border-white/24 bg-white/[0.08] px-3 text-[0.76rem] font-medium text-white shadow-none hover:bg-white/[0.13] hover:text-white sm:inline-flex md:h-8 md:px-3.5 md:text-[0.79rem]"
                onClick={openCreateDialog}
              >
                Add loan
              </Button>
            </div>

            <div className="grid gap-4 border-border/70 md:min-h-[7.7rem] md:grid-cols-[minmax(0,1.5fr)_minmax(0,1.02fr)_minmax(0,0.92fr)] md:gap-0">
              <div className="space-y-2.5 md:space-y-3 md:pr-7">
                <h2 className="text-[0.98rem] font-semibold tracking-tight text-white/95 md:text-[1.08rem] lg:text-[1.16rem]">
                  Loan posture
                </h2>
                <div className="flex items-center gap-2 text-[1.06rem] font-semibold leading-none tracking-tight text-white md:text-[1.34rem] lg:text-[1.48rem]">
                  <span className="size-2.5 rounded-full bg-emerald-400 md:size-3" />
                  See every repayment obligation in one clear shape
                </div>
                <p className="max-w-[30ch] text-[0.9rem] leading-6 text-white/74 md:max-w-[34ch] md:text-[0.93rem] md:leading-7">
                  Track active borrowing, upcoming dues, and lender concentration without losing
                  repayment context.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-0 border-t border-white/15 pt-3.5 md:border-0 md:border-l md:border-white/15 md:pl-7 md:pt-0">
                <div className="space-y-2.5 pr-4 md:pr-5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[0.82rem] text-white/70 md:text-[0.88rem]">Active loans</p>
                    <span className="flex size-8.5 items-center justify-center rounded-full bg-emerald-100/95 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200 md:size-9">
                      <HandCoins className="size-3.5 md:size-[0.95rem]" />
                    </span>
                  </div>
                  <p className="text-[0.96rem] font-semibold tracking-tight text-white md:text-[1.18rem] lg:text-[1.28rem]">
                    {String(summary?.activeLoans ?? 0)}
                  </p>
                  <p className="text-[0.78rem] leading-5.5 text-white/64 md:text-[0.82rem] md:leading-6">
                    {formatCurrencyMiliunits(
                      summary?.totalOutstanding ?? 0,
                      summary?.nextDueLoan?.currency ?? "PHP",
                    )}
                  </p>
                </div>

                <div className="space-y-2.5 border-l border-white/15 pl-4 pr-4 md:pr-5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[0.82rem] text-white/70 md:text-[0.88rem]">Due soon</p>
                    <span className="flex size-8.5 items-center justify-center rounded-full bg-sky-100/95 text-sky-700 dark:bg-sky-500/20 dark:text-sky-200 md:size-9">
                      <CalendarClock className="size-3.5 md:size-[0.95rem]" />
                    </span>
                  </div>
                  <p className="text-[0.96rem] font-semibold tracking-tight text-white md:text-[1.18rem] lg:text-[1.28rem]">
                    {String(summary?.dueSoonCount ?? 0)}
                  </p>
                  <p className="text-[0.78rem] leading-5.5 text-white/64 md:text-[0.82rem] md:leading-6">
                    {summary?.nextDueLoan?.nextDueDate
                      ? `Next due ${formatDate(summary.nextDueLoan.nextDueDate)}`
                      : "No upcoming due date"}
                  </p>
                </div>
              </div>

              <div className="hidden space-y-2 border-t border-white/15 pt-4 md:block md:border-0 md:border-l md:border-white/15 md:pl-7 md:pt-0">
                <div className="flex items-center gap-2 text-[0.82rem] text-white/70">
                  <Landmark className="size-4" />
                  Lender concentration
                </div>
                <p className="line-clamp-2 text-[0.95rem] font-semibold tracking-tight text-white lg:text-[0.99rem]">
                  {topLenderPosture ? topLenderPosture.lenderName : "No active lender"}
                </p>
                <p className="text-[0.82rem] leading-6 text-white/70">
                  {topLenderPosture
                    ? `${formatCurrencyMiliunits(topLenderPosture.amount, summary?.nextDueLoan?.currency ?? "PHP")} in outstanding`
                    : "Add loans to track lender exposure"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

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
                <CardContent className="p-4">
                  <p className="text-[0.66rem] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                    {card.label}
                  </p>
                  <p className="mt-1.5 text-[1.3rem] font-semibold tracking-tight text-[#10292B] dark:text-foreground">
                    {card.value}
                  </p>
                  <p className="mt-1 text-[0.8rem] leading-5 text-muted-foreground">{card.detail}</p>
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
              <CardContent className="p-4">
                <p className="text-[0.66rem] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                  {card.label}
                </p>
                <p className="mt-1.5 text-[1.3rem] font-semibold tracking-tight text-[#10292B] dark:text-foreground">
                  {card.value}
                </p>
                <p className="mt-1 text-[0.8rem] leading-5 text-muted-foreground">{card.detail}</p>
              </CardContent>
            </Card>
          ))}
        </div>

      </section>

      <section>
        <Card className="border-white/75 bg-white/84 shadow-[0_24px_70px_-55px_rgba(10,31,34,0.28)] dark:border-white/8 dark:bg-[#182123] dark:shadow-[0_28px_80px_-55px_rgba(0,0,0,0.62)]">
          <CardContent className="space-y-3 px-4 py-4 sm:px-5 sm:py-4.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="flex size-7 items-center justify-center rounded-full bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-200">
                  <Sparkles className="size-3.25" />
                </div>
                <div>
                  <p className="text-[0.68rem] uppercase tracking-[0.11em] text-muted-foreground">
                    AI insight
                  </p>
                  <h3 className="text-[0.92rem] font-semibold tracking-tight text-[#10292B] dark:text-foreground">
                    {aiInsightQuery.data?.headline ?? "AI loan coach"}
                  </h3>
                </div>
              </div>
              <span className="rounded-full border border-border/70 bg-background px-2.5 py-1 text-[0.72rem] text-muted-foreground">
                {aiInsightQuery.data?.confidence ?? "Initial estimate"}
              </span>
            </div>

            <p className="text-[0.82rem] leading-5.5 text-muted-foreground">
              {aiInsightQuery.data?.summary ?? "Repayment pacing and due-date guidance will appear here."}
            </p>

            <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {(aiInsightQuery.data?.metrics ?? []).slice(0, 6).map((metric) => (
                <div
                  key={metric.label}
                  className="min-w-[10.25rem] shrink-0 rounded-lg border border-border/70 bg-background px-3 py-2.5 dark:bg-[#141d1f]"
                >
                  <p className="text-[0.66rem] uppercase tracking-[0.1em] text-muted-foreground">
                    {metric.label}
                  </p>
                  <p
                    className={`mt-0.5 text-[0.86rem] font-semibold ${
                      metric.tone === "positive"
                        ? "text-emerald-700 dark:text-emerald-300"
                        : metric.tone === "warning"
                          ? "text-amber-700 dark:text-amber-300"
                          : "text-foreground"
                    }`}
                  >
                    {metric.value}
                  </p>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-border/70 bg-background px-3.5 py-2.5 dark:bg-[#141d1f]">
              <p className="text-[0.7rem] uppercase tracking-[0.1em] text-muted-foreground">
                Recommended next step
              </p>
              <p className="mt-0.5 text-[0.84rem] text-foreground">
                {aiInsightQuery.data?.recommendations?.[0] ??
                  "No recommendation yet. Add repayment activity to improve guidance."}
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      <Card className="border-border/70 bg-card/90">
        <CardHeader className="pb-1.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-[1.2rem] tracking-tight sm:text-[1.3rem]">Loan Records</CardTitle>
            <div className="flex w-full flex-col gap-1.5 sm:w-auto sm:flex-row sm:items-center sm:justify-end sm:gap-2">
              <Button
                type="button"
                onClick={openCreateDialog}
                className="order-1 h-8 w-auto self-start rounded-full bg-[#17393c] px-3.5 text-[0.88rem] text-white hover:bg-[#1d4a4d] sm:order-2 sm:h-[2.15rem] sm:px-4 sm:text-[0.9rem]"
              >
                Add loan
              </Button>
              <div className="relative order-2 w-full sm:order-1 sm:w-80">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search by loan name or lender"
                  className="h-8 pl-9 text-[0.9rem] sm:h-[2.15rem] sm:text-[0.92rem]"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {loansQuery.isLoading ? (
            <p className="rounded-xl border border-dashed border-border/70 px-4 py-4 text-[0.92rem] text-muted-foreground">
              Loading loans...
            </p>
          ) : null}

          {!loansQuery.isLoading && loans.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border/70 px-4 py-4 text-[0.92rem] text-muted-foreground">
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
        <DialogContent
          mobileBehavior="adaptive"
          className="h-[100dvh] overflow-hidden border border-border/70 bg-background/96 p-0 shadow-[0_40px_90px_-50px_rgba(15,23,42,0.5)] backdrop-blur dark:border-white/8 dark:bg-[linear-gradient(180deg,rgba(24,33,35,0.98),rgba(18,27,29,0.98))] [&>button[data-slot='dialog-close']]:right-3 [&>button[data-slot='dialog-close']]:top-3 sm:[&>button[data-slot='dialog-close']]:right-4 sm:[&>button[data-slot='dialog-close']]:top-4"
        >
          <div className="border-b border-border/60 px-4 pb-2.5 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-7 sm:py-4">
            <DialogHeader className="space-y-2">
              <div className="inline-flex w-fit rounded-lg border border-border/70 bg-background/80 px-2.5 py-0.75 text-[0.58rem] uppercase tracking-[0.2em] text-muted-foreground sm:rounded-full sm:px-3 sm:text-[0.64rem] sm:tracking-[0.22em]">
                Loan setup
              </div>
              <DialogTitle className="text-[1.08rem] tracking-tight sm:text-[1.45rem]">
                {draft.id ? "Edit loan" : isChoosingLoanType ? "Choose loan type" : "Create loan"}
              </DialogTitle>
              <DialogDescription className="max-w-2xl text-[0.76rem] leading-5 sm:text-[0.84rem] sm:leading-5.5">
                {isChoosingLoanType
                  ? "Pick the loan setup path first. We will tailor fields to match the type."
                  : isCreateMode
                  ? "Enter core terms, then confirm repayment structure."
                  : "Update lender, amounts, destination, and repayment plan."}
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-7 sm:py-4">
            <div className="space-y-3 sm:space-y-3.5">
              {formError ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
                  {formError}
                </div>
              ) : null}

            {isChoosingLoanType ? (
              <div className="space-y-3.5 rounded-2xl border border-border/70 bg-background p-4 sm:p-5">
                <div className="space-y-1">
                  <p className="text-[0.64rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Step 1 of 2
                  </p>
                  <h3 className="text-[1.04rem] font-semibold tracking-tight text-foreground sm:text-[1.12rem]">
                    Select your loan type
                  </h3>
                  <p className="text-[0.79rem] leading-5.5 text-muted-foreground sm:text-[0.84rem]">
                    This helps Veyra show the right setup and repayment fields.
                  </p>
                </div>
                <p className="text-[0.64rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Loan type
                </p>
                <div className="grid gap-2.5">
                  <button
                    type="button"
                    className={`rounded-2xl border px-4 py-3 text-left transition-colors ${
                      draft.setupPath === "personal_flexible"
                        ? "border-primary/45 bg-background shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--primary)_20%,transparent)]"
                        : "border-border/70 bg-background hover:bg-muted/35"
                    }`}
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        setupPath: "personal_flexible",
                        kind: "personal",
                        personalScheduleStyle: "scheduled",
                        repaymentMode: "auto",
                      }))
                    }
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="inline-flex size-9 items-center justify-center rounded-full border border-border/60 bg-background/85 text-muted-foreground">
                        <UserRound className="size-4" />
                      </span>
                      {draft.setupPath === "personal_flexible" ? (
                        <span className="inline-flex size-5 items-center justify-center rounded-full bg-emerald-700 text-white">
                          <Check className="size-3.5" />
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-3 text-[1rem] font-semibold tracking-tight sm:text-[1.06rem]">
                      Personal flexible loan
                    </p>
                    <p className="mt-1 text-[0.8rem] leading-5.5 text-muted-foreground sm:text-[0.84rem]">
                      Friends/family or informal borrowing.
                    </p>
                  </button>
                  <button
                    type="button"
                    className={`rounded-2xl border px-4 py-3 text-left transition-colors ${
                      draft.setupPath === "institution_app"
                        ? "border-primary/45 bg-background shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--primary)_20%,transparent)]"
                        : "border-border/70 bg-background hover:bg-muted/35"
                    }`}
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        setupPath: "institution_app",
                        kind: "institution",
                        repaymentMode: "auto",
                        cadence: "monthly",
                        personalScheduleStyle: "scheduled",
                      }))
                    }
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="inline-flex size-9 items-center justify-center rounded-full border border-border/60 bg-background/85 text-muted-foreground">
                        <Landmark className="size-4" />
                      </span>
                      {draft.setupPath === "institution_app" ? (
                        <span className="inline-flex size-5 items-center justify-center rounded-full bg-emerald-700 text-white">
                          <Check className="size-3.5" />
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-3 text-[1rem] font-semibold tracking-tight sm:text-[1.06rem]">
                      Digital / traditional loan app
                    </p>
                    <p className="mt-1 text-[0.8rem] leading-5.5 text-muted-foreground sm:text-[0.84rem]">
                      Bank and lender products with fixed terms.
                    </p>
                  </button>
                </div>
              </div>
            ) : null}

            {!isCreateMode || loanTypeStepComplete ? (
            <>
            <div className="space-y-2 rounded-xl border border-border/70 bg-background/60 p-2.5 sm:p-4">
              <div className="flex items-center justify-between">
                <p className="text-[0.64rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Basic details
                </p>
                {isCreateMode ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 rounded-full border-border/80 bg-background px-3 text-[0.74rem] font-medium text-foreground hover:bg-muted/35"
                    onClick={() => setLoanTypeStepComplete(false)}
                  >
                    Change loan type
                  </Button>
                ) : null}
              </div>
              {isPersonalFlow ? (
                <div className="space-y-2.5">
                  <div className="space-y-1.5">
                    <label className={loanLabelClassName}>Lender name</label>
                    <Input
                      value={draft.lenderName}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, lenderName: event.target.value }))
                      }
                      placeholder="e.g. Mom, friend, colleague"
                      className={loanFieldClassName}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className={loanLabelClassName}>Loan name (optional)</label>
                    <Input
                      value={draft.name}
                      onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                      placeholder="Optional label"
                      className={loanFieldClassName}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className={loanLabelClassName}>Loan amount</label>
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
                  <div className="space-y-1.5">
                    <label className={loanLabelClassName}>Disbursement account (optional)</label>
                    <Select
                      value={draft.destinationAccountId || "__none__"}
                      onValueChange={(value) =>
                        setDraft((current) => ({
                          ...current,
                          destinationAccountId: value === "__none__" ? "" : value,
                        }))
                      }
                    >
                      <SelectTrigger className={loanFieldClassName}>
                        <SelectValue placeholder="Where proceeds were received" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Clear selection</SelectItem>
                        {liquidAccounts.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.name} · {getAccountTypeLabel(account.type)} · {account.currency}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className={loanLabelClassName}>Disbursement date</label>
                    <DatePickerField
                      value={draft.disbursedAt}
                      onChange={(value) =>
                        setDraft((current) => ({
                          ...current,
                          disbursedAt: value,
                        }))
                      }
                      placeholder="Choose date"
                      className={loanFieldClassName}
                    />
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-[0.72rem] leading-5 text-muted-foreground">
                    Capture lender reference and contract identity first, then set amounts and repayment terms.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className={loanLabelClassName}>Lender name</label>
                      <Input
                        value={draft.lenderName}
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, lenderName: event.target.value }))
                        }
                        placeholder="e.g. Atome"
                        className={loanFieldClassName}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className={loanLabelClassName}>Loan name</label>
                      <Input
                        value={draft.name}
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, name: event.target.value }))
                        }
                        placeholder="e.g. Atome loan"
                        className={loanFieldClassName}
                      />
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className={loanLabelClassName}>Application / Loan ID</label>
                      <Input
                        value={draft.applicationId}
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, applicationId: event.target.value }))
                        }
                        placeholder="Lender reference"
                        className={loanFieldClassName}
                      />
                    </div>
                    <div className="space-y-1.5">
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
                        <SelectTrigger className={loanFieldClassName}>
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
                  </div>
                  <div className="grid gap-3 sm:[grid-template-columns:minmax(0,0.86fr)_minmax(0,1.14fr)]">
                    <div className="space-y-1.5">
                      <label className={loanLabelClassName}>Disbursement date</label>
                      <DatePickerField
                        value={draft.disbursedAt}
                        onChange={(value) =>
                          setDraft((current) => ({
                            ...current,
                            disbursedAt: value,
                          }))
                        }
                        placeholder="Choose date"
                        className={loanFieldClassName}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className={loanLabelClassName}>Disbursement account</label>
                      <Select
                        value={draft.destinationAccountId || undefined}
                        onValueChange={(value) =>
                          setDraft((current) => ({
                            ...current,
                            destinationAccountId: value === "__none__" ? "" : value,
                          }))
                        }
                      >
                        <SelectTrigger className={loanFieldClassName}>
                          <SelectValue placeholder="Select account" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Clear selection</SelectItem>
                          {liquidAccounts.map((account) => (
                            <SelectItem key={account.id} value={account.id}>
                              {account.name} · {getAccountTypeLabel(account.type)} · {account.currency}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </>
              )}
            </div>

            {isInstitutionFlow ? (
            <div className="space-y-3 rounded-xl border border-border/70 bg-background/60 p-3 sm:p-4">
              <p className="text-[0.64rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Contract amounts
              </p>
              <p className="text-[0.72rem] leading-5 text-muted-foreground">
                Track approved principal and deductions so amount received and finance preview stay accurate.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className={loanLabelClassName}>Approved principal</label>
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
                <div className="space-y-1.5">
                  <label className={loanLabelClassName}>Processing fees</label>
                  <Input
                    value={draft.processingFees}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, processingFees: event.target.value }))
                    }
                    inputMode="decimal"
                    placeholder="0.00"
                    className={loanFieldClassName}
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className={loanLabelClassName}>Interest rate % (optional)</label>
                  <Input
                    value={draft.interestRatePercent}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, interestRatePercent: event.target.value }))
                    }
                    inputMode="decimal"
                    placeholder="e.g. 2.5"
                    className={loanFieldClassName}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className={loanLabelClassName}>Amount received</label>
                  <div className="rounded-[0.75rem] border border-border/70 bg-muted/35 px-2.5 py-1.5 text-[0.78rem] font-medium text-foreground sm:rounded-[0.85rem] sm:px-3 sm:py-[0.5rem] sm:text-[0.84rem]">
                    {formatCurrencyMiliunits(amountReceivedPreview, draft.currency)}
                  </div>
                </div>
              </div>
            </div>
            ) : null}
            </>
            ) : null}

            {!isCreateMode || loanTypeStepComplete ? (
            <div className="space-y-2 rounded-xl border border-border/70 bg-background/60 p-3 sm:p-4">
              <div className="flex items-center justify-between">
                <label className={loanLabelClassName}>Repayment plan</label>
                {!isCreateMode || !isPersonalFlow ? (
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
                ) : null}
              </div>
              {isCreateMode && isPersonalFlow ? (
                <div className="space-y-2 rounded-xl border border-border/70 bg-background/70 p-3">
                  <p className="text-[0.72rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    Payment schedule
                  </p>
                  <div className="grid gap-2">
                    <button
                      type="button"
                      className={`flex h-8 items-center rounded-lg border px-3 text-left text-[0.78rem] ${
                        draft.personalScheduleStyle === "flexible"
                          ? "border-primary/45 bg-primary/10"
                          : "border-border/70 hover:bg-muted/40"
                      }`}
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          personalScheduleStyle: "flexible",
                          repaymentMode: "manual",
                        }))
                      }
                    >
                      No, I will pay whenever I can
                    </button>
                    <button
                      type="button"
                      className={`flex h-8 items-center rounded-lg border px-3 text-left text-[0.78rem] ${
                        draft.personalScheduleStyle === "scheduled"
                          ? "border-primary/45 bg-primary/10"
                          : "border-border/70 hover:bg-muted/40"
                      }`}
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          personalScheduleStyle: "scheduled",
                          repaymentMode: "auto",
                          cadence: current.cadence === "none" ? "monthly" : current.cadence,
                        }))
                      }
                    >
                      Yes, there is a payment schedule
                    </button>
                  </div>
                </div>
              ) : null}
              <div className="space-y-2">
                {isCreateMode && isPersonalFlow && draft.personalScheduleStyle === "flexible" ? (
                  <div className="rounded-xl border border-dashed border-border/70 px-3 py-3 text-[0.82rem] text-muted-foreground sm:px-4">
                    No schedule selected. You can create this loan now and optionally add a note.
                  </div>
                ) : isCreateMode && isPersonalFlow && draft.personalScheduleStyle === "scheduled" ? (
                  <div className="space-y-2.5 sm:grid sm:grid-cols-2 sm:gap-3 sm:space-y-0">
                    <div className="space-y-1.5">
                      <label className="text-[0.84rem] font-semibold text-foreground/90 sm:text-[0.76rem] sm:font-medium sm:text-muted-foreground">
                        Duration
                      </label>
                      <Input
                        inputMode="numeric"
                        value={draft.autoInstallmentCount}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            autoInstallmentCount: event.target.value,
                            durationMonths: event.target.value,
                          }))
                        }
                        placeholder="e.g. 6"
                        className={loanFieldClassName}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[0.84rem] font-semibold text-foreground/90 sm:text-[0.76rem] sm:font-medium sm:text-muted-foreground">
                        Installment amount
                      </label>
                      <Input
                        inputMode="decimal"
                        value={draft.autoMonthlyPayment}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            autoMonthlyPayment: event.target.value,
                          }))
                        }
                        placeholder="0.00"
                        className={loanFieldClassName}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[0.84rem] font-semibold text-foreground/90 sm:text-[0.76rem] sm:font-medium sm:text-muted-foreground">
                        Cadence
                      </label>
                      <Select
                        value={draft.cadence}
                        onValueChange={(value) =>
                          setDraft((current) => ({ ...current, cadence: value as LoanDraft["cadence"] }))
                        }
                      >
                        <SelectTrigger className={loanFieldClassName}>
                          <SelectValue placeholder="Select cadence" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="daily">Daily</SelectItem>
                          <SelectItem value="weekly">Weekly</SelectItem>
                          <SelectItem value="bi-weekly">Bi-weekly</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <label className="text-[0.84rem] font-semibold text-foreground/90 sm:text-[0.76rem] sm:font-medium sm:text-muted-foreground">
                        First payment due
                      </label>
                      <DatePickerField
                        value={draft.autoFirstDueDate}
                        onChange={(value) =>
                          setDraft((current) => ({ ...current, autoFirstDueDate: value }))
                        }
                        placeholder="Choose date"
                        className={loanFieldClassName}
                      />
                    </div>
                  </div>
                ) : draft.repaymentMode === "auto" ? (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <label className="text-[0.84rem] font-semibold text-foreground/90 sm:text-[0.76rem] sm:font-medium sm:text-muted-foreground">
                          Monthly payment
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
                        <label className="text-[0.84rem] font-semibold text-foreground/90 sm:text-[0.76rem] sm:font-medium sm:text-muted-foreground">
                          Duration (months)
                        </label>
                        <Input
                          inputMode="numeric"
                          value={isInstitutionFlow ? draft.durationMonths : draft.autoInstallmentCount}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              autoInstallmentCount: event.target.value,
                              durationMonths: event.target.value,
                            }))
                          }
                          placeholder={isInstitutionFlow ? "Duration months" : "e.g. 18"}
                          className={loanFieldClassName}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[0.84rem] font-semibold text-foreground/90 sm:text-[0.76rem] sm:font-medium sm:text-muted-foreground">
                          First payment due
                        </label>
                        <DatePickerField
                          value={draft.autoFirstDueDate}
                          onChange={(value) =>
                            setDraft((current) => ({ ...current, autoFirstDueDate: value }))
                          }
                          placeholder="Choose date"
                          className={loanFieldClassName}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[0.84rem] font-semibold text-foreground/90 sm:text-[0.76rem] sm:font-medium sm:text-muted-foreground">
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
                    {autoGeneratedPlan.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-border/70 px-3 py-3 text-[0.78rem] text-muted-foreground sm:px-4 sm:text-[0.82rem]">
                        Enter monthly installment, number of installments, and first due date to auto-build repayment plan.
                      </div>
                    ) : (
                      <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
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
                          <DatePickerField
                            value={installment.dueDate}
                            onChange={(value) =>
                              setDraft((current) => ({
                                ...current,
                                repaymentPlan: current.repaymentPlan.map((entry) =>
                                  entry.id === installment.id
                                    ? { ...entry, dueDate: value }
                                    : entry
                                ),
                              }))
                            }
                            placeholder="Choose date"
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
            ) : null}

            {!isCreateMode || loanTypeStepComplete ? (
            <div className="space-y-2 rounded-xl border border-border/70 bg-background/60 p-3 sm:p-4">
              <label className={loanLabelClassName}>Preview (read-only)</label>
              <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-[0.76rem] leading-5 text-muted-foreground sm:px-3.5 sm:text-[0.8rem]">
                {isPersonalFlow ? (
                  <>
                    <p>
                      Total payable:{" "}
                      <span className="font-semibold text-foreground">
                        {formatCurrencyMiliunits(personalPreviewTotalPayable, draft.currency)}
                      </span>
                    </p>
                    <p>
                      Interest & fees:{" "}
                      <span className="font-semibold text-foreground">
                        {formatCurrencyMiliunits(personalPreviewInterestAndFees, draft.currency)}
                      </span>
                    </p>
                    <p>
                      Maturity date:{" "}
                      <span className="font-semibold text-foreground">
                        {personalPreviewMaturityDate
                          ? formatDate(personalPreviewMaturityDate)
                          : draft.personalScheduleStyle === "flexible"
                            ? "Flexible (no fixed maturity)"
                            : "Add due date + duration"}
                      </span>
                    </p>
                  </>
                ) : (
                  <>
                    <p>
                      Amount received:{" "}
                      <span className="font-semibold text-foreground">
                        {formatCurrencyMiliunits(amountReceivedPreview, draft.currency)}
                      </span>
                    </p>
                    <p>
                      Total payable:{" "}
                      <span className="font-semibold text-foreground">
                        {formatCurrencyMiliunits(totalPayablePreview, draft.currency)}
                      </span>
                    </p>
                    <p>
                      Interest & fees:{" "}
                      <span className="font-semibold text-foreground">
                        {formatCurrencyMiliunits(interestAndFeesPreview, draft.currency)}
                      </span>
                    </p>
                    <p>
                      Maturity date:{" "}
                      <span className="font-semibold text-foreground">
                        {maturityDatePreview ? formatDate(maturityDatePreview) : "Add first due + duration"}
                      </span>
                    </p>
                  </>
                )}
              </div>
            </div>
            ) : null}

            {!isCreateMode || loanTypeStepComplete ? (
            <details className="rounded-xl border border-border/70 bg-background/60 p-3 sm:p-4">
              <summary className="cursor-pointer select-none text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Optional details
              </summary>
              <div className="mt-3 space-y-3">
            <div className="space-y-2">
              <label className={loanLabelClassName}>Notes (optional)</label>
              <Input
                value={draft.notes}
                onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
                placeholder="Any context for this loan"
                className={loanFieldClassName}
              />
            </div>
              </div>
            </details>
            ) : null}
            </div>
          </div>

          <DialogFooter className="sticky bottom-0 z-10 !mx-0 !mb-0 flex-row items-center justify-end gap-2 border-t border-border/60 bg-background/85 px-4 pb-[max(0.7rem,env(safe-area-inset-bottom))] pt-2.5 sm:px-8 sm:py-5 [&>button]:w-auto">
            <Button
              type="button"
              variant="outline"
              className="h-8 rounded-full px-3.5 text-[0.9rem] sm:h-9 sm:px-4 sm:text-[0.92rem]"
              onClick={resetDialog}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="h-8 rounded-full bg-[#17393c] px-4 text-[0.9rem] text-white hover:bg-[#1d4a4d] disabled:text-white/85 sm:h-9 sm:px-5 sm:text-[0.92rem]"
              onClick={
                isChoosingLoanType
                  ? () => {
                      setLoanTypeStepComplete(true);
                      setFormError(null);
                    }
                  : submitLoan
              }
              disabled={isSaving || liquidAccounts.length === 0}
            >
              {isChoosingLoanType
                ? "Continue"
                : isSaving
                ? "Saving..."
                : draft.id
                ? "Save changes"
                : "Create loan"}
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
        <DialogContent
          mobileBehavior="modal"
          className="max-h-[calc(84dvh-env(safe-area-inset-top))] w-[calc(100vw-1rem)] max-w-sm overflow-x-hidden overflow-y-auto rounded-[1.2rem] border-border/70 bg-background/96 p-0 sm:max-h-[88vh] sm:max-w-[34rem] sm:rounded-[1.45rem]"
        >
          <DialogHeader className="border-b border-border/60 px-4 pb-3 pt-[max(0.85rem,env(safe-area-inset-top))] pr-12 sm:px-6 sm:pb-3.5 sm:pt-6 sm:pr-14">
            <DialogTitle className="text-[1.05rem] tracking-tight sm:text-[1.28rem]">Delete loan?</DialogTitle>
            <DialogDescription className="pt-1 text-[0.8rem] leading-6 sm:text-[0.88rem] sm:leading-6.5">
              {deleteTarget
                ? `Remove "${deleteTarget.name}" from Loans? This only removes the loan record and does not delete underlying account or transaction history.`
                : "Remove this loan from Loans? This only removes the loan record and does not delete underlying account or transaction history."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="!mx-0 !-mb-0 flex-row items-center justify-end gap-2 border-t border-border/60 bg-transparent px-4 py-3.5 sm:px-6 sm:py-4 [&>button]:w-auto">
            <Button
              type="button"
              variant="outline"
              className="h-8 rounded-lg px-3.5 text-sm sm:h-9 sm:rounded-full sm:px-4"
              onClick={() => setDeleteTarget(null)}
              disabled={removeLoan.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="h-8 rounded-lg bg-destructive px-3.5 text-sm text-white hover:bg-destructive/90 sm:h-9 sm:rounded-full sm:px-4"
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
    <div className="rounded-2xl border border-border/70 bg-background/80 p-4 sm:p-5">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_auto] md:items-center">
        <div className="min-w-0">
          <p className="truncate text-[1.08rem] font-semibold tracking-tight text-foreground">{loan.name}</p>
          <p className="mt-1 truncate text-[0.82rem] text-muted-foreground">
            {loan.kind === "institution" ? "Institution" : "Personal"} · {loan.lenderName}
          </p>
        </div>

        <div className="grid gap-2 text-[0.78rem] sm:grid-cols-2 md:gap-3">
          <div className="space-y-0.5">
            <p className="text-[0.66rem] uppercase tracking-[0.13em] text-muted-foreground/85">Outstanding</p>
            <p className="text-[0.98rem] font-semibold text-foreground/95">
              {formatCurrencyMiliunits(loan.outstandingAmount, loan.currency)}
            </p>
          </div>
          <div className="space-y-0.5">
            <p className="text-[0.66rem] uppercase tracking-[0.13em] text-muted-foreground/85">Next due</p>
            <p className="text-[0.86rem] font-medium text-foreground/90">{formatDate(loan.nextDueDate)}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 md:justify-end">
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
    </div>
  );
}
