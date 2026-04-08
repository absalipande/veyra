import Link from "next/link";
import { Loader2 } from "lucide-react";
import { auth } from "@clerk/nextjs/server";
import { ClerkLoaded, ClerkLoading, SignIn, SignOutButton } from "@clerk/nextjs";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AuthShell } from "@/components/auth/auth-shell";
import { VeyraWordmark } from "@/components/brand/veyra-wordmark";

export default async function SignInPage() {
  const { userId } = await auth();

  if (userId) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-2xl rounded-[2rem] border border-white/70 bg-white/80 p-8 shadow-[0_24px_90px_-55px_rgba(10,31,34,0.35)] backdrop-blur">
          <div className="space-y-5">
            <VeyraWordmark />
            <Badge className="rounded-full bg-primary/10 px-4 py-1 text-primary hover:bg-primary/10">
              Already signed in
            </Badge>
            <h1 className="text-4xl font-semibold tracking-tight text-[#10292B]">
              You already have an active Veyra session
            </h1>
            <p className="max-w-xl text-base leading-7 text-[#5E7272]">
              Clerk redirects authenticated users away from the embedded sign-in form, so this page
              becomes a quick account checkpoint instead.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Button asChild className="rounded-full bg-[#17393c] hover:bg-[#1d4a4d]">
                <Link href="/dashboard">Go to dashboard</Link>
              </Button>
              <SignOutButton>
                <Button variant="outline" className="rounded-full">
                  Sign out and continue to login
                </Button>
              </SignOutButton>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <AuthShell
      badge="Welcome back"
      title="Sign in to your workspace"
      description="Sign in to continue to your personal finance workspace."
      sideEyebrow="Private money workspace"
      sideTitle="A calmer place to manage your money."
      sideDescription="Balances, plans, and spending in one focused workspace designed to feel clear, quiet, and easy to return to."
      sideCtaHref="/sign-up"
      sideCtaLabel="Create account"
      sideFootnote="Private. Personal. Designed for focus."
    >
      <ClerkLoaded>
        <SignIn
          path="/sign-in"
          routing="path"
          signUpUrl="/sign-up"
          fallbackRedirectUrl="/dashboard"
          appearance={{
            elements: {
              rootBox: "mx-auto w-full max-w-[26rem]",
              cardBox: "w-full shadow-none",
              card: "w-full shadow-none border-0 bg-transparent p-0",
              main: "gap-5",
              header: "hidden",
              headerTitle: "hidden",
              headerSubtitle: "hidden",
              socialButtonsBlock: "gap-3",
              socialButtonsBlockButton:
                "h-12 rounded-2xl border border-[#d7e3dc] bg-[#fbfcfa] shadow-none hover:bg-white",
              socialButtonsBlockButtonText: "font-medium text-[#17393c]",
              dividerLine: "bg-[#dfe8e2]",
              dividerText: "text-[#7c918f]",
              form: "gap-5",
              formFieldRow: "gap-3",
              formFieldLabel: "text-[#17393c] font-medium",
              formFieldInput:
                "h-12 rounded-2xl border border-[#d7e3dc] bg-white px-4 shadow-none focus:border-[#8fc8b3]",
              formButtonPrimary:
                "h-12 rounded-2xl bg-[#17393c] text-white shadow-[0_18px_40px_-24px_rgba(23,57,60,0.9)] hover:bg-[#1d4a4d]",
              footer: "pt-5",
              footerActionText: "text-[#6d8381]",
              footerActionLink: "text-[#17393c] hover:text-[#10292b]",
            },
          }}
        />
      </ClerkLoaded>
      <ClerkLoading>
        <div className="flex min-h-[320px] items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </ClerkLoading>
    </AuthShell>
  );
}
