"use client";

import { useMemo, useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import {
  ArrowRightLeft,
  CreditCard,
  HandCoins,
  Landmark,
  Search,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import { formatCurrencyMiliunits } from "@/lib/currencies";
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

type RouterOutputs = inferRouterOutputs<AppRouter>;
type TransactionEventItem = RouterOutputs["transactions"]["list"][number];
type TransactionEventType = RouterOutputs["transactions"]["list"][number]["type"];
type AccountItem = RouterOutputs["accounts"]["list"][number];

type EventDraft = {
  amount: string;
  creditAccountId: string;
  date: string;
  description: string;
  destinationAccountId: string;
  feeAmount: string;
  loanAccountId: string;
  notes: string;
  sourceAccountId: string;
  type: TransactionEventType;
  accountId: string;
};

type DeleteTarget = { id: string; description: string } | null;

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

function formatEventDate(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
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

function matchesSearch(event: TransactionEventItem, search: string) {
  const normalized = search.trim().toLowerCase();
  if (!normalized) return true;

  const haystack = [
    event.description,
    event.notes ?? "",
    getEventTypeLabel(event.type),
    getEventAccountsSummary(event),
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(normalized);
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
      className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition ${
        isActive
          ? "border-[#17393c] bg-[#17393c] text-white"
          : "border-border/70 bg-[#fbfaf6] text-foreground hover:bg-muted/60 dark:bg-[#162022]"
      }`}
    >
      <Icon className="size-4" />
      <span>{label}</span>
    </button>
  );
}

export function TransactionsWorkspace() {
  const utils = trpc.useUtils();
  const accountsQuery = trpc.accounts.list.useQuery();
  const eventsQuery = trpc.transactions.list.useQuery();
  const summaryQuery = trpc.transactions.summary.useQuery();

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | TransactionEventType>("all");
  const [draft, setDraft] = useState<EventDraft>(initialDraft);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);

  const refreshTransactions = async () => {
    await Promise.all([
      utils.transactions.list.invalidate(),
      utils.transactions.summary.invalidate(),
      utils.accounts.list.invalidate(),
      utils.accounts.summary.invalidate(),
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

  const visibleEvents = useMemo(() => {
    const items = eventsQuery.data ?? [];

    return items.filter((event) => {
      const typeMatches = typeFilter === "all" || event.type === typeFilter;
      return typeMatches && matchesSearch(event, search);
    });
  }, [eventsQuery.data, search, typeFilter]);

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

  const submitEvent = () => {
    const amount = Math.round(Number(draft.amount) * 1000);
    const feeAmount = Math.round(Number(draft.feeAmount) * 1000);
    if (!draft.description.trim() || Number.isNaN(amount) || amount <= 0) return;

    if (draft.type === "income" || draft.type === "expense") {
      if (!draft.accountId) return;

      createEvent.mutate({
        type: draft.type,
        accountId: draft.accountId,
        amount,
        date: draft.date,
        description: draft.description,
        notes: draft.notes,
      });
      return;
    }

    if (draft.type === "transfer") {
      if (!draft.sourceAccountId || !draft.destinationAccountId) return;

      createEvent.mutate({
        type: "transfer",
        sourceAccountId: draft.sourceAccountId,
        destinationAccountId: draft.destinationAccountId,
        amount,
        feeAmount: Number.isNaN(feeAmount) || feeAmount < 0 ? 0 : feeAmount,
        date: draft.date,
        description: draft.description,
        notes: draft.notes,
      });
      return;
    }

    if (draft.type === "credit_payment") {
      if (!draft.sourceAccountId || !draft.creditAccountId) return;

      createEvent.mutate({
        type: "credit_payment",
        sourceAccountId: draft.sourceAccountId,
        creditAccountId: draft.creditAccountId,
        amount,
        feeAmount: Number.isNaN(feeAmount) || feeAmount < 0 ? 0 : feeAmount,
        date: draft.date,
        description: draft.description,
        notes: draft.notes,
      });
      return;
    }

    if (!draft.loanAccountId || !draft.destinationAccountId) return;

    createEvent.mutate({
      type: "loan_disbursement",
      loanAccountId: draft.loanAccountId,
      destinationAccountId: draft.destinationAccountId,
      amount,
      date: draft.date,
      description: draft.description,
      notes: draft.notes,
    });
  };

  const openComposer = (type: TransactionEventType) => {
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

  return (
    <div className="space-y-6 lg:space-y-7">
      <section className="overflow-hidden rounded-[2.1rem] border border-white/80 bg-[linear-gradient(145deg,rgba(16,41,43,0.98),rgba(29,78,77,0.94))] text-white shadow-[0_30px_110px_-70px_rgba(10,31,34,0.84)]">
        <div className="grid gap-6 px-6 py-7 sm:px-8 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-end">
          <div className="max-w-3xl">
            <div className="inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[0.7rem] font-medium uppercase tracking-[0.28em] text-white/80">
              Transactions workspace
            </div>
            <h1 className="mt-4 text-[2.35rem] font-semibold tracking-tight text-white sm:text-[3rem]">
              A cleaner ledger for income, spending, transfers, and debt movement.
            </h1>
            <p className="mt-4 max-w-2xl text-[0.98rem] leading-8 text-white/72">
              Veyra tracks real money events with the right account effects underneath, so the
              interface stays calm even when the finance logic gets richer.
            </p>
          </div>

          <div className="space-y-3">
            <div className="rounded-[1.65rem] border border-white/12 bg-white/10 px-5 py-4 backdrop-blur">
              <p className="text-[0.72rem] font-medium uppercase tracking-[0.28em] text-white/60">
                Total events
              </p>
              <p className="mt-3 text-3xl font-semibold tracking-tight">
                {summaryQuery.data?.totalEvents ?? 0}
              </p>
            </div>
            <div className="rounded-[1.65rem] border border-white/12 bg-white/10 px-5 py-4 backdrop-blur">
              <p className="text-[0.72rem] font-medium uppercase tracking-[0.28em] text-white/60">
                Transfers and payments
              </p>
              <p className="mt-3 text-3xl font-semibold tracking-tight">
                {(summaryQuery.data?.transferEvents ?? 0) + (summaryQuery.data?.creditPaymentEvents ?? 0)}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
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
      </section>

      <section>
        <Card className="border-white/75 bg-white/84 shadow-[0_24px_70px_-55px_rgba(10,31,34,0.28)] dark:border-white/8 dark:bg-[#182123] dark:shadow-[0_28px_80px_-55px_rgba(0,0,0,0.62)]">
          <CardHeader className="gap-5">
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
                  className="rounded-full bg-[#fbfaf6] dark:bg-[#162022]"
                  onClick={() => openComposer(option.value)}
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
          <CardHeader className="gap-4">
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
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by description, account, notes, or event type"
                  className="h-12 rounded-full border-border/70 bg-[#fbfaf6] pl-10 dark:bg-[#162022]"
                />
              </div>
              <Select
                value={typeFilter}
                onValueChange={(value) => setTypeFilter(value as "all" | TransactionEventType)}
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

          <CardContent>
            {eventsQuery.isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-24 animate-pulse rounded-[1.6rem] border border-border/70 bg-[#fbfaf6] dark:bg-[#162022]"
                  />
                ))}
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
                      className="grid gap-4 px-5 py-4 md:grid-cols-[minmax(0,1.4fr)_140px_120px] md:items-center md:px-6"
                    >
                      <div className="min-w-0">
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
                          {event.notes ? ` · ${event.notes}` : ""}
                        </p>
                      </div>

                      <div className="md:text-right">
                        <p className="text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground md:hidden">
                          Amount
                        </p>
                        <p className="mt-1 text-[0.95rem] font-semibold tracking-tight text-[#10292B] dark:text-foreground md:mt-0">
                          {formatCurrencyMiliunits(getPrimaryAmount(event), event.currency)}
                        </p>
                      </div>

                      <div className="flex justify-start gap-2 md:justify-end">
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
          </CardContent>
        </Card>
      </section>

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen && !createEvent.isPending) {
            setDraft(initialDraft);
          }
        }}
      >
        <DialogContent className="overflow-hidden rounded-[2rem] border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(251,250,246,0.95))] px-0 py-0 dark:border-white/8 dark:bg-[linear-gradient(180deg,rgba(24,33,35,0.98),rgba(18,27,29,0.98))] sm:max-w-[56rem]">
          <DialogHeader className="border-b border-border/70 px-7 pb-5 pt-7 pr-16 sm:px-8 sm:pb-6 sm:pt-8">
            <div className="inline-flex w-fit rounded-full border border-[#17393c]/10 bg-[#17393c]/5 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-[#17393c] dark:border-white/8 dark:bg-white/6 dark:text-primary">
              Event composer
            </div>
            <DialogTitle className="pt-3 text-[2rem] tracking-tight">
              Record a {currentTypeMeta.label.toLowerCase()}
            </DialogTitle>
            <DialogDescription className="max-w-xl text-[0.96rem] leading-7">
              {currentTypeMeta.description}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 px-7 py-6 sm:px-8 sm:py-7">
            <div className="flex flex-wrap gap-2.5">
              {eventTypeOptions.map((option) => (
                <EventTypeButton
                  key={option.value}
                  label={option.label}
                  icon={option.icon}
                  isActive={draft.type === option.value}
                  onClick={() => setDraft((current) => ({ ...current, type: option.value }))}
                />
              ))}
            </div>

            <div className="grid gap-5 sm:grid-cols-[minmax(0,1.4fr)_220px_180px]">
              <div className="space-y-3">
                <label className="text-[0.95rem] font-semibold text-foreground">Description</label>
                <Input
                  value={draft.description}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, description: event.target.value }))
                  }
                  placeholder="What happened?"
                  className="h-13 rounded-[1.35rem] border-border/80 bg-background px-5"
                />
              </div>
              <div className="space-y-3">
                <label className="text-[0.95rem] font-semibold text-foreground">Amount</label>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={draft.amount}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, amount: event.target.value }))
                  }
                  placeholder="0.00"
                  className="h-13 rounded-[1.35rem] border-border/80 bg-background px-5"
                />
              </div>
              <div className="space-y-3">
                <label className="text-[0.95rem] font-semibold text-foreground">Date</label>
                <Input
                  type="date"
                  value={draft.date}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, date: event.target.value }))
                  }
                  className="h-13 rounded-[1.35rem] border-border/80 bg-background px-5"
                />
              </div>
            </div>

            {(draft.type === "income" || draft.type === "expense") && (
              <div className="space-y-3">
                <label className="text-[0.95rem] font-semibold text-foreground">Account</label>
                <Select
                  value={draft.accountId}
                  onValueChange={(value) => setDraft((current) => ({ ...current, accountId: value }))}
                >
                  <SelectTrigger className="h-13 rounded-[1.35rem] border-border/80 bg-background px-5">
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
            )}

            {draft.type === "transfer" && (
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-3">
                  <label className="text-[0.95rem] font-semibold text-foreground">From</label>
                  <Select
                    value={draft.sourceAccountId}
                    onValueChange={(value) =>
                      setDraft((current) => ({ ...current, sourceAccountId: value }))
                    }
                  >
                    <SelectTrigger className="h-13 rounded-[1.35rem] border-border/80 bg-background px-5">
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
                    <SelectTrigger className="h-13 rounded-[1.35rem] border-border/80 bg-background px-5">
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
                <div className="space-y-3">
                  <label className="text-[0.95rem] font-semibold text-foreground">Transfer fee</label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={draft.feeAmount}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, feeAmount: event.target.value }))
                    }
                    placeholder="0.00"
                    className="h-13 rounded-[1.35rem] border-border/80 bg-background px-5"
                  />
                  <p className="text-[0.78rem] text-muted-foreground">
                    Optional. The fee reduces the source account in addition to the transfer amount.
                  </p>
                </div>
              </div>
            )}

            {draft.type === "credit_payment" && (
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-3">
                  <label className="text-[0.95rem] font-semibold text-foreground">Payment account</label>
                  <Select
                    value={draft.sourceAccountId}
                    onValueChange={(value) =>
                      setDraft((current) => ({ ...current, sourceAccountId: value }))
                    }
                  >
                    <SelectTrigger className="h-13 rounded-[1.35rem] border-border/80 bg-background px-5">
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
                    <SelectTrigger className="h-13 rounded-[1.35rem] border-border/80 bg-background px-5">
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
                <div className="space-y-3">
                  <label className="text-[0.95rem] font-semibold text-foreground">Payment fee</label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={draft.feeAmount}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, feeAmount: event.target.value }))
                    }
                    placeholder="0.00"
                    className="h-13 rounded-[1.35rem] border-border/80 bg-background px-5"
                  />
                  <p className="text-[0.78rem] text-muted-foreground">
                    Optional. The fee reduces the payment account in addition to the amount paid.
                  </p>
                </div>
              </div>
            )}

            {draft.type === "loan_disbursement" && (
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-3">
                  <label className="text-[0.95rem] font-semibold text-foreground">Loan account</label>
                  <Select
                    value={draft.loanAccountId}
                    onValueChange={(value) =>
                      setDraft((current) => ({ ...current, loanAccountId: value }))
                    }
                  >
                    <SelectTrigger className="h-13 rounded-[1.35rem] border-border/80 bg-background px-5">
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
                    <SelectTrigger className="h-13 rounded-[1.35rem] border-border/80 bg-background px-5">
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
            )}

            <div className="space-y-3">
              <label className="text-[0.95rem] font-semibold text-foreground">Notes</label>
              <Input
                value={draft.notes}
                onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
                placeholder="Optional context"
                className="h-13 rounded-[1.35rem] border-border/80 bg-background px-5"
              />
            </div>

            <DialogFooter className="bg-transparent px-7 pb-7 pt-5 sm:px-8 sm:pb-8">
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                onClick={() => setOpen(false)}
                disabled={createEvent.isPending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="rounded-full bg-[#17393c] hover:bg-[#1d4a4d]"
                onClick={submitEvent}
                disabled={createEvent.isPending}
              >
                {createEvent.isPending ? "Recording..." : `Record ${currentTypeMeta.label.toLowerCase()}`}
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
        <DialogContent className="overflow-hidden rounded-[1.6rem] border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(251,250,246,0.95))] px-0 py-0 dark:border-white/8 dark:bg-[linear-gradient(180deg,rgba(24,33,35,0.98),rgba(18,27,29,0.98))] sm:max-w-lg">
          <DialogHeader className="border-b border-border/70 px-7 pb-5 pt-7 pr-16">
            <div className="inline-flex w-fit rounded-full border border-destructive/15 bg-destructive/5 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-destructive">
              Confirm delete
            </div>
            <DialogTitle className="pt-3 text-[1.7rem] tracking-tight text-[#10292B] dark:text-foreground">
              Remove this event?
            </DialogTitle>
            <DialogDescription className="max-w-md text-[0.95rem] leading-7">
              {deleteTarget
                ? `Delete "${deleteTarget.description}" from your ledger? This also removes the account effects recorded for it.`
                : "Delete this event from your ledger? This also removes the account effects recorded for it."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 px-7 py-6 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-full px-5"
              onClick={() => setDeleteTarget(null)}
              disabled={deleteEvent.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="h-11 rounded-full bg-destructive px-5 text-white hover:bg-destructive/90"
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
