import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { ArrowRight, LayoutDashboard, ShieldCheck, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { VeyraWordmark } from "@/components/brand/veyra-wordmark";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const highlights = [
  {
    title: "Clean foundation",
    description: "Clerk auth is wired, so we can build the rest of Veyra behind a protected shell.",
    icon: ShieldCheck,
  },
  {
    title: "Premium system",
    description: "Your new branding, theme tokens, and UI primitives are ready for the app shell.",
    icon: Sparkles,
  },
  {
    title: "Next up",
    description: "tRPC, Drizzle, and the first accounts flow are the logical next vertical slice.",
    icon: LayoutDashboard,
  },
];

export default function DashboardPage() {
  return (
    <main className="min-h-screen px-6 py-6 sm:px-10 lg:px-14">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        <header className="flex flex-col gap-5 rounded-[2rem] border border-white/70 bg-white/80 p-6 shadow-[0_24px_90px_-50px_rgba(10,31,34,0.38)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-3">
            <VeyraWordmark />
            <Badge className="rounded-full bg-primary/10 px-4 py-1 text-primary hover:bg-primary/10">
              Protected workspace
            </Badge>
          </div>
          <div className="flex items-center gap-3">
            <Button asChild variant="outline" className="rounded-full">
              <Link href="/sign-in">
                Auth pages
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <div className="rounded-full border border-border/70 bg-background/90 p-1.5">
              <UserButton />
            </div>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
          <Card className="overflow-hidden border-white/70 bg-[linear-gradient(145deg,rgba(18,50,52,0.98),rgba(24,68,70,0.94))] text-white shadow-[0_32px_120px_-65px_rgba(10,31,34,0.8)]">
            <CardHeader className="gap-4 pb-5">
              <Badge className="w-fit rounded-full border border-white/15 bg-white/10 px-4 py-1 text-white hover:bg-white/10">
                Dashboard ready
              </Badge>
              <CardTitle className="max-w-2xl text-4xl font-semibold tracking-tight text-balance">
                Veyra now has a real authenticated app area we can build on.
              </CardTitle>
              <CardDescription className="max-w-2xl text-base leading-7 text-white/72">
                This is the new foundation: branded auth, protected routes, and a premium shell we
                can turn into the full finance workspace.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Button asChild className="rounded-full bg-white text-[#153638] hover:bg-white/90">
                <Link href="/sign-up">Create another account</Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="rounded-full border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"
              >
                <Link href="/">Go to entry route</Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="border-white/70 bg-white/75 shadow-[0_24px_90px_-50px_rgba(10,31,34,0.35)]">
            <CardHeader>
              <CardTitle className="text-2xl">Immediate roadmap</CardTitle>
              <CardDescription className="leading-6">
                The auth foundation is done. These are the highest-leverage next steps.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {highlights.map((item) => {
                const Icon = item.icon;

                return (
                  <div
                    key={item.title}
                    className="flex gap-4 rounded-2xl border border-border/70 bg-background/80 p-4"
                  >
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <Icon className="size-5" />
                    </div>
                    <div className="space-y-1">
                      <p className="font-medium text-foreground">{item.title}</p>
                      <p className="text-sm leading-6 text-muted-foreground">{item.description}</p>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
