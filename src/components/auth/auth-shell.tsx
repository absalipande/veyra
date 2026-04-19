import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { VeyraWordmark } from "@/components/brand/veyra-wordmark";

type AuthShellProps = {
  badge: string;
  title: string;
  description: string;
  sideEyebrow: string;
  sideTitle: string;
  sideDescription: string;
  sideCtaHref: string;
  sideCtaLabel: string;
  sideFootnote: string;
  children: ReactNode;
};

export function AuthShell({
  badge,
  title,
  description,
  sideEyebrow,
  sideTitle,
  sideDescription,
  sideCtaHref,
  sideCtaLabel,
  sideFootnote,
  children,
}: AuthShellProps) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,rgba(251,249,243,0.96),rgba(245,248,244,0.94))]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 hidden bg-cover bg-center bg-no-repeat lg:block"
        style={{ backgroundImage: "url('/auth/auth-bg-v3.png')" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 hidden bg-[linear-gradient(145deg,rgba(248,252,252,0.75),rgba(236,244,242,0.5)_42%,rgba(13,40,44,0.2))] lg:block"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-52 bg-[radial-gradient(circle_at_top,rgba(151,203,182,0.24),transparent_74%)] lg:hidden"
      />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1280px] flex-col px-5 pb-8 pt-7 sm:px-8 sm:pb-10 sm:pt-10 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(460px,520px)] lg:items-center lg:gap-14 lg:px-14 lg:py-14">
        <header className="sr-only">
          <h1>{title}</h1>
          <p>{description}</p>
        </header>

        <section className="space-y-6 lg:max-w-[36rem]">
          <div className="flex items-center justify-between lg:block">
            <VeyraWordmark
              iconSrc="/auth/veyra-v-icon.svg"
              iconClassName="size-9"
              textClassName="text-[1.7rem] font-semibold tracking-tight text-[#14363A]"
            />
            <Link
              href={sideCtaHref}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#bed1ca] bg-white/70 px-3.5 py-1.5 text-xs font-medium text-[#355d5f] transition hover:bg-white sm:px-4 sm:py-2 sm:text-sm lg:hidden"
            >
              {sideCtaLabel}
              <ArrowRight className="size-3.5 sm:size-4" />
            </Link>
          </div>

          <div className="hidden space-y-4 lg:block">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-[#4c6b6a]">{sideEyebrow}</p>
            <h1 className="text-[3rem] font-semibold leading-[1.03] tracking-tight text-[#133a3e]">
              {sideTitle}
            </h1>
            <p className="max-w-[34rem] text-[1rem] leading-7 text-[#4d6665]">{sideDescription}</p>
          </div>

          <div className="hidden rounded-2xl border border-white/75 bg-white/55 p-5 shadow-[0_24px_75px_-50px_rgba(15,46,49,0.45)] backdrop-blur-sm lg:block">
            <p className="text-[0.95rem] leading-7 text-[#2f5558]">{sideFootnote}</p>
            <div className="mt-4">
              <Link
                href={sideCtaHref}
                className="inline-flex items-center gap-2 rounded-full border border-[#bfd4cd] bg-white/75 px-4 py-2 text-sm font-medium text-[#2f5558] transition hover:bg-white"
              >
                {sideCtaLabel}
                <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>
        </section>

        <section className="mt-7 rounded-[1.5rem] border border-[#d5e3dc] bg-white/90 p-4 shadow-[0_24px_60px_-40px_rgba(16,42,45,0.28)] backdrop-blur sm:mt-8 sm:p-6 lg:mt-0 lg:rounded-[1.25rem] lg:border-[#dce8e2] lg:bg-white/92 lg:px-10 lg:py-10">
          <div className="w-full">{children}</div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-4 border-t border-[#e5edeb] pt-4 text-[0.74rem] font-medium text-[#6a7b7a] lg:mt-8 lg:justify-between lg:text-[0.78rem]">
            <span>{badge}</span>
            <div className="flex items-center gap-4">
              <span>Privacy Policy</span>
              <span>Terms of Service</span>
              <span>Support</span>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
