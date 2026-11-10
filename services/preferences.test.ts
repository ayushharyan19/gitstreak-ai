import { describe, expect, it } from "vitest";
import { preferencesSchema } from "@/lib/preferences-validation";
import { defaultUserPreferences } from "@/types/preferences";

const validPreferences = {
  timezone: "Asia/Kolkata",
  dailyGoal: 1,
  weeklyGoal: 5,
  preferredTheme: "system" as const,
  reminderEnabled: false,
  reminderTime: null,
  emailRemindersEnabled: false,
  emailReminderTime: null,
  emailReminderTypes: ["daily_reminder" as const, "streak_at_risk" as const],
  emailReminderDays: [1, 2, 3, 4, 5],
  email: "developer@example.com",
};

describe("preference validation", () => {
  it("accepts valid defaults and reminder settings", () => {
    expect(preferencesSchema.safeParse(validPreferences).success).toBe(true);
    expect(
      preferencesSchema.safeParse({
        ...validPreferences,
        reminderEnabled: true,
        reminderTime: "09:30",
      }).success
    ).toBe(true);
  });

  it("rejects invalid timezone and goals", () => {
    expect(preferencesSchema.safeParse({ ...validPreferences, timezone: "not/a-timezone" }).success).toBe(false);
    expect(preferencesSchema.safeParse({ ...validPreferences, dailyGoal: 0 }).success).toBe(false);
    expect(preferencesSchema.safeParse({ ...validPreferences, weeklyGoal: 8 }).success).toBe(false);
  });

  it("requires a valid time when push reminders are enabled", () => {
    expect(preferencesSchema.safeParse({ ...validPreferences, reminderEnabled: true, reminderTime: null }).success).toBe(false);
    expect(preferencesSchema.safeParse({ ...validPreferences, reminderEnabled: true, reminderTime: "25:00" }).success).toBe(false);
  });

  it("verifies email reminders are disabled by default in defaultUserPreferences", () => {
    expect(defaultUserPreferences.emailRemindersEnabled).toBe(false);
    expect(defaultUserPreferences.emailReminderTime).toBeNull();
    expect(defaultUserPreferences.emailReminderTypes).toEqual(["daily_reminder", "streak_at_risk", "weekly_summary"]);
    expect(defaultUserPreferences.emailReminderDays).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });

  it("validates email reminder fields when email reminders are enabled", () => {
    // Missing time when email enabled -> invalid
    expect(
      preferencesSchema.safeParse({
        ...validPreferences,
        emailRemindersEnabled: true,
        emailReminderTime: null,
      }).success
    ).toBe(false);

    // Valid time when email enabled -> valid
    expect(
      preferencesSchema.safeParse({
        ...validPreferences,
        emailRemindersEnabled: true,
        emailReminderTime: "18:00",
        emailReminderTypes: ["daily_reminder"],
        emailReminderDays: [1, 2, 3],
      }).success
    ).toBe(true);

    // Empty reminder types when email enabled -> invalid
    expect(
      preferencesSchema.safeParse({
        ...validPreferences,
        emailRemindersEnabled: true,
        emailReminderTime: "18:00",
        emailReminderTypes: [],
      }).success
    ).toBe(false);

    // Empty reminder days when email enabled -> invalid
    expect(
      preferencesSchema.safeParse({
        ...validPreferences,
        emailRemindersEnabled: true,
        emailReminderTime: "18:00",
        emailReminderDays: [],
      }).success
    ).toBe(false);
  });

  it("ensures Web Push and Email preferences remain strictly independent", () => {
    // Push enabled, Email disabled
    const pushOnly = preferencesSchema.safeParse({
      ...validPreferences,
      reminderEnabled: true,
      reminderTime: "10:00",
      emailRemindersEnabled: false,
      emailReminderTime: null,
    });
    expect(pushOnly.success).toBe(true);

    // Push disabled, Email enabled
    const emailOnly = preferencesSchema.safeParse({
      ...validPreferences,
      reminderEnabled: false,
      reminderTime: null,
      emailRemindersEnabled: true,
      emailReminderTime: "19:00",
      emailReminderTypes: ["streak_at_risk"],
      emailReminderDays: [0, 6],
    });
    expect(emailOnly.success).toBe(true);

    // Both enabled with different times
    const bothEnabled = preferencesSchema.safeParse({
      ...validPreferences,
      reminderEnabled: true,
      reminderTime: "10:00",
      emailRemindersEnabled: true,
      emailReminderTime: "20:00",
    });
    expect(bothEnabled.success).toBe(true);
  });
});
