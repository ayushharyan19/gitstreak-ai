import type { ContributionDay, StreakStatistics } from "@/types/github";

const DAY_MS = 86_400_000;

function isValidDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function addDays(date: string, amount: number): string {
  if (!isValidDateKey(date)) throw new Error("Expected an ISO calendar date.");
  return new Date(new Date(`${date}T00:00:00.000Z`).getTime() + amount * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

export function currentUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function fillContributionDates(
  days: ContributionDay[],
  startDate: string,
  endDate: string,
): ContributionDay[] {
  if (!isValidDateKey(startDate) || !isValidDateKey(endDate) || startDate > endDate) return [];

  const supplied = new Map<string, ContributionDay>();
  for (const day of days) {
    if (isValidDateKey(day.date) && day.date >= startDate && day.date <= endDate) {
      supplied.set(day.date, {
        date: day.date,
        contributionCount: Math.max(0, Number.isFinite(day.contributionCount) ? day.contributionCount : 0),
        contributionLevel: day.contributionLevel,
      });
    }
  }

  const result: ContributionDay[] = [];
  for (let date = startDate; date <= endDate; date = addDays(date, 1)) {
    result.push(supplied.get(date) ?? { date, contributionCount: 0, contributionLevel: "NONE" });
  }
  return result;
}

export function calculateStreakStatistics(
  days: ContributionDay[],
  today = currentUtcDate(),
): StreakStatistics {
  const validDays = days
    .filter((day) => isValidDateKey(day.date))
    .sort((a, b) => a.date.localeCompare(b.date));
  const totalContributions = validDays.reduce((total, day) => total + Math.max(0, day.contributionCount || 0), 0);
  const activeDays = validDays.filter((day) => day.contributionCount > 0).length;

  let longestStreak = 0;
  let runningStreak = 0;
  let previousDate: string | undefined;
  for (const day of validDays) {
    if (day.contributionCount > 0) {
      runningStreak = previousDate && day.date === addDays(previousDate, 1) ? runningStreak + 1 : 1;
      longestStreak = Math.max(longestStreak, runningStreak);
    } else {
      runningStreak = 0;
    }
    previousDate = day.date;
  }

  const byDate = new Map(validDays.map((day) => [day.date, day.contributionCount]));
  const lastDate = validDays.at(-1)?.date;
  let cursor = lastDate && today < lastDate ? today : lastDate;
  if (cursor && (byDate.get(cursor) ?? 0) === 0) cursor = addDays(cursor, -1);

  let currentStreak = 0;
  while (cursor && (byDate.get(cursor) ?? 0) > 0) {
    currentStreak += 1;
    cursor = addDays(cursor, -1);
  }

  return {
    currentStreak,
    longestStreak,
    totalContributions,
    activeDays,
    consistency: validDays.length === 0 ? 0 : Math.round((activeDays / validDays.length) * 100),
  };
}
