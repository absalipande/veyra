import { UserButton } from "@clerk/nextjs";

import { VeyraWordmark } from "@/components/brand/veyra-wordmark";
import { DesktopAppNavigation, MobileAppNavigation } from "@/components/app/app-navigation";
import { GlobalSearch } from "@/components/app/global-search";
import { SidebarTodaySnapshot } from "@/components/app/sidebar-today-snapshot";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { GlobalQuickCapture } from "@/features/transactions/components/global-quick-capture";

type AppShellProps = {
  children: React.ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,rgba(248,246,239,0.96),rgba(243,247,244,0.94))] dark:bg-[linear-gradient(180deg,rgba(16,23,24,0.98),rgba(18,30,31,0.97))]">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px] px-0 xl:px-3">
        <aside className="sticky top-0 hidden h-screen w-[292px] shrink-0 self-start rounded-[2rem] border-r border-border/70 bg-white/72 px-5 py-6 backdrop-blur dark:bg-[#101718]/90 xl:flex xl:flex-col xl:my-3 xl:border xl:border-white/60 dark:xl:border-white/6">
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

                <div className="rounded-full border border-border/70 bg-white/92 p-1.5 shadow-[0_18px_40px_-35px_rgba(10,31,34,0.24)] dark:bg-[#182123] dark:shadow-[0_18px_40px_-35px_rgba(0,0,0,0.42)]">
                  <UserButton />
                </div>
              </div>
            </div>
          </header>

          <div className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-7 xl:px-7">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
