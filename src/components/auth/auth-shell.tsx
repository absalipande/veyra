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
    <main className="min-h-screen bg-[linear-gradient(180deg,rgba(251,249,243,0.98),rgba(245,248,244,0.95))] lg:grid lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
      <section className="relative flex min-h-screen items-start justify-center px-5 py-8 sm:px-8 sm:py-12 lg:items-center lg:px-14">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top,rgba(143,200,179,0.14),transparent_68%)] lg:h-48 lg:bg-[radial-gradient(circle_at_top,rgba(143,200,179,0.24),transparent_68%)]" />

        <div className="relative w-full max-w-[32rem] lg:hidden">
          <div className="mx-auto flex w-full max-w-[27rem] flex-col items-center pt-6 text-center">
            <div className="space-y-3">
              <h1 className="text-[2.45rem] font-semibold leading-[1.02] tracking-tight text-[#2E2A47] sm:text-[3rem]">
                {title}
              </h1>
              <p className="text-[0.94rem] leading-7 text-[#7E8CA0] sm:text-[1rem] sm:leading-8">
                {description}
              </p>
            </div>

            <div className="mt-7 w-full rounded-[1.9rem] border border-[#dfe4e8] bg-white px-4 py-5 shadow-[0_22px_60px_-42px_rgba(20,29,44,0.28)] sm:px-6 sm:py-7">
              <div className="mx-auto w-full max-w-full">{children}</div>
            </div>
          </div>
        </div>

        <div className="relative hidden w-full max-w-[32rem] lg:block">
          <div className="space-y-6">
            <VeyraWordmark
              iconClassName="size-11"
              textClassName="text-[2rem] font-semibold tracking-tight text-[#10292B]"
            />
            <div className="space-y-4">
              <p className="text-[0.82rem] font-medium uppercase tracking-[0.22em] text-[#567170]">
                {badge}
              </p>
              <h1 className="max-w-md text-5xl font-semibold leading-[0.94] tracking-tight text-[#10292B] lg:text-6xl">
                {title}
              </h1>
              <p className="max-w-xl text-lg leading-8 text-[#5C7472]">{description}</p>
            </div>
          </div>

          <div className="mt-8 rounded-[1.9rem] border border-white/80 bg-white/84 p-4 shadow-[0_28px_90px_-55px_rgba(10,31,34,0.38)] backdrop-blur">
            <div className="mx-auto w-full max-w-[27rem]">{children}</div>
          </div>
        </div>
      </section>

      <aside className="relative hidden min-h-screen overflow-hidden rounded-l-[2.75rem] border-l border-white/10 bg-[linear-gradient(155deg,rgba(16,45,47,0.99),rgba(28,76,79,0.96))] lg:flex">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-16 top-20 size-72 rounded-full bg-[radial-gradient(circle,rgba(143,200,179,0.18),transparent_70%)]" />
          <div className="absolute bottom-14 right-10 size-96 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.08),transparent_74%)]" />
          <div className="absolute left-12 right-12 top-28 h-px bg-white/10" />
          <div className="absolute bottom-28 left-12 right-12 h-px bg-white/8" />
        </div>

        <div className="relative z-10 flex w-full flex-col justify-between p-12 xl:p-16">
          <div className="flex justify-end">
            <Link
              href={sideCtaHref}
              className="inline-flex items-center gap-2 rounded-full border border-white/18 bg-white/6 px-5 py-2.5 text-sm text-white/88 transition hover:bg-white/12"
            >
              {sideCtaLabel}
              <ArrowRight className="size-4" />
            </Link>
          </div>

          <div className="space-y-8">
            <div className="inline-flex items-center rounded-[1.8rem] border border-white/12 bg-white/8 px-6 py-5 backdrop-blur">
              <VeyraWordmark
                iconClassName="size-12"
                textClassName="text-4xl font-semibold tracking-tight text-white"
              />
            </div>

            <div className="space-y-5">
              <p className="text-sm uppercase tracking-[0.24em] text-white/58">{sideEyebrow}</p>
              <h2 className="max-w-2xl text-5xl font-semibold leading-[1.02] tracking-tight text-white xl:text-6xl">
                {sideTitle}
              </h2>
              <p className="max-w-xl text-lg leading-8 text-white/72">{sideDescription}</p>
            </div>
          </div>

          <div className="max-w-md rounded-[1.9rem] border border-white/12 bg-white/7 p-6 backdrop-blur">
            <p className="text-sm uppercase tracking-[0.22em] text-white/52">veyra</p>
            <p className="mt-4 text-2xl font-semibold leading-tight text-white">{sideFootnote}</p>
          </div>
        </div>
      </aside>
    </main>
  );
}
