import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { Menu, Search, Sparkles } from "lucide-react";

import { VeyraWordmark } from "@/components/brand/veyra-wordmark";
import { Button } from "@/components/ui/button";
import { DesktopAppNavigation, MobileAppNavigation } from "@/components/app/app-navigation";

type AppShellProps = {
  children: React.ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,rgba(248,246,239,0.96),rgba(243,247,244,0.94))]">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px]">
        <aside className="hidden w-[292px] shrink-0 border-r border-border/70 bg-white/72 px-5 py-6 backdrop-blur xl:flex xl:flex-col">
          <div className="rounded-[2rem] border border-white/80 bg-white/75 p-4 shadow-[0_20px_60px_-45px_rgba(10,31,34,0.42)]">
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
          <header className="sticky top-0 z-20 border-b border-border/70 bg-background/72 backdrop-blur-xl">
            <div className="flex items-center gap-4 px-4 py-4 sm:px-6 lg:px-8">
              <div className="xl:hidden">
                <MobileAppNavigation>
                  <Button variant="outline" size="icon" className="rounded-2xl">
                    <Menu className="size-5" />
                  </Button>
                </MobileAppNavigation>
              </div>

              <div className="xl:hidden">
                <VeyraWordmark
                  iconClassName="size-9"
                  textClassName="text-[1.6rem] font-semibold tracking-tight text-[#10292B]"
                />
              </div>

              <div className="hidden min-w-0 flex-1 items-center gap-3 rounded-2xl border border-border/70 bg-white/80 px-4 py-3 text-sm text-muted-foreground shadow-[0_18px_40px_-35px_rgba(10,31,34,0.25)] lg:flex">
                <Search className="size-4" />
                <span>Search will live here once accounts and transactions are wired.</span>
              </div>

              <div className="ml-auto flex items-center gap-3">
                <Button asChild variant="outline" className="hidden rounded-full lg:inline-flex">
                  <Link href="/sign-in">Auth pages</Link>
                </Button>
                <div className="rounded-full border border-border/70 bg-white/90 p-1.5 shadow-[0_18px_40px_-35px_rgba(10,31,34,0.28)]">
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
