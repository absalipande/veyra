import { ArrowUpRight, Wallet } from "lucide-react";
import Link from "next/link";

import { DashboardLiveSummary } from "@/components/app/dashboard-live-summary";
import { DashboardRecentActivity } from "@/components/app/dashboard-recent-activity";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function DashboardPage() {
  return (
    <>
      <section className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.12fr)_minmax(340px,0.88fr)]">
        <Card className="self-start overflow-hidden border-white/75 bg-[linear-gradient(145deg,rgba(18,50,52,0.98),rgba(27,73,76,0.95))] text-white shadow-[0_36px_120px_-70px_rgba(10,31,34,0.85)]">
          <CardHeader className="gap-4 pb-4">
            <Badge className="w-fit rounded-full border border-white/15 bg-white/10 px-4 py-1 text-white hover:bg-white/10">
              Home overview
            </Badge>
            <CardTitle className="max-w-4xl text-4xl font-semibold leading-[0.98] tracking-tight text-balance sm:text-[3.7rem]">
              Private money, held clearly.
            </CardTitle>
            <CardDescription className="max-w-2xl text-base leading-7 text-white/72">
              Veyra is built to feel focused, calm, and trustworthy. The dashboard should tell you
              what matters now, then hand you off cleanly to the deeper workspaces.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3 pt-0">
            <Link
              href="/transactions"
              className="inline-flex items-center gap-2 rounded-full border border-white/75 bg-white px-4 py-2 text-sm font-medium text-[#153638] transition-colors hover:bg-[#eef7f3] hover:text-[#153638]"
            >
              Review latest movement
              <ArrowUpRight className="size-4" />
            </Link>
            <Button asChild variant="outline" className="rounded-full border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white">
              <Link href="/accounts">Open accounts workspace</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="self-start border-white/75 bg-white/78 shadow-[0_24px_90px_-55px_rgba(10,31,34,0.34)] dark:border-white/8 dark:bg-[#182123] dark:shadow-[0_24px_90px_-55px_rgba(0,0,0,0.62)]">
          <CardHeader>
            <CardTitle className="text-2xl tracking-tight">Use this dashboard to orient fast</CardTitle>
            <CardDescription className="leading-6">
              This page should answer the few questions that matter before you open any module.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              {
                title: "What cash is usable right now?",
                body: "Read the liquid accounts and currencies strip first to understand what is immediately available.",
              },
              {
                title: "What changed most recently?",
                body: "Recent movement gives you the latest expenses, income, transfers, and card payments before you open the ledger.",
              },
              {
                title: "Where should I go next?",
                body: "Use this screen to decide whether the next action belongs in Accounts or Transactions, then move there directly.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-2xl border border-border/70 bg-background/78 px-4 py-4 dark:bg-[#212b2d]"
              >
                <p className="text-base font-medium tracking-tight">{item.title}</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.body}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <DashboardLiveSummary />

      <DashboardRecentActivity />

      <section className="grid gap-6 xl:grid-cols-2">
        <Card className="border-white/75 bg-white/78 shadow-[0_24px_90px_-55px_rgba(10,31,34,0.34)] dark:border-white/8 dark:bg-[#182123] dark:shadow-[0_24px_90px_-55px_rgba(0,0,0,0.62)]">
          <CardHeader className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Wallet className="size-4" />
              Search and routes
            </div>
            <CardTitle className="text-2xl tracking-tight">
              Move from overview into action without hunting for it.
            </CardTitle>
            <CardDescription className="text-sm leading-7">
              Global search, account review, and the ledger are the three fastest ways to keep the
              workspace moving.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl border border-border/70 bg-background/72 px-4 py-4 text-sm leading-6 text-muted-foreground dark:bg-[#212b2d]">
              Press <span className="font-medium text-foreground">Cmd/Ctrl + K</span> to search
              accounts and transactions from anywhere in the signed-in app.
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild className="rounded-full">
                <Link href="/accounts">Open accounts</Link>
              </Button>
              <Button asChild variant="outline" className="rounded-full">
                <Link href="/transactions">Open transactions</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-white/75 bg-[linear-gradient(145deg,rgba(18,50,52,0.98),rgba(27,73,76,0.95))] text-white shadow-[0_32px_90px_-65px_rgba(10,31,34,0.85)]">
          <CardHeader className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-white/72">
              <Wallet className="size-4" />
              What Veyra is optimizing for
            </div>
            <CardTitle className="text-2xl tracking-tight">
              Calm visibility over performative busyness.
            </CardTitle>
            <CardDescription className="text-sm leading-7 text-white/72">
              Veyra should feel private, premium, and composed. It should tell you what is liquid,
              what is owed, and what moved, without turning personal finance into dashboard
              theater.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {[
              "Money posture first, then detailed workflows.",
              "Native currencies preserved instead of flattened too early.",
              "Accounts and ledger remain the source of truth under the surface.",
            ].map((item) => (
              <div
                key={item}
                className="rounded-2xl border border-white/12 bg-white/6 px-4 py-3 text-sm leading-6 text-white/78"
              >
                {item}
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </>
  );
}
