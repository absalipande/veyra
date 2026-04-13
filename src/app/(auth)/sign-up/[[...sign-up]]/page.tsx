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
            <h1 className="text-4xl font-semibold tracking-tight text-[#10292B]">
              You’re already signed in
            </h1>
            <p className="max-w-xl text-base leading-7 text-[#5E7272]">
              Since you already have an account session, Veyra won’t show the sign-up form here
              unless you sign out first.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Button asChild className="rounded-full bg-[#17393c] hover:bg-[#1d4a4d]">
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
      description="Set up your workspace."
      sideEyebrow="Personal finance, refined"
      sideTitle="A more thoughtful home for your money."
      sideDescription="Set up your account and step into a workspace shaped for day-to-day clarity, not clutter."
      sideCtaHref="/sign-in"
      sideCtaLabel="Already have an account"
      sideFootnote="Clear enough for everyday use. Polished enough to enjoy."
    >
      <ClerkLoaded>
        <div className="w-full space-y-3.5 sm:space-y-5">
          <div className="space-y-2 text-center">
            <h2 className="text-[1.55rem] font-semibold tracking-tight text-[#232634] sm:text-[1.85rem]">
              Get started
            </h2>
            <p className="text-[0.94rem] leading-7 text-[#73777f]">
              Use Google or email to create your account.
            </p>
          </div>
          <div className="mx-auto w-full max-w-[22.5rem] min-w-0 px-2 sm:max-w-[26rem] sm:px-0">
            <SignUp
              path="/sign-up"
              routing="path"
              signInUrl="/sign-in"
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
                  socialButtonsBlock: "gap-3",
                  socialButtonsBlockButton:
                    "h-11 w-full rounded-[1.2rem] border border-[#d7e3dc] bg-[#fbfcfa] px-3 shadow-none hover:bg-white sm:h-12 sm:rounded-2xl",
                  socialButtonsBlockButtonText: "font-medium text-[#5b5f67]",
                  dividerLine: "bg-[#dfe8e2]",
                  dividerText: "text-[#7b7f87]",
                  form: "gap-5",
                  formFieldRow: "gap-3",
                  formFieldLabel: "font-medium text-[#232634]",
                  formFieldInput:
                    "h-11 w-full rounded-[1.2rem] border border-[#d7e3dc] bg-white px-4 shadow-none focus:border-[#b6c2d5] sm:h-12 sm:rounded-2xl",
                  formButtonPrimary:
                    "h-11 w-full rounded-[1.2rem] bg-[#383845] text-white shadow-[0_18px_40px_-24px_rgba(44,46,58,0.9)] hover:bg-[#30303c] sm:h-12 sm:rounded-2xl",
                  footer: "!w-full pt-5",
                  footerAction: "justify-center",
                  footerActionText: "text-[#6d7178]",
                  footerActionLink: "text-[#232634] hover:text-[#232634]",
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
