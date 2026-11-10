import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p>© 2026 GitStreak AI. Build a practice that lasts.</p>
        <Link className="transition-colors hover:text-foreground" href="/dashboard">Dashboard preview</Link>
      </div>
    </footer>
  );
}
