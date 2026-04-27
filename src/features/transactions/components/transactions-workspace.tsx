"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import {
  Activity,
  ArrowRightLeft,
  ChevronRight,
  Clock3,
  Copy,
  CreditCard,
  FolderOpen,
  HandCoins,
  Landmark,
  Loader2,
  MoreHorizontal,
  Pencil,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wand2,
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
import { DatePickerField } from "@/components/date-picker/date-picker";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type RouterInputs = inferRouterInputs<AppRouter>;
type RouterOutputs = inferRouterOutputs<AppRouter>;
type CreateTransactionEventInput = RouterInputs["transactions"]["create"];
type UpdateTransactionEventInput = RouterInputs["transactions"]["update"];
type TransactionEventItem = RouterOutputs["transactions"]["list"]["items"][number];
type TransactionEventType = RouterOutputs["transactions"]["list"]["items"][number]["type"];
type AccountItem = RouterOutputs["accounts"]["list"][number];
type BudgetItem = RouterOutputs["budgets"]["list"][number];
type CategoryItem = RouterOutputs["categories"]["list"][number];

type EventDraft = {
  amount: string;
  creditAccountId: string;
  date: string;
  description: string;
  destinationAccountId: string;
  budgetId: string;
  categoryId: string;
  feeAmount: string;
  loanAccountId: string;
  notes: string;
  sourceAccountId: string;
  type: TransactionEventType;
  accountId: string;
};

type DeleteTarget = { id: string; description: string } | null;

