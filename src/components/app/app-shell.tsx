"use client";

import { useEffect } from "react";
import { UserButton } from "@clerk/nextjs";
import { SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { VeyraWordmark } from "@/components/brand/veyra-wordmark";
import { DesktopAppNavigation, MobileAppNavigation } from "@/components/app/app-navigation";
import { GlobalSearch } from "@/components/app/global-search";
import { SidebarTodaySnapshot } from "@/components/app/sidebar-today-snapshot";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { ControlCenterProvider, useControlCenter } from "@/components/app/control-center";
import { GlobalQuickCapture } from "@/features/transactions/components/global-quick-capture";
import { Button } from "@/components/ui/button";

type AppShellProps = {
  children: React.ReactNode;
};

function AppShellLayout({ children }: AppShellProps) {
  const { openControlCenter } = useControlCenter();
  const pathname = usePathname();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, [pathname]);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,rgba(248,246,239,0.96),rgba(243,247,244,0.94))] dark:bg-[linear-gradient(180deg,rgba(16,23,24,0.98),rgba(18,30,31,0.97))]">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px] px-0 xl:px-3">
        <aside className="sticky top-0 hidden h-screen w-[292px] shrink-0 self-start rounded-[2rem] border-r border-border/70 bg-white/72 px-5 py-6 backdrop-blur dark:bg-[#101718]/90 xl:my-3 xl:flex xl:flex-col xl:border xl:border-white/60 dark:xl:border-white/6">
          <div className="rounded-[1.85rem] border border-white/80 bg-white/78 p-4.5 shadow-[0_20px_60px_-45px_rgba(10,31,34,0.42)] dark:border-white/7 dark:bg-[#151d1f] dark:shadow-[0_20px_60px_-45px_rgba(0,0,0,0.58)]">
            <Link
              href="/dashboard"
              className="block rounded-[1rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8db8b3]/35"
              aria-label="Go to dashboard"
            >
              <VeyraWordmark
                iconSrc="/auth/veyra-v-icon.svg"
                textClassName="text-2xl font-semibold tracking-tight text-[#10292B] dark:text-[#e7f2f1]"
              />
            </Link>
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
          <header className="sticky top-0 z-20 border-b border-border/70 bg-[#f8f6ef]/92 backdrop-blur-xl dark:bg-[#11191b]/84 xl:rounded-none xl:border-0">
            <div className="flex min-h-[72px] items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:gap-4 lg:px-8 xl:px-7">
              <div className="flex items-center gap-3 lg:gap-4">
                <div className="xl:hidden">
                  <MobileAppNavigation />
                </div>

                <div className="xl:hidden">
                  <Link
                    href="/dashboard"
                    className="block rounded-[0.8rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8db8b3]/35"
                    aria-label="Go to dashboard"
                  >
                    <VeyraWordmark
                      iconSrc="/auth/veyra-v-icon.svg"
                      iconClassName="size-7"
                      textClassName="text-[1.65rem] font-semibold tracking-tight text-[#10292B] dark:text-white"
                    />
                  </Link>
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

                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="rounded-full border-border/70 bg-white/92 dark:bg-[#182123]"
                  onClick={openControlCenter}
                >
                  <SlidersHorizontal className="size-4" />
                  <span className="sr-only">Open settings</span>
                </Button>

                <UserButton
                  appearance={{
                    elements: {
                      userButtonTrigger:
                        "size-10 rounded-full border border-border/70 bg-transparent p-0 shadow-none hover:bg-transparent",
                      userButtonAvatarBox: "size-8.5 rounded-full shadow-none ring-0",
                      userButtonPopoverCard:
                        "rounded-[1rem] border border-border/70 bg-white shadow-[0_24px_60px_-35px_rgba(10,31,34,0.28)] dark:border-white/8 dark:bg-[#182123]",
                    },
                  }}
                />
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
