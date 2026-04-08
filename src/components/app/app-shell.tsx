import { UserButton } from "@clerk/nextjs";
import { Sparkles } from "lucide-react";

import { VeyraWordmark } from "@/components/brand/veyra-wordmark";
import { DesktopAppNavigation, MobileAppNavigation } from "@/components/app/app-navigation";
import { GlobalSearch } from "@/components/app/global-search";
import { ThemeToggle } from "@/components/app/theme-toggle";

type AppShellProps = {
  children: React.ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,rgba(248,246,239,0.96),rgba(243,247,244,0.94))] dark:bg-[linear-gradient(180deg,rgba(16,23,24,0.98),rgba(18,30,31,0.97))]">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px]">
        <aside className="sticky top-0 hidden h-screen w-[292px] shrink-0 self-start border-r border-border/70 bg-white/72 px-5 py-6 backdrop-blur dark:bg-[#101718]/90 xl:flex xl:flex-col">
          <div className="rounded-[2rem] border border-white/80 bg-white/75 p-4 shadow-[0_20px_60px_-45px_rgba(10,31,34,0.42)] dark:border-white/7 dark:bg-[#151d1f] dark:shadow-[0_20px_60px_-45px_rgba(0,0,0,0.58)]">
            <VeyraWordmark />
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              A calmer workspace for accounts, budgets, and day-to-day money decisions.
            </p>
          </div>

          <div className="mt-6">
            <DesktopAppNavigation />
          </div>

          <div className="mt-auto rounded-[1.9rem] border border-white/75 bg-[linear-gradient(145deg,rgba(18,50,52,0.98),rgba(25,66,69,0.95))] p-5 text-white shadow-[0_26px_90px_-60px_rgba(10,31,34,0.8)]">
            <div className="inline-flex rounded-full border border-white/12 bg-white/10 p-2">
              <Sparkles className="size-4" />
            </div>
            <p className="mt-4 text-lg font-semibold tracking-tight">Foundation in place</p>
            <p className="mt-2 text-sm leading-6 text-white/72">
              Auth and branding are ready. Accounts becomes the first real product slice from here.
            </p>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-border/70 bg-background/72 backdrop-blur-xl dark:bg-[#11191b]/82">
            <div className="flex items-center gap-4 px-4 py-4 sm:px-6 lg:px-8">
              <div className="xl:hidden">
                <MobileAppNavigation />
              </div>

              <div className="xl:hidden">
                <VeyraWordmark
                  iconClassName="size-9 dark:brightness-0 dark:invert"
                  textClassName="text-[1.6rem] font-semibold tracking-tight text-[#10292B] dark:text-white"
                />
              </div>

              <GlobalSearch />

              <div className="ml-auto flex items-center gap-3">
                <ThemeToggle />
                <div className="rounded-full border border-border/70 bg-white/90 p-1.5 shadow-[0_18px_40px_-35px_rgba(10,31,34,0.28)] dark:bg-[#182123] dark:shadow-[0_18px_40px_-35px_rgba(0,0,0,0.45)]">
                  <UserButton />
                </div>
              </div>
            </div>
          </header>

          <div className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
