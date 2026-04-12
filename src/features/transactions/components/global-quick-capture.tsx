"use client";

import { useEffect, useMemo, useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import { ArrowRightLeft, Landmark, Plus, Search, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { toast } from "sonner";

import { formatCurrencyMiliunits } from "@/lib/currencies";
import type { AppRouter } from "@/server/api/root";
import { trpc } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type AccountItem = RouterOutputs["accounts"]["list"][number];
type QuickCaptureIntent = "expense" | "income" | "transfer" | null;
type SupportedEventType = RouterOutputs["transactions"]["list"][number]["type"];

type ParsedQuickCapture = {
  amountMiliunits: number | null;
  dateLabel: string;
  dateValue: string;
  description: string | null;
  destinationAccountId: string | null;
  intent: QuickCaptureIntent;
  missing: Array<"amount" | "description" | "account" | "sourceAccount" | "destinationAccount" | "intent">;
  sourceAccountId: string | null;
};

const examplePrompts = [
  "paid 360 for lunch today",
  "received 2500 side hustle yesterday",
  "transferred 5000 from bdo to maya",
] as const;

function normalizeValue(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function toDateValue(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function formatDateLabel(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
  }).format(new Date(`${value}T12:00:00`));
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

function parseQuickCapture(input: string, accounts: AccountItem[]): ParsedQuickCapture {
  const normalized = input.trim();
  const lower = normalized.toLowerCase();
  const intent = detectIntent(normalized);
  const amountMiliunits = extractAmount(normalized);
  const isYesterday = /\byesterday\b/.test(lower);
  const dateValue = toDateValue(isYesterday ? -1 : 0);
  const dateLabel = isYesterday ? "Yesterday" : /\btoday\b/.test(lower) ? "Today" : formatDateLabel(dateValue);

  let description: string | null = null;
  let sourceAccountId: string | null = null;
  let destinationAccountId: string | null = null;

  if (intent === "transfer") {
    const transferMatch = normalized.match(/from\s+(.+?)\s+to\s+(.+?)(?:\s+(?:today|yesterday))?$/i);
    const sourcePhrase = transferMatch?.[1]?.trim() ?? null;
    const destinationPhrase = transferMatch?.[2]?.trim() ?? null;

    sourceAccountId = findAccountMatch(sourcePhrase, accounts)?.id ?? null;
    destinationAccountId = findAccountMatch(destinationPhrase, accounts)?.id ?? null;
    description = "Transfer";
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
  const createEvent = trpc.transactions.create.useMutation({
    onSuccess: async (_, variables) => {
      await Promise.all([
        utils.transactions.list.invalidate(),
        utils.transactions.summary.invalidate(),
        utils.accounts.list.invalidate(),
        utils.accounts.summary.invalidate(),
      ]);
      toast.success(`${getIntentMeta(variables.type).label} recorded.`);
      setOpen(false);
      setInput("");
      setSelectedAccountId("");
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
  const [selectedSourceAccountId, setSelectedSourceAccountId] = useState("");
  const [selectedDestinationAccountId, setSelectedDestinationAccountId] = useState("");
  const accounts = useMemo(() => accountsQuery.data ?? [], [accountsQuery.data]);

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
  }, [open, accountsQuery]);

  const liquidAccounts = useMemo(
    () => accounts.filter((account) => account.type === "cash" || account.type === "wallet"),
    [accounts],
  );
  const spendableAccounts = useMemo(
    () => accounts.filter((account) => account.type === "cash" || account.type === "wallet" || account.type === "credit"),
    [accounts],
  );

  const parsed = useMemo(() => parseQuickCapture(input, accounts), [input, accounts]);
  const intentMeta = getIntentMeta(parsed.intent);
  const IntentIcon = intentMeta.icon;
  const relevantAccountOptions =
    parsed.intent === "expense" ? spendableAccounts : parsed.intent === "income" ? liquidAccounts : liquidAccounts;

  useEffect(() => {
    setSelectedAccountId(parsed.sourceAccountId ?? "");
    setSelectedSourceAccountId(parsed.sourceAccountId ?? "");
    setSelectedDestinationAccountId(parsed.destinationAccountId ?? "");
  }, [parsed.sourceAccountId, parsed.destinationAccountId, parsed.intent]);

  const canSubmit =
    parsed.intent === "expense" || parsed.intent === "income"
      ? Boolean(parsed.amountMiliunits && parsed.description && selectedAccountId)
      : parsed.intent === "transfer"
        ? Boolean(parsed.amountMiliunits && selectedSourceAccountId && selectedDestinationAccountId)
        : false;

  const submit = () => {
    if (!canSubmit || !parsed.amountMiliunits) return;

    const date = new Date(`${parsed.dateValue}T12:00:00`);

    if (parsed.intent === "expense" || parsed.intent === "income") {
      createEvent.mutate({
        type: parsed.intent,
        accountId: selectedAccountId,
        amount: parsed.amountMiliunits,
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
        className="rounded-full border-border/70 bg-white/82 px-3.5 text-[0.92rem] shadow-[0_18px_40px_-35px_rgba(10,31,34,0.25)] hover:bg-white dark:bg-[#182123] dark:hover:bg-[#1d2729] lg:px-4"
        onClick={() => setOpen(true)}
      >
        <Plus className="size-4" />
        <span className="hidden sm:inline">Quick capture</span>
      </Button>

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen && !createEvent.isPending) {
            setInput("");
          }
        }}
      >
        <DialogContent
          onCloseAutoFocus={(event) => event.preventDefault()}
          className="max-h-[92vh] w-[calc(100vw-1.25rem)] overflow-y-auto rounded-[2rem] border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(251,250,246,0.95))] px-0 py-0 dark:border-white/8 dark:bg-[linear-gradient(180deg,rgba(24,33,35,0.98),rgba(18,27,29,0.98))] sm:w-auto sm:max-w-[42rem]"
        >
          <DialogHeader className="border-b border-border/70 px-5 pb-5 pt-6 pr-16 sm:px-7 sm:pb-6 sm:pt-7">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex w-fit rounded-full border border-[#17393c]/10 bg-[#17393c]/5 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-[#17393c] dark:border-white/8 dark:bg-white/6 dark:text-primary">
                Quick capture
              </div>
              <div className="inline-flex rounded-full border border-border/70 px-2.5 py-1 text-[0.7rem] font-medium text-muted-foreground">
                Cmd/Ctrl + Shift + K
              </div>
            </div>
            <DialogTitle className="pt-3 text-[1.7rem] tracking-tight sm:text-[2rem]">
              Record money in one line
            </DialogTitle>
            <DialogDescription className="max-w-xl text-[0.93rem] leading-7">
              Start with a plain sentence and let Veyra shape it into a draft before anything is saved.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 px-5 py-5 sm:px-7 sm:py-6">
            <div className="space-y-3 rounded-[1.5rem] border border-border/70 bg-background/78 px-4 py-4 dark:bg-[#162022]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  autoFocus
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="Try: paid 360 for lunch today"
                  className="h-12 rounded-[1.35rem] border-border/80 bg-background pl-11 text-[0.95rem] dark:bg-[#141d1f]"
                />
              </div>
              <p className="text-[0.85rem] leading-6 text-muted-foreground">
                Works best for expenses, income, and transfers. If something is missing, Veyra will ask only for that field.
              </p>
              <div className="flex flex-wrap gap-2">
                {examplePrompts.map((prompt) => (
                  <Button
                    key={prompt}
                    type="button"
                    size="sm"
                    variant="outline"
                    className="rounded-full text-[0.82rem]"
                    onClick={() => setInput(prompt)}
                  >
                    {prompt}
                  </Button>
                ))}
              </div>
            </div>

            {input.trim() ? (
              <div className="space-y-4">
                <div className="rounded-[1.55rem] border border-border/70 bg-background/78 px-4 py-4 dark:bg-[#162022]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-border/70 px-3 py-1 text-[0.72rem] uppercase tracking-[0.18em] text-muted-foreground">
                      Parsed draft
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-full border border-border/70 px-3 py-1 text-[0.78rem] font-medium">
                      <IntentIcon className="size-3.5" />
                      {intentMeta.label}
                    </span>
                    {parsed.amountMiliunits ? (
                      <span className="rounded-full border border-border/70 px-3 py-1 text-[0.78rem] font-medium">
                        {formatCurrencyMiliunits(parsed.amountMiliunits, "PHP")}
                      </span>
                    ) : null}
                    <span className="rounded-full border border-border/70 px-3 py-1 text-[0.78rem] text-muted-foreground">
                      {parsed.dateLabel}
                    </span>
                    <span className="rounded-full border border-border/70 px-3 py-1 text-[0.78rem] text-muted-foreground">
                      {parsed.missing.length === 0 ? "Ready to record" : `${parsed.missing.length} field${parsed.missing.length === 1 ? "" : "s"} missing`}
                    </span>
                  </div>
                  <p className="mt-3 text-[1.02rem] font-semibold tracking-tight">
                    {parsed.description ?? "We need a bit more detail"}
                  </p>
                  <p className="mt-1 text-[0.9rem] leading-6 text-muted-foreground">
                    {parsed.intent === "transfer"
                      ? "Transfers need both the source and destination account before they can be recorded."
                      : "If the account is unclear, pick it below before saving."}
                  </p>
                </div>

                {(parsed.intent === "expense" || parsed.intent === "income") && (
                  <div className="space-y-3 rounded-[1.45rem] border border-border/70 bg-background/76 px-4 py-4 dark:bg-[#162022]">
                    <div className="flex items-center gap-2 text-[0.92rem] font-medium text-foreground">
                      <Landmark className="size-4 text-primary" />
                      Which account did you use?
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {relevantAccountOptions.slice(0, 4).map((account) => (
                        <Button
                          key={account.id}
                          type="button"
                          size="sm"
                          variant={selectedAccountId === account.id ? "default" : "outline"}
                          className="rounded-full"
                          onClick={() => setSelectedAccountId(account.id)}
                        >
                          {account.name}
                        </Button>
                      ))}
                    </div>
                    <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                      <SelectTrigger className="h-11 rounded-[1.2rem] border-border/80 bg-background px-4">
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
                )}

                {parsed.intent === "transfer" && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-3 rounded-[1.45rem] border border-border/70 bg-background/76 px-4 py-4 dark:bg-[#162022]">
                      <div className="flex items-center gap-2 text-[0.92rem] font-medium text-foreground">
                        <Wallet className="size-4 text-primary" />
                        From
                      </div>
                      <Select value={selectedSourceAccountId} onValueChange={setSelectedSourceAccountId}>
                        <SelectTrigger className="h-11 rounded-[1.2rem] border-border/80 bg-background px-4">
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
                    <div className="space-y-3 rounded-[1.45rem] border border-border/70 bg-background/76 px-4 py-4 dark:bg-[#162022]">
                      <div className="flex items-center gap-2 text-[0.92rem] font-medium text-foreground">
                        <ArrowRightLeft className="size-4 text-primary" />
                        To
                      </div>
                      <Select value={selectedDestinationAccountId} onValueChange={setSelectedDestinationAccountId}>
                        <SelectTrigger className="h-11 rounded-[1.2rem] border-border/80 bg-background px-4">
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
                  <div className="rounded-[1.4rem] border border-dashed border-border/70 bg-background/76 px-4 py-4 text-[0.9rem] leading-6 text-muted-foreground dark:bg-[#162022]">
                    Start with an action like <span className="font-medium text-foreground">paid</span>, <span className="font-medium text-foreground">received</span>, or <span className="font-medium text-foreground">transferred</span>.
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-[1.35rem] border border-border/70 bg-background/76 px-4 py-4 dark:bg-[#162022]">
                  <p className="text-[0.72rem] uppercase tracking-[0.2em] text-muted-foreground">Expense</p>
                  <p className="mt-2 text-[0.96rem] font-semibold tracking-tight">paid 360 for lunch today</p>
                  <p className="mt-1 text-[0.84rem] leading-6 text-muted-foreground">Creates an expense draft and asks for the account if it is still unclear.</p>
                </div>
                <div className="rounded-[1.35rem] border border-border/70 bg-background/76 px-4 py-4 dark:bg-[#162022]">
                  <p className="text-[0.72rem] uppercase tracking-[0.2em] text-muted-foreground">Income</p>
                  <p className="mt-2 text-[0.96rem] font-semibold tracking-tight">received 2500 side hustle yesterday</p>
                  <p className="mt-1 text-[0.84rem] leading-6 text-muted-foreground">Keeps the capture fast and only asks where the money landed.</p>
                </div>
                <div className="rounded-[1.35rem] border border-border/70 bg-background/76 px-4 py-4 dark:bg-[#162022]">
                  <p className="text-[0.72rem] uppercase tracking-[0.2em] text-muted-foreground">Transfer</p>
                  <p className="mt-2 text-[0.96rem] font-semibold tracking-tight">transferred 5000 from bdo to maya</p>
                  <p className="mt-1 text-[0.84rem] leading-6 text-muted-foreground">Matches both sides of the movement, then asks only if one account is missing.</p>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="border-t border-border/60 bg-transparent px-5 py-4 sm:px-7 sm:py-5">
            <div className="flex w-full flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                className="h-11 min-w-0 flex-1 rounded-full px-5 text-[0.96rem] sm:min-w-40 sm:flex-none"
                onClick={() => setOpen(false)}
                disabled={createEvent.isPending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="h-11 min-w-0 flex-1 rounded-full bg-[#17393c] px-5 text-[0.96rem] hover:bg-[#1d4a4d] sm:min-w-48 sm:flex-none"
                onClick={submit}
                disabled={!canSubmit || createEvent.isPending}
              >
                {parsed.intent ? `Record ${intentMeta.label.toLowerCase()}` : "Record"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
