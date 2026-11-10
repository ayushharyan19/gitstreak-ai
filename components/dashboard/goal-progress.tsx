import type { ContributionDay } from "@/types/github";
import type { UserPreferences } from "@/types/preferences";

type GoalProgressProps = { preferences: UserPreferences; days: ContributionDay[] };

export function GoalProgress({ preferences, days }: GoalProgressProps) {
  const today = new Date().toISOString().slice(0, 10);
  const todayCount = days.find((day) => day.date === today)?.contributionCount ?? 0;
  const current = new Date(`${today}T00:00:00.000Z`);
  const sunday = new Date(current);
  sunday.setUTCDate(current.getUTCDate() - current.getUTCDay());
  const weekDates = Array.from({ length: 7 }, (_, index) => { const date = new Date(sunday); date.setUTCDate(sunday.getUTCDate() + index); return date.toISOString().slice(0, 10); });
  const activeThisWeek = days.filter((day) => weekDates.includes(day.date) && day.contributionCount > 0).length;
  const dailyPercent = Math.min(100, Math.round((todayCount / preferences.dailyGoal) * 100));
  const weeklyPercent = Math.min(100, Math.round((activeThisWeek / preferences.weeklyGoal) * 100));

  return <section className="mt-5 rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6"><div className="flex items-center justify-between"><div><h2 className="font-semibold">Goal progress</h2><p className="mt-1 text-sm text-muted-foreground">Based on your saved preferences and live GitHub activity.</p></div><span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary">{preferences.timezone}</span></div><div className="mt-5 grid gap-5 sm:grid-cols-2"><div><div className="flex justify-between text-sm"><span>Daily contributions</span><span className="font-medium">{todayCount} / {preferences.dailyGoal}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${dailyPercent}%` }} /></div></div><div><div className="flex justify-between text-sm"><span>Weekly active days</span><span className="font-medium">{activeThisWeek} / {preferences.weeklyGoal}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${weeklyPercent}%` }} /></div></div></div></section>;
}
