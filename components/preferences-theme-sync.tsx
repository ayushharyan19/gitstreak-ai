"use client";

import { useEffect } from "react";
import { useTheme } from "@/components/theme-provider";
import type { PreferredTheme } from "@/types/preferences";

export function PreferencesThemeSync({ preferredTheme }: { preferredTheme: PreferredTheme }) {
  const { mounted, setTheme } = useTheme();
  useEffect(() => {
    if (mounted) setTheme(preferredTheme);
  }, [mounted, preferredTheme, setTheme]);
  return null;
}
