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
  Search,
  Trash2,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";

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
  DialogTrigger,
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
  "h-10.5 w-full rounded-[0.9rem] border-border/70 bg-[#fbfaf6] px-3.5 text-[0.9rem] shadow-none transition-colors dark:bg-[#162022] focus-visible:border-[#8db8b3] focus-visible:ring-2 focus-visible:ring-[#8db8b3]/20";

const accountFieldLabelClassName =
  "block text-[0.88rem] font-semibold leading-none tracking-tight text-foreground";

const accountDialogContentClassName =
  "h-[100dvh] w-screen max-w-none overflow-x-hidden overflow-y-hidden rounded-none border-0 bg-background px-0 py-0 ring-0 sm:h-auto sm:max-h-[calc(100svh-2rem)] sm:w-auto sm:max-w-[56rem] sm:rounded-[1.45rem] sm:border sm:border-border/70 sm:bg-background/98 sm:shadow-[0_32px_90px_-58px_rgba(10,31,34,0.4)] [&_[data-slot='dialog-close']]:right-5 [&_[data-slot='dialog-close']]:top-5 [&_[data-slot='dialog-close']]:h-10 [&_[data-slot='dialog-close']]:w-10 [&_[data-slot='dialog-close']]:rounded-full [&_[data-slot='dialog-close']]:border [&_[data-slot='dialog-close']]:border-border/70 [&_[data-slot='dialog-close']]:bg-background/92 [&_[data-slot='dialog-close']]:shadow-sm"

const accountDialogHeaderClassName =
  "shrink-0 border-b border-border/70 px-4 pb-2.5 pt-[max(1rem,env(safe-area-inset-top))] pr-14 sm:px-7 sm:pb-3 sm:pt-5.5 sm:pr-16"

const accountDialogBodyClassName =
  "min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-2.5 sm:px-7 sm:py-3"

const accountDialogFooterClassName =
  "shrink-0 border-t border-border/70 px-4 pb-[max(0.8rem,env(safe-area-inset-bottom))] pt-2.5 sm:px-7 sm:py-3";
