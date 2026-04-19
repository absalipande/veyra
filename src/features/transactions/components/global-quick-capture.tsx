"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import {
  ArrowRightLeft,
  Landmark,
  Loader2,
  PiggyBank,
  Plus,
  Search,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import { formatCurrencyMiliunits } from "@/lib/currencies";
import { buildTransactionDisplayTitle } from "@/features/transactions/lib/display-title";
import {
  formatDateWithPreferences,
  resolveDatePreferences,
  type DatePreferences,
} from "@/features/settings/lib/date-format";
import type { AppRouter } from "@/server/api/root";
import { trpc } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type AccountItem = RouterOutputs["accounts"]["list"][number];
type CategoryItem = RouterOutputs["categories"]["list"][number];
type QuickCaptureIntent = "expense" | "income" | "transfer" | null;
type SupportedEventType = RouterOutputs["transactions"]["list"]["items"][number]["type"];


type ParsedQuickCapture = {
  amountMiliunits: number | null;
  budgetId: string | null;
  categoryId: string | null;
  dateLabel: string;
  dateValue: string;
  description: string | null;
  destinationAccountId: string | null;
  intent: QuickCaptureIntent;
  missing: Array<"amount" | "description" | "account" | "sourceAccount" | "destinationAccount" | "intent">;
  sourceAccountId: string | null;
};

const examplePrompts = [
  "spent 360 on lunch today",
  "received 2500 from client payment yesterday",
  "transferred 5000 from checking to wallet",
] as const;
const QUICK_CAPTURE_DRAFT_KEY = "veyra:quick-capture-draft";

