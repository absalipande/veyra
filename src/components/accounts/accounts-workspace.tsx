"use client";

import { useMemo, useState } from "react";
import { Landmark, Plus } from "lucide-react";

import { trpc } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const accountTypeOptions = [
  { label: "Cash", value: "cash" },
  { label: "Wallet", value: "wallet" },
  { label: "Credit", value: "credit" },
  { label: "Loan", value: "loan" },
] as const;

const pesoFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 2,
});

type CreateState = {
  name: string;
  institution: string;
  type: (typeof accountTypeOptions)[number]["value"];
  balance: string;
};

const initialState: CreateState = {
  name: "",
  institution: "",
  type: "cash",
  balance: "",
};

function formatMiliunits(value: number) {
  return pesoFormatter.format(value / 1000);
}

export function AccountsWorkspace() {
  const utils = trpc.useUtils();
  const accountsQuery = trpc.accounts.list.useQuery();
  const summaryQuery = trpc.accounts.summary.useQuery();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CreateState>(initialState);

  const createAccount = trpc.accounts.create.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.accounts.list.invalidate(),
        utils.accounts.summary.invalidate(),
      ]);
      setForm(initialState);
      setOpen(false);
    },
  });

  const parsedBalance = useMemo(() => {
    const numeric = Number(form.balance);
    if (Number.isNaN(numeric)) return 0;
    return Math.round(numeric * 1000);
  }, [form.balance]);

  const isSubmitting = createAccount.isPending;

  const onSubmit = () => {
    if (!form.name.trim()) return;

    createAccount.mutate({
      name: form.name,
      institution: form.institution,
      type: form.type,
      balance: parsedBalance,
    });
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
      <Card className="border-white/75 bg-white/78 shadow-[0_24px_90px_-55px_rgba(10,31,34,0.34)]">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-2xl tracking-tight">Accounts</CardTitle>
            <CardDescription className="mt-2 leading-6">
              The first real feature slice. This list is backed by Drizzle and served through
              protected tRPC procedures.
            </CardDescription>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-full bg-[#17393c] hover:bg-[#1d4a4d]">
                <Plus className="size-4" />
                New account
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-[1.8rem] border-white/80 bg-white/95 sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="text-2xl tracking-tight">Create account</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Account name</label>
                  <Input
                    value={form.name}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="e.g. Maya savings"
                    className="h-12 rounded-2xl"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Institution</label>
                  <Input
                    value={form.institution}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, institution: event.target.value }))
                    }
                    placeholder="Optional"
                    className="h-12 rounded-2xl"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Account type</label>
                  <div className="grid grid-cols-2 gap-2">
                    {accountTypeOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setForm((current) => ({ ...current, type: option.value }))}
                        className={`rounded-2xl border px-4 py-3 text-sm transition ${
                          form.type === option.value
                            ? "border-[#17393c] bg-[#17393c] text-white"
                            : "border-border bg-background text-foreground hover:bg-muted/70"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Opening balance</label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={form.balance}
                    onChange={(event) => setForm((current) => ({ ...current, balance: event.target.value }))}
                    placeholder="0.00"
                    className="h-12 rounded-2xl"
                  />
                </div>
                {createAccount.error && (
                  <p className="text-sm text-destructive">{createAccount.error.message}</p>
                )}
                <Button
                  onClick={onSubmit}
                  disabled={!form.name.trim() || isSubmitting}
                  className="h-12 w-full rounded-2xl bg-[#17393c] hover:bg-[#1d4a4d]"
                >
                  {isSubmitting ? "Creating account..." : "Create account"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {accountsQuery.isLoading &&
              Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="h-24 animate-pulse rounded-[1.7rem] border border-border/70 bg-background/78"
                />
              ))}

            {accountsQuery.data?.length === 0 && (
              <div className="rounded-[1.8rem] border border-dashed border-border/80 bg-background/70 px-6 py-12 text-center">
                <div className="mx-auto flex size-14 items-center justify-center rounded-3xl bg-primary/10 text-primary">
                  <Landmark className="size-6" />
                </div>
                <p className="mt-4 text-lg font-semibold tracking-tight">No accounts yet</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Create your first account to start powering the rest of the workspace.
                </p>
              </div>
            )}

            {accountsQuery.data?.map((account) => (
              <div
                key={account.id}
                className="flex flex-col gap-3 rounded-[1.7rem] border border-border/70 bg-background/78 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-lg font-semibold tracking-tight">{account.name}</p>
                  <p className="text-sm capitalize text-muted-foreground">
                    {account.type}
                    {account.institution ? ` · ${account.institution}` : ""}
                  </p>
                </div>
                <div className="text-left sm:text-right">
                  <p className="text-sm text-muted-foreground">Balance</p>
                  <p className="text-2xl font-semibold tracking-tight">
                    {formatMiliunits(account.balance)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-white/75 bg-white/78 shadow-[0_24px_90px_-55px_rgba(10,31,34,0.34)]">
        <CardHeader>
          <CardTitle className="text-2xl tracking-tight">Accounts summary</CardTitle>
          <CardDescription className="leading-6">
            These totals come from the live accounts data model and will feed the dashboard over time.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {summaryQuery.isLoading &&
            Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="h-24 animate-pulse rounded-[1.7rem] border border-border/70 bg-background/78"
              />
            ))}

          {summaryQuery.data && (
            <>
              {[
                ["Total accounts", String(summaryQuery.data.totalAccounts)],
                ["Cash and wallets", formatMiliunits(summaryQuery.data.totalCash)],
                ["Credit exposure", formatMiliunits(summaryQuery.data.totalCredit)],
                ["Loans tracked", formatMiliunits(summaryQuery.data.totalLoans)],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-[1.7rem] border border-border/70 bg-background/78 px-4 py-4"
                >
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
                </div>
              ))}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
