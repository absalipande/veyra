"use client";

import { useState } from "react";
import {
  BadgeDollarSign,
  CreditCard,
  HandCoins,
  LayoutDashboard,
  Menu,
  PiggyBank,
  Settings2,
  Tags,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { VeyraWordmark } from "@/components/brand/veyra-wordmark";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const items = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    available: true,
  },
  {
    label: "Accounts",
    href: "/accounts",
    icon: CreditCard,
    available: true,
  },
  {
    label: "Transactions",
    href: "/transactions",
    icon: BadgeDollarSign,
    available: true,
  },
  {
    label: "Budgets",
    href: "/budgets",
    icon: PiggyBank,
    available: true,
  },
  {
    label: "Loans",
    href: "/loans",
    icon: HandCoins,
    available: true,
  },
  {
    label: "Categories",
    href: "/categories",
    icon: Tags,
    available: true,
  },
  {
    label: "Settings",
    href: "/settings",
    icon: Settings2,
    available: true,
  },
];

type NavigationListProps = {
  onNavigate?: () => void;
};

function NavigationList({ onNavigate }: NavigationListProps) {
  const pathname = usePathname();

  return (
    <div className="space-y-1.5">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive =
          item.available &&
          (pathname === item.href || pathname.startsWith(`${item.href}/`));

        if (!item.available) {
          return (
            <div
              key={item.label}
              className="flex items-center justify-between rounded-[1.1rem] border border-transparent px-3 py-2.5 text-[0.95rem] text-muted-foreground"
            >
              <div className="flex items-center gap-2.5">
                <div className="flex size-8.5 items-center justify-center rounded-[0.95rem] bg-muted/65 text-muted-foreground">
                  <Icon className="size-[0.95rem]" />
                </div>
                <span>{item.label}</span>
              </div>
              <span className="rounded-full border border-border/70 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em]">
                Soon
              </span>
            </div>
          );
        }

        return (
          <Link
            key={item.label}
            href={item.href}
            onClick={onNavigate}
            className={`flex items-center gap-2.5 rounded-[1.1rem] px-3 py-2.5 text-[0.95rem] font-medium transition-colors ${
              isActive
                ? "bg-[#17393c] text-white shadow-[0_16px_36px_-30px_rgba(23,57,60,0.82)] dark:bg-[#20474a]"
                : "text-foreground hover:bg-muted/65"
            }`}
          >
            <div
              className={`flex size-8.5 items-center justify-center rounded-[0.95rem] ${
                isActive ? "bg-white/12 text-white" : "bg-foreground/[0.045] text-muted-foreground"
              }`}
            >
              <Icon className="size-[0.95rem]" />
            </div>
            <span className="tracking-[-0.01em]">{item.label}</span>
          </Link>
        );
      })}
    </div>
  );
}

export function DesktopAppNavigation() {
  return <NavigationList />;
}

export function MobileAppNavigation() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="size-10 rounded-full border-border/70 bg-white/92 shadow-[0_16px_36px_-30px_rgba(10,31,34,0.22)] dark:bg-[#182123] dark:shadow-[0_16px_36px_-30px_rgba(0,0,0,0.34)]"
        >
          <Menu className="size-5" />
          <span className="sr-only">Open navigation</span>
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="w-[86vw] max-w-sm border-r border-border/70 bg-background/95 p-0 dark:bg-[#11191b]/95"
      >
        <div className="flex h-full flex-col">
          <div className="border-b border-border/70 px-6 py-5.5">
            <VeyraWordmark
              iconClassName="size-10"
              textClassName="text-[1.5rem] font-semibold tracking-tight text-[#10292B] dark:text-white"
            />
            <p className="mt-2 text-[0.92rem] text-muted-foreground">Protected workspace</p>
          </div>
          <div className="flex-1 px-4 py-4.5">
            <NavigationList onNavigate={() => setOpen(false)} />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
