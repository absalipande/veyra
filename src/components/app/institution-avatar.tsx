"use client";

import { useState } from "react";
import Image from "next/image";

import type { InstitutionDisplay } from "@/features/accounts/lib/institutions";

type InstitutionAvatarProps = {
  display: InstitutionDisplay;
  sizeClassName: string;
  containerClassName?: string;
  logoContainerClassName?: string;
  imageClassName?: string;
  initialsClassName?: string;
  initialsFallback?: string;
};

export function InstitutionAvatar({
  display,
  sizeClassName,
  containerClassName = "",
  logoContainerClassName = "border border-border/70 bg-white p-0 dark:border-white/10 dark:bg-[#141d1f]",
  imageClassName = "size-full rounded-full object-cover",
  initialsClassName = "text-[0.78rem] font-semibold tracking-tight",
  initialsFallback = "AC",
}: InstitutionAvatarProps) {
  const [logoIndex, setLogoIndex] = useState(0);

  const activeLogoPath = display.logoPaths[logoIndex] ?? null;
  const hasLogo = Boolean(activeLogoPath);

  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full ${sizeClassName} ${containerClassName} ${
        hasLogo ? logoContainerClassName : display.tone
      }`}
    >
      {hasLogo ? (
        <Image
          src={activeLogoPath}
          alt={`${display.label} logo`}
          width={44}
          height={44}
          className={imageClassName}
          onError={() => {
            setLogoIndex((current) =>
              current + 1 < display.logoPaths.length ? current + 1 : display.logoPaths.length,
            );
          }}
        />
      ) : (
        <span className={initialsClassName}>{display.initials || initialsFallback}</span>
      )}
    </div>
  );
}
