import { ArrowUpRight, ReceiptText } from "lucide-react";
import Link from "next/link";

import { DashboardFoundationStatus } from "@/components/app/dashboard-foundation-status";
import { DashboardLiveSummary } from "@/components/app/dashboard-live-summary";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function DashboardPage() {
  return (
    <>
      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <Card className="overflow-hidden border-white/75 bg-[linear-gradient(145deg,rgba(18,50,52,0.98),rgba(27,73,76,0.95))] text-white shadow-[0_36px_120px_-70px_rgba(10,31,34,0.85)]">
          <CardHeader className="gap-4 pb-6">
            <Badge className="w-fit rounded-full border border-white/15 bg-white/10 px-4 py-1 text-white hover:bg-white/10">
              Dashboard shell
            </Badge>
            <CardTitle className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              A focused workspace is in place. Now we can start building the money tools inside it.
            </CardTitle>
            <CardDescription className="max-w-2xl text-base leading-7 text-white/72">
              The protected shell, navigation, header, and brand system are ready. The next build
              step is real data through tRPC, Drizzle, and the first accounts experience.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button asChild className="rounded-full bg-white text-[#153638] hover:bg-white/92">
              <Link href="/accounts">
                Begin accounts foundation
                <ArrowUpRight className="size-4" />
              </Link>
            </Button>
            <Button
              variant="outline"
              className="rounded-full border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"
            >
              View architecture next
            </Button>
          </CardContent>
        </Card>

        <Card className="border-white/75 bg-white/78 shadow-[0_24px_90px_-55px_rgba(10,31,34,0.34)] dark:border-white/8 dark:bg-[#182123] dark:shadow-[0_24px_90px_-55px_rgba(0,0,0,0.62)]">
          <CardHeader>
            <CardTitle className="text-2xl tracking-tight">What this shell already solves</CardTitle>
            <CardDescription className="leading-6">
              The product now has enough structure to absorb real features without feeling ad hoc.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              "Protected routes and real session handling",
              "Dedicated navigation for the signed-in experience",
              "A clean content canvas for the dashboard and future modules",
              "Consistent surfaces, spacing, and brand styling",
            ].map((item) => (
              <div
                key={item}
                className="rounded-2xl border border-border/70 bg-background/78 px-4 py-4 text-sm leading-6 text-foreground dark:bg-[#212b2d]"
              >
                {item}
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <DashboardLiveSummary />

      <DashboardFoundationStatus />

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(300px,0.9fr)]">
        <Card className="border-white/75 bg-white/78 shadow-[0_24px_90px_-55px_rgba(10,31,34,0.34)] dark:border-white/8 dark:bg-[#182123] dark:shadow-[0_24px_90px_-55px_rgba(0,0,0,0.62)]">
          <CardHeader>
            <CardTitle className="text-2xl tracking-tight">First feature slice</CardTitle>
            <CardDescription className="leading-6">
              Accounts is the most practical place to start because it gives the rest of the app a
              source of truth for balances, liabilities, and transfers.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            {[
              {
                title: "Schema",
                body: "Define user-scoped account tables and the first migration in Drizzle.",
              },
              {
                title: "Router",
                body: "Expose accounts through tRPC so the dashboard can pull real data cleanly.",
              },
              {
                title: "UI",
                body: "Replace placeholder cards with live account summaries and account creation.",
              },
            ].map((step) => (
              <div
                key={step.title}
                className="rounded-[1.7rem] border border-border/70 bg-background/78 p-5 dark:bg-[#212b2d]"
              >
                <p className="text-lg font-semibold tracking-tight">{step.title}</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.body}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.82),rgba(245,248,246,0.92))] shadow-[0_24px_90px_-55px_rgba(10,31,34,0.34)] dark:border-white/8 dark:bg-[linear-gradient(180deg,rgba(24,33,35,0.96),rgba(20,29,31,0.98))] dark:shadow-[0_24px_90px_-55px_rgba(0,0,0,0.62)]">
          <CardHeader>
            <CardTitle className="text-2xl tracking-tight">Soon in Veyra</CardTitle>
            <CardDescription>
              The shell is ready for the modules that matter most in a personal finance workflow.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              "Accounts overview and account details",
              "Transaction feed and categorization",
              "Budgets and recurring spending",
              "Credit and liability snapshots",
              "Settings and profile controls",
            ].map((item) => (
              <div
                key={item}
                className="flex items-center justify-between rounded-2xl border border-border/70 bg-white/72 px-4 py-3 text-sm dark:bg-[#212b2d]"
              >
                <span>{item}</span>
                <ReceiptText className="size-4 text-muted-foreground" />
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </>
  );
}
