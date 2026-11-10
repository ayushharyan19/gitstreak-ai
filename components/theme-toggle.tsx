"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme-provider";

export function ThemeToggle() {
  const { mounted, resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  if (!mounted) {
    return <span aria-hidden="true" className="flex size-9 rounded-md border border-border bg-background" />;
  }

  return <button type="button" onClick={() => setTheme(isDark ? "light" : "dark")} aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"} className="flex size-9 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}</button>;
}