function normalizeValue(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function toDateValue(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function findAccountMatch(phrase: string | null, accounts: AccountItem[]) {
  if (!phrase) return null;

  const normalizedPhrase = normalizeValue(phrase);
  if (!normalizedPhrase) return null;

  return (
    accounts.find((account) => {
      const normalizedName = normalizeValue(account.name);
      return normalizedName.includes(normalizedPhrase) || normalizedPhrase.includes(normalizedName);
    }) ?? null
  );
}

function findCategoryMatch(
  phrase: string | null,
  categories: CategoryItem[],
  kind: "expense" | "income"
) {
  if (!phrase) return null;

  const normalizedPhrase = normalizeValue(phrase);
  if (!normalizedPhrase) return null;

  return (
    categories.find((category) => {
      if (category.kind !== kind) return false;
      const normalizedName = normalizeValue(category.name);
      return (
        normalizedName === normalizedPhrase ||
        normalizedPhrase.includes(normalizedName) ||
        normalizedName.includes(normalizedPhrase)
      );
    }) ?? null
  );
}

function detectIntent(input: string): QuickCaptureIntent {
  const normalized = normalizeValue(input);

  if (/(transfer|transferred|move|moved)/.test(normalized)) return "transfer";
  if (/(receive|received|earned|salary|got paid)/.test(normalized)) return "income";
  if (/(pay|paid|spent|spend|bought|buy)/.test(normalized)) return "expense";

  return null;
}

function extractAmount(input: string) {
  const match = input.match(/(?:₱|php\s*)?(\d+(?:\.\d{1,2})?)/i);
  if (!match?.[1]) return null;

  const numeric = Number(match[1]);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;

  return Math.round(numeric * 1000);
}

function parseQuickCapture(
  input: string,
  accounts: AccountItem[],
  categories: CategoryItem[],
  datePreferences: DatePreferences
): ParsedQuickCapture {
  const normalized = input.trim();
  const lower = normalized.toLowerCase();
  const intent = detectIntent(normalized);
  const amountMiliunits = extractAmount(normalized);
  const isYesterday = /\byesterday\b/.test(lower);
  const dateValue = toDateValue(isYesterday ? -1 : 0);
  const dateLabel = isYesterday
    ? "Yesterday"
    : /\btoday\b/.test(lower)
      ? "Today"
      : formatDateWithPreferences(dateValue, datePreferences, "date-no-year");

  let description: string | null = null;
  let sourceAccountId: string | null = null;
  let destinationAccountId: string | null = null;
  let categoryId: string | null = null;

  if (intent === "transfer") {
    const transferMatch = normalized.match(/from\s+(.+?)\s+to\s+(.+?)(?:\s+(?:today|yesterday))?$/i);
    const sourcePhrase = transferMatch?.[1]?.trim() ?? null;
    const destinationPhrase = transferMatch?.[2]?.trim() ?? null;

    sourceAccountId = findAccountMatch(sourcePhrase, accounts)?.id ?? null;
    destinationAccountId = findAccountMatch(destinationPhrase, accounts)?.id ?? null;
    const sourceAccountName = sourceAccountId
      ? accounts.find((account) => account.id === sourceAccountId)?.name ?? null
      : null;
    const destinationAccountName = destinationAccountId
      ? accounts.find((account) => account.id === destinationAccountId)?.name ?? null
      : null;

    description = buildTransactionDisplayTitle({
      type: "transfer",
      description: normalized,
      sourceAccountName,
      destinationAccountName,
    });
  } else {
    const descriptionMatch = normalized.match(/\bfor\s+(.+?)(?:\s+(?:today|yesterday))?$/i);
    if (descriptionMatch?.[1]) {
      description = descriptionMatch[1].trim();
    } else {
      const cleaned = normalized
        .replace(/(?:₱|php\s*)?\d+(?:\.\d{1,2})?/i, "")
        .replace(/\b(today|yesterday)\b/gi, "")
        .replace(/\b(paid|pay|spent|spend|bought|buy|received|receive|earned|got paid)\b/gi, "")
        .replace(/\bfor\b/gi, "")
        .replace(/\s+/g, " ")
        .trim();

      description = cleaned || (intent === "expense" ? "Expense" : intent === "income" ? "Income" : null);
    }

    const accountPhrase =
      normalized.match(/\b(?:using|via)\s+(.+?)(?:\s+(?:today|yesterday))?$/i)?.[1]?.trim() ?? null;

    const matchedAccount = findAccountMatch(accountPhrase, accounts);
    sourceAccountId = matchedAccount?.id ?? null;

    if (intent === "expense" || intent === "income") {
      description = buildTransactionDisplayTitle({
        type: intent,
        description,
      });
      categoryId = findCategoryMatch(description, categories, intent)?.id ?? null;
    }
  }

  const missing: ParsedQuickCapture["missing"] = [];

  if (!intent) missing.push("intent");
  if (!amountMiliunits) missing.push("amount");
  if (!description) missing.push("description");

  if (intent === "transfer") {
    if (!sourceAccountId) missing.push("sourceAccount");
    if (!destinationAccountId) missing.push("destinationAccount");
  } else if (intent === "expense" || intent === "income") {
    if (!sourceAccountId) missing.push("account");
  }

  return {
    amountMiliunits,
    budgetId: null,
    categoryId,
    dateLabel,
    dateValue,
    description,
    destinationAccountId,
    intent,
    missing,
    sourceAccountId,
  };
}

function getIntentMeta(intent: QuickCaptureIntent | SupportedEventType) {
  switch (intent) {
    case "expense":
      return { icon: TrendingDown, label: "Expense" };
    case "income":
      return { icon: TrendingUp, label: "Income" };
    case "transfer":
      return { icon: ArrowRightLeft, label: "Transfer" };
    case "credit_payment":
      return { icon: Landmark, label: "Credit payment" };
    case "loan_disbursement":
      return { icon: Wallet, label: "Loan disbursement" };
    default:
      return { icon: Search, label: "Unclear" };
  }
}

export function GlobalQuickCapture() {
  const utils = trpc.useUtils();
  const accountsQuery = trpc.accounts.list.useQuery(undefined, { enabled: false });
  const budgetsQuery = trpc.budgets.list.useQuery(undefined, { enabled: false });
  const categoriesQuery = trpc.categories.list.useQuery(undefined, { enabled: false });
  const createEvent = trpc.transactions.create.useMutation({
    onSuccess: async (_, variables) => {
      await Promise.all([
        utils.transactions.list.invalidate(),
        utils.transactions.summary.invalidate(),
        utils.accounts.list.invalidate(),
        utils.accounts.summary.invalidate(),
        utils.budgets.list.invalidate(),
        utils.budgets.summary.invalidate(),
        utils.ai.dashboardInsight.invalidate(),
        utils.ai.transactionsInsight.invalidate(),
        utils.ai.budgetsInsight.invalidate(),
      ]);
      toast.success(`${getIntentMeta(variables.type).label} recorded.`);
      setOpen(false);
      setInput("");
      window.localStorage.removeItem(QUICK_CAPTURE_DRAFT_KEY);
      setSelectedAccountId("");
      setSelectedBudgetId("");
      setSelectedCategoryId("");
      setSelectedSourceAccountId("");
      setSelectedDestinationAccountId("");
    },
    onError: (error) => {
      toast.error(error.message || "Could not record quick capture.");
    },
  });

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [selectedBudgetId, setSelectedBudgetId] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [selectedSourceAccountId, setSelectedSourceAccountId] = useState("");
  const [selectedDestinationAccountId, setSelectedDestinationAccountId] = useState("");
  const deferredInput = useDeferredValue(input.trim());

  const aiDraftQuery = trpc.ai.quickCaptureDraft.useQuery(
    { text: deferredInput },
    {
      enabled: open && deferredInput.length >= 3,
      staleTime: 20_000,
      retry: false,
    },
  );

  const accounts = useMemo(() => accountsQuery.data ?? [], [accountsQuery.data]);
  const categories = useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data]);
  const settingsQuery = trpc.settings.get.useQuery();
  const datePreferences = useMemo(
    () => resolveDatePreferences(settingsQuery.data),
    [settingsQuery.data]
  );

  useEffect(() => {
    const storedDraft = window.localStorage.getItem(QUICK_CAPTURE_DRAFT_KEY);
    if (storedDraft) {
      setInput(storedDraft);
    }
  }, []);

  useEffect(() => {
    if (!input.trim()) {
      window.localStorage.removeItem(QUICK_CAPTURE_DRAFT_KEY);
      return;
    }

    window.localStorage.setItem(QUICK_CAPTURE_DRAFT_KEY, input);
  }, [input]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    void accountsQuery.refetch();
    void budgetsQuery.refetch();
    void categoriesQuery.refetch();
  }, [open, accountsQuery, budgetsQuery, categoriesQuery]);

  const liquidAccounts = useMemo(
    () => accounts.filter((account) => account.type === "cash" || account.type === "wallet"),
    [accounts],
  );
  const spendableAccounts = useMemo(
    () => accounts.filter((account) => account.type === "cash" || account.type === "wallet" || account.type === "credit"),
    [accounts],
  );
  const parsed = useMemo(() => {
    const localDraft = parseQuickCapture(input, accounts, categories, datePreferences);
    const aiDraft = aiDraftQuery.data;
    if (!aiDraft) return localDraft;

    return {
      amountMiliunits: aiDraft.amountMiliunits,
      budgetId: aiDraft.budgetId,
      categoryId: aiDraft.categoryId,
      dateLabel:
        aiDraft.dateValue === toDateValue()
          ? "Today"
          : aiDraft.dateValue === toDateValue(-1)
            ? "Yesterday"
            : formatDateWithPreferences(aiDraft.dateValue, datePreferences, "date-no-year"),
      dateValue: aiDraft.dateValue,
      description: aiDraft.description,
      destinationAccountId: aiDraft.destinationAccountId,
      intent: aiDraft.intent,
      missing: aiDraft.missing,
      sourceAccountId: aiDraft.sourceAccountId,
    } satisfies ParsedQuickCapture;
  }, [input, accounts, categories, datePreferences, aiDraftQuery.data]);
  const activeBudgetOptions = useMemo(
    () =>
      (budgetsQuery.data ?? [])
        .filter((budget) => budget.isActive)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [budgetsQuery.data],
  );
  const relevantCategoryOptions = useMemo(
    () =>
      parsed.intent === "expense" || parsed.intent === "income"
        ? categories
            .filter((category) => category.kind === parsed.intent)
            .sort((a, b) => a.name.localeCompare(b.name))
        : [],
    [categories, parsed.intent]
  );
  const intentMeta = getIntentMeta(parsed.intent);
  const IntentIcon = intentMeta.icon;
  const relevantAccountOptions =
    parsed.intent === "expense" ? spendableAccounts : parsed.intent === "income" ? liquidAccounts : liquidAccounts;

  useEffect(() => {
    setSelectedAccountId(parsed.sourceAccountId ?? "");
    setSelectedBudgetId(parsed.budgetId ?? "");
    setSelectedCategoryId(parsed.categoryId ?? "");
    setSelectedSourceAccountId(parsed.sourceAccountId ?? "");
    setSelectedDestinationAccountId(parsed.destinationAccountId ?? "");
  }, [
    parsed.sourceAccountId,
    parsed.destinationAccountId,
    parsed.categoryId,
    parsed.budgetId,
    parsed.intent,
  ]);

  const canSubmit =
    parsed.intent === "expense" || parsed.intent === "income"
      ? Boolean(parsed.amountMiliunits && parsed.description && selectedAccountId)
      : parsed.intent === "transfer"
        ? Boolean(parsed.amountMiliunits && selectedSourceAccountId && selectedDestinationAccountId)
        : false;
  const isSubmitting = createEvent.isPending;

  const submit = () => {
    if (!canSubmit || !parsed.amountMiliunits) return;

    const date = new Date(`${parsed.dateValue}T12:00:00`);

    if (parsed.intent === "expense" || parsed.intent === "income") {
      createEvent.mutate({
        type: parsed.intent,
        accountId: selectedAccountId,
        amount: parsed.amountMiliunits,
        budgetId: parsed.intent === "expense" && selectedBudgetId ? selectedBudgetId : undefined,
        categoryId: selectedCategoryId || undefined,
        date,
        description: parsed.description ?? intentMeta.label,
        notes: "",
      });
      return;
    }

    if (parsed.intent === "transfer") {
      createEvent.mutate({
        type: "transfer",
        sourceAccountId: selectedSourceAccountId,
        destinationAccountId: selectedDestinationAccountId,
        amount: parsed.amountMiliunits,
        feeAmount: 0,
        date,
        description: parsed.description ?? "Transfer",
        notes: "",
      });
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="rounded-full border-border/70 bg-white/84 px-3.5 text-[0.9rem] shadow-[0_18px_40px_-35px_rgba(10,31,34,0.22)] hover:bg-white dark:bg-[#182123] dark:hover:bg-[#1d2729] lg:px-4"
        onClick={() => setOpen(true)}
      >
        <Plus className="size-4" />
        <span className="hidden sm:inline">Quick capture</span>
      </Button>

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (isSubmitting && !nextOpen) return;
          setOpen(nextOpen);
        }}
      >
        <DialogContent
          onCloseAutoFocus={(event) => event.preventDefault()}
          className="max-h-[calc(88dvh-env(safe-area-inset-top))] w-[min(92vw,36rem)] overflow-x-hidden overflow-y-auto rounded-[1.35rem] border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.985),rgba(255,255,255,0.985))] px-0 py-0 dark:border-white/8 dark:bg-[linear-gradient(180deg,rgba(24,33,35,0.985),rgba(18,27,29,0.985))] sm:max-h-[92vh] sm:w-auto sm:max-w-[35rem] sm:rounded-[2rem]"
        >
          <DialogHeader className="border-b border-border/70 px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] pr-14 sm:px-6 sm:pb-5 sm:pt-5.5 sm:pr-16">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex w-fit rounded-full border border-[#17393c]/10 bg-[#17393c]/5 px-3 py-1 text-[0.64rem] font-semibold uppercase tracking-[0.18em] text-[#17393c] dark:border-white/8 dark:bg-white/6 dark:text-primary">
                Quick capture
              </div>
              <div className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[0.68rem] font-medium text-sky-700 dark:border-sky-500/25 dark:bg-sky-500/10 dark:text-sky-200">
                AI assist
              </div>
              <div className="hidden rounded-full border border-border/70 bg-white px-2.5 py-1 text-[0.68rem] font-medium text-muted-foreground sm:inline-flex">
                ⌘/Ctrl ⇧ K
              </div>
            </div>
            <DialogTitle className="pt-2 text-[1.22rem] tracking-tight sm:pt-2.5 sm:text-[1.62rem]">
              Record money in one line
            </DialogTitle>
            <DialogDescription className="max-w-xl text-[0.88rem] leading-6 sm:text-[0.9rem]">
              Type one sentence and Veyra will turn it into a draft before anything is saved.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 px-4 py-4 sm:space-y-4 sm:px-6 sm:py-5">
            <div className="space-y-3">
              <div className="flex h-12 items-center rounded-[1rem] border-2 border-[#7fb9b6]/85 bg-white px-4 dark:bg-[#141d1f]">
                <Search className="mr-3 size-4 shrink-0 text-muted-foreground" />
                <Input
                  autoFocus
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="Describe a transaction in one sentence"
                  disabled={isSubmitting}
                  className="h-auto border-0 bg-transparent px-0 py-0 text-[0.95rem] leading-[1.25] shadow-none placeholder:text-muted-foreground/90 focus-visible:border-0 focus-visible:ring-0 focus-visible:ring-offset-0 dark:bg-transparent"
                />
              </div>
              {input.trim() ? (
                <div className="flex flex-wrap items-center gap-2 text-[0.76rem]">
                  {aiDraftQuery.isFetching ? (
                    <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 font-medium text-sky-700 dark:border-sky-500/25 dark:bg-sky-500/10 dark:text-sky-200">
                      AI is preparing draft
                    </span>
                  ) : aiDraftQuery.data ? (
                    <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 font-medium text-sky-700 dark:border-sky-500/25 dark:bg-sky-500/10 dark:text-sky-200">
                      AI ready · {aiDraftQuery.data.confidence} confidence
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 font-medium text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200">
                      Parser fallback active
                    </span>
                  )}
                  <span className="text-muted-foreground">
                    Draft is kept if you close this modal.
                  </span>
                </div>
              ) : null}
            </div>

            {input.trim() ? (
              <div className="space-y-4">
                <div className="rounded-[1.25rem] border border-border/70 bg-white px-4 py-4 dark:bg-[#162022]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`flex size-10 items-center justify-center rounded-full ${
                        parsed.intent === "income"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200"
                          : parsed.intent === "expense"
                            ? "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200"
                            : parsed.intent === "transfer"
                              ? "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-200"
                              : "bg-muted text-muted-foreground"
                      }`}>
                        <IntentIcon className="size-4" />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2 text-[0.82rem] text-muted-foreground">
                          <span className="font-medium text-foreground">{intentMeta.label}</span>
                          <span>{parsed.dateLabel}</span>
                          {parsed.missing.length === 0 ? (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[0.72rem] font-medium text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200">
                              Looks good
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-2 text-[1.55rem] font-semibold tracking-tight text-[#10292B] dark:text-foreground">
                          {parsed.amountMiliunits ? formatCurrencyMiliunits(parsed.amountMiliunits, "PHP") : "Amount needed"}
                        </p>
                        <p className="mt-1 text-[0.88rem] leading-6 text-muted-foreground">
                          {parsed.description ?? "Add a clearer description so the draft can be prepared."}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 space-y-0 border-t border-border/70">
                    {parsed.intent === "transfer" ? (
                      <>
                        <div className="flex items-center justify-between gap-3 py-3 text-[0.84rem]">
                          <span className="text-muted-foreground">From</span>
                          <span className="font-medium text-foreground">
                            {accounts.find((account) => account.id === selectedSourceAccountId)?.name ?? "Choose source account"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-3 border-t border-border/70 py-3 text-[0.84rem]">
                          <span className="text-muted-foreground">To</span>
                          <span className="font-medium text-foreground">
                            {accounts.find((account) => account.id === selectedDestinationAccountId)?.name ?? "Choose destination account"}
                          </span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center justify-between gap-3 py-3 text-[0.84rem]">
                          <span className="text-muted-foreground">Account</span>
                          <span className="font-medium text-foreground">
                            {accounts.find((account) => account.id === selectedAccountId)?.name ?? "Choose account"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-3 border-t border-border/70 py-3 text-[0.84rem]">
                          <span className="text-muted-foreground">Category</span>
                          <span className="font-medium text-foreground">
                            {categories.find((category) => category.id === selectedCategoryId)?.name ?? "No category yet"}
                          </span>
                        </div>
                        {parsed.intent === "expense" ? (
                          <div className="flex items-center justify-between gap-3 border-t border-border/70 py-3 text-[0.84rem]">
                            <span className="text-muted-foreground">Budget</span>
                            <span className="font-medium text-foreground">
                              {activeBudgetOptions.find((budget) => budget.id === selectedBudgetId)?.name ??
                                "No budget"}
                            </span>
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>

                {(parsed.intent === "expense" || parsed.intent === "income") && (
                  <div className="grid gap-4 md:grid-cols-[1.15fr_0.85fr] md:items-start">
                    <div className="h-fit space-y-3 rounded-[1.2rem] border border-border/70 bg-white px-4 py-4 dark:bg-[#162022]">
                      <div className="flex items-center gap-2 text-[0.88rem] font-medium text-foreground">
                        <Landmark className="size-4 text-primary" />
                        Account
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {relevantAccountOptions.slice(0, 3).map((account) => (
                          <Button
                            key={account.id}
                            type="button"
                            size="sm"
                            variant={selectedAccountId === account.id ? "default" : "outline"}
                            className="max-w-full rounded-full"
                            onClick={() => setSelectedAccountId(account.id)}
                            disabled={isSubmitting}
                          >
                            <span className="max-w-[11rem] truncate">{account.name}</span>
                          </Button>
                        ))}
                      </div>
                      <Select value={selectedAccountId} onValueChange={setSelectedAccountId} disabled={isSubmitting}>
                        <SelectTrigger className="h-11 rounded-[1rem] border-border/80 bg-background px-4">
                          <SelectValue placeholder="Choose account" />
                        </SelectTrigger>
                        <SelectContent>
                          {relevantAccountOptions.map((account) => (
                            <SelectItem key={account.id} value={account.id}>
                              {account.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {parsed.intent === "expense" ? (
                        <div className="space-y-3 border-t border-border/70 pt-3">
                          <div className="flex items-center gap-2 text-[0.88rem] font-medium text-foreground">
                            <PiggyBank className="size-4 text-primary" />
                            Budget
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {activeBudgetOptions.slice(0, 4).map((budget) => (
                              <Button
                                key={budget.id}
                                type="button"
                                size="sm"
                                variant={selectedBudgetId === budget.id ? "default" : "outline"}
                                className="max-w-full rounded-full"
                                onClick={() => setSelectedBudgetId(budget.id)}
                                disabled={isSubmitting}
                              >
                                <span className="max-w-[10rem] truncate">{budget.name}</span>
                              </Button>
                            ))}
                          </div>
                          <Select
                            value={selectedBudgetId || "none"}
                            onValueChange={(value) => setSelectedBudgetId(value === "none" ? "" : value)}
                            disabled={isSubmitting}
                          >
                            <SelectTrigger className="h-11 rounded-[1rem] border-border/80 bg-background px-4">
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

                    <div className="h-fit space-y-4 rounded-[1.2rem] border border-border/70 bg-white px-4 py-4 dark:bg-[#162022]">
                      <div className="flex items-center gap-2 text-[0.88rem] font-medium text-foreground">
                        <Wallet className="size-4 text-primary" />
                        Category
                      </div>

                      <div className="space-y-3">
                        <div className="flex flex-wrap gap-2">
                          {relevantCategoryOptions.slice(0, 4).map((category) => (
                            <Button
                              key={category.id}
                              type="button"
                              size="sm"
                              variant={selectedCategoryId === category.id ? "default" : "outline"}
                              className="rounded-full"
                              onClick={() => setSelectedCategoryId(category.id)}
                              disabled={isSubmitting}
                            >
                              {category.name}
                            </Button>
                          ))}
                        </div>
                        <Select
                          value={selectedCategoryId || "none"}
                          onValueChange={(value) => setSelectedCategoryId(value === "none" ? "" : value)}
                          disabled={isSubmitting}
                        >
                          <SelectTrigger className="h-11 rounded-[1rem] border-border/80 bg-background px-4">
                            <SelectValue placeholder="No category" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No category</SelectItem>
                            {relevantCategoryOptions.map((category) => (
                              <SelectItem key={category.id} value={category.id}>
                                {category.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                    </div>
                  </div>
                )}

                {parsed.intent === "transfer" && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-3 rounded-[1.2rem] border border-border/70 bg-white px-4 py-4 dark:bg-[#162022]">
                      <div className="flex items-center gap-2 text-[0.88rem] font-medium text-foreground">
                        <Wallet className="size-4 text-primary" />
                        From
                      </div>
                      <Select value={selectedSourceAccountId} onValueChange={setSelectedSourceAccountId} disabled={isSubmitting}>
                        <SelectTrigger className="h-11 rounded-[1rem] border-border/80 bg-background px-4">
                          <SelectValue placeholder="Source account" />
                        </SelectTrigger>
                        <SelectContent>
                          {liquidAccounts.map((account) => (
                            <SelectItem key={account.id} value={account.id}>
                              {account.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-3 rounded-[1.2rem] border border-border/70 bg-white px-4 py-4 dark:bg-[#162022]">
                      <div className="flex items-center gap-2 text-[0.88rem] font-medium text-foreground">
                        <ArrowRightLeft className="size-4 text-primary" />
                        To
                      </div>
                      <Select value={selectedDestinationAccountId} onValueChange={setSelectedDestinationAccountId} disabled={isSubmitting}>
                        <SelectTrigger className="h-11 rounded-[1rem] border-border/80 bg-background px-4">
                          <SelectValue placeholder="Destination account" />
                        </SelectTrigger>
                        <SelectContent>
                          {liquidAccounts.map((account) => (
                            <SelectItem key={account.id} value={account.id}>
                              {account.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {!parsed.intent ? (
                  <div className="rounded-[1.1rem] border border-dashed border-border/70 bg-background/76 px-4 py-4 text-[0.86rem] leading-6 text-muted-foreground dark:bg-[#162022]">
                    Start with an action like <span className="font-medium text-foreground">spent</span>, <span className="font-medium text-foreground">received</span>, or <span className="font-medium text-foreground">transferred</span>.
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="rounded-[1.2rem] border border-border/70 bg-white px-4 py-4 dark:bg-[#162022]">
                <p className="text-[0.78rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Example entries
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {examplePrompts.map((prompt) => (
                    <Button
                      key={`empty-${prompt}`}
                      type="button"
                      size="sm"
                      variant="outline"
                      className="rounded-full border-border/70 bg-white px-3 text-[0.8rem] font-normal shadow-none"
                      onClick={() => setInput(prompt)}
                      disabled={isSubmitting}
                    >
                      {prompt}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="!mx-0 !mb-0 border-t border-border/60 bg-white px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:pt-3 sm:pb-4">
            <div className="flex w-full flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
              <Button
                type="button"
                variant="outline"
                className="h-10.5 w-full rounded-full bg-white px-6 text-foreground/88 sm:min-w-[9rem] sm:w-auto"
                onClick={() => setOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="h-10.5 w-full rounded-full bg-[#17393c] px-6 text-[0.94rem] text-white hover:bg-[#1d4a4d] hover:text-white disabled:opacity-65 disabled:text-white/85 sm:min-w-[12.5rem] sm:w-auto"
                onClick={submit}
                disabled={!canSubmit || isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Recording...
                  </>
                ) : parsed.intent ? (
                  `Record ${intentMeta.label.toLowerCase()}`
                ) : (
                  "Record"
                )}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
