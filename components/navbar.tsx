import Link from "next/link";
import Image from "next/image";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { AuthButton } from "@/components/auth-button";
import { ThemeToggle } from "@/components/theme-toggle";

export async function Navbar() {
  const session = await getServerSession(authOptions);
  const user = session?.user;
  const name = user?.login || user?.name || user?.email || "Developer";

  return (
    <header className="sticky top-0 z-20 border-b border-border/80 bg-background/85 backdrop-blur-md">
      <nav aria-label="Main navigation" className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link href="/" className="group flex items-center gap-2 font-semibold tracking-tight text-foreground">
          <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground transition-transform group-hover:-rotate-6"><span className="text-xs font-bold">GS</span></span>
          GitStreak <span className="text-primary">AI</span>
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {user ? (
            <div className="flex items-center gap-1 rounded-md border border-border bg-card p-1">
              {user.image ? <Image src={user.image} alt="" width={28} height={28} className="size-7 rounded-[5px]" referrerPolicy="no-referrer" /> : <span className="flex size-7 items-center justify-center rounded-[5px] bg-primary/10 text-xs font-semibold text-primary">{name.charAt(0).toUpperCase()}</span>}
              <span className="hidden max-w-28 truncate px-1 text-sm font-medium sm:inline">{name}</span>
              <Link href="/settings" className="hidden rounded px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:inline">Settings</Link>
              <AuthButton variant="sign-out" />
            </div>
          ) : <AuthButton variant="compact" />}
        </div>
      </nav>
    </header>
  );
}