function TransactionActionsMenu({
  event,
  onDelete,
  onEdit,
}: {
  event: TransactionEventItem;
  onDelete: (target: Exclude<DeleteTarget, null>) => void;
  onEdit: (event: TransactionEventItem) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          className="h-8 w-8 rounded-full"
          aria-label={`Open actions for ${event.description}`}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem
          className="gap-2 px-2 py-1.5 text-[0.82rem]"
          onSelect={() => onEdit(event)}
        >
          <Pencil className="size-4" />
          Edit event
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          className="gap-2 px-2 py-1.5 text-[0.82rem]"
          onSelect={() => onDelete({ id: event.id, description: event.description })}
        >
          <Trash2 className="size-4" />
          Delete event
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function formatEditorAmount(value: number) {
  return (value / 1000).toFixed(2);
}

function toDateInputValue(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toISOString().slice(0, 10);
}

function buildDraftFromEvent(event: TransactionEventItem): EventDraft {
  const primaryEntry = event.entries.find((entry) => entry.role === "primary");
  const sourceEntry = event.entries.find((entry) => entry.role === "source");
  const destinationEntry = event.entries.find((entry) => entry.role === "destination");
  const paymentEntry = event.entries.find((entry) => entry.role === "payment_account");
  const liabilityEntry = event.entries.find((entry) => entry.role === "liability_account");
  const loanEntry = event.entries.find((entry) => entry.role === "loan_account");
  const disbursementEntry = event.entries.find((entry) => entry.role === "disbursement_account");

  return {
    amount: formatEditorAmount(getPrimaryAmount(event)),
    creditAccountId: liabilityEntry?.accountId ?? "",
    date: toDateInputValue(event.occurredAt),
    description: event.description,
    destinationAccountId: destinationEntry?.accountId ?? disbursementEntry?.accountId ?? "",
    budgetId: event.budgetId ?? "none",
    categoryId: event.categoryId ?? "none",
    feeAmount: formatEditorAmount(event.feeAmount),
    loanAccountId: loanEntry?.accountId ?? "",
    notes: event.notes ?? "",
    sourceAccountId: sourceEntry?.accountId ?? paymentEntry?.accountId ?? "",
    type: event.type,
    accountId: primaryEntry?.accountId ?? "",
  };
}

const eventTypeOptions = [
  {
    value: "income",
    label: "Income",
    description: "Record money coming into one bank or wallet account.",
    icon: TrendingUp,
  },
  {
    value: "expense",
    label: "Expense",
    description: "Record spending from a bank, wallet, or credit account.",
    icon: TrendingDown,
  },
  {
    value: "transfer",
    label: "Transfer",
    description: "Move money between two liquid accounts.",
    icon: ArrowRightLeft,
  },
  {
    value: "credit_payment",
    label: "Credit payment",
    description: "Pay down a credit account from a bank or wallet account.",
    icon: CreditCard,
  },
] as const satisfies Array<{
  value: TransactionEventType;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}>;

const initialDraft: EventDraft = {
  amount: "",
  creditAccountId: "",
  date: new Date().toISOString().slice(0, 10),
  description: "",
  destinationAccountId: "",
  budgetId: "none",
  categoryId: "none",
  feeAmount: "",
  loanAccountId: "",
  notes: "",
  sourceAccountId: "",
  type: "expense",
  accountId: "",
};

const composerFieldClassName =
  "h-9.5 w-full rounded-[0.8rem] border-border/80 bg-white px-3 text-[0.84rem] shadow-none dark:bg-[#162022] md:px-3 md:text-[0.8rem]";

const composerAmountFieldClassName =
  "h-9.5 rounded-[0.8rem] border-border/80 bg-white px-3 text-[0.86rem] font-semibold tracking-tight shadow-none dark:bg-[#162022] md:px-3 md:text-[0.82rem]";

const composerDateFieldClassName =
  "h-9.5 w-full rounded-[0.8rem] px-3 text-[0.84rem] md:px-3 md:text-[0.8rem]";

function getEventTypeLabel(type: TransactionEventType) {
  if (type === "loan_disbursement") return "Loan disbursement";
  return eventTypeOptions.find((option) => option.value === type)?.label ?? type;
}

function getDefaultDescriptionForType(type: TransactionEventType) {
  switch (type) {
    case "income":
      return "Income";
    case "expense":
      return "Expense";
    case "transfer":
      return "Transfer";
    case "credit_payment":
      return "Credit card payment";
    case "loan_disbursement":
      return "Loan disbursement";
    default:
      return "";
  }
}

function withIndefiniteArticle(label: string) {
  const normalized = label.trim().toLowerCase();
  if (!normalized) return "";
  const article = /^[aeiou]/.test(normalized[0] ?? "") ? "an" : "a";
  return `${article} ${normalized}`;
}

function getEventTypeTone(type: TransactionEventType) {
  switch (type) {
    case "income":
      return "text-emerald-700 bg-emerald-50 border-emerald-200";
    case "expense":
      return "text-rose-700 bg-rose-50 border-rose-200";
    case "transfer":
      return "text-sky-700 bg-sky-50 border-sky-200";
    case "credit_payment":
      return "text-amber-700 bg-amber-50 border-amber-200";
    case "loan_disbursement":
      return "text-violet-700 bg-violet-50 border-violet-200";
    default:
      return "text-foreground bg-muted border-border";
  }
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

function getPrimaryAmount(event: TransactionEventItem) {
  switch (event.type) {
    case "income":
      return event.entries.find((entry) => entry.role === "primary")?.amountDelta ?? 0;
    case "expense":
      return Math.abs(event.entries.find((entry) => entry.role === "primary")?.amountDelta ?? 0);
    case "transfer":
      return Math.abs(event.entries.find((entry) => entry.role === "source")?.amountDelta ?? 0);
    case "credit_payment":
      return Math.abs(
        event.entries.find((entry) => entry.role === "payment_account")?.amountDelta ?? 0,
      );
    case "loan_disbursement":
      return Math.abs(
        event.entries.find((entry) => entry.role === "disbursement_account")?.amountDelta ?? 0,
      );
    default:
      return 0;
  }
}

function getEventAccountsSummary(event: TransactionEventItem) {
  switch (event.type) {
    case "income":
    case "expense": {
      const account = event.entries[0]?.account;
      return account ? `${account.name} · ${getAccountTypeLabel(account.type)}` : "Account missing";
    }
    case "transfer": {
      const source = event.entries.find((entry) => entry.role === "source")?.account;
      const destination = event.entries.find((entry) => entry.role === "destination")?.account;
      if (!source && !destination) {
        return "Transfer accounts missing";
      }
      if (source && !destination) {
        return event.description.toLowerCase().includes("goal contribution")
          ? `Set aside from ${source.name}`
          : `Transfer from ${source.name}`;
      }
      if (!source && destination) {
        return `Transfer to ${destination.name}`;
      }
      const sourceName = source!.name;
      const destinationName = destination!.name;

      return event.feeAmount > 0
        ? `${sourceName} → ${destinationName} · Fee ${formatCurrencyMiliunits(
            event.feeAmount,
            event.currency,
          )}`
        : `${sourceName} → ${destinationName}`;
    }
    case "credit_payment": {
      const source = event.entries.find((entry) => entry.role === "payment_account")?.account;
      const credit = event.entries.find((entry) => entry.role === "liability_account")?.account;
      if (!source || !credit) {
        return "Payment accounts missing";
      }

      return event.feeAmount > 0
        ? `${source.name} → ${credit.name} · Fee ${formatCurrencyMiliunits(
            event.feeAmount,
            event.currency,
          )}`
        : `${source.name} → ${credit.name}`;
    }
    case "loan_disbursement": {
      const loan = event.entries.find((entry) => entry.role === "loan_account")?.account;
      const destination = event.entries.find(
        (entry) => entry.role === "disbursement_account",
      )?.account;
      return loan && destination
        ? `${loan.name} → ${destination.name}`
        : "Disbursement accounts missing";
    }
    default:
      return "";
  }
}

function EventTypeButton({
  isActive,
  label,
  onClick,
  icon: Icon,
}: {
  isActive: boolean;
  label: string;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-center gap-1.5 rounded-xl border px-2.5 py-1.25 text-[0.8rem] transition sm:gap-2 sm:px-3.25 sm:py-1.6 sm:text-[0.9rem] ${
        isActive
          ? "border-[#17393c]/35 bg-[#17393c]/12 text-[#17393c] dark:border-primary/35 dark:bg-primary/12 dark:text-primary"
          : "border-border/70 bg-white/90 text-foreground/85 hover:bg-muted/50 dark:bg-[#162022]/90 dark:text-foreground/90"
      }`}
    >
      <Icon className="size-3.5" />
      <span>{label}</span>
    </button>
  );
}

type TransactionsWorkspaceProps = {
  initialQuery?: string;
};

export function TransactionsWorkspace({ initialQuery = "" }: TransactionsWorkspaceProps) {
  const utils = trpc.useUtils();
  const accountsQuery = trpc.accounts.list.useQuery();
  const budgetsQuery = trpc.budgets.list.useQuery();
  const categoriesQuery = trpc.categories.list.useQuery();
  const summaryQuery = trpc.transactions.summary.useQuery();
  const dataQualityQuery = trpc.dataQuality.transactions.useQuery(undefined, {
    staleTime: 45_000,
  });
  const habitInsightQuery = trpc.ai.latestHabitInsight.useQuery();
  const generateHabitInsight = trpc.ai.generateHabitInsight.useMutation({
    onSuccess: async () => {
      setInsightErrorMessage(null);
      await utils.ai.latestHabitInsight.invalidate();
      toast.success("Insight generated", {
        description: "Habit coaching was updated from your latest spending history.",
      });
    },
    onError: (error) => {
      setInsightErrorMessage(error.message);
      toast.error("Could not generate insight", {
        description: error.message,
      });
    },
  });
  const isGeneratingInsight = generateHabitInsight.isPending;
  const [cooldownNowMs, setCooldownNowMs] = useState(() => Date.now());
  const settingsQuery = trpc.settings.get.useQuery();

  const [open, setOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isDataQualityHelpOpen, setIsDataQualityHelpOpen] = useState(false);
  const [search, setSearch] = useState(initialQuery);
  const [typeFilter, setTypeFilter] = useState<"all" | TransactionEventType>("all");
  const [page, setPage] = useState(1);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 767px)").matches : false,
  );
  const [draft, setDraft] = useState<EventDraft>(initialDraft);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [insightErrorMessage, setInsightErrorMessage] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(search);
  const pageSize = isMobile ? 10 : 20;
  const eventsQuery = trpc.transactions.list.useQuery({
    page,
    pageSize,
    search: deferredSearch,
    type: typeFilter,
  });
  const habitGeneratedAtMs = habitInsightQuery.data
    ? new Date(habitInsightQuery.data.generatedAt).getTime()
    : null;
  const cooldownEndsAtMs = habitGeneratedAtMs ? habitGeneratedAtMs + 25 * 60 * 1000 : null;
  const cooldownRemainingMs = cooldownEndsAtMs ? Math.max(0, cooldownEndsAtMs - cooldownNowMs) : 0;
  const isInsightCooldownActive = cooldownRemainingMs > 0;
  const canGenerateInsight = !isGeneratingInsight && !isInsightCooldownActive;

  const handleGenerateInsight = () => {
    if (!canGenerateInsight) return;
    setInsightErrorMessage(null);
    generateHabitInsight.mutate();
  };

  useEffect(() => {
    if (!isInsightCooldownActive) return;
    const timer = window.setInterval(() => {
      setCooldownNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isInsightCooldownActive]);

  const cooldownMinutes = Math.floor(cooldownRemainingMs / 60_000);
  const cooldownSeconds = Math.floor((cooldownRemainingMs % 60_000) / 1000);
  const cooldownLabel = `${cooldownMinutes}:${String(cooldownSeconds).padStart(2, "0")}`;
  const dataQualityTotals = dataQualityQuery.data?.totals;
  const isDataQualityClean =
    !dataQualityQuery.isLoading &&
    (dataQualityTotals?.uncategorizedCount ?? 0) === 0 &&
    (dataQualityTotals?.duplicateCount ?? 0) === 0 &&
    (dataQualityTotals?.oddCount ?? 0) === 0;
  const qualityUncategorized = dataQualityTotals?.uncategorizedCount ?? 0;
  const qualityDuplicates = dataQualityTotals?.duplicateCount ?? 0;
  const qualityOdd = dataQualityTotals?.oddCount ?? 0;
  const totalQualityIssues = qualityUncategorized + qualityDuplicates + qualityOdd;
  const qualityScore = Math.max(0, 100 - qualityUncategorized * 8 - qualityDuplicates * 10 - qualityOdd * 6);
  const qualityGrade = qualityScore >= 90 ? "Excellent" : qualityScore >= 75 ? "Good" : qualityScore >= 55 ? "Watch" : "Needs cleanup";

  const refreshTransactions = async () => {
    await Promise.all([
      utils.transactions.list.invalidate(),
      utils.transactions.summary.invalidate(),
      utils.accounts.list.invalidate(),
      utils.accounts.summary.invalidate(),
      utils.budgets.list.invalidate(),
      utils.budgets.summary.invalidate(),
      utils.ai.dashboardInsight.invalidate(),
      utils.ai.accountsInsight.invalidate(),
      utils.ai.transactionsInsight.invalidate(),
      utils.ai.budgetsInsight.invalidate(),
    ]);
  };

  const createEvent = trpc.transactions.create.useMutation({
    onSuccess: async () => {
      await refreshTransactions();
      setDraft(initialDraft);
      setOpen(false);
      toast.success("Event recorded", {
        description: "Your transaction event is now reflected in the workspace.",
      });
    },
    onError: (error) => {
      toast.error("Could not record event", {
        description: error.message,
      });
    },
  });

  const updateEvent = trpc.transactions.update.useMutation({
    onSuccess: async () => {
      await refreshTransactions();
      setDraft(initialDraft);
      setEditingEventId(null);
      setOpen(false);
      toast.success("Event updated", {
        description: "The ledger and affected account balances were updated.",
      });
    },
    onError: (error) => {
      toast.error("Could not update event", {
        description: error.message,
      });
    },
  });

  const deleteEvent = trpc.transactions.remove.useMutation({
    onSuccess: async () => {
      const name = deleteTarget?.description;
      await refreshTransactions();
      setDeleteTarget(null);
      toast.success("Event deleted", {
        description: name ? `"${name}" was removed from your ledger.` : "The event was removed.",
      });
    },
    onError: (error) => {
      toast.error("Could not delete event", {
        description: error.message,
      });
    },
  });

  const applyCategoryFix = trpc.dataQuality.applyCategoryFix.useMutation({
    onSuccess: async () => {
      await Promise.all([refreshTransactions(), utils.dataQuality.transactions.invalidate()]);
      toast.success("Category applied");
    },
    onError: (error) => {
      toast.error("Could not apply category", {
        description: error.message,
      });
    },
  });

  const removeDuplicateFix = trpc.dataQuality.removeDuplicateFix.useMutation({
    onSuccess: async () => {
      await Promise.all([refreshTransactions(), utils.dataQuality.transactions.invalidate()]);
      toast.success("Duplicate removed");
    },
    onError: (error) => {
      toast.error("Could not remove duplicate", {
        description: error.message,
      });
    },
  });

  const markOddReviewed = trpc.dataQuality.markOddReviewed.useMutation({
    onSuccess: async () => {
      await Promise.all([refreshTransactions(), utils.dataQuality.transactions.invalidate()]);
      toast.success("Marked as reviewed");
    },
    onError: (error) => {
      toast.error("Could not mark transaction", {
        description: error.message,
      });
    },
  });

  const liquidAccounts = useMemo(
    () =>
      (accountsQuery.data ?? []).filter(
        (account) => account.type === "cash" || account.type === "wallet",
      ),
    [accountsQuery.data],
  );

  const creditAccounts = useMemo(
    () => (accountsQuery.data ?? []).filter((account) => account.type === "credit"),
    [accountsQuery.data],
  );

  const spendableAccounts = useMemo(
    () =>
      (accountsQuery.data ?? []).filter(
        (account) =>
          account.type === "cash" || account.type === "wallet" || account.type === "credit",
      ),
    [accountsQuery.data],
  );

  const loanAccounts = useMemo(
    () => (accountsQuery.data ?? []).filter((account) => account.type === "loan"),
    [accountsQuery.data],
  );

  const activeBudgetOptions = useMemo(
    () =>
      (budgetsQuery.data ?? [])
        .filter((budget) => budget.isActive)
        .sort((a: BudgetItem, b: BudgetItem) => a.name.localeCompare(b.name)),
    [budgetsQuery.data],
  );

  const categoryOptions = useMemo(
    () =>
      (categoriesQuery.data ?? [])
        .filter((category) => category.kind === draft.type)
        .sort((a: CategoryItem, b: CategoryItem) => a.name.localeCompare(b.name)),
    [categoriesQuery.data, draft.type],
  );

  const visibleEvents = useMemo(() => eventsQuery.data?.items ?? [], [eventsQuery.data]);
  const datePreferences = resolveDatePreferences(settingsQuery.data);
  const formatEventDate = (value: Date | string) =>
    formatDateWithPreferences(value, datePreferences, "date");

  const currentTypeMeta = eventTypeOptions.find((option) => option.value === draft.type) ?? {
    value: "loan_disbursement" as const,
    label: "Loan disbursement (disabled)",
    description: "Loan disbursement capture is temporarily disabled while Loans v2 is in rebuild.",
    icon: HandCoins,
  };
  const heroTransferAndPaymentCount =
    (summaryQuery.data?.transferEvents ?? 0) + (summaryQuery.data?.creditPaymentEvents ?? 0);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const syncViewport = () => {
      setIsMobile((current) => {
        if (current !== mediaQuery.matches) {
          setPage(1);
        }

        return mediaQuery.matches;
      });
    };

    mediaQuery.addEventListener("change", syncViewport);

    return () => {
      mediaQuery.removeEventListener("change", syncViewport);
    };
  }, []);

  const submitEvent = () => {
    const amount = Math.round(Number(draft.amount) * 1000);
    const feeAmount = Math.round(Number(draft.feeAmount) * 1000);
    if (Number.isNaN(amount) || amount <= 0) return;
    const normalizedDescription =
      draft.description.trim() ||
      (draft.type === "income"
        ? "Income"
        : draft.type === "expense"
          ? "Expense"
          : draft.type === "transfer"
            ? "Transfer"
            : draft.type === "credit_payment"
              ? "Credit card payment"
              : "Loan disbursement");
    const isEditing = editingEventId !== null;

    if (draft.type === "income" || draft.type === "expense") {
      if (!draft.accountId) return;

      const payload: CreateTransactionEventInput = {
        type: draft.type,
        accountId: draft.accountId,
        amount,
        categoryId: draft.categoryId !== "none" ? draft.categoryId : undefined,
        date: draft.date,
        description: normalizedDescription,
        budgetId:
          draft.type === "expense" && draft.budgetId !== "none" ? draft.budgetId : undefined,
        notes: draft.notes,
      };

      if (isEditing) {
        const updatePayload: UpdateTransactionEventInput = {
          id: editingEventId!,
          ...payload,
        };
        updateEvent.mutate(updatePayload);
      } else {
        createEvent.mutate(payload);
      }
      return;
    }

    if (draft.type === "transfer") {
      if (!draft.sourceAccountId || !draft.destinationAccountId) return;

      const payload: CreateTransactionEventInput = {
        type: "transfer",
        sourceAccountId: draft.sourceAccountId,
        destinationAccountId: draft.destinationAccountId,
        amount,
        feeAmount: Number.isNaN(feeAmount) || feeAmount < 0 ? 0 : feeAmount,
        date: draft.date,
        description: normalizedDescription,
        notes: draft.notes,
      };

      if (isEditing) {
        const updatePayload: UpdateTransactionEventInput = {
          id: editingEventId!,
          ...payload,
        };
        updateEvent.mutate(updatePayload);
      } else {
        createEvent.mutate(payload);
      }
      return;
    }

    if (draft.type === "credit_payment") {
      if (!draft.sourceAccountId || !draft.creditAccountId) return;

      const payload: CreateTransactionEventInput = {
        type: "credit_payment",
        sourceAccountId: draft.sourceAccountId,
        creditAccountId: draft.creditAccountId,
        amount,
        feeAmount: Number.isNaN(feeAmount) || feeAmount < 0 ? 0 : feeAmount,
        date: draft.date,
        description: normalizedDescription,
        notes: draft.notes,
      };

      if (isEditing) {
        const updatePayload: UpdateTransactionEventInput = {
          id: editingEventId!,
          ...payload,
        };
        updateEvent.mutate(updatePayload);
      } else {
        createEvent.mutate(payload);
      }
      return;
    }

    toast.error("Loan disbursement is temporarily disabled while Loans v2 is in rebuild.");
  };

  const openComposer = (type: TransactionEventType) => {
    if (type === "loan_disbursement") {
      toast.error("Loan disbursement is temporarily disabled while Loans v2 is in rebuild.");
      return;
    }
    setEditingEventId(null);
    setDraft({
      ...initialDraft,
      type,
      description: getDefaultDescriptionForType(type),
    });
    setOpen(true);
  };

  const openEditComposer = (event: TransactionEventItem) => {
    if (event.type === "loan_disbursement") {
      toast.error("Legacy loan disbursement events are read-only while Loans v2 is in rebuild.");
      return;
    }
    setEditingEventId(event.id);
    setDraft(buildDraftFromEvent(event));
    setOpen(true);
  };

  return (
    <div className="space-y-6 lg:space-y-7">
      <section>
        <Card className="rounded-[1.5rem] border-white/10 bg-[linear-gradient(145deg,rgba(16,41,43,0.98),rgba(29,78,77,0.94))] text-white shadow-[0_26px_80px_-52px_rgba(10,31,34,0.62)]">
          <CardContent className="space-y-4 p-4 sm:p-5 md:space-y-4 md:p-6 lg:p-7.5">
            <div className="flex items-start justify-between gap-4">
              <p className="text-[0.84rem] font-medium tracking-[0.01em] text-white/72 md:text-[0.88rem]">
                Today · {formatDateWithPreferences(new Date(), datePreferences, "date")}
              </p>
            </div>

            <div className="grid gap-4 border-border/70 md:min-h-[7.7rem] md:grid-cols-[minmax(0,1.5fr)_minmax(0,1.02fr)_minmax(0,0.92fr)] md:gap-0">
              <div className="space-y-2.5 md:space-y-3 md:pr-7">
                <h2 className="text-[0.98rem] font-semibold tracking-tight text-white/95 md:text-[1.08rem] lg:text-[1.16rem]">
                  Ledger posture
                </h2>
                <div className="flex items-center gap-2 text-[1.06rem] font-semibold leading-none tracking-tight text-white md:text-[1.34rem] lg:text-[1.48rem]">
                  <span className="size-2.5 rounded-full bg-emerald-400 md:size-3" />
                  Transaction flow visible
                </div>
                <p className="max-w-[30ch] text-[0.9rem] leading-6 text-white/74 md:max-w-[34ch] md:text-[0.93rem] md:leading-7">
                  Track income, spending, transfers, and credit payments in one cleaner ledger view.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-0 border-t border-white/15 pt-3.5 md:border-0 md:border-l md:border-white/15 md:pl-7 md:pt-0">
                <div className="space-y-2.5 pr-4 md:pr-5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[0.82rem] text-white/70 md:text-[0.88rem]">Events logged</p>
                    <span className="flex size-8.5 items-center justify-center rounded-full bg-emerald-100/95 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200 md:size-9">
                      <Landmark className="size-3.5 md:size-[0.95rem]" />
                    </span>
                  </div>
                  <p className="text-[0.96rem] font-semibold tracking-tight text-white md:text-[1.18rem] lg:text-[1.28rem]">
                    {summaryQuery.data?.totalEvents ?? 0}
                  </p>
                  <p className="text-[0.78rem] leading-5.5 text-white/64 md:text-[0.82rem] md:leading-6">
                    {summaryQuery.data?.incomeEvents ?? 0} income ·{" "}
                    {summaryQuery.data?.expenseEvents ?? 0} expense
                  </p>
                </div>

                <div className="space-y-2.5 border-l border-white/15 pl-4 pr-4 md:pr-5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[0.82rem] text-white/70 md:text-[0.88rem]">
                      Transfers & payments
                    </p>
                    <span className="flex size-8.5 items-center justify-center rounded-full bg-sky-100/95 text-sky-700 dark:bg-sky-500/20 dark:text-sky-200 md:size-9">
                      <ArrowRightLeft className="size-3.5 md:size-[0.95rem]" />
                    </span>
                  </div>
                  <p className="text-[0.96rem] font-semibold tracking-tight text-white md:text-[1.18rem] lg:text-[1.28rem]">
                    {heroTransferAndPaymentCount}
                  </p>
                  <p className="text-[0.78rem] leading-5.5 text-white/64 md:text-[0.82rem] md:leading-6">
                    {summaryQuery.data?.transferEvents ?? 0} transfers ·{" "}
                    {summaryQuery.data?.creditPaymentEvents ?? 0} payments
                  </p>
                </div>
              </div>

              <div className="hidden space-y-2 border-t border-white/15 pt-4 md:block md:border-0 md:border-l md:border-white/15 md:pl-7 md:pt-0">
                <div className="flex items-center gap-2 text-[0.82rem] text-white/70">
                  <Clock3 className="size-4" />
                  Latest activity
                </div>
                <p className="line-clamp-2 text-[0.95rem] font-semibold tracking-tight text-white lg:text-[0.99rem]">
                  {visibleEvents[0]?.description ?? "No activity yet"}
                </p>
                <p className="text-[0.82rem] leading-6 text-white/70">
                  {visibleEvents[0]
                    ? `${formatEventDate(visibleEvents[0].occurredAt)} · ${getEventTypeLabel(visibleEvents[0].type)}`
                    : "Record your first event in transactions"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section>
        <Card className="border-white/75 bg-white/84 shadow-[0_24px_70px_-55px_rgba(10,31,34,0.28)] dark:border-white/8 dark:bg-[#182123] dark:shadow-[0_28px_80px_-55px_rgba(0,0,0,0.62)]">
          <CardContent className="space-y-4 px-5 py-5 sm:px-6 sm:py-6">
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 items-center justify-center rounded-full bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-200">
                <Sparkles className="size-4" />
              </div>
              <div>
                <p className="text-[0.72rem] uppercase tracking-[0.11em] text-muted-foreground">
                  Veyra insight
                </p>
                <h3 className="text-[1.02rem] font-semibold tracking-tight text-[#10292B] dark:text-foreground">
                  Veyra financial advisor
                </h3>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-fit rounded-full"
                onClick={handleGenerateInsight}
                disabled={!canGenerateInsight}
              >
                {isGeneratingInsight ? (
                  <>
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  habitInsightQuery.data ? "Refresh analysis" : "Generate insights"
                )}
              </Button>
              {isInsightCooldownActive ? (
                <p className="text-[0.8rem] text-muted-foreground">Cooldown: {cooldownLabel}</p>
              ) : (
                <p className="text-[0.82rem] text-muted-foreground">
                  Ready to generate a fresh monthly coaching insight.
                </p>
              )}
            </div>

            {insightErrorMessage ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-[0.84rem] text-rose-700 dark:border-rose-500/35 dark:bg-rose-500/10 dark:text-rose-200">
                {insightErrorMessage}
              </div>
            ) : null}

            {habitInsightQuery.isLoading ? (
              <div className="rounded-xl border border-dashed border-border/80 bg-background px-3.5 py-4 text-center dark:bg-[#141d1f]">
                <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
                <p className="mt-2 text-[0.84rem] text-muted-foreground">
                  Loading your latest analysis...
                </p>
              </div>
            ) : null}

            {!habitInsightQuery.isLoading && habitInsightQuery.data ? (
              <div
                className={`rounded-xl border border-border/70 bg-background px-3.5 py-3 transition dark:bg-[#141d1f] ${
                  isGeneratingInsight ? "relative overflow-hidden" : ""
                }`}
              >
                {isGeneratingInsight ? (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/82 backdrop-blur-[1.5px] dark:bg-[#141d1f]/82">
                    <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-white px-3 py-1.5 text-[0.8rem] font-medium text-foreground shadow-sm dark:bg-[#1b2628]">
                      <Loader2 className="size-3.5 animate-spin text-[#14656B] dark:text-primary" />
                      Refreshing monthly insight...
                    </div>
                  </div>
                ) : null}
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[0.7rem] uppercase tracking-[0.1em] text-muted-foreground">
                    Analysis
                  </p>
                  <p className="text-[0.72rem] text-muted-foreground">
                    {new Date(habitInsightQuery.data.generatedAt).toLocaleString()}
                  </p>
                </div>

                <p className="mt-2 text-[0.95rem] font-semibold text-foreground">
                  {habitInsightQuery.data.summary}
                </p>
                <p className="mt-1 text-[0.82rem] text-muted-foreground">
                  {habitInsightQuery.data.periodLabel}
                </p>

                <div className="mt-3 grid gap-2 md:grid-cols-3">
                  <div className="rounded-lg border border-[#89bcc3]/30 bg-[#eff6f7] px-3 py-2 dark:border-[#2b4a4f] dark:bg-[#192628]">
                    <p className="text-[0.68rem] uppercase tracking-[0.1em] text-muted-foreground">
                      Top spend this month
                    </p>
                    <p className="mt-1 text-[0.88rem] font-semibold text-foreground">
                      {habitInsightQuery.data.topSpendCategory.name} ·{" "}
                      {habitInsightQuery.data.topSpendCategory.amountLabel}
                    </p>
                    <p className="text-[0.78rem] text-muted-foreground">
                      {habitInsightQuery.data.topSpendCategory.sharePct}% share
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-white px-3 py-2 dark:bg-[#192325]">
                    <p className="text-[0.68rem] uppercase tracking-[0.1em] text-muted-foreground">
                      Biggest shift
                    </p>
                    <p className="mt-1 text-[0.88rem] font-semibold text-foreground">
                      {habitInsightQuery.data.monthOverMonthShift.category}
                    </p>
                    <p
                      className={`text-[0.78rem] ${
                        habitInsightQuery.data.monthOverMonthShift.direction === "up"
                          ? "text-amber-700 dark:text-amber-300"
                          : habitInsightQuery.data.monthOverMonthShift.direction === "down"
                            ? "text-emerald-700 dark:text-emerald-300"
                            : "text-muted-foreground"
                      }`}
                    >
                      {habitInsightQuery.data.monthOverMonthShift.deltaLabel}
                    </p>
                  </div>
                  <div className="rounded-lg border border-[#b9d8bf]/45 bg-[#edf8ee] px-3 py-2 dark:border-[#2f5a35] dark:bg-[#1b2a20]">
                    <p className="text-[0.68rem] uppercase tracking-[0.1em] text-muted-foreground">
                      Budget posture
                    </p>
                    <p className="mt-1 text-[0.88rem] font-semibold text-[#11424a] dark:text-emerald-100">
                      {habitInsightQuery.data.budgetPosture?.atRiskBudgets ?? 0} at risk ·{" "}
                      {habitInsightQuery.data.budgetPosture?.onTrackBudgets ?? 0} on track
                    </p>
                    <p className="text-[0.78rem] text-muted-foreground">
                      Remaining{" "}
                      {habitInsightQuery.data.budgetPosture?.totalRemainingLabel ??
                        formatCurrencyMiliunits(0, "PHP")}
                    </p>
                  </div>
                </div>

                <div className="mt-4 rounded-lg border border-border/70 bg-white/65 px-4 py-3 dark:bg-[#1a2527]/80">
                  <p className="text-[0.68rem] uppercase tracking-[0.1em] text-muted-foreground">
                    Spending patterns
                  </p>
                  <ul className="mt-3 space-y-2.5 pl-1 text-[0.86rem] text-foreground">
                    {habitInsightQuery.data.keyFindings.map((item: string) => (
                      <li key={item} className="flex items-start gap-3 pl-1">
                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#14656B] dark:bg-primary" />
                        <span className="leading-6">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-3 rounded-lg border border-border/70 bg-white/65 px-4 py-3 dark:bg-[#1a2527]/80">
                  <p className="text-[0.68rem] uppercase tracking-[0.1em] text-muted-foreground">
                    Category focus
                  </p>
                  <ul className="mt-3 space-y-2.5 pl-1 text-[0.86rem] text-foreground">
                    {((habitInsightQuery.data.categoryHighlights ?? []).length > 0
                      ? (habitInsightQuery.data.categoryHighlights ?? [])
                      : [
                          {
                            name: "No category data yet",
                            amountLabel: "—",
                            sharePct: 0,
                            note: "Categorize expenses to unlock category-level coaching.",
                          },
                        ]
                    ).map((item) => (
                      <li key={item.name} className="flex items-start gap-3 pl-1">
                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-sky-500 dark:bg-sky-300" />
                        <span className="leading-6">
                          <span className="font-medium">
                            {item.name} {item.amountLabel !== "—" ? `(${item.sharePct}% · ${item.amountLabel})` : ""}
                          </span>{" "}
                          {item.note}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-3 rounded-lg border border-border/70 bg-white/65 px-4 py-3 dark:bg-[#1a2527]/80">
                  <p className="text-[0.68rem] uppercase tracking-[0.1em] text-muted-foreground">
                    Recommendations
                  </p>
                  <ul className="mt-3 space-y-2.5 pl-1 text-[0.86rem] text-foreground">
                    {habitInsightQuery.data.advice.map((item: string) => (
                      <li key={item} className="flex items-start gap-3 pl-1">
                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-emerald-500 dark:bg-emerald-300" />
                        <span className="leading-6">{item}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[0.76rem] text-muted-foreground">
                    Based on {habitInsightQuery.data.dataWindow?.expensesAnalyzed ?? 0} expense events across{" "}
                    {habitInsightQuery.data.dataWindow?.budgetsAnalyzed ?? 0} active budgets.
                  </p>
                </div>
              </div>
            ) : null}

            {!habitInsightQuery.isLoading && !habitInsightQuery.data ? (
              <div className="rounded-xl border border-dashed border-border/80 bg-background px-3.5 py-3 dark:bg-[#141d1f]">
                <p className="text-[0.9rem] text-foreground">No generated insight yet.</p>
                <p className="mt-1 text-[0.82rem] text-muted-foreground">
                  Generate insights to analyze monthly spending habits and coaching actions.
                </p>
                <Button
                  type="button"
                  className="mt-3 h-8 rounded-full px-3 text-[0.78rem]"
                  onClick={handleGenerateInsight}
                  disabled={!canGenerateInsight}
                >
                  {isGeneratingInsight ? "Analyzing..." : "Generate insights"}
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </section>

      <section>
        <Card className="border-white/75 bg-white/84 shadow-[0_20px_55px_-48px_rgba(10,31,34,0.24)] dark:border-white/8 dark:bg-[#182123] dark:shadow-[0_24px_70px_-52px_rgba(0,0,0,0.58)]">
          <CardHeader className="gap-3 px-4 py-4 sm:px-5 sm:py-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200">
                  <ShieldAlert className="size-4.5" />
                </div>
                <div>
                  <p className="text-[0.66rem] uppercase tracking-[0.1em] text-muted-foreground">
                    Data quality assistant
                  </p>
                  <h3 className="text-[1.06rem] leading-tight font-semibold tracking-tight text-[#10292B] dark:text-foreground sm:text-[1.12rem]">
                    Fix uncategorized, duplicates, and odd spend
                  </h3>
                  <p className="mt-0.5 text-[0.82rem] text-muted-foreground">
                    Better transaction quality improves forecasts, budgets, and AI coaching.
                  </p>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-full border-violet-200 bg-violet-50 px-3 text-[0.78rem] text-violet-700 hover:bg-violet-100 hover:text-violet-800 dark:border-violet-500/35 dark:bg-violet-500/12 dark:text-violet-200 dark:hover:bg-violet-500/20"
                onClick={() => dataQualityQuery.refetch()}
                disabled={dataQualityQuery.isFetching}
              >
                {dataQualityQuery.isFetching ? (
                  <>
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                    Scanning...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-1.5 size-3.5" />
                    Run data scan
                  </>
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 px-4 pb-4 sm:px-5 sm:pb-5">
            {dataQualityQuery.isLoading ? (
              <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-background px-3 py-3 text-[0.86rem] text-muted-foreground dark:bg-[#141d1f]">
                <Loader2 className="size-4 animate-spin" />
                Scanning transaction quality...
              </div>
            ) : (
              <>
                <div className="grid gap-2.5 lg:grid-cols-3">
                  <div className="rounded-lg border-l-2 border-amber-400 border-r border-y border-border/70 bg-background px-3 py-2.5 dark:border-amber-400/70 dark:bg-[#141d1f]">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className="flex size-9 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200">
                          <FolderOpen className="size-4" />
                        </span>
                        <div>
                          <p className="text-[0.68rem] uppercase tracking-[0.1em] text-muted-foreground">Uncategorized</p>
                          <p className="text-[1.15rem] leading-none font-semibold tracking-tight text-foreground">{qualityUncategorized}</p>
                        </div>
                      </div>
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </div>
                    <p className="mt-1.5 text-[0.78rem] text-muted-foreground">Review and categorize</p>
                  </div>

                  <div className="rounded-lg border-l-2 border-violet-400 border-r border-y border-border/70 bg-background px-3 py-2.5 dark:border-violet-400/70 dark:bg-[#141d1f]">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className="flex size-9 items-center justify-center rounded-lg bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-200">
                          <Copy className="size-4" />
                        </span>
                        <div>
                          <p className="text-[0.68rem] uppercase tracking-[0.1em] text-muted-foreground">Duplicates</p>
                          <p className="text-[1.15rem] leading-none font-semibold tracking-tight text-foreground">{qualityDuplicates}</p>
                        </div>
                      </div>
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </div>
                    <p className="mt-1.5 text-[0.78rem] text-muted-foreground">Find and merge</p>
                  </div>

                  <div className="rounded-lg border-l-2 border-emerald-400 border-r border-y border-border/70 bg-background px-3 py-2.5 dark:border-emerald-400/70 dark:bg-[#141d1f]">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className="flex size-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200">
                          <Activity className="size-4" />
                        </span>
                        <div>
                          <p className="text-[0.68rem] uppercase tracking-[0.1em] text-muted-foreground">Odd transactions</p>
                          <p className="text-[1.15rem] leading-none font-semibold tracking-tight text-foreground">{qualityOdd}</p>
                        </div>
                      </div>
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </div>
                    <p className="mt-1.5 text-[0.78rem] text-muted-foreground">Review unusual activity</p>
                  </div>
                </div>

                <div className="rounded-lg border border-border/70 bg-white/60 p-2.5 dark:bg-[#141d1f]">
                  <p className="mb-1.5 text-[0.66rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    Quick actions
                  </p>
                  <div className="grid gap-2 lg:grid-cols-4">
                    <button
                      type="button"
                      className="rounded-lg border border-border/70 bg-background px-2.5 py-2 text-left transition hover:bg-muted/45 disabled:opacity-60 dark:bg-[#111a1c]"
                      onClick={() => {
                        const row = (dataQualityQuery.data?.uncategorized ?? []).find((item) => Boolean(item.suggestedCategoryId));
                        if (!row?.suggestedCategoryId) return;
                        applyCategoryFix.mutate({ eventId: row.id, categoryId: row.suggestedCategoryId });
                      }}
                      disabled={
                        applyCategoryFix.isPending ||
                        !(dataQualityQuery.data?.uncategorized ?? []).some((item) => Boolean(item.suggestedCategoryId))
                      }
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="flex size-7 items-center justify-center rounded-full bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-200">
                            <Wand2 className="size-3.5" />
                          </span>
                          <p className="text-[0.82rem] font-medium text-foreground">One-tap category fixes</p>
                        </div>
                        <ChevronRight className="size-3.5 text-muted-foreground" />
                      </div>
                      <p className="mt-1 text-[0.74rem] text-muted-foreground">Auto-fix low confidence categories</p>
                    </button>

                    <button
                      type="button"
                      className="rounded-lg border border-border/70 bg-background px-2.5 py-2 text-left transition hover:bg-muted/45 disabled:opacity-60 dark:bg-[#111a1c]"
                      onClick={() => {
                        const row = (dataQualityQuery.data?.duplicateCandidates ?? [])[0];
                        if (!row) return;
                        removeDuplicateFix.mutate({ eventId: row.removeEventId });
                      }}
                      disabled={removeDuplicateFix.isPending || (dataQualityQuery.data?.duplicateCandidates ?? []).length === 0}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="flex size-7 items-center justify-center rounded-full bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-200">
                            <Copy className="size-3.5" />
                          </span>
                          <p className="text-[0.82rem] font-medium text-foreground">Duplicate candidates</p>
                        </div>
                        <ChevronRight className="size-3.5 text-muted-foreground" />
                      </div>
                      <p className="mt-1 text-[0.74rem] text-muted-foreground">Review possible duplicate transactions</p>
                    </button>

                    <button
                      type="button"
                      className="rounded-lg border border-border/70 bg-background px-2.5 py-2 text-left transition hover:bg-muted/45 disabled:opacity-60 dark:bg-[#111a1c]"
                      onClick={() => {
                        const row = (dataQualityQuery.data?.oddTransactions ?? [])[0];
                        if (!row) return;
                        markOddReviewed.mutate({ eventId: row.id });
                      }}
                      disabled={markOddReviewed.isPending || (dataQualityQuery.data?.oddTransactions ?? []).length === 0}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="flex size-7 items-center justify-center rounded-full bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-200">
                            <Activity className="size-3.5" />
                          </span>
                          <p className="text-[0.82rem] font-medium text-foreground">Odd spend review</p>
                        </div>
                        <ChevronRight className="size-3.5 text-muted-foreground" />
                      </div>
                      <p className="mt-1 text-[0.74rem] text-muted-foreground">Check flagged unusual spending</p>
                    </button>

                    <div className="rounded-lg border border-border/70 bg-background px-2.5 py-2 dark:bg-[#111a1c]">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="flex size-7 items-center justify-center rounded-full bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-200">
                            <ShieldCheck className="size-3.5" />
                          </span>
                          <p className="text-[0.82rem] font-medium text-foreground">Data health summary</p>
                        </div>
                        <ChevronRight className="size-3.5 text-muted-foreground" />
                      </div>
                      <p className="mt-1 text-[0.74rem] text-muted-foreground">
                        Score {qualityScore}/100 · {qualityGrade}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-200/65 bg-emerald-50/65 px-3 py-2.5 dark:border-emerald-500/25 dark:bg-emerald-500/10">
                  <p className="text-[0.78rem] text-emerald-800 dark:text-emerald-200">
                    {isDataQualityClean
                      ? "Clean data leads to better forecasts, smarter budgets, and more accurate Veyra insights."
                      : `${totalQualityIssues} issue${totalQualityIssues === 1 ? "" : "s"} found. Use quick actions to improve accuracy.`}
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 shrink-0 rounded-full px-2.5 text-[0.76rem] text-emerald-700 hover:bg-emerald-100/60 hover:text-emerald-800 dark:text-emerald-200 dark:hover:bg-emerald-500/15"
                    onClick={() => setIsDataQualityHelpOpen(true)}
                  >
                    Learn more
                    <ChevronRight className="ml-1 size-3.5" />
                  </Button>
                </div>
              </>
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
                  Record a money event
                </CardTitle>
                <CardDescription className="max-w-2xl text-[0.9rem] leading-6 sm:text-[0.94rem] sm:leading-7">
                  Start with the user intent, then let Veyra apply the right account effects
                  underneath.
                </CardDescription>
              </div>

              <Button
                type="button"
                variant="outline"
                className="hidden rounded-full bg-white px-4 text-[0.88rem] dark:bg-[#162022] lg:inline-flex"
                onClick={() => setIsHelpOpen(true)}
              >
                Need help?
              </Button>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
              {eventTypeOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => openComposer(option.value)}
                  className="flex items-center justify-between rounded-[1rem] border border-border/70 bg-white px-4 py-3 text-left transition hover:bg-muted/50 dark:bg-[#162022]"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex size-8.5 items-center justify-center rounded-full bg-white text-[#17393c] dark:bg-[#203032] dark:text-primary">
                      <option.icon className="size-4" />
                    </div>
                    <div>
                      <p className="text-[0.92rem] font-semibold tracking-tight text-[#10292B] dark:text-foreground">
                        {option.label}
                      </p>
                      <p className="mt-0.5 text-[0.76rem] leading-5 text-muted-foreground">
                        {option.value === "income"
                          ? "Money coming in"
                          : option.value === "expense"
                            ? "Money going out"
                            : option.value === "transfer"
                              ? "Move between accounts"
                              : "Pay a credit account"}
                      </p>
                    </div>
                  </div>
                  <ArrowRightLeft className="size-4 shrink-0 text-muted-foreground opacity-0" />
                  <span className="text-muted-foreground">›</span>
                </button>
              ))}
            </div>
          </CardHeader>
        </Card>
      </section>

      <Dialog open={isHelpOpen} onOpenChange={setIsHelpOpen}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-[44rem] rounded-[1.35rem] border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,255,255,0.98))] px-0 py-0 dark:border-white/8 dark:bg-[linear-gradient(180deg,rgba(24,33,35,0.98),rgba(18,27,29,0.98))] [&>button[data-slot='dialog-close']]:right-3 [&>button[data-slot='dialog-close']]:top-3 sm:rounded-[1.6rem] sm:[&>button[data-slot='dialog-close']]:right-4 sm:[&>button[data-slot='dialog-close']]:top-4">
          <DialogHeader className="border-b border-border/70 px-5 pb-4 pt-[max(1rem,env(safe-area-inset-top))] pr-14 sm:px-7 sm:pb-5 sm:pt-7 sm:pr-16">
            <div className="inline-flex w-fit rounded-full border border-[#17393c]/10 bg-[#17393c]/5 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-[#17393c] dark:border-white/8 dark:bg-white/6 dark:text-primary">
              Event guide
            </div>
            <DialogTitle className="pt-2 text-[1.15rem] tracking-tight text-[#10292B] dark:text-foreground sm:pt-3 sm:text-[1.7rem]">
              Which event type should you record?
            </DialogTitle>
            <DialogDescription className="max-w-2xl text-[0.84rem] leading-6 text-muted-foreground sm:text-[0.95rem] sm:leading-7">
              Pick the event that matches what actually happened in real money movement. Veyra then
              applies the correct account effects underneath.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 px-5 py-4 sm:space-y-4 sm:px-7 sm:py-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[1rem] border border-border/70 bg-white/ p-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex size-9 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                    <TrendingUp className="size-4" />
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-[0.96rem] font-semibold tracking-tight text-[#10292B] dark:text-foreground">
                      Income
                    </p>
                    <p className="text-[0.82rem] leading-6 text-muted-foreground">
                      Use this when money comes into one bank or wallet account.
                    </p>
                    <p className="text-[0.76rem] leading-5 text-muted-foreground">
                      Examples: salary, allowance, refunds, reimbursements, incoming payments.
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-[1rem] border border-border/70 bg-white/50 p-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex size-9 items-center justify-center rounded-full bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
                    <TrendingDown className="size-4" />
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-[0.96rem] font-semibold tracking-tight text-[#10292B] dark:text-foreground">
                      Expense
                    </p>
                    <p className="text-[0.82rem] leading-6 text-muted-foreground">
                      Use this when money leaves a bank, wallet, or credit account for spending.
                    </p>
                    <p className="text-[0.76rem] leading-5 text-muted-foreground">
                      Examples: groceries, bills, dining, subscriptions, shopping, cash-out
                      spending.
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-[1rem] border border-border/70 bg-white/50 p-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex size-9 items-center justify-center rounded-full bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
                    <ArrowRightLeft className="size-4" />
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-[0.96rem] font-semibold tracking-tight text-[#10292B] dark:text-foreground">
                      Transfer
                    </p>
                    <p className="text-[0.82rem] leading-6 text-muted-foreground">
                      Use this when you move money between two of your own liquid accounts.
                    </p>
                    <p className="text-[0.76rem] leading-5 text-muted-foreground">
                      Examples: bank to wallet, wallet to bank, moving cash between institutions.
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-[1rem] border border-border/70 bg-white/50 p-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex size-9 items-center justify-center rounded-full bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                    <CreditCard className="size-4" />
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-[0.96rem] font-semibold tracking-tight text-[#10292B] dark:text-foreground">
                      Credit payment
                    </p>
                    <p className="text-[0.82rem] leading-6 text-muted-foreground">
                      Use this when you pay down a credit card from a bank or wallet account.
                    </p>
                    <p className="text-[0.76rem] leading-5 text-muted-foreground">
                      Examples: paying your credit card bill, partial card payment, settlement from
                      cash or bank.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[1rem] border border-dashed border-border/70 bg-white/35 px-4 py-3 text-[0.78rem] leading-6 text-muted-foreground">
              Rule of thumb: if money stays within your own liquid accounts, it is usually a
              transfer. If money is used to reduce credit owed, it is a credit payment.
            </div>
          </div>

          <DialogFooter className="border-t border-border/60 px-5 py-4 sm:px-7 sm:py-5">
            <Button type="button" className="rounded-full" onClick={() => setIsHelpOpen(false)}>
              Got it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDataQualityHelpOpen} onOpenChange={setIsDataQualityHelpOpen}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-[42rem] rounded-[1.35rem] border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,255,255,0.98))] px-0 py-0 dark:border-white/8 dark:bg-[linear-gradient(180deg,rgba(24,33,35,0.98),rgba(18,27,29,0.98))] [&>button[data-slot='dialog-close']]:right-3 [&>button[data-slot='dialog-close']]:top-3 sm:rounded-[1.6rem] sm:[&>button[data-slot='dialog-close']]:right-4 sm:[&>button[data-slot='dialog-close']]:top-4">
          <DialogHeader className="border-b border-border/70 px-5 pb-4 pt-[max(1rem,env(safe-area-inset-top))] pr-14 sm:px-7 sm:pb-5 sm:pt-7 sm:pr-16">
            <div className="inline-flex w-fit rounded-full border border-[#17393c]/10 bg-[#17393c]/5 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-[#17393c] dark:border-white/8 dark:bg-white/6 dark:text-primary">
              Data quality guide
            </div>
            <DialogTitle className="pt-2 text-[1.12rem] tracking-tight text-[#10292B] dark:text-foreground sm:pt-3 sm:text-[1.55rem]">
              How data quality checks work
            </DialogTitle>
            <DialogDescription className="max-w-2xl text-[0.84rem] leading-6 text-muted-foreground sm:text-[0.93rem] sm:leading-7">
              Clean transaction records make your forecasts, budgets, and AI coaching more reliable.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 px-5 py-4 sm:space-y-4 sm:px-7 sm:py-6">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-[1rem] border border-border/70 bg-white/60 p-3 dark:bg-[#1a2426]">
                <p className="text-[0.84rem] font-semibold tracking-tight text-[#10292B] dark:text-foreground">
                  Uncategorized
                </p>
                <p className="mt-1 text-[0.78rem] leading-5.5 text-muted-foreground">
                  Expense entries without a category. We suggest a category when merchant history is clear.
                </p>
              </div>
              <div className="rounded-[1rem] border border-border/70 bg-white/60 p-3 dark:bg-[#1a2426]">
                <p className="text-[0.84rem] font-semibold tracking-tight text-[#10292B] dark:text-foreground">
                  Duplicates
                </p>
                <p className="mt-1 text-[0.78rem] leading-5.5 text-muted-foreground">
                  Likely duplicate expenses with the same amount, date, and merchant signature.
                </p>
              </div>
              <div className="rounded-[1rem] border border-border/70 bg-white/60 p-3 dark:bg-[#1a2426]">
                <p className="text-[0.84rem] font-semibold tracking-tight text-[#10292B] dark:text-foreground">
                  Odd transactions
                </p>
                <p className="mt-1 text-[0.78rem] leading-5.5 text-muted-foreground">
                  Outlier expenses that are much higher than typical spend in the same category.
                </p>
              </div>
            </div>

            <div className="rounded-[1rem] border border-border/70 bg-white/60 p-3.5 dark:bg-[#1a2426]">
              <p className="text-[0.82rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Quick actions
              </p>
              <ul className="mt-2 space-y-2 text-[0.8rem] text-foreground">
                <li className="flex items-start gap-2">
                  <span className="mt-1 size-1.5 rounded-full bg-sky-500 dark:bg-sky-300" />
                  <span>
                    <span className="font-medium">One-tap category fixes:</span> applies a suggested category to one uncategorized expense.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 size-1.5 rounded-full bg-violet-500 dark:bg-violet-300" />
                  <span>
                    <span className="font-medium">Duplicate candidates:</span> removes one likely duplicate event and keeps the original.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 size-1.5 rounded-full bg-orange-500 dark:bg-orange-300" />
                  <span>
                    <span className="font-medium">Odd spend review:</span> tags an outlier as reviewed without deleting it.
                  </span>
                </li>
              </ul>
            </div>

            <div className="rounded-[1rem] border border-emerald-200/70 bg-emerald-50/65 px-3.5 py-3 text-[0.8rem] text-emerald-800 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-200">
              Tip: run this check weekly to keep your AI coaching and cashflow forecasts accurate.
            </div>
          </div>

          <DialogFooter className="border-t border-border/70 px-5 py-3 sm:px-7 sm:py-4">
            <Button type="button" variant="outline" className="rounded-full" onClick={() => dataQualityQuery.refetch()}>
              Run data scan
            </Button>
            <Button type="button" className="rounded-full" onClick={() => setIsDataQualityHelpOpen(false)}>
              Got it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <section>
        <Card className="border-white/75 bg-white/84 shadow-[0_24px_70px_-55px_rgba(10,31,34,0.28)] dark:border-white/8 dark:bg-[#182123] dark:shadow-[0_28px_80px_-55px_rgba(0,0,0,0.62)]">
          <CardHeader className="gap-4 px-5 py-5 sm:px-6 sm:py-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-1.5">
                <CardTitle className="text-[1.28rem] tracking-tight text-[#10292B] dark:text-foreground sm:text-[1.4rem]">
                  Ledger
                </CardTitle>
                <CardDescription className="max-w-3xl text-[0.9rem] leading-6 sm:text-[0.94rem] sm:leading-7">
                  Review the event stream before we layer in calendar, import, and bulk workflows.
                </CardDescription>
              </div>

              <div className="flex items-center gap-2">
                <Select
                  value={typeFilter}
                  onValueChange={(value) => {
                    setTypeFilter(value as "all" | TransactionEventType);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="h-10 rounded-full border-border/70 bg-white px-3.5 text-[0.88rem] shadow-none dark:bg-[#162022] sm:w-[158px]">
                    <SelectValue placeholder="Filter by type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All event types</SelectItem>
                    {eventTypeOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div className="relative min-w-0">
                <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                  placeholder="Search events, accounts, or notes"
                  className="h-11 rounded-full border-border/70 bg-white pl-10 pr-4 text-[0.9rem] shadow-none dark:bg-[#162022]"
                />
              </div>
            </div>
          </CardHeader>

          <CardContent className="px-5 pb-5 pt-0 sm:px-6 sm:pb-6">
            {eventsQuery.isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-24 animate-pulse rounded-[1.6rem] border border-border/70 bg-white dark:bg-[#162022]"
                  />
                ))}
              </div>
            ) : eventsQuery.error ? (
              <div className="rounded-[1.8rem] border border-destructive/20 bg-white px-6 py-10 text-center dark:bg-[#162022]">
                <p className="text-[1.2rem] font-semibold tracking-tight text-[#10292B] dark:text-foreground">
                  Couldn’t load the ledger
                </p>
                <p className="mx-auto mt-3 max-w-md text-[0.95rem] leading-7 text-muted-foreground">
                  {eventsQuery.error.message || "The transaction list is not available right now."}
                </p>
              </div>
            ) : visibleEvents.length === 0 ? (
              <div className="rounded-[1.8rem] border border-dashed border-border/80 bg-white px-6 py-12 text-center dark:bg-[#162022]">
                <p className="text-[1.35rem] font-semibold tracking-tight text-[#10292B] dark:text-foreground">
                  No events yet
                </p>
                <p className="mx-auto mt-3 max-w-md text-[0.98rem] leading-8 text-muted-foreground">
                  Start with one income, expense, transfer, or credit payment to bring the ledger to
                  life.
                </p>
              </div>
            ) : (
              <div className="mx-auto max-w-[78rem] overflow-hidden rounded-[1.55rem] border border-border/70 bg-white dark:bg-[#141d1f]">
                <div className="hidden md:grid md:grid-cols-[minmax(0,1.55fr)_120px_minmax(0,1.3fr)_112px_130px_84px] md:items-center md:gap-3 md:border-b md:border-border/70 md:px-5 md:py-3">
                  <p className="text-[0.64rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Event
                  </p>
                  <p className="text-[0.64rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Category
                  </p>
                  <p className="text-[0.64rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Account / details
                  </p>
                  <p className="text-[0.64rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Date
                  </p>
                  <p className="text-right text-[0.64rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Amount
                  </p>
                  <p className="text-right text-[0.64rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Actions
                  </p>
                </div>

                <div className="divide-y divide-border/70">
                  {visibleEvents.map((event) => (
                    <div
                      key={event.id}
                      className="px-4 py-4 sm:px-5 md:grid md:grid-cols-[minmax(0,1.55fr)_120px_minmax(0,1.3fr)_112px_130px_84px] md:items-center md:gap-3 md:px-5 md:py-3.5"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 md:block">
                          <p className="truncate text-[0.96rem] font-semibold tracking-tight text-[#10292B] dark:text-foreground md:text-[0.9rem]">
                            {event.description}
                          </p>
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-[0.72rem] font-medium md:hidden ${getEventTypeTone(event.type)}`}
                          >
                            {getEventTypeLabel(event.type)}
                          </span>
                        </div>
                        <p className="mt-1 text-[0.8rem] leading-5.5 text-muted-foreground md:hidden">
                          {getEventAccountsSummary(event)}
                        </p>
                        <p className="mt-1 text-[0.76rem] leading-5 text-muted-foreground md:hidden">
                          {formatEventDate(event.occurredAt)}
                          {event.category ? ` · ${event.category.name}` : ""}
                          {event.notes ? ` · ${event.notes}` : ""}
                        </p>
                        <div className="mt-3 flex items-end justify-between gap-4 md:hidden">
                          <div className="min-w-0">
                            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                              Amount
                            </p>
                            <p className="mt-1 text-[0.9rem] font-medium tracking-tight text-[#17393c] dark:text-foreground/90">
                              {formatCurrencyMiliunits(getPrimaryAmount(event), event.currency)}
                            </p>
                          </div>
                          <div className="flex justify-end">
                            <TransactionActionsMenu
                              event={event}
                              onDelete={setDeleteTarget}
                              onEdit={openEditComposer}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="hidden md:block md:min-w-0">
                        <span className="inline-flex rounded-full border border-border/70 bg-background px-2.5 py-1 text-[0.72rem] font-medium text-foreground">
                          {event.category?.name ?? "Uncategorized"}
                        </span>
                        <p className="mt-1 text-[0.68rem] text-muted-foreground">
                          {getEventTypeLabel(event.type)}
                        </p>
                      </div>

                      <div className="hidden md:block md:min-w-0">
                        <p className="truncate text-[0.76rem] leading-5 text-muted-foreground">
                          {getEventAccountsSummary(event)}
                        </p>
                        <p className="mt-1 truncate text-[0.7rem] leading-5 text-muted-foreground">
                          {event.notes || getEventTypeLabel(event.type)}
                        </p>
                      </div>

                      <div className="hidden md:block md:min-w-0">
                        <p className="text-[0.78rem] leading-5 text-[#10292B] dark:text-foreground">
                          {formatEventDate(event.occurredAt)}
                        </p>
                      </div>

                      <div className="hidden md:block md:text-right">
                        <p className="text-[0.84rem] font-medium tracking-tight text-[#17393c] dark:text-foreground/90">
                          {formatCurrencyMiliunits(getPrimaryAmount(event), event.currency)}
                        </p>
                      </div>

                      <div className="hidden md:flex md:justify-end">
                        <TransactionActionsMenu
                          event={event}
                          onDelete={setDeleteTarget}
                          onEdit={openEditComposer}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {eventsQuery.data && eventsQuery.data.totalPages > 1 ? (
              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[0.86rem] text-muted-foreground">
                  Page {eventsQuery.data.page} of {eventsQuery.data.totalPages} ·{" "}
                  {eventsQuery.data.totalCount} events
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full"
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    disabled={eventsQuery.data.page <= 1}
                  >
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full"
                    onClick={() =>
                      setPage((current) =>
                        Math.min(eventsQuery.data?.totalPages ?? current, current + 1),
                      )
                    }
                    disabled={eventsQuery.data.page >= eventsQuery.data.totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </section>

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen && !createEvent.isPending && !updateEvent.isPending) {
            setDraft(initialDraft);
            setEditingEventId(null);
          }
        }}
      >
        <DialogContent
          mobileBehavior="adaptive"
          className="h-[100dvh] overflow-hidden border border-border/70 bg-white px-0 py-0 dark:border-white/8 dark:bg-[linear-gradient(180deg,rgba(24,33,35,0.98),rgba(18,27,29,0.98))] [&>button[data-slot='dialog-close']]:right-3 [&>button[data-slot='dialog-close']]:top-3 sm:[&>button[data-slot='dialog-close']]:right-4 sm:[&>button[data-slot='dialog-close']]:top-4"
        >
          <DialogHeader className="sticky top-0 z-10 shrink-0 border-b border-border/70 bg-white px-5 pb-4 pt-[max(1rem,env(safe-area-inset-top))] pr-14 sm:px-6 sm:pb-5 sm:pt-6 sm:pr-16 dark:bg-[#1a2325]">
            <div className="inline-flex w-fit rounded-full border border-[#17393c]/10 bg-white px-3 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-[#17393c] dark:border-white/8 dark:bg-white/6 dark:text-primary">
              Event composer
            </div>
            <DialogTitle className="pt-2 text-[1.2rem] tracking-tight sm:pt-3 sm:text-[1.8rem]">
              {editingEventId
                ? `Edit ${currentTypeMeta.label.toLowerCase()}`
                : `Record ${withIndefiniteArticle(currentTypeMeta.label)}`}
            </DialogTitle>
            <DialogDescription className="max-w-xl text-[0.82rem] leading-5.5 sm:text-[0.92rem] sm:leading-6.5">
              {editingEventId
                ? "Update the event details and Veyra will reapply the account effects underneath."
                : currentTypeMeta.description}
            </DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
              <div className="grid grid-cols-2 gap-2.5">
              {eventTypeOptions.map((option) => (
                <EventTypeButton
                  key={option.value}
                  label={option.label}
                  icon={option.icon}
                  isActive={draft.type === option.value}
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      type: option.value,
                      budgetId: "none",
                      categoryId: "none",
                      description: getDefaultDescriptionForType(option.value),
                    }))
                  }
                />
              ))}
              </div>
              <div className="space-y-4 rounded-[1rem] border border-border/70 bg-white p-5">
              <p className="text-[0.62rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground sm:text-[0.68rem] sm:tracking-[0.22em]">
                Primary details
              </p>
              <div className="space-y-1.5">
                <label className="text-[0.88rem] font-semibold text-foreground sm:text-[0.95rem]">
                  Amount
                </label>
                <Input
                  type="number"
                  inputMode="decimal"
                  autoFocus
                  value={draft.amount}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, amount: event.target.value }))
                  }
                  placeholder="0.00"
                  className={composerAmountFieldClassName}
                />
              </div>
              {(draft.type === "income" || draft.type === "expense") && (
                <div className="grid gap-4">
                  <div className="min-w-0 space-y-2.5">
                    <label className="block leading-none text-[0.88rem] font-semibold text-foreground sm:text-[0.95rem]">
                      Account
                    </label>
                    <Select
                      value={draft.accountId}
                      onValueChange={(value) =>
                        setDraft((current) => ({ ...current, accountId: value }))
                      }
                    >
                      <SelectTrigger className={composerFieldClassName}>
                        <SelectValue
                          placeholder={
                            draft.type === "expense"
                              ? "Select a bank, wallet, or credit account"
                              : "Select a bank or wallet account"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {(draft.type === "expense" ? spendableAccounts : liquidAccounts).map(
                          (account) => (
                            <SelectItem key={account.id} value={account.id}>
                              {account.name} · {getAccountTypeLabel(account.type)}
                            </SelectItem>
                          ),
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="min-w-0 space-y-2.5">
                    <label className="block leading-none text-[0.88rem] font-semibold text-foreground sm:text-[0.95rem]">
                      Date
                    </label>
                    <DatePickerField
                      value={draft.date}
                      onChange={(value) => setDraft((current) => ({ ...current, date: value }))}
                      className={composerDateFieldClassName}
                    />
                  </div>
                </div>
              )}
              {draft.type === "transfer" && (
                <div className="grid gap-4">
                  <div className="min-w-0 space-y-2.5">
                    <label className="text-[0.88rem] font-semibold text-foreground sm:text-[0.95rem]">
                      From
                    </label>
                    <Select
                      value={draft.sourceAccountId}
                      onValueChange={(value) =>
                        setDraft((current) => ({ ...current, sourceAccountId: value }))
                      }
                    >
                      <SelectTrigger className={composerFieldClassName}>
                        <SelectValue placeholder="Source account" />
                      </SelectTrigger>
                      <SelectContent>
                        {liquidAccounts.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.name} · {getAccountTypeLabel(account.type)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="min-w-0 space-y-2.5">
                    <label className="text-[0.88rem] font-semibold text-foreground sm:text-[0.95rem]">
                      To
                    </label>
                    <Select
                      value={draft.destinationAccountId}
                      onValueChange={(value) =>
                        setDraft((current) => ({ ...current, destinationAccountId: value }))
                      }
                    >
                      <SelectTrigger className={composerFieldClassName}>
                        <SelectValue placeholder="Destination account" />
                      </SelectTrigger>
                      <SelectContent>
                        {liquidAccounts.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.name} · {getAccountTypeLabel(account.type)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
              {draft.type === "credit_payment" && (
                <>
                  <div className="grid gap-4">
                    <div className="min-w-0 space-y-2.5">
                      <label className="text-[0.88rem] font-semibold text-foreground sm:text-[0.95rem]">
                        Payment account
                      </label>
                      <Select
                        value={draft.sourceAccountId}
                        onValueChange={(value) =>
                          setDraft((current) => ({ ...current, sourceAccountId: value }))
                        }
                      >
                        <SelectTrigger className={composerFieldClassName}>
                          <SelectValue placeholder="Bank or wallet account" />
                        </SelectTrigger>
                        <SelectContent>
                          {liquidAccounts.map((account) => (
                            <SelectItem key={account.id} value={account.id}>
                              {account.name} · {getAccountTypeLabel(account.type)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="min-w-0 space-y-2.5">
                      <label className="text-[0.88rem] font-semibold text-foreground sm:text-[0.95rem]">
                        Credit account
                      </label>
                      <Select
                        value={draft.creditAccountId}
                        onValueChange={(value) =>
                          setDraft((current) => ({ ...current, creditAccountId: value }))
                        }
                      >
                        <SelectTrigger className={composerFieldClassName}>
                          <SelectValue placeholder="Credit account" />
                        </SelectTrigger>
                        <SelectContent>
                          {creditAccounts.map((account) => (
                            <SelectItem key={account.id} value={account.id}>
                              {account.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2.5">
                    <label className="text-[0.88rem] font-semibold text-foreground sm:text-[0.95rem]">
                      Date
                    </label>
                    <DatePickerField
                      value={draft.date}
                      onChange={(value) => setDraft((current) => ({ ...current, date: value }))}
                      className={composerDateFieldClassName}
                    />
                  </div>
                </>
              )}
              {draft.type === "loan_disbursement" && (
                <>
                  <div className="grid gap-4">
                    <div className="min-w-0 space-y-2.5">
                      <label className="text-[0.88rem] font-semibold text-foreground sm:text-[0.95rem]">
                        Loan account
                      </label>
                      <Select
                        value={draft.loanAccountId}
                        onValueChange={(value) =>
                          setDraft((current) => ({ ...current, loanAccountId: value }))
                        }
                      >
                        <SelectTrigger className={composerFieldClassName}>
                          <SelectValue placeholder="Loan account" />
                        </SelectTrigger>
                        <SelectContent>
                          {loanAccounts.map((account) => (
                            <SelectItem key={account.id} value={account.id}>
                              {account.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="min-w-0 space-y-2.5">
                      <label className="text-[0.88rem] font-semibold text-foreground sm:text-[0.95rem]">
                        Destination account
                      </label>
                      <Select
                        value={draft.destinationAccountId}
                        onValueChange={(value) =>
                          setDraft((current) => ({ ...current, destinationAccountId: value }))
                        }
                      >
                        <SelectTrigger className={composerFieldClassName}>
                          <SelectValue placeholder="Bank or wallet account" />
                        </SelectTrigger>
                        <SelectContent>
                          {liquidAccounts.map((account) => (
                            <SelectItem key={account.id} value={account.id}>
                              {account.name} · {getAccountTypeLabel(account.type)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2.5">
                    <label className="text-[0.88rem] font-semibold text-foreground sm:text-[0.95rem]">
                      Date
                    </label>
                    <DatePickerField
                      value={draft.date}
                      onChange={(value) => setDraft((current) => ({ ...current, date: value }))}
                      className={composerDateFieldClassName}
                    />
                  </div>
                </>
              )}
              </div>
            <div className="space-y-4 rounded-[1rem] border border-border/70 bg-white p-5">
              <p className="text-[0.62rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground sm:text-[0.68rem] sm:tracking-[0.22em]">
                Optional details
              </p>
              {draft.type === "income" && (
                <>
                  <div className="space-y-2.5">
                    <label className="text-[0.88rem] font-semibold text-foreground sm:text-[0.95rem]">
                      Description
                    </label>
                    <Input
                      value={draft.description}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, description: event.target.value }))
                      }
                      placeholder="Optional short label"
                      className={composerFieldClassName}
                    />
                    <p className="text-[0.74rem] text-muted-foreground sm:text-[0.78rem]">
                      Short label for this income.
                    </p>
                  </div>

                  <div className="grid gap-4">
                    <div className="min-w-0 space-y-2.5">
                      <label className="text-[0.88rem] font-semibold text-foreground sm:text-[0.95rem]">
                        Category
                      </label>
                      <Select
                        value={draft.categoryId}
                        onValueChange={(value) =>
                          setDraft((current) => ({ ...current, categoryId: value }))
                        }
                      >
                        <SelectTrigger className={composerFieldClassName}>
                          <SelectValue placeholder="No category" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No category</SelectItem>
                          {categoryOptions.map((category) => (
                            <SelectItem key={category.id} value={category.id}>
                              {category.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="min-h-[1.15rem] text-[0.74rem] text-muted-foreground sm:text-[0.78rem]">
                        Optional grouping for this income.
                      </p>
                    </div>

                    <div className="min-w-0 space-y-2.5">
                      <label className="text-[0.88rem] font-semibold text-foreground sm:text-[0.95rem]">
                        Notes
                      </label>
                      <Input
                        value={draft.notes}
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, notes: event.target.value }))
                        }
                        placeholder="Optional context"
                        className={composerFieldClassName}
                      />
                      <p className="min-h-[1.15rem] text-[0.74rem] text-muted-foreground sm:text-[0.78rem]">
                        Add any extra context about this income.
                      </p>
                    </div>
                  </div>
                </>
              )}
              {draft.type === "expense" && (
                <>
                  <div className="grid gap-4">
                    <div className="min-w-0 space-y-2.5">
                      <label className="text-[0.88rem] font-semibold text-foreground sm:text-[0.95rem]">
                        Category
                      </label>
                      <Select
                        value={draft.categoryId}
                        onValueChange={(value) =>
                          setDraft((current) => ({ ...current, categoryId: value }))
                        }
                      >
                        <SelectTrigger className={composerFieldClassName}>
                          <SelectValue placeholder="No category" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No category</SelectItem>
                          {categoryOptions.map((category) => (
                            <SelectItem key={category.id} value={category.id}>
                              {category.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="min-w-0 space-y-2.5">
                      <label className="text-[0.88rem] font-semibold text-foreground sm:text-[0.95rem]">
                        Budget
                      </label>
                      <Select
                        value={draft.budgetId}
                        onValueChange={(value) =>
                          setDraft((current) => ({ ...current, budgetId: value }))
                        }
                      >
                        <SelectTrigger className={composerFieldClassName}>
                          <SelectValue placeholder="No budget" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No budget</SelectItem>
                          {activeBudgetOptions.map((budget) => (
                            <SelectItem key={budget.id} value={budget.id}>
                              {budget.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </>
              )}
              {draft.type === "transfer" && (
                <div className="grid gap-4">
                  <div className="min-w-0 space-y-2.5">
                    <label className="text-[0.88rem] font-semibold text-foreground sm:text-[0.95rem]">
                      Transfer fee
                    </label>
                    <Input
                      type="number"
                      inputMode="decimal"
                      value={draft.feeAmount}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, feeAmount: event.target.value }))
                      }
                      placeholder="0.00"
                      className={composerFieldClassName}
                    />
                    <p className="text-[0.74rem] text-muted-foreground sm:text-[0.78rem]">
                      Optional. Fee is deducted from the source account.
                    </p>
                  </div>

                  <div className="min-w-0 space-y-2.5">
                    <label className="text-[0.88rem] font-semibold text-foreground sm:text-[0.95rem]">
                      Date
                    </label>
                    <DatePickerField
                      value={draft.date}
                      onChange={(value) => setDraft((current) => ({ ...current, date: value }))}
                      className={composerDateFieldClassName}
                    />
                  </div>
                </div>
              )}
              {draft.type === "credit_payment" && (
                <>
                  <div className="space-y-2.5">
                    <label className="text-[0.88rem] font-semibold text-foreground sm:text-[0.95rem]">
                      Description
                    </label>
                    <Input
                      value={draft.description}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, description: event.target.value }))
                      }
                      placeholder="Optional short label"
                      className={composerFieldClassName}
                    />
                    <p className="text-[0.74rem] text-muted-foreground sm:text-[0.78rem]">
                      Short label for this payment.
                    </p>
                  </div>

                  <div className="grid gap-4">
                    <div className="min-w-0 space-y-2.5">
                      <label className="text-[0.88rem] font-semibold text-foreground sm:text-[0.95rem]">
                        Payment fee
                      </label>
                      <Input
                        type="number"
                        inputMode="decimal"
                        value={draft.feeAmount}
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, feeAmount: event.target.value }))
                        }
                        placeholder="0.00"
                        className={composerFieldClassName}
                      />
                      <p className="text-[0.74rem] text-muted-foreground sm:text-[0.78rem]">
                        Optional. Fee is deducted from the payment account.
                      </p>
                    </div>

                    <div className="min-w-0 space-y-2.5">
                      <label className="text-[0.88rem] font-semibold text-foreground sm:text-[0.95rem]">
                        Notes
                      </label>
                      <Input
                        value={draft.notes}
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, notes: event.target.value }))
                        }
                        placeholder="Optional context"
                        className={composerFieldClassName}
                      />
                      <p className="text-[0.74rem] text-muted-foreground sm:text-[0.78rem]">
                        Add any extra context about this payment.
                      </p>
                    </div>
                  </div>
                </>
              )}
              {draft.type !== "income" && draft.type !== "credit_payment" && (
                <div className="grid gap-4">
                  <div className="space-y-2.5">
                    <label className="text-[0.88rem] font-semibold text-foreground sm:text-[0.95rem]">
                      Description
                    </label>
                    <Input
                      value={draft.description}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, description: event.target.value }))
                      }
                      placeholder="Optional short label"
                      className={composerFieldClassName}
                    />
                    <p className="text-[0.74rem] text-muted-foreground sm:text-[0.78rem]">
                      Short label for this for this event.
                    </p>
                  </div>
                  <div className="space-y-2.5">
                    <label className="text-[0.88rem] font-semibold text-foreground sm:text-[0.95rem]">
                      Notes
                    </label>
                    <Input
                      value={draft.notes}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, notes: event.target.value }))
                      }
                      placeholder="Optional context"
                      className={composerFieldClassName}
                    />
                    <p className="text-[0.74rem] text-muted-foreground sm:text-[0.78rem]">
                      Add any extra context about this event.{" "}
                    </p>
                  </div>
                </div>
              )}
              </div>
            </div>
            <DialogFooter className="sticky bottom-0 z-10 !mx-0 !mb-0 shrink-0 flex-row items-center justify-end gap-3 border-t border-border/60 bg-white px-5 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:pb-4 sm:pt-3 dark:bg-[#1a2325] [&>button]:w-auto">
              <Button
                type="button"
                variant="outline"
                className="h-11 min-w-[5.5rem] rounded-full bg-white px-5 text-[0.95rem]"
                onClick={() => setOpen(false)}
                disabled={createEvent.isPending || updateEvent.isPending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="h-11 min-w-[8.5rem] rounded-full bg-[#17393c] px-6 text-[0.95rem] text-white hover:bg-[#1d4a4d] disabled:text-white/85"
                onClick={submitEvent}
                disabled={createEvent.isPending || updateEvent.isPending}
              >
                {createEvent.isPending || updateEvent.isPending
                  ? editingEventId
                    ? "Saving..."
                    : "Recording..."
                  : `${editingEventId ? "Save" : "Record"} ${currentTypeMeta.label.toLowerCase()}`}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(nextOpen) => {
          if (!deleteEvent.isPending && !nextOpen) {
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
              Remove this event?
            </DialogTitle>
            <DialogDescription className="max-w-md text-[0.8rem] leading-5.5 sm:text-[0.9rem] sm:leading-6.5">
              {deleteTarget
                ? `Delete "${deleteTarget.description}" from your ledger? This also removes the account effects recorded for it.`
                : "Delete this event from your ledger? This also removes the account effects recorded for it."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-2.5 px-5 pb-[max(0.8rem,env(safe-area-inset-bottom))] pt-3 sm:flex sm:justify-end sm:px-6 sm:py-4">
            <Button
              type="button"
              variant="outline"
              className="h-9.5 w-full rounded-full px-4.5 sm:h-10 sm:w-auto"
              onClick={() => setDeleteTarget(null)}
              disabled={deleteEvent.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="h-9.5 w-full rounded-full bg-destructive px-4.5 text-white hover:bg-destructive/90 sm:h-10 sm:w-auto"
              onClick={() => deleteTarget && deleteEvent.mutate({ id: deleteTarget.id })}
              disabled={deleteEvent.isPending}
            >
              {deleteEvent.isPending ? "Deleting..." : "Delete event"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
