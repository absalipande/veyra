"use client";

import { Activity, DatabaseZap, ShieldCheck } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/trpc/react";

const statusCards = [
  {
    key: "auth",
    label: "Auth",
    icon: ShieldCheck,
  },
  {
    key: "shell",
    label: "Shell",
    icon: Activity,
  },
  {
    key: "dataLayer",
    label: "Data layer",
    icon: DatabaseZap,
  },
] as const;

export function DashboardFoundationStatus() {
  const statusQuery = trpc.system.status.useQuery();
  const viewerQuery = trpc.system.viewer.useQuery();

  if (statusQuery.isLoading || viewerQuery.isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-36 rounded-[1.7rem] border border-border/70 bg-white/78 animate-pulse dark:bg-[#182123]"
          />
        ))}
      </div>
    );
  }

  if (statusQuery.error || viewerQuery.error) {
    return (
      <Card className="border-destructive/20 bg-white/75 dark:bg-[#182123]">
        <CardHeader>
          <CardTitle className="text-xl">Foundation check failed</CardTitle>
        </CardHeader>
        <CardContent className="text-sm leading-6 text-muted-foreground">
          tRPC is wired, but this dashboard card could not load the first procedures yet.
        </CardContent>
      </Card>
    );
  }

  const status = statusQuery.data;
  const viewer = viewerQuery.data;

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {statusCards.map((card) => {
        const Icon = card.icon;
        const value = status[card.key];

        return (
          <Card
            key={card.key}
            className="border-white/75 bg-white/78 shadow-[0_20px_70px_-55px_rgba(10,31,34,0.35)] dark:border-white/8 dark:bg-[#182123] dark:shadow-[0_24px_70px_-50px_rgba(0,0,0,0.6)]"
          >
            <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{card.label}</p>
                <CardTitle className="text-3xl capitalize tracking-tight">{value}</CardTitle>
              </div>
              <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Icon className="size-5" />
              </div>
            </CardHeader>
          </Card>
        );
      })}

      <Card className="border-white/75 bg-[linear-gradient(145deg,rgba(18,50,52,0.98),rgba(27,73,76,0.95))] text-white shadow-[0_28px_90px_-60px_rgba(10,31,34,0.82)]">
        <CardHeader className="pb-3">
          <p className="text-sm text-white/70">Signed-in context</p>
          <CardTitle className="text-2xl tracking-tight">{viewer.userId.slice(0, 8)}...</CardTitle>
        </CardHeader>
        <CardContent className="text-sm leading-6 text-white/72">
          This card comes from a protected tRPC procedure using your active Clerk session.
        </CardContent>
      </Card>
    </div>
  );
}
