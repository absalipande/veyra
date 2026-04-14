"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import {
  ArrowRightLeft,
  CreditCard,
  HandCoins,
  Landmark,
  Pencil,
  Search,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import { formatCurrencyMiliunits } from "@/lib/currencies";
import { formatDateWithPreferences, resolveDatePreferences } from "@/features/settings/lib/date-format";
import type { AppRouter } from "@/server/api/root";
import { trpc } from "@/trpc/react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  {
    value: "loan_disbursement",
    label: "Loan disbursement",
    description: "Record a loan draw into a bank or wallet account.",
    icon: HandCoins,
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

function getEventTypeLabel(type: TransactionEventType) {
  return eventTypeOptions.find((option) => option.value === type)?.label ?? type;
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
        event.entries.find((entry) => entry.role === "payment_account")?.amountDelta ?? 0
      );
    case "loan_disbursement":
      return Math.abs(
        event.entries.find((entry) => entry.role === "disbursement_account")?.amountDelta ?? 0
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
      if (!source || !destination) {
        return "Transfer accounts missing";
      }

      return event.feeAmount > 0
        ? `${source.name} → ${destination.name} · Fee ${formatCurrencyMiliunits(
            event.feeAmount,
            event.currency
          )}`
        : `${source.name} → ${destination.name}`;
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
            event.currency
          )}`
        : `${source.name} → ${credit.name}`;
    }
    case "loan_disbursement": {
      const loan = event.entries.find((entry) => entry.role === "loan_account")?.account;
      const destination = event.entries.find((entry) => entry.role === "disbursement_account")?.account;
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
      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-[0.88rem] transition sm:px-3.5 sm:text-[0.9rem] ${
        isActive
          ? "border-[#17393c]/35 bg-[#17393c]/12 text-[#17393c] dark:border-primary/35 dark:bg-primary/12 dark:text-primary"
          : "border-border/70 bg-[#fbfaf6]/90 text-foreground/85 hover:bg-muted/50 dark:bg-[#162022]/90 dark:text-foreground/90"
      }`}
    >
      <Icon className="size-3.5 sm:size-4" />
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
  const settingsQuery = trpc.settings.get.useQuery();

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(initialQuery);
  const [typeFilter, setTypeFilter] = useState<"all" | TransactionEventType>("all");
  const [page, setPage] = useState(1);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 767px)").matches : false
  );
  const [draft, setDraft] = useState<EventDraft>(initialDraft);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const deferredSearch = useDeferredValue(search);
  const pageSize = isMobile ? 10 : 20;
  const summaryScrollerRef = useRef<HTMLDivElement | null>(null);
  const [activeSummaryIndex, setActiveSummaryIndex] = useState(0);
  const eventsQuery = trpc.transactions.list.useQuery({
    page,
    pageSize,
    search: deferredSearch,
    type: typeFilter,
  });

  const refreshTransactions = async () => {
    await Promise.all([
      utils.transactions.list.invalidate(),
      utils.transactions.summary.invalidate(),
      utils.accounts.list.invalidate(),
      utils.accounts.summary.invalidate(),
      utils.budgets.list.invalidate(),
      utils.budgets.summary.invalidate(),
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

  const liquidAccounts = useMemo(
    () => (accountsQuery.data ?? []).filter((account) => account.type === "cash" || account.type === "wallet"),
    [accountsQuery.data]
  );

  const creditAccounts = useMemo(
    () => (accountsQuery.data ?? []).filter((account) => account.type === "credit"),
    [accountsQuery.data]
  );

  const spendableAccounts = useMemo(
    () =>
      (accountsQuery.data ?? []).filter(
        (account) => account.type === "cash" || account.type === "wallet" || account.type === "credit"
      ),
    [accountsQuery.data]
  );

  const loanAccounts = useMemo(
    () => (accountsQuery.data ?? []).filter((account) => account.type === "loan"),
    [accountsQuery.data]
  );

  const activeBudgetOptions = useMemo(
    () =>
      (budgetsQuery.data ?? [])
        .filter((budget) => budget.isActive)
        .sort((a: BudgetItem, b: BudgetItem) => a.name.localeCompare(b.name)),
    [budgetsQuery.data]
  );

  const categoryOptions = useMemo(
    () =>
      (categoriesQuery.data ?? [])
        .filter((category) => category.kind === draft.type)
        .sort((a: CategoryItem, b: CategoryItem) => a.name.localeCompare(b.name)),
    [categoriesQuery.data, draft.type]
  );

  const visibleEvents = useMemo(() => eventsQuery.data?.items ?? [], [eventsQuery.data]);
  const datePreferences = resolveDatePreferences(settingsQuery.data);
  const formatEventDate = (value: Date | string) =>
    formatDateWithPreferences(value, datePreferences, "date");

  const summaryCards = summaryQuery.data
    ? [
        {
          label: "Events logged",
          value: String(summaryQuery.data.totalEvents),
          detail: "All recorded money movements in your workspace",
          icon: Landmark,
        },
        {
          label: "Income and expense",
          value: String(summaryQuery.data.incomeEvents + summaryQuery.data.expenseEvents),
          detail: `${summaryQuery.data.incomeEvents} income · ${summaryQuery.data.expenseEvents} expense`,
          icon: Wallet,
        },
        {
          label: "Internal movement",
          value: String(summaryQuery.data.transferEvents + summaryQuery.data.creditPaymentEvents),
          detail: `${summaryQuery.data.transferEvents} transfer · ${summaryQuery.data.creditPaymentEvents} credit payment`,
          icon: ArrowRightLeft,
        },
        {
          label: "Loan activity",
          value: String(summaryQuery.data.loanDisbursementEvents),
          detail: "Loan disbursements recorded so far",
          icon: HandCoins,
        },
        {
          label: "Fees tracked",
          value: formatCurrencyMiliunits(summaryQuery.data.totalTransferFees, "PHP"),
          detail: "Transfer and credit payment fees recorded so far",
          icon: CreditCard,
        },
      ]
    : [];

  const currentTypeMeta = eventTypeOptions.find((option) => option.value === draft.type)!;
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

  useEffect(() => {
    if (!summaryScrollerRef.current) return;

    const handleScroll = () => {
      const scroller = summaryScrollerRef.current;
      if (!scroller) return;

      const cards = Array.from(scroller.querySelectorAll<HTMLElement>("[data-summary-slide]"));
      if (cards.length === 0) return;

      const scrollerCenter = scroller.scrollLeft + scroller.clientWidth / 2;
      let closestIndex = 0;
      let closestDistance = Number.POSITIVE_INFINITY;

      cards.forEach((card, index) => {
        const cardCenter = card.offsetLeft + card.offsetWidth / 2;
        const distance = Math.abs(cardCenter - scrollerCenter);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestIndex = index;
        }
      });

      setActiveSummaryIndex(closestIndex);
    };

    handleScroll();
    const scroller = summaryScrollerRef.current;
    if (!scroller) return;
    scroller.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      scroller.removeEventListener("scroll", handleScroll);
    };
  }, [summaryCards.length]);

  const scrollSummaryCards = (index: number) => {
    const scroller = summaryScrollerRef.current;
    if (!scroller) return;

    const cards = Array.from(scroller.querySelectorAll<HTMLElement>("[data-summary-slide]"));
    const nextCard = cards[index];
    if (!nextCard) return;

    nextCard.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  };

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
        budgetId: draft.type === "expense" && draft.budgetId !== "none" ? draft.budgetId : undefined,
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

    if (!draft.loanAccountId || !draft.destinationAccountId) return;

    const payload: CreateTransactionEventInput = {
      type: "loan_disbursement",
      loanAccountId: draft.loanAccountId,
      destinationAccountId: draft.destinationAccountId,
      amount,
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
  };

  const openComposer = (type: TransactionEventType) => {
    setEditingEventId(null);
    setDraft({
      ...initialDraft,
      type,
      description:
        type === "income"
          ? "Income"
          : type === "expense"
            ? "Expense"
            : type === "transfer"
              ? "Transfer"
              : type === "credit_payment"
                ? "Credit card payment"
                : "Loan disbursement",
    });
    setOpen(true);
  };

  const openEditComposer = (event: TransactionEventItem) => {
    setEditingEventId(event.id);
    setDraft(buildDraftFromEvent(event));
    setOpen(true);
  };

  return (
    <div className="space-y-6 lg:space-y-7">
      <section className="overflow-hidden rounded-[1.8rem] border border-white/80 bg-[linear-gradient(145deg,rgba(16,41,43,0.98),rgba(29,78,77,0.94))] text-white shadow-[0_28px_95px_-72px_rgba(10,31,34,0.82)]">
        <div className="grid gap-4 px-4 py-4 sm:px-6 sm:py-5 xl:grid-cols-[minmax(0,1fr)_300px] xl:items-center">
          <div className="max-w-3xl">
            <div className="inline-flex rounded-full border border-white/15 bg-white/10 px-2.5 py-0.5 text-[0.64rem] font-medium uppercase tracking-[0.22em] text-white/78">
              Transactions workspace
            </div>
            <h1 className="mt-2.5 max-w-[21ch] text-[1.55rem] font-semibold leading-[1.08] tracking-tight text-white sm:mt-3 sm:text-[2.2rem] sm:leading-[1.02]">
              A cleaner ledger for income, spending, transfers, and debt movement.
            </h1>
            <p className="mt-2 max-w-[34rem] text-[0.9rem] leading-6 text-white/72 sm:mt-2.5 sm:text-[0.95rem] sm:leading-7">
              Track real money events without turning the workspace into a ledger wall.
            </p>
          </div>

          <div className="hidden space-y-2.5 xl:block">
            <div className="rounded-[1.25rem] border border-white/12 bg-white/10 px-4 py-3 backdrop-blur">
              <p className="text-[0.68rem] font-medium uppercase tracking-[0.24em] text-white/60">
                Total events
              </p>
              <p className="mt-2 text-2xl font-semibold tracking-tight">
                {summaryQuery.data?.totalEvents ?? 0}
              </p>
            </div>
            <div className="rounded-[1.25rem] border border-white/12 bg-white/10 px-4 py-3 backdrop-blur">
              <p className="text-[0.68rem] font-medium uppercase tracking-[0.24em] text-white/60">
                Transfers and payments
              </p>
              <p className="mt-2 text-2xl font-semibold tracking-tight">
                {heroTransferAndPaymentCount}
              </p>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:hidden">
            <div className="rounded-[1.1rem] border border-white/12 bg-white/10 px-3.5 py-3 backdrop-blur">
              <p className="text-[0.62rem] font-medium uppercase tracking-[0.2em] text-white/60">
                Total events
              </p>
              <p className="mt-1.5 text-[1.5rem] font-semibold tracking-tight">
                {summaryQuery.data?.totalEvents ?? 0}
              </p>
            </div>
            <div className="rounded-[1.1rem] border border-white/12 bg-white/10 px-3.5 py-3 backdrop-blur">
              <p className="text-[0.62rem] font-medium uppercase tracking-[0.2em] text-white/60">
                Transfers and payments
              </p>
              <p className="mt-1.5 text-[1.5rem] font-semibold tracking-tight">
                {heroTransferAndPaymentCount}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div
          ref={summaryScrollerRef}
          className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-1 md:hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {summaryCards.map((card) => {
            const Icon = card.icon;

            return (
              <div
                key={card.label}
                data-summary-slide
                className="min-w-0 shrink-0 basis-full snap-center"
              >
                <Card className="border-white/75 bg-white/84 shadow-[0_20px_60px_-52px_rgba(10,31,34,0.28)] dark:border-white/8 dark:bg-[#182123] dark:shadow-[0_24px_60px_-45px_rgba(0,0,0,0.62)]">
                  <CardContent className="p-4.5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                          {card.label}
                        </p>
                        <p className="mt-2.5 text-[1.75rem] font-semibold tracking-tight text-[#10292B] dark:text-foreground">
                          {card.value}
                        </p>
                        <p className="mt-2 text-[0.9rem] leading-6 text-muted-foreground">
                          {card.detail}
                        </p>
                      </div>
                      <div className="flex size-9 items-center justify-center rounded-2xl border border-border/70 bg-[#fbfaf6] text-[#17393c] dark:bg-[#162022] dark:text-primary">
                        <Icon className="size-4.5" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            );
          })}
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
                onClick={() => scrollSummaryCards(Math.max(0, activeSummaryIndex - 1))}
                disabled={activeSummaryIndex === 0}
              >
                <span aria-hidden="true">‹</span>
                <span className="sr-only">Previous summary card</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className="rounded-full"
                onClick={() =>
                  scrollSummaryCards(Math.min(summaryCards.length - 1, activeSummaryIndex + 1))
                }
                disabled={activeSummaryIndex === summaryCards.length - 1}
              >
                <span aria-hidden="true">›</span>
                <span className="sr-only">Next summary card</span>
              </Button>
            </div>
          </div>
        ) : null}

        <div className="hidden gap-4 md:grid md:grid-cols-2 xl:grid-cols-5">
          {summaryCards.map((card) => {
            const Icon = card.icon;

            return (
              <Card
                key={card.label}
                className="border-white/75 bg-white/84 shadow-[0_20px_60px_-52px_rgba(10,31,34,0.28)] dark:border-white/8 dark:bg-[#182123] dark:shadow-[0_24px_60px_-45px_rgba(0,0,0,0.62)]"
              >
                <CardContent className="p-4.5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                        {card.label}
                      </p>
                      <p className="mt-2.5 text-[1.75rem] font-semibold tracking-tight text-[#10292B] dark:text-foreground">
                        {card.value}
                      </p>
                      <p className="mt-2 text-[0.9rem] leading-6 text-muted-foreground">
                        {card.detail}
                      </p>
                    </div>
                    <div className="flex size-9 items-center justify-center rounded-2xl border border-border/70 bg-[#fbfaf6] text-[#17393c] dark:bg-[#162022] dark:text-primary">
                      <Icon className="size-4.5" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section>
        <Card className="border-white/75 bg-white/84 shadow-[0_24px_70px_-55px_rgba(10,31,34,0.28)] dark:border-white/8 dark:bg-[#182123] dark:shadow-[0_28px_80px_-55px_rgba(0,0,0,0.62)]">
          <CardHeader className="gap-5 px-5 py-5 sm:px-6 sm:py-6">
            <div className="space-y-1.5">
              <CardTitle className="text-[1.45rem] tracking-tight text-[#10292B] dark:text-foreground">
                Record a money event
              </CardTitle>
              <CardDescription className="max-w-3xl text-[0.96rem] leading-7">
                Start with the user intent, then let Veyra apply the right account effects underneath.
              </CardDescription>
            </div>

            <div className="flex flex-wrap gap-2.5">
              {eventTypeOptions.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  variant="outline"
                  disabled={option.value === "loan_disbursement"}
                  className="rounded-full bg-[#fbfaf6] px-3.5 text-[0.92rem] dark:bg-[#162022] disabled:border-border/50 disabled:bg-muted/50 disabled:text-muted-foreground disabled:opacity-100 dark:disabled:bg-[#141d1f] sm:px-4 sm:text-sm"
                  onClick={() => {
                    if (option.value === "loan_disbursement") return;
                    openComposer(option.value);
                  }}
                >
                  <option.icon className="size-4" />
                  {option.label}
                </Button>
              ))}
            </div>
          </CardHeader>
        </Card>
      </section>

      <section>
        <Card className="border-white/75 bg-white/84 shadow-[0_24px_70px_-55px_rgba(10,31,34,0.28)] dark:border-white/8 dark:bg-[#182123] dark:shadow-[0_28px_80px_-55px_rgba(0,0,0,0.62)]">
          <CardHeader className="gap-4 px-5 py-5 sm:px-6 sm:py-6">
            <div className="space-y-1.5">
              <CardTitle className="text-[1.45rem] tracking-tight text-[#10292B] dark:text-foreground">
                Ledger
              </CardTitle>
              <CardDescription className="max-w-3xl text-[0.96rem] leading-7">
                Review the event stream before we layer in calendar, import, and bulk workflows.
              </CardDescription>
            </div>

            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
              <div className="relative min-w-0">
                <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                  placeholder="Search events, accounts, or notes"
                  className="h-12 rounded-full border-border/70 bg-[#fbfaf6] pl-10 pr-4 text-[0.92rem] dark:bg-[#162022]"
                />
              </div>
              <Select
                value={typeFilter}
                onValueChange={(value) => {
                  setTypeFilter(value as "all" | TransactionEventType);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-12 rounded-full border-border/70 bg-[#fbfaf6] px-4 text-[0.92rem] dark:bg-[#162022]">
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
          </CardHeader>

          <CardContent className="px-5 pb-5 pt-0 sm:px-6 sm:pb-6">
            {eventsQuery.isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-24 animate-pulse rounded-[1.6rem] border border-border/70 bg-[#fbfaf6] dark:bg-[#162022]"
                  />
                ))}
              </div>
            ) : eventsQuery.error ? (
              <div className="rounded-[1.8rem] border border-destructive/20 bg-[#fbfaf6] px-6 py-10 text-center dark:bg-[#162022]">
                <p className="text-[1.2rem] font-semibold tracking-tight text-[#10292B] dark:text-foreground">
                  Couldn’t load the ledger
                </p>
                <p className="mx-auto mt-3 max-w-md text-[0.95rem] leading-7 text-muted-foreground">
                  {eventsQuery.error.message || "The transaction list is not available right now."}
                </p>
              </div>
            ) : visibleEvents.length === 0 ? (
              <div className="rounded-[1.8rem] border border-dashed border-border/80 bg-[#fbfaf6] px-6 py-12 text-center dark:bg-[#162022]">
                <p className="text-[1.35rem] font-semibold tracking-tight text-[#10292B] dark:text-foreground">
                  No events yet
                </p>
                <p className="mx-auto mt-3 max-w-md text-[0.98rem] leading-8 text-muted-foreground">
                  Start with one income, expense, transfer, credit payment, or loan disbursement
                  to bring the ledger to life.
                </p>
              </div>
            ) : (
                <div className="overflow-hidden rounded-[1.85rem] border border-border/70 bg-[#fdfcf8] dark:bg-[#141d1f]">
                  <div className="divide-y divide-border/70">
                    {visibleEvents.map((event) => (
                    <div
                      key={event.id}
                      className="grid gap-3 px-4 py-4 sm:px-5 md:grid-cols-[minmax(0,1.4fr)_140px_120px] md:items-center md:gap-4 md:px-6"
                    >
                      <div className="min-w-0 md:min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-[0.98rem] font-semibold tracking-tight text-[#10292B] dark:text-foreground">
                            {event.description}
                          </p>
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-[0.72rem] font-medium ${getEventTypeTone(event.type)}`}
                          >
                            {getEventTypeLabel(event.type)}
                          </span>
                        </div>
                        <p className="mt-1 text-[0.82rem] text-muted-foreground">
                          {getEventAccountsSummary(event)}
                        </p>
                        <p className="mt-1 text-[0.78rem] text-muted-foreground">
                          {formatEventDate(event.occurredAt)}
                          {event.category ? ` · ${event.category.name}` : ""}
                          {event.notes ? ` · ${event.notes}` : ""}
                        </p>
                        <div className="mt-3 flex items-end justify-between gap-4 md:hidden">
                          <div className="min-w-0">
                            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                              Amount
                            </p>
                            <p className="mt-1 text-[0.98rem] font-semibold tracking-tight text-[#10292B] dark:text-foreground">
                              {formatCurrencyMiliunits(getPrimaryAmount(event), event.currency)}
                            </p>
                          </div>
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="icon-sm"
                              className="rounded-full"
                              onClick={() => openEditComposer(event)}
                            >
                              <Pencil className="size-4" />
                              <span className="sr-only">Edit event</span>
                            </Button>
                            <Button
                              variant="outline"
                              size="icon-sm"
                              className="rounded-full text-destructive hover:text-destructive"
                              onClick={() =>
                                setDeleteTarget({ id: event.id, description: event.description })
                              }
                            >
                              <Trash2 className="size-4" />
                              <span className="sr-only">Delete event</span>
                            </Button>
                          </div>
                        </div>
                      </div>

                      <div className="hidden md:block md:text-right">
                        <p className="text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                          Amount
                        </p>
                        <p className="mt-1 text-[0.95rem] font-semibold tracking-tight text-[#10292B] dark:text-foreground md:mt-0">
                          {formatCurrencyMiliunits(getPrimaryAmount(event), event.currency)}
                        </p>
                      </div>

                      <div className="hidden md:flex md:justify-end md:gap-2 md:pt-0">
                        <Button
                          variant="outline"
                          size="icon-sm"
                          className="rounded-full"
                          onClick={() => openEditComposer(event)}
                        >
                          <Pencil className="size-4" />
                          <span className="sr-only">Edit event</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="icon-sm"
                          className="rounded-full text-destructive hover:text-destructive"
                          onClick={() =>
                            setDeleteTarget({ id: event.id, description: event.description })
                          }
                        >
                          <Trash2 className="size-4" />
                          <span className="sr-only">Delete event</span>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {eventsQuery.data && eventsQuery.data.totalPages > 1 ? (
              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[0.86rem] text-muted-foreground">
                  Page {eventsQuery.data.page} of {eventsQuery.data.totalPages} · {eventsQuery.data.totalCount} events
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
                      setPage((current) => Math.min(eventsQuery.data?.totalPages ?? current, current + 1))
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
        <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] overflow-x-hidden overflow-y-auto rounded-[1.75rem] border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(251,250,246,0.95))] px-0 py-0 dark:border-white/8 dark:bg-[linear-gradient(180deg,rgba(24,33,35,0.98),rgba(18,27,29,0.98))] [&>button[data-slot='dialog-close']]:right-3 [&>button[data-slot='dialog-close']]:top-3 sm:max-h-[92vh] sm:w-auto sm:max-w-[56rem] sm:rounded-[2rem] sm:[&>button[data-slot='dialog-close']]:right-4 sm:[&>button[data-slot='dialog-close']]:top-4">
          <DialogHeader className="border-b border-border/70 px-5 pb-4 pt-[max(1rem,env(safe-area-inset-top))] pr-14 sm:px-8 sm:pb-6 sm:pt-8 sm:pr-16">
            <div className="inline-flex w-fit rounded-full border border-[#17393c]/10 bg-[#17393c]/5 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-[#17393c] dark:border-white/8 dark:bg-white/6 dark:text-primary">
              Event composer
            </div>
            <DialogTitle className="pt-2 text-[1.65rem] tracking-tight sm:pt-3 sm:text-[2rem]">
              {editingEventId
                ? `Edit ${currentTypeMeta.label.toLowerCase()}`
                : `Record ${withIndefiniteArticle(currentTypeMeta.label)}`}
            </DialogTitle>
            <DialogDescription className="max-w-xl text-[0.96rem] leading-7">
              {editingEventId
                ? "Update the event details and Veyra will reapply the account effects underneath."
                : currentTypeMeta.description}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 px-5 py-4 sm:space-y-6 sm:px-8 sm:py-7">
            <div className="flex flex-wrap gap-2.5">
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
                    }))
                  }
                />
              ))}
            </div>

            <div className="space-y-5 rounded-2xl border border-border/70 bg-background/40 p-4 sm:p-5">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Primary details
              </p>

              <div className="space-y-2.5">
                <label className="text-[0.95rem] font-semibold text-foreground">Amount</label>
                <Input
                  type="number"
                  inputMode="decimal"
                  autoFocus
                  value={draft.amount}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, amount: event.target.value }))
                  }
                  placeholder="0.00"
                  className="h-13 rounded-2xl border-border/80 bg-background px-4 text-[1.35rem] font-semibold tracking-tight sm:h-14 sm:text-[1.55rem]"
                />
              </div>

              {(draft.type === "income" || draft.type === "expense") && (
                <div className="grid gap-5 md:grid-cols-2">
                  <div className="min-w-0 space-y-3">
                    <label className="text-[0.95rem] font-semibold text-foreground">Account</label>
                    <Select
                      value={draft.accountId}
                      onValueChange={(value) => setDraft((current) => ({ ...current, accountId: value }))}
                    >
                      <SelectTrigger className="h-10 rounded-xl border-border/80 bg-background px-4">
                        <SelectValue
                          placeholder={
                            draft.type === "expense"
                              ? "Select a bank, wallet, or credit account"
                              : "Select a bank or wallet account"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {(draft.type === "expense" ? spendableAccounts : liquidAccounts).map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.name} · {getAccountTypeLabel(account.type)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-3">
                    <label className="text-[0.95rem] font-semibold text-foreground">Date</label>
                    <Input
                      type="date"
                      value={draft.date}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, date: event.target.value }))
                      }
                      className="h-10 rounded-xl border-border/80 bg-background px-4"
                    />
                  </div>
                </div>
              )}

              {draft.type === "transfer" && (
                <>
                  <div className="grid gap-5 md:grid-cols-2">
                    <div className="space-y-3">
                      <label className="text-[0.95rem] font-semibold text-foreground">From</label>
                      <Select
                        value={draft.sourceAccountId}
                        onValueChange={(value) =>
                          setDraft((current) => ({ ...current, sourceAccountId: value }))
                        }
                      >
                        <SelectTrigger className="h-10 rounded-xl border-border/80 bg-background px-4">
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
                    <div className="space-y-3">
                      <label className="text-[0.95rem] font-semibold text-foreground">To</label>
                      <Select
                        value={draft.destinationAccountId}
                        onValueChange={(value) =>
                          setDraft((current) => ({ ...current, destinationAccountId: value }))
                        }
                      >
                        <SelectTrigger className="h-10 rounded-xl border-border/80 bg-background px-4">
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
                  <div className="space-y-3 md:max-w-[17rem]">
                    <label className="text-[0.95rem] font-semibold text-foreground">Date</label>
                    <Input
                      type="date"
                      value={draft.date}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, date: event.target.value }))
                      }
                      className="h-10 rounded-xl border-border/80 bg-background px-4"
                    />
                  </div>
                </>
              )}

              {draft.type === "credit_payment" && (
                <>
                  <div className="grid gap-5 md:grid-cols-2">
                    <div className="space-y-3">
                      <label className="text-[0.95rem] font-semibold text-foreground">Payment account</label>
                      <Select
                        value={draft.sourceAccountId}
                        onValueChange={(value) =>
                          setDraft((current) => ({ ...current, sourceAccountId: value }))
                        }
                      >
                        <SelectTrigger className="h-10 rounded-xl border-border/80 bg-background px-4">
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
                    <div className="space-y-3">
                      <label className="text-[0.95rem] font-semibold text-foreground">Credit account</label>
                      <Select
                        value={draft.creditAccountId}
                        onValueChange={(value) =>
                          setDraft((current) => ({ ...current, creditAccountId: value }))
                        }
                      >
                        <SelectTrigger className="h-10 rounded-xl border-border/80 bg-background px-4">
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
                  <div className="space-y-3 md:max-w-[17rem]">
                    <label className="text-[0.95rem] font-semibold text-foreground">Date</label>
                    <Input
                      type="date"
                      value={draft.date}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, date: event.target.value }))
                      }
                      className="h-10 rounded-xl border-border/80 bg-background px-4"
                    />
                  </div>
                </>
              )}

              {draft.type === "loan_disbursement" && (
                <>
                  <div className="grid gap-5 md:grid-cols-2">
                    <div className="space-y-3">
                      <label className="text-[0.95rem] font-semibold text-foreground">Loan account</label>
                      <Select
                        value={draft.loanAccountId}
                        onValueChange={(value) =>
                          setDraft((current) => ({ ...current, loanAccountId: value }))
                        }
                      >
                        <SelectTrigger className="h-10 rounded-xl border-border/80 bg-background px-4">
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
                    <div className="space-y-3">
                      <label className="text-[0.95rem] font-semibold text-foreground">Destination account</label>
                      <Select
                        value={draft.destinationAccountId}
                        onValueChange={(value) =>
                          setDraft((current) => ({ ...current, destinationAccountId: value }))
                        }
                      >
                        <SelectTrigger className="h-10 rounded-xl border-border/80 bg-background px-4">
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
                  <div className="space-y-3 md:max-w-[17rem]">
                    <label className="text-[0.95rem] font-semibold text-foreground">Date</label>
                    <Input
                      type="date"
                      value={draft.date}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, date: event.target.value }))
                      }
                      className="h-10 rounded-xl border-border/80 bg-background px-4"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="space-y-5 rounded-2xl border border-dashed border-border/75 bg-background/20 p-4 sm:p-5">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Optional details
              </p>

              {(draft.type === "income" || draft.type === "expense") && (
                <div className="grid gap-5 md:grid-cols-2">
                  <div className="min-w-0 space-y-3">
                    <label className="text-[0.95rem] font-semibold text-foreground">Category</label>
                    <Select
                      value={draft.categoryId}
                      onValueChange={(value) => setDraft((current) => ({ ...current, categoryId: value }))}
                    >
                      <SelectTrigger className="h-10 rounded-xl border-border/80 bg-background px-4">
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

                  {draft.type === "expense" ? (
                    <div className="min-w-0 space-y-3">
                      <label className="text-[0.95rem] font-semibold text-foreground">Budget</label>
                      <Select
                        value={draft.budgetId}
                        onValueChange={(value) => setDraft((current) => ({ ...current, budgetId: value }))}
                      >
                        <SelectTrigger className="h-10 rounded-xl border-border/80 bg-background px-4">
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
                  ) : null}
                </div>
              )}

              {(draft.type === "transfer" || draft.type === "credit_payment") && (
                <div className="space-y-3 md:max-w-[17rem]">
                  <label className="text-[0.95rem] font-semibold text-foreground">
                    {draft.type === "transfer" ? "Transfer fee" : "Payment fee"}
                  </label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={draft.feeAmount}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, feeAmount: event.target.value }))
                    }
                    placeholder="0.00"
                    className="h-10 rounded-xl border-border/80 bg-background px-4"
                  />
                  <p className="text-[0.78rem] text-muted-foreground">
                    {draft.type === "transfer"
                      ? "Optional. Fee is deducted from the source account."
                      : "Optional. Fee is deducted from the payment account."}
                  </p>
                </div>
              )}

              <div className="grid gap-5 md:grid-cols-2">
                <div className="space-y-3">
                  <label className="text-[0.95rem] font-semibold text-foreground">Description</label>
                  <Input
                    value={draft.description}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, description: event.target.value }))
                    }
                    placeholder="Optional short label"
                    className="h-10 rounded-xl border-border/80 bg-background px-4"
                  />
                </div>
                <div className="space-y-3">
                  <label className="text-[0.95rem] font-semibold text-foreground">Notes</label>
                  <Input
                    value={draft.notes}
                    onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
                    placeholder="Optional context"
                    className="h-10 rounded-xl border-border/80 bg-background px-4"
                  />
                </div>
              </div>
            </div>

            <DialogFooter className="bg-transparent px-5 pb-[max(0.7rem,env(safe-area-inset-bottom))] pt-2 sm:px-8 sm:pb-5 sm:pt-3">
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-full sm:h-11"
                onClick={() => setOpen(false)}
                disabled={createEvent.isPending || updateEvent.isPending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="h-10 rounded-full bg-[#17393c] hover:bg-[#1d4a4d] sm:h-11"
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
        <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] overflow-x-hidden overflow-y-auto rounded-[1.45rem] border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(251,250,246,0.95))] px-0 py-0 dark:border-white/8 dark:bg-[linear-gradient(180deg,rgba(24,33,35,0.98),rgba(18,27,29,0.98))] [&>button[data-slot='dialog-close']]:right-3 [&>button[data-slot='dialog-close']]:top-3 sm:w-auto sm:max-w-lg sm:rounded-[1.6rem] sm:[&>button[data-slot='dialog-close']]:right-4 sm:[&>button[data-slot='dialog-close']]:top-4">
          <DialogHeader className="border-b border-border/70 px-5 pb-4 pt-[max(1rem,env(safe-area-inset-top))] pr-14 sm:px-7 sm:pb-5 sm:pt-7 sm:pr-16">
            <div className="inline-flex w-fit rounded-full border border-destructive/15 bg-destructive/5 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-destructive">
              Confirm delete
            </div>
            <DialogTitle className="pt-2 text-[1.45rem] tracking-tight text-[#10292B] dark:text-foreground sm:pt-3 sm:text-[1.7rem]">
              Remove this event?
            </DialogTitle>
            <DialogDescription className="max-w-md text-[0.95rem] leading-7">
              {deleteTarget
                ? `Delete "${deleteTarget.description}" from your ledger? This also removes the account effects recorded for it.`
                : "Delete this event from your ledger? This also removes the account effects recorded for it."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3 px-5 pb-[max(0.85rem,env(safe-area-inset-bottom))] pt-3 sm:flex sm:justify-end sm:px-7 sm:py-6">
            <Button
              type="button"
              variant="outline"
              className="h-10 w-full rounded-full px-5 sm:h-11 sm:w-auto"
              onClick={() => setDeleteTarget(null)}
              disabled={deleteEvent.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="h-10 w-full rounded-full bg-destructive px-5 text-white hover:bg-destructive/90 sm:h-11 sm:w-auto"
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
