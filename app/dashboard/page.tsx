import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { ContributionDashboard } from "@/components/dashboard/contribution-dashboard";
import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/");

  const name = session.user.login || session.user.name || "developer";
  return <div className="flex min-h-screen flex-col"><Navbar /><main className="mx-auto w-full max-w-6xl flex-1 px-5 py-10 sm:px-8 sm:py-14"><div className="animate-enter"><p className="font-mono text-xs font-medium uppercase tracking-[0.18em] text-primary">Contribution dashboard</p><div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Good work, {name}.</h1><p className="mt-2 text-muted-foreground">Track the GitHub activity that keeps your momentum moving.</p></div><p className="font-mono text-xs text-muted-foreground">GITHUB SYNC</p></div></div><ContributionDashboard currentYear={new Date().getUTCFullYear()} /></main><Footer /></div>;
}
