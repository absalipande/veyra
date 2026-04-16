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
        utils.transactions.list.invalidate(),
        utils.transactions.summary.invalidate(),
        utils.budgets.list.invalidate(),
        utils.budgets.summary.invalidate(),
        utils.categories.list.invalidate(),
        utils.categories.summary.invalidate(),
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
      <section className="rounded-[2rem] border border-white/70 bg-[linear-gradient(160deg,rgba(20,53,55,0.98),rgba(25,64,67,0.96))] px-6 py-6 text-white shadow-[0_26px_90px_-60px_rgba(10,31,34,0.75)] dark:border-white/8">
        <p className="text-xs uppercase tracking-[0.24em] text-white/70">Settings</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-[2rem]">
          Workspace preferences
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-white/75">
          Keep your regional defaults and planning cadence consistent across accounts, budgets, and
          upcoming modules.
        </p>
      </section>

      <Card className="border-white/75 bg-white/82 dark:border-white/8 dark:bg-[#182123]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe2 className="size-4 text-primary" />
            Regional defaults
          </CardTitle>
          <CardDescription>
            These preferences are used as defaults when you add new records.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
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
        </CardContent>
      </Card>

      <Card className="border-white/75 bg-white/82 dark:border-white/8 dark:bg-[#182123]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SlidersHorizontal className="size-4 text-primary" />
            Planning preferences
          </CardTitle>
          <CardDescription>Keep weekly and date views aligned with how you plan.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
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
        </CardContent>
      </Card>

      <Card className="border-amber-300/45 bg-amber-50/60 dark:border-amber-500/20 dark:bg-amber-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-amber-900 dark:text-amber-200">
            <ShieldCheck className="size-4" />
            Privacy and account controls
          </CardTitle>
          <CardDescription className="text-amber-900/80 dark:text-amber-200/85">
            Manage sign-in, sessions, and account-level actions from the profile menu in the header.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card className="border-rose-200/70 bg-rose-50/40 dark:border-rose-900/50 dark:bg-rose-950/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="size-4" />
            Danger zone
          </CardTitle>
          <CardDescription>
            Permanently delete all workspace finance records. This cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            variant="destructive"
            className="h-11 rounded-full px-5"
            onClick={() => setShowClearDialog(true)}
          >
            <Trash2 className="size-4" />
            Delete workspace data
          </Button>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end">
        <Button
          onClick={() => updateSettings.mutate(draft)}
          disabled={!hasChanges || updateSettings.isPending}
          className="rounded-full px-6"
        >
          {updateSettings.isPending ? "Saving..." : "Save preferences"}
        </Button>
      </div>

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
    rounded-[1.5rem]
    border border-border/70
    bg-background
    p-0
    shadow-2xl
    overflow-hidden
  "
        >
          <DialogHeader className="border-b border-border/60 px-4 pb-4 pt-5 sm:px-5 sm:pb-5 sm:pt-5">
            <div className="flex items-start gap-3 pr-10">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
                <AlertTriangle className="size-5" />
              </div>

              <div className="min-w-0 text-left">
                <DialogTitle className="text-[1.1rem] font-semibold tracking-tight text-foreground sm:text-[1.2rem]">
                  Delete workspace data
                </DialogTitle>
                <DialogDescription className="mt-2 text-sm leading-7 text-muted-foreground">
                  This permanently deletes all accounts, transactions, budgets, and categories.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="px-4 py-4 sm:px-5">
            <div className="space-y-4">
              <div className="rounded-[1.25rem] border border-border/80 px-4 py-3 text-sm leading-6 text-muted-foreground">
                Type{" "}
                <span className="font-mono font-semibold uppercase tracking-[0.08em] text-foreground">
                  {DELETE_CONFIRMATION_PHRASE}
                </span>{" "}
                to continue.
              </div>

              <Input
                value={clearConfirmation}
                onChange={(event) => setClearConfirmation(event.target.value)}
                placeholder={DELETE_CONFIRMATION_PHRASE}
                autoCapitalize="characters"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                className="h-12 rounded-[1.25rem] border-border/80 bg-background px-4 font-mono text-sm uppercase tracking-[0.08em] sm:text-base"
              />
            </div>
          </div>

          <DialogFooter className="!mx-0 !mb-0 border-t border-border/60 px-5 pt-4 pb-7 sm:px-6 sm:pb-6">
            <div className="grid w-full grid-cols-2 gap-2">
              <Button
                type="button"
                variant="destructive"
                disabled={!isDeleteEnabled}
                onClick={() =>
                  clearWorkspace.mutate({
                    confirmation: DELETE_CONFIRMATION_PHRASE,
                  })
                }
                className="h-11 w-full rounded-full px-4 sm:px-6"
              >
                {clearWorkspace.isPending ? "Deleting..." : "Delete permanently"}
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowClearDialog(false);
                  setClearConfirmation("");
                }}
                disabled={clearWorkspace.isPending}
                className="h-11 w-full rounded-full px-4 sm:px-6"
              >
                Cancel
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
