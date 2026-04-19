"use client";

import { useState } from "react";
import { SignOutButton, useClerk, useUser } from "@clerk/nextjs";
import { ChevronRight, LogOut, SlidersHorizontal, UserCircle2 } from "lucide-react";

import { VeyraWordmark } from "@/components/brand/veyra-wordmark";
import { DesktopAppNavigation, MobileAppNavigation } from "@/components/app/app-navigation";
import { GlobalSearch } from "@/components/app/global-search";
import { SidebarTodaySnapshot } from "@/components/app/sidebar-today-snapshot";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { ControlCenterProvider, useControlCenter } from "@/components/app/control-center";
import { GlobalQuickCapture } from "@/features/transactions/components/global-quick-capture";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

type AppShellProps = {
  children: React.ReactNode;
};

function AppShellLayout({ children }: AppShellProps) {
  const { user } = useUser();
  const clerk = useClerk();
  const { openControlCenter } = useControlCenter();

  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

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

  const openManageAccount = () => {
    setProfileMenuOpen(false);
    clerk.openUserProfile();
  };

  const openSettingsModal = () => {
    setProfileMenuOpen(false);
    openControlCenter();
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,rgba(248,246,239,0.96),rgba(243,247,244,0.94))] dark:bg-[linear-gradient(180deg,rgba(16,23,24,0.98),rgba(18,30,31,0.97))]">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px] px-0 xl:px-3">
        <aside className="sticky top-0 hidden h-screen w-[292px] shrink-0 self-start rounded-[2rem] border-r border-border/70 bg-white/72 px-5 py-6 backdrop-blur dark:bg-[#101718]/90 xl:my-3 xl:flex xl:flex-col xl:border xl:border-white/60 dark:xl:border-white/6">
          <div className="rounded-[1.85rem] border border-white/80 bg-white/78 p-4.5 shadow-[0_20px_60px_-45px_rgba(10,31,34,0.42)] dark:border-white/7 dark:bg-[#151d1f] dark:shadow-[0_20px_60px_-45px_rgba(0,0,0,0.58)]">
            <VeyraWordmark />
            <p className="mt-3 text-[0.92rem] leading-6 text-muted-foreground">
              A calmer workspace for accounts, budgets, and day-to-day money decisions.
            </p>
          </div>

          <div className="mt-5">
            <DesktopAppNavigation />
          </div>

          <SidebarTodaySnapshot />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col xl:py-3 xl:pr-3 xl:pl-3">
          <header className="sticky top-0 z-20 border-b border-border/70 bg-background/78 backdrop-blur-xl dark:bg-[#11191b]/84 xl:rounded-none xl:border-0">
            <div className="flex min-h-[72px] items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:gap-4 lg:px-8 xl:px-7">
              <div className="flex items-center gap-3 lg:gap-4">
                <div className="xl:hidden">
                  <MobileAppNavigation />
                </div>

                <div className="xl:hidden">
                  <VeyraWordmark
                    iconClassName="size-7 dark:brightness-0 dark:invert"
                    textClassName="text-[1.65rem] font-semibold tracking-tight text-[#10292B] dark:text-white"
                  />
                </div>
              </div>

              <div className="hidden min-w-0 flex-1 lg:flex">
                <GlobalSearch />
              </div>

              <div className="flex items-center gap-2 lg:gap-2.5">
                <div className="lg:hidden">
                  <GlobalSearch />
                </div>

                <GlobalQuickCapture />

                <div className="hidden lg:block">
                  <ThemeToggle />
                </div>

                <DropdownMenu open={profileMenuOpen} onOpenChange={setProfileMenuOpen}>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="rounded-full border border-border/70 bg-white/92 p-1.5 shadow-[0_18px_40px_-35px_rgba(10,31,34,0.24)] outline-none transition hover:bg-white dark:bg-[#182123] dark:shadow-[0_18px_40px_-35px_rgba(0,0,0,0.42)]"
                      aria-label="Open profile menu"
                    >
                      {user?.imageUrl ? (
                        <img src={user.imageUrl} alt={displayName} className="size-8 rounded-full object-cover" />
                      ) : (
                        <div className="flex size-8 items-center justify-center rounded-full bg-[#17393c] text-[0.78rem] font-semibold text-white">
                          {initials}
                        </div>
                      )}
                    </button>
                  </DropdownMenuTrigger>

                  <DropdownMenuContent
                    align="end"
                    sideOffset={10}
                    className="w-[225px] rounded-[1rem] border border-border/70 bg-white p-1.5 shadow-[0_24px_60px_-35px_rgba(10,31,34,0.28)] dark:border-white/8 dark:bg-[#182123]"
                  >
                    <DropdownMenuItem className="h-10 rounded-lg px-2.5 text-sm" onSelect={openManageAccount}>
                      <UserCircle2 className="mr-2 size-4 text-muted-foreground" />
                      <span className="flex-1">Manage account</span>
                    </DropdownMenuItem>

                    <DropdownMenuItem className="h-10 rounded-lg px-2.5 text-sm" onSelect={openSettingsModal}>
                      <SlidersHorizontal className="mr-2 size-4 text-muted-foreground" />
                      <span className="flex-1">Settings</span>
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </DropdownMenuItem>

                    <DropdownMenuSeparator className="my-1" />

                    <SignOutButton>
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-10 w-full justify-start rounded-lg px-2.5 text-sm font-medium text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/20"
                      >
                        <LogOut className="mr-2 size-4" />
                        <span className="flex-1 text-left">Sign out</span>
                      </Button>
                    </SignOutButton>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </header>

          <div className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-7 xl:px-7">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AppShell({ children }: AppShellProps) {
  return (
    <ControlCenterProvider>
      <AppShellLayout>{children}</AppShellLayout>
    </ControlCenterProvider>
  );
}
