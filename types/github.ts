export type ContributionLevel =
  | "NONE"
  | "FIRST_QUARTILE"
  | "SECOND_QUARTILE"
  | "THIRD_QUARTILE"
  | "FOURTH_QUARTILE";

export type ContributionDay = {
  date: string;
  contributionCount: number;
  contributionLevel: ContributionLevel;
};

export type ContributionTotals = {
  commits: number;
  pullRequests: number;
  issues: number;
  reviews: number;
};

export type StreakStatistics = {
  currentStreak: number;
  longestStreak: number;
  totalContributions: number;
  activeDays: number;
  consistency: number;
};

export type GitHubContributionData = {
  year: number;
  days: ContributionDay[];
  totals: ContributionTotals;
  statistics: StreakStatistics;
};

export type GitHubGraphQLResponse = {
  data?: {
    viewer: {
      contributionsCollection: {
        contributionCalendar: {
          totalContributions: number;
          weeks: Array<{
            contributionDays: ContributionDay[];
          }>;
        };
        totalCommitContributions: number;
        totalIssueContributions: number;
        totalPullRequestContributions: number;
        totalPullRequestReviewContributions: number;
      };
    };
  };
  errors?: Array<{ message: string; type?: string }>;
};
