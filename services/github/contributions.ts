import type { GitHubContributionData, GitHubGraphQLResponse } from "@/types/github";
import { calculateStreakStatistics, currentUtcDate, fillContributionDates } from "@/utils/streak-calculator";

const GITHUB_GRAPHQL_URL = "https://api.github.com/graphql";

const CONTRIBUTIONS_QUERY = `
  query ContributionCalendar($from: DateTime!, $to: DateTime!) {
    viewer {
      contributionsCollection(from: $from, to: $to) {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              date
              contributionCount
              contributionLevel
            }
          }
        }
        totalCommitContributions
        totalIssueContributions
        totalPullRequestContributions
        totalPullRequestReviewContributions
      }
    }
  }
`;

export class GitHubContributionsError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "GitHubContributionsError";
  }
}

function getDateRange(year: number) {
  const currentYear = Number(currentUtcDate().slice(0, 4));
  if (!Number.isInteger(year) || year < 2008 || year > currentYear) {
    throw new GitHubContributionsError("Please select a valid contribution year.", 400);
  }

  const endDate = year === currentYear ? currentUtcDate() : `${year}-12-31`;
  return {
    startDate: `${year}-01-01`,
    endDate,
    from: `${year}-01-01T00:00:00.000Z`,
    to: `${endDate}T23:59:59.999Z`,
  };
}

export async function getGitHubContributions(accessToken: string, year: number): Promise<GitHubContributionData> {
  const range = getDateRange(year);
  const response = await fetch(GITHUB_GRAPHQL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "User-Agent": "GitStreak-AI",
    },
    body: JSON.stringify({ query: CONTRIBUTIONS_QUERY, variables: { from: range.from, to: range.to } }),
    cache: "no-store",
  });

  if (response.status === 401 || response.status === 403) {
    throw new GitHubContributionsError("Your GitHub session has expired. Please sign in again.", 401);
  }
  if (response.status === 429 || response.headers.get("x-ratelimit-remaining") === "0") {
    throw new GitHubContributionsError("GitHub rate limit reached. Please try again shortly.", 429);
  }
  if (!response.ok) {
    throw new GitHubContributionsError("GitHub is unavailable right now. Please try again.", 502);
  }

  const payload = (await response.json()) as GitHubGraphQLResponse;
  if (payload.errors?.length || !payload.data?.viewer.contributionsCollection) {
    throw new GitHubContributionsError("GitHub could not load your contribution activity.", 502);
  }

  const collection = payload.data.viewer.contributionsCollection;
  const days = fillContributionDates(collection.contributionCalendar.weeks.flatMap((week) => week.contributionDays), range.startDate, range.endDate);

  return {
    year,
    days,
    totals: {
      commits: collection.totalCommitContributions,
      issues: collection.totalIssueContributions,
      pullRequests: collection.totalPullRequestContributions,
      reviews: collection.totalPullRequestReviewContributions,
    },
    statistics: {
      ...calculateStreakStatistics(days),
      totalContributions: collection.contributionCalendar.totalContributions,
    },
  };
}

export { CONTRIBUTIONS_QUERY };
