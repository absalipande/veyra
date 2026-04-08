"use client";

import { TRPCReactProvider } from "@/trpc/react";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return <TRPCReactProvider>{children}</TRPCReactProvider>;
}
