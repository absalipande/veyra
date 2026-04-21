"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { inferRouterOutputs } from "@trpc/server";
import {
  ArrowUpDown,
  CreditCard,
  Globe2,
  Landmark,
  Pencil,
  Plus,
  Sparkles,
  Search,
  Trash2,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import { trpc } from "@/trpc/react";
import {
  formatCurrencyMiliunits,
  getCurrencyLabel,
  isSupportedCurrency,
  supportedCurrencies,
} from "@/lib/currencies";
import { getInstitutionDisplay } from "@/features/accounts/lib/institutions";
import type { AppRouter } from "@/server/api/root";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const accountTypeOptions = [
  { label: "Bank", value: "cash" },
  { label: "Wallet", value: "wallet" },
  { label: "Credit", value: "credit" },
  { label: "Loan", value: "loan" },
] as const;

type CreateState = {
  creditInputMode: "available" | "balance";
  balance: string;
  availableCredit: string;
  creditLimit: string;
  currency: (typeof supportedCurrencies)[number];
  name: string;
  type: (typeof accountTypeOptions)[number]["value"];
};

type RouterOutputs = inferRouterOutputs<AppRouter>;
type AccountItem = RouterOutputs["accounts"]["list"][number];
type DeleteTarget = { id: string; name: string } | null;

function getInitialState(defaultCurrency: CreateState["currency"] = "PHP"): CreateState {
  return {
    creditInputMode: "balance",
    availableCredit: "",
    balance: "",
    creditLimit: "",
    currency: defaultCurrency,
    name: "",
    type: "cash",
  };
}

const accountFieldClassName =
  "h-10 w-full rounded-[0.8rem] border-border/70 bg-white px-3.5 text-[0.88rem] shadow-none transition-colors dark:bg-[#162022] focus-visible:border-[#8db8b3] focus-visible:ring-2 focus-visible:ring-[#8db8b3]/20";

const accountInputClassName =
  "h-10 w-full rounded-[0.8rem] border-border/70 bg-white px-3.5 py-2 text-[0.88rem] leading-none shadow-none transition-colors md:h-9.5 md:px-3 md:py-1.5 md:text-[0.8rem] dark:bg-[#162022] focus-visible:border-[#8db8b3] focus-visible:ring-2 focus-visible:ring-[#8db8b3]/20";

const accountFieldLabelClassName =
  "block text-[0.84rem] font-semibold leading-none tracking-tight text-foreground";

const accountDialogContentClassName =
  "h-[100dvh] overflow-hidden border border-border/70 bg-white px-0 py-0 dark:border-white/8 dark:bg-[linear-gradient(180deg,rgba(24,33,35,0.98),rgba(18,27,29,0.98))] [&_[data-slot='dialog-close']]:right-4 [&_[data-slot='dialog-close']]:top-4 [&_[data-slot='dialog-close']]:h-10 [&_[data-slot='dialog-close']]:w-10 [&_[data-slot='dialog-close']]:rounded-full [&_[data-slot='dialog-close']]:border [&_[data-slot='dialog-close']]:border-border/70 [&_[data-slot='dialog-close']]:bg-background/92 [&_[data-slot='dialog-close']]:shadow-sm";

const accountDialogHeaderClassName =
  "sticky top-0 z-10 shrink-0 border-b border-border/70 bg-white px-4 pb-2.5 pt-[max(1rem,env(safe-area-inset-top))] pr-14 sm:px-6 sm:pb-3 sm:pt-5.5 sm:pr-16 dark:bg-[#1a2325]";

const accountDialogBodyClassName =
  "min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-2.5 sm:px-6 sm:py-3";

const accountDialogFooterClassName =
  "sticky bottom-0 z-10 shrink-0 border-t border-border/70 bg-white px-4 pb-[max(0.8rem,env(safe-area-inset-bottom))] pt-2.5 sm:px-6 sm:py-3 dark:bg-[#1a2325]";
const accountConfirmDialogContentClassName =
  "max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] overflow-x-hidden overflow-y-auto rounded-[1.2rem] border-border/70 bg-background/98 px-0 py-0 ring-0 sm:max-h-[calc(100svh-2rem)] sm:w-auto sm:max-w-[30rem] sm:rounded-[1.35rem]";

type AccountDialogShellProps = {
  badge: ReactNode;
  body: ReactNode;
  description: ReactNode;
  footer: ReactNode;
  title: ReactNode;
};

function AccountDialogShell({ badge, body, description, footer, title }: AccountDialogShellProps) {
  return (
    <>
      <DialogHeader className={accountDialogHeaderClassName + " relative"}>
        {badge}
        <DialogTitle className="pt-0.5 text-[1.1rem] tracking-tight sm:pt-1 sm:text-[1.48rem]">
          {title}
        </DialogTitle>
        {description}
      </DialogHeader>
      <div className={accountDialogBodyClassName}>{body}</div>
      <div className={accountDialogFooterClassName}>{footer}</div>
    </>
  );
}

type AccountSortOption =
  | "newest"
  | "oldest"
  | "name-asc"
  | "name-desc"
  | "balance-desc"
  | "balance-asc";

const sortOptionLabels: Record<AccountSortOption, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  "name-asc": "Name A-Z",
  "name-desc": "Name Z-A",
  "balance-desc": "Balance high-low",
  "balance-asc": "Balance low-high",
};

const LIQUID_SORT_STORAGE_KEY = "veyra.accounts.liquid-sort";
const LIABILITY_SORT_STORAGE_KEY = "veyra.accounts.liability-sort";

