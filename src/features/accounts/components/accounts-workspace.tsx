"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import {
  ArrowUpDown,
  CalendarClock,
  CreditCard,
  Globe2,
  HandCoins,
  MoreHorizontal,
  Pencil,
  Plus,
  Sparkles,
  Search,
  Trash2,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import { DatePickerField } from "@/components/date-picker/date-picker";
import { trpc } from "@/trpc/react";
import {
  formatCurrencyMiliunits,
  getCurrencyLabel,
  isSupportedCurrency,
  supportedCurrencies,
} from "@/lib/currencies";
import {
  formatDateWithPreferences,
  resolveDatePreferences,
} from "@/features/settings/lib/date-format";
import { getInstitutionDisplay } from "@/features/accounts/lib/institutions";
import type { AppRouter } from "@/server/api/root";
import { InstitutionAvatar } from "@/components/app/institution-avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
type LoanListItem = RouterOutputs["loans"]["list"]["items"][number];
type DeleteTarget = { id: string; name: string } | null;
type CreditBalanceTreatment = "already_included" | "add_to_credit_balance";
type InsightMetric = {
  label: string;
  tone: "neutral" | "positive" | "warning";
  value: string;
};

type LinkedLoanDraft = {
  accountId: string;
  balanceTreatment: CreditBalanceTreatment;
  defaultPaymentSourceAccountId: string;
  destinationAccountId: string;
  disbursementDate: string;
  durationMonths: string;
  eir: string;
  firstPaymentDue: string;
  lenderName: string;
  loanName: string;
  monthlyPayment: string;
  notes: string;
  principalAmount: string;
  rate: string;
};

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
  "max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-[24rem] overflow-x-hidden overflow-y-auto rounded-[1.15rem] border-border/70 bg-background/98 px-0 py-0 ring-0 sm:max-h-[calc(100svh-2rem)] sm:w-full sm:max-w-[30rem] sm:rounded-[1.35rem]";

const linkedLoanDialogContentClassName =
  "h-[100dvh] overflow-hidden border border-border/70 bg-background/96 px-0 py-0 shadow-[0_40px_90px_-50px_rgba(15,23,42,0.5)] backdrop-blur dark:border-white/8 dark:bg-[linear-gradient(180deg,rgba(24,33,35,0.98),rgba(18,27,29,0.98))] [&_[data-slot='dialog-close']]:right-3 [&_[data-slot='dialog-close']]:top-3 sm:[&_[data-slot='dialog-close']]:right-4 sm:[&_[data-slot='dialog-close']]:top-4";

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

function toDateInputLocal(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateInputToUTC(value: string) {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return new Date(Date.UTC(year, month - 1, day));
}

function addMonths(input: Date, monthsToAdd: number) {
  const copy = new Date(input);
  copy.setUTCMonth(copy.getUTCMonth() + monthsToAdd);
  return copy;
}

function parseMoneyToMiliunits(value: string) {
  const normalized = value.trim().replace(/,/g, "");
  if (!normalized) return null;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 1000);
}

function parseOptionalNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function getInitialLinkedLoanDraft(account: AccountItem, destinationAccountId = ""): LinkedLoanDraft {
  const today = new Date();
  const firstDue = addMonths(new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())), 1);

  return {
    accountId: account.id,
    balanceTreatment: "already_included",
    defaultPaymentSourceAccountId: "",
    destinationAccountId,
    disbursementDate: toDateInputLocal(today),
    durationMonths: "",
    eir: "",
    firstPaymentDue: toDateInputLocal(firstDue),
    lenderName: account.institution || account.name,
    loanName: `${account.institution || account.name} Cash Loan`,
    monthlyPayment: "",
    notes: "",
    principalAmount: "",
    rate: "",
  };
}

