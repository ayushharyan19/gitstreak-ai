import { z } from "zod";

function isValidTimeZone(value: string) {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const emailReminderTypeEnum = z.enum(["daily_reminder", "streak_at_risk", "weekly_summary"]);

export const preferencesSchema = z.object({
  timezone: z.string().refine(isValidTimeZone, "Choose a valid IANA timezone."),
  dailyGoal: z.coerce.number().int().min(1).max(1000),
  weeklyGoal: z.coerce.number().int().min(1).max(7),
  preferredTheme: z.enum(["light", "dark", "system"]),
  reminderEnabled: z.boolean(),
  reminderTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Choose a valid reminder time.").nullable(),
  emailRemindersEnabled: z.boolean().default(false),
  emailReminderTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Choose a valid email reminder time.").nullable().default(null),
  emailReminderTypes: z.array(emailReminderTypeEnum).default(["daily_reminder", "streak_at_risk", "weekly_summary"]),
  emailReminderDays: z.array(z.number().int().min(0).max(6)).default([1, 2, 3, 4, 5, 6, 0]),
  email: z.string().email().nullable().optional(),
}).superRefine((value, context) => {
  if (value.reminderEnabled && !value.reminderTime) {
    context.addIssue({ code: "custom", path: ["reminderTime"], message: "Choose a reminder time when reminders are enabled." });
  }
  if (value.emailRemindersEnabled && !value.emailReminderTime) {
    context.addIssue({ code: "custom", path: ["emailReminderTime"], message: "Choose a reminder time when email reminders are enabled." });
  }
  if (value.emailRemindersEnabled && value.emailReminderTypes.length === 0) {
    context.addIssue({ code: "custom", path: ["emailReminderTypes"], message: "Select at least one email reminder type." });
  }
  if (value.emailRemindersEnabled && value.emailReminderDays.length === 0) {
    context.addIssue({ code: "custom", path: ["emailReminderDays"], message: "Select at least one reminder day." });
  }
});