function formatCount(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
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

function formatAccountBalanceLabel(account: AccountItem) {
  if (account.type === "credit") {
    return "Outstanding";
  }

  if (account.type === "loan") {
    return "Loan balance";
  }

  return "Balance";
}

function formatAccountBalanceDetail(account: AccountItem) {
  if (account.type === "credit") {
    const available = Math.max(account.creditLimit - account.balance, 0);

    return `Limit ${formatCurrencyMiliunits(account.creditLimit, account.currency)} · Avail ${formatCurrencyMiliunits(
      available,
      account.currency,
    )}`;
  }

  return null;
}

function getAccountMetaTone(type: AccountItem["type"]) {
  switch (type) {
    case "cash":
      return "text-emerald-700";
    case "wallet":
      return "text-teal-700";
    case "credit":
      return "text-amber-700";
    case "loan":
      return "text-rose-700";
    default:
      return "text-foreground";
  }
}

function filterAccounts(accounts: AccountItem[], query: string) {
  const normalized = query.trim().toLowerCase();

  if (!normalized) return accounts;

  return accounts.filter((account) =>
    [account.name, account.currency, account.type].some((value) =>
      value.toLowerCase().includes(normalized),
    ),
  );
}

function sortAccounts(accounts: AccountItem[], sort: AccountSortOption) {
  const items = [...accounts];

  switch (sort) {
    case "oldest":
      return items.sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
    case "name-asc":
      return items.sort((a, b) => a.name.localeCompare(b.name));
    case "name-desc":
      return items.sort((a, b) => b.name.localeCompare(a.name));
    case "balance-desc":
      return items.sort((a, b) => b.balance - a.balance);
    case "balance-asc":
      return items.sort((a, b) => a.balance - b.balance);
    case "newest":
    default:
      return items.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  }
}

type AccountSectionProps = {
  accounts: AccountItem[];
  description: string;
  emptyBody: string;
  emptyTitle: string;
  filterValue: string;
  onDelete: (id: string, name: string) => void;
  onEdit: (account: AccountItem) => void;
  onFilterChange: (value: string) => void;
  onSortChange: (value: AccountSortOption) => void;
  sortValue: AccountSortOption;
  totalBalanceLabel: string;
  title: string;
};

function AccountSection({
  accounts,
  description,
  emptyBody,
  emptyTitle,
  filterValue,
  onDelete,
  onEdit,
  onFilterChange,
  onSortChange,
  sortValue,
  totalBalanceLabel,
  title,
}: AccountSectionProps) {
  return (
    <Card className="border-white/75 bg-white/82 shadow-[0_28px_75px_-55px_rgba(10,31,34,0.28)] dark:border-white/8 dark:bg-[#182123] dark:shadow-[0_32px_85px_-55px_rgba(0,0,0,0.62)]">
          <CardHeader className="gap-2.5 pb-3.5">
            <div className="space-y-1">
          <CardTitle className="text-[1.02rem] tracking-tight text-[#10292B] dark:text-foreground sm:text-[1.08rem]">
            {title}
          </CardTitle>
          <CardDescription className="max-w-[34rem] text-[0.82rem] leading-5.5 sm:text-[0.84rem]">
            {description} · Total {totalBalanceLabel}
          </CardDescription>
        </div>

        <div className="grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_170px] sm:items-center">
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-[0.95rem] -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filterValue}
              onChange={(event) => onFilterChange(event.target.value)}
              placeholder="Filter accounts"
              className="h-11 rounded-[1rem] border-border/70 bg-white pl-10 pr-4 text-[0.92rem] shadow-none dark:bg-[#162022]"
            />
          </div>
          <Select
            value={sortValue}
            onValueChange={(value) => onSortChange(value as AccountSortOption)}
          >
            <SelectTrigger className="h-11 w-full rounded-[1rem] border-border/70 bg-white px-3.5 pr-9 text-[0.9rem] shadow-none dark:bg-[#162022] [&>svg]:right-3 [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-muted-foreground">
              <div className="flex min-w-0 items-center gap-1.5 pr-1">
                <ArrowUpDown className="size-[0.95rem] shrink-0 text-muted-foreground" />
                <SelectValue placeholder="Sort" />
              </div>
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(sortOptionLabels) as AccountSortOption[]).map((option) => (
                <SelectItem key={option} value={option}>
                  {sortOptionLabels[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {accounts.length === 0 ? (
          <div className="rounded-[1.8rem] border border-dashed border-border/80 bg-white px-6 py-12 text-center dark:bg-[#162022]">
            <p className="text-[1.35rem] font-semibold tracking-tight text-[#10292B] dark:text-foreground">
              {emptyTitle}
            </p>
            <p className="mx-auto mt-3 max-w-md text-[0.98rem] leading-8 text-muted-foreground">
              {emptyBody}
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-[1.85rem] border border-border/70 bg-white dark:bg-[#141d1f]">
            <div className="hidden grid-cols-[minmax(0,1.65fr)_220px_112px] items-center gap-4 border-b border-border/70 px-6 py-3.5 text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground md:grid">
              <p>Account</p>
              <p className="text-right">Balance</p>
              <p className="text-right">Actions</p>
            </div>

            <div className="space-y-2.5 p-2.5 md:space-y-0 md:p-0 md:divide-y md:divide-border/70">
              {accounts.map((account) => {
                const institutionDisplay = getInstitutionDisplay(
                  account.institution || account.name,
                );

                return (
                  <div key={account.id}>
                    <div className="rounded-[1.1rem] border border-border/70 bg-white/78 px-3.5 py-3 dark:bg-[#182123] md:hidden">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <div
                            className={`flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/70 bg-white dark:bg-[#162022] ${
                              institutionDisplay.logoPath ? "p-0" : institutionDisplay.tone
                            }`}
                          >
                            {institutionDisplay.logoPath ? (
                              <img
                                src={institutionDisplay.logoPath}
                                alt={`${institutionDisplay.label} logo`}
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <span className="text-[0.76rem] font-semibold tracking-tight">
                                {institutionDisplay.initials || "AC"}
                              </span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-[0.9rem] font-semibold tracking-tight text-[#10292B] dark:text-foreground">
                              {account.name}
                            </p>
                            <p className="mt-1 text-[0.76rem] text-muted-foreground">
                              <span className={`font-medium ${getAccountMetaTone(account.type)}`}>
                                {getAccountTypeLabel(account.type)}
                              </span>
                              <span className="mx-1.5 text-border">·</span>
                              <span>{getCurrencyLabel(account.currency)}</span>
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-1.5">
                          <Button
                            variant="outline"
                            size="icon-sm"
                            className="h-8 w-8 rounded-full"
                            onClick={() => onEdit(account)}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon-sm"
                            className="h-8 w-8 rounded-full text-destructive hover:text-destructive"
                            onClick={() => onDelete(account.id, account.name)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                      <div className="mt-3 rounded-[0.9rem] border border-border/70 bg-background/75 px-3 py-2">
                        <p className="text-[0.64rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                          {formatAccountBalanceLabel(account)}
                        </p>
                        <p className="mt-1 text-[0.84rem] font-medium tracking-tight text-[#17393c] dark:text-foreground/90">
                          {formatCurrencyMiliunits(account.balance, account.currency)}
                        </p>
                        {formatAccountBalanceDetail(account) ? (
                          <p className="mt-1 text-[0.68rem] leading-5 text-muted-foreground">
                            {formatAccountBalanceDetail(account)}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div className="hidden grid-cols-[minmax(0,1.65fr)_220px_112px] items-center gap-4 px-6 py-4 md:grid">
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-3">
                          <div
                            className={`flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/70 bg-white dark:bg-[#162022] ${
                              institutionDisplay.logoPath ? "p-0" : institutionDisplay.tone
                            }`}
                          >
                            {institutionDisplay.logoPath ? (
                              <img
                                src={institutionDisplay.logoPath}
                                alt={`${institutionDisplay.label} logo`}
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <span className="text-[0.78rem] font-semibold tracking-tight">
                                {institutionDisplay.initials || "AC"}
                              </span>
                            )}
                          </div>

                          <div className="min-w-0">
                            <p className="truncate text-[0.92rem] font-semibold tracking-tight text-[#10292B] dark:text-foreground">
                              {account.name}
                            </p>
                            <p className="mt-1 text-[0.78rem] text-muted-foreground">
                              <span className={`font-medium ${getAccountMetaTone(account.type)}`}>
                                {getAccountTypeLabel(account.type)}
                              </span>
                              <span className="mx-1.5 text-border">·</span>
                              <span>{getCurrencyLabel(account.currency)}</span>
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <p className="text-[0.86rem] font-medium tracking-tight text-[#17393c] dark:text-foreground/90">
                          {formatCurrencyMiliunits(account.balance, account.currency)}
                        </p>
                        {formatAccountBalanceDetail(account) ? (
                          <p className="mt-1 ml-auto max-w-[220px] text-[0.68rem] leading-5 text-muted-foreground">
                            {formatAccountBalanceDetail(account)}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex gap-2 justify-end">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="icon-sm"
                              className="rounded-full"
                              onClick={() => onEdit(account)}
                            >
                              <Pencil className="size-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Edit account</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="icon-sm"
                              className="rounded-full text-destructive hover:text-destructive"
                              onClick={() => onDelete(account.id, account.name)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Delete account</TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type AccountsWorkspaceProps = {
  initialQuery?: string;
};

export function AccountsWorkspace({ initialQuery = "" }: AccountsWorkspaceProps) {
  const utils = trpc.useUtils();
  const accountsQuery = trpc.accounts.list.useQuery();
  const summaryQuery = trpc.accounts.summary.useQuery();
  const aiInsightQuery = trpc.ai.accountsInsight.useQuery(undefined, {
    staleTime: 45_000,
  });
  const settingsQuery = trpc.settings.get.useQuery();
  const [open, setOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [form, setForm] = useState<CreateState>(getInitialState());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [liquidFilter, setLiquidFilter] = useState(initialQuery);
  const [liabilityFilter, setLiabilityFilter] = useState(initialQuery);
  const [liquidSort, setLiquidSort] = useState<AccountSortOption>("newest");
  const [liabilitySort, setLiabilitySort] = useState<AccountSortOption>("newest");
  const [sortsRestored, setSortsRestored] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      const storedLiquidSort = window.localStorage.getItem(LIQUID_SORT_STORAGE_KEY);
      const storedLiabilitySort = window.localStorage.getItem(LIABILITY_SORT_STORAGE_KEY);

      if (storedLiquidSort && storedLiquidSort in sortOptionLabels) {
        setLiquidSort(storedLiquidSort as AccountSortOption);
      }

      if (storedLiabilitySort && storedLiabilitySort in sortOptionLabels) {
        setLiabilitySort(storedLiabilitySort as AccountSortOption);
      }

      setSortsRestored(true);
    });
  }, []);

  useEffect(() => {
    if (!sortsRestored) return;
    window.localStorage.setItem(LIQUID_SORT_STORAGE_KEY, liquidSort);
  }, [liquidSort, sortsRestored]);

  useEffect(() => {
    if (!sortsRestored) return;
    window.localStorage.setItem(LIABILITY_SORT_STORAGE_KEY, liabilitySort);
  }, [liabilitySort, sortsRestored]);

  const refreshAccounts = async () => {
    await Promise.all([
      utils.accounts.list.invalidate(),
      utils.accounts.summary.invalidate(),
      utils.loans.list.invalidate(),
      utils.loans.summary.invalidate(),
      utils.ai.accountsInsight.invalidate(),
      utils.ai.dashboardInsight.invalidate(),
    ]);
  };

  const createAccount = trpc.accounts.create.useMutation({
    onSuccess: async () => {
      await refreshAccounts();
      setForm(getInitialState(getPreferredCurrency()));
      setEditingId(null);
      setOpen(false);
      toast.success("Account created", {
        description: "The new account is now part of your Veyra workspace.",
      });
    },
    onError: (error) => {
      toast.error("Could not create account", {
        description: error.message,
      });
    },
  });

  const updateAccount = trpc.accounts.update.useMutation({
    onSuccess: async () => {
      await refreshAccounts();
      setForm(getInitialState(getPreferredCurrency()));
      setEditingId(null);
      setOpen(false);
      toast.success("Account updated", {
        description: "Your account changes were saved.",
      });
    },
    onError: (error) => {
      toast.error("Could not save changes", {
        description: error.message,
      });
    },
  });

  const deleteAccount = trpc.accounts.remove.useMutation({
    onSuccess: async () => {
      await refreshAccounts();
      const deletedName = deleteTarget?.name;
      setDeleteTarget(null);
      toast.success("Account deleted", {
        description: deletedName
          ? `"${deletedName}" was removed from your workspace.`
          : "The account was removed from your workspace.",
      });
    },
    onError: (error) => {
      toast.error("Could not delete account", {
        description: error.message,
      });
    },
  });

  const parsedBalance = useMemo(() => {
    const numeric = Number(form.balance);
    if (Number.isNaN(numeric)) return 0;
    return Math.round(numeric * 1000);
  }, [form.balance]);

  const parsedCreditLimit = useMemo(() => {
    const numeric = Number(form.creditLimit);
    if (Number.isNaN(numeric)) return 0;
    return Math.max(Math.round(numeric * 1000), 0);
  }, [form.creditLimit]);

  const parsedAvailableCredit = useMemo(() => {
    const numeric = Number(form.availableCredit);
    if (Number.isNaN(numeric)) return 0;
    return Math.max(Math.round(numeric * 1000), 0);
  }, [form.availableCredit]);

  const accountGroups = useMemo(() => {
    const accounts = accountsQuery.data ?? [];

    return {
      liquid: accounts.filter((account) => account.type === "cash" || account.type === "wallet"),
      liabilities: accounts.filter(
        (account) => account.type === "credit" || account.type === "loan",
      ),
    };
  }, [accountsQuery.data]);
  const liquidTotalBalance = useMemo(
    () => accountGroups.liquid.reduce((sum, account) => sum + account.balance, 0),
    [accountGroups.liquid],
  );
  const liabilitiesTotalBalance = useMemo(
    () => accountGroups.liabilities.reduce((sum, account) => sum + account.balance, 0),
    [accountGroups.liabilities],
  );

  const visibleLiquidAccounts = useMemo(
    () => sortAccounts(filterAccounts(accountGroups.liquid, liquidFilter), liquidSort),
    [accountGroups.liquid, liquidFilter, liquidSort],
  );

  const visibleLiabilityAccounts = useMemo(
    () => sortAccounts(filterAccounts(accountGroups.liabilities, liabilityFilter), liabilitySort),
    [accountGroups.liabilities, liabilityFilter, liabilitySort],
  );

  const getPreferredCurrency = (): CreateState["currency"] => {
    const currency = settingsQuery.data?.defaultCurrency;
    return currency && isSupportedCurrency(currency) ? currency : "PHP";
  };

  const isSubmitting = createAccount.isPending || updateAccount.isPending;
  const isDeleting = deleteAccount.isPending;

  const resetDialogState = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setForm(getInitialState(getPreferredCurrency()));
      setEditingId(null);
    }
  };

  const startCreate = () => {
    setEditingId(null);
    setForm(getInitialState(getPreferredCurrency()));
    setOpen(true);
  };

  const startEdit = (account: AccountItem) => {
    const availableCredit =
      account.type === "credit" ? Math.max(account.creditLimit - account.balance, 0) : 0;

    setEditingId(account.id);
    setForm({
      creditInputMode: "balance",
      availableCredit: account.type === "credit" ? (availableCredit / 1000).toFixed(2) : "",
      balance: (account.balance / 1000).toFixed(2),
      creditLimit: account.type === "credit" ? (account.creditLimit / 1000).toFixed(2) : "",
      currency: isSupportedCurrency(account.currency) ? account.currency : "PHP",
      name: account.name,
      type: account.type,
    });
    setOpen(true);
  };

  const setCreditBalanceValue = (value: string) => {
    setForm((current) => {
      const numericBalance = Number(value);
      const numericLimit = Number(current.creditLimit);
      const nextAvailable =
        Number.isNaN(numericBalance) || Number.isNaN(numericLimit)
          ? ""
          : Math.max(numericLimit - numericBalance, 0).toFixed(2);

      return {
        ...current,
        balance: value,
        availableCredit: nextAvailable,
      };
    });
  };

  const setAvailableCreditValue = (value: string) => {
    setForm((current) => {
      const numericAvailable = Number(value);
      const numericLimit = Number(current.creditLimit);
      const nextBalance =
        Number.isNaN(numericAvailable) || Number.isNaN(numericLimit)
          ? ""
          : Math.max(numericLimit - numericAvailable, 0).toFixed(2);

      return {
        ...current,
        availableCredit: value,
        balance: nextBalance,
      };
    });
  };

  const setCreditLimitValue = (value: string) => {
    setForm((current) => {
      const numericLimit = Number(value);
      const nextState = {
        ...current,
        creditLimit: value,
      };

      if (Number.isNaN(numericLimit)) {
        return nextState;
      }

      if (current.creditInputMode === "available") {
        const numericAvailable = Number(current.availableCredit);
        return {
          ...nextState,
          balance: Number.isNaN(numericAvailable)
            ? ""
            : Math.max(numericLimit - numericAvailable, 0).toFixed(2),
        };
      }

      const numericBalance = Number(current.balance);
      return {
        ...nextState,
        availableCredit: Number.isNaN(numericBalance)
          ? ""
          : Math.max(numericLimit - numericBalance, 0).toFixed(2),
      };
    });
  };

  const onSubmit = () => {
    if (!form.name.trim()) return;

    if (editingId) {
      updateAccount.mutate({
        id: editingId,
        name: form.name,
        currency: form.currency,
        institution: "",
        type: form.type,
        balance: parsedBalance,
        creditLimit: form.type === "credit" ? parsedCreditLimit : 0,
      });
      return;
    }

    createAccount.mutate({
      name: form.name,
      currency: form.currency,
      institution: "",
      type: form.type,
      balance: parsedBalance,
      creditLimit: form.type === "credit" ? parsedCreditLimit : 0,
    });
  };

  const onDelete = (id: string, name: string) => {
    setDeleteTarget({ id, name });
  };

  const onConfirmDelete = () => {
    if (!deleteTarget) return;
    deleteAccount.mutate({ id: deleteTarget.id });
  };

  return (
    <div className="space-y-6 lg:space-y-7">
      <section>
        <Card className="relative overflow-hidden rounded-[1.5rem] border-white/10 bg-[linear-gradient(145deg,rgba(16,41,43,0.98),rgba(29,78,77,0.94))] text-white shadow-[0_26px_80px_-52px_rgba(10,31,34,0.62)]">
          <div className="pointer-events-none absolute inset-0 opacity-70">
            <div className="absolute inset-y-0 left-0 w-[58%] bg-[radial-gradient(circle_at_20%_26%,rgba(6,17,18,0.28),transparent_42%)]" />
            <div className="absolute inset-y-0 right-0 hidden w-[44%] bg-[radial-gradient(circle_at_72%_28%,rgba(80,255,214,0.13),transparent_30%),radial-gradient(circle_at_84%_72%,rgba(80,255,214,0.08),transparent_22%)] lg:block" />
          </div>

          <CardContent className="relative space-y-4 p-4 sm:p-5 md:space-y-4 md:p-6 lg:p-7.5">
            <div className="flex items-start justify-between gap-4">
              <p className="text-[0.84rem] font-medium tracking-[0.01em] text-white/72 md:text-[0.88rem]">
                Account posture
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="hidden h-8 rounded-full border-white/24 bg-white/[0.08] px-3 text-[0.76rem] font-medium text-white shadow-none hover:bg-white/[0.13] hover:text-white sm:inline-flex md:h-8 md:px-3.5 md:text-[0.79rem]"
                onClick={startCreate}
              >
                Add account
              </Button>
            </div>

            <div className="grid gap-4 border-border/70 md:min-h-[7.7rem] md:grid-cols-[minmax(0,1.5fr)_minmax(0,1.02fr)_minmax(0,0.92fr)] md:gap-0">
              <div className="space-y-2.5 md:space-y-3 md:pr-7">
                <h2 className="text-[0.98rem] font-semibold tracking-tight text-white/95 md:text-[1.08rem] lg:text-[1.16rem]">
                  Account posture
                </h2>
                <div className="flex items-center gap-2 text-[1.06rem] font-semibold leading-none tracking-tight text-white md:text-[1.34rem] lg:text-[1.48rem]">
                  <span className="size-2.5 rounded-full bg-emerald-400 md:size-3" />
                  See every balance in one clear shape
                </div>
                <p className="max-w-[30ch] text-[0.9rem] leading-6 text-white/74 md:max-w-[34ch] md:text-[0.93rem] md:leading-7">
                  Track liquid cash, credit exposure, and account currencies without losing each
                  institution’s identity.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-0 border-t border-white/15 pt-3.5 md:border-0 md:border-l md:border-white/15 md:pl-7 md:pt-0">
                <div className="space-y-2.5 pr-4 md:pr-5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[0.82rem] text-white/70 md:text-[0.88rem]">Liquid</p>
                    <span className="flex size-8.5 items-center justify-center rounded-full bg-emerald-100/95 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200 md:size-9">
                      <Wallet className="size-3.5 md:size-[0.95rem]" />
                    </span>
                  </div>
                  <p className="text-[0.96rem] font-semibold tracking-tight text-white md:text-[1.18rem] lg:text-[1.28rem]">
                    {String(accountGroups.liquid.length)}
                  </p>
                  <p className="text-[0.78rem] leading-5.5 text-white/64 md:text-[0.82rem] md:leading-6">
                    {formatCurrencyMiliunits(liquidTotalBalance, "PHP")}
                  </p>
                </div>

                <div className="space-y-2.5 border-l border-white/15 pl-4 pr-4 md:pr-5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[0.82rem] text-white/70 md:text-[0.88rem]">Liabilities</p>
                    <span className="flex size-8.5 items-center justify-center rounded-full bg-sky-100/95 text-sky-700 dark:bg-sky-500/20 dark:text-sky-200 md:size-9">
                      <CreditCard className="size-3.5 md:size-[0.95rem]" />
                    </span>
                  </div>
                  <p className="text-[0.96rem] font-semibold tracking-tight text-white md:text-[1.18rem] lg:text-[1.28rem]">
                    {String(accountGroups.liabilities.length)}
                  </p>
                  <p className="text-[0.78rem] leading-5.5 text-white/64 md:text-[0.82rem] md:leading-6">
                    {formatCurrencyMiliunits(liabilitiesTotalBalance, "PHP")}
                  </p>
                </div>
              </div>

              <div className="hidden space-y-2 border-t border-white/15 pt-4 md:block md:border-0 md:border-l md:border-white/15 md:pl-7 md:pt-0">
                <div className="flex items-center gap-2 text-[0.82rem] text-white/70">
                  <Globe2 className="size-4" />
                  Currency in use
                </div>
                <p className="line-clamp-2 text-[0.95rem] font-semibold tracking-tight text-white lg:text-[0.99rem]">
                  {summaryQuery.data?.activeCurrencies ?? 0} active{" "}
                  {summaryQuery.data?.activeCurrencies === 1 ? "currency" : "currencies"}
                </p>
                <p className="text-[0.82rem] leading-6 text-white/70">
                  {summaryQuery.data?.totalAccounts ?? 0} tracked accounts across your workspace
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section>
        <Card className="border-white/75 bg-white/84 shadow-[0_24px_70px_-55px_rgba(10,31,34,0.28)] dark:border-white/8 dark:bg-[#182123] dark:shadow-[0_28px_80px_-55px_rgba(0,0,0,0.62)]">
          <CardContent className="space-y-3.5 px-5 py-5 sm:px-6 sm:py-5.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="flex size-8 items-center justify-center rounded-full bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-200">
                  <Sparkles className="size-3.5" />
                </div>
                <div>
                  <p className="text-[0.68rem] uppercase tracking-[0.11em] text-muted-foreground">
                    AI insight
                  </p>
                  <h3 className="text-[0.95rem] font-semibold tracking-tight text-[#10292B] dark:text-foreground">
                    {aiInsightQuery.data?.headline ?? "AI accounts watchdog"}
                  </h3>
                </div>
              </div>
              <span className="rounded-full border border-border/70 bg-background px-2.5 py-1 text-[0.72rem] text-muted-foreground">
                {aiInsightQuery.data?.confidence ?? "Initial estimate"}
              </span>
            </div>

            <p className="text-[0.86rem] leading-6 text-muted-foreground">
              {aiInsightQuery.data?.summary ?? "Account pressure signals will appear here."}
            </p>

            <div className="grid gap-2.5 md:grid-cols-4">
              {(aiInsightQuery.data?.metrics ?? []).map((metric) => (
                <div
                  key={metric.label}
                  className="rounded-xl border border-border/70 bg-background px-3.5 py-3 dark:bg-[#141d1f]"
                >
                  <p className="text-[0.7rem] uppercase tracking-[0.1em] text-muted-foreground">
                    {metric.label}
                  </p>
                  <p
                    className={`mt-1 text-[0.9rem] font-semibold ${
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
              <p className="text-[0.7rem] uppercase tracking-[0.1em] text-muted-foreground">Recommended next step</p>
              <p className="mt-1 text-[0.88rem] text-foreground">
                {aiInsightQuery.data?.recommendations?.[0] ?? "No recommendation yet."}
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      <section>
        <Dialog open={open} onOpenChange={resetDialogState}>
          <DialogContent mobileBehavior="adaptive" className={accountDialogContentClassName}>
                <AccountDialogShell
                  badge={
                    <div className="inline-flex w-fit rounded-full border border-[#17393c]/10 bg-white px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-[#17393c] dark:border-white/8 dark:bg-white/6 dark:text-primary">
                      Account setup
                    </div>
                  }
                  title={editingId ? "Edit account" : "Add account"}
                  description={
                    <p className="hidden max-w-lg text-[0.9rem] leading-6 text-muted-foreground sm:block">
                      Start with the essentials: account name, type, currency, and opening balance.
                    </p>
                  }
                  body={
                    <div className="space-y-3.5 sm:space-y-4">
                      <section className="space-y-2.5 border-b border-border/50 pb-3.5">
                        <div className="space-y-1">
                          <h3 className="text-[1rem] font-semibold tracking-tight text-foreground">
                            Account basics
                          </h3>
                          <p className="text-[0.82rem] leading-5.5 text-muted-foreground">
                            Name the account, choose its type, and keep the original currency
                            intact.
                          </p>
                        </div>

                        <div className="space-y-3">
                          <div className="space-y-2">
                            <label className={accountFieldLabelClassName}>Account name</label>
                            <Input
                              value={form.name}
                              onChange={(event) =>
                                setForm((current) => ({ ...current, name: event.target.value }))
                              }
                              placeholder="e.g. Emergency fund"
                              className={accountInputClassName}
                            />
                          </div>

                          <div className="grid gap-3">
                            <div className="space-y-2">
                              <label className={accountFieldLabelClassName}>Account type</label>
                              <div className="grid grid-cols-2 gap-2">
                                {accountTypeOptions.map((option) => (
                                  <button
                                    key={option.value}
                                    type="button"
                                    onClick={() =>
                                      setForm((current) => ({ ...current, type: option.value }))
                                    }
                                    className={`h-9.5 rounded-[0.8rem] border px-3 text-[0.86rem] font-medium transition ${
                                      form.type === option.value
                                        ? "border-[#17393c] bg-[#17393c] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                                        : "border-border/80 bg-background text-foreground hover:bg-muted/70"
                                    }`}
                                  >
                                    {option.label}
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div className="space-y-2">
                              <label className={accountFieldLabelClassName}>Currency</label>
                              <Select
                                value={form.currency}
                                onValueChange={(value) =>
                                  setForm((current) => ({
                                    ...current,
                                    currency: value as CreateState["currency"],
                                  }))
                                }
                              >
                                <SelectTrigger className={accountFieldClassName}>
                                  <SelectValue placeholder="Select currency" />
                                </SelectTrigger>
                                <SelectContent>
                                  {supportedCurrencies.map((currency) => (
                                    <SelectItem key={currency} value={currency}>
                                      {currency} · {getCurrencyLabel(currency)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </div>
                      </section>

                      {form.type !== "credit" ? (
                        <section className="space-y-2.5">
                          <div className="space-y-1">
                            <h3 className="text-[1rem] font-semibold tracking-tight text-foreground">
                              Balance setup
                            </h3>
                            <p className="text-[0.82rem] leading-5.5 text-muted-foreground">
                              Enter the starting balance for this account.
                            </p>
                          </div>

                          <div className="space-y-2">
                            <div className="space-y-2">
                              <label className={accountFieldLabelClassName}>
                                {form.type === "loan" ? "Current loan balance" : "Opening balance"}
                              </label>
                              <Input
                                type="number"
                                inputMode="decimal"
                                value={form.balance}
                                onChange={(event) =>
                                  setForm((current) => ({
                                    ...current,
                                    balance: event.target.value,
                                  }))
                                }
                                placeholder="0.00"
                                className={accountInputClassName}
                              />
                            </div>

                            <p className="max-w-[420px] rounded-[0.9rem] border border-dashed border-border/70 bg-white px-3.5 py-2.5 text-[0.78rem] leading-5.5 text-muted-foreground dark:bg-[#162022]">
                              Balances are stored in each account’s native currency. Cross-currency
                              rollups can be layered on later.
                            </p>
                          </div>
                        </section>
                      ) : null}

                      {form.type === "credit" ? (
                        <section className="space-y-2.5">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <h3 className="text-[1rem] font-semibold tracking-tight text-foreground">
                                Credit details
                              </h3>
                              <span className="rounded-full border border-border/70 bg-muted px-2 py-0.5 text-[0.66rem] font-medium text-muted-foreground">
                                Credit only
                              </span>
                            </div>
                            <p className="text-[0.82rem] leading-5.5 text-muted-foreground">
                              Enter the limit and the figure you currently know.
                            </p>
                          </div>

                          <div className="space-y-2.5 rounded-[0.95rem] border border-border/70 bg-white/60 p-3.5 dark:bg-[#182123]">
                            <div className="grid gap-3">
                              <div className="space-y-2">
                                <label className={accountFieldLabelClassName}>Credit limit</label>
                                <Input
                                  type="number"
                                  inputMode="decimal"
                                  value={form.creditLimit}
                                  onChange={(event) => setCreditLimitValue(event.target.value)}
                                  placeholder="0.00"
                                  className={accountInputClassName}
                                />
                              </div>

                              <div className="space-y-2">
                                <label className={accountFieldLabelClassName}>Input mode</label>
                                <div className="grid grid-cols-2 gap-2">
                                  {[
                                    { label: "Balance", value: "balance" as const },
                                    { label: "Available", value: "available" as const },
                                  ].map((option) => (
                                    <button
                                      key={option.value}
                                      type="button"
                                      onClick={() =>
                                        setForm((current) => ({
                                          ...current,
                                          creditInputMode: option.value,
                                        }))
                                      }
                                      className={`flex h-9.5 items-center justify-center rounded-[0.8rem] border px-3 text-center text-[0.82rem] font-medium transition ${
                                        form.creditInputMode === option.value
                                          ? "border-[#17393c] bg-[#17393c] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                                          : "border-border/80 bg-background text-foreground hover:bg-muted/70"
                                      }`}
                                    >
                                      {option.label}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              <div className="space-y-2">
                                <label className={accountFieldLabelClassName}>
                                  {form.creditInputMode === "available"
                                    ? "Available credit"
                                    : "Current balance"}
                                </label>
                                <Input
                                  type="number"
                                  inputMode="decimal"
                                  value={
                                    form.creditInputMode === "available"
                                      ? form.availableCredit
                                      : form.balance
                                  }
                                  onChange={(event) =>
                                    form.creditInputMode === "available"
                                      ? setAvailableCreditValue(event.target.value)
                                      : setCreditBalanceValue(event.target.value)
                                  }
                                  placeholder="0.00"
                                  className={accountInputClassName}
                                />
                              </div>

                              <div className="space-y-2">
                                <label className={accountFieldLabelClassName}>
                                  {form.creditInputMode === "available"
                                    ? "Computed balance"
                                    : "Computed available"}
                                </label>
                                <div className="flex h-10 items-center rounded-[0.8rem] border border-border/80 bg-muted/45 px-3.5 text-[0.88rem] font-medium text-muted-foreground">
                                  {form.creditInputMode === "available"
                                    ? formatCurrencyMiliunits(parsedBalance, form.currency)
                                    : formatCurrencyMiliunits(parsedAvailableCredit, form.currency)}
                                </div>
                              </div>
                            </div>

                            <p className="rounded-[0.9rem] border border-dashed border-border/70 bg-white px-3.5 py-2.5 text-[0.78rem] leading-5.5 text-muted-foreground dark:bg-[#162022]">
                              For credit cards, credit limit stays fixed while current balance
                              tracks what you owe. If you only know the available credit from your
                              banking app, Veyra can derive the balance for you.
                            </p>
                          </div>
                        </section>
                      ) : null}

                      {(createAccount.error || updateAccount.error) && (
                        <p className="rounded-[0.95rem] border border-destructive/20 bg-destructive/5 px-3.5 py-2.5 text-[0.88rem] text-destructive">
                          {createAccount.error?.message ?? updateAccount.error?.message}
                        </p>
                      )}
                    </div>
                  }
                  footer={
                    <div className="flex items-center justify-end gap-2.5">
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-9.5 rounded-full px-4 text-[0.88rem] text-foreground/80 hover:bg-muted"
                        onClick={() => resetDialogState(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={onSubmit}
                        disabled={!form.name.trim() || isSubmitting}
                        className="h-10 w-full rounded-[0.95rem] bg-[#17393c] px-6 text-[0.9rem] font-medium text-white hover:bg-[#1d4a4d] disabled:text-white/85 sm:min-w-44 sm:w-auto"
                      >
                        {isSubmitting
                          ? editingId
                            ? "Saving changes..."
                            : "Creating account..."
                          : editingId
                            ? "Save changes"
                            : "Create account"}
                      </Button>
                    </div>
                  }
                />
          </DialogContent>
        </Dialog>
      </section>

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(nextOpen) => {
          if (!isDeleting && !nextOpen) {
            setDeleteTarget(null);
          }
        }}
      >
        <DialogContent mobileBehavior="modal" className={accountConfirmDialogContentClassName}>
          <DialogHeader className="shrink-0 border-b border-border/70 px-5 pb-3.5 pt-[max(1rem,env(safe-area-inset-top))] pr-14 sm:px-6 sm:pb-4 sm:pt-5 sm:pr-16">
            <div className="inline-flex w-fit rounded-full border border-destructive/15 bg-destructive/5 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-destructive">
              Confirm delete
            </div>
            <DialogTitle className="pt-1.5 text-[1.2rem] tracking-tight text-[#10292B] dark:text-foreground sm:pt-2.5 sm:text-[1.45rem]">
              Remove this account?
            </DialogTitle>
            <p className="max-w-md text-[0.88rem] leading-6 text-muted-foreground sm:text-[0.92rem] sm:leading-6.5">
              {deleteTarget
                ? `Delete "${deleteTarget.name}" from your Veyra workspace? This action cannot be undone.`
                : "Delete this account from your Veyra workspace? This action cannot be undone."}
            </p>
          </DialogHeader>

          <div className="grid shrink-0 grid-cols-2 gap-2.5 px-5 pb-[max(0.8rem,env(safe-area-inset-bottom))] pt-3 sm:flex sm:justify-end sm:px-6 sm:py-4">
            <Button
              type="button"
              variant="outline"
              className="h-9.5 w-full rounded-full px-4.5 sm:h-10 sm:w-auto"
              onClick={() => setDeleteTarget(null)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="h-9.5 w-full rounded-full bg-destructive px-4.5 text-white hover:bg-destructive/90 sm:h-10 sm:w-auto"
              onClick={onConfirmDelete}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete account"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {accountsQuery.isLoading ? (
        <section className="grid gap-6 xl:grid-cols-2">
          {Array.from({ length: 2 }).map((_, index) => (
            <div
              key={index}
              className="h-[24rem] animate-pulse rounded-[1.9rem] border border-white/75 bg-white/75 dark:border-white/8 dark:bg-[#182123]"
            />
          ))}
        </section>
      ) : (
        <section className="grid gap-6 xl:grid-cols-2">
          <AccountSection
            title="Bank and wallet accounts"
            description={`${formatCount(accountGroups.liquid.length, "account")} connected for bank and wallet balances.`}
            totalBalanceLabel={formatCurrencyMiliunits(liquidTotalBalance, "PHP")}
            filterValue={liquidFilter}
            onFilterChange={setLiquidFilter}
            sortValue={liquidSort}
            onSortChange={setLiquidSort}
            accounts={visibleLiquidAccounts}
            onEdit={startEdit}
            onDelete={onDelete}
            emptyTitle="No liquid accounts yet"
            emptyBody="Add a bank or wallet account to start building your day-to-day balance view."
          />

          <AccountSection
            title="Credit and loans"
            description={`${formatCount(accountGroups.liabilities.length, "account")} connected for liabilities and borrowing.`}
            totalBalanceLabel={formatCurrencyMiliunits(liabilitiesTotalBalance, "PHP")}
            filterValue={liabilityFilter}
            onFilterChange={setLiabilityFilter}
            sortValue={liabilitySort}
            onSortChange={setLiabilitySort}
            accounts={visibleLiabilityAccounts}
            onEdit={startEdit}
            onDelete={onDelete}
            emptyTitle="No liabilities yet"
            emptyBody="Credit cards and loan accounts will appear here once you add them to the workspace."
          />
        </section>
      )}

      <div className="fixed bottom-[max(0.9rem,env(safe-area-inset-bottom))] right-4 z-30 md:hidden">
        <Button
          type="button"
          size="icon"
          className="h-12 w-12 rounded-full bg-[#17393c] text-white shadow-[0_22px_36px_-22px_rgba(10,31,34,0.45)] hover:bg-[#1d4a4d] hover:text-white"
          onClick={startCreate}
        >
          <Plus className="size-5" />
          <span className="sr-only">Add account</span>
        </Button>
      </div>
    </div>
  );
}
