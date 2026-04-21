"use client";

import { useMemo, useState } from "react";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import {
  AlertTriangle,
  CircleAlert,
  Globe2,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import type { AppRouter } from "@/server/api/root";
import { trpc } from "@/trpc/react";
import { getCurrencyLabel } from "@/lib/currencies";
import {
  settingsCurrencyOptions,
  settingsDateFormatLabels,
  settingsDateFormatOptions,
  settingsLocaleLabels,
  settingsLocaleOptions,
  settingsTimezoneLabels,
  settingsTimezoneOptions,
  settingsWeekStartLabels,
  settingsWeekStartOptions,
} from "@/features/settings/lib/options";
import { Button } from "@/components/ui/button";
import { useControlCenter } from "@/components/app/control-center";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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

type RouterOutputs = inferRouterOutputs<AppRouter>;
type RouterInputs = inferRouterInputs<AppRouter>;
type SettingsItem = RouterOutputs["settings"]["get"];
type UpdateSettingsInput = RouterInputs["settings"]["update"];

const DELETE_CONFIRMATION_PHRASE = "DELETE WORKSPACE DATA";

function toDraft(settings: SettingsItem): UpdateSettingsInput {
  return {
    defaultCurrency: settings.defaultCurrency as UpdateSettingsInput["defaultCurrency"],
    locale: settings.locale as UpdateSettingsInput["locale"],
    weekStartsOn: settings.weekStartsOn as UpdateSettingsInput["weekStartsOn"],
    dateFormat: settings.dateFormat as UpdateSettingsInput["dateFormat"],
    timezone: settings.timezone as UpdateSettingsInput["timezone"],
  };
}

export function SettingsWorkspace() {
  const { openControlCenter } = useControlCenter();
  const utils = trpc.useUtils();
  const settingsQuery = trpc.settings.get.useQuery();

  const [draftOverride, setDraftOverride] = useState<UpdateSettingsInput | null>(null);
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [clearConfirmation, setClearConfirmation] = useState("");

  const baseDraft = settingsQuery.data ? toDraft(settingsQuery.data) : null;
  const draft = draftOverride ?? baseDraft;

  const hasChanges = useMemo(() => {
    if (!baseDraft || !draft) return false;

    return (
      baseDraft.defaultCurrency !== draft.defaultCurrency ||
      baseDraft.locale !== draft.locale ||
      baseDraft.weekStartsOn !== draft.weekStartsOn ||
      baseDraft.dateFormat !== draft.dateFormat ||
      baseDraft.timezone !== draft.timezone
    );
  }, [baseDraft, draft]);

  const updateSettings = trpc.settings.update.useMutation({
    onSuccess: async (result) => {
      utils.settings.get.setData(undefined, result.settings);
      setDraftOverride(null);
      await utils.settings.get.invalidate();

      toast.success("Settings saved", {
        description: "Your workspace preferences are now updated.",
      });
    },
    onError: (error) => {
      toast.error("Could not save settings", {
        description: error.message,
      });
    },
  });

  const clearWorkspace = trpc.settings.clearWorkspace.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.accounts.list.invalidate(),
        utils.accounts.summary.invalidate(),
        utils.loans.list.invalidate(),
        utils.loans.summary.invalidate(),
        utils.transactions.list.invalidate(),
        utils.transactions.summary.invalidate(),
        utils.budgets.list.invalidate(),
        utils.budgets.summary.invalidate(),
        utils.categories.list.invalidate(),
        utils.categories.summary.invalidate(),
        utils.ai.dashboardInsight.invalidate(),
        utils.ai.accountsInsight.invalidate(),
        utils.ai.transactionsInsight.invalidate(),
        utils.ai.budgetsInsight.invalidate(),
        utils.ai.loansInsight.invalidate(),
      ]);

      setShowClearDialog(false);
      setClearConfirmation("");

      toast.success("Workspace data deleted", {
        description: "Accounts, transactions, budgets, and categories were cleared.",
      });
    },
    onError: (error) => {
      toast.error("Could not clear workspace", {
        description: error.message,
      });
    },
  });

  const normalizedConfirmation = clearConfirmation.trim().toUpperCase();
  const isDeleteEnabled =
    normalizedConfirmation === DELETE_CONFIRMATION_PHRASE && !clearWorkspace.isPending;

  if (settingsQuery.isLoading || !draft) {
    return (
      <div className="space-y-6">
        <Card className="border-white/75 bg-white/82 dark:border-white/8 dark:bg-[#182123]">
          <CardHeader>
            <CardTitle>Loading settings...</CardTitle>
            <CardDescription>Preparing your workspace preferences.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (settingsQuery.isError) {
    return (
      <Card className="border-destructive/30 bg-destructive/5 dark:border-destructive/25">
        <CardHeader className="space-y-2">
          <CardTitle className="flex items-center gap-2 text-destructive">
            <CircleAlert className="size-4" />
            Could not load settings
          </CardTitle>
          <CardDescription>{settingsQuery.error.message}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="rounded-[1.5rem] border-white/10 bg-[linear-gradient(145deg,rgba(16,41,43,0.98),rgba(29,78,77,0.94))] text-white shadow-[0_26px_80px_-52px_rgba(10,31,34,0.62)]">
        <CardContent className="space-y-4 p-4 sm:p-5 md:space-y-4 md:p-6 lg:p-7.5">
          <div className="flex items-start justify-between gap-4">
            <p className="text-[0.84rem] font-medium tracking-[0.01em] text-white/72 md:text-[0.88rem]">
              Today · {new Date().toLocaleDateString()}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => updateSettings.mutate(draft)}
              disabled={!hasChanges || updateSettings.isPending}
              className="h-8 rounded-full border-white/24 bg-white/[0.08] px-3 text-[0.76rem] font-medium text-white shadow-none hover:bg-white/[0.13] hover:text-white md:h-8 md:px-3.5 md:text-[0.79rem]"
            >
              {updateSettings.isPending ? "Saving..." : "Save preferences"}
            </Button>
          </div>

          <div className="grid gap-4 border-border/70 md:min-h-[7.7rem] md:grid-cols-[minmax(0,1.5fr)_minmax(0,1.02fr)_minmax(0,0.92fr)] md:gap-0">
            <div className="space-y-2.5 md:space-y-3 md:pr-7">
              <h2 className="text-[0.98rem] font-semibold tracking-tight text-white/95 md:text-[1.08rem] lg:text-[1.16rem]">
                Workspace preferences
              </h2>
              <div className="flex items-center gap-2 text-[1.06rem] font-semibold leading-none tracking-tight text-white md:text-[1.34rem] lg:text-[1.48rem]">
                <span
                  className={`size-2.5 rounded-full md:size-3 ${
                    hasChanges ? "bg-amber-400" : "bg-emerald-400"
                  }`}
                />
                {hasChanges ? "Unsaved changes in progress" : "Defaults aligned and ready"}
              </div>
              <p className="max-w-[30ch] text-[0.9rem] leading-6 text-white/74 md:max-w-[34ch] md:text-[0.93rem] md:leading-7">
                Keep your currency, locale, timezone, and planning defaults consistent across new records.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-0 border-t border-white/15 pt-3.5 md:border-0 md:border-l md:border-white/15 md:pl-7 md:pt-0">
              <div className="space-y-2.5 pr-4 md:pr-5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[0.82rem] text-white/70 md:text-[0.88rem]">Regional defaults</p>
                  <span className="flex size-8.5 items-center justify-center rounded-full bg-emerald-100/95 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200 md:size-9">
                    <Globe2 className="size-3.5 md:size-[0.95rem]" />
                  </span>
                </div>
                <p className="text-[0.96rem] font-semibold tracking-tight text-white md:text-[1.18rem] lg:text-[1.28rem]">
                  {draft.defaultCurrency}
                </p>
                <p className="text-[0.82rem] leading-6 text-white/70">
                  {settingsLocaleLabels[draft.locale]} · {settingsTimezoneLabels[draft.timezone]}
                </p>
              </div>

              <div className="space-y-2.5 border-l border-white/15 pl-4 pr-4 md:pr-5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[0.82rem] text-white/70 md:text-[0.88rem]">Planning preferences</p>
                  <span className="flex size-8.5 items-center justify-center rounded-full bg-sky-100/95 text-sky-700 dark:bg-sky-500/20 dark:text-sky-200 md:size-9">
                    <SlidersHorizontal className="size-3.5 md:size-[0.95rem]" />
                  </span>
                </div>
                <p className="text-[0.96rem] font-semibold tracking-tight text-white md:text-[1.18rem] lg:text-[1.28rem]">
                  {settingsWeekStartLabels[draft.weekStartsOn]}
                </p>
                <p className="text-[0.82rem] leading-6 text-white/70">
                  {settingsDateFormatLabels[draft.dateFormat]}
                </p>
              </div>
            </div>

            <div className="hidden space-y-2 border-t border-white/15 pt-4 md:block md:border-0 md:border-l md:border-white/15 md:pl-7 md:pt-0">
              <div className="flex items-center gap-2 text-[0.82rem] text-white/70">
                <ShieldCheck className="size-4" />
                Preference status
              </div>
              <p className="line-clamp-2 text-[0.95rem] font-semibold tracking-tight text-white lg:text-[0.99rem]">
                {hasChanges ? "Review and save your new defaults" : "Your workspace preferences are up to date"}
              </p>
              <p className="text-[0.82rem] leading-6 text-white/70">
                Week starts on {settingsWeekStartLabels[draft.weekStartsOn]} · Timezone {settingsTimezoneLabels[draft.timezone]}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-white/75 bg-white/82 dark:border-white/8 dark:bg-[#182123]">
        <CardHeader className="space-y-2 border-b border-border/60 pb-5">
          <CardTitle className="flex items-center gap-2 text-[1.35rem] tracking-tight">
            <SlidersHorizontal className="size-4 text-primary" />
            Preferences
          </CardTitle>
          <CardDescription>
            Set your defaults and planning preferences to keep your workspace consistent.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6 pt-6">
          <section className="space-y-4">
            <div className="space-y-1">
              <h3 className="flex items-center gap-2 text-[1rem] font-semibold tracking-tight text-foreground">
                <Globe2 className="size-4 text-primary" />
                Regional defaults
              </h3>
              <p className="text-sm leading-6 text-muted-foreground">
                These preferences are used as defaults when you add new records.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Default currency</p>
                <Select
                  value={draft.defaultCurrency}
                  onValueChange={(value) =>
                    setDraftOverride((current) => ({
                      ...(current ?? draft),
                      defaultCurrency: value as UpdateSettingsInput["defaultCurrency"],
                    }))
                  }
                >
                  <SelectTrigger className="h-11 rounded-xl">
                    <SelectValue placeholder="Select currency" />
                  </SelectTrigger>
                  <SelectContent>
                    {settingsCurrencyOptions.map((currency) => (
                      <SelectItem key={currency} value={currency}>
                        {currency} - {getCurrencyLabel(currency)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Locale</p>
                <Select
                  value={draft.locale}
                  onValueChange={(value) =>
                    setDraftOverride((current) => ({
                      ...(current ?? draft),
                      locale: value as UpdateSettingsInput["locale"],
                    }))
                  }
                >
                  <SelectTrigger className="h-11 rounded-xl">
                    <SelectValue placeholder="Select locale" />
                  </SelectTrigger>
                  <SelectContent>
                    {settingsLocaleOptions.map((locale) => (
                      <SelectItem key={locale} value={locale}>
                        {settingsLocaleLabels[locale]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Timezone</p>
                <Select
                  value={draft.timezone}
                  onValueChange={(value) =>
                    setDraftOverride((current) => ({
                      ...(current ?? draft),
                      timezone: value as UpdateSettingsInput["timezone"],
                    }))
                  }
                >
                  <SelectTrigger className="h-11 rounded-xl">
                    <SelectValue placeholder="Select timezone" />
                  </SelectTrigger>
                  <SelectContent>
                    {settingsTimezoneOptions.map((timezone) => (
                      <SelectItem key={timezone} value={timezone}>
                        {settingsTimezoneLabels[timezone]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          <section className="space-y-4 border-t border-border/60 pt-6">
            <div className="space-y-1">
              <h3 className="flex items-center gap-2 text-[1rem] font-semibold tracking-tight text-foreground">
                <SlidersHorizontal className="size-4 text-primary" />
                Planning preferences
              </h3>
              <p className="text-sm leading-6 text-muted-foreground">
                Keep weekly and date views aligned with how you plan.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Week starts on</p>
                <Select
                  value={draft.weekStartsOn}
                  onValueChange={(value) =>
                    setDraftOverride((current) => ({
                      ...(current ?? draft),
                      weekStartsOn: value as UpdateSettingsInput["weekStartsOn"],
                    }))
                  }
                >
                  <SelectTrigger className="h-11 rounded-xl">
                    <SelectValue placeholder="Select week start" />
                  </SelectTrigger>
                  <SelectContent>
                    {settingsWeekStartOptions.map((option) => (
                      <SelectItem key={option} value={option}>
                        {settingsWeekStartLabels[option]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Date format</p>
                <Select
                  value={draft.dateFormat}
                  onValueChange={(value) =>
                    setDraftOverride((current) => ({
                      ...(current ?? draft),
                      dateFormat: value as UpdateSettingsInput["dateFormat"],
                    }))
                  }
                >
                  <SelectTrigger className="h-11 rounded-xl">
                    <SelectValue placeholder="Select date format" />
                  </SelectTrigger>
                  <SelectContent>
                    {settingsDateFormatOptions.map((format) => (
                      <SelectItem key={format} value={format}>
                        {settingsDateFormatLabels[format]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>
        </CardContent>
      </Card>

      <Card className="border-amber-300/45 bg-amber-50/60 dark:border-amber-500/20 dark:bg-amber-500/5">
        <CardContent className="flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-1">
            <p className="flex items-center gap-2 text-[1rem] font-semibold tracking-tight text-amber-900 dark:text-amber-200">
              <ShieldCheck className="size-4" />
              Privacy and account controls
            </p>
            <p className="text-sm leading-6 text-amber-900/80 dark:text-amber-200/85">
              Manage sign-in, sessions, and account-level actions from the profile menu in the header.
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-full border-amber-300/55 bg-white/70 px-5 text-amber-900 hover:bg-white dark:border-amber-400/25 dark:bg-transparent dark:text-amber-100"
            onClick={openControlCenter}
          >
            Open control center
          </Button>
        </CardContent>
      </Card>

      <Card className="border-destructive/20 bg-background/90">
        <CardContent className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-1">
            <p className="flex items-center gap-2 text-sm font-semibold tracking-[0.08em] text-destructive">
              <AlertTriangle className="size-4" />
              Danger zone
            </p>
            <p className="text-sm leading-5 text-muted-foreground">
              Permanently delete all workspace finance records. This cannot be undone.
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            className="h-10 rounded-xl border-destructive/35 px-4 text-destructive hover:bg-destructive/5 hover:text-destructive"
            onClick={() => setShowClearDialog(true)}
          >
            <Trash2 className="size-4" />
            Delete workspace data
          </Button>
        </CardContent>
      </Card>

      <Dialog
        open={showClearDialog}
        onOpenChange={(open) => {
          setShowClearDialog(open);
          if (!open) {
            setClearConfirmation("");
          }
        }}
      >
        <DialogContent
          mobileBehavior="modal"
          className="
    w-[min(92vw,30rem)]
    rounded-[1rem]
    border border-border/70
    bg-background
    p-0
    shadow-xl
    overflow-hidden
  "
        >
          <DialogHeader className="border-b border-border/60 px-5 pb-4 pt-5 sm:px-6">
            <div className="space-y-2 pr-10 text-left">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-destructive/25 bg-destructive/5 px-2.5 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-destructive">
                <AlertTriangle className="size-3.5" />
                Confirm delete
              </div>
              <DialogTitle className="text-[2rem] font-semibold leading-none tracking-tight text-foreground">
                Delete workspace data
              </DialogTitle>
              <DialogDescription className="text-[1.05rem] leading-8 text-muted-foreground">
                This permanently deletes all accounts, transactions, budgets, and categories.
              </DialogDescription>
            </div>
          </DialogHeader>

          <div className="px-5 py-4 sm:px-6">
            <div className="space-y-3">
              <div className="rounded-xl border border-border/80 bg-muted/30 px-3.5 py-3 text-sm leading-6 text-muted-foreground">
                Enter the confirmation phrase:
                <span className="mt-1.5 block font-mono text-sm font-semibold uppercase tracking-[0.14em] text-foreground">
                  {DELETE_CONFIRMATION_PHRASE}
                </span>
              </div>

              <Input
                value={clearConfirmation}
                onChange={(event) => setClearConfirmation(event.target.value)}
                placeholder={DELETE_CONFIRMATION_PHRASE}
                autoCapitalize="characters"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                className="h-11 rounded-xl border-border/80 bg-background px-3.5 font-mono text-sm uppercase tracking-[0.14em]"
              />
            </div>
          </div>

          <DialogFooter className="!mx-0 !mb-0 border-t border-border/60 px-5 py-4 sm:px-6">
            <div className="ml-auto flex w-full justify-end gap-2 sm:w-auto">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowClearDialog(false);
                  setClearConfirmation("");
                }}
                disabled={clearWorkspace.isPending}
                className="h-10 min-w-[7rem] rounded-full px-4"
              >
                Cancel
              </Button>

              <Button
                type="button"
                variant="destructive"
                disabled={!isDeleteEnabled}
                onClick={() =>
                  clearWorkspace.mutate({
                    confirmation: DELETE_CONFIRMATION_PHRASE,
                  })
                }
                className="h-10 min-w-[10.5rem] rounded-full px-4"
              >
                {clearWorkspace.isPending ? "Deleting..." : "Delete permanently"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
