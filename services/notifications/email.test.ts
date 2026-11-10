import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { NextRequest } from "next/server";
import {
  renderDailyReminderEmail,
  renderStreakAtRiskEmail,
  renderWeeklySummaryEmail,
  renderTestEmail,
} from "./email-templates";
import { isEmailConfigured, sendEmail } from "./email";
import { runReminderScheduler } from "./scheduler";

// Mock server-only
vi.mock("server-only", () => ({}));

// Mock Supabase admin
const mockSupabase = {
  from: vi.fn(),
};

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdmin: vi.fn(() => mockSupabase),
}));

// Mock Resend SDK
const mockResendEmailsSend = vi.fn();
vi.mock("resend", () => {
  return {
    Resend: class MockResend {
      emails = {
        send: mockResendEmailsSend,
      };
    },
  };
});

// Mock NextAuth getToken
const mockGetToken = vi.fn();
vi.mock("next-auth/jwt", () => ({
  getToken: (...args: unknown[]) => mockGetToken(...args),
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

// Mock web-push so web-push calls don't hit external services
const mockSendWebPush = vi.fn();
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: (...args: unknown[]) => mockSendWebPush(...args),
  },
}));

describe("Phase 6: Email Reminders System", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      RESEND_API_KEY: "re_mock_test_key_12345",
      EMAIL_FROM: "GitStreak AI <notifications@gitstreak.ai>",
      AUTH_SECRET: "test_auth_secret",
      NEXTAUTH_URL: "http://localhost:3000",
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: "test_vapid_public",
      VAPID_PRIVATE_KEY: "test_vapid_private",
      VAPID_SUBJECT: "mailto:support@gitstreak.ai",
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
        currentStreak: 4,
        longestStreak: 12,
        totalContributions: 140,
        activeDays: 45,
        streakHistory: [],
      },
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // -------------------------------------------------------------
  // 1. Email Templates Tests
  // -------------------------------------------------------------
  describe("Email Templates", () => {
    it("renders Daily Contribution Reminder with correct metrics and dashboard link", () => {
      const rendered = renderDailyReminderEmail({
        name: "octocat",
        todayCount: 2,
        dailyGoal: 5,
        currentStreak: 7,
        dashboardUrl: "http://localhost:3000/dashboard",
      });

      expect(rendered.subject).toContain("3 more contributions needed today");
      expect(rendered.html).toContain("octocat");
      expect(rendered.html).toContain("2 / 5");
      expect(rendered.html).toContain("7d");
      expect(rendered.html).toContain("http://localhost:3000/dashboard");
      expect(rendered.text).toContain("Remaining Needed: 3");
    });

    it("renders Streak at Risk Reminder with urgent tone and remaining needed", () => {
      const rendered = renderStreakAtRiskEmail({
        name: "alex",
        currentStreak: 14,
        todayCount: 0,
        dailyGoal: 2,
        dashboardUrl: "http://localhost:3000/dashboard",
      });

      expect(rendered.subject).toContain("Your 14-day streak is at risk");
      expect(rendered.html).toContain("14 Days");
      expect(rendered.html).toContain("Streak on the Line");
      expect(rendered.text).toContain("Your 14-day GitHub streak is at risk");
    });

    it("renders Weekly Progress Summary with total contributions and percentage", () => {
      const rendered = renderWeeklySummaryEmail({
        name: "sarah",
        weeklyContributions: 18,
        weeklyGoal: 5,
        activeDaysThisWeek: 4,
        currentStreak: 10,
        dashboardUrl: "http://localhost:3000/dashboard",
      });

      expect(rendered.subject).toContain("Your GitStreak weekly progress summary (4/5 active days)");
      expect(rendered.html).toContain("18");
      expect(rendered.html).toContain("80%");
      expect(rendered.html).toContain("10 days");
      expect(rendered.text).toContain("Active Days: 4 / 5 days (80% of goal)");
    });

    it("renders Test Email correctly to authenticated user", () => {
      const rendered = renderTestEmail({
        name: "testdev",
        email: "testdev@example.com",
        dashboardUrl: "http://localhost:3000/dashboard",
      });

      expect(rendered.subject).toBe("GitStreak AI — Test email reminder");
      expect(rendered.html).toContain("testdev@example.com");
      expect(rendered.html).toContain("Email reminders are working!");
      expect(rendered.text).toContain("Recipient: testdev@example.com");
    });
  });

  // -------------------------------------------------------------
  // 2. Email Provider Service Tests
  // -------------------------------------------------------------
  describe("Email Provider Service (Resend)", () => {
    it("detects whether email delivery is configured via RESEND_API_KEY", () => {
      expect(isEmailConfigured()).toBe(true);
      delete process.env.RESEND_API_KEY;
      expect(isEmailConfigured()).toBe(false);
    });

    it("delivers email successfully and returns provider message ID", async () => {
      mockResendEmailsSend.mockResolvedValueOnce({
        data: { id: "resend_msg_test_abc123" },
        error: null,
      });

      const result = await sendEmail({
        to: "developer@example.com",
        subject: "Daily Reminder",
        html: "<p>Hello</p>",
        text: "Hello",
        reminderType: "daily_reminder",
      });

      expect(result.success).toBe(true);
      expect(result.subscriptionId).toBe("resend_msg_test_abc123");
      expect(mockResendEmailsSend).toHaveBeenCalledWith({
        from: "GitStreak AI <notifications@gitstreak.ai>",
        to: ["developer@example.com"],
        subject: "Daily Reminder",
        html: "<p>Hello</p>",
        text: "Hello",
      });
    });

    it("handles Resend provider API errors without crashing", async () => {
      mockResendEmailsSend.mockResolvedValueOnce({
        data: null,
        error: { message: "Domain not verified in Resend account", name: "validation_error" },
      });

      const result = await sendEmail({
        to: "developer@example.com",
        subject: "Daily Reminder",
        html: "<p>Hello</p>",
        text: "Hello",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Domain not verified");
    });

    it("handles Resend network timeout or exception gracefully", async () => {
      mockResendEmailsSend.mockRejectedValueOnce(new Error("Network timeout after 10000ms"));

      const result = await sendEmail({
        to: "developer@example.com",
        subject: "Daily Reminder",
        html: "<p>Hello</p>",
        text: "Hello",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Network timeout");
    });
  });

  // -------------------------------------------------------------
  // 3. Test Email Route (/api/notifications/email/test)
  // -------------------------------------------------------------
  describe("Test Email API Endpoint", () => {
    it("rejects unauthenticated requests with 401", async () => {
      mockGetToken.mockResolvedValueOnce(null);
      const { POST } = await import("@/app/api/notifications/email/test/route");

      const req = new Request("http://localhost:3000/api/notifications/email/test", {
        method: "POST",
      }) as unknown as NextRequest;

      const res = await POST(req);
      expect(res.status).toBe(401);
      const data = (await res.json()) as { error: string };
      expect(data.error).toContain("Authentication required");
    });

    it("rejects requests when user has no verified GitHub email address with 400", async () => {
      mockGetToken.mockResolvedValueOnce({
        sub: "user-without-email",
        login: "noemaildev",
        email: null,
      });

      const { POST } = await import("@/app/api/notifications/email/test/route");

      const req = new Request("http://localhost:3000/api/notifications/email/test", {
        method: "POST",
      }) as unknown as NextRequest;

      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = (await res.json()) as { error: string };
      expect(data.error).toContain("No verified email address found");
    });

    it("sends test email ONLY to the authenticated session email", async () => {
      mockGetToken.mockResolvedValueOnce({
        sub: "user-auth-123",
        login: "octodev",
        email: "verified.octo@example.com",
      });

      mockResendEmailsSend.mockResolvedValueOnce({
        data: { id: "msg_test_ok_999" },
        error: null,
      });

      const { POST } = await import("@/app/api/notifications/email/test/route");

      // Even if attacker attempts to specify arbitrary recipient in body
      const req = new Request("http://localhost:3000/api/notifications/email/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: "attacker@victim.com" }),
      }) as unknown as NextRequest;

      const res = await POST(req);
      expect(res.status).toBe(200);
      const data = (await res.json()) as { success: boolean; email: string };
      expect(data.success).toBe(true);
      expect(data.email).toBe("verified.octo@example.com");

      // Sent strictly to verified.octo@example.com
      expect(mockResendEmailsSend).toHaveBeenCalledWith(
        expect.objectContaining({
          to: ["verified.octo@example.com"],
        })
      );
    });
  });

  // -------------------------------------------------------------
  // 4. Scheduler Email Pipeline & Idempotency Tests
  // -------------------------------------------------------------
  describe("Scheduler Email Pipeline & Multi-Channel Isolation", () => {
    const fixedNow = new Date("2026-10-30T14:30:00.000Z"); // 20:00 IST Friday (day 5)

    function setupEmailSchedulerMocks({
      users = [],
      existingDeliveries = [],
    }: {
      users?: Record<string, unknown>[];
      existingDeliveries?: Record<string, unknown>[];
    }) {
      mockSupabase.from.mockImplementation((tableName: string) => {
        if (tableName === "user_preferences") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            or: vi.fn().mockReturnThis(),
            not: vi.fn().mockReturnThis(),
            update: vi.fn().mockResolvedValue({ data: null, error: null }),
            then: (resolve: (val: unknown) => void) => resolve({ data: users, error: null }),
          };
        }

        if (tableName === "reminder_deliveries") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            or: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockImplementation(() => {
              const match = existingDeliveries.find((d) => d.status === "sent");
              return Promise.resolve({ data: match || null, error: null });
            }),
            upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }

        if (tableName === "push_subscriptions") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            then: (resolve: (val: unknown) => void) => resolve({ data: [], error: null }),
          };
        }

        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          or: vi.fn().mockReturnThis(),
        };
      });
    }

    it("sends email reminder when email reminders are enabled, time is due, and goal is unmet", async () => {
      setupEmailSchedulerMocks({
        users: [
          {
            user_id: "user-email-due",
            timezone: "Asia/Kolkata",
            daily_goal: 3,
            email: "dev@gitstreak.ai",
            github_username: "devstreak",
            email_reminders_enabled: true,
            email_reminder_time: "20:00",
            email_reminder_types: ["daily_reminder"],
            email_reminder_days: [1, 2, 3, 4, 5], // Friday is 5 -> eligible
            reminder_enabled: false,
          },
        ],
      });

      mockGetGitHubContributions.mockResolvedValueOnce({
        year: 2026,
        totalContributions: 0,
        days: [{ date: "2026-10-30", contributionCount: 1 }], // 1 of 3 -> goal not met
        statistics: { currentStreak: 5, longestStreak: 10, totalContributions: 50, activeDays: 20, streakHistory: [] },
      });

      mockResendEmailsSend.mockResolvedValueOnce({
        data: { id: "resend_sent_123" },
        error: null,
      });

      const summary = await runReminderScheduler({ now: fixedNow, ignoreTimeCheck: true });

      expect(summary.processedUsers).toBe(1);
      expect(summary.emailSent).toBe(1);
      expect(summary.sent).toBe(1);
      expect(mockResendEmailsSend).toHaveBeenCalledTimes(1);
      expect(mockResendEmailsSend).toHaveBeenCalledWith(
        expect.objectContaining({
          to: ["dev@gitstreak.ai"],
          subject: expect.stringContaining("streak alive"),
        })
      );
    });

    it("skips email reminder on unselected days", async () => {
      setupEmailSchedulerMocks({
        users: [
          {
            user_id: "user-email-weekend",
            timezone: "Asia/Kolkata",
            daily_goal: 1,
            email: "weekend@gitstreak.ai",
            email_reminders_enabled: true,
            email_reminder_time: "20:00",
            email_reminder_types: ["daily_reminder"],
            email_reminder_days: [0, 6], // Only Sunday (0) and Saturday (6). Today is Friday (5)!
            reminder_enabled: false,
          },
        ],
      });

      const summary = await runReminderScheduler({ now: fixedNow, ignoreTimeCheck: true });

      expect(summary.processedUsers).toBe(1);
      expect(summary.skipped).toBe(1);
      expect(summary.emailSent).toBe(0);
      expect(mockResendEmailsSend).not.toHaveBeenCalled();
    });

    it("skips email reminder when daily goal is already met", async () => {
      setupEmailSchedulerMocks({
        users: [
          {
            user_id: "user-goal-met",
            timezone: "Asia/Kolkata",
            daily_goal: 2,
            email: "winner@gitstreak.ai",
            email_reminders_enabled: true,
            email_reminder_time: "20:00",
            email_reminder_types: ["daily_reminder"],
            email_reminder_days: [1, 2, 3, 4, 5],
            reminder_enabled: false,
          },
        ],
      });

      mockGetGitHubContributions.mockResolvedValueOnce({
        year: 2026,
        totalContributions: 5,
        days: [{ date: "2026-10-30", contributionCount: 2 }], // 2 of 2 -> goal met!
        statistics: { currentStreak: 6, longestStreak: 10, totalContributions: 60, activeDays: 25, streakHistory: [] },
      });

      const summary = await runReminderScheduler({ now: fixedNow, ignoreTimeCheck: true });

      expect(summary.skipped).toBe(1);
      expect(summary.emailSent).toBe(0);
      expect(mockResendEmailsSend).not.toHaveBeenCalled();
    });

    it("prevents duplicate email reminder deliveries for the same user, channel, and local date", async () => {
      setupEmailSchedulerMocks({
        users: [
          {
            user_id: "user-already-emailed",
            timezone: "Asia/Kolkata",
            daily_goal: 2,
            email: "already@gitstreak.ai",
            email_reminders_enabled: true,
            email_reminder_time: "20:00",
            email_reminder_types: ["daily_reminder"],
            email_reminder_days: [1, 2, 3, 4, 5],
            reminder_enabled: false,
          },
        ],
        existingDeliveries: [
          {
            user_id: "user-already-emailed",
            channel: "email",
            reminder_type: "daily_reminder",
            reminder_date: "2026-10-30",
            status: "sent",
          },
        ],
      });

      const summary = await runReminderScheduler({ now: fixedNow, ignoreTimeCheck: true });

      expect(summary.skipped).toBe(1);
      expect(summary.emailSent).toBe(0);
      expect(mockResendEmailsSend).not.toHaveBeenCalled();
    });

    it("isolates channel failures: email provider failure does not block web push delivery", async () => {
      const deliveredPayloads: Record<string, unknown>[] = [];

      mockSupabase.from.mockImplementation((tableName: string) => {
        if (tableName === "user_preferences") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            or: vi.fn().mockReturnThis(),
            not: vi.fn().mockReturnThis(),
            update: vi.fn().mockResolvedValue({ data: null, error: null }),
            then: (resolve: (val: unknown) => void) =>
              resolve({
                data: [
                  {
                    user_id: "user-multi-channel",
                    timezone: "Asia/Kolkata",
                    daily_goal: 2,
                    email: "multi@gitstreak.ai",
                    email_reminders_enabled: true,
                    email_reminder_time: "20:00",
                    email_reminder_types: ["daily_reminder"],
                    email_reminder_days: [1, 2, 3, 4, 5],
                    reminder_enabled: true,
                    reminder_time: "20:00",
                    access_token: "gho_multi_token",
                  },
                ],
                error: null,
              }),
          };
        }

        if (tableName === "reminder_deliveries") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            or: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            upsert: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
              deliveredPayloads.push(payload);
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
                    id: "sub-multi",
                    endpoint: "https://push.example.com/multi",
                    p256dh: "key",
                    auth: "auth",
                  },
                ],
                error: null,
              }),
          };
        }

        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
        };
      });

      // 0 of 2 contributions -> daily goal unmet
      mockGetGitHubContributions.mockResolvedValueOnce({
        year: 2026,
        totalContributions: 0,
        days: [{ date: "2026-10-30", contributionCount: 0 }],
        statistics: { currentStreak: 3, longestStreak: 8, totalContributions: 30, activeDays: 10, streakHistory: [] },
      });

      // Web Push succeeds
      mockSendWebPush.mockResolvedValueOnce({ statusCode: 201 });

      // Email fails (e.g. Resend error)
      mockResendEmailsSend.mockRejectedValueOnce(new Error("Resend rate limit exceeded (429)"));

      const summary = await runReminderScheduler({ now: fixedNow, ignoreTimeCheck: true });

      // Web Push succeeded!
      expect(summary.webPushSent).toBe(1);
      expect(mockSendWebPush).toHaveBeenCalledTimes(1);

      // Email failed, but was recorded as failed without stopping the job
      expect(summary.emailSent).toBe(0);
      expect(summary.failed).toBe(1);
      expect(summary.errors.some((e) => e.channel === "email")).toBe(true);

      // Delivery tracking records both channels accurately
      const pushRecord = deliveredPayloads.find((r) => r.channel === "web_push");
      const emailRecord = deliveredPayloads.find((r) => r.channel === "email");
      expect(pushRecord).toBeDefined();
      expect(pushRecord?.status).toBe("sent");
      expect(emailRecord).toBeDefined();
      expect(emailRecord?.status).toBe("failed");
    });
  });
});
