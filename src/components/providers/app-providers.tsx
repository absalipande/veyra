"use client";

import { Toaster } from "sonner";

import { TRPCReactProvider } from "@/trpc/react";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <TRPCReactProvider>
      {children}
      <Toaster
        richColors
        closeButton
        position="top-right"
        toastOptions={{
          classNames: {
            toast:
              "border border-border/70 bg-white text-foreground shadow-[0_18px_60px_-36px_rgba(10,31,34,0.35)]",
            title: "text-sm font-semibold",
            description: "text-sm text-muted-foreground",
          },
        }}
      />
    </TRPCReactProvider>
  );
}
