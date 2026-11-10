import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { NextRequest } from "next/server";
import {
  getUserLocalDate,
  getUserLocalTime,
  isReminderDue,
  isValidTimezone,
} from "./timezones";
import { isVapidConfigured, sendWebPushToSubscription } from "./web-push";
import { runReminderScheduler } from "./scheduler";

// Mock server-only modules
vi.mock("server-only", () => ({}));

// Mock Supabase admin
const mockSupabase = {
  from: vi.fn(),
};

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdmin: vi.fn(() => mockSupabase),
}));

// Mock GitHub contributions service
const mockGetGitHubContributions = vi.fn();
vi.mock("@/services/github/contributions", () => ({
  getGitHubContributions: (...args: unknown[]) => mockGetGitHubContributions(...args),
  GitHubContributionsError: class GitHubContributionsError extends Error {
    constructor(message: string, public status: number) {
      super(message);
      this.name = "GitHubContributionsError";
    }
  },
}));

// Mock web-push
const mockSendNotification = vi.fn();
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: (...args: unknown[]) => mockSendNotification(...args),
  },
}));

describe("Phase 5: Web Push Notification System", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: "test_public_vapid_key_mock",
      VAPID_PRIVATE_KEY: "test_private_vapid_key_mock",
      VAPID_SUBJECT: "mailto:support@gitstreak.ai",
      CRON_SECRET: "test_cron_secret",
      GITHUB_TOKEN: "mock_gh_token",
    };

    mockGetGitHubContributions.mockResolvedValue({
      year: 2026,
      totalContributions: 0,
      days: [
        {
          date: "2026-10-30",
          contributionCount: 0,
          color: "#ebedf0",
          weekday: 5,
        },
      ],
      statistics: {
        currentStreak: 0,
        longestStreak: 5,
        totalContributions: 0,
        activeDays: 0,
        streakHistory: [],
      },
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // -------------------------------------------------------------
  // Test Cases 7, 8, 9, 10: Timezones, Date Boundaries, DST, Invalid TZ
  // -------------------------------------------------------------
  describe("Timezone Handling & Calculations", () => {
    it("7. correctly calculates local time and date for different user timezones", () => {
      // 2026-10-30 17:00:00 UTC
      const instant = new Date("2026-10-30T17:00:00.000Z");

      // In Asia/Kolkata (+5:30) it is 22:30 on Oct 30
      expect(getUserLocalDate("Asia/Kolkata", instant)).toBe("2026-10-30");
      expect(getUserLocalTime("Asia/Kolkata", instant)).toEqual({ hour: 22, minute: 30 });

      // In America/New_York (EDT, UTC-4) it is 13:00 on Oct 30
      expect(getUserLocalDate("America/New_York", instant)).toBe("2026-10-30");
      expect(getUserLocalTime("America/New_York", instant)).toEqual({ hour: 13, minute: 0 });

      // In Europe/London (GMT, UTC+0 after DST ends on Oct 25) it is 17:00 on Oct 30
      expect(getUserLocalDate("Europe/London", instant)).toBe("2026-10-30");
      expect(getUserLocalTime("Europe/London", instant)).toEqual({ hour: 17, minute: 0 });
    });

    it("8. handles local date boundaries correctly when UTC and local dates differ", () => {
      // 2026-10-30 20:00:00 UTC
      const instant = new Date("2026-10-30T20:00:00.000Z");

      // In Tokyo (+9), 20:00 + 9h = 05:00 on NEXT day (2026-10-31)
      expect(getUserLocalDate("Asia/Tokyo", instant)).toBe("2026-10-31");
      expect(getUserLocalTime("Asia/Tokyo", instant)).toEqual({ hour: 5, minute: 0 });

      // In Los Angeles (-7), 20:00 - 7h = 13:00 on SAME day (2026-10-30)
      expect(getUserLocalDate("America/Los_Angeles", instant)).toBe("2026-10-30");
    });

    it("9. handles daylight saving time transitions accurately", () => {
      // New York in Summer (EDT, UTC-4): 2026-07-01 12:00 UTC -> 08:00
      const summerDate = new Date("2026-07-01T12:00:00.000Z");
      expect(getUserLocalTime("America/New_York", summerDate)).toEqual({ hour: 8, minute: 0 });

      // New York in Winter (EST, UTC-5): 2026-12-01 12:00 UTC -> 07:00
      const winterDate = new Date("2026-12-01T12:00:00.000Z");
      expect(getUserLocalTime("America/New_York", winterDate)).toEqual({ hour: 7, minute: 0 });
    });

    it("10. rejects invalid timezones safely without throwing", () => {
      expect(isValidTimezone("not/a-timezone")).toBe(false);
      expect(isValidTimezone("")).toBe(false);

      const now = new Date("2026-10-30T12:00:00.000Z");
      // Falls back safely to UTC date
      expect(getUserLocalDate("invalid-tz", now)).toBe("2026-10-30");
      expect(isReminderDue("09:00", "invalid-tz", now)).toBe(false);
    });
  });

  // -------------------------------------------------------------
  // Test Cases 1, 2, 3: Reminder Due vs Not Yet Reached vs Disabled
  // -------------------------------------------------------------
  describe("Reminder Due Timing", () => {
    it("1. detects reminder as enabled and due when within tolerance window", () => {
      // 10:15 local time in Asia/Kolkata
      // 04:45 UTC is 10:15 IST
      const now = new Date("2026-10-30T04:45:00.000Z");
      expect(getUserLocalTime("Asia/Kolkata", now)).toEqual({ hour: 10, minute: 15 });

      // Reminder set for 10:00 (15 min elapsed, within 30 min tolerance) -> DUE
      expect(isReminderDue("10:00", "Asia/Kolkata", now, 30)).toBe(true);
    });

    it("2. does not consider reminder due if reminder time is null or empty", () => {
      const now = new Date("2026-10-30T04:45:00.000Z");
      expect(isReminderDue(null, "Asia/Kolkata", now)).toBe(false);
      expect(isReminderDue("", "Asia/Kolkata", now)).toBe(false);
    });

    it("3. does not trigger reminder when reminder time has not yet been reached", () => {
      // 09:45 local time in Asia/Kolkata (04:15 UTC)
      const now = new Date("2026-10-30T04:15:00.000Z");
      expect(getUserLocalTime("Asia/Kolkata", now)).toEqual({ hour: 9, minute: 45 });

      // Reminder set for 10:00 (15 min in the future) -> NOT DUE
      expect(isReminderDue("10:00", "Asia/Kolkata", now, 30)).toBe(false);
    });
  });

  // -------------------------------------------------------------
  // Test Cases 13, 15, 16: VAPID, Delivery Failure, Successful Delivery
  // -------------------------------------------------------------
  describe("Web Push Delivery", () => {
    const mockSubscription = {
      id: "sub-123",
      endpoint: "https://fcm.googleapis.com/fcm/send/test-sub-123",
      p256dh: "mock_p256dh",
      auth: "mock_auth",
    };

    it("13. reports error when VAPID credentials are missing", async () => {
      delete process.env.VAPID_PRIVATE_KEY;
      expect(isVapidConfigured()).toBe(false);

      const result = await sendWebPushToSubscription(mockSubscription, {
        title: "Test",
        body: "Hello",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("VAPID credentials are not configured");
    });

    it("16. delivers push notification successfully with valid VAPID credentials", async () => {
      mockSendNotification.mockResolvedValueOnce({ statusCode: 201 });

      const result = await sendWebPushToSubscription(mockSubscription, {
        title: "Your GitStreak is waiting",
        body: "You haven't completed today's contribution goal yet.",
      });

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(201);
      expect(mockSendNotification).toHaveBeenCalledWith(
        {
          endpoint: mockSubscription.endpoint,
          keys: {
            p256dh: mockSubscription.p256dh,
            auth: mockSubscription.auth,
          },
        },
        expect.stringContaining("Your GitStreak is waiting")
      );
    });

    it("15. handles notification delivery network/server failure gracefully", async () => {
      mockSendNotification.mockRejectedValueOnce(new Error("Push service timeout (504 Gateway Timeout)"));

      const result = await sendWebPushToSubscription(mockSubscription, {
        title: "Test",
        body: "Hello",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Push service timeout");
      expect(result.shouldDeactivate).toBe(false);
    });

    it("12. marks subscription for deactivation when endpoint returns 410 Gone (expired)", async () => {
      const goneError = Object.assign(new Error("Subscription no longer valid"), { statusCode: 410 });
      mockSendNotification.mockRejectedValueOnce(goneError);

      const result = await sendWebPushToSubscription(mockSubscription, {
        title: "Test",
        body: "Hello",
      });

      expect(result.success).toBe(false);
      expect(result.shouldDeactivate).toBe(true);
    });
  });

  // -------------------------------------------------------------
  // Test Cases 4, 5, 6, 11, Idempotency: Full Scheduler Pipeline
  // -------------------------------------------------------------
  describe("Scheduled Reminder Execution Pipeline", () => {
    const fixedNow = new Date("2026-10-30T14:30:00.000Z"); // 20:00 in Asia/Kolkata
    const targetLocalDate = "2026-10-30";

    function setupSchedulerDbMocks({
      users = [],
      existingDeliveries = [],
      subscriptions = [],
    }: {
      users?: Record<string, unknown>[];
      existingDeliveries?: Record<string, unknown>[];
      subscriptions?: Record<string, unknown>[];
    }) {
      mockSupabase.from.mockImplementation((tableName: string) => {
        if (tableName === "user_preferences") {
          const userBuilder = {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            or: vi.fn().mockReturnThis(),
            not: vi.fn().mockReturnThis(),
            update: vi.fn().mockResolvedValue({ data: null, error: null }),
            then: (resolve: (val: unknown) => void) => resolve({ data: users, error: null }),
          };
          return userBuilder;
        }

        if (tableName === "reminder_deliveries") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            or: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockImplementation(() => {
              const match = existingDeliveries.find(
                (d) => d.status === "sent" && d.reminder_date === targetLocalDate
              );
              return Promise.resolve({ data: match || null, error: null });
            }),
            upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }

        if (tableName === "push_subscriptions") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            update: vi.fn().mockReturnThis(),
            then: (resolve: (val: unknown) => void) => resolve({ data: subscriptions, error: null }),
          };
        }

        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
        };
      });
    }

    it("4 & 5. skips notification when user has already met their daily goal", async () => {
      setupSchedulerDbMocks({
        users: [
          {
            user_id: "user-1",
            timezone: "Asia/Kolkata",
            daily_goal: 1,
            reminder_enabled: true,
            reminder_time: "20:00",
            access_token: "gho_token_1",
          },
        ],
        subscriptions: [
          {
            id: "sub-1",
            user_id: "user-1",
            endpoint: "https://push.example.com/sub-1",
            p256dh: "key",
            auth: "auth",
            is_active: true,
          },
        ],
      });

      // User has 3 contributions on target date (daily goal is 1)
      mockGetGitHubContributions.mockResolvedValueOnce({
        days: [{ date: targetLocalDate, contributionCount: 3, contributionLevel: "SECOND_QUARTILE" }],
        totals: { commits: 3, issues: 0, pullRequests: 0, reviews: 0 },
        statistics: { currentStreak: 5, longestStreak: 10, totalContributions: 15, activeDays: 5, consistency: 100 },
      });

      const summary = await runReminderScheduler({ now: fixedNow, ignoreTimeCheck: true });

      expect(summary.processedUsers).toBe(1);
      expect(summary.sent).toBe(0);
      expect(summary.skipped).toBe(1);
      expect(mockSendNotification).not.toHaveBeenCalled();
    });

    it("16. sends push notification when reminder is due and daily goal is not met", async () => {
      setupSchedulerDbMocks({
        users: [
          {
            user_id: "user-unmet",
            timezone: "Asia/Kolkata",
            daily_goal: 1,
            reminder_enabled: true,
            reminder_time: "20:00",
            access_token: "gho_token_unmet",
          },
        ],
        subscriptions: [
          {
            id: "sub-unmet",
            user_id: "user-unmet",
            endpoint: "https://push.example.com/sub-unmet",
            p256dh: "key",
            auth: "auth",
            is_active: true,
          },
        ],
      });

      // 0 contributions today (goal is 1)
      mockGetGitHubContributions.mockResolvedValueOnce({
        days: [{ date: targetLocalDate, contributionCount: 0, contributionLevel: "NONE" }],
        totals: { commits: 0, issues: 0, pullRequests: 0, reviews: 0 },
        statistics: { currentStreak: 0, longestStreak: 10, totalContributions: 15, activeDays: 4, consistency: 80 },
      });

      mockSendNotification.mockResolvedValueOnce({ statusCode: 201 });

      const summary = await runReminderScheduler({ now: fixedNow, ignoreTimeCheck: true });

      expect(summary.processedUsers).toBe(1);
      expect(summary.sent).toBe(1);
      expect(summary.failed).toBe(0);
      expect(mockSendNotification).toHaveBeenCalledTimes(1);
    });

    it("6. prevents duplicate reminders when reminder was already sent for that local date", async () => {
      setupSchedulerDbMocks({
        users: [
          {
            user_id: "user-duplicate",
            timezone: "Asia/Kolkata",
            daily_goal: 1,
            reminder_enabled: true,
            reminder_time: "20:00",
            access_token: "gho_token_dup",
          },
        ],
        existingDeliveries: [
          {
            user_id: "user-duplicate",
            reminder_type: "web_push",
            reminder_date: targetLocalDate,
            status: "sent",
          },
        ],
        subscriptions: [
          {
            id: "sub-dup",
            user_id: "user-duplicate",
            endpoint: "https://push.example.com/sub-dup",
            p256dh: "key",
            auth: "auth",
            is_active: true,
          },
        ],
      });

      const summary = await runReminderScheduler({ now: fixedNow, ignoreTimeCheck: true });

      expect(summary.sent).toBe(0);
      expect(summary.skipped).toBe(1);
      expect(mockSendNotification).not.toHaveBeenCalled();
    });

    it("11. skips delivery when user has no active push subscriptions", async () => {
      setupSchedulerDbMocks({
        users: [
          {
            user_id: "user-no-sub",
            timezone: "Asia/Kolkata",
            daily_goal: 1,
            reminder_enabled: true,
            reminder_time: "20:00",
            access_token: "gho_token_no_sub",
          },
        ],
        subscriptions: [], // No active subscriptions
      });

      const summary = await runReminderScheduler({ now: fixedNow, ignoreTimeCheck: true });

      expect(summary.sent).toBe(0);
      expect(summary.skipped).toBe(1);
      expect(mockSendNotification).not.toHaveBeenCalled();
    });

    it("repeated scheduler executions do not send duplicate reminders (Idempotent)", async () => {
      const deliveredRecords: Record<string, unknown>[] = [];

      mockSupabase.from.mockImplementation((tableName: string) => {
        if (tableName === "user_preferences") {
          const userBuilder = {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            or: vi.fn().mockReturnThis(),
            not: vi.fn().mockReturnThis(),
            then: (resolve: (val: unknown) => void) =>
              resolve({
                data: [
                  {
                    user_id: "user-repeat",
                    timezone: "Asia/Kolkata",
                    daily_goal: 1,
                    reminder_enabled: true,
                    reminder_time: "20:00",
                    access_token: "gho_token_repeat",
                  },
                ],
                error: null,
              }),
          };
          return userBuilder;
        }

        if (tableName === "reminder_deliveries") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            or: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockImplementation(() => {
              const found = deliveredRecords.find((r) => r.status === "sent");
              return Promise.resolve({ data: found || null, error: null });
            }),
            upsert: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
              deliveredRecords.push(payload);
              return Promise.resolve({ data: null, error: null });
            }),
          };
        }

        if (tableName === "push_subscriptions") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            update: vi.fn().mockReturnThis(),
            then: (resolve: (val: unknown) => void) =>
              resolve({
                data: [
                  {
                    id: "sub-repeat",
                    user_id: "user-repeat",
                    endpoint: "https://push.example.com/repeat",
                    p256dh: "key",
                    auth: "auth",
                    is_active: true,
                  },
                ],
                error: null,
              }),
          };
        }

        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
      });

      mockGetGitHubContributions.mockResolvedValue({
        days: [{ date: targetLocalDate, contributionCount: 0, contributionLevel: "NONE" }],
        totals: { commits: 0, issues: 0, pullRequests: 0, reviews: 0 },
        statistics: { currentStreak: 0, longestStreak: 5, totalContributions: 5, activeDays: 2, consistency: 50 },
      });
      mockSendNotification.mockResolvedValue({ statusCode: 201 });

      // Run 1: Should deliver
      const firstRun = await runReminderScheduler({ now: fixedNow, ignoreTimeCheck: true });
      expect(firstRun.sent).toBe(1);
      expect(mockSendNotification).toHaveBeenCalledTimes(1);

      // Run 2: Immediately run again on the same day -> Must NOT deliver duplicate!
      const secondRun = await runReminderScheduler({ now: fixedNow, ignoreTimeCheck: true });
      expect(secondRun.sent).toBe(0);
      expect(secondRun.skipped).toBe(1);
      expect(mockSendNotification).toHaveBeenCalledTimes(1); // Still only 1 total push!
    });
  });

  // -------------------------------------------------------------
  // Test Case 14: Unauthorized Cron Request
  // -------------------------------------------------------------
  describe("Cron Authorization (Test Case 14)", () => {
    it("14. rejects unauthorized cron invocation with 401 status", async () => {
      const { GET } = await import("@/app/api/cron/reminders/route");

      // Request without authorization header
      const unauthorizedReq = Object.assign(new Request("http://localhost:3000/api/cron/reminders", {
        method: "GET",
      }), {
        nextUrl: new URL("http://localhost:3000/api/cron/reminders"),
      }) as unknown as NextRequest;

      const res = await GET(unauthorizedReq);
      expect(res.status).toBe(401);
      const data = (await res.json()) as { error: string };
      expect(data.error).toContain("Unauthorized");
    });

    it("accepts valid bearer cron secret in authorization header", async () => {
      const { GET } = await import("@/app/api/cron/reminders/route");

      const authorizedReq = Object.assign(new Request("http://localhost:3000/api/cron/reminders", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${process.env.CRON_SECRET}`,
        },
      }), {
        nextUrl: new URL("http://localhost:3000/api/cron/reminders"),
      }) as unknown as NextRequest;

      const res = await GET(authorizedReq);
      expect(res.status).toBe(200);
      const data = (await res.json()) as { processedUsers: number };
      expect(data).toHaveProperty("processedUsers");
    });
  });
});
