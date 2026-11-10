"use client";

import { useEffect, useRef, useState } from "react";
import { ContributionGraph } from "@/components/dashboard/contribution-graph";
import { StatsCard } from "@/components/dashboard/stats-card";
import { StreakCard } from "@/components/dashboard/streak-card";
import { YearSelector } from "@/components/dashboard/year-selector";
import { GoalProgress } from "@/components/dashboard/goal-progress";
import type { GitHubContributionData } from "@/types/github";
import type { UserPreferences } from "@/types/preferences";

type ApiResponse = GitHubContributionData | { error: string };
function isData(response: ApiResponse): response is GitHubContributionData { return "days" in response; }

export function ContributionDashboard({ currentYear }: { currentYear: number }) {
  const [year, setYear] = useState(currentYear);
  const [data, setData] = useState<GitHubContributionData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const cache = useRef(new Map<number, GitHubContributionData>());

  useEffect(() => {
    const controller = new AbortController();
    const cached = cache.current.get(year);
    if (cached) { setData(cached); setError(null); setIsLoading(false); return () => controller.abort(); }
    async function load() {
      setIsLoading(true); setError(null);
      try {
        const response = await fetch(`/api/github/contributions?year=${year}`, { signal: controller.signal, cache: "no-store" });
        const payload = (await response.json()) as ApiResponse;
        if (!response.ok || !isData(payload)) throw new Error("error" in payload ? payload.error : "Unable to load GitHub activity.");
        cache.current.set(year, payload); setData(payload);
      } catch (requestError) {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setData(null); setError(requestError instanceof Error ? requestError.message : "Unable to load GitHub activity.");
      } finally { if (!controller.signal.aborted) setIsLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [year, retryCount]);

  useEffect(() => { void fetch("/api/preferences", { cache: "no-store" }).then(async (response) => response.ok ? setPreferences(await response.json() as UserPreferences) : null).catch(() => null); }, []);

  return <div className="mt-8"><div className="mb-5 flex items-center justify-between"><div><h2 className="text-lg font-semibold">Your contribution history</h2><p className="mt-1 text-sm text-muted-foreground">Activity is loaded directly from GitHub.</p></div><YearSelector value={year} onChange={setYear} disabled={isLoading} /></div>{isLoading ? <div className="grid gap-5" aria-live="polite"><div className="h-40 animate-pulse rounded-xl border border-border bg-muted/50" /><div className="h-56 animate-pulse rounded-xl border border-border bg-muted/50" /></div> : error ? <section role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-5 text-sm text-destructive"><p className="font-medium">Contribution data is unavailable</p><p className="mt-1">{error}</p><button type="button" onClick={() => { cache.current.delete(year); setRetryCount((count) => count + 1); }} className="mt-4 rounded-md border border-destructive/30 px-3 py-1.5 font-medium transition-colors hover:bg-destructive/10">Try again</button></section> : data ? <><div className="grid gap-5 lg:grid-cols-[1.05fr_1.95fr]"><StreakCard currentStreak={data.statistics.currentStreak} longestStreak={data.statistics.longestStreak} /><div className="grid gap-4 sm:grid-cols-3"><StatsCard label="Total contributions" value={data.statistics.totalContributions.toLocaleString()} detail={`${year} activity`} /><StatsCard label="Active days" value={String(data.statistics.activeDays)} detail={`${data.statistics.consistency}% consistency`} /><StatsCard label="Pull requests" value={String(data.totals.pullRequests)} detail={`${data.totals.commits} commits`} /></div></div>{preferences ? <GoalProgress preferences={preferences} days={data.days} /> : null}<div className="mt-5"><ContributionGraph days={data.days} totalContributions={data.statistics.totalContributions} year={data.year} /></div><div className="mt-5 grid gap-4 sm:grid-cols-3"><StatsCard label="Commits" value={String(data.totals.commits)} detail="Contributed commits" /><StatsCard label="Issues" value={String(data.totals.issues)} detail="Issues opened" /><StatsCard label="Reviews" value={String(data.totals.reviews)} detail="Pull request reviews" /></div></> : null}</div>;
}
