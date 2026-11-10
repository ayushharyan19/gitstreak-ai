"use client";

import { useState } from "react";
import { GitFork, LogOut } from "lucide-react";
import { signIn, signOut } from "next-auth/react";

type AuthButtonProps = {
  variant?: "primary" | "compact" | "sign-out";
};

export function AuthButton({ variant = "primary" }: AuthButtonProps) {
  const [isPending, setIsPending] = useState(false);
  const isSignOut = variant === "sign-out";

  async function handleClick() {
    setIsPending(true);

    if (isSignOut) {
      await signOut({ callbackUrl: "/" });
      return;
    }

    await signIn("github", { callbackUrl: "/dashboard" });
  }

  const className = isSignOut
    ? "inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    : variant === "compact"
      ? "inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-3.5"
      : "inline-flex h-11 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:-translate-y-0.5 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:translate-y-0 disabled:opacity-70";

  return (
    <button type="button" onClick={handleClick} disabled={isPending} className={className}>
      {isSignOut ? <LogOut className="size-4" /> : <GitFork className="size-4" />}
      {isPending ? "Please wait…" : isSignOut ? "Sign out" : variant === "compact" ? <><span className="hidden sm:inline">Continue with GitHub</span><span className="sm:hidden">GitHub</span></> : "Continue with GitHub"}
    </button>
  );
}
