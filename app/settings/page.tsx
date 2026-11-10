import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";
import { PreferencesForm } from "@/components/settings/preferences-form";
import { PreferencesError, getOrCreatePreferences } from "@/services/preferences";

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/");
  let preferences = null;
  try { preferences = await getOrCreatePreferences(session.user.id); } catch (error) { if (!(error instanceof PreferencesError)) throw error; }
  return <div className="flex min-h-screen flex-col"><Navbar /><main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10 sm:px-8 sm:py-14"><p className="font-mono text-xs font-medium uppercase tracking-[0.18em] text-primary">Account settings</p><h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Make GitStreak yours.</h1><p className="mt-2 text-muted-foreground">Manage your goals, theme, timezone, and reminder preferences.</p><PreferencesForm initialPreferences={preferences} /></main><Footer /></div>;
}
