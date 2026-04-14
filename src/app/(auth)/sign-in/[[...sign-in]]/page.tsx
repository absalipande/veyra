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
            <h1 className="text-3xl font-semibold tracking-tight text-[#10292B]">
              You already have an active Veyra session
            </h1>
            <p className="max-w-xl text-[0.96rem] leading-7 text-[#5E7272]">
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
      badge="Sign in"
      title="Welcome back to your workspace."
      description="Sign in to review balances, spending, and plans in one calm view."
      sideEyebrow="Private money workspace"
      sideTitle="A calmer place to manage your money."
      sideDescription="A focused workspace for daily money decisions without visual clutter."
      sideCtaHref="/sign-up"
      sideCtaLabel="Create account"
      sideFootnote="Private by default. Built for everyday clarity."
    >
      <ClerkLoaded>
        <div className="w-full space-y-3.5 sm:space-y-5">
          <div className="space-y-1.5 text-center">
            <h2 className="text-[1.38rem] font-semibold tracking-tight text-[#232634] sm:text-[1.6rem]">
              Sign in
            </h2>
            <p className="text-[0.9rem] leading-6 text-[#73777f]">
              Continue with Google or email.
            </p>
          </div>
          <div className="mx-auto w-full max-w-[22.5rem] min-w-0 px-2 sm:max-w-[28rem] sm:px-0">
            <SignIn
              path="/sign-in"
              routing="path"
              signUpUrl="/sign-up"
              fallbackRedirectUrl="/dashboard"
              appearance={{
                elements: {
                  rootBox: "!mx-0 !block !w-full !max-w-full min-w-0",
                  cardBox: "!block !w-full !max-w-full min-w-0 !shadow-none",
                  card: "!block !w-full !max-w-full !border-0 !bg-transparent !p-0 !shadow-none",
                  main: "gap-5",
                  header: "hidden",
                  headerTitle: "hidden",
                  headerSubtitle: "hidden",
                  socialButtonsBlock: "w-full gap-3",
                  socialButtonsBlockButton:
                    "h-10 !w-full rounded-[1.05rem] border border-[#d7e3dc] bg-[#fbfcfa] px-3 text-sm shadow-none hover:bg-white sm:h-11 sm:rounded-xl",
                  socialButtonsBlockButtonText: "text-sm font-medium text-[#5b5f67]",
                  dividerLine: "bg-[#dfe8e2]",
                  dividerText: "text-xs text-[#7b7f87]",
                  form: "gap-5",
                  formField: "w-full",
                  formFieldLabelRow: "w-full",
                  formFieldInputContainer: "w-full",
                  formFieldRow: "w-full gap-2.5",
                  formFieldLabel: "text-sm font-medium text-[#232634]",
                  formFieldInput:
                    "h-10 !w-full rounded-[1.05rem] border border-[#d7e3dc] bg-white px-3.5 text-sm shadow-none focus:border-[#b6c2d5] sm:h-11 sm:rounded-xl",
                  formButtonPrimary:
                    "h-10 !w-full rounded-[1.05rem] bg-[#383845] text-sm text-white shadow-[0_18px_40px_-24px_rgba(44,46,58,0.9)] hover:bg-[#30303c] sm:h-11 sm:rounded-xl",
                  footer: "!w-full pt-4",
                  footerAction: "w-full justify-center",
                  footerActionText: "text-sm text-[#6d7178]",
                  footerActionLink: "text-sm text-[#232634] hover:text-[#232634]",
                },
              }}
            />
          </div>
        </div>
      </ClerkLoaded>
      <ClerkLoading>
        <div className="flex min-h-[260px] items-center justify-center sm:min-h-[320px]">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </ClerkLoading>
    </AuthShell>
  );
}
