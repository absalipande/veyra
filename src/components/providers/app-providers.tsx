"use client";

import { ThemeProvider, useTheme } from "next-themes";
import { Toaster } from "sonner";

import { TRPCReactProvider } from "@/trpc/react";

function VeyraToaster() {
  const { resolvedTheme } = useTheme();

  return (
    <Toaster
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      richColors
      closeButton
      position="top-right"
      toastOptions={{
        classNames: {
          toast:
            "border border-border/70 bg-white text-foreground shadow-[0_18px_60px_-36px_rgba(10,31,34,0.35)] dark:bg-[#172022] dark:text-foreground dark:shadow-[0_18px_60px_-36px_rgba(0,0,0,0.55)]",
          title: "text-sm font-semibold",
          description: "text-sm text-muted-foreground",
        },
      }}
    />
  );
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <TRPCReactProvider>
        {children}
        <VeyraToaster />
      </TRPCReactProvider>
    </ThemeProvider>
  );
}
