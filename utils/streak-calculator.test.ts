import { describe, expect, it } from "vitest";
import type { ContributionDay } from "@/types/github";
import { calculateStreakStatistics, fillContributionDates } from "@/utils/streak-calculator";

function day(date: string, contributionCount: number): ContributionDay {
  return { date, contributionCount, contributionLevel: contributionCount ? "FIRST_QUARTILE" : "NONE" };
}

describe("streak calculations", () => {
  it("handles no contributions and empty API data", () => {
    expect(calculateStreakStatistics([])).toMatchObject({ currentStreak: 0, longestStreak: 0, totalContributions: 0, activeDays: 0, consistency: 0 });
    expect(calculateStreakStatistics([day("2026-01-01", 0)], "2026-01-01").activeDays).toBe(0);
  });

  it("handles one contribution day and a streak ending today", () => {
    expect(calculateStreakStatistics([day("2026-02-04", 3)], "2026-02-04")).toMatchObject({ currentStreak: 1, longestStreak: 1, totalContributions: 3, activeDays: 1, consistency: 100 });
  });

  it("counts consecutive days and a streak ending yesterday", () => {
    const days = [day("2026-03-01", 1), day("2026-03-02", 2), day("2026-03-03", 1), day("2026-03-04", 0)];
    expect(calculateStreakStatistics(days, "2026-03-04")).toMatchObject({ currentStreak: 3, longestStreak: 3 });
  });

  it("resets a broken streak and retains a longer past streak", () => {
    const days = [day("2026-04-01", 1), day("2026-04-02", 1), day("2026-04-03", 1), day("2026-04-04", 0), day("2026-04-05", 1)];
    expect(calculateStreakStatistics(days, "2026-04-05")).toMatchObject({ currentStreak: 1, longestStreak: 3 });
  });

  it("handles month and year boundaries", () => {
    expect(calculateStreakStatistics([day("2025-12-31", 1), day("2026-01-01", 1)], "2026-01-01")).toMatchObject({ currentStreak: 2, longestStreak: 2 });
    expect(calculateStreakStatistics([day("2026-01-31", 1), day("2026-02-01", 1)], "2026-02-01")).toMatchObject({ currentStreak: 2, longestStreak: 2 });
  });

  it("fills missing and leap-year dates with zero activity", () => {
    const result = fillContributionDates([day("2024-02-29", 2)], "2024-02-28", "2024-03-01");
    expect(result.map((value) => value.date)).toEqual(["2024-02-28", "2024-02-29", "2024-03-01"]);
    expect(result.map((value) => value.contributionCount)).toEqual([0, 2, 0]);
  });

  it("does not treat missing dates as a continuous longest streak", () => {
    expect(calculateStreakStatistics([day("2026-05-01", 1), day("2026-05-03", 1)], "2026-05-03").longestStreak).toBe(1);
  });
});
