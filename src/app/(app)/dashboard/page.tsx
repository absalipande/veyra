"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import { DashboardLiveSummary } from "@/components/app/dashboard-live-summary";
import { DashboardRecentActivity } from "@/components/app/dashboard-recent-activity";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateWithPreferences, resolveDatePreferences } from "@/features/settings/lib/date-format";
import { trpc } from "@/trpc/react";

export default function DashboardPage() {
  const settingsQuery = trpc.settings.get.useQuery();
  const datePreferences = useMemo(
    () => resolveDatePreferences(settingsQuery.data),
    [settingsQuery.data]
  );
  const todayLabel = formatDateWithPreferences(new Date(), datePreferences, "date");

  return (
    <>
      <section>
        <Card className="overflow-hidden border-white/70 bg-[linear-gradient(160deg,rgba(20,53,55,0.98),rgba(25,64,67,0.96))] text-white shadow-[0_36px_120px_-72px_rgba(10,31,34,0.82)]">
          <CardHeader className="gap-4 lg:flex lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <Badge className="w-fit rounded-full border border-white/15 bg-white/10 px-3 py-1 text-white hover:bg-white/10">
                Dashboard
              </Badge>
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.3em] text-white/64">{todayLabel}</p>
                <CardTitle className="max-w-3xl text-3xl tracking-tight sm:text-4xl">
                  Your workspace at a glance.
                </CardTitle>
              </div>
              <CardDescription className="max-w-2xl text-base leading-7 text-white/74">
                Check balance posture first, then move into the workspace that needs attention.
              </CardDescription>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" className="rounded-full border-white/75 bg-white text-[#153638] hover:bg-[#1b4f52] hover:text-white">
                <Link href="/accounts">Open accounts</Link>
              </Button>
              <Button
                asChild
                size="sm"
                variant="outline"
                className="rounded-full border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"
              >
                <Link href="/transactions">
                  Open transactions
                  <ArrowUpRight className="size-4" />
                </Link>
              </Button>
            </div>
          </CardHeader>
        </Card>
      </section>

      <DashboardLiveSummary />

      <DashboardRecentActivity />
    </>
  );
}
