"use client";

import {
  BadgeDollarSign,
  CreditCard,
  LayoutDashboard,
  PiggyBank,
  Settings2,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

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
    href: "",
    icon: CreditCard,
    available: false,
  },
  {
    label: "Transactions",
    href: "",
    icon: BadgeDollarSign,
    available: false,
  },
  {
    label: "Budgets",
    href: "",
    icon: PiggyBank,
    available: false,
  },
  {
    label: "Settings",
    href: "",
    icon: Settings2,
    available: false,
  },
];

function NavigationList() {
  const pathname = usePathname();

  return (
    <div className="space-y-2">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = item.available && pathname === item.href;

        if (!item.available) {
          return (
            <div
              key={item.label}
              className="flex items-center justify-between rounded-2xl border border-transparent px-3 py-3 text-sm text-muted-foreground"
            >
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-xl bg-muted/70 text-muted-foreground">
                  <Icon className="size-4" />
                </div>
                <span>{item.label}</span>
              </div>
              <span className="rounded-full border border-border/70 px-2 py-0.5 text-[11px] uppercase tracking-[0.18em]">
                Soon
              </span>
            </div>
          );
        }

        return (
          <Link
            key={item.label}
            href={item.href}
            className={`flex items-center gap-3 rounded-2xl px-3 py-3 text-sm transition ${
              isActive
                ? "bg-[#17393c] text-white shadow-[0_18px_40px_-28px_rgba(23,57,60,0.9)]"
                : "text-foreground hover:bg-muted/70"
            }`}
          >
            <div
              className={`flex size-9 items-center justify-center rounded-xl ${
                isActive ? "bg-white/12 text-white" : "bg-primary/10 text-primary"
              }`}
            >
              <Icon className="size-4" />
            </div>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </div>
  );
}

export function DesktopAppNavigation() {
  return <NavigationList />;
}

export function MobileAppNavigation({ children }: { children: React.ReactNode }) {
  return (
    <Sheet>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent side="left" className="w-[86vw] max-w-sm border-r border-border/70 bg-background/95 p-0">
        <div className="flex h-full flex-col">
          <div className="border-b border-border/70 px-6 py-6">
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                <Sparkles className="size-5" />
              </div>
              <div>
                <p className="text-lg font-semibold tracking-tight">veyra</p>
                <p className="text-sm text-muted-foreground">Protected workspace</p>
              </div>
            </div>
          </div>
          <div className="flex-1 px-4 py-5">
            <NavigationList />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