const accountConfirmDialogContentClassName =
  "max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] overflow-x-hidden overflow-y-auto rounded-[1.35rem] border-border/70 bg-background/98 px-0 py-0 ring-0 sm:max-h-[calc(100svh-2rem)] sm:w-auto sm:max-w-lg sm:rounded-[1.6rem]";

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
  title,
}: AccountSectionProps) {
  return (
    <Card className="border-white/75 bg-white/82 shadow-[0_24px_70px_-55px_rgba(10,31,34,0.28)] dark:border-white/8 dark:bg-[#182123] dark:shadow-[0_28px_80px_-55px_rgba(0,0,0,0.62)]">
      <CardHeader className="gap-3 pb-3.5">
        <div className="space-y-1">
          <CardTitle className="text-[1.14rem] tracking-tight text-[#10292B] dark:text-foreground sm:text-[1.18rem]">
            {title}
          </CardTitle>
          <CardDescription className="max-w-[34rem] text-[0.88rem] leading-6 sm:text-[0.9rem]">
            {description}
          </CardDescription>
        </div>

        <div className="grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_170px] sm:items-center">
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-[0.95rem] -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filterValue}
              onChange={(event) => onFilterChange(event.target.value)}
              placeholder="Filter accounts"
              className="h-11 rounded-[1rem] border-border/70 bg-[#fbfaf6] pl-10 pr-4 text-[0.92rem] shadow-none dark:bg-[#162022]"
            />
          </div>
          <Select
            value={sortValue}
            onValueChange={(value) => onSortChange(value as AccountSortOption)}
          >
            <SelectTrigger className="h-11 w-full rounded-[1rem] border-border/70 bg-[#fbfaf6] px-3.5 pr-9 text-[0.9rem] shadow-none dark:bg-[#162022] [&>svg]:right-3 [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-muted-foreground">
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
          <div className="rounded-[1.8rem] border border-dashed border-border/80 bg-[#fbfaf6] px-6 py-12 text-center dark:bg-[#162022]">
            <p className="text-[1.35rem] font-semibold tracking-tight text-[#10292B] dark:text-foreground">
              {emptyTitle}
            </p>
            <p className="mx-auto mt-3 max-w-md text-[0.98rem] leading-8 text-muted-foreground">
              {emptyBody}
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-[1.85rem] border border-border/70 bg-[#fdfcf8] dark:bg-[#141d1f]">
            <div className="hidden grid-cols-[minmax(0,1.65fr)_220px_112px] items-center gap-4 border-b border-border/70 px-6 py-3.5 text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground md:grid">
              <p>Account</p>
              <p className="text-right">Balance</p>
              <p className="text-right">Actions</p>
            </div>

            <div className="divide-y divide-border/70">
              {accounts.map((account) => {
                const institutionDisplay = getInstitutionDisplay(
                  account.institution || account.name,
                );

                return (
                  <div
                    key={account.id}
                    className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,1.65fr)_220px_112px] md:items-center md:gap-4 md:px-6"
                  >
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-3">
                        <div
                          className={`flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/70 bg-[#f6f5ef] dark:bg-[#162022] ${
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

                    <div className="flex items-start justify-between gap-3 md:block md:text-right">
                      <div>
                        <p className="text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground md:hidden">
                          {formatAccountBalanceLabel(account)}
                        </p>
                        <p className="mt-1 text-[0.9rem] font-semibold tracking-tight text-[#10292B] dark:text-foreground md:mt-0">
                          {formatCurrencyMiliunits(account.balance, account.currency)}
                        </p>
                        {formatAccountBalanceDetail(account) ? (
                          <p className="mt-1 text-[0.68rem] leading-5 text-muted-foreground md:ml-auto md:max-w-[220px] md:text-right">
                            {formatAccountBalanceDetail(account)}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex gap-2 md:hidden">
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

                    <div className="hidden gap-2 md:flex md:justify-end">
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
    await Promise.all([utils.accounts.list.invalidate(), utils.accounts.summary.invalidate()]);
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
        <Card className="relative overflow-hidden rounded-[1.75rem] border-white/10 bg-[linear-gradient(145deg,#0D2F31,#123E40_52%,#1B5A57)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_28px_90px_-60px_rgba(10,31,34,0.85)]">
          <div className="pointer-events-none absolute inset-0 opacity-70">
            <div className="absolute inset-y-0 left-0 w-[58%] bg-[radial-gradient(circle_at_20%_26%,rgba(6,17,18,0.28),transparent_42%)]" />
            <div className="absolute inset-y-0 right-0 hidden w-[44%] bg-[radial-gradient(circle_at_72%_28%,rgba(80,255,214,0.13),transparent_30%),radial-gradient(circle_at_84%_72%,rgba(80,255,214,0.08),transparent_22%)] lg:block" />
          </div>

          <div className="pointer-events-none absolute inset-y-0 right-[7%] hidden w-[42%] opacity-30 lg:block">
            <svg viewBox="0 0 560 320" className="h-full w-full">
              <path
                d="M30 240 C120 240, 150 250, 205 210 S320 118, 395 112 S470 76, 535 38"
                fill="none"
                stroke="rgba(115,255,217,0.52)"
                strokeWidth="4"
                strokeLinecap="round"
              />
              <path
                d="M92 278 C170 252, 230 198, 305 162 S414 122, 500 84"
                fill="none"
                stroke="rgba(115,255,217,0.12)"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path
                d="M126 204 C176 170, 232 138, 302 116 S412 88, 498 74"
                fill="none"
                stroke="rgba(115,255,217,0.08)"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <circle cx="205" cy="210" r="7" fill="rgba(115,255,217,0.78)" />
              <circle cx="395" cy="112" r="7" fill="rgba(115,255,217,0.82)" />
              <circle cx="535" cy="38" r="8" fill="rgba(115,255,217,0.95)" />
            </svg>
          </div>

          <CardContent className="relative p-5 sm:p-6 lg:px-7 lg:py-6">
            <div className="hidden gap-6 lg:grid lg:grid-cols-[minmax(0,1.12fr)_minmax(0,0.88fr)] lg:items-start">
              <div className="space-y-4 pt-0.5">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-[#123E40]/85 px-3 py-1.5 text-[0.74rem] font-semibold uppercase tracking-[0.18em] text-[#9CF5D7] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-sm">
                  <span className="size-2 rounded-full bg-[#49D399]" />
                  Accounts workspace
                </div>

                <div className="space-y-2.5">
                  <h1 className="max-w-[13ch] text-[2rem] font-semibold leading-[1.03] tracking-tight text-white xl:text-[2.24rem]">
                    See every balance in one clear shape.
                  </h1>
                  <p className="max-w-[31rem] text-[0.95rem] leading-6.5 text-white/76">
                    Track liquid cash, credit exposure, and account currencies without losing each
                    institution’s identity.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2.5 pt-0.5">
                  <div className="inline-flex items-center gap-3 rounded-[1.05rem] border border-white/10 bg-white/[0.06] px-3.5 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-sm">
                    <span className="flex size-10 items-center justify-center rounded-full bg-[#CFF4E7] text-[#175C46]">
                      <Landmark className="size-4.5" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-[1.5rem] font-semibold leading-none tracking-tight text-white">
                          {summaryQuery.data?.totalAccounts ?? 0}
                        </span>
                        <span className="text-[0.86rem] leading-5 text-white/72">Tracked</span>
                      </div>
                      <p className="text-[0.8rem] leading-5 text-white/68">accounts</p>
                    </div>
                  </div>

                  <div className="inline-flex items-center gap-3 rounded-[1.05rem] border border-white/10 bg-white/[0.06] px-3.5 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-sm">
                    <span className="flex size-10 items-center justify-center rounded-full bg-[#163F40] text-[#49D399] ring-1 ring-inset ring-white/6">
                      <Wallet className="size-4.5" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-[1.5rem] font-semibold leading-none tracking-tight text-white">
                          {accountGroups.liquid.length}
                        </span>
                        <span className="text-[0.86rem] leading-5 text-white/72">Liquid</span>
                      </div>
                      <p className="text-[0.8rem] leading-5 text-white/68">accounts</p>
                    </div>
                  </div>

                  <div className="inline-flex items-center gap-3 rounded-[1.05rem] border border-white/10 bg-white/[0.06] px-3.5 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-sm">
                    <span className="flex size-10 items-center justify-center rounded-full bg-[#203A52] text-[#7DD3FC] ring-1 ring-inset ring-white/6">
                      <CreditCard className="size-4.5" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-[1.5rem] font-semibold leading-none tracking-tight text-white">
                          {accountGroups.liabilities.length}
                        </span>
                        <span className="text-[0.86rem] leading-5 text-white/72">Liabilities</span>
                      </div>
                      <p className="text-[0.8rem] leading-5 text-white/68">accounts</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="relative hidden min-h-[292px] lg:block">
                <div className="absolute inset-y-10 left-18 right-6 rounded-full bg-[radial-gradient(circle_at_72%_50%,rgba(80,255,214,0.18),transparent_24%),radial-gradient(circle_at_84%_64%,rgba(80,255,214,0.08),transparent_18%)] blur-3xl" />
                <div className="absolute inset-x-6 inset-y-2">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_74%_46%,rgba(124,243,199,0.12),transparent_18%)]" />
                  <div className="absolute inset-0 flex items-center justify-center opacity-46">
                    <div className="h-[120%] w-[120%] translate-x-[9%] scale-[1.01]">
                      <DotLottieReact src="/line.json" autoplay loop className="h-full w-full" />
                    </div>
                  </div>
                  <div className="absolute inset-x-10 bottom-0 h-24 bg-[linear-gradient(180deg,transparent,rgba(13,47,49,0.28))] blur-sm" />
                </div>
              </div>
            </div>

            <div className="mt-4 space-y-3 lg:hidden">
              <div className="grid grid-cols-3 gap-2 rounded-[1.1rem] border border-white/10 bg-white/[0.05] p-3 backdrop-blur-sm">
                <div className="rounded-[0.95rem] border border-white/8 bg-white/[0.04] px-3 py-3 text-center">
                  <p className="text-[1.25rem] font-semibold leading-none tracking-tight text-white">
                    {summaryQuery.data?.totalAccounts ?? 0}
                  </p>
                  <p className="mt-1.5 text-[0.72rem] leading-5 text-white/68">Tracked</p>
                </div>
                <div className="rounded-[0.95rem] border border-white/8 bg-white/[0.04] px-3 py-3 text-center">
                  <p className="text-[1.25rem] font-semibold leading-none tracking-tight text-white">
                    {accountGroups.liquid.length}
                  </p>
                  <p className="mt-1.5 text-[0.72rem] leading-5 text-white/68">Liquid</p>
                </div>
                <div className="rounded-[0.95rem] border border-white/8 bg-white/[0.04] px-3 py-3 text-center">
                  <p className="text-[1.25rem] font-semibold leading-none tracking-tight text-white">
                    {accountGroups.liabilities.length}
                  </p>
                  <p className="mt-1.5 text-[0.72rem] leading-5 text-white/68">Liabilities</p>
                </div>
              </div>

              <div className="rounded-[1.1rem] border border-white/10 bg-white/[0.05] p-3 backdrop-blur-sm">
                <div className="flex items-center justify-between gap-3 rounded-[0.95rem] border border-white/8 bg-white/[0.04] px-3 py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-full bg-[#17334A] text-[#7DD3FC] ring-1 ring-inset ring-white/5">
                      <Globe2 className="size-4.5" />
                    </span>
                    <div>
                      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#7DD3FC]">
                        Currency in use
                      </p>
                      <p className="mt-1 text-[1.2rem] font-semibold leading-none tracking-tight text-white">
                        {summaryQuery.data?.activeCurrencies ?? 0}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center">
                    <span className="-mr-2 flex size-8 items-center justify-center rounded-full bg-[#3D77AF] text-[0.9rem] font-semibold text-white/95 ring-1 ring-white/8">
                      P
                    </span>
                    <span className="-mr-2 flex size-8 items-center justify-center rounded-full bg-[#4B89BD]/85 ring-1 ring-white/8" />
                    <span className="flex size-8 items-center justify-center rounded-full bg-[#5E99C7]/70 ring-1 ring-white/8" />
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section>
        <Card className="border-white/75 bg-white/84 shadow-[0_24px_70px_-55px_rgba(10,31,34,0.28)] dark:border-white/8 dark:bg-[#182123] dark:shadow-[0_28px_80px_-55px_rgba(0,0,0,0.62)]">
          <CardHeader className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1.5">
              <CardTitle className="text-[1.45rem] tracking-tight text-[#10292B] dark:text-foreground">
                Account management
              </CardTitle>
              <CardDescription className="max-w-3xl text-[0.96rem] leading-7">
                Add and maintain the accounts that feed balances, budgets, and the rest of your
                workspace.
              </CardDescription>
            </div>

            <Dialog open={open} onOpenChange={resetDialogState}>
              <DialogTrigger asChild>
                <Button
                  onClick={startCreate}
                  className="rounded-full bg-[#17393c] px-5 text-white hover:bg-[#1d4a4d] dark:bg-[#20474a] dark:text-white dark:hover:bg-[#28595c]"
                >
                  <Plus className="size-4" />
                  Add account
                </Button>
              </DialogTrigger>

              <DialogContent className={accountDialogContentClassName}>
                <AccountDialogShell
                  badge={
                    <div className="inline-flex w-fit rounded-full border border-[#17393c]/10 bg-[#17393c]/5 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-[#17393c] dark:border-white/8 dark:bg-white/6 dark:text-primary">
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
                    <div className="mx-auto max-w-[840px] space-y-4 sm:space-y-4.5">
                      <section className="space-y-3 border-b border-border/50 pb-4">
                        <div className="space-y-1">
                          <h3 className="text-[1rem] font-semibold tracking-tight text-foreground">
                            Account basics
                          </h3>
                          <p className="text-[0.82rem] leading-5.5 text-muted-foreground">
                            Name the account, choose its type, and keep the original currency intact.
                          </p>
                        </div>

                        <div className="space-y-3.5">
                          <div className="space-y-2">
                            <label className={accountFieldLabelClassName}>Account name</label>
                            <Input
                              value={form.name}
                              onChange={(event) =>
                                setForm((current) => ({ ...current, name: event.target.value }))
                              }
                              placeholder="e.g. Emergency fund"
                              className={accountFieldClassName}
                            />
                          </div>

                          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px] sm:items-start">
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
                                    className={`h-10 rounded-[0.9rem] border px-3 text-[0.88rem] font-medium transition ${
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
                        <section className="space-y-3">
                          <div className="space-y-1">
                            <h3 className="text-[1rem] font-semibold tracking-tight text-foreground">
                              Balance setup
                            </h3>
                            <p className="text-[0.82rem] leading-5.5 text-muted-foreground">
                              Enter the starting balance for this account.
                            </p>
                          </div>

                          <div className="space-y-2.5">
                            <div className="space-y-2">
                              <label className={accountFieldLabelClassName}>
                                {form.type === "loan" ? "Current loan balance" : "Opening balance"}
                              </label>
                              <Input
                                type="number"
                                inputMode="decimal"
                                value={form.balance}
                                onChange={(event) =>
                                  setForm((current) => ({ ...current, balance: event.target.value }))
                                }
                                placeholder="0.00"
                                className={accountFieldClassName}
                              />
                            </div>

                            <p className="max-w-[420px] rounded-[0.95rem] border border-dashed border-border/70 bg-[#fbfaf6] px-4 py-3 text-[0.8rem] leading-6 text-muted-foreground dark:bg-[#162022]">
                              Balances are stored in each account’s native currency. Cross-currency rollups can be layered on later.
                            </p>
                          </div>
                        </section>
                      ) : null}

                      {form.type === "credit" ? (
                        <section className="space-y-3">
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

                          <div className="space-y-3 rounded-[1rem] border border-border/70 bg-white/60 p-4 dark:bg-[#182123]">
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4">
                              <div className="space-y-2">
                                <label className={accountFieldLabelClassName}>Credit limit</label>
                                <Input
                                  type="number"
                                  inputMode="decimal"
                                  value={form.creditLimit}
                                  onChange={(event) => setCreditLimitValue(event.target.value)}
                                  placeholder="0.00"
                                  className={accountFieldClassName}
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
                                      className={`flex h-10 items-center justify-center rounded-[0.9rem] border px-3 text-center text-[0.84rem] font-medium transition ${
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
                                  className={accountFieldClassName}
                                />
                              </div>

                              <div className="space-y-2">
                                <label className={accountFieldLabelClassName}>
                                  {form.creditInputMode === "available"
                                    ? "Computed balance"
                                    : "Computed available"}
                                </label>
                                <div className="flex h-10.5 items-center rounded-[0.9rem] border border-border/80 bg-muted/45 px-3.5 text-[0.9rem] font-medium text-muted-foreground">
                                  {form.creditInputMode === "available"
                                    ? formatCurrencyMiliunits(parsedBalance, form.currency)
                                    : formatCurrencyMiliunits(parsedAvailableCredit, form.currency)}
                                </div>
                              </div>
                            </div>

                            <p className="rounded-[0.95rem] border border-dashed border-border/70 bg-[#fbfaf6] px-4 py-3 text-[0.8rem] leading-6 text-muted-foreground dark:bg-[#162022]">
                              For credit cards, credit limit stays fixed while current balance tracks what you owe. If you only know the available credit from your banking app, Veyra can derive the balance for you.
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
          </CardHeader>
        </Card>
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
          <DialogHeader className="shrink-0 border-b border-border/70 px-5 pb-4 pt-[max(1rem,env(safe-area-inset-top))] pr-14 sm:px-7 sm:pb-5 sm:pt-7 sm:pr-16">
            <div className="inline-flex w-fit rounded-full border border-destructive/15 bg-destructive/5 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-destructive">
              Confirm delete
            </div>
            <DialogTitle className="pt-2 text-[1.35rem] tracking-tight text-[#10292B] dark:text-foreground sm:pt-3 sm:text-[1.7rem]">
              Remove this account?
            </DialogTitle>
            <p className="max-w-md text-[0.92rem] leading-6 text-muted-foreground sm:text-[0.95rem] sm:leading-7">
              {deleteTarget
                ? `Delete "${deleteTarget.name}" from your Veyra workspace? This action cannot be undone.`
                : "Delete this account from your Veyra workspace? This action cannot be undone."}
            </p>
          </DialogHeader>

          <div className="grid shrink-0 grid-cols-2 gap-3 px-5 pb-[max(0.85rem,env(safe-area-inset-bottom))] pt-3 sm:flex sm:justify-end sm:px-7 sm:py-6">
            <Button
              type="button"
              variant="outline"
              className="h-10 w-full rounded-full px-5 sm:h-11 sm:w-auto"
              onClick={() => setDeleteTarget(null)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="h-10 w-full rounded-full bg-destructive px-5 text-white hover:bg-destructive/90 sm:h-11 sm:w-auto"
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
    </div>
  );
}
