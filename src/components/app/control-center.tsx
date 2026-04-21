"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { SignOutButton, useClerk, useUser } from "@clerk/nextjs";
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Keyboard,
  LogOut,
  Moon,
  Shield,
  UserCircle2,
} from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";

import { trpc } from "@/trpc/react";
import type { AppRouter } from "@/server/api/root";
import { getCurrencyLabel } from "@/lib/currencies";
import {
  settingsCurrencyOptions,
  settingsDateFormatLabels,
  settingsDateFormatOptions,
  settingsLocaleLabels,
  settingsLocaleOptions,
} from "@/features/settings/lib/options";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type RouterInputs = inferRouterInputs<AppRouter>;
type SettingsItem = RouterOutputs["settings"]["get"];
type UpdateSettingsInput = RouterInputs["settings"]["update"];

type ControlCenterContextValue = {
  openControlCenter: () => void;
};

const ControlCenterContext = createContext<ControlCenterContextValue | null>(null);
const KEYBOARD_HINTS_KEY = "veyra.ui.keyboard-hints";

function toDraft(settings: SettingsItem): UpdateSettingsInput {
  return {
    defaultCurrency: settings.defaultCurrency as UpdateSettingsInput["defaultCurrency"],
    locale: settings.locale as UpdateSettingsInput["locale"],
    weekStartsOn: settings.weekStartsOn as UpdateSettingsInput["weekStartsOn"],
    dateFormat: settings.dateFormat as UpdateSettingsInput["dateFormat"],
    timezone: settings.timezone as UpdateSettingsInput["timezone"],
  };
}

