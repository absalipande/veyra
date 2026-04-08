"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="rounded-full border-border/70 bg-white/90 shadow-[0_18px_40px_-35px_rgba(10,31,34,0.28)] dark:bg-[#182123] dark:shadow-[0_18px_40px_-35px_rgba(0,0,0,0.45)]"
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {isDark ? <Sun className="size-4.5" /> : <Moon className="size-4.5" />}
      <span className="sr-only">{isDark ? "Switch to light mode" : "Switch to dark mode"}</span>
    </Button>
  );
}
