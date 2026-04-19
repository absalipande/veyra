import Link from "next/link";
import { Loader2 } from "lucide-react";
import { auth } from "@clerk/nextjs/server";
import { ClerkLoaded, ClerkLoading, SignOutButton, SignUp } from "@clerk/nextjs";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AuthShell } from "@/components/auth/auth-shell";
import { VeyraWordmark } from "@/components/brand/veyra-wordmark";

export default async function SignUpPage() {
  const { userId } = await auth();

  if (userId) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-2xl rounded-[2rem] border border-white/70 bg-white/80 p-8 shadow-[0_24px_90px_-55px_rgba(10,31,34,0.35)] backdrop-blur">
          <div className="space-y-5">
            <VeyraWordmark />
            <Badge className="rounded-full bg-primary/10 px-4 py-1 text-primary hover:bg-primary/10">
              Session active
            </Badge>
            <h1 className="text-3xl font-semibold tracking-tight text-[#10292B]">
              You’re already signed in
            </h1>
            <p className="max-w-xl text-[0.96rem] leading-7 text-[#5E7272]">
              Continue to your workspace or sign out if you want to create another account.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Button asChild className="rounded-full bg-[#0f766e] hover:bg-[#0c625b]">
                <Link href="/dashboard">Go to dashboard</Link>
              </Button>
              <SignOutButton>
                <Button variant="outline" className="rounded-full">
                  Sign out and create a new account
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
      badge="Create account"
      title="Create your account"
      description="Use Google or email to get started."
      sideEyebrow="Personal finance, refined"
      sideTitle="A more thoughtful home for your money."
      sideDescription="Bring your money setup into one focused place designed for day-to-day clarity."
      sideCtaHref="/sign-in"
      sideCtaLabel="Already have an account"
      sideFootnote="Structured enough for planning. Calm enough for daily use."
    >
      <ClerkLoaded>
        <div className="w-full space-y-3.5 sm:space-y-5">
          <div className="space-y-1.5 text-center lg:hidden">
            <h2 className="text-[1.38rem] font-semibold tracking-tight text-[#232634] sm:text-[1.6rem]">
              Create your account
            </h2>
            <p className="text-[0.9rem] leading-6 text-[#73777f]">
              Use Google or email to get started.
            </p>
          </div>
          <div className="mx-auto w-full max-w-[28rem] min-w-0">
            <SignUp
              path="/sign-up"
              routing="path"
              signInUrl="/sign-in"
              fallbackRedirectUrl="/dashboard"
              appearance={{
                variables: {
                  colorPrimary: "#0f766e",
                  borderRadius: "0.85rem",
                },
                elements: {
                  rootBox: "!mx-0 !block !w-full !max-w-full min-w-0 !overflow-visible",
                  cardBox: "!block !w-full !max-w-full min-w-0 !shadow-none !overflow-visible",
                  card: "!block !w-full !max-w-full !border-0 !bg-transparent !p-0 !shadow-none !overflow-visible",
                  main: "gap-5 !overflow-visible",
                  header: "hidden",
                  headerTitle: "hidden",
                  headerSubtitle: "hidden",
                  socialButtonsBlock: "w-full gap-2.5 !m-0 !overflow-visible",
                  socialButtonsBlockButton:
                    "!m-0 !ml-0 relative h-11 !w-full !translate-x-0 rounded-[0.95rem] border border-[#cbdad4] bg-[linear-gradient(180deg,#fcfefd,#f5f9f7)] px-4 text-sm shadow-[0_8px_18px_-14px_rgba(33,84,80,0.35)] transition hover:border-[#b8cfc7] hover:bg-white sm:h-12 sm:rounded-xl",
                  socialButtonsBlockButtonText:
                    "text-[0.93rem] font-semibold tracking-[-0.01em] text-[#355557]",
                  socialButtonsProviderIcon: "size-4.5",
                  dividerLine: "bg-[#dfe8e2]",
                  dividerText: "text-xs text-[#7b7f87]",
                  form: "gap-5 !m-0",
                  formField: "w-full !m-0",
                  formFieldLabelRow: "w-full !m-0",
                  formFieldInputContainer: "w-full !m-0",
                  formFieldRow: "w-full gap-2.5 !m-0",
                  formFieldLabel: "text-sm font-medium text-[#232634]",
                  formFieldInput:
                    "!m-0 h-10 !w-full rounded-[1.05rem] border border-[#d7e3dc] bg-white px-3.5 text-sm shadow-none focus:border-[#8dc2b8] sm:h-11 sm:rounded-xl",
                  formButtonPrimary:
                    "h-10 !w-full rounded-[1.05rem] !bg-[#0f766e] text-sm text-white shadow-[0_18px_40px_-24px_rgba(15,118,110,0.65)] hover:!bg-[#0c625b] sm:h-11 sm:rounded-xl",
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