function TogglePill({
  checked,
  onToggle,
  label,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onToggle}
      className="inline-flex h-7 w-12 items-center rounded-full border border-[#0f5d55]/25 bg-[#0f6a5f] px-0.5 transition"
    >
      <span
        className={`block size-6 rounded-full bg-white shadow-sm transition-transform ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

function ControlCenterModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { user } = useUser();
  const clerk = useClerk();
  const { resolvedTheme, setTheme } = useTheme();
  const utils = trpc.useUtils();
  const settingsQuery = trpc.settings.get.useQuery();

  const [draftOverride, setDraftOverride] = useState<UpdateSettingsInput | null>(null);
  const [keyboardHints, setKeyboardHints] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem(KEYBOARD_HINTS_KEY) !== "0";
  });
  const [isMobile, setIsMobile] = useState(false);

  const settings = settingsQuery.data;
  const baseDraft = settings ? toDraft(settings) : null;
  const draft = draftOverride ?? baseDraft;
  const isDark = resolvedTheme === "dark";

  const hasPreferenceChanges = useMemo(() => {
    if (!baseDraft || !draft) return false;
    return (
      baseDraft.defaultCurrency !== draft.defaultCurrency ||
      baseDraft.locale !== draft.locale ||
      baseDraft.weekStartsOn !== draft.weekStartsOn ||
      baseDraft.dateFormat !== draft.dateFormat ||
      baseDraft.timezone !== draft.timezone
    );
  }, [baseDraft, draft]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const media = window.matchMedia("(max-width: 639px)");
    const onChange = () => setIsMobile(media.matches);
    onChange();
    media.addEventListener("change", onChange);

    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(KEYBOARD_HINTS_KEY, keyboardHints ? "1" : "0");
    document.documentElement.dataset.keyboardHints = keyboardHints ? "on" : "off";
  }, [keyboardHints]);

  const updateSettings = trpc.settings.update.useMutation({
    onSuccess: async (result) => {
      utils.settings.get.setData(undefined, result.settings);
      setDraftOverride(null);
      await utils.settings.get.invalidate();
      toast.success("Control center updated", {
        description: "Your workspace preferences were saved.",
      });
    },
    onError: (error) => {
      toast.error("Could not save preferences", {
        description: error.message,
      });
    },
  });

  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();
  const primaryEmail = user?.primaryEmailAddress?.emailAddress ?? "";
  const displayName = fullName || primaryEmail.split("@")[0] || "Account";
  const initials =
    fullName
      ?.split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || displayName.slice(0, 2).toUpperCase();

  const actionRowClassName =
    "flex h-10 w-full items-center gap-3 rounded-xl px-2.5 text-[0.98rem] font-medium text-foreground transition hover:bg-muted/45 dark:hover:bg-white/6 sm:h-11 sm:text-[1rem]";

  const content = (
    <>
      <DialogHeader className="border-b border-border/70 px-4 pb-3.5 pt-4 sm:px-6 sm:pb-5 sm:pt-6">
        <DialogTitle className="text-[1.22rem] tracking-tight text-foreground sm:text-[1.6rem]">Control center</DialogTitle>
      </DialogHeader>

      <div className="space-y-2.5 px-3.5 py-3 sm:space-y-4 sm:px-6 sm:py-5">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="relative">
              {user?.imageUrl ? (
                <img src={user.imageUrl} alt={displayName} className="size-12 rounded-full object-cover sm:size-14" />
              ) : (
                <div className="flex size-12 items-center justify-center rounded-full bg-[#156a60] text-[1.35rem] font-semibold text-white sm:size-14 sm:text-[1.55rem]">
                  {initials.slice(0, 1)}
                </div>
              )}
              <span className="absolute bottom-0.5 right-0.5 size-3.5 rounded-full border-2 border-white bg-emerald-400" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[1.1rem] font-semibold tracking-tight text-foreground sm:text-[1.25rem]">{displayName}</p>
              <p className="truncate text-[0.88rem] text-muted-foreground sm:text-[0.95rem]">{primaryEmail || "Signed in"}</p>
            </div>
          </div>

          <div className="rounded-xl border border-border/70 bg-white px-3 py-2.5 dark:bg-[#141d1f]">
            <p className="text-[0.72rem] uppercase tracking-[0.08em] text-muted-foreground">
              Settings scope
            </p>
            <p className="mt-1 text-[0.88rem] text-foreground/90">
              These defaults are used across dashboard, transactions, budgets, and account views.
            </p>
          </div>

          <section className="space-y-1 border-t border-border/70 pt-2.5">
            <p className="px-1 text-[0.74rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Account</p>
            <button
              type="button"
              className="flex h-11 w-full items-center gap-3 rounded-xl border border-border/70 px-2.5 text-[1rem] font-medium text-foreground transition hover:bg-muted/45"
              onClick={() => clerk.openUserProfile()}
            >
              <UserCircle2 className="size-4.5 text-muted-foreground" />
              <span className="flex-1 text-left">Manage account</span>
              <ChevronRight className="size-4 text-muted-foreground" />
            </button>
            <button type="button" className={actionRowClassName} onClick={() => clerk.openUserProfile({ __experimental_startPath: "/security" })}>
              <Shield className="size-4.5 text-muted-foreground" />
              <span className="flex-1 text-left">Security & sessions</span>
              <ChevronRight className="size-4 text-muted-foreground" />
            </button>
          </section>

          <section className="space-y-2.5 border-t border-border/70 pt-2.5">
            <div className="flex items-center justify-between gap-2 px-1">
              <p className="text-[0.74rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Useful settings</p>
              {hasPreferenceChanges ? (
                <Button
                  size="sm"
                  className="h-8 rounded-full bg-[#17393c] px-3 text-white hover:bg-[#1d4a4d]"
                  onClick={() => draft && updateSettings.mutate(draft)}
                  disabled={updateSettings.isPending || !draft}
                >
                  {updateSettings.isPending ? "Saving..." : "Save"}
                </Button>
              ) : null}
            </div>

            {settingsQuery.isError ? (
              <div className="flex items-center gap-2 rounded-xl border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                <AlertCircle className="size-4" />
                Could not load quick settings
              </div>
            ) : null}

            <div className="grid gap-2.5 sm:grid-cols-2">
              <div className="space-y-1.5">
                <p className="text-[0.82rem] font-medium text-foreground">Default currency</p>
                <Select
                  value={draft?.defaultCurrency ?? undefined}
                  onValueChange={(value) =>
                    setDraftOverride((current) => ({
                      ...(current ?? (draft as UpdateSettingsInput)),
                      defaultCurrency: value as UpdateSettingsInput["defaultCurrency"],
                    }))
                  }
                  disabled={!draft}
                >
                  <SelectTrigger className="h-9 rounded-xl bg-background">
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

              <div className="space-y-1.5">
                <p className="text-[0.82rem] font-medium text-foreground">Locale</p>
                <Select
                  value={draft?.locale ?? undefined}
                  onValueChange={(value) =>
                    setDraftOverride((current) => ({
                      ...(current ?? (draft as UpdateSettingsInput)),
                      locale: value as UpdateSettingsInput["locale"],
                    }))
                  }
                  disabled={!draft}
                >
                  <SelectTrigger className="h-9 rounded-xl bg-background">
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

              <div className="space-y-1.5 sm:col-span-2">
                <p className="text-[0.82rem] font-medium text-foreground">Date format</p>
                <Select
                  value={draft?.dateFormat ?? undefined}
                  onValueChange={(value) =>
                    setDraftOverride((current) => ({
                      ...(current ?? (draft as UpdateSettingsInput)),
                      dateFormat: value as UpdateSettingsInput["dateFormat"],
                    }))
                  }
                  disabled={!draft}
                >
                  <SelectTrigger className="h-9 rounded-xl bg-background">
                    <SelectValue placeholder="Date format" />
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

            <div className="space-y-1">
              <div className="flex h-10 items-center gap-3 rounded-xl px-2.5 text-[0.98rem] font-medium text-foreground sm:h-11 sm:text-[1rem]">
                <Moon className="size-4.5 text-muted-foreground" />
                <span className="flex-1">Theme</span>
                <TogglePill
                  checked={isDark}
                  onToggle={() => setTheme(isDark ? "light" : "dark")}
                  label="Toggle dark mode"
                />
              </div>

              <div className="flex h-10 items-center gap-3 rounded-xl px-2.5 text-[0.98rem] font-medium text-foreground sm:h-11 sm:text-[1rem]">
                <Keyboard className="size-4.5 text-muted-foreground" />
                <span className="flex-1">Keyboard hints</span>
                <TogglePill
                  checked={keyboardHints}
                  onToggle={() => setKeyboardHints((current) => !current)}
                  label="Toggle keyboard hints"
                />
              </div>
            </div>
          </section>

          <section className="space-y-1 border-t border-border/70 pt-2.5">
            <p className="px-1 text-[0.74rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Exit</p>
            <SignOutButton>
              <Button
                type="button"
                variant="ghost"
                className="h-11 w-full justify-start rounded-xl px-2.5 text-[1rem] font-medium text-rose-600 hover:bg-rose-50 hover:text-rose-700"
              >
                <LogOut className="size-4.5" />
                <span className="ml-3 flex-1 text-left">Sign out</span>
                {keyboardHints ? (
                  <span className="keyboard-hint rounded-lg border border-rose-200 bg-rose-50 px-2 py-0.5 text-[0.72rem] text-rose-500">
                    ⇧ ⌘ Q
                  </span>
                ) : null}
              </Button>
            </SignOutButton>
          </section>
      </div>
    </>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="h-[84dvh] rounded-t-[1.15rem] border border-border/70 bg-card p-0"
        >
          <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-border" />
          <div className="h-[calc(84dvh-0.5rem)] overflow-y-auto">
            {content}
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] w-[calc(100vw-1rem)] overflow-y-auto rounded-[1.5rem] border-border/70 bg-card p-0 sm:max-w-2xl">
        {content}
      </DialogContent>
    </Dialog>
  );
}

export function ControlCenterProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  const value = useMemo<ControlCenterContextValue>(
    () => ({
      openControlCenter: () => setOpen(true),
    }),
    [],
  );

  return (
    <ControlCenterContext.Provider value={value}>
      {children}
      <ControlCenterModal open={open} onOpenChange={setOpen} />
    </ControlCenterContext.Provider>
  );
}

export function useControlCenter() {
  const context = useContext(ControlCenterContext);

  if (!context) {
    throw new Error("useControlCenter must be used within ControlCenterProvider");
  }

  return context;
}