function buildMonthlyRepaymentPlan(input: {
  durationMonths: number;
  firstPaymentDue: Date;
  monthlyPayment: number;
  principalAmount: number;
  totalPayable: number;
}) {
  const regularTotal = input.monthlyPayment * input.durationMonths;
  const finalAmount = Math.max(
    input.totalPayable - input.monthlyPayment * Math.max(input.durationMonths - 1, 0),
    1,
  );
  let principalAssigned = 0;

  return Array.from({ length: input.durationMonths }).map((_, index) => {
    const isLast = index === input.durationMonths - 1;
    const amount = isLast && Math.abs(regularTotal - input.totalPayable) > 0
      ? finalAmount
      : input.monthlyPayment;
    const principalAmount = isLast
      ? Math.max(input.principalAmount - principalAssigned, 0)
      : Math.min(
          Math.round(input.principalAmount / input.durationMonths),
          input.principalAmount - principalAssigned,
        );
    principalAssigned += principalAmount;

    return {
      dueDate: addMonths(input.firstPaymentDue, index),
      amount,
      principalAmount,
      interestAmount: Math.max(amount - principalAmount, 0),
    };
  });
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

function getAccountTypeBadgeClassName(type: AccountItem["type"]) {
  switch (type) {
    case "cash":
      return "border-emerald-200/80 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300";
    case "wallet":
      return "border-teal-200/80 bg-teal-50 text-teal-700 dark:border-teal-500/20 dark:bg-teal-500/10 dark:text-teal-300";
    case "credit":
      return "border-amber-200/80 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300";
    case "loan":
      return "border-rose-200/80 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300";
    default:
      return "border-border/70 bg-muted/40 text-foreground";
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
  onCreateLinkedLoan?: (account: AccountItem) => void;
  onDelete: (id: string, name: string) => void;
  onEdit: (accountId: string) => void;
  onFilterChange: (value: string) => void;
  onSortChange: (value: AccountSortOption) => void;
  sortValue: AccountSortOption;
  totalBalanceLabel: string;
  title: string;
};

type AccountActionsMenuProps = {
  account: AccountItem;
  onCreateLinkedLoan?: (account: AccountItem) => void;
  onDelete: (id: string, name: string) => void;
  onEdit: (accountId: string) => void;
};

function AccountActionsMenu({
  account,
  onCreateLinkedLoan,
  onDelete,
  onEdit,
}: AccountActionsMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon-sm"
          className="h-8 w-8 cursor-pointer rounded-full"
          aria-label={`Open actions for ${account.name}`}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {account.type === "credit" && onCreateLinkedLoan ? (
          <DropdownMenuItem
            className="gap-2 px-2 py-1.5 text-[0.82rem]"
            onSelect={() => onCreateLinkedLoan(account)}
          >
            <HandCoins className="size-4 text-[#006c67]" />
            Create linked loan
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          className="gap-2 px-2 py-1.5 text-[0.82rem]"
          onSelect={() => onEdit(account.id)}
        >
          <Pencil className="size-4" />
          Edit account
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          className="gap-2 px-2 py-1.5 text-[0.82rem]"
          onSelect={() => onDelete(account.id, account.name)}
        >
          <Trash2 className="size-4" />
          Delete account
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AccountSection({
  accounts,
  description,
  emptyBody,
  emptyTitle,
  filterValue,
  onCreateLinkedLoan,
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
            <div className="hidden grid-cols-[minmax(0,1fr)_minmax(10.5rem,12rem)_3rem] items-center gap-3 border-b border-border/70 px-4 py-3.5 text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground md:grid">
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
                          <InstitutionAvatar
                            key={`${institutionDisplay.label}:${institutionDisplay.logoPaths.join("|")}`}
                            display={institutionDisplay}
                            sizeClassName="size-10"
                            containerClassName="dark:bg-[#162022]"
                            imageClassName="h-full w-full object-cover"
                            initialsClassName="text-[0.76rem] font-semibold tracking-tight"
                          />
                          <div className="min-w-0">
                            <p className="truncate text-[0.9rem] font-semibold tracking-tight text-[#10292B] dark:text-foreground">
                              {account.name}
                            </p>
                            <span
                              className={`mt-1 inline-flex h-5 items-center rounded-full border px-2 text-[0.66rem] font-semibold leading-none ${getAccountTypeBadgeClassName(account.type)}`}
                            >
                              {getAccountTypeLabel(account.type)}
                            </span>
                          </div>
                        </div>
                        <AccountActionsMenu
                          account={account}
                          onCreateLinkedLoan={onCreateLinkedLoan}
                          onDelete={onDelete}
                          onEdit={onEdit}
                        />
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

                    <div className="hidden grid-cols-[minmax(0,1fr)_minmax(10.5rem,12rem)_3rem] items-center gap-3 px-4 py-4 md:grid">
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-3">
                          <InstitutionAvatar
                            key={`${institutionDisplay.label}:${institutionDisplay.logoPaths.join("|")}`}
                            display={institutionDisplay}
                            sizeClassName="size-11"
                            containerClassName="dark:bg-[#162022]"
                            imageClassName="h-full w-full object-cover"
                            initialsClassName="text-[0.78rem] font-semibold tracking-tight"
                          />

                          <div className="min-w-0 flex-1">
                            <p className="max-w-[22rem] text-[0.92rem] font-semibold leading-snug tracking-tight text-[#10292B] dark:text-foreground">
                              {account.name}
                            </p>
                            <span
                              className={`mt-1.5 inline-flex h-5 w-fit items-center rounded-full border px-2 text-[0.66rem] font-semibold leading-none ${getAccountTypeBadgeClassName(account.type)}`}
                            >
                              {getAccountTypeLabel(account.type)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <p className="text-[0.86rem] font-medium tracking-tight text-[#17393c] dark:text-foreground/90">
                          {formatCurrencyMiliunits(account.balance, account.currency)}
                        </p>
                        {formatAccountBalanceDetail(account) ? (
                          <p className="mt-1 ml-auto whitespace-nowrap text-[0.64rem] leading-5 text-muted-foreground">
                            {formatAccountBalanceDetail(account)}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex justify-end">
                        <AccountActionsMenu
                          account={account}
                          onCreateLinkedLoan={onCreateLinkedLoan}
                          onDelete={onDelete}
                          onEdit={onEdit}
                        />
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
  const loansForAccountsQuery = trpc.loans.list.useQuery({
    page: 1,
    pageSize: 200,
    search: "",
    status: "all",
  });
  const summaryQuery = trpc.accounts.summary.useQuery();
  const aiInsightQuery = trpc.ai.accountsInsight.useQuery(undefined, {
    staleTime: 45_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
  const settingsQuery = trpc.settings.get.useQuery();
  const datePreferences = resolveDatePreferences(settingsQuery.data);
  const [open, setOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [form, setForm] = useState<CreateState>(getInitialState());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [linkedLoanDraft, setLinkedLoanDraft] = useState<LinkedLoanDraft | null>(null);
  const [linkedLoanError, setLinkedLoanError] = useState<string | null>(null);
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
      utils.accounts.list.cancel(),
      utils.accounts.summary.cancel(),
      utils.loans.list.cancel(),
      utils.loans.summary.cancel(),
      utils.ai.accountsInsight.cancel(),
      utils.ai.dashboardInsight.cancel(),
    ]);

    await Promise.all([
      utils.accounts.list.invalidate(),
      utils.accounts.summary.invalidate(),
      utils.loans.list.invalidate(),
      utils.loans.summary.invalidate(),
    ]);

    await Promise.all([
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

  const createLinkedLoan = trpc.loans.create.useMutation({
    onSuccess: async () => {
      await refreshAccounts();
      setLinkedLoanDraft(null);
      setLinkedLoanError(null);
      toast.success("Linked loan created", {
        description: "The repayment schedule is now connected to the selected credit account.",
      });
    },
    onError: (error) => {
      toast.error("Could not create linked loan", {
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
  const accountById = useMemo(
    () => new Map((accountsQuery.data ?? []).map((account) => [account.id, account])),
    [accountsQuery.data],
  );
  const loanOutstandingByUnderlyingAccountId = useMemo(() => {
    const map = new Map<string, number>();
    const items: LoanListItem[] = loansForAccountsQuery.data?.items ?? [];

    for (const loan of items) {
      if (!loan.underlyingLoanAccountId) continue;
      const current = map.get(loan.underlyingLoanAccountId) ?? 0;
      map.set(loan.underlyingLoanAccountId, current + Math.max(loan.outstandingAmount, 0));
    }

    return map;
  }, [loansForAccountsQuery.data?.items]);
  const liabilityAccountsForDisplay = useMemo(
    () =>
      accountGroups.liabilities.map((account) => {
        if (account.type !== "loan") return account;
        const linkedOutstanding = loanOutstandingByUnderlyingAccountId.get(account.id);
        if (linkedOutstanding === undefined) return account;

        return {
          ...account,
          balance: linkedOutstanding,
        };
      }),
    [accountGroups.liabilities, loanOutstandingByUnderlyingAccountId],
  );
  const liquidTotalBalance = useMemo(
    () => accountGroups.liquid.reduce((sum, account) => sum + account.balance, 0),
    [accountGroups.liquid],
  );
  const liabilitiesTotalBalance = useMemo(
    () => liabilityAccountsForDisplay.reduce((sum, account) => sum + account.balance, 0),
    [liabilityAccountsForDisplay],
  );
  const linkedLoanCreditAccount = useMemo(() => {
    if (!linkedLoanDraft) return null;
    const account = accountById.get(linkedLoanDraft.accountId);
    return account?.type === "credit" ? account : null;
  }, [accountById, linkedLoanDraft]);
  const liquidAccounts = accountGroups.liquid;
  const linkedLoanPrincipal = useMemo(
    () => parseMoneyToMiliunits(linkedLoanDraft?.principalAmount ?? ""),
    [linkedLoanDraft?.principalAmount],
  );
  const linkedLoanMonthlyPayment = useMemo(
    () => parseMoneyToMiliunits(linkedLoanDraft?.monthlyPayment ?? ""),
    [linkedLoanDraft?.monthlyPayment],
  );
  const linkedLoanDuration = useMemo(() => {
    const parsed = Number(linkedLoanDraft?.durationMonths ?? "");
    return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
  }, [linkedLoanDraft?.durationMonths]);
  const linkedLoanTotalPayable = useMemo(() => {
    if (linkedLoanMonthlyPayment !== null && linkedLoanDuration > 0) {
      return linkedLoanMonthlyPayment * linkedLoanDuration;
    }
    return null;
  }, [linkedLoanDuration, linkedLoanMonthlyPayment]);
  const linkedLoanInterestAndFees =
    linkedLoanPrincipal !== null && linkedLoanTotalPayable !== null
      ? Math.max(linkedLoanTotalPayable - linkedLoanPrincipal, 0)
      : null;
  const liveAccountsInsight = useMemo(() => {
    const creditAccounts = liabilityAccountsForDisplay.filter((account) => account.type === "credit");
    const loanAccounts = liabilityAccountsForDisplay.filter((account) => account.type === "loan");
    const totalCreditDebt = creditAccounts.reduce((sum, account) => sum + account.balance, 0);
    const totalLoanDebt = loanAccounts.reduce((sum, account) => sum + account.balance, 0);
    const totalLiabilities = totalCreditDebt + totalLoanDebt;
    const totalCreditLimit = creditAccounts.reduce((sum, account) => sum + account.creditLimit, 0);
    const utilizationPct =
      totalCreditLimit > 0 ? Math.round((totalCreditDebt / totalCreditLimit) * 100) : 0;
    const runwayMetric = aiInsightQuery.data?.metrics.find((metric) => metric.label === "Runway");

    let summary = "Accounts are stable with manageable liquidity and liabilities.";
    if (utilizationPct >= 70) {
      summary = `Credit utilization is at ${utilizationPct}%. Focus on paydown to recover margin.`;
    } else if (totalLiabilities > liquidTotalBalance && totalLiabilities > 0) {
      summary = "Liabilities are currently higher than liquid balances. Keep debt pacing visible.";
    }

    const recommendation =
      utilizationPct >= 70
        ? "Credit utilization is elevated. Prioritize one extra card payment this cycle."
        : "Account posture is stable. Keep balancing liquidity and debt paydown.";

    const metrics: InsightMetric[] = [
      {
        label: "Liquid balance",
        value: formatCurrencyMiliunits(liquidTotalBalance, "PHP"),
        tone: "neutral",
      },
      {
        label: "Liabilities",
        value: formatCurrencyMiliunits(totalLiabilities, "PHP"),
        tone: totalLiabilities > liquidTotalBalance ? "warning" : "neutral",
      },
      {
        label: "Credit utilization",
        value: totalCreditLimit > 0 ? `${utilizationPct}%` : "No credit line",
        tone: totalCreditLimit > 0 && utilizationPct >= 70 ? "warning" : "positive",
      },
      {
        label: "Runway",
        value: runwayMetric?.value ?? "Insufficient history",
        tone: runwayMetric?.tone ?? "neutral",
      },
    ];

    return { metrics, recommendation, summary };
  }, [aiInsightQuery.data?.metrics, liabilityAccountsForDisplay, liquidTotalBalance]);

  const visibleLiquidAccounts = useMemo(
    () => sortAccounts(filterAccounts(accountGroups.liquid, liquidFilter), liquidSort),
    [accountGroups.liquid, liquidFilter, liquidSort],
  );

  const visibleLiabilityAccounts = useMemo(
    () => sortAccounts(filterAccounts(liabilityAccountsForDisplay, liabilityFilter), liabilitySort),
    [liabilityAccountsForDisplay, liabilityFilter, liabilitySort],
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
  const startEditById = (accountId: string) => {
    const account = accountById.get(accountId);
    if (!account) return;
    startEdit(account);
  };

  const startCreateLinkedLoan = (account: AccountItem) => {
    const firstLiquidAccountId = accountGroups.liquid[0]?.id ?? "";
    setLinkedLoanDraft(getInitialLinkedLoanDraft(account, firstLiquidAccountId));
    setLinkedLoanError(null);
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

  const submitLinkedLoan = () => {
    if (!linkedLoanDraft || !linkedLoanCreditAccount) return;

    const loanName = linkedLoanDraft.loanName.trim();
    const lenderName = linkedLoanDraft.lenderName.trim();
    const principalAmount = parseMoneyToMiliunits(linkedLoanDraft.principalAmount);
    const monthlyPayment = parseMoneyToMiliunits(linkedLoanDraft.monthlyPayment);
    const totalPayable =
      monthlyPayment !== null && linkedLoanDuration > 0
        ? monthlyPayment * linkedLoanDuration
        : null;
    const firstPaymentDue = parseDateInputToUTC(linkedLoanDraft.firstPaymentDue);
    const disbursementDate = parseDateInputToUTC(linkedLoanDraft.disbursementDate);

    if (loanName.length < 2) {
      setLinkedLoanError("Enter a loan name with at least 2 characters.");
      return;
    }

    if (lenderName.length < 2) {
      setLinkedLoanError("Enter a lender name with at least 2 characters.");
      return;
    }

    if (principalAmount === null || principalAmount <= 0) {
      setLinkedLoanError("Enter a valid cash loan amount.");
      return;
    }

    if (!Number.isFinite(linkedLoanDuration) || linkedLoanDuration <= 0) {
      setLinkedLoanError("Enter a valid loan term.");
      return;
    }

    if (monthlyPayment === null || monthlyPayment <= 0) {
      setLinkedLoanError("Enter a valid monthly amortization.");
      return;
    }

    if (totalPayable === null || totalPayable < principalAmount) {
      setLinkedLoanError("Total payable should be at least the cash loan amount.");
      return;
    }

    if (!firstPaymentDue) {
      setLinkedLoanError("Choose the first payment due date.");
      return;
    }

    if (!disbursementDate) {
      setLinkedLoanError("Choose the disbursement date.");
      return;
    }

    if (!linkedLoanDraft.destinationAccountId) {
      setLinkedLoanError("Choose the account where the cash was received.");
      return;
    }

    if (
      linkedLoanDraft.balanceTreatment === "add_to_credit_balance" &&
      linkedLoanCreditAccount.balance + principalAmount > linkedLoanCreditAccount.creditLimit
    ) {
      setLinkedLoanError("Adding this loan would push the card above its credit limit.");
      return;
    }

    const repaymentPlan = buildMonthlyRepaymentPlan({
      durationMonths: linkedLoanDuration,
      firstPaymentDue,
      monthlyPayment,
      principalAmount,
      totalPayable,
    });
    const nextDueDate = repaymentPlan[0]?.dueDate;
    const metadataValue = JSON.stringify({
      setupPath: "credit_linked_loan",
      repaymentAccountName: linkedLoanCreditAccount.name,
      rate: parseOptionalNumber(linkedLoanDraft.rate),
      eir: parseOptionalNumber(linkedLoanDraft.eir),
      lenderTotalPayable: totalPayable,
      monthlyAmortization: monthlyPayment,
      durationMonths: linkedLoanDuration,
    });

    createLinkedLoan.mutate({
      kind: "institution",
      name: loanName,
      lenderName,
      currency: linkedLoanCreditAccount.currency as CreateState["currency"],
      principalAmount,
      outstandingAmount: totalPayable,
      disbursedAt: disbursementDate,
      status: "active",
      destinationAccountId: linkedLoanDraft.destinationAccountId,
      underlyingLoanAccountId: undefined,
      repaymentAccountId: linkedLoanCreditAccount.id,
      repaymentAccountKind: "credit_account",
      liabilityTreatment: "credit_linked_overlay",
      creditBalanceTreatment: linkedLoanDraft.balanceTreatment,
      creditLinkedOpeningAmount: principalAmount,
      defaultPaymentSourceAccountId: linkedLoanDraft.defaultPaymentSourceAccountId || undefined,
      cadence: "monthly",
      nextDueDate,
      notes: linkedLoanDraft.notes.trim() || undefined,
      metadata: metadataValue,
      repaymentPlan: repaymentPlan.map((installment) => ({
        dueDate: installment.dueDate,
        amount: installment.amount,
        principalAmount: installment.principalAmount,
        interestAmount: installment.interestAmount,
      })),
      autoCreateUnderlyingAccount: false,
      createOpeningDisbursement: false,
    });
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
                Today · {formatDateWithPreferences(new Date(), datePreferences, "date")}
              </p>
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
                    Veyra insight
                  </p>
                  <h3 className="text-[0.95rem] font-semibold tracking-tight text-[#10292B] dark:text-foreground">
                    {aiInsightQuery.data?.headline ?? "Veyra accounts watchdog"}
                  </h3>
                </div>
              </div>
              <span className="shrink-0 whitespace-nowrap rounded-full border border-border/70 bg-background px-2 py-1 text-[0.64rem] leading-none text-muted-foreground sm:px-2.5 sm:text-[0.72rem]">
                {aiInsightQuery.data?.confidence ?? "Initial estimate"}
              </span>
            </div>

            <p className="text-[0.86rem] leading-6 text-muted-foreground">
              {liveAccountsInsight.summary}
            </p>

            <div className="grid gap-2.5 md:grid-cols-4">
              {liveAccountsInsight.metrics.map((metric) => (
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
              <p className="text-[0.7rem] uppercase tracking-[0.1em] text-muted-foreground">
                Recommended next step
              </p>
              <p className="mt-1 text-[0.88rem] text-foreground">
                {liveAccountsInsight.recommendation}
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
                        Name the account, choose its type, and keep the original currency intact.
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
                          For credit cards, credit limit stays fixed while current balance tracks
                          what you owe. If you only know the available credit from your banking app,
                          Veyra can derive the balance for you.
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
          <DialogHeader className="shrink-0 border-b border-border/70 px-4 pb-3.5 pt-[max(0.9rem,env(safe-area-inset-top))] pr-13 sm:px-6 sm:pb-4 sm:pt-5 sm:pr-16">
            <div className="inline-flex w-fit rounded-full border border-destructive/15 bg-destructive/5 px-2.5 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-destructive sm:px-3 sm:text-[0.68rem] sm:tracking-[0.18em]">
              Confirm delete
            </div>
            <DialogTitle className="pt-1.5 text-[1.24rem] leading-[1.1] tracking-tight text-[#10292B] dark:text-foreground sm:pt-2 sm:text-[1.45rem]">
              Remove this account?
            </DialogTitle>
            <p className="max-w-md text-[0.84rem] leading-6 text-muted-foreground sm:text-[0.92rem] sm:leading-6.5">
              {deleteTarget
                ? `Delete "${deleteTarget.name}" from your Veyra workspace? This action cannot be undone.`
                : "Delete this account from your Veyra workspace? This action cannot be undone."}
            </p>
          </DialogHeader>

          <div className="grid shrink-0 grid-cols-2 gap-2 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2.5 sm:flex sm:justify-end sm:gap-2.5 sm:px-6 sm:py-4">
            <Button
              type="button"
              variant="outline"
              className="h-9 w-full cursor-pointer rounded-full px-3 text-[0.82rem] sm:h-10 sm:w-auto sm:px-4 sm:text-[0.9rem]"
              onClick={() => setDeleteTarget(null)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="h-9 w-full cursor-pointer rounded-full bg-destructive px-3 text-[0.82rem] text-white hover:bg-destructive/90 sm:h-10 sm:w-auto sm:px-4 sm:text-[0.9rem]"
              onClick={onConfirmDelete}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete account"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={linkedLoanDraft !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !createLinkedLoan.isPending) {
            setLinkedLoanDraft(null);
            setLinkedLoanError(null);
          }
        }}
      >
        <DialogContent mobileBehavior="adaptive" className={linkedLoanDialogContentClassName}>
          <DialogHeader className={accountDialogHeaderClassName + " relative"}>
            <div className="inline-flex w-fit rounded-full border border-[#17393c]/10 bg-white px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-[#17393c] dark:border-white/8 dark:bg-white/6 dark:text-primary">
              Credit linked loan
            </div>
            <DialogTitle className="pt-0.5 text-[1.1rem] tracking-tight sm:pt-1 sm:text-[1.48rem]">
              Create linked loan
            </DialogTitle>
            <p className="hidden max-w-xl text-[0.9rem] leading-6 text-muted-foreground sm:block">
              Connect a card-based cash loan to its credit account without counting the same debt twice.
            </p>
          </DialogHeader>

          <div className={accountDialogBodyClassName}>
            {linkedLoanDraft && linkedLoanCreditAccount ? (
              <div className="space-y-3.5 sm:space-y-4">
                <section className="rounded-[1rem] border border-border/70 bg-white/70 p-3 dark:bg-[#162022] sm:p-3.5">
                  <div className="flex items-start gap-3">
                    <InstitutionAvatar
                      display={getInstitutionDisplay(
                        linkedLoanCreditAccount.institution || linkedLoanCreditAccount.name,
                      )}
                      sizeClassName="size-11"
                      containerClassName="dark:bg-[#182123]"
                      imageClassName="h-full w-full object-cover"
                      initialsClassName="text-[0.78rem] font-semibold tracking-tight"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[0.95rem] font-semibold tracking-tight text-foreground">
                        {linkedLoanCreditAccount.name}
                      </p>
                      <p className="mt-0.5 text-[0.76rem] text-muted-foreground">
                        Current card snapshot
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {[
                      {
                        label: "Balance",
                        value: formatCurrencyMiliunits(
                          linkedLoanCreditAccount.balance,
                          linkedLoanCreditAccount.currency,
                        ),
                      },
                      {
                        label: "Limit",
                        value: formatCurrencyMiliunits(
                          linkedLoanCreditAccount.creditLimit,
                          linkedLoanCreditAccount.currency,
                        ),
                      },
                      {
                        label: "Available",
                        value: formatCurrencyMiliunits(
                          Math.max(
                            linkedLoanCreditAccount.creditLimit - linkedLoanCreditAccount.balance,
                            0,
                          ),
                          linkedLoanCreditAccount.currency,
                        ),
                      },
                      {
                        label: "Utilization",
                        value:
                          linkedLoanCreditAccount.creditLimit > 0
                            ? `${Math.round(
                                (linkedLoanCreditAccount.balance /
                                  linkedLoanCreditAccount.creditLimit) *
                                  100,
                              )}%`
                            : "No limit",
                      },
                    ].map((metric) => (
                      <div
                        key={metric.label}
                        className="min-w-0 rounded-[0.8rem] border border-border/70 bg-background/80 px-2.5 py-2 dark:bg-[#182123]"
                      >
                        <p className="truncate text-[0.58rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                          {metric.label}
                        </p>
                        <p className="mt-1 truncate text-[0.78rem] font-semibold tracking-tight text-foreground sm:text-[0.82rem]">
                          {metric.value}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="space-y-2.5 rounded-[1rem] border border-border/70 bg-white/70 p-3 dark:bg-[#182123] sm:p-3.5">
                  <div className="flex items-center gap-2">
                    <CreditCard className="size-4 text-[#006c67]" />
                    <h3 className="text-[0.95rem] font-semibold tracking-tight">
                      Card balance treatment
                    </h3>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {[
                      {
                        label: "Already included",
                        value: "already_included" as const,
                        text: "Store the loan schedule without changing card balance.",
                      },
                      {
                        label: "Add to card balance",
                        value: "add_to_credit_balance" as const,
                        text: "Increase this card balance once, capped by credit limit.",
                      },
                    ].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() =>
                          setLinkedLoanDraft((current) =>
                            current ? { ...current, balanceTreatment: option.value } : current,
                          )
                        }
                        className={`rounded-[0.9rem] border px-3.5 py-3 text-left transition ${
                          linkedLoanDraft.balanceTreatment === option.value
                            ? "border-[#006c67] bg-emerald-50 text-[#10292B] dark:bg-emerald-500/10 dark:text-foreground"
                            : "border-border/70 bg-background text-foreground hover:bg-muted/60"
                        }`}
                      >
                        <p className="text-[0.86rem] font-semibold">{option.label}</p>
                        <p className="mt-1 text-[0.76rem] leading-5 text-muted-foreground">
                          {option.text}
                        </p>
                      </button>
                    ))}
                  </div>
                </section>

                <section className="space-y-3 rounded-[1rem] border border-border/70 bg-white/70 p-3 dark:bg-[#182123] sm:p-3.5">
                  <div className="flex items-center gap-2">
                    <CalendarClock className="size-4 text-[#006c67]" />
                    <h3 className="text-[0.95rem] font-semibold tracking-tight">Contract terms</h3>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label className={accountFieldLabelClassName}>Loan name</label>
                      <Input
                        value={linkedLoanDraft.loanName}
                        onChange={(event) =>
                          setLinkedLoanDraft((current) =>
                            current ? { ...current, loanName: event.target.value } : current,
                          )
                        }
                        className={accountInputClassName}
                        placeholder="Cash loan"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className={accountFieldLabelClassName}>Lender</label>
                      <Input
                        value={linkedLoanDraft.lenderName}
                        onChange={(event) =>
                          setLinkedLoanDraft((current) =>
                            current ? { ...current, lenderName: event.target.value } : current,
                          )
                        }
                        className={accountInputClassName}
                        placeholder="Lender name"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className={accountFieldLabelClassName}>Cash loan amount</label>
                      <Input
                        inputMode="decimal"
                        value={linkedLoanDraft.principalAmount}
                        onChange={(event) =>
                          setLinkedLoanDraft((current) =>
                            current ? { ...current, principalAmount: event.target.value } : current,
                          )
                        }
                        className={accountInputClassName}
                        placeholder="0.00"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className={accountFieldLabelClassName}>Term months</label>
                      <Input
                        inputMode="numeric"
                        value={linkedLoanDraft.durationMonths}
                        onChange={(event) =>
                          setLinkedLoanDraft((current) =>
                            current ? { ...current, durationMonths: event.target.value } : current,
                          )
                        }
                        className={accountInputClassName}
                        placeholder="e.g. 24"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className={accountFieldLabelClassName}>Monthly amortization</label>
                      <Input
                        inputMode="decimal"
                        value={linkedLoanDraft.monthlyPayment}
                        onChange={(event) =>
                          setLinkedLoanDraft((current) =>
                            current ? { ...current, monthlyPayment: event.target.value } : current,
                          )
                        }
                        className={accountInputClassName}
                        placeholder="0.00"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className={accountFieldLabelClassName}>Total gross amount</label>
                      <div className="flex h-10 items-center rounded-[0.8rem] border border-border/80 bg-muted/45 px-3.5 text-[0.88rem] font-medium text-muted-foreground md:h-9.5 md:px-3 md:text-[0.8rem]">
                        {linkedLoanTotalPayable !== null
                          ? formatCurrencyMiliunits(
                              linkedLoanTotalPayable,
                              linkedLoanCreditAccount.currency,
                            )
                          : "Monthly payment x term"}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className={accountFieldLabelClassName}>Disbursement date</label>
                      <DatePickerField
                        value={linkedLoanDraft.disbursementDate}
                        onChange={(value) =>
                          setLinkedLoanDraft((current) =>
                            current ? { ...current, disbursementDate: value } : current,
                          )
                        }
                        size="compact"
                        className="h-10 rounded-[0.8rem] md:h-9.5"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className={accountFieldLabelClassName}>First payment due</label>
                      <DatePickerField
                        value={linkedLoanDraft.firstPaymentDue}
                        onChange={(value) =>
                          setLinkedLoanDraft((current) =>
                            current ? { ...current, firstPaymentDue: value } : current,
                          )
                        }
                        size="compact"
                        className="h-10 rounded-[0.8rem] md:h-9.5"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className={accountFieldLabelClassName}>Monthly rate % (optional)</label>
                      <Input
                        inputMode="decimal"
                        value={linkedLoanDraft.rate}
                        onChange={(event) =>
                          setLinkedLoanDraft((current) =>
                            current ? { ...current, rate: event.target.value } : current,
                          )
                        }
                        className={accountInputClassName}
                        placeholder="Optional"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className={accountFieldLabelClassName}>Effective interest rate</label>
                      <Input
                        inputMode="decimal"
                        value={linkedLoanDraft.eir}
                        onChange={(event) =>
                          setLinkedLoanDraft((current) =>
                            current ? { ...current, eir: event.target.value } : current,
                          )
                        }
                        className={accountInputClassName}
                        placeholder="Optional"
                      />
                    </div>
                  </div>
                  <p className="rounded-[0.9rem] border border-dashed border-border/70 bg-background/70 px-3 py-2 text-[0.74rem] leading-5 text-muted-foreground">
                    Rate is the lender’s stated monthly rate. Effective interest rate is the fuller cost
                    measure that includes timing and charges when the lender provides it.
                  </p>
                </section>

                <section className="space-y-3 rounded-[1rem] border border-border/70 bg-white/70 p-3 dark:bg-[#182123] sm:p-3.5">
                  <div className="flex items-center gap-2">
                    <Wallet className="size-4 text-[#006c67]" />
                    <h3 className="text-[0.95rem] font-semibold tracking-tight">Payment setup</h3>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label className={accountFieldLabelClassName}>Cash received in</label>
                      <Select
                        value={linkedLoanDraft.destinationAccountId}
                        onValueChange={(value) =>
                          setLinkedLoanDraft((current) =>
                            current ? { ...current, destinationAccountId: value } : current,
                          )
                        }
                      >
                        <SelectTrigger className={accountFieldClassName}>
                          <SelectValue placeholder="Choose bank or wallet" />
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
                    <div className="space-y-2">
                      <label className={accountFieldLabelClassName}>Default payment source</label>
                      <Select
                        value={linkedLoanDraft.defaultPaymentSourceAccountId || "none"}
                        onValueChange={(value) =>
                          setLinkedLoanDraft((current) =>
                            current
                              ? {
                                  ...current,
                                  defaultPaymentSourceAccountId: value === "none" ? "" : value,
                                }
                              : current,
                          )
                        }
                      >
                        <SelectTrigger className={accountFieldClassName}>
                          <SelectValue placeholder="Optional" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No default</SelectItem>
                          {liquidAccounts.map((account) => (
                            <SelectItem key={account.id} value={account.id}>
                              {account.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className={accountFieldLabelClassName}>Notes</label>
                    <Input
                      value={linkedLoanDraft.notes}
                      onChange={(event) =>
                        setLinkedLoanDraft((current) =>
                          current ? { ...current, notes: event.target.value } : current,
                        )
                      }
                      className={accountInputClassName}
                      placeholder="Optional"
                    />
                  </div>
                </section>

                <section className="rounded-[1rem] border border-border/70 bg-white/70 p-3 dark:bg-[#162022] sm:p-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-[0.95rem] font-semibold tracking-tight">Preview</h3>
                    <span className="rounded-full border border-border/70 bg-white px-2.5 py-1 text-[0.72rem] text-muted-foreground dark:bg-[#182123]">
                      Read-only
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {[
                      {
                        label: "Principal",
                        value:
                          linkedLoanPrincipal !== null
                            ? formatCurrencyMiliunits(
                                linkedLoanPrincipal,
                                linkedLoanCreditAccount.currency,
                              )
                            : "—",
                      },
                      {
                        label: "Payable",
                        value:
                          linkedLoanTotalPayable !== null
                            ? formatCurrencyMiliunits(
                                linkedLoanTotalPayable,
                                linkedLoanCreditAccount.currency,
                              )
                            : "—",
                      },
                      {
                        label: "Interest/fees",
                        value:
                          linkedLoanInterestAndFees !== null
                            ? formatCurrencyMiliunits(
                                linkedLoanInterestAndFees,
                                linkedLoanCreditAccount.currency,
                              )
                            : "—",
                      },
                      {
                        label: "Card change",
                        value:
                          linkedLoanDraft.balanceTreatment === "already_included"
                            ? "No change"
                            : linkedLoanPrincipal !== null
                              ? `+${formatCurrencyMiliunits(
                                  linkedLoanPrincipal,
                                  linkedLoanCreditAccount.currency,
                                )}`
                              : "—",
                      },
                    ].map((metric) => (
                      <div
                        key={metric.label}
                        className="min-w-0 rounded-[0.8rem] border border-border/70 bg-background/80 px-3 py-2.5 dark:bg-[#182123]"
                      >
                        <p className="truncate text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                          {metric.label}
                        </p>
                        <p className="mt-1 text-[0.82rem] font-semibold leading-5 tracking-tight text-foreground">
                          {metric.value}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>

                {(linkedLoanError || createLinkedLoan.error) && (
                  <p className="rounded-[0.95rem] border border-destructive/20 bg-destructive/5 px-3.5 py-2.5 text-[0.88rem] text-destructive">
                    {linkedLoanError ?? createLinkedLoan.error?.message}
                  </p>
                )}
              </div>
            ) : null}
          </div>

          <div className={accountDialogFooterClassName}>
            <div className="flex items-center justify-end gap-2.5">
              <Button
                type="button"
                variant="ghost"
                className="h-9.5 rounded-full px-4 text-[0.88rem] text-foreground/80 hover:bg-muted"
                onClick={() => {
                  setLinkedLoanDraft(null);
                  setLinkedLoanError(null);
                }}
                disabled={createLinkedLoan.isPending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="h-10 w-full rounded-[0.95rem] bg-[#17393c] px-6 text-[0.9rem] font-medium text-white hover:bg-[#1d4a4d] disabled:text-white/85 sm:min-w-44 sm:w-auto"
                onClick={submitLinkedLoan}
                disabled={createLinkedLoan.isPending}
              >
                {createLinkedLoan.isPending ? "Creating loan..." : "Create linked loan"}
              </Button>
            </div>
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
            onEdit={startEditById}
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
            onCreateLinkedLoan={startCreateLinkedLoan}
            onEdit={startEditById}
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
