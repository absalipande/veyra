"use client";

import { useMemo, useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import { ArrowUpDown, CreditCard, Globe2, Landmark, Pencil, Plus, Search, Trash2, Wallet } from "lucide-react";

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
  balance: string;
  currency: (typeof supportedCurrencies)[number];
  name: string;
  type: (typeof accountTypeOptions)[number]["value"];
};

type RouterOutputs = inferRouterOutputs<AppRouter>;
type AccountItem = RouterOutputs["accounts"]["list"][number];

const initialState: CreateState = {
  balance: "",
  currency: "PHP",
  name: "",
  type: "cash",
};

const accountFieldClassName =
  "h-13 rounded-[1.35rem] border-border/80 bg-background px-5 text-[0.95rem] shadow-none focus-visible:border-[#8db8b3] focus-visible:ring-2 focus-visible:ring-[#8db8b3]/30";

const accountFieldLabelClassName = "text-[1.02rem] font-semibold text-foreground";

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

function getAccountTone(type: AccountItem["type"]) {
  switch (type) {
    case "cash":
      return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100";
    case "wallet":
      return "bg-teal-50 text-teal-700 ring-1 ring-teal-100";
    case "credit":
      return "bg-amber-50 text-amber-700 ring-1 ring-amber-100";
    case "loan":
      return "bg-rose-50 text-rose-700 ring-1 ring-rose-100";
    default:
      return "bg-muted text-foreground";
  }
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
    <Card className="border-white/75 bg-white/82 shadow-[0_24px_70px_-55px_rgba(10,31,34,0.28)]">
      <CardHeader className="gap-4 pb-4">
        <div className="space-y-1.5">
          <CardTitle className="text-[1.2rem] tracking-tight text-[#10292B]">{title}</CardTitle>
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
              className="h-12 rounded-full border-border/70 bg-[#fbfaf6] pl-10"
            />
          </div>
          <Select value={sortValue} onValueChange={(value) => onSortChange(value as AccountSortOption)}>
            <SelectTrigger className="h-12 w-full rounded-full border-border/70 bg-[#fbfaf6] px-4 text-[0.92rem]">
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
          <div className="rounded-[1.8rem] border border-dashed border-border/80 bg-[#fbfaf6] px-6 py-12 text-center">
            <p className="text-[1.35rem] font-semibold tracking-tight text-[#10292B]">{emptyTitle}</p>
            <p className="mx-auto mt-3 max-w-md text-[0.98rem] leading-8 text-muted-foreground">
              {emptyBody}
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-[1.85rem] border border-border/70 bg-[#fdfcf8]">
            <div className="hidden grid-cols-[minmax(0,1.8fr)_170px_132px] items-center gap-4 border-b border-border/70 px-6 py-3.5 text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground md:grid">
              <p>Account</p>
              <p className="text-right">Balance</p>
              <p className="text-right">Actions</p>
            </div>

            <div className="divide-y divide-border/70">
              {accounts.map((account) => (
                <div
                  key={account.id}
                  className="grid gap-4 px-5 py-4 md:grid-cols-[minmax(0,1.8fr)_170px_132px] md:items-center md:px-6"
                >
                  <div className="min-w-0">
                    <div className="min-w-0">
                      <p className="truncate text-[0.92rem] font-semibold tracking-tight text-[#10292B]">
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

                  <div className="md:text-right">
                    <p className="text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground md:hidden">
                      Balance
                    </p>
                    <p className="mt-1 text-[0.9rem] font-semibold tracking-tight text-[#10292B] md:mt-0">
                      {formatCurrencyMiliunits(account.balance, account.currency)}
                    </p>
                  </div>

                  <div className="flex gap-2 md:justify-end">
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

export function AccountsWorkspace() {
  const utils = trpc.useUtils();
  const accountsQuery = trpc.accounts.list.useQuery();
  const summaryQuery = trpc.accounts.summary.useQuery();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CreateState>(initialState);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [liquidFilter, setLiquidFilter] = useState("");
  const [liabilityFilter, setLiabilityFilter] = useState("");
  const [liquidSort, setLiquidSort] = useState<AccountSortOption>("newest");
  const [liabilitySort, setLiabilitySort] = useState<AccountSortOption>("newest");

  const refreshAccounts = async () => {
    await Promise.all([utils.accounts.list.invalidate(), utils.accounts.summary.invalidate()]);
  };

  const createAccount = trpc.accounts.create.useMutation({
    onSuccess: async () => {
      await refreshAccounts();
      setForm(initialState);
      setEditingId(null);
      setOpen(false);
    },
  });

  const updateAccount = trpc.accounts.update.useMutation({
    onSuccess: async () => {
      await refreshAccounts();
      setForm(initialState);
      setEditingId(null);
      setOpen(false);
    },
  });

  const deleteAccount = trpc.accounts.remove.useMutation({
    onSuccess: async () => {
      await refreshAccounts();
    },
  });

  const parsedBalance = useMemo(() => {
    const numeric = Number(form.balance);
    if (Number.isNaN(numeric)) return 0;
    return Math.round(numeric * 1000);
  }, [form.balance]);

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

  const isSubmitting = createAccount.isPending || updateAccount.isPending;
  const isDeleting = deleteAccount.isPending;

  const resetDialogState = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setForm(initialState);
      setEditingId(null);
    }
  };

  const startCreate = () => {
    setEditingId(null);
    setForm(initialState);
    setOpen(true);
  };

  const startEdit = (account: AccountItem) => {
    setEditingId(account.id);
    setForm({
      balance: (account.balance / 1000).toFixed(2),
      currency: isSupportedCurrency(account.currency) ? account.currency : "PHP",
      name: account.name,
      type: account.type,
    });
    setOpen(true);
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
      });
      return;
    }

    createAccount.mutate({
      name: form.name,
      currency: form.currency,
      institution: "",
      type: form.type,
      balance: parsedBalance,
    });
  };

  const onDelete = (id: string, name: string) => {
    const confirmed = window.confirm(`Delete "${name}" from your Veyra workspace?`);
    if (!confirmed) return;
    deleteAccount.mutate({ id });
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

  return (
    <div className="space-y-6 lg:space-y-7">
      <section className="overflow-hidden rounded-[2.1rem] border border-white/80 bg-[linear-gradient(145deg,rgba(16,41,43,0.98),rgba(29,78,77,0.94))] text-white shadow-[0_30px_110px_-70px_rgba(10,31,34,0.84)]">
        <div className="grid gap-6 px-6 py-7 sm:px-8 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-end">
          <div className="max-w-3xl">
            <div className="inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[0.7rem] font-medium uppercase tracking-[0.28em] text-white/80">
              Accounts workspace
            </div>
            <h1 className="mt-4 text-[2.35rem] font-semibold tracking-tight text-white sm:text-[3rem]">
              Manage balances without losing the shape of each account.
            </h1>
            <p className="mt-4 max-w-2xl text-[0.98rem] leading-8 text-white/72">
              Veyra keeps account balances clear, structured, and easy to scan. The workspace is
              ready for banks, wallets, credit lines, loans, and multi-currency accounts.
            </p>
          </div>

          <div className="space-y-3">
            <div className="rounded-[1.65rem] border border-white/12 bg-white/10 px-5 py-4 backdrop-blur">
              <p className="text-[0.72rem] font-medium uppercase tracking-[0.28em] text-white/60">
                Bank and wallet accounts
              </p>
              <p className="mt-3 text-3xl font-semibold tracking-tight">
                {formatCount(accountGroups.liquid.length, "account")}
              </p>
            </div>
            <div className="rounded-[1.65rem] border border-white/12 bg-white/10 px-5 py-4 backdrop-blur">
              <p className="text-[0.72rem] font-medium uppercase tracking-[0.28em] text-white/60">
                Currencies in use
              </p>
              <p className="mt-3 text-3xl font-semibold tracking-tight">
                {summaryQuery.data?.activeCurrencies ?? 0}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summaryQuery.isLoading &&
          Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-36 animate-pulse rounded-[1.8rem] border border-white/75 bg-white/75"
            />
          ))}

        {summaryCards.map((card) => {
          const Icon = card.icon;

          return (
            <Card
              key={card.label}
              className="border-white/75 bg-white/84 shadow-[0_20px_60px_-52px_rgba(10,31,34,0.28)]"
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                      {card.label}
                    </p>
                    <p className="mt-3 text-[2rem] font-semibold tracking-tight text-[#10292B]">
                      {card.value}
                    </p>
                    <p className="mt-2 text-sm leading-7 text-muted-foreground">{card.detail}</p>
                  </div>
                  <div className="flex size-10 items-center justify-center rounded-2xl border border-border/70 bg-[#fbfaf6] text-[#17393c]">
                    <Icon className="size-4.5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <section>
        <Card className="border-white/75 bg-white/84 shadow-[0_24px_70px_-55px_rgba(10,31,34,0.28)]">
          <CardHeader className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1.5">
              <CardTitle className="text-[1.45rem] tracking-tight text-[#10292B]">
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

              <DialogContent className="overflow-hidden rounded-[2rem] border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(251,250,246,0.95))] px-0 py-0 sm:max-w-[52rem]">
                <DialogHeader className="border-b border-border/70 px-7 pb-5 pt-7 pr-16 sm:px-8 sm:pb-6 sm:pt-8">
                  <div className="inline-flex w-fit rounded-full border border-[#17393c]/10 bg-[#17393c]/5 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-[#17393c]">
                    Account setup
                  </div>
                  <DialogTitle className="pt-3 text-[2rem] tracking-tight">
                    {editingId ? "Edit account" : "Add account"}
                  </DialogTitle>
                  <p className="max-w-xl text-[0.96rem] leading-7 text-muted-foreground">
                    Capture the essentials first: account name, type, currency, and opening balance.
                  </p>
                </DialogHeader>

                <div className="space-y-6 px-7 py-6 sm:px-8 sm:py-7">
                  <div className="space-y-3 rounded-[1.4rem] border border-border/70 bg-[#fcfbf7] px-4 py-4">
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

                  <div className="grid gap-5 sm:grid-cols-[minmax(0,1.15fr)_minmax(240px,0.85fr)] sm:items-start">
                    <div className="space-y-3 rounded-[1.4rem] border border-border/70 bg-[#fcfbf7] px-4 py-4">
                      <label className={accountFieldLabelClassName}>Account type</label>
                      <div className="grid grid-cols-2 gap-3">
                        {accountTypeOptions.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setForm((current) => ({ ...current, type: option.value }))}
                            className={`min-h-13 rounded-[1.35rem] border px-4 py-2.5 text-[0.95rem] transition ${
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

                    <div className="space-y-3 rounded-[1.4rem] border border-border/70 bg-[#fcfbf7] px-4 py-4">
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

                  <div className="space-y-3 rounded-[1.4rem] border border-border/70 bg-[#fcfbf7] px-4 py-4">
                    <label className={accountFieldLabelClassName}>Opening balance</label>
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

                  <div className="rounded-[1.25rem] border border-dashed border-border/70 bg-[#fbfaf6] px-4 py-3">
                    <p className="text-[0.9rem] leading-6 text-muted-foreground">
                      Balances are stored in each account&apos;s native currency. Cross-currency rollups can
                      be layered on later.
                    </p>
                  </div>

                  {(createAccount.error || updateAccount.error) && (
                    <p className="rounded-[1rem] border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                      {createAccount.error?.message ?? updateAccount.error?.message}
                    </p>
                  )}

                  <div className="flex items-center justify-end border-t border-border/70 pt-4">
                    <Button
                      onClick={onSubmit}
                      disabled={!form.name.trim() || isSubmitting}
                      className="h-12 min-w-44 rounded-full bg-[#17393c] px-6 text-[0.98rem] hover:bg-[#1d4a4d]"
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

      {accountsQuery.isLoading ? (
        <section className="grid gap-6 xl:grid-cols-2">
          {Array.from({ length: 2 }).map((_, index) => (
            <div
              key={index}
              className="h-[24rem] animate-pulse rounded-[1.9rem] border border-white/75 bg-white/75"
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

      {isDeleting && (
        <div className="rounded-[1.4rem] border border-border/70 bg-white/75 px-4 py-3 text-sm text-muted-foreground">
          Updating your accounts…
        </div>
      )}
    </div>
  );
}
