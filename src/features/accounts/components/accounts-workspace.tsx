"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import { ArrowUpDown, CreditCard, Globe2, Landmark, Pencil, Plus, Search, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";

import { trpc } from "@/trpc/react";
import {
  formatCurrencyMiliunits,
  getCurrencyLabel,
  isSupportedCurrency,
  supportedCurrencies,
} from "@/lib/currencies";
import type { AppRouter } from "@/server/api/root";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
  "h-9 w-full rounded-lg border-border/80 bg-background px-3 text-[0.94rem] shadow-none dark:bg-[#162022] focus-visible:border-[#8db8b3] focus-visible:ring-2 focus-visible:ring-[#8db8b3]/30 sm:h-10 sm:rounded-xl sm:px-4 sm:text-[0.95rem]";

const accountFieldLabelClassName = "text-[0.92rem] font-semibold text-foreground sm:text-[1.02rem]";

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
      account.currency
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
      value.toLowerCase().includes(normalized)
    )
  );
}

function sortAccounts(accounts: AccountItem[], sort: AccountSortOption) {
  const items = [...accounts];

  switch (sort) {
    case "oldest":
      return items.sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
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
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
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
      <CardHeader className="gap-4 pb-4">
        <div className="space-y-1.5">
          <CardTitle className="text-[1.2rem] tracking-tight text-[#10292B] dark:text-foreground">{title}</CardTitle>
          <CardDescription className="max-w-[34rem] text-[0.92rem] leading-7">
            {description}
          </CardDescription>
        </div>

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filterValue}
              onChange={(event) => onFilterChange(event.target.value)}
              placeholder="Filter accounts"
              className="h-12 rounded-full border-border/70 bg-[#fbfaf6] pl-10 dark:bg-[#162022]"
            />
          </div>
          <Select value={sortValue} onValueChange={(value) => onSortChange(value as AccountSortOption)}>
            <SelectTrigger className="h-12 w-full rounded-full border-border/70 bg-[#fbfaf6] px-4 text-[0.92rem] dark:bg-[#162022]">
              <div className="flex items-center gap-2">
                <ArrowUpDown className="size-4 text-muted-foreground" />
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

      <CardContent>
        {accounts.length === 0 ? (
          <div className="rounded-[1.8rem] border border-dashed border-border/80 bg-[#fbfaf6] px-6 py-12 text-center dark:bg-[#162022]">
            <p className="text-[1.35rem] font-semibold tracking-tight text-[#10292B] dark:text-foreground">{emptyTitle}</p>
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
              {accounts.map((account) => (
                <div
                  key={account.id}
                  className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,1.65fr)_220px_112px] md:items-center md:gap-4 md:px-6"
                >
                  <div className="min-w-0 md:min-w-0">
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
              ))}
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
  const summaryScrollerRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [form, setForm] = useState<CreateState>(getInitialState());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [liquidFilter, setLiquidFilter] = useState(initialQuery);
  const [liabilityFilter, setLiabilityFilter] = useState(initialQuery);
  const [liquidSort, setLiquidSort] = useState<AccountSortOption>("newest");
  const [liabilitySort, setLiabilitySort] = useState<AccountSortOption>("newest");
  const [sortsRestored, setSortsRestored] = useState(false);
  const [activeSummaryIndex, setActiveSummaryIndex] = useState(0);

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

  useEffect(() => {
    if (!summaryScrollerRef.current) return;

    function handleScroll() {
      const node = summaryScrollerRef.current;
      if (!node) return;

      const cards = Array.from(node.querySelectorAll<HTMLElement>("[data-summary-slide]"));
      if (cards.length === 0) return;

      const scrollerCenter = node.scrollLeft + node.clientWidth / 2;
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
    }

    handleScroll();
    const node = summaryScrollerRef.current;
    if (!node) return;
    node.addEventListener("scroll", handleScroll, { passive: true });
    return () => node.removeEventListener("scroll", handleScroll);
  }, []);

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
        (account) => account.type === "credit" || account.type === "loan"
      ),
    };
  }, [accountsQuery.data]);

  const visibleLiquidAccounts = useMemo(
    () => sortAccounts(filterAccounts(accountGroups.liquid, liquidFilter), liquidSort),
    [accountGroups.liquid, liquidFilter, liquidSort]
  );

  const visibleLiabilityAccounts = useMemo(
    () => sortAccounts(filterAccounts(accountGroups.liabilities, liabilityFilter), liabilitySort),
    [accountGroups.liabilities, liabilityFilter, liabilitySort]
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

  const summaryCards = summaryQuery.data
    ? [
        {
          label: "Accounts tracked",
          value: String(summaryQuery.data.totalAccounts),
          detail: "Live accounts currently connected to Veyra",
          icon: Landmark,
        },
        {
          label: "Liquid accounts",
          value: String(summaryQuery.data.liquidAccounts),
          detail: `${formatCount(accountGroups.liquid.length, "account")} across cash and wallet balances`,
          icon: Wallet,
        },
        {
          label: "Liabilities",
          value: String(summaryQuery.data.liabilityAccounts),
          detail: `${summaryQuery.data.creditAccounts} credit · ${summaryQuery.data.loanAccounts} loan`,
          icon: CreditCard,
        },
        {
          label: "Active currencies",
          value: String(summaryQuery.data.activeCurrencies),
          detail: "Balances stay native to each account currency",
          icon: Globe2,
        },
      ]
    : [];

  const mobileHeroStats = summaryQuery.data
    ? [
        {
          label: "Liquid accounts",
          value: formatCount(accountGroups.liquid.length, "account"),
        },
        {
          label: "Currencies in use",
          value: String(summaryQuery.data.activeCurrencies),
        },
      ]
    : [];

  function scrollSummaryCards(index: number) {
    const node = summaryScrollerRef.current;
    if (!node) return;

    const nextIndex = Math.max(0, Math.min(index, summaryCards.length - 1));
    const cards = Array.from(node.querySelectorAll<HTMLElement>("[data-summary-slide]"));
    const nextCard = cards[nextIndex];
    if (!nextCard) return;

    nextCard.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
    setActiveSummaryIndex(nextIndex);
  }

  return (
    <div className="space-y-6 lg:space-y-7">
      <section className="overflow-hidden rounded-[1.8rem] border border-white/80 bg-[linear-gradient(145deg,rgba(16,41,43,0.98),rgba(29,78,77,0.94))] text-white shadow-[0_28px_95px_-72px_rgba(10,31,34,0.82)]">
        <div className="grid gap-4 px-4 py-4 sm:px-6 sm:py-5 xl:grid-cols-[minmax(0,1fr)_300px] xl:items-center">
          <div className="max-w-3xl">
            <div className="inline-flex rounded-full border border-white/15 bg-white/10 px-2.5 py-0.5 text-[0.64rem] font-medium uppercase tracking-[0.22em] text-white/78">
              Accounts workspace
            </div>
            <h1 className="mt-2.5 max-w-[20ch] text-[1.55rem] font-semibold leading-[1.08] tracking-tight text-white sm:mt-3 sm:text-[2.2rem] sm:leading-[1.02]">
              Manage balances without losing the shape of each account.
            </h1>
            <p className="mt-2 max-w-[34rem] text-[0.9rem] leading-6 text-white/72 sm:mt-2.5 sm:text-[0.95rem] sm:leading-7">
              Keep liquid accounts, liabilities, and currencies visible without turning the page into a ledger wall.
            </p>
          </div>

          <div className="hidden space-y-2.5 xl:block">
            <div className="rounded-[1.25rem] border border-white/12 bg-white/10 px-4 py-3 backdrop-blur">
              <p className="text-[0.68rem] font-medium uppercase tracking-[0.24em] text-white/60">
                Bank and wallet accounts
              </p>
              <p className="mt-2 text-2xl font-semibold tracking-tight">
                {formatCount(accountGroups.liquid.length, "account")}
              </p>
            </div>
            <div className="rounded-[1.25rem] border border-white/12 bg-white/10 px-4 py-3 backdrop-blur">
              <p className="text-[0.68rem] font-medium uppercase tracking-[0.24em] text-white/60">
                Currencies in use
              </p>
              <p className="mt-2 text-2xl font-semibold tracking-tight">
                {summaryQuery.data?.activeCurrencies ?? 0}
              </p>
            </div>
          </div>
        </div>

        <div className="px-4 pb-4 xl:hidden sm:px-6 sm:pb-5">
          <div className="grid grid-cols-2 gap-2">
            {mobileHeroStats.map((item) => (
              <div
                key={item.label}
                className="rounded-[1.05rem] border border-white/12 bg-white/10 px-3 py-2.5 backdrop-blur"
              >
                <p className="text-[0.6rem] font-medium uppercase tracking-[0.2em] text-white/58">
                  {item.label}
                </p>
                <p className="mt-1 text-[1.1rem] font-semibold tracking-tight text-white">
                  {item.value}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <>
        <section className="space-y-3 md:hidden">
          {summaryQuery.isLoading ? (
            <div className="h-36 animate-pulse rounded-[1.8rem] border border-white/75 bg-white/75 dark:border-white/8 dark:bg-[#182123]" />
          ) : (
            <>
              <div
                ref={(node) => {
                  summaryScrollerRef.current = node;
                }}
                className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
                        <CardContent className="p-5">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                                {card.label}
                              </p>
                              <p className="mt-3 text-[2rem] font-semibold tracking-tight text-[#10292B] dark:text-foreground">
                                {card.value}
                              </p>
                              <p className="mt-2 text-sm leading-7 text-muted-foreground">{card.detail}</p>
                            </div>
                            <div className="flex size-10 items-center justify-center rounded-2xl border border-border/70 bg-[#fbfaf6] text-[#17393c] dark:bg-[#162022] dark:text-primary">
                              <Icon className="size-4.5" />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {summaryCards.map((card, index) => (
                    <button
                      key={card.label}
                      type="button"
                      aria-label={`Show ${card.label}`}
                      onClick={() => scrollSummaryCards(index)}
                      className={[
                        "h-2.5 rounded-full transition-all",
                        index === activeSummaryIndex ? "w-6 bg-primary" : "w-2.5 bg-border",
                      ].join(" ")}
                    />
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label="Previous account summary"
                    onClick={() => scrollSummaryCards(activeSummaryIndex - 1)}
                    className="flex size-9 items-center justify-center rounded-full border border-border bg-white text-foreground shadow-sm dark:bg-[#182123]"
                  >
                    <span className="text-lg leading-none">‹</span>
                  </button>
                  <button
                    type="button"
                    aria-label="Next account summary"
                    onClick={() => scrollSummaryCards(activeSummaryIndex + 1)}
                    className="flex size-9 items-center justify-center rounded-full border border-border bg-white text-foreground shadow-sm dark:bg-[#182123]"
                  >
                    <span className="text-lg leading-none">›</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </section>

        <section className="hidden gap-4 md:grid md:grid-cols-2 xl:grid-cols-4">
          {summaryQuery.isLoading &&
            Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="h-36 animate-pulse rounded-[1.8rem] border border-white/75 bg-white/75 dark:border-white/8 dark:bg-[#182123]"
              />
            ))}

          {summaryCards.map((card) => {
            const Icon = card.icon;

            return (
              <Card
                key={card.label}
                className="border-white/75 bg-white/84 shadow-[0_20px_60px_-52px_rgba(10,31,34,0.28)] dark:border-white/8 dark:bg-[#182123] dark:shadow-[0_24px_60px_-45px_rgba(0,0,0,0.62)]"
              >
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                        {card.label}
                      </p>
                      <p className="mt-3 text-[2rem] font-semibold tracking-tight text-[#10292B] dark:text-foreground">
                        {card.value}
                      </p>
                      <p className="mt-2 text-sm leading-7 text-muted-foreground">{card.detail}</p>
                    </div>
                    <div className="flex size-10 items-center justify-center rounded-2xl border border-border/70 bg-[#fbfaf6] text-[#17393c] dark:bg-[#162022] dark:text-primary">
                      <Icon className="size-4.5" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </section>
      </>

      <section>
        <Card className="border-white/75 bg-white/84 shadow-[0_24px_70px_-55px_rgba(10,31,34,0.28)] dark:border-white/8 dark:bg-[#182123] dark:shadow-[0_28px_80px_-55px_rgba(0,0,0,0.62)]">
          <CardHeader className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1.5">
              <CardTitle className="text-[1.45rem] tracking-tight text-[#10292B] dark:text-foreground">
                Account management
              </CardTitle>
              <CardDescription className="max-w-3xl text-[0.96rem] leading-7">
                Add and maintain the accounts that feed balances, budgets, and the rest of your workspace.
              </CardDescription>
            </div>

            <Dialog open={open} onOpenChange={resetDialogState}>
              <DialogTrigger asChild>
                <Button
                  onClick={startCreate}
                  className="rounded-full bg-[#17393c] px-5 hover:bg-[#1d4a4d]"
                >
                  <Plus className="size-4" />
                  Add account
                </Button>
              </DialogTrigger>

              <DialogContent className="max-h-[calc(86dvh-env(safe-area-inset-top))] w-[calc(100vw-1rem)] overflow-x-hidden overflow-y-auto rounded-[1.45rem] border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(251,250,246,0.95))] px-0 py-0 dark:border-white/8 dark:bg-[linear-gradient(180deg,rgba(24,33,35,0.98),rgba(18,27,29,0.98))] sm:max-h-[calc(100svh-2rem)] sm:w-auto sm:max-w-[52rem] sm:overflow-hidden sm:rounded-[2rem]">
                <DialogHeader className="shrink-0 border-b border-border/70 px-4 pb-3 pt-[max(0.85rem,env(safe-area-inset-top))] pr-14 sm:px-8 sm:pb-6 sm:pt-8 sm:pr-16">
                  <div className="inline-flex w-fit rounded-full border border-[#17393c]/10 bg-[#17393c]/5 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-[#17393c] dark:border-white/8 dark:bg-white/6 dark:text-primary">
                    Account setup
                  </div>
                  <DialogTitle className="pt-1.5 text-[1.2rem] tracking-tight sm:pt-3 sm:text-[2rem]">
                    {editingId ? "Edit account" : "Add account"}
                  </DialogTitle>
                  <p className="hidden max-w-xl text-[0.92rem] leading-6 text-muted-foreground sm:block sm:text-[0.96rem] sm:leading-7">
                    Capture the essentials first: account name, type, currency, and opening balance.
                  </p>
                </DialogHeader>

                <div className="min-h-0 overflow-x-hidden overflow-y-visible px-4 py-3 sm:overflow-y-auto sm:px-8 sm:py-6">
                  <div className="space-y-3 sm:space-y-5">
                  <div className="space-y-2 rounded-lg border border-border/70 bg-[#fcfbf7] px-3 py-2.5 dark:bg-[#162022] sm:space-y-2.5 sm:rounded-xl sm:px-4 sm:py-3.5">
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

                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1.15fr)_minmax(240px,0.85fr)] sm:items-start sm:gap-4">
                    <div className="space-y-2 rounded-lg border border-border/70 bg-[#fcfbf7] px-3 py-2.5 dark:bg-[#162022] sm:space-y-2.5 sm:rounded-xl sm:px-4 sm:py-3.5">
                      <label className={accountFieldLabelClassName}>Account type</label>
                      <div className="grid grid-cols-2 gap-3">
                        {accountTypeOptions.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setForm((current) => ({ ...current, type: option.value }))}
                            className={`min-h-9 rounded-lg border px-3.5 py-1.5 text-[0.9rem] transition sm:min-h-10 sm:rounded-xl sm:px-4 sm:py-2 sm:text-[0.94rem] ${
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

                    <div className="space-y-2 rounded-lg border border-border/70 bg-[#fcfbf7] px-3 py-2.5 dark:bg-[#162022] sm:space-y-2.5 sm:rounded-xl sm:px-4 sm:py-3.5">
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

                  {form.type !== "credit" ? (
                    <div className="space-y-2 rounded-lg border border-border/70 bg-[#fcfbf7] px-3 py-2.5 dark:bg-[#162022] sm:space-y-2.5 sm:rounded-xl sm:px-4 sm:py-3.5">
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
                  ) : null}

                  {form.type === "credit" ? (
                    <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
                      <div className="space-y-2 rounded-lg border border-border/70 bg-[#fcfbf7] px-3 py-2.5 dark:bg-[#162022] sm:space-y-2.5 sm:rounded-xl sm:px-4 sm:py-3.5">
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

                      <div className="space-y-2 rounded-lg border border-border/70 bg-[#fcfbf7] px-3 py-2.5 dark:bg-[#162022] sm:space-y-2.5 sm:rounded-xl sm:px-4 sm:py-3.5">
                        <label className={accountFieldLabelClassName}>Input mode</label>
                        <div className="grid grid-cols-2 gap-3">
                          {[
                            { label: "I know balance", value: "balance" as const },
                            { label: "I know available", value: "available" as const },
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
                              className={`min-h-9 rounded-lg border px-3.5 py-1.5 text-[0.84rem] transition sm:min-h-10 sm:rounded-xl sm:px-4 sm:py-2 sm:text-[0.87rem] ${
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

                      <div className="space-y-2 rounded-lg border border-border/70 bg-[#fcfbf7] px-3 py-2.5 sm:space-y-2.5 sm:rounded-xl sm:px-4 sm:py-3.5">
                        <label className={accountFieldLabelClassName}>
                          {form.creditInputMode === "available"
                            ? "Available credit"
                            : "Current balance"}
                        </label>
                        <Input
                          type="number"
                          inputMode="decimal"
                          value={form.creditInputMode === "available" ? form.availableCredit : form.balance}
                          onChange={(event) =>
                            form.creditInputMode === "available"
                              ? setAvailableCreditValue(event.target.value)
                              : setCreditBalanceValue(event.target.value)
                          }
                          placeholder="0.00"
                          className={accountFieldClassName}
                        />
                      </div>

                      <div className="space-y-2 rounded-lg border border-dashed border-border/70 bg-[#fbfaf6] px-3 py-2.5 dark:bg-[#162022] sm:space-y-2.5 sm:rounded-xl sm:px-4 sm:py-3.5">
                        <label className={accountFieldLabelClassName}>
                          {form.creditInputMode === "available"
                            ? "Computed current balance"
                            : "Computed available credit"}
                        </label>
                        <div className="flex min-h-9 items-center rounded-lg border border-border/80 bg-background px-3 text-[0.94rem] text-muted-foreground sm:min-h-10 sm:rounded-xl sm:px-4 sm:text-[0.95rem]">
                          {form.creditInputMode === "available"
                            ? formatCurrencyMiliunits(parsedBalance, form.currency)
                            : formatCurrencyMiliunits(parsedAvailableCredit, form.currency)}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className="hidden rounded-xl border border-dashed border-border/70 bg-[#fbfaf6] px-4 py-3 dark:bg-[#162022] sm:block">
                    <p className="text-[0.9rem] leading-6 text-muted-foreground">
                      {form.type === "credit"
                        ? "For credit cards, credit limit stays fixed while current balance tracks what you owe. If you only know the available credit from your banking app, Veyra can derive the balance for you."
                        : "Balances are stored in each account's native currency. Cross-currency rollups can be layered on later."}
                    </p>
                  </div>

                  {(createAccount.error || updateAccount.error) && (
                    <p className="rounded-[1rem] border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                      {createAccount.error?.message ?? updateAccount.error?.message}
                    </p>
                  )}
                  </div>
                </div>

                  <div className="shrink-0 border-t border-border/70 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2.5 sm:px-8 sm:py-4">
                    <div className="flex items-center justify-end">
                    <Button
                      onClick={onSubmit}
                      disabled={!form.name.trim() || isSubmitting}
                      className="h-9 w-full rounded-full bg-[#17393c] px-6 text-[0.94rem] hover:bg-[#1d4a4d] sm:h-10 sm:min-w-40 sm:w-auto sm:text-[0.95rem]"
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
                  </div>
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
        <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] overflow-x-hidden overflow-y-auto rounded-[1.35rem] border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(251,250,246,0.95))] px-0 py-0 dark:border-white/8 dark:bg-[linear-gradient(180deg,rgba(24,33,35,0.98),rgba(18,27,29,0.98))] sm:max-h-[calc(100svh-2rem)] sm:w-auto sm:max-w-lg sm:rounded-[1.6rem]">
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
