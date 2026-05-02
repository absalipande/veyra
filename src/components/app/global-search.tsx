"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Landmark, Search, Wallet, X } from "lucide-react";

import type { AppRouter } from "@/server/api/root";
import { trpc } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { getInstitutionDisplay } from "@/features/accounts/lib/institutions";
import { InstitutionAvatar } from "@/components/app/institution-avatar";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type AccountItem = RouterOutputs["accounts"]["list"][number];
type TransactionItem = RouterOutputs["transactions"]["list"]["items"][number];
type MobileSearchSection = "all" | "accounts" | "transactions";

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
  const [mobileSection, setMobileSection] = useState<MobileSearchSection>("all");
  const [isMobile, setIsMobile] = useState(false);
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

  useEffect(() => {
    if (typeof window === "undefined") return;

    const media = window.matchMedia("(max-width: 639px)");
    const onChange = () => setIsMobile(media.matches);
    onChange();
    media.addEventListener("change", onChange);

    return () => media.removeEventListener("change", onChange);
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
  const Root = isMobile ? Sheet : Dialog;
  const Surface = isMobile ? SheetContent : DialogContent;
  const surfaceProps = isMobile
    ? {
        side: "bottom" as const,
        showCloseButton: false,
        className:
          "h-[84dvh] rounded-t-[1.15rem] border border-border/70 bg-card p-0",
      }
    : {
        mobileBehavior: "modal" as const,
        showCloseButton: false,
        className:
          "max-h-[78vh] w-[calc(100vw-1rem)] overflow-hidden rounded-[1.25rem] border-border/70 bg-card p-0 text-foreground shadow-[0_34px_120px_-70px_rgba(10,31,34,0.4)] sm:w-[min(92vw,56rem)] sm:max-w-[56rem]",
      };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden min-w-0 flex-1 items-center gap-3 rounded-[1.15rem] border border-border/70 bg-white/84 px-4 py-2.5 text-[0.95rem] text-muted-foreground shadow-[0_18px_40px_-35px_rgba(10,31,34,0.22)] transition-colors hover:bg-white dark:bg-[#182123] dark:shadow-[0_18px_40px_-35px_rgba(0,0,0,0.38)] dark:hover:bg-[#1d2729] lg:flex"
      >
        <Search className="size-[0.95rem]" />
        <span className="min-w-0 flex-1 truncate text-left tracking-[-0.01em]">
          Search accounts and transactions
        </span>
        <span className="keyboard-hint rounded-full border border-border/70 bg-background/80 px-2 py-0.5 text-[0.68rem] font-medium text-muted-foreground">
          ⌘K
        </span>
      </button>

      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-10 rounded-full border-border/70 bg-white/92 shadow-[0_16px_36px_-30px_rgba(10,31,34,0.2)] lg:hidden dark:bg-[#182123] dark:shadow-[0_16px_36px_-30px_rgba(0,0,0,0.34)]"
        onClick={() => setOpen(true)}
      >
        <Search className="size-4" />
        <span className="sr-only">Open search</span>
      </Button>

      <Root
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setQuery("");
            setMobileSection("all");
          }
          setOpen(nextOpen);
        }}
      >
        <Surface {...surfaceProps}>
          <div className="mx-auto mt-2 h-1.5 w-12 shrink-0 rounded-full bg-border sm:hidden" />
          <DialogTitle className="sr-only">Global search</DialogTitle>
          <DialogDescription className="sr-only">
            Search accounts and transactions across your workspace.
          </DialogDescription>

          <div className="shrink-0 border-b border-border/70 px-4 pb-3 pt-3 pr-14 sm:px-6 sm:pb-4 sm:pt-5 sm:pr-16">
            <div className="flex items-center gap-2">
              <h2 className="text-[1.02rem] font-semibold tracking-tight text-[#10292B] dark:text-foreground sm:text-[1.12rem]">
                Search
              </h2>
              <div className="keyboard-hint hidden h-7 items-center rounded-full border border-border/70 bg-white px-2.5 text-[0.66rem] font-medium text-muted-foreground sm:inline-flex">
                ⌘ K
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="absolute right-3 top-3 rounded-full border border-border/70 text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setQuery("");
                  setOpen(false);
                }}
              >
                <X className="size-4" />
                <span className="sr-only">Close search</span>
              </Button>
            </div>

            <div className="mt-3 space-y-3">
              <div className="flex h-11 items-center rounded-xl border border-border/80 bg-white px-3 transition-colors focus-within:border-[#7fb9b6] focus-within:ring-2 focus-within:ring-[#7fb9b6]/20 dark:bg-[#141d1f]">
                <Search className="mr-2.5 size-4 shrink-0 text-muted-foreground sm:mr-3" />
                <Input
                  autoFocus
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search accounts, transactions, notes, or events"
                  className="h-10 min-w-0 flex-1 rounded-none border-0 bg-transparent px-0 py-0 text-[0.86rem] leading-[1.25] shadow-none placeholder:text-muted-foreground/90 focus-visible:border-0 focus-visible:ring-0 focus-visible:ring-offset-0 dark:bg-transparent"
                />
                {query.trim() ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="ml-2 size-7 shrink-0 rounded-full text-muted-foreground hover:bg-muted"
                    onClick={() => setQuery("")}
                  >
                    <X className="size-4" />
                    <span className="sr-only">Clear search</span>
                  </Button>
                ) : null}
              </div>

              <div className="grid grid-cols-3 gap-1 rounded-xl border border-border/70 bg-muted/40 p-1 sm:hidden">
                {([
                  { value: "all", label: "All" },
                  { value: "accounts", label: "Accounts" },
                  { value: "transactions", label: "Transactions" },
                ] as const).map((section) => (
                  <button
                    key={section.value}
                    type="button"
                    onClick={() => setMobileSection(section.value)}
                    className={`h-8 rounded-lg px-2 text-[0.74rem] font-semibold transition-colors ${
                      mobileSection === section.value
                        ? "bg-[#0f766e] text-white shadow-none"
                        : "text-muted-foreground hover:bg-white hover:text-foreground"
                    }`}
                  >
                    {section.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3.5 sm:grid sm:grid-cols-2 sm:gap-4 sm:space-y-0 sm:px-6 sm:py-5">
            {(mobileSection === "all" || mobileSection === "accounts") && (
              <section className="space-y-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    <Landmark className="size-[0.95rem] text-primary" />
                    Accounts
                  </div>
                  <button
                    type="button"
                    className="hidden text-[0.8rem] font-medium text-primary transition-colors hover:text-primary/80 sm:inline-flex"
                    onClick={() => openAccountsResult(deferredQuery.trim() || "accounts")}
                  >
                    View all
                  </button>
                </div>

                <div className="overflow-hidden rounded-xl border border-border/70 bg-white dark:bg-[#162022]">
                  {accounts.map((account, index) => (
                    <button
                      key={account.id}
                      type="button"
                      onClick={() => openAccountsResult(account.name)}
                      className={`flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-muted/35 dark:hover:bg-[#1b2527] ${
                        index !== accounts.length - 1 ? "border-b border-border/70" : ""
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        {(() => {
                          const institution = getInstitutionDisplay(account.institution || account.name);

                          return (
                            <InstitutionAvatar
                              key={`${institution.label}:${institution.logoPaths.join("|")}`}
                              display={institution}
                              sizeClassName="size-9"
                              imageClassName="size-full rounded-full object-cover"
                              initialsClassName="text-[0.76rem] font-semibold"
                              logoContainerClassName="border border-border/70 bg-white/90 p-0 dark:border-white/10 dark:bg-[#141d1f]"
                            />
                          );
                        })()}
                        <div className="min-w-0">
                          <p className="truncate text-[0.92rem] font-medium text-[#10292B] dark:text-foreground">
                            {account.name}
                          </p>
                          <p className="mt-0.5 text-[0.72rem] text-muted-foreground">
                            {getAccountTypeLabel(account.type)} · {account.currency}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 pl-3">
                        <span className="hidden text-[0.88rem] font-semibold text-[#10292B] dark:text-foreground sm:inline-flex">
                          {new Intl.NumberFormat("en-PH", { style: "currency", currency: account.currency, maximumFractionDigits: 2 }).format((account.balance ?? 0) / 1000)}
                        </span>
                        <ArrowUpRight className="size-[0.95rem] shrink-0 text-muted-foreground" />
                      </div>
                    </button>
                  ))}
                </div>

                {!isLoading && hasQuery && accounts.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border/70 px-4 py-4 text-[0.84rem] text-muted-foreground">
                    No accounts matched that search.
                  </p>
                ) : null}
              </section>
            )}

            {(mobileSection === "all" || mobileSection === "transactions") && (
              <section className="space-y-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    <ReceiptIcon />
                    Transactions
                  </div>
                  <button
                    type="button"
                    className="hidden text-[0.8rem] font-medium text-primary transition-colors hover:text-primary/80 sm:inline-flex"
                    onClick={() => openTransactionResult(deferredQuery.trim() || "transactions")}
                  >
                    View all
                  </button>
                </div>

                <div className="overflow-hidden rounded-xl border border-border/70 bg-white dark:bg-[#162022]">
                  {transactions.map((event, index) => {
                    const isPositive = event.type === "income";
                    const amountLabel = event.amount
                      ? `${isPositive ? "+" : "-"}${new Intl.NumberFormat("en-PH", {
                          style: "currency",
                          currency: event.currency,
                          maximumFractionDigits: 2,
                        }).format(Math.abs(event.amount) / 1000)}`
                      : null;

                    return (
                      <button
                        key={event.id}
                        type="button"
                        onClick={() => openTransactionResult(event.description)}
                        className={`flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-muted/35 dark:hover:bg-[#1b2527] ${
                          index !== transactions.length - 1 ? "border-b border-border/70" : ""
                        }`}
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div className={`flex size-9 shrink-0 items-center justify-center rounded-full text-[0.76rem] font-semibold ${
                            isPositive
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200"
                              : "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200"
                          }`}>
                            {isPositive ? "↑" : "↓"}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-[0.92rem] font-medium text-[#10292B] dark:text-foreground">
                              {event.description}
                            </p>
                            <p className="mt-0.5 text-[0.72rem] text-muted-foreground">
                              {getTransactionTypeLabel(event.type)} · Today
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 pl-3">
                          {amountLabel ? (
                            <span className={`hidden text-[0.88rem] font-semibold sm:inline-flex ${
                              isPositive
                                ? "text-emerald-700 dark:text-emerald-300"
                                : "text-rose-700 dark:text-rose-300"
                            }`}>
                              {amountLabel}
                            </span>
                          ) : null}
                          <ArrowUpRight className="size-[0.95rem] shrink-0 text-muted-foreground" />
                        </div>
                      </button>
                    );
                  })}
                </div>

                {!isLoading && hasQuery && transactions.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border/70 px-4 py-4 text-[0.84rem] text-muted-foreground">
                    No transactions matched that search.
                  </p>
                ) : null}
              </section>
            )}

            {isLoading ? (
              <div className="rounded-xl border border-border/70 bg-white px-4 py-3 text-[0.82rem] text-muted-foreground dark:bg-[#162022] sm:col-span-2">
                Searching your workspace...
              </div>
            ) : null}

            {hasQuery && !isLoading && !hasResults ? (
              <div className="rounded-xl border border-border/70 bg-white px-4 py-3 text-[0.82rem] text-muted-foreground dark:bg-[#162022] sm:col-span-2">
                Nothing matched &quot;{deferredQuery.trim()}&quot;.
              </div>
            ) : null}
          </div>
        </Surface>
      </Root>
    </>
  );
}

function ReceiptIcon() {
  return <Wallet className="size-[0.95rem] text-primary" />;
}
