"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import {
  ArrowRightLeft,
  CalendarDays,
  Landmark,
  Loader2,
  PiggyBank,
  Plus,
  Search,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
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
import { Sheet, SheetContent } from "@/components/ui/sheet";

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
        utils.ai.accountsInsight.invalidate(),
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
      setSelectedDateValue("");
      setDateManuallyChanged(false);
      setOverrideIntent(null);
      setConfirmedDraftKey(null);
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
  const [selectedDateValue, setSelectedDateValue] = useState("");
  const [dateManuallyChanged, setDateManuallyChanged] = useState(false);
  const [overrideIntent, setOverrideIntent] = useState<Exclude<QuickCaptureIntent, null> | null>(null);
  const [confirmedDraftKey, setConfirmedDraftKey] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
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
    if (typeof window === "undefined") return;

    const media = window.matchMedia("(max-width: 639px)");
    const onChange = () => setIsMobile(media.matches);
    onChange();
    media.addEventListener("change", onChange);

    return () => media.removeEventListener("change", onChange);
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
  const activeIntent = overrideIntent ?? parsed.intent;
  const relevantCategoryOptions = useMemo(
    () =>
      activeIntent === "expense" || activeIntent === "income"
        ? categories
            .filter((category) => category.kind === activeIntent)
            .sort((a, b) => a.name.localeCompare(b.name))
        : [],
    [categories, activeIntent]
  );
  const intentMeta = getIntentMeta(activeIntent);
  const IntentIcon = intentMeta.icon;
  const relevantAccountOptions =
    activeIntent === "expense" ? spendableAccounts : activeIntent === "income" ? liquidAccounts : liquidAccounts;

  useEffect(() => {
    setSelectedAccountId(parsed.sourceAccountId ?? "");
    setSelectedBudgetId(parsed.budgetId ?? "");
    setSelectedCategoryId(parsed.categoryId ?? "");
    setSelectedSourceAccountId(parsed.sourceAccountId ?? "");
    setSelectedDestinationAccountId(parsed.destinationAccountId ?? "");
    if (!dateManuallyChanged) {
      setSelectedDateValue(parsed.dateValue);
    }
  }, [
    parsed.sourceAccountId,
    parsed.destinationAccountId,
    parsed.categoryId,
    parsed.budgetId,
    parsed.intent,
    parsed.dateValue,
    dateManuallyChanged,
  ]);

  const canSubmit =
    activeIntent === "expense" || activeIntent === "income"
      ? Boolean(parsed.amountMiliunits && parsed.description && selectedAccountId)
      : activeIntent === "transfer"
        ? Boolean(parsed.amountMiliunits && selectedSourceAccountId && selectedDestinationAccountId)
        : false;
  const isLowConfidenceDraft = aiDraftQuery.data?.confidence === "low";
  const selectedDateLabel = formatDateWithPreferences(
    selectedDateValue || parsed.dateValue,
    datePreferences,
    "date-no-year"
  );
  const selectedAccountName =
    accounts.find((account) => account.id === selectedAccountId)?.name ?? "Choose account";
  const selectedSourceAccountName =
    accounts.find((account) => account.id === selectedSourceAccountId)?.name ?? "Choose source";
  const selectedDestinationAccountName =
    accounts.find((account) => account.id === selectedDestinationAccountId)?.name ??
    "Choose destination";
  const selectedCategoryName =
    categories.find((category) => category.id === selectedCategoryId)?.name ?? "No category";
  const selectedBudgetName =
    activeBudgetOptions.find((budget) => budget.id === selectedBudgetId)?.name ?? "No budget";
  const previewMetaGridClass =
    activeIntent === "expense"
      ? "grid h-full grid-cols-2 overflow-hidden rounded-lg border border-border/60 text-[0.68rem] sm:border-0"
      : "grid h-full grid-cols-1 overflow-hidden rounded-lg border border-border/60 text-[0.68rem] sm:grid-cols-3 sm:border-0";
  const detailGridClass =
    activeIntent === "expense" ? "grid gap-3 sm:grid-cols-2" : "grid gap-3 sm:grid-cols-3";
  const draftReviewKey = [
    activeIntent ?? "none",
    parsed.amountMiliunits ?? "none",
    parsed.description ?? "none",
    selectedAccountId || parsed.sourceAccountId || "none",
    selectedSourceAccountId || "none",
    selectedDestinationAccountId || "none",
    selectedCategoryId || "none",
    selectedBudgetId || "none",
    selectedDateValue || parsed.dateValue,
  ].join("|");
  const lowConfidenceConfirmed = confirmedDraftKey === draftReviewKey;
  const isSubmitting = createEvent.isPending;

  const updateInput = (value: string) => {
    setInput(value);
    setConfirmedDraftKey(null);
    setOverrideIntent(null);
    if (!value.trim()) {
      setSelectedDateValue("");
      setDateManuallyChanged(false);
    }
  };

  const chooseIntent = (intent: Exclude<QuickCaptureIntent, null>) => {
    const intentChanged = intent !== activeIntent;
    setOverrideIntent(intent);
    setConfirmedDraftKey(null);
    if (intentChanged) {
      setSelectedCategoryId("");
    }
    if (intent !== "expense") {
      setSelectedBudgetId("");
    }
  };

  const Surface = isMobile ? SheetContent : DialogContent;
  const Root = isMobile ? Sheet : Dialog;
  const surfaceProps = isMobile
    ? {
        side: "bottom" as const,
        showCloseButton: false,
        className:
          "h-[84dvh] rounded-t-[1.15rem] border border-border/70 bg-card p-0",
      }
    : {
        mobileBehavior: "modal" as const,
        className:
          "max-h-[80vh] w-[calc(100vw-1rem)] overflow-hidden rounded-[1.25rem] border-border/70 bg-card p-0 sm:max-w-[46rem]",
      };

  const submit = () => {
    if (!canSubmit || !parsed.amountMiliunits) return;
    if (isLowConfidenceDraft && !lowConfidenceConfirmed) {
      toast.warning("Low-confidence draft", {
        description: "Review the fields, then confirm once before recording this transaction.",
      });
      return;
    }

    const transactionDateValue = selectedDateValue || parsed.dateValue;
    const date = new Date(`${transactionDateValue}T12:00:00`);

    if (activeIntent === "expense" || activeIntent === "income") {
      createEvent.mutate({
        type: activeIntent,
        accountId: selectedAccountId,
        amount: parsed.amountMiliunits,
        budgetId: activeIntent === "expense" && selectedBudgetId ? selectedBudgetId : undefined,
        categoryId: selectedCategoryId || undefined,
        date,
        description: parsed.description ?? intentMeta.label,
        notes: "",
      });
      return;
    }

    if (activeIntent === "transfer") {
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

      <Root
        open={open}
        onOpenChange={(nextOpen) => {
          if (isSubmitting && !nextOpen) return;
          setOpen(nextOpen);
          if (!nextOpen) {
            setConfirmedDraftKey(null);
          }
        }}
      >
        <Surface
          onCloseAutoFocus={(event) => event.preventDefault()}
          {...surfaceProps}
        >
          <div className="mx-auto mt-2 h-1.5 w-12 shrink-0 rounded-full bg-border sm:hidden" />
          <div className={isMobile ? "h-[calc(84dvh-0.5rem)] overflow-y-auto" : "contents"}>
          <DialogHeader className="shrink-0 border-b border-border/70 px-4 pb-3 pt-3 pr-14 sm:px-5 sm:pb-3.5 sm:pt-4 sm:pr-16">
            <div className="flex items-center gap-2">
              <DialogTitle className="text-[1.02rem] tracking-tight sm:text-[1.12rem]">
                Quick capture
              </DialogTitle>
              <div className="inline-flex h-7 items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 text-[0.66rem] font-medium text-sky-700 dark:border-sky-500/25 dark:bg-sky-500/10 dark:text-sky-200">
                Veyra assist
              </div>
              <div className="keyboard-hint ml-auto hidden h-7 items-center rounded-full border border-border/70 bg-white px-2.5 text-[0.66rem] font-medium text-muted-foreground sm:inline-flex">
                ⌘/Ctrl ⇧ K
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="absolute right-4 top-3 rounded-full border border-border/70 bg-white text-muted-foreground hover:text-foreground sm:hidden"
                onClick={() => setOpen(false)}
                disabled={isSubmitting}
              >
                <X className="size-4" />
                <span className="sr-only">Close quick capture</span>
              </Button>
            </div>
            <DialogDescription className="max-w-xl text-[0.8rem] leading-5 sm:text-[0.82rem]">
              Record one transaction. Review the draft before saving.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 px-4 py-3.5 sm:min-h-0 sm:flex-1 sm:overflow-y-auto sm:px-5 sm:py-4">
            <div className="space-y-2.5">
              <div className="flex h-11 items-center rounded-xl border border-border/80 bg-white px-3 transition-colors focus-within:border-[#7fb9b6] focus-within:ring-2 focus-within:ring-[#7fb9b6]/20 dark:bg-[#141d1f]">
                <Search className="mr-2.5 size-4 shrink-0 text-muted-foreground sm:mr-3" />
                <Input
                  autoFocus
                  value={input}
                  onChange={(event) => updateInput(event.target.value)}
                  placeholder="Describe a transaction in one sentence"
                  disabled={isSubmitting}
                  className="h-10 min-w-0 flex-1 rounded-none border-0 bg-transparent px-0 py-0 text-[0.86rem] leading-[1.25] shadow-none outline-none placeholder:text-muted-foreground/90 focus-visible:border-0 focus-visible:ring-0 focus-visible:ring-offset-0 dark:bg-transparent"
                />
                {input.trim() ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="ml-2 size-7 shrink-0 rounded-full text-muted-foreground hover:bg-muted"
                    onClick={() => updateInput("")}
                    disabled={isSubmitting}
                  >
                    <X className="size-4" />
                    <span className="sr-only">Clear quick capture input</span>
                  </Button>
                ) : null}
              </div>
              {input.trim() ? (
                <div className="flex flex-wrap items-center gap-2 text-[0.76rem]">
                  {aiDraftQuery.isFetching ? (
                    <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-2.5 text-[0.68rem] font-medium text-sky-700 dark:border-sky-500/25 dark:bg-sky-500/10 dark:text-sky-200">
                      <Loader2 className="size-3 animate-spin" />
                      Preparing draft
                    </span>
                  ) : aiDraftQuery.data ? (
                    <span className="inline-flex h-6 items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 text-[0.68rem] font-medium text-sky-700 dark:border-sky-500/25 dark:bg-sky-500/10 dark:text-sky-200">
                      Veyra ready · {aiDraftQuery.data.confidence} confidence
                    </span>
                  ) : (
                    <span className="inline-flex h-6 items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 text-[0.68rem] font-medium text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200">
                      Parser fallback active
                    </span>
                  )}
                  <span className="text-[0.72rem] text-muted-foreground">
                    Draft is kept if you close this modal.
                  </span>
                </div>
              ) : null}

              {input.trim() && isLowConfidenceDraft ? (
                <div className="rounded-[0.9rem] border border-amber-200 bg-amber-50 px-3 py-2 text-[0.78rem] text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200">
                  <p>
                    Veyra confidence is low. Please verify amount, account, category, and budget before
                    recording.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant={lowConfidenceConfirmed ? "default" : "outline"}
                    className="mt-2 h-8 rounded-full"
                    onClick={() =>
                      setConfirmedDraftKey((current) =>
                        current === draftReviewKey ? null : draftReviewKey
                      )
                    }
                    disabled={isSubmitting}
                  >
                    {lowConfidenceConfirmed ? "Confirmed" : "Confirm draft"}
                  </Button>
                </div>
              ) : null}

              {input.trim() ? (
                <div className="grid grid-cols-3 gap-1 rounded-xl border border-border/70 bg-muted/40 p-1">
                  {(["expense", "income", "transfer"] as const).map((intent) => {
                    const optionMeta = getIntentMeta(intent);
                    const OptionIcon = optionMeta.icon;
                    const isSelected = activeIntent === intent;

                    return (
                      <Button
                        key={intent}
                        type="button"
                        variant={isSelected ? "default" : "ghost"}
                        className={`h-8 rounded-lg px-2 text-[0.74rem] font-semibold ${
                          isSelected
                            ? "bg-[#0f766e] text-white shadow-none ring-1 ring-[#0f766e]/20 hover:bg-[#0d615a] hover:text-white"
                            : "text-muted-foreground hover:bg-white hover:text-foreground"
                        }`}
                        onClick={() => chooseIntent(intent)}
                        disabled={isSubmitting}
                      >
                        <OptionIcon className="size-3.5" />
                        <span>{optionMeta.label}</span>
                      </Button>
                    );
                  })}
                </div>
              ) : null}
            </div>

            {input.trim() ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-border/70 bg-white px-3.5 py-3.5 dark:bg-[#162022]">
                  <div className="grid gap-4 sm:grid-cols-[minmax(0,0.95fr)_minmax(18rem,1.05fr)] sm:items-stretch">
                    <div className="flex min-w-0 items-center gap-3">
                      <div
                        className={`flex size-10 shrink-0 items-center justify-center rounded-full ${
                          activeIntent === "income"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200"
                            : activeIntent === "expense"
                              ? "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200"
                              : activeIntent === "transfer"
                                ? "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-200"
                                : "bg-muted text-muted-foreground"
                        }`}
                      >
                        <IntentIcon className="size-4.5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 text-[0.72rem] text-muted-foreground">
                          <span className="font-semibold text-foreground">{intentMeta.label}</span>
                          <span>·</span>
                          <span>{selectedDateLabel}</span>
                          {parsed.missing.length === 0 ? (
                            <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[0.64rem] font-medium text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200">
                              Looks ok
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-[1.08rem] font-semibold tracking-tight text-[#10292B] dark:text-foreground sm:text-[1.14rem]">
                          {parsed.amountMiliunits
                            ? formatCurrencyMiliunits(parsed.amountMiliunits, "PHP")
                            : "Amount needed"}
                        </p>
                        <p className="mt-0.5 truncate text-[0.78rem] text-muted-foreground">
                          {parsed.description ?? "Add a clearer description."}
                        </p>
                      </div>
                    </div>
                    <div className={previewMetaGridClass}>
                      <div
                        className={`flex min-h-12 flex-col justify-center space-y-0.5 px-3 py-2 sm:px-3.5 ${
                          activeIntent === "expense"
                            ? "border-b border-r border-border/60"
                            : "border-b border-border/60 sm:border-b-0 sm:border-r"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <CalendarDays className="size-3.5" />
                          <span>Date</span>
                        </div>
                        <p className="font-semibold text-foreground">{selectedDateLabel}</p>
                      </div>
                      <div
                        className={`flex min-h-12 flex-col justify-center space-y-0.5 px-3 py-2 sm:px-3.5 ${
                          activeIntent === "expense"
                            ? "border-b border-border/60"
                            : "border-b border-border/60 sm:border-b-0 sm:border-r"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Landmark className="size-3.5" />
                          <span>{activeIntent === "transfer" ? "From" : "Account"}</span>
                        </div>
                        <p className="truncate font-semibold text-foreground">
                          {activeIntent === "transfer" ? selectedSourceAccountName : selectedAccountName}
                        </p>
                      </div>
                      <div
                        className={`flex min-h-12 flex-col justify-center space-y-0.5 px-3 py-2 sm:px-3.5 ${
                          activeIntent === "expense" ? "border-r border-border/60" : ""
                        }`}
                      >
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Wallet className="size-3.5" />
                          <span>{activeIntent === "transfer" ? "To" : "Category"}</span>
                        </div>
                        <p className="truncate font-semibold text-foreground">
                          {activeIntent === "transfer" ? selectedDestinationAccountName : selectedCategoryName}
                        </p>
                      </div>
                      {activeIntent === "expense" ? (
                        <div className="flex min-h-12 flex-col justify-center space-y-0.5 px-3 py-2 sm:px-3.5">
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <PiggyBank className="size-3.5" />
                            <span>Budget</span>
                          </div>
                          <p className="truncate font-semibold text-foreground">{selectedBudgetName}</p>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                {(activeIntent === "expense" || activeIntent === "income") && (
                  <div className="space-y-3">
                    <p className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Details
                    </p>
                    <div className={detailGridClass}>
                      <div className="space-y-1.5">
                        <label className="flex items-center gap-1.5 text-[0.74rem] font-semibold text-muted-foreground">
                          <CalendarDays className="size-3.5 text-primary" />
                          <span>Date</span>
                        </label>
                        <Input
                          type="date"
                          value={selectedDateValue || parsed.dateValue}
                          onChange={(event) => {
                            setDateManuallyChanged(true);
                            setSelectedDateValue(event.target.value);
                          }}
                          disabled={isSubmitting}
                          className="h-10 rounded-lg border-border/80 bg-background px-3 text-[0.84rem]"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="flex items-center gap-1.5 text-[0.74rem] font-semibold text-muted-foreground">
                          <Landmark className="size-3.5 text-primary" />
                          <span>Account</span>
                        </label>
                        <Select value={selectedAccountId} onValueChange={setSelectedAccountId} disabled={isSubmitting}>
                          <SelectTrigger className="h-10 w-full rounded-lg border-border/80 bg-background px-3 text-[0.84rem]">
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
                      </div>

                      <div className="space-y-1.5">
                        <label className="flex items-center gap-1.5 text-[0.74rem] font-semibold text-muted-foreground">
                          <Wallet className="size-3.5 text-primary" />
                          <span>Category</span>
                        </label>
                        <Select
                          value={selectedCategoryId || "none"}
                          onValueChange={(value) => setSelectedCategoryId(value === "none" ? "" : value)}
                          disabled={isSubmitting}
                        >
                          <SelectTrigger className="h-10 w-full rounded-lg border-border/80 bg-background px-3 text-[0.84rem]">
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

                      {activeIntent === "expense" ? (
                        <div className="space-y-1.5">
                          <label className="flex items-center gap-1.5 text-[0.74rem] font-semibold text-muted-foreground">
                            <PiggyBank className="size-3.5 text-primary" />
                            <span>Budget</span>
                          </label>
                          <Select
                            value={selectedBudgetId || "none"}
                            onValueChange={(value) => setSelectedBudgetId(value === "none" ? "" : value)}
                            disabled={isSubmitting}
                          >
                            <SelectTrigger className="h-10 w-full rounded-lg border-border/80 bg-background px-3 text-[0.84rem]">
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
                  </div>
                )}

                {activeIntent === "transfer" && (
                  <div className="space-y-3">
                    <p className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Details
                    </p>
                    <div className={detailGridClass}>
                      <div className="space-y-1.5">
                        <label className="flex items-center gap-1.5 text-[0.74rem] font-semibold text-muted-foreground">
                          <CalendarDays className="size-3.5 text-primary" />
                          <span>Date</span>
                        </label>
                        <Input
                          type="date"
                          value={selectedDateValue || parsed.dateValue}
                          onChange={(event) => {
                            setDateManuallyChanged(true);
                            setSelectedDateValue(event.target.value);
                          }}
                          disabled={isSubmitting}
                          className="h-10 rounded-lg border-border/80 bg-background px-3 text-[0.84rem]"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="flex items-center gap-1.5 text-[0.74rem] font-semibold text-muted-foreground">
                          <Wallet className="size-3.5 text-primary" />
                          <span>From</span>
                        </label>
                        <Select value={selectedSourceAccountId} onValueChange={setSelectedSourceAccountId} disabled={isSubmitting}>
                          <SelectTrigger className="h-10 w-full rounded-lg border-border/80 bg-background px-3 text-[0.84rem]">
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
                      <div className="space-y-1.5">
                        <label className="flex items-center gap-1.5 text-[0.74rem] font-semibold text-muted-foreground">
                          <ArrowRightLeft className="size-3.5 text-primary" />
                          <span>To</span>
                        </label>
                        <Select value={selectedDestinationAccountId} onValueChange={setSelectedDestinationAccountId} disabled={isSubmitting}>
                          <SelectTrigger className="h-10 w-full rounded-lg border-border/80 bg-background px-3 text-[0.84rem]">
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
                  </div>
                )}

                {!activeIntent ? (
                  <div className="rounded-[1rem] border border-dashed border-border/70 bg-background/76 px-4 py-4 text-[0.84rem] leading-6 text-muted-foreground dark:bg-[#162022]">
                    Start with an action like <span className="font-medium text-foreground">spent</span>, <span className="font-medium text-foreground">received</span>, or <span className="font-medium text-foreground">transferred</span>.
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="rounded-[1rem] border border-border/70 bg-white px-4 py-4 dark:bg-[#162022]">
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
                      onClick={() => updateInput(prompt)}
                      disabled={isSubmitting}
                    >
                      {prompt}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="!mx-0 !mb-0 shrink-0 border-t border-border/60 bg-white px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-5 sm:pt-3 sm:pb-4">
            <div className="flex w-full items-center gap-2.5 sm:justify-end">
              <Button
                type="button"
                variant="outline"
                className="h-10 flex-1 rounded-lg bg-white px-4 text-[0.86rem] text-foreground/88 hover:bg-muted sm:w-[10.5rem] sm:flex-none"
                onClick={() => setOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="h-10 flex-1 rounded-lg bg-[#0f766e] px-4 text-[0.86rem] font-semibold text-white hover:bg-[#0d615a] hover:text-white disabled:opacity-65 disabled:text-white/85 sm:w-[14.5rem] sm:flex-none"
                onClick={submit}
                disabled={!canSubmit || isSubmitting || (isLowConfidenceDraft && !lowConfidenceConfirmed)}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Recording...
                  </>
                ) : activeIntent ? (
                  `Record ${intentMeta.label.toLowerCase()}`
                ) : (
                  "Record"
                )}
              </Button>
            </div>
          </DialogFooter>
          </div>
        </Surface>
      </Root>
    </>
  );
}
