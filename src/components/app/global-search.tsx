"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Landmark, Search, Wallet, X } from "lucide-react";

import type { AppRouter } from "@/server/api/root";
import { trpc } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type AccountItem = RouterOutputs["accounts"]["list"][number];
type TransactionItem = RouterOutputs["transactions"]["list"]["items"][number];

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

function getTransactionTypeLabel(type: TransactionItem["type"]) {
  switch (type) {
    case "income":
      return "Income";
    case "expense":
      return "Expense";
    case "transfer":
      return "Transfer";
    case "credit_payment":
      return "Credit payment";
    case "loan_disbursement":
      return "Loan disbursement";
    default:
      return type;
  }
}

function matchesSearch(values: Array<string | null | undefined>, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;

  return values.some((value) => value?.toLowerCase().includes(normalized));
}

function getTransactionSummary(event: TransactionItem) {
  const accountNames = event.entries
    .map((entry) => entry.account?.name)
    .filter((name): name is string => Boolean(name));

  return accountNames.join(" · ");
}

export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);

  const accountsQuery = trpc.accounts.list.useQuery(undefined, {
    enabled: open,
  });
  const transactionsQuery = trpc.transactions.list.useQuery({
    page: 1,
    pageSize: 30,
    search: deferredQuery,
    type: "all",
  }, {
    enabled: open,
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => {
          const next = !current;
          if (!next) {
            setQuery("");
          }
          return next;
        });
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const accounts = useMemo(() => {
    const items = accountsQuery.data ?? [];
    return items
      .filter((account) =>
        matchesSearch(
          [account.name, account.currency, getAccountTypeLabel(account.type)],
          deferredQuery
        )
      )
      .slice(0, 6);
  }, [accountsQuery.data, deferredQuery]);

  const transactions = useMemo(() => {
    const items = transactionsQuery.data?.items ?? [];
    return items
      .filter((event) =>
        matchesSearch(
          [
            event.description,
            event.notes,
            getTransactionTypeLabel(event.type),
            getTransactionSummary(event),
          ],
          deferredQuery
        )
      )
      .slice(0, 6);
  }, [transactionsQuery.data, deferredQuery]);

  const openAccountsResult = (name: string) => {
    setQuery("");
    setOpen(false);
    router.push(`/accounts?q=${encodeURIComponent(name)}`);
  };

  const openTransactionResult = (queryValue: string) => {
    setQuery("");
    setOpen(false);
    router.push(`/transactions?q=${encodeURIComponent(queryValue)}`);
  };

  const isLoading = accountsQuery.isLoading || transactionsQuery.isLoading;
  const hasQuery = deferredQuery.trim().length > 0;
  const hasResults = accounts.length > 0 || transactions.length > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden min-w-0 flex-1 items-center gap-3 rounded-2xl border border-border/70 bg-white/80 px-4 py-3 text-sm text-muted-foreground shadow-[0_18px_40px_-35px_rgba(10,31,34,0.25)] transition hover:bg-white dark:bg-[#182123] dark:shadow-[0_18px_40px_-35px_rgba(0,0,0,0.4)] dark:hover:bg-[#1d2729] lg:flex"
      >
        <Search className="size-4" />
        <span className="min-w-0 flex-1 truncate text-left">
          Search accounts and transactions
        </span>
        <span className="rounded-full border border-border/70 px-2 py-0.5 text-[0.72rem] font-medium text-muted-foreground">
          ⌘K
        </span>
      </button>

      <Button
        type="button"
        variant="outline"
        size="icon"
        className="lg:hidden"
        onClick={() => setOpen(true)}
      >
        <Search className="size-4" />
        <span className="sr-only">Open search</span>
      </Button>

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setQuery("");
          }
          setOpen(nextOpen);
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="max-h-[90vh] w-[calc(100vw-1.25rem)] overflow-y-auto rounded-[2rem] border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(251,250,246,0.95))] px-0 py-0 text-foreground shadow-[0_34px_120px_-70px_rgba(10,31,34,0.45)] dark:border-white/8 dark:bg-[linear-gradient(180deg,rgba(24,33,35,0.98),rgba(18,27,29,0.98))] sm:w-auto sm:max-w-3xl"
        >
          <div className="border-b border-border/70 px-5 pb-5 pt-5 sm:px-7 sm:pt-6">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="inline-flex rounded-full border border-[#17393c]/10 bg-[#17393c]/5 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-[#17393c] dark:border-white/8 dark:bg-white/6 dark:text-primary">
                  Global search
                </div>
                <div>
                  <h2 className="text-[1.45rem] font-semibold tracking-tight text-[#10292B] dark:text-foreground sm:text-[1.6rem]">
                    Find accounts and transactions fast
                  </h2>
                  <p className="mt-1 text-[0.92rem] leading-6 text-muted-foreground sm:text-sm">
                    Search by account name, transaction description, notes, or event type.
                  </p>
                </div>
              </div>

              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="rounded-full"
                onClick={() => {
                  setQuery("");
                  setOpen(false);
                }}
              >
                <X className="size-4" />
                <span className="sr-only">Close search</span>
              </Button>
            </div>

            <div className="relative mt-4 sm:mt-5">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search Veyra"
                className="h-12 rounded-[1.35rem] border-border/80 bg-background pl-11 text-[0.95rem] dark:bg-[#162022] sm:h-13 sm:text-[0.98rem]"
              />
            </div>
          </div>

          <div className="grid gap-5 px-5 py-5 sm:grid-cols-2 sm:px-7 sm:py-6">
            <section className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Landmark className="size-4 text-primary" />
                Accounts
              </div>

              {accounts.map((account) => (
                <button
                  key={account.id}
                  type="button"
                  onClick={() => openAccountsResult(account.name)}
                  className="flex w-full items-start justify-between rounded-[1.2rem] border border-border/70 bg-white/70 px-4 py-2.5 text-left transition hover:bg-white dark:bg-[#162022] dark:hover:bg-[#1b2527]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[0.95rem] font-semibold text-[#10292B] dark:text-foreground">
                      {account.name}
                    </p>
                    <p className="mt-0.5 text-[0.8rem] text-muted-foreground">
                      {getAccountTypeLabel(account.type)} · {account.currency}
                    </p>
                  </div>
                  <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                </button>
              ))}

              {!isLoading && hasQuery && accounts.length === 0 ? (
                <p className="rounded-[1.2rem] border border-dashed border-border/70 px-4 py-4 text-sm text-muted-foreground">
                  No accounts matched that search.
                </p>
              ) : null}
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <ReceiptIcon />
                Transactions
              </div>

              {transactions.map((event) => (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => openTransactionResult(event.description)}
                  className="flex w-full items-start justify-between rounded-[1.2rem] border border-border/70 bg-white/70 px-4 py-2.5 text-left transition hover:bg-white dark:bg-[#162022] dark:hover:bg-[#1b2527]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[0.95rem] font-semibold text-[#10292B] dark:text-foreground">
                      {event.description}
                    </p>
                    <p className="mt-0.5 text-[0.8rem] text-muted-foreground">
                      {getTransactionTypeLabel(event.type)} · {getTransactionSummary(event)}
                    </p>
                  </div>
                  <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                </button>
              ))}

              {!isLoading && hasQuery && transactions.length === 0 ? (
                <p className="rounded-[1.2rem] border border-dashed border-border/70 px-4 py-4 text-sm text-muted-foreground">
                  No transactions matched that search.
                </p>
              ) : null}
            </section>
          </div>

          {!hasQuery && !isLoading ? (
            <div className="border-t border-border/70 px-5 py-4 text-sm text-muted-foreground sm:px-7">
              Start typing to search live accounts and ledger events. Press <span className="font-medium text-foreground">Cmd/Ctrl + K</span> anytime to reopen this.
            </div>
          ) : null}

          {isLoading ? (
            <div className="border-t border-border/70 px-5 py-4 text-sm text-muted-foreground sm:px-7">
              Searching your workspace...
            </div>
          ) : null}

          {hasQuery && !isLoading && !hasResults ? (
            <div className="border-t border-border/70 px-5 py-4 text-sm text-muted-foreground sm:px-7">
              Nothing matched “{deferredQuery.trim()}”.
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ReceiptIcon() {
  return <Wallet className="size-4 text-primary" />;
}
